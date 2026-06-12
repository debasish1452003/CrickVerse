import { createHash } from "node:crypto";
import { findFreshSnapshot, saveSnapshot } from "@crickverse/db";
import type { Fetcher, Logger } from "@crickverse/scraper-core";

export interface CachingFetcherOptions {
  /** Reuse a stored snapshot newer than this (ms). 0 disables caching. */
  ttlMs: number;
  logger?: Logger;
}

/**
 * Wrap the HTTP fetcher with a read-through RawSnapshot cache:
 *  - within TTL (and not forceRefetch) -> serve the stored payload, no network,
 *  - otherwise fetch, persist a new versioned snapshot, and return it.
 * This is what lets us re-parse / re-run without re-hitting ESPNCricinfo.
 */
export function createCachingFetcher(http: Fetcher, opts: CachingFetcherOptions): Fetcher {
  return async (url, requestOpts) => {
    const paramsHash = createHash("sha1").update(url).digest("hex");
    const ttl = requestOpts.forceRefetch ? 0 : opts.ttlMs;

    if (ttl > 0) {
      const fresh = await findFreshSnapshot(requestOpts.pageType, paramsHash, ttl);
      if (fresh) {
        opts.logger?.info("cache hit", { url });
        return {
          url,
          json: fresh.payload,
          fromCache: true,
          fetchedAt: fresh.fetchedAt,
          httpStatus: 200,
          snapshotId: fresh.id,
        };
      }
    }

    const res = await http(url, requestOpts);
    const snapshotId = await saveSnapshot({
      pageType: requestOpts.pageType,
      url,
      paramsHash,
      payload: res.json,
      httpStatus: res.httpStatus,
    });
    opts.logger?.info("fetched + cached", { url, snapshotId });
    return { ...res, snapshotId };
  };
}
