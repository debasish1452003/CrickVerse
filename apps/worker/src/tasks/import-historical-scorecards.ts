import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { prisma } from "@crickverse/db";
import { createLogger } from "../logger";

export interface ImportHistoricalScorecardsInput {
  path: string;
  source: string;
  sourceUrl?: string;
  license?: string;
  notes?: string;
  dryRun?: boolean;
}

export interface ImportHistoricalScorecardsResult {
  rowsRead: number;
  scorecardsImported: number;
  battingLinesImported: number;
  bowlingLinesImported: number;
  dryRun: boolean;
}

interface RawHistoricalLine {
  lineType: "batting" | "bowling";
  externalId: string;
  matchClass: string;
  gender?: string;
  matchDate?: string;
  season?: string;
  eventName?: string;
  venue?: string;
  city?: string;
  teamHome: string;
  teamAway: string;
  result?: string;
  sourceUrl?: string;
  inningsNo: number;
  team?: string;
  sourcePlayerId?: string;
  playerName: string;
  position?: number | null;
  runs?: number | null;
  balls?: number | null;
  fours?: number | null;
  sixes?: number | null;
  dismissal?: string | null;
  maidens?: number | null;
  wickets?: number | null;
  economy?: number | null;
}

const MATCH_CLASSES = new Set(["TEST", "ODI", "T20I", "FIRST_CLASS", "LIST_A", "T20", "T10", "HUNDRED", "OTHER"]);

/** Import legal/manual scorecard-only historical data. */
export async function importHistoricalScorecards(
  input: ImportHistoricalScorecardsInput,
): Promise<ImportHistoricalScorecardsResult> {
  const logger = createLogger("historical-scorecard-import");
  const absPath = resolve(input.path);
  const bytes = readFileSync(absPath);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const rows = parseRows(absPath, bytes.toString("utf8"));
  const grouped = groupRows(rows);

  logger.info("historical scorecard import starting", {
    path: absPath,
    source: input.source,
    rows: rows.length,
    scorecards: grouped.size,
    dryRun: input.dryRun ?? false,
  });

  if (input.dryRun) {
    return {
      rowsRead: rows.length,
      scorecardsImported: 0,
      battingLinesImported: 0,
      bowlingLinesImported: 0,
      dryRun: true,
    };
  }

  const sourceImport = await prisma.sourceImport.create({
    data: {
      source: input.source,
      kind: "HISTORICAL_SCORECARD",
      filePath: absPath,
      sourceUrl: input.sourceUrl,
      license: input.license,
      notes: input.notes,
      checksum,
      rowsRead: rows.length,
    },
  });

  let scorecardsImported = 0;
  let battingLinesImported = 0;
  let bowlingLinesImported = 0;

  for (const matchRows of grouped.values()) {
    const first = matchRows[0]!;
    const scorecard = await prisma.historicalScorecard.upsert({
      where: { source_externalId: { source: input.source, externalId: first.externalId } },
      create: {
        source: input.source,
        sourceImportId: sourceImport.id,
        externalId: first.externalId,
        matchClass: first.matchClass,
        gender: first.gender,
        matchDate: first.matchDate,
        season: first.season,
        eventName: first.eventName,
        venue: first.venue,
        city: first.city,
        teamHome: first.teamHome,
        teamAway: first.teamAway,
        result: first.result,
        sourceUrl: first.sourceUrl ?? input.sourceUrl,
      },
      update: {
        sourceImportId: sourceImport.id,
        matchClass: first.matchClass,
        gender: first.gender,
        matchDate: first.matchDate,
        season: first.season,
        eventName: first.eventName,
        venue: first.venue,
        city: first.city,
        teamHome: first.teamHome,
        teamAway: first.teamAway,
        result: first.result,
        sourceUrl: first.sourceUrl ?? input.sourceUrl,
        importedAt: new Date(),
      },
    });

    await prisma.$transaction([
      prisma.historicalBattingLine.deleteMany({ where: { scorecardId: scorecard.id } }),
      prisma.historicalBowlingLine.deleteMany({ where: { scorecardId: scorecard.id } }),
    ]);

    const batting = matchRows.filter((r) => r.lineType === "batting");
    const bowling = matchRows.filter((r) => r.lineType === "bowling");
    if (batting.length) {
      await prisma.historicalBattingLine.createMany({
        data: batting.map((r) => ({
          scorecardId: scorecard.id,
          inningsNo: r.inningsNo,
          battingTeam: r.team,
          sourcePlayerId: r.sourcePlayerId,
          playerName: r.playerName,
          battingPos: r.position,
          runs: r.runs,
          balls: r.balls,
          fours: r.fours,
          sixes: r.sixes,
          dismissal: r.dismissal,
        })),
      });
    }
    if (bowling.length) {
      await prisma.historicalBowlingLine.createMany({
        data: bowling.map((r) => ({
          scorecardId: scorecard.id,
          inningsNo: r.inningsNo,
          bowlingTeam: r.team,
          sourcePlayerId: r.sourcePlayerId,
          playerName: r.playerName,
          bowlingPos: r.position,
          balls: r.balls,
          maidens: r.maidens,
          runs: r.runs,
          wickets: r.wickets,
          economy: r.economy,
        })),
      });
    }

    scorecardsImported += 1;
    battingLinesImported += batting.length;
    bowlingLinesImported += bowling.length;
  }

  await prisma.sourceImport.update({
    where: { id: sourceImport.id },
    data: {
      rowsImported: battingLinesImported + bowlingLinesImported,
      coverage: { scorecardsImported, battingLinesImported, bowlingLinesImported },
    },
  });

  logger.info("historical scorecard import done", {
    rowsRead: rows.length,
    scorecardsImported,
    battingLinesImported,
    bowlingLinesImported,
  });
  return { rowsRead: rows.length, scorecardsImported, battingLinesImported, bowlingLinesImported, dryRun: false };
}

