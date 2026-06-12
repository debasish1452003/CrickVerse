import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

/** SQL path needs forward slashes even on Windows. */
const fwd = (p: string): string => p.replace(/\\/g, "/");

export interface BuildGoldResult {
  careerPlayers: number;
  careerStats: number;
}

/**
 * Gold build: DuckDB reads the silver delivery Parquet, computes ESPNcricinfo-style
 * per-player-per-class career aggregates, and bulk-writes them into Postgres
 * (Neon) via the DuckDB `postgres` extension — fast (set-based), so it sidesteps
 * the per-row Neon latency that makes row-by-row ingest slow. Full rebuild:
 * truncates the gold tables, then inserts. Keyed by Cricsheet player id.
 *
 * Bowler-credited wickets exclude run outs / retirements (Cricsheet `kind` tokens).
 * Balls faced exclude wides; bowler runs charge wides + no-balls (not byes/leg-byes).
 */
export async function buildGold(opts: {
  silverDir: string;
  postgresUrl: string;
  log?: (msg: string) => void;
}): Promise<BuildGoldResult> {
  const log = opts.log ?? (() => {});
  const deliveries = fwd(join(opts.silverDir, "deliveries", "**", "*.parquet"));
  const players = fwd(join(opts.silverDir, "players.parquet"));

  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();

  log("loading postgres extension + attaching Neon…");
  await conn.run("INSTALL postgres; LOAD postgres;");
  await conn.run(`ATTACH '${opts.postgresUrl}' AS pg (TYPE postgres)`);

  // Build the per-class career table in DuckDB first (fast, local), then push.
  log("aggregating careers from silver Parquet…");
  await conn.run(`CREATE TEMP TABLE career AS ${CAREER_SQL(deliveries)}`);
  await conn.run(`CREATE TEMP TABLE career_player AS ${CAREER_PLAYER_SQL(deliveries, players)}`);

  log("writing gold → Neon (truncate + insert)…");
  // CareerStat has a FK to CareerPlayer; clear children first.
  await conn.run(`DELETE FROM pg."CareerStat"`);
  await conn.run(`DELETE FROM pg."CareerPlayer"`);

  await conn.run(
    `INSERT INTO pg."CareerPlayer" ("cricsheetId","name","cricinfoId","gender","careerMatches","careerRuns","careerWickets") ` +
      `SELECT cricsheet_id, name, cricinfo_id, gender, career_matches, career_runs, career_wickets FROM career_player`,
  );
  await conn.run(
    `INSERT INTO pg."CareerStat" (` +
      `"cricsheetId","matchClass","matches","batInnings","runs","ballsFaced","notOuts","highScore","highScoreNotOut",` +
      `"fifties","hundreds","ducks","fours","sixes","battingAvg","strikeRate",` +
      `"bowlInnings","ballsBowled","runsConceded","wickets","bestBowlingWkts","bestBowlingRuns","fiveWickets","economy","bowlingAvg","bowlingSr") ` +
      `SELECT cricsheet_id, match_class, matches, bat_innings, runs, balls_faced, not_outs, high_score, high_score_not_out, ` +
      `fifties, hundreds, ducks, fours, sixes, batting_avg, strike_rate, ` +
      `bowl_innings, balls_bowled, runs_conceded, wickets, best_bowling_wkts, best_bowling_runs, five_wickets, economy, bowling_avg, bowling_sr ` +
      `FROM career WHERE cricsheet_id IS NOT NULL`,
  );

  const n = async (t: string): Promise<number> =>
    Number((await conn.runAndReadAll(`SELECT count(*) c FROM ${t}`)).getRowObjects()[0]?.c ?? 0);
  const result = { careerPlayers: await n("career_player"), careerStats: await n("career") };
  conn.closeSync();
  return result;
}

