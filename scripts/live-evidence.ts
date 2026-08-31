/**
 * Records a REAL live-mode run and commits it as evidence.
 *
 * The deployed prototype runs demo mode, so nothing a judge can click proves a
 * model is involved anywhere. This script closes that gap: for each attack
 * family it asks the configured model for mutations of the same parent the
 * deterministic policy gets, scores BOTH through the Referee, and records the
 * comparison. Everything here is measured by the same Referee that produces
 * `latest.json` — the model proposes, code scores.
 *
 *   OPENAI_API_KEY=... npx tsx scripts/live-evidence.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ATTACK_FAMILIES, Genome, GenomeSchema, versionStamp } from "@/lib/contracts/genome";
import { isNovel, noveltyScore } from "@/lib/attacks/templates";
import { demoMutation, rootGenome } from "@/lib/mutations/demo-policy";
import { llmMutations, loadModel } from "@/lib/mutations/engine";
import { computeFitness } from "@/lib/referee/fitness";
import { refereeEvaluate, SEEDS } from "@/lib/referee/referee";
import { liveModeAvailable } from "@/lib/genai/client";

interface Scored {
  origin: "model" | "policy";
  genome: Genome;
  schema_valid: boolean;
  novel: boolean;
  novelty: number;
  fitness: number;
  attack_success_rate: number;
  verdict: "evaded" | "caught";
  top_reasons: string[];
}

async function main(): Promise<void> {
  if (!liveModeAvailable()) {
    throw new Error("OPENAI_API_KEY is not set — this script records a REAL model run");
  }
  const model = loadModel();
  const startedAt = Date.now();
  const families: Record<string, unknown> = {};

  for (const family of ATTACK_FAMILIES) {
    const parent = rootGenome(family);
    process.stdout.write(`[live] ${family} … `);

    const t0 = Date.now();
    const proposed = await llmMutations(parent, [], 2);
    const latencyMs = Date.now() - t0;

    // the deterministic policy gets the SAME parent, so the comparison is fair
    const policy = demoMutation(parent, ["ODD_HOUR", "VELOCITY_HIGH"], 0.2, 1);

    const candidates: { origin: "model" | "policy"; genome: Genome }[] = [
      ...proposed.map((g) => ({ origin: "model" as const, genome: g })),
      { origin: "policy" as const, genome: policy },
    ];

    // one Referee pass scores every candidate on identical legitimate traffic
    const specs = candidates.map((c, i) => ({
      genome: c.genome,
      seed: SEEDS.final_test + (i + 1) * 7717,
      scenario_id: `LIVE-${family}-${i}`,
    }));
    const run = refereeEvaluate(model, null, specs, { legitSeed: SEEDS.final_test });

    const scored: Scored[] = candidates.map((c, i) => {
      const outcome = run.per_scenario[i];
      return {
        origin: c.origin,
        genome: c.genome,
        schema_valid: GenomeSchema.safeParse(c.genome).success,
        novel: isNovel(c.genome),
        novelty: Math.round(noveltyScore(c.genome) * 1000) / 1000,
        fitness: Math.round(computeFitness(c.genome, outcome) * 1000) / 1000,
        attack_success_rate: outcome.attack_success_rate,
        verdict: outcome.attack_success_rate >= 0.34 ? "evaded" : "caught",
        top_reasons: outcome.top_reasons,
      };
    });

    families[family] = {
      parent_genome: parent,
      model_latency_ms: latencyMs,
      model_returned: proposed.length,
      candidates: scored,
    };
    const m = scored.filter((s) => s.origin === "model");
    console.log(
      `${proposed.length} model proposals in ${(latencyMs / 1000).toFixed(1)}s ` +
        `(novelty ${m.map((x) => x.novelty.toFixed(2)).join("/") || "—"})`
    );
  }

  const all = Object.values(families).flatMap((f) => (f as { candidates: Scored[] }).candidates);
  const modelSide = all.filter((c) => c.origin === "model");
  const policySide = all.filter((c) => c.origin === "policy");
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const evidence = {
    generated_at: new Date().toISOString(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    mode: "live",
    versions: versionStamp("live"),
    provider: {
      base_url: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      model: process.env.ARENA_MODEL ?? "gpt-5",
    },
    note:
      "Every genome below was proposed by the model through the same strict schema the application uses, then scored by the same deterministic Referee that produces latest.json. The model proposed; code measured. No metric here was self-reported.",
    summary: {
      families: ATTACK_FAMILIES.length,
      model_proposals: modelSide.length,
      model_proposals_schema_valid: modelSide.filter((c) => c.schema_valid).length,
      model_mean_novelty: Math.round(mean(modelSide.map((c) => c.novelty)) * 1000) / 1000,
      policy_mean_novelty: Math.round(mean(policySide.map((c) => c.novelty)) * 1000) / 1000,
      model_novel_count: modelSide.filter((c) => c.novel).length,
      policy_novel_count: policySide.filter((c) => c.novel).length,
      model_evaded: modelSide.filter((c) => c.verdict === "evaded").length,
      policy_evaded: policySide.filter((c) => c.verdict === "evaded").length,
      total_wall_clock_s: Math.round((Date.now() - startedAt) / 1000),
    },
    families,
  };

  const out = path.join(process.cwd(), "data", "evidence", "live-run.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n");
  console.log(`\nwrote ${out}`);
  console.log(JSON.stringify(evidence.summary, null, 2));
}

void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
