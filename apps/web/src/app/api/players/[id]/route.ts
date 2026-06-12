import { NextResponse } from "next/server";
import { battingCareer, bowlingCareer, careerByClass, careersFromGold } from "@/lib/player-stats";
import { getCareerPlayer, getPlayerById } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/players/[id] — a player's complete per-format career. `id` is the
 * Cricsheet player id (gold, full corpus); falls back to the canonical cuid.
 * Structured for programmatic / ML-feature consumption.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const gold = await getCareerPlayer(id);
  if (gold) {
    return NextResponse.json({
      success: true,
      source: "lakehouse",
      data: {
        cricsheetId: gold.cricsheetId,
        name: gold.name,
        cricinfoId: gold.cricinfoId,
        gender: gold.gender,
        careerMatches: gold.careerMatches,
        careerRuns: gold.careerRuns,
        careerWickets: gold.careerWickets,
        byFormat: careersFromGold(gold.stats),
      },
    });
  }

  const player = await getPlayerById(id);
  if (!player) {
    return NextResponse.json({ success: false, error: "player not found" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    source: "canonical",
    data: {
      id: player.id,
      fullName: player.fullName,
      country: player.country,
      role: player.role,
      career: { batting: battingCareer(player), bowling: bowlingCareer(player) },
      byFormat: careerByClass(player),
    },
  });
}
