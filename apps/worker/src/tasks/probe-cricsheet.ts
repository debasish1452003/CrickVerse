import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseCricsheetMatch } from "@crickverse/scraper-core";
import { createLogger } from "../logger";

/**
 * Parse one local Cricsheet match JSON and print a summary + the first few
 * Delivery rows it WOULD write — no network, no DB. The "does this file parse?"
 * check, mirroring `probe-series` for ESPNCricinfo. Download a sample from
 * https://cricsheet.org/downloads/ (e.g. a single IPL match json) and point at it.
 */
export function probeCricsheet(input: { file: string }): void {
  const logger = createLogger("cricsheet-probe");
  const raw = JSON.parse(readFileSync(input.file, "utf8")) as unknown;
  const sourceMatchId = basename(input.file).replace(/\.json$/i, "");

  const match = parseCricsheetMatch(raw, sourceMatchId);

  const totalDeliveries = match.innings.reduce((n, inn) => n + inn.deliveries.length, 0);
  const knownPlayers = Object.keys(match.registry).length;

  logger.info(`✅ parsed match ${match.sourceMatchId}`, {
    event: match.eventName,
    type: match.matchType,
    season: match.season,
    teams: match.teams,
    venue: match.venue,
    innings: match.innings.length,
    deliveries: totalDeliveries,
    registryPlayers: knownPlayers,
  });

  for (const inn of match.innings) {
    logger.info(`innings ${inn.inningsNo}: ${inn.battingTeam}`, {
      runs: inn.runs,
      wickets: inn.wickets,
      legalBalls: inn.legalBalls,
      deliveries: inn.deliveries.length,
    });
  }

  // Show the first innings' opening deliveries as they'd land in the Delivery table.
  const sample = match.innings[0]?.deliveries.slice(0, 6) ?? [];
  logger.info(`sample Delivery rows (innings 1, first ${sample.length})`);
  for (const d of sample) {
    const over = `${d.overNo}.${d.ballInOver}`;
    const wkt = d.wicket ? ` WICKET ${d.wicket.kind} (${d.wicket.playerOut?.name ?? "?"})` : "";
    const extra = d.extraType ? ` +${d.extraType}` : "";
    logger.info(
      `  ${over} ${d.bowler.name} to ${d.batter.name}: ${d.runsTotal} run(s)${extra}${wkt}`,
      { batterId: d.batter.id, bowlerId: d.bowler.id },
    );
  }
}
