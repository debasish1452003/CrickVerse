import { canonicalTeamId } from "../core/naming";

/** Enrichment profile for a team (logo / flag / colour) — structural subset. */
export interface TeamProfileRow {
  id: string;
  displayName: string;
  logoUrl: string | null;
  flagUrl: string | null;
  primaryColor: string | null;
  isNational: boolean;
  country: string | null;
  matchCount: number;
}

/** A team's crest source + colour, as the `TeamBadge` component consumes it. */
export interface TeamBadge {
  src: string | null;
  primaryColor: string | null;
}

/**
 * A team's enrichment profile. Franchise logo wins over the national flag for
 * the crest; the kind label and badge are derived so list/detail pages render
 * straight off the object.
 */
export class TeamProfile {
  constructor(private readonly row: TeamProfileRow) {}

  get id(): string {
    return this.row.id;
  }
  get displayName(): string {
    return this.row.displayName;
  }
  get logoUrl(): string | null {
    return this.row.logoUrl;
  }
  get flagUrl(): string | null {
    return this.row.flagUrl;
  }
  get primaryColor(): string | null {
    return this.row.primaryColor;
  }
  get isNational(): boolean {
    return this.row.isNational;
  }
  get country(): string | null {
    return this.row.country;
  }
  get matchCount(): number {
    return this.row.matchCount;
  }

  /** Crest image — franchise logo, else national flag. */
  get image(): string | null {
    return this.row.logoUrl ?? this.row.flagUrl;
  }

  get kindLabel(): string {
    return this.row.isNational ? "International" : "League / Domestic";
  }

  get badge(): TeamBadge {
    return { src: this.image, primaryColor: this.row.primaryColor };
  }
}

/**
 * A name→profile lookup for rendering crests in lists (match cards, points
 * tables) where many teams appear at once. Keyed by normalized name so a raw
 * team string resolves to its badge + canonical id.
 */
export class TeamBadgeIndex {
  private constructor(private readonly byName: Map<string, TeamProfileRow>) {}

  static from(rows: TeamProfileRow[]): TeamBadgeIndex {
    return new TeamBadgeIndex(new Map(rows.map((r) => [r.id, r])));
  }

  static empty(): TeamBadgeIndex {
    return new TeamBadgeIndex(new Map());
  }

  private lookup(name: string | null | undefined): TeamProfileRow | undefined {
    return name ? this.byName.get(canonicalTeamId(name)) : undefined;
  }

  /** Crest source + colour for a raw team name (blank badge if unknown). */
  badgeFor(name: string | null | undefined): TeamBadge {
    const p = this.lookup(name);
    return { src: p?.logoUrl ?? p?.flagUrl ?? null, primaryColor: p?.primaryColor ?? null };
  }

  /** Canonical team id for a raw name (for /teams/[id] links), or undefined. */
  idFor(name: string | null | undefined): string | undefined {
    return this.lookup(name)?.id;
  }
}

/** Win/loss record for a team in the indexed corpus. */
export class TeamRecord {
  constructor(
    readonly played: number,
    readonly won: number,
    readonly lost: number,
    readonly noResult: number,
    readonly firstMatchDate: string | null = null,
    readonly lastMatchDate: string | null = null,
  ) {}

  /** Win percentage to one decimal, or "-" when no matches. */
  get winPctText(): string {
    return this.played > 0 ? ((this.won / this.played) * 100).toFixed(1) : "-";
  }

  /** Date span covered by the indexed match corpus. */
  get coverageText(): string {
    if (this.firstMatchDate && this.lastMatchDate) {
      return this.firstMatchDate === this.lastMatchDate
        ? this.firstMatchDate
        : `${this.firstMatchDate} to ${this.lastMatchDate}`;
    }
    return "indexed Cricsheet/gold corpus";
  }
}