import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerAvatar } from "@/components/Crest";
import { Navbar } from "@/components/Navbar";
import { FormatCareer } from "@crickverse/domain";
import { MatchClasses } from "@crickverse/domain";
import { services } from "@/services";

export const dynamic = "force-dynamic";

const n2 = (n: number | null) => (n == null ? "—" : n.toFixed(2));

/** Whole years between an ISO yyyy-mm-dd birth date and today. */
function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

function BioChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-black/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

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
  const intl = fc.isInternational;
  return (
    <td className="whitespace-nowrap px-3 py-2.5 text-left font-medium">
      <span className="inline-flex items-center gap-2">
        {intl && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
        {fc.label}
      </span>
    </td>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2.5 text-right font-mono tabular-nums">{children}</td>;
}

/** A small source/era pill shown beside a section heading. */
function SourceBadge({ tone, children }: { tone: "complete" | "sample"; children: ReactNode }) {
  const cls =
    tone === "complete"
      ? "border-accent/40 bg-accent/10 text-accent"
      : "border-line bg-black/[0.03] text-muted";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  );
}

function SectionHeading({ children, badge }: { children: ReactNode; badge?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{children}</h2>
      {badge}
    </div>
  );
}

function BattingTable({ rows, heading, badge }: { rows: FormatCareer[]; heading: string; badge?: ReactNode }) {
  if (rows.length === 0) return null;
  return (
    <>
      <SectionHeading badge={badge}>{heading}</SectionHeading>
      <Table head={["Format", "M", "Inns", "NO", "Runs", "HS", "Avg", "SR", "100", "50", "0", "4s", "6s"]}>
        {rows.map((c) => (
          <tr key={c.matchClass} className="transition-colors hover:bg-black/[0.03]">
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
  );
}

function BowlingTable({ rows, heading, badge }: { rows: FormatCareer[]; heading: string; badge?: ReactNode }) {
  if (rows.length === 0) return null;
  return (
    <>
      <SectionHeading badge={badge}>{heading}</SectionHeading>
      <Table head={["Format", "M", "Inns", "Balls", "Runs", "Wkts", "BBI", "Avg", "Econ", "SR", "5w"]}>
        {rows.map((c) => (
          <tr key={c.matchClass} className="transition-colors hover:bg-black/[0.03]">
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
  );
}

function fmtDate(d: string | null | undefined): string {
  return d || "unknown";
}

/** Year portion of an ISO date, for compact span labels. */
function yearOf(d: string | null): string | null {
  return d ? d.slice(0, 4) : null;
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Prefer the gold (full-corpus) record, keyed by Cricsheet id. Fall back to the
  // canonical Player (cuid) so existing match-scorecard links still resolve.
  const gold = await services.players.careerPlayer(id);
  const canonical = gold ? null : await services.players.canonicalPlayer(id);
  if (!gold && !canonical) notFound();

  // Enrichment (photo + bio) is keyed by Cricsheet id — only meaningful on the gold path.
  const profile = gold ? await services.players.profile(id) : null;

  const name = gold ? gold.name : canonical!.fullName;
  const genderLabel = gold?.genderLabel ?? null;
  const subtitle = gold
    ? [profile?.role, profile?.birthPlace, genderLabel].filter(Boolean).join(" · ") || "Player"
    : [canonical!.country, canonical!.role, canonical!.battingStyle].filter(Boolean).join(" · ") ||
      "Player";
  const age = ageFromDob(profile?.dateOfBirth);
  const bio: { label: string; value: string }[] = [];
  if (profile?.dateOfBirth)
    bio.push({ label: "Born", value: age != null ? `${profile.dateOfBirth} (age ${age})` : profile.dateOfBirth });
  if (profile?.birthPlace) bio.push({ label: "Birthplace", value: profile.birthPlace });
  if (profile?.role) bio.push({ label: "Role", value: profile.role });
  if (profile?.battingStyle) bio.push({ label: "Batting", value: profile.battingStyle });
  if (profile?.bowlingStyle) bio.push({ label: "Bowling", value: profile.bowlingStyle });

  // Cricsheet ball-by-ball career lines (the analytical sample, ~2002→).
  const sampleByClass: FormatCareer[] = gold ? gold.byFormat() : canonical!.careerByClass();
  const sampleBatting = sampleByClass.filter((c) => c.hasBatting);
  const sampleBowling = sampleByClass.filter((c) => c.hasBowling);

  // Complete career from the per-innings Statsguru recovery (spans the whole
  // career incl. pre-2000). Presented as the headline when available.
  const statsguru = gold ? gold.statsguruCareer() : null;
  const completeByClass = statsguru ? statsguru.byFormat() : [];
  const completeBatting = completeByClass.filter((c) => c.hasBatting);
  const completeBowling = completeByClass.filter((c) => c.hasBowling);
  const span = statsguru?.span ?? { first: null, last: null };
  const spanLabel = [yearOf(span.first), yearOf(span.last)].filter(Boolean).join("–");

  // Headline totals come from the complete career when recovered, else the sample.
  const headlineLines = statsguru ? completeByClass : sampleByClass;
  const { matches: totalMatches, runs: totalRuns, wickets: totalWkts } = FormatCareer.totals(headlineLines);

  const formatRows = gold
    ? sampleByClass.map((c) => ({
        career: c,
        coverage: gold.coverageFor(c.matchClass),
        official: gold.officialFor(c.matchClass),
      }))
    : [];
  const coverageRows = formatRows.filter((r) => r.coverage);
  const officialRows = formatRows.filter((r) => r.official);

  // Recent innings: prefer the complete Statsguru list (works on the gold path);
  // otherwise the canonical scorecard-linked innings.
  const sgRecent = statsguru ? statsguru.recentBatting(15) : [];
  const recent = canonical ? canonical.recentBatting(12) : [];

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="card mt-10 p-6 sm:p-8">
          <Link href="/players" className="text-xs text-muted transition-colors hover:text-fg">
            ← All players
          </Link>
          <div className="mt-3 flex items-center gap-4">
            <PlayerAvatar name={name} src={profile?.photoUrl} size={88} />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
              <p className="mt-1 text-sm text-muted">{subtitle}</p>
              <p className="mt-3 font-mono text-sm tabular-nums text-muted">
                {totalMatches} matches · <span className="text-fg">{totalRuns.toLocaleString()}</span> runs ·{" "}
                <span className="text-fg">{totalWkts}</span> wickets
                {statsguru && spanLabel ? <span className="text-muted"> · {spanLabel}</span> : null}
              </p>
            </div>
          </div>

          {bio.length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {bio.map((b) => (
                <BioChip key={b.label} label={b.label} value={b.value} />
              ))}
            </div>
          )}

          {profile?.photoUrl && (
            <p className="mt-4 text-[11px] text-muted">
              Photo:{" "}
              <a
                href={profile.photoFilePage ?? profile.photoUrl}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-fg"
              >
                {profile.photoCredit || "Wikimedia Commons"}
              </a>
              {profile.photoLicense ? ` · ${profile.photoLicense}` : ""}
            </p>
          )}
        </section>

        {/* Complete career — aggregated from the per-innings Statsguru recovery. */}
        {statsguru && (
          <>
            <p className="mt-6 rounded-lg border border-accent/30 bg-accent/[0.06] px-4 py-2.5 text-xs text-fg">
              <span className="font-medium">Complete career.</span> Totals below are the player&apos;s full
              international record{spanLabel ? ` (${spanLabel})` : ""}, including pre-2000 matches, recovered
              innings-by-innings from ESPNcricinfo Statsguru. Ball-by-ball deliveries do not exist for matches
              before ~1996, so these are scorecard-level figures.
            </p>
            <BattingTable
              rows={completeBatting}
              heading="Batting — complete career"
              badge={<SourceBadge tone="complete">Statsguru{spanLabel ? ` · ${spanLabel}` : ""}</SourceBadge>}
            />
            <BowlingTable
              rows={completeBowling}
              heading="Bowling — complete career"
              badge={<SourceBadge tone="complete">Statsguru{spanLabel ? ` · ${spanLabel}` : ""}</SourceBadge>}
            />
          </>
        )}

        {officialRows.length > 0 && (
          <>
            <SectionHeading>Official totals</SectionHeading>
            <Table head={["Format", "Source", "M", "Runs", "Wkts", "Bat Avg", "Bowl Avg"]}>
              {officialRows.map(({ career, official }) => (
                <tr key={`${career.matchClass}-${official!.source}`} className="transition-colors hover:bg-black/[0.03]">
                  <FormatCell fc={career} />
                  <td className="px-3 py-2.5 text-right text-xs text-muted">
                    {official!.sourceUrl ? (
                      <a href={official!.sourceUrl} target="_blank" rel="noreferrer" className="underline hover:text-fg">
                        {official!.source}
                      </a>
                    ) : (
                      official!.source
                    )}
                  </td>
                  <Num>{official!.matches ?? "-"}</Num>
                  <Num>{official!.runs ?? "-"}</Num>
                  <Num>{official!.wickets ?? "-"}</Num>
                  <Num>{n2(official!.battingAvg)}</Num>
                  <Num>{n2(official!.bowlingAvg)}</Num>
                </tr>
              ))}
            </Table>
          </>
        )}

        {/* Cricsheet ball-by-ball sample — the basis for the delivery-level analytics. */}
        {gold && (sampleBatting.length > 0 || sampleBowling.length > 0) && (
          <p className="mt-8 rounded-lg border border-line bg-black/[0.02] px-4 py-2.5 text-xs text-muted">
            <span className="font-medium text-fg">Ball-by-ball analytical sample (Cricsheet).</span> The tables
            below are computed from open ball-by-ball files in the lakehouse (broadly 2002 onward) and power the
            delivery-level charts. They are a sample of the career above, not the complete totals.
          </p>
        )}

        {coverageRows.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {coverageRows.map(({ career, coverage }) => (
              <div key={career.matchClass} className="rounded-lg border border-line bg-white px-3 py-2 text-xs">
                <div className="font-medium text-fg">{career.label}</div>
                <div className="mt-1 text-muted">
                  {coverage!.matchesCovered} covered matches, {fmtDate(coverage!.firstMatchDate)} to{" "}
                  {fmtDate(coverage!.lastMatchDate)}
                </div>
              </div>
            ))}
          </div>
        )}

        <BattingTable
          rows={sampleBatting}
          heading={statsguru ? "Batting — ball-by-ball sample" : "Batting by format"}
          badge={statsguru ? <SourceBadge tone="sample">Cricsheet</SourceBadge> : undefined}
        />
        <BowlingTable
          rows={sampleBowling}
          heading={statsguru ? "Bowling — ball-by-ball sample" : "Bowling by format"}
          badge={statsguru ? <SourceBadge tone="sample">Cricsheet</SourceBadge> : undefined}
        />

        {sgRecent.length > 0 ? (
          <>
            <SectionHeading badge={<SourceBadge tone="complete">Statsguru</SourceBadge>}>
              Recent innings
            </SectionHeading>
            <div className="card divide-y divide-line/60 overflow-hidden">
              {sgRecent.map((b, i) => (
                <div
                  key={`${b.date ?? ""}-${b.opposition ?? ""}-${i}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <span className="truncate text-muted">
                    {MatchClasses.label(b.matchClass)} v {b.opposition ?? "—"}
                    {b.date ? <span className="text-muted/70"> · {b.date}</span> : null}
                  </span>
                  <span className="font-mono tabular-nums">
                    {b.runs}
                    {b.notOut ? "*" : ""} <span className="text-muted">({b.balls ?? "—"})</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          recent.length > 0 && (
            <>
              <SectionHeading>Recent innings</SectionHeading>
              <div className="card divide-y divide-line/60 overflow-hidden">
                {recent.map((b) => (
                  <Link
                    key={b.id}
                    href={`/matches/${b.innings.match.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-black/[0.03]"
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
          )
        )}
      </main>
    </>
  );
}
