import { cache } from "react";
import { EloLeague, type EloRankingRow } from "@/domain/ranking/elo-league";
import type { PlayerLeaderRow } from "@/dto/stats-dto";
import type { PlayerRepository } from "@/repositories/player-repository";
import type { CareerStatLeaderRow, RankingRepository } from "@/repositories/ranking-repository";

const fmt1 = (n: number) => n.toFixed(1);
const fmt2 = (n: number) => n.toFixed(2);

/** Rankings application service — Elo team ratings + per-format leaderboards. */
export class RankingService {
  constructor(
    private readonly rankings: RankingRepository,
    private readonly players: PlayerRepository,
  ) {}

  /**
   * Per-format Elo team rankings. Matches are replayed in date order through one
   * {@link EloLeague} per class. Wrapped in React `cache()` since the rankings
   * page asks for several classes at once.
   */
  teamEloRankings = cache(
    async (classes: string[], minMatches = 15): Promise<Record<string, EloRankingRow[]>> => {
      const matches = await this.rankings.eloMatches(classes);
      // Chronological replay (nulls sort first — rare and harmless).
      matches.sort((a, b) => {
        const da = a.matchDate ?? "";
        const db = b.matchDate ?? "";
        if (da !== db) return da < db ? -1 : 1;
        return a.matchId < b.matchId ? -1 : 1;
      });

      const leagues = new Map<string, EloLeague>();
      for (const c of classes) leagues.set(c, new EloLeague());
      for (const m of matches) {
        if (!m.teamHome || !m.teamAway) continue;
        leagues
          .get(m.matchClass)
          ?.ingest({ teamHome: m.teamHome, teamAway: m.teamAway, winner: m.winner });
      }

      const out: Record<string, EloRankingRow[]> = {};
      for (const c of classes) out[c] = leagues.get(c)!.rankings(minMatches);
      return out;
    },
  );

  /** Top run-scorers and wicket-takers in a format (with photos). */
  async playerLeaders(
    matchClass: string,
    limit = 10,
  ): Promise<{ batters: PlayerLeaderRow[]; bowlers: PlayerLeaderRow[] }> {
    const [batStats, bowlStats] = await Promise.all([
      this.rankings.topBatters(matchClass, limit),
      this.rankings.topBowlers(matchClass, limit),
    ]);
    const ids = [...new Set([...batStats, ...bowlStats].map((s) => s.cricsheetId))];
    const photos = await this.players.photosByIds(ids);

    const batters: PlayerLeaderRow[] = batStats.map((s) => this.batterRow(s, photos));
    const bowlers: PlayerLeaderRow[] = bowlStats.map((s) => this.bowlerRow(s, photos));
    return { batters, bowlers };
  }

  private batterRow(s: CareerStatLeaderRow, photos: Map<string, string | null>): PlayerLeaderRow {
    return {
      cricsheetId: s.cricsheetId,
      name: s.player.name,
      matches: s.matches,
      value: s.runs.toLocaleString(),
      detail: `${s.matches} M · avg ${s.battingAvg != null ? fmt1(s.battingAvg) : "—"}`,
      photoUrl: photos.get(s.cricsheetId) ?? null,
    };
  }

  private bowlerRow(s: CareerStatLeaderRow, photos: Map<string, string | null>): PlayerLeaderRow {
    return {
      cricsheetId: s.cricsheetId,
      name: s.player.name,
      matches: s.matches,
      value: String(s.wickets),
      detail: `${s.matches} M · econ ${s.economy != null ? fmt2(s.economy) : "—"}`,
      photoUrl: photos.get(s.cricsheetId) ?? null,
    };
  }
}
