import { describe, expect, it } from "vitest";
import {
  BattingCareer,
  BowlingCareer,
  CanonicalMatch,
  EloLeague,
  MatchClasses,
  StandingsCalculator,
} from "./index";

describe("career value objects", () => {
  it("folds batting innings with average, strike rate, high score and milestones", () => {
    const career = BattingCareer.fromInnings([
      { runs: 120, balls: 90, fours: 10, sixes: 4, dismissal: "NOT_OUT" },
      { runs: 0, balls: 3, fours: 0, sixes: 0, dismissal: "BOWLED" },
      { runs: 75, balls: 50, fours: 6, sixes: 3, dismissal: "CAUGHT" },
    ]);

    expect(career.innings).toBe(3);
    expect(career.notOuts).toBe(1);
    expect(career.runs).toBe(195);
    expect(career.average).toBe(97.5);
    expect(career.strikeRate).toBeCloseTo(136.36, 2);
    expect(career.highScore).toBe("120*");
    expect(career.hundreds).toBe(1);
    expect(career.fifties).toBe(1);
    expect(career.zeros).toBe(1);
  });

  it("folds bowling innings with economy, average, strike rate and best figures", () => {
    const career = BowlingCareer.fromInnings([
      { wickets: 3, runs: 24, balls: 24 },
      { wickets: 5, runs: 32, balls: 24 },
      { wickets: 5, runs: 20, balls: 18 },
    ]);

    expect(career.wickets).toBe(13);
    expect(career.runs).toBe(76);
    expect(career.economy).toBeCloseTo(6.91, 2);
    expect(career.average).toBeCloseTo(5.85, 2);
    expect(career.strikeRate).toBeCloseTo(5.08, 2);
    expect(career.fiveWickets).toBe(2);
    expect(career.best).toBe("5/20");
  });
});

describe("match helpers", () => {
  it("orders and labels match classes", () => {
    expect(MatchClasses.label("T20I")).toBe("T20Is");
    expect(MatchClasses.isInternational("ODI")).toBe(true);
    expect(MatchClasses.isLimitedOvers("FIRST_CLASS")).toBe(false);
    expect(MatchClasses.quotaBalls("T20")).toBe(120);
    expect(MatchClasses.order("TEST")).toBeLessThan(MatchClasses.order("T20"));
  });

  it("splits batted and did-not-bat rows", () => {
    const split = CanonicalMatch.splitBatting([
      row("a", 0, 0, "NOT_OUT"),
      row("b", 0, 1, "NOT_OUT"),
      row("c", 0, 0, "BOWLED"),
    ]);

    expect(split.batted.map((r) => r.player.fullName)).toEqual(["b", "c"]);
    expect(split.didNotBat.map((r) => r.player.fullName)).toEqual(["a"]);
  });
});

describe("table calculators", () => {
  it("calculates standings with all-out quota NRR", () => {
    const calc = new StandingsCalculator();
    calc.addMatch(
      { matchId: "m1", teamHome: "A", teamAway: "B", winner: "A", matchClass: "T20" },
      [
        { battingTeam: "A", runs: 120, balls: 120, wickets: 5 },
        { battingTeam: "B", runs: 100, balls: 90, wickets: 10 },
      ],
    );

    const [a, b] = calc.rows();
    expect(a?.team).toBe("A");
    expect(a?.points).toBe(2);
    expect(a?.nrr).toBeCloseTo(1);
    expect(b?.nrr).toBeCloseTo(-1);
  });

  it("replays Elo results into rankings", () => {
    const league = new EloLeague();
    league.ingest({ teamHome: "A", teamAway: "B", winner: "A" });
    league.ingest({ teamHome: "A", teamAway: "B", winner: "A" });

    const rows = league.rankings(1);
    expect(rows[0]?.team).toBe("A");
    expect(rows[0]?.rating).toBeGreaterThan(rows[1]?.rating ?? 0);
  });
});

function row(name: string, runs: number, balls: number, dismissal: string) {
  return {
    id: name,
    runs,
    balls,
    fours: 0,
    sixes: 0,
    dismissal,
    dismissalText: null,
    strikeRate: null,
    player: { id: name, fullName: name },
  };
}
