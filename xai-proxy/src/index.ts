const PORT = 8099;
const XAI_BASE = "https://api.x.ai";
const XAI_API_KEY = process.env.XAI_API_KEY ?? "";

function mapModel(model: string): string {
  if (model === "claude-haiku-4-5-20251001") return "grok-4-1-fast-non-reasoning";
  if (model === "claude-sonnet-4-6") return "grok-4-1-fast-reasoning";
  if (model === "claude-opus-4-6") return "grok-4.20-0309-reasoning";
  if (model.startsWith("claude-")) return "grok-4.20-0309-reasoning";
  return model;
}

interface ToolDef {
  name?: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Recursively fix JSON Schema fields that xAI's Anthropic-compat endpoint rejects.
 *
 * Known xAI quirks:
 * - `required` must be an array, never null. If absent on object-type schemas,
 *   xAI defaults it to null internally then fails validation.
 * - `default: null` can cause issues in some contexts — strip it defensively.
 */
function fixSchemaFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(fixSchemaFields);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Replace "required": null with empty array (xAI rejects null, expects array)
      if (key === "required" && value === null) {
        result[key] = [];
        continue;
      }
      // Drop default: null defensively
      if (key === "default" && value === null) {
        continue;
      }
      result[key] = fixSchemaFields(value);
    }
    // xAI bug: if an object-type schema has no "required" field at all,
    // xAI internally defaults it to null and then fails validation.
    // Ensure every object-type schema has "required" as an array.
    if (result.type === "object" && !("required" in result)) {
      result["required"] = [];
    }
    return result;
  }
  return obj;
}

/** xAI /v1/messages rejects blocks not in its Rust MessageContent enum (422). */
const DROP_CONTENT_TYPES = new Set(["thinking", "redacted_thinking"]);

/** Content block types that xAI doesn't support — replace with text placeholder. */
const REPLACE_WITH_PLACEHOLDER_TYPES = new Set(["image"]);

function stripBlockCacheControl(block: Record<string, unknown>): Record<string, unknown> {
  const { cache_control: _c, ...rest } = block;
  return rest;
}

/**
 * xAI's MessageContent for tool_result often only accepts `content` as a string.
 * Anthropic allows an array of text/image blocks; flatten pure-text arrays to one string.
 */
function normalizeToolResultInnerContent(blocks: unknown[]): string | unknown[] {
  if (blocks.length === 0) {
    return "";
  }
  const allText = blocks.every(
    (b) =>
      typeof b === "object" &&
      b !== null &&
      !Array.isArray(b) &&
      (b as Record<string, unknown>).type === "text",
  );
  if (allText) {
    return (blocks as Record<string, unknown>[])
      .map((b) => String(b.text ?? ""))
      .join("");
  }
  return blocks;
}

/**
 * Keep only content block shapes xAI's Anthropic-compat layer accepts.
 * Drops extended-thinking blocks, strips prompt-cache fields, sanitizes tool_result nesting.
 */
function sanitizeContentBlocks(blocks: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const raw of blocks) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const block = raw as Record<string, unknown>;
    const t = block.type;
    if (typeof t !== "string") {
      continue;
    }
    if (DROP_CONTENT_TYPES.has(t)) {
      continue;
    }
    if (t === "tool_result") {
      let inner: unknown = block.content;
      if (Array.isArray(inner)) {
        const sanitizedInner = sanitizeContentBlocks(inner);
        inner =
          sanitizedInner.length === 0
            ? ""
            : normalizeToolResultInnerContent(sanitizedInner);
      }
      out.push(
        stripBlockCacheControl({
          ...block,
          content: inner ?? "",
        }),
      );
      continue;
    }
    if (REPLACE_WITH_PLACEHOLDER_TYPES.has(t)) {
      out.push({ type: "text", text: "[image content omitted]" });
      continue;
    }
    if (t === "text" || t === "tool_use") {
      out.push(stripBlockCacheControl({ ...block }));
      continue;
    }
    console.warn(`[proxy] dropping unsupported content block type: ${t}`);
  }
  return out;
}

function sanitizeMessageContent(content: unknown): string | unknown[] {
  if (content === null || content === undefined) {
    return [{ type: "text", text: "" }];
  }
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return [{ type: "text", text: String(content) }];
  }
  const sanitized = sanitizeContentBlocks(content);
  if (sanitized.length === 0) {
    return [{ type: "text", text: "" }];
  }
  return sanitized;
}

function sanitizeAnthropicMessages(body: Record<string, unknown>): void {
  if (Array.isArray(body.system)) {
    body.system = sanitizeMessageContent(body.system);
  }
  const messages = body.messages;
  if (!Array.isArray(messages)) {
    return;
  }
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m === null || typeof m !== "object" || Array.isArray(m)) {
      continue;
    }
    const msg = m as Record<string, unknown>;
    msg.content = sanitizeMessageContent(msg.content);
  }
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

    // Fix schema fields: drop required:null, etc. (xAI rejects null required)
    body = fixSchemaFields(body) as Record<string, unknown>;

    // Strip cache_control, thinking blocks, etc. (xAI 422 on unknown MessageContent variants)
    sanitizeAnthropicMessages(body);

    // Strip Anthropic-specific fields that xAI doesn't support
    delete body.thinking;
    delete body.output_config;
    delete body.metadata;

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

    // Log error responses and dump request body for debugging
    if (upstreamResp.status >= 400) {
      const errBody = await upstreamResp.text();
      console.error(`[proxy] upstream ${upstreamResp.status}: ${errBody.substring(0, 500)}`);
      // Write full request body on error for post-mortem debugging
      await Bun.write("/tmp/xai-proxy-error-body.json", JSON.stringify(body, null, 2));
      console.error(`[proxy] request body dumped to /tmp/xai-proxy-error-body.json`);
      const responseHeaders = new Headers();
      responseHeaders.set("content-type", "application/json");
      return new Response(errBody, { status: upstreamResp.status, headers: responseHeaders });
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
