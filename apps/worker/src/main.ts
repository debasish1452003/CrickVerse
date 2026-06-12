import { prisma } from "@crickverse/db";
import { createLogger } from "./logger";
import { startScheduler } from "./scheduler";

// Long-running entry point: start the cron scheduler and stay alive.
const logger = createLogger("main");
logger.info("CrickVerse worker starting…");

startScheduler();

async function shutdown(signal: string): Promise<void> {
  logger.info(`received ${signal}, shutting down`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
