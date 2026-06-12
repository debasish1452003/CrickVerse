import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scorecardDescriptor } from "../src/descriptors/scorecard";
import { getByPaths } from "../src/fetcher/extract";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "fixtures", "scorecard-1527674.json"), "utf8"),
) as unknown;

const params = {
  seriesSlug: "ipl-2026",
  seriesId: "1510719",
  matchSlug: "sunrisers-hyderabad-vs-royal-challengers-bengaluru-1st-match",
  matchId: 1527674,
} as const;

const content = getByPaths(fixture, scorecardDescriptor.extractPaths);
const parsed = scorecardDescriptor.validate(scorecardDescriptor.parse(content, params));

describe("scorecard descriptor (golden fixture: IPL 2026, match 1527674)", () => {
  it("parses both innings", () => {
    expect(parsed.innings).toHaveLength(2);
    expect(parsed.sourceMatchId).toBe(1527674);
  });

  it("reads innings totals and batting/bowling line counts", () => {
    const first = parsed.innings[0]!;
    expect(first.runs).toBe(201);
    expect(first.wickets).toBe(9);
    expect(first.batting.length).toBeGreaterThanOrEqual(11);
    expect(first.bowling.length).toBeGreaterThanOrEqual(5);
  });

  it("normalizes the top batter with a clean dismissal string (regression: not '[object Object]')", () => {
    const top = parsed.innings[0]!.batting[0]!;
    expect(top.name).toBe("Travis Head");
    expect(top.sourcePlayerId).toBe(530011);
    expect(top.runs).toBe(11);
    expect(top.balls).toBe(9);
    expect(top.strikeRate).toBeCloseTo(122.22, 1);
    expect(top.isOut).toBe(true);
    expect(top.dismissalText).toBe("c Salt b Duffy");
    expect(top.dismissalText).not.toContain("[object Object]");
  });

  it("normalizes bowling figures (runs from `conceded`, economy, balls)", () => {
    const bowler = parsed.innings[0]!.bowling[0]!;
    expect(bowler.name).toBe("Jacob Duffy");
    expect(bowler.sourcePlayerId).toBe(547766);
    expect(bowler.wickets).toBe(3);
    expect(bowler.runs).toBe(22);
    expect(bowler.economy).toBeCloseTo(5.5, 1);
  });
});
