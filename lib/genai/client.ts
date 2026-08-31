/**
 * Minimal OpenAI-compatible chat client with hard timeout, one retry and a
 * structured result. LIVE mode only; DEMO mode never calls this.
 */
import type { ZodType, ZodTypeDef } from "zod";

export interface LlmResult {
  ok: boolean;
  text?: string;
  error?: string;
  source: "llm" | "fallback";
}

export type Completion = (
  system: string,
  user: string,
  timeoutMs?: number
) => Promise<LlmResult>;

function cfg() {
  const base = assertSafeProviderUrl(
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
  ).href.replace(/\/$/, "");
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.ARENA_MODEL ?? "gpt-5";
  // Temperature is OPT-IN. Current reasoning models reject any non-default
  // value outright ("Unsupported value: 'temperature' does not support 0.7"),
  // and because a provider failure falls back to the deterministic policy,
  // hardcoding it made live mode a silent no-op: every call 400'd and the
  // arena quietly ran the expert policy instead.
  const raw = process.env.ARENA_TEMPERATURE;
  const temperature = raw === undefined || raw === "" ? undefined : Number(raw);
  return { base, key, model, temperature };
}

/**
 * Timeout budget for a single provider call.
 *
 * Reasoning models take 25-40s for a schema-constrained response. Every call
 * site must use this: the investigator carried its own hardcoded 20s and so
 * timed out on every request while the strategist, which had been raised,
 * worked fine — a fallback that looked like a model declining to help.
 */
export const LLM_TIMEOUT_MS = Number(process.env.ARENA_TIMEOUT_MS ?? 60_000);

/** Last provider failure, surfaced so a silent fallback is never invisible. */
let lastError: string | null = null;
export function lastProviderError(): string | null {
  return lastError;
}

export function assertSafeProviderUrl(value: string): URL {
  const url = new URL(value);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("provider URL must use HTTPS");
  }
  return url;
}

export function liveModeAvailable(): boolean {
  return Boolean(cfg().key);
}

async function once(
  system: string,
  user: string,
  timeoutMs: number
): Promise<string> {
  const { base, key, model, temperature } = cfg();
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        ...(Number.isFinite(temperature) ? { temperature } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // carry the provider's own message; "http 400" alone hides the cause
      const detail = await res.text().catch(() => "");
      throw new Error(`llm http ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content;
    if (!text) throw new Error("empty llm response");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Try the LLM twice; on total failure return source:"fallback". */
export async function chatJson(
  system: string,
  user: string,
  timeoutMs = LLM_TIMEOUT_MS
): Promise<LlmResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // the retry gets the SAME budget: halving it guaranteed a second failure
      // on any provider slow enough to have timed out the first time
      const text = await once(system, user, timeoutMs);
      // strip markdown fences if the provider added them
      const cleaned = text.replace(/```(json)?/gi, "").trim();
      lastError = null;
      return { ok: true, text: cleaned, source: "llm" };
    } catch (e) {
      if (attempt === 1) {
        lastError = String(e);
        return { ok: false, error: String(e), source: "fallback" };
      }
    }
  }
  return { ok: false, error: "unreachable", source: "fallback" };
}

export function parseJsonLoose<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/[[{][\s\S]*[\]}]/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Validate one model response, allow one schema-guided repair, then fail closed. */
export async function chatStructured<T>(
  system: string,
  user: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
  timeoutMs = LLM_TIMEOUT_MS,
  complete: Completion = chatJson
): Promise<
  | { ok: true; data: T; source: "llm" | "repair" }
  | { ok: false; error: string; source: "fallback" }
> {
  const parse = (result: LlmResult): T | null => {
    if (!result.ok || !result.text) return null;
    const checked = schema.safeParse(parseJsonLoose<unknown>(result.text));
    return checked.success ? checked.data : null;
  };

  const first = await complete(system, user, timeoutMs);
  const firstData = parse(first);
  if (firstData) return { ok: true, data: firstData, source: "llm" };
  if (!first.ok) return { ok: false, error: first.error ?? "provider failure", source: "fallback" };

  const repaired = await complete(
    `${system}\nRepair the prior output. Return only JSON that matches the required schema.`,
    `<invalid_output>${first.text ?? ""}</invalid_output>\n${user}`,
    timeoutMs
  );
  const repairedData = parse(repaired);
  return repairedData
    ? { ok: true, data: repairedData, source: "repair" }
    : { ok: false, error: repaired.error ?? "malformed structured output", source: "fallback" };
}
