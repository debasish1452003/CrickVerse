import { MatchCard } from "@/components/MatchCard";
import { Navbar } from "@/components/Navbar";
import { listMatches } from "@/lib/queries";
import { serializeMatch, type MatchDTO } from "@/lib/serialize";

// Live data — never statically prerender (and don't hit the DB at build time).
export const dynamic = "force-dynamic";

function Section({ title, matches }: { title: string; matches: MatchDTO[] }) {
  if (matches.length === 0) return null;
  return (
    <section style={{ marginTop: "2rem" }}>
      <h2 className="page-title" style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>
        {title} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({matches.length})</span>
      </h2>
      <div className="match-grid">
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
  // Most recent results first.
  const completed = all
    .filter((m) => m.state === "COMPLETED" || m.state === "ABANDONED")
    .reverse();

  return (
    <>
      <Navbar />
      <main className="container">
        <h1 className="page-title">Live Scores &amp; Fixtures</h1>
        {all.length === 0 ? (
          <div className="empty-state">
            <p>No matches yet.</p>
            <p className="empty-state__hint">
              Run a crawl: <code>pnpm --filter @crickverse/worker run seed ipl-2026 1510719</code>
            </p>
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
