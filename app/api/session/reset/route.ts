import { NextResponse } from "next/server";
import { arena, freshState } from "@/lib/state";
import { resetArena } from "@/lib/mutations/engine";
import { serializeState } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { mode?: "demo" | "live" };
  const mode = body.mode === "live" ? "live" : "demo";
  const state = freshState(mode);
  // replace singleton contents so every route sees the new session
  const current = arena();
  Object.assign(current, state);
  resetArena(current);
  return NextResponse.json(serializeState(current));
}
