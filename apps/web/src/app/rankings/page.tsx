import Link from "next/link";
import { TeamBadge } from "@/components/Crest";
import { Navbar } from "@/components/Navbar";
import { StatBoard } from "@/components/StatBoard";
import { MATCH_CLASS_LABEL } from "@/lib/player-stats";
import {
  getPlayerLeaders,
  getTeamEloRankings,
  getTeamProfiles,
  normalizeTeamName,
  type EloRankingRow,
  type TeamProfileRow,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

// International formats only — the same three Cricbuzz / ICC ranks teams in.
const FORMATS = ["TEST", "ODI", "T20I"] as const;
const TOP_N = 10;

function TeamRankBoard({ rows, teams }: { rows: EloRankingRow[]; teams: Map<string, TeamProfileRow> }) {
  const top = rows.slice(0, TOP_N);
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-sm font-bold tracking-tight">Team Rankings</h3>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Rating</span>
      </div>
      {top.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">No data.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {top.map((r, i) => {
              const p = teams.get(normalizeTeamName(r.team));
              return (
                <tr key={r.team} className="border-t border-line/60 first:border-0 hover:bg-black/[0.02]">
                  <td className="w-8 px-4 py-2.5 text-center font-mono text-xs tabular-nums text-muted">{i + 1}</td>
                  <td className="py-2.5">
                    <Link
                      href={`/teams/${encodeURIComponent(normalizeTeamName(r.team))}`}
                      className="flex items-center gap-2.5 font-medium transition-colors hover:text-accent"
                    >
                      <TeamBadge name={r.team} src={p?.logoUrl ?? p?.flagUrl} primaryColor={p?.primaryColor} size={24} />
                      <span className="truncate">{r.team}</span>
                    </Link>
                  </td>
                  <td className="px-3 text-right font-mono text-xs tabular-nums text-muted">{r.played}</td>
                  <td className="px-4 text-right font-mono font-bold tabular-nums text-accent-2">{r.rating}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="border-t border-line px-4 py-2 text-[10px] text-muted">
        Elo rating · opponent-strength weighted · min 15 matches
      </p>
    </section>
  );
}

export default async function RankingsPage() {
  const elo = await getTeamEloRankings([...FORMATS]);
  const leaders = await Promise.all(FORMATS.map((f) => getPlayerLeaders(f, TOP_N)));
  const names = FORMATS.flatMap((f) => (elo[f] ?? []).slice(0, TOP_N).map((r) => r.team));
  const teams = await getTeamProfiles(names);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="pt-10">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Rankings</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Team, batting and bowling rankings for Tests, ODIs and T20Is. Teams use an Elo rating
            (opponent-strength weighted) computed from every international result; players are ranked
            by career runs and wickets in each format.
          </p>
        </section>

        {FORMATS.map((f, idx) => (
          <section key={f} className="mt-10">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-lg font-bold tracking-tight">
                {MATCH_CLASS_LABEL[f]}
              </h2>
              <div className="h-px flex-1 bg-line" />
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              <TeamRankBoard rows={elo[f] ?? []} teams={teams} />
              <StatBoard title="Top Run-Scorers" leaders={leaders[idx]!.batters} metricLabel="Runs" />
              <StatBoard title="Top Wicket-Takers" leaders={leaders[idx]!.bowlers} metricLabel="Wkts" />
            </div>
          </section>
        ))}

        <p className="mt-10 rounded-lg border border-line bg-black/[0.02] px-4 py-2.5 text-xs text-muted">
          Note: these are computed from the match corpus (ball-by-ball data from ~2002), not the
          official ICC ranking points. They approximate the same ordering but won&apos;t match the
          ICC table exactly.
        </p>
      </main>
    </>
  );
}
