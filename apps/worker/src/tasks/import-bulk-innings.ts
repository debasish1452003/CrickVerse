import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { prisma } from "@crickverse/db";
import { createLogger } from "../logger";

const SOURCE = "CRICINFO_BULK";

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// "Test v England" -> TEST ; only international classes appear in this dump.
const CLASS_MAP: Record<string, string> = { test: "TEST", odi: "ODI", t20i: "T20I" };

export interface ImportBulkInningsInput {
  path: string;
  dryRun?: boolean;
}

export interface ImportBulkInningsResult {
  csvRows: number;
  distinctCsvPlayers: number;
  matchedPlayers: number;
  ambiguousNames: number;
  skippedAlreadyScraped: number;
  inningsImported: number;
  dryRun: boolean;
}

interface BulkRow {
  cricinfoId: string;
  matchClass: string;
  matchDate: string | null;
  rawDate: string | null;
  opposition: string | null;
  ground: string | null;
  inningsNo: number | null;
  didBat: boolean;
  runs: number | null;
  notOut: boolean;
  ballsFaced: number | null;
  fours: number | null;
  sixes: number | null;
  strikeRate: number | null;
}

/**
 * Bulk-import a player-innings CSV dump (ESPNcricinfo Statsguru export, e.g. the
 * open "Cricinfo Statsguru Data" set) into PlayerInningsHistory. The dump is keyed
 * by display NAME (no numeric id), so we resolve name -> CareerPlayer.cricinfoId,
 * skipping names that are ambiguous (>1 player) or already fully scraped.
 *
 * Invariant: one source per player. We import bulk ONLY for players with no
 * scraped (CRICINFO_STATSGURU) rows; the scraper later deletes the bulk rows when
 * it lands a complete career. So neither the player page nor the rankings ever
 * double-count across sources.
 *
 * This dump is batting-grain (international men, ~1982-2022); it is a fast
 * stand-in until the id-exact scraper supersedes it.
 */
