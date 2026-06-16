import { createHash } from "node:crypto";
import { prisma } from "@crickverse/db";
import { createLogger } from "../logger";

const DEFAULT_MISSING_URL = "https://cricsheet.org/missing/";

export interface ImportCricsheetMissingInput {
  url?: string;
  dryRun?: boolean;
}

export interface ImportCricsheetMissingResult {
  rowsRead: number;
  rowsImported: number;
  dryRun: boolean;
}

interface MissingRow {
  matchClass: string;
  gender: string;
  matchDate: string;
  teams: string;
  teamHome: string | null;
  teamAway: string | null;
}

/** Import Cricsheet's public missing-match list into CoverageGap. */
export async function importCricsheetMissing(
  input: ImportCricsheetMissingInput = {},
): Promise<ImportCricsheetMissingResult> {
  const logger = createLogger("cricsheet-missing-import");
  const url = input.url ?? DEFAULT_MISSING_URL;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch Cricsheet missing page: HTTP ${res.status}`);
  const html = await res.text();
  const rows = parseMissingPage(html);
  const checksum = createHash("sha256").update(html).digest("hex");

  logger.info("Cricsheet missing import starting", { url, rows: rows.length, dryRun: input.dryRun ?? false });
  if (input.dryRun) return { rowsRead: rows.length, rowsImported: 0, dryRun: true };

  const sourceImport = await prisma.sourceImport.create({
    data: {
      source: "CRICSHEET_MISSING",
      kind: "COVERAGE_GAP",
      sourceUrl: url,
      license: "Cricsheet public missing-match page; use as gap metadata only.",
      checksum,
      rowsRead: rows.length,
    },
  });

  const created = await prisma.coverageGap.createMany({
    data: rows.map((row) => ({
        source: "CRICSHEET_MISSING",
        sourceImportId: sourceImport.id,
        matchClass: row.matchClass,
        gender: row.gender,
        matchDate: row.matchDate,
        teams: row.teams,
        teamHome: row.teamHome,
        teamAway: row.teamAway,
        reason: "Listed by Cricsheet as missing within its attempted coverage.",
        status: "MISSING",
        sourceUrl: url,
      })),
    skipDuplicates: true,
  });
  const rowsImported = created.count;

  await prisma.sourceImport.update({
    where: { id: sourceImport.id },
    data: { rowsImported, coverage: summarize(rows) },
  });

  logger.info("Cricsheet missing import done", { rowsRead: rows.length, rowsImported });
  return { rowsRead: rows.length, rowsImported, dryRun: false };
}

function parseMissingPage(html: string): MissingRow[] {
  const text = htmlToText(html);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: MissingRow[] = [];
  let matchClass = "OTHER";
  let gender = "unknown";
  let date: string | null = null;

  for (const line of lines) {
    const heading = line.toLowerCase();
    if (heading.includes("test matches")) matchClass = "TEST";
    else if (heading.includes("odi matches") || heading.includes("one-day internationals")) matchClass = "ODI";
    else if (heading.includes("t20i matches") || heading.includes("t20 internationals")) matchClass = "T20I";
    else if (heading.includes("female matches")) gender = "female";
    else if (heading.includes("male matches")) gender = "male";
    else if (/^\d{4}-\d{2}-\d{2}$/.test(line)) date = line;
    else if (date && /\s+vs\s+/i.test(line)) {
      const teams = line.replace(/\s+/g, " ");
      const [teamHome, teamAway] = teams.split(/\s+vs\s+/i);
      rows.push({
        matchClass,
        gender,
        matchDate: date,
        teams,
        teamHome: teamHome?.trim() || null,
        teamAway: teamAway?.trim() || null,
      });
    }
  }

  return rows;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<\/(h\d|p|li|div|tr|section)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ");
}

function summarize(rows: MissingRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.matchClass] = (out[row.matchClass] ?? 0) + 1;
  return out;
}
