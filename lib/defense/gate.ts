import {
  DefenseConfig,
  DefenseConfigSchema,
  MetricsResult,
  Proposal,
  V1_AS_DEFENSE,
  versionStamp,
} from "@/lib/contracts/genome";
import { ArenaState } from "@/lib/state";
import { DetectorWeights } from "@/lib/fraud/detector";
import {
  EvalRun,
  ReplayDiffRow,
  ScenarioSpec,
  SEEDS,
  gateDecision,
  replayPair,
  refereeEvaluate,
} from "@/lib/referee/referee";
import { appendExperiment, makeExperimentId } from "@/lib/referee/ledger";
import { Interval, McNemarResult, mcnemar, wilsonInterval } from "@/lib/metrics/stats";

export interface GateResult {
  accepted: boolean;
  gateReasons: string[];
  candidateConfig: DefenseConfig | null;
  finalBase: EvalRun | null;
  finalCand: EvalRun | null;
  survival: { scenario_id: string; base_success: number; cand_success: number }[];
  /** Exact replay of the ORIGINAL discovery scenario — same stored genome,
   *  same stored seed, same legitimate pool — rescored under v1 vs candidate. */
  replayDiscovery: {
    scenario_id: string;
    seed: number;
    changed: ReplayDiffRow[];
    before: MetricsResult;
    after: MetricsResult;
  } | null;
  /** Replays of the fresh-seed recompiles, reported separately because they
   *  are a GENERALISATION check, not evidence about the stored scenario. */
  replayFresh: { scenario_id: string; seed: number; changed: ReplayDiffRow[] }[];
  replayDiff: ReplayDiffRow[];
  /** Paired significance of the recall change on the held-out fraud rows. */
  significance: McNemarResult | null;
  /** 95% Wilson intervals around the before/after held-out recall. */
  recallInterval: { before: Interval; after: Interval } | null;
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
      significance: null,
      recallInterval: null,
      replayDiscovery: null,
      replayFresh: [],
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

  // Paired significance. Base and candidate scored the SAME transactions, so
  // join on tx_id and count only the rows whose decision actually flipped.
  const candById = new Map(candRun.fraud_rows.map((r) => [r.tx_id, r.decision]));
  let caughtBeforeOnly = 0;
  let caughtAfterOnly = 0;
  for (const row of baseRun.fraud_rows) {
    const after = candById.get(row.tx_id);
    if (after === undefined) continue;
    const beforeCaught = row.decision !== "allow";
    const afterCaught = after !== "allow";
    if (beforeCaught && !afterCaught) caughtBeforeOnly++;
    if (!beforeCaught && afterCaught) caughtAfterOnly++;
  }
  const significance = mcnemar(caughtBeforeOnly, caughtAfterOnly);
  const recallInterval = {
    before: wilsonInterval(
      Math.round(baseRun.metrics.fraud_recall * baseRun.metrics.n_fraud),
      baseRun.metrics.n_fraud
    ),
    after: wilsonInterval(
      Math.round(candRun.metrics.fraud_recall * candRun.metrics.n_fraud),
      candRun.metrics.n_fraud
    ),
  };

  const verdict = gateDecision(
    threatRecallGain,
    candRun.metrics.fpr - baseRun.metrics.fpr,
    survived,
    Math.max(1, improvable.length),
    {
      baseFpr: baseRun.metrics.fpr,
      reviewRateDelta: candRun.metrics.review_rate - baseRun.metrics.review_rate,
    }
  );

  // Exact replay, reported in two clearly separated parts.
  //  (a) the ORIGINAL discovery scenario — stored genome, stored seed. This is
  //      the causal "the very attack we found is now handled differently" claim.
  //  (b) the fresh-seed recompiles — a generalisation check. Conflating the two
  //      lets a diff made up entirely of (b) be reported as evidence about (a).
  const discoverySpec: ScenarioSpec = {
    genome: blind.scenario.genome,
    seed: blind.scenario.seed,
    scenario_id: blind.scenario.scenario_id,
  };
  const discoveryReplay = replayPair(model, null, candidate, discoverySpec, {
    legitSeed: SEEDS.final_test,
  });
  const replayDiscovery = {
    scenario_id: discoverySpec.scenario_id,
    seed: discoverySpec.seed,
    changed: discoveryReplay.diff,
    before: discoveryReplay.before.metrics,
    after: discoveryReplay.after.metrics,
  };
  const replayFresh = freshSpecs.map((spec) => ({
    scenario_id: spec.scenario_id,
    seed: spec.seed,
    changed: replayPair(model, null, candidate, spec, { legitSeed: SEEDS.final_test }).diff,
  }));
  const diffs: ReplayDiffRow[] = [
    ...replayDiscovery.changed,
    ...replayFresh.flatMap((r) => r.changed),
  ];

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
      base_review_rate: baseRun.metrics.review_rate,
      cand_review_rate: candRun.metrics.review_rate,
      base_recall_with_review: baseRun.metrics.recall_with_review,
      cand_recall_with_review: candRun.metrics.recall_with_review,
      survived: survived,
      improvable: improvable.length,
      mcnemar_statistic: significance.statistic,
      mcnemar_p_value: significance.p_value,
      newly_caught: significance.after_only,
      newly_missed: significance.before_only,
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
    // these come from the replay itself, on the replay's own legitimate pool —
    // not from the gate run, which evaluates a different scenario set
    metrics: {
      discovery_before_recall: replayDiscovery.before.fraud_recall,
      discovery_after_recall: replayDiscovery.after.fraud_recall,
      discovery_changed_rows: replayDiscovery.changed.length,
      fresh_changed_rows: diffs.length - replayDiscovery.changed.length,
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
    significance,
    recallInterval,
    replayDiscovery,
    replayFresh,
    replayDiff: diffs,
  };
}

export function v1ConfigFor(model: DetectorWeights): DefenseConfig {
  return V1_AS_DEFENSE(model.threshold_block);
}
