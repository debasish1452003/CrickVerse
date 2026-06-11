import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { getMatchById } from "@/lib/queries";

export const dynamic = "force-dynamic";

const fmt2 = (n: number | null) => (n == null ? "—" : n.toFixed(2));

function TeamLine({
  name,
  color,
  score,
}: {
  name: string;
  color?: string | null;
  score?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.02] p-4">
      <div
        className="size-10 shrink-0 rounded-lg ring-1 ring-white/10"
        style={{ background: color ?? "#334155" }}
      />
      <span className="flex-1 truncate font-medium">{name}</span>
      <span className="font-mono text-lg tabular-nums">{score ?? "—"}</span>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-wider text-muted">
          {head.map((h, i) => (
            <th
              key={`${h}-${i}`}
              className={`py-2.5 font-medium ${i === 0 ? "px-5 text-left" : "px-3 text-right"}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getMatchById(id);
  if (!match) notFound();

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-5 pb-24">
        <section className="card mt-10 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="truncate">{match.series?.name ?? "Match"}</span>
            {match.format && <span className="pill">{match.format}</span>}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <TeamLine name={match.homeTeam?.name ?? "TBD"} color={match.homeTeam?.primaryColor} score={match.homeScore} />
            <TeamLine name={match.awayTeam?.name ?? "TBD"} color={match.awayTeam?.primaryColor} score={match.awayScore} />
          </div>
          <p className="mt-5 text-sm font-medium text-accent">{match.statusText ?? match.state}</p>
          {match.venue?.name && (
            <p className="mt-1 text-xs text-muted">
              {match.venue.name}
              {match.venue.city ? `, ${match.venue.city}` : ""}
            </p>
          )}
        </section>

        {match.innings.length === 0 ? (
          <p className="mt-8 text-sm text-muted">Scorecard not ingested yet for this match.</p>
        ) : (
          match.innings.map((inn) => (
            <section key={inn.id} className="card mt-6 overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h3 className="font-semibold">{inn.battingTeam?.name ?? `Innings ${inn.inningsNo}`}</h3>
                <span className="font-mono text-lg tabular-nums">
                  {inn.runs}/{inn.wickets}{" "}
                  <span className="text-sm text-muted">({inn.oversText ?? "—"} ov)</span>
                </span>
              </div>

              <Table head={["Batter", "R", "B", "4s", "6s", "SR"]}>
                {inn.battingPerfs.map((b) => (
                  <tr key={b.id} className="border-t border-line/60">
                    <td className="px-5 py-2.5">
                      <span className="font-medium">{b.player.fullName}</span>
                      <span className="ml-2 text-xs text-muted">
                        {b.dismissalText ?? (b.dismissal === "NOT_OUT" ? "not out" : "")}
                      </span>
                    </td>
                    <td className="px-3 text-right font-mono tabular-nums">{b.runs}</td>
                    <td className="px-3 text-right font-mono tabular-nums text-muted">{b.balls}</td>
                    <td className="px-3 text-right font-mono tabular-nums text-muted">{b.fours}</td>
                    <td className="px-3 text-right font-mono tabular-nums text-muted">{b.sixes}</td>
                    <td className="px-5 text-right font-mono tabular-nums text-muted">{fmt2(b.strikeRate)}</td>
                  </tr>
                ))}
              </Table>

              {inn.bowlingPerfs.length > 0 && (
                <div className="border-t border-line">
                  <Table head={["Bowler", "O", "M", "R", "W", "Econ"]}>
                    {inn.bowlingPerfs.map((bw) => (
                      <tr key={bw.id} className="border-t border-line/60">
                        <td className="px-5 py-2.5 font-medium">{bw.player.fullName}</td>
                        <td className="px-3 text-right font-mono tabular-nums text-muted">{bw.oversText ?? "—"}</td>
                        <td className="px-3 text-right font-mono tabular-nums text-muted">{bw.maidens}</td>
                        <td className="px-3 text-right font-mono tabular-nums text-muted">{bw.runs}</td>
                        <td className="px-3 text-right font-mono tabular-nums text-accent">{bw.wickets}</td>
                        <td className="px-5 text-right font-mono tabular-nums text-muted">{fmt2(bw.economy)}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
            </section>
          ))
        )}
      </main>
    </>
  );
}
