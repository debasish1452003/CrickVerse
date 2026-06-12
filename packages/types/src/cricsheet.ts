import { z } from "zod";

/**
 * Normalized Cricsheet entities. Cricsheet ships one JSON file per match
 * (https://cricsheet.org/format/json/). Unlike ESPNCricinfo, players are
 * referenced by *name* throughout the file and resolved to a stable Cricsheet
 * person id via `info.registry.people`. Teams/venues have names only (no ids).
 *
 * These shapes are the source-agnostic output the parser emits and the db layer
 * consumes — reconciled into the same canonical rows as ESPNCricinfo data via
 * the *ExternalId mapping tables (Source.CRICSHEET, externalId = the Cricsheet
 * id, or the name where no id exists).
 */

/** A player reference inside a delivery: Cricsheet id + display name. */
export const CricsheetPlayerRefSchema = z.object({
  /** Cricsheet person identifier from info.registry.people; null if unregistered. */
  id: z.string().nullable(),
  name: z.string().min(1),
});
export type CricsheetPlayerRef = z.infer<typeof CricsheetPlayerRefSchema>;

/** A wicket falling on a delivery. `kind` is Cricsheet's raw token (e.g. "caught"). */
export const ParsedCricsheetWicketSchema = z.object({
  kind: z.string(),
  playerOut: CricsheetPlayerRefSchema.nullable().default(null),
  fielders: z.array(z.string()).default([]),
});
export type ParsedCricsheetWicket = z.infer<typeof ParsedCricsheetWicketSchema>;

export const ParsedCricsheetDeliverySchema = z.object({
  /** 1-based innings number. */
  inningsNo: z.number().int().positive(),
  /** 0-based over index (cricket's "over 0" is the 1st over). */
  overNo: z.number().int().nonnegative(),
  /** 1-based position within the over, counting legal + illegal balls. Unique per over. */
  ballInOver: z.number().int().positive(),
  batter: CricsheetPlayerRefSchema,
  bowler: CricsheetPlayerRefSchema,
  nonStriker: CricsheetPlayerRefSchema.nullable().default(null),
  runsBatter: z.number().int().nonnegative().default(0),
  runsExtras: z.number().int().nonnegative().default(0),
  runsTotal: z.number().int().nonnegative().default(0),
  /** "wides" | "noballs" | "byes" | "legbyes" | "penalty"; null on a legal ball. */
  extraType: z.string().nullable().default(null),
  wicket: ParsedCricsheetWicketSchema.nullable().default(null),
});
export type ParsedCricsheetDelivery = z.infer<typeof ParsedCricsheetDeliverySchema>;

export const ParsedCricsheetInningsSchema = z.object({
  inningsNo: z.number().int().positive(),
  battingTeam: z.string().min(1),
  /** Summed from deliveries — convenience for the Innings row. */
  runs: z.number().int().nonnegative().default(0),
  wickets: z.number().int().nonnegative().default(0),
  /** Legal balls bowled (excludes wides/no-balls). */
  legalBalls: z.number().int().nonnegative().default(0),
  deliveries: z.array(ParsedCricsheetDeliverySchema),
});
export type ParsedCricsheetInnings = z.infer<typeof ParsedCricsheetInningsSchema>;

export const ParsedCricsheetMatchSchema = z.object({
  /** Cricsheet match id — the JSON file's name stem (not present in the payload). */
  sourceMatchId: z.string().min(1),
  /**
   * Cricsheet's `meta.revision` — bumped each time it republishes a corrected file.
   * The incremental feed stores this and re-ingests a known match only when it rises.
   */
  revision: z.number().int().positive().default(1),
  /** Raw Cricsheet match_type: "Test" | "ODI" | "T20" | "IT20" | "MDM" | "ODM" | "Hundred" ... */
  matchType: z.string().nullable().default(null),
  /** "international" | "club" — the authoritative int'l-vs-domestic signal (match_type alone can't tell a T20I from a league T20). */
  teamType: z.string().nullable().default(null),
  gender: z.string().nullable().default(null),
  season: z.string().nullable().default(null),
  /** Match date(s), ISO yyyy-mm-dd. dates[0] is the start. */
  dates: z.array(z.string()).default([]),
  /** Competition / series name, e.g. "Indian Premier League". */
  eventName: z.string().nullable().default(null),
  eventMatchNumber: z.number().int().nullable().default(null),
  venue: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  teams: z.array(z.string()).default([]),
  tossWinner: z.string().nullable().default(null),
  tossDecision: z.enum(["bat", "field"]).nullable().default(null),
  outcomeWinner: z.string().nullable().default(null),
  playerOfMatch: z.array(z.string()).default([]),
  ballsPerOver: z.number().int().positive().default(6),
  /** Squad lists by team name. */
  players: z.record(z.string(), z.array(z.string())).default({}),
  /** name -> Cricsheet person id (the join key to ESPNCricinfo via people.csv). */
  registry: z.record(z.string(), z.string()).default({}),
  innings: z.array(ParsedCricsheetInningsSchema),
});
export type ParsedCricsheetMatch = z.infer<typeof ParsedCricsheetMatchSchema>;

/**
 * One row of Cricsheet's people register (cricsheet.org/register/people.csv).
 * `identifier` is the Cricsheet person id; `key_cricinfo` is the ESPNCricinfo
 * objectId — the exact join back to scraped Cricinfo players (no fuzzy matching).
 */
export interface CricsheetPeopleRow {
  identifier: string;
  name: string;
  uniqueName: string;
  keyCricinfo: string | null;
}
