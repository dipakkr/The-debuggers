import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ATTACK_FAMILIES, GenomeSchema } from "@/lib/contracts/genome";
import { rootGenome, demoMutation } from "@/lib/mutations/demo-policy";
import { buildWorld, generateLegitStream } from "@/lib/simulator/world";
import { compileScenario } from "@/lib/simulator/scenario";
import { featurize } from "@/lib/fraud/features";
import { scoreFeaturized, DetectorWeights } from "@/lib/fraud/detector";
import { EPOCH_START, EVAL_EPOCH_START, HORIZON_DAYS } from "@/lib/referee/referee";
import { computeMetrics, rocAuc, averagePrecision } from "@/lib/metrics/metrics";
import { mcnemar, wilsonInterval } from "@/lib/metrics/stats";

const model = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/models/detector-v1.json"), "utf8")
) as DetectorWeights;

const world = buildWorld(20260822);
const backdrop = generateLegitStream(world, 40404, 30, EPOCH_START);

function runFamily(family: (typeof ATTACK_FAMILIES)[number], seed = 555) {
  const c = compileScenario(rootGenome(family), seed, "AF-TEST", world, EVAL_EPOCH_START, HORIZON_DAYS);
  const all = [...backdrop, ...c.transactions].sort((a, b) => a.ts_ms - b.ts_ms || a.tx_id.localeCompare(b.tx_id));
  const scored = scoreFeaturized(featurize(all, c.customer_windows), model).scored;
  const evalSet = scored.filter((s) => s.tx.kind !== "warmup" && s.tx.ts_ms >= EVAL_EPOCH_START);
  return { compiled: c, evalSet, attack: evalSet.filter((s) => s.tx.scenario_id === "AF-TEST") };
}

