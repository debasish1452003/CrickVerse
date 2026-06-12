import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { searchCareerPlayers, type CareerPlayerListItem } from "@/lib/queries";

export const dynamic = "force-dynamic";

function PlayerCard({ p }: { p: CareerPlayerListItem }) {
  const subtitle = p.gender === "female" ? "Women's" : p.gender === "male" ? "Men's" : "Player";
  return (
    <Link href={`/players/${p.cricsheetId}`} className="card flex flex-col gap-3 p-5">
      <div>
        <div className="truncate text-base font-semibold tracking-tight">{p.name}</div>
        <div className="mt-0.5 truncate text-xs text-muted">{subtitle}</div>
      </div>
      <div className="mt-auto flex gap-4 text-sm">
        <span className="text-muted">
          Runs <span className="font-mono tabular-nums text-fg">{p.careerRuns.toLocaleString()}</span>
        </span>
        <span className="text-muted">
          Wkts <span className="font-mono tabular-nums text-fg">{p.careerWickets}</span>
        </span>
        <span className="text-muted">
          Mat <span className="font-mono tabular-nums text-fg">{p.careerMatches}</span>
        </span>
      </div>
    </Link>
  );
}

function pageHref(q: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/players?${qs}` : "/players";
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const { items, total, pageCount } = await searchCareerPlayers({ q, page });

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="pt-10">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Players</h1>
          <p className="mt-2 text-muted">
            Search and browse every player in the database, with full career stats by format.
          </p>

          <form action="/players" method="get" className="mt-6 flex max-w-xl gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search by name…"
              autoComplete="off"
              className="flex-1 rounded-xl border border-line bg-white/[0.03] px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/60"
            />
            <button
              type="submit"
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90"
            >
              Search
            </button>
          </form>

          <p className="mt-4 text-xs uppercase tracking-wider text-muted">
            {total.toLocaleString()} player{total === 1 ? "" : "s"}
            {q ? ` matching “${q}”` : ""}
          </p>
        </section>

        {items.length === 0 ? (
          <div className="card mt-6 grid place-items-center gap-1 p-16 text-center">
            <p className="text-lg font-medium">No players found</p>
            <p className="text-sm text-muted">
              {q ? "Try a different name." : "Ingest Cricsheet data to populate players."}
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <PlayerCard key={p.cricsheetId} p={p} />
            ))}
          </div>
        )}

        {pageCount > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-4 text-sm">
            {page > 1 ? (
              <Link href={pageHref(q, page - 1)} className="rounded-lg border border-line px-4 py-2 transition-colors hover:border-accent/50">
                ← Prev
              </Link>
            ) : (
              <span className="rounded-lg border border-line/40 px-4 py-2 text-muted/50">← Prev</span>
            )}
            <span className="text-muted">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={pageHref(q, page + 1)} className="rounded-lg border border-line px-4 py-2 transition-colors hover:border-accent/50">
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
