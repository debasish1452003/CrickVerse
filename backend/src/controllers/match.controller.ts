import type { Request, Response } from "express";
import {
  fetchMatches,
  smartFetchMatches,
} from "../services/cricket.service.js";
import { Match } from "../models/match.model.js";
import { scrapeCricinfoLink } from "../services/scraper.services.js";

export const getMatches = async (req: Request, res: Response) => {
  try {
    // Grab the latest matches from your database
    const matches = await Match.find({});

    // Send them back to React!
    res.status(200).json(matches);
  } catch (error) {
    console.error("Error fetching matches:", error);
    res.status(500).json({ message: "Failed to fetch matches" });
  }
};

export const updateMatches = async () => {
  const data = await fetchMatches();

  for (const match of data.matches) {
    await Match.findOneAndUpdate(
      { matchId: match.id },
      {
        team1: match.team1,
        team2: match.team2,
        score: match.score,
        status: match.status,
        lastUpdated: new Date(),
      },
      {
        upsert: true,
      },
    );
  }
  console.log("✅ Matches updated in DB");
};

export const updateScrapedMatches = async () => {
  const matches = await scrapeCricinfoLink(
    "https://www.espncricinfo.com/live-cricket-score",
  );
  const iplData = await scrapeCricinfoLink(
    "https://www.espncricinfo.com/series/ipl-2026-1510719/match-schedule-fixtures-and-results",
  );

  for (const m of matches) {
    // Ensure we actually have data before updating
    if (!m.matchId) continue;

    await Match.findOneAndUpdate(
      { matchId: m.matchId }, // FIXED: Use actual matchId
      {
        seriesName: m.seriesName,
        matchTitle: m.matchTitle,
        status: m.status,
        team1: m.team1,
        team2: m.team2,
        lastUpdated: new Date(),
      },
      { upsert: true },
    );
  }
  console.log("✅ Scraped data stored");
  return matches;
};
