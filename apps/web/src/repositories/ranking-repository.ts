import { BaseRepository } from "./base-repository";

/** A match row fed into the Elo replay. */
export interface EloMatchRow {
  matchClass: string;
  matchDate: string | null;
  matchId: string;
  teamHome: string | null;
  teamAway: string | null;
  winner: string | null;
}

/** A career-stat leaderboard row (with the player's name joined). */
export interface CareerStatLeaderRow {
  cricsheetId: string;
  matches: number;
  runs: number;
  battingAvg: number | null;
  wickets: number;
  economy: number | null;
  bowlingAvg: number | null;
  player: { name: string };
}

/** Official career leaderboard row, imported with provenance. */
export interface OfficialCareerStatLeaderRow {
  cricsheetId: string;
  matches: number | null;
  runs: number | null;
  wickets: number | null;
  battingAvg: number | null;
  bowlingAvg: number | null;
  source: string;
  player: { name: string };
}

/** Data access for the rankings page (Elo replay inputs + format leaderboards). */
export class RankingRepository extends BaseRepository {
  /** Every decided match in the given classes, for the Elo replay (unsorted). */
  eloMatches(classes: string[]): Promise<EloMatchRow[]> {
    return this.retryRead(() =>
      this.prisma.careerMatch.findMany({
        where: { matchClass: { in: classes }, teamHome: { not: null }, teamAway: { not: null } },
        select: {
          matchClass: true,
          matchDate: true,
          matchId: true,
          teamHome: true,
          teamAway: true,
          winner: true,
        },
      }),
    );
  }

  /** Top official run-scorers in a format, imported from trusted/manual sources. */
  topOfficialBatters(matchClass: string, limit: number): Promise<OfficialCareerStatLeaderRow[]> {
    return this.optionalTableRead(
      () =>
        this.prisma.officialCareerStat.findMany({
          where: { matchClass, runs: { gt: 0 } },
          orderBy: [{ runs: "desc" }, { matches: "asc" }],
          take: limit,
          select: {
            cricsheetId: true,
            matches: true,
            runs: true,
            wickets: true,
            battingAvg: true,
            bowlingAvg: true,
            source: true,
            player: { select: { name: true } },
          },
        }),
      [],
    );
  }

  /** Top official wicket-takers in a format, imported from trusted/manual sources. */
  topOfficialBowlers(matchClass: string, limit: number): Promise<OfficialCareerStatLeaderRow[]> {
    return this.optionalTableRead(
      () =>
        this.prisma.officialCareerStat.findMany({
          where: { matchClass, wickets: { gt: 0 } },
          orderBy: [{ wickets: "desc" }, { matches: "asc" }],
          take: limit,
          select: {
            cricsheetId: true,
            matches: true,
            runs: true,
            wickets: true,
            battingAvg: true,
            bowlingAvg: true,
            source: true,
            player: { select: { name: true } },
          },
        }),
      [],
    );
  }

  /** Top run-scorers in a format, from the gold per-class stats. */
  topBatters(matchClass: string, limit: number): Promise<CareerStatLeaderRow[]> {
    return this.retryRead(() =>
      this.prisma.careerStat.findMany({
        where: { matchClass, runs: { gt: 0 } },
        orderBy: { runs: "desc" },
        take: limit,
        select: {
          cricsheetId: true,
          matches: true,
          runs: true,
          battingAvg: true,
          wickets: true,
          economy: true,
          bowlingAvg: true,
          player: { select: { name: true } },
        },
      }),
    );
  }

  /** Top wicket-takers in a format, from the gold per-class stats. */
  topBowlers(matchClass: string, limit: number): Promise<CareerStatLeaderRow[]> {
    return this.retryRead(() =>
      this.prisma.careerStat.findMany({
        where: { matchClass, wickets: { gt: 0 } },
        orderBy: { wickets: "desc" },
        take: limit,
        select: {
          cricsheetId: true,
          matches: true,
          runs: true,
          battingAvg: true,
          wickets: true,
          economy: true,
          bowlingAvg: true,
          player: { select: { name: true } },
        },
      }),
    );
  }
}
