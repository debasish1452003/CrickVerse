import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { extractNextData, getByPaths, pickUserAgent, scorecardDescriptor } from "@crickverse/scraper-core";
import type { ParsedScorecard } from "@crickverse/types";
import { prisma } from "@crickverse/db";
import { createLogger } from "../logger";

const RECOVERY_ROOT = resolve(process.cwd(), "..", "..", "data", "recovery", "cricinfo");
const PARSER_VERSION = "cricinfo-historical-v1";
const SOURCE = "CRICINFO_HISTORICAL";

const FORMAT_CLASS: Record<string, number> = {
  TEST: 1,
  ODI: 2,
  T20I: 3,
};

export interface HistoricalCandidate {
  source: typeof SOURCE;
  sourceUrl: string | null;
  externalId: string;
  matchClass: string;
  matchDate: string | null;
  teams: string | null;
  teamHome: string | null;
  teamAway: string | null;
  status: "DISCOVERED" | "NEEDS_URL" | "FETCHED" | "PARSED" | "FAILED" | "SKIPPED";
  reason?: string;
}

export interface HistoricalManifest {
  source: typeof SOURCE;
  createdAt: string;
  discovery: Record<string, unknown>;
  candidates: HistoricalCandidate[];
}

export interface DiscoverInput {
  fromCricsheetMissing?: boolean;
  format?: string;
  fromYear?: number;
  toYear?: number;
  seedUrl?: string;
  wikipediaTitle?: string;
  outDir?: string;
  dryRun?: boolean;
}

export interface DiscoverResult {
  candidates: number;
  withUrls: number;
  manifestPath: string | null;
}

export interface SyncInput {
  manifest: string;
  limit?: number;
  delayMs?: number;
  dryRun?: boolean;
}

export interface SyncResult {
  read: number;
  fetched: number;
  parsed: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
}

export async function discoverCricinfoHistorical(input: DiscoverInput): Promise<DiscoverResult> {
  const logger = createLogger("cricinfo-historical-discover");
  const candidates: HistoricalCandidate[] = [];

  if (input.fromCricsheetMissing) {
    const gaps = await prisma.coverageGap.findMany({
      where: { source: "CRICSHEET_MISSING" },
      orderBy: [{ matchDate: "asc" }, { teams: "asc" }],
      select: { id: true, matchClass: true, matchDate: true, teams: true, teamHome: true, teamAway: true },
    });
    for (const gap of gaps) {
      candidates.push({
        source: SOURCE,
        sourceUrl: null,
        externalId: `cricsheet-missing-${gap.id}`,
        matchClass: gap.matchClass,
        matchDate: gap.matchDate,
        teams: gap.teams,
        teamHome: gap.teamHome,
        teamAway: gap.teamAway,
        status: "NEEDS_URL",
        reason: "Cricsheet missing list does not include ESPNCricinfo scorecard id.",
      });
    }
  }

  if (input.format && input.fromYear && input.toYear) {
    const format = input.format.toUpperCase();
    const classId = FORMAT_CLASS[format];
    if (!classId) throw new Error(`Unsupported discovery format ${input.format}; expected TEST, ODI, or T20I`);
    for (let year = input.fromYear; year <= input.toYear; year += 1) {
      const yearCandidates = await discoverYear(format, classId, year, logger);
      candidates.push(...yearCandidates);
    }
  }

  if (input.seedUrl) {
    const format = input.format?.toUpperCase() ?? "OTHER";
    const seedCandidates = await discoverSeedUrl(input.seedUrl, format, logger);
    candidates.push(...seedCandidates);
  }

  if (input.wikipediaTitle) {
    const format = input.format?.toUpperCase() ?? "OTHER";
    const seedCandidates = await discoverWikipediaTitle(input.wikipediaTitle, format, logger);
    candidates.push(...seedCandidates);
  }

  const deduped = dedupeCandidates(candidates);
  const manifest: HistoricalManifest = {
    source: SOURCE,
    createdAt: new Date().toISOString(),
    discovery: {
      fromCricsheetMissing: input.fromCricsheetMissing ?? false,
      format: input.format ?? null,
      fromYear: input.fromYear ?? null,
      toYear: input.toYear ?? null,
      seedUrl: input.seedUrl ?? null,
      wikipediaTitle: input.wikipediaTitle ?? null,
    },
    candidates: deduped,
  };

  const manifestPath = input.dryRun ? null : writeManifest(manifest, input.outDir);
  logger.info("historical discovery complete", {
    candidates: deduped.length,
    withUrls: deduped.filter((c) => c.sourceUrl).length,
    manifestPath,
  });
  return { candidates: deduped.length, withUrls: deduped.filter((c) => c.sourceUrl).length, manifestPath };
}

