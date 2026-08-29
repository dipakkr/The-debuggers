import { NextResponse } from "next/server";
import { sessionArena } from "@/lib/session";
import { resetArena } from "@/lib/mutations/engine";
import { serializeState } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  const { state } = await sessionArena();
  if (!state.baselineRun) resetArena(state);
  return NextResponse.json(serializeState(state));
}
