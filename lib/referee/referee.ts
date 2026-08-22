import { Genome, DefenseConfig, VERSIONS } from "@/lib/contracts/genome";
import { buildWorld, generateLegitStream, World } from "@/lib/simulator/world";
import { compileScenario } from "@/lib/simulator/scenario";
import { featurize } from "@/lib/fraud/features";
import { DetectorWeights, scoreFeaturized, ScoredTx } from "@/lib/fraud/detector";
import { computeMetrics, attackSuccessRate } from "@/lib/metrics/metrics";

export const EPOCH_START = Date.UTC(2026, 0, 5, 0, 0, 0);
export const HORIZON_DAYS = 14;
export const BACKDROP_DAYS = 30;
/** Streams start cold; features only mean something on mature history. */
export const BURN_IN_DAYS = 16;
const DAY_MS = 86_400_000;
export const EVAL_EPOCH_START = EPOCH_START + BURN_IN_DAYS * DAY_MS;

// Referee-owned experiment seeds. No other module may invent evaluation seeds.
export const SEEDS = {
  train: 10101,
  search: 20202,
  blue_dev: 30303,
  final_test: 40404,
} as const;

const worldCache = new Map<number, World>();
function world(seed = 20260822): World {
  let w = worldCache.get(seed);
  if (!w) {
    w = buildWorld(seed);
    worldCache.set(seed, w);
  }
  return w;
}

// Backdrops are pure functions of (worldSeed, legitSeed) and are never
// mutated downstream (tx ids are assigned at generation time), so caching
// is safe and keeps repeated evaluations fast.
const backdropCache = new Map<string, ReturnType<typeof generateLegitStream>>();
function backdrop(legitSeed: number) {
  const key = `${legitSeed}`;
  let b = backdropCache.get(key);
  if (!b) {
    b = generateLegitStream(world(), legitSeed, BACKDROP_DAYS, EPOCH_START);
    backdropCache.set(key, b);
  }
  return b;
}

export interface ScenarioSpec {
  genome: Genome;
  seed: number;
  scenario_id: string;
}

export interface ScenarioOutcome {
  scenario_id: string;
  n_fraud: number;
  n_flagged: number;
  attack_success_rate: number;
}

export interface EvalRun {
  metrics: MetricsResult;
  per_scenario: ScenarioOutcome[];
}

/**
 * The Referee's single evaluation path. Every number the UI or the gate
 * shows comes from this function — same inputs give identical outputs.
 */
export function refereeEvaluate(
  model: DetectorWeights,
  defense: DefenseConfig | null,
  scenarios: ScenarioSpec[],
  opts?: { legitSeed?: number }
): EvalRun {
  const w = world();
  const legitSeed = (opts?.legitSeed ?? SEEDS.search) >>> 0;
  const backdropRows = backdrop(legitSeed);

  const all = [...backdropRows];
  const windows = new Map<string, [number, number]>();
  for (const s of scenarios) {
    // attacks are compiled inside the mature (post burn-in) window
    const c = compileScenario(s.genome, s.seed, s.scenario_id, w, EVAL_EPOCH_START, HORIZON_DAYS);
    all.push(...c.transactions);
    for (const [k, v] of c.customer_windows) windows.set(k, v);
  }
  all.sort((a, b) => a.ts_ms - b.ts_ms || a.tx_id.localeCompare(b.tx_id));

  const feats = featurize(all, windows);
  const { scored } = scoreFeaturized(feats, model, defense ?? undefined);

  // warmup rows provide feature context only; never metric denominators.
  // Burn-in rows are excluded too: early-stream history is immature.
  const evalSet = scored.filter((s) => s.tx.kind !== "warmup" && s.tx.ts_ms >= EVAL_EPOCH_START);
  const metrics = computeMetrics(evalSet);

  const per_scenario: ScenarioOutcome[] = scenarios.map((s) => {
    const rows = evalSet.filter((r) => r.tx.scenario_id === s.scenario_id && r.tx.ground_truth === "fraud");
    return {
      scenario_id: s.scenario_id,
      n_fraud: rows.length,
      n_flagged: rows.filter((r) => r.out.decision !== "allow").length,
      attack_success_rate: attackSuccessRate(rows),
    };
  });

  return { metrics, per_scenario };
}