export async function importBulkInnings(input: ImportBulkInningsInput): Promise<ImportBulkInningsResult> {
  const logger = createLogger("import-bulk-innings");
  const result: ImportBulkInningsResult = {
    csvRows: 0,
    distinctCsvPlayers: 0,
    matchedPlayers: 0,
    ambiguousNames: 0,
    skippedAlreadyScraped: 0,
    inningsImported: 0,
    dryRun: input.dryRun ?? false,
  };

  // 1) name -> cricinfoId resolver (skip ambiguous names and players without an id).
  const players = await prisma.careerPlayer.findMany({
    where: { cricinfoId: { not: null } },
    select: { name: true, cricinfoId: true },
  });
  const byName = new Map<string, string | null>(); // name -> cricinfoId, or null if ambiguous
  for (const p of players) {
    if (byName.has(p.name)) byName.set(p.name, null); // collision -> ambiguous
    else byName.set(p.name, p.cricinfoId!);
  }

  // Players already scraped: skip entirely (the scrape is a superset).
  const scraped = await prisma.playerInningsHistory.groupBy({
    by: ["cricinfoId"],
    where: { source: "CRICINFO_STATSGURU" },
  });
  const scrapedSet = new Set(scraped.map((s) => s.cricinfoId));

  // 2) stream the CSV, grouping rows per resolved cricinfoId.
  const perPlayer = new Map<string, BulkRow[]>();
  const seenCsvNames = new Set<string>();
  const ambiguous = new Set<string>();

  const rl = createInterface({ input: createReadStream(input.path), crlfDelay: Infinity });
  let header = true;
  for await (const line of rl) {
    if (header) { header = false; continue; }
    if (!line.trim()) continue;
    const cols = line.split(",");
    const rawPlayer = cols[1];
    if (!rawPlayer) continue;
    result.csvRows += 1;

    const name = rawPlayer.replace(/\s*\([^)]*\)\s*$/, "").trim();
    seenCsvNames.add(name);

    const cricinfoId = byName.get(name);
    if (cricinfoId === undefined) continue; // not in our DB
    if (cricinfoId === null) { ambiguous.add(name); continue; } // ambiguous name
    if (scrapedSet.has(cricinfoId)) continue; // already scraped -> skip

    // Opposition embeds the class: "Test v England".
    const opposition = cols[10] ?? "";
    const m = opposition.trim().match(/^(Test|ODI|T20I)\s+v\s+(.+)$/i);
    if (!m) continue;
    const matchClass = CLASS_MAP[m[1]!.toLowerCase()];
    if (!matchClass) continue;

    const rawDate = (cols[cols.length - 1] ?? "").trim();
    const ground = (cols[cols.length - 2] ?? "").trim() || null;
    const runsCell = (cols[2] ?? "").trim();
    const dnb = isDnb(runsCell);
    const notOut = /\*/.test(runsCell);

    const row: BulkRow = {
      cricinfoId,
      matchClass,
      matchDate: parseDate(rawDate),
      rawDate: rawDate || null,
      opposition: m[2]!.trim(),
      ground,
      inningsNo: int(cols[8]),
      didBat: !dnb,
      runs: dnb ? null : int(runsCell.replace("*", "")),
      notOut,
      ballsFaced: int(cols[4]),
      fours: int(cols[5]),
      sixes: int(cols[6]),
      strikeRate: float(cols[7]),
    };
    const list = perPlayer.get(cricinfoId) ?? [];
    list.push(row);
    perPlayer.set(cricinfoId, list);
  }

  result.distinctCsvPlayers = seenCsvNames.size;
  result.matchedPlayers = perPlayer.size;
  result.ambiguousNames = ambiguous.size;
  // Players present in the CSV+DB but skipped because already scraped:
  for (const name of seenCsvNames) {
    const id = byName.get(name);
    if (id && scrapedSet.has(id)) result.skippedAlreadyScraped += 1;
  }

  logger.info("parsed", {
    csvRows: result.csvRows,
    distinctCsvPlayers: result.distinctCsvPlayers,
    matchedPlayers: result.matchedPlayers,
    ambiguousNames: result.ambiguousNames,
    skippedAlreadyScraped: result.skippedAlreadyScraped,
  });

  if (input.dryRun) {
    logger.info("dry-run — nothing written");
    return result;
  }

  const sourceImport = await prisma.sourceImport.create({
    data: {
      source: SOURCE,
      kind: "PLAYER_INNINGS_HISTORY",
      sourceUrl: input.path,
      license: "Open ESPNcricinfo Statsguru CSV dump; batting-grain bulk stand-in.",
      notes: "Name-matched bulk import; superseded by id-exact scrape per player.",
      rowsRead: result.csvRows,
    },
  });

  // 3) per-player delete-then-insert (only bulk source) so re-runs converge.
  let done = 0;
  for (const [cricinfoId, rows] of perPlayer) {
    await prisma.playerInningsHistory.deleteMany({ where: { cricinfoId, source: SOURCE } });
    const data = rows.map((r) => ({
      cricinfoId: r.cricinfoId,
      matchClass: r.matchClass,
      discipline: "batting",
      matchDate: r.matchDate,
      rawDate: r.rawDate,
      opposition: r.opposition,
      ground: r.ground,
      inningsNo: r.inningsNo,
      didBat: r.didBat,
      runs: r.runs,
      notOut: r.notOut,
      ballsFaced: r.ballsFaced,
      fours: r.fours,
      sixes: r.sixes,
      strikeRate: r.strikeRate,
      source: SOURCE,
      sourceImportId: sourceImport.id,
    }));
    for (let i = 0; i < data.length; i += 5000) {
      const created = await prisma.playerInningsHistory.createMany({ data: data.slice(i, i + 5000) });
      result.inningsImported += created.count;
    }
    done += 1;
    if (done % 200 === 0) logger.info("progress", { players: `${done}/${perPlayer.size}`, innings: result.inningsImported });
  }

  await prisma.sourceImport.update({
    where: { id: sourceImport.id },
    data: { rowsImported: result.inningsImported, coverage: { matchedPlayers: result.matchedPlayers } },
  });

  logger.info("✅ bulk import complete", result);
  return result;
}

function isDnb(cell: string): boolean {
  return !cell || /^(dnb|tdnb|absent|sub|-|–)$/i.test(cell.trim());
}

function parseDate(raw: string): string | null {
  // dump uses "23-Jun-22" or "23 Jun 2022".
  const m = raw.match(/^(\d{1,2})[ -]([A-Za-z]{3})[ -](\d{2,4})$/);
  if (!m) return null;
  const day = m[1]!.padStart(2, "0");
  const month = MONTHS[m[2]!.toLowerCase()];
  if (!month) return null;
  let year = m[3]!;
  if (year.length === 2) year = Number(year) > 30 ? `19${year}` : `20${year}`;
  return `${year}-${month}-${day}`;
}

function int(v: string | undefined): number | null {
  if (v == null) return null;
  const s = v.trim();
  if (!s || s === "-") return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function float(v: string | undefined): number | null {
  if (v == null) return null;
  const s = v.trim();
  if (!s || s === "-") return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
