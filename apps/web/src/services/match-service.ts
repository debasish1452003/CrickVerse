import { resolvePage, type Paginated } from "@/core/pagination";
import { CanonicalMatch } from "@/domain/match/canonical-match";
import { GoldMatch } from "@/domain/match/gold-match";
import { MatchMapper, type GoldMatchListItem, type InningsOversData, type MatchDTO } from "@/dto/match-dto";
import type { MatchFilter, MatchRepository } from "@/repositories/match-repository";

export const MATCHES_PAGE_SIZE = 30;

/** Match application service — gold corpus + canonical detail + JSON DTOs. */
export class MatchService {
  constructor(private readonly matches: MatchRepository) {}

  /** Every canonical match as a wire DTO (the JSON match list). */
  async listDTOs(): Promise<MatchDTO[]> {
    const rows = await this.matches.listCanonical();
    return rows.map((m) => MatchMapper.toDTO(m));
  }

  /** One canonical match as a wire DTO, or null. */
  async dto(id: string): Promise<MatchDTO | null> {
    const row = await this.matches.canonicalForList(id);
    return row ? MatchMapper.toDTO(row) : null;
  }

  /** Full-corpus scorecard (Cricsheet id), as a rich domain object. */
  async goldMatch(matchId: string): Promise<GoldMatch | null> {
    const row = await this.matches.goldMatch(matchId);
    return row ? new GoldMatch(row) : null;
  }

  /** Canonical match detail (cuid) — the gold fallback. */
  async canonicalMatch(id: string): Promise<CanonicalMatch | null> {
    const row = await this.matches.canonicalMatch(id);
    return row ? new CanonicalMatch(row) : null;
  }

  /** Per-innings over rollups (worm / Manhattan charts). */
  inningsOvers(matchId: string): Promise<InningsOversData[]> {
    return this.matches.inningsOvers(matchId);
  }

  /** Paginated gold-match browser (free-text + class + edition filters). */
  async search(
    filter: MatchFilter & { page?: number; pageSize?: number },
  ): Promise<Paginated<GoldMatchListItem>> {
    const pageSize = filter.pageSize ?? MATCHES_PAGE_SIZE;
    const total = await this.matches.countMatches(filter);
    const { page, pageCount } = resolvePage(filter.page, total, pageSize);
    const items = await this.matches.pageMatches(filter, (page - 1) * pageSize, pageSize);
    return { items, total, page, pageSize, pageCount };
  }

  /** Paginated matches for a team (exact home/away membership), newest first. */
  async forTeam(
    displayName: string,
    page = 1,
    pageSize = MATCHES_PAGE_SIZE,
  ): Promise<Paginated<GoldMatchListItem>> {
    const total = await this.matches.countTeamMatches(displayName);
    const { page: p, pageCount } = resolvePage(page, total, pageSize);
    const items = await this.matches.pageTeamMatches(displayName, (p - 1) * pageSize, pageSize);
    return { items, total, page: p, pageSize, pageCount };
  }

  /** Aggregate facts for one tournament edition. */
  editionMeta(eventName: string | null, season: string | null) {
    return this.matches.editionMeta(eventName, season);
  }
}
