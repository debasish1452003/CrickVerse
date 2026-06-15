// Leaderboard / stats DTOs consumed by the StatBoard, StandingsTable and
// rankings views. Plain pre-formatted shapes — the formatting decisions live in
// the StatsService that produces them.

/** A single ranked leaderboard entry (pre-formatted for display). */
export interface StatLeader {
  cricsheetId: string | null;
  name: string;
  /** Primary metric, pre-formatted. */
  value: string;
  /** Secondary context line (e.g. innings / strike rate). */
  detail: string;
}

/** A leaderboard entry that also carries a photo (player rankings page). */
export interface PlayerLeaderRow extends StatLeader {
  matches: number;
  photoUrl: string | null;
}

/** The full set of per-edition leaderboards. */
export interface TournamentStats {
  mostRuns: StatLeader[];
  highestScores: StatLeader[];
  mostSixes: StatLeader[];
  mostFours: StatLeader[];
  bestStrikeRate: StatLeader[];
  mostWickets: StatLeader[];
  bestEconomy: StatLeader[];
}

/** One member of an edition squad. */
export interface EditionSquadMember {
  cricsheetId: string | null;
  name: string;
  appearances: number;
  runs: number;
  wickets: number;
}

/** A team's squad for one edition. */
export interface EditionSquad {
  team: string;
  members: EditionSquadMember[];
}

/** A per-class team win% ranking row. */
export interface RankingRow {
  team: string;
  played: number;
  won: number;
  winPct: number;
}
