import {
  DefenseConfig,
  DefenseConfigSchema,
  Proposal,
  V1_AS_DEFENSE,
  versionStamp,
} from "@/lib/contracts/genome";
import { ArenaState } from "@/lib/state";
import { DetectorWeights } from "@/lib/fraud/detector";
import {
  EvalRun,
  ScenarioSpec,
  SEEDS,
  gateDecision,
  replayPair,
  refereeEvaluate,
} from "@/lib/referee/referee";
import { appendExperiment, makeExperimentId } from "@/lib/referee/ledger";

export interface GateResult {
  accepted: boolean;
  gateReasons: string[];
  candidateConfig: DefenseConfig | null;
  finalBase: EvalRun | null;
  finalCand: EvalRun | null;
  survival: { scenario_id: string; base_success: number; cand_success: number }[];
  replayBefore: EvalRun | null;
  replayAfter: EvalRun | null;
  replayDiff: { tx_id: string; amount: number; before: string; after: string }[];
}

/**
 * The Defense Gate. Blue may propose; only this deterministic pipeline —
 * fresh-seed held-out evaluation + FPR regression + survival check +
 * exact replay — decides whether a proposal becomes the new defense.
 */
export function runDefenseGate(
  state: ArenaState,
  model: DetectorWeights,
  proposal: Proposal
): GateResult {
  const parsed = DefenseConfigSchema.safeParse(proposal.defense_config);
  if (!parsed.success) {
    appendExperiment({
      experiment_id: makeExperimentId({
        kind: "gate",
        decision: "invalid",
        defense_config: JSON.stringify(proposal.defense_config),
      }),
      ts: new Date().toISOString(),
      kind: "gate",
      versions: versionStamp(state.mode, "rejected-config"),
      decision: "REJECT",
      notes: "defense_config failed schema/policy validation",
    });
    return {
      accepted: false,
      gateReasons: ["CONFIG_INVALID"],
      candidateConfig: null,
      finalBase: null,
      finalCand: null,
      survival: [],
      replayBefore: null,
      replayAfter: null,
      replayDiff: [],
    };
  }
  const candidate = parsed.data;

  // Held-out set: three FRESH-SEED recompiles of the blind-spot genome
  // (seed variation of the discovered threat) plus up to two sibling genomes.
  const blind = state.blindSpotScenarioId ? state.scenarios.get(state.blindSpotScenarioId) : null;
  if (!blind) throw new Error("no blind spot to defend against");
  const siblings = [...state.scenarios.values()]
    .filter(
      (s) =>
        s.scenario.scenario_id !== state.blindSpotScenarioId &&
        s.scenario.family === blind.scenario.family &&
        s.verdict !== "invalid"
    )
    .slice(0, 2);

  const freshSpecs: ScenarioSpec[] = [0, 1, 2, 3, 4].map((k) => ({
    genome: blind.scenario.genome,
    // constant referee seeds — a gate verdict must not depend on when it runs
    seed: SEEDS.final_test + (k + 11) * 131_071,
    scenario_id: `${blind.scenario.scenario_id}-H${k}`,
  }));
  const siblingSpecs: ScenarioSpec[] = siblings.map((s, i) => ({
    genome: s.scenario.genome,
    seed: SEEDS.final_test + (i + 1) * 104729,
    scenario_id: s.scenario.scenario_id,
  }));
  const specs = [...freshSpecs, ...siblingSpecs];

  const baseRun = refereeEvaluate(model, null, specs, { legitSeed: SEEDS.final_test });
  const candRun = refereeEvaluate(model, candidate, specs, { legitSeed: SEEDS.final_test });

  // survival is measured on the fresh-seed recompiles of the blind-spot
  // genome itself — does the defense generalize across seed variation?
  const survival = freshSpecs.map((s, i) => ({
    scenario_id: s.scenario_id,
    base_success: baseRun.per_scenario[i]?.attack_success_rate ?? 0,
    cand_success: candRun.per_scenario[i]?.attack_success_rate ?? 0,
  }));
  const improvable = survival.filter((s) => s.base_success > 0);
  const survived = improvable.filter((s) => s.cand_success < s.base_success).length;
  // threat-class recall: share of fresh-seed attack rows CAUGHT, before vs after
  const baseCaught = 1 - survival.reduce((s, x) => s + x.base_success, 0) / Math.max(1, survival.length);
  const candCaught = 1 - survival.reduce((s, x) => s + x.cand_success, 0) / Math.max(1, survival.length);
  const threatRecallGain = candCaught - baseCaught;

  const verdict = gateDecision(
    threatRecallGain,
    candRun.metrics.fpr - baseRun.metrics.fpr,
    survived,
    Math.max(1, improvable.length)
  );

  // Exact replay: the ORIGINAL discovery scenario plus fresh-seed recompiles
  // of the same genome, rescored under v1 vs candidate — the causal
  // BEFORE/AFTER evidence chain.
  const replaySpecs: ScenarioSpec[] = [
    { genome: blind.scenario.genome, seed: blind.scenario.seed, scenario_id: blind.scenario.scenario_id },
    ...freshSpecs,
  ];
  const diffs: { tx_id: string; amount: number; before: string; after: string }[] = [];
  for (const spec of replaySpecs) {
    const rp = replayPair(model, null, candidate, spec);
    diffs.push(...rp.diff);
  }
  const replayBeforeMetrics = baseRun.metrics;
  const replayAfterMetrics = candRun.metrics;

  appendExperiment({
    experiment_id: makeExperimentId({
      kind: "gate",
      scenario_id: blind.scenario.scenario_id,
      seed: blind.scenario.seed,
      defense_config: JSON.stringify(candidate),
    }),
    ts: new Date().toISOString(),
    kind: "gate",
    scenario_id: blind.scenario.scenario_id,
    seed: blind.scenario.seed,
    versions: versionStamp(state.mode),
    metrics: {
      base_recall: baseRun.metrics.fraud_recall,
      cand_recall: candRun.metrics.fraud_recall,
      base_fpr: baseRun.metrics.fpr,
      cand_fpr: candRun.metrics.fpr,
      survived: survived,
      improvable: improvable.length,
    },
    decision: verdict.accepted ? "ACCEPT" : "REJECT",
    notes: verdict.reasons.join("; ") || "all gates passed",
  });
  appendExperiment({
    experiment_id: makeExperimentId({
      kind: "replay",
      scenario_id: blind.scenario.scenario_id,
      seed: blind.scenario.seed,
      defense_config: JSON.stringify(candidate),
    }),
    ts: new Date().toISOString(),
    kind: "replay",
    scenario_id: blind.scenario.scenario_id,
    seed: blind.scenario.seed,
    versions: versionStamp(state.mode),
    metrics: {
      before_recall: replayBeforeMetrics.fraud_recall,
      after_recall: replayAfterMetrics.fraud_recall,
      changed_rows: diffs.length,
    },
    decision: "REPLAYED",
  });

  if (verdict.accepted) {
    state.defenseConfig = candidate;
    state.defenseProposal = proposal;
  }
  state.defenseAccepted = verdict.accepted;
  state.gateReasons = verdict.reasons;
  state.gateBaselineRun = baseRun;
  state.gateRun = candRun;
  state.replayDiff = diffs;

  return {
    accepted: verdict.accepted,
    gateReasons: verdict.reasons,
    candidateConfig: candidate,
    finalBase: baseRun,
    finalCand: candRun,
    survival,
    replayBefore: null,
    replayAfter: null,
    replayDiff: diffs,
  };
}

export function v1ConfigFor(model: DetectorWeights): DefenseConfig {
  return V1_AS_DEFENSE(model.threshold_block);
}
