import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCricsheetMatch } from "../src/cricsheet/parse-match";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "fixtures", "cricsheet-1234567.json"), "utf8"),
) as unknown;

const match = parseCricsheetMatch(fixture, "1234567");

describe("cricsheet parser (golden fixture: IPL T20, match 1234567)", () => {
  it("reads match metadata + registry", () => {
    expect(match.sourceMatchId).toBe("1234567");
    expect(match.matchType).toBe("T20");
    expect(match.eventName).toBe("Indian Premier League");
    expect(match.season).toBe("2026");
    expect(match.venue).toBe("Wankhede Stadium");
    expect(match.teams).toEqual(["Mumbai Indians", "Chennai Super Kings"]);
    expect(match.tossWinner).toBe("Chennai Super Kings");
    expect(match.tossDecision).toBe("field");
    expect(match.outcomeWinner).toBe("Mumbai Indians");
    expect(match.registry["SA Yadav"]).toBe("s-yadav-1");
  });

  it("parses both innings with correct totals", () => {
    expect(match.innings).toHaveLength(2);
    const [first, second] = match.innings;
    // Innings 1: 4+0+1(wide)+1+0+6 + 1(nb)+2(byes)+2+1 = 18, 2 wkts, 8 legal balls, 10 deliveries.
    expect(first!.battingTeam).toBe("Mumbai Indians");
    expect(first!.runs).toBe(18);
    expect(first!.wickets).toBe(2);
    expect(first!.legalBalls).toBe(8);
    expect(first!.deliveries).toHaveLength(10);
    // Innings 2: 6+4+0 = 10, 1 wkt, 3 legal balls.
    expect(second!.runs).toBe(10);
    expect(second!.wickets).toBe(1);
    expect(second!.legalBalls).toBe(3);
  });

  it("attaches registry ids + names to every player reference on a delivery", () => {
    const d1 = match.innings[0]!.deliveries[0]!;
    expect(d1.inningsNo).toBe(1);
    expect(d1.overNo).toBe(0);
    expect(d1.ballInOver).toBe(1);
    expect(d1.batter).toEqual({ id: "r-sharma-1", name: "RG Sharma" });
    expect(d1.bowler).toEqual({ id: "d-chahar-1", name: "DL Chahar" });
    expect(d1.nonStriker).toEqual({ id: "i-kishan-1", name: "Ishan Kishan" });
    expect(d1.runsBatter).toBe(4);
    expect(d1.runsTotal).toBe(4);
    expect(d1.extraType).toBeNull();
    expect(d1.wicket).toBeNull();
  });

  it("classifies extras (wide, no-ball, byes) and excludes wides/no-balls from legal balls", () => {
    const wide = match.innings[0]!.deliveries[2]!;
    expect(wide.extraType).toBe("wides");
    expect(wide.runsExtras).toBe(1);
    const noball = match.innings[0]!.deliveries[6]!; // first ball of over 1
    expect(noball.overNo).toBe(1);
    expect(noball.ballInOver).toBe(1);
    expect(noball.extraType).toBe("noballs");
    const byes = match.innings[0]!.deliveries[7]!;
    expect(byes.extraType).toBe("byes");
    expect(byes.runsExtras).toBe(2);
  });

  it("captures a caught wicket with fielder and a run out", () => {
    const caught = match.innings[0]!.deliveries[4]!;
    expect(caught.wicket).toEqual({
      kind: "caught",
      playerOut: { id: "i-kishan-1", name: "Ishan Kishan" },
      fielders: ["MS Dhoni"],
    });
    const runOut = match.innings[0]!.deliveries[9]!;
    expect(runOut.wicket?.kind).toBe("run out");
    expect(runOut.wicket?.playerOut?.name).toBe("RG Sharma");
  });

  it("uses 1-based ballInOver counting illegal balls (unique per over)", () => {
    const over0 = match.innings[0]!.deliveries.filter((d) => d.overNo === 0);
    expect(over0.map((d) => d.ballInOver)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("reads meta.revision (defaults to 1), used by the incremental feed for re-ingest", () => {
    // The golden fixture has no meta block, so revision defaults to 1.
    expect(match.revision).toBe(1);
    // A corrected file carries meta.revision > 1.
    const corrected = parseCricsheetMatch({ meta: { revision: 3 }, info: {}, innings: [] }, "x");
    expect(corrected.revision).toBe(3);
  });
});
