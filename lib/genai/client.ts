/**
 * Minimal OpenAI-compatible chat client with hard timeout, one retry and a
 * structured result. LIVE mode only; DEMO mode never calls this.
 */
export interface LlmResult {
  ok: boolean;
  text?: string;
  error?: string;
  source: "llm" | "fallback";
}

function cfg() {
  const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.ARENA_MODEL ?? "gpt-4o-mini";
  return { base, key, model };
}

export function liveModeAvailable(): boolean {
  return Boolean(cfg().key);
}

async function once(
  system: string,
  user: string,
  timeoutMs: number
): Promise<string> {
  const { base, key, model } = cfg();
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
        temperature: 0.7,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`llm http ${res.status}`);
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
  timeoutMs = 15_000
): Promise<LlmResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await once(system, user, attempt === 0 ? timeoutMs : 10_000);
      // strip markdown fences if the provider added them
      const cleaned = text.replace(/```(json)?/gi, "").trim();
      return { ok: true, text: cleaned, source: "llm" };
    } catch (e) {
      if (attempt === 1) {
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
