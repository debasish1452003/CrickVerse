import { TeamBadgeIndex, TeamProfile, TeamRecord } from "@/domain/team/team-profile";
import type { SquadMember } from "@/dto/player-dto";
import type { TeamRepository } from "@/repositories/team-repository";

/** Team application service — enrichment profiles, badges, records, squads. */
export class TeamService {
  constructor(private readonly teams: TeamRepository) {}

  /** Teams for the hub (optional name search + national filter). */
  async listProfiles(opts: { q?: string; national?: boolean } = {}): Promise<TeamProfile[]> {
    const rows = await this.teams.listProfiles(opts);
    return rows.map((r) => new TeamProfile(r));
  }

  /** One team profile by its normalized-name id. */
  async profileById(id: string): Promise<TeamProfile | null> {
    const row = await this.teams.profileById(id);
    return row ? new TeamProfile(row) : null;
  }

  /** A crest lookup index for a batch of raw team names. */
  async badgeIndex(names: (string | null | undefined)[]): Promise<TeamBadgeIndex> {
    const rows = await this.teams.profilesByNames(names);
    return TeamBadgeIndex.from(rows);
  }

  /** Win/loss record for a team across the whole corpus. */
  async record(displayName: string): Promise<TeamRecord> {
    const r = await this.teams.record(displayName);
    return new TeamRecord(r.played, r.won, r.lost, r.noResult);
  }

  /** Most-capped squad members for a team. */
  squad(displayName: string, limit = 30): Promise<SquadMember[]> {
    return this.teams.squad(displayName, limit);
  }
}
