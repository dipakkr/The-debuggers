import { readFileSync } from "node:fs";
import { buildWorld, generateLegitStream } from "@/lib/simulator/world";
import { featurize } from "@/lib/fraud/features";
import {
  DetectorWeightsSchema,
  scoreFeaturized,
} from "@/lib/fraud/detector";

const model = DetectorWeightsSchema.parse(
  JSON.parse(readFileSync("data/models/detector-v1.json", "utf8"))
);

interface Trial {
  transactions: number;
  generation_tx_s: number;
  feature_tx_s: number;
  scoring_tx_s: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  memory_rss_mb: number;
  experiment_ms: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function trial(days: number): Trial {
  const started = performance.now();
  const world = buildWorld(20260822, 600, 300);
  let t0 = performance.now();
  const stream = generateLegitStream(
    world,
    424242,
    days,
    Date.UTC(2026, 0, 5)
  );
  const generationMs = performance.now() - t0;

  t0 = performance.now();
  const features = featurize(stream, new Map());
  const featureMs = performance.now() - t0;

  t0 = performance.now();
  const scored = scoreFeaturized(features, model);
  const scoringMs = performance.now() - t0;
  const transactions = stream.length;

  return {
    transactions,
    generation_tx_s: transactions / (generationMs / 1000),
    feature_tx_s: transactions / (featureMs / 1000),
    scoring_tx_s: transactions / (scoringMs / 1000),
    p50_latency_ms: scored.p50_latency_ms,
    p95_latency_ms: scored.p95_latency_ms,
    memory_rss_mb: process.memoryUsage().rss / 1024 / 1024,
    experiment_ms: performance.now() - started,
  };
}

function bench(days: number, label: string): void {
  const trials = Array.from({ length: 5 }, () => trial(days));
  const field = (key: keyof Trial) => median(trials.map((item) => item[key]));
  console.log(
    JSON.stringify({
      label,
      transactions: Math.round(field("transactions")),
      generation_tx_s: Math.round(field("generation_tx_s")),
      feature_tx_s: Math.round(field("feature_tx_s")),
      scoring_tx_s: Math.round(field("scoring_tx_s")),
      p50_latency_ms: field("p50_latency_ms"),
      p95_latency_ms: field("p95_latency_ms"),
      memory_rss_mb: Math.round(field("memory_rss_mb")),
      experiment_ms: Math.round(field("experiment_ms")),
      trials: trials.length,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    })
  );
}

bench(1, "1k-ish");
bench(10, "10k-ish");
bench(100, "100k-ish");
