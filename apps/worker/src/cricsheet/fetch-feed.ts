import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  findExistingCricsheetMatches,
  getIngestState,
  updateIngestState,
  upsertCricsheetMatch,
  type PeopleIndex,
} from "@crickverse/db";
import { parseCricsheetMatch } from "@crickverse/scraper-core";
import type { Logger } from "@crickverse/scraper-core";
import { loadPeopleIndex } from "./people-index";
import { feedUrl } from "./feeds";
import { collectJsonEntries, openZip, readEntryFromZip } from "./zip-reader";

const ZIP_CACHE_DIR = join(process.cwd(), ".cache", "cricsheet");

export interface FetchFeedInput {
  /** Stable feed key (ScrapeSource.slug + IngestState.feedKey). */
  feedKey: string;
  /** Archive file name or absolute URL. */
  file: string;
  logger: Logger;
  /** Ignore the stored ETag/Last-Modified and re-download. */
  force?: boolean;
  /**
   * Also decompress matches already in the DB and re-ingest any whose Cricsheet
   * `meta.revision` has risen since last time (catches corrected files). Off by
   * default — the daily run only touches genuinely new matches.
   */
  revisionSweep?: boolean;
  /** Re-parse the locally cached zip (no network); re-ingests every match. */
  fromCache?: boolean;
  /** Force a fresh people.csv download regardless of its on-disk age. */
  refreshRegister?: boolean;
  /**
   * Download + unzip + decide what's new, but ingest nothing and don't advance
   * the watermark. Use to validate a feed (URL, zip, skip-known) before committing
   * to a long ingest. `wouldIngest` in the result is the count it would have written.
   */
  dryRun?: boolean;
}

export interface FetchFeedResult {
  feedKey: string;
  status: "ok" | "not-modified" | "error";
  totalInZip: number;
  ingested: number;
  skipped: number;
  deliveries: number;
  errors: number;
  /** Matches a non-dry run would have ingested (== ingested on a real run). */
  wouldIngest: number;
}

/**
 * One incremental sync of a Cricsheet archive. The four wins that make this
 * "fetch what's new" rather than "re-download everything":
 *  1. conditional GET (If-None-Match / If-Modified-Since) → HTTP 304 on a no-change
 *     day downloads zero bytes and returns immediately;
 *  2. the zip is streamed entry-by-entry (yauzl, lazyEntries) — no extraction to
 *     disk, and never more than one match's JSON decompressed at a time;
 *  3. skip-known: each entry's file name IS the match id, so already-ingested
 *     matches are skipped without decompressing (and, under revisionSweep, only
 *     re-ingested when their revision rises);
 *  4. an IngestState watermark per feed holds the validators + counters, making
 *     the whole thing resumable and self-updating.
 *
 * Requires DATABASE_URL on the Neon DIRECT host (bulk Delivery writes stall on
 * the PgBouncer endpoint).
 */
