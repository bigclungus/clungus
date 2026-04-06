import {
  asUsageRecord,
  deepMergeUsage,
} from "./apiUsage";
import { emitLog } from "./logging";
import type { VictoriaMetricsConfig } from "./types";
import { pushUsageMetrics } from "./victoriaMetrics";

const MAX_JSON_BODY_BYTES = 64 * 1024 * 1024;

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

    if (o.type === "message_start" && o.message && typeof o.message === "object") {
      const u = asUsageRecord(
        (o.message as { usage?: unknown }).usage,
      );
      if (u) {
        this.latest = deepMergeUsage(this.latest, u);
      }
    }
    if (o.type === "message_delta") {
      const u = asUsageRecord(o.usage);
      if (u) {
        this.latest = deepMergeUsage(this.latest, u);
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
  const sseScanner =
    isSse && vm?.cfg.enabled === true ? new SseUsageScanner() : null;
  const dec = new TextDecoder();

  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(part, ctrl) {
        ctrl.enqueue(part);

        if (logCap > 0 && logCaptured < logCap) {
          const room = logCap - logCaptured;
          const take = Math.min(part.byteLength, room);
          logChunks.push(
            take === part.byteLength ? part : part.subarray(0, take),
          );
          logCaptured += take;
          if (take < part.byteLength) logTruncated = true;
        } else if (logCap > 0) {
          logTruncated = true;
        }

        if (sseScanner) {
          sseScanner.pushText(dec.decode(part, { stream: true }));
        } else if (isJson && vm?.cfg.enabled) {
          if (jsonSize < MAX_JSON_BODY_BYTES) {
            const room = MAX_JSON_BODY_BYTES - jsonSize;
            const take = Math.min(part.byteLength, room);
            jsonAccum.push(
              take === part.byteLength ? part : part.subarray(0, take),
            );
            jsonSize += take;
          }
        }
      },
      flush() {
        if (sseScanner && vm?.cfg.enabled) {
          sseScanner.pushText(dec.decode());
          pushUsageMetrics(vm.cfg, vm.labels, sseScanner.end());
        } else if (isJson && vm?.cfg.enabled && jsonAccum.length > 0) {
          const len = jsonAccum.reduce((n, c) => n + c.byteLength, 0);
          const merged = new Uint8Array(len);
          let off = 0;
          for (const c of jsonAccum) {
            merged.set(c, off);
            off += c.byteLength;
          }
          try {
            const text = new TextDecoder("utf-8", { fatal: false }).decode(merged);
            const parsed = JSON.parse(text) as { usage?: unknown };
            pushUsageMetrics(
              vm.cfg,
              vm.labels,
              asUsageRecord(parsed.usage),
            );
          } catch {
            pushUsageMetrics(vm.cfg, vm.labels, null);
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
