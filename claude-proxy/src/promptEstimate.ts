import type { MessagesBody } from "./types";

/**
 * UTF-8 byte length of JSON for system + messages + tools (prompt / context sent upstream).
 */
export function estimateContextChars(body: MessagesBody): number {
  const payload = {
    system: body.system,
    messages: body.messages,
    tools: body.tools,
  };
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    return 0;
  }
}

/** Stable key for per-session deltas (Claude Code sends metadata.user_id). */
export function sessionKeyFromBody(body: MessagesBody): string {
  const m = body.metadata;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    const u = (m as Record<string, unknown>).user_id;
    if (typeof u === "string" && u.length > 0) {
      return u.length > 512 ? u.slice(0, 512) : u;
    }
  }
  return "_anon";
}
