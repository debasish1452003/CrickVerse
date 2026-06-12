import { join, resolve } from "node:path";
import { buildGold, buildMatchGold } from "@crickverse/lakehouse";
import { createLogger } from "../logger";

const LAKEHOUSE_DIR = process.env.LAKEHOUSE_DIR ?? resolve(process.cwd(), "..", "..", "data", "lakehouse");

/**
 * Gold build: compute per-player-per-class career aggregates from the silver
 * Parquet (DuckDB) and bulk-write them into Neon (CareerPlayer + CareerStat),
 * which the web app reads. Requires the silver export to have run first.
 *
 * Uses the DIRECT Neon host (DATABASE_URL) — same as the rest of the worker.
 */
export async function buildGoldTask(): Promise<void> {
  const logger = createLogger("build-gold");
  const postgresUrl = process.env.DATABASE_URL;
  if (!postgresUrl) {
    logger.error("DATABASE_URL is not set");
    process.exitCode = 1;
    return;
  }
  const silverDir = join(LAKEHOUSE_DIR, "silver");
  const url = libpqUrl(postgresUrl);
  logger.info("gold build starting", { silverDir });
  const careers = await buildGold({ silverDir, postgresUrl: url, log: (m) => logger.info(m) });
  logger.info("✅ career gold done", careers);
  const matches = await buildMatchGold({ silverDir, postgresUrl: url, log: (m) => logger.info(m) });
  logger.info("✅ match gold done", matches);
}

/**
 * Strip Prisma-only query params (connection_limit, pool_timeout, …) that libpq —
 * and hence DuckDB's postgres extension — rejects. Keep only libpq-valid ones.
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
