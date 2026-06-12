import Link from "next/link";
import type { MatchDTO, TeamDTO } from "@/lib/serialize";
import { hueFromName } from "./Crest";

const STATE: Record<string, { label: string; cls: string }> = {
  LIVE: { label: "Live", cls: "pill-live" },
  COMPLETED: { label: "Result", cls: "pill-accent" },
  SCHEDULED: { label: "Upcoming", cls: "" },
  ABANDONED: { label: "Abandoned", cls: "" },
};

function initials(t: TeamDTO): string {
  const base = (t.shortName ?? t.name ?? "?").replace(/[^A-Za-z]/g, "");
  return (base.slice(0, 3) || "?").toUpperCase();
}

export function TeamCrest({ team, size = 36 }: { team: TeamDTO; size?: number }) {
  if (team.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={team.logoUrl}
        alt={team.name ?? ""}
        width={size}
        height={size}
        className="shrink-0 rounded-lg bg-white/5 object-contain p-1 ring-1 ring-white/10"
        style={{ width: size, height: size }}
      />
    );
  }
  // No stored logo or colour → fall back to a deterministic hue from the name so
  // each team still reads distinctly instead of a uniform slate block.
  const hue = hueFromName(team.name ?? team.shortName ?? "?");
  const bg = team.primaryColor ?? `linear-gradient(135deg, hsl(${hue} 55% 32%), hsl(${(hue + 40) % 360} 50% 20%))`;
  return (
    <div
      className="grid shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white ring-1 ring-white/10"
      style={{ width: size, height: size, background: bg }}
    >
      {initials(team)}
    </div>
  );
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
      <TeamCrest team={team} />
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
