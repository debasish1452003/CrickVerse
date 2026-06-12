export const CricinfoUrls = {
  // Pass in any year, series slug, and ID to dynamically scrape different series
  seriesFixtures: (slug: string, objectId: string | number) =>
    `https://www.espncricinfo.com/series/${slug}-${objectId}/match-schedule-fixtures-and-results`,

  scorecard: (
    seriesSlug: string,
    seriesId: string,
    matchSlug: string,
    matchId: string,
  ) =>
    `https://www.espncricinfo.com/series/${seriesSlug}-${seriesId}/${matchSlug}-${matchId}/full-scorecard`,

  // 🔥 Future Proofing: Ready for player stats
  playerProfile: (slug: string, objectId: string | number) =>
    `https://www.espncricinfo.com/cricketers/${slug}-${objectId}`,
};
