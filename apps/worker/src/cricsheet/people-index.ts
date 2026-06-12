import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PeopleIndex } from "@crickverse/db";
import type { Logger } from "@crickverse/scraper-core";

const PEOPLE_CSV_URL = "https://cricsheet.org/register/people.csv";
const DEFAULT_CACHE = join(process.cwd(), ".cache", "cricsheet-people.csv");
/** Re-download the register once it's older than this (new players appear over time). */
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Load Cricsheet's people register (cricsheet.org/register/people.csv) and index
 * it as `cricsheetId -> key_cricinfo` (ESPNCricinfo objectId). This is the exact
 * join that lets a Cricsheet delivery reconcile to an already-scraped Cricinfo
 * player with no fuzzy name matching. The CSV is cached to disk and re-downloaded
 * once it's older than `maxAgeMs` (default 7 days); pass `forceRefresh` to force.
 */
export async function loadPeopleIndex(opts: {
  logger?: Logger;
  cachePath?: string;
  forceRefresh?: boolean;
  maxAgeMs?: number;
} = {}): Promise<PeopleIndex> {
  const cachePath = opts.cachePath ?? DEFAULT_CACHE;
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  let csv: string;

  const fresh = existsSync(cachePath) && cacheAgeMs(cachePath) < maxAgeMs;
  if (!opts.forceRefresh && fresh) {
    csv = readFileSync(cachePath, "utf8");
    opts.logger?.info("people.csv loaded from cache", { cachePath });
  } else {
    opts.logger?.info("downloading people.csv", { url: PEOPLE_CSV_URL });
    const res = await fetch(PEOPLE_CSV_URL);
    if (!res.ok) throw new Error(`people.csv download failed: HTTP ${res.status}`);
    csv = await res.text();
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, csv, "utf8");
    opts.logger?.info("people.csv cached", { cachePath, bytes: csv.length });
  }

  return indexPeopleCsv(csv, opts.logger);
}

/** Age of the cached file in ms (Infinity if it can't be stat'd). */
function cacheAgeMs(path: string): number {
  try {
    return Date.now() - statSync(path).mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Parse the people.csv text into a `cricsheetId -> key_cricinfo` map. */
export function indexPeopleCsv(csv: string, logger?: Logger): PeopleIndex {
  const lines = csv.split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? "");
  const idCol = header.indexOf("identifier");
  const cricinfoCol = header.indexOf("key_cricinfo");
  if (idCol === -1 || cricinfoCol === -1) {
    throw new Error(
      `people.csv missing expected columns (identifier, key_cricinfo); got: ${header.join(",")}`,
    );
  }

  const index: PeopleIndex = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const cols = parseCsvLine(line);
    const id = cols[idCol]?.trim();
    const cricinfo = cols[cricinfoCol]?.trim();
    if (id && cricinfo) index.set(id, cricinfo);
  }
  logger?.info("people.csv indexed", { mappedToCricinfo: index.size });
  return index;
}

/** Minimal RFC-4180 line parser: handles quoted fields and escaped quotes. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
