import { NextResponse } from "next/server";
import { listMatches } from "@/lib/queries";
import { serializeMatch } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  const matches = (await listMatches()).map(serializeMatch);
  return NextResponse.json({ success: true, count: matches.length, data: matches });
}
