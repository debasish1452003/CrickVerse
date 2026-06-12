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
import { enrichPlayers } from "./tasks/enrich-players";
import { enrichTeams } from "./tasks/enrich-teams";
import { buildOversTask } from "./tasks/build-overs";

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
      // Remaining args are feed keys (e.g. "ipl t20i"); none ⇒ default set.
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
    default:
      console.log("Usage:");
      console.log("  tsx src/cli.ts probe <slug> <objectId>            # fetch+parse only, no DB");
      console.log("  tsx src/cli.ts seed  <slug> <objectId> [LIVE|HISTORICAL]   # crawl + persist");
      console.log("  tsx src/cli.ts cricsheet-probe <match.json>       # parse a Cricsheet file, no DB");
      console.log("  tsx src/cli.ts cricsheet-ingest <file-or-dir>     # parse + persist ball-by-ball (manual)");
      console.log("  tsx src/cli.ts cricsheet-seed-feeds [keys...]     # register feeds (default: recently ipl)");
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
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
