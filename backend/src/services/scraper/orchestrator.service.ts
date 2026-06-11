import { CricinfoUrls } from "../../utils/url.builder.js";
import { fetchNextDataJson } from "../../utils/scraper.util.js";
import {
  parseSeriesFixtures,
  parseScorecard,
} from "../../parsers/match.parser.js";
import * as fs from "fs";
import {
  upsertMatches,
  upsertScorecard,
  getMatchesAwaitingScorecards,
} from "../db/match.db.service.js";

export const syncSeries = async (slug: string, id: string | number) => {
  const url = CricinfoUrls.seriesFixtures(slug, String(id));

  console.log("📡 Fetching series:", url);

  const rawJson = await fetchNextDataJson(url);
  if (!rawJson) return;

  const matches = parseSeriesFixtures(rawJson);

  console.log("🧪 Sample match:");
  console.log(JSON.stringify(matches[0], null, 2));

  await upsertMatches(matches);
};

export const syncPendingScorecards = async () => {
  console.log("🔍 Fetching matches...");
  const matches = await getMatchesAwaitingScorecards();

  console.log(`📦 Matches found: ${matches.length}`);

  for (const m of matches as any[]) {
    const url = CricinfoUrls.scorecard(
      m.series.slug,
      String(m.series.objectId),
      m.slug,
      String(m.matchId),
    );

    console.log(`📡 Scraping: ${url}`);

    const rawJson = await fetchNextDataJson(url);
    if (!rawJson) continue;

    const scorecardData = parseScorecard(m.matchId, rawJson);
    if (!scorecardData) continue;

    await upsertScorecard(scorecardData);

    console.log(`✅ Done: ${m.matchId}`);
  }
};
