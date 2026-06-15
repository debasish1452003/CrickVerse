// The single shared Prisma client (the singleton lives in @crickverse/db).
// Repositories depend on this module rather than importing the package directly,
// so the data-source can be swapped/mocked in one place.
export { prisma } from "@crickverse/db";
export type { Prisma } from "@crickverse/db";
