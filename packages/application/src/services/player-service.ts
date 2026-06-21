import { resolvePage, type Paginated } from "../pagination";
import { CareerPlayer } from "@crickverse/domain";
import { Player } from "@crickverse/domain";
import type { CareerPlayerListItem } from "../dto/player-dto";
import type { PlayerProfileRow, PlayerRepository } from "../ports/player-repository";
import type { CareerPlayerListRow } from "../ports/player-repository";

export const PLAYERS_PAGE_SIZE = 36;

/**
 * Player application service — the single entry point pages use for player data.
 * Returns rich domain objects ({@link CareerPlayer} / {@link Player}) for detail
 * views and plain list DTOs (photos merged in) for browse/leaderboards.
 */
export class PlayerService {
  constructor(private readonly players: PlayerRepository) {}

  /** Full-corpus career, keyed by Cricsheet id (the primary player view). */
  async careerPlayer(cricsheetId: string): Promise<CareerPlayer | null> {
    const row = await this.players.careerPlayer(cricsheetId);
    return row ? new CareerPlayer(row) : null;
  }

  /** Canonical player (cuid) — the scorecard-linked fallback. */
  async canonicalPlayer(id: string): Promise<Player | null> {
    const row = await this.players.canonicalPlayer(id);
    return row ? new Player(row) : null;
  }

  /** Enrichment profile (photo + bio) for a player, or null. */
  profile(cricsheetId: string): Promise<PlayerProfileRow | null> {
    return this.players.profile(cricsheetId);
  }

  /** Top career run-scorers or wicket-takers, with photos — home leaderboards. */
  async topPlayers(by: "runs" | "wickets", limit = 10): Promise<CareerPlayerListItem[]> {
    const rows = await this.players.topByMetric(by, limit);
    return this.withProfiles(rows);
  }

  /** Paginated career-player browse over the full corpus, with photos. */
  async searchCareerPlayers(opts: {
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<CareerPlayerListItem>> {
    const pageSize = opts.pageSize ?? PLAYERS_PAGE_SIZE;
    const total = await this.players.countCareer(opts.q);
    const { page, pageCount } = resolvePage(opts.page, total, pageSize);
    const rows = await this.players.pageCareer({
      q: opts.q,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items: await this.withProfiles(rows), total, page, pageSize, pageCount };
  }

  /** Merge enrichment photo + role into career list rows (one batch lookup). */
  private async withProfiles(rows: CareerPlayerListRow[]): Promise<CareerPlayerListItem[]> {
    const profiles = await this.players.profilesByIds(rows.map((r) => r.cricsheetId));
    return rows.map((r) => ({
      ...r,
      photoUrl: profiles.get(r.cricsheetId)?.photoUrl ?? null,
      role: profiles.get(r.cricsheetId)?.role ?? null,
    }));
  }
}
