const PORT = 8099;
const XAI_BASE = "https://api.x.ai";
const XAI_API_KEY = process.env.XAI_API_KEY ?? "";

function mapModel(model: string): string {
  if (model === "claude-haiku-4-5-20251001") return "grok-3-mini-fast";
  if (model === "claude-sonnet-4-6") return "grok-3";
  if (model === "claude-opus-4-6") return "grok-3";
  if (model.startsWith("claude-")) return "grok-3";
  return model;
}

interface ToolDef {
  name?: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  [key: string]: unknown;
}

function fixRequiredNull(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(fixRequiredNull);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === "required" && value === null) {
        result[key] = [];
      } else {
        result[key] = fixRequiredNull(value);
      }
    }
    return result;
  }
  return obj;
}

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // Stub out non-messages endpoints (telemetry, metrics, etc.)
    if (path !== "/v1/messages") {
      console.log(`[stub] ${req.method} ${path} -> 200 OK`);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse and transform the request body
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return new Response(JSON.stringify({ error: "invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Map model name
    const originalModel = body.model as string;
    const mappedModel = mapModel(originalModel);
    body.model = mappedModel;
    console.log(`[proxy] ${originalModel} -> ${mappedModel} | stream=${!!body.stream}`);

    // Fix required: null in tools
    if (body.tools) {
      body.tools = fixRequiredNull(body.tools);
    }

    // Determine auth header - prefer x-api-key, fall back to Authorization, then env
    const apiKey =
      req.headers.get("x-api-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      XAI_API_KEY;

    // Build upstream headers
    const upstreamHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    };

    // Forward anthropic-version if present
    const anthropicVersion = req.headers.get("anthropic-version");
    if (anthropicVersion) {
      upstreamHeaders["anthropic-version"] = anthropicVersion;
    }

    // Forward to xAI
    const upstreamUrl = `${XAI_BASE}${path}`;
    let upstreamResp: Response;
    try {
      upstreamResp = await fetch(upstreamUrl, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error(`[proxy] upstream fetch failed:`, err);
      return new Response(
        JSON.stringify({ error: "upstream request failed", detail: String(err) }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // Pass through response headers we care about
    const responseHeaders = new Headers();
    for (const header of ["content-type", "x-request-id"]) {
      const val = upstreamResp.headers.get(header);
      if (val) responseHeaders.set(header, val);
    }

    // Stream or return the response body as-is
    if (!upstreamResp.body) {
      const text = await upstreamResp.text();
      return new Response(text, {
        status: upstreamResp.status,
        headers: responseHeaders,
      });
    }

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: responseHeaders,
    });
  },
});

console.log(`xAI translation proxy listening on http://127.0.0.1:${PORT}`);
