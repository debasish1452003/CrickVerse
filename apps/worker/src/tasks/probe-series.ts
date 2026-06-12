import {
  createHttpFetcher,
  getByPaths,
  seriesFixturesDescriptor,
} from "@crickverse/scraper-core";
import { config } from "../config";
import { createLogger } from "../logger";

/**
 * Fetch + parse a series-fixtures page against the LIVE site and print a
 * summary — no DB writes. Use it to validate a new series URL before adding it
 * as a ScrapeSource ("does this URL parse?").
 */
export async function probeSeries(input: { slug: string; objectId: string | number }): Promise<void> {
  const logger = createLogger("probe");
  const http = createHttpFetcher({
    concurrency: config.concurrency,
    minGapMs: config.minGapMs,
    maxRetries: config.maxRetries,
    logger,
  });

  const url = seriesFixturesDescriptor.buildUrl({ slug: input.slug, objectId: input.objectId });
  logger.info("fetching", { url });

  const { json } = await http(url, { pageType: "series-fixtures" });
  const content = getByPaths(json, seriesFixturesDescriptor.extractPaths);
  const parsed = seriesFixturesDescriptor.validate(
    seriesFixturesDescriptor.parse(content, { slug: input.slug, objectId: input.objectId }),
  );

  logger.info(`✅ parsed ${parsed.matches.length} matches`, { series: parsed.series.name });
  for (const m of parsed.matches.slice(0, 3)) {
    logger.info("sample match", {
      id: m.sourceMatchId,
      title: m.title,
      state: m.state,
      teams: m.teams.map((t) => t.shortName),
      status: m.statusText,
    });
  }
}
