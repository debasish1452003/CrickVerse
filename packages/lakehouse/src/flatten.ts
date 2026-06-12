import type { ParsedCricsheetMatch } from "@crickverse/types";

/** cricsheetId -> ESPNcricinfo key_cricinfo (from people.csv); same shape as PeopleIndex. */
export type PeopleIndex = Map<string, string>;

/**
 * One flat ball-by-ball row — the silver-layer / ML grain. Denormalized with
 * match + innings context and both id systems (Cricsheet + ESPNcricinfo) so the
 * Parquet corpus is self-contained and joinable. snake_case for SQL/Parquet.
 */
export interface DeliveryRow {
  match_id: string;
  match_class: string;
  match_type: string | null;
  gender: string | null;
  season: string | null;
  event_name: string | null;
  venue: string | null;
  city: string | null;
  match_date: string | null;
  innings_no: number;
  batting_team: string;
  bowling_team: string | null;
  over_no: number;
  ball_in_over: number;
  batter_id: string | null;
  batter_cricinfo: string | null;
  batter_name: string;
  bowler_id: string | null;
  bowler_cricinfo: string | null;
  bowler_name: string;
  non_striker_id: string | null;
  non_striker_name: string | null;
  runs_batter: number;
  runs_extras: number;
  runs_total: number;
  extra_type: string | null;
  is_wicket: boolean;
  dismissal_kind: string | null;
  player_out_id: string | null;
  player_out_name: string | null;
  fielders: string | null;
}

export interface MatchRow {
  match_id: string;
  match_class: string;
  match_type: string | null;
  gender: string | null;
  season: string | null;
  event_name: string | null;
  event_match_number: number | null;
  venue: string | null;
  city: string | null;
  match_date: string | null;
  team_home: string | null;
  team_away: string | null;
  toss_winner: string | null;
  toss_decision: string | null;
  outcome_winner: string | null;
  player_of_match: string | null;
  balls_per_over: number;
  revision: number;
}

export interface PlayerRow {
  cricsheet_id: string;
  name: string;
  cricinfo_id: string | null;
}

export interface FlatMatch {
  match: MatchRow;
  deliveries: DeliveryRow[];
  players: PlayerRow[];
}

/**
 * Derive the class of cricket from Cricsheet's match_type + team_type — MIRROR of
 * `toMatchClassFromCricsheet` in packages/db/src/mappers/match.mapper.ts. Kept here
 * (not imported) so the lakehouse has no Prisma dependency. Keep the two in sync.
 *
 * CRITICAL: match_type alone cannot separate a T20I from a league T20 — Cricsheet
 * uses "T20" for BOTH. `team_type` ("international" | "club") is the real signal.
 */
export function deriveMatchClass(
  rawType: string | null | undefined,
  teamType: string | null | undefined,
): string {
  const intl = (teamType ?? "").toLowerCase() === "international";
  switch ((rawType ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")) {
    case "TEST":
      return intl ? "TEST" : "FIRST_CLASS";
    case "MDM":
      return "FIRST_CLASS"; // domestic multi-day (first-class)
    case "ODI":
      return intl ? "ODI" : "LIST_A";
    case "ODM":
      return "LIST_A"; // "other one-day" — List A level
    case "T20":
      return intl ? "T20I" : "T20"; // international T20 vs franchise/league T20
    case "IT20":
      return "T20I"; // associate / non-official international T20
    case "T10":
      return "T10";
    case "HUNDRED":
    case "THEHUNDRED":
      return "HUNDRED";
    default:
      return "OTHER";
  }
}

/**
 * Flatten one parsed Cricsheet match into silver rows. `peopleIndex` supplies the
 * ESPNcricinfo id for every Cricsheet player id we can reconcile.
 */
export function flattenMatch(parsed: ParsedCricsheetMatch, peopleIndex: PeopleIndex): FlatMatch {
  const matchClass = deriveMatchClass(parsed.matchType, parsed.teamType);
  const matchDate = parsed.dates[0] ?? null;
  const cricinfo = (id: string | null): string | null => (id ? peopleIndex.get(id) ?? null : null);

  const deliveries: DeliveryRow[] = [];
  for (const inn of parsed.innings) {
    const bowlingTeam = parsed.teams.find((t) => t !== inn.battingTeam) ?? null;
    for (const d of inn.deliveries) {
      deliveries.push({
        match_id: parsed.sourceMatchId,
        match_class: matchClass,
        match_type: parsed.matchType,
        gender: parsed.gender,
        season: parsed.season,
        event_name: parsed.eventName,
        venue: parsed.venue,
        city: parsed.city,
        match_date: matchDate,
        innings_no: inn.inningsNo,
        batting_team: inn.battingTeam,
        bowling_team: bowlingTeam,
        over_no: d.overNo,
        ball_in_over: d.ballInOver,
        batter_id: d.batter.id,
        batter_cricinfo: cricinfo(d.batter.id),
        batter_name: d.batter.name,
        bowler_id: d.bowler.id,
        bowler_cricinfo: cricinfo(d.bowler.id),
        bowler_name: d.bowler.name,
        non_striker_id: d.nonStriker?.id ?? null,
        non_striker_name: d.nonStriker?.name ?? null,
        runs_batter: d.runsBatter,
        runs_extras: d.runsExtras,
        runs_total: d.runsTotal,
        extra_type: d.extraType,
        is_wicket: d.wicket != null,
        dismissal_kind: d.wicket?.kind ?? null,
        player_out_id: d.wicket?.playerOut?.id ?? null,
        player_out_name: d.wicket?.playerOut?.name ?? null,
        fielders: d.wicket && d.wicket.fielders.length ? d.wicket.fielders.join(";") : null,
      });
    }
  }

  const match: MatchRow = {
    match_id: parsed.sourceMatchId,
    match_class: matchClass,
    match_type: parsed.matchType,
    gender: parsed.gender,
    season: parsed.season,
    event_name: parsed.eventName,
    event_match_number: parsed.eventMatchNumber,
    venue: parsed.venue,
    city: parsed.city,
    match_date: matchDate,
    team_home: parsed.teams[0] ?? null,
    team_away: parsed.teams[1] ?? null,
    toss_winner: parsed.tossWinner,
    toss_decision: parsed.tossDecision,
    outcome_winner: parsed.outcomeWinner,
    player_of_match: parsed.playerOfMatch.length ? parsed.playerOfMatch.join(";") : null,
    balls_per_over: parsed.ballsPerOver,
    revision: parsed.revision,
  };

  const players: PlayerRow[] = Object.entries(parsed.registry).map(([name, id]) => ({
    cricsheet_id: id,
    name,
    cricinfo_id: peopleIndex.get(id) ?? null,
  }));

  return { match, deliveries, players };
}
