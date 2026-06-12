import { getActiveScrapeSources } from "@crickverse/db";
import cron from "node-cron";
import { runCrawl } from "./crawl-engine";
import { config } from "./config";
import { createLogger } from "./logger";
import { CRICSHEET_PAGE_TYPE, syncCricsheet } from "./tasks/sync-cricsheet";
import { refreshLakehouse } from "./tasks/refresh-lakehouse";

/**
 * Three cron ticks sharing one rate budget:
 *  - LIVE (every 2 min by default): re-pull each active series' fixtures and
 *    force-refetch only its in-progress matches' scorecards. Off-season this is
 *    ~1 request per series and enqueues nothing.
 *  - BACKFILL (hourly by default): a deep HISTORICAL crawl, cache-first.
 *  - CRICSHEET (daily by default): conditional-download each tracked archive and
 *    ingest only new/corrected matches (304 ⇒ zero bytes most days).
 * The live/backfill ticks crawl ESPNCricinfo series only — cricsheet-feed sources
 * have their own tick. A per-tick lock prevents overlap if a run is still going.
 */
export function startScheduler(): void {
  const logger = createLogger("scheduler");

  if (!config.enabled) {
    logger.warn("SCRAPER_ENABLED=false — scheduler idle");
    return;
  }

  let liveRunning = false;
  let backfillRunning = false;
  let cricsheetRunning = false;
  let lakehouseRunning = false;

  const runTick = async (mode: "LIVE" | "HISTORICAL"): Promise<void> => {
    // Cricsheet feeds aren't Cricinfo series — they're handled by the CRICSHEET tick.
    const sources = (await getActiveScrapeSources()).filter(
      (s) => s.pageType !== CRICSHEET_PAGE_TYPE,
    );
    logger.info(`${mode} tick: ${sources.length} active series source(s)`);
    for (const s of sources) {
      try {
        await runCrawl({ slug: s.slug, objectId: s.objectId, mode }, logger);
      } catch (err) {
        logger.error(`${mode} crawl failed for ${s.slug}`, {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  cron.schedule(config.liveCron, async () => {
    if (liveRunning) return logger.warn("live tick skipped (previous still running)");
    liveRunning = true;
    try {
      await runTick("LIVE");
    } catch (err) {
      logger.error("live tick failed", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      liveRunning = false;
    }
  });

  cron.schedule(config.backfillCron, async () => {
    if (backfillRunning) return logger.warn("backfill tick skipped (previous still running)");
    backfillRunning = true;
    try {
      await runTick("HISTORICAL");
    } catch (err) {
      logger.error("backfill tick failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      backfillRunning = false;
    }
  });

  cron.schedule(config.cricsheetCron, async () => {
    if (cricsheetRunning) return logger.warn("cricsheet tick skipped (previous still running)");
    cricsheetRunning = true;
    try {
      const results = await syncCricsheet();
      const totals = results.reduce(
        (a, r) => ({ ingested: a.ingested + r.ingested, errors: a.errors + r.errors }),
        { ingested: 0, errors: 0 },
      );
      logger.info("cricsheet tick done", { feeds: results.length, ...totals });
    } catch (err) {
      logger.error("cricsheet tick failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      cricsheetRunning = false;
    }
  });

  if (config.lakehouseEnabled) {
    cron.schedule(config.lakehouseCron, async () => {
      if (lakehouseRunning) return logger.warn("lakehouse tick skipped (previous still running)");
      lakehouseRunning = true;
      try {
        await refreshLakehouse();
      } catch (err) {
        logger.error("lakehouse tick failed", {
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        lakehouseRunning = false;
      }
    });
  }

  logger.info("scheduler started", {
    live: config.liveCron,
    backfill: config.backfillCron,
    cricsheet: config.cricsheetCron,
    lakehouse: config.lakehouseEnabled ? config.lakehouseCron : "disabled",
  });
}
