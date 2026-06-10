import type { ParsedMatch, ParsedSeriesFixtures } from "@crickverse/types";
import type { Source } from "@prisma/client";
import { prisma } from "../client";
import {
  parseDate,
  toMatchFormat,
  toMatchState,
  toUtcDateOnly,
} from "../mappers/match.mapper";
import { resolveSeries, resolveTeam, resolveVenue } from "../resolve/resolve";

/**
 * Persist a parsed series-fixtures page: upsert the series once, then each match
 * with its venue + teams resolved to canonical rows. Idempotent — keyed on the
 * ESPNCricinfo objectId via the *ExternalId mapping tables.
 */
export async function upsertSeriesFixtures(
  parsed: ParsedSeriesFixtures,
  source: Source,
): Promise<{ seriesId: string | null; matches: number }> {
  const seriesId = await resolveSeries(prisma, source, parsed.series);
  let count = 0;
  for (const match of parsed.matches) {
    await upsertMatch(match, source, seriesId);
    count += 1;
  }
  return { seriesId, matches: count };
}

async function upsertMatch(
  m: ParsedMatch,
  source: Source,
  seriesId: string | null,
): Promise<void> {
  const venueId = await resolveVenue(prisma, source, m.venue);

  // Resolve the two teams and remember source id -> canonical id so we can
  // wire up winner / toss-winner FKs (which reference one of these teams).
  const teamIdBySource = new Map<number, string>();
  for (const team of m.teams) {
    if (team.sourceTeamId == null) continue;
    const id = await resolveTeam(prisma, source, team);
    if (id) teamIdBySource.set(team.sourceTeamId, id);
  }

  const home = m.teams[0];
  const away = m.teams[1];
  const homeTeamId = home?.sourceTeamId != null ? teamIdBySource.get(home.sourceTeamId) ?? null : null;
  const awayTeamId = away?.sourceTeamId != null ? teamIdBySource.get(away.sourceTeamId) ?? null : null;
  const winnerId =
    m.result.winnerTeamId != null ? teamIdBySource.get(m.result.winnerTeamId) ?? null : null;
  const tossWinnerId =
    m.result.tossWinnerTeamId != null
      ? teamIdBySource.get(m.result.tossWinnerTeamId) ?? null
      : null;

  const startTime = parseDate(m.startTime);
  const data = {
    title: m.title ?? undefined,
    slug: m.slug ?? undefined,
    format: toMatchFormat(m.format),
    state: toMatchState(m.state, m.isCancelled),
    startTime,
    matchDate: toUtcDateOnly(startTime),
    dayNight: m.dayNight ?? undefined,
    statusText: m.statusText ?? undefined,
    homeScore: home?.score ?? undefined,
    awayScore: away?.score ?? undefined,
    tossDecision: m.result.tossDecision ?? undefined,
    seriesId: seriesId ?? undefined,
    venueId: venueId ?? undefined,
    homeTeamId: homeTeamId ?? undefined,
    awayTeamId: awayTeamId ?? undefined,
    winnerId: winnerId ?? undefined,
    tossWinnerId: tossWinnerId ?? undefined,
    hasScorecard: m.flags.hasScorecard ?? false,
    hasCommentary: m.flags.hasCommentary ?? false,
  };

  const externalId = String(m.sourceMatchId);
  const existing = await prisma.matchExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  if (existing) {
    await prisma.match.update({ where: { id: existing.matchId }, data });
  } else {
    await prisma.match.create({
      data: { ...data, externalIds: { create: { source, externalId } } },
    });
  }
}

/** Find matches that claim a scorecard but have no innings ingested yet. */
export function getMatchesNeedingScorecard(source: Source) {
  return prisma.match.findMany({
    where: { hasScorecard: true, innings: { none: {} } },
    select: {
      id: true,
      slug: true,
      externalIds: { where: { source }, select: { externalId: true } },
      series: {
        select: {
          slug: true,
          externalIds: { where: { source }, select: { externalId: true } },
        },
      },
    },
  });
}
