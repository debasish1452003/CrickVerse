import Link from "next/link";
import type { MatchDTO, TeamDTO } from "@/lib/serialize";

const STATE_LABEL: Record<string, string> = {
  SCHEDULED: "Upcoming",
  LIVE: "Live",
  COMPLETED: "Result",
  ABANDONED: "Abandoned",
};

function TeamRow({ team }: { team: TeamDTO | undefined }) {
  if (!team) {
    return (
      <div className="team-row team-row--tbd">
        <span className="team-name">To be decided</span>
      </div>
    );
  }
  return (
    <div className="team-row">
      <span className="team-badge" style={{ background: team.primaryColor ?? "#334155" }}>
        {(team.shortName ?? team.name ?? "?").slice(0, 3).toUpperCase()}
      </span>
      <span className="team-name">{team.name ?? team.shortName ?? "Unknown"}</span>
      <span className="team-score">{team.score ?? "—"}</span>
    </div>
  );
}

export function MatchCard({ match }: { match: MatchDTO }) {
  return (
    <Link href={`/matches/${match.id}`} className="match-card">
      <div className="match-card__header">
        <span className="series-name">{match.series?.name ?? "Match"}</span>
        <span className={`state-pill state-pill--${match.state.toLowerCase()}`}>
          {STATE_LABEL[match.state] ?? match.state}
        </span>
      </div>
      <div className="match-card__title">{match.title ?? ""}</div>
      <div className="match-card__body">
        <TeamRow team={match.teams[0]} />
        <TeamRow team={match.teams[1]} />
      </div>
      <div className="match-card__footer">
        {match.statusText ?? (match.venue?.name ?? "")}
      </div>
    </Link>
  );
}
