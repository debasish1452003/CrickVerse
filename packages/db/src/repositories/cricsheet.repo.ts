import type { ParsedCricsheetMatch } from "@crickverse/types";
import { MatchState, Source, TossDecision, type Prisma } from "@prisma/client";
import { prisma } from "../client";
import {
  parseDate,
  toDismissalKindFromCricsheet,
  toMatchClassFromCricsheet,
  toMatchFormatFromCricsheet,
  toUtcDateOnly,
} from "../mappers/match.mapper";
import {
  resolveCricsheetPlayer,
  resolveSeriesByName,
  resolveTeamByName,
  resolveVenueByName,
} from "../resolve/resolve";

/** Cricsheet -> canonical id for `keyCricinfo`, e.g. ("a-bc-1") -> "253802". */
export type PeopleIndex = Map<string, string>;

/** createMany chunk size — keeps each round-trip small (the Neon writer is latency-bound). */
const DELIVERY_CHUNK = 500;

/** `IN (...)` chunk for the skip-known lookup — one round-trip per chunk. */
const LOOKUP_CHUNK = 1000;

/**
 * For a set of Cricsheet match ids, return only those already in the DB, mapped
 * to their last-ingested revision (`Match.sourceRevision`, defaulting to 1). The
 * incremental feed uses this to skip known matches without decompressing them,
 * and to re-ingest only when Cricsheet bumps a file's revision. Ids absent from
 * the returned map are new and must be ingested.
 */
export async function findExistingCricsheetMatches(
  sourceMatchIds: string[],
): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  for (let i = 0; i < sourceMatchIds.length; i += LOOKUP_CHUNK) {
    const chunk = sourceMatchIds.slice(i, i + LOOKUP_CHUNK);
    const rows = await prisma.matchExternalId.findMany({
      where: { source: Source.CRICSHEET, externalId: { in: chunk } },
      select: { externalId: true, match: { select: { sourceRevision: true } } },
    });
    for (const r of rows) found.set(r.externalId, r.match.sourceRevision ?? 1);
  }
  return found;
}

/**
 * Ingest one parsed Cricsheet match into canonical Match/Innings/Delivery rows.
 * Idempotent: keyed on MatchExternalId(CRICSHEET, sourceMatchId); deliveries for
 * the match are rewritten (delete + chunked createMany) so re-running is safe.
 *
 * Players reconcile with ESPNCricinfo through `peopleIndex` (people.csv) — see
 * {@link resolveCricsheetPlayer}. Teams/venues/series resolve by name under the
 * CRICSHEET source (Cricsheet exposes no numeric ids for them); cross-source
 * dedupe of those is a later NameAlias pass.
 *
 * NOTE: point DATABASE_URL at the Neon DIRECT (non-pooler) host with
 * connection_limit=1 — bulk Delivery writes stall on the PgBouncer endpoint.
 */
