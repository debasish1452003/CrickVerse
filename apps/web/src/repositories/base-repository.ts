import type { PrismaClient } from "@crickverse/db";

/**
 * Base for all data-access repositories. Holds the injected Prisma client so the
 * data source is provided by the composition root (and can be swapped in tests)
 * rather than each repository reaching for the global singleton.
 */
export abstract class BaseRepository {
  constructor(protected readonly prisma: PrismaClient) {}
}
