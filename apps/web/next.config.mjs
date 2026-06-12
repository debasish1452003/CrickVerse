/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace TS packages are compiled by Next…
  transpilePackages: ["@crickverse/db", "@crickverse/types", "@crickverse/scraper-core"],
  // …but the Prisma client must stay external (native engine, not bundled).
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
