import type { PrismaClient } from "@crickverse/db";

/**
 * Base for all data-access repositories. Holds the injected Prisma client so the
 * data source is provided by the composition root (and can be swapped in tests)
 * rather than each repository reaching for the global singleton.
 */
export abstract class BaseRepository {
  constructor(protected readonly prisma: PrismaClient) {}

  protected async retryRead<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      await sleep(500);
      return fn();
    }
  }

  protected async optionalTableRead<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await this.retryRead(fn);
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
      return fallback;
    }
  }
}

function isTransientConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const message = e.message ?? "";
  return (
    e.code === "P1017" ||
    e.code === "P2024" ||
    message.includes("terminating connection due to administrator command") ||
    message.includes("Server has closed the connection") ||
    message.includes("Timed out fetching a new connection from the connection pool")
  );
}

function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e.code === "P2021" || (e.message ?? "").includes("does not exist in the current database");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
