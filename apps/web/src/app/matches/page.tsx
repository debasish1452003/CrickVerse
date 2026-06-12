import Link from "next/link";
import { MatchRow } from "@/components/MatchRow";
import { Navbar } from "@/components/Navbar";
import { MATCH_CLASS_LABEL } from "@/lib/player-stats";
import { getTeamProfiles, searchMatches } from "@/lib/queries";

export const dynamic = "force-dynamic";

const CLASSES = ["TEST", "ODI", "T20I", "T20", "LIST_A", "FIRST_CLASS", "T10", "HUNDRED"] as const;

function href(q: string, cls: string, page: number): string {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (cls) p.set("class", cls);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/matches?${s}` : "/matches";
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; class?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const cls = (sp.class ?? "").trim();
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const { items, total, pageCount } = await searchMatches({ q, matchClass: cls || undefined, page });
  const teams = await getTeamProfiles(items.flatMap((m) => [m.teamHome, m.teamAway]));

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="pt-10">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Matches</h1>
          <p className="mt-2 text-muted">Browse and search every match in the database — full scorecards inside.</p>

          <form action="/matches" method="get" className="mt-6 flex max-w-xl gap-2">
            {cls && <input type="hidden" name="class" value={cls} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search team, series, or venue…"
              autoComplete="off"
              className="flex-1 rounded-xl border border-line bg-black/[0.03] px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/60"
            />
            <button type="submit" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90">
              Search
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={href(q, "", 1)}
              className={`rounded-full px-3 py-1 text-xs ${cls === "" ? "bg-accent text-white" : "border border-line text-muted hover:text-fg"}`}
            >
              All
            </Link>
            {CLASSES.map((c) => (
              <Link
                key={c}
                href={href(q, c, 1)}
                className={`rounded-full px-3 py-1 text-xs ${cls === c ? "bg-accent text-white" : "border border-line text-muted hover:text-fg"}`}
              >
                {MATCH_CLASS_LABEL[c]}
              </Link>
            ))}
          </div>

          <p className="mt-4 text-xs uppercase tracking-wider text-muted">
            {total.toLocaleString()} match{total === 1 ? "" : "es"}
            {cls ? ` · ${MATCH_CLASS_LABEL[cls as keyof typeof MATCH_CLASS_LABEL] ?? cls}` : ""}
            {q ? ` · “${q}”` : ""}
          </p>
        </section>

        {items.length === 0 ? (
          <div className="card mt-6 grid place-items-center gap-1 p-16 text-center">
            <p className="text-lg font-medium">No matches found</p>
            <p className="text-sm text-muted">Try a different search or filter.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((m) => (
              <MatchRow key={m.matchId} m={m} teams={teams} />
            ))}
          </div>
        )}

        {pageCount > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-4 text-sm">
            {page > 1 ? (
              <Link href={href(q, cls, page - 1)} className="rounded-lg border border-line px-4 py-2 transition-colors hover:border-accent/50">
                ← Prev
              </Link>
            ) : (
              <span className="rounded-lg border border-line/40 px-4 py-2 text-muted/50">← Prev</span>
            )}
            <span className="text-muted">Page {page} of {pageCount}</span>
            {page < pageCount ? (
              <Link href={href(q, cls, page + 1)} className="rounded-lg border border-line px-4 py-2 transition-colors hover:border-accent/50">
                Next →
              </Link>
            ) : (
              <span className="rounded-lg border border-line/40 px-4 py-2 text-muted/50">Next →</span>
            )}
          </nav>
        )}
      </main>
    </>
  );
}
