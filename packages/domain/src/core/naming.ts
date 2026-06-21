// Cross-cutting naming + asset helpers shared by the domain, services and DTOs.

const IMG_CDN = "https://img1.hscicdn.com/image/upload";

/**
 * Normalize a team / competition name the same way the enrichment worker does,
 * so it matches the `TeamProfile` / `CompetitionProfile` primary key.
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Renamed franchises that are the SAME team across an identity change, mapping a
 * retired-name key → the current (canonical) name key. Only high-confidence,
 * continuous rebrands of one franchise are listed — re-auctioned/relocated sides
 * (Deccan Chargers, defunct BPL teams, format-specific county aliases) are left
 * separate. Keys/values are {@link normalizeName} output. Extend as needed.
 */
export const TEAM_ALIASES: Record<string, string> = {
  // IPL
  "kings xi punjab": "punjab kings",
  "delhi daredevils": "delhi capitals",
  "royal challengers bangalore": "royal challengers bengaluru",
  "rising pune supergiants": "rising pune supergiant",
  // Caribbean Premier League
  "barbados tridents": "barbados royals",
  "st lucia zouks": "st lucia kings",
  "st lucia stars": "st lucia kings",
  // ILT20
  "sharjah warriors": "sharjah warriorz",
  // English women's regional
  lightning: "the blaze",
};

/**
 * Canonical team id for a raw name: its {@link normalizeName} key, redirected
 * through {@link TEAM_ALIASES} so every name variant of one franchise collapses
 * to a single id. This is the `TeamProfile.id` / `CareerMatch.team*Id` key.
 */
export function canonicalTeamId(name: string): string {
  const key = normalizeName(name);
  return TEAM_ALIASES[key] ?? key;
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
