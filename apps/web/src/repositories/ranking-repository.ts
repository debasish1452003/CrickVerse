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
  player: { name: string };
}

/** Data access for the rankings page (Elo replay inputs + format leaderboards). */
export class RankingRepository extends BaseRepository {
  /** Every decided match in the given classes, for the Elo replay (unsorted). */
  eloMatches(classes: string[]): Promise<EloMatchRow[]> {
    return this.prisma.careerMatch.findMany({
      where: { matchClass: { in: classes }, teamHome: { not: null }, teamAway: { not: null } },
      select: {
        matchClass: true,
        matchDate: true,
        matchId: true,
        teamHome: true,
        teamAway: true,
        winner: true,
      },
    });
  }

  /** Top run-scorers in a format, from the gold per-class stats. */
  topBatters(matchClass: string, limit: number): Promise<CareerStatLeaderRow[]> {
    return this.prisma.careerStat.findMany({
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
        player: { select: { name: true } },
      },
    });
  }

  /** Top wicket-takers in a format, from the gold per-class stats. */
  topBowlers(matchClass: string, limit: number): Promise<CareerStatLeaderRow[]> {
    return this.prisma.careerStat.findMany({
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
        player: { select: { name: true } },
      },
    });
  }
}
