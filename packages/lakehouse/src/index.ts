// @crickverse/lakehouse — free local lakehouse: Cricsheet → Parquet (silver) via
// DuckDB, plus gold aggregate exports to Postgres. See plan: Data Platform.
export {
  flattenMatch,
  deriveMatchClass,
  type PeopleIndex,
  type DeliveryRow,
  type MatchRow,
  type PlayerRow,
  type FlatMatch,
} from "./flatten";
export { ParquetSink, type SinkSummary } from "./sink";
export { buildGold, type BuildGoldResult } from "./gold";
export { buildMatchGold, type BuildMatchGoldResult } from "./gold-matches";
export { computeInningsOvers, type OverPoint, type InningsOversRow } from "./overs";
