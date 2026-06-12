import type { CareerStat, MatchClass } from "@crickverse/db";
import type { PlayerWithPerfs } from "./queries";

type BatPerf = PlayerWithPerfs["battingPerfs"][number];
type BowlPerf = PlayerWithPerfs["bowlingPerfs"][number];

export interface BattingCareer {
  innings: number;
  notOuts: number;
  runs: number;
  balls: number;
  average: number | null;
  strikeRate: number | null;
  fifties: number;
  hundreds: number;
  zeros: number;
  fours: number;
  sixes: number;
  highScore: string;
}

export interface BowlingCareer {
  innings: number;
  wickets: number;
  runs: number;
  balls: number;
  economy: number | null;
  average: number | null;
  strikeRate: number | null;
  fiveWickets: number;
  best: string;
}

/** A career line for one class of cricket (Tests / ODIs / T20Is / IPL …). */
export interface FormatCareer {
  matchClass: MatchClass;
  matches: number;
  batting: BattingCareer;
  bowling: BowlingCareer;
}

/** Display order + labels for the classes, ESPNcricinfo-style. */
export const MATCH_CLASS_ORDER: MatchClass[] = [
  "TEST",
  "ODI",
  "T20I",
  "FIRST_CLASS",
  "LIST_A",
  "T20",
  "T10",
  "HUNDRED",
  "OTHER",
];

export const MATCH_CLASS_LABEL: Record<MatchClass, string> = {
  TEST: "Tests",
  ODI: "ODIs",
  T20I: "T20Is",
  FIRST_CLASS: "First-class",
  LIST_A: "List A",
  T20: "T20s",
  T10: "T10",
  HUNDRED: "The Hundred",
  OTHER: "Other",
};

export const INTERNATIONAL_CLASSES: ReadonlySet<MatchClass> = new Set(["TEST", "ODI", "T20I"]);

const classOf = (p: { innings: { match: { matchClass: MatchClass | null } } }): MatchClass =>
  p.innings.match.matchClass ?? "OTHER";

export function battingFrom(bp: BatPerf[]): BattingCareer {
  const runs = bp.reduce((s, b) => s + b.runs, 0);
  const balls = bp.reduce((s, b) => s + b.balls, 0);
  const notOuts = bp.filter((b) => b.dismissal === "NOT_OUT").length;
  const outs = bp.length - notOuts;

  // Highest score keeps the not-out star; on an equal-runs tie prefer the not-out
  // innings so the asterisk is never lost to arbitrary row order (cricket convention).
  let hs = -1;
  let hsNotOut = false;
  for (const b of bp) {
    const notOut = b.dismissal === "NOT_OUT";
    if (b.runs > hs || (b.runs === hs && notOut && !hsNotOut)) {
      hs = b.runs;
      hsNotOut = notOut;
    }
  }

  return {
    innings: bp.length,
    notOuts,
    runs,
    balls,
    average: outs ? runs / outs : null,
    strikeRate: balls ? (runs / balls) * 100 : null,
    fifties: bp.filter((b) => b.runs >= 50 && b.runs < 100).length,
    hundreds: bp.filter((b) => b.runs >= 100).length,
    zeros: bp.filter((b) => b.runs === 0 && b.dismissal !== "NOT_OUT").length,
    fours: bp.reduce((s, b) => s + b.fours, 0),
    sixes: bp.reduce((s, b) => s + b.sixes, 0),
    highScore: bp.length ? `${hs}${hsNotOut ? "*" : ""}` : "—",
  };
}

