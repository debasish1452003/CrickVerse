import Link from "next/link";
import { TeamBadge } from "@/components/Crest";
import { Navbar } from "@/components/Navbar";
import { MATCH_CLASS_LABEL } from "@/lib/player-stats";
import { getTeamRankings, getTeamProfiles, normalizeTeamName, type RankingRow, type TeamProfileRow } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Show the headline classes as separate leaderboards, in this order.
const CLASS_ORDER = ["TEST", "ODI", "T20I", "T20", "LIST_A", "FIRST_CLASS"] as const;
const TOP_N = 12;

function Board({
  cls,
  rows,
  teams,
}: {
  cls: string;
  rows: RankingRow[];
  teams: Map<string, TeamProfileRow>;
}) {
  if (!rows || rows.length === 0) return null;
  const top = rows.slice(0, TOP_N);
  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-line px-5 py-4 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
        {MATCH_CLASS_LABEL[cls as keyof typeof MATCH_CLASS_LABEL] ?? cls}
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-muted">
            <th className="px-5 py-2.5 text-left font-medium">#</th>
            <th className="py-2.5 text-left font-medium">Team</th>
            <th className="px-3 py-2.5 text-right font-medium">P</th>
            <th className="px-3 py-2.5 text-right font-medium">W</th>
            <th className="px-5 py-2.5 text-right font-medium">Win %</th>
          </tr>
        </thead>
        <tbody>
          {top.map((r, i) => {
            const p = teams.get(normalizeTeamName(r.team));
            return (
              <tr key={r.team} className="border-t border-line/60">
                <td className="px-5 py-2.5 font-mono tabular-nums text-muted">{i + 1}</td>
                <td className="py-2.5">
                  <Link
                    href={`/teams/${encodeURIComponent(normalizeTeamName(r.team))}`}
                    className="flex items-center gap-2.5 font-medium transition-colors hover:text-accent"
                  >
                    <TeamBadge name={r.team} src={p?.logoUrl ?? p?.flagUrl} primaryColor={p?.primaryColor} size={24} />
                    <span className="truncate">{r.team}</span>
                  </Link>
                </td>
                <td className="px-3 text-right font-mono tabular-nums text-muted">{r.played}</td>
                <td className="px-3 text-right font-mono tabular-nums text-muted">{r.won}</td>
                <td className="px-5 text-right font-mono tabular-nums text-accent">{r.winPct.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default async function RankingsPage() {
  const byClass = await getTeamRankings();
  // Profiles for every team that appears in the boards we'll render.
  const names = CLASS_ORDER.flatMap((c) => (byClass[c] ?? []).slice(0, TOP_N).map((r) => r.team));
  const teams = await getTeamProfiles(names);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="pt-10">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Rankings</h1>
          <p className="mt-2 text-muted">
            Team leaderboards by win percentage, computed from every result in the corpus (minimum 25 matches per class).
          </p>
        </section>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {CLASS_ORDER.map((c) => (
            <Board key={c} cls={c} rows={byClass[c] ?? []} teams={teams} />
          ))}
        </div>
      </main>
    </>
  );
}
