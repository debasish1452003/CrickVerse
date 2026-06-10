import { z } from "zod";

/**
 * Normalized, source-agnostic entities that scraper descriptors emit and the
 * db layer consumes. These are validated *after* parsing (fail loud), so they
 * are stricter than the messy raw __NEXT_DATA__ payload.
 *
 * `source*Id` fields hold the ESPNCricinfo numeric objectId; Cricsheet ingestion
 * produces the same shapes with its own ids. The db layer reconciles both into
 * one canonical row via the external-id mapping tables.
 */

/** Accept a string or number from the payload and normalize to a trimmed string. */
const StringFromAny = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .pipe(z.string().min(1));

const Nullable = <T extends z.ZodTypeAny>(s: T) => s.nullable().default(null);

export const ParsedSeriesSchema = z.object({
  sourceSeriesId: z.number().int().nullable(),
  slug: Nullable(z.string()),
  name: Nullable(z.string()),
  longName: Nullable(z.string()),
  season: Nullable(StringFromAny),
});
export type ParsedSeries = z.infer<typeof ParsedSeriesSchema>;

export const ParsedVenueSchema = z.object({
  sourceVenueId: z.number().int().nullable(),
  name: Nullable(z.string()),
  city: Nullable(z.string()),
  country: Nullable(z.string()),
  capacity: z.number().int().nullable().default(null),
});
export type ParsedVenue = z.infer<typeof ParsedVenueSchema>;

export const ParsedTeamRefSchema = z.object({
  sourceTeamId: z.number().int().nullable(),
  name: Nullable(z.string()), // longName, e.g. "Royal Challengers Bengaluru"
  shortName: Nullable(z.string()), // abbreviation, e.g. "RCB"
  score: Nullable(z.string()), // display score, e.g. "186/5 (20 ov)"
  isHome: z.boolean().nullable().default(null),
  primaryColor: Nullable(z.string()),
  imageUrl: Nullable(z.string()),
});
export type ParsedTeamRef = z.infer<typeof ParsedTeamRefSchema>;

export const ParsedMatchSchema = z.object({
  sourceMatchId: z.number().int(),
  slug: Nullable(z.string()),
  title: Nullable(z.string()),
  /** Raw ESPNCricinfo format token, e.g. "T20" / "ODI" / "TEST". Mapped to enum in the db layer. */
  format: Nullable(z.string()),
  /** ESPNCricinfo lifecycle: PRE | LIVE | POST. Drives the live scheduler. */
  state: z.enum(["PRE", "LIVE", "POST"]).nullable().default(null),
  stage: Nullable(z.string()),
  statusText: Nullable(z.string()),
  startTime: Nullable(z.string()), // ISO 8601; converted to Date in the db layer
  season: Nullable(StringFromAny),
  dayNight: z.boolean().nullable().default(null),
  isCancelled: z.boolean().nullable().default(null),
  series: ParsedSeriesSchema,
  venue: ParsedVenueSchema,
  teams: z.array(ParsedTeamRefSchema),
  result: z.object({
    winnerTeamId: z.number().int().nullable().default(null),
    tossWinnerTeamId: z.number().int().nullable().default(null),
    tossDecision: z.enum(["BAT", "FIELD"]).nullable().default(null),
  }),
  flags: z.object({
    hasScorecard: z.boolean().nullable().default(null),
    hasCommentary: z.boolean().nullable().default(null),
  }),
});
export type ParsedMatch = z.infer<typeof ParsedMatchSchema>;

/** The output of the series-fixtures descriptor: the series + all its matches. */
export const ParsedSeriesFixturesSchema = z.object({
  series: ParsedSeriesSchema,
  matches: z.array(ParsedMatchSchema),
});
export type ParsedSeriesFixtures = z.infer<typeof ParsedSeriesFixturesSchema>;

export const ParsedBattingLineSchema = z.object({
  sourcePlayerId: z.number().int().nullable(),
  name: Nullable(z.string()),
  runs: z.number().int().nonnegative().default(0),
  balls: z.number().int().nonnegative().default(0),
  fours: z.number().int().nonnegative().nullable().default(null),
  sixes: z.number().int().nonnegative().nullable().default(null),
});
export type ParsedBattingLine = z.infer<typeof ParsedBattingLineSchema>;

export const ParsedBowlingLineSchema = z.object({
  sourcePlayerId: z.number().int().nullable(),
  name: Nullable(z.string()),
  wickets: z.number().int().nonnegative().default(0),
  runs: z.number().int().nonnegative().default(0),
  overs: Nullable(z.string()),
});
export type ParsedBowlingLine = z.infer<typeof ParsedBowlingLineSchema>;

export const ParsedInningsSchema = z.object({
  inningsNo: z.number().int().positive(),
  battingTeamId: z.number().int().nullable().default(null),
  runs: z.number().int().nullable().default(null),
  wickets: z.number().int().nullable().default(null),
  overs: Nullable(z.string()),
  batting: z.array(ParsedBattingLineSchema),
  bowling: z.array(ParsedBowlingLineSchema),
});
export type ParsedInnings = z.infer<typeof ParsedInningsSchema>;

export const ParsedScorecardSchema = z.object({
  sourceMatchId: z.number().int(),
  innings: z.array(ParsedInningsSchema),
});
export type ParsedScorecard = z.infer<typeof ParsedScorecardSchema>;

export const ParsedPlayerSchema = z.object({
  sourcePlayerId: z.number().int(),
  name: Nullable(z.string()),
  country: Nullable(z.string()),
  role: Nullable(z.string()),
  battingStyle: Nullable(z.string()),
  bowlingStyle: Nullable(z.string()),
});
export type ParsedPlayer = z.infer<typeof ParsedPlayerSchema>;
