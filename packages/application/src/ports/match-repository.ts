import type { CanonicalMatchRow, GoldMatchRow } from "@crickverse/domain";
import type { GoldMatchListItem, InningsOversData, MatchListRow } from "../dto/match-dto";

export interface MatchFilter {
  q?: string;
  matchClass?: string;
  eventName?: string;
  season?: string;
}

export interface EditionMeta {
  matches: number;
  firstDate: string | null;
  lastDate: string | null;
  dominantClass: string | null;
}

export interface MatchRepository {
  listCanonical(): Promise<MatchListRow[]>;
  canonicalForList(id: string): Promise<MatchListRow | null>;
  goldMatch(matchId: string): Promise<GoldMatchRow | null>;
  canonicalMatch(id: string): Promise<CanonicalMatchRow | null>;
  inningsOvers(matchId: string): Promise<InningsOversData[]>;
  countMatches(filter: MatchFilter): Promise<number>;
  pageMatches(filter: MatchFilter, skip: number, take: number): Promise<GoldMatchListItem[]>;
  countTeamMatches(teamId: string, gender?: string): Promise<number>;
  pageTeamMatches(teamId: string, skip: number, take: number, gender?: string): Promise<GoldMatchListItem[]>;
  editionMeta(eventName: string | null, season: string | null): Promise<EditionMeta>;
}
