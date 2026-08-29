import { NextResponse } from "next/server";
import { freshState } from "@/lib/state";
import { sessionArena } from "@/lib/session";
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
  // Replace this session's arena contents in place so every route that later
  // resolves the same cookie sees the new run.
  const { state: current } = await sessionArena();
  Object.assign(current, state);
  resetArena(current);
  return NextResponse.json(serializeState(current));
}
