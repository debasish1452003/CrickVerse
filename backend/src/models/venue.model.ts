import mongoose from "mongoose";

const venueSchema = new mongoose.Schema({
  venueId: Number,
  name: String,
  city: String,
  country: String,
  capacity: Number,
});

export const Venue = mongoose.model("Venue", venueSchema);