/** Per-(player, class) career batting + bowling aggregates. */
function CAREER_SQL(deliveries: string): string {
  return `
WITH d AS (SELECT * FROM read_parquet('${deliveries}', hive_partitioning=true)),
outs AS (SELECT DISTINCT match_id, innings_no, player_out_id AS pid FROM d WHERE player_out_id IS NOT NULL),
appear AS (
  SELECT batter_id AS pid, match_class, match_id FROM d WHERE batter_id IS NOT NULL
  UNION
  SELECT bowler_id AS pid, match_class, match_id FROM d WHERE bowler_id IS NOT NULL
),
appcnt AS (SELECT pid, match_class, count(DISTINCT match_id) AS matches FROM appear GROUP BY pid, match_class),
bat_inn AS (
  SELECT d.batter_id AS pid, d.match_id, d.innings_no, any_value(d.match_class) AS match_class,
    sum(d.runs_batter) AS runs,
    count(*) FILTER (WHERE d.extra_type IS DISTINCT FROM 'wides') AS balls,
    count(*) FILTER (WHERE d.runs_batter = 4) AS fours,
    count(*) FILTER (WHERE d.runs_batter = 6) AS sixes,
    max(CASE WHEN o.pid IS NOT NULL THEN 1 ELSE 0 END) AS is_out
  FROM d LEFT JOIN outs o ON o.match_id=d.match_id AND o.innings_no=d.innings_no AND o.pid=d.batter_id
  WHERE d.batter_id IS NOT NULL
  GROUP BY d.batter_id, d.match_id, d.innings_no
),
bat AS (
  SELECT pid, match_class,
    count(*) AS bat_innings, sum(runs) AS runs, sum(balls) AS balls_faced,
    sum(1 - is_out) AS not_outs, max(runs) AS high_score,
    sum(CASE WHEN runs>=50 AND runs<100 THEN 1 ELSE 0 END) AS fifties,
    sum(CASE WHEN runs>=100 THEN 1 ELSE 0 END) AS hundreds,
    sum(CASE WHEN runs=0 AND is_out=1 THEN 1 ELSE 0 END) AS ducks,
    sum(fours) AS fours, sum(sixes) AS sixes
  FROM bat_inn GROUP BY pid, match_class
),
hs_no AS (
  SELECT pid, match_class, max(1 - is_out) AS hs_notout
  FROM bat_inn bi
  WHERE bi.runs = (SELECT max(runs) FROM bat_inn b2 WHERE b2.pid=bi.pid AND b2.match_class=bi.match_class)
  GROUP BY pid, match_class
),
bowl_inn AS (
  SELECT d.bowler_id AS pid, d.match_id, d.innings_no, any_value(d.match_class) AS match_class,
    count(*) FILTER (WHERE d.extra_type IS NULL OR d.extra_type NOT IN ('wides','noballs')) AS balls,
    sum(d.runs_batter + CASE WHEN d.extra_type IN ('wides','noballs') THEN d.runs_extras ELSE 0 END) AS runs,
    count(*) FILTER (WHERE d.dismissal_kind IN ('bowled','caught','lbw','stumped','caught and bowled','hit wicket')) AS wkts
  FROM d WHERE d.bowler_id IS NOT NULL
  GROUP BY d.bowler_id, d.match_id, d.innings_no
),
bowl AS (
  SELECT pid, match_class, count(*) AS bowl_innings,
    sum(balls) AS balls_bowled, sum(runs) AS runs_conceded, sum(wkts) AS wickets,
    sum(CASE WHEN wkts>=5 THEN 1 ELSE 0 END) AS five_w
  FROM bowl_inn GROUP BY pid, match_class
),
bb AS (
  SELECT pid, match_class, wkts AS bb_wkts, runs AS bb_runs,
    row_number() OVER (PARTITION BY pid, match_class ORDER BY wkts DESC, runs ASC) AS rn
  FROM bowl_inn
)
SELECT
  coalesce(bat.pid, bowl.pid) AS cricsheet_id,
  coalesce(bat.match_class, bowl.match_class) AS match_class,
  coalesce(ac.matches, 0) AS matches,
  coalesce(bat.bat_innings,0) AS bat_innings,
  coalesce(bat.runs,0) AS runs, coalesce(bat.balls_faced,0) AS balls_faced,
  coalesce(bat.not_outs,0) AS not_outs, coalesce(bat.high_score,0) AS high_score,
  coalesce(hs_no.hs_notout,0)=1 AS high_score_not_out,
  coalesce(bat.fifties,0) AS fifties, coalesce(bat.hundreds,0) AS hundreds,
  coalesce(bat.ducks,0) AS ducks, coalesce(bat.fours,0) AS fours, coalesce(bat.sixes,0) AS sixes,
  CASE WHEN (coalesce(bat.bat_innings,0)-coalesce(bat.not_outs,0))>0
       THEN round(bat.runs::DOUBLE/(bat.bat_innings-bat.not_outs), 2) END AS batting_avg,
  CASE WHEN coalesce(bat.balls_faced,0)>0 THEN round(bat.runs::DOUBLE*100/bat.balls_faced, 2) END AS strike_rate,
  coalesce(bowl.bowl_innings,0) AS bowl_innings, coalesce(bowl.balls_bowled,0) AS balls_bowled,
  coalesce(bowl.runs_conceded,0) AS runs_conceded, coalesce(bowl.wickets,0) AS wickets,
  coalesce(bb.bb_wkts,0) AS best_bowling_wkts, coalesce(bb.bb_runs,0) AS best_bowling_runs,
  coalesce(bowl.five_w,0) AS five_wickets,
  CASE WHEN coalesce(bowl.balls_bowled,0)>0 THEN round(bowl.runs_conceded::DOUBLE/(bowl.balls_bowled/6.0), 2) END AS economy,
  CASE WHEN coalesce(bowl.wickets,0)>0 THEN round(bowl.runs_conceded::DOUBLE/bowl.wickets, 2) END AS bowling_avg,
  CASE WHEN coalesce(bowl.wickets,0)>0 THEN round(bowl.balls_bowled::DOUBLE/bowl.wickets, 2) END AS bowling_sr
FROM bat
FULL OUTER JOIN bowl ON bat.pid=bowl.pid AND bat.match_class=bowl.match_class
LEFT JOIN hs_no ON hs_no.pid=bat.pid AND hs_no.match_class=bat.match_class
LEFT JOIN appcnt ac ON ac.pid=coalesce(bat.pid,bowl.pid) AND ac.match_class=coalesce(bat.match_class,bowl.match_class)
LEFT JOIN bb ON bb.pid=coalesce(bat.pid,bowl.pid) AND bb.match_class=coalesce(bat.match_class,bowl.match_class) AND bb.rn=1
`;
}

