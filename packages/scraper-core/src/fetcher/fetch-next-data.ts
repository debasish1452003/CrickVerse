import axios, { type AxiosResponse } from "axios";
import PQueue from "p-queue";
import pRetry, { AbortError } from "p-retry";
import { NextDataMissingError } from "../errors";
import type { Fetcher, FetchResult, Logger } from "../types";
import { extractNextData } from "./extract";
import { pickUserAgent } from "./user-agents";

export interface HttpFetcherOptions {
  /** Max concurrent outbound requests. Default 2. */
  concurrency?: number;
  /** Minimum gap between requests (rate limit), in ms. Default 1000. */
  minGapMs?: number;
  /** Retry attempts for transient failures. Default 4. */
  maxRetries?: number;
  /** Per-request timeout, in ms. Default 15000. */
  timeoutMs?: number;
  logger?: Logger;
}

/** Full browser-like header set proven to pass ESPNCricinfo's WAF. */
function buildHeaders(): Record<string, string> {
  return {
    "User-Agent": pickUserAgent(),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
    Referer: "https://www.google.com/",
  };
}

function retryAfterMs(res: AxiosResponse | undefined): number | null {
  const header = res?.headers?.["retry-after"];
  if (!header) return null;
  const secs = Number(header);
  return Number.isFinite(secs) ? secs * 1000 : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Create a polite, hardened ESPNCricinfo fetcher:
 *  - one shared p-queue rate-limits ALL outbound requests (concurrency + min gap),
 *  - p-retry handles transient (429/5xx/network) failures with exponential backoff,
 *  - 4xx and a missing __NEXT_DATA__ are structural -> not retried (surfaced loudly).
 *
 * Caching (RawSnapshot) is layered on top by the worker; this fetcher always hits
 * the network. `forceRefetch` is therefore a no-op here and honored by the cache wrapper.
 */
export function createHttpFetcher(opts: HttpFetcherOptions = {}): Fetcher {
  const {
    concurrency = 2,
    minGapMs = 1000,
    maxRetries = 4,
    timeoutMs = 15_000,
    logger,
  } = opts;

  const queue = new PQueue({ concurrency, interval: minGapMs, intervalCap: 1 });

  return async (url) => {
    const run = async (): Promise<FetchResult> => {
      const json = await pRetry(
        async () => {
          let res: AxiosResponse<string>;
          try {
            res = await axios.get<string>(url, {
              timeout: timeoutMs,
              maxRedirects: 3,
              responseType: "text",
              headers: buildHeaders(),
              // Accept 4xx so we can decide retry vs abort ourselves.
              validateStatus: (s) => s >= 200 && s < 500,
            });
          } catch (err) {
            // Network/timeout — transient, let p-retry back off.
            throw err instanceof Error ? err : new Error(String(err));
          }

          if (res.status === 429) {
            const wait = retryAfterMs(res);
            if (wait) await sleep(wait);
            throw new Error(`HTTP 429 (rate limited) for ${url}`);
          }
          if (res.status >= 400) {
            // 403/404/etc — structural; do not retry.
            throw new AbortError(`HTTP ${res.status} for ${url}`);
          }

          try {
            return extractNextData(res.data, url);
          } catch (err) {
            if (err instanceof NextDataMissingError) throw new AbortError(err);
            throw err;
          }
        },
        {
          retries: maxRetries,
          factor: 2,
          minTimeout: 1000,
          maxTimeout: 30_000,
          randomize: true,
          onFailedAttempt: (e) =>
            logger?.warn(`fetch attempt ${e.attemptNumber} failed`, {
              url,
              message: e.message,
              retriesLeft: e.retriesLeft,
            }),
        },
      );

      return { url, json, fromCache: false, fetchedAt: new Date(), httpStatus: 200 };
    };

    const result = await queue.add(run, { throwOnTimeout: true });
    return result as FetchResult;
  };
}
