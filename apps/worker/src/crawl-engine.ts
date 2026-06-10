import { persistEntities } from "@crickverse/db";
import {
  ScrapeEngine,
  createDefaultRegistry,
  createHttpFetcher,
  type Fetcher,
  type Logger,
  type Persister,
} from "@crickverse/scraper-core";
import type { CrawlJob, CrawlMode } from "@crickverse/types";
import { createCachingFetcher } from "./cache/caching-fetcher";
import { config } from "./config";
import { CrawlRunner } from "./runner";

/** Wire a rate-limited + snapshot-cached fetcher, persistence, and the engine. */
export function buildCrawl(logger: Logger): { engine: ScrapeEngine; runner: CrawlRunner } {
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
  return { engine, runner };
}

export interface RunCrawlInput {
  slug: string;
  objectId: string | number;
  mode: CrawlMode;
}

/**
 * Crawl one series from its fixtures page until the in-process queue drains.
 * A fresh runner per call means LIVE ticks re-scrape in-progress matches each
 * time (no cross-tick dedupe), while the shared fetcher stays polite.
 */
export async function runCrawl(
  input: RunCrawlInput,
  logger: Logger,
): Promise<{ processed: number; errors: number }> {
  const { engine, runner } = buildCrawl(logger);
  const job: CrawlJob = {
    pageType: "series-fixtures",
    params: { slug: input.slug, objectId: input.objectId },
    mode: input.mode,
    depth: 0,
    reason: "seed",
    // LIVE always refetches the fixtures page (it carries the changing scores).
    forceRefetch: input.mode === "LIVE",
  };
  logger.info(`crawl ${input.slug}-${input.objectId}`, { mode: input.mode });
  runner.enqueue([job]);
  const result = await runner.drain(engine);
  logger.info("crawl complete", result);
  return result;
}
