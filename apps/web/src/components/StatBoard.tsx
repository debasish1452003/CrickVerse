import Link from "next/link";
import { PlayerAvatar } from "@/components/Crest";
import type { StatLeader } from "@/lib/queries";

/** One leaderboard panel (e.g. "Most Runs") with up to N ranked players. */
export function StatBoard({
  title,
  leaders,
  metricLabel,
}: {
  title: string;
  leaders: (StatLeader & { photoUrl?: string | null })[];
  metricLabel: string;
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-sm font-bold tracking-tight">{title}</h3>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{metricLabel}</span>
      </div>
      {leaders.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">No data.</p>
      ) : (
        <ol>
          {leaders.map((p, i) => {
            const body = (
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-muted">{i + 1}</span>
                <PlayerAvatar name={p.name} src={p.photoUrl ?? null} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-[11px] text-muted">{p.detail}</span>
                </span>
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-accent-2">{p.value}</span>
              </div>
            );
            return (
              <li key={`${p.cricsheetId ?? p.name}-${i}`} className="border-t border-line/60 first:border-0">
                {p.cricsheetId ? (
                  <Link href={`/players/${p.cricsheetId}`} className="block transition-colors hover:bg-black/[0.02]">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
