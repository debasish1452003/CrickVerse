import type { MatchWithRelations } from "./queries";

const IMG_CDN = "https://img1.hscicdn.com/image/upload";

/** Turn an ESPNCricinfo image path into a full CDN URL. */
export function teamLogo(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http")) return imageUrl;
  return `${IMG_CDN}${imageUrl}`;
}

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

export function serializeMatch(m: MatchWithRelations): MatchDTO {
  const teams: TeamDTO[] = [];
  if (m.homeTeam) {
    teams.push({
      name: m.homeTeam.name,
      shortName: m.homeTeam.shortName,
      score: m.homeScore,
      primaryColor: m.homeTeam.primaryColor,
      logoUrl: teamLogo(m.homeTeam.imageUrl),
    });
  }
  if (m.awayTeam) {
    teams.push({
      name: m.awayTeam.name,
      shortName: m.awayTeam.shortName,
      score: m.awayScore,
      primaryColor: m.awayTeam.primaryColor,
      logoUrl: teamLogo(m.awayTeam.imageUrl),
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
