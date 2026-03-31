// network.ts — WebSocket client connecting to /commons-ws
// Applies tick messages to WorldState. Mutates state.

import {
  WorldState, Facing, WarthogState,
} from "./state.ts";
import { initLocalPlayer, reconcile } from "./entities/local-player.ts";
import { addRemotePlayerSnapshot } from "./entities/remote-player.ts";
import { addNPCSnapshot } from "./entities/npc.ts";
import { getChunk } from "./map/chunk.ts";
import { invalidateTileCache } from "./map/renderer.ts";
import { mergeServerWornPaths } from "./map/worn-paths.ts";

const RECONNECT_DELAY_MS = 3000;
const decoder = new TextDecoder();

// Reused across tick messages to avoid per-tick allocations
const _seenIds = new Set<string>();

// Fix 2: move sequencing — reject reconciliation from stale server echoes.
// Only reconcile if the server has processed an input within MOVE_BUFFER_SIZE
// of the current sequence, preventing backward teleports from old ticks.
const MOVE_BUFFER_SIZE = 3;

let ws: WebSocket | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let state: WorldState;

// -- Protocol types ----------------------------------------------------------

interface ServerPlayerData {
  name?: string;
  color?: string;
  x: number;
  y: number;
  facing?: string;
  hopFrame?: number;
  isAway?: boolean;
  chunkX?: number;
  chunkY?: number;
  // legacy names
  chunk_x?: number;
  chunk_y?: number;
  socket_id?: string;
  socketId?: string;
  id?: string;
}

interface ServerNPCData {
  name: string;
  x: number;
  y: number;
  facing?: string;
  hopFrame?: number;
  blurb?: string | null;
}

interface WornPathEntry {
  chunkX: number;
  chunkY: number;
  tileX: number;
  tileY: number;
}

interface ServerTickMessage {
  type: "tick";
  seq?: number;
  t?: number;
  serverTime?: number;
  lastProcessedInput?: number;
  players?: Record<string, ServerPlayerData>;
  npcs?: ServerNPCData[];
  congress?: { active: boolean };
  warthog?: WarthogState;
  wornPaths?: WornPathEntry[];
}

interface ServerWelcomeMessage {
  type: "welcome";
  socket_id?: string;
  socketId?: string;
}

interface ServerLegacyPlayersMessage {
  type: "players";
  t?: number;
  players?: ServerPlayerData[];
}

interface ServerNPCUpdateMessage {
  type: "npc_update";
  t?: number;
  npcs?: ServerNPCData[];
}

interface ServerPlayerHopMessage {
  type: "player_hop";
  socket_id?: string;
  socketId?: string;
}

type ServerMessage =
  | ServerTickMessage
  | ServerWelcomeMessage
  | ServerLegacyPlayersMessage
  | ServerNPCUpdateMessage
  | ServerPlayerHopMessage
  | { type: string };

// -- Outbound helpers -------------------------------------------------------

export function sendMove(state: WorldState): void {
  if (ws?.readyState !== WebSocket.OPEN || !state.localPlayer) return;
  const player = state.localPlayer;
  ws.send(JSON.stringify({
    type: "move",
    seq: player.inputSeq,
    x: player.x,
    y: player.y,
    facing: player.facing,
    chunkX: player.chunkX,
    chunkY: player.chunkY,
  }));
}

export function sendHop(): void {
  if (ws?.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "hop" }));
}

export function sendStatus(away: boolean): void {
  if (ws?.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "status", away }));
}

export function sendChunk(chunkX: number, chunkY: number): void {
  if (ws?.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "chunk", chunkX, chunkY }));
}

export function sendWarthog(type: string, payload?: Record<string, unknown>): void {
  if (ws?.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type, ...payload }));
}

export function sendWornPath(chunkX: number, chunkY: number, tileX: number, tileY: number): void {
  if (ws?.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "worn_path", chunkX, chunkY, tileX, tileY }));
}

// -- Message handling -------------------------------------------------------

function handleWelcome(msg: ServerWelcomeMessage): void {
  state.socketId = msg.socket_id ?? msg.socketId ?? null;
  state.connected = true;
  console.log("[network] welcome, socketId:", state.socketId);

  // Initialize local player if not done yet
  if (!state.localPlayer) {
    initLocalPlayer(state);
  } else if (state.socketId) {
    state.localPlayer.socketId = state.socketId;
  }

  // Load starting chunk
  loadChunk(state, 0, 0);
}

// Offset to convert server wall-clock timestamps (Date.now() ms) to client
// performance.now() ms. Continuously calibrated via EMA over 8 ticks to
// smooth out jitter without locking in a stale first-sample estimate.
const EMA_ALPHA = 0.1;
let serverTimeOffsetEMA: number | null = null;

function serverTsToClientTs(serverTs: number): number {
  const sample = performance.now() - serverTs;
  if (serverTimeOffsetEMA === null) {
    serverTimeOffsetEMA = sample;
  } else {
    serverTimeOffsetEMA = EMA_ALPHA * sample + (1 - EMA_ALPHA) * serverTimeOffsetEMA;
  }
  return serverTs + serverTimeOffsetEMA;
}

