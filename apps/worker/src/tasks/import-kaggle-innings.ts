import { createReadStream } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { prisma } from "@crickverse/db";
import { createLogger } from "../logger";

const SOURCE = "CRICINFO_BULK";

export interface ImportKaggleInningsInput {
  dir: string; // the "archive" folder of cclayford Cricinfo Statsguru CSVs
  dryRun?: boolean;
}

export interface ImportKaggleInningsResult {
  files: number;
  csvRows: number;
  matchedPlayers: number;
  ambiguousNames: number;
  skippedAlreadyScraped: number;
  battingRows: number;
  bowlingRows: number;
  dryRun: boolean;
}

interface Row {
  cricinfoId: string;
  matchClass: string;
  discipline: "batting" | "bowling";
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
  oversText: string | null;
  ballsBowled: number | null;
  maidens: number | null;
  runsConceded: number | null;
  wickets: number | null;
  economy: number | null;
}

/**
 * Import the cclayford "Cricinfo Statsguru Data" CSV dump (a Kaggle archive folder)
 * into PlayerInningsHistory. Unlike the single batting-only free file, this dump has
 * per-innings BATTING and BOWLING, men and women, across all eras (its real value is
 * the pre-2000 fill). It's keyed by display NAME + Country (no numeric id), so we
 * resolve name (disambiguated by gender) -> CareerPlayer.cricinfoId, skipping
 * ambiguous names and players already covered by the id-exact scrape.
 *
 * Data is ~April 2020, so post-2020 (active players) still comes from the live
 * scrape, which outranks this bulk source. One source per player is preserved.
 */
