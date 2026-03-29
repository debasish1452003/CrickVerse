import type { Request, Response } from "express";
import {
  fetchMatches,
  smartFetchMatches,
} from "../services/cricket.service.js";
import { Match } from "../models/match.model.js";
import { scrapeCricinfoLink } from "../services/scraper.services.js";

export const getMatches = async (req: Request, res: Response) => {
  try {
    await smartFetchMatches(); // this controls API calls
    const matches = await Match.find();
    res.json(matches);
  } catch (err) {
    res.status(500).json({ message: "API failed" });
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
    await Match.findOneAndUpdate(
      { matchId: m.teams }, // Note: Using m.teams as matchId might cause issues if team names change slightly, but it works for now.
      {
        team1: m.teams,
        score: m.score,
        lastUpdated: new Date(),
      },
      { upsert: true },
    );
  }
  console.log("✅ Scraped data stored");

  // ADD THIS LINE to pass the data back to startScraper
  return matches;
};
