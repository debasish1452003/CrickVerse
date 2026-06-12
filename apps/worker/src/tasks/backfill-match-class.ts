import { MatchClass, MatchFormat, prisma, toMatchClassFromCricsheet } from "@crickverse/db";
import { createLogger } from "../logger";

/**
 * One-time backfill of Match.matchClass for matches ingested before the field
 * existed. Per match we classify in priority order:
 *   1. exact — from the raw Cricsheet match_type if it was stored (re-ingested rows);
 *   2. heuristic — from MatchFormat + whether BOTH sides are national teams.
 *
 * The heuristic is best-effort and has a KNOWN LIMITATION: MatchFormat already
 * collapses domestic first-class (MDM) into TEST and domestic List A (ODM) into
 * ODI, and older ingests tagged those domestic teams as national — so a type-less
 * legacy MDM/ODM row can't be told apart from a real Test/ODI here. The honest
 * fix for those is to re-ingest from the Cricsheet archive (sets matchClass
 * exactly). Requiring BOTH teams national reduces, but doesn't eliminate, false
 * promotions. Only touches rows where matchClass is null, so it's safe to re-run.
 */
export async function backfillMatchClass(): Promise<{ updated: number; byClass: Record<string, number> }> {
  const logger = createLogger("backfill-match-class");
  const matches = await prisma.match.findMany({
    where: { matchClass: null },
    select: {
      id: true,
      format: true,
      matchType: true,
      homeTeam: { select: { isNational: true } },
      awayTeam: { select: { isNational: true } },
    },
  });
  logger.info(`found ${matches.length} match(es) without a class`);

  // Group ids by their derived class so we can write one updateMany per class
  // (a handful of statements) instead of one UPDATE per row.
  const idsByClass = new Map<MatchClass, string[]>();
  for (const m of matches) {
    const cls = m.matchType
      ? toMatchClassFromCricsheet(m.matchType)
      : deriveClass(m.format, Boolean(m.homeTeam?.isNational && m.awayTeam?.isNational));
    (idsByClass.get(cls) ?? idsByClass.set(cls, []).get(cls)!).push(m.id);
  }

  const CHUNK = 2000;
  const byClass: Record<string, number> = {};
  let updated = 0;
  for (const [cls, ids] of idsByClass) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { count } = await prisma.match.updateMany({
        where: { id: { in: slice }, matchClass: null },
        data: { matchClass: cls },
      });
      byClass[cls] = (byClass[cls] ?? 0) + count;
      updated += count;
    }
  }

  logger.info("✅ backfill done", { updated, byClass });
  return { updated, byClass };
}

/** Heuristic fallback when no raw match_type is available (see caveat above). */
function deriveClass(format: MatchFormat, isNational: boolean): MatchClass {
  switch (format) {
    case MatchFormat.TEST:
      return isNational ? MatchClass.TEST : MatchClass.FIRST_CLASS;
    case MatchFormat.ODI:
      return isNational ? MatchClass.ODI : MatchClass.LIST_A;
    case MatchFormat.T20:
      return isNational ? MatchClass.T20I : MatchClass.T20;
    case MatchFormat.T10:
      return MatchClass.T10;
    case MatchFormat.HUNDRED:
      return MatchClass.HUNDRED;
    default:
      return MatchClass.OTHER;
  }
}
