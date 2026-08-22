import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { versionStamp } from "@/lib/contracts/genome";
import { investigate } from "@/lib/defense/investigator";
import { runDefenseGate } from "@/lib/defense/gate";
import { loadModel, resetArena, runGeneration } from "@/lib/mutations/engine";
import { SEEDS } from "@/lib/referee/referee";
import { freshState } from "@/lib/state";

async function main(): Promise<void> {
const state = freshState("demo");
resetArena(state);

while (!state.blindSpotScenarioId && state.generation < 6) {
  await runGeneration(state);
}

if (!state.blindSpotScenarioId) {
  throw new Error("the deterministic Red policy did not find a blind spot");
}

const blind = state.scenarios.get(state.blindSpotScenarioId);
if (!blind?.outcome) throw new Error("the blind-spot record is incomplete");

const investigation = await investigate(
  {
    scenario_id: blind.scenario.scenario_id,
    family: blind.scenario.family,
    attack_success_rate: blind.outcome.attack_success_rate,
    top_reasons: blind.reasons,
    fn_medians: blind.outcome.fn_feature_medians,
    base_threshold: loadModel().threshold_block,
  },
  "demo"
);
const gate = runDefenseGate(state, loadModel(), investigation.proposal);
if (!gate.finalBase || !gate.finalCand) {
  throw new Error("the Defense Gate did not produce held-out results");
}

const evidence = {
  generated_at: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  mode: "demo",
  seeds: SEEDS,
  versions: versionStamp("demo"),
  baseline: state.baselineRun?.metrics,
  blind_spot: {
    scenario_id: blind.scenario.scenario_id,
    parent_scenario_id: blind.scenario.parent_scenario_id,
    generation: blind.scenario.generation,
    family: blind.scenario.family,
    seed: blind.scenario.seed,
    genome: blind.scenario.genome,
    attack_success_rate: blind.outcome.attack_success_rate,
    risk_median: blind.outcome.risk_median,
    top_reasons: blind.outcome.top_reasons,
  },
  blue_investigation: {
    source: investigation.source,
    proposal: investigation.proposal,
  },
  defense_gate: {
    accepted: gate.accepted,
    reasons: gate.gateReasons,
    held_out_before: gate.finalBase.metrics,
    held_out_after: gate.finalCand.metrics,
    survival: gate.survival,
  },
  replay: {
    scenario_id: blind.scenario.scenario_id,
    seed: blind.scenario.seed,
    changed_decisions: gate.replayDiff.length,
    diff: gate.replayDiff,
  },
};

const output = path.join(process.cwd(), "data", "evidence", "latest.json");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
console.log(`wrote ${output}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