function reconcileLocalPlayer(msg: ServerTickMessage, socketId: string, data: ServerPlayerData, now: number): void {
  const CHUNK_TRANSITION_GRACE_MS = 200;
  const recentTransition =
    state.localPlayer &&
    Date.now() - state.localPlayer.chunkTransitionAt < CHUNK_TRANSITION_GRACE_MS;
  const lastProcessed = msg.lastProcessedInput ?? 0;
  const seqGuardPassed =
    !state.localPlayer ||
    lastProcessed >= state.localPlayer.inputSeq - MOVE_BUFFER_SIZE;
  if (state.localPlayer && state.map && !recentTransition && seqGuardPassed) {
    reconcile(
      state.localPlayer,
      data.x, data.y,
      lastProcessed,
      state.map
    );
  }
  void socketId; void now;
}

function upsertRemotePlayer(socketId: string, data: ServerPlayerData, msg: ServerTickMessage, now: number): void {
  let player = state.remotePlayers.get(socketId);
  if (!player) {
    player = {
      socketId,
      name: data.name ?? "unknown",
      color: data.color ?? "#888",
      x: data.x, y: data.y,
      facing: (data.facing ?? "right") as Facing,
      hopFrame: data.hopFrame ?? 0,
      isAway: data.isAway ?? false,
      chunkX: data.chunkX ?? 0,
      chunkY: data.chunkY ?? 0,
      snapshots: [],
      displayX: data.x,
      displayY: data.y,
    };
    state.remotePlayers.set(socketId, player);
  } else {
    player.name = data.name ?? player.name;
    player.color = data.color ?? player.color;
    player.facing = (data.facing ?? player.facing) as Facing;
    player.hopFrame = data.hopFrame ?? player.hopFrame;
    player.isAway = data.isAway ?? player.isAway;
    player.chunkX = data.chunkX ?? player.chunkX;
    player.chunkY = data.chunkY ?? player.chunkY;
  }

  addRemotePlayerSnapshot(player, {
    seq: msg.seq ?? 0,
    t: msg.t != null ? serverTsToClientTs(msg.t) : now,
    x: data.x,
    y: data.y,
    facing: (data.facing ?? "right") as Facing,
  });
}

function updatePlayersFromTick(msg: ServerTickMessage, now: number): void {
  if (!msg.players) return;
  _seenIds.clear();
  for (const [socketId, data] of Object.entries(msg.players)) {
    _seenIds.add(socketId);
    if (socketId === state.socketId) {
      reconcileLocalPlayer(msg, socketId, data, now);
      continue;
    }
    upsertRemotePlayer(socketId, data, msg, now);
  }
  for (const id of state.remotePlayers.keys()) {
    if (!_seenIds.has(id)) state.remotePlayers.delete(id);
  }
}

function updateNPCsFromTick(msg: ServerTickMessage, now: number): void {
  if (!msg.npcs) return;
  const BLURB_DISPLAY_MS = 7500;
  for (const data of msg.npcs) {
    let npc = state.npcs.get(data.name);
    if (!npc) {
      npc = {
        name: data.name,
        x: data.x, y: data.y,
        facing: (data.facing ?? "right") as Facing,
        snapshots: [],
        displayX: data.x,
        displayY: data.y,
      };
      state.npcs.set(data.name, npc);
    } else {
      npc.facing = (data.facing ?? npc.facing) as Facing;
    }

    if ("blurb" in data) {
      if (data.blurb) {
        if (npc.blurb !== data.blurb) {
          npc.blurb = data.blurb;
          npc.blurbExpiry = performance.now() + BLURB_DISPLAY_MS;
        }
      } else {
        npc.blurb = undefined;
        npc.blurbExpiry = undefined;
      }
    }

    addNPCSnapshot(npc, {
      seq: msg.seq ?? 0,
      t: msg.t != null ? serverTsToClientTs(msg.t) : now,
      x: data.x,
      y: data.y,
    });
  }
}

function handleTick(msg: ServerTickMessage): void {
  const now = performance.now();
  state.lastTickSeq = msg.seq ?? 0;
  state.lastTickTime = now;
  state.serverTime = msg.serverTime ?? msg.t ?? Date.now();

  updatePlayersFromTick(msg, now);
  updateNPCsFromTick(msg, now);

  if (msg.congress) {
    state.congress = msg.congress;
  }

  if (msg.warthog) {
    state.warthog = msg.warthog;
  }

  if (msg.wornPaths && Array.isArray(msg.wornPaths)) {
    mergeServerWornPaths(msg.wornPaths);
  }
}

