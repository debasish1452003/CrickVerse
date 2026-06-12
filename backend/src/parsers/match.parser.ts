export const parseSeriesFixtures = (jsonData: any) => {
  const matchesData =
    jsonData?.props?.appPageProps?.data?.content?.matches ||
    jsonData?.props?.pageProps?.appPageProps?.data?.content?.matches ||
    [];

  return matchesData.map((m: any) => {
    const [t1, t2] = m.teams || [];

    return {
      matchId: m.objectId,
      slug: m.slug || String(m.objectId),

      title: m.title,
      season: m.season,

      series: {
        objectId: m.series?.objectId || m.series?.id,
        slug: m.series?.slug,
        name: m.series?.name,
      },

      teams: [
        { name: t1?.team?.longName, score: t1?.score },
        { name: t2?.team?.longName, score: t2?.score },
      ],

      flags: {
        hasScorecard: m.hasScorecard,
        hasCommentary: m.hasCommentary,
      },
    };
  });
};

// export const parseScorecard = (matchId: string | number, jsonData: any) => {
//   const content =
//     jsonData?.props?.appPageProps?.data?.content ||
//     jsonData?.props?.pageProps?.appPageProps?.data?.content;

//   const inningsData =
//     content?.scorecard?.innings || content?.innings || content?.match?.innings;

//   if (!inningsData || inningsData.length === 0) return null;

//   const innings = inningsData.map((inn: any) => ({
//     teamId: inn.team?.objectId,
//     totalRuns: inn.runs,
//     wickets: inn.wickets,
//     overs: inn.overs,
//     batting: (inn.batsmen || []).map((b: any) => ({
//       playerId: b.batsman?.objectId,
//       name: b.batsman?.longName,
//       runs: Number(b.runs) || 0,
//       balls: Number(b.balls) || 0,
//       strikeRate: Number(b.strikeRate) || 0,
//     })),
//     bowling: (inn.bowlers || []).map((bw: any) => ({
//       playerId: bw.bowler?.objectId,
//       name: bw.bowler?.longName,
//       wickets: Number(bw.wickets) || 0,
//       economy: Number(bw.economy) || 0,
//     })),
//   }));

//   return { matchId, innings };
// };

export const parseScorecard = (matchId: any, jsonData: any) => {
  const content =
    jsonData?.props?.appPageProps?.data?.content ||
    jsonData?.props?.pageProps?.appPageProps?.data?.content;

  const inningsData =
    content?.scorecard?.innings || content?.innings || content?.match?.innings;

  if (!inningsData || inningsData.length === 0) return null;

  const innings = inningsData.map((inn: any) => ({
    teamId: inn.team?.objectId,
    runs: inn.runs,
    wickets: inn.wickets,
    overs: inn.overs,

    batting: (inn.batsmen || []).map((b: any) => ({
      name: b.batsman?.longName,
      runs: Number(b.runs) || 0,
      balls: Number(b.balls) || 0,
    })),

    bowling: (inn.bowlers || []).map((bw: any) => ({
      name: bw.bowler?.longName,
      wickets: Number(bw.wickets) || 0,
      runs: Number(bw.runs) || 0,
    })),
  }));

  return { matchId, innings };
};
