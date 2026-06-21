import { TeamBadgeIndex, TeamProfile, TeamRecord } from "@crickverse/domain";
import type { SquadMember } from "../dto/player-dto";
import type { TeamRepository } from "../ports/team-repository";

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

  /** Distinct match genders available for a team id, e.g. male/female. */
  gendersForTeam(teamId: string): Promise<string[]> {
    return this.teams.gendersForTeam(teamId);
  }

  /** Win/loss record for a team across the whole corpus. */
  async record(teamId: string, gender?: string): Promise<TeamRecord> {
    const r = await this.teams.record(teamId, gender);
    return new TeamRecord(r.played, r.won, r.lost, r.noResult, r.firstMatchDate, r.lastMatchDate);
  }

  /** Most-capped squad members for a team. */
  squad(teamId: string, limit = 30, gender?: string): Promise<SquadMember[]> {
    return this.teams.squad(teamId, limit, gender);
  }
}
