import { NextResponse } from "next/server";
import { services } from "@/services";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const match = await services.matches.dto(id);
  if (!match) {
    return NextResponse.json({ success: false, message: "Match not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: match });
}
