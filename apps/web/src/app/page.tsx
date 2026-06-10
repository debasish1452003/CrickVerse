import { MatchCard } from "@/components/MatchCard";
import { Navbar } from "@/components/Navbar";
import { listMatches } from "@/lib/queries";
import { serializeMatch } from "@/lib/serialize";

// Live data — never statically prerender (and don't hit the DB at build time).
export const dynamic = "force-dynamic";

export default async function Home() {
  const matches = (await listMatches()).map(serializeMatch);

  return (
    <>
      <Navbar />
      <main className="container">
        <h1 className="page-title">Live Scores &amp; Fixtures</h1>
        {matches.length === 0 ? (
          <div className="empty-state">
            <p>No matches yet.</p>
            <p className="empty-state__hint">
              Run a crawl: <code>pnpm --filter @crickverse/worker run seed ipl-2026 1510719</code>
            </p>
          </div>
        ) : (
          <div className="match-grid">
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
