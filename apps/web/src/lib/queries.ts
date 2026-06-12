import { cache } from "react";
import type { Prisma } from "@crickverse/db";
import { prisma } from "./db";

// Server-only typed data access. Server Components call these directly —
// Postgres is the BFF, so reads don't go through an internal REST layer.

const matchInclude = {
  series: true,
  venue: true,
  homeTeam: true,
  awayTeam: true,
} satisfies Prisma.MatchInclude;

export type MatchWithRelations = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

export function listMatches(): Promise<MatchWithRelations[]> {
  return prisma.match.findMany({
    include: matchInclude,
    orderBy: [{ startTime: "asc" }],
  });
}

const matchDetailInclude = {
  ...matchInclude,
  innings: {
    orderBy: { inningsNo: "asc" },
    include: {
      battingTeam: true,
      battingPerfs: { orderBy: { battingPos: "asc" }, include: { player: true } },
      bowlingPerfs: { include: { player: true } },
    },
  },
} satisfies Prisma.MatchInclude;

export type MatchDetail = Prisma.MatchGetPayload<{ include: typeof matchDetailInclude }>;

export function getMatchById(id: string): Promise<MatchDetail | null> {
  return prisma.match.findUnique({
    where: { id },
    include: matchDetailInclude,
  });
}

// Career aggregation needs every innings (for exact HS/BBI/100s/50s), but only a
// handful of scalar fields per row — so we `select` narrowly instead of hydrating
// the full ~24-column Match + Series on each of a prolific player's rows.
const playerInclude = {
  battingPerfs: {
    select: {
      id: true,
      runs: true,
      balls: true,
      fours: true,
      sixes: true,
      dismissal: true,
      innings: {
        select: {
          match: {
            select: {
              id: true,
              title: true,
              matchClass: true,
              matchDate: true,
              startTime: true,
              series: { select: { name: true } },
            },
          },
        },
      },
    },
  },
  bowlingPerfs: {
    select: {
      id: true,
      balls: true,
      runs: true,
      wickets: true,
      innings: { select: { match: { select: { id: true, matchClass: true } } } },
    },
  },
} satisfies Prisma.PlayerInclude;

export type PlayerWithPerfs = Prisma.PlayerGetPayload<{ include: typeof playerInclude }>;

export function getPlayerById(id: string): Promise<PlayerWithPerfs | null> {
  return prisma.player.findUnique({ where: { id }, include: playerInclude });
}

// ── Gold layer (the complete-corpus careers, keyed by Cricsheet player id) ───

export type CareerPlayerWithStats = Prisma.CareerPlayerGetPayload<{ include: { stats: true } }>;

/** A player's complete per-format career from the lakehouse gold tables. */
export function getCareerPlayer(cricsheetId: string): Promise<CareerPlayerWithStats | null> {
  return prisma.careerPlayer.findUnique({ where: { cricsheetId }, include: { stats: true } });
}

export interface CareerPlayerListItem {
  cricsheetId: string;
  name: string;
  cricinfoId: string | null;
  gender: string | null;
  careerMatches: number;
  careerRuns: number;
  careerWickets: number;
}

