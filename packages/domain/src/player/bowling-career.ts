/** Minimal bowling-innings row needed to fold a career line. */
export interface BowlingInningsLike {
  wickets: number;
  runs: number;
  balls: number;
}

/** Pre-aggregated bowling totals (the gold `CareerStat` shape). */
export interface BowlingAggregate {
  innings: number;
  wickets: number;
  runs: number;
  balls: number;
  economy: number | null;
  average: number | null;
  strikeRate: number | null;
  fiveWickets: number;
  bestWickets: number;
  bestRuns: number;
}

/**
 * A bowling career line for one class of cricket. Like {@link BattingCareer},
 * a value object built either from raw innings or from gold aggregates.
 */
export class BowlingCareer {
  readonly innings: number;
  readonly wickets: number;
  readonly runs: number;
  readonly balls: number;
  readonly economy: number | null;
  readonly average: number | null;
  readonly strikeRate: number | null;
  readonly fiveWickets: number;
  /** Best bowling in an innings, e.g. "5/24", or "—" when none. */
  readonly best: string;

  private constructor(init: Omit<BowlingCareer, never>) {
    this.innings = init.innings;
    this.wickets = init.wickets;
    this.runs = init.runs;
    this.balls = init.balls;
    this.economy = init.economy;
    this.average = init.average;
    this.strikeRate = init.strikeRate;
    this.fiveWickets = init.fiveWickets;
    this.best = init.best;
  }

  static fromInnings(rows: BowlingInningsLike[]): BowlingCareer {
    const wickets = rows.reduce((s, b) => s + b.wickets, 0);
    const runs = rows.reduce((s, b) => s + b.runs, 0);
    const balls = rows.reduce((s, b) => s + b.balls, 0);

    let best = "—";
    let bestW = -1;
    let bestR = Number.POSITIVE_INFINITY;
    for (const b of rows) {
      if (b.wickets > bestW || (b.wickets === bestW && b.runs < bestR)) {
        bestW = b.wickets;
        bestR = b.runs;
        best = `${b.wickets}/${b.runs}`;
      }
    }

    return new BowlingCareer({
      innings: rows.length,
      wickets,
      runs,
      balls,
      economy: balls ? runs / (balls / 6) : null,
      average: wickets ? runs / wickets : null,
      strikeRate: wickets ? balls / wickets : null,
      fiveWickets: rows.filter((b) => b.wickets >= 5).length,
      best: rows.length ? best : "—",
    });
  }

  static fromAggregate(a: BowlingAggregate): BowlingCareer {
    return new BowlingCareer({
      innings: a.innings,
      wickets: a.wickets,
      runs: a.runs,
      balls: a.balls,
      economy: a.economy,
      average: a.average,
      strikeRate: a.strikeRate,
      fiveWickets: a.fiveWickets,
      best: a.innings > 0 ? `${a.bestWickets}/${a.bestRuns}` : "—",
    });
  }
}
