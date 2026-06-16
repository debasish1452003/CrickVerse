import { join, resolve } from "node:path";
import { exportHistoricalSilver } from "@crickverse/lakehouse";
import { createLogger } from "../logger";

const LAKEHOUSE_DIR = process.env.LAKEHOUSE_DIR ?? resolve(process.cwd(), "..", "..", "data", "lakehouse");

/**
 * Promote the per-innings Statsguru recovery (Neon `PlayerInningsHistory`) into a
 * tiered silver Parquet (`silver/player_innings.parquet`, tier=scorecard) so the
 * scorecard-grain ML corpus includes the pre-2000 / pre-Cricsheet years. Reads
 * Postgres via DuckDB's postgres extension; writes locally. Uses the DIRECT Neon
 * host (DATABASE_URL), like the rest of the worker's gold builds.
 */
export async function historicalExportSilver(): Promise<void> {
  const logger = createLogger("historical-export-silver");
  const postgresUrl = process.env.DATABASE_URL;
  if (!postgresUrl) {
    logger.error("DATABASE_URL is not set");
    process.exitCode = 1;
    return;
  }
  const silverDir = join(LAKEHOUSE_DIR, "silver");
  logger.info("historical silver export starting", { silverDir });
  const result = await exportHistoricalSilver({
    silverDir,
    postgresUrl: libpqUrl(postgresUrl),
    log: (m) => logger.info(m),
  });
  logger.info("✅ historical silver export done", result);
}

/**
 * Strip Prisma-only query params (connection_limit, pool_timeout, …) that libpq —
 * and hence DuckDB's postgres extension — rejects. Keep only libpq-valid ones.
 * (Mirrors build-gold.ts.)
 */
function libpqUrl(url: string): string {
  try {
    const u = new URL(url);
    const allow = new Set(["sslmode", "connect_timeout", "application_name", "options"]);
    for (const key of [...u.searchParams.keys()]) if (!allow.has(key)) u.searchParams.delete(key);
    if (!u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "require");
    return u.toString();
  } catch {
    return url;
  }
}
