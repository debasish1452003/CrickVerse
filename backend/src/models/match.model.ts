// import mongoose from "mongoose";

// const teamSchema = new mongoose.Schema(
//   {
//     name: String,
//     score: String,
//   },
//   { _id: false },
// );

// const matchSchema = new mongoose.Schema({
//   matchId: { type: String, unique: true },
//   seriesName: String,
//   matchTitle: String,
//   status: String,
//   team1: teamSchema,
//   team2: teamSchema,
//   lastUpdated: { type: Date, default: Date.now },
// });

// export const Match = mongoose.model("Match", matchSchema);

import mongoose from "mongoose";

const teamInMatchSchema = new mongoose.Schema(
  {
    teamId: Number,
    name: String,
    score: String,
  },
  { _id: false },
);

const matchSchema = new mongoose.Schema({
  matchId: { type: Number, unique: true },

  seriesId: Number,
  season: String,

  title: String,
  format: String,

  startTime: Date,
  dayNight: String,

  venue: {
    venueId: Number,
    name: String,
    city: String,
    country: String,
  },

  teams: [teamInMatchSchema],

  result: {
    winnerTeamId: Number,
    tossWinnerTeamId: Number,
    tossDecision: Number,
    status: String,
  },

  flags: {
    hasScorecard: Boolean,
    hasCommentary: Boolean,
  },

  lastUpdated: { type: Date, default: Date.now },
});

export const Match = mongoose.model("Match", matchSchema);
