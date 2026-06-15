import { normalizeName } from "@/core/naming";
import { BaseRepository } from "./base-repository";

/** A distinct (eventName, season) pair with its match count. */
export interface CompetitionGroup {
  eventName: string | null;
  season: string | null;
  matches: number;
}

/** Data access for competitions (folded from gold matches) + their logos. */
export class CompetitionRepository extends BaseRepository {
  /**
   * Distinct (eventName, season) pairs across the corpus — one cheap groupBy the
   * service folds into Competition objects. Both columns are indexed, so this
   * scales even over tens of thousands of matches.
   */
  async groups(): Promise<CompetitionGroup[]> {
    const rows = await this.prisma.careerMatch.groupBy({
      by: ["eventName", "season"],
      _count: { _all: true },
    });
    return rows.map((g) => ({
      eventName: g.eventName ?? null,
      season: g.season ?? null,
      matches: g._count._all,
    }));
  }

  /** Logo URL for one competition by raw eventName, or null. */
  async logo(eventName: string | null | undefined): Promise<string | null> {
    if (!eventName) return null;
    const row = await this.prisma.competitionProfile.findUnique({
      where: { id: normalizeName(eventName) },
      select: { logoUrl: true },
    });
    return row?.logoUrl ?? null;
  }

  /** Batch competition-logo lookup by raw eventNames → Map<normalizedName, logoUrl>. */
  async logosByNames(names: (string | null | undefined)[]): Promise<Map<string, string>> {
    const ids = [...new Set(names.filter((n): n is string => !!n).map(normalizeName))];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.competitionProfile.findMany({
      where: { id: { in: ids }, logoUrl: { not: null } },
      select: { id: true, logoUrl: true },
    });
    return new Map(rows.map((r) => [r.id, r.logoUrl!]));
  }
}
