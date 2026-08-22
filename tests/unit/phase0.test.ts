import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { GenomeSchema, VERSIONS } from "@/lib/contracts/genome";
import { TEMPLATE_GENOMES } from "@/lib/attacks/templates";
import { DetectorWeights } from "@/lib/fraud/detector";
import { refereeEvaluate, SEEDS, HORIZON_DAYS } from "@/lib/referee/referee";

const model: DetectorWeights = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/models/detector-v1.json"), "utf8")
) as DetectorWeights;

const spec = (g: (typeof TEMPLATE_GENOMES)[number], i: number) => ({
  genome: g,
  seed: SEEDS.final_test + i * 7919,
  scenario_id: `AF-T00${i}`,
});

describe("phase 0: baseline defense + deterministic referee", () => {
  it("T1 legitimate traffic stays under the FPR budget", () => {
    const run = refereeEvaluate(model, null, [], { legitSeed: SEEDS.final_test });
    expect(run.metrics.fpr).toBeLessThanOrEqual(0.03);
    expect(run.metrics.review_rate).toBeLessThanOrEqual(0.06);
    expect(run.metrics.n_legit).toBeGreaterThan(1000);
  });

  it("T2 known card-testing fraud is blocked", () => {
    const run = refereeEvaluate(model, null, [spec(TEMPLATE_GENOMES[0], 1)], {
      legitSeed: SEEDS.final_test,
    });
    expect(run.per_scenario[0].attack_success_rate).toBeLessThan(0.15);
    expect(run.metrics.fpr).toBeLessThanOrEqual(0.03);
  });

  it("T3 second fraud family (mule burst) is mostly blocked", () => {
    const run = refereeEvaluate(model, null, [spec(TEMPLATE_GENOMES[3], 2)], {
      legitSeed: SEEDS.final_test,
    });
    expect(run.per_scenario[0].attack_success_rate).toBeLessThan(0.45);
  });

  it("T25 identical seeds produce byte-identical evaluations", () => {
    const a = JSON.stringify(refereeEvaluate(model, null, [spec(TEMPLATE_GENOMES[0], 3)]));
    const b = JSON.stringify(refereeEvaluate(model, null, [spec(TEMPLATE_GENOMES[0], 3)]));
    expect(a).toEqual(b);
  });

  it("genome schema rejects out-of-bounds parameters", () => {
    const bad = { ...TEMPLATE_GENOMES[0], amount: { ...TEMPLATE_GENOMES[0].amount, base: 99999 } };
    expect(GenomeSchema.safeParse(bad).success).toBe(false);
    const ok = GenomeSchema.safeParse(TEMPLATE_GENOMES[2]);
    expect(ok.success).toBe(true);
  });

  it("versions are stamped for every experiment record shape", () => {
    expect(VERSIONS.detector_version).toMatch(/^risk-engine-\d/);
    expect(HORIZON_DAYS).toBe(14);
  });
});
