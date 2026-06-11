import { prisma } from "@crickverse/db";
import type { CrawlMode } from "@crickverse/types";
import { ingestCricsheet } from "./tasks/ingest-cricsheet";
import { probeCricsheet } from "./tasks/probe-cricsheet";
import { probeSeries } from "./tasks/probe-series";
import { seedSource } from "./tasks/seed-source";

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
    default:
      console.log("Usage:");
      console.log("  tsx src/cli.ts probe <slug> <objectId>            # fetch+parse only, no DB");
      console.log("  tsx src/cli.ts seed  <slug> <objectId> [LIVE|HISTORICAL]   # crawl + persist");
      console.log("  tsx src/cli.ts cricsheet-probe <match.json>       # parse a Cricsheet file, no DB");
      console.log("  tsx src/cli.ts cricsheet-ingest <file-or-dir>     # parse + persist ball-by-ball");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
