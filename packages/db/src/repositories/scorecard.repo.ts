import type { ParsedScorecard } from "@crickverse/types";
import type { Source } from "@prisma/client";
import { prisma } from "../client";
import { toDismissalKind } from "../mappers/match.mapper";
import { resolvePlayer, resolveTeam } from "../resolve/resolve";

/**
 * Persist a parsed scorecard onto an already-known match (matched by source id).
 * Upserts innings by [matchId, inningsNo] and batting/bowling lines by
 * [inningsId, playerId] — fully idempotent. Refined in Phase 6 against a real
 * scorecard payload.
 */
export async function upsertScorecard(
  parsed: ParsedScorecard,
  source: Source,
): Promise<{ matched: boolean }> {
  const externalId = String(parsed.sourceMatchId);
  const mapping = await prisma.matchExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  if (!mapping) return { matched: false };
  const matchId = mapping.matchId;

  for (const inn of parsed.innings) {
    const battingTeamId =
      inn.battingTeamId != null
        ? await resolveTeam(prisma, source, {
            sourceTeamId: inn.battingTeamId,
            name: null,
            shortName: null,
            score: null,
            isHome: null,
            primaryColor: null,
            imageUrl: null,
          })
        : null;

    const innings = await prisma.innings.upsert({
      where: { matchId_inningsNo: { matchId, inningsNo: inn.inningsNo } },
      create: {
        matchId,
        inningsNo: inn.inningsNo,
        battingTeamId: battingTeamId ?? undefined,
        runs: inn.runs ?? 0,
        wickets: inn.wickets ?? 0,
        oversText: inn.overs ?? undefined,
      },
      update: {
        battingTeamId: battingTeamId ?? undefined,
        runs: inn.runs ?? 0,
        wickets: inn.wickets ?? 0,
        oversText: inn.overs ?? undefined,
      },
    });

    let pos = 0;
    for (const b of inn.batting) {
      pos += 1;
      const playerId = await resolvePlayer(prisma, source, b.sourcePlayerId, b.name);
      if (!playerId) continue;
      const battingData = {
        battingPos: pos,
        runs: b.runs,
        balls: b.balls,
        fours: b.fours ?? 0,
        sixes: b.sixes ?? 0,
        strikeRate: b.strikeRate ?? undefined,
        dismissal: toDismissalKind(b.dismissalText, b.isOut),
        dismissalText: b.dismissalText ?? undefined,
      };
      await prisma.battingPerformance.upsert({
        where: { inningsId_playerId: { inningsId: innings.id, playerId } },
        create: { inningsId: innings.id, playerId, ...battingData },
        update: battingData,
      });
    }

    for (const bw of inn.bowling) {
      const playerId = await resolvePlayer(prisma, source, bw.sourcePlayerId, bw.name);
      if (!playerId) continue;
      const bowlingData = {
        oversText: bw.overs ?? undefined,
        balls: bw.balls ?? undefined,
        maidens: bw.maidens ?? undefined,
        runs: bw.runs,
        wickets: bw.wickets,
        economy: bw.economy ?? undefined,
      };
      await prisma.bowlingPerformance.upsert({
        where: { inningsId_playerId: { inningsId: innings.id, playerId } },
        create: { inningsId: innings.id, playerId, ...bowlingData },
        update: bowlingData,
      });
    }
  }

  await prisma.match.update({ where: { id: matchId }, data: { hasScorecard: true } });
  return { matched: true };
}
