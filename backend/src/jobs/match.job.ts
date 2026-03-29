import cron from "node-cron";
import { fetchMatches } from "../services/cricket.service.js";

export const startMatchPolling = () => {
  cron.schedule("0 0 */2 * *", async () => {
    console.log("⏳ Fetching matches...");
    const data = await fetchMatches();
  });
};
