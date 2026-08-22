import { MetricsResult } from "@/lib/contracts/genome";
import type { ScoredTx } from "@/lib/fraud/detector";

/**
 * All competition metrics are computed here and nowhere else.
 * "Flagged" means BLOCKED (decline). Reviews are tracked separately as
 * review_rate — mirroring how production separates declines from manual
 * review queues.
 */
export function computeMetrics(scored: ScoredTx[]): MetricsResult {
  let tp = 0, fp = 0, tn = 0, fn = 0, reviews = 0;
  for (const s of scored) {
    const blocked = s.out.decision === "block";
    const reviewed = s.out.decision === "review";
    if (s.tx.ground_truth === "fraud") {
      blocked ? tp++ : fn++;
    } else {
      blocked ? fp++ : tn++;
      if (reviewed) reviews++;
    }
  }
  const lat = scored.map((s) => s.out.latency_ms).sort((a, b) => a - b);
  const q = (p: number) => lat[Math.floor(p * Math.max(0, lat.length - 1))] ?? 0;

  // average precision over risk_score ranking
  const byScore = [...scored].sort((a, b) => b.out.risk_score - a.out.risk_score);
  let positives = 0, seen = 0, apSum = 0;
  for (const s of byScore) {
    seen++;
    if (s.tx.ground_truth === "fraud") {
      positives++;
      apSum += positives / seen;
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const fraud_recall = tp + fn > 0 ? tp / (tp + fn) : 0;

  return {
    fraud_recall,
    precision,
    f1: precision + fraud_recall > 0 ? (2 * precision * fraud_recall) / (precision + fraud_recall) : 0,
    fpr: fp + tn > 0 ? fp / (fp + tn) : 0,
    fnr: tp + fn > 0 ? fn / (tp + fn) : 0,
    review_rate: fp + tn > 0 ? reviews / (fp + tn) : 0,
    average_precision: positives > 0 ? apSum / positives : 0,
    p50_latency_ms: Math.round(q(0.5) * 1000) / 1000,
    p95_latency_ms: Math.round(q(0.95) * 1000) / 1000,
    n_legit: fp + tn,
    n_fraud: tp + fn,
  };
}

/** Share of a scenario's fraud transactions that sailed through as `allow`. */
export function attackSuccessRate(fraudTxs: ScoredTx[]): number {
  if (!fraudTxs.length) return 0;
  return fraudTxs.filter((s) => s.out.decision === "allow").length / fraudTxs.length;
}
