import db from "../db.ts";
import { broadcastToChannel } from "../ws.ts";
import { incrementEmojiUseCount } from "./emojis.ts";
import type { Reaction } from "@clungcord/shared";

interface ReactionRow {
  emoji: string;
  user_id: number;
}

export function getReactionsForMessage(messageId: number): Reaction[] {
  const rows = db.query(
    "SELECT emoji, user_id FROM reactions WHERE message_id = ? ORDER BY created_at"
  ).all(messageId) as ReactionRow[];

  const map = new Map<string, Reaction>();
  for (const row of rows) {
    const existing = map.get(row.emoji);
    if (existing) {
      existing.count++;
      existing.users.push(row.user_id);
    } else {
      map.set(row.emoji, { emoji: row.emoji, count: 1, users: [row.user_id] });
    }
  }
  return [...map.values()];
}

export function getReactionsForMessages(messageIds: number[]): Record<number, Reaction[]> {
  if (messageIds.length === 0) return {};
  const placeholders = messageIds.map(() => "?").join(",");
  const rows = db.query(
    `SELECT message_id, emoji, user_id FROM reactions WHERE message_id IN (${placeholders}) ORDER BY created_at`
  ).all(...messageIds) as (ReactionRow & { message_id: number })[];

  const result: Record<number, Reaction[]> = {};
  for (const row of rows) {
    if (!result[row.message_id]) result[row.message_id] = [];
    const reactions = result[row.message_id];
    const existing = reactions.find((r) => r.emoji === row.emoji);
    if (existing) {
      existing.count++;
      existing.users.push(row.user_id);
    } else {
      reactions.push({ emoji: row.emoji, count: 1, users: [row.user_id] });
    }
  }
  return result;
}

export function addReaction(messageId: number, userId: number, emoji: string): Reaction[] | null {
  // Verify message exists and get channel_id
  const msg = db.query("SELECT channel_id FROM messages WHERE id = ?").get(messageId) as { channel_id: number } | undefined;
  if (!msg) return null;

  try {
    const result = db.query(
      "INSERT OR IGNORE INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)"
    ).run(messageId, userId, emoji);
    // If a new reaction was inserted and it's a custom emoji, bump its use count
    if (result.changes > 0 && emoji.startsWith(":") && emoji.endsWith(":")) {
      incrementEmojiUseCount(emoji);
    }
  } catch (e) {
    // unique constraint — already reacted
  }

  const reactions = getReactionsForMessage(messageId);

  broadcastToChannel(msg.channel_id, {
    type: "reaction_add",
    channel_id: msg.channel_id,
    message_id: messageId,
    emoji,
    user_id: userId,
    reactions,
  });

  return reactions;
}

export function removeReaction(messageId: number, userId: number, emoji: string): Reaction[] | null {
  const msg = db.query("SELECT channel_id FROM messages WHERE id = ?").get(messageId) as { channel_id: number } | undefined;
  if (!msg) return null;

  db.query(
    "DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?"
  ).run(messageId, userId, emoji);

  const reactions = getReactionsForMessage(messageId);

  broadcastToChannel(msg.channel_id, {
    type: "reaction_remove",
    channel_id: msg.channel_id,
    message_id: messageId,
    emoji,
    user_id: userId,
    reactions,
  });

  return reactions;
}
