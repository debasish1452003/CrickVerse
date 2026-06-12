import axios from "axios";
import * as cheerio from "cheerio";
import * as fs from "fs";
import { CricinfoUrls } from "../utils/url.builder.js";
import { upsertMatches } from "./db/match.db.service.js";

// ============================================================================
// 1. GENERIC FETCHER
// Bypasses the WAF and extracts the raw Next.js JSON from ANY Cricinfo URL
// ============================================================================
export const fetchCricinfoJSON = async (url: string) => {
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
      },
    });

    const $ = cheerio.load(data);
    const nextDataStr = $("#__NEXT_DATA__").html();

    if (!nextDataStr)
      throw new Error("No __NEXT_DATA__ found. Blocked by WAF?");

    return JSON.parse(nextDataStr);
  } catch (error) {
    console.error(`❌ Failed to fetch JSON for ${url}`, error);
    return null;
  }
};

// Parser B: For a Specific Series "Fixtures & Results" page
// export const parseSeriesFixtures = (jsonData: any) => {
//   // 🐛 We don't know the exact path for this page yet!
//   // Dump the JSON to the hard drive so you can inspect it.
//   fs.writeFileSync("fixtures_dump.json", JSON.stringify(jsonData, null, 2));
//   console.log("📁 Saved Series JSON tree to fixtures_dump.json.");
//   console.log(
//     "🔍 Open it and search for 'matches' or a specific team name to find the new array path!",
//   );

//   // Return empty array for now until we write the mapping logic
//   return jsonData;
// };

export const parseSeriesFixtures = (jsonData: any) => {
  // 1. Find the array (with a fallback path just in case Next.js changes its mind)
  const matchesData: any[] =
    jsonData?.props?.appPageProps?.data?.content?.matches ||
    jsonData?.props?.pageProps?.appPageProps?.data?.content?.matches ||
    [];

  console.log(
    `📅 Extracted ${matchesData.length} matches from the Fixtures page.`,
  );

  return matchesData.map((m) => {
    const [t1, t2] = m.teams || [];

    return {
      // 🔹 Match Info
      matchId: m.objectId,
      objectId: m.objectId,
      slug: m.slug,

      title: m.title,
      format: m.format,
      season: m.season,

      // 🔹 Series
      series: {
        id: m.series?.id,
        objectId: m.series?.objectId,
        slug: m.series?.slug,
        name: m.series?.name,
      },

      // 🔹 Time
      startTime: m.startTime,
      dayNight: m.floodlit,

      // 🔹 Venue
      venue: {
        name: m.ground?.name,
        city: m.ground?.town?.name,
        country: m.ground?.country?.name,
        capacity: m.ground?.capacity,
      },

      // 🔹 Teams
      teams: [
        {
          id: t1?.team?.objectId,
          name: t1?.team?.longName,
          score: t1?.score,
        },
        {
          id: t2?.team?.objectId,
          name: t2?.team?.longName,
          score: t2?.score,
        },
      ],

      // 🔹 Result
      result: {
        winner: m.winnerTeamId,
        tossWinner: m.tossWinnerTeamId,
        tossDecision: m.tossWinnerChoice,
        status: m.statusText,
      },

      // 🔹 Flags
      hasScorecard: m.hasScorecard,
      hasCommentary: m.hasCommentary,
    };
  });
};

export const scrapeAndStoreSeries = async (
  slug: string,
  id: string | number,
) => {
  try {
    const url = CricinfoUrls.seriesFixtures(slug, String(id));

    console.log("📡 Scraping:", url);

    const rawJson = await fetchCricinfoJSON(url);
    if (!rawJson) return;

    const matches = parseSeriesFixtures(rawJson);

    if (!matches.length) {
      console.log("⚠️ No matches parsed");
      return;
    }

    await upsertMatches(matches);

    console.log("✅ Series synced successfully");
  } catch (err) {
    console.error("❌ Scraper failed:", err);
  }
};
