import { cdnImage } from "../core/naming";

export interface CanonicalBattingPerfRow {
  id: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissal: string | null;
  dismissalText: string | null;
  strikeRate: number | null;
  player: { id: string; fullName: string };
}

export interface CanonicalBowlingPerfRow {
  id: string;
  oversText: string | null;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number | null;
  player: { id: string; fullName: string };
}

export interface CanonicalInningsRow {
  id: string;
  inningsNo: number;
  battingTeam: { name: string } | null;
  runs: number | null;
  wickets: number | null;
  oversText: string | null;
  battingPerfs: CanonicalBattingPerfRow[];
  bowlingPerfs: CanonicalBowlingPerfRow[];
}

export interface CanonicalMatchRow {
  id: string;
  format: string;
  statusText: string | null;
  state: string;
  homeScore: string | null;
  awayScore: string | null;
  series: { name: string | null } | null;
  venue: { name: string | null; city: string | null } | null;
  homeTeam: { name: string | null; primaryColor: string | null; imageUrl: string | null } | null;
  awayTeam: { name: string | null; primaryColor: string | null; imageUrl: string | null } | null;
  innings: CanonicalInningsRow[];
}

/** A team line for the canonical-match header (name + crest + score). */
export interface MatchTeamLine {
  name: string;
  color: string | null;
  logo: string | null;
  score: string | null;
}

/**
 * The canonical match detail (cuid) — the fallback view for scorecard-linked
 * matches that aren't in the gold corpus. Wraps the ESPNCricinfo-shaped record
 * and resolves the CDN crest URLs + the did-not-bat split for the view.
 */
export class CanonicalMatch {
  constructor(private readonly row: CanonicalMatchRow) {}

  get seriesName(): string {
    return this.row.series?.name ?? "Match";
  }
  get format(): string {
    return this.row.format;
  }
  get statusLine(): string {
    return this.row.statusText ?? this.row.state;
  }
  get venueName(): string | null {
    return this.row.venue?.name ?? null;
  }
  get venueCity(): string | null {
    return this.row.venue?.city ?? null;
  }
  get innings(): CanonicalInningsRow[] {
    return this.row.innings;
  }

  get homeLine(): MatchTeamLine {
    return CanonicalMatch.teamLine(this.row.homeTeam, this.row.homeScore);
  }

  get awayLine(): MatchTeamLine {
    return CanonicalMatch.teamLine(this.row.awayTeam, this.row.awayScore);
  }

  private static teamLine(
    team: { name: string | null; primaryColor: string | null; imageUrl: string | null } | null,
    score: string | null,
  ): MatchTeamLine {
    return {
      name: team?.name ?? "TBD",
      color: team?.primaryColor ?? null,
      logo: cdnImage(team?.imageUrl),
      score,
    };
  }

  /** Split an innings into batters who came to the crease vs the did-not-bats. */
  static splitBatting(perfs: CanonicalBattingPerfRow[]): {
    batted: CanonicalBattingPerfRow[];
    didNotBat: CanonicalBattingPerfRow[];
  } {
    const came = (b: CanonicalBattingPerfRow) =>
      b.balls > 0 || b.runs > 0 || b.dismissal !== "NOT_OUT";
    return {
      batted: perfs.filter(came),
      didNotBat: perfs.filter((b) => !came(b)),
    };
  }
}
