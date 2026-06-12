import { join } from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

const fwd = (p: string): string => p.replace(/\\/g, "/");

export interface BuildMatchGoldResult {
  matches: number;
  innings: number;
  battingLines: number;
  bowlingLines: number;
}

const BOWLER_WKTS = "('bowled','caught','lbw','stumped','caught and bowled','hit wicket')";

/**
 * Build the gold match + scorecard tables from the silver Parquet and bulk-write
 * them to Neon (CareerMatch + ScorecardInnings/Batting/Bowling). Batting order is
 * the order players first appear (as striker or non-striker); bowler runs charge
 * wides+no-balls; maidens = full overs conceding 0; bowler wickets exclude run-outs.
 */
export async function buildMatchGold(opts: {
  silverDir: string;
  postgresUrl: string;
  log?: (msg: string) => void;
}): Promise<BuildMatchGoldResult> {
  const log = opts.log ?? (() => {});
  const deliveries = fwd(join(opts.silverDir, "deliveries", "**", "*.parquet"));
  const matches = fwd(join(opts.silverDir, "matches.parquet"));

  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  await conn.run("INSTALL postgres; LOAD postgres;");
  await conn.run(`ATTACH '${opts.postgresUrl}' AS pg (TYPE postgres)`);

  log("building scorecards from silver…");
  await conn.run(`CREATE TEMP TABLE seq AS
    SELECT *, row_number() OVER (PARTITION BY match_id, innings_no ORDER BY over_no, ball_in_over) AS s
    FROM read_parquet('${deliveries}', hive_partitioning=true)`);

  await conn.run(`CREATE TEMP TABLE g_inn AS
    SELECT match_id, innings_no, any_value(batting_team) AS batting_team,
      sum(runs_total) AS runs,
      sum(CASE WHEN is_wicket THEN 1 ELSE 0 END) AS wickets,
      count(*) FILTER (WHERE extra_type IS NULL OR extra_type NOT IN ('wides','noballs')) AS balls
    FROM seq GROUP BY match_id, innings_no`);

  await conn.run(`CREATE TEMP TABLE outs AS
    SELECT match_id, innings_no, player_out_id AS pid, any_value(dismissal_kind) AS kind
    FROM seq WHERE player_out_id IS NOT NULL GROUP BY match_id, innings_no, player_out_id`);

  await conn.run(`CREATE TEMP TABLE bat_order AS
    WITH appear AS (
      SELECT match_id, innings_no, batter_id AS pid, batter_name AS nm, s FROM seq WHERE batter_id IS NOT NULL
      UNION ALL
      SELECT match_id, innings_no, non_striker_id, non_striker_name, s FROM seq WHERE non_striker_id IS NOT NULL
    )
    SELECT match_id, innings_no, pid, any_value(nm) AS nm,
      row_number() OVER (PARTITION BY match_id, innings_no ORDER BY min(s)) AS pos
    FROM appear GROUP BY match_id, innings_no, pid`);

  await conn.run(`CREATE TEMP TABLE bat AS
    SELECT match_id, innings_no, batter_id AS pid,
      sum(runs_batter) AS runs,
      count(*) FILTER (WHERE extra_type IS DISTINCT FROM 'wides') AS balls,
      count(*) FILTER (WHERE runs_batter = 4) AS fours,
      count(*) FILTER (WHERE runs_batter = 6) AS sixes
    FROM seq WHERE batter_id IS NOT NULL GROUP BY match_id, innings_no, batter_id`);

  await conn.run(`CREATE TEMP TABLE g_bat AS
    SELECT bo.match_id, bo.innings_no, bo.pos AS battingPos, bo.pid AS cricsheetId, bo.nm AS name,
      coalesce(b.runs,0) AS runs, coalesce(b.balls,0) AS balls, coalesce(b.fours,0) AS fours, coalesce(b.sixes,0) AS sixes,
      CASE WHEN coalesce(b.balls,0) > 0 THEN round(b.runs * 100.0 / b.balls, 2) END AS strikeRate,
      (o.pid IS NOT NULL) AS out, o.kind AS dismissal
    FROM bat_order bo
    LEFT JOIN bat b ON b.match_id=bo.match_id AND b.innings_no=bo.innings_no AND b.pid=bo.pid
    LEFT JOIN outs o ON o.match_id=bo.match_id AND o.innings_no=bo.innings_no AND o.pid=bo.pid`);

  await conn.run(`CREATE TEMP TABLE over_runs AS
    SELECT match_id, innings_no, bowler_id AS pid, over_no,
      sum(runs_batter + CASE WHEN extra_type IN ('wides','noballs') THEN runs_extras ELSE 0 END) AS r,
      count(*) FILTER (WHERE extra_type IS NULL OR extra_type NOT IN ('wides','noballs')) AS legal
    FROM seq WHERE bowler_id IS NOT NULL GROUP BY match_id, innings_no, bowler_id, over_no`);

  await conn.run(`CREATE TEMP TABLE g_bowl AS
    WITH border AS (
      SELECT match_id, innings_no, bowler_id AS pid, any_value(bowler_name) AS nm,
        row_number() OVER (PARTITION BY match_id, innings_no ORDER BY min(s)) AS pos
      FROM seq WHERE bowler_id IS NOT NULL GROUP BY match_id, innings_no, bowler_id
    ),
    agg AS (
      SELECT match_id, innings_no, bowler_id AS pid,
        count(*) FILTER (WHERE extra_type IS NULL OR extra_type NOT IN ('wides','noballs')) AS balls,
        sum(runs_batter + CASE WHEN extra_type IN ('wides','noballs') THEN runs_extras ELSE 0 END) AS runs,
        count(*) FILTER (WHERE dismissal_kind IN ${BOWLER_WKTS}) AS wickets
      FROM seq WHERE bowler_id IS NOT NULL GROUP BY match_id, innings_no, bowler_id
    ),
    maid AS (SELECT match_id, innings_no, pid, count(*) FILTER (WHERE r=0 AND legal>=6) AS m FROM over_runs GROUP BY 1,2,3)
    SELECT bo.match_id, bo.innings_no, bo.pos AS bowlingPos, bo.pid AS cricsheetId, bo.nm AS name,
      coalesce(a.balls,0) AS balls, coalesce(md.m,0) AS maidens, coalesce(a.runs,0) AS runs, coalesce(a.wickets,0) AS wickets,
      CASE WHEN coalesce(a.balls,0) > 0 THEN round(a.runs / (a.balls/6.0), 2) END AS economy
    FROM border bo
    LEFT JOIN agg a ON a.match_id=bo.match_id AND a.innings_no=bo.innings_no AND a.pid=bo.pid
    LEFT JOIN maid md ON md.match_id=bo.match_id AND md.innings_no=bo.innings_no AND md.pid=bo.pid`);

  // CareerMatch: metadata + per-innings score summary strings.
  await conn.run(`CREATE TEMP TABLE g_match AS
    WITH score AS (
      SELECT match_id, innings_no,
        runs || '/' || wickets || ' (' || cast(floor(balls / 6.0) AS INTEGER) || '.' || (balls % 6) || ')' AS score
      FROM g_inn
    )
    SELECT m.match_id, m.match_class, m.match_type, m.gender, m.season, m.event_name, m.event_match_number,
      m.venue, m.city, m.match_date, m.team_home, m.team_away, m.toss_winner, m.toss_decision, m.outcome_winner,
      (SELECT score FROM score s WHERE s.match_id=m.match_id AND s.innings_no=1) AS inn1_score,
      (SELECT score FROM score s WHERE s.match_id=m.match_id AND s.innings_no=2) AS inn2_score
    FROM read_parquet('${matches}') m`);

  log("writing match gold → Neon (truncate + insert)…");
  await conn.run(`DELETE FROM pg."ScorecardBatting"`);
  await conn.run(`DELETE FROM pg."ScorecardBowling"`);
  await conn.run(`DELETE FROM pg."ScorecardInnings"`);
  await conn.run(`DELETE FROM pg."CareerMatch"`);

  await conn.run(`INSERT INTO pg."CareerMatch" (
      "matchId","matchClass","matchType","gender","season","eventName","eventMatchNumber","venue","city","matchDate",
      "teamHome","teamAway","tossWinner","tossDecision","winner","inn1Score","inn2Score")
    SELECT match_id, match_class, match_type, gender, season, event_name, event_match_number, venue, city, match_date,
      team_home, team_away, toss_winner, toss_decision, outcome_winner, inn1_score, inn2_score FROM g_match`);
  await conn.run(`INSERT INTO pg."ScorecardInnings" ("matchId","inningsNo","battingTeam","runs","wickets","balls")
    SELECT match_id, innings_no, batting_team, runs, wickets, balls FROM g_inn`);
  await conn.run(`INSERT INTO pg."ScorecardBatting" ("matchId","inningsNo","battingPos","cricsheetId","name","runs","balls","fours","sixes","strikeRate","out","dismissal")
    SELECT match_id, innings_no, battingPos, cricsheetId, name, runs, balls, fours, sixes, strikeRate, out, dismissal FROM g_bat`);
  await conn.run(`INSERT INTO pg."ScorecardBowling" ("matchId","inningsNo","bowlingPos","cricsheetId","name","balls","maidens","runs","wickets","economy")
    SELECT match_id, innings_no, bowlingPos, cricsheetId, name, balls, maidens, runs, wickets, economy FROM g_bowl`);

  const n = async (t: string): Promise<number> =>
    Number((await conn.runAndReadAll(`SELECT count(*) c FROM ${t}`)).getRowObjects()[0]?.c ?? 0);
  const result = {
    matches: await n("g_match"),
    innings: await n("g_inn"),
    battingLines: await n("g_bat"),
    bowlingLines: await n("g_bowl"),
  };
  conn.closeSync();
  return result;
}
