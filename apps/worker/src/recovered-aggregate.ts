/**
 * Folds per-innings recovery rows into compact per-(player, format, source)
 * career aggregates (see the `RecoveredCareerStat` model). Used both by the
 * one-time migration of existing PlayerInningsHistory and by the recovery/import
 * tasks going forward, so we store ~one row per format instead of hundreds of
 * innings — keeping the DB tiny while preserving the totals the UI needs.
 */

export interface InningsLike {
  cricinfoId: string;
  matchClass: string;
  source: string;
  discipline: string; // "batting" | "bowling"
  matchDate: string | null;
  opposition: string | null;
  ground: string | null;
  didBat: boolean;
  runs: number | null;
  notOut: boolean;
  ballsFaced: number | null;
  fours: number | null;
  sixes: number | null;
  ballsBowled: number | null;
  runsConceded: number | null;
  wickets: number | null;
}

export interface RecoveredAgg {
  cricinfoId: string;
  matchClass: string;
  source: string;
  matches: number;
  batInnings: number;
  notOuts: number;
  runs: number;
  ballsFaced: number;
  highScore: number;
  highScoreNotOut: boolean;
  fifties: number;
  hundreds: number;
  ducks: number;
  fours: number;
  sixes: number;
  bowlInnings: number;
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
  fiveWickets: number;
  bestBowlingWkts: number;
  bestBowlingRuns: number;
  spanFirst: string | null;
  spanLast: string | null;
}

interface Bucket {
  agg: RecoveredAgg;
  matchSigs: Set<string>;
}

/** Streaming accumulator: feed rows in any order, read results at the end. */
export class RecoveredAccumulator {
  private buckets = new Map<string, Bucket>();

  add(r: InningsLike): void {
    const key = `${r.cricinfoId}|${r.matchClass}|${r.source}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = {
        matchSigs: new Set(),
        agg: {
          cricinfoId: r.cricinfoId, matchClass: r.matchClass, source: r.source,
          matches: 0, batInnings: 0, notOuts: 0, runs: 0, ballsFaced: 0,
          highScore: 0, highScoreNotOut: false, fifties: 0, hundreds: 0, ducks: 0, fours: 0, sixes: 0,
          bowlInnings: 0, ballsBowled: 0, runsConceded: 0, wickets: 0, fiveWickets: 0,
          bestBowlingWkts: 0, bestBowlingRuns: 0, spanFirst: null, spanLast: null,
        },
      };
      this.buckets.set(key, b);
    }
    const a = b.agg;

    // distinct match signature across both disciplines
    b.matchSigs.add(`${r.matchDate ?? ""}|${r.opposition ?? ""}|${r.ground ?? ""}`);

    if (r.matchDate) {
      if (!a.spanFirst || r.matchDate < a.spanFirst) a.spanFirst = r.matchDate;
      if (!a.spanLast || r.matchDate > a.spanLast) a.spanLast = r.matchDate;
    }

    if (r.discipline === "batting" && r.didBat) {
      a.batInnings += 1;
      const runs = r.runs ?? 0;
      a.runs += runs;
      a.ballsFaced += r.ballsFaced ?? 0;
      a.fours += r.fours ?? 0;
      a.sixes += r.sixes ?? 0;
      if (r.notOut) a.notOuts += 1;
      if (runs > a.highScore) { a.highScore = runs; a.highScoreNotOut = r.notOut; }
      if (runs >= 100) a.hundreds += 1;
      else if (runs >= 50) a.fifties += 1;
      if (runs === 0 && !r.notOut) a.ducks += 1;
    }

    if (r.discipline === "bowling" && (r.ballsBowled != null || r.wickets != null)) {
      a.bowlInnings += 1;
      const w = r.wickets ?? 0;
      const rc = r.runsConceded ?? 0;
      a.ballsBowled += r.ballsBowled ?? 0;
      a.runsConceded += rc;
      a.wickets += w;
      if (w >= 5) a.fiveWickets += 1;
      // best bowling: most wickets, then fewest runs at that wicket count
      if (w > a.bestBowlingWkts || (w === a.bestBowlingWkts && w > 0 && rc < a.bestBowlingRuns)) {
        a.bestBowlingWkts = w;
        a.bestBowlingRuns = rc;
      }
    }
  }

  results(): RecoveredAgg[] {
    const out: RecoveredAgg[] = [];
    for (const b of this.buckets.values()) {
      b.agg.matches = b.matchSigs.size;
      out.push(b.agg);
    }
    return out;
  }
}
