import { createLogger } from "./logger";

// The long-running entry point. The cron scheduler (live + backfill ticks)
// lands in Phase 7; for now this documents how to run a one-shot crawl.
const logger = createLogger("main");

logger.info("CrickVerse worker is up. Scheduler arrives in Phase 7.");
logger.info("One-shot crawl: pnpm --filter @crickverse/worker run seed <slug> <objectId> [LIVE|HISTORICAL]");
