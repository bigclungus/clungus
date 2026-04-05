import db from "../db.ts";
import { broadcastToChannel } from "../ws.ts";
import type { Message, User } from "@clungcord/shared";
import { getReactionsForMessages, getReactionsForMessage } from "./reactions.ts";
import { incrementEmojiUseCount } from "./emojis.ts";

interface MessageRow {
  id: number;
  channel_id: number;
  author_id: number;
  content: string;
  reply_to_id: number | null;
  edited_at: number | null;
  created_at: number;
  author_username: string;
  author_display_name: string | null;
  author_avatar_url: string | null;
  author_github_id: number;
  author_status: string;
  author_last_seen: number | null;
  author_created_at: number;
}

const MESSAGE_SELECT = `
  SELECT m.*, u.username as author_username, u.display_name as author_display_name,
         u.avatar_url as author_avatar_url, u.github_id as author_github_id,
         u.status as author_status, u.last_seen as author_last_seen,
         u.created_at as author_created_at
  FROM messages m
  JOIN users u ON u.id = m.author_id`;

function rowToMessage(row: MessageRow, populateReply = true): Message {
  const pinned = !!db.query("SELECT 1 FROM pinned_messages WHERE message_id = ?").get(row.id);
  const msg: Message = {
    id: row.id,
    channel_id: row.channel_id,
    author_id: row.author_id,
    content: row.content,
    reply_to_id: row.reply_to_id ?? null,
    reply_to: null,
    pinned,
    edited_at: row.edited_at,
    created_at: row.created_at,
    author: {
      id: row.author_id,
      github_id: row.author_github_id,
      username: row.author_username,
      display_name: row.author_display_name,
      avatar_url: row.author_avatar_url,
      status: row.author_status as User["status"],
      last_seen: row.author_last_seen,
      created_at: row.author_created_at,
    },
  };

  if (populateReply && row.reply_to_id) {
    const replyRow = db.query(`${MESSAGE_SELECT} WHERE m.id = ?`).get(row.reply_to_id) as MessageRow | null;
    if (replyRow) {
      msg.reply_to = rowToMessage(replyRow, false);
    }
  }

  return msg;
}

export function getMessages(channelId: number, limit = 50, before?: number): Message[] {
  let query = `${MESSAGE_SELECT} WHERE m.channel_id = ?`;
  const params: (number | undefined)[] = [channelId];

  if (before) {
    query += " AND m.id < ?";
    params.push(before);
  }

  query += " ORDER BY m.created_at DESC LIMIT ?";
  params.push(limit);

  const rows = db.query(query).all(...params) as MessageRow[];
  const messages = rows.map((r) => rowToMessage(r)).reverse();

  // Attach reactions
  const messageIds = messages.map((m) => m.id);
  const reactionsMap = getReactionsForMessages(messageIds);
  for (const msg of messages) {
    msg.reactions = reactionsMap[msg.id] ?? [];
  }

  return messages;
}

export function createMessage(channelId: number, authorId: number, content: string, replyToId?: number): Message | null {
  if (!content.trim()) return null;

  // Verify user is member of channel
  const member = db.query(
    "SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?"
  ).get(channelId, authorId);
  if (!member) return null;

  // Verify reply target exists in same channel
  if (replyToId) {
    const target = db.query("SELECT 1 FROM messages WHERE id = ? AND channel_id = ?").get(replyToId, channelId);
    if (!target) replyToId = undefined;
  }

  const result = db.query(
    "INSERT INTO messages (channel_id, author_id, content, reply_to_id) VALUES (?, ?, ?, ?)"
  ).run(channelId, authorId, content.trim(), replyToId ?? null);

  const row = db.query(`${MESSAGE_SELECT} WHERE m.id = ?`).get(result.lastInsertRowid) as MessageRow;

  const message = rowToMessage(row);
  message.reactions = [];

  // Bump use_count for any custom emojis referenced in the message (pattern :name:)
  const customEmojiPattern = /:([a-zA-Z0-9_]{2,32}):/g;
  let match: RegExpExecArray | null;
  while ((match = customEmojiPattern.exec(content)) !== null) {
    incrementEmojiUseCount(`:${match[1]}:`);
  }

  broadcastToChannel(channelId, { type: "message_create", message });
  return message;
}

export function editMessage(messageId: number, userId: number, content: string): Message | null {
  const existing = db.query("SELECT * FROM messages WHERE id = ?").get(messageId) as any | undefined;
  if (!existing || existing.author_id !== userId) return null;
  if (!content.trim()) return null;

  db.query("UPDATE messages SET content = ?, edited_at = unixepoch() WHERE id = ?").run(content.trim(), messageId);

  const row = db.query(`${MESSAGE_SELECT} WHERE m.id = ?`).get(messageId) as MessageRow;

  const message = rowToMessage(row);
  message.reactions = getReactionsForMessage(messageId);
  broadcastToChannel(message.channel_id, { type: "message_update", message });
  return message;
}

export function deleteMessage(messageId: number, userId: number): boolean {
  const existing = db.query("SELECT * FROM messages WHERE id = ?").get(messageId) as any | undefined;
  if (!existing || existing.author_id !== userId) return false;

  db.query("DELETE FROM messages WHERE id = ?").run(messageId);
  broadcastToChannel(existing.channel_id, {
    type: "message_delete",
    channel_id: existing.channel_id,
    message_id: messageId,
  });
  return true;
}

export function pinMessage(messageId: number, userId: number): Message | null {
  const row = db.query(`${MESSAGE_SELECT} WHERE m.id = ?`).get(messageId) as MessageRow | null;
  if (!row) return null;

  const member = db.query(
    "SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?"
  ).get(row.channel_id, userId);
  if (!member) return null;

  const alreadyPinned = db.query("SELECT 1 FROM pinned_messages WHERE message_id = ?").get(messageId);
  if (alreadyPinned) return rowToMessage(row);

  db.query(
    "INSERT INTO pinned_messages (message_id, channel_id, pinned_by) VALUES (?, ?, ?)"
  ).run(messageId, row.channel_id, userId);

  const message = rowToMessage(row);
  message.reactions = getReactionsForMessage(messageId);
  broadcastToChannel(message.channel_id, { type: "message_pin", message });
  return message;
}

export function unpinMessage(messageId: number, userId: number): boolean {
  const existing = db.query(
    "SELECT pm.*, m.channel_id FROM pinned_messages pm JOIN messages m ON m.id = pm.message_id WHERE pm.message_id = ?"
  ).get(messageId) as { message_id: number; channel_id: number } | null;
  if (!existing) return false;

  const member = db.query(
    "SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?"
  ).get(existing.channel_id, userId);
  if (!member) return false;

  db.query("DELETE FROM pinned_messages WHERE message_id = ?").run(messageId);
  broadcastToChannel(existing.channel_id, {
    type: "message_unpin",
    channel_id: existing.channel_id,
    message_id: messageId,
  });
  return true;
}

export function getPinnedMessages(channelId: number): Message[] {
  const rows = db.query(
    `${MESSAGE_SELECT}
     JOIN pinned_messages pm ON pm.message_id = m.id
     WHERE m.channel_id = ?
     ORDER BY pm.pinned_at DESC`
  ).all(channelId) as MessageRow[];
  const messages = rows.map((r) => rowToMessage(r));
  const messageIds = messages.map((m) => m.id);
  const reactionsMap = getReactionsForMessages(messageIds);
  for (const msg of messages) {
    msg.reactions = reactionsMap[msg.id] ?? [];
  }
  return messages;
}
