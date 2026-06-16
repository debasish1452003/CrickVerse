import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

/** SQL paths need forward slashes even on Windows. */
const fwd = (p: string): string => p.replace(/\\/g, "/");

export interface BuildMlFeaturesResult {
  rows: number;
  classes: string[];
  outDir: string;
}

/**
 * ML feature build: read the silver ball-by-ball Parquet and materialise a
 * denormalised, per-delivery training table with the in-innings state that
 * predictive models need (pre-ball score / wickets / balls, chase target, run
 * rates) plus the per-ball outcome labels. Written back out as Parquet — partioned
 * by class — entirely on local disk (no database, no network). This is the
 * versioned ML corpus the product is ultimately for.
 *
 * BALL-BY-BALL ONLY. Scorecard-level historical data (pre-~1996, exported by
 * {@link exportHistoricalSilver}) is deliberately NOT unioned in here — mixing a
 * reconstructed scorecard row with a real delivery would corrupt the features.
 * Those live in a separate, clearly-tiered Parquet for scorecard-grain models.
 */
export async function buildMlFeatures(opts: {
  silverDir: string;
  outDir: string;
  log?: (msg: string) => void;
}): Promise<BuildMlFeaturesResult> {
  const log = opts.log ?? (() => {});
  const deliveries = fwd(join(opts.silverDir, "deliveries", "**", "*.parquet"));
  const outDir = fwd(opts.outDir);

  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();

  log("computing per-delivery features from silver…");
  await conn.run(`CREATE TEMP TABLE feat AS ${FEATURES_SQL(deliveries)}`);

  log("writing ML features Parquet (partitioned by class)…");
  await conn.run(
    `COPY (SELECT * FROM feat) TO '${outDir}' ` +
      `(FORMAT PARQUET, PARTITION_BY (match_class), OVERWRITE_OR_IGNORE 1)`,
  );

  const rows = Number((await conn.runAndReadAll(`SELECT count(*) c FROM feat`)).getRowObjects()[0]?.c ?? 0);
  const classes = (await conn.runAndReadAll(`SELECT DISTINCT match_class FROM feat ORDER BY match_class`))
    .getRowObjects()
    .map((r) => String(r.match_class));
  conn.closeSync();
  return { rows, classes, outDir: opts.outDir };
}

/**
 * Per-delivery features. Running state uses a frame UNBOUNDED PRECEDING → CURRENT
 * ROW, then subtracts the current ball so each row describes the state BEFORE the
 * ball is bowled (what a model would condition on). The chase target/required rate
 * are only defined from the 2nd innings of limited-overs matches.
 */
function FEATURES_SQL(deliveries: string): string {
  return `
WITH d AS (SELECT * FROM read_parquet('${deliveries}', hive_partitioning=true)),
seq AS (
  SELECT *,
    row_number() OVER w AS ball_seq,
    sum(runs_total) OVER w AS runs_through,
    sum(CASE WHEN is_wicket THEN 1 ELSE 0 END) OVER w AS wkts_through,
    count(*) FILTER (WHERE extra_type IS NULL OR extra_type NOT IN ('wides','noballs')) OVER w AS legal_through
  FROM d
  WINDOW w AS (PARTITION BY match_id, innings_no ORDER BY over_no, ball_in_over ROWS UNBOUNDED PRECEDING)
),
inn_tot AS (
  SELECT match_id, innings_no, sum(runs_total) AS innings_runs
  FROM d GROUP BY match_id, innings_no
),
quota AS (
  SELECT 'T20' AS mc, 120 AS balls UNION ALL SELECT 'T20I',120 UNION ALL SELECT 'ODI',300
  UNION ALL SELECT 'LIST_A',300 UNION ALL SELECT 'T10',60 UNION ALL SELECT 'HUNDRED',100
)
SELECT
  s.match_id, s.match_class, s.match_date, s.season, s.event_name, s.venue, s.city, s.gender,
  s.innings_no, s.batting_team, s.bowling_team,
  s.over_no, s.ball_in_over, s.ball_seq,
  s.batter_id, s.batter_cricinfo, s.bowler_id, s.bowler_cricinfo, s.non_striker_id,
  -- Pre-ball state (what a model conditions on): subtract the current ball.
  (s.runs_through - s.runs_total) AS runs_before,
  (s.wkts_through - CASE WHEN s.is_wicket THEN 1 ELSE 0 END) AS wickets_before,
  (s.legal_through - CASE WHEN s.extra_type IS NULL OR s.extra_type NOT IN ('wides','noballs') THEN 1 ELSE 0 END) AS legal_balls_before,
  q.balls AS innings_quota_balls,
  CASE WHEN q.balls IS NOT NULL
       THEN q.balls - (s.legal_through - CASE WHEN s.extra_type IS NULL OR s.extra_type NOT IN ('wides','noballs') THEN 1 ELSE 0 END)
  END AS balls_remaining,
  t1.innings_runs AS first_innings_total,
  CASE WHEN s.innings_no = 2 THEN t1.innings_runs + 1 END AS target,
  CASE WHEN s.innings_no = 2 THEN (t1.innings_runs + 1) - (s.runs_through - s.runs_total) END AS runs_required_before,
  -- Per-ball outcome labels.
  s.runs_batter, s.runs_extras, s.runs_total, s.extra_type, s.is_wicket, s.dismissal_kind, s.player_out_id
FROM seq s
LEFT JOIN inn_tot t1 ON t1.match_id = s.match_id AND t1.innings_no = 1
LEFT JOIN quota q ON q.mc = s.match_class
`;
}
