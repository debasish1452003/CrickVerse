/** A team's Elo standing within one format. */
export interface EloRankingRow {
  team: string;
  played: number;
  won: number;
  lost: number;
  rating: number;
}

/** A single result fed into the Elo replay (must be ingested in date order). */
export interface EloResult {
  teamHome: string;
  teamAway: string;
  winner: string | null;
}

/**
 * Elo ratings for the teams of a single format. Beating a strong side is worth
 * far more than beating a minnow, which keeps associate teams (who rack up a high
 * win% against other weak teams) from topping the table the way naive win% lets
 * them. Replay results in chronological order via {@link ingest}; draws / ties /
 * no-results count as a half result.
 */
export class EloLeague {
  private static readonly K = 32;
  private static readonly BASE = 1500;

  private readonly ratings = new Map<string, number>();
  private readonly stats = new Map<string, { played: number; won: number; lost: number }>();

  private ratingOf(team: string): number {
    return this.ratings.get(team) ?? EloLeague.BASE;
  }

  private statOf(team: string): { played: number; won: number; lost: number } {
    let s = this.stats.get(team);
    if (!s) this.stats.set(team, (s = { played: 0, won: 0, lost: 0 }));
    return s;
  }

  /** Apply one result, updating both teams' ratings and W/L tallies. */
  ingest(m: EloResult): void {
    const { teamHome: h, teamAway: a, winner } = m;
    const rh = this.ratingOf(h);
    const ra = this.ratingOf(a);
    const sh = this.statOf(h);
    const sa = this.statOf(a);
    sh.played++;
    sa.played++;

    const expectedHome = 1 / (1 + Math.pow(10, (ra - rh) / 400));
    let scoreHome: number;
    if (winner === h) {
      scoreHome = 1;
      sh.won++;
      sa.lost++;
    } else if (winner === a) {
      scoreHome = 0;
      sa.won++;
      sh.lost++;
    } else {
      scoreHome = 0.5; // draw / tie / no-result
    }

    this.ratings.set(h, rh + EloLeague.K * (scoreHome - expectedHome));
    this.ratings.set(a, ra + EloLeague.K * (1 - scoreHome - (1 - expectedHome)));
  }

  /** Teams with at least `minMatches` games, sorted by rating then wins. */
  rankings(minMatches: number): EloRankingRow[] {
    const rows: EloRankingRow[] = [];
    for (const [team, s] of this.stats) {
      if (s.played < minMatches) continue;
      rows.push({
        team,
        played: s.played,
        won: s.won,
        lost: s.lost,
        rating: Math.round(this.ratingOf(team)),
      });
    }
    rows.sort((x, y) => y.rating - x.rating || y.won - x.won);
    return rows;
  }
}
