import cron from "node-cron";
import { updateScrapedMatches } from "../controllers/match.controller.js";

export const startScraper = () => {
  console.log("🚀 Scraper initialized..."); // check startup

  //   cron.schedule("0 0 * * *", async () => {
  cron.schedule("*/10 * * * * * ", async () => {
    console.log("🕷️ Scraping started at:", new Date());

    try {
      const data = await updateScrapedMatches();

      console.log("✅ Scraping finished");
      console.log("📦 Data:", data); // print fetched data
    } catch (err) {
      console.error("❌ Scraping error:", err);
    }
  });
};
