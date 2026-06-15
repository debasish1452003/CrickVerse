import { MatchClasses } from "@/core/match-class";
import { StandingsCalculator, type StandingRow } from "@/domain/competition/standings";
import { Venue } from "@/domain/venue/venue";
import type { EditionSquad, EditionSquadMember, TournamentStats } from "@/dto/stats-dto";
import type { StatsRepository } from "@/repositories/stats-repository";

const fmt1 = (n: number) => n.toFixed(1);
const fmt2 = (n: number) => n.toFixed(2);

const EMPTY_STATS: TournamentStats = {
  mostRuns: [],
  highestScores: [],
  mostSixes: [],
  mostFours: [],
  bestStrikeRate: [],
  mostWickets: [],
  bestEconomy: [],
};

interface BatAgg {
  cricsheetId: string | null;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  innings: number;
}
interface BowlAgg {
  cricsheetId: string | null;
  name: string;
  balls: number;
  runs: number;
  wickets: number;
}

/** Tournament-edition application service — points table, stats, squads, venues. */
export class StatsService {
  constructor(private readonly stats: StatsRepository) {}

  /** Points table (with NRR) for one tournament edition. */
  async standings(eventName: string | null, season: string | null): Promise<StandingRow[]> {
    const matches = await this.stats.standingsMatches(eventName, season);
    if (matches.length === 0) return [];
    const innByMatch = await this.stats.standingsInnings(matches.map((m) => m.matchId));
    const calc = new StandingsCalculator();
    for (const m of matches) calc.addMatch(m, innByMatch.get(m.matchId) ?? []);
    return calc.rows();
  }

  /**
   * Per-edition leaderboards (Most Runs / Wickets / Sixes / Fours, Highest Score,
   * Best SR / Economy), folded in JS from the edition's scorecard rows — bounded
   * to a single edition, so no global scan.
   */
  async tournamentStats(
    eventName: string | null,
    season: string | null,
    limit = 10,
  ): Promise<TournamentStats> {
    const matches = await this.stats.editionMatches(eventName, season);
    const ids = matches.map((m) => m.matchId);
    if (ids.length === 0) return EMPTY_STATS;

    const [batting, bowling] = await Promise.all([
      this.stats.editionBatting(ids),
      this.stats.editionBowling(ids),
    ]);

    // Limited-overs editions get small ball thresholds for rate-based boards;
    // multi-day formats use larger ones so a 2-ball cameo can't top "Best SR".
    const lo = MatchClasses.isLimitedOvers(matches[0]?.matchClass);
    const minBatBalls = lo ? 30 : 120;
    const minBowlBalls = lo ? 60 : 240;

    const bats = new Map<string, BatAgg>();
    const bowls = new Map<string, BowlAgg>();
    const key = (id: string | null, name: string) => id ?? `name:${name}`;

    for (const b of batting) {
      const k = key(b.cricsheetId, b.name);
      let a = bats.get(k);
      if (!a) bats.set(k, (a = { cricsheetId: b.cricsheetId, name: b.name, runs: 0, balls: 0, fours: 0, sixes: 0, innings: 0 }));
      a.runs += b.runs;
      a.balls += b.balls;
      a.fours += b.fours;
      a.sixes += b.sixes;
      a.innings++;
    }
    for (const b of bowling) {
      const k = key(b.cricsheetId, b.name);
      let a = bowls.get(k);
      if (!a) bowls.set(k, (a = { cricsheetId: b.cricsheetId, name: b.name, balls: 0, runs: 0, wickets: 0 }));
      a.balls += b.balls;
      a.runs += b.runs;
      a.wickets += b.wickets;
    }

    const batArr = [...bats.values()];
    const bowlArr = [...bowls.values()];
    const top = <T>(arr: T[], cmp: (a: T, b: T) => number, n: number) => [...arr].sort(cmp).slice(0, n);

    return {
      mostRuns: top(batArr, (a, b) => b.runs - a.runs, limit).map((p) => ({
        cricsheetId: p.cricsheetId,
        name: p.name,
        value: p.runs.toLocaleString(),
        detail: `${p.innings} inns · SR ${p.balls > 0 ? fmt1((p.runs / p.balls) * 100) : "—"}`,
      })),
      highestScores: top(batting, (a, b) => b.runs - a.runs, limit).map((b) => ({
        cricsheetId: b.cricsheetId,
        name: b.name,
        value: `${b.runs}${b.out ? "" : "*"}`,
        detail: `${b.balls} balls · ${b.fours}×4 ${b.sixes}×6`,
      })),
      mostSixes: top(batArr.filter((p) => p.sixes > 0), (a, b) => b.sixes - a.sixes, limit).map((p) => ({
        cricsheetId: p.cricsheetId,
        name: p.name,
        value: String(p.sixes),
        detail: `${p.runs} runs`,
      })),
      mostFours: top(batArr.filter((p) => p.fours > 0), (a, b) => b.fours - a.fours, limit).map((p) => ({
        cricsheetId: p.cricsheetId,
        name: p.name,
        value: String(p.fours),
        detail: `${p.runs} runs`,
      })),
      bestStrikeRate: top(
        batArr.filter((p) => p.balls >= minBatBalls),
        (a, b) => b.runs / b.balls - a.runs / a.balls,
        limit,
      ).map((p) => ({
        cricsheetId: p.cricsheetId,
        name: p.name,
        value: fmt1((p.runs / p.balls) * 100),
        detail: `${p.runs} off ${p.balls}`,
      })),
      mostWickets: top(
        bowlArr.filter((p) => p.wickets > 0),
        (a, b) => b.wickets - a.wickets || a.runs - b.runs,
        limit,
      ).map((p) => ({
        cricsheetId: p.cricsheetId,
        name: p.name,
        value: String(p.wickets),
        detail: `Econ ${p.balls > 0 ? fmt2(p.runs / (p.balls / 6)) : "—"}`,
      })),
      bestEconomy: top(
        bowlArr.filter((p) => p.balls >= minBowlBalls),
        (a, b) => a.runs / a.balls - b.runs / b.balls,
        limit,
      ).map((p) => ({
        cricsheetId: p.cricsheetId,
        name: p.name,
        value: fmt2(p.runs / (p.balls / 6)),
        detail: `${p.wickets} wkts · ${Math.floor(p.balls / 6)} ov`,
      })),
    };
  }