/** Byte-exact replay of one scenario under two defense configs. */
export function replayPair(
  model: DetectorWeights,
  beforeDefense: DefenseConfig | null,
  afterDefense: DefenseConfig | null,
  spec: ScenarioSpec
): {
  before: EvalRun;
  after: EvalRun;
  diff: { tx_id: string; amount: number; before: string; after: string }[];
} {
  const w = world();
  const backdropRows = backdrop(SEEDS.blue_dev);
  const c = compileScenario(spec.genome, spec.seed, spec.scenario_id, w, EVAL_EPOCH_START, HORIZON_DAYS);
  const all = [...backdropRows, ...c.transactions].sort(
    (a, b) => a.ts_ms - b.ts_ms || a.tx_id.localeCompare(b.tx_id)
  );
  const feats = featurize(all, c.customer_windows);
  const runWith = (d: DefenseConfig | null) => {
    const { scored } = scoreFeaturized(feats, model, d ?? undefined);
    const evalSet = scored.filter((s) => s.tx.kind !== "warmup" && s.tx.ts_ms >= EVAL_EPOCH_START);
    return { metrics: computeMetrics(evalSet), evalSet };
  };
  const beforeRun = runWith(beforeDefense);
  const afterRun = runWith(afterDefense);

  const before: EvalRun = { metrics: beforeRun.metrics, per_scenario: perScenarioOf(spec, beforeRun.evalSet) };
  const after: EvalRun = { metrics: afterRun.metrics, per_scenario: perScenarioOf(spec, afterRun.evalSet) };

  const bRows = beforeRun.evalSet.filter((s) => s.tx.scenario_id === spec.scenario_id && s.tx.ground_truth === "fraud");
  const aRows = afterRun.evalSet.filter((s) => s.tx.scenario_id === spec.scenario_id && s.tx.ground_truth === "fraud");
  const diff = bRows
    .map((rowB, i) => ({
      tx_id: rowB.tx.tx_id,
      amount: rowB.tx.amount,
      before: rowB.out.decision,
      after: aRows[i]?.out.decision ?? "?",
    }))
    .filter((r) => r.before !== r.after);

  return { before, after, diff };
}

function perScenarioOf(spec: ScenarioSpec, evalSet: ScoredTx[]): ScenarioOutcome[] {
  const rows = evalSet.filter((r) => r.tx.scenario_id === spec.scenario_id && r.tx.ground_truth === "fraud");
  return [
    {
      scenario_id: spec.scenario_id,
      n_fraud: rows.length,
      n_flagged: rows.filter((r) => r.out.decision !== "allow").length,
      attack_success_rate: attackSuccessRate(rows),
    },
  ];
}

/** Deterministic defense acceptance gate — thresholds are policy, not vibes. */
export function gateDecision(
  base: EvalRun,
  candidate: EvalRun,
  freshSeedsSurvived: number,
  totalFreshSeeds: number
): { accepted: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const recallGain = candidate.metrics.fraud_recall - base.metrics.fraud_recall;
  const fprDelta = candidate.metrics.fpr - base.metrics.fpr;

  if (recallGain < 0.05) reasons.push(`recall_gain_${recallGain.toFixed(3)}_below_+5pts`);
  if (fprDelta > 0.01) reasons.push(`fpr_delta_+${(fprDelta * 100).toFixed(2)}pts_above_1pt`);
  if (freshSeedsSurvived / Math.max(1, totalFreshSeeds) < 0.8)
    reasons.push(`survived_${freshSeedsSurvived}/${totalFreshSeeds}_below_80%`);

  return { accepted: reasons.length === 0, reasons };
}

export function currentVersions() {
  return { ...VERSIONS };
}
