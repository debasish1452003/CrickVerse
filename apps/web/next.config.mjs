import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Monorepo root (apps/web -> ../../).
const monorepoRoot = path.join(__dirname, "..", "..");

function configurePrismaEngine() {
  if (process.env.PRISMA_QUERY_ENGINE_LIBRARY) return;
  const engineName =
    process.platform === "win32"
      ? "query_engine-windows.dll.node"
      : "libquery_engine-rhel-openssl-3.0.x.so.node";
  const candidates = [
    path.join(monorepoRoot, "node_modules", ".pnpm"),
    path.join(__dirname, "node_modules", ".pnpm"),
  ];
  for (const store of candidates) {
    if (!fs.existsSync(store)) continue;
    const clientDir = fs
      .readdirSync(store)
      .find((name) => name.startsWith("@prisma+client@") && name.includes("prisma@"));
    if (!clientDir) continue;
    const engine = path.join(store, clientDir, "node_modules", ".prisma", "client", engineName);
    if (fs.existsSync(engine)) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = engine;
      return;
    }
  }
}

configurePrismaEngine();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace TS packages are compiled by Next…
  transpilePackages: ["@crickverse/db", "@crickverse/types", "@crickverse/scraper-core"],
  // …but the Prisma client must stay external (native engine, not bundled).
  serverExternalPackages: ["@prisma/client", ".prisma/client"],

  // Trace files relative to the monorepo root so pnpm's symlinked workspace
  // dependencies are followed correctly when bundling serverless functions.
  outputFileTracingRoot: monorepoRoot,

  // The Prisma query engine (libquery_engine-rhel-openssl-3.0.x.so.node) is
  // loaded dynamically at runtime, so Next's static tracer doesn't see it and
  // omits it from the serverless bundle → "Prisma Client could not locate the
  // Query Engine for runtime 'rhel-openssl-3.0.x'". Force-include every engine
  // binary the generated client may produce. Globs are relative to the project
  // dir (apps/web); cover both the pnpm store layout and a hoisted layout.
  outputFileTracingIncludes: {
    "/**": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/*.node",
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/schema.prisma",
      "../../node_modules/.prisma/client/*.node",
      "../../packages/db/node_modules/.prisma/client/*.node",
    ],
  },
};

export default nextConfig;
