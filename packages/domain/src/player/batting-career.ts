/** Minimal batting-innings row needed to fold a career line. */
export interface BattingInningsLike {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  /** Dismissal kind; "NOT_OUT" means the batter wasn't dismissed. */
  dismissal: string | null;
}

/** Pre-aggregated batting totals (the gold `CareerStat` shape). */
export interface BattingAggregate {
  innings: number;
  notOuts: number;
  runs: number;
  balls: number;
  highScore: number;
  highScoreNotOut: boolean;
  fifties: number;
  hundreds: number;
  zeros: number;
  fours: number;
  sixes: number;
  average: number | null;
  strikeRate: number | null;
}

/**
 * A batting career line for one class of cricket — a value object that holds the
 * resolved totals and exposes the display fields the scorecard/career tables
 * read. Construct it from raw innings ({@link fromInnings}) or from pre-computed
 * gold aggregates ({@link fromAggregate}); both yield the same readable surface.
 */
export class BattingCareer {
  readonly innings: number;
  readonly notOuts: number;
  readonly runs: number;
  readonly balls: number;
  readonly average: number | null;
  readonly strikeRate: number | null;
  readonly fifties: number;
  readonly hundreds: number;
  readonly zeros: number;
  readonly fours: number;
  readonly sixes: number;
  /** Highest score with the not-out star, e.g. "182*", or "—" when no innings. */
  readonly highScore: string;

  private constructor(init: Omit<BattingCareer, never>) {
    this.innings = init.innings;
    this.notOuts = init.notOuts;
    this.runs = init.runs;
    this.balls = init.balls;
    this.average = init.average;
    this.strikeRate = init.strikeRate;
    this.fifties = init.fifties;
    this.hundreds = init.hundreds;
    this.zeros = init.zeros;
    this.fours = init.fours;
    this.sixes = init.sixes;
    this.highScore = init.highScore;
  }

  /** Fold a set of innings into a career line (computes avg / SR / HS). */
  static fromInnings(rows: BattingInningsLike[]): BattingCareer {
    const runs = rows.reduce((s, b) => s + b.runs, 0);
    const balls = rows.reduce((s, b) => s + b.balls, 0);
    const isNotOut = (b: BattingInningsLike) => b.dismissal === "NOT_OUT";
    const notOuts = rows.filter(isNotOut).length;
    const outs = rows.length - notOuts;

    // Highest score keeps the not-out star; on an equal-runs tie prefer the
    // not-out innings so the asterisk is never lost to arbitrary row order.
    let hs = -1;
    let hsNotOut = false;
    for (const b of rows) {
      const notOut = isNotOut(b);
      if (b.runs > hs || (b.runs === hs && notOut && !hsNotOut)) {
        hs = b.runs;
        hsNotOut = notOut;
      }
    }

    return new BattingCareer({
      innings: rows.length,
      notOuts,
      runs,
      balls,
      average: outs ? runs / outs : null,
      strikeRate: balls ? (runs / balls) * 100 : null,
      fifties: rows.filter((b) => b.runs >= 50 && b.runs < 100).length,
      hundreds: rows.filter((b) => b.runs >= 100).length,
      zeros: rows.filter((b) => b.runs === 0 && !isNotOut(b)).length,
      fours: rows.reduce((s, b) => s + b.fours, 0),
      sixes: rows.reduce((s, b) => s + b.sixes, 0),
      highScore: rows.length ? `${hs}${hsNotOut ? "*" : ""}` : "—",
    });
  }

  /** Build from pre-computed gold aggregates (full-corpus career stats). */
  static fromAggregate(a: BattingAggregate): BattingCareer {
    return new BattingCareer({
      innings: a.innings,
      notOuts: a.notOuts,
      runs: a.runs,
      balls: a.balls,
      average: a.average,
      strikeRate: a.strikeRate,
      fifties: a.fifties,
      hundreds: a.hundreds,
      zeros: a.zeros,
      fours: a.fours,
      sixes: a.sixes,
      highScore: a.innings > 0 ? `${a.highScore}${a.highScoreNotOut ? "*" : ""}` : "—",
    });
  }
}
