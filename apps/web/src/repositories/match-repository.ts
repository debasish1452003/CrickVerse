import type { Prisma } from "@crickverse/db";
import type { CanonicalMatchRow } from "@/domain/match/canonical-match";
import type { GoldMatchRow } from "@/domain/match/gold-match";
import type { GoldMatchListItem, InningsOversData, MatchListRow, OverPoint } from "@/dto/match-dto";
import { BaseRepository } from "./base-repository";

/** Filters shared by the match browser / series-edition / team-match queries. */
export interface MatchFilter {
  q?: string;
  matchClass?: string;
  /** Exact competition name (the series edition view). */
  eventName?: string;
  /** Exact season — used with eventName to scope to one edition. */
  season?: string;
}

const listSelect = {
  matchId: true,
  matchClass: true,
  eventName: true,
  matchDate: true,
  venue: true,
  teamHome: true,
  teamAway: true,
  winner: true,
  inn1Score: true,
  inn2Score: true,
} satisfies Prisma.CareerMatchSelect;

const canonicalInclude = {
  series: true,
  venue: true,
  homeTeam: true,
  awayTeam: true,
} satisfies Prisma.MatchInclude;

const canonicalDetailInclude = {
  ...canonicalInclude,
  innings: {
    orderBy: { inningsNo: "asc" },
    include: {
      battingTeam: true,
      battingPerfs: { orderBy: { battingPos: "asc" }, include: { player: true } },
      bowlingPerfs: { include: { player: true } },
    },
  },
} satisfies Prisma.MatchInclude;

export interface EditionMeta {
  matches: number;
  firstDate: string | null;
  lastDate: string | null;
  dominantClass: string | null;
}

/** Data access for matches (canonical detail + gold corpus list/detail). */
export class MatchRepository extends BaseRepository {
  /** Every canonical match with relations — the JSON match list. */
  listCanonical(): Promise<MatchListRow[]> {
    return this.prisma.match.findMany({ include: canonicalInclude, orderBy: [{ startTime: "asc" }] });
  }

  /** Canonical match (cuid) with list relations only — for the JSON DTO. */
  canonicalForList(id: string): Promise<MatchListRow | null> {
    return this.prisma.match.findUnique({ where: { id }, include: canonicalInclude });
  }

  /** Canonical match detail (cuid), full scorecard relations. */
  canonicalMatch(id: string): Promise<CanonicalMatchRow | null> {
    return this.prisma.match.findUnique({ where: { id }, include: canonicalDetailInclude });
  }

  /** Gold match detail (Cricsheet id) with flat batting/bowling lines. */
  goldMatch(matchId: string): Promise<GoldMatchRow | null> {
    return this.prisma.careerMatch.findUnique({
      where: { matchId },
      include: {
        innings: { orderBy: { inningsNo: "asc" } },
        batting: { orderBy: [{ inningsNo: "asc" }, { battingPos: "asc" }] },
        bowling: { orderBy: [{ inningsNo: "asc" }, { bowlingPos: "asc" }] },
      },
    });
  }

  /** Per-innings over arrays for a match (worm/Manhattan charts). */
  async inningsOvers(matchId: string): Promise<InningsOversData[]> {
    const rows = await this.prisma.inningsOvers.findMany({
      where: { matchId },
      orderBy: { inningsNo: "asc" },
    });
    return rows.map((r) => ({
      inningsNo: r.inningsNo,
      overs: (r.overs ?? []) as unknown as OverPoint[],
    }));
  }

  private static where(f: MatchFilter): Prisma.CareerMatchWhereInput {
    const and: Prisma.CareerMatchWhereInput[] = [];
    const q = f.q?.trim();
    if (q) {
      and.push({
        OR: [
          { teamHome: { contains: q, mode: "insensitive" } },
          { teamAway: { contains: q, mode: "insensitive" } },
          { eventName: { contains: q, mode: "insensitive" } },
          { venue: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    if (f.matchClass) and.push({ matchClass: f.matchClass });
    // `eventName: null` is the bilateral/"Other" bucket; an explicit null filter
    // selects exactly those rows (empty string from the URL → null).
    if (f.eventName !== undefined) and.push({ eventName: f.eventName || null });
    if (f.season !== undefined) and.push({ season: f.season || null });
    return and.length ? { AND: and } : {};
  }

  countMatches(filter: MatchFilter): Promise<number> {
    return this.retryRead(() => this.prisma.careerMatch.count({ where: MatchRepository.where(filter) }));
  }

  pageMatches(filter: MatchFilter, skip: number, take: number): Promise<GoldMatchListItem[]> {
    return this.retryRead(() =>
      this.prisma.careerMatch.findMany({
        where: MatchRepository.where(filter),
        orderBy: [{ matchDate: "desc" }, { matchId: "asc" }],
        skip,
        take,
        select: listSelect,
      }),
    );
  }

  private static teamWhere(displayName: string): Prisma.CareerMatchWhereInput {
    return { OR: [{ teamHome: displayName }, { teamAway: displayName }] };
  }

  countTeamMatches(displayName: string): Promise<number> {
    return this.retryRead(() => this.prisma.careerMatch.count({ where: MatchRepository.teamWhere(displayName) }));
  }

  pageTeamMatches(displayName: string, skip: number, take: number): Promise<GoldMatchListItem[]> {
    return this.retryRead(() =>
      this.prisma.careerMatch.findMany({
        where: MatchRepository.teamWhere(displayName),
        orderBy: [{ matchDate: "desc" }, { matchId: "asc" }],
        skip,
        take,
        select: listSelect,
      }),
    );
  }

  /** Aggregate facts for one tournament edition (count, date span, dominant class). */
  async editionMeta(eventName: string | null, season: string | null): Promise<EditionMeta> {
    const [agg, classes] = await Promise.all([
      this.prisma.careerMatch.aggregate({
        where: { eventName, season },
        _count: { _all: true },
        _min: { matchDate: true },
        _max: { matchDate: true },
      }),
      this.prisma.careerMatch.groupBy({
        by: ["matchClass"],
        where: { eventName, season },
        _count: { _all: true },
      }),
    ]);
    const dominant = classes.sort((a, b) => b._count._all - a._count._all)[0]?.matchClass ?? null;
    return {
      matches: agg._count._all,
      firstDate: agg._min.matchDate,
      lastDate: agg._max.matchDate,
      dominantClass: dominant,
    };
  }
}
