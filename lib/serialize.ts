import { ArenaState } from "@/lib/state";

/** Client-facing snapshot of the arena — plain JSON, no Maps. */
export function serializeState(state: ArenaState) {
  const attempts = [...state.scenarios.values()]
    .sort((a, b) => a.scenario.scenario_id.localeCompare(b.scenario.scenario_id))
    .map((s) => ({
      scenario_id: s.scenario.scenario_id,
      parent_scenario_id: s.scenario.parent_scenario_id,
      generation: s.scenario.generation,
      family: s.scenario.family,
      genome: s.scenario.genome,
      hypothesis: s.scenario.hypothesis,
      seed: s.scenario.seed,
      verdict: s.verdict,
      fitness: s.fitness ?? null,
      reasons: s.reasons,
      attack_success_rate: s.outcome?.attack_success_rate ?? null,
      risk_max: s.outcome?.risk_max ?? null,
      novel: false, // filled below via novelty flag captured at creation? keep computed client-side off fitness
    }));

  return {
    mode: state.mode,
    generation: state.generation,
    attempts,
    childrenOf: Object.fromEntries(state.childrenOf),
    beam: state.beam,
    blindSpotScenarioId: state.blindSpotScenarioId,
    baseline: state.baselineRun?.metrics ?? null,
    duringAttack: state.gateBaselineRun?.metrics ?? state.lastSearchMetrics,
    afterDefense: state.gateRun?.metrics ?? null,
    defenseAccepted: state.defenseAccepted,
    defenseProposal: state.defenseProposal,
    defenseConfig: state.defenseConfig,
    replayDiff: state.replayDiff,
    gateReasons: state.gateReasons,
    log: state.log.slice(-30),
  };
}
