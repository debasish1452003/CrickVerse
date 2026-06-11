import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { battingCareer, bowlingCareer } from "@/lib/player-stats";
import { getPlayerById } from "@/lib/queries";

export const dynamic = "force-dynamic";

const n2 = (n: number | null) => (n == null ? "—" : n.toFixed(2));

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.02] px-4 py-3">
      <div className="font-mono text-xl tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await getPlayerById(id);
  if (!player) notFound();

  const bat = battingCareer(player);
  const bowl = bowlingCareer(player);
  const subtitle =
    [player.country, player.role, player.battingStyle].filter(Boolean).join(" · ") || "Player";

  const recent = [...player.battingPerfs].reverse().slice(0, 12);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-5 pb-24">
        <section className="card mt-10 p-6 sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight">{player.fullName}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </section>

        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
          Batting
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Inns" value={bat.innings} />
          <Stat label="Runs" value={bat.runs} />
          <Stat label="Avg" value={n2(bat.average)} />
          <Stat label="SR" value={n2(bat.strikeRate)} />
          <Stat label="HS" value={bat.highScore} />
          <Stat label="50s / 100s" value={`${bat.fifties} / ${bat.hundreds}`} />
        </div>

        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
          Bowling
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Inns" value={bowl.innings} />
          <Stat label="Wickets" value={bowl.wickets} />
          <Stat label="Avg" value={n2(bowl.average)} />
          <Stat label="Econ" value={n2(bowl.economy)} />
          <Stat label="Best" value={bowl.best} />
        </div>

        <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
          Recent innings
        </h2>
        <div className="card divide-y divide-line/60 overflow-hidden">
          {recent.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No batting records yet.</p>
          ) : (
            recent.map((b) => (
              <Link
                key={b.id}
                href={`/matches/${b.innings.match.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-white/[0.02]"
              >
                <span className="truncate text-muted">
                  {b.innings.match.series?.name ?? b.innings.match.title ?? "Match"}
                </span>
                <span className="font-mono tabular-nums">
                  {b.runs}
                  {b.dismissal === "NOT_OUT" ? "*" : ""}{" "}
                  <span className="text-muted">({b.balls})</span>
                </span>
              </Link>
            ))
          )}
        </div>
      </main>
    </>
  );
}
