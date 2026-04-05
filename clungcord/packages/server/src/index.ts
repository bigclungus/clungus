import { type Server } from "bun";
import { authenticateRequest, ensureUser } from "./auth.ts";
import { wsHandler, type WSData } from "./ws.ts";
import * as channelRoutes from "./routes/channels.ts";
import * as messageRoutes from "./routes/messages.ts";
import * as userRoutes from "./routes/users.ts";
import * as reactionRoutes from "./routes/reactions.ts";
import * as emojiRoutes from "./routes/emojis.ts";
import type { User } from "@clungcord/shared";
import path from "node:path";
import { existsSync } from "node:fs";

const PORT = parseInt(process.env.PORT ?? "8120", 10);
const STATIC_DIR = path.join(import.meta.dir, "../../client/dist");

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function getUser(req: Request): User | null {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const username = authenticateRequest(cookieHeader);
  if (!username) return null;
  return ensureUser(username);
}

async function handleAPI(req: Request, url: URL): Promise<Response> {
  const user = getUser(req);
  if (!user) return err("Unauthorized", 401);

  const method = req.method;
  const segments = url.pathname.replace("/api/", "").split("/").filter(Boolean);

  // GET /api/me
  if (method === "GET" && segments[0] === "me") {
    return json(user);
  }

  // GET /api/users
  if (method === "GET" && segments[0] === "users") {
    return json(userRoutes.getAllUsers());
  }

  // PATCH /api/users/me
  if (method === "PATCH" && segments[0] === "users" && segments[1] === "me") {
    const body = await req.json() as { display_name?: string };
    if (body.display_name !== undefined) {
      const updated = userRoutes.updateDisplayName(user.id, body.display_name);
      return json(updated);
    }
    return err("Nothing to update");
  }

  // GET /api/channels - all joinable channels
  if (method === "GET" && segments[0] === "channels" && !segments[1]) {
    return json(channelRoutes.getAllChannels());
  }

  // POST /api/channels
  if (method === "POST" && segments[0] === "channels" && !segments[1]) {
    const body = await req.json() as { name?: string };
    if (!body.name?.trim()) return err("Channel name required");
    const channel = channelRoutes.createChannel(body.name.trim(), user.id);
    return json(channel, 201);
  }

  // GET /api/channels/mine - channels I'm in
  if (method === "GET" && segments[0] === "channels" && segments[1] === "mine") {
    return json(channelRoutes.listChannels(user.id));
  }

  // PATCH /api/channels/:id
  if (method === "PATCH" && segments[0] === "channels" && segments[1]) {
    const channelId = parseInt(segments[1], 10);
    const body = await req.json() as { name?: string };
    if (!body.name?.trim()) return err("Channel name required");
    const channel = channelRoutes.renameChannel(channelId, body.name.trim());
    if (!channel) return err("Channel not found", 404);
    return json(channel);
  }

  // DELETE /api/channels/:id
  if (method === "DELETE" && segments[0] === "channels" && segments[1]) {
    const channelId = parseInt(segments[1], 10);
    if (!channelRoutes.deleteChannel(channelId)) return err("Cannot delete channel", 400);
    return json({ ok: true });
  }

  // POST /api/channels/:id/join
  if (method === "POST" && segments[0] === "channels" && segments[2] === "join") {
    const channelId = parseInt(segments[1], 10);
    if (!channelRoutes.joinChannel(channelId, user.id)) return err("Cannot join channel", 400);
    return json({ ok: true });
  }

  // POST /api/channels/:id/leave
  if (method === "POST" && segments[0] === "channels" && segments[2] === "leave") {
    const channelId = parseInt(segments[1], 10);
    if (!channelRoutes.leaveChannel(channelId, user.id)) return err("Cannot leave channel", 400);
    return json({ ok: true });
  }

  // GET /api/channels/:id/members
  if (method === "GET" && segments[0] === "channels" && segments[2] === "members") {
    const channelId = parseInt(segments[1], 10);
    return json(channelRoutes.getChannelMembers(channelId));
  }

  // GET /api/channels/:id/messages
  if (method === "GET" && segments[0] === "channels" && segments[2] === "messages") {
    const channelId = parseInt(segments[1], 10);
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const before = url.searchParams.get("before") ? parseInt(url.searchParams.get("before")!, 10) : undefined;
    return json(messageRoutes.getMessages(channelId, limit, before));
  }

  // GET /api/channels/:id/pins
  if (method === "GET" && segments[0] === "channels" && segments[2] === "pins") {
    const channelId = parseInt(segments[1], 10);
    return json(messageRoutes.getPinnedMessages(channelId));
  }

  // POST /api/channels/:id/messages
  if (method === "POST" && segments[0] === "channels" && segments[2] === "messages") {
    const channelId = parseInt(segments[1], 10);
    const body = await req.json() as { content?: string; reply_to_id?: number };
    if (!body.content?.trim()) return err("Message content required");
    const message = messageRoutes.createMessage(channelId, user.id, body.content, body.reply_to_id);
    if (!message) return err("Cannot send message (not a member?)", 403);
    return json(message, 201);
  }

  // PATCH /api/messages/:id
  if (method === "PATCH" && segments[0] === "messages" && segments[1]) {
    const messageId = parseInt(segments[1], 10);
    const body = await req.json() as { content?: string };
    if (!body.content?.trim()) return err("Message content required");
    const message = messageRoutes.editMessage(messageId, user.id, body.content);
    if (!message) return err("Cannot edit message", 403);
    return json(message);
  }

  // DELETE /api/messages/:id
  if (method === "DELETE" && segments[0] === "messages" && segments[1] && segments[2] !== "reactions") {
    const messageId = parseInt(segments[1], 10);
    if (!messageRoutes.deleteMessage(messageId, user.id)) return err("Cannot delete message", 403);
    return json({ ok: true });
  }

  // POST /api/messages/:id/pin
  if (method === "POST" && segments[0] === "messages" && segments[2] === "pin") {
    const messageId = parseInt(segments[1], 10);
    const message = messageRoutes.pinMessage(messageId, user.id);
    if (!message) return err("Cannot pin message", 403);
    return json(message);
  }

  // DELETE /api/messages/:id/pin
  if (method === "DELETE" && segments[0] === "messages" && segments[2] === "pin") {
    const messageId = parseInt(segments[1], 10);
    if (!messageRoutes.unpinMessage(messageId, user.id)) return err("Cannot unpin message", 403);
    return json({ ok: true });
  }

  // POST /api/dm
  if (method === "POST" && segments[0] === "dm") {
    const body = await req.json() as { user_id?: number };
    if (!body.user_id) return err("user_id required");
    const channel = channelRoutes.createDM(user.id, body.user_id);
    return json(channel, 201);
  }

  // PUT /api/messages/:id/reactions/:emoji — add reaction
  if (method === "PUT" && segments[0] === "messages" && segments[2] === "reactions" && segments[3]) {
    const messageId = parseInt(segments[1], 10);
    const emoji = decodeURIComponent(segments[3]);
    const reactions = reactionRoutes.addReaction(messageId, user.id, emoji);
    if (!reactions) return err("Message not found", 404);
    return json({ reactions });
  }

  // DELETE /api/messages/:id/reactions/:emoji — remove reaction
  if (method === "DELETE" && segments[0] === "messages" && segments[2] === "reactions" && segments[3]) {
    const messageId = parseInt(segments[1], 10);
    const emoji = decodeURIComponent(segments[3]);
    const reactions = reactionRoutes.removeReaction(messageId, user.id, emoji);
    if (!reactions) return err("Message not found", 404);
    return json({ reactions });
  }

  // GET /api/emojis/emojigg/trending — top 20 trending from emoji.gg
  if (method === "GET" && segments[0] === "emojis" && segments[1] === "emojigg" && segments[2] === "trending") {
    try {
      const trending = await emojiRoutes.getEmojiGGTrending();
      return json(trending);
    } catch (e: any) {
      return err(e.message ?? "Failed to fetch emoji.gg trending", 502);
    }
  }

  // GET /api/emojis/emojigg/search?q=<query> — search emoji.gg
  if (method === "GET" && segments[0] === "emojis" && segments[1] === "emojigg" && segments[2] === "search") {
    const q = url.searchParams.get("q") ?? "";
    if (!q.trim()) return err("Query parameter 'q' required");
    try {
      const results = await emojiRoutes.searchEmojiGG(q.trim());
      return json(results);
    } catch (e: any) {
      return err(e.message ?? "Failed to search emoji.gg", 502);
    }
  }

  // GET /api/emojis — list custom emojis
  if (method === "GET" && segments[0] === "emojis" && !segments[1]) {
    return json(emojiRoutes.listEmojis());
  }

  // POST /api/emojis — upload custom emoji
  if (method === "POST" && segments[0] === "emojis" && !segments[1]) {
    const body = await req.json() as { name?: string; url?: string };
    if (!body.name?.trim() || !body.url?.trim()) return err("name and url required");
    try {
      const emoji = await emojiRoutes.createEmoji(body.name.trim(), body.url.trim(), user.id);
      if (!emoji) return err("Invalid name or name already taken", 400);
      return json(emoji, 201);
    } catch (e: any) {
      return err(e.message ?? "Failed to upload emoji", 400);
    }
  }

  // DELETE /api/emojis/:id — delete custom emoji
  if (method === "DELETE" && segments[0] === "emojis" && segments[1]) {
    const emojiId = parseInt(segments[1], 10);
    if (!emojiRoutes.deleteEmoji(emojiId, user.id)) return err("Cannot delete emoji", 403);
    return json({ ok: true });
  }

  return err("Not found", 404);
}

