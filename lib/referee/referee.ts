import { Genome, DefenseConfig, MetricsResult, VERSIONS } from "@/lib/contracts/genome";
import { buildWorld, generateLegitStream, World } from "@/lib/simulator/world";
import { compileScenario } from "@/lib/simulator/scenario";
import { featurize } from "@/lib/fraud/features";
import { DetectorWeights, scoreFeaturized, ScoredTx } from "@/lib/fraud/detector";
import { computeMetrics, attackSuccessRate, prCurve, OperatingPoint } from "@/lib/metrics/metrics";

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
  risk_max: number;
  risk_median: number;
  top_reasons: string[];
  /** feature medians over the FALSE NEGATIVES (allowed fraud txs) — blue team evidence */
  fn_feature_medians: Record<string, number>;
}

const FN_FEATURES = [
  "amt_z",
  "vel_24h",
  "hour_outside_pref",
  "new_device",
  "new_merchant",
  "young_account",
  "escalation_score",
  "pattern_score",
  "newcomer_count_48h",
  "newcomer_burst_score",
  "geo_anomaly",
  "near_limit_repeat_24h",
  "merchant_spread_24h",
  "dormancy_h",
] as const;

function medianOf(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Minimal per-transaction record for the fraud rows, so paired before/after
 *  tests (McNemar) can join on tx_id instead of assuming ordering. */
export interface FraudRow {
  tx_id: string;
  scenario_id: string;
  decision: string;
  risk_score: number;
}

export interface EvalRun {
  metrics: MetricsResult;
  per_scenario: ScenarioOutcome[];
  fraud_rows: FraudRow[];
  /** precision/recall/F1 across the whole score range for this run */
  operating_points: OperatingPoint[];
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
    const risks = rows.map((r) => r.out.risk_score).sort((a, b) => a - b);
    const freq = new Map<string, number>();
    for (const r of rows) {
      if (r.out.decision === "allow") continue;
      for (const rc of r.out.reason_codes) freq.set(rc, (freq.get(rc) ?? 0) + 1);
    }
    const top_reasons = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    const fnRows = rows.filter((r) => r.out.decision === "allow");
    const fn_feature_medians: Record<string, number> = {};
    for (const k of FN_FEATURES) {
      fn_feature_medians[k] = Math.round(medianOf(fnRows.map((r) => r.f[k] as number)) * 1000) / 1000;
    }
    return {
      scenario_id: s.scenario_id,
      n_fraud: rows.length,
      n_flagged: rows.filter((r) => r.out.decision !== "allow").length,
      attack_success_rate: attackSuccessRate(rows),
      risk_max: risks[risks.length - 1] ?? 0,
      risk_median: risks[Math.floor(risks.length / 2)] ?? 0,
      top_reasons,
      fn_feature_medians,
    };
  });

  return {
    metrics,
    per_scenario,
    operating_points: prCurve(evalSet, 20),
    fraud_rows: evalSet
      .filter((s) => s.tx.ground_truth === "fraud")
      .map((s) => ({
        tx_id: s.tx.tx_id,
        scenario_id: s.tx.scenario_id,
        decision: s.out.decision,
        risk_score: s.out.risk_score,
      })),
  };
}

export interface ReplayDiffRow {
  scenario_id: string;
  tx_id: string;
  amount: number;
  before: string;
  after: string;
}

/**
 * Byte-exact replay of ONE scenario under two defense configs.
 * `legitSeed` must match the pool the caller is reasoning about, otherwise the
 * returned metrics describe a different legitimate population than the run
 * they are compared against.
 */
