import { describe, expect, it } from "vitest";
import { buildWorld, generateLegitStream } from "@/lib/simulator/world";
import { featurize } from "@/lib/fraud/features";
import { scoreFeaturized, DetectorWeights } from "@/lib/fraud/detector";
import { readFileSync } from "node:fs";
import path from "node:path";

const model = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/models/detector-v1.json"), "utf8")
) as DetectorWeights;

/** T20: throughput smoke — 100k transactions must compile, featurize and
 *  score inside the test budget with healthy per-tx latency. */
describe("phase 4: load", () => {
  it("scores 100k+ transactions end to end", () => {
    const world = buildWorld(20260822);
    // ~1200 customers × ~1.75 tx/day × 48 days ≈ 100k rows
    const t0 = Date.now();
    const stream = generateLegitStream(world, 999, 48, Date.UTC(2026, 0, 5));
    const tGen = Date.now() - t0;

    const t1 = Date.now();
    const feats = featurize(stream, new Map());
    const tFeat = Date.now() - t1;

    const t2 = Date.now();
    const { scored, p95_latency_ms } = scoreFeaturized(feats, model);
    const tScore = Date.now() - t2;

    expect(stream.length).toBeGreaterThan(90_000);
    expect(scored.length).toBe(stream.length);

    const genPerSec = Math.round(stream.length / (tGen / 1000));
    const scorePerSec = Math.round(feats.length / (tScore / 1000));
    console.log(
      `[load] ${stream.length.toLocaleString()} tx · generate ${tGen}ms (${genPerSec.toLocaleString()}/s) · featurize ${tFeat}ms · score ${tScore}ms (${scorePerSec.toLocaleString()}/s) · p95 ${p95_latency_ms}ms`
    );
    expect(scorePerSec).toBeGreaterThan(50_000); // conservative floor for CI machines
  }, 240_000);
});
