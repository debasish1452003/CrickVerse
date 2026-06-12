import { once } from "node:events";
import { createWriteStream, mkdirSync, rmSync, type WriteStream } from "node:fs";
import { join } from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import type { FlatMatch } from "./flatten";

/** SQL→Parquet path needs forward slashes even on Windows. */
const fwd = (p: string): string => p.replace(/\\/g, "/");

/** Explicit column types so DuckDB doesn't mis-infer all-null columns. */
const DELIVERY_COLUMNS: Record<string, string> = {
  match_id: "VARCHAR",
  match_class: "VARCHAR",
  match_type: "VARCHAR",
  gender: "VARCHAR",
  season: "VARCHAR",
  event_name: "VARCHAR",
  venue: "VARCHAR",
  city: "VARCHAR",
  match_date: "VARCHAR",
  innings_no: "INTEGER",
  batting_team: "VARCHAR",
  bowling_team: "VARCHAR",
  over_no: "INTEGER",
  ball_in_over: "INTEGER",
  batter_id: "VARCHAR",
  batter_cricinfo: "VARCHAR",
  batter_name: "VARCHAR",
  bowler_id: "VARCHAR",
  bowler_cricinfo: "VARCHAR",
  bowler_name: "VARCHAR",
  non_striker_id: "VARCHAR",
  non_striker_name: "VARCHAR",
  runs_batter: "INTEGER",
  runs_extras: "INTEGER",
  runs_total: "INTEGER",
  extra_type: "VARCHAR",
  is_wicket: "BOOLEAN",
  dismissal_kind: "VARCHAR",
  player_out_id: "VARCHAR",
  player_out_name: "VARCHAR",
  fielders: "VARCHAR",
};

const MATCH_COLUMNS: Record<string, string> = {
  match_id: "VARCHAR",
  match_class: "VARCHAR",
  match_type: "VARCHAR",
  gender: "VARCHAR",
  season: "VARCHAR",
  event_name: "VARCHAR",
  event_match_number: "INTEGER",
  venue: "VARCHAR",
  city: "VARCHAR",
  match_date: "VARCHAR",
  team_home: "VARCHAR",
  team_away: "VARCHAR",
  toss_winner: "VARCHAR",
  toss_decision: "VARCHAR",
  outcome_winner: "VARCHAR",
  player_of_match: "VARCHAR",
  balls_per_over: "INTEGER",
  revision: "INTEGER",
};

const PLAYER_COLUMNS: Record<string, string> = {
  cricsheet_id: "VARCHAR",
  name: "VARCHAR",
  cricinfo_id: "VARCHAR",
};

const colSpec = (cols: Record<string, string>): string =>
  "{" +
  Object.entries(cols)
    .map(([k, v]) => `'${k}': '${v}'`)
    .join(", ") +
  "}";

export interface SinkSummary {
  deliveries: number;
  matches: number;
  players: number;
  silverDir: string;
}

/**
 * Streams flattened rows to NDJSON staging, then has DuckDB write columnar Parquet:
 * deliveries partitioned by (match_class, season), matches + players as single files.
 * NDJSON staging keeps memory flat regardless of corpus size; DuckDB does the heavy
 * type-cast + compression in one pass.
 */
export class ParquetSink {
  private readonly staging: string;
  private readonly silver: string;
  private readonly del: WriteStream;
  private readonly mat: WriteStream;
  private readonly pl: WriteStream;

  constructor(private readonly outDir: string) {
    this.staging = join(outDir, "_staging");
    this.silver = join(outDir, "silver");
    mkdirSync(this.staging, { recursive: true });
    mkdirSync(this.silver, { recursive: true });
    this.del = createWriteStream(join(this.staging, "deliveries.ndjson"));
    this.mat = createWriteStream(join(this.staging, "matches.ndjson"));
    this.pl = createWriteStream(join(this.staging, "players.ndjson"));
  }

  /** Append one match's rows (awaits write-stream backpressure to stay bounded). */
  async write(flat: FlatMatch): Promise<void> {
    for (const d of flat.deliveries) await writeLine(this.del, d);
    await writeLine(this.mat, flat.match);
    for (const p of flat.players) await writeLine(this.pl, p);
  }

  /** Close staging, then COPY to Parquet via DuckDB. Removes staging on success. */
  async finalize(): Promise<SinkSummary> {
    await Promise.all([endStream(this.del), endStream(this.mat), endStream(this.pl)]);

    // Filesystem-clean prior outputs so a re-export fully replaces (no stale
    // partitions left behind when a match's classification changes).
    rmSync(join(this.silver, "deliveries"), { recursive: true, force: true });
    rmSync(join(this.silver, "matches.parquet"), { force: true });
    rmSync(join(this.silver, "players.parquet"), { force: true });

    const instance = await DuckDBInstance.create(":memory:");
    const conn = await instance.connect();
    const stg = fwd(this.staging);
    const sil = fwd(this.silver);

    const readDel = `read_json('${stg}/deliveries.ndjson', format='newline_delimited', columns=${colSpec(DELIVERY_COLUMNS)})`;
    const readMat = `read_json('${stg}/matches.ndjson', format='newline_delimited', columns=${colSpec(MATCH_COLUMNS)})`;
    const readPl = `read_json('${stg}/players.ndjson', format='newline_delimited', columns=${colSpec(PLAYER_COLUMNS)})`;

    // deliveries: partitioned dir (Hive-style match_class=/season=).
    await conn.run(
      `COPY (SELECT * FROM ${readDel}) TO '${sil}/deliveries' ` +
        `(FORMAT PARQUET, PARTITION_BY (match_class, season), OVERWRITE_OR_IGNORE, COMPRESSION ZSTD)`,
    );
    await conn.run(`COPY (SELECT * FROM ${readMat}) TO '${sil}/matches.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)`);
    // players: dedupe to one row per cricsheet_id.
    await conn.run(
      `COPY (SELECT cricsheet_id, any_value(name) AS name, any_value(cricinfo_id) AS cricinfo_id ` +
        `FROM ${readPl} GROUP BY cricsheet_id) TO '${sil}/players.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)`,
    );

    const summary: SinkSummary = {
      deliveries: await count(conn, `read_parquet('${sil}/deliveries/**/*.parquet')`),
      matches: await count(conn, `read_parquet('${sil}/matches.parquet')`),
      players: await count(conn, `read_parquet('${sil}/players.parquet')`),
      silverDir: this.silver,
    };

    conn.closeSync();
    rmSync(this.staging, { recursive: true, force: true });
    return summary;
  }
}

async function count(conn: DuckDBConnection, src: string): Promise<number> {
  const res = await conn.runAndReadAll(`SELECT count(*) AS n FROM ${src}`);
  return Number(res.getRowObjects()[0]?.n ?? 0);
}

async function writeLine(stream: WriteStream, obj: unknown): Promise<void> {
  if (!stream.write(JSON.stringify(obj) + "\n")) await once(stream, "drain");
}

function endStream(stream: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
  });
}
