import type { MessagesBody, ProxyConfig, ToolDef } from "./types";
import { isAgentSession } from "./detect";
import { stripAdaptiveThinkingIfListed } from "./stripAdaptive";

function allowlistSet(names: string[]): Set<string> {
  return new Set(names);
}

export function transformMessagesBody(
  body: MessagesBody,
  cfg: ProxyConfig,
): MessagesBody {
  const agent = isAgentSession(body);
  const model = agent ? cfg.models.agent : cfg.models.default;
  const allow = allowlistSet(
    agent ? cfg.toolAllowlists.agent : cfg.toolAllowlists.default,
  );

  const next: MessagesBody = { ...body, model };

  if (Array.isArray(body.tools)) {
    next.tools = body.tools.filter(
      (t): t is ToolDef =>
        t != null &&
        typeof t === "object" &&
        typeof (t as ToolDef).name === "string" &&
        allow.has((t as ToolDef).name),
    );
  }

  return stripAdaptiveThinkingIfListed(
    next,
    model,
    cfg.stripAdaptiveThinkingForModels,
  );
}
