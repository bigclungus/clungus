import db from "../db.ts";
import type { User } from "@clungcord/shared";
import { getOnlineUserIds } from "../ws.ts";

export function getAllUsers(): User[] {
  const users = db.query("SELECT * FROM users ORDER BY username").all() as User[];
  const onlineIds = new Set(getOnlineUserIds());
  return users.map((u) => ({
    ...u,
    status: onlineIds.has(u.id) ? "online" as const : "offline" as const,
  }));
}

export function getUser(userId: number): User | null {
  return (db.query("SELECT * FROM users WHERE id = ?").get(userId) as User) ?? null;
}

export function updateDisplayName(userId: number, displayName: string): User | null {
  db.query("UPDATE users SET display_name = ? WHERE id = ?").run(displayName, userId);
  return getUser(userId);
}
