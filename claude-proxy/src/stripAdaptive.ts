import type { MessagesBody } from "./types";

/** Exact id match, or dated snapshot id: `entry` + `-` / `.` suffix. */
export function modelMatchesAny(
  model: string,
  entries: string[] | undefined,
): boolean {
  if (!entries?.length) return false;
  const m = model.trim().toLowerCase();
  if (!m) return false;
  for (const raw of entries) {
    const p = raw.trim().toLowerCase();
    if (!p) continue;
    if (m === p) return true;
    if (m.startsWith(`${p}-`)) return true;
    if (m.startsWith(`${p}.`)) return true;
  }
  return false;
}

/**
 * Remove adaptive thinking + effort (Claude Code sends both for 4.6).
 * Only mutates when the routed model is listed in config.
 */
export function stripAdaptiveThinkingIfListed(
  body: MessagesBody,
  model: string,
  stripForModels: string[] | undefined,
): MessagesBody {
  if (!modelMatchesAny(model, stripForModels)) return body;

  const next: MessagesBody = { ...body };

  const thinking = next.thinking;
  if (
    thinking &&
    typeof thinking === "object" &&
    !Array.isArray(thinking) &&
    (thinking as { type?: unknown }).type === "adaptive"
  ) {
    delete next.thinking;
  }

  const oc = next.output_config;
  if (oc && typeof oc === "object" && !Array.isArray(oc)) {
    const rest = { ...(oc as Record<string, unknown>) };
    delete rest.effort;
    if (Object.keys(rest).length === 0) {
      delete next.output_config;
    } else {
      next.output_config = rest;
    }
  }

  return next;
}
