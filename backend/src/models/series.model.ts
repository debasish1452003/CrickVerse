import mongoose from "mongoose";

const seriesSchema = new mongoose.Schema({
  seriesId: { type: Number, unique: true },
  name: String,
  season: String,
  startDate: Date,
  endDate: Date,
});

export const Series = mongoose.model("Series", seriesSchema);
