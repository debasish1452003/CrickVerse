// Re-export the generated Prisma client types + enums (Match, MatchState, Prisma, ...).
export * from "@prisma/client";

export { prisma } from "./client";
export { persistEntities } from "./persist";

export { upsertSeriesFixtures, getMatchesNeedingScorecard } from "./repositories/match.repo";
export { upsertScorecard } from "./repositories/scorecard.repo";
export { saveSnapshot, findFreshSnapshot, type SaveSnapshotInput } from "./repositories/snapshot.repo";
export {
  upsertScrapeSource,
  getActiveScrapeSources,
  type UpsertSourceInput,
} from "./repositories/sources.repo";

export {
  toMatchFormat,
  toMatchState,
  parseDate,
  toUtcDateOnly,
} from "./mappers/match.mapper";
export {
  resolveSeries,
  resolveTeam,
  resolveVenue,
  resolvePlayer,
  upsertPlayerProfile,
  type Db,
} from "./resolve/resolve";
