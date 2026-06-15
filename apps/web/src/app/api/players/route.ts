import { NextResponse } from "next/server";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** GET /api/players?q=&page= — paginated career-player search over the full corpus (JSON, for external/ML use). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const page = Number(url.searchParams.get("page")) || 1;
  const result = await services.players.searchCareerPlayers({ q, page });
  return NextResponse.json({ success: true, ...result });
}
