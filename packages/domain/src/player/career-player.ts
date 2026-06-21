import { MatchClasses, type MatchClass } from "../core/match-class";
import { BattingCareer } from "./batting-career";
import { BowlingCareer } from "./bowling-career";
import { FormatCareer } from "./format-career";
import { StatsguruCareer, type PlayerInningsHistoryRow } from "./statsguru-career";

/** One gold per-format career stat row (lakehouse `CareerStat`). */
export interface CareerStatRow {
  matchClass: string;
  matches: number;
  // Batting
  batInnings: number;
  notOuts: number;
  runs: number;
  ballsFaced: number;
  highScore: number;
  highScoreNotOut: boolean;
  fifties: number;
  hundreds: number;
  ducks: number;
  fours: number;
  sixes: number;
  battingAvg: number | null;
  strikeRate: number | null;
  // Bowling
  bowlInnings: number;
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
  bestBowlingWkts: number;
  bestBowlingRuns: number;
  fiveWickets: number;
  economy: number | null;
  bowlingAvg: number | null;
  bowlingSr: number | null;
}

export interface CareerCoverageRow {
  matchClass: string;
  source: string;
  firstMatchDate: string | null;
  lastMatchDate: string | null;
  matchesCovered: number;
  coverageNote: string | null;
}

export interface OfficialCareerStatRow {
  matchClass: string;
  source: string;
  matches: number | null;
  runs: number | null;
  wickets: number | null;
  battingAvg: number | null;
  bowlingAvg: number | null;
  sourceUrl: string | null;
}

/** The gold `CareerPlayer` aggregate (keyed by Cricsheet id) plus its stat rows. */
export interface CareerPlayerRow {
  cricsheetId: string;
  name: string;
  cricinfoId: string | null;
  gender: string | null;
  careerMatches: number;
  careerRuns: number;
  careerWickets: number;
  stats: CareerStatRow[];
  coverage: CareerCoverageRow[];
  officialStats: OfficialCareerStatRow[];
  /** Per-innings Statsguru recovery (complete career incl. pre-2000); may be empty. */
  inningsHistory: PlayerInningsHistoryRow[];
}

/**
 * A player's complete, full-corpus career from the lakehouse gold tables. This
 * is the primary player entity (the canonical {@link Player} is the fallback for
 * scorecard-linked cuids). Per-format lines are adapted from the pre-computed
 * gold aggregates so the same career-table renderer serves both paths.
 */
export class CareerPlayer {
  constructor(private readonly row: CareerPlayerRow) {}

  get id(): string {
    return this.row.cricsheetId;
  }
  get name(): string {
    return this.row.name;
  }
  get cricinfoId(): string | null {
    return this.row.cricinfoId;
  }
  get gender(): string | null {
    return this.row.gender;
  }
  get careerMatches(): number {
    return this.row.careerMatches;
  }
  get careerRuns(): number {
    return this.row.careerRuns;
  }
  get careerWickets(): number {
    return this.row.careerWickets;
  }

  /** "Men's cricket" / "Women's cricket" / null. */
  get genderLabel(): string | null {
    if (this.row.gender === "female") return "Women's cricket";
    if (this.row.gender === "male") return "Men's cricket";
    return null;
  }

  /** One career line per class, in display order. */
  byFormat(): FormatCareer[] {
    return [...this.row.stats]
      .sort((a, b) => MatchClasses.order(a.matchClass) - MatchClasses.order(b.matchClass))
      .map(
        (s) =>
          new FormatCareer(
            s.matchClass as MatchClass,
            s.matches,
            BattingCareer.fromAggregate({
              innings: s.batInnings,
              notOuts: s.notOuts,
              runs: s.runs,
              balls: s.ballsFaced,
              highScore: s.highScore,
              highScoreNotOut: s.highScoreNotOut,
              fifties: s.fifties,
              hundreds: s.hundreds,
              zeros: s.ducks,
              fours: s.fours,
              sixes: s.sixes,
              average: s.battingAvg,
              strikeRate: s.strikeRate,
            }),
            BowlingCareer.fromAggregate({
              innings: s.bowlInnings,
              wickets: s.wickets,
              runs: s.runsConceded,
              balls: s.ballsBowled,
              economy: s.economy,
              average: s.bowlingAvg,
              strikeRate: s.bowlingSr,
              fiveWickets: s.fiveWickets,
              bestWickets: s.bestBowlingWkts,
              bestRuns: s.bestBowlingRuns,
            }),
          ),
      );
  }

  coverageFor(matchClass: MatchClass): CareerCoverageRow | null {
    return this.row.coverage.find((c) => c.matchClass === matchClass) ?? null;
  }

  officialFor(matchClass: MatchClass): OfficialCareerStatRow | null {
    return this.row.officialStats.find((s) => s.matchClass === matchClass) ?? null;
  }

  hasOfficialStats(): boolean {
    return this.row.officialStats.length > 0;
  }

  /**
   * The complete career aggregated from the per-innings Statsguru recovery, or
   * null when none has been recovered yet. Spans the whole career (incl. the
   * pre-2000 years absent from the Cricsheet ball-by-ball corpus).
   */
  statsguruCareer(): StatsguruCareer | null {
    const sg = new StatsguruCareer(this.row.inningsHistory ?? []);
    return sg.hasData ? sg : null;
  }
}
