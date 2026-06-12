import cron from "node-cron";
import {
  syncSeries,
  syncPendingScorecards,
} from "../services/scraper/orchestrator.service.js";

export const startScraper = () => {
  console.log("🚀 Scraper Job Engine Initialized...");

  // Sync current IPL dynamically every 10 minutes
  cron.schedule("*/10 * * * * *", async () => {
    console.log("🕷️ Starting Routine Scrape Run at:", new Date());
    try {
      // You can loop through an array of active series here!
      await syncSeries("ipl-2026", "1510719");
      await syncPendingScorecards();
      console.log("✅ Routine Scrape Completed.");
    } catch (err) {
      console.error("❌ Routine Scraping Failed:", err);
    }
  });

  // Example: Run historical scraping once a month at midnight
  // cron.schedule("0 0 1 * *", async () => {
  //   await syncSeries("world-cup-2023", "123456");
  // });
};
