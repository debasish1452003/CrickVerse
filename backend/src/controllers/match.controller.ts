import type { Request, Response } from "express";
import { Match } from "../models/match.model.js";
import { scrapeAndStoreSeries } from "../services/scraper.services.js";

export const getMatches = async (req: Request, res: Response) => {
  try {
    // Add pagination or filtering queries here later
    const matches = await Match.find({}).sort({ startTime: 1 });
    res
      .status(200)
      .json({ success: true, count: matches.length, data: matches });
  } catch (error) {
    console.error("Error fetching matches:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch matches" });
  }
};

export const scrapeSeriesController = async (req: Request, res: Response) => {
  try {
    const { slug, id } = req.query;

    if (!slug || !id) {
      return res.status(400).json({
        success: false,
        message: "slug and id required",
      });
    }

    await scrapeAndStoreSeries(String(slug), String(id));

    res.json({
      success: true,
      message: "Scraping triggered successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Scraping failed",
    });
  }
};
