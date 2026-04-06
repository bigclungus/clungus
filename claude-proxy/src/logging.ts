import { writeSync } from "node:fs";
import type { LoggingConfig } from "./types";

const DEFAULT_MAX = 1_048_576;

/** Unbuffered stderr so logs show up immediately (e.g. piped / IDE runners). */
export function emitLog(line: string): void {
  const s = line.endsWith("\n") ? line : `${line}\n`;
  try {
    writeSync(2, s);
  } catch {
    console.error(line);
  }
}

export function resolveLogging(cfg: LoggingConfig | undefined): {
  incomingRequest: boolean;
  outgoingRequest: boolean;
  response: boolean;
  maxBodyBytes: number;
} {
  const l = cfg ?? {};
  const outgoing =
    l.outgoingRequest === true || l.request === true;
  return {
    incomingRequest: l.incomingRequest === true,
    outgoingRequest: outgoing,
    response: l.response === true,
    maxBodyBytes:
      typeof l.maxBodyBytes === "number" && l.maxBodyBytes > 0
        ? l.maxBodyBytes
        : DEFAULT_MAX,
  };
}

function truncateJsonLog(obj: unknown, maxBytes: number): string {
  const s = JSON.stringify(obj);
  const enc = new TextEncoder();
  if (enc.encode(s).length <= maxBytes) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (enc.encode(s.slice(0, mid)).length <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo) + "\n...[truncated]";
}

/** Log a JSON value with a stable tag (`incoming` | `outgoing`). */
export function logJsonPayload(
  tag: "incoming" | "outgoing",
  body: unknown,
  maxBytes: number,
): void {
  emitLog(`[claude-proxy] ${tag} ${truncateJsonLog(body, maxBytes)}`);
}
