/**
 * World-misspecification study.
 *
 * Every headline number in this repository is measured inside one synthetic
 * world, and the honest objection is that the results could be an artefact of
 * the distributions we happened to choose rather than a property of the
 * detector. We cannot answer that with an authorized network extract, but we
 * can answer the part that matters: does the detector, trained and calibrated
 * on ONE world, still separate fraud in worlds whose population distributions
 * are materially different?
 *
 * The model is NOT retrained and the threshold is NOT recalibrated. Each world
 * reshapes the population — spend level, dispersion, cadence, newcomer share,
 * cross-border share, device churn — and the same artifact is scored against it.
 *
 *   npx tsx scripts/robustness.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ATTACK_FAMILIES } from "@/lib/contracts/genome";
import { buildWorld, generateLegitStream, DEFAULT_WORLD_PARAMS, WorldParams } from "@/lib/simulator/world";
import { compileScenario } from "@/lib/simulator/scenario";
import { featurize } from "@/lib/fraud/features";
import { scoreFeaturized } from "@/lib/fraud/detector";
import { computeMetrics } from "@/lib/metrics/metrics";
import { loadModel } from "@/lib/mutations/engine";
import { rootGenome } from "@/lib/mutations/demo-policy";
import { EPOCH_START, EVAL_EPOCH_START, HORIZON_DAYS, BACKDROP_DAYS, SEEDS } from "@/lib/referee/referee";

const P = DEFAULT_WORLD_PARAMS;

const WORLDS: { name: string; note: string; params: WorldParams; seed: number }[] = [
  { name: "calibrated", note: "the world every other experiment uses", params: P, seed: 20260822 },
  {
    name: "affluent",
    note: "spend level roughly tripled",
    params: { ...P, meanAmountLow: 60, meanAmountHigh: 260 },
    seed: 771,
  },
  {
    name: "thrifty",
    note: "spend level roughly halved",
    params: { ...P, meanAmountLow: 8, meanAmountHigh: 40 },
    seed: 772,
  },
  {
    name: "erratic",
    note: "much wider per-customer amount dispersion",
    params: { ...P, amountCvLow: 0.6, amountCvHigh: 1.6 },
    seed: 773,
  },
  {
    name: "high-frequency",
    note: "customers transact far more often",
    params: { ...P, cadenceLow: 1.5, cadenceHigh: 8.0 },
    seed: 774,
  },
  {
    name: "young-heavy",
    note: "newcomers 8% -> 30% of the population",
    params: { ...P, youngAccountShare: 0.3 },
    seed: 775,
  },
  {
    name: "international",
    note: "cross-border cardholders 18% -> 55%, heavy device churn",
    params: { ...P, foreignHomeShare: 0.55, secondDeviceShare: 0.6 },
    seed: 776,
  },
  {
    name: "adversarial-mix",
    note: "every dimension shifted at once",
    params: {
      meanAmountLow: 55, meanAmountHigh: 300, amountCvLow: 0.55, amountCvHigh: 1.4,
      cadenceLow: 1.2, cadenceHigh: 6.5, youngAccountShare: 0.25,
      foreignHomeShare: 0.45, secondDeviceShare: 0.55,
    },
    seed: 777,
  },
];

function evaluate(params: WorldParams, seed: number) {
  const world = buildWorld(seed, 1200, 300, params);
  const legit = generateLegitStream(world, seed + 5, BACKDROP_DAYS, EPOCH_START);
  const all = [...legit];
  const windows = new Map<string, [number, number]>();
  ATTACK_FAMILIES.forEach((family, i) => {
    for (let k = 0; k < 3; k++) {
      const c = compileScenario(
        rootGenome(family), seed + i * 7919 + k * 104729,
        `RB-${i}${k}`, world, EVAL_EPOCH_START, HORIZON_DAYS
      );
      all.push(...c.transactions);
      for (const [kk, vv] of c.customer_windows) windows.set(kk, vv);
    }
  });
  all.sort((a, b) => a.ts_ms - b.ts_ms || a.tx_id.localeCompare(b.tx_id));
  const { scored } = scoreFeaturized(featurize(all, windows), loadModel());
  const evalSet = scored.filter((s) => s.tx.kind !== "warmup" && s.tx.ts_ms >= EVAL_EPOCH_START);
  return computeMetrics(evalSet);
}

function main(): void {
  const rows = WORLDS.map((w) => {
    const m = evaluate(w.params, w.seed);
    console.log(
      `${w.name.padEnd(17)} AUC ${(m.roc_auc * 100).toFixed(2)}%  F1 ${(m.f1 * 100).toFixed(2)}%  ` +
        `P ${(m.precision * 100).toFixed(2)}%  R ${(m.fraud_recall * 100).toFixed(2)}%  ` +
        `FPR ${(m.fpr * 100).toFixed(3)}%  (n=${m.n_fraud}/${m.n_legit})`
    );
    return { world: w.name, note: w.note, seed: w.seed, metrics: m };
  });

  const aucs = rows.map((r) => r.metrics.roc_auc);
  const fprs = rows.map((r) => r.metrics.fpr);
  const out = {
    generated_at: new Date().toISOString(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    detector: loadModel().version,
    note:
      "The detector is trained and threshold-calibrated on the 'calibrated' world ONLY. Every other row reshapes the population distributions and rescores the SAME artifact with no retraining and no recalibration.",
    summary: {
      worlds: rows.length,
      roc_auc_min: Math.round(Math.min(...aucs) * 10000) / 10000,
      roc_auc_max: Math.round(Math.max(...aucs) * 10000) / 10000,
      roc_auc_mean: Math.round((aucs.reduce((a, b) => a + b, 0) / aucs.length) * 10000) / 10000,
      fpr_max: Math.round(Math.max(...fprs) * 100000) / 100000,
    },
    worlds: rows,
  };
  const p = path.join(process.cwd(), "data", "evidence", "robustness.json");
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nAUC across worlds: ${(out.summary.roc_auc_min * 100).toFixed(2)}% – ${(out.summary.roc_auc_max * 100).toFixed(2)}%   worst FPR ${(out.summary.fpr_max * 100).toFixed(3)}%`);
  console.log(`wrote ${p}`);
}

main();
