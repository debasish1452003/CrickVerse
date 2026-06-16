import { prisma } from "@crickverse/db";

const sizes = await prisma.$queryRaw`
  SELECT relname AS table,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
    pg_total_relation_size(c.oid) AS bytes
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC
  LIMIT 12`;
console.log("=== biggest tables ===");
for (const s of sizes) console.log(`${s.total.padStart(10)}  ${s.table}`);

const pih = await prisma.$queryRaw`
  SELECT source,
    COUNT(*)::int AS rows,
    SUM(CASE WHEN "matchDate" < '2000-01-01' THEN 1 ELSE 0 END)::int AS pre2000,
    SUM(CASE WHEN "matchDate" >= '2000-01-01' THEN 1 ELSE 0 END)::int AS post2000,
    SUM(CASE WHEN "matchDate" IS NULL THEN 1 ELSE 0 END)::int AS nodate
  FROM "PlayerInningsHistory" GROUP BY source ORDER BY rows DESC`;
console.log("\n=== PlayerInningsHistory by source (rows) ===");
for (const r of pih) console.log(`${r.source}: total=${r.rows}  pre2000=${r.pre2000}  post2000=${r.post2000}  nodate=${r.nodate}`);

const total = await prisma.playerInningsHistory.count();
console.log(`\nPlayerInningsHistory total rows: ${total}`);
await prisma.$disconnect();
