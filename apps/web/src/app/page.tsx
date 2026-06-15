import Link from "next/link";
import { CompetitionBadge } from "@/components/CompetitionBadge";
import { PlayerAvatar, TeamBadge } from "@/components/Crest";
import { MatchRow } from "@/components/MatchRow";
import { Navbar } from "@/components/Navbar";
import type { CareerPlayerListItem } from "@/dto/player-dto";
import { services } from "@/services";

// Live data — never statically prerender (and don't hit the DB at build time).
export const dynamic = "force-dynamic";

function SectionHead({ title, href, cta }: { title: string; href?: string; cta?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{title}</h2>
      <div className="h-px flex-1 bg-line" />
      {href && (
        <Link href={href} className="shrink-0 text-xs text-muted transition-colors hover:text-fg">
          {cta ?? "View all"} →
        </Link>
      )}
    </div>
  );
}

function Leaderboard({
  title,
  players,
  metric,
}: {
  title: string;
  players: CareerPlayerListItem[];
  metric: "runs" | "wickets";
}) {
  return (
    <section className="card overflow-hidden">
      <h3 className="border-b border-line px-5 py-3.5 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
        {title}
      </h3>
      <ol className="divide-y divide-line/50">
        {players.map((p, i) => (
          <li key={p.cricsheetId}>
            <Link
              href={`/players/${p.cricsheetId}`}
              className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-black/[0.03]"
            >
              <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-muted">{i + 1}</span>
              <PlayerAvatar name={p.name} src={p.photoUrl} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-accent">
                {(metric === "runs" ? p.careerRuns : p.careerWickets).toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function Home() {
  const [recent, topRuns, topWkts, comps, featuredTeams] = await Promise.all([
    services.matches.search({ page: 1, pageSize: 6 }),
    services.players.topPlayers("runs", 10),
    services.players.topPlayers("wickets", 10),
    services.competitions.list(),
    services.teams.listProfiles({ national: true }),
  ]);
  const topComps = comps.filter((c) => c.eventName).slice(0, 12);
  const topTeams = featuredTeams.slice(0, 12);
  const [teams, compLogos] = await Promise.all([
    services.teams.badgeIndex(recent.items.flatMap((m) => [m.teamHome, m.teamAway])),
    services.competitions.logosByNames(topComps.map((c) => c.eventName)),
  ]);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="py-12 sm:py-16">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-black/[0.03] px-3 py-1 text-xs text-muted">
            <span className="live-dot" /> {recent.total.toLocaleString()} matches · all formats, all eras
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            All of cricket, <span className="text-accent">beautifully</span> organized.
          </h1>
          <p className="mt-4 max-w-xl text-muted">
            Full scorecards, ball-by-ball charts, and deep player & team analytics across the entire
            Cricsheet corpus — structured into a clean model and served fast.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link href="/matches" className="rounded-xl bg-accent px-4 py-2.5 font-medium text-white transition-opacity hover:opacity-90">
              Browse matches
            </Link>
            <Link href="/players" className="rounded-xl border border-line px-4 py-2.5 transition-colors hover:border-accent/50">
              Explore players
            </Link>
          </div>
        </section>

        {recent.items.length > 0 && (
          <section className="mt-4">
            <SectionHead title="Recent results" href="/matches" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recent.items.map((m) => (
                <MatchRow key={m.matchId} m={m} teams={teams} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-12 grid gap-5 lg:grid-cols-2">
          <Leaderboard title="Most career runs" players={topRuns} metric="runs" />
          <Leaderboard title="Most career wickets" players={topWkts} metric="wickets" />
        </section>

        {topComps.length > 0 && (
          <section className="mt-12">
            <SectionHead title="Competitions" href="/series" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topComps.map((c) => (
                <Link
                  key={c.name}
                  href={`/series/${encodeURIComponent(c.eventName!)}`}
                  className="card flex items-center gap-3 p-4"
                >
                  <CompetitionBadge name={c.name} src={c.logoKey ? compLogos.get(c.logoKey) ?? null : null} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="text-xs text-muted">
                      {c.seasons.length} season{c.seasons.length === 1 ? "" : "s"}
                      {c.latestSeason ? ` · latest ${c.latestSeason}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
                    {c.totalMatches.toLocaleString()}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {topTeams.length > 0 && (
          <section className="mt-12">
            <SectionHead title="International teams" href="/teams" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {topTeams.map((t) => (
                <Link key={t.id} href={`/teams/${encodeURIComponent(t.id)}`} className="card flex items-center gap-3 p-3">
                  <TeamBadge name={t.displayName} src={t.logoUrl ?? t.flagUrl} primaryColor={t.primaryColor} size={36} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.displayName}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
