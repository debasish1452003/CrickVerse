import type { CrawlMode } from "@prisma/client";
import { prisma } from "../client";

export interface UpsertSourceInput {
  pageType?: string;
  slug: string;
  objectId: string | number;
  label?: string;
  mode?: CrawlMode;
}

/** Register (or re-activate) a page to track. Backs "add a few URLs". */
export async function upsertScrapeSource(input: UpsertSourceInput) {
  const pageType = input.pageType ?? "series-fixtures";
  const objectId = String(input.objectId);
  return prisma.scrapeSource.upsert({
    where: { pageType_slug_objectId: { pageType, slug: input.slug, objectId } },
    create: {
      pageType,
      slug: input.slug,
      objectId,
      label: input.label,
      mode: input.mode ?? "LIVE",
      active: true,
    },
    update: { active: true, label: input.label, mode: input.mode },
  });
}

export function getActiveScrapeSources() {
  return prisma.scrapeSource.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
}
