import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchRow } from "@/components/MatchRow";
import { Navbar } from "@/components/Navbar";
import { getCompetition, NO_SEASON, OTHER_COMPETITION, searchMatches } from "@/lib/queries";

export const dynamic = "force-dynamic";

function decodeEvent(segment: string): string | null {
  return segment === OTHER_COMPETITION ? null : decodeURIComponent(segment);
}

function pageHref(event: string, season: string, page: number): string {
  const base = `/series/${event}/${season}`;
  return page > 1 ? `${base}?page=${page}` : base;
}

export default async function SeriesEditionPage({
  params,
  searchParams,
}: {
  params: Promise<{ event: string; season: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { event, season } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);

  const eventName = decodeEvent(event);
  const seasonValue = season === NO_SEASON ? null : decodeURIComponent(season);

  const comp = await getCompetition(eventName);
  if (!comp || !comp.seasons.some((s) => s.season === seasonValue)) notFound();

  const { items, total, pageCount } = await searchMatches({
    eventName: eventName ?? "",
    season: seasonValue ?? "",
    page,
  });

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="pt-10">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Link href="/series" className="transition-colors hover:text-fg">
              Series
            </Link>
            <span>/</span>
            <Link href={`/series/${event}`} className="truncate transition-colors hover:text-fg">
              {comp.name}
            </Link>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {comp.name}
            {seasonValue ? <span className="text-muted"> · {seasonValue}</span> : null}
          </h1>
          <p className="mt-2 text-xs uppercase tracking-wider text-muted">
            {total.toLocaleString()} match{total === 1 ? "" : "es"}
          </p>
        </section>

        {items.length === 0 ? (
          <div className="card mt-6 grid place-items-center gap-1 p-16 text-center">
            <p className="text-lg font-medium">No matches in this edition</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((m) => (
              <MatchRow key={m.matchId} m={m} />
            ))}
          </div>
        )}

        {pageCount > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-4 text-sm">
            {page > 1 ? (
              <Link
                href={pageHref(event, season, page - 1)}
                className="rounded-lg border border-line px-4 py-2 transition-colors hover:border-accent/50"
              >
                ← Prev
              </Link>
            ) : (
              <span className="rounded-lg border border-line/40 px-4 py-2 text-muted/50">← Prev</span>
            )}
            <span className="text-muted">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link
                href={pageHref(event, season, page + 1)}
                className="rounded-lg border border-line px-4 py-2 transition-colors hover:border-accent/50"
              >
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
