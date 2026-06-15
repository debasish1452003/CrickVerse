// Cross-cutting naming + asset helpers shared by the domain, services and DTOs.

const IMG_CDN = "https://img1.hscicdn.com/image/upload";

/**
 * Normalize a team / competition name the same way the enrichment worker does,
 * so it matches the `TeamProfile` / `CompetitionProfile` primary key.
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Turn an ESPNCricinfo image path into a full CDN URL (passthrough if absolute). */
export function cdnImage(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http")) return imageUrl;
  return `${IMG_CDN}${imageUrl}`;
}

/** Sentinels for the competition URL space (kept stable for existing links). */
export const Competitions = {
  /** URL segment standing in for matches with no eventName (bilateral / unlabelled). */
  OTHER: "__other__",
  /** Display name for the no-event bucket. */
  OTHER_LABEL: "Other / Bilateral matches",
  /** URL segment standing in for a season-less edition. */
  NO_SEASON: "__noseason__",
} as const;
