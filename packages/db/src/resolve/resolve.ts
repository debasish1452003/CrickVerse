import type {
  ParsedPlayer,
  ParsedSeries,
  ParsedTeamRef,
  ParsedVenue,
} from "@crickverse/types";
import type { Prisma, PrismaClient, Source } from "@prisma/client";

/** Accepts either the client or a transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * In-process resolution memo. A canonical entity id, once assigned to a
 * (source, externalId) pair, never changes — so caching it is safe and cuts
 * thousands of redundant SELECTs during a crawl (e.g. the same 10 IPL teams /
 * 250 players resolved across 74 matches resolve to one DB hit each).
 */
const seriesCache = new Map<string, string>();
const venueCache = new Map<string, string>();
const teamCache = new Map<string, string>();
const playerCache = new Map<string, string>();
const cacheKey = (source: Source, externalId: string) => `${source}:${externalId}`;

export async function resolveSeries(db: Db, source: Source, s: ParsedSeries): Promise<string | null> {
  if (s.sourceSeriesId == null) return null;
  const externalId = String(s.sourceSeriesId);
  const k = cacheKey(source, externalId);
  const hit = seriesCache.get(k);
  if (hit) return hit;

  const data = {
    name: s.name ?? s.longName ?? s.slug ?? "Unknown series",
    longName: s.longName ?? undefined,
    slug: s.slug ?? undefined,
    season: s.season ?? undefined,
  };
  const existing = await db.seriesExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  let id: string;
  if (existing) {
    await db.series.update({ where: { id: existing.seriesId }, data });
    id = existing.seriesId;
  } else {
    const created = await db.series.create({
      data: { ...data, externalIds: { create: { source, externalId } } },
    });
    id = created.id;
  }
  seriesCache.set(k, id);
  return id;
}

export async function resolveVenue(db: Db, source: Source, v: ParsedVenue): Promise<string | null> {
  if (v.sourceVenueId == null || !v.name) return null;
  const externalId = String(v.sourceVenueId);
  const k = cacheKey(source, externalId);
  const hit = venueCache.get(k);
  if (hit) return hit;

  const data = {
    name: v.name,
    city: v.city ?? undefined,
    country: v.country ?? undefined,
    capacity: v.capacity ?? undefined,
  };
  const existing = await db.venueExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  let id: string;
  if (existing) {
    await db.venue.update({ where: { id: existing.venueId }, data });
    id = existing.venueId;
  } else {
    const created = await db.venue.create({
      data: { ...data, externalIds: { create: { source, externalId } } },
    });
    id = created.id;
  }
  venueCache.set(k, id);
  return id;
}

export async function resolveTeam(db: Db, source: Source, t: ParsedTeamRef): Promise<string | null> {
  if (t.sourceTeamId == null) return null;
  const externalId = String(t.sourceTeamId);
  const k = cacheKey(source, externalId);
  const hit = teamCache.get(k);
  if (hit) return hit;

  const data = {
    name: t.name ?? t.shortName ?? "Unknown team",
    shortName: t.shortName ?? undefined,
    primaryColor: t.primaryColor ?? undefined,
    imageUrl: t.imageUrl ?? undefined,
  };
  const existing = await db.teamExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  let id: string;
  if (existing) {
    await db.team.update({ where: { id: existing.teamId }, data });
    id = existing.teamId;
  } else {
    const created = await db.team.create({
      data: { ...data, externalIds: { create: { source, externalId } } },
    });
    id = created.id;
  }
  teamCache.set(k, id);
  return id;
}

export async function resolvePlayer(
  db: Db,
  source: Source,
  sourcePlayerId: number | null,
  name: string | null,
): Promise<string | null> {
  if (sourcePlayerId == null) return null;
  const externalId = String(sourcePlayerId);
  const k = cacheKey(source, externalId);
  const hit = playerCache.get(k);
  if (hit) return hit;

  const existing = await db.playerExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  let id: string;
  if (existing) {
    if (name) await db.player.update({ where: { id: existing.playerId }, data: { fullName: name } });
    id = existing.playerId;
  } else {
    const created = await db.player.create({
      data: {
        fullName: name ?? "Unknown player",
        needsReview: name == null,
        externalIds: { create: { source, externalId } },
      },
    });
    id = created.id;
  }
  playerCache.set(k, id);
  return id;
}

export async function upsertPlayerProfile(db: Db, source: Source, p: ParsedPlayer): Promise<string> {
  const externalId = String(p.sourcePlayerId);
  const data = {
    fullName: p.name ?? "Unknown player",
    country: p.country ?? undefined,
    role: p.role ?? undefined,
    battingStyle: p.battingStyle ?? undefined,
    bowlingStyle: p.bowlingStyle ?? undefined,
    needsReview: false,
  };
  const existing = await db.playerExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  if (existing) {
    await db.player.update({ where: { id: existing.playerId }, data });
    playerCache.set(cacheKey(source, externalId), existing.playerId);
    return existing.playerId;
  }
  const created = await db.player.create({
    data: { ...data, externalIds: { create: { source, externalId } } },
  });
  playerCache.set(cacheKey(source, externalId), created.id);
  return created.id;
}
