import { cookies } from "next/headers";
import { ArenaState, DEFAULT_SESSION, arena } from "@/lib/state";

export const SESSION_COOKIE = "arena_session";

/**
 * Resolve the caller's arena from their session cookie, issuing one when the
 * request has none. Keeps concurrent reviewers on the shared deployment from
 * overwriting each other's run.
 */
export async function sessionArena(): Promise<{ state: ArenaState; sessionId: string }> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  const sessionId = existing && /^[a-z0-9-]{8,64}$/.test(existing) ? existing : newSessionId();
  if (sessionId !== existing) {
    try {
      jar.set(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60,
      });
    } catch {
      // route handlers that only read cookies cannot set them; fall back to
      // the shared arena rather than failing the request
      return { state: arena(DEFAULT_SESSION), sessionId: DEFAULT_SESSION };
    }
  }
  return { state: arena(sessionId), sessionId };
}

function newSessionId(): string {
  return `s-${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
