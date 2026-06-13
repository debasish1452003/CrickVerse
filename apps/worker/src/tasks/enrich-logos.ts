import { prisma } from "@crickverse/db";
import { createLogger } from "../logger";
import { normalizeTeamName } from "../enrich/national-teams";
import { resolveWikiLogo, sleep } from "../enrich/wiki-logos";

export interface EnrichLogosResult {
  compsChecked: number;
  compLogos: number;
  teamsChecked: number;
  teamLogos: number;
}

/**
 * Real league + franchise logos from English Wikipedia (Special:FilePath). These
 * are trademarked images served for a personal/educational project — not a
 * free-licence claim; the generated crest remains the fallback. Competitions are
 * stored in CompetitionProfile; franchise (non-national) logos are written onto
 * TeamProfile.logoUrl so they surface everywhere a team crest renders. Polite
 * ~1s spacing to stay under Wikipedia's rate limit. Resumable: rows already
 * enriched are skipped unless `force`.
 */
export async function enrichLogos(
  opts: { compLimit?: number; teamLimit?: number; force?: boolean; delayMs?: number } = {},
): Promise<EnrichLogosResult> {
  const log = createLogger("enrich-logos");
  const delay = opts.delayMs ?? 1000;
  const res: EnrichLogosResult = { compsChecked: 0, compLogos: 0, teamsChecked: 0, teamLogos: 0 };

  // ── Competitions (top by match volume) ──────────────────────────────────
  const comps = await prisma.careerMatch.groupBy({
    by: ["eventName"],
    where: { eventName: { not: null } },
    _count: { _all: true },
  });
  comps.sort((a, b) => b._count._all - a._count._all);
  const compTop = comps.slice(0, opts.compLimit ?? 120);
  log.info("competitions to check", { count: compTop.length });

  for (const c of compTop) {
    const name = c.eventName!;
    const id = normalizeTeamName(name);
    if (!opts.force) {
      const ex = await prisma.competitionProfile.findUnique({ where: { id } });
      if (ex?.enrichedAt) {
        if (ex.logoUrl) res.compLogos++;
        continue;
      }
    }
    let logoUrl: string | null = null;
    let wikiTitle: string | null = null;
    try {
      const r = await resolveWikiLogo(name);
      if (r) {
        logoUrl = r.logoUrl;
        wikiTitle = r.wikiTitle;
      }
    } catch (err) {
      log.warn("comp lookup failed", { name, err: (err as Error).message });
    }
    const payload = { name, logoUrl, wikiTitle, matchCount: c._count._all, enrichedAt: new Date() };
    await prisma.competitionProfile.upsert({ where: { id }, create: { id, ...payload }, update: payload });
    res.compsChecked++;
    if (logoUrl) res.compLogos++;
    if (res.compsChecked % 10 === 0) log.info("comp progress", { done: res.compsChecked, logos: res.compLogos });
    await sleep(delay);
  }

  // ── Franchise / domestic team logos (non-national, missing a logo) ────────
  const teams = await prisma.teamProfile.findMany({
    where: { isNational: false, ...(opts.force ? {} : { logoUrl: null }) },
    orderBy: { matchCount: "desc" },
    take: opts.teamLimit ?? 150,
    select: { id: true, displayName: true },
  });
  log.info("teams to check", { count: teams.length });

  for (const t of teams) {
    let logoUrl: string | null = null;
    try {
      const r = await resolveWikiLogo(t.displayName);
      if (r) logoUrl = r.logoUrl;
    } catch (err) {
      log.warn("team lookup failed", { team: t.displayName, err: (err as Error).message });
    }
    res.teamsChecked++;
    if (logoUrl) {
      await prisma.teamProfile.update({
        where: { id: t.id },
        data: { logoUrl, logoCredit: "Wikipedia", logoLicense: "trademark" },
      });
      res.teamLogos++;
    }
    if (res.teamsChecked % 10 === 0) log.info("team progress", { done: res.teamsChecked, logos: res.teamLogos });
    await sleep(delay);
  }

  log.info("✅ logo enrichment complete", res);
  return res;
}