export function replayPair(
  model: DetectorWeights,
  beforeDefense: DefenseConfig | null,
  afterDefense: DefenseConfig | null,
  spec: ScenarioSpec,
  opts?: { legitSeed?: number }
): {
  before: EvalRun;
  after: EvalRun;
  diff: ReplayDiffRow[];
} {
  const w = world();
  const backdropRows = backdrop(opts?.legitSeed ?? SEEDS.blue_dev);
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

  const fraudRowsOf = (rows: ScoredTx[]): FraudRow[] =>
    rows
      .filter((s) => s.tx.ground_truth === "fraud")
      .map((s) => ({
        tx_id: s.tx.tx_id,
        scenario_id: s.tx.scenario_id,
        decision: s.out.decision,
        risk_score: s.out.risk_score,
      }));
  const before: EvalRun = {
    metrics: beforeRun.metrics,
    per_scenario: perScenarioOf(spec, beforeRun.evalSet),
    operating_points: prCurve(beforeRun.evalSet, 20),
    fraud_rows: fraudRowsOf(beforeRun.evalSet),
  };
  const after: EvalRun = {
    metrics: afterRun.metrics,
    per_scenario: perScenarioOf(spec, afterRun.evalSet),
    operating_points: prCurve(afterRun.evalSet, 20),
    fraud_rows: fraudRowsOf(afterRun.evalSet),
  };

  const bRows = beforeRun.evalSet.filter((s) => s.tx.scenario_id === spec.scenario_id && s.tx.ground_truth === "fraud");
  const aRows = afterRun.evalSet.filter((s) => s.tx.scenario_id === spec.scenario_id && s.tx.ground_truth === "fraud");
  // pair by transaction id, not by index: identical inputs give identical
  // ordering, but an id join makes that assumption explicit and safe.
  const afterById = new Map(aRows.map((r) => [r.tx.tx_id, r.out.decision]));
  const diff: ReplayDiffRow[] = bRows
    .map((rowB) => ({
      scenario_id: spec.scenario_id,
      tx_id: rowB.tx.tx_id,
      amount: rowB.tx.amount,
      before: rowB.out.decision as string,
      after: (afterById.get(rowB.tx.tx_id) ?? "?") as string,
    }))
    .filter((r) => r.before !== r.after);

  return { before, after, diff };
}

function perScenarioOf(spec: ScenarioSpec, evalSet: ScoredTx[]): ScenarioOutcome[] {
  const rows = evalSet.filter((r) => r.tx.scenario_id === spec.scenario_id && r.tx.ground_truth === "fraud");
  const risks = rows.map((r) => r.out.risk_score).sort((a, b) => a - b);
  const freq = new Map<string, number>();
  for (const r of rows) {
    if (r.out.decision === "allow") continue;
    for (const rc of r.out.reason_codes) freq.set(rc, (freq.get(rc) ?? 0) + 1);
  }
  const fnRows = rows.filter((r) => r.out.decision === "allow");
  const fn_feature_medians: Record<string, number> = {};
  for (const k of FN_FEATURES) {
    fn_feature_medians[k] = Math.round(medianOf(fnRows.map((r) => r.f[k] as number)) * 1000) / 1000;
  }
  return [
    {
      scenario_id: spec.scenario_id,
      n_fraud: rows.length,
      n_flagged: rows.filter((r) => r.out.decision !== "allow").length,
      attack_success_rate: attackSuccessRate(rows),
      risk_max: risks[risks.length - 1] ?? 0,
      risk_median: risks[Math.floor(risks.length / 2)] ?? 0,
      top_reasons: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k),
      fn_feature_medians,
    },
  ];
}

/** Deterministic defense acceptance gate — thresholds are policy, not vibes.
 *  recallGain is measured against the DISCOVERED THREAT CLASS (fresh-seed
 *  recompiles of the blind-spot genome), not diluted by template scenarios. */
export function gateDecision(
  threatRecallGain: number,
  fprDelta: number,
  freshSeedsSurvived: number,
  totalFreshSeeds: number
): { accepted: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (threatRecallGain < 0.05) reasons.push(`threat_recall_gain_${(threatRecallGain * 100).toFixed(1)}pts_below_+5pts`);
  if (fprDelta > 0.01) reasons.push(`fpr_delta_+${(fprDelta * 100).toFixed(2)}pts_above_1pt`);
  if (totalFreshSeeds > 0 && freshSeedsSurvived / totalFreshSeeds < 0.8)
    reasons.push(`survived_${freshSeedsSurvived}/${totalFreshSeeds}_below_80%`);
  return { accepted: reasons.length === 0, reasons };
}

export function currentVersions() {
  return { ...VERSIONS };
}
