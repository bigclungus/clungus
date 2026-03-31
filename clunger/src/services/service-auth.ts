/**
 * Shared authentication helpers for Connect RPC service handlers.
 * All service files should import requireAuth from here instead of duplicating it.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { ConnectError, Code } from "@connectrpc/connect";
import type { HandlerContext } from "@connectrpc/connect";

const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? "";
const COOKIE_SECRET = process.env.COOKIE_SECRET ?? "";
const GITHUB_COOKIE = "tauth_github";
const ALLOWED_USERS = (process.env.GITHUB_ALLOWED_USERS ?? "")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

function parseCookieHeader(header: string, name: string): string {
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(name + "=")) {
      return trimmed.slice(name.length + 1).trim();
    }
  }
  return "";
}

function verifyCookieValue(value: string): string {
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

/**
 * Throws ConnectError(PermissionDenied) unless the request carries a valid
 * internal token or an allowlisted GitHub session cookie.
 */
export function requireAuth(ctx: HandlerContext): void {
  // Internal service-to-service token (highest priority)
  const token = ctx.requestHeader.get("x-internal-token") ?? "";
  if (INTERNAL_TOKEN && token) {
    try {
      if (timingSafeEqual(Buffer.from(token), Buffer.from(INTERNAL_TOKEN))) return;
    } catch {
      // length mismatch — fall through
    }
  }

  // GitHub session cookie from an allowlisted user
  const cookieHeader = ctx.requestHeader.get("cookie") ?? "";
  const raw = parseCookieHeader(cookieHeader, GITHUB_COOKIE);
  if (raw) {
    const user = verifyCookieValue(raw);
    if (user.length > 0 && (ALLOWED_USERS.length === 0 || ALLOWED_USERS.includes(user))) return;
  }

  throw new ConnectError("Forbidden: authentication required", Code.PermissionDenied);
}
