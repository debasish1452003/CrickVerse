import cron from "node-cron";
import { updateScrapedMatches } from "../controllers/match.controller.js";
import { Scorecard } from "../models/scoreCard.model.js";
import axios from "axios";
import * as cheerio from "cheerio";
import * as fs from "fs";

export const startScraper = () => {
  console.log("🚀 Scraper initialized..."); // check startup

  //   cron.schedule("0 0 * * *", async () => {
  // cron.schedule("*/10 * * * * * ", async () => {
  //   console.log("🕷️ Scraping started at:", new Date());

  //   try {
  //     const data = await updateScrapedMatches();

  //     console.log("✅ Scraping finished");
  //     console.log("📦 Data:", data?.[0]); // print fetched data
  //     return data;
  //   } catch (err) {
  //     console.error("❌ Scraping error:", err);
  //   }
  // });

  cron.schedule("*/10 * * * * *", async () => {
    console.log("🕷️ Scraping started at:", new Date());

    try {
      const matches = await updateScrapedMatches();

      // 🔥 NEW: scrape scorecards
      for (const m of matches) {
        if (!m.hasScorecard) continue;

        const url = buildScorecardUrl(m);

        const scorecard = await scrapeScorecard(m);

        if (scorecard) {
          await Scorecard.findOneAndUpdate({ matchId: m.matchId }, scorecard, {
            upsert: true,
          });
        }
      }

      console.log("✅ Full pipeline done");
    } catch (err) {
      console.error("❌ Scraping error:", err);
    }
  });
};

const buildScorecardUrl = (match: any) => {
  return `https://www.espncricinfo.com/series/${match.series.slug}-${match.series.objectId}/${match.slug}-${match.objectId}/full-scorecard`;
};

const scrapeScorecard = async (match: any) => {
  try {
    // 🔥 Build URL dynamically
    // const url = `https://www.espncricinfo.com/series/${match.series.slug}-${match.series.objectId}/${match.slug}-${match.objectId}/full-scorecard`;
    const url = buildScorecardUrl(match);

    console.log("📡 Scraping scorecard:", url);

    // 🔥 Fetch HTML
    const { data: html } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.google.com/",
      },
    });

    const $ = cheerio.load(html);

    // 🔥 Extract Next.js JSON
    const script = $("#__NEXT_DATA__").html();

    if (!script) {
      throw new Error("❌ Could not find __NEXT_DATA__ (blocked?)");
    }

    const json = JSON.parse(script);

    // 🔥 Navigate safely
    const content =
      json?.props?.appPageProps?.data?.content ||
      json?.props?.pageProps?.appPageProps?.data?.content;

    const inningsData =
      content?.scorecard?.innings ||
      content?.innings ||
      content?.match?.innings;

    if (!inningsData || inningsData.length === 0) {
      console.log("⚠️ No innings data found");

      // 🔥 DEBUG DUMP
      fs.writeFileSync(
        `debug_${match.matchId}.json`,
        JSON.stringify(json, null, 2),
      );

      return null;
    }

    // 🔥 Parse innings
    const innings = inningsData.map((inn: any) => {
      return {
        teamId: inn.team?.objectId,

        batting: (inn.batsmen || []).map((b: any) => ({
          playerId: b.batsman?.objectId,
          name: b.batsman?.longName,
          runs: Number(b.runs) || 0,
          balls: Number(b.balls) || 0,
          fours: Number(b.fours) || 0,
          sixes: Number(b.sixes) || 0,
          strikeRate: Number(b.strikeRate) || 0,
        })),

        bowling: (inn.bowlers || []).map((bw: any) => ({
          playerId: bw.bowler?.objectId,
          name: bw.bowler?.longName,
          overs: Number(bw.overs) || 0,
          runs: Number(bw.runs) || 0,
          wickets: Number(bw.wickets) || 0,
          economy: Number(bw.economy) || 0,
        })),

        totalRuns: inn.runs,
        wickets: inn.wickets,
        overs: inn.overs,
      };
    });

    // 🔥 Final structured object
    return {
      matchId: match.matchId,
      innings,
    };
  } catch (err: any) {
    console.error("❌ Scorecard scraping failed:", err.message);
    return null;
  }
};
