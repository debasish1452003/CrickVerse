import { prisma } from "@crickverse/db";
// Emergency space relief: drop the redundant BULK source (Cricsheet covers
// post-2000; scraped STATSGURU keeps the validated complete careers), then VACUUM.
const before = await prisma.playerInningsHistory.count();
let deleted = 0;
for (;;) {
  const chunk = await prisma.playerInningsHistory.findMany({
    where: { source: "CRICINFO_BULK" }, take: 20000, select: { id: true },
  });
  if (chunk.length === 0) break;
  const r = await prisma.playerInningsHistory.deleteMany({ where: { id: { in: chunk.map((c) => c.id) } } });
  deleted += r.count;
  console.log(`deleted ${deleted}`);
}
await prisma.$executeRawUnsafe('VACUUM "PlayerInningsHistory"');
const after = await prisma.playerInningsHistory.count();
console.log(JSON.stringify({ before, deletedBulk: deleted, after }));
await prisma.$disconnect();
