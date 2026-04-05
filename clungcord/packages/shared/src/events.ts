import type { User, Message, Channel, Reaction, CustomEmoji } from "./types.ts";

// Server -> Client events
export type ServerEvent =
  | { type: "ready"; user: User; channels: Channel[]; users: User[] }
  | { type: "message_create"; message: Message }
  | { type: "message_update"; message: Message }
  | { type: "message_delete"; channel_id: number; message_id: number }
  | { type: "presence_update"; user_id: number; status: User["status"] }
  | { type: "typing_start"; channel_id: number; user_id: number; username: string }
  | { type: "channel_create"; channel: Channel }
  | { type: "channel_update"; channel: Channel }
  | { type: "channel_delete"; channel_id: number }
  | { type: "member_join"; channel_id: number; user: User }
  | { type: "member_leave"; channel_id: number; user_id: number }
  | { type: "reaction_add"; channel_id: number; message_id: number; emoji: string; user_id: number; reactions: Reaction[] }
  | { type: "reaction_remove"; channel_id: number; message_id: number; emoji: string; user_id: number; reactions: Reaction[] }
  | { type: "message_pin"; message: Message }
  | { type: "message_unpin"; channel_id: number; message_id: number }
  | { type: "error"; message: string };

// Client -> Server events
export type ClientEvent =
  | { type: "auth"; cookie: string }
  | { type: "typing"; channel_id: number }
  | { type: "ping" };
