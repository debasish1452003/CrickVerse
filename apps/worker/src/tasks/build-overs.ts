import { join, resolve } from "node:path";
import type { Prisma } from "@crickverse/db";
import { prisma } from "@crickverse/db";
import { computeInningsOvers } from "@crickverse/lakehouse";
import { createLogger } from "../logger";

const LAKEHOUSE_DIR = process.env.LAKEHOUSE_DIR ?? resolve(process.cwd(), "..", "..", "data", "lakehouse");

/**
 * Build the per-innings over-by-over rollup (InningsOvers) from the silver
 * Parquet. DuckDB folds the 11.2M balls into ~49k innings rows locally; we then
 * truncate + bulk-insert them into Neon via Prisma createMany (clean jsonb).
 * Powers the match page's worm/Manhattan charts + over panel.
 */
export async function buildOversTask(): Promise<void> {
  const logger = createLogger("build-overs");
  const silverDir = join(LAKEHOUSE_DIR, "silver");

  const rows = await computeInningsOvers({ silverDir, log: (m) => logger.info(m) });

  logger.info("writing InningsOvers → Neon (truncate + insert)…", { rows: rows.length });
  await prisma.inningsOvers.deleteMany({});

  const data: Prisma.InningsOversCreateManyInput[] = rows.map((r) => ({
    matchId: r.matchId,
    inningsNo: r.inningsNo,
    overs: r.overs as unknown as Prisma.InputJsonValue,
  }));

  let written = 0;
  for (let i = 0; i < data.length; i += 1000) {
    const chunk = data.slice(i, i + 1000);
    await prisma.inningsOvers.createMany({ data: chunk, skipDuplicates: true });
    written += chunk.length;
    if (i % 10000 === 0) logger.info("progress", { written, total: data.length });
  }
  logger.info("✅ overs build done", { written });
}
