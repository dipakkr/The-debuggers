import { writeFileSync, mkdirSync } from "node:fs";
import { buildWorld, generateLegitStream } from "@/lib/simulator/world";
import { compileScenario } from "@/lib/simulator/scenario";
import { featurize } from "@/lib/fraud/features";
import { DetectorWeights, V1_FEATURES } from "@/lib/fraud/detector";
import { TEMPLATE_GENOMES } from "@/lib/attacks/templates";
import { EPOCH_START, EVAL_EPOCH_START, HORIZON_DAYS } from "@/lib/referee/referee";

const WORLD_SEED = 20260822;
const TRAIN_SEED = 10101;
const DAYS = 30;
/** Fraud share of transaction COUNT that the operating point is chosen for.
 *  Public card-fraud reporting sits in the low tenths of a percent; the
 *  evaluation pools in this repository land at ~0.27%. */
const DEPLOY_PREVALENCE = 0.003;

function fitLogistic(X: number[][], y: number[], epochs = 600, lr = 0.5, l2 = 1e-4) {
  const nF = X[0].length;
  const nPos = y.reduce((a, b) => a + b, 0);
  const posWeight = nPos > 0 ? Math.max(1, (X.length - nPos) / nPos / 4) : 1; // mild rebalance
  const wts = y.map((v) => (v === 1 ? posWeight : 1));
  const totalW = wts.reduce((a, b) => a + b, 0);
  const mu = Array.from({ length: nF }, (_, j) => X.reduce((s, r) => s + r[j], 0) / X.length);
  const sd = Array.from({ length: nF }, (_, j) => {
    const m = mu[j];
    return Math.max(1e-6, Math.sqrt(X.reduce((s, r) => s + (r[j] - m) ** 2, 0) / X.length));
  });
  let w = new Array(nF).fill(0);
  let b = 0;
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(nF).fill(0);
    let gb = 0;
    for (let i = 0; i < X.length; i++) {
      let z = b;
      for (let j = 0; j < nF; j++) z += w[j] * ((X[i][j] - mu[j]) / sd[j]);
      const p = 1 / (1 + Math.exp(-z));
      const err = (p - y[i]) * wts[i];
      for (let j = 0; j < nF; j++) gw[j] += err * ((X[i][j] - mu[j]) / sd[j]);
      gb += err;
    }
    for (let j = 0; j < nF; j++) w[j] -= lr * (gw[j] / totalW + l2 * w[j]);
    b -= lr * (gb / totalW);
  }
  // un-standardize back to raw feature space
  const wRaw = w.map((wj, j) => wj / sd[j]);
  const bRaw = b - w.reduce((s, wj, j) => s + (wj * mu[j]) / sd[j], 0);
  return { w: wRaw, b: bRaw };
}

const quantileSorted = (sortedAsc: number[], q: number) =>
  sortedAsc[Math.min(sortedAsc.length - 1, Math.floor(q * sortedAsc.length))];

interface Operating {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  fpr: number;
  raw_precision: number;
}

/**
 * Choose the BLOCK threshold by maximising F1 AT DEPLOYMENT PREVALENCE,
 * subject to a hard false-positive ceiling.
 *
 * Two corrections over a naive sweep:
 *
 * 1. The previous calibration took a fixed 98th percentile of legitimate
 *    scores, which PINS the false-positive rate at ~2% by construction. At a
 *    realistic fraud base rate that caps precision in the single digits no
 *    matter how well the model separates the classes — the reported F1 then
 *    describes the operating point, not the model.
 *
 * 2. The training pool is deliberately fraud-dense so the model has enough
 *    positives to fit; deployment is not. Precision depends on prevalence, so
 *    a threshold tuned on the dense pool is systematically too low. Rather
 *    than throwing away positives to subsample down to the deployment rate
 *    (which leaves a handful of rows and a very noisy sweep), estimate TPR and
 *    FPR on the FULL slice — both are prevalence-independent — and convert to
 *    precision analytically:
 *
 *        precision(pi) = pi*TPR / (pi*TPR + (1 - pi)*FPR)
 *
 *    This uses every available row and still reports the number a production
 *    fraud team would actually see.
 */
function calibrate(
  scores: number[],
  labels: number[],
  maxFpr: number,
  prevalence: number
): Operating {
  const candidates = [...new Set(scores.map((s) => Math.round(s * 1000) / 1000))].sort((a, b) => a - b);
  let best: Operating = {
    threshold: 0.5, precision: 0, recall: 0, f1: -1, fpr: 1, raw_precision: 0,
  };
  for (const t of candidates) {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (let i = 0; i < scores.length; i++) {
      const flag = scores[i] >= t;
      if (labels[i] === 1) flag ? tp++ : fn++;
      else flag ? fp++ : tn++;
    }
    const tpr = tp + fn > 0 ? tp / (tp + fn) : 0;
    const fpr = fp + tn > 0 ? fp / (fp + tn) : 1;
    if (fpr > maxFpr) continue;
    const denom = prevalence * tpr + (1 - prevalence) * fpr;
    const p = denom > 0 ? (prevalence * tpr) / denom : 0;
    const f1 = p + tpr > 0 ? (2 * p * tpr) / (p + tpr) : 0;
    if (f1 > best.f1) {
      best = {
        threshold: t,
        precision: p,
        recall: tpr,
        f1,
        fpr,
        raw_precision: tp + fp > 0 ? tp / (tp + fp) : 0,
      };
    }
  }
  return best;
}

