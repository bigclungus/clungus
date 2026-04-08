// state.ts — WorldState type definitions and mutable singleton
// Only network.ts and local-player.ts may mutate this state directly.
// renderer.ts and all other modules read only.
// Exception: warthog.ts mutates state.seatedInWarthog (server-confirmed seat truth).

export type Facing = "left" | "right";

export interface RemotePlayer {
  socketId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  facing: Facing;
  hopFrame: number;
  isAway: boolean;
  chunkX: number;
  chunkY: number;
  // Interpolation buffer
  snapshots: PlayerSnapshot[];
  // Lerp display position
  displayX: number;
  displayY: number;
}

export interface PlayerSnapshot {
  seq: number;
  t: number;
  x: number;
  y: number;
  facing: Facing;
}

export interface LocalPlayer {
  socketId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  facing: Facing;
  hopFrame: number;
  isAway: boolean;
  chunkX: number;
  chunkY: number;
  // Client-side prediction
  pendingInputs: PendingInput[];
  inputSeq: number;
  // Wall-clock timestamp (Date.now()) of the last chunk transition (used to suppress stale reconciliation)
  chunkTransitionAt: number;
}

export interface PendingInput {
  seq: number;
  dx: number;
  dy: number;
  timestamp: number;
}

export interface NPC {
  name: string;
  x: number;
  y: number;
  facing: Facing;
  hopFrame?: number;
  // Interpolation buffer
  snapshots: NPCSnapshot[];
  displayX: number;
  displayY: number;
  // Speech blurb — set from server, expires client-side
  blurb?: string;
  blurbExpiry?: number; // performance.now() ms when the blurb should disappear
}

export interface NPCSnapshot {
  seq: number;
  t: number;
  x: number;
  y: number;
}

export interface CongressState {
  active: boolean;
  topic?: string;
  debaters?: string[];
}

export interface WarthogState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: Facing;
  seats: (string | null)[]; // socketIds, length 4
}

// Drive input state lives in WorldState so it's not module-level mutable in warthog.ts.
export interface WarthogDriveInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  ePressedOnce: boolean; // one-shot flag, consumed by tickWarthog each frame
}

export interface AuditionWalker {
  id: string;
  name: string;
  title: string;
  traits: string[];
  description: string;
  x: number;
  speed: number;
  paused: boolean;
  created_at: number;
  avatar_color: string;
}

export interface WorldState {
  // Connection
  connected: boolean;
  socketId: string | null;

  // Local player (predicted)
  localPlayer: LocalPlayer | null;

  // Remote players (interpolated)
  remotePlayers: Map<string, RemotePlayer>;

  // NPCs (server-authoritative, interpolated)
  npcs: Map<string, NPC>;

  // Congress
  congress: CongressState;

  // Warthog vehicle (server-authoritative)
  warthog: WarthogState | null;

  // Audition walkers (polled from audition service)
  walkers: AuditionWalker[];

  // Whether the local player is seated in the warthog
  seatedInWarthog: boolean;

  // Drive key state (owned here so warthog.ts has no module-level mutable state)
  warthogDrive: WarthogDriveInput;

  // Last server tick seq
  lastTickSeq: number;
  lastTickTime: number;

  // Server-authoritative wall-clock time (ms since epoch) from last tick.
  // Use this instead of Date.now() for day/night and season calculations.
  serverTime: number;

  // Current chunk map (tile grid ROWS×COLS)
  // Index [row][col], values: 0=grass 1=path 2=water 3=building 4=tree 5=rock 6=fountain
  map: Uint8Array[] | null;
  mapChunkX: number;
  mapChunkY: number;

  // Frame counter (incremented each rAF)
  frame: number;

  // Player name from /api/me (resolved async)
  playerName: string;
  playerColor: string;

  // Mouse position in canvas coordinates (updated on mousemove)
  mouseX: number;
  mouseY: number;
}

export const TILE = 20;
export const CANVAS_W = 1000;
export const CANVAS_H = 700;
export const COLS = Math.floor(CANVAS_W / TILE); // 50
export const ROWS = Math.floor(CANVAS_H / TILE); // 35

export const PLAYER_SPEED = 108; // px/second (1.8 px/frame × 60 fps)

// NPC hit radius — shared between main.ts (drag/click) and renderer.ts (hover detection)
export const NPC_HIT_RADIUS = 14;

// Congress building tile location in chunk (0,0).
// Used by congress-modal.ts (doorway detection) and renderer.ts (label + flag).
// Update if the chunk map layout changes.
export const CONGRESS_BUILDING_COL = 5;  // tile column of the building
export const CONGRESS_BUILDING_LABEL_ROW = 2; // tile row of the name label above the door

// Dungeon entrance tile location in chunk (0,0) — top-right corner.
// Building occupies rows 2–6, cols 40–47. Doorway at col 43.
export const DUNGEON_BUILDING_COL = 43;        // tile column of dungeon doorway
export const DUNGEON_BUILDING_LABEL_ROW = 2;   // tile row of label above dungeon entrance
export const DUNGEON_BUILDING_COL_MIN = 40;    // left edge of dungeon building block
export const DUNGEON_BUILDING_COL_MAX = 47;    // right edge of dungeon building block

// Leaderboard board tile location in chunk (0,0) — between main path and dungeon entrance.
// Placed at col 36, row 10: open grass area, visible from the approach to the dungeon.
export const LEADERBOARD_COL = 36;
export const LEADERBOARD_ROW = 10;
// Proximity radius in tiles — show leaderboard UI when player is within this distance
export const LEADERBOARD_PROXIMITY_TILES = 3;

export const INTERPOLATION_DELAY_MS = 100;
export const SNAPSHOT_BUFFER_SIZE = 8;
export const PENDING_INPUT_CAP = 120;

// Blocking tile types (cannot walk through)
export const BLOCKING_TILES = new Set([2, 3, 4, 5, 6]);

function randomColor(): string {
  const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#e91e63"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function adjAnimalName(): string {
  const adjs = ["swift", "bold", "calm", "deft", "keen", "lithe", "nimble", "quick"];
  const animals = ["fox", "owl", "deer", "lynx", "crow", "hare", "hawk", "wolf"];
  return adjs[Math.floor(Math.random() * adjs.length)] + "-" + animals[Math.floor(Math.random() * animals.length)];
}

export function createWorldState(): WorldState {
  return {
    connected: false,
    socketId: null,
    localPlayer: null,
    remotePlayers: new Map(),
    npcs: new Map(),
    congress: { active: false },
    warthog: null,
    walkers: [],
    seatedInWarthog: false,
    warthogDrive: { left: false, right: false, up: false, down: false, ePressedOnce: false },
    lastTickSeq: 0,
    lastTickTime: 0,
    serverTime: 0,
    map: null,
    mapChunkX: 0,
    mapChunkY: 0,
    frame: 0,
    playerName: adjAnimalName(),
    playerColor: randomColor(),
    mouseX: -1,
    mouseY: -1,
  };
}
