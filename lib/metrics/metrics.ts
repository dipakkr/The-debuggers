import { MetricsResult } from "@/lib/contracts/genome";
import type { ScoredTx } from "@/lib/fraud/detector";

/**
 * All competition metrics are computed here and nowhere else.
 *
 * TWO recall definitions are reported side by side, because production
 * payment systems separate declines from manual-review queues:
 *   - `fraud_recall`      counts only BLOCK (auto-decline) as a catch.
 *   - `recall_with_review` counts BLOCK or REVIEW (held for an analyst).
 * Precision / FPR / F1 are always computed on the strict BLOCK definition,
 * so a defense cannot buy recall by dumping traffic into the review queue.
 */
export function computeMetrics(scored: ScoredTx[]): MetricsResult {
  let tp = 0, fp = 0, tn = 0, fn = 0, reviews = 0, tpWithReview = 0;
  for (const s of scored) {
    const blocked = s.out.decision === "block";
    const reviewed = s.out.decision === "review";
    if (s.tx.ground_truth === "fraud") {
      blocked ? tp++ : fn++;
      if (blocked || reviewed) tpWithReview++;
    } else {
      blocked ? fp++ : tn++;
      if (reviewed) reviews++;
    }
  }
  const lat = scored.map((s) => s.out.latency_ms).sort((a, b) => a - b);
  const q = (p: number) => lat[Math.floor(p * Math.max(0, lat.length - 1))] ?? 0;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const fraud_recall = tp + fn > 0 ? tp / (tp + fn) : 0;

  return {
    fraud_recall,
    recall_with_review: tp + fn > 0 ? tpWithReview / (tp + fn) : 0,
    roc_auc: rocAuc(scored),
    precision,
    f1: precision + fraud_recall > 0 ? (2 * precision * fraud_recall) / (precision + fraud_recall) : 0,
    fpr: fp + tn > 0 ? fp / (fp + tn) : 0,
    fnr: tp + fn > 0 ? fn / (tp + fn) : 0,
    review_rate: fp + tn > 0 ? reviews / (fp + tn) : 0,
    average_precision: averagePrecision(scored),
    p50_latency_ms: round6(q(0.5)),
    p95_latency_ms: round6(q(0.95)),
    n_legit: fp + tn,
    n_fraud: tp + fn,
  };
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * ROC-AUC via the rank (Mann-Whitney U) identity, with proper mid-rank
 * handling for tied risk scores. Ties are common because risk_score is
 * rounded to four decimals, so ignoring them would bias the number upward.
 */
export function rocAuc(scored: ScoredTx[]): number {
  const rows = scored.map((s) => ({ score: s.out.risk_score, pos: s.tx.ground_truth === "fraud" }));
  const nPos = rows.filter((r) => r.pos).length;
  const nNeg = rows.length - nPos;
  if (nPos === 0 || nNeg === 0) return 0;
  rows.sort((a, b) => a.score - b.score);

  let rankSumPos = 0;
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1].score === rows[i].score) j++;
    // mid-rank shared by every member of this tie group (ranks are 1-based)
    const midRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) if (rows[k].pos) rankSumPos += midRank;
    i = j + 1;
  }
  return (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

/**
 * Average precision over the risk-score ranking. Tied scores are resolved as
 * a block (all members of a tie group share the precision at the end of the
 * group), so an unlucky sort order cannot inflate the result.
 */
export function averagePrecision(scored: ScoredTx[]): number {
  const rows = scored
    .map((s) => ({ score: s.out.risk_score, pos: s.tx.ground_truth === "fraud" }))
    .sort((a, b) => b.score - a.score);
  const total = rows.filter((r) => r.pos).length;
  if (total === 0) return 0;

  let seen = 0, positives = 0, apSum = 0;
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1].score === rows[i].score) j++;
    const groupPos = rows.slice(i, j + 1).filter((r) => r.pos).length;
    seen = j + 1;
    positives += groupPos;
    if (groupPos > 0) apSum += groupPos * (positives / seen);
    i = j + 1;
  }
  return apSum / total;
}

/** Share of a scenario's fraud transactions that sailed through as `allow`. */
export function attackSuccessRate(fraudTxs: ScoredTx[]): number {
  if (!fraudTxs.length) return 0;
  return fraudTxs.filter((s) => s.out.decision === "allow").length / fraudTxs.length;
}

/**
 * Precision/recall/F1 across the full score range, so the operating point is
 * a reported choice rather than an accident of threshold calibration.
 */
export interface OperatingPoint {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  fpr: number;
  false_positives: number;
}

export function prCurve(scored: ScoredTx[], steps = 40): OperatingPoint[] {
  const out: OperatingPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (const s of scored) {
      const flag = s.out.risk_score >= t;
      if (s.tx.ground_truth === "fraud") flag ? tp++ : fn++;
      else flag ? fp++ : tn++;
    }
    const p = tp + fp > 0 ? tp / (tp + fp) : 0;
    const r = tp + fn > 0 ? tp / (tp + fn) : 0;
    out.push({
      threshold: Math.round(t * 1000) / 1000,
      precision: p,
      recall: r,
      f1: p + r > 0 ? (2 * p * r) / (p + r) : 0,
      fpr: fp + tn > 0 ? fp / (fp + tn) : 0,
      false_positives: fp,
    });
  }
  return out;
}
