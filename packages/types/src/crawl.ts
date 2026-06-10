import { z } from "zod";

/**
 * Page types the scraper knows how to crawl. Adding a new ESPNCricinfo page
 * means adding one descriptor in scraper-core and one entry here.
 */
export const PAGE_TYPES = ["series-fixtures", "scorecard", "player-profile"] as const;
export const PageTypeSchema = z.enum(PAGE_TYPES);
export type PageType = (typeof PAGE_TYPES)[number];

/**
 * LIVE  = shallow, force-refetch in-progress matches, repeat until finished.
 * HISTORICAL = deep fan-out, cache-first, idempotent, resumable backfill.
 */
export const CRAWL_MODES = ["LIVE", "HISTORICAL"] as const;
export const CrawlModeSchema = z.enum(CRAWL_MODES);
export type CrawlMode = (typeof CRAWL_MODES)[number];

/**
 * A unit of scraping work. The engine fetches -> parses -> persists, then a
 * descriptor's `discover()` emits the next jobs (the crawl fan-out).
 */
export const CrawlJobSchema = z.object({
  pageType: PageTypeSchema,
  /** Descriptor-specific URL params, e.g. { slug, objectId } or { matchSlug, matchId, ... }. */
  params: z.record(z.string(), z.union([z.string(), z.number()])),
  mode: CrawlModeSchema,
  /** Fan-out depth guard (seed = 0). */
  depth: z.number().int().nonnegative().default(0),
  /** Human-readable provenance, e.g. "seed" | "discovered-from:scorecard". */
  reason: z.string().optional(),
  /** Bypass the snapshot cache (used for LIVE re-scrapes). */
  forceRefetch: z.boolean().optional(),
});
export type CrawlJob = z.infer<typeof CrawlJobSchema>;
