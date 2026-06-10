import {
  ParsedScorecardSchema,
  type CrawlJob,
  type ParsedBattingLine,
  type ParsedBowlingLine,
  type ParsedInnings,
  type ParsedScorecard,
} from "@crickverse/types";
import { CricinfoUrls } from "../cricinfo/url-builder";
import type { SourceDescriptor } from "../types";
import { asArray, boolOrNull, numOr, numOrNull, strOrNull } from "../util/coerce";

export interface ScorecardParams extends Record<string, string | number> {
  seriesSlug: string;
  seriesId: string | number;
  matchSlug: string;
  matchId: string | number;
}

/** ESPNCricinfo's dismissalText is an object { short, long, commentary, ... }. */
function dismissalString(d: unknown): string | null {
  if (d == null) return null;
  if (typeof d === "string") return strOrNull(d);
  if (typeof d === "object") {
    const o = d as Record<string, unknown>;
    return strOrNull(o.long ?? o.short ?? o.commentary);
  }
  return null;
}

function mapBatting(b: any): ParsedBattingLine {
  const player = b?.player ?? b?.batsman;
  return {
    sourcePlayerId: numOrNull(player?.objectId),
    name: strOrNull(player?.longName ?? player?.name),
    runs: numOr(b?.runs, 0),
    balls: numOr(b?.balls, 0),
    fours: numOrNull(b?.fours),
    sixes: numOrNull(b?.sixes),
    strikeRate: numOrNull(b?.strikerate ?? b?.strikeRate),
    isOut: boolOrNull(b?.isOut),
    dismissalText: dismissalString(b?.dismissalText),
  };
}

function mapBowling(bw: any): ParsedBowlingLine {
  const player = bw?.player ?? bw?.bowler;
  return {
    sourcePlayerId: numOrNull(player?.objectId),
    name: strOrNull(player?.longName ?? player?.name),
    wickets: numOr(bw?.wickets, 0),
    runs: numOr(bw?.conceded ?? bw?.runs, 0),
    overs: strOrNull(bw?.overs),
    balls: numOrNull(bw?.balls),
    maidens: numOrNull(bw?.maidens),
    economy: numOrNull(bw?.economy),
  };
}

/**
 * scorecard: full-scorecard page for one match. Maps innings -> batting/bowling
 * lines. The exact ESPNCricinfo field names are confirmed against a real
 * scorecard payload in Phase 6; the fallbacks here cover the known variants.
 */
export const scorecardDescriptor: SourceDescriptor<ScorecardParams, ParsedScorecard> = {
  pageType: "scorecard",

  buildUrl: (params) =>
    CricinfoUrls.scorecard(
      String(params.seriesSlug),
      params.seriesId,
      String(params.matchSlug),
      params.matchId,
    ),

  extractPaths: [
    "props.appPageProps.data.content",
    "props.pageProps.appPageProps.data.content",
  ],

  parse(content, params) {
    const c = content as any;
    const rawInnings = asArray<any>(c?.scorecard?.innings ?? c?.innings ?? c?.match?.innings);

    const innings: ParsedInnings[] = rawInnings.map((inn: any, i: number) => ({
      inningsNo: numOr(inn?.inningNumber ?? inn?.inningsNumber, i + 1),
      battingTeamId: numOrNull(inn?.team?.objectId ?? inn?.teamId),
      runs: numOrNull(inn?.runs),
      wickets: numOrNull(inn?.wickets),
      overs: strOrNull(inn?.overs),
      batting: asArray(inn?.inningBatsmen ?? inn?.batsmen ?? inn?.batting).map(mapBatting),
      bowling: asArray(inn?.inningBowlers ?? inn?.bowlers ?? inn?.bowling).map(mapBowling),
    }));

    return { sourceMatchId: Number(params.matchId), innings };
  },

  validate: (entities) => ParsedScorecardSchema.parse(entities),

  // Player-profile fan-out is enabled in Phase 7 once player slugs are confirmed
  // in a real scorecard payload (the profile URL needs a slug, not just an id).
  discover(): CrawlJob[] {
    return [];
  },
};
