import type { MessagesBody, ToolDef } from "./types";

/** Subagent / worker requests omit the Agent tool; main Claude Code session includes it. */
export function isAgentSession(body: MessagesBody): boolean {
  if (!Array.isArray(body.tools)) return true;
  return !body.tools.some(
    (t): t is ToolDef =>
      t != null &&
      typeof t === "object" &&
      typeof (t as ToolDef).name === "string" &&
      (t as ToolDef).name === "Agent",
  );
}
