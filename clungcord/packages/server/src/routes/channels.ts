import db from "../db.ts";
import { broadcast, broadcastToChannel, sendTo } from "../ws.ts";
import type { User, Channel, Message } from "@clungcord/shared";

export function listChannels(userId: number): Channel[] {
  return db.query(
    `SELECT c.* FROM channels c
     JOIN channel_members cm ON cm.channel_id = c.id
     WHERE cm.user_id = ?
     ORDER BY c.created_at`
  ).all(userId) as Channel[];
}

export function getAllChannels(): Channel[] {
  return db.query("SELECT * FROM channels WHERE type = 'text' ORDER BY created_at").all() as Channel[];
}

export function createChannel(name: string, creatorId: number): Channel {
  const result = db.query("INSERT INTO channels (name, type) VALUES (?, 'text')").run(name);
  const channel = db.query("SELECT * FROM channels WHERE id = ?").get(result.lastInsertRowid) as Channel;

  // Creator auto-joins
  db.query("INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)").run(channel.id, creatorId);

  broadcast({ type: "channel_create", channel });
  return channel;
}

export function renameChannel(channelId: number, name: string): Channel | null {
  const existing = db.query("SELECT * FROM channels WHERE id = ?").get(channelId) as Channel | undefined;
  if (!existing) return null;

  db.query("UPDATE channels SET name = ? WHERE id = ?").run(name, channelId);
  const channel = db.query("SELECT * FROM channels WHERE id = ?").get(channelId) as Channel;
  broadcast({ type: "channel_update", channel });
  return channel;
}

export function deleteChannel(channelId: number): boolean {
  const existing = db.query("SELECT * FROM channels WHERE id = ?").get(channelId) as Channel | undefined;
  if (!existing) return false;
  if (existing.name === "general") return false; // protect #general

  db.query("DELETE FROM channels WHERE id = ?").run(channelId);
  broadcast({ type: "channel_delete", channel_id: channelId });
  return true;
}

export function joinChannel(channelId: number, userId: number): boolean {
  const channel = db.query("SELECT * FROM channels WHERE id = ?").get(channelId) as Channel | undefined;
  if (!channel) return false;

  db.query("INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)").run(channelId, userId);
  const user = db.query("SELECT * FROM users WHERE id = ?").get(userId) as User;
  broadcastToChannel(channelId, { type: "member_join", channel_id: channelId, user });
  return true;
}

export function leaveChannel(channelId: number, userId: number): boolean {
  const channel = db.query("SELECT * FROM channels WHERE id = ?").get(channelId) as Channel | undefined;
  if (!channel) return false;
  if (channel.name === "general") return false; // can't leave #general

  db.query("DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?").run(channelId, userId);
  broadcastToChannel(channelId, { type: "member_leave", channel_id: channelId, user_id: userId });
  return true;
}

export function getChannelMembers(channelId: number): User[] {
  return db.query(
    `SELECT u.* FROM users u
     JOIN channel_members cm ON cm.user_id = u.id
     WHERE cm.channel_id = ?
     ORDER BY u.username`
  ).all(channelId) as User[];
}

export function createDM(userId1: number, userId2: number): Channel {
  // Check if DM already exists between these two users
  const existing = db.query(
    `SELECT c.* FROM channels c
     JOIN channel_members cm1 ON cm1.channel_id = c.id AND cm1.user_id = ?
     JOIN channel_members cm2 ON cm2.channel_id = c.id AND cm2.user_id = ?
     WHERE c.type = 'dm'`
  ).get(userId1, userId2) as Channel | undefined;

  if (existing) return existing;

  const user1 = db.query("SELECT * FROM users WHERE id = ?").get(userId1) as User;
  const user2 = db.query("SELECT * FROM users WHERE id = ?").get(userId2) as User;

  const result = db.query("INSERT INTO channels (name, type) VALUES (?, 'dm')").run(`${user1.username},${user2.username}`);
  const channel = db.query("SELECT * FROM channels WHERE id = ?").get(result.lastInsertRowid) as Channel;

  db.query("INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)").run(channel.id, userId1);
  db.query("INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)").run(channel.id, userId2);

  // Notify the other user so the DM appears in their sidebar immediately
  sendTo(userId2, { type: "channel_create", channel });

  return channel;
}
