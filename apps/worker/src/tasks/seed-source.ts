import type { CrawlMode } from "@crickverse/types";
import { runCrawl } from "../crawl-engine";
import { createLogger } from "../logger";

export interface SeedSourceInput {
  slug: string;
  objectId: string | number;
  mode?: CrawlMode;
}

/**
 * One-shot crawl from a seed series-fixtures page. HISTORICAL fans out to every
 * match's scorecard; LIVE only re-scrapes in-progress matches.
 */
export async function seedSource(
  input: SeedSourceInput,
): Promise<{ processed: number; errors: number }> {
  return runCrawl(
    { slug: input.slug, objectId: input.objectId, mode: input.mode ?? "HISTORICAL" },
    createLogger("seed"),
  );
}
