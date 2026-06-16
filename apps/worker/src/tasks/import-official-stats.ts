import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { prisma } from "@crickverse/db";
import { createLogger } from "../logger";

interface ImportOfficialStatsInput {
  path: string;
  source: string;
  sourceUrl?: string;
  license?: string;
  notes?: string;
  dryRun?: boolean;
}

interface OfficialStatRow {
  cricsheetId?: string;
  cricinfoId?: string;
  playerName?: string;
  matchClass: string;
  matches?: number | null;
  runs?: number | null;
  wickets?: number | null;
  battingAvg?: number | null;
  bowlingAvg?: number | null;
  sourceUrl?: string | null;
}

export interface ImportOfficialStatsResult {
  rowsRead: number;
  rowsImported: number;
  unresolved: number;
  dryRun: boolean;
}

const MATCH_CLASSES = new Set(["TEST", "ODI", "T20I", "FIRST_CLASS", "LIST_A", "T20", "T10", "HUNDRED", "OTHER"]);

/**
 * Import legal/manual official career totals into OfficialCareerStat.
 *
 * Supported columns: cricsheetId or cricinfoId, matchClass, matches, runs,
 * wickets, battingAvg, bowlingAvg, sourceUrl. CSV and JSON array inputs are
 * accepted so sourced exports can be checked in or kept beside the lakehouse.
 */
export async function importOfficialStats(input: ImportOfficialStatsInput): Promise<ImportOfficialStatsResult> {
  const logger = createLogger("official-stats-import");
  const absPath = resolve(input.path);
  const bytes = readFileSync(absPath);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const rows = parseRows(absPath, bytes.toString("utf8"));
  validateKnownCareerOrdering(rows);

  let rowsImported = 0;
  let unresolved = 0;

  logger.info("official stat import starting", {
    path: absPath,
    source: input.source,
    rows: rows.length,
    dryRun: input.dryRun ?? false,
  });

  const importId = input.dryRun
    ? null
    : (
        await prisma.sourceImport.create({
          data: {
            source: input.source,
            kind: "OFFICIAL_CAREER_STATS",
            filePath: absPath,
            sourceUrl: input.sourceUrl,
            license: input.license,
            notes: input.notes,
            checksum,
            rowsRead: rows.length,
          },
        })
      ).id;

  for (const row of rows) {
    const matchClass = row.matchClass.trim().toUpperCase();
    if (!MATCH_CLASSES.has(matchClass)) {
      logger.warn("skipping row with unsupported matchClass", { matchClass });
      unresolved += 1;
      continue;
    }

    const cricsheetId = await resolveCricsheetId(row);
    if (!cricsheetId) {
      unresolved += 1;
      logger.warn("could not resolve player id", {
        cricsheetId: row.cricsheetId,
        cricinfoId: row.cricinfoId,
        matchClass,
      });
      continue;
    }

    rowsImported += 1;
    if (input.dryRun) continue;

    await prisma.officialCareerStat.upsert({
      where: { cricsheetId_matchClass_source: { cricsheetId, matchClass, source: input.source } },
      create: {
        cricsheetId,
        matchClass,
        source: input.source,
        sourceImportId: importId ?? undefined,
        matches: row.matches,
        runs: row.runs,
        wickets: row.wickets,
        battingAvg: row.battingAvg,
        bowlingAvg: row.bowlingAvg,
        sourceUrl: row.sourceUrl ?? input.sourceUrl,
      },
      update: {
        sourceImportId: importId ?? undefined,
        matches: row.matches,
        runs: row.runs,
        wickets: row.wickets,
        battingAvg: row.battingAvg,
        bowlingAvg: row.bowlingAvg,
        sourceUrl: row.sourceUrl ?? input.sourceUrl,
        importedAt: new Date(),
      },
    });
  }

  if (importId) {
    await prisma.sourceImport.update({
      where: { id: importId },
      data: { rowsImported, coverage: { unresolved } },
    });
  }

  logger.info("official stat import done", { rowsRead: rows.length, rowsImported, unresolved });
  return { rowsRead: rows.length, rowsImported, unresolved, dryRun: input.dryRun ?? false };
}

async function resolveCricsheetId(row: OfficialStatRow): Promise<string | null> {
  if (row.cricsheetId) return row.cricsheetId;
  if (!row.cricinfoId) return null;
  const player = await prisma.careerPlayer.findFirst({
    where: { cricinfoId: row.cricinfoId },
    select: { cricsheetId: true },
  });
  return player?.cricsheetId ?? null;
}

function parseRows(path: string, text: string): OfficialStatRow[] {
  if (path.toLowerCase().endsWith(".json")) return parseJsonRows(text);
  return parseCsvRows(text, path);
}

function parseJsonRows(text: string): OfficialStatRow[] {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Official stats JSON must be an array of rows");
  return parsed.map(normalizeRow);
}

function parseCsvRows(text: string, filePath = "official-stats.csv"): OfficialStatRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]!).map((h) => h.trim());
  return lines.slice(1).map((line, idx) => {
    const cols = splitCsvLine(line);
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      raw[h] = cols[i]?.trim() ?? "";
    });
    try {
      return normalizeRow(raw);
    } catch (err) {
      throw new Error(`${basename(filePath)} row ${idx + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

function normalizeRow(raw: unknown): OfficialStatRow {
  const r = raw as Record<string, unknown>;
  const matchClass = str(r.matchClass ?? r.format ?? r.class);
  if (!matchClass) throw new Error("matchClass is required");
  return {
    cricsheetId: str(r.cricsheetId),
    cricinfoId: str(r.cricinfoId ?? r.espncricinfoId),
    playerName: str(r.playerName ?? r.name ?? r.player),
    matchClass,
    matches: num(r.matches),
    runs: num(r.runs),
    wickets: num(r.wickets),
    battingAvg: num(r.battingAvg ?? r.battingAverage),
    bowlingAvg: num(r.bowlingAvg ?? r.bowlingAverage),
    sourceUrl: str(r.sourceUrl),
  };
}

function validateKnownCareerOrdering(rows: OfficialStatRow[]): void {
  const odiRows = rows.filter((r) => r.matchClass.trim().toUpperCase() === "ODI");
  const tendulkar = odiRows.find(isTendulkar);
  const kohli = odiRows.find(isKohli);
  if (!tendulkar || !kohli || tendulkar.runs == null || kohli.runs == null) return;
  if (tendulkar.runs <= kohli.runs) {
    throw new Error(
      `Official ODI import sanity check failed: Tendulkar runs (${tendulkar.runs}) must be greater than Kohli runs (${kohli.runs}).`,
    );
  }
}

function isTendulkar(row: OfficialStatRow): boolean {
  const name = row.playerName?.toLowerCase() ?? "";
  return row.cricinfoId === "35320" || name.includes("sachin tendulkar");
}

function isKohli(row: OfficialStatRow): boolean {
  const name = row.playerName?.toLowerCase() ?? "";
  return row.cricinfoId === "253802" || name.includes("virat kohli");
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function num(v: unknown): number | null {
  const s = str(v);
  if (!s || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cur += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
