import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as yauzl from "yauzl";
import type { Logger } from "@crickverse/scraper-core";

export interface ZipEntry {
  entry: yauzl.Entry;
  matchId: string;
}

/** Open a zip from a buffer (promisified, random-access via lazyEntries). */
export function openZip(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("yauzl returned no zipfile"));
      resolve(zip);
    });
  });
}

/**
 * Walk every entry (central directory only — no decompression) and keep the
 * match-JSON ones. matchId is the file name stem; readme.json and directories are
 * dropped. The handle stays open afterward for {@link readEntryFromZip}.
 */
export function collectJsonEntries(zip: yauzl.ZipFile): Promise<ZipEntry[]> {
  return new Promise((resolve, reject) => {
    const out: ZipEntry[] = [];
    zip.on("entry", (entry: yauzl.Entry) => {
      const name = entry.fileName;
      if (!name.endsWith("/") && /\.json$/i.test(name) && name.toLowerCase() !== "readme.json") {
        out.push({ entry, matchId: name.replace(/^.*\//, "").replace(/\.json$/i, "") });
      }
      zip.readEntry();
    });
    zip.on("end", () => resolve(out));
    zip.on("error", reject);
    zip.readEntry();
  });
}

/** Decompress a single entry to a Buffer using the already-open (random-access) zip. */
export function readEntryFromZip(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error("no read stream"));
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  });
}

/**
 * Get a feed zip as a Buffer: use the on-disk cache unless `force`, else download
 * and cache. Unlike fetchCricsheetFeed this is unconditional (no ETag/skip-known) —
 * the Parquet export wants every match, every run.
 */
export async function getZipBuffer(opts: {
  url: string;
  cachePath: string;
  logger: Logger;
  force?: boolean;
}): Promise<Buffer> {
  if (!opts.force && existsSync(opts.cachePath)) {
    opts.logger.info("using cached zip", { cachePath: opts.cachePath });
    return readFileSync(opts.cachePath);
  }
  opts.logger.info("downloading zip", { url: opts.url });
  const res = await fetch(opts.url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} for ${opts.url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(opts.cachePath), { recursive: true });
  writeFileSync(opts.cachePath, buffer);
  opts.logger.info("downloaded + cached zip", { cachePath: opts.cachePath, bytes: buffer.length });
  return buffer;
}
