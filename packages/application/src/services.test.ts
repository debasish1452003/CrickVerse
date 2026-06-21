import { describe, expect, it } from "vitest";
import { MatchService, PlayerService, StatsService, TeamService } from "./index";
import type { MatchRepository, PlayerRepository, StatsRepository, TeamRepository } from "./index";

describe("application services", () => {
  it("hydrates a career player domain object", async () => {
    const players: PlayerRepository = {
      careerPlayer: async () => ({
        cricsheetId: "p1",
        name: "Ada Batter",
        cricinfoId: "42",
        gender: "female",
        careerMatches: 1,
        careerRuns: 10,
        careerWickets: 0,
        stats: [],
        coverage: [],
        officialStats: [],
        inningsHistory: [],
      }),
      canonicalPlayer: async () => null,
      profile: async () => null,
      profilesByIds: async () => new Map(),
      photosByIds: async () => new Map(),
      topByMetric: async () => [],
      countCareer: async () => 0,
      pageCareer: async () => [],
    };

    const player = await new PlayerService(players).careerPlayer("p1");
    expect(player?.name).toBe("Ada Batter");
    expect(player?.genderLabel).toBe("Women's cricket");
  });

  it("hydrates a gold match domain object", async () => {
    const matches: MatchRepository = {
      listCanonical: async () => [],
      canonicalForList: async () => null,
      goldMatch: async () => ({
        matchId: "m1",
        matchClass: "T20",
        eventName: "League",
        teamHome: "A",
        teamAway: "B",
        winner: "A",
        matchDate: "2026-01-01",
        venue: "Ground",
        city: "City",
        tossWinner: "B",
        tossDecision: "field",
        innings: [],
        batting: [],
        bowling: [],
      }),
      canonicalMatch: async () => null,
      inningsOvers: async () => [],
      countMatches: async () => 0,
      pageMatches: async () => [],
      countTeamMatches: async () => 0,
      pageTeamMatches: async () => [],
      editionMeta: async () => ({ matches: 0, firstDate: null, lastDate: null, dominantClass: null }),
    };

    const match = await new MatchService(matches).goldMatch("m1");
    expect(match?.title).toBe("A vs B");
    expect(match?.resultText).toBe("A won");
  });

  it("hydrates team badges through repository profiles", async () => {
    const teams: TeamRepository = {
      listProfiles: async () => [],
      profileById: async () => null,
      profilesByNames: async () => [
        {
          id: "india",
          displayName: "India",
          logoUrl: null,
          flagUrl: "flag.svg",
          primaryColor: "#123456",
          isNational: true,
          country: "India",
          matchCount: 10,
        },
      ],
      gendersForTeam: async () => ["male"],
      record: async () => ({
        played: 0,
        won: 0,
        lost: 0,
        noResult: 0,
        firstMatchDate: null,
        lastMatchDate: null,
      }),
      squad: async () => [],
    };

    const index = await new TeamService(teams).badgeIndex(["India"]);
    expect(index.badgeFor("india")).toEqual({ src: "flag.svg", primaryColor: "#123456" });
  });

  it("adds player photos to tournament leaderboard rows", async () => {
    const stats: StatsRepository = {
      editionMatches: async () => [{ matchId: "m1", matchClass: "T20" }],
      editionBatting: async () => [
        { cricsheetId: "p1", name: "Ada Batter", runs: 80, balls: 40, fours: 6, sixes: 4, out: true },
      ],
      editionBowling: async () => [
        { cricsheetId: "p2", name: "Bea Bowler", balls: 24, runs: 20, wickets: 3 },
      ],
      playerPhotosByIds: async () =>
        new Map([
          ["p1", "ada.jpg"],
          ["p2", "bea.jpg"],
        ]),
      standingsMatches: async () => [],
      standingsInnings: async () => new Map(),
      squadMatches: async () => [],
      squadInnings: async () => [],
      squadBatting: async () => [],
      squadBowling: async () => [],
      editionVenues: async () => [],
    };

    const leaders = await new StatsService(stats).tournamentStats("League", "2026", 5);
    expect(leaders.mostRuns[0]?.photoUrl).toBe("ada.jpg");
    expect(leaders.mostWickets[0]?.photoUrl).toBe("bea.jpg");
  });
});
