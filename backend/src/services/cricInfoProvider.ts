import axios from "axios";
import * as cheerio from "cheerio";
import type { MatchProvider, Match } from "../interfaces/MatchProvider.js";

export class CricinfoProvider implements MatchProvider {
  private readonly LIVE_URL = "https://www.espncricinfo.com/live-cricket-score";

  async fetchLiveScores(): Promise<Match[]> {
    try {
      const { data } = await axios.get(this.LIVE_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Connection: "keep-alive",
          "Cache-Control": "max-age=0",
        },
      });

      const $ = cheerio.load(data);
      const nextDataStr = $("#__NEXT_DATA__").html();

      if (!nextDataStr) return [];

      const jsonData = JSON.parse(nextDataStr);
      const matchesData =
        jsonData?.props?.appPageProps?.data?.content?.matches || [];

      return matchesData
        .filter((m: any) => m.series?.longName === "Indian Premier League")
        .map(
          (m: any): Match => ({
            matchId: m.id,
            seriesName: m.series?.longName,
            matchTitle: m.title,
            status: m.statusText,
            team1: {
              name: m.teams?.[0]?.team?.longName,
              score: m.teams?.[0]?.score || "",
            },
            team2: {
              name: m.teams?.[1]?.team?.longName,
              score: m.teams?.[1]?.score || "",
            },
          }),
        );
    } catch (error) {
      console.error("❌ Scraping failed", error);
      return [];
    }
  }
}
