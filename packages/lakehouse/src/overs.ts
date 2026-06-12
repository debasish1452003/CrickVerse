import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

const fwd = (p: string): string => p.replace(/\\/g, "/");

/** One over's rollup: over no, runs, wickets, fours, sixes, cumulative runs. */
export interface OverPoint {
  o: number;
  r: number;
  w: number;
  f: number;
  s: number;
  c: number;
}

export interface InningsOversRow {
  matchId: string;
  inningsNo: number;
  overs: OverPoint[];
}

/**
 * Compute the per-innings over-by-over rollup from the silver delivery Parquet.
 * Returns ~49k rows (one per innings), each with its ordered over array. The
 * heavy fold happens locally in DuckDB; only the small rolled-up rows cross into
 * Node, where the worker bulk-inserts them into Neon (InningsOvers) via Prisma.
 */
export async function computeInningsOvers(opts: {
  silverDir: string;
  log?: (msg: string) => void;
}): Promise<InningsOversRow[]> {
  const log = opts.log ?? (() => {});
  const deliveries = fwd(join(opts.silverDir, "deliveries", "**", "*.parquet"));

  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();

  log("rolling up overs from silver Parquet…");
  const sql = `
WITH d AS (SELECT * FROM read_parquet('${deliveries}', hive_partitioning=true)),
per_over AS (
  SELECT match_id, innings_no, over_no,
    sum(runs_total) AS r,
    sum(CASE WHEN is_wicket THEN 1 ELSE 0 END) AS w,
    count(*) FILTER (WHERE runs_batter = 4) AS f,
    count(*) FILTER (WHERE runs_batter = 6) AS s
  FROM d GROUP BY match_id, innings_no, over_no
),
cum AS (
  SELECT *, sum(r) OVER (PARTITION BY match_id, innings_no ORDER BY over_no
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS c
  FROM per_over
)
SELECT match_id, innings_no,
  to_json(list(struct_pack("o" := over_no, "r" := r, "w" := w, "f" := f, "s" := s, "c" := c)
    ORDER BY over_no)) AS overs
FROM cum GROUP BY match_id, innings_no`;

  const rows = (await conn.runAndReadAll(sql)).getRowObjects();
  conn.closeSync();

  const out: InningsOversRow[] = rows.map((row) => {
    const raw = row.overs as unknown;
    const overs: OverPoint[] = typeof raw === "string" ? JSON.parse(raw) : (raw as OverPoint[]);
    return {
      matchId: String(row.match_id),
      inningsNo: Number(row.innings_no),
      overs,
    };
  });
  log(`rolled up ${out.length} innings`);
  return out;
}
