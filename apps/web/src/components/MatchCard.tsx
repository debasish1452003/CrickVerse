import Link from "next/link";
import type { MatchDTO, TeamDTO } from "@/lib/serialize";

const STATE: Record<string, { label: string; cls: string }> = {
  LIVE: { label: "Live", cls: "pill-live" },
  COMPLETED: { label: "Result", cls: "pill-accent" },
  SCHEDULED: { label: "Upcoming", cls: "" },
  ABANDONED: { label: "Abandoned", cls: "" },
};

function crest(t: TeamDTO): string {
  const base = (t.shortName ?? t.name ?? "?").replace(/[^A-Za-z]/g, "");
  return (base.slice(0, 3) || "?").toUpperCase();
}

function TeamRow({ team }: { team?: TeamDTO }) {
  if (!team) {
    return (
      <div className="flex items-center gap-3 opacity-50">
        <div className="size-9 rounded-lg bg-white/5" />
        <span className="text-sm text-muted">To be decided</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div
        className="grid size-9 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white shadow-inner ring-1 ring-white/10"
        style={{ background: team.primaryColor ?? "#334155" }}
      >
        {crest(team)}
      </div>
      <span className="flex-1 truncate font-medium">{team.name ?? team.shortName ?? "Unknown"}</span>
      <span className="font-mono text-sm tabular-nums">{team.score ?? "—"}</span>
    </div>
  );
}

export function MatchCard({ match }: { match: MatchDTO }) {
  const s = STATE[match.state] ?? { label: match.state, cls: "" };
  return (
    <Link href={`/matches/${match.id}`} className="card flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted">
          {match.series?.name ?? "Match"}
          {match.format ? ` · ${match.format}` : ""}
        </span>
        <span className={`pill ${s.cls}`}>
          {match.state === "LIVE" && <span className="live-dot" />}
          {s.label}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <TeamRow team={match.teams[0]} />
        <TeamRow team={match.teams[1]} />
      </div>
      <div className="mt-auto truncate border-t border-line pt-3 text-xs text-muted">
        {match.statusText ?? match.venue?.name ?? "Fixture"}
      </div>
    </Link>
  );
}
