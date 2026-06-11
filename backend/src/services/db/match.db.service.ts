import { Match } from "../../models/match.model.js";
import { Scorecard } from "../../models/scoreCard.model.js";

// export const upsertMatches = async (matches: any[]) => {
//   const operations = matches
//     .filter((m) => m.matchId)
//     .map((m) => ({
//       updateOne: {
//         filter: { matchId: Number(m.matchId) },
//         update: { $set: { ...m, lastUpdated: new Date() } },
//         upsert: true,
//       },
//     }));

//   if (operations.length > 0) {
//     await Match.bulkWrite(operations);
//     console.log(`✅ ${operations.length} matches upserted to DB.`);
//   }
// };

export const upsertMatches = async (matches: any[]) => {
  for (const m of matches) {
    if (!m.series?.slug || !m.slug) {
      console.log("❌ Skipping bad match:", m.matchId);
      continue;
    }

    await Match.updateOne(
      { matchId: Number(m.matchId) },
      {
        $set: {
          ...m,
          lastUpdated: new Date(),
        },
      },
      { upsert: true },
    );
  }

  console.log("✅ Matches saved");
};

export const upsertScorecard = async (scorecard: any) => {
  if (!scorecard?.matchId || !scorecard.innings?.length) return;

  await Scorecard.findOneAndUpdate(
    { matchId: Number(scorecard.matchId) },
    {
      $set: {
        ...scorecard,
        lastUpdated: new Date(),
      },
    },
    { upsert: true },
  );

  console.log(`🏏 Saved scorecard: ${scorecard.matchId}`);
};
// export const upsertScorecard = async (scorecard: any) => {
//   if (!scorecard || !scorecard.matchId) return;

//   await Scorecard.findOneAndUpdate(
//     { matchId: scorecard.matchId },
//     { $set: scorecard },
//     { upsert: true },
//   );
//   console.log(`🏏 Scorecard saved for match: ${scorecard.matchId}`);
// };

// Helper to find matches that need scorecard updates
export const getMatchesAwaitingScorecards = async () => {
  return Match.find({
    "flags.hasScorecard": true,
    slug: { $ne: null },
    "series.objectId": { $ne: null },
  })
    .select("matchId slug series flags")
    .lean();
};
