import {
  ParsedPlayerSchema,
  type CrawlJob,
  type ParsedPlayer,
} from "@crickverse/types";
import { CricinfoUrls } from "../cricinfo/url-builder";
import type { SourceDescriptor } from "../types";
import { numOrNull, strOrNull } from "../util/coerce";

export interface PlayerProfileParams extends Record<string, string | number> {
  slug: string;
  objectId: string | number;
}

/**
 * player-profile: a leaf page (discover returns []) — it terminates the crawl.
 * Fleshed out in Phase 7 against a real cricketer payload.
 */
export const playerProfileDescriptor: SourceDescriptor<PlayerProfileParams, ParsedPlayer> = {
  pageType: "player-profile",

  buildUrl: (params) => CricinfoUrls.playerProfile(String(params.slug), params.objectId),

  extractPaths: [
    "props.appPageProps.data.player",
    "props.appPageProps.data.content.player",
    "props.pageProps.appPageProps.data.player",
  ],

  parse(content, params) {
    const p = content as any;
    return {
      sourcePlayerId: numOrNull(p?.objectId ?? p?.id) ?? Number(params.objectId),
      name: strOrNull(p?.longName ?? p?.name),
      country: strOrNull(p?.country?.name ?? p?.teamName),
      role: strOrNull(p?.playingRole ?? p?.role),
      battingStyle: strOrNull(p?.longBattingStyles?.[0] ?? p?.battingStyle),
      bowlingStyle: strOrNull(p?.longBowlingStyles?.[0] ?? p?.bowlingStyle),
    };
  },

  validate: (entities) => ParsedPlayerSchema.parse(entities),

  discover(): CrawlJob[] {
    return [];
  },
};
