import { getActiveScrapeSources } from "@crickverse/db";
import cron from "node-cron";
import { runCrawl } from "./crawl-engine";
import { config } from "./config";
import { createLogger } from "./logger";

/**
 * Two cron ticks sharing one rate budget:
 *  - LIVE (every 2 min by default): re-pull each active series' fixtures and
 *    force-refetch only its in-progress matches' scorecards. Off-season this is
 *    ~1 request per series and enqueues nothing.
 *  - BACKFILL (hourly by default): a deep HISTORICAL crawl, cache-first.
 * A per-tick lock prevents overlap if a previous run is still going.
 */
export function startScheduler(): void {
  const logger = createLogger("scheduler");

  if (!config.enabled) {
    logger.warn("SCRAPER_ENABLED=false — scheduler idle");
    return;
  }

  let liveRunning = false;
  let backfillRunning = false;

  const runTick = async (mode: "LIVE" | "HISTORICAL"): Promise<void> => {
    const sources = await getActiveScrapeSources();
    logger.info(`${mode} tick: ${sources.length} active source(s)`);
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

  logger.info("scheduler started", { live: config.liveCron, backfill: config.backfillCron });
}
