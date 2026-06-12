import type { ParsedScorecard } from "@crickverse/types";
import type { Prisma, Source } from "@prisma/client";
import { prisma } from "../client";
import { toDismissalKind } from "../mappers/match.mapper";
import { resolvePlayer, resolveTeam } from "../resolve/resolve";

/**
 * Persist a parsed scorecard onto an already-known match. Idempotent and
 * efficient: players/teams resolve via the in-process memo, and each innings'
 * batting + bowling lines are rewritten in a single transaction (delete + bulk
 * createMany) instead of one upsert per line — turning ~40 round-trips per
 * innings into ~5.
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

    const batting: Prisma.BattingPerformanceCreateManyInput[] = [];
    let pos = 0;
    for (const b of inn.batting) {
      pos += 1;
      const playerId = await resolvePlayer(prisma, source, b.sourcePlayerId, b.name);
      if (!playerId) continue;
      batting.push({
        inningsId: innings.id,
        playerId,
        battingPos: pos,
        runs: b.runs,
        balls: b.balls,
        fours: b.fours ?? 0,
        sixes: b.sixes ?? 0,
        strikeRate: b.strikeRate ?? null,
        dismissal: toDismissalKind(b.dismissalText, b.isOut),
        dismissalText: b.dismissalText ?? null,
      });
    }

    const bowling: Prisma.BowlingPerformanceCreateManyInput[] = [];
    for (const bw of inn.bowling) {
      const playerId = await resolvePlayer(prisma, source, bw.sourcePlayerId, bw.name);
      if (!playerId) continue;
      bowling.push({
        inningsId: innings.id,
        playerId,
        oversText: bw.overs ?? null,
        balls: bw.balls ?? 0,
        maidens: bw.maidens ?? 0,
        runs: bw.runs,
        wickets: bw.wickets,
        economy: bw.economy ?? null,
      });
    }

    // Rewrite this innings' lines atomically (delete + bulk insert).
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.battingPerformance.deleteMany({ where: { inningsId: innings.id } }),
      prisma.bowlingPerformance.deleteMany({ where: { inningsId: innings.id } }),
    ];
    if (batting.length) ops.push(prisma.battingPerformance.createMany({ data: batting }));
    if (bowling.length) ops.push(prisma.bowlingPerformance.createMany({ data: bowling }));
    await prisma.$transaction(ops);
  }

  await prisma.match.update({ where: { id: matchId }, data: { hasScorecard: true } });
  return { matched: true };
}
