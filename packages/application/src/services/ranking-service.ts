import { EloLeague, type EloRankingRow } from "@crickverse/domain";
import type { PlayerLeaderRow } from "../dto/stats-dto";
import type { PlayerRepository } from "../ports/player-repository";
import type {
  CareerStatLeaderRow,
  RankingRepository,
} from "../ports/ranking-repository";

const fmt1 = (n: number) => n.toFixed(1);
const fmt2 = (n: number) => n.toFixed(2);

/** Rankings application service: Elo team ratings plus per-format leaderboards. */
export class RankingService {
  constructor(
    private readonly rankings: RankingRepository,
    private readonly players: PlayerRepository,
  ) {}

  /**
   * Per-format Elo team rankings. Matches are replayed in date order through one
   * EloLeague per class.
   */
  async teamEloRankings(classes: string[], minMatches = 15): Promise<Record<string, EloRankingRow[]>> {
    const matches = await this.rankings.eloMatches(classes);
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
      leagues.get(m.matchClass)?.ingest({ teamHome: m.teamHome, teamAway: m.teamAway, winner: m.winner });
    }

    const out: Record<string, EloRankingRow[]> = {};
    for (const c of classes) out[c] = leagues.get(c)!.rankings(minMatches);
    return out;
  }

  /** Career leaderboards from the ingested gold corpus. */
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

    return {
      batters: batStats.map((s) => this.batterRow(s, photos)),
      bowlers: bowlStats.map((s) => this.bowlerRow(s, photos)),
    };
  }

  private batterRow(
    s: CareerStatLeaderRow,
    photos: Map<string, string | null>,
  ): PlayerLeaderRow {
    const matches = s.matches ?? 0;
    const runs = s.runs ?? 0;
    return {
      cricsheetId: s.cricsheetId,
      name: s.player.name,
      matches,
      value: runs.toLocaleString(),
      detail: `${matches || "-"} M - avg ${s.battingAvg != null ? fmt1(s.battingAvg) : "-"}`,
      photoUrl: photos.get(s.cricsheetId) ?? null,
    };
  }

  private bowlerRow(
    s: CareerStatLeaderRow,
    photos: Map<string, string | null>,
  ): PlayerLeaderRow {
    const matches = s.matches ?? 0;
    const wickets = s.wickets ?? 0;
    const secondary =
      s.bowlingAvg != null
        ? `avg ${fmt2(s.bowlingAvg)}`
        : s.economy != null
          ? `econ ${fmt2(s.economy)}`
          : "avg -";
    return {
      cricsheetId: s.cricsheetId,
      name: s.player.name,
      matches,
      value: String(wickets),
      detail: `${matches || "-"} M - ${secondary}`,
      photoUrl: photos.get(s.cricsheetId) ?? null,
    };
  }
}
