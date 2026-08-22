import { buildWorld, generateLegitStream } from "@/lib/simulator/world";
import { featurize } from "@/lib/fraud/features";
import { scoreFeaturized, DetectorWeights } from "@/lib/fraud/detector";
import { readFileSync } from "node:fs";

const model: DetectorWeights = JSON.parse(readFileSync("data/models/detector-v1.json", "utf8"));

/**
 * Measured throughput benchmark. No extrapolation without a label.
 * Hardware: record `os.cpus()` length; absolute numbers vary by machine.
 */
function bench(nDays: number, label: string) {
  const world = buildWorld(20260822);
  let t0 = performance.now();
  const stream = generateLegitStream(world, 424242, nDays, Date.UTC(2026, 0, 5));
  const genMs = performance.now() - t0;

  t0 = performance.now();
  const feats = featurize(stream, new Map());
  const featMs = performance.now() - t0;

  t0 = performance.now();
  const { p50_latency_ms, p95_latency_ms } = scoreFeaturized(feats, model);
  const scoreMs = performance.now() - t0;

  const n = stream.length;
  console.log(
    `[${label}] tx=${n.toLocaleString()} · generate ${genMs.toFixed(0)}ms (${Math.round(n / (genMs / 1000)).toLocaleString()}/s) · featurize ${featMs.toFixed(0)}ms (${Math.round(n / (featMs / 1000)).toLocaleString()}/s) · score ${scoreMs.toFixed(0)}ms (${Math.round(n / (scoreMs / 1000)).toLocaleString()}/s) · per-tx p50 ${p50_latency_ms.toFixed(3)}ms p95 ${p95_latency_ms.toFixed(3)}ms`
  );
}

console.log("node", process.version);
bench(1, "1k-ish ");
bench(10, "10k-ish");
bench(100, "100k   ");
