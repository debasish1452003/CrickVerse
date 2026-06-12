const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  enabled: process.env.SCRAPER_ENABLED !== "false",
  concurrency: num(process.env.SCRAPER_CONCURRENCY, 2),
  minGapMs: num(process.env.SCRAPER_MIN_GAP_MS, 1000),
  maxRetries: num(process.env.SCRAPER_MAX_RETRIES, 4),
  /** Snapshot freshness window; cache hits within this skip the network. */
  cacheTtlMs: num(process.env.SCRAPER_CACHE_TTL_MS, 6 * 60 * 60 * 1000),
  liveCron: process.env.SCRAPER_LIVE_CRON ?? "*/2 * * * *",
  backfillCron: process.env.SCRAPER_BACKFILL_CRON ?? "17 * * * *",
  /** Cricsheet conditional-download + ingest; daily 04:00 by default. */
  cricsheetCron: process.env.SCRAPER_CRICSHEET_CRON ?? "0 4 * * *",
  /** Lakehouse refresh (re-export silver Parquet + rebuild gold); daily 04:40. */
  lakehouseCron: process.env.SCRAPER_LAKEHOUSE_CRON ?? "40 4 * * *",
  /** Gate the lakehouse tick — heavy local CPU/disk; off unless explicitly enabled. */
  lakehouseEnabled: process.env.SCRAPER_LAKEHOUSE_ENABLED === "true",
  /** Comma-separated "slug-objectId" pairs, used as a fallback seed list. */
  activeSeries: (process.env.SCRAPER_ACTIVE_SERIES ?? "ipl-2026-1510719")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