export function bowlingFrom(wp: BowlPerf[]): BowlingCareer {
  const wickets = wp.reduce((s, b) => s + b.wickets, 0);
  const runs = wp.reduce((s, b) => s + b.runs, 0);
  const balls = wp.reduce((s, b) => s + b.balls, 0);

  let best = "—";
  let bestW = -1;
  let bestR = Number.POSITIVE_INFINITY;
  for (const b of wp) {
    if (b.wickets > bestW || (b.wickets === bestW && b.runs < bestR)) {
      bestW = b.wickets;
      bestR = b.runs;
      best = `${b.wickets}/${b.runs}`;
    }
  }

  return {
    innings: wp.length,
    wickets,
    runs,
    balls,
    economy: balls ? runs / (balls / 6) : null,
    average: wickets ? runs / wickets : null,
    strikeRate: wickets ? balls / wickets : null,
    fiveWickets: wp.filter((b) => b.wickets >= 5).length,
    best: wp.length ? best : "—",
  };
}

// Back-compat: whole-career lines (all formats combined).
export const battingCareer = (p: PlayerWithPerfs): BattingCareer => battingFrom(p.battingPerfs);
export const bowlingCareer = (p: PlayerWithPerfs): BowlingCareer => bowlingFrom(p.bowlingPerfs);

/**
 * Split a player's career into one line per class of cricket. Matches = distinct
 * matches the player appeared in for that class (batting OR bowling). Only classes
 * with at least one appearance are returned, in MATCH_CLASS_ORDER.
 */
export function careerByClass(p: PlayerWithPerfs): FormatCareer[] {
  const batBy = new Map<MatchClass, BatPerf[]>();
  const bowlBy = new Map<MatchClass, BowlPerf[]>();
  const matchIdsBy = new Map<MatchClass, Set<string>>();

  const seen = (cls: MatchClass): Set<string> => {
    let s = matchIdsBy.get(cls);
    if (!s) matchIdsBy.set(cls, (s = new Set()));
    return s;
  };

  for (const b of p.battingPerfs) {
    const cls = classOf(b);
    (batBy.get(cls) ?? batBy.set(cls, []).get(cls)!).push(b);
    seen(cls).add(b.innings.match.id);
  }
  for (const w of p.bowlingPerfs) {
    const cls = classOf(w);
    (bowlBy.get(cls) ?? bowlBy.set(cls, []).get(cls)!).push(w);
    seen(cls).add(w.innings.match.id);
  }

  const classes = MATCH_CLASS_ORDER.filter((c) => batBy.has(c) || bowlBy.has(c));
  return classes.map((cls) => ({
    matchClass: cls,
    matches: matchIdsBy.get(cls)?.size ?? 0,
    batting: battingFrom(batBy.get(cls) ?? []),
    bowling: bowlingFrom(bowlBy.get(cls) ?? []),
  }));
}

const order = (c: string): number => {
  const i = MATCH_CLASS_ORDER.indexOf(c as MatchClass);
  return i === -1 ? MATCH_CLASS_ORDER.length : i;
};

/**
 * Adapt gold CareerStat rows (the full-corpus lakehouse aggregates) into the same
 * FormatCareer shape the detail page renders — so gold-backed and canonical-backed
 * player pages share one table renderer.
 */
export function careersFromGold(stats: CareerStat[]): FormatCareer[] {
  return [...stats]
    .sort((a, b) => order(a.matchClass) - order(b.matchClass))
    .map((s) => ({
      matchClass: s.matchClass as MatchClass,
      matches: s.matches,
      batting: {
        innings: s.batInnings,
        notOuts: s.notOuts,
        runs: s.runs,
        balls: s.ballsFaced,
        average: s.battingAvg,
        strikeRate: s.strikeRate,
        fifties: s.fifties,
        hundreds: s.hundreds,
        zeros: s.ducks,
        fours: s.fours,
        sixes: s.sixes,
        highScore: s.batInnings > 0 ? `${s.highScore}${s.highScoreNotOut ? "*" : ""}` : "—",
      },
      bowling: {
        innings: s.bowlInnings,
        wickets: s.wickets,
        runs: s.runsConceded,
        balls: s.ballsBowled,
        economy: s.economy,
        average: s.bowlingAvg,
        strikeRate: s.bowlingSr,
        fiveWickets: s.fiveWickets,
        best: s.bowlInnings > 0 ? `${s.bestBowlingWkts}/${s.bestBowlingRuns}` : "—",
      },
    }));
}
