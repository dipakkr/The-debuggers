import { Scenario, MetricsResult } from "./contracts/genome";
import { ScenarioOutcome } from "./referee/referee";
import type { EvalRun } from "./referee/referee";

export interface StoredScenario {
  scenario: Scenario;
  outcome?: ScenarioOutcome;
  fitness?: number;
  verdict: "pending" | "caught" | "evaded" | "invalid";
  reasons: string[];
  riskStats?: { max: number; median: number };
}

/**
 * In-memory arena session. A demo never needs persistence across restarts;
 * the durable record is the Referee's JSONL ledger.
 */
export interface ArenaState {
  mode: "demo" | "live";
  generation: number;
  scenarios: Map<string, StoredScenario>;
  childrenOf: Map<string | null, string[]>;
  beam: string[];
  blindSpotScenarioId: string | null;
  baselineRun: EvalRun | null; // v1 on the FINAL pool
  lastSearchMetrics: MetricsResult | null; // detector under active attack (search pool)
  defenseProposal: unknown | null;
  defenseConfig: unknown | null;
  defenseAccepted: boolean | null;
  gateRun: EvalRun | null;
  replayDiff: unknown | null;
  gateReasons: string[];
  log: { ts: string; level: "info" | "warn" | "hero"; msg: string }[];
}

export function freshState(mode: "demo" | "live" = "demo"): ArenaState {
  return {
    mode,
    generation: 0,
    scenarios: new Map(),
    childrenOf: new Map(),
    beam: [],
    blindSpotScenarioId: null,
    baselineRun: null,
    lastSearchMetrics: null,
    defenseProposal: null,
    defenseConfig: null,
    defenseAccepted: null,
    gateRun: null,
    replayDiff: null,
    gateReasons: [],
    log: [],
  };
}

// ponytail: one process-global demo session; use a shared session store before multi-replica deployment.
const g = globalThis as unknown as { __arenaState?: ArenaState };
export function arena(): ArenaState {
  if (!g.__arenaState) g.__arenaState = freshState("demo");
  return g.__arenaState;
}
