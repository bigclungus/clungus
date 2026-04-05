import type { Channel, Message, User, Reaction, CustomEmoji } from "@clungcord/shared";
import type { ServerEvent } from "@clungcord/shared";

// Derive base path from where the app is mounted (e.g. "/chat" when served at clung.us/chat)
export const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

/** Resolve an emoji URL (which may be server-relative like /api/emojis/img/x.png) to include the app base path */
export function resolveEmojiUrl(url: string): string {
  if (url.startsWith("/") && !url.startsWith(BASE + "/")) {
    return BASE + url;
  }
  return url;
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...opts?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Auth
export const checkAuth = () => request<{ authenticated: boolean; user?: User }>(`/auth/check`);

// Users
export const getMe = () => request<User>("/api/me");
export const getUsers = () => request<User[]>("/api/users");

// Channels
export const getMyChannels = () => request<Channel[]>("/api/channels/mine");
export const getAllChannels = () => request<Channel[]>("/api/channels");
export const createChannel = (name: string) => request<Channel>("/api/channels", { method: "POST", body: JSON.stringify({ name }) });
export const renameChannel = (id: number, name: string) => request<Channel>(`/api/channels/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
export const deleteChannel = (id: number) => request<{ ok: boolean }>(`/api/channels/${id}`, { method: "DELETE" });
export const joinChannel = (id: number) => request<{ ok: boolean }>(`/api/channels/${id}/join`, { method: "POST" });
export const leaveChannel = (id: number) => request<{ ok: boolean }>(`/api/channels/${id}/leave`, { method: "POST" });
export const getChannelMembers = (id: number) => request<User[]>(`/api/channels/${id}/members`);

// Messages
export const getMessages = (channelId: number, limit = 50, before?: number) => {
  let path = `/api/channels/${channelId}/messages?limit=${limit}`;
  if (before) path += `&before=${before}`;
  return request<Message[]>(path);
};
export const sendMessage = (channelId: number, content: string, replyToId?: number) =>
  request<Message>(`/api/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content, reply_to_id: replyToId }) });
export const editMessage = (id: number, content: string) =>
  request<Message>(`/api/messages/${id}`, { method: "PATCH", body: JSON.stringify({ content }) });
export const deleteMessage = (id: number) =>
  request<{ ok: boolean }>(`/api/messages/${id}`, { method: "DELETE" });

// Pins
export const pinMessage = (id: number) =>
  request<Message>(`/api/messages/${id}/pin`, { method: "POST" });
export const unpinMessage = (id: number) =>
  request<{ ok: boolean }>(`/api/messages/${id}/pin`, { method: "DELETE" });
export const getPinnedMessages = (channelId: number) =>
  request<Message[]>(`/api/channels/${channelId}/pins`);

// DMs
export const createDM = (userId: number) => request<Channel>("/api/dm", { method: "POST", body: JSON.stringify({ user_id: userId }) });

// Reactions
export const addReaction = (messageId: number, emoji: string) =>
  request<{ reactions: Reaction[] }>(`/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: "PUT" });
export const removeReaction = (messageId: number, emoji: string) =>
  request<{ reactions: Reaction[] }>(`/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: "DELETE" });

// Custom Emojis
export const getCustomEmojis = () => request<CustomEmoji[]>("/api/emojis");
export const uploadCustomEmoji = (name: string, url: string) =>
  request<CustomEmoji>("/api/emojis", { method: "POST", body: JSON.stringify({ name, url }) });
export const deleteCustomEmoji = (id: number) =>
  request<{ ok: boolean }>(`/api/emojis/${id}`, { method: "DELETE" });

// emoji.gg
export interface EmojiGGResult {
  title: string;
  slug: string;
  image: string;
  faves: number;
}
export const getEmojiGGTrending = () => request<EmojiGGResult[]>("/api/emojis/emojigg/trending");
export const searchEmojiGG = (q: string) => request<EmojiGGResult[]>(`/api/emojis/emojigg/search?q=${encodeURIComponent(q)}`);

// WebSocket
export type WSEventHandler = (event: ServerEvent) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: WSEventHandler[] = [];
  private reconnectTimer: number | null = null;
  private reconnectDelay = 1000;

  connect(): void {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}${BASE}/ws`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      // Send auth with cookie (cookie is sent automatically, but we also send it in the message)
      this.ws?.send(JSON.stringify({ type: "auth", cookie: document.cookie }));
    };

    this.ws.onmessage = async (e) => {
      try {
        // Data may arrive as Blob (binary frame) or string (text frame)
        const raw = e.data instanceof Blob ? await e.data.text() : e.data;
        const event = JSON.parse(raw) as ServerEvent;
        for (const handler of this.handlers) {
          handler(event);
        }
      } catch (err) {
        console.error("[ws] failed to parse message:", err);
      }
    };

    this.ws.onclose = () => {
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      this.connect();
    }, this.reconnectDelay);
  }

  onEvent(handler: WSEventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  sendTyping(channelId: number): void {
    this.ws?.send(JSON.stringify({ type: "typing", channel_id: channelId }));
  }

  close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
  }
}
