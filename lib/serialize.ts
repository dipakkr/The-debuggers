import { ArenaState } from "@/lib/state";
import { ATTACK_FAMILIES, versionStamp } from "@/lib/contracts/genome";
import { isNovel, noveltyScore, NOVELTY_TAU } from "@/lib/attacks/templates";
import { GATE_BUDGETS } from "@/lib/referee/referee";
import { loadModel } from "@/lib/mutations/engine";
import { liveModeAvailable } from "@/lib/genai/client";

/** Client-facing snapshot of the arena — plain JSON, no Maps. */
export function serializeState(state: ArenaState) {
  const attempts = [...state.scenarios.values()]
    .sort((a, b) => a.scenario.scenario_id.localeCompare(b.scenario.scenario_id))
    .map((s) => {
      const genome = s.scenario.genome;
      return {
        scenario_id: s.scenario.scenario_id,
        parent_scenario_id: s.scenario.parent_scenario_id,
        generation: s.scenario.generation,
        family: s.scenario.family,
        genome,
        hypothesis: s.scenario.hypothesis,
        seed: s.scenario.seed,
        verdict: s.verdict,
        fitness: s.fitness ?? null,
        reasons: s.reasons,
        attack_success_rate: s.outcome?.attack_success_rate ?? null,
        risk_max: s.outcome?.risk_max ?? null,
        n_fraud: s.outcome?.n_fraud ?? null,
        n_flagged: s.outcome?.n_flagged ?? null,
        // novelty is Referee-owned: distance from every same-family template
        novel: genome ? isNovel(genome) : false,
        novelty: genome ? Math.round(noveltyScore(genome) * 1000) / 1000 : null,
      };
    });

  const model = loadModel();

  return {
    mode: state.mode,
    /** whether a provider key is configured, so the UI only offers a mode it can honour */
    liveAvailable: liveModeAvailable(),
    generation: state.generation,
    attempts,
    childrenOf: Object.fromEntries(state.childrenOf),
    beam: state.beam,
    blindSpotScenarioId: state.blindSpotScenarioId,
    baseline: state.baselineRun?.metrics ?? null,
    baselineOperatingPoints: state.baselineOperatingPoints,
    duringAttack: state.gateBaselineRun?.metrics ?? state.lastSearchMetrics,
    duringAttackOperatingPoints: state.gateBaselineRun?.operating_points ?? [],
    afterDefense: state.gateRun?.metrics ?? null,
    defenseAccepted: state.defenseAccepted,
    defenseProposal: state.defenseProposal,
    defenseConfig: state.defenseConfig,
    replayDiff: state.replayDiff,
    gateReasons: state.gateReasons,
    gateBudgets: GATE_BUDGETS,
    families: [...ATTACK_FAMILIES],
    noveltyTau: NOVELTY_TAU,
    // stamp the ACTUAL reasoning layer, not the constant: in live mode this is
    // the model id, and it must not claim demo-policy-v1
    versions: versionStamp(state.mode),
    reasoningSource: state.reasoningSource,
    reasoningNote: state.reasoningNote,
    detector: {
      version: model.version,
      feature_names: model.feature_names,
      weights: model.w,
      bias: model.b,
      threshold_block: model.threshold_block,
      threshold_review: model.threshold_review,
      calibration: model.trained_on,
    },
    log: state.log.slice(-40),
  };
}
