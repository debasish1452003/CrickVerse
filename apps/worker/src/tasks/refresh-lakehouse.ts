import { getIngestState, updateIngestState } from "@crickverse/db";
import { createLogger } from "../logger";
import { feedUrl, resolveFeed } from "../cricsheet/feeds";
import { exportParquet } from "./export-parquet";
import { buildGoldTask } from "./build-gold";

const LAKEHOUSE_FEED_KEY = "lakehouse-all";

/**
 * Self-updating lakehouse refresh (the daily job): conditionally check the full
 * Cricsheet archive via a cheap HEAD (Last-Modified); only when it has changed do
 * we re-export the silver Parquet and rebuild the gold career tables. Cricsheet
 * republishes daily, so most runs cost one HEAD request and exit.
 */
export async function refreshLakehouse(opts: { force?: boolean } = {}): Promise<void> {
  const logger = createLogger("refresh-lakehouse");
  const feed = resolveFeed("all");
  const url = feedUrl(feed.file);

  const state = await getIngestState(LAKEHOUSE_FEED_KEY);
  let lastModified: string | null = null;
  if (!opts.force) {
    try {
      const head = await fetch(url, { method: "HEAD" });
      lastModified = head.headers.get("last-modified");
      if (lastModified && state?.lastModified === lastModified) {
        logger.info("archive unchanged — skipping lakehouse refresh", { lastModified });
        await updateIngestState(LAKEHOUSE_FEED_KEY, { lastRunAt: new Date(), lastStatus: "not-modified" });
        return;
      }
    } catch (err) {
      logger.warn("HEAD check failed; proceeding with refresh", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("archive changed (or forced) — rebuilding silver + gold");
  await exportParquet({ feedKey: "all", force: true });
  await buildGoldTask();
  await updateIngestState(LAKEHOUSE_FEED_KEY, {
    lastModified,
    lastRunAt: new Date(),
    lastStatus: "ok",
    lastError: null,
  });
  logger.info("✅ lakehouse refresh complete");
}