function groupRows(rows: RawHistoricalLine[]): Map<string, RawHistoricalLine[]> {
  const out = new Map<string, RawHistoricalLine[]>();
  for (const row of rows) {
    const key = row.externalId;
    const existing = out.get(key);
    if (existing) existing.push(row);
    else out.set(key, [row]);
  }
  return out;
}

function parseRows(path: string, text: string): RawHistoricalLine[] {
  if (path.toLowerCase().endsWith(".json")) return parseJsonRows(text);
  return parseCsvRows(path, text);
}

function parseJsonRows(text: string): RawHistoricalLine[] {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Historical scorecard JSON must be an array of rows");
  return parsed.map(normalizeRow);
}

function parseCsvRows(path: string, text: string): RawHistoricalLine[] {
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
      throw new Error(`${basename(path)} row ${idx + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

function normalizeRow(raw: unknown): RawHistoricalLine {
  const r = raw as Record<string, unknown>;
  const lineType = str(r.lineType)?.toLowerCase();
  const matchClass = str(r.matchClass ?? r.format ?? r.class)?.toUpperCase() ?? "";
  const externalId = str(r.externalId ?? r.matchId);
  const playerName = str(r.playerName ?? r.player);
  const teamHome = str(r.teamHome);
  const teamAway = str(r.teamAway);
  const inningsNo = num(r.inningsNo);
  if (lineType !== "batting" && lineType !== "bowling") throw new Error("lineType must be batting or bowling");
  if (!externalId) throw new Error("externalId is required");
  if (!MATCH_CLASSES.has(matchClass)) throw new Error(`unsupported matchClass ${matchClass || "(blank)"}`);
  if (!teamHome || !teamAway) throw new Error("teamHome and teamAway are required");
  if (!playerName) throw new Error("playerName is required");
  if (inningsNo == null) throw new Error("inningsNo is required");

  return {
    lineType,
    externalId,
    matchClass,
    gender: str(r.gender),
    matchDate: str(r.matchDate ?? r.date),
    season: str(r.season),
    eventName: str(r.eventName ?? r.series),
    venue: str(r.venue),
    city: str(r.city),
    teamHome,
    teamAway,
    result: str(r.result),
    sourceUrl: str(r.sourceUrl),
    inningsNo,
    team: str(r.team),
    sourcePlayerId: str(r.sourcePlayerId ?? r.cricinfoId ?? r.playerId),
    playerName,
    position: num(r.position ?? r.battingPos ?? r.bowlingPos),
    runs: num(r.runs),
    balls: num(r.balls),
    fours: num(r.fours),
    sixes: num(r.sixes),
    dismissal: str(r.dismissal),
    maidens: num(r.maidens),
    wickets: num(r.wickets),
    economy: float(r.economy),
  };
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
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function float(v: unknown): number | null {
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
