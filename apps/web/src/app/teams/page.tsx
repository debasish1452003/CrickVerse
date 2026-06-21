import Link from "next/link";
import { TeamBadge } from "@/components/Crest";
import { DataScopeNote } from "@/components/DataScopeNote";
import { Navbar } from "@/components/Navbar";
import { TeamProfile } from "@crickverse/domain";
import { services } from "@/services";

export const dynamic = "force-dynamic";

function TeamCard({ t }: { t: TeamProfile }) {
  return (
    <Link href={`/teams/${encodeURIComponent(t.id)}`} className="card flex items-center gap-3 p-4">
      <TeamBadge name={t.displayName} src={t.logoUrl ?? t.flagUrl} primaryColor={t.primaryColor} size={44} />
      <div className="min-w-0">
        <div className="truncate font-semibold tracking-tight">{t.displayName}</div>
        <div className="mt-0.5 text-xs text-muted">
          {t.matchCount.toLocaleString()} match{t.matchCount === 1 ? "" : "es"}
        </div>
      </div>
    </Link>
  );
}

function Grid({ title, teams }: { title: string; teams: TeamProfile[] }) {
  if (teams.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{title}</h2>
        <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-xs text-muted">{teams.length}</span>
        <div className="h-px flex-1 bg-line" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => (
          <TeamCard key={t.id} t={t} />
        ))}
      </div>
    </section>
  );
}

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const all = await services.teams.listProfiles({ q: q || undefined });
  const national = all.filter((t) => t.isNational);
  const leagues = all.filter((t) => !t.isNational);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="pt-10">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Teams</h1>
          <p className="mt-2 text-muted">
            International sides and franchises present in the indexed CrickVerse corpus.
          </p>
          <DataScopeNote className="mt-4 max-w-2xl">
            Team match counts are indexed Cricsheet/gold matches available locally, not official all-time totals.
          </DataScopeNote>
          <form action="/teams" method="get" className="mt-6 flex max-w-xl gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search teams…"
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
        </section>

        {all.length === 0 ? (
          <div className="card mt-8 grid place-items-center gap-1 p-16 text-center">
            <p className="text-lg font-medium">No teams found</p>
            <p className="text-sm text-muted">{q ? "Try a different name." : "Run enrich-teams to populate."}</p>
          </div>
        ) : (
          <>
            <Grid title="International" teams={national} />
            <Grid title="Leagues & Domestic" teams={leagues} />
          </>
        )}
      </main>
    </>
  );
}
