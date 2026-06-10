import { MatchFormat, MatchState } from "@prisma/client";

/** Map ESPNCricinfo's format token to our enum. */
export function toMatchFormat(raw: string | null | undefined): MatchFormat {
  if (!raw) return MatchFormat.OTHER;
  const f = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  switch (f) {
    case "T20":
    case "T20I":
      return MatchFormat.T20;
    case "ODI":
    case "OD":
    case "LISTA":
      return MatchFormat.ODI;
    case "TEST":
    case "FIRSTCLASS":
      return MatchFormat.TEST;
    case "T10":
      return MatchFormat.T10;
    case "HUNDRED":
    case "THEHUNDRED":
    case "100BALL":
      return MatchFormat.HUNDRED;
    default:
      return MatchFormat.OTHER;
  }
}

/** Map ESPNCricinfo lifecycle (PRE/LIVE/POST) + cancellation to our enum. */
export function toMatchState(
  state: "PRE" | "LIVE" | "POST" | null | undefined,
  isCancelled: boolean | null | undefined,
): MatchState {
  if (isCancelled) return MatchState.ABANDONED;
  switch (state) {
    case "LIVE":
      return MatchState.LIVE;
    case "POST":
      return MatchState.COMPLETED;
    case "PRE":
    default:
      return MatchState.SCHEDULED;
  }
}

/** Parse an ISO string to a Date, or undefined if absent/invalid. */
export function parseDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Truncate a Date to UTC midnight (date-only, for cross-source match dedupe). */
export function toUtcDateOnly(d: Date | undefined): Date | undefined {
  if (!d) return undefined;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
