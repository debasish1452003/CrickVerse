// Plain list-item shapes for player browse / leaderboard cards. (Detail pages use
// the rich CareerPlayer / Player domain objects instead.)

/** A career-player browse card (gold corpus). */
export interface CareerPlayerListItem {
  cricsheetId: string;
  name: string;
  cricinfoId: string | null;
  gender: string | null;
  careerMatches: number;
  careerRuns: number;
  careerWickets: number;
  photoUrl: string | null;
  role: string | null;
}

/** A canonical-player browse card (cuid-keyed). */
export interface PlayerListItem {
  id: string;
  fullName: string;
  knownAs: string | null;
  country: string | null;
  role: string | null;
  runs: number;
  wickets: number;
  innings: number;
}

/** A most-capped squad member on the team page. */
export interface SquadMember {
  cricsheetId: string;
  name: string;
  innings: number;
  runs: number;
}