export interface CareerSearchResult {
  items: CareerPlayerListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * Paginated search over the gold CareerPlayer table (the full corpus). Ordered by
 * career runs desc so the most prolific players surface first; cricsheetId breaks
 * ties for deterministic pagination.
 */
export async function searchCareerPlayers(opts: {
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<CareerSearchResult> {
  const pageSize = opts.pageSize ?? PLAYERS_PAGE_SIZE;
  const requested = Math.max(1, Math.floor(opts.page ?? 1) || 1);
  const q = opts.q?.trim();
  const where: Prisma.CareerPlayerWhereInput = q
    ? { name: { contains: q, mode: "insensitive" } }
    : {};

  const total = await prisma.careerPlayer.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, pageCount);

  const items = await prisma.careerPlayer.findMany({
    where,
    orderBy: [{ careerRuns: "desc" }, { cricsheetId: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      cricsheetId: true,
      name: true,
      cricinfoId: true,
      gender: true,
      careerMatches: true,
      careerRuns: true,
      careerWickets: true,
    },
  });

  return { items, total, page, pageSize, pageCount };
}

// ── Gold matches + scorecards (full corpus) ──────────────────────────────────

export type GoldMatchDetail = Prisma.CareerMatchGetPayload<{
  include: { innings: true; batting: true; bowling: true };
}>;

/** A full match + scorecard from the gold tables, keyed by Cricsheet match id. */
export function getGoldMatch(matchId: string): Promise<GoldMatchDetail | null> {
  return prisma.careerMatch.findUnique({
    where: { matchId },
    include: {
      innings: { orderBy: { inningsNo: "asc" } },
      batting: { orderBy: [{ inningsNo: "asc" }, { battingPos: "asc" }] },
      bowling: { orderBy: [{ inningsNo: "asc" }, { bowlingPos: "asc" }] },
    },
  });
}

export interface GoldMatchListItem {
  matchId: string;
  matchClass: string;
  eventName: string | null;
  matchDate: string | null;
  venue: string | null;
  teamHome: string | null;
  teamAway: string | null;
  winner: string | null;
  inn1Score: string | null;
  inn2Score: string | null;
}

export interface MatchSearchResult {
  items: GoldMatchListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export const MATCHES_PAGE_SIZE = 30;

/** Paginated match browser: filter by free-text (teams/event/venue) + class, newest first. */
export async function searchMatches(opts: {
  q?: string;
  matchClass?: string;
  /** Exact competition name — powers the series/tournament edition page. */
  eventName?: string;
  /** Exact season — used together with eventName to scope to one edition. */
  season?: string;
  page?: number;
  pageSize?: number;
}): Promise<MatchSearchResult> {
  const pageSize = opts.pageSize ?? MATCHES_PAGE_SIZE;
  const requested = Math.max(1, Math.floor(opts.page ?? 1) || 1);
  const q = opts.q?.trim();
  const and: Prisma.CareerMatchWhereInput[] = [];
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
  if (opts.matchClass) and.push({ matchClass: opts.matchClass });
  // Exact event/season filters (the series edition view). `eventName: null` is the
  // bilateral/"Other" bucket; an explicit null filter selects exactly those rows.
  if (opts.eventName !== undefined) and.push({ eventName: opts.eventName || null });
  if (opts.season !== undefined) and.push({ season: opts.season || null });
  const where: Prisma.CareerMatchWhereInput = and.length ? { AND: and } : {};

  const total = await prisma.careerMatch.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, pageCount);

  const items = await prisma.careerMatch.findMany({
    where,
    orderBy: [{ matchDate: "desc" }, { matchId: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
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
    },
  });

  return { items, total, page, pageSize, pageCount };
}

// ── Series / Tournaments (competitions grouped from gold matches) ────────────

/** URL segment standing in for matches with no eventName (bilateral / unlabelled). */
export const OTHER_COMPETITION = "__other__";
/** Display name for the no-event bucket. */
export const OTHER_COMPETITION_LABEL = "Other / Bilateral matches";
/** URL segment standing in for a season-less edition (rare, but keeps URLs valid). */
export const NO_SEASON = "__noseason__";

export interface CompetitionSeason {
  season: string | null;
  matches: number;
}

export interface Competition {
  /** Raw eventName, or null for the bilateral/"Other" bucket. */
  eventName: string | null;
  /** Display name (eventName, or the Other label for the null bucket). */
  name: string;
  seasons: CompetitionSeason[];
  totalMatches: number;
  latestSeason: string | null;
}

// Newest season first; null seasons sink to the bottom. Seasons are strings like
// "2024" or "2007/08", so a plain string compare orders them well enough.
function bySeasonDesc(a: CompetitionSeason, b: CompetitionSeason): number {
  if (a.season === b.season) return 0;
  if (a.season == null) return 1;
  if (b.season == null) return -1;
  return b.season.localeCompare(a.season);
}

/**
 * Every competition in the corpus, folded from a single groupBy over the gold
 * matches. One DB round-trip powers both the series index and the per-event page,
 * so it's wrapped in React `cache()` to dedupe within a request. groupBy returns
 * only the distinct (eventName, season) pairs — cheap even over 22k matches, and
 * eventName/season are both indexed on CareerMatch.
 */
export const getCompetitions = cache(async (): Promise<Competition[]> => {
  const groups = await prisma.careerMatch.groupBy({
    by: ["eventName", "season"],
    _count: { _all: true },
  });

  const byEvent = new Map<string | null, Competition>();
  for (const g of groups) {
    const key = g.eventName ?? null;
    let comp = byEvent.get(key);
    if (!comp) {
      comp = {
        eventName: key,
        name: key ?? OTHER_COMPETITION_LABEL,
        seasons: [],
        totalMatches: 0,
        latestSeason: null,
      };
      byEvent.set(key, comp);
    }
    comp.seasons.push({ season: g.season ?? null, matches: g._count._all });
    comp.totalMatches += g._count._all;
  }

  const comps = [...byEvent.values()];
  for (const c of comps) {
    c.seasons.sort(bySeasonDesc);
    c.latestSeason = c.seasons.find((s) => s.season != null)?.season ?? null;
  }
  // Most-played competitions first; the Other bucket is treated like any event.
  comps.sort((a, b) => b.totalMatches - a.totalMatches);
  return comps;
});

/** Look up one competition by its raw eventName (null for the Other bucket). */
export async function getCompetition(eventName: string | null): Promise<Competition | null> {
  const comps = await getCompetitions();
  return comps.find((c) => c.eventName === eventName) ?? null;
}

// ── Player search / browse ──────────────────────────────────────────────────

export const PLAYERS_PAGE_SIZE = 36;

export interface PlayerListItem {
  id: string;
  fullName: string;
  knownAs: string | null;
  country: string | null;
  role: string | null;
  /** Career headline numbers (across all formats), for the browse cards. */
  runs: number;
  wickets: number;
  innings: number;
}

export interface PlayerSearchResult {
  items: PlayerListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * Paginated player search by name. Looks up the page of players first, then
 * batches two groupBy aggregates (career runs + innings, career wickets) for
 * just that page's ids — so it stays cheap no matter how large the player table
 * grows once the full archives are ingested.
 */
export async function searchPlayers(opts: {
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<PlayerSearchResult> {
  const pageSize = opts.pageSize ?? PLAYERS_PAGE_SIZE;
  // Floor (a fractional ?page= would make Prisma's skip non-integer and throw).
  const requested = Math.max(1, Math.floor(opts.page ?? 1) || 1);
  const q = opts.q?.trim();
  const where: Prisma.PlayerWhereInput = q
    ? {
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { knownAs: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  // Count first so we can clamp the page into range (out-of-range → last page,
  // not an empty list with a nonsensical "Page 9999 of 6").
  const total = await prisma.player.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, pageCount);

  const players = await prisma.player.findMany({
    where,
    // fullName is not unique — add the cuid PK as a tiebreaker so offset
    // pagination is deterministic (no skipped/duplicated rows across pages).
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: { id: true, fullName: true, knownAs: true, country: true, role: true },
  });

  const ids = players.map((p) => p.id);
  const [bat, bowl] = ids.length
    ? await Promise.all([
        prisma.battingPerformance.groupBy({
          by: ["playerId"],
          where: { playerId: { in: ids } },
          _sum: { runs: true },
          _count: { _all: true },
        }),
        prisma.bowlingPerformance.groupBy({
          by: ["playerId"],
          where: { playerId: { in: ids } },
          _sum: { wickets: true },
        }),
      ])
    : [[], []];

  const batBy = new Map(bat.map((r) => [r.playerId, { runs: r._sum.runs ?? 0, innings: r._count._all }]));
  const wktBy = new Map(bowl.map((r) => [r.playerId, r._sum.wickets ?? 0]));

  const items: PlayerListItem[] = players.map((p) => ({
    ...p,
    runs: batBy.get(p.id)?.runs ?? 0,
    innings: batBy.get(p.id)?.innings ?? 0,
    wickets: wktBy.get(p.id) ?? 0,
  }));

  return { items, total, page, pageSize, pageCount };
}
