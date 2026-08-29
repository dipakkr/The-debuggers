import { NextResponse } from "next/server";
import { sessionArena } from "@/lib/session";
import { loadModel } from "@/lib/mutations/engine";
import { investigate } from "@/lib/defense/investigator";
import { serializeState } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST() {
  const { state } = await sessionArena();
  if (!state.blindSpotScenarioId) {
    return NextResponse.json({ error: "no blind spot to investigate" }, { status: 400 });
  }
  const blind = state.scenarios.get(state.blindSpotScenarioId)!;
  const model = loadModel();
  const input = {
    scenario_id: blind.scenario.scenario_id,
    family: blind.scenario.family,
    attack_success_rate: blind.outcome?.attack_success_rate ?? 0,
    top_reasons: blind.reasons,
    fn_medians: blind.outcome?.fn_feature_medians ?? {},
    base_threshold: model.threshold_block,
  };
  const { proposal, source } = await investigate(input, state.mode);
  state.defenseProposal = proposal;
  return NextResponse.json({ ...serializeState(state), investigationSource: source, proposal });
}
