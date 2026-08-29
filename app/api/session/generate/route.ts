import { NextResponse } from "next/server";
import { rehydrate, sessionArena } from "@/lib/session";
import { runGeneration } from "@/lib/mutations/engine";
import { serializeState } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const { state, progress, save } = await sessionArena();
  // rebuild whatever this instance is missing, then advance exactly one step
  await rehydrate(state, progress);
  // After a blind spot is confirmed the loop keeps running: red now evolves
  // against the DEFENDED engine (v2), demonstrating continuous adaptation.
  await runGeneration(state);
  save({ generations: state.generation });
  return NextResponse.json(serializeState(state));
}
