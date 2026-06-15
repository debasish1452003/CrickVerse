import { cache } from "react";
import { Competition } from "@/domain/competition/competition";
import type { CompetitionRepository } from "@/repositories/competition-repository";

/** Competition application service — folds gold matches into Competition objects. */
export class CompetitionService {
  constructor(private readonly repo: CompetitionRepository) {}

  /**
   * Every competition in the corpus, folded from one groupBy. Wrapped in React
   * `cache()` so the series index and per-event page share a single round-trip
   * within a request.
   */
  list = cache(async (): Promise<Competition[]> => {
    const groups = await this.repo.groups();
    const byEvent = new Map<string | null, { seasons: { season: string | null; matches: number }[]; total: number }>();
    for (const g of groups) {
      let entry = byEvent.get(g.eventName);
      if (!entry) byEvent.set(g.eventName, (entry = { seasons: [], total: 0 }));
      entry.seasons.push({ season: g.season, matches: g.matches });
      entry.total += g.matches;
    }
    const comps = [...byEvent.entries()].map(
      ([eventName, e]) => new Competition(eventName, e.seasons, e.total),
    );
    // Most-played competitions first; the Other bucket is treated like any event.
    comps.sort((a, b) => b.totalMatches - a.totalMatches);
    return comps;
  });

  /** One competition by its raw eventName (null for the Other bucket). */
  async byEventName(eventName: string | null): Promise<Competition | null> {
    const comps = await this.list();
    return comps.find((c) => c.eventName === eventName) ?? null;
  }

  /** Logo URL for one competition (→ generated crest fallback when null). */
  logo(eventName: string | null | undefined): Promise<string | null> {
    return this.repo.logo(eventName);
  }

  /** Batch competition-logo lookup → Map<normalizedName, logoUrl>. */
  logosByNames(names: (string | null | undefined)[]): Promise<Map<string, string>> {
    return this.repo.logosByNames(names);
  }
}
