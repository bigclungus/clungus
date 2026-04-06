import {
  asUsageRecord,
  deepMergeUsage,
  sanitizeUsageObjectsDeep,
} from "./apiUsage";
import { emitLog } from "./logging";
import type { VictoriaMetricsConfig } from "./types";
import { pushUsageMetrics } from "./victoriaMetrics";

const MAX_JSON_BODY_BYTES = 64 * 1024 * 1024;

const enc = new TextEncoder();

/**
 * `sanitizeUsageObjectsDeep` only fixes existing `usage` keys. Upstream often **omits** `usage`
 * on some events and on non-stream `type: "message"` bodies — clients then read `usage` as
 * undefined and throw on `.input_tokens`. Here we **create** `usage: {}` where Anthropic-shaped
 * payloads expect it.
 */
function ensureAnthropicUsageKeysPresent(o: Record<string, unknown>): void {
  const t = o.type;
  if (typeof t !== "string") return;

  if (t === "message_start") {
    const msg = o.message;
    if (msg && typeof msg === "object" && !Array.isArray(msg)) {
      const m = msg as Record<string, unknown>;
      if (m.usage == null || typeof m.usage !== "object" || Array.isArray(m.usage)) {
        m.usage = {};
      }
    }
    return;
  }

  if (t === "message_delta" || t === "message_stop") {
    if (o.usage == null || typeof o.usage !== "object" || Array.isArray(o.usage)) {
      o.usage = {};
    }
    if (t === "message_delta") {
      const delta = o.delta;
      if (delta && typeof delta === "object" && !Array.isArray(delta)) {
        const d = delta as Record<string, unknown>;
        if (d.usage == null || typeof d.usage !== "object" || Array.isArray(d.usage)) {
          d.usage = {};
        }
      }
    }
    return;
  }

  /* Non-stream Messages API final object */
  if (t === "message") {
    if (o.usage == null || typeof o.usage !== "object" || Array.isArray(o.usage)) {
      o.usage = {};
    }
  }
}

function normalizeParsedEventOrMessage(o: Record<string, unknown>): void {
  sanitizeUsageObjectsDeep(o);
  ensureAnthropicUsageKeysPresent(o);
}

function rewriteSseDataLine(line: string): string {
  if (!line.startsWith("data:")) return line;
  const raw = line.slice(5).trimStart();
  if (raw === "[DONE]") return line;
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object" || Array.isArray(j)) return line;
    const o = j as Record<string, unknown>;
    normalizeParsedEventOrMessage(o);
    return `data: ${JSON.stringify(o)}`;
  } catch {
    return line;
  }
}

function usageFromJsonRoot(parsed: unknown): Record<string, unknown> | null {
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return null;
  }
  const root = parsed as Record<string, unknown>;
  let acc: Record<string, unknown> | null = null;
  const mergeIn = (raw: unknown) => {
    const u = asUsageRecord(raw);
    if (!u || Object.keys(u).length === 0) return;
    try {
      acc = deepMergeUsage(acc, u);
    } catch {
      /* ignore unusable fragment */
    }
  };
  mergeIn(root.usage);
  const msg = root.message;
  if (msg && typeof msg === "object" && !Array.isArray(msg)) {
    mergeIn((msg as Record<string, unknown>).usage);
  }
  const delta = root.delta;
  if (delta && typeof delta === "object" && !Array.isArray(delta)) {
    mergeIn((delta as Record<string, unknown>).usage);
  }
  if (!acc || Object.keys(acc).length === 0) return null;
  return acc;
}

/** Incrementally scan Anthropic SSE for `message_start` / `message_delta` usage. */
class SseUsageScanner {
  private buf = "";
  private latest: Record<string, unknown> | null = null;

