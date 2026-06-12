import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import {
  careerByClass,
  careersFromGold,
  INTERNATIONAL_CLASSES,
  MATCH_CLASS_LABEL,
  type FormatCareer,
} from "@/lib/player-stats";
import { getCareerPlayer, getPlayerById } from "@/lib/queries";

export const dynamic = "force-dynamic";

const n2 = (n: number | null) => (n == null ? "—" : n.toFixed(2));

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-muted">
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-3 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/50">{children}</tbody>
      </table>
    </div>
  );
}

function FormatCell({ fc }: { fc: FormatCareer }) {
  const intl = INTERNATIONAL_CLASSES.has(fc.matchClass);
  return (
    <td className="whitespace-nowrap px-3 py-2.5 text-left font-medium">
      <span className="inline-flex items-center gap-2">
        {intl && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
        {MATCH_CLASS_LABEL[fc.matchClass]}
      </span>
    </td>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2.5 text-right font-mono tabular-nums">{children}</td>;
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Prefer the gold (full-corpus) record, keyed by Cricsheet id. Fall back to the
  // canonical Player (cuid) so existing match-scorecard links still resolve.
  const gold = await getCareerPlayer(id);
  const canonical = gold ? null : await getPlayerById(id);
  if (!gold && !canonical) notFound();

  const name = gold ? gold.name : canonical!.fullName;
  const subtitle = gold
    ? gold.gender === "female"
      ? "Women's cricket"
      : gold.gender === "male"
        ? "Men's cricket"
        : "Player"
    : [canonical!.country, canonical!.role, canonical!.battingStyle].filter(Boolean).join(" · ") ||
      "Player";

  const byClass: FormatCareer[] = gold ? careersFromGold(gold.stats) : careerByClass(canonical!);
  const battingRows = byClass.filter((c) => c.batting.innings > 0);
  const bowlingRows = byClass.filter((c) => c.bowling.innings > 0);

  const totalMatches = byClass.reduce((s, c) => s + c.matches, 0);
  const totalRuns = byClass.reduce((s, c) => s + c.batting.runs, 0);
  const totalWkts = byClass.reduce((s, c) => s + c.bowling.wickets, 0);

  // Recent innings is a canonical-only extra (gold has aggregates, not per-innings).
  const recent = canonical
    ? [...canonical.battingPerfs]
        .sort((a, b) => matchTime(b) - matchTime(a))
        .slice(0, 12)
    : [];

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="card mt-10 p-6 sm:p-8">
          <Link href="/players" className="text-xs text-muted transition-colors hover:text-fg">
            ← All players
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{name}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <p className="mt-3 font-mono text-sm tabular-nums text-muted">
            {totalMatches} matches · <span className="text-fg">{totalRuns.toLocaleString()}</span> runs ·{" "}
            <span className="text-fg">{totalWkts}</span> wickets
          </p>
        </section>

        {battingRows.length > 0 && (
          <>
            <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
              Batting by format
            </h2>
            <Table head={["Format", "M", "Inns", "NO", "Runs", "HS", "Avg", "SR", "100", "50", "0", "4s", "6s"]}>
              {battingRows.map((c) => (
                <tr key={c.matchClass} className="transition-colors hover:bg-white/[0.02]">
                  <FormatCell fc={c} />
                  <Num>{c.matches}</Num>
                  <Num>{c.batting.innings}</Num>
                  <Num>{c.batting.notOuts}</Num>
                  <Num>{c.batting.runs}</Num>
                  <Num>{c.batting.highScore}</Num>
                  <Num>{n2(c.batting.average)}</Num>
                  <Num>{n2(c.batting.strikeRate)}</Num>
                  <Num>{c.batting.hundreds}</Num>
                  <Num>{c.batting.fifties}</Num>
                  <Num>{c.batting.zeros}</Num>
                  <Num>{c.batting.fours}</Num>
                  <Num>{c.batting.sixes}</Num>
                </tr>
              ))}
            </Table>
          </>
        )}

        {bowlingRows.length > 0 && (
          <>
            <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
              Bowling by format
            </h2>
            <Table head={["Format", "M", "Inns", "Balls", "Runs", "Wkts", "BBI", "Avg", "Econ", "SR", "5w"]}>
              {bowlingRows.map((c) => (
                <tr key={c.matchClass} className="transition-colors hover:bg-white/[0.02]">
                  <FormatCell fc={c} />
                  <Num>{c.matches}</Num>
                  <Num>{c.bowling.innings}</Num>
                  <Num>{c.bowling.balls}</Num>
                  <Num>{c.bowling.runs}</Num>
                  <Num>{c.bowling.wickets}</Num>
                  <Num>{c.bowling.best}</Num>
                  <Num>{n2(c.bowling.average)}</Num>
                  <Num>{n2(c.bowling.economy)}</Num>
                  <Num>{n2(c.bowling.strikeRate)}</Num>
                  <Num>{c.bowling.fiveWickets}</Num>
                </tr>
              ))}
            </Table>
          </>
        )}

        {recent.length > 0 && (
          <>
            <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
              Recent innings
            </h2>
            <div className="card divide-y divide-line/60 overflow-hidden">
              {recent.map((b) => (
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
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function matchTime(b: { innings: { match: { matchDate: Date | null; startTime: Date | null } } }): number {
  return (b.innings.match.matchDate ?? b.innings.match.startTime)?.getTime() ?? 0;
}
