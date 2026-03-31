import type { Request, Response } from "express";
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

export const updateScrapedMatches = async () => {
  const iplData = await scrapeCricinfoLink(
    "https://www.espncricinfo.com/series/ipl-2026-1510719/match-schedule-fixtures-and-results",
  );

  for (const m of iplData) {
    if (!m.matchId) continue;

    await Match.findOneAndUpdate(
      { matchId: Number(m.matchId) },

      {
        matchId: Number(m.matchId),
        objectId: m.objectId,
        slug: m.slug,

        series: {
          id: m.series?.id,
          objectId: m.series?.objectId,
          slug: m.series?.slug,
          name: m.series?.name,
        },
        seriesId: m.series?.id,
        season: m.season,
        title: m.title,
        format: m.format,

        startTime: m.startTime,
        dayNight: m.dayNight,

        venue: {
          name: m.venue?.name,
          city: m.venue?.city,
          country: m.venue?.country,
        },

        teams: [
          {
            teamId: m.teams?.[0]?.id,
            name: m.teams?.[0]?.name,
            score: m.teams?.[0]?.score,
          },
          {
            teamId: m.teams?.[1]?.id,
            name: m.teams?.[1]?.name,
            score: m.teams?.[1]?.score,
          },
        ],

        result: {
          winnerTeamId: m.result?.winner,
          tossWinnerTeamId: m.result?.tossWinner,
          tossDecision: m.result?.tossDecision,
          status: m.result?.status,
        },

        flags: {
          hasScorecard: m.hasScorecard,
          hasCommentary: m.hasCommentary,
        },

        lastUpdated: new Date(),
      },

      { upsert: true, new: true },
    );
  }

  console.log("✅ Matches stored in DB");

  return iplData;
};
