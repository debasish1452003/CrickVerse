import { Competitions, normalizeName } from "../core/naming";

/** One season/edition of a competition with its match count. */
export interface CompetitionSeason {
  season: string | null;
  matches: number;
}

/**
 * A competition (league, world cup, or the bilateral "Other" bucket) folded from
 * the gold matches. Owns its own season ordering, latest-season pick, and URL
 * segment so the series index / edition pages don't re-derive them.
 */
export class Competition {
  readonly name: string;
  readonly seasons: CompetitionSeason[];
  readonly latestSeason: string | null;

  constructor(
    /** Raw eventName, or null for the bilateral / unlabelled bucket. */
    readonly eventName: string | null,
    seasons: CompetitionSeason[],
    readonly totalMatches: number,
  ) {
    this.name = eventName ?? Competitions.OTHER_LABEL;
    // Newest season first; null seasons sink to the bottom. Seasons are strings
    // like "2024" or "2007/08", so a plain string compare orders them well enough.
    this.seasons = [...seasons].sort((a, b) => {
      if (a.season === b.season) return 0;
      if (a.season == null) return 1;
      if (b.season == null) return -1;
      return b.season.localeCompare(a.season);
    });
    this.latestSeason = this.seasons.find((s) => s.season != null)?.season ?? null;
  }

  /** Whether this competition has the given season/edition. */
  hasSeason(season: string | null): boolean {
    return this.seasons.some((s) => s.season === season);
  }

  /** Normalized key for the `CompetitionProfile` logo lookup. */
  get logoKey(): string | null {
    return this.eventName ? normalizeName(this.eventName) : null;
  }

  /** URL segment for /series/[event] — encoded eventName or the Other sentinel. */
  get segment(): string {
    return this.eventName == null ? Competitions.OTHER : encodeURIComponent(this.eventName);
  }

  /** URL segment for a season under /series/[event]/[season]. */
  static seasonSegment(season: string | null): string {
    return season == null ? Competitions.NO_SEASON : encodeURIComponent(season);
  }

  /** Decode an [event] route segment back to a raw eventName (null = Other). */
  static decodeEvent(segment: string): string | null {
    return segment === Competitions.OTHER ? null : decodeURIComponent(segment);
  }

  /** Decode a [season] route segment back to a raw season (null = undated). */
  static decodeSeason(segment: string): string | null {
    return segment === Competitions.NO_SEASON ? null : decodeURIComponent(segment);
  }
}
