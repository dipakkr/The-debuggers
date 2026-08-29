import { NextResponse } from "next/server";
import { THREAT_FAMILIES, assessThreats } from "@/lib/threat-intel/families";
import { guardUntrustedText } from "@/lib/guards/injection";
import { sessionArena } from "@/lib/session";

export const dynamic = "force-dynamic";

/** IDENTIFY endpoint. `?note=` accepts an untrusted intel note; it is guarded
 *  and treated strictly as data. The assessment itself is deterministic in
 *  demo mode; LIVE mode would enrich via LLM with the same schema. */
export async function GET(req: Request) {
  const note = new URL(req.url).searchParams.get("note");
  let guardedNote: string | null = null;
  if (note) {
    try {
      guardedNote = guardUntrustedText(note);
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 422 });
    }
  }
  const { state } = await sessionArena();
  const { assessment, source } = await assessThreats(state.mode, guardedNote);
  return NextResponse.json({
    families: THREAT_FAMILIES,
    assessment,
    note: guardedNote,
    source,
  });
}
