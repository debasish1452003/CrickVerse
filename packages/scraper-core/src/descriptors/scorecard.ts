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
import { numOr, numOrNull, strOrNull } from "../util/coerce";

export interface ScorecardParams extends Record<string, string | number> {
  seriesSlug: string;
  seriesId: string | number;
  matchSlug: string;
  matchId: string | number;
}

function mapBatting(b: any): ParsedBattingLine {
  return {
    sourcePlayerId: numOrNull(b?.batsman?.objectId ?? b?.player?.objectId),
    name: strOrNull(b?.batsman?.longName ?? b?.player?.longName ?? b?.name),
    runs: numOr(b?.runs, 0),
    balls: numOr(b?.balls, 0),
    fours: numOrNull(b?.fours),
    sixes: numOrNull(b?.sixes),
  };
}

function mapBowling(bw: any): ParsedBowlingLine {
  return {
    sourcePlayerId: numOrNull(bw?.bowler?.objectId ?? bw?.player?.objectId),
    name: strOrNull(bw?.bowler?.longName ?? bw?.player?.longName ?? bw?.name),
    wickets: numOr(bw?.wickets, 0),
    runs: numOr(bw?.conceded ?? bw?.runs, 0),
    overs: strOrNull(bw?.overs),
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
    const rawInnings: any[] =
      c?.scorecard?.innings ?? c?.innings ?? c?.match?.innings ?? [];

    const innings: ParsedInnings[] = rawInnings.map((inn: any, i: number) => ({
      inningsNo: numOr(inn?.inningNumber ?? inn?.inningsNumber, i + 1),
      battingTeamId: numOrNull(inn?.team?.objectId ?? inn?.teamId),
      runs: numOrNull(inn?.runs),
      wickets: numOrNull(inn?.wickets),
      overs: strOrNull(inn?.overs),
      batting: (Array.isArray(inn?.batsmen) ? inn.batsmen : inn?.batting ?? []).map(mapBatting),
      bowling: (Array.isArray(inn?.bowlers) ? inn.bowlers : inn?.bowling ?? []).map(mapBowling),
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
