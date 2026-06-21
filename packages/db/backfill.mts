import { prisma } from "./src/client.ts";
import { canonicalTeamId, TEAM_ALIASES } from "../domain/src/core/naming.ts";

// 1. Distinct team names across home/away/winner -> canonical id.
const names = await prisma.$queryRawUnsafe<{ t: string }[]>(`
  SELECT DISTINCT t FROM (
    SELECT "teamHome" t FROM "CareerMatch"
    UNION SELECT "teamAway" FROM "CareerMatch"
    UNION SELECT "winner" FROM "CareerMatch"
  ) x WHERE t IS NOT NULL`);
const byId = new Map<string, string[]>();
for (const { t } of names) {
  const id = canonicalTeamId(t);
  (byId.get(id) ?? byId.set(id, []).get(id)!).push(t);
}

// 2. Backfill team ids.
let groups = 0;
for (const [id, ns] of byId) {
  await prisma.$transaction([
    prisma.careerMatch.updateMany({ where: { teamHome: { in: ns } }, data: { teamHomeId: id } }),
    prisma.careerMatch.updateMany({ where: { teamAway: { in: ns } }, data: { teamAwayId: id } }),
    prisma.careerMatch.updateMany({ where: { winner: { in: ns } }, data: { winnerId: id } }),
  ]);
  groups++;
}
console.log(`backfilled ${groups} canonical teams from ${names.length} distinct names`);

// 3. Merge retired alias profiles into canonical (fill nulls), then delete retired.
for (const [retired, canonical] of Object.entries(TEAM_ALIASES)) {
  const [old, cur] = await Promise.all([
    prisma.teamProfile.findUnique({ where: { id: retired } }),
    prisma.teamProfile.findUnique({ where: { id: canonical } }),
  ]);
  if (!old) continue;
  if (cur) {
    await prisma.teamProfile.update({ where: { id: canonical }, data: {
      logoUrl: cur.logoUrl ?? old.logoUrl,
      flagUrl: cur.flagUrl ?? old.flagUrl,
      primaryColor: cur.primaryColor ?? old.primaryColor,
      wikidataId: cur.wikidataId ?? old.wikidataId,
      logoCredit: cur.logoCredit ?? old.logoCredit,
    }});
    await prisma.teamProfile.delete({ where: { id: retired } });
    console.log(`merged+deleted ${retired} -> ${canonical}`);
  } else {
    // canonical profile missing: rename retired into canonical id.
    await prisma.teamProfile.update({ where: { id: retired }, data: { id: canonical } });
    console.log(`renamed ${retired} -> ${canonical}`);
  }
}

// 4. Recompute matchCount for canonical profiles.
for (const id of byId.keys()) {
  const c = await prisma.careerMatch.count({ where: { OR: [{ teamHomeId: id }, { teamAwayId: id }] } });
  await prisma.teamProfile.updateMany({ where: { id }, data: { matchCount: c } });
}
console.log("recomputed matchCounts");
await prisma.$disconnect();
