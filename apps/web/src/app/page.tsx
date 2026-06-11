import { MatchCard } from "@/components/MatchCard";
import { Navbar } from "@/components/Navbar";
import { listMatches } from "@/lib/queries";
import { serializeMatch, type MatchDTO } from "@/lib/serialize";

// Live data — never statically prerender (and don't hit the DB at build time).
export const dynamic = "force-dynamic";

function Section({ title, matches }: { title: string; matches: MatchDTO[] }) {
  if (matches.length === 0) return null;
  const isLive = title === "Live";
  return (
    <section className="mt-12">
      <div className="mb-5 flex items-center gap-3">
        {isLive && <span className="live-dot" />}
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{title}</h2>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-muted">{matches.length}</span>
        <div className="h-px flex-1 bg-line" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>
    </section>
  );
}

export default async function Home() {
  const all = (await listMatches()).map(serializeMatch);
  const live = all.filter((m) => m.state === "LIVE");
  const upcoming = all.filter((m) => m.state === "SCHEDULED");
  const completed = all
    .filter((m) => m.state === "COMPLETED" || m.state === "ABANDONED")
    .reverse();

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="py-14 sm:py-20">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1 text-xs text-muted">
            <span className="live-dot" /> Live cricket, structured &amp; analyzed
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Cricket, <span className="text-accent">beautifully</span> analyzed.
          </h1>
          <p className="mt-4 max-w-xl text-muted">
            Live scores, full scorecards, and deep player analytics — pulled from the source,
            structured into a clean model, and served fast.
          </p>
        </section>

        {all.length === 0 ? (
          <div className="card grid place-items-center gap-2 p-16 text-center">
            <p className="text-lg font-medium">No matches yet</p>
            <p className="text-sm text-muted">Run a crawl to populate the database:</p>
            <code className="mt-2 rounded-lg bg-black/40 px-3 py-1.5 font-mono text-sm text-accent">
              pnpm --filter @crickverse/worker run seed ipl-2026 1510719
            </code>
          </div>
        ) : (
          <>
            <Section title="Live" matches={live} />
            <Section title="Upcoming" matches={upcoming} />
            <Section title="Recent Results" matches={completed} />
          </>
        )}
      </main>
    </>
  );
}
