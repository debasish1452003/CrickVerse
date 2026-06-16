import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildMlFeatures } from "@crickverse/lakehouse";
import { createLogger } from "../logger";

const LAKEHOUSE_DIR = process.env.LAKEHOUSE_DIR ?? resolve(process.cwd(), "..", "..", "data", "lakehouse");
const FEATURES_VERSION = "ml-features-v1";

export interface BuildMlFeaturesTaskInput {
  /** Output root (defaults to <lakehouse>/ml/features). */
  outDir?: string;
}

/**
 * Build the versioned ML training corpus from the silver ball-by-ball Parquet.
 * Pure local disk (DuckDB) — no Neon, no network. Writes a manifest beside the
 * Parquet so each build is traceable (row count, classes, parser version, time).
 * Requires the silver export to have run first (`cricsheet-export-parquet`).
 */
export async function buildMlFeaturesTask(input: BuildMlFeaturesTaskInput = {}): Promise<void> {
  const logger = createLogger("build-ml-features");
  const silverDir = join(LAKEHOUSE_DIR, "silver");
  const outDir = input.outDir ?? join(LAKEHOUSE_DIR, "ml", "features");
  logger.info("ML feature build starting", { silverDir, outDir });

  const result = await buildMlFeatures({ silverDir, outDir, log: (m) => logger.info(m) });

  const manifest = {
    version: FEATURES_VERSION,
    builtAt: new Date().toISOString(),
    rows: result.rows,
    classes: result.classes,
    grain: "ball-by-ball",
    note: "Ball-level features only. Scorecard-level historical innings live in silver/player_innings.parquet (tier=scorecard).",
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "_manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  logger.info("✅ ML features done", manifest);
}
