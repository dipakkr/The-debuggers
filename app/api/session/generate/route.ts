import { NextResponse } from "next/server";
import { sessionArena } from "@/lib/session";
import { runGeneration } from "@/lib/mutations/engine";
import { serializeState } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST() {
  const { state } = await sessionArena();
  // After a blind spot is confirmed the loop keeps running: red now evolves
  // against the DEFENDED engine (v2), demonstrating continuous adaptation.
  await runGeneration(state);
  return NextResponse.json(serializeState(state));
}
