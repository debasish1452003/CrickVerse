import { MatchClasses, type MatchClass } from "@/core/match-class";
import { BattingCareer } from "./batting-career";
import { BowlingCareer } from "./bowling-career";

/**
 * A player's career line for a single class of cricket (Tests / ODIs / T20s …),
 * pairing the batting and bowling value objects with the match count. Exposes
 * the label + international flag so the player table renders straight off the
 * object without reaching back into the MatchClasses helper.
 */
export class FormatCareer {
  constructor(
    readonly matchClass: MatchClass,
    readonly matches: number,
    readonly batting: BattingCareer,
    readonly bowling: BowlingCareer,
  ) {}

  /** Human label, e.g. "T20Is". */
  get label(): string {
    return MatchClasses.label(this.matchClass);
  }

  /** Whether this is an international format (Tests / ODIs / T20Is). */
  get isInternational(): boolean {
    return MatchClasses.isInternational(this.matchClass);
  }

  get hasBatting(): boolean {
    return this.batting.innings > 0;
  }

  get hasBowling(): boolean {
    return this.bowling.innings > 0;
  }

  /** Whole-career headline totals across a set of per-format lines. */
  static totals(lines: FormatCareer[]): { matches: number; runs: number; wickets: number } {
    return lines.reduce(
      (t, c) => ({
        matches: t.matches + c.matches,
        runs: t.runs + c.batting.runs,
        wickets: t.wickets + c.bowling.wickets,
      }),
      { matches: 0, runs: 0, wickets: 0 },
    );
  }
}
