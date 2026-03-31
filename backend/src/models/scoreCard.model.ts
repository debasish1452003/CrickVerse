import mongoose from "mongoose";

const battingSchema = new mongoose.Schema(
  {
    playerId: Number,
    runs: Number,
    balls: Number,
    fours: Number,
    sixes: Number,
    strikeRate: Number,
  },
  { _id: false },
);

const bowlingSchema = new mongoose.Schema(
  {
    playerId: Number,
    overs: Number,
    runs: Number,
    wickets: Number,
    economy: Number,
  },
  { _id: false },
);

const inningsSchema = new mongoose.Schema(
  {
    teamId: Number,
    batting: [battingSchema],
    bowling: [bowlingSchema],
    totalRuns: Number,
    wickets: Number,
    overs: Number,
  },
  { _id: false },
);

const scorecardSchema = new mongoose.Schema({
  matchId: Number,
  innings: [inningsSchema],
});

export const Scorecard = mongoose.model("Scorecard", scorecardSchema);