export async function upsertCricsheetMatch(
  parsed: ParsedCricsheetMatch,
  peopleIndex: PeopleIndex = new Map(),
): Promise<{ matchId: string; innings: number; deliveries: number }> {
  // Cricsheet's team_type is the authoritative international-vs-domestic signal.
  const isNational = (parsed.teamType ?? "").toLowerCase() === "international";

  const seriesId = await resolveSeriesByName(
    prisma,
    Source.CRICSHEET,
    parsed.eventName,
    parsed.season,
    toMatchFormatFromCricsheet(parsed.matchType),
  );
  const venueId = await resolveVenueByName(prisma, Source.CRICSHEET, parsed.venue, parsed.city);

  const teamIdByName = new Map<string, string>();
  for (const teamName of parsed.teams) {
    const id = await resolveTeamByName(prisma, Source.CRICSHEET, teamName, { isNational });
    if (id) teamIdByName.set(teamName, id);
  }

  const start = parseDate(parsed.dates[0]);
  const homeTeamId = parsed.teams[0] ? teamIdByName.get(parsed.teams[0]) ?? null : null;
  const awayTeamId = parsed.teams[1] ? teamIdByName.get(parsed.teams[1]) ?? null : null;
  const winnerId = parsed.outcomeWinner ? teamIdByName.get(parsed.outcomeWinner) ?? null : null;
  const tossWinnerId = parsed.tossWinner ? teamIdByName.get(parsed.tossWinner) ?? null : null;
  const tossDecision =
    parsed.tossDecision === "bat"
      ? TossDecision.BAT
      : parsed.tossDecision === "field"
        ? TossDecision.FIELD
        : undefined;

  const data = {
    title:
      parsed.teams.length === 2 ? `${parsed.teams[0]} vs ${parsed.teams[1]}` : undefined,
    format: toMatchFormatFromCricsheet(parsed.matchType),
    matchClass: toMatchClassFromCricsheet(parsed.matchType, parsed.teamType),
    matchType: parsed.matchType ?? undefined,
    state: MatchState.COMPLETED, // Cricsheet only publishes completed matches
    startTime: start,
    matchDate: toUtcDateOnly(start),
    seriesId: seriesId ?? undefined,
    venueId: venueId ?? undefined,
    homeTeamId: homeTeamId ?? undefined,
    awayTeamId: awayTeamId ?? undefined,
    winnerId: winnerId ?? undefined,
    tossWinnerId: tossWinnerId ?? undefined,
    tossDecision,
    hasScorecard: true,
    hasBallByBall: true,
    sourceRevision: parsed.revision,
  };

  const externalId = parsed.sourceMatchId;
  const existing = await prisma.matchExternalId.findUnique({
    where: { source_externalId: { source: Source.CRICSHEET, externalId } },
  });
  let matchId: string;
  if (existing) {
    await prisma.match.update({ where: { id: existing.matchId }, data });
    matchId = existing.matchId;
  } else {
    const created = await prisma.match.create({
      data: { ...data, externalIds: { create: { source: Source.CRICSHEET, externalId } } },
    });
    matchId = created.id;
  }

  // Resolve every player once (memoized) so the delivery loop is pure id lookups.
  const playerId = async (ref: { id: string | null; name: string }): Promise<string> =>
    resolveCricsheetPlayer(prisma, ref, ref.id ? peopleIndex.get(ref.id) ?? null : null);

  let deliveriesWritten = 0;
  for (const inn of parsed.innings) {
    const battingTeamId = teamIdByName.get(inn.battingTeam) ?? null;

    const innings = await prisma.innings.upsert({
      where: { matchId_inningsNo: { matchId, inningsNo: inn.inningsNo } },
      create: {
        matchId,
        inningsNo: inn.inningsNo,
        battingTeamId: battingTeamId ?? undefined,
        runs: inn.runs,
        wickets: inn.wickets,
        balls: inn.legalBalls,
      },
      update: {
        battingTeamId: battingTeamId ?? undefined,
        runs: inn.runs,
        wickets: inn.wickets,
        balls: inn.legalBalls,
      },
    });

    const rows: Prisma.DeliveryCreateManyInput[] = [];
    for (const d of inn.deliveries) {
      const batterId = await playerId(d.batter);
      const bowlerId = await playerId(d.bowler);
      const nonStrikerId = d.nonStriker ? await playerId(d.nonStriker) : null;
      const playerOutId = d.wicket?.playerOut ? await playerId(d.wicket.playerOut) : null;
      rows.push({
        matchId,
        inningsId: innings.id,
        inningsNo: inn.inningsNo,
        overNo: d.overNo,
        ballInOver: d.ballInOver,
        batterId,
        bowlerId,
        nonStrikerId,
        runsBatter: d.runsBatter,
        runsExtras: d.runsExtras,
        runsTotal: d.runsTotal,
        extraType: d.extraType,
        isWicket: d.wicket != null,
        dismissalKind: d.wicket ? toDismissalKindFromCricsheet(d.wicket.kind) : null,
        playerOutId,
        fielders: d.wicket && d.wicket.fielders.length ? d.wicket.fielders : undefined,
      });
    }

    // Idempotent rewrite of this innings' deliveries.
    await prisma.delivery.deleteMany({ where: { matchId, inningsNo: inn.inningsNo } });
    for (let i = 0; i < rows.length; i += DELIVERY_CHUNK) {
      await prisma.delivery.createMany({ data: rows.slice(i, i + DELIVERY_CHUNK) });
    }
    deliveriesWritten += rows.length;

    // Derive per-innings batting + bowling lines from the deliveries so the
    // existing scorecard/career-stats UI (which reads *Performance, not Delivery)
    // reflects Cricsheet data with no UI changes. Idempotent rewrite, same as above.
    const { batting, bowling } = derivePerformances(rows, innings.id);
    await prisma.$transaction([
      prisma.battingPerformance.deleteMany({ where: { inningsId: innings.id } }),
      prisma.bowlingPerformance.deleteMany({ where: { inningsId: innings.id } }),
      ...(batting.length ? [prisma.battingPerformance.createMany({ data: batting })] : []),
      ...(bowling.length ? [prisma.bowlingPerformance.createMany({ data: bowling })] : []),
    ]);
  }

  return { matchId, innings: parsed.innings.length, deliveries: deliveriesWritten };
}

