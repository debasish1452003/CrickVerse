import dotenv from "dotenv";
dotenv.config();
export const PORT = process.env.PORT || 5000;
export const MONGO_URI = process.env.MONGO_URI!;
export const API_KEY = process.env.CRICKET_API_KEY!;
export const BASE_URL = "https://api.cricketdata.org";
export const API_CALL_DELAY = 2;