  pushText(chunk: string): void {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf("\n")) !== -1) {
      const line = this.buf.slice(0, i).replace(/\r$/, "");
      this.buf = this.buf.slice(i + 1);
      this.consumeLine(line);
    }
  }

  private consumeLine(line: string): void {
    if (!line.startsWith("data:")) return;
    const raw = line.slice(5).trimStart();
    if (raw === "[DONE]") return;
    let j: unknown;
    try {
      j = JSON.parse(raw);
    } catch {
      return;
    }
    if (!j || typeof j !== "object") return;
    const o = j as Record<string, unknown>;

    if (
      o.type === "message_start" &&
      o.message &&
      typeof o.message === "object" &&
      !Array.isArray(o.message)
    ) {
      const msg = o.message as Record<string, unknown>;
      const u = asUsageRecord(msg.usage);
      if (u) {
        try {
          this.latest = deepMergeUsage(this.latest, u);
        } catch (e) {
          emitLog(
            `[claude-proxy] SSE usage merge skipped (message_start): ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
    if (o.type === "message_delta") {
      const u =
        asUsageRecord(o.usage) ??
        asUsageRecord(
          (o.delta as Record<string, unknown> | undefined)?.usage,
        );
      if (u) {
        try {
          this.latest = deepMergeUsage(this.latest, u);
        } catch (e) {
          emitLog(
            `[claude-proxy] SSE usage merge skipped (message_delta): ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  }

  end(): Record<string, unknown> | null {
    if (this.buf.length > 0) {
      this.consumeLine(this.buf);
      this.buf = "";
    }
    return this.latest;
  }
}

export type TapOptions = {
  logMaxBytes: number;
  victoriaMetrics?: {
    cfg: VictoriaMetricsConfig;
    labels: { model: string; route: "agent" | "default" };
  };
};

/**
 * Pass response bytes to the client; optionally capture a prefix for logs and/or extract token usage for VM.
 */
export function tapUpstreamResponse(
  upstream: Response,
  outHeaders: Headers,
  opts: TapOptions,
): Response {
  const body = upstream.body;
  const ct = upstream.headers.get("content-type") ?? "";
  const status = upstream.status;
  const logCap = opts.logMaxBytes > 0 ? opts.logMaxBytes : 0;
  const vm = opts.victoriaMetrics;
  const isSse = ct.includes("text/event-stream");
  const isJson = ct.includes("application/json") && !isSse;

  if (!body) {
    if (logCap > 0) {
      emitLog(`[claude-proxy] resp ${status} ${ct} (no body)`);
    }
    return new Response(null, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  }

  let logCaptured = 0;
  const logChunks: Uint8Array[] = [];
  let logTruncated = false;
  let jsonAccum: Uint8Array[] = [];
  let jsonSize = 0;
  /** Response larger than cap: passthrough raw (cannot safely rewrite). */
  let jsonSpilled = false;
  const sseScanner =
    isSse && vm?.cfg.enabled === true ? new SseUsageScanner() : null;
  const dec = new TextDecoder();
  let sseLineBuf = "";

  const takeLogBytes = (b: Uint8Array) => {
    if (logCap <= 0) return;
    if (logCaptured < logCap) {
      const room = logCap - logCaptured;
      const take = Math.min(b.byteLength, room);
      logChunks.push(take === b.byteLength ? b : b.subarray(0, take));
      logCaptured += take;
      if (take < b.byteLength) logTruncated = true;
    } else {
      logTruncated = true;
    }
  };

  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(part, ctrl) {
        if (isSse) {
          sseLineBuf += dec.decode(part, { stream: true });
          let nl: number;
          while ((nl = sseLineBuf.indexOf("\n")) !== -1) {
            const line = sseLineBuf.slice(0, nl).replace(/\r$/, "");
            sseLineBuf = sseLineBuf.slice(nl + 1);
            const rewritten = rewriteSseDataLine(line);
            const lineOut = `${rewritten}\n`;
            const bytes = enc.encode(lineOut);
            ctrl.enqueue(bytes);
            takeLogBytes(bytes);
            if (sseScanner) sseScanner.pushText(lineOut);
          }
          return;
        }

        if (isJson) {
          if (jsonSpilled) {
            ctrl.enqueue(part);
            takeLogBytes(part);
            return;
          }
          if (jsonSize + part.byteLength <= MAX_JSON_BODY_BYTES) {
            jsonAccum.push(part);
            jsonSize += part.byteLength;
          } else {
            for (const c of jsonAccum) {
              ctrl.enqueue(c);
              takeLogBytes(c);
            }
            jsonAccum = [];
            jsonSize = 0;
            ctrl.enqueue(part);
            takeLogBytes(part);
            jsonSpilled = true;
            emitLog(
              `[claude-proxy] JSON response exceeds ${MAX_JSON_BODY_BYTES} bytes; usage not rewritten (passthrough)`,
            );
          }
          return;
        }

        ctrl.enqueue(part);
        takeLogBytes(part);
      },
      flush(ctrl) {
        if (isSse) {
          sseLineBuf += dec.decode();
          if (sseLineBuf.length > 0) {
            const line = sseLineBuf.replace(/\r$/, "");
            const rewritten = rewriteSseDataLine(line);
            const bytes = enc.encode(rewritten);
            ctrl.enqueue(bytes);
            takeLogBytes(bytes);
            if (sseScanner) sseScanner.pushText(rewritten);
            sseLineBuf = "";
          }
        }

        if (sseScanner && vm?.cfg.enabled) {
          pushUsageMetrics(vm.cfg, vm.labels, sseScanner.end());
        } else if (isJson && !jsonSpilled && jsonAccum.length > 0) {
          const len = jsonAccum.reduce((n, c) => n + c.byteLength, 0);
          const merged = new Uint8Array(len);
          let off = 0;
          for (const c of jsonAccum) {
            merged.set(c, off);
            off += c.byteLength;
          }
          try {
            const text = new TextDecoder("utf-8", { fatal: false }).decode(merged);
            const parsed: unknown = JSON.parse(text);
            if (
              parsed !== null &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              normalizeParsedEventOrMessage(parsed as Record<string, unknown>);
            }
            const out = JSON.stringify(parsed);
            const outBytes = enc.encode(out);
            ctrl.enqueue(outBytes);
            takeLogBytes(outBytes);
            if (vm?.cfg.enabled) {
              pushUsageMetrics(vm.cfg, vm.labels, usageFromJsonRoot(parsed));
            }
          } catch {
            ctrl.enqueue(merged);
            takeLogBytes(merged);
            if (vm?.cfg.enabled) {
              pushUsageMetrics(vm.cfg, vm.labels, null);
            }
          }
        }

        if (logCap > 0) {
          const len = logChunks.reduce((n, c) => n + c.byteLength, 0);
          const merged = new Uint8Array(len);
          let off = 0;
          for (const c of logChunks) {
            merged.set(c, off);
            off += c.byteLength;
          }
          let text = new TextDecoder("utf-8", { fatal: false }).decode(merged);
          if (logTruncated) text += "\n...[truncated]";
          emitLog(`[claude-proxy] resp ${status} ${ct}\n${text}`);
        }
      },
    }),
  );

  return new Response(stream, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}
