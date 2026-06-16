import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pickUserAgent } from "@crickverse/scraper-core";
import { prisma } from "@crickverse/db";
import { createLogger } from "../logger";

const RECOVERY_ROOT = resolve(process.cwd(), "..", "..", "data", "recovery", "statsguru");
const SOURCE = "CRICINFO_STATSGURU";
const PARSER_VERSION = "statsguru-print-v1";

// Statsguru "class" id per international format. Women add 7 (8/9/10); we derive
// that from CareerPlayer.gender. Franchise/domestic classes aren't exposed here —
// this recovery is intentionally international-only (where pre-Cricsheet careers
// matter most), so the matchClass label is always TEST/ODI/T20I.
const CLASS_ID: Record<string, number> = { TEST: 1, ODI: 2, T20I: 3 };
const DISCIPLINES = ["batting", "bowling"] as const;
type Discipline = (typeof DISCIPLINES)[number];

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export interface RecoverPlayerCareersInput {
  limit?: number;
  delayMs?: number;
  force?: boolean;
  dryRun?: boolean;
  /** Restrict to one ESPNcricinfo id (debug / single-player backfill). */
  cricinfoId?: string;
  /** Players processed in parallel (default 1). Raise for a fast bulk sweep. */
  concurrency?: number;
  /** Skip players with no international evidence (Cricsheet TEST/ODI/T20I stat or
   *  bulk innings) — they return ~0 and only waste requests. Default false. */
  internationalOnly?: boolean;
  /** Split the queue across machines: this machine handles candidates whose
   *  position mod `total` equals `index`. Run `0/2` on one PC and `1/2` on
   *  another (different IPs) for ~2× throughput with zero overlap. */
  shard?: { index: number; total: number };
}

export interface RecoverPlayerCareersResult {
  candidates: number;
  playersProcessed: number;
  requests: number;
  inningsImported: number;
  failed: number;
  stoppedEarly: boolean;
  dryRun: boolean;
}

interface InningsRow {
  matchClass: string;
  sourceUrl: string | null;
  discipline: Discipline;
  matchDate: string | null;
  rawDate: string | null;
  opposition: string | null;
  ground: string | null;
  inningsNo: number | null;
  didBat: boolean;
  runs: number | null;
  notOut: boolean;
  minutes: number | null;
  ballsFaced: number | null;
  fours: number | null;
  sixes: number | null;
  strikeRate: number | null;
  battingPos: number | null;
  dismissal: string | null;
  oversText: string | null;
  ballsBowled: number | null;
  maidens: number | null;
  runsConceded: number | null;
  wickets: number | null;
  economy: number | null;
  bowlingPos: number | null;
}

/**
 * Drip-feed recovery of per-player innings-by-innings career history from the
 * ESPNcricinfo Statsguru "print" endpoint. ONE request returns a player's whole
 * career for a (format, discipline) — including the pre-2002 years absent from
 * Cricsheet — so the request volume is tiny vs. scraping match pages. Intended to
 * run daily with a small `--limit` (residential IP, Windows Task Scheduler).
 *
 * Idempotent: raw HTML is cached on disk; each (player, format, discipline) is
 * delete-then-inserted so re-runs converge. Stops the whole run on the first
 * 403/429/captcha so a bad day costs nothing and leaves the queue intact.
 */
