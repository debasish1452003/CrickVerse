import { prisma } from "@crickverse/db";

// Physical enforcement of the one-source-per-player invariant: drop BULK rows for
// any player who also has a complete scrape (CRICINFO_STATSGURU). Read-side dedup
// already prevents double-counting; this keeps the DB itself clean.
const scraped = await prisma.playerInningsHistory.groupBy({
  by: ["cricinfoId"],
  where: { source: "CRICINFO_STATSGURU" },
});
const ids = scraped.map((s) => s.cricinfoId);
if (ids.length === 0) {
  console.log("no scraped players yet — nothing to clean");
} else {
  const res = await prisma.playerInningsHistory.deleteMany({
    where: { source: "CRICINFO_BULK", cricinfoId: { in: ids } },
  });
  console.log(JSON.stringify({ scrapedPlayers: ids.length, bulkRowsDeleted: res.count }, null, 2));
}
await prisma.$disconnect();
