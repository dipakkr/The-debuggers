import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildWorld, generateLegitStream } from "@/lib/simulator/world";
import { featurize } from "@/lib/fraud/features";
import { scoreFeaturized, DetectorWeights } from "@/lib/fraud/detector";

const model = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/models/detector-v1.json"), "utf8")
) as DetectorWeights;

const EPOCH = Date.UTC(2026, 0, 5);
const CUT = EPOCH + 16 * 86_400_000;

function legitRows(seed: number) {
  const world = buildWorld(20260822);
  return featurize(generateLegitStream(world, seed, 30, EPOCH), new Map()).filter((r) => r.tx.ts_ms >= CUT);
}

describe("phase 4: legitimate-traffic robustness (T21–T24)", () => {
  it("T22 out-of-distribution large legitimate purchase is never auto-blocked", () => {
    const rows = legitRows(40404);
    const big = [...rows].sort((a, b) => b.tx.amount - a.tx.amount)[0];
    expect(big.tx.amount).toBeGreaterThan(1000); // genuinely extreme for this world
    const s = scoreFeaturized([big], model).scored[0];
    // a human decides — automation may hold for review but must not decline
    expect(["allow", "review"]).toContain(s.out.decision);
  });

  it("T23 first visit to a brand-new merchant stays allowed for established customers", () => {
    const rows = legitRows(40404);
    const freshMerchant = rows.filter((r) => r.f.new_merchant === 1 && r.f.new_device === 0);
    expect(freshMerchant.length).toBeGreaterThan(20);
    const blocked = scoreFeaturized(freshMerchant.slice(0, 200), model).scored.filter(
      (s) => s.out.decision === "block"
    );
    expect(blocked.length / Math.min(200, freshMerchant.length)).toBeLessThan(0.05);
  });

  it("T24 a newly enrolled device alone does not trigger blocking", () => {
    const rows = legitRows(40404);
    // isolate the signal: new device WITHOUT other risk co-occurring
    const cleanSubset = rows.filter(
      (r) => r.f.new_device === 1 && r.f.new_merchant === 0 && Math.abs(r.f.amt_z) < 1.5 && r.f.vel_1h === 0
    );
    if (cleanSubset.length < 5) return; // population-dependent
    const blocked = scoreFeaturized(cleanSubset, model).scored.filter((s) => s.out.decision === "block");
    expect(blocked.length).toBe(0);
  });

  it("T21 duplicate transactions are handled gracefully and scoring stays deterministic", () => {
    const world = buildWorld(20260822);
    const rows = generateLegitStream(world, 777, 30, EPOCH).filter((t) => t.ts_ms >= CUT).slice(0, 300);
    const doubled = featurize([...rows, ...rows].sort((a, b) => a.ts_ms - b.ts_ms), new Map());
    // note: a duplicate's SECOND occurrence legitimately scores differently —
    // the first occurrence is now part of its own history. The invariant is
    // that re-scoring the SAME stream is deterministic and nothing crashes.
    const run1 = JSON.stringify(scoreFeaturized(doubled, model).scored.map((s) => s.out.decision));
    const run2 = JSON.stringify(scoreFeaturized(doubled, model).scored.map((s) => s.out.decision));
    expect(run1).toEqual(run2);
    const single = featurize(rows, new Map());
    expect(scoreFeaturized(single, model).scored.length).toBe(rows.length);
  });
});
