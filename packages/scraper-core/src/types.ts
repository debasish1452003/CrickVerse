import type { CrawlJob, CrawlMode, PageType } from "@crickverse/types";

export interface FetchResult {
  url: string;
  /** Parsed __NEXT_DATA__ JSON. */
  json: unknown;
  fromCache: boolean;
  fetchedAt: Date;
  httpStatus: number;
  /** Set by a caching fetcher once the raw payload is persisted. */
  snapshotId?: string;
}

export interface DiscoverContext {
  mode: CrawlMode;
  depth: number;
}

/**
 * One descriptor per ESPNCricinfo page type. This is the entire surface you
 * touch to add coverage: declare how to build the URL, where the JSON lives,
 * how to normalize it, and which follow-up URLs to crawl.
 */
export interface SourceDescriptor<
  Params extends Record<string, string | number> = Record<string, string | number>,
  Entities = unknown,
> {
  pageType: PageType;
  buildUrl(params: Params): string;
  /** Dot-paths into __NEXT_DATA__, tried in order (absorbs Next.js path drift). */
  extractPaths: string[];
  /** Map the extracted content slice into normalized entities. */
  parse(content: unknown, params: Params): Entities;
  /** Validate parsed entities (fail loud, e.g. Zod). Returns the validated value. */
  validate(entities: unknown): Entities;
  /** Emit follow-up crawl jobs (the fan-out). May return []. */
  discover(entities: Entities, ctx: DiscoverContext): CrawlJob[];
}

export type AnyDescriptor = SourceDescriptor<Record<string, string | number>, unknown>;

export interface Logger {
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

/** Fetches a URL and returns parsed __NEXT_DATA__. Caching/rate-limiting live behind this. */
export type Fetcher = (
  url: string,
  opts: { forceRefetch?: boolean; pageType: PageType },
) => Promise<FetchResult>;

/** Persists normalized entities for a page type (injected by the worker, backed by Prisma). */
export type Persister = (pageType: PageType, entities: unknown) => Promise<void>;

/** Enqueues discovered follow-up jobs (injected by the worker's queue). */
export type Enqueuer = (jobs: CrawlJob[]) => Promise<void> | void;

export interface EngineDeps {
  fetcher: Fetcher;
  persist: Persister;
  enqueue: Enqueuer;
  logger?: Logger;
}
