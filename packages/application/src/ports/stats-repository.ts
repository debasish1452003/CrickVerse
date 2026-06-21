import type { StandingsInnings, StandingsMatch } from "@crickverse/domain";

export interface EditionBattingRow {
  cricsheetId: string | null;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
}

export interface EditionBowlingRow {
  cricsheetId: string | null;
  name: string;
  balls: number;
  runs: number;
  wickets: number;
}

export interface SquadInningsRow {
  matchId: string;
  inningsNo: number;
  battingTeam: string | null;
}

export interface SquadBattingRow {
  matchId: string;
  inningsNo: number;
  cricsheetId: string | null;
  name: string;
  runs: number;
}

export interface SquadBowlingRow {
  matchId: string;
  inningsNo: number;
  cricsheetId: string | null;
  name: string;
  wickets: number;
}

export interface EditionVenueRow {
  venue: string | null;
  city: string | null;
  matches: number;
}

export interface StatsRepository {
  editionMatches(eventName: string | null, season: string | null): Promise<{ matchId: string; matchClass: string }[]>;
  editionBatting(matchIds: string[]): Promise<EditionBattingRow[]>;
  editionBowling(matchIds: string[]): Promise<EditionBowlingRow[]>;
  playerPhotosByIds(ids: string[]): Promise<Map<string, string | null>>;
  standingsMatches(eventName: string | null, season: string | null): Promise<StandingsMatch[]>;
  standingsInnings(matchIds: string[]): Promise<Map<string, StandingsInnings[]>>;
  squadMatches(eventName: string | null, season: string | null): Promise<{ matchId: string; teamHome: string | null; teamAway: string | null }[]>;
  squadInnings(matchIds: string[]): Promise<SquadInningsRow[]>;
  squadBatting(matchIds: string[]): Promise<SquadBattingRow[]>;
  squadBowling(matchIds: string[]): Promise<SquadBowlingRow[]>;
  editionVenues(eventName: string | null, season: string | null): Promise<EditionVenueRow[]>;
}
