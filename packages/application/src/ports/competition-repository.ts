export interface CompetitionGroup {
  eventName: string | null;
  season: string | null;
  matches: number;
}

export interface CompetitionRepository {
  groups(): Promise<CompetitionGroup[]>;
  logo(eventName: string | null | undefined): Promise<string | null>;
  logosByNames(names: (string | null | undefined)[]): Promise<Map<string, string>>;
}