const server = Bun.serve<WSData>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade — authenticate from the HTTP cookie header
    if (url.pathname === "/ws") {
      const cookieHeader = req.headers.get("cookie") ?? "";
      const username = authenticateRequest(cookieHeader);
      const user = username ? ensureUser(username) : null;
      const upgraded = server.upgrade(req, {
        data: { user, alive: true },
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Serve emoji images (before auth-gated API routes)
    if (url.pathname.startsWith("/api/emojis/img/")) {
      const filename = url.pathname.replace("/api/emojis/img/", "");
      const filePath = path.join(emojiRoutes.getEmojiDir(), filename);
      if (existsSync(filePath)) {
        return new Response(Bun.file(filePath));
      }
      return new Response("Not found", { status: 404 });
    }

    // API routes
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleAPI(req, url);
      } catch (e) {
        console.error("[api error]", e);
        return err("Internal server error", 500);
      }
    }

    // Auth check page
    if (url.pathname === "/auth/check") {
      const user = getUser(req);
      if (user) return json({ authenticated: true, user });
      return json({ authenticated: false }, 401);
    }

    // Serve static SPA files
    if (existsSync(STATIC_DIR)) {
      let filePath = path.join(STATIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
      if (existsSync(filePath)) {
        return new Response(Bun.file(filePath));
      }
      // SPA fallback
      const indexPath = path.join(STATIC_DIR, "index.html");
      if (existsSync(indexPath)) {
        return new Response(Bun.file(indexPath));
      }
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: wsHandler,
});

console.log(`[clungcord] server running on port ${PORT}`);
