import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamBadge, PlayerAvatar } from "@/components/Crest";
import { MatchRow } from "@/components/MatchRow";
import { Navbar } from "@/components/Navbar";
import {
  getTeamMatches,
  getTeamProfileById,
  getTeamProfiles,
  getTeamRecord,
  getTeamSquad,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-black/[0.02] px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 font-mono text-xl tabular-nums">{value}</div>
    </div>
  );
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ team: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { team } = await params;
  const id = decodeURIComponent(team);
  const sp = await searchParams;
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);

  const profile = await getTeamProfileById(id);
  if (!profile) notFound();

  const [record, squad, matches] = await Promise.all([
    getTeamRecord(profile.displayName),
    getTeamSquad(profile.displayName),
    getTeamMatches(profile.displayName, page),
  ]);
  const teamMap = await getTeamProfiles(matches.items.flatMap((m) => [m.teamHome, m.teamAway]));
  const winPct = record.played > 0 ? ((record.won / record.played) * 100).toFixed(1) : "—";

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="card mt-10 p-6 sm:p-8">
          <Link href="/teams" className="text-xs text-muted transition-colors hover:text-fg">
            ← All teams
          </Link>
          <div className="mt-3 flex items-center gap-4">
            <TeamBadge
              name={profile.displayName}
              src={profile.logoUrl ?? profile.flagUrl}
              primaryColor={profile.primaryColor}
              size={72}
            />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{profile.displayName}</h1>
              <p className="mt-1 text-sm text-muted">
                {[profile.isNational ? "International" : "League / Domestic", profile.country]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Played" value={record.played.toLocaleString()} />
            <Stat label="Won" value={record.won.toLocaleString()} />
            <Stat label="Lost" value={record.lost.toLocaleString()} />
            <Stat label="Win %" value={winPct} />
          </div>
        </section>

        {squad.length > 0 && (
          <>
            <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
              Most-capped players
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {squad.map((p) => (
                <Link
                  key={p.cricsheetId}
                  href={`/players/${p.cricsheetId}`}
                  className="card flex items-center gap-3 p-3"
                >
                  <PlayerAvatar name={p.name} size={36} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                    {p.innings} inns · {p.runs.toLocaleString()} r
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
          Matches <span className="text-muted/60">({matches.total.toLocaleString()})</span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matches.items.map((m) => (
            <MatchRow key={m.matchId} m={m} teams={teamMap} />
          ))}
        </div>

        {matches.pageCount > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-4 text-sm">
            {page > 1 ? (
              <Link
                href={`/teams/${encodeURIComponent(id)}?page=${page - 1}`}
                className="rounded-lg border border-line px-4 py-2 transition-colors hover:border-accent/50"
              >
                ← Prev
              </Link>
            ) : (
              <span className="rounded-lg border border-line/40 px-4 py-2 text-muted/50">← Prev</span>
            )}
            <span className="text-muted">
              Page {matches.page} of {matches.pageCount}
            </span>
            {page < matches.pageCount ? (
              <Link
                href={`/teams/${encodeURIComponent(id)}?page=${page + 1}`}
                className="rounded-lg border border-line px-4 py-2 transition-colors hover:border-accent/50"
              >
                Next →
              </Link>
            ) : (
              <span className="rounded-lg border border-line/40 px-4 py-2 text-muted/50">Next →</span>
            )}
          </nav>
        )}
      </main>
    </>
  );
}
