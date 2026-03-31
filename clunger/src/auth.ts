import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? "";
const COOKIE_SECRET = process.env.COOKIE_SECRET ?? "";
const GITHUB_COOKIE = "tauth_github";

function isLocalhost(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function verifyCookie(value: string): string {
  if (!COOKIE_SECRET || !value.includes(".")) return "";
  const dotIdx = value.lastIndexOf(".");
  const username = value.slice(0, dotIdx);
  const sig = value.slice(dotIdx + 1);
  const expected = createHmac("sha256", COOKIE_SECRET).update(username).digest("hex");
  try {
    if (timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return username;
    }
  } catch {
    // length mismatch — not valid
  }
  return "";
}

function parseCookie(header: string, name: string): string {
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(name + "=")) {
      return trimmed.slice(name.length + 1).trim();
    }
  }
  return "";
}

export function isInternalRequest(req: IncomingMessage): boolean {
  if (!INTERNAL_TOKEN) return false;
  if (!isLocalhost(req)) return false;
  const token = req.headers["x-internal-token"];
  if (typeof token !== "string" || !token) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(INTERNAL_TOKEN));
  } catch {
    return false;
  }
}

export function isAuthed(req: IncomingMessage): boolean {
  if (isInternalRequest(req)) return true;
  const cookieHeader = req.headers["cookie"] ?? "";
  const raw = parseCookie(cookieHeader, GITHUB_COOKIE);
  if (!raw) return false;
  const user = verifyCookie(raw);
  return user.length > 0;
}
