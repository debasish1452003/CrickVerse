const BASE = "https://www.espncricinfo.com";

/**
 * ESPNCricinfo URL patterns. Ported verbatim from the original
 * backend/src/utils/url.builder.ts. Every page type's `buildUrl` delegates here,
 * so URL shape changes live in exactly one place.
 */
export const CricinfoUrls = {
  seriesFixtures: (slug: string, objectId: string | number): string =>
    `${BASE}/series/${slug}-${objectId}/match-schedule-fixtures-and-results`,

  scorecard: (
    seriesSlug: string,
    seriesId: string | number,
    matchSlug: string,
    matchId: string | number,
  ): string => `${BASE}/series/${seriesSlug}-${seriesId}/${matchSlug}-${matchId}/full-scorecard`,

  playerProfile: (slug: string, objectId: string | number): string =>
    `${BASE}/cricketers/${slug}-${objectId}`,
};
