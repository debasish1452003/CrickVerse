import Link from "next/link";
import { MatchClasses } from "@crickverse/domain";
import { TeamBadgeIndex } from "@crickverse/domain";
import type { GoldMatchListItem } from "@/dto/match-dto";
import { TeamBadge } from "./Crest";

/** A gold-match card used by both the matches browser and series edition pages. */
export function MatchRow({
  m,
  teams,
}: {
  m: GoldMatchListItem;
  teams?: TeamBadgeIndex;
}) {
  const hasTeams = Boolean(m.teamHome && m.teamAway);
  const title = hasTeams ? `${m.teamHome} vs ${m.teamAway}` : m.eventName ?? "Match";
  const result = m.winner ? `${m.winner} won` : "—";
  const badges = teams ?? TeamBadgeIndex.empty();
  return (
    <Link
      href={`/matches/${m.matchId}`}
      className="card flex flex-col gap-3 p-4 transition-colors hover:border-accent/40"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {hasTeams && (
            <span className="flex shrink-0 items-center -space-x-1.5">
              <TeamBadge name={m.teamHome} {...badges.badgeFor(m.teamHome)} size={24} className="ring-2 ring-surface" />
              <TeamBadge name={m.teamAway} {...badges.badgeFor(m.teamAway)} size={24} className="ring-2 ring-surface" />
            </span>
          )}
          <span className="truncate text-sm font-semibold tracking-tight">{title}</span>
        </div>
        <span className="shrink-0 rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
          {MatchClasses.label(m.matchClass)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 font-mono text-xs tabular-nums text-muted">
        <span className="truncate">
          {[m.inn1Score, m.inn2Score].filter(Boolean).join("  •  ") || "—"}
        </span>
        <span className="shrink-0">{m.matchDate ?? ""}</span>
      </div>
      <div className="truncate text-xs text-muted">
        {result}
        {m.eventName ? ` · ${m.eventName}` : ""}
        {m.venue ? ` · ${m.venue}` : ""}
      </div>
    </Link>
  );
}
