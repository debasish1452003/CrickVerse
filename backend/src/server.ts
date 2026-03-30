import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors"; // 1. IMPORT CORS HERE
import "./config/redis.config.js";
import { startWorker } from "./jobs/match.worker.js";
import { getLiveMatches } from "./controllers/match.controller.js";

const app = express();
const server = http.createServer(app);

// 2. TELL EXPRESS TO USE CORS (This fixes your React Network Error!)
app.use(cors({ origin: "http://localhost:3000" }));

// Setup WebSockets for Real-Time data
export const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.json());

// Your blazing fast API endpoint
app.get("/api/matches", getLiveMatches);

const startServer = async () => {
  // Start the background BullMQ scraper
  startWorker();

  // 3. IMPORTANT: Make sure you use `server.listen`, not `app.listen` so WebSockets work too!
  server.listen(5000, () => {
    console.log("🚀 Enterprise Server running on port 5000");
  });
};

startServer();
