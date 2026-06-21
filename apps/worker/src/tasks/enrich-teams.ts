import { prisma } from "@crickverse/db";
import { canonicalTeamId } from "@crickverse/domain";
import { createLogger } from "../logger";
import { NATIONAL_TEAMS, flagUrl, normalizeTeamName } from "../enrich/national-teams";
import { queryTeamLogosByLabel, sleep } from "../enrich/wikidata";

export interface EnrichTeamsResult {
  distinctTeams: number;
  national: number;
  withFlag: number;
  withLogo: number;
  written: number;
}

const LABEL_BATCH = 100;

/**
 * Build the TeamProfile dimension from the distinct team names in the gold
 * matches (CareerMatch.teamHome / teamAway). International sides get a flag (via
 * the flag CDN) + colour; the rest get a best-effort Wikidata franchise logo
 * (P154), falling back to the generated crest in the UI. Idempotent; `--force`
 * re-attempts logo lookups for franchises that had none.
 */
export async function enrichTeams(opts: { dryRun?: boolean; force?: boolean } = {}): Promise<EnrichTeamsResult> {
  const log = createLogger("enrich-teams");

  // Distinct team names + how often each appears (home + away), for popularity.
  const [home, away] = await Promise.all([
    prisma.careerMatch.groupBy({ by: ["teamHome"], _count: { _all: true } }),
    prisma.careerMatch.groupBy({ by: ["teamAway"], _count: { _all: true } }),
  ]);
  // Aggregate by CANONICAL id so renamed franchises (e.g. Royal Challengers
  // Bangalore → Bengaluru) collapse into a single profile. The display name is
  // the current/canonical variant — the one whose normalized form is the id.
  const counts = new Map<string, { displayName: string; count: number }>();
  // Every distinct raw name → its canonical id, for the CareerMatch backfill.
  const rawNameToId = new Map<string, string>();
  const add = (name: string | null, c: number): void => {
    if (!name) return;
    const key = canonicalTeamId(name);
    rawNameToId.set(name, key);
    const cur = counts.get(key);
    if (cur) {
      cur.count += c;
      // Prefer the canonical (current) name as displayName when we meet it.
      if (normalizeTeamName(name) === key) cur.displayName = name;
    } else {
      counts.set(key, { displayName: name, count: c });
    }
  };
  for (const g of home) add(g.teamHome, g._count._all);
  for (const g of away) add(g.teamAway, g._count._all);

  const result: EnrichTeamsResult = {
    distinctTeams: counts.size,
    national: 0,
    withFlag: 0,
    withLogo: 0,
    written: 0,
  };
  log.info("distinct teams", { count: counts.size });

  // Which franchises still need a logo lookup? (all non-national, unless we have
  // a stored logo already and aren't forcing).
  const franchiseNames: string[] = [];
  for (const [key, { displayName }] of counts) {
    if (!NATIONAL_TEAMS[key]) franchiseNames.push(displayName);
  }
  // dry-run still queries so we can report would-be coverage.
  const logos = new Map<string, { wikidataId: string; logoUrl?: string }>();
  for (let i = 0; i < franchiseNames.length; i += LABEL_BATCH) {
    const chunk = franchiseNames.slice(i, i + LABEL_BATCH);
    try {
      const found = await queryTeamLogosByLabel(chunk);
      for (const [label, v] of found) logos.set(canonicalTeamId(label), v);
    } catch (err) {
      log.warn("team-logo batch failed", { from: i, err: (err as Error).message });
    }
    log.info("logo lookup", { progress: `${Math.min(i + LABEL_BATCH, franchiseNames.length)}/${franchiseNames.length}`, found: logos.size });
    await sleep(400);
  }

  const now = new Date();
  for (const [key, { displayName, count }] of counts) {
    const nat = NATIONAL_TEAMS[key];
    const logo = logos.get(key);
    if (nat) result.national += 1;
    const flag = nat?.iso ? flagUrl(nat.iso) : null;
    if (flag) result.withFlag += 1;
    if (logo?.logoUrl) result.withLogo += 1;

    if (opts.dryRun) continue;
    const payload = {
      displayName,
      country: nat?.country ?? null,
      isNational: !!nat,
      flagUrl: flag,
      logoUrl: logo?.logoUrl ?? null,
      logoCredit: logo?.logoUrl ? "Wikimedia Commons" : null,
      logoLicense: null,
      primaryColor: nat?.color ?? null,
      wikidataId: logo?.wikidataId ?? null,
      matchCount: count,
      enrichedAt: now,
    };
    await prisma.teamProfile.upsert({
      where: { id: key },
      create: { id: key, ...payload },
      update: payload,
    });
    result.written += 1;
  }

  if (!opts.dryRun) {
    // Drop stale profiles left behind by a rename (retired-name ids that no
    // longer head a canonical group), so each franchise has exactly one row.
    const canonicalIds = [...counts.keys()];
    const removed = await prisma.teamProfile.deleteMany({ where: { id: { notIn: canonicalIds } } });
    if (removed.count) log.info("removed stale team profiles", { count: removed.count });

    // Backfill CareerMatch.team{Home,Away,winner}Id from the canonical mapping,
    // one UPDATE per canonical id (covering all of its raw name variants).
    const namesById = new Map<string, string[]>();
    for (const [name, id] of rawNameToId) {
      const arr = namesById.get(id);
      if (arr) arr.push(name);
      else namesById.set(id, [name]);
    }
    for (const [id, names] of namesById) {
      await prisma.$transaction([
        prisma.careerMatch.updateMany({ where: { teamHome: { in: names } }, data: { teamHomeId: id } }),
        prisma.careerMatch.updateMany({ where: { teamAway: { in: names } }, data: { teamAwayId: id } }),
        prisma.careerMatch.updateMany({ where: { winner: { in: names } }, data: { winnerId: id } }),
      ]);
    }
    log.info("backfilled CareerMatch team ids", { canonicalTeams: namesById.size });
  }

  log.info("✅ team enrichment complete", result);
  return result;
}
