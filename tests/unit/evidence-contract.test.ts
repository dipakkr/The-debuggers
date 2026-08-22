import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("submission evidence", () => {
  it("stores measured evidence with versions and gate outcomes", () => {
    const evidence = JSON.parse(
      readFileSync("data/evidence/latest.json", "utf8")
    );
    expect(evidence).toMatchObject({
      commit: expect.any(String),
      seeds: expect.any(Object),
      versions: expect.any(Object),
      baseline: expect.any(Object),
      blind_spot: expect.any(Object),
      defense_gate: expect.any(Object),
      replay: expect.any(Object),
    });
  });

  it("stores measured benchmark evidence", () => {
    const benchmark = JSON.parse(
      readFileSync("data/evidence/benchmark.json", "utf8")
    );
    expect(benchmark.results).toHaveLength(3);
    expect(benchmark.results[2]).toMatchObject({
      transactions: expect.any(Number),
      scoring_tx_s: expect.any(Number),
      p95_latency_ms: expect.any(Number),
      memory_rss_mb: expect.any(Number),
      experiment_ms: expect.any(Number),
      trials: 5,
    });
  });
});
