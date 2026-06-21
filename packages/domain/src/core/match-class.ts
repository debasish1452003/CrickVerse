export type MatchClass =
  | "TEST"
  | "ODI"
  | "T20I"
  | "FIRST_CLASS"
  | "LIST_A"
  | "T20"
  | "T10"
  | "HUNDRED"
  | "OTHER";

/**
 * Static helper around the Prisma `MatchClass` enum — display order, labels, and
 * the format-shape predicates (limited-overs, international) that several
 * services and pages need. Centralizing this here means the rules live in one
 * place instead of being re-declared in queries / player-stats / page modules.
 */
export class MatchClasses {
  /** Display order, ESPNcricinfo-style (internationals first, then domestic). */
  static readonly ORDER: readonly MatchClass[] = [
    "TEST",
    "ODI",
    "T20I",
    "FIRST_CLASS",
    "LIST_A",
    "T20",
    "T10",
    "HUNDRED",
    "OTHER",
  ];

  private static readonly LABELS: Record<MatchClass, string> = {
    TEST: "Tests",
    ODI: "ODIs",
    T20I: "T20Is",
    FIRST_CLASS: "First-class",
    LIST_A: "List A",
    T20: "T20s",
    T10: "T10",
    HUNDRED: "The Hundred",
    OTHER: "Other",
  };

  /** International formats — the three the ICC / Cricbuzz rank teams in. */
  private static readonly INTERNATIONAL: ReadonlySet<MatchClass> = new Set<MatchClass>([
    "TEST",
    "ODI",
    "T20I",
  ]);

  /** Classes that have a points-table / NRR concept (limited-overs). */
  private static readonly LIMITED_OVERS: ReadonlySet<string> = new Set([
    "T20",
    "T20I",
    "ODI",
    "LIST_A",
    "HUNDRED",
    "T10",
  ]);

  /** Human label for a class, falling back to the raw token for unknown values. */
  static label(c: string | null | undefined): string {
    if (!c) return "Other";
    return this.LABELS[c as MatchClass] ?? c;
  }

  static isInternational(c: MatchClass): boolean {
    return this.INTERNATIONAL.has(c);
  }

  static isLimitedOvers(c: string | null | undefined): boolean {
    return c ? this.LIMITED_OVERS.has(c) : false;
  }

  /** Position in {@link ORDER}; unknown classes sort to the end. */
  static order(c: string): number {
    const i = this.ORDER.indexOf(c as MatchClass);
    return i === -1 ? this.ORDER.length : i;
  }

  /** Full-quota balls per innings, for the NRR all-out adjustment (0 = unknown). */
  static quotaBalls(c: string | null | undefined): number {
    switch (c) {
      case "T20":
      case "T20I":
        return 120;
      case "ODI":
      case "LIST_A":
        return 300;
      case "T10":
        return 60;
      case "HUNDRED":
        return 100;
      default:
        return 0;
    }
  }
}
