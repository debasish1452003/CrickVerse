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
 * Resolve a Series from a source id: return the canonical id if the external-id
 * mapping exists (updating fresh fields), otherwise create the canonical row +
 * mapping. Returns null when there's no source id to key on.
 */
export async function resolveSeries(db: Db, source: Source, s: ParsedSeries): Promise<string | null> {
  if (s.sourceSeriesId == null) return null;
  const externalId = String(s.sourceSeriesId);
  const data = {
    name: s.name ?? s.longName ?? s.slug ?? "Unknown series",
    longName: s.longName ?? undefined,
    slug: s.slug ?? undefined,
    season: s.season ?? undefined,
  };
  const existing = await db.seriesExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  if (existing) {
    await db.series.update({ where: { id: existing.seriesId }, data });
    return existing.seriesId;
  }
  const created = await db.series.create({
    data: { ...data, externalIds: { create: { source, externalId } } },
  });
  return created.id;
}

export async function resolveVenue(db: Db, source: Source, v: ParsedVenue): Promise<string | null> {
  if (v.sourceVenueId == null || !v.name) return null;
  const externalId = String(v.sourceVenueId);
  const data = {
    name: v.name,
    city: v.city ?? undefined,
    country: v.country ?? undefined,
    capacity: v.capacity ?? undefined,
  };
  const existing = await db.venueExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  if (existing) {
    await db.venue.update({ where: { id: existing.venueId }, data });
    return existing.venueId;
  }
  const created = await db.venue.create({
    data: { ...data, externalIds: { create: { source, externalId } } },
  });
  return created.id;
}

export async function resolveTeam(db: Db, source: Source, t: ParsedTeamRef): Promise<string | null> {
  if (t.sourceTeamId == null) return null;
  const externalId = String(t.sourceTeamId);
  const data = {
    name: t.name ?? t.shortName ?? "Unknown team",
    shortName: t.shortName ?? undefined,
    primaryColor: t.primaryColor ?? undefined,
    imageUrl: t.imageUrl ?? undefined,
  };
  const existing = await db.teamExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  if (existing) {
    await db.team.update({ where: { id: existing.teamId }, data });
    return existing.teamId;
  }
  const created = await db.team.create({
    data: { ...data, externalIds: { create: { source, externalId } } },
  });
  return created.id;
}

/**
 * Resolve a Player from a source id + best-known name. Creates a needsReview
 * row when only an id is known (name backfilled later via player-profile).
 */
export async function resolvePlayer(
  db: Db,
  source: Source,
  sourcePlayerId: number | null,
  name: string | null,
): Promise<string | null> {
  if (sourcePlayerId == null) return null;
  const externalId = String(sourcePlayerId);
  const existing = await db.playerExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  if (existing) {
    if (name) await db.player.update({ where: { id: existing.playerId }, data: { fullName: name } });
    return existing.playerId;
  }
  const created = await db.player.create({
    data: {
      fullName: name ?? "Unknown player",
      needsReview: name == null,
      externalIds: { create: { source, externalId } },
    },
  });
  return created.id;
}

export async function upsertPlayerProfile(
  db: Db,
  source: Source,
  p: ParsedPlayer,
): Promise<string> {
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
    return existing.playerId;
  }
  const created = await db.player.create({
    data: { ...data, externalIds: { create: { source, externalId } } },
  });
  return created.id;
}
