import { NextResponse } from "next/server";
import { rehydrate, sessionArena } from "@/lib/session";
import { serializeState } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const { state, progress } = await sessionArena();
  await rehydrate(state, progress);
  return NextResponse.json(serializeState(state));
}
