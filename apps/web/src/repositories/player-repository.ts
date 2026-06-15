import type { Prisma } from "@crickverse/db";
import type { CareerPlayerRow } from "@/domain/player/career-player";
import type { CanonicalPlayerRow } from "@/domain/player/player";
import { BaseRepository } from "./base-repository";

/** Narrow per-row selection for career-player browse cards. */
const careerListSelect = {
  cricsheetId: true,
  name: true,
  cricinfoId: true,
  gender: true,
  careerMatches: true,
  careerRuns: true,
  careerWickets: true,
} satisfies Prisma.CareerPlayerSelect;

export type CareerPlayerListRow = Prisma.CareerPlayerGetPayload<{ select: typeof careerListSelect }>;

// Career aggregation needs every innings (for exact HS/BBI/100s/50s), but only a
// handful of scalar fields per row — so we `select` narrowly instead of hydrating
// the full Match + Series on each of a prolific player's rows.
const canonicalInclude = {
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

export interface PlayerProfileRow {
  cricsheetId: string;
  photoUrl: string | null;
  role: string | null;
  dateOfBirth: string | null;
  birthPlace: string | null;
  battingStyle: string | null;
  bowlingStyle: string | null;
  photoFilePage: string | null;
  photoCredit: string | null;
  photoLicense: string | null;
}

/** Data access for players (gold career corpus + canonical cuid records). */
export class PlayerRepository extends BaseRepository {
  /** Full gold career record (stats included), keyed by Cricsheet id. */
  async careerPlayer(cricsheetId: string): Promise<CareerPlayerRow | null> {
    const [player, officialStats] = await Promise.all([
      this.prisma.careerPlayer.findUnique({
        where: { cricsheetId },
        include: { stats: true, coverage: true },
      }),
      this.prisma.officialCareerStat.findMany({ where: { cricsheetId } }),
    ]);
    return player ? { ...player, officialStats } : null;
  }

  /** Canonical player aggregate (cuid) with batting/bowling performances. */
  canonicalPlayer(id: string): Promise<CanonicalPlayerRow | null> {
    return this.prisma.player.findUnique({ where: { id }, include: canonicalInclude });
  }

  /** Enrichment profile (photo + bio) for one player, or null. */
  profile(cricsheetId: string): Promise<PlayerProfileRow | null> {
    return this.prisma.playerProfile.findUnique({ where: { cricsheetId } });
  }

  /** Photo + role for a set of players, keyed by Cricsheet id. */
  async profilesByIds(ids: string[]): Promise<Map<string, { photoUrl: string | null; role: string | null }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.playerProfile.findMany({
      where: { cricsheetId: { in: ids } },
      select: { cricsheetId: true, photoUrl: true, role: true },
    });
    return new Map(rows.map((p) => [p.cricsheetId, { photoUrl: p.photoUrl, role: p.role }]));
  }

  /** Photo-only lookup for a set of players (leaderboards). */
  async photosByIds(ids: string[]): Promise<Map<string, string | null>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.playerProfile.findMany({
      where: { cricsheetId: { in: ids } },
      select: { cricsheetId: true, photoUrl: true },
    });
    return new Map(rows.map((p) => [p.cricsheetId, p.photoUrl]));
  }

  /** Top career run-scorers or wicket-takers (gold). */
  topByMetric(by: "runs" | "wickets", limit: number): Promise<CareerPlayerListRow[]> {
    return this.prisma.careerPlayer.findMany({
      orderBy: by === "runs" ? [{ careerRuns: "desc" }] : [{ careerWickets: "desc" }],
      take: limit,
      select: careerListSelect,
    });
  }

  private static careerWhere(q?: string): Prisma.CareerPlayerWhereInput {
    const t = q?.trim();
    return t ? { name: { contains: t, mode: "insensitive" } } : {};
  }

  /** Total career players matching the optional name query. */
  countCareer(q?: string): Promise<number> {
    return this.prisma.careerPlayer.count({ where: PlayerRepository.careerWhere(q) });
  }

  /** One page of career-player browse rows (caller clamps skip/take). */
  pageCareer(opts: { q?: string; skip: number; take: number }): Promise<CareerPlayerListRow[]> {
    return this.prisma.careerPlayer.findMany({
      where: PlayerRepository.careerWhere(opts.q),
      orderBy: [{ careerRuns: "desc" }, { cricsheetId: "asc" }],
      skip: opts.skip,
      take: opts.take,
      select: careerListSelect,
    });
  }
}
