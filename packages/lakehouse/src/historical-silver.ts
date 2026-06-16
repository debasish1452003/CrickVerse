import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

/** SQL paths need forward slashes even on Windows. */
const fwd = (p: string): string => p.replace(/\\/g, "/");

export interface ExportHistoricalSilverResult {
  rows: number;
  outFile: string;
}

/**
 * Export the per-innings Statsguru recovery (Neon `PlayerInningsHistory`) to a
 * silver-layer Parquet, tagged `tier='scorecard'`. This is the pre-~1996 /
 * pre-Cricsheet data that has NO ball-by-ball — so it is written to its OWN file
 * (not the ball grain) and must only feed scorecard-grain models. DuckDB reads
 * Postgres directly via its `postgres` extension and writes Parquet locally.
 */
export async function exportHistoricalSilver(opts: {
  silverDir: string;
  postgresUrl: string;
  log?: (msg: string) => void;
}): Promise<ExportHistoricalSilverResult> {
  const log = opts.log ?? (() => {});
  const outFile = fwd(join(opts.silverDir, "player_innings.parquet"));

  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  await conn.run("INSTALL postgres; LOAD postgres;");
  await conn.run(`ATTACH '${opts.postgresUrl}' AS pg (TYPE postgres)`);

  log("exporting PlayerInningsHistory → silver Parquet…");
  await conn.run(
    `COPY (
       SELECT
         "cricinfoId"    AS cricinfo_id,
         "matchClass"    AS match_class,
         discipline,
         "matchDate"     AS match_date,
         opposition,
         ground,
         "inningsNo"     AS innings_no,
         "didBat"        AS did_bat,
         runs,
         "notOut"        AS not_out,
         "ballsFaced"    AS balls_faced,
         fours,
         sixes,
         dismissal,
         "oversText"     AS overs_text,
         "ballsBowled"   AS balls_bowled,
         maidens,
         "runsConceded"  AS runs_conceded,
         wickets,
         economy,
         source,
         'scorecard'     AS tier
       FROM pg."PlayerInningsHistory"
     ) TO '${outFile}' (FORMAT PARQUET, OVERWRITE_OR_IGNORE 1)`,
  );

  const rows = Number(
    (await conn.runAndReadAll(`SELECT count(*) c FROM pg."PlayerInningsHistory"`)).getRowObjects()[0]?.c ?? 0,
  );
  conn.closeSync();
  return { rows, outFile };
}
