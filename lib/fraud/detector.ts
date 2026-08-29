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
  "near_limit_repeat_24h",
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

/** Nanosecond clock. `performance.now()` resolution is coarser than one
 *  scoring pass, which floors every per-row latency to zero. */
const nowNs: () => number =
  typeof process !== "undefined" && typeof process.hrtime?.bigint === "function"
    ? () => Number(process.hrtime.bigint())
    : () => performance.now() * 1e6;

/** Coordination below this score is ordinary merchant traffic. */
const GRAPH_DEADZONE = 0.45;
/** Score span over which the graph term ramps from zero to full weight. */
const GRAPH_RAMP = 0.3;

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
  geo_anomaly: "GEO_ANOMALY",
  near_limit_repeat_24h: "STRUCTURING_BAND",
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
    const t0 = nowNs();
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
      // Deadzone, then a linear ramp to full weight. The previous form used a
      // strict `> 0.5` test with a very steep ramp, which contributed exactly
      // zero for a cohort sitting at 0.50 — the single most common value for a
      // coordinated burst, because convergence saturates at three accounts.
      const b = item.f.newcomer_burst_score;
      const graphC =
        b >= GRAPH_DEADZONE
          ? defense.graph_weight * 4 * Math.min(1, (b - GRAPH_DEADZONE) / GRAPH_RAMP)
          : 0;

      // structuring: repeated near-ceiling legs sprayed across storefronts.
      // Either signal alone is ordinary; their product is the tell.
      const strScore =
        Math.min(1, Math.max(0, item.f.near_limit_repeat_24h - 1) / 3) *
        Math.min(1, Math.max(0, item.f.merchant_spread_24h - 1) / 3);
      const strC = defense.structuring_weight * 4 * strScore;

      // takeover: an unfamiliar device in an unfamiliar country after a quiet
      // spell on an otherwise established account.
      const dormancyRamp = Math.min(1, item.f.dormancy_h / 48);
      const takeScore =
        item.f.new_device * (0.5 + 0.5 * item.f.geo_anomaly) * (0.4 + 0.6 * dormancyRamp) *
        (item.f.young_account ? 0.3 : 1);
      const takeC = defense.takeover_weight * 4 * takeScore;

      if (escC > 0.15) contribs.push(["SPEND_ESCALATION", escC]);
      if (patC > 0.15) contribs.push(["CAMOUFLAGE_PATTERN", patC]);
      if (graphC > 0.15) contribs.push(["NEWCOMER_BURST_GRAPH", graphC]);
      if (strC > 0.15) contribs.push(["STRUCTURING_SPREAD", strC]);
      if (takeC > 0.15) contribs.push(["TAKEOVER_SESSION", takeC]);
      logit += escC + patC + graphC + strC + takeC;

      // Hard policy rule: an unmistakable coordinated newcomer burst is held
      // for an analyst. Two ways to qualify — a very high burst score with any
      // corroborating cohort, or a moderate score with a LARGE cohort. Both
      // require the cross-account structure; neither fires on a single account.
      // cohortSize counts self when self is a first-touch, hence nc >= 2.
      if (
        (b >= 0.75 && item.f.newcomer_count_48h >= 2) ||
        (b >= GRAPH_DEADZONE && item.f.newcomer_count_48h >= 4)
      ) {
        holdForReview = true;
      }
    }

    const risk = sigmoid(logit);

    // deterministic policy rules — applied before score thresholds
    const reasons = contribs.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r);
    let decision: Decision;
    const tBlock = defense?.threshold ?? model.threshold_block;
    // the review threshold is calibrated during training; when blue moves the
    // block threshold, review tracks it down but never crosses it
    const tReview = Math.min(model.threshold_review, Math.max(0, tBlock - 0.02));
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

    // Declines require corroboration. A wrongly declined genuine high-value
    // purchase is the most expensive false positive a network can make, so an
    // amount or odd-hour outlier on a familiar device, with no velocity, probe,
    // structuring or graph support, is held for an analyst rather than refused.
    const corroborated =
      item.f.new_device === 1 ||
      item.f.vel_1h >= 3 ||
      item.f.vel_24h >= 6 ||
      item.f.probe_count_24h >= 2 ||
      item.f.near_limit_repeat_24h >= 3 ||
      item.f.young_account === 1 ||
      item.f.newcomer_burst_score >= 0.5;
    if (decision === "block" && !corroborated) {
      decision = "review";
      reasons.unshift("UNCORROBORATED_HELD");
    }

    const latency_ms = (nowNs() - t0) / 1e6;
    latencies.push(latency_ms);
    scored.push({
      tx: item.tx,
      f: item.f,
      out: {
        risk_score: Math.round(risk * 10000) / 10000,
        decision,
        reason_codes: reasons.length ? reasons : ["LOW_RISK"],
        latency_ms: Math.round(latency_ms * 1e6) / 1e6,
      },
    });
  }
  latencies.sort((a, b) => a - b);
  const q = (p: number) => latencies[Math.floor(p * (latencies.length - 1))] ?? 0;
  return {
    scored,
    p50_latency_ms: Math.round(q(0.5) * 1e6) / 1e6,
    p95_latency_ms: Math.round(q(0.95) * 1e6) / 1e6,
  };
}
