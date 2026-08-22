import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { GenomeSchema } from "@/lib/contracts/genome";
import { TEMPLATE_GENOMES } from "@/lib/attacks/templates";
import { DetectorWeights } from "@/lib/fraud/detector";
import { freshState } from "@/lib/state";
import { loadModel, resetArena, runGeneration } from "@/lib/mutations/engine";
import { demoMutation } from "@/lib/mutations/demo-policy";
import { investigate } from "@/lib/defense/investigator";
import { runDefenseGate } from "@/lib/defense/gate";
import { refereeEvaluate, SEEDS } from "@/lib/referee/referee";

const model = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/models/detector-v1.json"), "utf8")
) as DetectorWeights;

function boot() {
  const state = freshState("demo");
  resetArena(state);
  return state;
}

describe("phase 1: adaptive red team", () => {
  it("T4 mutations of a template parent are schema-valid", () => {
    const g1 = demoMutation(TEMPLATE_GENOMES[2], ["ODD_HOUR", "AMOUNT_ANOMALY"], 0, 1);
    expect(GenomeSchema.safeParse(g1).success).toBe(true);
    const g3 = demoMutation(g1, [], 0.9, 3);
    expect(GenomeSchema.safeParse(g3).success).toBe(true);
    expect(g3.sequence.regularity).toBeGreaterThan(0.9); // camouflage stage engaged
  });

  it("T5+T6 invalid mutants are rejected without simulation; valid ones are evaluated", async () => {
    const state = boot();
    // corrupt ONE lineage parent; its children must all be schema-rejected
    const ids = [...state.scenarios.keys()];
    const goodId = ids[0];
    const badId = ids[1];
    const rec = state.scenarios.get(badId)!;
    const badGenome = {
      ...rec.scenario.genome,
      amount: { ...rec.scenario.genome.amount, base: 99999 },
    } as typeof rec.scenario.genome;
    expect(GenomeSchema.safeParse(badGenome).success).toBe(false);
    rec.scenario.genome = badGenome;
    state.beam = [goodId, badId];

    const res = await runGeneration(state);
    // children of the good parent were simulated; children of the corrupt
    // parent were stored but never simulated
    expect(res.attempts.length).toBeGreaterThan(0);
    const invalidKids = res.attempts.filter((a) => a.parent_scenario_id === badId && a.verdict === "invalid");
    void invalidKids;
    const invalidStored = [...state.scenarios.values()].filter(
      (s) => s.verdict === "invalid" && s.scenario.parent_scenario_id === badId
    );
    expect(invalidStored.length).toBeGreaterThan(0);
    for (const inv of invalidStored) expect(inv.outcome).toBeUndefined();
  });

  it("T7 outcome-conditioned evolution finds a novel blind spot", async () => {
    const state = boot();
    let gens = 0;
    while (!state.blindSpotScenarioId && gens < 6) {
      await runGeneration(state);
      gens++;
    }
    expect(state.blindSpotScenarioId).toBeTruthy();
    const rec = state.scenarios.get(state.blindSpotScenarioId!)!;
    expect(rec.outcome!.attack_success_rate).toBeGreaterThanOrEqual(0.34);
    // later generations must depend on earlier ones (lineage depth >= 1)
    expect(rec.scenario.generation).toBeGreaterThan(0);
    expect(rec.scenario.parent_scenario_id).not.toBeNull();
  }, 120_000);
});

describe("phase 2: blue investigation + gated defense", () => {
  it("T8 investigator cites measured evidence in a schema-valid proposal", async () => {
    const state = boot();
    while (!state.blindSpotScenarioId) await runGeneration(state);
    const blind = state.scenarios.get(state.blindSpotScenarioId!)!;
    const input = {
      scenario_id: blind.scenario.scenario_id,
      family: blind.scenario.family,
      attack_success_rate: blind.outcome!.attack_success_rate,
      top_reasons: blind.reasons,
      fn_medians: blind.outcome!.fn_feature_medians,
      base_threshold: model.threshold_block,
    };
    const { proposal, source } = await investigate(input, "demo");
    expect(source).toBe("policy");
    expect(proposal.evidence.length).toBeGreaterThan(0);
    expect(proposal.defense_config.threshold).toBeLessThanOrEqual(0.95);
  }, 120_000);

  it("T9-T12 gate: held-out fresh-seed evaluation, survival, replay, legit regression", async () => {
    const state = boot();
    while (!state.blindSpotScenarioId) await runGeneration(state);
    const blind = state.scenarios.get(state.blindSpotScenarioId!)!;
    const input = {
      scenario_id: blind.scenario.scenario_id,
      family: blind.scenario.family,
      attack_success_rate: blind.outcome!.attack_success_rate,
      top_reasons: blind.reasons,
      fn_medians: blind.outcome!.fn_feature_medians,
      base_threshold: model.threshold_block,
    };
    const { proposal } = await investigate(input, "demo");
    const gate = runDefenseGate(state, model, proposal);

    expect(gate.finalBase).not.toBeNull();
    expect(gate.finalCand).not.toBeNull();
    // held-out seeds differ from red-search seeds
    expect(SEEDS.final_test).not.toBe(SEEDS.search);
    // legitimate regression metrics exist on both sides
    expect(typeof gate.finalCand!.metrics.fpr).toBe("number");
    expect(typeof gate.finalCand!.metrics.review_rate).toBe("number");

    // exact replay of the original discovery scenario under both configs
    const again = runDefenseGate(state, model, proposal);
    expect(JSON.stringify(again.replayDiff)).toBe(JSON.stringify(gate.replayDiff));
  }, 180_000);

  it("referee evaluation of the same spec set is byte-stable (T25 deep)", () => {
    const state = boot();
    const ids = [...state.scenarios.keys()].slice(0, 2);
    const specs = ids.map((id, i) => ({
      genome: state.scenarios.get(id)!.scenario.genome,
      seed: SEEDS.final_test + i * 7919,
      scenario_id: `AF-STAB0${i}`,
    }));
    // wall-clock latency is MEASURED, not computed — excluded from determinism
    const norm = (s: string) => s.replace(/"(p50_latency_ms|p95_latency_ms|latency_ms)":\s*[\d.]+/g, '"$1":X');
    const a = norm(JSON.stringify(refereeEvaluate(model, null, specs)));
    const b = norm(JSON.stringify(refereeEvaluate(model, null, specs)));
    expect(a).toEqual(b);
  });
});
