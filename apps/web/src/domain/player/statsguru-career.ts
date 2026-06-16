import { MatchClasses, type MatchClass } from "@/core/match-class";
import { BattingCareer, type BattingInningsLike } from "./batting-career";
import { BowlingCareer, type BowlingInningsLike } from "./bowling-career";
import { FormatCareer } from "./format-career";

/** One per-innings row from `PlayerInningsHistory` (Statsguru recovery). */
export interface PlayerInningsHistoryRow {
  source: string; // CRICINFO_STATSGURU (complete scrape) | CRICINFO_BULK (batting-only stand-in)
  matchClass: string;
  discipline: string; // "batting" | "bowling"
  matchDate: string | null;
  opposition: string | null;
  ground: string | null;
  didBat: boolean;
  runs: number | null;
  notOut: boolean;
  ballsFaced: number | null;
  fours: number | null;
  sixes: number | null;
  dismissal: string | null;
  ballsBowled: number | null;
  runsConceded: number | null;
  wickets: number | null;
}

export interface StatsguruInnings {
  matchClass: string;
  date: string | null;
  opposition: string | null;
  runs: number;
  notOut: boolean;
  balls: number | null;
}

/**
 * A player's COMPLETE career, aggregated from the per-innings Statsguru recovery
 * ({@link PlayerInningsHistoryRow}). Unlike the Cricsheet gold `CareerStat` — which
 * only covers the ball-by-ball sample (~2002→) — these innings span the player's
 * whole career, so the totals match the official/ESPNcricinfo figures including
 * the pre-2000 years. The player page shows this as the headline career and keeps
 * the Cricsheet line as the labelled "ball-by-ball analytical sample" (no summing
 * across sources — each is presented for what it is).
 */
/** Source precedence: the complete id-exact scrape beats the batting-only bulk. */
function sourceRank(source: string): number {
  if (source === "CRICINFO_STATSGURU") return 0;
  if (source === "CRICINFO_BULK") return 1;
  return 2;
}

export class StatsguruCareer {
  /** Only the single highest-precedence source's rows — never mix/sum sources. */
  private readonly rows: PlayerInningsHistoryRow[];

  constructor(allRows: PlayerInningsHistoryRow[]) {
    if (allRows.length === 0) {
      this.rows = [];
      return;
    }
    const best = Math.min(...allRows.map((r) => sourceRank(r.source)));
    this.rows = allRows.filter((r) => sourceRank(r.source) === best);
  }

  get hasData(): boolean {
    return this.rows.length > 0;
  }

  /** Earliest / latest innings date across all rows — the career span. */
  get span(): { first: string | null; last: string | null } {
    const dates = this.rows
      .map((r) => r.matchDate)
      .filter((d): d is string => !!d)
      .sort();
    return { first: dates[0] ?? null, last: dates[dates.length - 1] ?? null };
  }

  /** One complete career line per class, in display order. */
  byFormat(): FormatCareer[] {
    const classes = [...new Set(this.rows.map((r) => r.matchClass))];
    return classes
      .sort((a, b) => MatchClasses.order(a) - MatchClasses.order(b))
      .map((mc) => this.formatLine(mc as MatchClass));
  }

  private formatLine(mc: MatchClass): FormatCareer {
    const rows = this.rows.filter((r) => r.matchClass === mc);

    // DNB rows are excluded from batting innings (cricket convention).
    const battingInnings: BattingInningsLike[] = rows
      .filter((r) => r.discipline === "batting" && r.didBat)
      .map((r) => ({
        runs: r.runs ?? 0,
        balls: r.ballsFaced ?? 0,
        fours: r.fours ?? 0,
        sixes: r.sixes ?? 0,
        dismissal: r.notOut ? "NOT_OUT" : r.dismissal ?? "OUT",
      }));

    const bowlingInnings: BowlingInningsLike[] = rows
      .filter((r) => r.discipline === "bowling" && (r.ballsBowled != null || r.wickets != null))
      .map((r) => ({
        wickets: r.wickets ?? 0,
        runs: r.runsConceded ?? 0,
        balls: r.ballsBowled ?? 0,
      }));

    // Distinct matches across both disciplines, keyed by the dedupe signature.
    const matches = new Set(rows.map((r) => `${r.matchDate ?? ""}|${r.opposition ?? ""}|${r.ground ?? ""}`)).size;

    return new FormatCareer(
      mc,
      matches,
      BattingCareer.fromInnings(battingInnings),
      BowlingCareer.fromInnings(bowlingInnings),
    );
  }

  /** Most-recent batting innings, newest first, for the innings list. */
  recentBatting(limit = 15): StatsguruInnings[] {
    return this.rows
      .filter((r) => r.discipline === "batting" && r.didBat && r.runs != null)
      .sort((a, b) => (b.matchDate ?? "").localeCompare(a.matchDate ?? ""))
      .slice(0, limit)
      .map((r) => ({
        matchClass: r.matchClass,
        date: r.matchDate,
        opposition: r.opposition,
        runs: r.runs ?? 0,
        notOut: r.notOut,
        balls: r.ballsFaced,
      }));
  }
}
