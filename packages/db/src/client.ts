import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Reuse one PrismaClient across hot-reloads (Next.js dev) and within the worker
// process, so we don't exhaust the connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function configureQueryEnginePath(): void {
  if (process.env.PRISMA_QUERY_ENGINE_LIBRARY) return;

  const here = dirname(fileURLToPath(import.meta.url));
  const require = createRequire(import.meta.url);
  const prismaClientDir = dirname(require.resolve("@prisma/client/package.json"));
  const candidates = [
    join(prismaClientDir, "..", "..", ".prisma", "client", "query_engine-windows.dll.node"),
    join(here, "..", "..", "..", "node_modules", ".prisma", "client", "query_engine-windows.dll.node"),
    join(here, "..", "..", "..", "..", "node_modules", ".prisma", "client", "query_engine-windows.dll.node"),
    join(process.cwd(), "node_modules", ".prisma", "client", "query_engine-windows.dll.node"),
    join(process.cwd(), "..", "..", "node_modules", ".prisma", "client", "query_engine-windows.dll.node"),
  ];

  const engine = candidates.find((p) => existsSync(p));
  if (engine) process.env.PRISMA_QUERY_ENGINE_LIBRARY = engine;
}

configureQueryEnginePath();

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
