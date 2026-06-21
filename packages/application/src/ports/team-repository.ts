import type { TeamProfileRow } from "@crickverse/domain";
import type { SquadMember } from "../dto/player-dto";

export interface TeamRepository {
  listProfiles(opts?: { q?: string; national?: boolean }): Promise<TeamProfileRow[]>;
  profileById(id: string): Promise<TeamProfileRow | null>;
  profilesByNames(names: (string | null | undefined)[]): Promise<TeamProfileRow[]>;
  gendersForTeam(teamId: string): Promise<string[]>;
  record(teamId: string, gender?: string): Promise<{
    played: number;
    won: number;
    lost: number;
    noResult: number;
    firstMatchDate: string | null;
    lastMatchDate: string | null;
  }>;
  squad(teamId: string, limit?: number, gender?: string): Promise<SquadMember[]>;
}
