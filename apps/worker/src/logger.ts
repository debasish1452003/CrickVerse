import type { Logger } from "@crickverse/scraper-core";

/** Minimal structured console logger implementing scraper-core's Logger. */
export function createLogger(scope = "worker"): Logger {
  const fmt = (level: string, msg: string, meta?: unknown): string => {
    const base = `[${new Date().toISOString()}] ${level} (${scope}) ${msg}`;
    if (meta === undefined) return base;
    return `${base} ${typeof meta === "string" ? meta : JSON.stringify(meta)}`;
  };
  return {
    info: (msg, meta) => console.log(fmt("INFO ", msg, meta)),
    warn: (msg, meta) => console.warn(fmt("WARN ", msg, meta)),
    error: (msg, meta) => console.error(fmt("ERROR", msg, meta)),
  };
}