describe("attack families (identify → generate)", () => {
  it("every declared family has a root template that satisfies the genome schema", () => {
    for (const family of ATTACK_FAMILIES) {
      const parsed = GenomeSchema.safeParse(rootGenome(family));
      expect(parsed.success, `${family} root genome must parse`).toBe(true);
      expect(parsed.success && parsed.data.family).toBe(family);
    }
    expect(ATTACK_FAMILIES.length).toBeGreaterThanOrEqual(5);
  });

  it("account takeover rides a REAL population account, not a synthetic stub", () => {
    const { compiled, attack } = runFamily("account_takeover");
    expect(compiled.victim_customer_ids.length).toBe(1);
    const victimId = compiled.victim_customer_ids[0];
    // the victim must be a genuine member of the simulated population
    expect(world.customers.some((c) => c.id === victimId)).toBe(true);
    // and must already have legitimate backdrop history — that history is the
    // attack's cover, and is what makes the ATO features meaningful
    expect(backdrop.some((t) => t.customer_id === victimId)).toBe(true);
    expect(attack.every((s) => s.tx.customer_id === victimId)).toBe(true);
  });

  it("account takeover presents as an unfamiliar device in an unfamiliar country", () => {
    const { attack } = runFamily("account_takeover");
    expect(attack.length).toBeGreaterThan(0);
    // only the FIRST row sees an unknown device — after that the device is in
    // the customer's own history, which is exactly why device novelty alone
    // cannot carry a takeover defense
    expect(attack[0].f.new_device).toBe(1);
    expect(attack.slice(1).every((s) => s.f.new_device === 0)).toBe(true);
    expect(attack.filter((s) => s.f.geo_anomaly === 1).length).toBeGreaterThan(0);
  });

  it("structuring places legs under ceilings and spreads them across merchants", () => {
    const { attack } = runFamily("transaction_splitting");
    const root = rootGenome("transaction_splitting");
    expect(attack.length).toBe(root.split.count);
    expect(new Set(attack.map((s) => s.tx.merchant_id)).size).toBe(root.split.merchant_spread);
    // the tell the defense is meant to find: repetition inside the band
    expect(Math.max(...attack.map((s) => s.f.near_limit_repeat_24h))).toBeGreaterThanOrEqual(3);
  });

  it("the baseline detector catches the LOUD version of every family", () => {
    for (const family of ATTACK_FAMILIES) {
      const { attack } = runFamily(family);
      expect(attack.length, `${family} must produce attack rows`).toBeGreaterThan(0);
      const caught = attack.filter((s) => s.out.decision !== "allow").length / attack.length;
      expect(caught, `${family} loud template should be largely caught`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("the red policy produces a schema-valid, behaviourally different child for every family", () => {
    for (const family of ATTACK_FAMILIES) {
      const parent = rootGenome(family);
      const child = demoMutation(parent, ["AMOUNT_ANOMALY", "NEW_DEVICE"], 0.1, 3);
      expect(GenomeSchema.safeParse(child).success, `${family} child must be valid`).toBe(true);
      expect(JSON.stringify(child), `${family} child must differ from its parent`).not.toEqual(
        JSON.stringify(parent)
      );
    }
  });

  it("compilation is a pure function of (genome, seed, world)", () => {
    const a = JSON.stringify(runFamily("account_takeover", 909).compiled.transactions);
    const b = JSON.stringify(runFamily("account_takeover", 909).compiled.transactions);
    expect(a).toEqual(b);
  });
});

describe("metrics and statistics", () => {
  it("reports both recall definitions, and review holds never count as blocks", () => {
    const { evalSet } = runFamily("mule_fanout");
    const m = computeMetrics(evalSet);
    expect(m.recall_with_review).toBeGreaterThanOrEqual(m.fraud_recall);
    // precision must stay on the strict BLOCK definition, so recall cannot be
    // bought by dumping traffic into the review queue
    const blocked = evalSet.filter((s) => s.out.decision === "block");
    const tp = blocked.filter((s) => s.tx.ground_truth === "fraud").length;
    expect(m.precision).toBeCloseTo(blocked.length ? tp / blocked.length : 0, 10);
  });

  it("ROC-AUC is rank based, tie aware, and bounded", () => {
    const { evalSet } = runFamily("card_testing_drain");
    const auc = rocAuc(evalSet);
    expect(auc).toBeGreaterThan(0.5);
    expect(auc).toBeLessThanOrEqual(1);
    // a perfectly tied ranking must score exactly 0.5, not 1.0
    const tied = evalSet.map((s) => ({ ...s, out: { ...s.out, risk_score: 0.5 } }));
    expect(rocAuc(tied)).toBeCloseTo(0.5, 10);
    expect(averagePrecision(evalSet)).toBeGreaterThan(0);
  });

  it("Wilson intervals bracket the point estimate and stay inside [0,1]", () => {
    const ci = wilsonInterval(9, 90);
    expect(ci.low).toBeGreaterThanOrEqual(0);
    expect(ci.high).toBeLessThanOrEqual(1);
    expect(ci.low).toBeLessThan(0.1);
    expect(ci.high).toBeGreaterThan(0.1);
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 0 });
  });

  it("McNemar rewards one-sided improvement and ignores a symmetric swap", () => {
    const improved = mcnemar(0, 8);
    expect(improved.after_only).toBe(8);
    expect(improved.p_value).toBeLessThan(0.05);
    expect(improved.significant_at_05).toBe(true);
    // equal numbers of gains and regressions is no evidence of improvement
    expect(mcnemar(6, 6).significant_at_05).toBe(false);
    expect(mcnemar(0, 0).p_value).toBe(1);
    // large-sample branch must also behave
    expect(mcnemar(2, 40).significant_at_05).toBe(true);
  });
});

describe("detector operating point", () => {
  it("is calibrated for deployment prevalence, not the fraud-dense training pool", () => {
    const cal = model.trained_on as Record<string, unknown>;
    expect(String(cal.calibration)).toContain("deployment prevalence");
    expect(cal.deploy_prevalence).toBeLessThan(0.01);
    // a threshold pinned to a legitimate-score quantile caps precision in the
    // single digits; the swept threshold must sit far above that
    expect(model.threshold_block).toBeGreaterThan(0.5);
    expect(model.threshold_review).toBeLessThanOrEqual(model.threshold_block);
  });

  it("never auto-declines on an uncorroborated amount or hour outlier", () => {
    const rows = featurize(backdrop, new Map()).filter((r) => r.tx.ts_ms >= EVAL_EPOCH_START);
    const uncorroborated = rows.filter(
      (r) =>
        r.f.new_device === 0 &&
        r.f.vel_1h < 3 &&
        r.f.vel_24h < 6 &&
        r.f.probe_count_24h < 2 &&
        r.f.near_limit_repeat_24h < 3 &&
        r.f.young_account === 0
    );
    expect(uncorroborated.length).toBeGreaterThan(100);
    const blocked = scoreFeaturized(uncorroborated, model).scored.filter((s) => s.out.decision === "block");
    expect(blocked.length).toBe(0);
  });

  it("measures real per-transaction latency rather than flooring it to zero", () => {
    const { evalSet } = runFamily("low_and_slow");
    const m = computeMetrics(evalSet);
    expect(m.p95_latency_ms).toBeGreaterThan(0);
  });
});