export async function recoverPlayerCareers(
  input: RecoverPlayerCareersInput = {},
): Promise<RecoverPlayerCareersResult> {
  const logger = createLogger("recover-player-careers");
  const delayMs = input.delayMs ?? 4000;

  const candidates = await selectCandidates(input);
  const result: RecoverPlayerCareersResult = {
    candidates: candidates.length,
    playersProcessed: 0,
    requests: 0,
    inningsImported: 0,
    failed: 0,
    stoppedEarly: false,
    dryRun: input.dryRun ?? false,
  };
  logger.info("starting", { candidates: candidates.length, limit: input.limit ?? null, dryRun: result.dryRun });
  if (candidates.length === 0) return result;

  const sourceImport = input.dryRun
    ? null
    : await prisma.sourceImport.create({
        data: {
          source: SOURCE,
          kind: "PLAYER_INNINGS_HISTORY",
          sourceUrl: "https://stats.espncricinfo.com/ci/engine/player/",
          license: "ESPNcricinfo Statsguru print export; low-volume personal-use recovery.",
          notes: "Per-player innings-by-innings recovery (drip). Raw responses cached locally.",
          rowsRead: candidates.length,
          coverage: { parserVersion: PARSER_VERSION },
        },
      });

  // Process players through a small concurrency pool. Each player's fetches are
  // independent and individually rate-limited (delayMs + backoff in politeFetch),
  // so N players in parallel raise throughput ~N× while staying polite per request.
  const concurrency = Math.max(1, input.concurrency ?? 1);
  // Stop the whole run only after many consecutive blocks (IP likely banned);
  // isolated 429s are absorbed by the per-request backoff instead.
  const BLOCK_STOP_THRESHOLD = 12;
  let stop = false;
  let consecutiveBlocks = 0;
  let nextIndex = 0;

  async function processPlayer(player: { cricinfoId: string; name: string; gender: string | null }): Promise<void> {
    const female = (player.gender ?? "").toLowerCase().startsWith("f");
    const rowsForPlayer: InningsRow[] = [];

    for (const matchClass of Object.keys(CLASS_ID)) {
      for (const discipline of DISCIPLINES) {
        if (stop) return;
        try {
          const { html, fromCache, url } = await fetchCached(player.cricinfoId, matchClass, discipline, female, delayMs);
          if (!fromCache) result.requests += 1;
          consecutiveBlocks = 0; // any success clears the block streak
          if (input.dryRun) continue;
          const parsed = parseInningsTable(html, discipline);
          for (const row of parsed) rowsForPlayer.push({ ...row, matchClass, sourceUrl: url });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.failed += 1;
          logger.warn("fetch/parse failed", { cricinfoId: player.cricinfoId, matchClass, discipline, message });
          if (/HTTP 403|HTTP 429|captcha/i.test(message)) {
            consecutiveBlocks += 1;
            if (consecutiveBlocks >= BLOCK_STOP_THRESHOLD) {
              stop = true;
              result.stoppedEarly = true;
              logger.warn("persistent block signal — stopping run, queue left intact", { consecutiveBlocks });
              return;
            }
          }
        }
      }
    }

    if (!input.dryRun && rowsForPlayer.length) {
      const imported = await writePlayerInnings(player.cricinfoId, rowsForPlayer, sourceImport?.id ?? null);
      result.inningsImported += imported;
    }
    result.playersProcessed += 1;
    logger.info("player done", {
      cricinfoId: player.cricinfoId,
      name: player.name,
      innings: rowsForPlayer.length,
      progress: `${result.playersProcessed}/${candidates.length}`,
    });
  }

  async function worker(): Promise<void> {
    while (!stop) {
      const i = nextIndex++;
      if (i >= candidates.length) return;
      await processPlayer(candidates[i]!);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (sourceImport) {
    await prisma.sourceImport.update({
      where: { id: sourceImport.id },
      data: {
        rowsImported: result.inningsImported,
        coverage: {
          parserVersion: PARSER_VERSION,
          playersProcessed: result.playersProcessed,
          requests: result.requests,
          failed: result.failed,
          stoppedEarly: result.stoppedEarly,
        },
      },
    });
  }

  logger.info("✅ recovery run complete", result);
  return result;
}

/**
 * Queue = gold players with an ESPNcricinfo id, most-prominent first (so famous
 * old-era careers like Tendulkar land early), skipping anyone already recovered
 * unless `--force`. Over repeated drip runs this drains the whole roster.
 */
async function selectCandidates(
  input: RecoverPlayerCareersInput,
): Promise<Array<{ cricinfoId: string; name: string; gender: string | null }>> {
  if (input.cricinfoId) {
    const one = await prisma.careerPlayer.findFirst({
      where: { cricinfoId: input.cricinfoId },
      select: { cricinfoId: true, name: true, gender: true },
    });
    return one?.cricinfoId ? [{ cricinfoId: one.cricinfoId, name: one.name, gender: one.gender }] : [];
  }

  const players = await prisma.careerPlayer.findMany({
    where: { cricinfoId: { not: null } },
    select: { cricsheetId: true, cricinfoId: true, name: true, gender: true, careerRuns: true },
  });

  // Priority must NOT be Cricsheet careerRuns alone: retired legends (Lara,
  // Jayasuriya, S Waugh) have tiny Cricsheet totals because their careers predate
  // the ball-by-ball corpus, so that ordering buries exactly the players who most
  // need recovery. Rank by the BEST available run signal instead — the bulk
  // batting total where known (spans pre-2000), else Cricsheet — so the all-time
  // greats are scraped first.
  const bulkSums = await prisma.playerInningsHistory.groupBy({
    by: ["cricinfoId"],
    where: { source: "CRICINFO_BULK", discipline: "batting", didBat: true, runs: { not: null } },
    _sum: { runs: true },
  });
  const bulkByPlayer = new Map(bulkSums.map((b) => [b.cricinfoId, b._sum.runs ?? 0]));
  const priority = (p: { cricinfoId: string | null; careerRuns: number }): number =>
    Math.max(p.careerRuns, bulkByPlayer.get(p.cricinfoId ?? "") ?? 0);

  let pending = players;
  if (!input.force) {
    // "Done" = scraped (this SOURCE) only. Players holding ONLY bulk-imported
    // rows (CRICINFO_BULK) are still pending — the scrape supersedes the partial
    // bulk data with a complete, all-discipline career.
    const done = await prisma.playerInningsHistory.groupBy({ by: ["cricinfoId"], where: { source: SOURCE } });
    const doneSet = new Set(done.map((d) => d.cricinfoId));
    pending = players.filter((p) => !doneSet.has(p.cricinfoId!));
  }

  if (input.internationalOnly) {
    // Skip players with no international footprint — a Cricsheet TEST/ODI/T20I
    // career line or any bulk innings (the bulk dump is internationals-only).
    // These otherwise cost 6 requests each to return nothing.
    const [intlStats, bulkPlayers] = await Promise.all([
      prisma.careerStat.findMany({
        where: { matchClass: { in: ["TEST", "ODI", "T20I"] } },
        select: { cricsheetId: true },
      }),
      prisma.playerInningsHistory.groupBy({ by: ["cricinfoId"], where: { source: "CRICINFO_BULK" } }),
    ]);
    const intlByCricsheet = new Set(intlStats.map((s) => s.cricsheetId));
    const bulkSet = new Set(bulkPlayers.map((b) => b.cricinfoId));
    pending = pending.filter(
      (p) => intlByCricsheet.has(p.cricsheetId) || bulkSet.has(p.cricinfoId ?? ""),
    );
  }

  pending = pending.sort((a, b) => priority(b) - priority(a));

  // Multi-machine sharding: each machine takes a strided slice of the SAME ordered
  // queue, so the slices are disjoint (no two machines fetch the same player) yet
  // both still drain legends-first. e.g. 0/2 + 1/2 across two PCs/IPs.
  if (input.shard && input.shard.total > 1) {
    const { index, total } = input.shard;
    pending = pending.filter((_, i) => i % total === index);
  }

  if (input.limit) pending = pending.slice(0, input.limit);
  return pending.map((p) => ({ cricinfoId: p.cricinfoId!, name: p.name, gender: p.gender }));
}

async function writePlayerInnings(
  cricinfoId: string,
  rows: InningsRow[],
  sourceImportId: string | null,
): Promise<number> {
  // Delete-then-insert per player so re-runs converge without unique-on-null pitfalls.
  await prisma.playerInningsHistory.deleteMany({ where: { cricinfoId, source: SOURCE } });
  // Supersede any partial bulk import for this player — the full scrape is the
  // complete, authoritative source, so we keep exactly one source per player.
  await prisma.playerInningsHistory.deleteMany({ where: { cricinfoId, source: "CRICINFO_BULK" } });
  const data = rows.map((r) => ({
    cricinfoId,
    matchClass: r.matchClass,
    discipline: r.discipline,
    matchDate: r.matchDate,
    rawDate: r.rawDate,
    opposition: r.opposition,
    ground: r.ground,
    inningsNo: r.inningsNo,
    didBat: r.didBat,
    runs: r.runs,
    notOut: r.notOut,
    minutes: r.minutes,
    ballsFaced: r.ballsFaced,
    fours: r.fours,
    sixes: r.sixes,
    strikeRate: r.strikeRate,
    battingPos: r.battingPos,
    dismissal: r.dismissal,
    oversText: r.oversText,
    ballsBowled: r.ballsBowled,
    maidens: r.maidens,
    runsConceded: r.runsConceded,
    wickets: r.wickets,
    economy: r.economy,
    bowlingPos: r.bowlingPos,
    source: SOURCE,
    sourceUrl: r.sourceUrl,
    sourceImportId: sourceImportId ?? undefined,
  }));
  if (!data.length) return 0;
  const created = await prisma.playerInningsHistory.createMany({ data });
  return created.count;
}

async function fetchCached(
  cricinfoId: string,
  matchClass: string,
  discipline: Discipline,
  female: boolean,
  delayMs: number,
): Promise<{ html: string; fromCache: boolean; url: string }> {
  const classId = CLASS_ID[matchClass]! + (female ? 7 : 0);
  const url =
    `https://stats.espncricinfo.com/ci/engine/player/${cricinfoId}.html` +
    `?class=${classId};template=results;type=${discipline};view=innings;wrappertype=print`;
  const cachePath = join(RECOVERY_ROOT, "raw", `${cricinfoId}-${matchClass}-${discipline}.html`);
  if (existsSync(cachePath)) {
    return { html: readFileSync(cachePath, "utf8"), fromCache: true, url };
  }
  const html = await politeFetchText(url, delayMs);
  writeText(cachePath, html);
  writeText(
    join(RECOVERY_ROOT, "raw", `${cricinfoId}-${matchClass}-${discipline}.json`),
    JSON.stringify({ cricinfoId, matchClass, discipline, url, fetchedAt: new Date().toISOString(), checksum: sha256(html) }, null, 2),
  );
  return { html, fromCache: false, url };
}

// Extra waits (ms) applied before retrying a blocked request. The first attempt
// has no extra wait; a 403/429/captcha backs off increasingly before retrying, so
// transient rate-limits self-heal instead of aborting the run.
const BACKOFFS_MS = [0, 15_000, 45_000, 90_000];

async function politeFetchText(url: string, delayMs: number): Promise<string> {
  // Jittered delay so the cadence isn't robotic (±25%).
  const jitter = delayMs * (0.75 + Math.random() * 0.5);
  await sleep(jitter);

  let lastBlock: Error | null = null;
  for (const backoff of BACKOFFS_MS) {
    if (backoff) await sleep(backoff);
    const res = await fetch(url, {
      headers: {
        "User-Agent": pickUserAgent(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        Referer: "https://www.google.com/",
      },
    });
    if (res.status === 403 || res.status === 429) {
      lastBlock = new Error(`HTTP ${res.status}`);
      continue; // back off and retry
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (/captcha|verify you are human|access denied/i.test(html)) {
      lastBlock = new Error("captcha or access-denied page detected");
      continue;
    }
    return html;
  }
  throw lastBlock ?? new Error("fetch failed after retries");
}

/**
 * Parse the innings-by-innings table from a Statsguru print page. The page has a
 * career-summary table and the per-innings table; we pick the one whose header
 * row contains both "Opposition" and "Start Date", then map cells by header name
 * (robust to the column-order differences between batting and bowling views).
 */
type ParsedInnings = Omit<InningsRow, "matchClass" | "sourceUrl">;

function parseInningsTable(html: string, discipline: Discipline): ParsedInnings[] {
  const tables = extractTables(html);
  const table = tables.find(
    (t) => hasHeader(t.headers, "opposition") && hasHeader(t.headers, "start date"),
  );
  if (!table) return [];

  const idx = indexHeaders(table.headers);
  const rows: ParsedInnings[] = [];
  for (const cells of table.rows) {
    const get = (key: string): string | undefined => {
      const i = idx[key];
      return i == null ? undefined : cells[i];
    };
    const opposition = stripVs(get("opposition"));
    const ground = clean(get("ground"));
    const rawDate = clean(get("start date"));
    // Skip section/blank rows that lack any match context.
    if (!opposition && !ground && !rawDate) continue;

    const base = {
      matchDate: parseDate(rawDate),
      rawDate: rawDate ?? null,
      opposition: opposition ?? null,
      ground: ground ?? null,
      inningsNo: int(get("inns")),
    };

    if (discipline === "batting") {
      const runsCell = clean(get("runs"));
      const dnb = isDnb(runsCell);
      const notOut = !!runsCell && /\*/.test(runsCell);
      rows.push({
        discipline,
        ...base,
        didBat: !dnb,
        runs: dnb ? null : int(runsCell?.replace("*", "")),
        notOut,
        minutes: int(get("mins")),
        ballsFaced: int(get("bf")),
        fours: int(get("4s")),
        sixes: int(get("6s")),
        strikeRate: float(get("sr")),
        battingPos: int(get("pos")),
        dismissal: dnb ? clean(runsCell) ?? null : clean(get("dismissal")) ?? null,
        oversText: null, ballsBowled: null, maidens: null, runsConceded: null, wickets: null, economy: null, bowlingPos: null,
      });
    } else {
      const oversText = clean(get("overs"));
      rows.push({
        discipline,
        ...base,
        didBat: false,
        runs: null, notOut: false, minutes: null, ballsFaced: null, fours: null, sixes: null, strikeRate: null, battingPos: null, dismissal: null,
        oversText: oversText ?? null,
        ballsBowled: ballsFromOvers(oversText),
        maidens: int(get("mdns") ?? get("maidens")),
        runsConceded: int(get("runs")),
        wickets: int(get("wkts")),
        economy: float(get("econ")),
        bowlingPos: int(get("pos")),
      });
    }
  }
  return rows;
}

interface RawTable {
  headers: string[];
  rows: string[][];
}

function extractTables(html: string): RawTable[] {
  const out: RawTable[] = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(html))) {
    const inner = tm[1] ?? "";
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let headers: string[] | null = null;
    const rows: string[][] = [];
    let rm: RegExpExecArray | null;
    while ((rm = trRe.exec(inner))) {
      const rowHtml = rm[1] ?? "";
      const ths = cellsOf(rowHtml, "th");
      const tds = cellsOf(rowHtml, "td");
      if (ths.length && !headers) headers = ths;
      else if (tds.length) rows.push(tds);
    }
    if (headers && rows.length) out.push({ headers, rows });
  }
  return out;
}

function cellsOf(rowHtml: string, tag: "td" | "th"): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowHtml))) out.push(stripTags(decodeHtml(m[1] ?? "")));
  return out;
}

function indexHeaders(headers: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (key && idx[key] == null) idx[key] = i;
  });
  return idx;
}

function hasHeader(headers: string[], label: string): boolean {
  return headers.some((h) => h.trim().toLowerCase() === label);
}

function isDnb(cell: string | undefined): boolean {
  if (!cell) return true;
  return /^(dnb|tdnb|absent|sub|-|–)$/i.test(cell.trim());
}

function stripVs(value: string | undefined): string | undefined {
  const s = clean(value);
  return s ? s.replace(/^v\s+/i, "").trim() : undefined;
}

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const day = m[1]!.padStart(2, "0");
  const month = MONTHS[m[2]!.toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${day}`;
}

function ballsFromOvers(overs: string | null | undefined): number | null {
  if (!overs) return null;
  const [whole, balls = "0"] = overs.split(".");
  const w = Number(whole);
  const b = Number(balls);
  return Number.isFinite(w) && Number.isFinite(b) ? w * 6 + b : null;
}

function clean(v: string | undefined): string | undefined {
  if (v == null) return undefined;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || s === "-" || s === "–") return undefined;
  return s;
}

function int(v: string | undefined): number | null {
  const s = clean(v);
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function float(v: string | undefined): number | null {
  const s = clean(v);
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
