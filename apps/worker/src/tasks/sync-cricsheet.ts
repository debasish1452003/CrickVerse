import { getActiveScrapeSources, upsertScrapeSource } from "@crickverse/db";
import { createLogger } from "../logger";
import { fetchCricsheetFeed, type FetchFeedResult } from "../cricsheet/fetch-feed";
import { DEFAULT_SEED_FEEDS, resolveFeed } from "../cricsheet/feeds";

export const CRICSHEET_PAGE_TYPE = "cricsheet-feed";

export interface SyncCricsheetInput {
  /** Limit to one feed key; omit to sync every active cricsheet-feed source. */
  feedKey?: string;
  force?: boolean;
  revisionSweep?: boolean;
  fromCache?: boolean;
  refreshRegister?: boolean;
  dryRun?: boolean;
}

/**
 * Sync Cricsheet archives: one conditional-download-and-ingest per active
 * cricsheet-feed ScrapeSource. This is the scheduled job behind the daily
 * CRICSHEET tick and the `cricsheet-sync` CLI command. Each feed updates its own
 * IngestState watermark, so a crash mid-run just resumes next tick.
 */
export async function syncCricsheet(input: SyncCricsheetInput = {}): Promise<FetchFeedResult[]> {
  const logger = createLogger("cricsheet-sync");
  const sources = (await getActiveScrapeSources()).filter(
    (s) => s.pageType === CRICSHEET_PAGE_TYPE && (!input.feedKey || s.slug === input.feedKey),
  );

  if (sources.length === 0) {
    logger.warn("no active cricsheet-feed sources — run `cricsheet-seed-feeds` first", {
      feedKey: input.feedKey,
    });
    return [];
  }

  const results: FetchFeedResult[] = [];
  for (const s of sources) {
    const file = s.objectId || resolveFeed(s.slug).file;
    logger.info(`syncing feed`, { feedKey: s.slug, file });
    const res = await fetchCricsheetFeed({
      feedKey: s.slug,
      file,
      logger,
      force: input.force,
      revisionSweep: input.revisionSweep,
      fromCache: input.fromCache,
      refreshRegister: input.refreshRegister,
      dryRun: input.dryRun,
    });
    results.push(res);
  }
  return results;
}

/**
 * Register cricsheet-feed ScrapeSource rows so the scheduler picks them up. With
 * no keys, seeds the sensible default set (recently-added + IPL). The archive
 * file name is stored in `objectId` so it can be corrected without a code change.
 */
export async function seedCricsheetFeeds(keys: string[] = []): Promise<void> {
  const logger = createLogger("cricsheet-seed");
  const wanted = keys.length ? keys : [...DEFAULT_SEED_FEEDS];
  for (const key of wanted) {
    const feed = resolveFeed(key);
    await upsertScrapeSource({
      pageType: CRICSHEET_PAGE_TYPE,
      slug: feed.key,
      objectId: feed.file,
      label: feed.label,
      mode: "HISTORICAL",
    });
    logger.info("seeded cricsheet feed", { feedKey: feed.key, file: feed.file });
  }
}
