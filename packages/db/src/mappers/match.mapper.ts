import { DismissalKind, MatchClass, MatchFormat, MatchState } from "@prisma/client";

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

/** Map Cricsheet's match_type token ("T20" | "IT20" | "ODI" | "Test" | "MDM" | "Hundred" ...). */
export function toMatchFormatFromCricsheet(raw: string | null | undefined): MatchFormat {
  if (!raw) return MatchFormat.OTHER;
  const f = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  switch (f) {
    case "T20":
    case "IT20":
      return MatchFormat.T20;
    case "ODI":
    case "ODM":
      return MatchFormat.ODI;
    case "TEST":
    case "MDM":
      return MatchFormat.TEST;
    case "HUNDRED":
    case "THEHUNDRED":
      return MatchFormat.HUNDRED;
    default:
      return MatchFormat.OTHER;
  }
}

/**
 * Map Cricsheet's match_type + team_type to the "class of cricket" — the
 * int'l-vs-domestic distinction MatchFormat throws away. This powers per-format
 * career splits. CRITICAL: match_type alone can't separate a T20I from a league
 * T20 (Cricsheet uses "T20" for both); `team_type` ("international"|"club") does.
 */
export function toMatchClassFromCricsheet(
  raw: string | null | undefined,
  teamType?: string | null | undefined,
): MatchClass {
  const intl = (teamType ?? "").toLowerCase() === "international";
  switch ((raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")) {
    case "TEST":
      return intl ? MatchClass.TEST : MatchClass.FIRST_CLASS;
    case "MDM":
      return MatchClass.FIRST_CLASS;
    case "ODI":
      return intl ? MatchClass.ODI : MatchClass.LIST_A;
    case "ODM":
      return MatchClass.LIST_A;
    case "T20":
      return intl ? MatchClass.T20I : MatchClass.T20;
    case "IT20":
      return MatchClass.T20I;
    case "T10":
      return MatchClass.T10;
    case "HUNDRED":
    case "THEHUNDRED":
      return MatchClass.HUNDRED;
    default:
      return MatchClass.OTHER;
  }
}

/** Map Cricsheet's wicket `kind` token (e.g. "caught", "run out") to our enum. */
export function toDismissalKindFromCricsheet(kind: string | null | undefined): DismissalKind {
  if (!kind) return DismissalKind.OTHER;
  switch (kind.toLowerCase().trim()) {
    case "bowled":
      return DismissalKind.BOWLED;
    case "caught":
      return DismissalKind.CAUGHT;
    case "lbw":
      return DismissalKind.LBW;
    case "run out":
      return DismissalKind.RUN_OUT;
    case "stumped":
      return DismissalKind.STUMPED;
    case "caught and bowled":
      return DismissalKind.CAUGHT_AND_BOWLED;
    case "hit wicket":
      return DismissalKind.HIT_WICKET;
    case "retired hurt":
    case "retired out":
    case "retired not out":
      return DismissalKind.RETIRED_OUT;
    case "obstructing the field":
      return DismissalKind.OBSTRUCTING;
    case "timed out":
      return DismissalKind.TIMED_OUT;
    default:
      return DismissalKind.OTHER;
  }
}

/** Derive a dismissal kind from ESPNCricinfo's dismissalText (e.g. "c Smith b Jones"). */
export function toDismissalKind(
  text: string | null | undefined,
  isOut: boolean | null | undefined,
): DismissalKind {
  if (isOut === false) return DismissalKind.NOT_OUT;
  if (!text) return isOut ? DismissalKind.OTHER : DismissalKind.NOT_OUT;
  const t = text.toLowerCase().trim();
  if (t.includes("not out")) return DismissalKind.NOT_OUT;
  if (t.includes("run out")) return DismissalKind.RUN_OUT;
  if (t.startsWith("st ") || t.includes("stumped")) return DismissalKind.STUMPED;
  if (t.startsWith("lbw")) return DismissalKind.LBW;
  if (t.includes("c & b") || t.includes("c and b") || t.includes("caught and bowled"))
    return DismissalKind.CAUGHT_AND_BOWLED;
  if (t.startsWith("c ") || t.includes("caught")) return DismissalKind.CAUGHT;
  if (t.includes("hit wicket")) return DismissalKind.HIT_WICKET;
  if (t.startsWith("b ") || t.includes("bowled")) return DismissalKind.BOWLED;
  if (t.includes("retired")) return DismissalKind.RETIRED_OUT;
  return DismissalKind.OTHER;
}