export async function syncCricinfoHistorical(input: SyncInput): Promise<SyncResult> {
  const logger = createLogger("cricinfo-historical-sync");
  const manifest = JSON.parse(readFileSync(input.manifest, "utf8")) as HistoricalManifest;
  const candidates = manifest.candidates.filter((c) => c.sourceUrl).slice(0, input.limit ?? undefined);
  const delayMs = input.delayMs ?? 3000;
  const runDir = join(RECOVERY_ROOT, "runs", safeName(new Date().toISOString()));
  const failures: Array<{ candidate: HistoricalCandidate; error: string }> = [];

  let fetched = 0;
  let parsed = 0;
  let skipped = 0;

  const sourceImport = input.dryRun
    ? null
    : await prisma.sourceImport.create({
        data: {
          source: SOURCE,
          kind: "HISTORICAL_SCORECARD_SCRAPE",
          filePath: resolve(input.manifest),
          notes: "Public ESPNcricinfo historical recovery run; raw responses cached locally.",
          rowsRead: candidates.length,
          coverage: { parserVersion: PARSER_VERSION },
        },
      });

  for (const candidate of candidates) {
    try {
      if (!candidate.sourceUrl) {
        skipped += 1;
        continue;
      }
      if (isBlockedUrl(candidate.sourceUrl)) {
        skipped += 1;
        continue;
      }

      const raw = await fetchCached(candidate, delayMs);
      fetched += raw.fromCache ? 0 : 1;
      if (input.dryRun) continue;

      const parsedScorecard = parseScorecard(raw.html, candidate);
      await upsertHistoricalScorecard(candidate, parsedScorecard, sourceImport!.id, raw);
      parsed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ candidate, error: message });
      logger.warn("historical candidate failed", { externalId: candidate.externalId, message });
      if (message.includes("HTTP 403") || message.includes("HTTP 429") || message.includes("captcha")) break;
    }
  }

  if (!input.dryRun && sourceImport) {
    await prisma.sourceImport.update({
      where: { id: sourceImport.id },
      data: {
        rowsImported: parsed,
        coverage: { parserVersion: PARSER_VERSION, fetched, parsed, failed: failures.length, skipped },
      },
    });
    if (failures.length) writeJson(join(runDir, "failures.json"), failures);
  }

  logger.info("historical sync complete", { read: candidates.length, fetched, parsed, failed: failures.length, skipped });
  return { read: candidates.length, fetched, parsed, failed: failures.length, skipped, dryRun: input.dryRun ?? false };
}

