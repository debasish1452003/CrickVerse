import { prisma } from "@crickverse/db";
import { createLogger } from "../logger";

export interface CoverageAuditResult {
  byClass: Array<{
    matchClass: string;
    matches: number;
    firstMatchDate: string | null;
    lastMatchDate: string | null;
  }>;
  officialCompared: number;
  largerOfficialRunTotals: number;
  largerOfficialWicketTotals: number;
  coverageGaps: number;
  historicalScorecards: number;
  sourceImports: number;
  playerInnings: {
    rows: number;
    playersRecovered: number;
    earliestDate: string | null;
    latestDate: string | null;
    preCricsheetRows: number;
  };
}

/**
 * Compact audit of the lakehouse coverage vs imported official totals. This
 * keeps the product honest: old-era missing ball-by-ball data is reported as a
 * coverage gap, never silently counted as zero.
 */
export async function coverageAudit(): Promise<CoverageAuditResult> {
  const logger = createLogger("coverage-audit");

  const byClass = await prisma.careerMatch.groupBy({
    by: ["matchClass"],
    _count: { matchId: true },
    _min: { matchDate: true },
    _max: { matchDate: true },
    orderBy: { matchClass: "asc" },
  });

  const official = await prisma.officialCareerStat.findMany({
    select: { cricsheetId: true, matchClass: true, runs: true, wickets: true },
  });
  const [coverageGaps, historicalScorecards, sourceImports] = await Promise.all([
    prisma.coverageGap.count(),
    prisma.historicalScorecard.count(),
    prisma.sourceImport.count(),
  ]);

  // Per-innings Statsguru recovery progress (the pre-2000 backfill). "Pre-Cricsheet"
  // counts innings before 2002-01-01 — the era with no open ball-by-ball at all.
  const [piRows, piPlayers, piDates, piPre] = await Promise.all([
    prisma.playerInningsHistory.count(),
    prisma.playerInningsHistory.findMany({ distinct: ["cricinfoId"], select: { cricinfoId: true } }),
    prisma.playerInningsHistory.aggregate({ _min: { matchDate: true }, _max: { matchDate: true } }),
    prisma.playerInningsHistory.count({ where: { matchDate: { lt: "2002-01-01" } } }),
  ]);
  const derived =
    official.length === 0
      ? []
      : await prisma.careerStat.findMany({
          where: {
            OR: official.map((o) => ({ cricsheetId: o.cricsheetId, matchClass: o.matchClass })),
          },
          select: { cricsheetId: true, matchClass: true, runs: true, wickets: true },
        });
  const byKey = new Map(derived.map((d) => [`${d.cricsheetId}:${d.matchClass}`, d]));

  let largerOfficialRunTotals = 0;
  let largerOfficialWicketTotals = 0;
  for (const o of official) {
    const d = byKey.get(`${o.cricsheetId}:${o.matchClass}`);
    if (o.runs != null && o.runs > (d?.runs ?? 0)) largerOfficialRunTotals += 1;
    if (o.wickets != null && o.wickets > (d?.wickets ?? 0)) largerOfficialWicketTotals += 1;
  }

  const result: CoverageAuditResult = {
    byClass: byClass.map((r) => ({
      matchClass: r.matchClass,
      matches: r._count.matchId,
      firstMatchDate: r._min.matchDate,
      lastMatchDate: r._max.matchDate,
    })),
    officialCompared: official.length,
    largerOfficialRunTotals,
    largerOfficialWicketTotals,
    coverageGaps,
    historicalScorecards,
    sourceImports,
    playerInnings: {
      rows: piRows,
      playersRecovered: piPlayers.length,
      earliestDate: piDates._min.matchDate ?? null,
      latestDate: piDates._max.matchDate ?? null,
      preCricsheetRows: piPre,
    },
  };

  logger.info("coverage audit complete", result);
  return result;
}
