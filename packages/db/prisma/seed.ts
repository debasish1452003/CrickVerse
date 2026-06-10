import { prisma } from "../src/client";

/** Seed the initial list of pages to scrape. */
async function main(): Promise<void> {
  const source = await prisma.scrapeSource.upsert({
    where: {
      pageType_slug_objectId: {
        pageType: "series-fixtures",
        slug: "ipl-2026",
        objectId: "1510719",
      },
    },
    update: { active: true, label: "IPL 2026" },
    create: {
      pageType: "series-fixtures",
      slug: "ipl-2026",
      objectId: "1510719",
      label: "IPL 2026",
      mode: "LIVE",
    },
  });
  console.log(`✅ Seeded ScrapeSource: ${source.label} (${source.slug}-${source.objectId})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
