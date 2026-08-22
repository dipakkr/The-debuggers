import { describe, expect, it } from "vitest";
import { computeMetrics } from "@/lib/metrics/metrics";
import type { ScoredTx } from "@/lib/fraud/detector";

const row = (
  truth: "legit" | "fraud",
  decision: "allow" | "review" | "block",
  risk: number
) =>
  ({
    tx: { ground_truth: truth },
    out: { decision, risk_score: risk, latency_ms: 1, reason_codes: [] },
  }) as unknown as ScoredTx;

describe("metric contract", () => {
  it("reports F1, FNR, and average precision with explicit names", () => {
    const result = computeMetrics([
      row("legit", "block", 0.95),
      row("fraud", "block", 0.9),
      row("fraud", "allow", 0.8),
      row("legit", "allow", 0.1),
    ]);

    expect(result.precision).toBe(0.5);
    expect(result.fraud_recall).toBe(0.5);
    expect(result.f1).toBe(0.5);
    expect(result.fnr).toBe(0.5);
    expect(result.average_precision).toBeCloseTo((1 / 2 + 2 / 3) / 2);
    expect(result).not.toHaveProperty("pr_auc");
  });
});
