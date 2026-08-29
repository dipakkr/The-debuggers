import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ATTACK_FAMILIES, versionStamp } from "@/lib/contracts/genome";
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

const model = loadModel();
const blind = state.scenarios.get(state.blindSpotScenarioId);
if (!blind?.outcome) throw new Error("the blind-spot record is incomplete");

const investigation = await investigate(
  {
    scenario_id: blind.scenario.scenario_id,
    family: blind.scenario.family,
    attack_success_rate: blind.outcome.attack_success_rate,
    top_reasons: blind.reasons,
    fn_medians: blind.outcome.fn_feature_medians,
    base_threshold: model.threshold_block,
  },
  "demo"
);
const gate = runDefenseGate(state, model, investigation.proposal);
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
  baseline_operating_points: state.baselineOperatingPoints,
  detector: {
    version: model.version,
    feature_names: model.feature_names,
    weights: Object.fromEntries(model.feature_names.map((n, i) => [n, model.w[i]])),
    bias: model.b,
    threshold_block: model.threshold_block,
    threshold_review: model.threshold_review,
    calibration: model.trained_on,
  },
  attack_families: [...ATTACK_FAMILIES],
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
    // paired test on the SAME held-out transactions, plus 95% Wilson
    // intervals — the recall delta is a sample statistic, not a constant
    significance: gate.significance,
    recall_95ci: gate.recallInterval,
  },
  replay: {
    // the ORIGINAL discovery scenario: stored genome, stored seed
    discovery: gate.replayDiscovery && {
      scenario_id: gate.replayDiscovery.scenario_id,
      seed: gate.replayDiscovery.seed,
      changed_decisions: gate.replayDiscovery.changed.length,
      diff: gate.replayDiscovery.changed,
      before_recall: gate.replayDiscovery.before.fraud_recall,
      after_recall: gate.replayDiscovery.after.fraud_recall,
    },
    // fresh-seed recompiles of the same genome: a GENERALISATION check,
    // reported separately so it is never mistaken for the line above
    fresh_seed: gate.replayFresh.map((r) => ({
      scenario_id: r.scenario_id,
      seed: r.seed,
      changed_decisions: r.changed.length,
      diff: r.changed,
    })),
    total_changed_decisions: gate.replayDiff.length,
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
