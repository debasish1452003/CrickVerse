import { persistEntities } from "@crickverse/db";
import {
  ScrapeEngine,
  createDefaultRegistry,
  createHttpFetcher,
  type Fetcher,
  type Persister,
} from "@crickverse/scraper-core";
import type { CrawlJob, CrawlMode } from "@crickverse/types";
import { createCachingFetcher } from "../cache/caching-fetcher";
import { config } from "../config";
import { createLogger } from "../logger";
import { CrawlRunner } from "../runner";

export interface SeedSourceInput {
  slug: string;
  objectId: string | number;
  mode?: CrawlMode;
}

/**
 * Run one crawl from a seed series-fixtures page. In HISTORICAL mode this fans
 * out to every match's scorecard; in LIVE mode it only re-scrapes in-progress
 * matches. Drives the engine via the in-process runner until the queue empties.
 */
export async function seedSource(
  input: SeedSourceInput,
): Promise<{ processed: number; errors: number }> {
  const logger = createLogger("seed");
  const http = createHttpFetcher({
    concurrency: config.concurrency,
    minGapMs: config.minGapMs,
    maxRetries: config.maxRetries,
    logger,
  });
  const fetcher: Fetcher = createCachingFetcher(http, { ttlMs: config.cacheTtlMs, logger });
  const persist: Persister = (pageType, entities) => persistEntities(pageType, entities);
  const registry = createDefaultRegistry();
  const runner = new CrawlRunner(logger);
  const engine = new ScrapeEngine(registry, { fetcher, persist, enqueue: runner.enqueue, logger });

  const mode: CrawlMode = input.mode ?? "HISTORICAL";
  const seedJob: CrawlJob = {
    pageType: "series-fixtures",
    params: { slug: input.slug, objectId: input.objectId },
    mode,
    depth: 0,
    reason: "seed",
  };

  logger.info(`seeding ${input.slug}-${input.objectId}`, { mode });
  runner.enqueue([seedJob]);
  const result = await runner.drain(engine);
  logger.info("crawl complete", result);
  return result;
}
