/**
 * Cricsheet has no per-match API — it only publishes bulk zips at
 * https://cricsheet.org/downloads/. A "feed" is one such archive we track.
 *
 * A feed is data-driven from a ScrapeSource(pageType="cricsheet-feed") row:
 *   slug     -> feedKey  (also the IngestState.feedKey)
 *   objectId -> zip file name (resolved against DOWNLOADS_BASE)
 * so a wrong/renamed archive can be fixed in the DB without a code change. The
 * map below is just sensible defaults + labels for the well-known archives.
 *
 * Two shapes of feed:
 *  - per-league/format full archives (e.g. ipl_json.zip): used for the one-time
 *    bootstrap and the occasional weekly correction sweep;
 *  - the global "recently added" archive: small, pulled daily during a season.
 * The pipeline treats them identically — conditional-GET + skip-known make even
 * the full archive cheap on a no-change day.
 */

export const DOWNLOADS_BASE = "https://cricsheet.org/downloads/";

export interface CricsheetFeed {
  /** Stable key; ScrapeSource.slug + IngestState.feedKey. */
  key: string;
  /** Archive file name under DOWNLOADS_BASE. */
  file: string;
  label: string;
  /** "recently added" archives are tiny daily increments; full ones are bulk. */
  incremental: boolean;
}

/**
 * Defaults for known archives. Filenames occasionally change on cricsheet.org;
 * the DB row (ScrapeSource.objectId) is authoritative and overrides these.
 */
export const KNOWN_FEEDS: Record<string, CricsheetFeed> = {
  // The entire Cricsheet corpus in one archive — every format, every league,
  // men's & women's. Used by the lakehouse Parquet export (silver layer).
  all: { key: "all", file: "all_json.zip", label: "All Cricsheet matches", incremental: false },
  recently: {
    key: "recently",
    file: "recently_added_30_json.zip",
    label: "Recently added (last 30 days)",
    incremental: true,
  },
  ipl: { key: "ipl", file: "ipl_json.zip", label: "Indian Premier League", incremental: false },
  // Cricsheet's official T20 Internationals archive is "t20s_json.zip" (NOT
  // "t20is_json.zip", which 404s; "it20s_json.zip" is only non-official/associate).
  t20i: { key: "t20i", file: "t20s_json.zip", label: "T20 Internationals", incremental: false },
  odi: { key: "odi", file: "odis_json.zip", label: "ODI Internationals", incremental: false },
  test: { key: "test", file: "tests_json.zip", label: "Test matches", incremental: false },
};

/** The default seed set when none is given to `cricsheet-seed-feeds`. */
export const DEFAULT_SEED_FEEDS = ["all", "recently"] as const;

/** Build the download URL for a feed file name. */
export function feedUrl(file: string): string {
  return file.startsWith("http") ? file : DOWNLOADS_BASE + file;
}

/** Resolve a feed key to its defaults (falls back to "<key>_json.zip"). */
export function resolveFeed(key: string): CricsheetFeed {
  return (
    KNOWN_FEEDS[key] ?? {
      key,
      file: `${key}_json.zip`,
      label: key,
      incremental: false,
    }
  );
}
