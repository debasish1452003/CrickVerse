import type { Prisma } from "@crickverse/db";
import { prisma } from "./db";

// Server-only typed data access. Server Components call these directly —
// Postgres is the BFF, so reads don't go through an internal REST layer.

const matchInclude = {
  series: true,
  venue: true,
  homeTeam: true,
  awayTeam: true,
} satisfies Prisma.MatchInclude;

export type MatchWithRelations = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

export function listMatches(): Promise<MatchWithRelations[]> {
  return prisma.match.findMany({
    include: matchInclude,
    orderBy: [{ startTime: "asc" }],
  });
}

const matchDetailInclude = {
  ...matchInclude,
  innings: {
    orderBy: { inningsNo: "asc" },
    include: {
      battingTeam: true,
      battingPerfs: { orderBy: { battingPos: "asc" }, include: { player: true } },
      bowlingPerfs: { include: { player: true } },
    },
  },
} satisfies Prisma.MatchInclude;

export type MatchDetail = Prisma.MatchGetPayload<{ include: typeof matchDetailInclude }>;

export function getMatchById(id: string): Promise<MatchDetail | null> {
  return prisma.match.findUnique({
    where: { id },
    include: matchDetailInclude,
  });
}
