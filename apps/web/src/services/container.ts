import { prisma } from "@/infrastructure/prisma";
import { CompetitionRepository } from "@/repositories/competition-repository";
import { MatchRepository } from "@/repositories/match-repository";
import { PlayerRepository } from "@/repositories/player-repository";
import { RankingRepository } from "@/repositories/ranking-repository";
import { StatsRepository } from "@/repositories/stats-repository";
import { TeamRepository } from "@/repositories/team-repository";
import { CompetitionService } from "./competition-service";
import { MatchService } from "./match-service";
import { PlayerService } from "./player-service";
import { RankingService } from "./ranking-service";
import { StatsService } from "./stats-service";
import { TeamService } from "./team-service";

/**
 * Composition root. Wires the Prisma-backed repositories into the application
 * services once and exposes the services as a single container. Server
 * Components and route handlers depend on this — Postgres is the BFF, so reads
 * don't go through an internal REST layer.
 */
function build() {
  const players = new PlayerRepository(prisma);
  const matches = new MatchRepository(prisma);
  const teams = new TeamRepository(prisma);
  const competitions = new CompetitionRepository(prisma);
  const rankings = new RankingRepository(prisma);
  const stats = new StatsRepository(prisma);

  return {
    players: new PlayerService(players),
    matches: new MatchService(matches),
    teams: new TeamService(teams),
    competitions: new CompetitionService(competitions),
    rankings: new RankingService(rankings, players),
    stats: new StatsService(stats),
  } as const;
}

// Reuse one container across hot-reloads (Next.js dev) so the React cache()
// wrappers inside cacheable services keep a stable identity.
const globalForServices = globalThis as unknown as { crickverseServices?: ReturnType<typeof build> };

export const services: ReturnType<typeof build> =
  globalForServices.crickverseServices ?? build();

if (process.env.NODE_ENV !== "production") {
  globalForServices.crickverseServices = services;
}
