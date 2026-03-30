import mongoose, { mongo } from "mongoose";

const matchSchema = new mongoose.Schema({
  matchId: { type: String, unique: true },
  team1: String,
  team2: String,
  score: String,
  status: String,
  lastUpdated: Date,
});

export const Match = mongoose.model("MatchModel", matchSchema);
