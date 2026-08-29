import { cookies } from "next/headers";
import { ArenaState, DEFAULT_SESSION, arena } from "@/lib/state";
import { loadModel, resetArena, runGeneration } from "@/lib/mutations/engine";
import { investigate } from "@/lib/defense/investigator";
import { runDefenseGate } from "@/lib/defense/gate";
import { ProposalSchema } from "@/lib/contracts/genome";

export const SESSION_COOKIE = "arena_session";
export const PROGRESS_COOKIE = "arena_progress";

/**
 * How far through the loop this browser session has driven the arena.
 *
 * On a serverless host the arena CANNOT be held in module state alone.
 * Requests are not sticky: consecutive calls land on different instances, so
 * the second generation arrives at an instance that has never seen the first
 * and finds an empty scenario set. Observed in production as
 * "generation 2, candidates 0, blind spot none".
 *
 * The fix leans on the property the whole system is built around: every stage
 * is a pure function of fixed seeds. So the durable state is not the arena, it
 * is this three-field CURSOR. Any instance can rebuild the exact arena the
 * cursor describes, byte for byte, because replaying N generations from a
 * fresh arena is deterministic. A warm instance already holds the state and
 * skips the work; a cold one reconstructs it.
 */
export interface ArenaProgress {
  generations: number;
  investigated: boolean;
  validated: boolean;
}

const EMPTY: ArenaProgress = { generations: 0, investigated: false, validated: false };
const MAX_GENERATIONS = 8;

function encode(p: ArenaProgress): string {
  return `g${p.generations}${p.investigated ? "i" : ""}${p.validated ? "v" : ""}`;
}

export function decodeProgress(raw: string | undefined): ArenaProgress {
  const m = /^g(\d{1,2})(i?)(v?)$/.exec(raw ?? "");
  if (!m) return { ...EMPTY };
  return {
    generations: Math.min(MAX_GENERATIONS, Number(m[1])),
    investigated: m[2] === "i",
    validated: m[3] === "v",
  };
}

/**
 * Bring `state` up to exactly the point `progress` describes. Idempotent: each
 * step is skipped when the instance already holds its result.
 */
export async function rehydrate(state: ArenaState, progress: ArenaProgress): Promise<void> {
  if (!state.baselineRun) resetArena(state);

  while (state.generation < progress.generations) {
    await runGeneration(state);
  }

  if (progress.investigated && !state.defenseProposal && state.blindSpotScenarioId) {
    const blind = state.scenarios.get(state.blindSpotScenarioId);
    if (blind?.outcome) {
      const model = loadModel();
      const { proposal } = await investigate(
        {
          scenario_id: blind.scenario.scenario_id,
          family: blind.scenario.family,
          attack_success_rate: blind.outcome.attack_success_rate,
          top_reasons: blind.reasons,
          fn_medians: blind.outcome.fn_feature_medians,
          base_threshold: model.threshold_block,
        },
        state.mode
      );
      state.defenseProposal = proposal;
    }
  }

  if (progress.validated && state.defenseAccepted === null && state.defenseProposal) {
    const parsed = ProposalSchema.safeParse(state.defenseProposal);
    if (parsed.success) runDefenseGate(state, loadModel(), parsed.data);
  }
}

export interface SessionHandle {
  state: ArenaState;
  sessionId: string;
  progress: ArenaProgress;
  /** Persist an advanced cursor. Silently no-ops where cookies are read-only. */
  save: (next: Partial<ArenaProgress>) => void;
}

export async function sessionArena(): Promise<SessionHandle> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  const sessionId = existing && /^[a-z0-9-]{8,64}$/.test(existing) ? existing : newSessionId();
  const progress = decodeProgress(jar.get(PROGRESS_COOKIE)?.value);

  const write = (name: string, value: string) => {
    try {
      jar.set(name, value, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60,
      });
      return true;
    } catch {
      // route handlers that only read cookies cannot set them
      return false;
    }
  };

  if (sessionId !== existing && !write(SESSION_COOKIE, sessionId)) {
    return {
      state: arena(DEFAULT_SESSION),
      sessionId: DEFAULT_SESSION,
      progress,
      save: () => undefined,
    };
  }

  return {
    state: arena(sessionId),
    sessionId,
    progress,
    save: (next) => {
      write(PROGRESS_COOKIE, encode({ ...progress, ...next }));
    },
  };
}

function newSessionId(): string {
  return `s-${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
