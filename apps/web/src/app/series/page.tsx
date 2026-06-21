import Link from "next/link";
import { CompetitionBadge } from "@/components/CompetitionBadge";
import { DataScopeNote } from "@/components/DataScopeNote";
import { Navbar } from "@/components/Navbar";
import { Competition } from "@crickverse/domain";
import { services } from "@/services";

export const dynamic = "force-dynamic";

function CompetitionCard({ c, logo }: { c: Competition; logo: string | null }) {
  const span =
    c.seasons.length > 1
      ? `${c.seasons.length} seasons`
      : c.latestSeason
        ? `Season ${c.latestSeason}`
        : "1 edition";
  return (
    <Link
      href={`/series/${c.segment}`}
      className="card flex items-center gap-4 p-5 transition-colors hover:border-accent/40"
    >
      <CompetitionBadge name={c.name} src={logo} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-semibold tracking-tight">{c.name}</div>
        <div className="mt-0.5 text-xs text-muted">
          {span} · {c.totalMatches.toLocaleString()} match{c.totalMatches === 1 ? "" : "es"}
        </div>
      </div>
      {c.latestSeason && (
        <span className="shrink-0 rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
          {c.latestSeason}
        </span>
      )}
    </Link>
  );
}

export default async function SeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const all = await services.competitions.list();
  const ql = q.toLowerCase();
  const comps = ql ? all.filter((c) => c.name.toLowerCase().includes(ql)) : all;
  const logos = await services.competitions.logosByNames(comps.map((c) => c.eventName));

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="pt-10">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Series &amp; Tournaments</h1>
          <p className="mt-2 text-muted">
            Competitions present in the indexed match corpus. Pick one to browse its available seasons and matches.
          </p>
          <DataScopeNote className="mt-4 max-w-2xl">
            Season and match counts are based on ingested Cricsheet/gold data currently available in this database.
          </DataScopeNote>

          <form action="/series" method="get" className="mt-6 flex max-w-xl gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search competitions…"
              autoComplete="off"
              className="flex-1 rounded-xl border border-line bg-black/[0.03] px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/60"
            />
            <button
              type="submit"
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Search
            </button>
          </form>

          <p className="mt-4 text-xs uppercase tracking-wider text-muted">
            {comps.length.toLocaleString()} competition{comps.length === 1 ? "" : "s"}
            {q ? ` matching “${q}”` : ""}
          </p>
        </section>

        {comps.length === 0 ? (
          <div className="card mt-6 grid place-items-center gap-1 p-16 text-center">
            <p className="text-lg font-medium">No competitions found</p>
            <p className="text-sm text-muted">Try a different search.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {comps.map((c) => (
              <CompetitionCard
                key={c.segment}
                c={c}
                logo={c.logoKey ? logos.get(c.logoKey) ?? null : null}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
