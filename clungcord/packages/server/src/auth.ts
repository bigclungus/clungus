import { createHmac, timingSafeEqual } from "node:crypto";
import db from "./db.ts";
import type { User } from "@clungcord/shared";

const COOKIE_SECRET = process.env.COOKIE_SECRET ?? "";
const GITHUB_COOKIE = "tauth_github";

export function parseCookie(header: string, name: string): string {
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(name + "=")) {
      return trimmed.slice(name.length + 1).trim();
    }
  }
  return "";
}

export function verifyCookie(value: string): string | null {
  if (!COOKIE_SECRET || !value.includes(".")) return null;
  const dotIdx = value.lastIndexOf(".");
  const username = value.slice(0, dotIdx);
  const sig = value.slice(dotIdx + 1);
  const expected = createHmac("sha256", COOKIE_SECRET).update(username).digest("hex");
  try {
    if (timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return username;
    }
  } catch {
    // length mismatch
  }
  return null;
}

/** Validate tauth_github cookie, return username or null */
export function authenticateRequest(cookieHeader: string): string | null {
  const raw = parseCookie(cookieHeader, GITHUB_COOKIE);
  if (!raw) return null;
  return verifyCookie(raw);
}

/** Get or create user by GitHub username. Returns the user row. */
export function ensureUser(username: string): User {
  const existing = db.query("SELECT * FROM users WHERE username = ?").get(username) as User | undefined;
  if (existing) {
    // Update last_seen and status
    db.query("UPDATE users SET status = 'online', last_seen = unixepoch() WHERE id = ?").run(existing.id);
    return { ...existing, status: "online", last_seen: Math.floor(Date.now() / 1000) };
  }

  // Lazy-provision: create user with github_id derived from username hash (we don't have the real one from cookie alone)
  // We'll use a hash of the username as a stand-in github_id
  const githubId = hashToInt(username);
  const avatarUrl = `https://github.com/${username}.png`;

  const result = db.query(
    "INSERT INTO users (github_id, username, display_name, avatar_url, status, last_seen) VALUES (?, ?, ?, ?, 'online', unixepoch())"
  ).run(githubId, username, username, avatarUrl);

  // Auto-join #general
  const general = db.query("SELECT id FROM channels WHERE name = 'general' AND type = 'text'").get() as { id: number } | undefined;
  if (general) {
    db.query("INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)").run(general.id, result.lastInsertRowid);
  }

  return db.query("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid) as User;
}

function hashToInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
