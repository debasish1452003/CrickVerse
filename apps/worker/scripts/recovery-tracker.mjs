import { prisma } from "@crickverse/db";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Top-N most prominent players (by career runs) with recovery status — same
// ordering the recovery queue uses, so this doubles as a "legends" checklist.
const TOP = Number(process.argv[2] ?? 300);

const players = await prisma.careerPlayer.findMany({
  where: { cricinfoId: { not: null } },
  select: { cricinfoId: true, name: true, careerRuns: true },
  orderBy: { careerRuns: "desc" },
  take: TOP,
});

const done = await prisma.playerInningsHistory.groupBy({ by: ["cricinfoId"], _count: { _all: true } });
const doneMap = new Map(done.map((d) => [d.cricinfoId, d._count._all]));

const totalWith = await prisma.careerPlayer.count({ where: { cricinfoId: { not: null } } });

const lines = [];
lines.push(`# Pre-2000 career recovery — progress tracker`);
lines.push("");
lines.push(`Generated for the top ${TOP} players by career runs (the recovery queue order).`);
lines.push("");
lines.push(`- Players with a cricinfo id: **${totalWith}**`);
lines.push(`- Recovered so far (have PlayerInningsHistory rows): **${doneMap.size}**`);
lines.push(`- Remaining: **${totalWith - doneMap.size}**`);
lines.push("");
lines.push(`| # | Player | cricinfoId | Career runs | Recovered | Innings rows |`);
lines.push(`|---|--------|-----------|------------|:---------:|-------------:|`);
players.forEach((p, i) => {
  const rows = doneMap.get(p.cricinfoId);
  const box = rows ? "☑" : "☐";
  lines.push(`| ${i + 1} | ${p.name} | ${p.cricinfoId} | ${p.careerRuns ?? ""} | ${box} | ${rows ?? ""} |`);
});

const out = resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs", "recovery-progress.md");
writeFileSync(out, lines.join("\n"), "utf8");
console.log(`wrote ${out} — recovered ${doneMap.size}/${totalWith}`);
await prisma.$disconnect();
