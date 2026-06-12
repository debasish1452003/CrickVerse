import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerAvatar, TeamBadge } from "@/components/Crest";
import { MatchRow } from "@/components/MatchRow";
import { Navbar } from "@/components/Navbar";
import { SeriesTabs, type SeriesTab, type SeriesTabKey } from "@/components/SeriesTabs";
import { StandingsTable } from "@/components/StandingsTable";
import { StatBoard } from "@/components/StatBoard";
import {
  getCompetition,
  getEditionSquads,
  getEditionVenues,
  getStandings,
  getTeamProfiles,
  getTournamentStats,
  isLimitedOversClass,
  NO_SEASON,
  OTHER_COMPETITION,
  searchMatches,
  teamBadgeFor,
  type TeamProfileRow,
} from "@/lib/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function decodeEvent(segment: string): string | null {
  return segment === OTHER_COMPETITION ? null : decodeURIComponent(segment);
}

function pageHref(base: string, tab: SeriesTabKey, page: number): string {
  const params = new URLSearchParams();
  if (tab !== "overview") params.set("tab", tab);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

interface EditionMeta {
  matches: number;
  firstDate: string | null;
  lastDate: string | null;
  dominantClass: string | null;
}

async function getEditionMeta(eventName: string | null, season: string | null): Promise<EditionMeta> {
  const [agg, classes] = await Promise.all([
    prisma.careerMatch.aggregate({
      where: { eventName, season },
      _count: { _all: true },
      _min: { matchDate: true },
      _max: { matchDate: true },
    }),
    prisma.careerMatch.groupBy({
      by: ["matchClass"],
      where: { eventName, season },
      _count: { _all: true },
    }),
  ]);
  const dominant = classes.sort((a, b) => b._count._all - a._count._all)[0]?.matchClass ?? null;
  return {
    matches: agg._count._all,
    firstDate: agg._min.matchDate,
    lastDate: agg._max.matchDate,
    dominantClass: dominant,
  };
}

export default async function SeriesEditionPage({
  params,
  searchParams,
}: {
  params: Promise<{ event: string; season: string }>;
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const { event, season } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);

  const eventName = decodeEvent(event);
  const seasonValue = season === NO_SEASON ? null : decodeURIComponent(season);

  const comp = await getCompetition(eventName);
  if (!comp || !comp.seasons.some((s) => s.season === seasonValue)) notFound();

  const meta = await getEditionMeta(eventName, seasonValue);
  const showTable = isLimitedOversClass(meta.dominantClass);

  const allTabs: SeriesTab[] = [
    { key: "overview", label: "Overview" },
    { key: "matches", label: "Matches" },
    ...(showTable ? ([{ key: "table", label: "Points Table" }] as SeriesTab[]) : []),
    { key: "stats", label: "Stats" },
    { key: "squads", label: "Squads" },
    { key: "venues", label: "Venues" },
  ];
  const requested = (sp.tab ?? "overview") as SeriesTabKey;
  const active: SeriesTabKey = allTabs.some((t) => t.key === requested) ? requested : "overview";

  const base = `/series/${event}/${season}`;
  const span =
    meta.firstDate && meta.lastDate
      ? meta.firstDate === meta.lastDate
        ? meta.firstDate
        : `${meta.firstDate} – ${meta.lastDate}`
      : null;

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="pt-8">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Link href="/series" className="transition-colors hover:text-accent">
              Series
            </Link>
            <span>/</span>
            <Link href={`/series/${event}`} className="truncate transition-colors hover:text-accent">
              {comp.name}
            </Link>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {comp.name}
            {seasonValue ? <span className="text-muted"> · {seasonValue}</span> : null}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>{meta.matches.toLocaleString()} match{meta.matches === 1 ? "" : "es"}</span>
            {span && <span>{span}</span>}
          </div>
        </section>

        <SeriesTabs tabs={allTabs} active={active} basePath={base} />

        {active === "overview" && <OverviewTab eventName={eventName} season={seasonValue} showTable={showTable} base={base} />}
        {active === "matches" && <MatchesTab eventName={eventName} season={seasonValue} page={page} base={base} />}
        {active === "table" && showTable && <PointsTableTab eventName={eventName} season={seasonValue} />}
        {active === "stats" && <StatsTab eventName={eventName} season={seasonValue} />}
        {active === "squads" && <SquadsTab eventName={eventName} season={seasonValue} />}
        {active === "venues" && <VenuesTab eventName={eventName} season={seasonValue} />}
      </main>
    </>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

async function OverviewTab({
  eventName,
  season,
  showTable,
  base,
}: {
  eventName: string | null;
  season: string | null;
  showTable: boolean;
  base: string;
}) {
  const [standings, stats, recent] = await Promise.all([
    showTable ? getStandings(eventName, season) : Promise.resolve([]),
    getTournamentStats(eventName, season, 5),
    searchMatches({ eventName: eventName ?? "", season: season ?? "", page: 1, pageSize: 5 }),
  ]);
  const teams = await getTeamProfiles([
    ...standings.map((s) => s.team),
    ...recent.items.flatMap((m) => [m.teamHome, m.teamAway]),
  ]);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 grid gap-6">
        {showTable && standings.length > 0 && (
          <div>
            <SectionLabel title="Points Table" href={`${base}?tab=table`} cta="Full table" />
            <StandingsTable rows={standings} teams={teams} />
          </div>
        )}
        <div>
          <SectionLabel title="Latest matches" href={`${base}?tab=matches`} cta="All matches" />
          {recent.items.length === 0 ? (
            <p className="panel mt-3 p-8 text-center text-sm text-muted">No matches.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {recent.items.map((m) => (
                <MatchRow key={m.matchId} m={m} teams={teams} />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-6">
        <StatBoard title="Most Runs" leaders={stats.mostRuns} metricLabel="Runs" />
        <StatBoard title="Most Wickets" leaders={stats.mostWickets} metricLabel="Wkts" />
      </div>
    </div>
  );
}

// ── Matches (grouped by date) ─────────────────────────────────────────────────

async function MatchesTab({
  eventName,
  season,
  page,
  base,
}: {
  eventName: string | null;
  season: string | null;
  page: number;
  base: string;
}) {
  const { items, pageCount } = await searchMatches({
    eventName: eventName ?? "",
    season: season ?? "",
    page,
    pageSize: 30,
  });
  const teams = await getTeamProfiles(items.flatMap((m) => [m.teamHome, m.teamAway]));

  // Group consecutive matches by date (the list is already newest-first).
  const groups: { date: string | null; matches: typeof items }[] = [];
  for (const m of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === (m.matchDate ?? null)) last.matches.push(m);
    else groups.push({ date: m.matchDate ?? null, matches: [m] });
  }

  if (items.length === 0) {
    return <p className="panel mt-6 p-12 text-center text-sm text-muted">No matches in this edition.</p>;
  }

  return (
    <div className="mt-6">
      {groups.map((g) => (
        <div key={g.date ?? "nodate"} className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            {g.date ?? "Date unknown"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.matches.map((m) => (
              <MatchRow key={m.matchId} m={m} teams={teams} />
            ))}
          </div>
        </div>
      ))}

      {pageCount > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link href={pageHref(base, "matches", page - 1)} className="rounded-lg border border-line px-4 py-2 transition-colors hover:border-accent/50">
              ← Prev
            </Link>
          ) : (
            <span className="rounded-lg border border-line/40 px-4 py-2 text-muted/50">← Prev</span>
          )}
          <span className="text-muted">Page {page} of {pageCount}</span>
          {page < pageCount ? (
            <Link href={pageHref(base, "matches", page + 1)} className="rounded-lg border border-line px-4 py-2 transition-colors hover:border-accent/50">
              Next →
            </Link>
          ) : (
            <span className="rounded-lg border border-line/40 px-4 py-2 text-muted/50">Next →</span>
          )}
        </nav>
      )}
    </div>
  );
}

// ── Points Table ────────────────────────────────────────────────────────────

async function PointsTableTab({ eventName, season }: { eventName: string | null; season: string | null }) {
  const standings = await getStandings(eventName, season);
  const teams = await getTeamProfiles(standings.map((s) => s.team));
  return <StandingsTable rows={standings} teams={teams} />;
}

// ── Stats ───────────────────────────────────────────────────────────────────

async function StatsTab({ eventName, season }: { eventName: string | null; season: string | null }) {
  const stats = await getTournamentStats(eventName, season, 10);
  return (
    <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      <StatBoard title="Most Runs" leaders={stats.mostRuns} metricLabel="Runs" />
      <StatBoard title="Most Wickets" leaders={stats.mostWickets} metricLabel="Wkts" />
      <StatBoard title="Highest Scores" leaders={stats.highestScores} metricLabel="Score" />
      <StatBoard title="Most Sixes" leaders={stats.mostSixes} metricLabel="6s" />
      <StatBoard title="Most Fours" leaders={stats.mostFours} metricLabel="4s" />
      <StatBoard title="Best Strike Rate" leaders={stats.bestStrikeRate} metricLabel="SR" />
      <StatBoard title="Best Economy" leaders={stats.bestEconomy} metricLabel="Econ" />
    </div>
  );
}

// ── Squads ──────────────────────────────────────────────────────────────────

async function SquadsTab({ eventName, season }: { eventName: string | null; season: string | null }) {
  const squads = await getEditionSquads(eventName, season);
  const teams = await getTeamProfiles(squads.map((s) => s.team));
  if (squads.length === 0) {
    return <p className="panel mt-6 p-12 text-center text-sm text-muted">No squad data for this edition.</p>;
  }
  return (
    <div className="mt-6 grid gap-5 md:grid-cols-2">
      {squads.map((sq) => {
        const badge = teamBadgeFor(sq.team, teams);
        const id = teams.get(sq.team.trim().toLowerCase())?.id;
        return (
          <section key={sq.team} className="panel overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <TeamBadge name={sq.team} {...badge} size={28} />
              {id ? (
                <Link href={`/teams/${encodeURIComponent(id)}`} className="font-bold tracking-tight hover:text-accent">
                  {sq.team}
                </Link>
              ) : (
                <span className="font-bold tracking-tight">{sq.team}</span>
              )}
              <span className="ml-auto text-xs text-muted">{sq.members.length} players</span>
            </div>
            <ul className="divide-y divide-line/60">
              {sq.members.map((mem) => {
                const row = (
                  <div className="flex items-center gap-3 px-4 py-2">
                    <PlayerAvatar name={mem.name} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{mem.name}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                      {mem.appearances} app · {mem.runs} r · {mem.wickets} w
                    </span>
                  </div>
                );
                return (
                  <li key={mem.cricsheetId ?? mem.name}>
                    {mem.cricsheetId ? (
                      <Link href={`/players/${mem.cricsheetId}`} className="block transition-colors hover:bg-black/[0.02]">
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ── Venues ──────────────────────────────────────────────────────────────────

async function VenuesTab({ eventName, season }: { eventName: string | null; season: string | null }) {
  const venues = await getEditionVenues(eventName, season);
  if (venues.length === 0) {
    return <p className="panel mt-6 p-12 text-center text-sm text-muted">No venue data.</p>;
  }
  return (
    <div className="panel mt-6 overflow-hidden">
      <ul className="divide-y divide-line/60">
        {venues.map((v, i) => (
          <li key={`${v.venue ?? "?"}-${i}`} className="flex items-center gap-3 px-4 py-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent/10 text-sm">📍</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{v.venue ?? "Unknown venue"}</span>
              {v.city && <span className="block truncate text-xs text-muted">{v.city}</span>}
            </span>
            <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
              {v.matches} match{v.matches === 1 ? "" : "es"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── small bits ──────────────────────────────────────────────────────────────

function SectionLabel({ title, href, cta }: { title: string; href?: string; cta?: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-muted">{title}</h2>
      <div className="h-px flex-1 bg-line" />
      {href && (
        <Link href={href} className="shrink-0 text-xs text-accent transition-colors hover:underline">
          {cta ?? "View all"} →
        </Link>
      )}
    </div>
  );
}
