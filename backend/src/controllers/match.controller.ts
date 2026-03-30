import type { Request, Response } from "express";
import { redisClient } from "../config/redis.config.js";

export const getLiveMatches = async (req: Request, res: Response) => {
  try {
    // Read directly from Redis. This takes ~2ms instead of MongoDB's ~50ms.
    const cachedData = await redisClient.get("live_matches_cache");

    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }

    return res.status(200).json([]); // Return empty if cache is missing
  } catch (error) {
    console.error("Error fetching from cache:", error);
    res.status(500).json({ error: "Server Error" });
  }
};
