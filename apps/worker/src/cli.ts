import { prisma } from "@crickverse/db";
import type { CrawlMode } from "@crickverse/types";
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
    default:
      console.log("Usage: tsx src/cli.ts seed <slug> <objectId> [LIVE|HISTORICAL]");
      console.log("Example: pnpm --filter @crickverse/worker run seed ipl-2026 1510719");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
