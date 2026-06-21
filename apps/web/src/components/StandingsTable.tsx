import Link from "next/link";
import { TeamBadge } from "@/components/Crest";
import type { StandingRow } from "@crickverse/domain";
import { TeamBadgeIndex } from "@crickverse/domain";

const nrrText = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(3)}`;

/** Points table for a tournament edition (P/W/L/NR/Pts + NRR). */
export function StandingsTable({
  rows,
  teams,
}: {
  rows: StandingRow[];
  teams: TeamBadgeIndex;
}) {
  if (rows.length === 0) {
    return (
      <div className="panel mt-6 grid place-items-center p-12 text-center text-sm text-muted">
        No points table available for this edition.
      </div>
    );
  }
  return (
    <div className="panel mt-6 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
              <th className="px-4 py-3 text-left font-semibold">#</th>
              <th className="py-3 pr-4 text-left font-semibold">Team</th>
              <th className="px-3 py-3 text-right font-semibold">P</th>
              <th className="px-3 py-3 text-right font-semibold">W</th>
              <th className="px-3 py-3 text-right font-semibold">L</th>
              <th className="px-3 py-3 text-right font-semibold">NR</th>
              <th className="px-3 py-3 text-right font-semibold">Pts</th>
              <th className="px-4 py-3 text-right font-semibold">NRR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const badge = teams.badgeFor(r.team);
              const id = teams.idFor(r.team);
              return (
                <tr key={r.team} className="border-b border-line/70 last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-muted">{i + 1}</td>
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-2.5">
                      <TeamBadge name={r.team} {...badge} size={26} />
                      {id ? (
                        <Link href={`/teams/${encodeURIComponent(id)}`} className="font-semibold hover:text-accent">
                          {r.team}
                        </Link>
                      ) : (
                        <span className="font-semibold">{r.team}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-muted">{r.played}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{r.won}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-muted">{r.lost}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-muted">{r.noResult}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-accent-2">{r.points}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-muted">{nrrText(r.nrr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-2.5 text-[11px] text-muted">
        Win = 2 pts · Tie / No-result = 1 pt. NRR uses the full-quota all-out adjustment.
      </p>
    </div>
  );
}
