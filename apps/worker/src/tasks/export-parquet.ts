import { join, resolve } from "node:path";
import { ParquetSink, flattenMatch, type PeopleIndex } from "@crickverse/lakehouse";
import { parseCricsheetMatch } from "@crickverse/scraper-core";
import { createLogger } from "../logger";
import { loadPeopleIndex } from "../cricsheet/people-index";
import { feedUrl, resolveFeed } from "../cricsheet/feeds";
import { collectJsonEntries, getZipBuffer, openZip, readEntryFromZip } from "../cricsheet/zip-reader";

const ZIP_CACHE_DIR = join(process.cwd(), ".cache", "cricsheet");
/** Repo-root/data/lakehouse by default (worker cwd is apps/worker); override with LAKEHOUSE_DIR. */
const LAKEHOUSE_DIR = process.env.LAKEHOUSE_DIR ?? resolve(process.cwd(), "..", "..", "data", "lakehouse");

export interface ExportParquetInput {
  /** Cricsheet archive feed key (default "all" = the entire corpus). */
  feedKey?: string;
  /** Re-download the zip even if cached. */
  force?: boolean;
  /** Force a fresh people.csv download. */
  refreshRegister?: boolean;
  /** Output root (defaults to LAKEHOUSE_DIR). */
  outDir?: string;
}

/**
 * Silver-layer build: stream a Cricsheet archive → parse each match (reusing the
 * tested parser) → flatten to ball-by-ball rows → write partitioned Parquet via
 * DuckDB. No database touched; runs entirely on local disk, so it's far faster
 * than the Neon ingest. Idempotent (Parquet partitions are overwritten).
 */
export async function exportParquet(input: ExportParquetInput = {}): Promise<void> {
  const logger = createLogger("export-parquet");
  const feed = resolveFeed(input.feedKey ?? "all");
  const outDir = input.outDir ?? LAKEHOUSE_DIR;
  logger.info("silver export starting", { feed: feed.key, file: feed.file, outDir });

  const buffer = await getZipBuffer({
    url: feedUrl(feed.file),
    cachePath: join(ZIP_CACHE_DIR, `${feed.key}.zip`),
    logger,
    force: input.force,
  });

  const peopleIndex: PeopleIndex = await loadPeopleIndex({ logger, forceRefresh: input.refreshRegister });

  const zip = await openZip(buffer);
  const entries = await collectJsonEntries(zip);
  logger.info(`archive holds ${entries.length} match file(s)`, { feed: feed.key });

  const sink = new ParquetSink(outDir);
  let parsed = 0;
  let errors = 0;
  for (const e of entries) {
    try {
      const raw = JSON.parse((await readEntryFromZip(zip, e.entry)).toString("utf8")) as unknown;
      const match = parseCricsheetMatch(raw, e.matchId);
      await sink.write(flattenMatch(match, peopleIndex));
      parsed += 1;
      if (parsed % 500 === 0) logger.info(`parsed ${parsed}/${entries.length}`, { feed: feed.key });
    } catch (err) {
      errors += 1;
      logger.error(`failed to parse ${e.matchId}`, {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  zip.close();

  logger.info("writing Parquet (DuckDB)…", { feed: feed.key, parsed, errors });
  const summary = await sink.finalize();
  logger.info("✅ silver export done", { feed: feed.key, parsed, errors, ...summary });
}
