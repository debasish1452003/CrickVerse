import { prisma } from "@crickverse/db";
import { createLogger } from "../logger";
import {
  fetchCommonsLicenses,
  queryPlayersByCricinfoIds,
  sleep,
  type WikidataPlayer,
} from "../enrich/wikidata";

export interface EnrichPlayersResult {
  candidates: number;
  queried: number;
  matched: number;
  withPhoto: number;
  written: number;
}

const SPARQL_BATCH = 150; // cricinfoIds per SPARQL query

/**
 * Enrich gold players with Wikidata bio + Wikimedia Commons photos, keyed by the
 * ESPNcricinfo id already on CareerPlayer. Writes a PlayerProfile row per player
 * processed (matched players get photo/DOB/birthplace/role; unmatched get just a
 * stamp so incremental runs skip them). `--force` re-checks everyone. Image
 * author/license is fetched from Commons for CC-BY-SA attribution.
 */
export async function enrichPlayers(opts: {
  dryRun?: boolean;
  force?: boolean;
  limit?: number;
} = {}): Promise<EnrichPlayersResult> {
  const log = createLogger("enrich-players");

  // Candidate players (have the Wikidata join key).
  const players = await prisma.careerPlayer.findMany({
    where: { cricinfoId: { not: null } },
    select: { cricsheetId: true, cricinfoId: true },
    orderBy: { careerRuns: "desc" }, // enrich the most prominent players first
  });

  // Skip already-enriched unless forcing.
  let pending = players;
  if (!opts.force) {
    const done = await prisma.playerProfile.findMany({
      where: { enrichedAt: { not: null } },
      select: { cricsheetId: true },
    });
    const doneSet = new Set(done.map((d) => d.cricsheetId));
    pending = players.filter((p) => !doneSet.has(p.cricsheetId));
  }
  if (opts.limit) pending = pending.slice(0, opts.limit);

  const result: EnrichPlayersResult = {
    candidates: pending.length,
    queried: 0,
    matched: 0,
    withPhoto: 0,
    written: 0,
  };
  log.info("starting", { totalCandidates: players.length, pending: pending.length, dryRun: !!opts.dryRun });
  if (pending.length === 0) return result;

  // cricinfoId → cricsheetIds (usually 1:1, but be safe).
  const byCricinfo = new Map<string, string[]>();
  for (const p of pending) {
    const arr = byCricinfo.get(p.cricinfoId!) ?? [];
    arr.push(p.cricsheetId);
    byCricinfo.set(p.cricinfoId!, arr);
  }
  const cricinfoIds = [...byCricinfo.keys()];

  for (let i = 0; i < cricinfoIds.length; i += SPARQL_BATCH) {
    const chunk = cricinfoIds.slice(i, i + SPARQL_BATCH);
    result.queried += chunk.length;

    let found: Map<string, WikidataPlayer>;
    try {
      found = await queryPlayersByCricinfoIds(chunk);
    } catch (err) {
      log.warn("SPARQL batch failed; skipping", { from: i, err: (err as Error).message });
      await sleep(1500);
      continue;
    }

    // Attribution: fetch license/author for the images in this batch.
    const files = [...found.values()].map((v) => v.imageFile).filter((f): f is string => !!f);
    const licenses = await fetchCommonsLicenses(files);

    // Build the rows for this batch.
    const now = new Date();
    const rows: { cricsheetId: string; cricinfoId: string; data: WikidataPlayer | null }[] = [];
    for (const cid of chunk) {
      const wd = found.get(cid) ?? null;
      if (wd) result.matched += 1;
      if (wd?.photoUrl) result.withPhoto += 1;
      for (const cricsheetId of byCricinfo.get(cid)!) rows.push({ cricsheetId, cricinfoId: cid, data: wd });
    }

    if (!opts.dryRun) {
      // Upsert each profile (write volume per batch is small; Neon latency is the
      // cost, so we run them concurrently in modest groups).
      const ops = rows.map((r) => {
        const lic = r.data?.imageFile ? licenses.get(r.data.imageFile) : undefined;
        const payload = {
          cricinfoId: r.cricinfoId,
          wikidataId: r.data?.wikidataId ?? null,
          photoUrl: r.data?.photoUrl ?? null,
          photoFilePage: r.data?.photoFilePage ?? null,
          photoCredit: lic?.credit ?? null,
          photoLicense: lic?.license ?? null,
          dateOfBirth: r.data?.dateOfBirth ?? null,
          birthPlace: r.data?.birthPlace ?? null,
          role: r.data?.role ?? null,
          enrichedAt: now,
        };
        return prisma.playerProfile.upsert({
          where: { cricsheetId: r.cricsheetId },
          create: { cricsheetId: r.cricsheetId, ...payload },
          update: payload,
        });
      });
      // Run in sub-batches of 20 to bound concurrency against Neon.
      for (let j = 0; j < ops.length; j += 20) {
        await Promise.all(ops.slice(j, j + 20));
        result.written += Math.min(20, ops.length - j);
      }
    }

    log.info("batch done", {
      progress: `${Math.min(i + SPARQL_BATCH, cricinfoIds.length)}/${cricinfoIds.length}`,
      matched: result.matched,
      withPhoto: result.withPhoto,
    });
    await sleep(400); // be polite to the SPARQL endpoint
  }

  log.info("✅ enrichment complete", result);
  return result;
}
