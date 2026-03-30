import { Redis } from "ioredis";

export const redisClient = new Redis({
  host: "sensible-bluejay-72571.upstash.io", // Your exact Upstash host
  port: 6379,
  password:
    "gQAAAAAAARt7AAIncDJiNDc0MDYzNzc2Nzg0NTgyYTVlNjBhYjBhMDZiMDk2ZHAyNzI1NzE", // Replace with your actual token
  tls: {}, // CRITICAL: Upstash requires secure TLS
  maxRetriesPerRequest: null, // CRITICAL: Required for BullMQ
});

redisClient.on("error", (err) => console.error("❌ Redis Client Error:", err));
redisClient.on("connect", () => console.log("✅ Redis connected successfully"));
