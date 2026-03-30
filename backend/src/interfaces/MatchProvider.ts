export interface Match {
  matchId: string | number;
  seriesName: string;
  matchTitle: string;
  status: string;
  team1: { name: string; score: string };
  team2: { name: string; score: string };
}

export interface MatchProvider {
  fetchLiveScores(): Promise<Match[]>;
}
