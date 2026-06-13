import Link from "next/link";
import { notFound } from "next/navigation";
import { CompetitionBadge } from "@/components/CompetitionBadge";
import { Navbar } from "@/components/Navbar";
import {
  getCompetition,
  getCompetitionLogo,
  NO_SEASON,
  OTHER_COMPETITION,
  type CompetitionSeason,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Resolve the `[event]` segment to a raw eventName (null for the Other bucket). */
function decodeEvent(segment: string): string | null {
  return segment === OTHER_COMPETITION ? null : decodeURIComponent(segment);
}

function seasonSegment(s: CompetitionSeason): string {
  return s.season == null ? NO_SEASON : encodeURIComponent(s.season);
}

export default async function CompetitionPage({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  const eventName = decodeEvent(event);
  const comp = await getCompetition(eventName);
  if (!comp) notFound();
  const logo = await getCompetitionLogo(eventName);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-5 pb-24">
        <section className="card mt-10 flex items-center gap-4 p-6 sm:p-8">
          <CompetitionBadge name={comp.name} src={logo} size={56} />
          <div className="min-w-0">
            <Link href="/series" className="text-xs text-muted transition-colors hover:text-fg">
              ← All competitions
            </Link>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {comp.name}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {comp.seasons.length} season{comp.seasons.length === 1 ? "" : "s"} ·{" "}
              {comp.totalMatches.toLocaleString()} match{comp.totalMatches === 1 ? "" : "es"}
            </p>
          </div>
        </section>

        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
          Seasons
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {comp.seasons.map((s) => (
            <Link
              key={s.season ?? NO_SEASON}
              href={`/series/${event}/${seasonSegment(s)}`}
              className="card flex items-center justify-between gap-3 p-4 transition-colors hover:border-accent/40"
            >
              <span className="text-base font-semibold tracking-tight">
                {s.season ?? "Undated"}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted">
                {s.matches} match{s.matches === 1 ? "" : "es"}
              </span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
