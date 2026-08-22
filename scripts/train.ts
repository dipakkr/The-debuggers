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

function main() {
  console.log("[train] building world…");
  const world = buildWorld(WORLD_SEED);
  console.log("[train] legit stream…");
  const legit = generateLegitStream(world, TRAIN_SEED, DAYS, EPOCH_START);

  // inject loud template fraud so the baseline learns conventional attacks.
  // Attacks are compiled inside the mature (post burn-in) window.
  const txs = [...legit];
  const windows = new Map<string, [number, number]>();
  const countsPerTemplate = [20, 15, 12, 18, 15];
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

  // fit on first 80%, calibrate thresholds on last 20%
  const cut = Math.floor(X.length * 0.8);
  const { w, b } = fitLogistic(X.slice(0, cut), y.slice(0, cut));
  const score = (row: number[]) => 1 / (1 + Math.exp(-(row.reduce((s, v, j) => s + v * w[j], 0) + b)));
  const legitValScores = feats
    .slice(cut)
    .filter((r) => r.tx.ground_truth === "legit")
    .map((r) => score(V1_FEATURES.map((k) => r.f[k] as number)))
    .sort((a, b2) => a - b2);
  const threshold_review = quantileSorted(legitValScores, 0.94);
  const threshold_block = quantileSorted(legitValScores, 0.98);

  // report train-set recall at chosen threshold
  let tp = 0, fn = 0, fp = 0;
  for (let i = 0; i < cut; i++) {
    const flagged = score(X[i]) >= threshold_block || X[i][1] >= 14 || X[i][6] >= 5;
    if (y[i] === 1) flagged ? tp++ : fn++;
    else if (flagged) fp++;
  }

  const model: DetectorWeights = {
    version: "risk-engine-1.0.0",
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
    },
  };

  mkdirSync("data/models", { recursive: true });
  writeFileSync("data/models/detector-v1.json", JSON.stringify(model, null, 2));
  console.log(
    `[train] saved data/models/detector-v1.json\n  recall@block=${(tp / (tp + fn)).toFixed(3)} fpr=${(fp / cut).toFixed(4)}\n  thresholds block=${model.threshold_block} review=${model.threshold_review}`
  );
}

main();
