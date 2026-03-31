// WebSocket protocol types for The Commons game server

// ─── Server → Client ────────────────────────────────────────────────────────

export interface ServerToClientBase {
  type: string;
  seq: number; // Monotonic sequence number for tick ordering
  t: number;   // Server timestamp (ms since epoch)
}

export interface WornPathTile {
  tileX: number;
  tileY: number;
  visitCount: number;
}

export interface TickMessage extends ServerToClientBase {
  type: "tick";
  lastProcessedInput: number; // For client reconciliation
  players: Record<string, PlayerState>; // Filtered to same chunk
  npcs?: NPCState[];                    // Delta: only if changed since last tick
  congress?: { active: boolean };       // Delta: only if changed
  warthog?: WarthogState;               // Delta: only if changed
  serverTime: number;                   // Server wall-clock ms — clients derive day/night from this
  wornPaths?: WornPathTile[];           // On-join only: server-side accumulated worn path counts
}

export type ServerToClientMessage = TickMessage;

// ─── Client → Server ────────────────────────────────────────────────────────

export interface ClientToServerBase {
  type: string;
  seq?: number; // Client input sequence for reconciliation
}

export interface MoveMessage extends ClientToServerBase {
  type: "move";
  seq: number;
  x: number;
  y: number;
  facing: "left" | "right";
  chunkX: number;
  chunkY: number;
}

export interface HopMessage extends ClientToServerBase {
  type: "hop";
}

export interface StatusMessage extends ClientToServerBase {
  type: "status";
  away: boolean;
}

export interface ChunkMessage extends ClientToServerBase {
  type: "chunk";
  chunkX: number;
  chunkY: number;
}

export interface ResyncMessage extends ClientToServerBase {
  type: "resync";
}

export interface WarthogInputMessage extends ClientToServerBase {
  type: "warthog_input";
  dx: number; // -1, 0, 1
  dy: number; // -1, 0, 1
}

export interface WarthogJoinMessage extends ClientToServerBase {
  type: "warthog_join";
}

export interface WarthogLeaveMessage extends ClientToServerBase {
  type: "warthog_leave";
}

export interface WornPathMessage extends ClientToServerBase {
  type: "worn_path";
  tileX: number;
  tileY: number;
  chunkX: number;
  chunkY: number;
}

export type ClientToServerMessage =
  | MoveMessage
  | HopMessage
  | StatusMessage
  | ChunkMessage
  | ResyncMessage
  | WarthogInputMessage
  | WarthogJoinMessage
  | WarthogLeaveMessage
  | WornPathMessage;

// ─── State ──────────────────────────────────────────────────────────────────

export interface PlayerState {
  socketId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  facing: "left" | "right";
  hopFrame: number; // 0-12, 0=not hopping
  isAway: boolean;
  chunkX: number;
  chunkY: number;
  lastSeen: number;             // Timestamp (ms)
  lastProcessedInput: number;   // For reconciliation
}

export interface NPCState {
  name: string;
  x: number;
  y: number;
  facing: "left" | "right";
  vx: number;
  vy: number;
  pattern: string; // Persona-specific movement pattern
  congressTarget?: { x: number; y: number }; // Set during congress mode
  blurb?: string;       // Current speech blurb (cleared after TTL expires server-side)
  blurbTtl?: number;    // Ticks remaining for this blurb (20Hz ticks; not sent to client)
}

export interface WarthogState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: "left" | "right";
  seats: (string | null)[]; // Array of socketIds, length 4, null=empty
}

export interface AuditionWalker {
  id: string;
  x: number;
  y: number;
  speed: number;
  direction: "left" | "right";
  concept: string;
  isPaused: boolean;
}

export interface ChunkData {
  cx: number;
  cy: number;
  tiles: number[][];      // 2D grid of tile types
  walkable: boolean[][];  // Derived from tiles
}

export interface WorldState {
  players: Map<string, PlayerState>; // Key: socketId
  npcs: Map<string, NPCState>;       // Key: name
  warthog: WarthogState;
  walkers: AuditionWalker[];
  congress: { active: boolean };
  chunks: Map<string, ChunkData>;    // Key: `${chunkX}:${chunkY}`
  tickCount: number;
}
