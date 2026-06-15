import { NextResponse } from "next/server";
import { services } from "@/services";

export const dynamic = "force-dynamic";

export async function GET() {
  const matches = await services.matches.listDTOs();
  return NextResponse.json({ success: true, count: matches.length, data: matches });
}
