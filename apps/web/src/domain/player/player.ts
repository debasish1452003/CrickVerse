import type { MatchClass } from "@/core/match-class";
import { MatchClasses } from "@/core/match-class";
import { BattingCareer } from "./batting-career";
import { BowlingCareer } from "./bowling-career";
import { FormatCareer } from "./format-career";

// Structural shapes the canonical-player repository hydrates (a subset of the
// Prisma Player payload). Declared here so the domain layer owns its own
// contract rather than depending on a Prisma include type.

export interface CanonicalBattingPerf {
  id: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissal: string | null;
  innings: {
    match: {
      id: string;
      title: string | null;
      matchClass: MatchClass | null;
      matchDate: Date | null;
      startTime: Date | null;
      series: { name: string | null } | null;
    };
  };
}

export interface CanonicalBowlingPerf {
  id: string;
  balls: number;
  runs: number;
  wickets: number;
  innings: { match: { id: string; matchClass: MatchClass | null } };
}

export interface CanonicalPlayerRow {
  id: string;
  fullName: string;
  knownAs: string | null;
  country: string | null;
  role: string | null;
  battingStyle: string | null;
  bowlingStyle: string | null;
  battingPerfs: CanonicalBattingPerf[];
  bowlingPerfs: CanonicalBowlingPerf[];
}

/**
 * The canonical player aggregate (keyed by cuid) — the per-innings-backed record
 * that powers the scorecard-linked player pages. Career lines are computed on
 * demand from the player's performances, so all the cricket logic (per-format
 * splits, recent form) lives on the object rather than in page modules.
 */
export class Player {
  constructor(private readonly row: CanonicalPlayerRow) {}

  get id(): string {
    return this.row.id;
  }
  get fullName(): string {
    return this.row.fullName;
  }
  get knownAs(): string | null {
    return this.row.knownAs;
  }
  get country(): string | null {
    return this.row.country;
  }
  get role(): string | null {
    return this.row.role;
  }
  get battingStyle(): string | null {
    return this.row.battingStyle;
  }
  get bowlingStyle(): string | null {
    return this.row.bowlingStyle;
  }

  /** Whole-career batting line (all formats combined). */
  battingCareer(): BattingCareer {
    return BattingCareer.fromInnings(this.row.battingPerfs);
  }

  /** Whole-career bowling line (all formats combined). */
  bowlingCareer(): BowlingCareer {
    return BowlingCareer.fromInnings(this.row.bowlingPerfs);
  }

  /** One career line per class of cricket the player appeared in, in display order. */
  careerByClass(): FormatCareer[] {
    const classOf = (m: { matchClass: MatchClass | null }): MatchClass => m.matchClass ?? "OTHER";

    const batBy = new Map<MatchClass, CanonicalBattingPerf[]>();
    const bowlBy = new Map<MatchClass, CanonicalBowlingPerf[]>();
    const matchIdsBy = new Map<MatchClass, Set<string>>();
    const seen = (cls: MatchClass): Set<string> => {
      let s = matchIdsBy.get(cls);
      if (!s) matchIdsBy.set(cls, (s = new Set()));
      return s;
    };
    const push = <T>(map: Map<MatchClass, T[]>, cls: MatchClass, v: T) => {
      let list = map.get(cls);
      if (!list) map.set(cls, (list = []));
      list.push(v);
    };

    for (const b of this.row.battingPerfs) {
      const cls = classOf(b.innings.match);
      push(batBy, cls, b);
      seen(cls).add(b.innings.match.id);
    }
    for (const w of this.row.bowlingPerfs) {
      const cls = classOf(w.innings.match);
      push(bowlBy, cls, w);
      seen(cls).add(w.innings.match.id);
    }

    return MatchClasses.ORDER.filter((c) => batBy.has(c) || bowlBy.has(c)).map(
      (cls) =>
        new FormatCareer(
          cls,
          matchIdsBy.get(cls)?.size ?? 0,
          BattingCareer.fromInnings(batBy.get(cls) ?? []),
          BowlingCareer.fromInnings(bowlBy.get(cls) ?? []),
        ),
    );
  }

  /** Most recent batting innings (newest first) for the recent-form list. */
  recentBatting(limit = 12): CanonicalBattingPerf[] {
    const time = (b: CanonicalBattingPerf): number =>
      (b.innings.match.matchDate ?? b.innings.match.startTime)?.getTime() ?? 0;
    return [...this.row.battingPerfs].sort((a, b) => time(b) - time(a)).slice(0, limit);
  }
}
