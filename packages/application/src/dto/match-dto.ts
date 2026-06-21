import { cdnImage } from "@crickverse/domain";

// ── Public match DTOs (the JSON API + MatchCard contract) ────────────────────

export interface TeamDTO {
  name: string | null;
  shortName: string | null;
  score: string | null;
  primaryColor: string | null;
  logoUrl: string | null;
}

export interface MatchDTO {
  id: string;
  title: string | null;
  season: string | null;
  statusText: string | null;
  format: string;
  state: string;
  startTime: string | null;
  series: { name: string | null; slug: string | null } | null;
  venue: { name: string | null; city: string | null } | null;
  teams: TeamDTO[];
}

/** Structural shape the match-list repository hydrates for serialization. */
export interface MatchListRow {
  id: string;
  title: string | null;
  statusText: string | null;
  format: string;
  state: string;
  startTime: Date | null;
  homeScore: string | null;
  awayScore: string | null;
  series: { name: string | null; slug: string | null; season: string | null } | null;
  venue: { name: string | null; city: string | null } | null;
  homeTeam: { name: string | null; shortName: string | null; primaryColor: string | null; imageUrl: string | null } | null;
  awayTeam: { name: string | null; shortName: string | null; primaryColor: string | null; imageUrl: string | null } | null;
}

/** Maps canonical match rows to the wire/UI DTO (CDN URLs resolved here). */
export class MatchMapper {
  static toDTO(m: MatchListRow): MatchDTO {
    const teams: TeamDTO[] = [];
    if (m.homeTeam) {
      teams.push({
        name: m.homeTeam.name,
        shortName: m.homeTeam.shortName,
        score: m.homeScore,
        primaryColor: m.homeTeam.primaryColor,
        logoUrl: cdnImage(m.homeTeam.imageUrl),
      });
    }
    if (m.awayTeam) {
      teams.push({
        name: m.awayTeam.name,
        shortName: m.awayTeam.shortName,
        score: m.awayScore,
        primaryColor: m.awayTeam.primaryColor,
        logoUrl: cdnImage(m.awayTeam.imageUrl),
      });
    }
    return {
      id: m.id,
      title: m.title,
      season: m.series?.season ?? null,
      statusText: m.statusText,
      format: m.format,
      state: m.state,
      startTime: m.startTime ? m.startTime.toISOString() : null,
      series: m.series ? { name: m.series.name, slug: m.series.slug } : null,
      venue: m.venue ? { name: m.venue.name, city: m.venue.city } : null,
      teams,
    };
  }
}

// ── Gold match list card (matches browser, series editions, team page) ───────

export interface GoldMatchListItem {
  matchId: string;
  matchClass: string;
  eventName: string | null;
  matchDate: string | null;
  venue: string | null;
  teamHome: string | null;
  teamAway: string | null;
  winner: string | null;
  inn1Score: string | null;
  inn2Score: string | null;
}

// ── Over-by-over rollup (worm / Manhattan charts) ────────────────────────────

/** One over's rollup, as stored in InningsOvers.overs (compact keys). */
export interface OverPoint {
  o: number; // over number (0-based as in Cricsheet)
  r: number; // runs in the over
  w: number; // wickets in the over
  f: number; // fours
  s: number; // sixes
  c: number; // cumulative runs to end of this over
}

export interface InningsOversData {
  inningsNo: number;
  overs: OverPoint[];
}
