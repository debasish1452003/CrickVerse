import * as cheerio from "cheerio";
import { NextDataMissingError } from "../errors";

/**
 * Parse the #__NEXT_DATA__ JSON blob out of an ESPNCricinfo HTML page.
 * ESPNCricinfo is a Next.js app, so every page embeds its data here.
 */
export function extractNextData(html: string, url: string): unknown {
  const $ = cheerio.load(html);
  const raw = $("#__NEXT_DATA__").html();
  if (!raw) throw new NextDataMissingError(url);
  return JSON.parse(raw);
}

/** Read a dot-path (e.g. "props.appPageProps.data.content") out of an object. */
export function getByPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, root);
}

/**
 * Return the first defined, non-null value among several candidate dot-paths.
 * This single fallback chain is where ESPNCricinfo JSON-path drift is absorbed.
 */
export function getByPaths(root: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const v = getByPath(root, path);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}