/** Wickets credited to the bowler (run-outs and the like are not). */
const BOWLER_WICKETS = new Set<string>([
  "BOWLED",
  "CAUGHT",
  "LBW",
  "STUMPED",
  "CAUGHT_AND_BOWLED",
  "HIT_WICKET",
]);

/**
 * Fold an innings' delivery rows into batting + bowling performance lines —
 * the same aggregates a scorecard shows, computed from the raw events.
 *   - balls faced excludes wides (no-balls/byes/legbyes count as faced);
 *   - runs conceded charges the bowler for wides + no-balls but not byes/legbyes;
 *   - maiden = a full over by one bowler conceding 0 (in their charged runs).
 */
function derivePerformances(
  rows: Prisma.DeliveryCreateManyInput[],
  inningsId: string,
): {
  batting: Prisma.BattingPerformanceCreateManyInput[];
  bowling: Prisma.BowlingPerformanceCreateManyInput[];
} {
  type Bat = {
    order: number;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    dismissal: string;
  };
  type Bowl = { balls: number; runs: number; wickets: number; overRuns: Map<number, number> };

  const bat = new Map<string, Bat>();
  const bowl = new Map<string, Bowl>();
  let order = 0;

  const seenBatter = (id: string): Bat => {
    let b = bat.get(id);
    if (!b) {
      order += 1;
      b = { order, runs: 0, balls: 0, fours: 0, sixes: 0, dismissal: "NOT_OUT" };
      bat.set(id, b);
    }
    return b;
  };

  for (const r of rows) {
    const b = seenBatter(r.batterId);
    b.runs += r.runsBatter ?? 0;
    if (r.extraType !== "wides") b.balls += 1;
    if (r.runsBatter === 4) b.fours += 1;
    if (r.runsBatter === 6) b.sixes += 1;

    let bw = bowl.get(r.bowlerId);
    if (!bw) {
      bw = { balls: 0, runs: 0, wickets: 0, overRuns: new Map() };
      bowl.set(r.bowlerId, bw);
    }
    const isLegal = r.extraType !== "wides" && r.extraType !== "noballs";
    if (isLegal) bw.balls += 1;
    const charged =
      (r.runsBatter ?? 0) +
      (r.extraType === "wides" || r.extraType === "noballs" ? r.runsExtras ?? 0 : 0);
    bw.runs += charged;
    bw.overRuns.set(r.overNo, (bw.overRuns.get(r.overNo) ?? 0) + charged);
    if (r.isWicket && r.dismissalKind && BOWLER_WICKETS.has(r.dismissalKind)) bw.wickets += 1;

    // A dismissed batter is whoever is `playerOut` (may be the non-striker on a run out).
    if (r.isWicket && r.playerOutId && r.dismissalKind) {
      seenBatter(r.playerOutId).dismissal = r.dismissalKind;
    }
  }

  const batting: Prisma.BattingPerformanceCreateManyInput[] = [...bat.entries()].map(
    ([playerId, b]) => ({
      inningsId,
      playerId,
      battingPos: b.order,
      runs: b.runs,
      balls: b.balls,
      fours: b.fours,
      sixes: b.sixes,
      strikeRate: b.balls > 0 ? Number(((b.runs / b.balls) * 100).toFixed(2)) : null,
      dismissal: b.dismissal as Prisma.BattingPerformanceCreateManyInput["dismissal"],
    }),
  );

  const bowling: Prisma.BowlingPerformanceCreateManyInput[] = [...bowl.entries()].map(
    ([playerId, bw]) => {
      let maidens = 0;
      for (const runs of bw.overRuns.values()) if (runs === 0) maidens += 1;
      return {
        inningsId,
        playerId,
        oversText: `${Math.floor(bw.balls / 6)}.${bw.balls % 6}`,
        balls: bw.balls,
        maidens,
        runs: bw.runs,
        wickets: bw.wickets,
        economy: bw.balls > 0 ? Number((bw.runs / (bw.balls / 6)).toFixed(2)) : null,
      };
    },
  );

  return { batting, bowling };
}
