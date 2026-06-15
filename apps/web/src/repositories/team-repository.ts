import type { Prisma } from "@crickverse/db";
import { normalizeName } from "@/core/naming";
import type { TeamProfileRow } from "@/domain/team/team-profile";
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
    const ids = [...new Set(names.filter((n): n is string => !!n).map(normalizeName))];
    if (ids.length === 0) return [];
    return this.prisma.teamProfile.findMany({ where: { id: { in: ids } } });
  }

  /** Win/loss/no-result counts for a team across the whole corpus. */
  async record(displayName: string): Promise<{ played: number; won: number; lost: number; noResult: number }> {
    const rows = await this.prisma.$queryRaw<{ played: bigint; won: bigint; decided: bigint }[]>`
      SELECT count(*) AS played,
        count(*) FILTER (WHERE "winner" = ${displayName}) AS won,
        count(*) FILTER (WHERE "winner" IS NOT NULL) AS decided
      FROM "CareerMatch"
      WHERE "teamHome" = ${displayName} OR "teamAway" = ${displayName}`;
    const r = rows[0] ?? { played: 0n, won: 0n, decided: 0n };
    const played = Number(r.played);
    const won = Number(r.won);
    const decided = Number(r.decided);
    return { played, won, lost: decided - won, noResult: played - decided };
  }

  /** Top squad members for a team (players who batted in the team's innings). */
  async squad(displayName: string, limit = 30): Promise<SquadMember[]> {
    const rows = await this.prisma.$queryRaw<
      { cricsheetId: string; name: string; innings: bigint; runs: bigint }[]
    >`
      SELECT b."cricsheetId", b."name", count(*) AS innings, COALESCE(sum(b."runs"),0) AS runs
      FROM "ScorecardBatting" b
      JOIN "ScorecardInnings" i ON i."matchId" = b."matchId" AND i."inningsNo" = b."inningsNo"
      WHERE i."battingTeam" = ${displayName} AND b."cricsheetId" IS NOT NULL
      GROUP BY b."cricsheetId", b."name"
      ORDER BY innings DESC, runs DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      cricsheetId: r.cricsheetId,
      name: r.name,
      innings: Number(r.innings),
      runs: Number(r.runs),
    }));
  }
}
