import mongoose from "mongoose";

const playerSchema = new mongoose.Schema({
  playerId: { type: Number, unique: true },
  name: String,
  country: String,
  role: String,
  battingStyle: String,
  bowlingStyle: String,
});

export const Player = mongoose.model("Player", playerSchema);
