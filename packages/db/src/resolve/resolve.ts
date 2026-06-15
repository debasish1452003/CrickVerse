import type {
  ParsedPlayer,
  ParsedSeries,
  ParsedTeamRef,
  ParsedVenue,
} from "@crickverse/types";
import { type Prisma, type PrismaClient, Source } from "@prisma/client";

/** Accepts either the client or a transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * In-process resolution memo. A canonical entity id, once assigned to a
 * (source, externalId) pair, never changes — so caching it is safe and cuts
 * thousands of redundant SELECTs during a crawl.
 *
 * IMPORTANT: resolvers must never DEGRADE existing data. A scorecard resolves a
 * team/player by id only (no name), so updates only ever write fields that have
 * a real value — they never overwrite a good name with a placeholder.
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

  const name = s.name ?? s.longName ?? s.slug ?? null;
  const update: Prisma.SeriesUpdateInput = {};
  if (name) update.name = name;
  if (s.longName) update.longName = s.longName;
  if (s.slug) update.slug = s.slug;
  if (s.season) update.season = s.season;

  const existing = await db.seriesExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  let id: string;
  if (existing) {
    if (Object.keys(update).length) await db.series.update({ where: { id: existing.seriesId }, data: update });
    id = existing.seriesId;
  } else {
    const created = await db.series.create({
      data: {
        name: name ?? "Unknown series",
        longName: s.longName ?? undefined,
        slug: s.slug ?? undefined,
        season: s.season ?? undefined,
        externalIds: { create: { source, externalId } },
      },
    });
    id = created.id;
  }
  seriesCache.set(k, id);
  return id;
}

export async function resolveVenue(db: Db, source: Source, v: ParsedVenue): Promise<string | null> {
  if (v.sourceVenueId == null) return null;
  const externalId = String(v.sourceVenueId);
  const k = cacheKey(source, externalId);
  const hit = venueCache.get(k);
  if (hit) return hit;

  const update: Prisma.VenueUpdateInput = {};
  if (v.name) update.name = v.name;
  if (v.city) update.city = v.city;
  if (v.country) update.country = v.country;
  if (v.capacity != null) update.capacity = v.capacity;

  const existing = await db.venueExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  let id: string;
  if (existing) {
    if (Object.keys(update).length) await db.venue.update({ where: { id: existing.venueId }, data: update });
    id = existing.venueId;
  } else {
    const created = await db.venue.create({
      data: {
        name: v.name ?? "Unknown venue",
        city: v.city ?? undefined,
        country: v.country ?? undefined,
        capacity: v.capacity ?? undefined,
        needsReview: v.name == null,
        externalIds: { create: { source, externalId } },
      },
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

  const name = t.name ?? t.shortName ?? null;
  const update: Prisma.TeamUpdateInput = {};
  if (name) update.name = name;
  if (t.shortName) update.shortName = t.shortName;
  if (t.primaryColor) update.primaryColor = t.primaryColor;
  if (t.imageUrl) update.imageUrl = t.imageUrl;

  const existing = await db.teamExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  let id: string;
  if (existing) {
    if (Object.keys(update).length) await db.team.update({ where: { id: existing.teamId }, data: update });
    id = existing.teamId;
  } else {
    const created = await db.team.create({
      data: {
        name: name ?? "Unknown team",
        shortName: t.shortName ?? undefined,
        primaryColor: t.primaryColor ?? undefined,
        imageUrl: t.imageUrl ?? undefined,
        needsReview: name == null,
        externalIds: { create: { source, externalId } },
      },
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
  return resolvePlayerByExternalId(
    db,
    source,
    sourcePlayerId == null ? null : String(sourcePlayerId),
    name,
  );
}

/** Resolve a player by an arbitrary string external id (ESPNCricinfo objectId or Cricsheet id). */
export async function resolvePlayerByExternalId(
  db: Db,
  source: Source,
  externalId: string | null,
  name: string | null,
): Promise<string | null> {
  if (!externalId) return null;
  const k = cacheKey(source, externalId);
  const hit = playerCache.get(k);
  if (hit) return hit;

  const existing = await db.playerExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  let id: string;
  if (existing) {
    if (name) await db.player.update({ where: { id: existing.playerId }, data: { fullName: name, needsReview: false } });
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

/**
 * Resolve a Cricsheet player to a canonical row, reconciling with ESPNCricinfo
 * via the people.csv `key_cricinfo` so the SAME human is one canonical Player no
 * matter which source ingested first:
 *   1. an existing (CRICSHEET, id) mapping — reuse it;
 *   2. else an existing (CRICINFO, keyCricinfo) row — reuse it and attach the Cricsheet id;
 *   3. else a brand-new row, dual-keyed with both ids when keyCricinfo is known.
 * Unregistered players (no Cricsheet id) fall back to a name-derived key.
 */
export async function resolveCricsheetPlayer(
  db: Db,
  ref: { id: string | null; name: string },
  keyCricinfo: string | null,
): Promise<string> {
  const externalId = ref.id ?? `name:${ref.name}`;
  const k = cacheKey(Source.CRICSHEET, externalId);
  const hit = playerCache.get(k);
  if (hit) return hit;

  const existingCs = await db.playerExternalId.findUnique({
    where: { source_externalId: { source: Source.CRICSHEET, externalId } },
  });
  if (existingCs) {
    await db.player.update({
      where: { id: existingCs.playerId },
      data: { fullName: ref.name, needsReview: false },
    });
    playerCache.set(k, existingCs.playerId);
    return existingCs.playerId;
  }

  let playerId: string | null = null;
  if (keyCricinfo) {
    const existingCi = await db.playerExternalId.findUnique({
      where: { source_externalId: { source: Source.CRICINFO, externalId: keyCricinfo } },
    });
    if (existingCi) {
      playerId = existingCi.playerId;
      await db.playerExternalId.create({
        data: { source: Source.CRICSHEET, externalId, playerId },
      });
    }
  }

  if (!playerId) {
    const created = await db.player.create({
      data: {
        fullName: ref.name,
        externalIds: {
          create: [
            { source: Source.CRICSHEET, externalId },
            ...(keyCricinfo ? [{ source: Source.CRICINFO, externalId: keyCricinfo }] : []),
          ],
        },
      },
    });
    playerId = created.id;
  }

  playerCache.set(k, playerId);
  return playerId;
}

/** Resolve a team by name (Cricsheet has no team ids). The name is the source key. */
export async function resolveTeamByName(
  db: Db,
  source: Source,
  name: string | null,
  opts: { isNational?: boolean } = {},
): Promise<string | null> {
  if (!name) return null;
  const k = cacheKey(source, name);
  const hit = teamCache.get(k);
  if (hit) return hit;

  const existing = await db.teamExternalId.findUnique({
    where: { source_externalId: { source, externalId: name } },
  });
  let id: string;
  if (existing) {
    id = existing.teamId;
  } else {
    const created = await db.team.create({
      data: {
        name,
        isNational: opts.isNational ?? false,
        externalIds: { create: { source, externalId: name } },
      },
    });
    id = created.id;
  }
  teamCache.set(k, id);
  return id;
}

/** Resolve a venue by name (Cricsheet has no venue ids). */
export async function resolveVenueByName(
  db: Db,
  source: Source,
  name: string | null,
  city: string | null = null,
): Promise<string | null> {
  if (!name) return null;
  const k = cacheKey(source, name);
  const hit = venueCache.get(k);
  if (hit) return hit;

  const existing = await db.venueExternalId.findUnique({
    where: { source_externalId: { source, externalId: name } },
  });
  let id: string;
  if (existing) {
    if (city) await db.venue.update({ where: { id: existing.venueId }, data: { city } });
    id = existing.venueId;
  } else {
    const created = await db.venue.create({
      data: {
        name,
        city: city ?? undefined,
        externalIds: { create: { source, externalId: name } },
      },
    });
    id = created.id;
  }
  venueCache.set(k, id);
  return id;
}

/** Resolve a season-specific series by name (Cricsheet has no series ids); keyed by name+season. */
export async function resolveSeriesByName(
  db: Db,
  source: Source,
  name: string | null,
  season: string | null = null,
  format?: Prisma.SeriesCreateInput["format"],
): Promise<string | null> {
  if (!name) return null;
  const externalId = season ? `${name}|${season}` : name;
  const k = cacheKey(source, externalId);
  const hit = seriesCache.get(k);
  if (hit) return hit;

  const existing = await db.seriesExternalId.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  let id: string;
  if (existing) {
    id = existing.seriesId;
  } else {
    const created = await db.series.create({
      data: {
        name,
        season: season ?? undefined,
        format: format ?? undefined,
        externalIds: { create: { source, externalId } },
      },
    });
    id = created.id;
  }
  seriesCache.set(k, id);
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
    await upsertGoldPlayerProfiles(db, externalId, p);
    playerCache.set(cacheKey(source, externalId), existing.playerId);
    return existing.playerId;
  }
  const created = await db.player.create({
    data: { ...data, externalIds: { create: { source, externalId } } },
  });
  await upsertGoldPlayerProfiles(db, externalId, p);
  playerCache.set(cacheKey(source, externalId), created.id);
  return created.id;
}

async function upsertGoldPlayerProfiles(db: Db, cricinfoId: string, p: ParsedPlayer): Promise<void> {
  const rows = await db.careerPlayer.findMany({
    where: { cricinfoId },
    select: { cricsheetId: true },
  });
  for (const row of rows) {
    await db.playerProfile.upsert({
      where: { cricsheetId: row.cricsheetId },
      create: {
        cricsheetId: row.cricsheetId,
        cricinfoId,
        role: p.role ?? undefined,
        battingStyle: p.battingStyle ?? undefined,
        bowlingStyle: p.bowlingStyle ?? undefined,
        enrichedAt: new Date(),
      },
      update: {
        cricinfoId,
        role: p.role ?? undefined,
        battingStyle: p.battingStyle ?? undefined,
        bowlingStyle: p.bowlingStyle ?? undefined,
        enrichedAt: new Date(),
      },
    });
  }
}
