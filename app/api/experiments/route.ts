import { NextResponse } from "next/server";
import { ledgerBacking, readExperiments } from "@/lib/referee/ledger";
import { rehydrate, sessionArena } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  // On a serverless host the ledger is per-instance, so an audit request that
  // lands on an instance which never ran the experiments would show an empty
  // trail. Rebuild this session's arena first: replaying the cursor re-emits
  // the same records, with the same content-derived experiment ids.
  const { state, progress } = await sessionArena();
  await rehydrate(state, progress);

  return NextResponse.json({
    experiments: readExperiments(200),
    backing: ledgerBacking(),
  });
}
