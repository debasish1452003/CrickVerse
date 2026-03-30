import { Queue, Worker } from "bullmq";
import { redisClient } from "../config/redis.config.js";
import { CricinfoProvider } from "../services/cricInfoProvider.js";
import { Match } from "../models/match.model.js";
import { io } from "../server.js";

// 1. Setup the Queue
export const matchQueue = new Queue("live-matches", {
  connection: redisClient,
});

const provider = new CricinfoProvider();

// CHANGE: Made this async so we can await the cleanup
export const startWorker = async () => {
  console.log("🧹 Cleaning up old ghost jobs from Redis...");
  // FIX 1: Obliterate old jobs on startup so we only ever have ONE timer running
  await matchQueue.obliterate({ force: true });

  new Worker(
    "live-matches",
    async (job) => {
      console.log(`\n🕷️ Scraping job started...`);

      const matches = await provider.fetchLiveScores();

      // FIX 2: Stop failing silently! Tell us what happened.
      if (matches.length === 0) {
        console.log("⚠️ Scraper returned 0 matches.");
        console.log(
          "👉 Check 1: Are there actually any IPL matches live right now?",
        );
        console.log("👉 Check 2: Did ESPNcricinfo WAF block the request?");
        return;
      }

      console.log(`🏏 Found ${matches.length} active matches! Saving...`);
      if (matches.length > 0) {
        console.log(matches);
      }

      for (const m of matches) {
        await Match.findOneAndUpdate({ matchId: m.matchId }, m, {
          upsert: true,
        });
      }

      await redisClient.set("live_matches_cache", JSON.stringify(matches));
      io.emit("matches_updated", matches);

      console.log("✅ Data cached and broadcasted to React.");
    },
    { connection: redisClient },
  );

  // FIX 3: Added a specific jobId to prevent accidental duplicates
  matchQueue.add(
    "scrape",
    {},
    {
      repeat: { every: 30000 },
      jobId: "unique-live-scraper",
    },
  );
};