async function discoverYear(format: string, classId: number, year: number, logger: ReturnType<typeof createLogger>): Promise<HistoricalCandidate[]> {
  const url = `https://stats.espncricinfo.com/ci/engine/records/team/match_results.html?class=${classId};id=${year};type=year`;
  try {
    const html = await politeFetchText(url, 3000);
    const candidates = parseScorecardLinks(html, format);
    logger.info("year discovery", { year, format, candidates: candidates.length });
    return candidates;
  } catch (err) {
    logger.warn("year discovery failed", { year, format, message: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function discoverSeedUrl(seedUrl: string, matchClass: string, logger: ReturnType<typeof createLogger>): Promise<HistoricalCandidate[]> {
  try {
    const html = await politeFetchText(seedUrl, 1000);
    const candidates = parseScorecardLinks(html, matchClass);
    logger.info("seed-url discovery", { seedUrl, matchClass, candidates: candidates.length });
    return candidates.map((c) => ({ ...c, reason: `Discovered from ${seedUrl}` }));
  } catch (err) {
    logger.warn("seed-url discovery failed", { seedUrl, matchClass, message: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function discoverWikipediaTitle(title: string, matchClass: string, logger: ReturnType<typeof createLogger>): Promise<HistoricalCandidate[]> {
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/html/${encoded}`;
  try {
    const html = await politeFetchText(url, 1000);
    const candidates = parseScorecardLinks(html, matchClass);
    logger.info("wikipedia-title discovery", { title, matchClass, candidates: candidates.length });
    return candidates.map((c) => ({ ...c, reason: `Discovered from Wikipedia:${title}` }));
  } catch (err) {
    logger.warn("wikipedia-title discovery failed", { title, matchClass, message: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

function parseScorecardLinks(html: string, matchClass: string): HistoricalCandidate[] {
  const out: HistoricalCandidate[] = [];
  const seen = new Set<string>();
  const linkRe = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const href = decodeHtml(m[1] ?? "");
    const text = stripTags(decodeHtml(m[2] ?? ""));
    if (!/scorecard|full-scorecard/i.test(href) && !/scorecard/i.test(text)) continue;
    const url = href.startsWith("http") ? href : `https://www.espncricinfo.com${href}`;
    const externalId = matchIdFromUrl(url);
    if (!externalId || seen.has(externalId)) continue;
    seen.add(externalId);
    out.push({
      source: SOURCE,
      sourceUrl: url.replace(/^http:\/\//i, "https://"),
      externalId,
      matchClass,
      matchDate: null,
      teams: null,
      teamHome: null,
      teamAway: null,
      status: "DISCOVERED",
    });
  }
  return out;
}

function parseScorecard(html: string, candidate: HistoricalCandidate): ParsedScorecard {
  const next = extractNextData(html, candidate.sourceUrl ?? candidate.externalId);
  const content = getByPaths(next, scorecardDescriptor.extractPaths);
  if (content == null) throw new Error("ESPNcricinfo scorecard content path missing");
  const parsed = scorecardDescriptor.parse(content, {
    seriesSlug: "historical",
    seriesId: 0,
    matchSlug: "historical",
    matchId: candidate.externalId,
  });
  return scorecardDescriptor.validate(parsed);
}

async function upsertHistoricalScorecard(
  candidate: HistoricalCandidate,
  scorecard: ParsedScorecard,
  sourceImportId: string,
  raw: { checksum: string; htmlPath: string },
): Promise<void> {
  const teams = splitTeams(candidate.teams, candidate.teamHome, candidate.teamAway);
  const created = await prisma.historicalScorecard.upsert({
    where: { source_externalId: { source: SOURCE, externalId: candidate.externalId } },
    create: {
      source: SOURCE,
      sourceImportId,
      externalId: candidate.externalId,
      matchClass: candidate.matchClass,
      matchDate: candidate.matchDate,
      teamHome: teams.teamHome,
      teamAway: teams.teamAway,
      sourceUrl: candidate.sourceUrl,
      result: `raw=${raw.htmlPath}; sha256=${raw.checksum}`,
    },
    update: {
      sourceImportId,
      matchClass: candidate.matchClass,
      matchDate: candidate.matchDate,
      teamHome: teams.teamHome,
      teamAway: teams.teamAway,
      sourceUrl: candidate.sourceUrl,
      result: `raw=${raw.htmlPath}; sha256=${raw.checksum}`,
      importedAt: new Date(),
    },
  });

  await prisma.$transaction([
    prisma.historicalBattingLine.deleteMany({ where: { scorecardId: created.id } }),
    prisma.historicalBowlingLine.deleteMany({ where: { scorecardId: created.id } }),
  ]);

  const batting = scorecard.innings.flatMap((inn) =>
    inn.batting.map((b, i) => ({
      scorecardId: created.id,
      inningsNo: inn.inningsNo,
      sourcePlayerId: b.sourcePlayerId == null ? null : String(b.sourcePlayerId),
      playerName: b.name ?? "Unknown",
      battingPos: i + 1,
      runs: b.runs,
      balls: b.balls,
      fours: b.fours,
      sixes: b.sixes,
      dismissal: b.dismissalText,
    })),
  );
  const bowling = scorecard.innings.flatMap((inn) =>
    inn.bowling.map((b, i) => ({
      scorecardId: created.id,
      inningsNo: inn.inningsNo,
      sourcePlayerId: b.sourcePlayerId == null ? null : String(b.sourcePlayerId),
      playerName: b.name ?? "Unknown",
      bowlingPos: i + 1,
      balls: b.balls ?? ballsFromOvers(b.overs),
      maidens: b.maidens,
      runs: b.runs,
      wickets: b.wickets,
      economy: b.economy,
    })),
  );

  if (batting.length) await prisma.historicalBattingLine.createMany({ data: batting });
  if (bowling.length) await prisma.historicalBowlingLine.createMany({ data: bowling });
}

async function fetchCached(candidate: HistoricalCandidate, delayMs: number): Promise<{ html: string; htmlPath: string; checksum: string; fromCache: boolean }> {
  const externalId = safeName(candidate.externalId);
  const htmlPath = join(RECOVERY_ROOT, "raw", `${externalId}.html`);
  if (existsSync(htmlPath)) {
    const html = readFileSync(htmlPath, "utf8");
    return { html, htmlPath, checksum: sha256(html), fromCache: true };
  }
  if (!candidate.sourceUrl) throw new Error("candidate has no sourceUrl");
  const html = await fetchWithAlternates(candidate, delayMs);
  writeText(htmlPath, html);
  const meta = {
    candidate,
    fetchedAt: new Date().toISOString(),
    parserVersion: PARSER_VERSION,
    checksum: sha256(html),
  };
  writeJson(join(RECOVERY_ROOT, "raw", `${externalId}.json`), meta);
  return { html, htmlPath, checksum: meta.checksum, fromCache: false };
}

async function fetchWithAlternates(candidate: HistoricalCandidate, delayMs: number): Promise<string> {
  const urls = candidateUrls(candidate);
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      return await politeFetchText(url, delayMs);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      lastError = e;
      if (!/HTTP 404/.test(e.message)) throw e;
    }
  }
  throw lastError ?? new Error("No candidate URLs to fetch");
}

function candidateUrls(candidate: HistoricalCandidate): string[] {
  const urls = new Set<string>();
  if (candidate.sourceUrl) {
    urls.add(candidate.sourceUrl);
    urls.add(candidate.sourceUrl.replace("/full-scorecard/", "/scorecard/"));
  }
  if (/^\d+$/.test(candidate.externalId)) {
    urls.add(`https://www.espncricinfo.com/ci/engine/match/${candidate.externalId}.html`);
  }
  return [...urls];
}

async function politeFetchText(url: string, delayMs: number): Promise<string> {
  await sleep(delayMs);
  const res = await fetch(url, {
    headers: {
      "User-Agent": pickUserAgent(),
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Cache-Control": "max-age=0",
      Referer: "https://www.google.com/",
    },
  });
  if (res.status === 403 || res.status === 429) throw new Error(`HTTP ${res.status}; stopping polite scraper`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (/captcha|verify you are human|access denied/i.test(html)) throw new Error("captcha or access-denied page detected");
  return html;
}

function writeManifest(manifest: HistoricalManifest, outDir = join(RECOVERY_ROOT, "manifests")): string {
  const name = `manifest-${safeName(new Date().toISOString())}.json`;
  const path = join(outDir, name);
  writeJson(path, manifest);
  return path;
}

function writeJson(path: string, value: unknown): void {
  writeText(path, JSON.stringify(value, null, 2));
}

function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
}

function dedupeCandidates(candidates: HistoricalCandidate[]): HistoricalCandidate[] {
  const byKey = new Map<string, HistoricalCandidate>();
  for (const c of candidates) {
    const key = c.sourceUrl ? `url:${c.sourceUrl}` : `id:${c.externalId}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  return [...byKey.values()];
}

function matchIdFromUrl(url: string): string | null {
  const m = url.match(/(?:scorecard|full-scorecard)[/-][^/-]*-?(\d{5,})|-(\d{5,})(?:\/full-scorecard|\/scorecard|$)/i);
  return m?.[1] ?? m?.[2] ?? null;
}

function splitTeams(teams: string | null, teamHome: string | null, teamAway: string | null): { teamHome: string; teamAway: string } {
  if (teamHome && teamAway) return { teamHome, teamAway };
  const parts = teams?.split(/\s+vs\s+/i).map((p) => p.trim()).filter(Boolean) ?? [];
  return { teamHome: parts[0] ?? teamHome ?? "Unknown", teamAway: parts[1] ?? teamAway ?? "Unknown" };
}

function ballsFromOvers(overs: string | null): number | null {
  if (!overs) return null;
  const [whole, balls = "0"] = overs.split(".");
  const w = Number(whole);
  const b = Number(balls);
  return Number.isFinite(w) && Number.isFinite(b) ? w * 6 + b : null;
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function isBlockedUrl(url: string): boolean {
  return !/^https:\/\/(www\.)?espncricinfo\.com\//i.test(url);
}
