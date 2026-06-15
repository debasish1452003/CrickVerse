import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamBadge } from "@/components/Crest";
import { Navbar } from "@/components/Navbar";
import { OverCharts } from "@/components/OverCharts";
import { MatchClasses } from "@/core/match-class";
import {
  CanonicalMatch,
  type CanonicalBattingPerfRow,
  type CanonicalBowlingPerfRow,
  type CanonicalInningsRow,
  type MatchTeamLine,
} from "@/domain/match/canonical-match";
import {
  GoldMatch,
  oversText,
  type GoldBattingRow,
  type GoldBowlingRow,
  type GoldInningsRow,
} from "@/domain/match/gold-match";
import { TeamBadgeIndex } from "@/domain/team/team-profile";
import type { InningsOversData } from "@/dto/match-dto";
import { services } from "@/services";

export const dynamic = "force-dynamic";

const fmt2 = (n: number | null) => (n == null ? "—" : n.toFixed(2));

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-wider text-muted">
          {head.map((h, i) => (
            <th
              key={`${h}-${i}`}
              className={`py-2.5 font-medium ${i === 0 ? "px-5 text-left" : "px-3 text-right"}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

/** Full-corpus scorecard from the gold tables (keyed by Cricsheet match id). */
function GoldScorecard({
  m,
  teams,
  overs,
}: {
  m: GoldMatch;
  teams: TeamBadgeIndex;
  overs: InningsOversData[];
}) {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-5 pb-24">
        <section className="card mt-10 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Link href="/matches" className="transition-colors hover:text-fg">
              ← Matches
            </Link>
            <span className="pill">{MatchClasses.label(m.matchClass)}</span>
            {m.eventName && <span className="truncate">{m.eventName}</span>}
          </div>
          {m.hasBothTeams ? (
            <div className="mt-3 flex items-center gap-3">
              <TeamBadge name={m.teamHome} {...teams.badgeFor(m.teamHome)} size={40} />
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{m.title}</h1>
              <TeamBadge name={m.teamAway} {...teams.badgeFor(m.teamAway)} size={40} />
            </div>
          ) : (
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{m.title}</h1>
          )}
          <p className="mt-2 text-sm font-medium text-accent">{m.resultText}</p>
          <p className="mt-1 text-xs text-muted">{m.metaLine}</p>
          {m.tossText && <p className="mt-1 text-xs text-muted">{m.tossText}</p>}
        </section>

        {m.innings.map((inn: GoldInningsRow) => {
          const batting = m.battingIn(inn.inningsNo);
          const bowling = m.bowlingIn(inn.inningsNo);
          return (
            <section key={inn.inningsNo} className="card mt-6 overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h3 className="flex items-center gap-2.5 font-semibold">
                  {inn.battingTeam && (
                    <TeamBadge name={inn.battingTeam} {...teams.badgeFor(inn.battingTeam)} size={28} />
                  )}
                  {inn.battingTeam ?? `Innings ${inn.inningsNo}`}
                </h3>
                <span className="font-mono text-lg tabular-nums">
                  {inn.runs}/{inn.wickets}{" "}
                  <span className="text-sm text-muted">({oversText(inn.balls)} ov)</span>
                </span>
              </div>

              <Table head={["Batter", "", "R", "B", "4s", "6s", "SR"]}>
                {batting.map((b: GoldBattingRow) => (
                  <tr key={`bat-${b.battingPos}`} className="border-t border-line/60">
                    <td className="px-5 py-2.5">
                      {b.cricsheetId ? (
                        <Link
                          href={`/players/${b.cricsheetId}`}
                          className="font-medium transition-colors hover:text-accent"
                        >
                          {b.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{b.name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-muted">
                      {b.out ? (b.dismissal ?? "out") : "not out"}
                    </td>
                    <td className="px-3 text-right font-mono tabular-nums">{b.runs}</td>
                    <td className="px-3 text-right font-mono tabular-nums text-muted">{b.balls}</td>
                    <td className="px-3 text-right font-mono tabular-nums text-muted">{b.fours}</td>
                    <td className="px-3 text-right font-mono tabular-nums text-muted">{b.sixes}</td>
                    <td className="px-5 text-right font-mono tabular-nums text-muted">
                      {fmt2(b.strikeRate)}
                    </td>
                  </tr>
                ))}
              </Table>

              {bowling.length > 0 && (
                <div className="border-t border-line">
                  <Table head={["Bowler", "O", "M", "R", "W", "Econ"]}>
                    {bowling.map((bw: GoldBowlingRow) => (
                      <tr key={`bowl-${bw.bowlingPos}`} className="border-t border-line/60">
                        <td className="px-5 py-2.5">
                          {bw.cricsheetId ? (
                            <Link
                              href={`/players/${bw.cricsheetId}`}
                              className="font-medium transition-colors hover:text-accent"
                            >
                              {bw.name}
                            </Link>
                          ) : (
                            <span className="font-medium">{bw.name}</span>
                          )}
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-muted">
                          {oversText(bw.balls)}
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-muted">
                          {bw.maidens}
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-muted">
                          {bw.runs}
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-accent">
                          {bw.wickets}
                        </td>
                        <td className="px-5 text-right font-mono tabular-nums text-muted">
                          {fmt2(bw.economy)}
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
            </section>
          );
        })}

        <OverCharts innings={overs} teamLabel={(no) => m.inningsLabel(no)} />
      </main>
    </>
  );
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Full-corpus scorecard (Cricsheet id) first; fall back to the canonical match (cuid).
  const gold = await services.matches.goldMatch(id);
  if (gold) {
    const [teams, overs] = await Promise.all([
      services.teams.badgeIndex(gold.teamNames),
      services.matches.inningsOvers(id),
    ]);
    return <GoldScorecard m={gold} teams={teams} overs={overs} />;
  }

  const match = await services.matches.canonicalMatch(id);
  if (!match) notFound();

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-5 pb-24">
        <section className="card mt-10 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="truncate">{match.seriesName}</span>
            {match.format && <span className="pill">{match.format}</span>}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <TeamLine {...match.homeLine} />
            <TeamLine {...match.awayLine} />
          </div>
          <p className="mt-5 text-sm font-medium text-accent">{match.statusLine}</p>
          {match.venueName && (
            <p className="mt-1 text-xs text-muted">
              {match.venueName}
              {match.venueCity ? `, ${match.venueCity}` : ""}
            </p>
          )}
        </section>

        {match.innings.length === 0 ? (
          <p className="mt-8 text-sm text-muted">Scorecard not ingested yet for this match.</p>
        ) : (
          match.innings.map((inn: CanonicalInningsRow) => {
            const { batted, didNotBat } = CanonicalMatch.splitBatting(inn.battingPerfs);
            return (
              <section key={inn.id} className="card mt-6 overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-5 py-4">
                  <h3 className="font-semibold">
                    {inn.battingTeam?.name ?? `Innings ${inn.inningsNo}`}
                  </h3>
                  <span className="font-mono text-lg tabular-nums">
                    {inn.runs}/{inn.wickets}{" "}
                    <span className="text-sm text-muted">({inn.oversText ?? "—"} ov)</span>
                  </span>
                </div>
                <Table head={["Batter", "R", "B", "4s", "6s", "SR"]}>
                  {batted.map((b: CanonicalBattingPerfRow) => (
                    <tr key={b.id} className="border-t border-line/60">
                      <td className="px-5 py-2.5">
                        <Link
                          href={`/players/${b.player.id}`}
                          className="font-medium transition-colors hover:text-accent"
                        >
                          {b.player.fullName}
                        </Link>
                        <span className="ml-2 text-xs text-muted">
                          {b.dismissalText ?? (b.dismissal === "NOT_OUT" ? "not out" : "")}
                        </span>
                      </td>
                      <td className="px-3 text-right font-mono tabular-nums">{b.runs}</td>
                      <td className="px-3 text-right font-mono tabular-nums text-muted">{b.balls}</td>
                      <td className="px-3 text-right font-mono tabular-nums text-muted">{b.fours}</td>
                      <td className="px-3 text-right font-mono tabular-nums text-muted">{b.sixes}</td>
                      <td className="px-5 text-right font-mono tabular-nums text-muted">
                        {fmt2(b.strikeRate)}
                      </td>
                    </tr>
                  ))}
                </Table>
                {didNotBat.length > 0 && (
                  <p className="border-t border-line/60 px-5 py-3 text-xs text-muted">
                    <span className="font-medium text-fg/70">Did not bat: </span>
                    {didNotBat.map((b: CanonicalBattingPerfRow) => b.player.fullName).join(", ")}
                  </p>
                )}
                {inn.bowlingPerfs.length > 0 && (
                  <div className="border-t border-line">
                    <Table head={["Bowler", "O", "M", "R", "W", "Econ"]}>
                      {inn.bowlingPerfs.map((bw: CanonicalBowlingPerfRow) => (
                        <tr key={bw.id} className="border-t border-line/60">
                          <td className="px-5 py-2.5">
                            <Link
                              href={`/players/${bw.player.id}`}
                              className="font-medium transition-colors hover:text-accent"
                            >
                              {bw.player.fullName}
                            </Link>
                          </td>
                          <td className="px-3 text-right font-mono tabular-nums text-muted">
                            {bw.oversText ?? "—"}
                          </td>
                          <td className="px-3 text-right font-mono tabular-nums text-muted">
                            {bw.maidens}
                          </td>
                          <td className="px-3 text-right font-mono tabular-nums text-muted">
                            {bw.runs}
                          </td>
                          <td className="px-3 text-right font-mono tabular-nums text-accent">
                            {bw.wickets}
                          </td>
                          <td className="px-5 text-right font-mono tabular-nums text-muted">
                            {fmt2(bw.economy)}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                )}
              </section>
            );
          })
        )}
      </main>
    </>
  );
}

function TeamLine({ name, color, logo, score }: MatchTeamLine) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-black/[0.02] p-4">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={name}
          width={40}
          height={40}
          className="rounded-lg bg-black/[0.04] object-contain p-1 ring-1 ring-black/10"
          style={{ width: 40, height: 40 }}
        />
      ) : color ? (
        <div
          className="size-10 shrink-0 rounded-lg ring-1 ring-black/10"
          style={{ background: color }}
        />
      ) : (
        <TeamBadge name={name} size={40} />
      )}
      <span className="flex-1 truncate font-medium">{name}</span>
      <span className="font-mono text-lg tabular-nums">{score ?? "—"}</span>
    </div>
  );
}
