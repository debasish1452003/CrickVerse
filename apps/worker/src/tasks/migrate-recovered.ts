import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { prisma } from "@crickverse/db";
import { createLogger } from "../logger";
import { RecoveredAccumulator } from "../recovered-aggregate";

/**
 * One-time migration: fold the per-innings PlayerInningsHistory rows into compact
 * RecoveredCareerStat aggregates, then delete the innings to free ~200MB (the
 * post-2000 ones duplicate Cricsheet). Aggregates are backed up to disk before any
 * delete, so a failed DB insert can be retried without re-scraping.
 */
export async function migrateRecoveredAggregate(): Promise<void> {
  const logger = createLogger("migrate-recovered");
  const acc = new RecoveredAccumulator();

  let cursor: string | undefined;
  let total = 0;
  for (;;) {
    const batch = await prisma.playerInningsHistory.findMany({
      take: 20000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true, cricinfoId: true, matchClass: true, source: true, discipline: true,
        matchDate: true, opposition: true, ground: true, didBat: true, runs: true,
        notOut: true, ballsFaced: true, fours: true, sixes: true,
        ballsBowled: true, runsConceded: true, wickets: true,
      },
    });
    if (batch.length === 0) break;
    for (const r of batch) acc.add(r);
    cursor = batch[batch.length - 1]!.id;
    total += batch.length;
    if (total % 100000 === 0) logger.info("read", { innings: total });
  }

  const aggs = acc.results();
  logger.info("aggregated", { inningsRead: total, aggregateRows: aggs.length });

  // Back up to disk BEFORE deleting anything.
  const backup = resolve(process.cwd(), "..", "..", "data", "recovery", "recovered-aggregates.json");
  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, JSON.stringify(aggs), "utf8");
  logger.info("backed up aggregates", { file: backup });

  // Delete innings in chunks to free space.
  let deleted = 0;
  for (;;) {
    const chunk = await prisma.playerInningsHistory.findMany({ take: 20000, select: { id: true } });
    if (chunk.length === 0) break;
    const res = await prisma.playerInningsHistory.deleteMany({ where: { id: { in: chunk.map((c) => c.id) } } });
    deleted += res.count;
    logger.info("deleted innings", { deleted });
  }

  // Reclaim space so the aggregate inserts reuse it rather than growing the DB.
  await prisma.$executeRawUnsafe('VACUUM "PlayerInningsHistory"');
  logger.info("vacuumed PlayerInningsHistory");

  // Insert aggregates (idempotent on the unique key).
  let written = 0;
  for (let i = 0; i < aggs.length; i += 1000) {
    const slice = aggs.slice(i, i + 1000);
    await prisma.recoveredCareerStat.createMany({
      data: slice.map(({ ...a }) => a),
      skipDuplicates: true,
    });
    written += slice.length;
  }
  logger.info("✅ migration complete", { inningsDeleted: deleted, aggregateRows: written });
}