/** One row per player (who appeared) with identity + whole-career headline totals. */
function CAREER_PLAYER_SQL(deliveries: string, players: string): string {
  return `
WITH d AS (SELECT * FROM read_parquet('${deliveries}', hive_partitioning=true)),
appear AS (
  SELECT batter_id AS pid, match_id, gender FROM d WHERE batter_id IS NOT NULL
  UNION ALL
  SELECT bowler_id AS pid, match_id, gender FROM d WHERE bowler_id IS NOT NULL
),
agg AS (
  SELECT pid, count(DISTINCT match_id) AS career_matches, any_value(gender) AS gender
  FROM appear GROUP BY pid
),
runs_w AS (
  SELECT batter_id AS pid, sum(runs_batter) AS runs, 0 AS wkts FROM d WHERE batter_id IS NOT NULL GROUP BY batter_id
),
wkts_w AS (
  SELECT bowler_id AS pid,
    sum(CASE WHEN dismissal_kind IN ('bowled','caught','lbw','stumped','caught and bowled','hit wicket') THEN 1 ELSE 0 END) AS wkts
  FROM d WHERE bowler_id IS NOT NULL GROUP BY bowler_id
),
pp AS (SELECT cricsheet_id, name, cricinfo_id FROM read_parquet('${players}'))
SELECT a.pid AS cricsheet_id,
  coalesce(any_value(pp.name), a.pid) AS name,
  any_value(pp.cricinfo_id) AS cricinfo_id,
  any_value(a.gender) AS gender,
  any_value(a.career_matches) AS career_matches,
  coalesce(any_value(r.runs), 0) AS career_runs,
  coalesce(any_value(w.wkts), 0) AS career_wickets
FROM agg a
LEFT JOIN pp ON pp.cricsheet_id = a.pid
LEFT JOIN runs_w r ON r.pid = a.pid
LEFT JOIN wkts_w w ON w.pid = a.pid
GROUP BY a.pid
`;
}
