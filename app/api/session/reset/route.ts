import { NextResponse } from "next/server";
import { arena, freshState } from "@/lib/state";
import { resetArena } from "@/lib/mutations/engine";
import { serializeState } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(req: Request) {
  const declaredSize = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "request body is too large" }, { status: 413 });
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "request body is too large" }, { status: 413 });
  }
  const body = (() => {
    try {
      return JSON.parse(raw || "{}") as { mode?: "demo" | "live" };
    } catch {
      return {};
    }
  })();
  const mode = body.mode === "live" ? "live" : "demo";
  const state = freshState(mode);
  // Replace the singleton contents so every route sees the new session.
  const current = arena();
  Object.assign(current, state);
  resetArena(current);
  return NextResponse.json(serializeState(current));
}
