import type { IngestState } from "@prisma/client";
import { prisma } from "../client";

/**
 * Watermark/cursor for one incremental ingest feed (a Cricsheet archive). Stores
 * the conditional-GET validators so the next run can send If-None-Match /
 * If-Modified-Since and short-circuit on HTTP 304. `feedKey` is the
 * ScrapeSource.slug (e.g. "ipl", "recently").
 */
export function getIngestState(feedKey: string): Promise<IngestState | null> {
  return prisma.ingestState.findUnique({ where: { feedKey } });
}

export interface IngestStatePatch {
  etag?: string | null;
  lastModified?: string | null;
  lastRunAt?: Date;
  lastStatus?: string;
  lastError?: string | null;
  /** Added to the cumulative counters (not absolute). */
  ingestedDelta?: number;
  skippedDelta?: number;
}

/** Upsert a feed's watermark, incrementing the cumulative counters by the deltas. */
export async function updateIngestState(
  feedKey: string,
  patch: IngestStatePatch,
): Promise<IngestState> {
  const base = {
    etag: patch.etag,
    lastModified: patch.lastModified,
    lastRunAt: patch.lastRunAt,
    lastStatus: patch.lastStatus,
    lastError: patch.lastError,
  };
  return prisma.ingestState.upsert({
    where: { feedKey },
    create: {
      feedKey,
      ...base,
      matchesIngested: patch.ingestedDelta ?? 0,
      matchesSkipped: patch.skippedDelta ?? 0,
    },
    update: {
      ...base,
      matchesIngested: { increment: patch.ingestedDelta ?? 0 },
      matchesSkipped: { increment: patch.skippedDelta ?? 0 },
    },
  });
}
