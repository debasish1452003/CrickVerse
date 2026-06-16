import { DuckDBInstance } from "@duckdb/node-api";

const ROOT = "e:/Other Learning works/CrickVerse/data/lakehouse";
const deliveries = `read_parquet('${ROOT}/silver/deliveries/**/*.parquet', hive_partitioning=true)`;
const OUT = `${ROOT}/silver/career_innings.parquet`;

// Ownership rule (NOT date-based): the scrape (ESPNcricinfo) is the COMPLETE, verified
// scorecard source for the international formats it covers, while Cricsheet is patchy in
// its early years (2001-2007). So: international formats of a scraped player come from
// scrape; everything else (modern players + all domestic/franchise) comes from Cricsheet.
// A (player, format) is owned by exactly one source => zero duplication, zero loss.
const instance = await DuckDBInstance.create(":memory:");
const conn = await instance.connect();
const run = (sql) => conn.run(sql);
const rows = async (sql) => (await (await conn.run(sql)).getRowObjects());

await run(`INSTALL postgres; LOAD postgres;`);
await run(`ATTACH 'host=localhost port=5432 dbname=crickverse user=postgres password=postgres sslmode=disable' AS pg (TYPE postgres, READ_ONLY);`);

console.log("Building unified career_innings (this runs entirely in DuckDB)...");

// (cricinfo_id, format) pairs the scrape owns — Cricsheet rows for these are excluded.
await run(`CREATE TEMP TABLE scrape_owned AS
  SELECT DISTINCT "cricinfoId" AS cricinfo_id, "matchClass" AS match_class
  FROM pg.public."PlayerInningsHistory" WHERE "cricinfoId" IS NOT NULL;`);

await run(`
CREATE TEMP TABLE unified AS

-- ============ SCRAPE side: FULL international careers (complete & verified) ============
WITH scrape AS (
  SELECT * FROM pg.public."PlayerInningsHistory"
  WHERE "matchDate" IS NOT NULL AND discipline IN ('batting','bowling')
),
scrape_rows AS (
  SELECT
    'SCRAPE'              AS source,
    CAST(NULL AS VARCHAR) AS match_id,
    "cricinfoId"         AS cricinfo_id,
    CAST(NULL AS VARCHAR) AS cricsheet_id,
    CAST(NULL AS VARCHAR) AS player_name,
    "matchClass"         AS match_class,
    "matchDate"          AS match_date,
    CAST(NULL AS VARCHAR) AS season,
    CAST(NULL AS VARCHAR) AS venue,
    CAST(NULL AS VARCHAR) AS city,
    opposition           AS opposition,
    "inningsNo"          AS innings_no,
    discipline           AS discipline,
    -- batting
    CASE WHEN discipline='batting' THEN runs END         AS runs,
    CASE WHEN discipline='batting' THEN "ballsFaced" END AS balls_faced,
    CASE WHEN discipline='batting' THEN fours END        AS fours,
    CASE WHEN discipline='batting' THEN sixes END        AS sixes,
    CASE WHEN discipline='batting' THEN "notOut" END     AS not_out,
    CASE WHEN discipline='batting' THEN "battingPos" END AS batting_pos,
    CASE WHEN discipline='batting' THEN dismissal END    AS dismissal,
    -- bowling
    CASE WHEN discipline='bowling' THEN "ballsBowled" END  AS balls_bowled,
    CASE WHEN discipline='bowling' THEN maidens END        AS maidens,
    CASE WHEN discipline='bowling' THEN "runsConceded" END AS runs_conceded,
    CASE WHEN discipline='bowling' THEN wickets END        AS wickets
  FROM scrape
),

-- ============ CRICSHEET side: ball-by-ball aggregated to innings grain ============
d AS (SELECT * FROM ${deliveries}),
bat AS (
  SELECT
    'CRICSHEET' AS source,
    match_id,
    any_value(batter_cricinfo) AS cricinfo_id,
    batter_id AS cricsheet_id,
    any_value(batter_name) AS player_name,
    match_class, any_value(match_date) AS match_date, any_value(season) AS season,
    any_value(venue) AS venue, any_value(city) AS city,
    any_value(bowling_team) AS opposition,
    innings_no, 'batting' AS discipline,
    sum(runs_batter) AS runs,
    count(*) FILTER (WHERE extra_type IS DISTINCT FROM 'wides') AS balls_faced,
    sum(CASE WHEN runs_batter=4 THEN 1 ELSE 0 END) AS fours,
    sum(CASE WHEN runs_batter=6 THEN 1 ELSE 0 END) AS sixes,
    CAST(NULL AS BOOLEAN) AS not_out,
    CAST(NULL AS INTEGER) AS batting_pos,
    CAST(NULL AS VARCHAR) AS dismissal,
    CAST(NULL AS INTEGER) AS balls_bowled, CAST(NULL AS INTEGER) AS maidens,
    CAST(NULL AS INTEGER) AS runs_conceded, CAST(NULL AS INTEGER) AS wickets
  FROM d
  WHERE NOT EXISTS (SELECT 1 FROM scrape_owned o WHERE o.cricinfo_id = d.batter_cricinfo AND o.match_class = d.match_class)
  GROUP BY batter_id, match_id, match_class, innings_no
),
bowl AS (
  SELECT
    'CRICSHEET' AS source,
    match_id,
    any_value(bowler_cricinfo) AS cricinfo_id,
    bowler_id AS cricsheet_id,
    any_value(bowler_name) AS player_name,
    match_class, any_value(match_date) AS match_date, any_value(season) AS season,
    any_value(venue) AS venue, any_value(city) AS city,
    any_value(batting_team) AS opposition,
    innings_no, 'bowling' AS discipline,
    CAST(NULL AS INTEGER) AS runs, CAST(NULL AS INTEGER) AS balls_faced,
    CAST(NULL AS INTEGER) AS fours, CAST(NULL AS INTEGER) AS sixes,
    CAST(NULL AS BOOLEAN) AS not_out, CAST(NULL AS INTEGER) AS batting_pos,
    CAST(NULL AS VARCHAR) AS dismissal,
    count(*) FILTER (WHERE extra_type IS NULL OR extra_type NOT IN ('wides','noballs')) AS balls_bowled,
    CAST(NULL AS INTEGER) AS maidens,
    sum(runs_batter + CASE WHEN extra_type IN ('wides','noballs') THEN runs_extras ELSE 0 END) AS runs_conceded,
    sum(CASE WHEN is_wicket AND dismissal_kind NOT IN ('run out','retired hurt','retired out','retired not out') THEN 1 ELSE 0 END) AS wickets
  FROM d
  WHERE NOT EXISTS (SELECT 1 FROM scrape_owned o WHERE o.cricinfo_id = d.bowler_cricinfo AND o.match_class = d.match_class)
  GROUP BY bowler_id, match_id, match_class, innings_no
)
SELECT * FROM scrape_rows
UNION ALL SELECT source,match_id,cricinfo_id,cricsheet_id,player_name,match_class,match_date,season,venue,city,opposition,innings_no,discipline,runs,balls_faced,fours,sixes,not_out,batting_pos,dismissal,balls_bowled,maidens,runs_conceded,wickets FROM bat
UNION ALL SELECT source,match_id,cricinfo_id,cricsheet_id,player_name,match_class,match_date,season,venue,city,opposition,innings_no,discipline,runs,balls_faced,fours,sixes,not_out,batting_pos,dismissal,balls_bowled,maidens,runs_conceded,wickets FROM bowl
;`);

