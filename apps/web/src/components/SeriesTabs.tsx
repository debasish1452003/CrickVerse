import Link from "next/link";

export type SeriesTabKey = "overview" | "matches" | "table" | "stats" | "squads" | "venues";

export interface SeriesTab {
  key: SeriesTabKey;
  label: string;
}

/**
 * Cricbuzz-style underline tabs for a tournament edition. Tabs are plain links
 * (`?tab=`) so the whole thing stays a server component and every view is
 * shareable / back-button friendly.
 */
export function SeriesTabs({
  tabs,
  active,
  basePath,
}: {
  tabs: SeriesTab[];
  active: SeriesTabKey;
  basePath: string;
}) {
  return (
    <div className="mt-6 border-b border-line">
      <nav className="-mb-px flex gap-6 overflow-x-auto">
        {tabs.map((t) => {
          const href = t.key === "overview" ? basePath : `${basePath}?tab=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              className={`tab ${t.key === active ? "tab-active" : ""}`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
