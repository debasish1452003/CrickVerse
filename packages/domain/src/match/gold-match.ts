/** One innings header in a gold scorecard. */
export interface GoldInningsRow {
  inningsNo: number;
  battingTeam: string | null;
  runs: number;
  wickets: number;
  balls: number;
}

/** One batting line in a gold scorecard. */
export interface GoldBattingRow {
  inningsNo: number;
  battingPos: number;
  cricsheetId: string | null;
  name: string;
  out: boolean;
  dismissal: string | null;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number | null;
}

/** One bowling line in a gold scorecard. */
export interface GoldBowlingRow {
  inningsNo: number;
  bowlingPos: number;
  cricsheetId: string | null;
  name: string;
  balls: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number | null;
}

export interface GoldMatchRow {
  matchId: string;
  matchClass: string;
  eventName: string | null;
  teamHome: string | null;
  teamAway: string | null;
  winner: string | null;
  matchDate: string | null;
  venue: string | null;
  city: string | null;
  tossWinner: string | null;
  tossDecision: string | null;
  innings: GoldInningsRow[];
  batting: GoldBattingRow[];
  bowling: GoldBowlingRow[];
}

/** Whole overs.balls notation from a legal-ball count, e.g. 119 → "19.5". */
export function oversText(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

/**
 * A full-corpus match + scorecard from the gold tables (keyed by Cricsheet match
 * id). Holds the header plus the flat batting/bowling rows, and exposes the
 * derived bits the scorecard page needs (title, toss line, per-innings slices)
 * as methods so the view stays declarative.
 */
export class GoldMatch {
  constructor(private readonly row: GoldMatchRow) {}

  get id(): string {
    return this.row.matchId;
  }
  get matchClass(): string {
    return this.row.matchClass;
  }
  get eventName(): string | null {
    return this.row.eventName;
  }
  get teamHome(): string | null {
    return this.row.teamHome;
  }
  get teamAway(): string | null {
    return this.row.teamAway;
  }
  get winner(): string | null {
    return this.row.winner;
  }
  get matchDate(): string | null {
    return this.row.matchDate;
  }
  get venue(): string | null {
    return this.row.venue;
  }
  get city(): string | null {
    return this.row.city;
  }
  get innings(): GoldInningsRow[] {
    return this.row.innings;
  }

  get hasBothTeams(): boolean {
    return Boolean(this.row.teamHome && this.row.teamAway);
  }

  get title(): string {
    return this.hasBothTeams
      ? `${this.row.teamHome} vs ${this.row.teamAway}`
      : (this.row.eventName ?? "Match");
  }

  get resultText(): string {
    return this.row.winner ? `${this.row.winner} won` : "Result —";
  }

  /** "[matchDate · venue · city]" meta line, blanks dropped. */
  get metaLine(): string {
    return [this.row.matchDate, this.row.venue, this.row.city].filter(Boolean).join(" · ");
  }

  /** Toss summary, or null when toss data is absent. */
  get tossText(): string | null {
    return this.row.tossWinner && this.row.tossDecision
      ? `${this.row.tossWinner} won the toss and chose to ${this.row.tossDecision}`
      : null;
  }

  /** Names of the teams whose crests should be fetched for this scorecard. */
  get teamNames(): (string | null)[] {
    return [this.row.teamHome, this.row.teamAway, ...this.row.innings.map((i) => i.battingTeam)];
  }

  inningsLabel(inningsNo: number): string {
    return (
      this.row.innings.find((i) => i.inningsNo === inningsNo)?.battingTeam ?? `Innings ${inningsNo}`
    );
  }

  battingIn(inningsNo: number): GoldBattingRow[] {
    return this.row.batting.filter((b) => b.inningsNo === inningsNo);
  }

  bowlingIn(inningsNo: number): GoldBowlingRow[] {
    return this.row.bowling.filter((b) => b.inningsNo === inningsNo);
  }
}