export async function fetchCricsheetFeed(input: FetchFeedInput): Promise<FetchFeedResult> {
  const { feedKey, logger } = input;
  const url = feedUrl(input.file);
  const cachePath = join(ZIP_CACHE_DIR, `${feedKey}.zip`);

  // ── 1. Acquire the zip bytes (cache, or conditional download) ──────────────
  let buffer: Buffer;
  let newEtag: string | null = null;
  let newLastModified: string | null = null;

  if (input.fromCache) {
    if (!existsSync(cachePath)) {
      logger.warn("no cached zip to re-parse", { feedKey, cachePath });
      return zero(feedKey, "error");
    }
    buffer = readFileSync(cachePath);
    logger.info("re-parsing cached zip", { feedKey, bytes: buffer.length });
  } else {
    const prev = await getIngestState(feedKey);
    const headers: Record<string, string> = {};
    if (!input.force && prev?.etag) headers["If-None-Match"] = prev.etag;
    if (!input.force && prev?.lastModified) headers["If-Modified-Since"] = prev.lastModified;

    logger.info("conditional GET", { feedKey, url, conditional: Object.keys(headers).length > 0 });
    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("feed download failed", { feedKey, url, message });
      await updateIngestState(feedKey, {
        lastRunAt: new Date(),
        lastStatus: "error",
        lastError: message,
      });
      return zero(feedKey, "error");
    }

    if (res.status === 304) {
      logger.info("304 Not Modified — nothing new", { feedKey });
      await updateIngestState(feedKey, {
        lastRunAt: new Date(),
        lastStatus: "not-modified",
        lastError: null,
      });
      return zero(feedKey, "not-modified");
    }
    if (!res.ok) {
      const message = `HTTP ${res.status}`;
      logger.error("feed download failed", { feedKey, url, message });
      await updateIngestState(feedKey, {
        lastRunAt: new Date(),
        lastStatus: "error",
        lastError: message,
      });
      return zero(feedKey, "error");
    }

    newEtag = res.headers.get("etag");
    newLastModified = res.headers.get("last-modified");
    buffer = Buffer.from(await res.arrayBuffer());
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, buffer);
    logger.info("downloaded zip", { feedKey, bytes: buffer.length });
  }

  // ── 2. Enumerate entries (no decompression) ────────────────────────────────
  // fromBuffer is a random-access reader, so one open serves the whole run:
  // collect every entry first, then openReadStream the selected ones in any order.
  const zip = await openZip(buffer);
  const entries = await collectJsonEntries(zip);
  const ids = entries.map((e) => e.matchId);
  logger.info(`zip holds ${entries.length} match file(s)`, { feedKey });
  if (entries.length === 0) {
    zip.close();
    await updateIngestState(feedKey, {
      etag: newEtag,
      lastModified: newLastModified,
      lastRunAt: new Date(),
      lastStatus: "ok",
      lastError: null,
    });
    return { ...zero(feedKey, "ok"), totalInZip: 0 };
  }

  // ── 3. skip-known: decide which entries to decompress ───────────────────────
  const known = input.fromCache ? new Map<string, number>() : await findExistingCricsheetMatches(ids);
  const toProcess = entries.filter((e) => {
    if (input.fromCache) return true; // re-parse everything from cache
    if (!known.has(e.matchId)) return true; // brand new
    return input.revisionSweep; // known: only when sweeping for corrections
  });
  const preSkipped = entries.length - toProcess.length;
  logger.info(`processing ${toProcess.length}, skipping ${preSkipped} known`, { feedKey });

  if (input.dryRun) {
    zip.close();
    logger.info("dry run — ingesting nothing, watermark untouched", {
      feedKey,
      wouldIngest: toProcess.length,
      knownSkipped: preSkipped,
    });
    return {
      feedKey,
      status: "ok",
      totalInZip: entries.length,
      ingested: 0,
      skipped: preSkipped,
      deliveries: 0,
      errors: 0,
      wouldIngest: toProcess.length,
    };
  }

  if (toProcess.length === 0) {
    zip.close();
    await updateIngestState(feedKey, {
      etag: newEtag,
      lastModified: newLastModified,
      lastRunAt: new Date(),
      lastStatus: "ok",
      lastError: null,
      skippedDelta: preSkipped,
    });
    return { feedKey, status: "ok", totalInZip: entries.length, ingested: 0, skipped: preSkipped, deliveries: 0, errors: 0, wouldIngest: 0 };
  }

  // ── 4. Decompress + ingest only the needed entries ──────────────────────────
  const peopleIndex: PeopleIndex = await loadPeopleIndex({
    logger,
    forceRefresh: input.refreshRegister,
  });

  let ingested = 0;
  let skipped = preSkipped;
  let deliveries = 0;
  let errors = 0;
  for (const e of toProcess) {
    try {
      const raw = JSON.parse((await readEntryFromZip(zip, e.entry)).toString("utf8")) as unknown;
      const parsed = parseCricsheetMatch(raw, e.matchId);
      // Under a revision sweep we decompressed a known match only to check it.
      const prevRevision = known.get(e.matchId);
      if (prevRevision != null && parsed.revision <= prevRevision) {
        skipped += 1;
        continue;
      }
      const res = await upsertCricsheetMatch(parsed, peopleIndex);
      ingested += 1;
      deliveries += res.deliveries;
      if (ingested % 25 === 0) logger.info(`progress: ${ingested}/${toProcess.length} ingested`, { feedKey });
    } catch (err) {
      errors += 1;
      logger.error(`failed to ingest ${e.matchId}`, {
        feedKey,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  zip.close();
  await updateIngestState(feedKey, {
    etag: newEtag,
    lastModified: newLastModified,
    lastRunAt: new Date(),
    lastStatus: "ok",
    lastError: null,
    ingestedDelta: ingested,
    skippedDelta: skipped,
  });

  logger.info("✅ feed sync done", { feedKey, ingested, skipped, deliveries, errors });
  return { feedKey, status: "ok", totalInZip: entries.length, ingested, skipped, deliveries, errors, wouldIngest: ingested };
}

function zero(feedKey: string, status: FetchFeedResult["status"]): FetchFeedResult {
  return { feedKey, status, totalInZip: 0, ingested: 0, skipped: 0, deliveries: 0, errors: 0, wouldIngest: 0 };
}
