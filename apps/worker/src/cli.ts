import { prisma } from "@crickverse/db";
import type { CrawlMode } from "@crickverse/types";
import { ingestCricsheet } from "./tasks/ingest-cricsheet";
import { probeCricsheet } from "./tasks/probe-cricsheet";
import { probeSeries } from "./tasks/probe-series";
import { seedSource } from "./tasks/seed-source";
import { seedCricsheetFeeds, syncCricsheet } from "./tasks/sync-cricsheet";
import { backfillMatchClass } from "./tasks/backfill-match-class";
import { exportParquet } from "./tasks/export-parquet";
import { buildGoldTask } from "./tasks/build-gold";
import { refreshLakehouse } from "./tasks/refresh-lakehouse";
import { enrichLogos } from "./tasks/enrich-logos";
import { enrichPlayers } from "./tasks/enrich-players";
import { enrichTeams } from "./tasks/enrich-teams";
import { buildOversTask } from "./tasks/build-overs";
import { importOfficialStats } from "./tasks/import-official-stats";
import { coverageAudit } from "./tasks/coverage-audit";
import { importCricsheetMissing } from "./tasks/import-cricsheet-missing";
import { importHistoricalScorecards } from "./tasks/import-historical-scorecards";
import { discoverCricinfoHistorical, syncCricinfoHistorical } from "./tasks/cricinfo-historical-recovery";
import { recoverPlayerCareers } from "./tasks/recover-player-careers";
import { importBulkInnings } from "./tasks/import-bulk-innings";
import { importKaggleInnings } from "./tasks/import-kaggle-innings";
import { buildMlFeaturesTask } from "./tasks/build-ml-features";
import { historicalExportSilver } from "./tasks/historical-export-silver";

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case "seed": {
      const slug = rest[0] ?? "ipl-2026";
      const objectId = rest[1] ?? "1510719";
      const mode: CrawlMode = rest[2]?.toUpperCase() === "LIVE" ? "LIVE" : "HISTORICAL";
      await seedSource({ slug, objectId, mode });
      break;
    }
    case "probe": {
      const slug = rest[0] ?? "ipl-2026";
      const objectId = rest[1] ?? "1510719";
      await probeSeries({ slug, objectId });
      break;
    }
    case "cricsheet-probe": {
      const file = rest[0];
      if (!file) {
        console.error("Usage: tsx src/cli.ts cricsheet-probe <path-to-match.json>");
        process.exitCode = 1;
        break;
      }
      probeCricsheet({ file });
      break;
    }
    case "cricsheet-ingest": {
      const path = rest[0];
      if (!path) {
        console.error("Usage: tsx src/cli.ts cricsheet-ingest <file-or-dir> [--refresh-register]");
        process.exitCode = 1;
        break;
      }
      await ingestCricsheet({ path, refreshRegister: rest.includes("--refresh-register") });
      break;
    }
    case "cricsheet-seed-feeds": {
      // Remaining args are feed keys (e.g. "all odi test"); none => default set.
      await seedCricsheetFeeds(rest.filter((a) => !a.startsWith("--")));
      break;
    }
    case "cricsheet-sync": {
      // First non-flag arg optionally limits to one feed key.
      const feedKey = rest.find((a) => !a.startsWith("--"));
      const results = await syncCricsheet({
        feedKey,
        force: rest.includes("--force"),
        revisionSweep: rest.includes("--revision-sweep"),
        fromCache: rest.includes("--from-cache"),
        refreshRegister: rest.includes("--refresh-register"),
        dryRun: rest.includes("--dry-run"),
      });
      console.table(results);
      break;
    }
    case "backfill-match-class": {
      const res = await backfillMatchClass();
      console.log(res);
      break;
    }
    case "cricsheet-export-parquet": {
      const feedKey = rest.find((a) => !a.startsWith("--"));
      await exportParquet({
        feedKey,
        force: rest.includes("--force"),
        refreshRegister: rest.includes("--refresh-register"),
      });
      break;
    }
    case "cricsheet-build-gold": {
      await buildGoldTask();
      break;
    }
    case "lakehouse-refresh": {
      await refreshLakehouse({ force: rest.includes("--force") });
      break;
    }
    case "enrich-players": {
      const limitArg = rest.find((a) => a.startsWith("--limit="));
      const res = await enrichPlayers({
        dryRun: rest.includes("--dry-run"),
        force: rest.includes("--force"),
        limit: limitArg ? Number(limitArg.split("=")[1]) : undefined,
      });
      console.log(res);
      break;
    }
    case "enrich-teams": {
      const res = await enrichTeams({
        dryRun: rest.includes("--dry-run"),
        force: rest.includes("--force"),
      });
      console.log(res);
      break;
    }
    case "build-overs": {
      await buildOversTask();
      break;
    }
    case "enrich-logos": {
      const compArg = rest.find((a) => a.startsWith("--comp-limit="));
      const teamArg = rest.find((a) => a.startsWith("--team-limit="));
      const res = await enrichLogos({
        force: rest.includes("--force"),
        compLimit: compArg ? Number(compArg.split("=")[1]) : undefined,
        teamLimit: teamArg ? Number(teamArg.split("=")[1]) : undefined,
      });
      console.log(res);
      break;
    }
    case "official-stats-import": {
      const path = rest.find((a) => !a.startsWith("--"));
      const sourceArg = rest.find((a) => a.startsWith("--source="));
      if (!path || !sourceArg) {
        console.error(
          "Usage: tsx src/cli.ts official-stats-import <csv-or-json> --source=NAME [--source-url=URL] [--license=TEXT] [--notes=TEXT] [--dry-run]",
        );
        process.exitCode = 1;
        break;
      }
      const res = await importOfficialStats({
        path,
        source: sourceArg.split("=").slice(1).join("="),
        sourceUrl: rest.find((a) => a.startsWith("--source-url="))?.split("=").slice(1).join("="),
        license: rest.find((a) => a.startsWith("--license="))?.split("=").slice(1).join("="),
        notes: rest.find((a) => a.startsWith("--notes="))?.split("=").slice(1).join("="),
        dryRun: rest.includes("--dry-run"),
      });
      console.log(res);
      break;
    }
    case "cricsheet-missing-import": {
      const urlArg = rest.find((a) => a.startsWith("--url="));
      const res = await importCricsheetMissing({
        url: urlArg?.split("=").slice(1).join("="),
        dryRun: rest.includes("--dry-run"),
      });
      console.log(res);
      break;
    }
    case "historical-scorecard-import": {
      const path = rest.find((a) => !a.startsWith("--"));
      const sourceArg = rest.find((a) => a.startsWith("--source="));
      if (!path || !sourceArg) {
        console.error(
          "Usage: tsx src/cli.ts historical-scorecard-import <csv-or-json> --source=NAME [--source-url=URL] [--license=TEXT] [--notes=TEXT] [--dry-run]",
        );
        process.exitCode = 1;
        break;
      }
      const res = await importHistoricalScorecards({
        path,
        source: sourceArg.split("=").slice(1).join("="),
        sourceUrl: rest.find((a) => a.startsWith("--source-url="))?.split("=").slice(1).join("="),
        license: rest.find((a) => a.startsWith("--license="))?.split("=").slice(1).join("="),
        notes: rest.find((a) => a.startsWith("--notes="))?.split("=").slice(1).join("="),
        dryRun: rest.includes("--dry-run"),
      });
      console.log(res);
      break;
    }
    case "cricinfo-historical-discover": {
      const formatArg = rest.find((a) => a.startsWith("--format="));
      const fromYearArg = rest.find((a) => a.startsWith("--from-year="));
      const toYearArg = rest.find((a) => a.startsWith("--to-year="));
      const outDirArg = rest.find((a) => a.startsWith("--out-dir="));
      const seedUrlArg = rest.find((a) => a.startsWith("--seed-url="));
      const wikipediaTitleArg = rest.find((a) => a.startsWith("--wikipedia-title="));
      const res = await discoverCricinfoHistorical({
        fromCricsheetMissing: rest.includes("--from-cricsheet-missing"),
        format: formatArg?.split("=").slice(1).join("="),
        fromYear: fromYearArg ? Number(fromYearArg.split("=").slice(1).join("=")) : undefined,
        toYear: toYearArg ? Number(toYearArg.split("=").slice(1).join("=")) : undefined,
        seedUrl: seedUrlArg?.split("=").slice(1).join("="),
        wikipediaTitle: wikipediaTitleArg?.split("=").slice(1).join("="),
        outDir: outDirArg?.split("=").slice(1).join("="),
        dryRun: rest.includes("--dry-run"),
      });
      console.log(res);
      break;
    }
    case "cricinfo-historical-sync": {
      const manifestArg = rest.find((a) => a.startsWith("--manifest="));
      const limitArg = rest.find((a) => a.startsWith("--limit="));
      const delayArg = rest.find((a) => a.startsWith("--delay-ms="));
      if (!manifestArg) {
        console.error("Usage: tsx src/cli.ts cricinfo-historical-sync --manifest=PATH [--limit=N] [--delay-ms=3000] [--dry-run]");
        process.exitCode = 1;
        break;
      }
      const res = await syncCricinfoHistorical({
        manifest: manifestArg.split("=").slice(1).join("="),
        limit: limitArg ? Number(limitArg.split("=").slice(1).join("=")) : undefined,
        delayMs: delayArg ? Number(delayArg.split("=").slice(1).join("=")) : undefined,
        dryRun: rest.includes("--dry-run"),
      });
      console.log(res);
      break;
    }
    case "recover-player-careers": {
      const limitArg = rest.find((a) => a.startsWith("--limit="));
      const delayArg = rest.find((a) => a.startsWith("--delay-ms="));
      const idArg = rest.find((a) => a.startsWith("--cricinfo-id="));
      const concArg = rest.find((a) => a.startsWith("--concurrency="));
      const shardArg = rest.find((a) => a.startsWith("--shard="));
      let shard: { index: number; total: number } | undefined;
      if (shardArg) {
        const [i, t] = shardArg.split("=").slice(1).join("=").split("/").map(Number);
        if (Number.isFinite(i) && Number.isFinite(t) && t! > 0 && i! >= 0 && i! < t!) {
          shard = { index: i!, total: t! };
        } else {
          console.error("Invalid --shard; use --shard=INDEX/TOTAL (e.g. --shard=0/2)");
          process.exitCode = 1;
          break;
        }
      }
      const res = await recoverPlayerCareers({
        limit: limitArg ? Number(limitArg.split("=").slice(1).join("=")) : undefined,
        delayMs: delayArg ? Number(delayArg.split("=").slice(1).join("=")) : undefined,
        cricinfoId: idArg?.split("=").slice(1).join("="),
        concurrency: concArg ? Number(concArg.split("=").slice(1).join("=")) : undefined,
        internationalOnly: rest.includes("--international-only"),
        shard,
        force: rest.includes("--force"),
        dryRun: rest.includes("--dry-run"),
      });
      console.log(res);
      break;
    }
    case "import-bulk-innings": {
      const path = rest.find((a) => !a.startsWith("--"));
      if (!path) {
        console.error("Usage: tsx src/cli.ts import-bulk-innings <csv-path> [--dry-run]");
        process.exitCode = 1;
        break;
      }
      const res = await importBulkInnings({ path, dryRun: rest.includes("--dry-run") });
      console.log(res);
      break;
    }
    case "import-kaggle-innings": {
      const dir = rest.find((a) => !a.startsWith("--"));
      if (!dir) {
        console.error("Usage: tsx src/cli.ts import-kaggle-innings <archive-folder> [--dry-run]");
        process.exitCode = 1;
        break;
      }
      const res = await importKaggleInnings({ dir, dryRun: rest.includes("--dry-run") });
      console.log(res);
      break;
    }
    case "historical-export-silver": {
      await historicalExportSilver();
      break;
    }
    case "build-ml-features": {
      const outArg = rest.find((a) => a.startsWith("--out-dir="));
      await buildMlFeaturesTask({ outDir: outArg?.split("=").slice(1).join("=") });
      break;
    }
    case "coverage-audit": {
      const res = await coverageAudit();
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    default:
      console.log("Usage:");
      console.log("  tsx src/cli.ts probe <slug> <objectId>            # fetch+parse only, no DB");
      console.log("  tsx src/cli.ts seed  <slug> <objectId> [LIVE|HISTORICAL]   # crawl + persist");
      console.log("  tsx src/cli.ts cricsheet-probe <match.json>       # parse a Cricsheet file, no DB");
      console.log("  tsx src/cli.ts cricsheet-ingest <file-or-dir>     # parse + persist ball-by-ball (manual)");
      console.log("  tsx src/cli.ts cricsheet-seed-feeds [keys...]     # register feeds (default: all recently)");
      console.log("  tsx src/cli.ts cricsheet-sync [feedKey] [--dry-run] [--force] [--revision-sweep] [--from-cache] [--refresh-register]");
      console.log("                                                    # conditional download + incremental ingest");
      console.log("  tsx src/cli.ts backfill-match-class               # set matchClass on pre-existing matches (one-time)");
      console.log("  tsx src/cli.ts cricsheet-export-parquet [feedKey] [--force] [--refresh-register]");
      console.log("                                                    # build the silver Parquet corpus (default: all)");
      console.log("  tsx src/cli.ts cricsheet-build-gold               # silver Parquet -> career aggregates -> Neon (gold)");
      console.log("  tsx src/cli.ts lakehouse-refresh [--force]        # conditional: re-export silver + rebuild gold if archive changed");
      console.log("  tsx src/cli.ts enrich-players [--dry-run] [--force] [--limit=N]");
      console.log("                                                    # Wikidata/Commons photos + bio → PlayerProfile");
      console.log("  tsx src/cli.ts enrich-teams [--dry-run] [--force] # flags + franchise logos → TeamProfile");
      console.log("  tsx src/cli.ts build-overs                        # per-innings over rollup → InningsOvers (charts)");
      console.log("  tsx src/cli.ts enrich-logos [--force] [--comp-limit=N] [--team-limit=N]");
      console.log("                                                    # real league/franchise logos from Wikipedia → CompetitionProfile + TeamProfile");
      console.log("  tsx src/cli.ts recover-player-careers [--limit=N] [--delay-ms=4000] [--cricinfo-id=ID] [--force] [--dry-run]");
      console.log("                                                    # drip-fetch per-player innings history (incl. pre-2000) from Statsguru → PlayerInningsHistory");
      console.log("  tsx src/cli.ts historical-export-silver           # PlayerInningsHistory (Neon) → silver/player_innings.parquet (tier=scorecard)");
      console.log("  tsx src/cli.ts build-ml-features [--out-dir=PATH] # silver ball-by-ball → versioned ML training Parquet (local, partitioned by class)");
      console.log("  tsx src/cli.ts coverage-audit                     # report lakehouse coverage vs official/historical/gap + recovery progress");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
