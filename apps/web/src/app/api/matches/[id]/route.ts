import { NextResponse } from "next/server";
import { getMatchById } from "@/lib/queries";
import { serializeMatch } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const match = await getMatchById(id);
  if (!match) {
    return NextResponse.json({ success: false, message: "Match not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: serializeMatch(match) });
}
