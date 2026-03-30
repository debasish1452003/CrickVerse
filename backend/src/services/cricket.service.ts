import axios from "axios";
import { API_CALL_DELAY, API_KEY, BASE_URL } from "../config/env.js";
import { Match } from "../models/match.model.js";

export const fetchMatches = async () => {
  const res = await axios.get(`${BASE_URL}/matches?apikey=${API_KEY}`);
  return res.data;
};

export const smartFetchMatches = async () => {
  const latest = await Match.findOne().sort({ lastUpdated: -1 });
  const now = new Date();

  if (
    !latest ||
    now.getTime() - new Date(latest.lastUpdated!).getTime() >
      API_CALL_DELAY * 24 * 60 * 60 * 1000
  ) {
    console.log("📡 Calling API...");
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
        { upsert: true },
      );
    }
    return "API Called and DB Updated";
  }
  return "Using cached DB data";
};