function upsertLegacyPlayer(data: ServerPlayerData, snapT: number): void {
  const socketId = data.socket_id ?? data.socketId ?? data.id;
  if (!socketId) return;
  if (socketId === state.socketId) return;

  let player = state.remotePlayers.get(socketId);
  if (!player) {
    player = {
      socketId,
      name: data.name ?? "unknown",
      color: data.color ?? "#888",
      x: data.x, y: data.y,
      facing: (data.facing ?? "right") as Facing,
      hopFrame: 0,
      isAway: data.isAway ?? false,
      chunkX: data.chunk_x ?? data.chunkX ?? 0,
      chunkY: data.chunk_y ?? data.chunkY ?? 0,
      snapshots: [],
      displayX: data.x,
      displayY: data.y,
    };
    state.remotePlayers.set(socketId, player);
  } else {
    player.facing = (data.facing ?? player.facing) as Facing;
    player.isAway = data.isAway ?? player.isAway;
    player.chunkX = data.chunk_x ?? data.chunkX ?? player.chunkX;
    player.chunkY = data.chunk_y ?? data.chunkY ?? player.chunkY;
  }

  addRemotePlayerSnapshot(player, {
    seq: 0,
    t: snapT,
    x: data.x,
    y: data.y,
    facing: (data.facing ?? "right") as Facing,
  });
}

function handleLegacyPlayers(msg: ServerLegacyPlayersMessage): void {
  // V1 protocol: { type: "players", players: [...] }
  const now = performance.now();
  const snapT = msg.t != null ? serverTsToClientTs(msg.t) : now;
  _seenIds.clear();

  for (const data of (msg.players ?? [])) {
    const socketId = data.socket_id ?? data.socketId ?? data.id;
    if (socketId) _seenIds.add(socketId);
    upsertLegacyPlayer(data, snapT);
  }

  for (const id of state.remotePlayers.keys()) {
    if (!_seenIds.has(id)) state.remotePlayers.delete(id);
  }
}

function handleNPCUpdate(msg: ServerNPCUpdateMessage): void {
  // V1 protocol: { type: "npc_update", npcs: [...] }
  const now = performance.now();
  const snapT = msg.t != null ? serverTsToClientTs(msg.t) : now;
  for (const data of (msg.npcs ?? [])) {
    let npc = state.npcs.get(data.name);
    if (!npc) {
      npc = {
        name: data.name,
        x: data.x, y: data.y,
        facing: (data.facing ?? "right") as Facing,
        snapshots: [],
        displayX: data.x,
        displayY: data.y,
      };
      state.npcs.set(data.name, npc);
    } else {
      npc.facing = (data.facing ?? npc.facing) as Facing;
    }

    addNPCSnapshot(npc, {
      seq: 0,
      t: snapT,
      x: data.x,
      y: data.y,
    });
  }
}

function onMessage(e: MessageEvent): void {
  let msg: ServerMessage;
  try {
    const raw = e.data instanceof ArrayBuffer
      ? decoder.decode(e.data)
      : (e.data as string);
    msg = JSON.parse(raw) as ServerMessage;
  } catch {
    console.warn("[network] failed to parse message:", e.data);
    return;
  }

  switch (msg.type) {
    case "welcome":    handleWelcome(msg as ServerWelcomeMessage); break;
    case "tick":       handleTick(msg as ServerTickMessage); break;
    case "players":    handleLegacyPlayers(msg as ServerLegacyPlayersMessage); break;
    case "npc_update": handleNPCUpdate(msg as ServerNPCUpdateMessage); break;
    case "player_hop": {
      const hopMsg = msg as ServerPlayerHopMessage;
      const id = hopMsg.socket_id ?? hopMsg.socketId;
      if (id) {
        const p = state.remotePlayers.get(id);
        if (p) p.hopFrame = 1;
      }
      break;
    }
    default:
      // Silently ignore unknown message types (warthog_state, etc.)
      break;
  }
}

// -- Connection management --------------------------------------------------

function connect(worldState: WorldState): void {
  state = worldState;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const params = new URLSearchParams({ name: state.playerName, color: state.playerColor });
  // Use injected WS base if available (labs router doesn't proxy WS upgrades)
  const wsBase = (window as unknown as Record<string, string>)["__COMMONS_WS_BASE"] ?? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
  const url = `${wsBase}/commons-ws?${params}`;

  console.log("[network] connecting to", url);
  ws = new WebSocket(url);

  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    console.log("[network] connected");
    state.connected = true;
  };

  ws.onmessage = onMessage;

  ws.onclose = () => {
    console.log("[network] disconnected, reconnecting in", RECONNECT_DELAY_MS, "ms");
    state.connected = false;
    ws = null;
    _reconnectTimer = setTimeout(() => { connect(worldState); }, RECONNECT_DELAY_MS);
  };

  ws.onerror = (err) => {
    console.error("[network] WS error", err);
    // onclose will fire after onerror
  };
}

function loadChunk(worldState: WorldState, cx: number, cy: number): void {
  worldState.map = getChunk(cx, cy);
  worldState.mapChunkX = cx;
  worldState.mapChunkY = cy;
  invalidateTileCache();
}

export function initNetwork(worldState: WorldState): void {
  connect(worldState);

  // Away detection
  document.addEventListener("visibilitychange", () => {
    const away = document.visibilityState === "hidden";
    if (worldState.localPlayer) worldState.localPlayer.isAway = away;
    sendStatus(away);
  });
}
