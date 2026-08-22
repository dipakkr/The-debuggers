import { describe, expect, it } from "vitest";
import { buildWorld, generateLegitStream } from "@/lib/simulator/world";
import {
  makeExperimentId,
  parseExperimentLines,
} from "@/lib/referee/ledger";
import { freshState } from "@/lib/state";
import { resetArena } from "@/lib/mutations/engine";

describe("payment and audit contracts", () => {
  it("every synthetic transaction has payment identity fields", () => {
    const rows = generateLegitStream(
      buildWorld(20260822),
      40404,
      1,
      Date.UTC(2026, 0, 5)
    );
    expect(rows[0]).toMatchObject({
      currency: "USD",
      account_id: expect.stringMatching(/^A-/),
      token_id: expect.stringMatching(/^T-/),
      session_id: expect.stringMatching(/^S-/),
    });
  });

  it("experiment IDs remain stable for identical inputs", () => {
    const key = {
      kind: "generation",
      scenario_id: "AF-1001",
      seed: 20202,
      generation: 2,
    } as const;
    expect(makeExperimentId(key)).toBe(makeExperimentId(key));
  });

  it("a corrupt ledger line cannot hide valid audit rows", () => {
    const rows = parseExperimentLines('{"experiment_id":"EXP-ok"}\nnot-json');
    expect(rows).toHaveLength(1);
    expect(rows[0].experiment_id).toBe("EXP-ok");
  });

  it("an arena reset restores deterministic scenario identities", () => {
    const first = freshState("demo");
    resetArena(first);
    const firstIds = [...first.scenarios.keys()];
    const second = freshState("demo");
    resetArena(second);
    expect([...second.scenarios.keys()]).toEqual(firstIds);
  });
});
