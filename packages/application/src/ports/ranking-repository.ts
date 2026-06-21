export interface EloMatchRow {
  matchClass: string;
  matchDate: string | null;
  matchId: string;
  teamHome: string | null;
  teamAway: string | null;
  winner: string | null;
}

export interface CareerStatLeaderRow {
  cricsheetId: string;
  matches: number;
  runs: number;
  battingAvg: number | null;
  wickets: number;
  economy: number | null;
  bowlingAvg: number | null;
  player: { name: string };
}

export interface RankingRepository {
  eloMatches(classes: string[]): Promise<EloMatchRow[]>;
  topBatters(matchClass: string, limit: number): Promise<CareerStatLeaderRow[]>;
  topBowlers(matchClass: string, limit: number): Promise<CareerStatLeaderRow[]>;
}
