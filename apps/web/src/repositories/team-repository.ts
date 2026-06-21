import { Prisma } from "@crickverse/db";
import { canonicalTeamId } from "@crickverse/domain";
import type { TeamProfileRow } from "@crickverse/domain";
import type { SquadMember } from "@/dto/player-dto";
import { BaseRepository } from "./base-repository";

/** Data access for team enrichment profiles + corpus-wide team records. */
export class TeamRepository extends BaseRepository {
  /** Teams for the hub, ordered by match volume; optional name + national filter. */
  listProfiles(opts: { q?: string; national?: boolean } = {}): Promise<TeamProfileRow[]> {
    const q = opts.q?.trim();
    const where: Prisma.TeamProfileWhereInput = {};
    if (q) where.displayName = { contains: q, mode: "insensitive" };
    if (opts.national !== undefined) where.isNational = opts.national;
    return this.prisma.teamProfile.findMany({
      where,
      orderBy: [{ matchCount: "desc" }, { displayName: "asc" }],
    });
  }

  /** One team profile by its normalized-name id. */
  profileById(id: string): Promise<TeamProfileRow | null> {
    return this.prisma.teamProfile.findUnique({ where: { id } });
  }

  /** Profiles for a batch of raw team names (deduped, normalized) — badge lookups. */
  async profilesByNames(names: (string | null | undefined)[]): Promise<TeamProfileRow[]> {
    const ids = [...new Set(names.filter((n): n is string => !!n).map(canonicalTeamId))];
    if (ids.length === 0) return [];
    return this.prisma.teamProfile.findMany({ where: { id: { in: ids } } });
  }

  /** Distinct match genders available for a team id, newest corpus first by count. */
  async gendersForTeam(teamId: string): Promise<string[]> {
    const rows = await this.prisma.careerMatch.groupBy({
      by: ["gender"],
      where: {
        OR: [{ teamHomeId: teamId }, { teamAwayId: teamId }],
        gender: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { gender: "desc" } },
    });
    return rows.map((r) => r.gender).filter((g): g is string => g != null);
  }

  /** Win/loss/no-result counts for a team in the indexed gold corpus. */
  async record(teamId: string, gender?: string): Promise<{
    played: number;
    won: number;
    lost: number;
    noResult: number;
    firstMatchDate: string | null;
    lastMatchDate: string | null;
  }> {
    const genderFilter = gender ? Prisma.sql`AND "gender" = ${gender}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      { played: bigint; won: bigint; decided: bigint; firstMatchDate: string | null; lastMatchDate: string | null }[]
    >`
      SELECT count(*) AS played,
        count(*) FILTER (WHERE "winnerId" = ${teamId}) AS won,
        count(*) FILTER (WHERE "winner" IS NOT NULL) AS decided,
        min("matchDate") AS "firstMatchDate",
        max("matchDate") AS "lastMatchDate"
      FROM "CareerMatch"
      WHERE ("teamHomeId" = ${teamId} OR "teamAwayId" = ${teamId})
        ${genderFilter}`;
    const r = rows[0] ?? { played: 0n, won: 0n, decided: 0n, firstMatchDate: null, lastMatchDate: null };
    const played = Number(r.played);
    const won = Number(r.won);
    const decided = Number(r.decided);
    return {
      played,
      won,
      lost: decided - won,
      noResult: played - decided,
      firstMatchDate: r.firstMatchDate,
      lastMatchDate: r.lastMatchDate,
    };
  }

  /** All raw team-name variants that map to one canonical team id. */
  private async namesForTeamId(teamId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ name: string }[]>`
      SELECT DISTINCT name FROM (
        SELECT "teamHome" AS name FROM "CareerMatch" WHERE "teamHomeId" = ${teamId}
        UNION SELECT "teamAway" FROM "CareerMatch" WHERE "teamAwayId" = ${teamId}
      ) x WHERE name IS NOT NULL`;
    return rows.map((r) => r.name);
  }

  /** Top squad members for a team (players who batted in the team's innings). */
  async squad(teamId: string, limit = 30, gender?: string): Promise<SquadMember[]> {
    // ScorecardInnings keys batting side by raw name, so resolve the id's names.
    const names = await this.namesForTeamId(teamId);
    if (names.length === 0) return [];
    const genderJoin = gender ? Prisma.sql`JOIN "CareerMatch" m ON m."matchId" = b."matchId"` : Prisma.empty;
    const genderFilter = gender ? Prisma.sql`AND m."gender" = ${gender}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      { cricsheetId: string; name: string; innings: bigint; runs: bigint; photoUrl: string | null }[]
    >`
      SELECT b."cricsheetId", b."name", count(*) AS innings, COALESCE(sum(b."runs"),0) AS runs,
        max(pp."photoUrl") AS "photoUrl"
      FROM "ScorecardBatting" b
      JOIN "ScorecardInnings" i ON i."matchId" = b."matchId" AND i."inningsNo" = b."inningsNo"
      ${genderJoin}
      LEFT JOIN "PlayerProfile" pp ON pp."cricsheetId" = b."cricsheetId"
      WHERE i."battingTeam" IN (${Prisma.join(names)}) AND b."cricsheetId" IS NOT NULL
        ${genderFilter}
      GROUP BY b."cricsheetId", b."name"
      ORDER BY innings DESC, runs DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      cricsheetId: r.cricsheetId,
      name: r.name,
      innings: Number(r.innings),
      runs: Number(r.runs),
      photoUrl: r.photoUrl,
    }));
  }
}
