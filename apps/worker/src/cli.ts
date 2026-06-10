import { prisma } from "@crickverse/db";
import type { CrawlMode } from "@crickverse/types";
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
    default:
      console.log("Usage:");
      console.log("  tsx src/cli.ts probe <slug> <objectId>            # fetch+parse only, no DB");
      console.log("  tsx src/cli.ts seed  <slug> <objectId> [LIVE|HISTORICAL]   # crawl + persist");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
