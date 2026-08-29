import { NextResponse } from "next/server";
import { sessionArena } from "@/lib/session";
import { loadModel } from "@/lib/mutations/engine";
import { runDefenseGate } from "@/lib/defense/gate";
import { ProposalSchema } from "@/lib/contracts/genome";
import { serializeState } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST() {
  const { state } = await sessionArena();
  if (!state.defenseProposal) {
    return NextResponse.json({ error: "no defense proposal — run investigation first" }, { status: 400 });
  }
  const parsed = ProposalSchema.safeParse(state.defenseProposal);
  if (!parsed.success) {
    return NextResponse.json({ error: "stored proposal invalid" }, { status: 500 });
  }
  const gate = runDefenseGate(state, loadModel(), parsed.data);
  return NextResponse.json({
    ...serializeState(state),
    gate: {
      accepted: gate.accepted,
      gateReasons: gate.gateReasons,
      candidateConfig: gate.candidateConfig,
      survival: gate.survival,
      significance: gate.significance,
      recallInterval: gate.recallInterval,
      before: gate.finalBase?.metrics ?? null,
      after: gate.finalCand?.metrics ?? null,
      replayDiscovery: gate.replayDiscovery,
      replayFresh: gate.replayFresh,
      replayDiff: gate.replayDiff,
    },
  });
}
