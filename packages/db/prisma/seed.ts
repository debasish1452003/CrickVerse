import { prisma } from "../src/client";

/** Seed the initial list of pages and Cricsheet feeds to scrape. */
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
  console.log(`Seeded ScrapeSource: ${source.label} (${source.slug}-${source.objectId})`);

  const feeds = [
    { slug: "all", objectId: "all_json.zip", label: "All Cricsheet matches" },
    { slug: "recently", objectId: "recently_added_30_json.zip", label: "Recently added Cricsheet matches" },
  ];
  for (const feed of feeds) {
    const row = await prisma.scrapeSource.upsert({
      where: {
        pageType_slug_objectId: {
          pageType: "cricsheet-feed",
          slug: feed.slug,
          objectId: feed.objectId,
        },
      },
      update: { active: true, label: feed.label, mode: "HISTORICAL" },
      create: {
        pageType: "cricsheet-feed",
        slug: feed.slug,
        objectId: feed.objectId,
        label: feed.label,
        mode: "HISTORICAL",
      },
    });
    console.log(`Seeded Cricsheet feed: ${row.label} (${row.objectId})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
