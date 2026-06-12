import type { ParsedScorecard, ParsedSeriesFixtures } from "@crickverse/types";
import { Source } from "@prisma/client";
import { upsertSeriesFixtures } from "./repositories/match.repo";
import { upsertScorecard } from "./repositories/scorecard.repo";

/**
 * Dispatch normalized entities from the scraper engine to the right repository.
 * This is the function the worker injects as scraper-core's `persist`.
 */
export async function persistEntities(
  pageType: string,
  entities: unknown,
  source: Source = Source.CRICINFO,
): Promise<void> {
  switch (pageType) {
    case "series-fixtures":
      await upsertSeriesFixtures(entities as ParsedSeriesFixtures, source);
      return;
    case "scorecard":
      await upsertScorecard(entities as ParsedScorecard, source);
      return;
    case "player-profile":
      // Enabled in Phase 7 (needs a confirmed player payload shape).
      return;
    default:
      throw new Error(`No persister registered for page type "${pageType}"`);
  }
}