export async function importKaggleInnings(input: ImportKaggleInningsInput): Promise<ImportKaggleInningsResult> {
  const logger = createLogger("import-kaggle-innings");
  const result: ImportKaggleInningsResult = {
    files: 0, csvRows: 0, matchedPlayers: 0, ambiguousNames: 0,
    skippedAlreadyScraped: 0, battingRows: 0, bowlingRows: 0, dryRun: input.dryRun ?? false,
  };

  // name -> [{id, gender}] resolver (gender disambiguates men/women collisions).
  const players = await prisma.careerPlayer.findMany({
    where: { cricinfoId: { not: null } },
    select: { name: true, cricinfoId: true, gender: true },
  });
  const byName = new Map<string, Array<{ id: string; gender: string | null }>>();
  for (const p of players) {
    const list = byName.get(p.name) ?? [];
    list.push({ id: p.cricinfoId!, gender: p.gender });
    byName.set(p.name, list);
  }

  const scraped = await prisma.playerInningsHistory.groupBy({ by: ["cricinfoId"], where: { source: "CRICINFO_STATSGURU" } });
  const scrapedSet = new Set(scraped.map((s) => s.cricinfoId));

  const ambiguous = new Set<string>();
  const skippedScraped = new Set<string>();
  const perPlayer = new Map<string, Row[]>();

  const resolve = (name: string, gender: string): string | null | undefined => {
    const cands = byName.get(name);
    if (!cands) return undefined;
    if (cands.length === 1) return cands[0]!.id;
    const g = cands.filter((c) => c.gender === gender);
    if (g.length === 1) return g[0]!.id;
    return null; // ambiguous
  };

  const files = readdirSync(input.dir).filter(
    (f) => /Player Innings Stats/i.test(f) && /(Test|ODI|T20I)/i.test(f) && f.toLowerCase().endsWith(".csv"),
  );

  for (const file of files) {
    const matchClass = /T20I/i.test(file) ? "T20I" : /ODI/i.test(file) ? "ODI" : "TEST";
    const gender = /Women/i.test(file) ? "female" : "male";
    result.files += 1;

    const rl = createInterface({ input: createReadStream(join(input.dir, file)), crlfDelay: Infinity });
    let header: string[] | null = null;
    let idx: Record<string, number> = {};
    for await (const line of rl) {
      if (!line.trim()) continue;
      const cells = splitCsv(line);
      if (!header) {
        header = cells.map((h) => h.replace(/^﻿/, "").trim());
        header.forEach((h, i) => { if (idx[h] == null) idx[h] = i; });
        continue;
      }
      result.csvRows += 1;
      const get = (key: string): string => (idx[key] != null ? cells[idx[key]!] ?? "" : "").trim();

      const name = get("Innings Player");
      if (!name) continue;
      const cricinfoId = resolve(name, gender);
      if (cricinfoId === undefined) continue;
      if (cricinfoId === null) { ambiguous.add(name); continue; }
      if (scrapedSet.has(cricinfoId)) { skippedScraped.add(cricinfoId); continue; }

      const rawDate = get("Innings Date");
      const base = {
        cricinfoId,
        matchClass,
        matchDate: parseDate(rawDate),
        rawDate: rawDate || null,
        opposition: stripVs(get("Opposition")),
        ground: get("Ground") || null,
        inningsNo: int(get("Innings Number")),
      };

      const battedFlag = get("Innings Batted Flag");
      const runsScored = get("Innings Runs Scored"); // may carry "*"
      if (battedFlag === "1" || runsScored) {
        const dnb = battedFlag === "0" && !runsScored;
        const rows = perPlayer.get(cricinfoId) ?? [];
        rows.push({
          ...base, discipline: "batting",
          didBat: !dnb,
          runs: dnb ? null : int(get("Innings Runs Scored Num")),
          notOut: get("Innings Not Out Flag") === "1" || /\*/.test(runsScored),
          ballsFaced: int(get("Innings Balls Faced")),
          fours: int(get("Innings Boundary Fours")),
          sixes: int(get("Innings Boundary Sixes")),
          strikeRate: float(get("Innings Batting Strike Rate")),
          oversText: null, ballsBowled: null, maidens: null, runsConceded: null, wickets: null, economy: null,
        });
        perPlayer.set(cricinfoId, rows);
        result.battingRows += 1;
      }

      const bowledFlag = get("Innings Bowled Flag");
      const overs = get("Innings Overs Bowled");
      const wkts = get("Innings Wickets Taken");
      if (bowledFlag === "1" || overs || wkts) {
        const rows = perPlayer.get(cricinfoId) ?? [];
        rows.push({
          ...base, discipline: "bowling",
          didBat: false, runs: null, notOut: false, ballsFaced: null, fours: null, sixes: null, strikeRate: null,
          oversText: overs || null,
          ballsBowled: ballsFromOvers(overs),
          maidens: int(get("Innings Maidens Bowled")),
          runsConceded: int(get("Innings Runs Conceded")),
          wickets: int(wkts),
          economy: float(get("Innings Economy Rate")),
        });
        perPlayer.set(cricinfoId, rows);
        result.bowlingRows += 1;
      }
    }
    logger.info("parsed file", { file, matchClass, gender, csvRows: result.csvRows });
  }

  result.matchedPlayers = perPlayer.size;
  result.ambiguousNames = ambiguous.size;
  result.skippedAlreadyScraped = skippedScraped.size;
  logger.info("parse complete", result);

  if (input.dryRun) { logger.info("dry-run — nothing written"); return result; }

  const sourceImport = await prisma.sourceImport.create({
    data: {
      source: SOURCE, kind: "PLAYER_INNINGS_HISTORY", sourceUrl: input.dir,
      license: "cclayford Cricinfo Statsguru Data (Kaggle); innings-grain bulk, ~2020.",
      notes: "Name+gender-matched bulk import (batting+bowling, men+women, all eras). Superseded by id-exact scrape per player.",
      rowsRead: result.csvRows,
    },
  });

  let done = 0, written = 0;
  for (const [cricinfoId, rows] of perPlayer) {
    await prisma.playerInningsHistory.deleteMany({ where: { cricinfoId, source: SOURCE } });
    const data = rows.map((r) => ({ ...r, source: SOURCE, sourceImportId: sourceImport.id }));
    for (let i = 0; i < data.length; i += 5000) {
      const created = await prisma.playerInningsHistory.createMany({ data: data.slice(i, i + 5000) });
      written += created.count;
    }
    if (++done % 500 === 0) logger.info("progress", { players: `${done}/${perPlayer.size}`, rows: written });
  }
  await prisma.sourceImport.update({ where: { id: sourceImport.id }, data: { rowsImported: written } });

  logger.info("✅ kaggle import complete", { ...result, rowsWritten: written });
  return result;
}

// --- CSV + field helpers ---

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function stripVs(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  return s.replace(/^v\s+/i, "").trim() || null;
}

function parseDate(raw: string): string | null {
  // dump uses "1938/08/20" (yyyy/mm/dd).
  const m = raw.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function ballsFromOvers(overs: string): number | null {
  const s = overs.trim();
  if (!s) return null;
  const [whole, balls = "0"] = s.split(".");
  const w = Number(whole), b = Number(balls);
  return Number.isFinite(w) && Number.isFinite(b) ? w * 6 + b : null;
}

function int(v: string): number | null {
  const s = (v ?? "").trim();
  if (!s || s === "-") return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function float(v: string): number | null {
  const s = (v ?? "").trim();
  if (!s || s === "-") return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
