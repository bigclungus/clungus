import { getConfigPath, loadConfig } from "./config";
import { isAgentSession } from "./detect";
import { forwardToAnthropicHeaders } from "./forwardHeaders";
import { emitLog, logJsonPayload, resolveLogging } from "./logging";
import { tapUpstreamResponse } from "./responseTap";
import type { MessagesBody } from "./types";
import { transformMessagesBody } from "./transform";

const PATH = "/v1/messages";

function responseHeaders(upstream: Response): Headers {
  const h = new Headers();
  const copy = [
    "content-type",
    "cache-control",
    "anthropic-ratelimit-requests-limit",
    "anthropic-ratelimit-requests-remaining",
    "anthropic-ratelimit-requests-reset",
    "anthropic-ratelimit-tokens-limit",
    "anthropic-ratelimit-tokens-remaining",
    "anthropic-ratelimit-tokens-reset",
    "request-id",
  ] as const;
  for (const name of copy) {
    const v = upstream.headers.get(name);
    if (v) h.set(name, v);
  }
  return h;
}

const cfg = await loadConfig();
const base = cfg.upstreamBaseUrl.replace(/\/$/, "");
const log = resolveLogging(cfg.logging);

if (log.incomingRequest || log.outgoingRequest || log.response) {
  emitLog(`[claude-proxy] config: ${getConfigPath()}`);
  emitLog(
    `[claude-proxy] logging: incoming=${log.incomingRequest} outgoing=${log.outgoingRequest} response=${log.response} maxBodyBytes=${log.maxBodyBytes}`,
  );
}

Bun.serve({
  hostname: cfg.listen.hostname,
  port: cfg.listen.port,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== PATH) {
      return new Response("Claude proxy: POST /v1/messages only\n", {
        status: 404,
      });
    }

    if (log.incomingRequest || log.outgoingRequest || log.response) {
      emitLog("[claude-proxy] ← incoming POST /v1/messages");
    }

    let raw: MessagesBody;
    try {
      raw = (await req.json()) as MessagesBody;
    } catch {
      return new Response("Invalid JSON body\n", { status: 400 });
    }

    if (log.incomingRequest) {
      logJsonPayload("incoming", raw, log.maxBodyBytes);
    }

    const body = transformMessagesBody(raw, cfg);
    if (log.outgoingRequest) {
      logJsonPayload("outgoing", body, log.maxBodyBytes);
    }

    const upstreamUrl = `${base}${PATH}${url.search}`;

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: forwardToAnthropicHeaders(req),
      body: JSON.stringify(body),
    });

    const outHeaders = responseHeaders(upstream);
    const vmCfg = cfg.victoriaMetrics;
    const vmOn =
      vmCfg?.enabled === true &&
      typeof vmCfg.host === "string" &&
      vmCfg.host.trim() !== "" &&
      typeof vmCfg.port === "number" &&
      vmCfg.port > 0;

    if (log.response || vmOn) {
      const route = isAgentSession(raw) ? "agent" : "default";
      const model = typeof body.model === "string" ? body.model : "";
      return tapUpstreamResponse(upstream, outHeaders, {
        logMaxBytes: log.response ? log.maxBodyBytes : 0,
        victoriaMetrics:
          vmOn && vmCfg
            ? { cfg: vmCfg, labels: { model, route } }
            : undefined,
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  },
});

emitLog(
  `[claude-proxy] listening ${cfg.listen.hostname}:${cfg.listen.port} → ${base} (agent=${cfg.models.agent} default=${cfg.models.default})`,
);
