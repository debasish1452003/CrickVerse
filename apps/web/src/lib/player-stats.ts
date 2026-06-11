import type { PlayerWithPerfs } from "./queries";

export interface BattingCareer {
  innings: number;
  runs: number;
  balls: number;
  outs: number;
  average: number | null;
  strikeRate: number | null;
  fifties: number;
  hundreds: number;
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
  best: string;
}

export function battingCareer(p: PlayerWithPerfs): BattingCareer {
  const bp = p.battingPerfs;
  const runs = bp.reduce((s, b) => s + b.runs, 0);
  const balls = bp.reduce((s, b) => s + b.balls, 0);
  const outs = bp.filter((b) => b.dismissal !== "NOT_OUT").length;

  let hs = 0;
  let hsNotOut = false;
  for (const b of bp) {
    if (b.runs > hs) {
      hs = b.runs;
      hsNotOut = b.dismissal === "NOT_OUT";
    }
  }

  return {
    innings: bp.length,
    runs,
    balls,
    outs,
    average: outs ? runs / outs : null,
    strikeRate: balls ? (runs / balls) * 100 : null,
    fifties: bp.filter((b) => b.runs >= 50 && b.runs < 100).length,
    hundreds: bp.filter((b) => b.runs >= 100).length,
    fours: bp.reduce((s, b) => s + b.fours, 0),
    sixes: bp.reduce((s, b) => s + b.sixes, 0),
    highScore: bp.length ? `${hs}${hsNotOut ? "*" : ""}` : "—",
  };
}

export function bowlingCareer(p: PlayerWithPerfs): BowlingCareer {
  const wp = p.bowlingPerfs;
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
    best: wp.length ? best : "—",
  };
}
