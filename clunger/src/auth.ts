import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? "";

export function isInternalRequest(req: IncomingMessage): boolean {
  if (!INTERNAL_TOKEN) return false;
  const addr = req.socket.remoteAddress ?? "";
  if (addr !== "127.0.0.1" && addr !== "::1" && addr !== "::ffff:127.0.0.1") return false;
  const token = req.headers["x-internal-token"];
  if (typeof token !== "string" || !token) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(INTERNAL_TOKEN));
  } catch {
    return false;
  }
}

