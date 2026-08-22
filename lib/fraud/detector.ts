import { sigmoid } from "@/lib/rng";
import { z } from "zod";
import {
  DefenseConfig,
  DetectionOutput,
  Decision,
  TxFeatures,
} from "@/lib/contracts/genome";
import type { Featurized } from "./features";

export const V1_FEATURES = [
  "amt_z",
  "vel_1h",
  "vel_24h",
  "hour_outside_pref",
  "new_device",
  "new_merchant",
  "probe_count_24h",
] as const;

export const DetectorWeightsSchema = z
  .object({
    version: z.string().min(1),
    feature_names: z.array(z.string().min(1)).min(1),
    w: z.array(z.number().finite()).min(1),
    b: z.number().finite(),
    threshold_block: z.number().min(0).max(1),
    threshold_review: z.number().min(0).max(1),
    trained_on: z.record(z.unknown()),
  })
  .strict()
  .superRefine((model, ctx) => {
    if (model.feature_names.length !== model.w.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "feature_names and weights must have equal length",
      });
    }
    if (model.threshold_review > model.threshold_block) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "review threshold must not exceed block threshold",
      });
    }
  });
export type DetectorWeights = z.infer<typeof DetectorWeightsSchema>;

export interface ScoredTx {
  tx: Featurized["tx"];
  f: TxFeatures;
  out: DetectionOutput;
}

const REASON_LABELS: Record<string, string> = {
  amt_z: "AMOUNT_ANOMALY",
  vel_1h: "VELOCITY_BURST",
  vel_24h: "VELOCITY_HIGH",
  hour_outside_pref: "ODD_HOUR",
  new_device: "NEW_DEVICE",
  new_merchant: "NEW_MERCHANT",
  probe_count_24h: "CARD_TESTING_PROBES",
};

export function v1Vector(f: TxFeatures): number[] {
  return V1_FEATURES.map((k) => (f[k] as number));
}

/**
 * Deterministic risk engine.
 * v1 = hard rules + logistic regression over classic behavioural features.
 * v2 = v1 + blue-team defense knobs (escalation/pattern weights + graph gate).
 */
export function scoreFeaturized(
  items: Featurized[],
  model: DetectorWeights,
  defense?: DefenseConfig
): { scored: ScoredTx[]; p50_latency_ms: number; p95_latency_ms: number } {
  const scored: ScoredTx[] = [];
  const latencies: number[] = [];
  for (const item of items) {
    let holdForReview = false;
    const t0 = performance.now();
    let logit = model.b;
    const contribs: [string, number][] = [];
    const x = v1Vector(item.f);
    for (let i = 0; i < x.length; i++) {
      const c = model.w[i] * x[i];
      logit += c;
      if (c > 0.15) contribs.push([REASON_LABELS[model.feature_names[i]] ?? model.feature_names[i], c]);
    }

    if (defense) {
      const escC = defense.escalation_weight * 4 * item.f.escalation_score;
      const patC = defense.pattern_weight * 4 * item.f.pattern_score;
      // deadzone until coordination is strong, then steep ramp
      const b = item.f.newcomer_burst_score;
      const graphC = b > 0.5 ? defense.graph_weight * 4 * Math.min(1, (b - 0.5) * 4) : 0;
      if (escC > 0.15) contribs.push(["SPEND_ESCALATION", escC]);
      if (patC > 0.15) contribs.push(["CAMOUFLAGE_PATTERN", patC]);
      if (graphC > 0.15) contribs.push(["NEWCOMER_BURST_GRAPH", graphC]);
      logit += escC + patC + graphC;

      // hard policy rule: unmistakable coordinated newcomer burst => hold.
      // Calibrated so legitimate traffic essentially never trips it.
      // cohortSize counts self when self is a first-touch, hence nc >= 2.
      if (b >= 0.75 && item.f.newcomer_count_48h >= 2) holdForReview = true;
    }

    const risk = sigmoid(logit);

    // deterministic policy rules — applied before score thresholds
    const reasons = contribs.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r);
    let decision: Decision;
    const tBlock = defense?.threshold ?? model.threshold_block;
    const tReview = Math.min(tBlock * 0.7, tBlock - 0.05);
    if (item.f.vel_1h >= 12 && item.tx.amount < 20) {
      decision = "block";
      reasons.unshift("RULE_MICRO_VELOCITY");
    } else if (item.f.vel_1h >= 14) {
      decision = "block";
      reasons.unshift("RULE_VELOCITY_BURST");
    } else if (risk >= tBlock) decision = "block";
    else if (risk >= tReview || item.tx.amount >= 2500) {
      decision = "review";
      if (item.tx.amount >= 2500 && !reasons.includes("AMOUNT_CEILING")) reasons.unshift("AMOUNT_CEILING");
    } else decision = "allow";

    // v2 hard rule upgrades an allow to a review hold
    if (holdForReview && decision === "allow") {
      decision = "review";
      reasons.unshift("NEWCOMER_BURST_HELD");
    }

    const latency_ms = performance.now() - t0;
    latencies.push(latency_ms);
    scored.push({
      tx: item.tx,
      f: item.f,
      out: {
        risk_score: Math.round(risk * 10000) / 10000,
        decision,
        reason_codes: reasons.length ? reasons : ["LOW_RISK"],
        latency_ms: Math.round(latency_ms * 1000) / 1000,
      },
    });
  }
  latencies.sort((a, b) => a - b);
  const q = (p: number) => latencies[Math.floor(p * (latencies.length - 1))] ?? 0;
  return {
    scored,
    p50_latency_ms: Math.round(q(0.5) * 1000) / 1000,
    p95_latency_ms: Math.round(q(0.95) * 1000) / 1000,
  };
}
