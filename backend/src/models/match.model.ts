import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    name: String,
    score: String,
  },
  { _id: false },
);

const matchSchema = new mongoose.Schema({
  matchId: { type: String, unique: true },
  seriesName: String,
  matchTitle: String,
  status: String,
  team1: teamSchema,
  team2: teamSchema,
  lastUpdated: { type: Date, default: Date.now },
});

export const Match = mongoose.model("Match", matchSchema);
