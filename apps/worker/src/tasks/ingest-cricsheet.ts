import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { upsertCricsheetMatch } from "@crickverse/db";
import { parseCricsheetMatch } from "@crickverse/scraper-core";
import { createLogger } from "../logger";
import { loadPeopleIndex } from "../cricsheet/people-index";

/**
 * Ingest Cricsheet ball-by-ball data into the canonical DB. `path` may be a
 * single match .json or a directory of them (unzip a league/format download from
 * https://cricsheet.org/downloads/ and point at the folder). The people.csv
 * register is loaded once and used to reconcile players with ESPNCricinfo.
 *
 * Idempotent — safe to re-run. Requires DATABASE_URL on the Neon DIRECT host.
 */
export async function ingestCricsheet(input: {
  path: string;
  refreshRegister?: boolean;
}): Promise<{ matches: number; deliveries: number; errors: number }> {
  const logger = createLogger("cricsheet-ingest");
  const files = collectJsonFiles(input.path);
  if (files.length === 0) {
    logger.warn("no .json files found", { path: input.path });
    return { matches: 0, deliveries: 0, errors: 0 };
  }
  logger.info(`found ${files.length} match file(s)`, { path: input.path });

  const peopleIndex = await loadPeopleIndex({ logger, forceRefresh: input.refreshRegister });

  let matches = 0;
  let deliveries = 0;
  let errors = 0;
  for (const file of files) {
    const sourceMatchId = basename(file).replace(/\.json$/i, "");
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
      const parsed = parseCricsheetMatch(raw, sourceMatchId);
      const res = await upsertCricsheetMatch(parsed, peopleIndex);
      matches += 1;
      deliveries += res.deliveries;
      if (matches % 25 === 0) logger.info(`progress: ${matches}/${files.length} matches`);
    } catch (err) {
      errors += 1;
      logger.error(`failed to ingest ${sourceMatchId}`, {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info(`✅ done`, { matches, deliveries, errors });
  return { matches, deliveries, errors };
}

/** A single .json file, or every *.json directly inside a directory (Cricsheet ships flat). */
function collectJsonFiles(path: string): string[] {
  const st = statSync(path);
  if (st.isFile()) return path.toLowerCase().endsWith(".json") ? [path] : [];
  return readdirSync(path)
    .filter((f) => f.toLowerCase().endsWith(".json") && f.toLowerCase() !== "readme.json")
    .map((f) => join(path, f));
}
