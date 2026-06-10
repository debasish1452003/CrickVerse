import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { getMatchById } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getMatchById(id);
  if (!match) notFound();

  return (
    <>
      <Navbar />
      <main className="container">
        <p className="breadcrumb">{match.series?.name ?? "Match"}</p>
        <h1 className="page-title">{match.title ?? "Match"}</h1>
        <p className="match-status">{match.statusText ?? match.state}</p>

        <div className="teams-summary">
          <div className="teams-summary__row">
            <span>{match.homeTeam?.name ?? "TBD"}</span>
            <span>{match.homeScore ?? "—"}</span>
          </div>
          <div className="teams-summary__row">
            <span>{match.awayTeam?.name ?? "TBD"}</span>
            <span>{match.awayScore ?? "—"}</span>
          </div>
        </div>

        {match.innings.length === 0 ? (
          <p className="muted">
            Scorecard not ingested yet (arrives with the scorecard descriptor in Phase 6).
          </p>
        ) : (
          <section className="scorecard">
            {match.innings.map((inn) => (
              <div key={inn.id} className="innings">
                <h3>
                  {inn.battingTeam?.name ?? `Innings ${inn.inningsNo}`} — {inn.runs}/{inn.wickets}
                  {inn.oversText ? ` (${inn.oversText} ov)` : ""}
                </h3>
                <ul className="batting-list">
                  {inn.battingPerfs.map((b) => (
                    <li key={b.id}>
                      <span>{b.player.fullName}</span>
                      <span>
                        {b.runs} ({b.balls})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        <p className="venue-line">{match.venue?.name ?? ""}</p>
      </main>
    </>
  );
}
