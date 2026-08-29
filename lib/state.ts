import { Scenario, MetricsResult } from "./contracts/genome";
import { ScenarioOutcome } from "./referee/referee";
import type { EvalRun } from "./referee/referee";
import type { OperatingPoint } from "./metrics/metrics";

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
  /** precision/recall across the score range on the baseline pool */
  baselineOperatingPoints: OperatingPoint[];
  lastSearchMetrics: MetricsResult | null; // detector under active attack (search pool)
  /** Whether the LAST generation was actually driven by the model or by the
   *  deterministic policy. A provider failure falls back silently by design;
   *  leaving that invisible would let the UI imply live reasoning that never
   *  happened. */
  reasoningSource: "llm" | "policy" | null;
  /** Why the fallback happened, when it did. */
  reasoningNote: string | null;
  defenseProposal: unknown | null;
  defenseConfig: unknown | null;
  defenseAccepted: boolean | null;
  gateBaselineRun: EvalRun | null;
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
    baselineOperatingPoints: [],
    lastSearchMetrics: null,
    reasoningSource: null,
    reasoningNote: null,
    defenseProposal: null,
    defenseConfig: null,
    defenseAccepted: null,
    gateBaselineRun: null,
    gateRun: null,
    replayDiff: null,
    gateReasons: [],
    log: [],
  };
}

/**
 * Session registry. The public deployment is used by several reviewers at
 * once; a single process-global arena means one visitor's RESET destroys
 * everybody else's run mid-demo. Each browser session gets its own arena,
 * keyed by a cookie the API layer issues.
 *
 * Still in-process: a multi-replica deployment needs a shared store. The
 * durable record of every experiment is the Referee's JSONL ledger, not this.
 */
const MAX_SESSIONS = 64;
const SESSION_TTL_MS = 60 * 60 * 1000;

interface Session {
  state: ArenaState;
  touched: number;
}

const g = globalThis as unknown as { __arenaSessions?: Map<string, Session> };
function registry(): Map<string, Session> {
  if (!g.__arenaSessions) g.__arenaSessions = new Map();
  return g.__arenaSessions;
}

export const DEFAULT_SESSION = "default";

export function arena(sessionId: string = DEFAULT_SESSION): ArenaState {
  const sessions = registry();
  const now = Date.now();

  for (const [key, entry] of sessions) {
    if (now - entry.touched > SESSION_TTL_MS) sessions.delete(key);
  }
  // bounded memory: evict least-recently-used before admitting a new session
  while (sessions.size >= MAX_SESSIONS && !sessions.has(sessionId)) {
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [key, entry] of sessions) {
      if (entry.touched < oldest) {
        oldest = entry.touched;
        oldestKey = key;
      }
    }
    if (oldestKey === null) break;
    sessions.delete(oldestKey);
  }

  let entry = sessions.get(sessionId);
  if (!entry) {
    entry = { state: freshState("demo"), touched: now };
    sessions.set(sessionId, entry);
  }
  entry.touched = now;
  return entry.state;
}

export function activeSessionCount(): number {
  return registry().size;
}
