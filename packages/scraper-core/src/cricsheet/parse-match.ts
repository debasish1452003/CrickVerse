import {
  ParsedCricsheetMatchSchema,
  type CricsheetPlayerRef,
  type ParsedCricsheetDelivery,
  type ParsedCricsheetInnings,
  type ParsedCricsheetMatch,
} from "@crickverse/types";
import { asArray, numOr, numOrNull, strOrNull } from "../util/coerce";

/**
 * Parse one raw Cricsheet match JSON (https://cricsheet.org/format/json/) into
 * the normalized {@link ParsedCricsheetMatch}. Pure and offline — no network, no
 * DB. The Cricsheet match id is the file name stem, which is NOT inside the
 * payload, so it is passed in (mirrors how the scorecard descriptor takes
 * matchId as a param).
 *
 * Players are referenced by name throughout the file; we attach the registry id
 * (info.registry.people[name]) to every reference so the db layer can resolve a
 * stable canonical player even before the people.csv reconcile runs.
 */
export function parseCricsheetMatch(raw: unknown, sourceMatchId: string): ParsedCricsheetMatch {
  const root = (raw ?? {}) as Record<string, unknown>;
  const info = (root.info ?? {}) as Record<string, unknown>;
  const meta = (root.meta ?? {}) as Record<string, unknown>;

  const registry = readRegistry(info);
  const ref = (name: unknown): CricsheetPlayerRef | null => {
    const n = strOrNull(name);
    if (!n) return null;
    return { id: registry[n] ?? null, name: n };
  };

  const ballsPerOver = numOr(info.balls_per_over, 6);
  const innings = asArray<Record<string, unknown>>(root.innings).map((inn, idx) =>
    parseInnings(inn, idx + 1, ref, ballsPerOver),
  );

  const event = (info.event ?? {}) as Record<string, unknown>;
  const toss = (info.toss ?? {}) as Record<string, unknown>;
  const outcome = (info.outcome ?? {}) as Record<string, unknown>;
  const tossDecisionRaw = strOrNull(toss.decision)?.toLowerCase();

  const parsed: ParsedCricsheetMatch = {
    sourceMatchId,
    revision: Math.max(1, numOr(meta.revision, 1)),
    matchType: strOrNull(info.match_type),
    teamType: strOrNull(info.team_type),
    gender: strOrNull(info.gender),
    season: strOrNull(info.season),
    dates: asArray<unknown>(info.dates).map((d) => String(d)),
    eventName: strOrNull(event.name),
    eventMatchNumber: numOrNull(event.match_number),
    venue: strOrNull(info.venue),
    city: strOrNull(info.city),
    teams: asArray<unknown>(info.teams).map((t) => String(t)),
    tossWinner: strOrNull(toss.winner),
    tossDecision: tossDecisionRaw === "bat" || tossDecisionRaw === "field" ? tossDecisionRaw : null,
    outcomeWinner: strOrNull(outcome.winner),
    playerOfMatch: asArray<unknown>(info.player_of_match).map((p) => String(p)),
    ballsPerOver,
    players: readPlayers(info),
    registry,
    innings,
  };

  return ParsedCricsheetMatchSchema.parse(parsed);
}

function readRegistry(info: Record<string, unknown>): Record<string, string> {
  const reg = (info.registry ?? {}) as Record<string, unknown>;
  const people = (reg.people ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [name, id] of Object.entries(people)) {
    const sid = strOrNull(id);
    if (name && sid) out[name] = sid;
  }
  return out;
}

function readPlayers(info: Record<string, unknown>): Record<string, string[]> {
  const players = (info.players ?? {}) as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [team, list] of Object.entries(players)) {
    out[team] = asArray<unknown>(list).map((p) => String(p));
  }
  return out;
}

function parseInnings(
  inn: Record<string, unknown>,
  inningsNo: number,
  ref: (name: unknown) => CricsheetPlayerRef | null,
  _ballsPerOver: number,
): ParsedCricsheetInnings {
  const battingTeam = strOrNull(inn.team) ?? "Unknown team";
  const deliveries: ParsedCricsheetDelivery[] = [];
  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;

  for (const over of asArray<Record<string, unknown>>(inn.overs)) {
    const overNo = numOr(over.over, 0);
    let ballInOver = 0;
    for (const d of asArray<Record<string, unknown>>(over.deliveries)) {
      ballInOver += 1;
      const runsObj = (d.runs ?? {}) as Record<string, unknown>;
      const extrasObj = (d.extras ?? {}) as Record<string, unknown>;
      const extraType = firstKey(extrasObj);
      const batter = ref(d.batter) ?? { id: null, name: "Unknown batter" };
      const bowler = ref(d.bowler) ?? { id: null, name: "Unknown bowler" };

      const runsBatter = numOr(runsObj.batter, 0);
      const runsExtras = numOr(runsObj.extras, 0);
      const runsTotal = numOr(runsObj.total, runsBatter + runsExtras);
      runs += runsTotal;

      // Wides and no-balls do not count as a legal ball faced/bowled.
      const isLegal = extraType !== "wides" && extraType !== "noballs";
      if (isLegal) legalBalls += 1;

      const wicket = parseWicket(d.wickets, ref);
      if (wicket) wickets += 1;

      deliveries.push({
        inningsNo,
        overNo,
        ballInOver,
        batter,
        bowler,
        nonStriker: ref(d.non_striker),
        runsBatter,
        runsExtras,
        runsTotal,
        extraType,
        wicket,
      });
    }
  }

  return { inningsNo, battingTeam, runs, wickets, legalBalls, deliveries };
}

/** Cricsheet records 0+ wickets per delivery (usually one). We take the first. */
function parseWicket(
  raw: unknown,
  ref: (name: unknown) => CricsheetPlayerRef | null,
): ParsedCricsheetDelivery["wicket"] {
  const w = asArray<Record<string, unknown>>(raw)[0];
  if (!w) return null;
  const fielders = asArray<Record<string, unknown>>(w.fielders)
    .map((f) => strOrNull(f.name))
    .filter((n): n is string => n != null);
  return {
    kind: strOrNull(w.kind) ?? "unknown",
    playerOut: ref(w.player_out),
    fielders,
  };
}

/** The first present key of an extras object ("wides" | "noballs" | "byes" | ...). */
function firstKey(obj: Record<string, unknown>): string | null {
  for (const k of Object.keys(obj)) return k;
  return null;
}
