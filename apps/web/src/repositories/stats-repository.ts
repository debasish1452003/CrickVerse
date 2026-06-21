import type { StandingsInnings, StandingsMatch } from "@crickverse/domain";
import { BaseRepository } from "./base-repository";

export interface EditionBattingRow {
  cricsheetId: string | null;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
}

export interface EditionBowlingRow {
  cricsheetId: string | null;
  name: string;
  balls: number;
  runs: number;
  wickets: number;
}

export interface SquadInningsRow {
  matchId: string;
  inningsNo: number;
  battingTeam: string | null;
}

export interface SquadBattingRow {
  matchId: string;
  inningsNo: number;
  cricsheetId: string | null;
  name: string;
  runs: number;
}

export interface SquadBowlingRow {
  matchId: string;
  inningsNo: number;
  cricsheetId: string | null;
  name: string;
  wickets: number;
}

export interface EditionVenueRow {
  venue: string | null;
  city: string | null;
  matches: number;
}

/** Data access for tournament-edition stats, standings, squads and venues. */
export class StatsRepository extends BaseRepository {
  /** matchId + class for every match in an edition. */
  editionMatches(eventName: string | null, season: string | null): Promise<{ matchId: string; matchClass: string }[]> {
    return this.prisma.careerMatch.findMany({
      where: { eventName, season },
      select: { matchId: true, matchClass: true },
    });
  }

  editionBatting(matchIds: string[]): Promise<EditionBattingRow[]> {
    return this.prisma.scorecardBatting.findMany({
      where: { matchId: { in: matchIds } },
      select: { cricsheetId: true, name: true, runs: true, balls: true, fours: true, sixes: true, out: true },
    });
  }

  editionBowling(matchIds: string[]): Promise<EditionBowlingRow[]> {
    return this.prisma.scorecardBowling.findMany({
      where: { matchId: { in: matchIds } },
      select: { cricsheetId: true, name: true, balls: true, runs: true, wickets: true },
    });
  }

  /** Player portrait lookup for edition leaderboards, keyed by Cricsheet id. */
  async playerPhotosByIds(ids: string[]): Promise<Map<string, string | null>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.playerProfile.findMany({
      where: { cricsheetId: { in: ids } },
      select: { cricsheetId: true, photoUrl: true },
    });
    return new Map(rows.map((p) => [p.cricsheetId, p.photoUrl]));
  }

  /** Match rows (with result + class) for the points-table calculation. */
  standingsMatches(eventName: string | null, season: string | null): Promise<StandingsMatch[]> {
    return this.prisma.careerMatch.findMany({
      where: { eventName, season },
      select: { matchId: true, teamHome: true, teamAway: true, winner: true, matchClass: true },
    });
  }

  async standingsInnings(matchIds: string[]): Promise<Map<string, StandingsInnings[]>> {
    const rows = await this.prisma.scorecardInnings.findMany({
      where: { matchId: { in: matchIds } },
      select: { matchId: true, battingTeam: true, runs: true, balls: true, wickets: true },
    });
    const byMatch = new Map<string, StandingsInnings[]>();
    for (const i of rows) {
      const list = byMatch.get(i.matchId);
      if (list) list.push(i);
      else byMatch.set(i.matchId, [i]);
    }
    return byMatch;
  }

  squadMatches(eventName: string | null, season: string | null): Promise<{ matchId: string; teamHome: string | null; teamAway: string | null }[]> {
    return this.prisma.careerMatch.findMany({
      where: { eventName, season },
      select: { matchId: true, teamHome: true, teamAway: true },
    });
  }

  squadInnings(matchIds: string[]): Promise<SquadInningsRow[]> {
    return this.prisma.scorecardInnings.findMany({
      where: { matchId: { in: matchIds } },
      select: { matchId: true, inningsNo: true, battingTeam: true },
    });
  }

  squadBatting(matchIds: string[]): Promise<SquadBattingRow[]> {
    return this.prisma.scorecardBatting.findMany({
      where: { matchId: { in: matchIds } },
      select: { matchId: true, inningsNo: true, cricsheetId: true, name: true, runs: true },
    });
  }

  squadBowling(matchIds: string[]): Promise<SquadBowlingRow[]> {
    return this.prisma.scorecardBowling.findMany({
      where: { matchId: { in: matchIds } },
      select: { matchId: true, inningsNo: true, cricsheetId: true, name: true, wickets: true },
    });
  }

  /** Venues used in an edition with match counts (most-used first). */
  async editionVenues(eventName: string | null, season: string | null): Promise<EditionVenueRow[]> {
    const groups = await this.prisma.careerMatch.groupBy({
      by: ["venue", "city"],
      where: { eventName, season },
      _count: { _all: true },
    });
    return groups
      .map((g) => ({ venue: g.venue, city: g.city, matches: g._count._all }))
      .sort((a, b) => b.matches - a.matches);
  }
}