const summary = await rows(`
  SELECT source, discipline, count(*) AS rows, count(DISTINCT coalesce(cricinfo_id, cricsheet_id)) AS players
  FROM unified GROUP BY 1,2 ORDER BY 1,2`);
console.log("\n=== unified composition ===");
for (const s of summary) console.log(`  ${s.source.padEnd(10)} ${s.discipline.padEnd(8)} rows=${Number(s.rows)} players=${Number(s.players)}`);

// CHECK 1 (the one that matters): cross-source duplication — same player+date+discipline
// appearing in BOTH scrape and Cricsheet means the boundary leaked. Must be 0.
const cross = await rows(`
  SELECT count(*) AS n FROM (
    SELECT cricinfo_id, match_date, discipline
    FROM unified WHERE cricinfo_id IS NOT NULL
    GROUP BY 1,2,3
    HAVING count(DISTINCT source) > 1
  )`);
console.log("\nCROSS-SOURCE duplication (must be 0):", Number(cross[0].n));

// CHECK 2: true within-Cricsheet dup using match_id (proper grain). Same player twice in
// the same match+innings+discipline. Must be 0.
const within = await rows(`
  SELECT count(*) AS n FROM (
    SELECT match_id, cricsheet_id, innings_no, discipline, count(*) c
    FROM unified WHERE source='CRICSHEET'
    GROUP BY 1,2,3,4 HAVING count(*) > 1
  )`);
console.log("WITHIN-Cricsheet dup by match_id (must be 0):", Number(within[0].n));

// CHECK 3: the earlier false-positive — same-date different-match (benign), for context.
const sameDate = await rows(`
  SELECT count(*) AS n FROM (
    SELECT cricinfo_id, match_date, innings_no, discipline, count(DISTINCT match_id) c
    FROM unified WHERE source='CRICSHEET' AND cricinfo_id IS NOT NULL
    GROUP BY 1,2,3,4 HAVING count(DISTINCT match_id) > 1
  )`);
console.log("(context) same-date different-match groups (benign):", Number(sameDate[0].n));

await run(`COPY (SELECT * FROM unified) TO '${OUT}' (FORMAT parquet);`);
console.log("\n✅ wrote", OUT);
await conn.disconnectSync();