  /**
   * Squads per team for an edition: every player who batted (their innings' team)
   * or bowled (the opposing side that innings), with appearances + runs + wickets.
   */
  async editionSquads(eventName: string | null, season: string | null): Promise<EditionSquad[]> {
    const matches = await this.stats.squadMatches(eventName, season);
    if (matches.length === 0) return [];
    const ids = matches.map((m) => m.matchId);
    const matchById = new Map(matches.map((m) => [m.matchId, m]));

    const [innings, batting, bowling] = await Promise.all([
      this.stats.squadInnings(ids),
      this.stats.squadBatting(ids),
      this.stats.squadBowling(ids),
    ]);

    const battingTeamOf = new Map<string, string | null>(); // `${matchId}:${inn}` → team
    for (const i of innings) battingTeamOf.set(`${i.matchId}:${i.inningsNo}`, i.battingTeam);

    const squads = new Map<string, Map<string, EditionSquadMember>>();
    const seenApp = new Map<string, Set<string>>();
    const member = (team: string, id: string | null, name: string): EditionSquadMember => {
      let byPlayer = squads.get(team);
      if (!byPlayer) squads.set(team, (byPlayer = new Map()));
      const k = id ?? `name:${name}`;
      let m = byPlayer.get(k);
      if (!m) byPlayer.set(k, (m = { cricsheetId: id, name, appearances: 0, runs: 0, wickets: 0 }));
      return m;
    };
    const bumpAppearance = (team: string, matchId: string, id: string | null, name: string) => {
      let set = seenApp.get(team);
      if (!set) seenApp.set(team, (set = new Set()));
      const k = `${matchId}:${id ?? name}`;
      if (!set.has(k)) {
        set.add(k);
        member(team, id, name).appearances++;
      }
    };

    for (const b of batting) {
      const team = battingTeamOf.get(`${b.matchId}:${b.inningsNo}`);
      if (!team) continue;
      member(team, b.cricsheetId, b.name).runs += b.runs;
      bumpAppearance(team, b.matchId, b.cricsheetId, b.name);
    }
    for (const b of bowling) {
      const battingTeam = battingTeamOf.get(`${b.matchId}:${b.inningsNo}`);
      const match = matchById.get(b.matchId);
      if (!match || !battingTeam) continue;
      // The bowling side is the team that ISN'T batting this innings.
      const team = battingTeam === match.teamHome ? match.teamAway : match.teamHome;
      if (!team) continue;
      member(team, b.cricsheetId, b.name).wickets += b.wickets;
      bumpAppearance(team, b.matchId, b.cricsheetId, b.name);
    }

    return [...squads.entries()]
      .map(([team, byPlayer]) => ({
        team,
        members: [...byPlayer.values()].sort((a, b) => b.appearances - a.appearances || b.runs - a.runs),
      }))
      .sort((a, b) => a.team.localeCompare(b.team));
  }

  /** Venues used in an edition with match counts. */
  async editionVenues(eventName: string | null, season: string | null): Promise<Venue[]> {
    const rows = await this.stats.editionVenues(eventName, season);
    return rows.map((v) => new Venue(v.venue, v.city, v.matches));
  }
}
