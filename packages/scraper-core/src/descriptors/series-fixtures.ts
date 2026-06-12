import {
  ParsedSeriesFixturesSchema,
  type CrawlJob,
  type ParsedMatch,
  type ParsedSeries,
  type ParsedSeriesFixtures,
  type ParsedTeamRef,
  type ParsedVenue,
} from "@crickverse/types";
import { CricinfoUrls } from "../cricinfo/url-builder";
import type { SourceDescriptor } from "../types";
import { boolOrNull, numOrNull, strOrNull } from "../util/coerce";

export interface SeriesFixturesParams extends Record<string, string | number> {
  slug: string;
  objectId: string | number;
}

function mapSeries(s: any, params: SeriesFixturesParams): ParsedSeries {
  return {
    sourceSeriesId: numOrNull(s?.objectId ?? s?.id) ?? numOrNull(params.objectId),
    slug: strOrNull(s?.slug) ?? strOrNull(params.slug),
    name: strOrNull(s?.name),
    longName: strOrNull(s?.longName),
    season: strOrNull(s?.season ?? s?.year),
  };
}

function mapVenue(g: any): ParsedVenue {
  return {
    sourceVenueId: numOrNull(g?.objectId ?? g?.id),
    name: strOrNull(g?.name ?? g?.longName),
    city: strOrNull(g?.town?.name),
    country: strOrNull(g?.country?.name),
    capacity: numOrNull(g?.capacity),
  };
}

function mapTeam(side: any): ParsedTeamRef {
  const team = side?.team ?? {};
  return {
    sourceTeamId: numOrNull(team.objectId ?? team.id),
    name: strOrNull(team.longName ?? team.name),
    shortName: strOrNull(team.abbreviation ?? team.name),
    score: strOrNull(side?.score),
    isHome: boolOrNull(side?.isHome),
    primaryColor: strOrNull(team.primaryColor),
    imageUrl: strOrNull(team.imageUrl),
  };
}

function tossDecision(choice: unknown): "BAT" | "FIELD" | null {
  if (choice === 1 || choice === "1") return "BAT";
  if (choice === 2 || choice === "2") return "FIELD";
  return null;
}

function mapMatch(m: any, params: SeriesFixturesParams): ParsedMatch {
  const floodlit = strOrNull(m?.floodlit);
  return {
    sourceMatchId: Number(m?.objectId),
    slug: strOrNull(m?.slug),
    title: strOrNull(m?.title),
    format: strOrNull(m?.format),
    state: m?.state === "PRE" || m?.state === "LIVE" || m?.state === "POST" ? m.state : null,
    stage: strOrNull(m?.stage),
    statusText: strOrNull(m?.statusText ?? m?.status),
    startTime: strOrNull(m?.startTime ?? m?.startDate),
    season: strOrNull(m?.season),
    dayNight: floodlit === null ? null : floodlit === "night" || floodlit === "day/night",
    isCancelled: boolOrNull(m?.isCancelled),
    series: mapSeries(m?.series, params),
    venue: mapVenue(m?.ground),
    teams: Array.isArray(m?.teams) ? m.teams.map(mapTeam) : [],
    result: {
      winnerTeamId: numOrNull(m?.winnerTeamId),
      tossWinnerTeamId: numOrNull(m?.tossWinnerTeamId),
      tossDecision: tossDecision(m?.tossWinnerChoice),
    },
    flags: {
      hasScorecard: boolOrNull(m?.hasScorecard),
      hasCommentary: boolOrNull(m?.hasCommentary),
    },
  };
}

/**
 * series-fixtures: the seed page. Parses every match in a series and, via
 * `discover`, fans out one scorecard job per match. This is where the crawl
 * starts — register a series and the rest of the tree follows.
 */
export const seriesFixturesDescriptor: SourceDescriptor<SeriesFixturesParams, ParsedSeriesFixtures> = {
  pageType: "series-fixtures",

  buildUrl: (params) => CricinfoUrls.seriesFixtures(String(params.slug), params.objectId),

  extractPaths: [
    "props.appPageProps.data.content",
    "props.pageProps.appPageProps.data.content",
  ],

  parse(content, params) {
    const c = content as any;
    const rawMatches: any[] = Array.isArray(c?.matches) ? c.matches : [];
    const matches = rawMatches
      .filter((m) => m?.objectId != null)
      .map((m) => mapMatch(m, params));

    const series: ParsedSeries =
      matches[0]?.series ?? mapSeries(undefined, params);

    return { series, matches };
  },

  validate: (entities) => ParsedSeriesFixturesSchema.parse(entities),

  discover(entities, ctx) {
    const jobs: CrawlJob[] = [];
    for (const m of entities.matches) {
      if (m.flags.hasScorecard !== true) continue;
      const isLive = m.state === "LIVE";
      // LIVE mode only re-scrapes in-progress matches; HISTORICAL takes them all once.
      if (ctx.mode === "LIVE" && !isLive) continue;
      if (!m.slug || !m.series.slug || m.series.sourceSeriesId == null) continue;

      jobs.push({
        pageType: "scorecard",
        params: {
          seriesSlug: m.series.slug,
          seriesId: m.series.sourceSeriesId,
          matchSlug: m.slug,
          matchId: m.sourceMatchId,
        },
        mode: ctx.mode,
        depth: ctx.depth + 1,
        reason: "discovered-from:series-fixtures",
        forceRefetch: isLive,
      });
    }
    return jobs;
  },
};
