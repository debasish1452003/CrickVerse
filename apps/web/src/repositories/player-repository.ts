import type { Prisma } from "@crickverse/db";
import type { CareerPlayerRow } from "@crickverse/domain";
import type { CanonicalPlayerRow } from "@crickverse/domain";
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
    const player = await this.prisma.careerPlayer.findUnique({
      where: { cricsheetId },
      include: { stats: true, coverage: true },
    });
    if (!player) return null;
    // Official totals are keyed by Cricsheet id; the per-innings Statsguru
    // recovery is keyed by ESPNcricinfo id, so it only joins when one is known.
    const [officialStats, inningsHistory] = await Promise.all([
      this.prisma.officialCareerStat.findMany({ where: { cricsheetId } }),
      player.cricinfoId
        ? this.prisma.playerInningsHistory.findMany({
            where: { cricinfoId: player.cricinfoId },
            select: {
              source: true,
              matchClass: true,
              discipline: true,
              matchDate: true,
              opposition: true,
              ground: true,
              didBat: true,
              runs: true,
              notOut: true,
              ballsFaced: true,
              fours: true,
              sixes: true,
              dismissal: true,
              ballsBowled: true,
              runsConceded: true,
              wickets: true,
            },
          })
        : Promise.resolve([]),
    ]);
    return { ...player, officialStats, inningsHistory };
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

  /**
   * Top career run-scorers / wicket-takers, ranked by the COMPLETE career total —
   * the recovered Statsguru figure (incl. pre-2000) where a player has been
   * recovered, falling back to the Cricsheet gold total otherwise. This is why a
   * legend with a mostly pre-Cricsheet career (e.g. Tendulkar's 15,921 Test runs)
   * surfaces here even though the open ball-by-ball corpus only holds part of it.
   *
   * Caveat: recovered totals are international-only (Statsguru class), while the
   * Cricsheet fallback spans all classes — so the two grains are mixed until every
   * ranked player is recovered. Recovered players use their international total.
   */
  topByMetric(by: "runs" | "wickets", limit: number): Promise<CareerPlayerListRow[]> {
    // A player may transiently hold rows from >1 source (bulk stand-in + scrape).
    // We sum ONLY the highest-precedence source's rows (scrape > bulk) so the
    // total is never double-counted across sources.
    if (by === "runs") {
      return this.prisma.$queryRaw<CareerPlayerListRow[]>`
        WITH pref AS (
          SELECT DISTINCT ON ("cricinfoId") "cricinfoId", source
          FROM "PlayerInningsHistory"
          ORDER BY "cricinfoId",
            CASE source WHEN 'CRICINFO_STATSGURU' THEN 0 WHEN 'CRICINFO_BULK' THEN 1 ELSE 2 END
        )
        SELECT cp."cricsheetId", cp.name, cp."cricinfoId", cp.gender, cp."careerMatches",
          COALESCE(pi.runs, cp."careerRuns")::int AS "careerRuns",
          cp."careerWickets"
        FROM "CareerPlayer" cp
        LEFT JOIN (
          SELECT p."cricinfoId", SUM(p.runs)::int AS runs
          FROM "PlayerInningsHistory" p
          JOIN pref ON pref."cricinfoId" = p."cricinfoId" AND pref.source = p.source
          WHERE p.discipline = 'batting' AND p."didBat" = true AND p.runs IS NOT NULL
          GROUP BY p."cricinfoId"
        ) pi ON pi."cricinfoId" = cp."cricinfoId"
        ORDER BY COALESCE(pi.runs, cp."careerRuns") DESC
        LIMIT ${limit}`;
    }
    return this.prisma.$queryRaw<CareerPlayerListRow[]>`
      WITH pref AS (
        SELECT DISTINCT ON ("cricinfoId") "cricinfoId", source
        FROM "PlayerInningsHistory"
        ORDER BY "cricinfoId",
          CASE source WHEN 'CRICINFO_STATSGURU' THEN 0 WHEN 'CRICINFO_BULK' THEN 1 ELSE 2 END
      )
      SELECT cp."cricsheetId", cp.name, cp."cricinfoId", cp.gender, cp."careerMatches",
        cp."careerRuns",
        COALESCE(pw.wkts, cp."careerWickets")::int AS "careerWickets"
      FROM "CareerPlayer" cp
      LEFT JOIN (
        SELECT p."cricinfoId", SUM(p.wickets)::int AS wkts
        FROM "PlayerInningsHistory" p
        JOIN pref ON pref."cricinfoId" = p."cricinfoId" AND pref.source = p.source
        WHERE p.discipline = 'bowling' AND p.wickets IS NOT NULL
        GROUP BY p."cricinfoId"
      ) pw ON pw."cricinfoId" = cp."cricinfoId"
      ORDER BY COALESCE(pw.wkts, cp."careerWickets") DESC
      LIMIT ${limit}`;
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
