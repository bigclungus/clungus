import type { ServerWebSocket } from "bun";
import type { ServerEvent, ClientEvent, User } from "@clungcord/shared";
import { authenticateRequest, ensureUser } from "./auth.ts";
import db from "./db.ts";

export interface WSData {
  user: User | null;
  alive: boolean;
}

// Track connected clients: user_id -> Set<ws>
const clients = new Map<number, Set<ServerWebSocket<WSData>>>();
// Track typing state: channel_id -> Map<user_id, timeout>
const typingTimers = new Map<number, Map<number, Timer>>();

export function getOnlineUserIds(): number[] {
  return [...clients.keys()];
}

export function broadcast(event: ServerEvent, excludeUserId?: number): void {
  const data = JSON.stringify(event);
  for (const [userId, sockets] of clients) {
    if (userId === excludeUserId) continue;
    for (const ws of sockets) {
      ws.send(data);
    }
  }
}

export function broadcastToChannel(channelId: number, event: ServerEvent, excludeUserId?: number): void {
  const members = db.query("SELECT user_id FROM channel_members WHERE channel_id = ?").all(channelId) as { user_id: number }[];
  const memberIds = new Set(members.map((m) => m.user_id));
  const data = JSON.stringify(event);

  for (const [userId, sockets] of clients) {
    if (userId === excludeUserId) continue;
    if (!memberIds.has(userId)) continue;
    for (const ws of sockets) {
      ws.send(data);
    }
  }
}

export function sendTo(userId: number, event: ServerEvent): void {
  const sockets = clients.get(userId);
  if (!sockets) return;
  const data = JSON.stringify(event);
  for (const ws of sockets) {
    ws.send(data);
  }
}

function handleAuth(ws: ServerWebSocket<WSData>, cookieHeader: string): void {
  // Already authenticated during upgrade? Skip.
  if (ws.data.user) return;

  const username = authenticateRequest(cookieHeader);
  if (!username) {
    ws.send(JSON.stringify({ type: "error", message: "Authentication failed" }));
    ws.close(4001, "Unauthorized");
    return;
  }

  const user = ensureUser(username);
  ws.data.user = user;
  registerClient(ws);
}

function handleTyping(ws: ServerWebSocket<WSData>, channelId: number): void {
  const user = ws.data.user;
  if (!user) return;

  // Clear existing timer
  if (!typingTimers.has(channelId)) {
    typingTimers.set(channelId, new Map());
  }
  const channelTimers = typingTimers.get(channelId)!;
  const existing = channelTimers.get(user.id);
  if (existing) clearTimeout(existing);

  // Broadcast typing to channel members
  broadcastToChannel(channelId, {
    type: "typing_start",
    channel_id: channelId,
    user_id: user.id,
    username: user.username,
  }, user.id);

  // Auto-clear after 5s
  channelTimers.set(user.id, setTimeout(() => {
    channelTimers.delete(user.id);
  }, 5000));
}

function registerClient(ws: ServerWebSocket<WSData>): void {
  const user = ws.data.user;
  if (!user) return;

  if (!clients.has(user.id)) {
    clients.set(user.id, new Set());
  }
  clients.get(user.id)!.add(ws);

  // Broadcast presence
  broadcast({ type: "presence_update", user_id: user.id, status: "online" }, user.id);

  // Send ready event with current state
  const channels = db.query(
    `SELECT c.* FROM channels c
     JOIN channel_members cm ON cm.channel_id = c.id
     WHERE cm.user_id = ?
     ORDER BY c.created_at`
  ).all(user.id) as any[];

  const users = db.query("SELECT * FROM users").all() as User[];

  ws.send(JSON.stringify({
    type: "ready",
    user,
    channels,
    users,
  }));
}

export const wsHandler = {
  open(ws: ServerWebSocket<WSData>) {
    ws.data.alive = true;
    // If user was authenticated during HTTP upgrade, register immediately
    if (ws.data.user) {
      registerClient(ws);
    }
  },

  message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    let event: ClientEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    switch (event.type) {
      case "auth":
        handleAuth(ws, event.cookie);
        break;
      case "typing":
        handleTyping(ws, event.channel_id);
        break;
      case "ping":
        ws.data.alive = true;
        ws.send(JSON.stringify({ type: "pong" }));
        break;
    }
  },

  close(ws: ServerWebSocket<WSData>) {
    const user = ws.data.user;
    if (!user) return;

    const sockets = clients.get(user.id);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        clients.delete(user.id);
        // Mark offline
        db.query("UPDATE users SET status = 'offline', last_seen = unixepoch() WHERE id = ?").run(user.id);
        broadcast({ type: "presence_update", user_id: user.id, status: "offline" });
      }
    }
  },
};
