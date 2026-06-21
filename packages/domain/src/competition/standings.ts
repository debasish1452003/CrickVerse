import { MatchClasses } from "../core/match-class";

/** One row of a tournament points table. */
export interface StandingRow {
  team: string;
  played: number;
  won: number;
  lost: number;
  /** Ties + no-results lumped (gold stores only `winner`). */
  noResult: number;
  points: number;
  /** Net run rate: runs-per-over scored minus runs-per-over conceded. */
  nrr: number;
}

/** A match the calculator scores into the table. */
export interface StandingsMatch {
  matchId: string;
  teamHome: string | null;
  teamAway: string | null;
  winner: string | null;
  matchClass: string | null;
}

/** One innings used for the NRR contribution. */
export interface StandingsInnings {
  battingTeam: string | null;
  runs: number;
  balls: number;
  wickets: number;
}

interface Acc {
  played: number;
  won: number;
  lost: number;
  noResult: number;
  runsFor: number;
  ballsFor: number;
  runsAgainst: number;
  ballsAgainst: number;
}

/**
 * Builds a tournament-edition points table with Net Run Rate. Win = 2 pts, tie /
 * no-result = 1 pt (gold stores only `winner`, so ties and abandoned games can't
 * be told apart and are lumped as "NR"). NRR applies the standard all-out rule: a
 * side bowled out is charged its full over quota in the run-rate denominator.
 */
export class StandingsCalculator {
  private readonly table = new Map<string, Acc>();

  private acc(team: string): Acc {
    let a = this.table.get(team);
    if (!a)
      this.table.set(
        team,
        (a = {
          played: 0,
          won: 0,
          lost: 0,
          noResult: 0,
          runsFor: 0,
          ballsFor: 0,
          runsAgainst: 0,
          ballsAgainst: 0,
        }),
      );
    return a;
  }

  /** Score one match (with its innings, if any) into the table. */
  addMatch(m: StandingsMatch, innings: StandingsInnings[]): void {
    const home = m.teamHome;
    const away = m.teamAway;
    if (!home || !away) return;

    const ah = this.acc(home);
    const aa = this.acc(away);
    ah.played++;
    aa.played++;
    if (m.winner === home) {
      ah.won++;
      aa.lost++;
    } else if (m.winner === away) {
      aa.won++;
      ah.lost++;
    } else {
      ah.noResult++;
      aa.noResult++;
    }

    // NRR contribution (needs both innings present).
    const quota = MatchClasses.quotaBalls(m.matchClass);
    const homeInn = innings.find((i) => i.battingTeam === home);
    const awayInn = innings.find((i) => i.battingTeam === away);
    if (homeInn && awayInn) {
      const eff = (i: StandingsInnings) => (quota > 0 && i.wickets >= 10 ? quota : i.balls);
      const hb = eff(homeInn);
      const ab = eff(awayInn);
      ah.runsFor += homeInn.runs;
      ah.ballsFor += hb;
      ah.runsAgainst += awayInn.runs;
      ah.ballsAgainst += ab;
      aa.runsFor += awayInn.runs;
      aa.ballsFor += ab;
      aa.runsAgainst += homeInn.runs;
      aa.ballsAgainst += hb;
    }
  }

  /** Final table, sorted by points, then NRR, then team name. */
  rows(): StandingRow[] {
    const rows: StandingRow[] = [...this.table.entries()].map(([team, a]) => {
      const rateFor = a.ballsFor > 0 ? a.runsFor / (a.ballsFor / 6) : 0;
      const rateAgainst = a.ballsAgainst > 0 ? a.runsAgainst / (a.ballsAgainst / 6) : 0;
      return {
        team,
        played: a.played,
        won: a.won,
        lost: a.lost,
        noResult: a.noResult,
        points: a.won * 2 + a.noResult,
        nrr: rateFor - rateAgainst,
      };
    });
    rows.sort((x, y) => y.points - x.points || y.nrr - x.nrr || x.team.localeCompare(y.team));
    return rows;
  }
}
