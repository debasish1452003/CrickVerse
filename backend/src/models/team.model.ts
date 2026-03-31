import mongoose from "mongoose";

const teamSchema = new mongoose.Schema({
  teamId: { type: Number, unique: true },
  name: String,
  shortName: String,
  country: String,
  primaryColor: String,
});

export const Team = mongoose.model("Team", teamSchema);
