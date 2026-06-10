import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { seriesFixturesDescriptor } from "../src/descriptors/series-fixtures";
import { getByPaths } from "../src/fetcher/extract";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "fixtures", "ipl-2026-fixtures.json"), "utf8"),
) as unknown;

const params = { slug: "ipl-2026", objectId: 1510719 } as const;
const content = getByPaths(fixture, seriesFixturesDescriptor.extractPaths);
const parsed = seriesFixturesDescriptor.validate(
  seriesFixturesDescriptor.parse(content, params),
);

describe("series-fixtures descriptor (golden fixture: IPL 2026)", () => {
  it("finds the content slice via the known JSON path", () => {
    expect(content).toBeDefined();
  });

  it("parses and validates all 70 matches", () => {
    expect(parsed.matches).toHaveLength(70);
  });

  it("normalizes the first match correctly", () => {
    const m = parsed.matches[0]!;
    expect(m.sourceMatchId).toBe(1527674);
    expect(m.format).toBe("T20");
    expect(m.state).toBe("POST");
    expect(m.title).toBe("1st Match");
    expect(m.teams.length).toBeGreaterThanOrEqual(2);
    expect(m.teams[0]!.name).toBeTruthy();
    expect(m.result.tossDecision).toBe("FIELD"); // tossWinnerChoice === 2
  });

  it("derives the series and venue", () => {
    expect(parsed.series.sourceSeriesId).toBe(1510719);
    expect(parsed.series.slug).toBe("ipl-2026");
    expect(parsed.matches[0]!.venue.name).toContain("Chinnaswamy");
    expect(parsed.matches[0]!.venue.city).toBe("Bengaluru");
  });

  it("fans out a scorecard job per finished match in HISTORICAL mode", () => {
    const jobs = seriesFixturesDescriptor.discover(parsed, { mode: "HISTORICAL", depth: 0 });
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.pageType === "scorecard")).toBe(true);
    const job = jobs[0]!;
    expect(job.params).toHaveProperty("matchId");
    expect(job.params).toHaveProperty("seriesSlug", "ipl-2026");
    expect(job.depth).toBe(1);
  });

  it("does not fan out non-live matches in LIVE mode", () => {
    const liveJobs = seriesFixturesDescriptor.discover(parsed, { mode: "LIVE", depth: 0 });
    // The golden fixture is a finished season (all POST), so LIVE mode yields nothing.
    const anyLive = parsed.matches.some((m) => m.state === "LIVE");
    if (!anyLive) expect(liveJobs).toHaveLength(0);
  });
});