function main() {
  console.log("[train] building world…");
  const world = buildWorld(WORLD_SEED);
  console.log("[train] legit stream…");
  const legit = generateLegitStream(world, TRAIN_SEED, DAYS, EPOCH_START);

  // inject loud template fraud so the baseline learns conventional attacks.
  // Attacks are compiled inside the mature (post burn-in) window.
  const txs = [...legit];
  const windows = new Map<string, [number, number]>();
  const countsPerTemplate = [20, 15, 12, 18, 15, 16, 14];
  TEMPLATE_GENOMES.forEach((g, ti) => {
    for (let k = 0; k < countsPerTemplate[ti]; k++) {
      const sid = `AF-9${ti}${String(k).padStart(3, "0")}`;
      const c = compileScenario(g, TRAIN_SEED + ti * 7919 + k * 104729, sid, world, EVAL_EPOCH_START, HORIZON_DAYS);
      txs.push(...c.transactions);
      for (const [kk, vv] of c.customer_windows) windows.set(kk, vv);
    }
  });
  txs.sort((a, b) => a.ts_ms - b.ts_ms || a.customer_id.localeCompare(b.customer_id));

  console.log(`[train] featurizing ${txs.length.toLocaleString()} txs…`);
  const feats = featurize(txs, windows).filter(
    (r) => r.tx.kind !== "warmup" && r.tx.ts_ms >= EVAL_EPOCH_START
  );
  const X = feats.map((r) => V1_FEATURES.map((k) => r.f[k] as number));
  const y = feats.map((r) => (r.tx.ground_truth === "fraud" ? 1 : 0));
  console.log(`[train] rows=${X.length} fraud=${(y as number[]).reduce((a, b) => a + b, 0)}`);

  // fit on first 80%, calibrate thresholds on the held-out last 20%
  const cut = Math.floor(X.length * 0.8);
  const { w, b } = fitLogistic(X.slice(0, cut), y.slice(0, cut));
  const score = (row: number[]) => 1 / (1 + Math.exp(-(row.reduce((s, v, j) => s + v * w[j], 0) + b)));

  const valRows = feats.slice(cut);
  const valScores = valRows.map((r) => score(V1_FEATURES.map((k) => r.f[k] as number)));
  const valLabels = valRows.map((r) => (r.tx.ground_truth === "fraud" ? 1 : 0));

  // BLOCK: auto-decline. Maximise F1 at deployment prevalence, under a 0.3%
  // false-positive ceiling — roughly 3 wrongly declined payments per 1,000.
  const blockOp = calibrate(valScores, valLabels, 0.003, DEPLOY_PREVALENCE);
  console.log(
    `[train] calibration slice: ${valLabels.length} rows, ` +
      `${valLabels.filter((l) => l === 1).length} fraud; ` +
      `operating point chosen for ${(DEPLOY_PREVALENCE * 100).toFixed(2)}% deployment prevalence`
  );
  const threshold_block = Math.round(blockOp.threshold * 10000) / 10000;

  // REVIEW: analyst queue, a far cheaper error. Allow a wider net (2% of
  // legitimate traffic) so recall-with-review stays high without paying the
  // precision cost on declines.
  const legitValScores = valScores.filter((_, i) => valLabels[i] === 0).sort((a, b2) => a - b2);
  const threshold_review = Math.min(
    threshold_block,
    Math.round(quantileSorted(legitValScores, 0.985) * 10000) / 10000
  );

  console.log(
    `[train] block operating point: t=${threshold_block} P=${(blockOp.precision * 100).toFixed(1)}% ` +
      `R=${(blockOp.recall * 100).toFixed(1)}% F1=${(blockOp.f1 * 100).toFixed(1)}% FPR=${(blockOp.fpr * 100).toFixed(3)}%`
  );

  // report train-set recall at chosen threshold
  let tp = 0, fn = 0, fp = 0;
  for (let i = 0; i < cut; i++) {
    const flagged = score(X[i]) >= threshold_block || X[i][1] >= 14 || X[i][6] >= 5;
    if (y[i] === 1) flagged ? tp++ : fn++;
    else if (flagged) fp++;
  }

  const model: DetectorWeights = {
    version: "risk-engine-1.1.0",
    feature_names: [...V1_FEATURES],
    w,
    b,
    threshold_block: Math.round(threshold_block * 10000) / 10000,
    threshold_review: Math.round(threshold_review * 10000) / 10000,
    trained_on: {
      world_seed: WORLD_SEED,
      train_seed: TRAIN_SEED,
      days: DAYS,
      rows: cut,
      train_recall_at_threshold: tp / (tp + fn),
      train_fpr_at_threshold: fp / cut,
      calibration: `max-F1 on held-out 20% slice re-weighted to ${DEPLOY_PREVALENCE * 100}% deployment prevalence, FPR ceiling 0.3%`,
      deploy_prevalence: DEPLOY_PREVALENCE,
      calibration_precision: blockOp.precision,
      calibration_recall: blockOp.recall,
      calibration_f1: blockOp.f1,
      calibration_fpr: blockOp.fpr,
      calibration_precision_in_slice: blockOp.raw_precision,
    },
  };

  mkdirSync("data/models", { recursive: true });
  writeFileSync("data/models/detector-v1.json", JSON.stringify(model, null, 2));
  console.log(
    `[train] saved data/models/detector-v1.json\n  recall@block=${(tp / (tp + fn)).toFixed(3)} fpr=${(fp / cut).toFixed(4)}\n  thresholds block=${model.threshold_block} review=${model.threshold_review}`
  );
}

main();
