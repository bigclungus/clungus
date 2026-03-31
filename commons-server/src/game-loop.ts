// 20Hz game loop — authoritative tick, NPC updates, delta broadcast, persistence

import type {
  WorldState,
  PlayerState,
  NPCState,
  AuditionWalker,
  WarthogState,
  TickMessage,
  ClientToServerMessage,
  MoveMessage,
  WarthogInputMessage,
  WarthogJoinMessage,
  WarthogLeaveMessage,
} from "./protocol.ts";
import { tickNpcs } from "./npc-ai.ts";
import { persistState } from "./persistence.ts";
import { isPixelWalkable } from "./map.ts";

// Max distance a player can move per server tick in tile coords
// Client moves ~1.8px/frame at 60fps, TILE=20px → ~5.4px/frame → ~0.27 tiles/frame
// At 20Hz server tick: 60/20 = 3 frames per tick → ~0.81 tiles/tick, × 3 tolerance = ~2.5
// Using 5 to be generous for lag/burst
const MAX_MOVE_PER_TICK = 20; // pixels — V2 client moves at ~1.8px/frame, 20Hz tick = up to ~9px/tick; allow extra for lag

// Stale player eviction threshold
const STALE_THRESHOLD = 60 * 1000; // 60s

// ─── Warthog ─────────────────────────────────────────────────────────────────

export function tickWarthog(warthog: WarthogState, players: Map<string, PlayerState>): void {
  warthog.x += warthog.vx;
  warthog.y += warthog.vy;
  warthog.facing = warthog.vx > 0 ? "right" : warthog.vx < 0 ? "left" : warthog.facing;

  // Clamp warthog to canvas bounds roughly
  warthog.x = Math.max(0, Math.min(800, warthog.x));
  warthog.y = Math.max(0, Math.min(600, warthog.y));

  // Move seated players with warthog
  for (const seatId of warthog.seats) {
    if (seatId) {
      const player = players.get(seatId);
      if (player) {
        player.x = warthog.x;
        player.y = warthog.y;
      }
    }
  }
}

export function handleWarthogMessage(
  socketId: string,
  msg: WarthogInputMessage | WarthogJoinMessage | WarthogLeaveMessage,
  world: WorldState
): void {
  const player = world.players.get(socketId);
  if (!player) return;

  if (msg.type === "warthog_input") {
    // Only driver (seat 0) controls
    if (world.warthog.seats[0] === socketId) {
      world.warthog.vx = msg.dx * 2;
      world.warthog.vy = msg.dy * 2;
    }
  } else if (msg.type === "warthog_join") {
    const dist = Math.sqrt((player.x - world.warthog.x) ** 2 + (player.y - world.warthog.y) ** 2);
    if (dist < 60) {
      const emptySeat = world.warthog.seats.findIndex((s) => s === null);
      if (emptySeat >= 0) {
        world.warthog.seats[emptySeat] = socketId;
      }
    }
  } else {
    // warthog_leave
    const seatIndex = world.warthog.seats.indexOf(socketId);
    if (seatIndex >= 0) {
      world.warthog.seats[seatIndex] = null;
    }
  }
}

// ─── Audition walkers ────────────────────────────────────────────────────────

export function tickWalkers(walkers: AuditionWalker[]): void {
  for (const walker of walkers) {
    if (walker.isPaused) continue;
    walker.x += walker.speed * (walker.direction === "right" ? 1 : -1);
    if (walker.x < 0 || walker.x > 800) {
      walker.direction = walker.direction === "right" ? "left" : "right";
    }
  }
}

export async function handleWalkerInteraction(
  walkerId: string,
  action: "keep" | "dismiss",
  world: WorldState
): Promise<void> {
  const walker = world.walkers.find((w) => w.id === walkerId);
  if (!walker) return;

  if (action === "keep") {
    await Bun.write(`candidates/${walkerId}.json`, JSON.stringify({ concept: walker.concept, id: walkerId }));
  }
  world.walkers = world.walkers.filter((w) => w.id !== walkerId);
}

// ─── Player validation ───────────────────────────────────────────────────────

function validateAndApplyMove(player: PlayerState, msg: MoveMessage, world: WorldState): void {
  // Client sends pixel coordinates (x, y) — validate distance and check tile collision
  const dx = msg.x - player.x;
  const dy = msg.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  let newX: number;
  let newY: number;

  if (dist > MAX_MOVE_PER_TICK) {
    // Clamp to max speed
    const scale = MAX_MOVE_PER_TICK / dist;
    newX = player.x + dx * scale;
    newY = player.y + dy * scale;
  } else {
    newX = msg.x;
    newY = msg.y;
  }

  // Server-side tile collision — dimensions match client (50×35 @ 20px)
  const chunkKey = `${String(msg.chunkX)}:${String(msg.chunkY)}`;
  const chunk = world.chunks.get(chunkKey);
  if (chunk) {
    // Check all four corners of the player hitbox (12×12, centered) — matches client isBlocked
    const hw = 6, hh = 6;
    const corners: [number, number][] = [
      [newX - hw, newY - hh], [newX + hw - 1, newY - hh],
      [newX - hw, newY + hh - 1], [newX + hw - 1, newY + hh - 1],
    ];
    const blocked = corners.some(([cx, cy]) => !isPixelWalkable(cx, cy, chunk));

    if (blocked) {
      // Try horizontal only
      const cornersH: [number, number][] = [
        [newX - hw, player.y - hh], [newX + hw - 1, player.y - hh],
        [newX - hw, player.y + hh - 1], [newX + hw - 1, player.y + hh - 1],
      ];
      const blockedH = cornersH.some(([cx, cy]) => !isPixelWalkable(cx, cy, chunk));

      if (!blockedH) {
        newX = newX;
        newY = player.y;
      } else {
        // Try vertical only
        const cornersV: [number, number][] = [
          [player.x - hw, newY - hh], [player.x + hw - 1, newY - hh],
          [player.x - hw, newY + hh - 1], [player.x + hw - 1, newY + hh - 1],
        ];
        const blockedV = cornersV.some(([cx, cy]) => !isPixelWalkable(cx, cy, chunk));

        if (!blockedV) {
          newX = player.x;
          newY = newY;
        } else {
          // Fully blocked — reject move, keep current position
          newX = player.x;
          newY = player.y;
        }
      }
    }
  }

  player.x = newX;
  player.y = newY;
  player.facing = msg.facing;
  player.chunkX = msg.chunkX;
  player.chunkY = msg.chunkY;
  player.lastProcessedInput = msg.seq;
}

// ─── Client message dispatcher ───────────────────────────────────────────────

export type ChunkSubscriptionCallback = (
  socketId: string,
  oldChunkX: number,
  oldChunkY: number,
  newChunkX: number,
  newChunkY: number
) => void;

export type ForceSyncCallback = (socketId: string) => void;

let chunkSubscriptionCb: ChunkSubscriptionCallback | null = null;
let forceSyncCb: ForceSyncCallback | null = null;

export function setChunkSubscriptionCallback(cb: ChunkSubscriptionCallback): void {
  chunkSubscriptionCb = cb;
}

export function setForceSyncCallback(cb: ForceSyncCallback): void {
  forceSyncCb = cb;
}

function handleMoveMessage(socketId: string, player: PlayerState, msg: Extract<ClientToServerMessage, { type: "move" }>, world: WorldState): void {
  const oldChunkX = player.chunkX;
  const oldChunkY = player.chunkY;
  validateAndApplyMove(player, msg, world);
  if (player.chunkX !== oldChunkX || player.chunkY !== oldChunkY) {
    chunkSubscriptionCb?.(socketId, oldChunkX, oldChunkY, player.chunkX, player.chunkY);
  }
}

function handleChunkMessage(socketId: string, player: PlayerState, msg: Extract<ClientToServerMessage, { type: "chunk" }>): void {
  const oldChunkX = player.chunkX;
  const oldChunkY = player.chunkY;
  player.chunkX = msg.chunkX;
  player.chunkY = msg.chunkY;
  if (player.chunkX !== oldChunkX || player.chunkY !== oldChunkY) {
    chunkSubscriptionCb?.(socketId, oldChunkX, oldChunkY, player.chunkX, player.chunkY);
  }
}

function isWarthogMessage(msg: ClientToServerMessage): msg is WarthogInputMessage | WarthogJoinMessage | WarthogLeaveMessage {
  return msg.type === "warthog_input" || msg.type === "warthog_join" || msg.type === "warthog_leave";
}

function dispatchSimpleMsg(socketId: string, player: PlayerState, msg: ClientToServerMessage): boolean {
  if (msg.type === "hop") { player.hopFrame = 1; return true; }
  if (msg.type === "status") { player.isAway = msg.away; return true; }
  if (msg.type === "resync") { forceSyncCb?.(socketId); return true; }
  return false;
}

function dispatchClientMsg(socketId: string, player: PlayerState, msg: ClientToServerMessage, world: WorldState): void {
  if (msg.type === "move") { handleMoveMessage(socketId, player, msg, world); return; }
  if (msg.type === "chunk") { handleChunkMessage(socketId, player, msg); return; }
  if (dispatchSimpleMsg(socketId, player, msg)) return;
  if (isWarthogMessage(msg)) handleWarthogMessage(socketId, msg, world);
  // worn_path is handled separately (async SQLite write)
}

export function handleClientMessage(
  socketId: string,
  msg: ClientToServerMessage,
  world: WorldState
): void {
  const player = world.players.get(socketId);
  if (player) dispatchClientMsg(socketId, player, msg, world);
}

// ─── Stale player eviction ───────────────────────────────────────────────────

export function evictStalePlayers(world: WorldState, now: number): void {
  for (const [socketId, player] of world.players) {
    if (now - player.lastSeen > STALE_THRESHOLD) {
      world.players.delete(socketId);
      console.log(`[game-loop] Evicted stale player ${player.name} (${socketId})`);
    }
  }
}

// ─── Delta snapshot logic ────────────────────────────────────────────────────

// Per-chunk last-sent NPC/congress/warthog state for delta diffing
const lastSentState = new Map<
  string,
  { npcs: NPCState[]; congress: { active: boolean }; warthog: WarthogState }
>();

function hasNpcsChanged(current: Map<string, NPCState>, last: NPCState[]): boolean {
  const currArray = Array.from(current.values());
  if (currArray.length !== last.length) return true;
  for (let i = 0; i < currArray.length; i++) {
    const c = currArray[i];
    const l = last[i];
    if (c.x !== l.x || c.y !== l.y || c.facing !== l.facing || c.blurb !== l.blurb) return true;
  }
  return false;
}

function hasWarthogChanged(current: WarthogState, last: WarthogState): boolean {
  return (
    current.x !== last.x ||
    current.y !== last.y ||
    current.vx !== last.vx ||
    current.vy !== last.vy ||
    current.facing !== last.facing ||
    JSON.stringify(current.seats) !== JSON.stringify(last.seats)
  );
}

export function buildTickPayload(
  world: WorldState,
  chunkKey: string,
  chunkPlayers: PlayerState[],
  seq: number,
  now: number
): TickMessage {
  const last = lastSentState.get(chunkKey) ?? {
    npcs: [],
    congress: { active: false },
    warthog: { ...world.warthog, seats: [...world.warthog.seats] },
  };

  const payload: TickMessage = {
    type: "tick",
    seq,
    t: now,
    serverTime: now,
    lastProcessedInput: chunkPlayers[0]?.lastProcessedInput ?? 0,
    players: Object.fromEntries(chunkPlayers.map((p) => [p.socketId, p])),
  };

  if (hasNpcsChanged(world.npcs, last.npcs)) {
    payload.npcs = Array.from(world.npcs.values());
    last.npcs = payload.npcs.map((n) => ({ ...n }));
  }
  if (world.congress.active !== last.congress.active) {
    payload.congress = { active: world.congress.active };
    last.congress = { active: world.congress.active };
  }
  if (hasWarthogChanged(world.warthog, last.warthog)) {
    payload.warthog = { ...world.warthog, seats: [...world.warthog.seats] };
    last.warthog = { ...world.warthog, seats: [...world.warthog.seats] };
  }

  lastSentState.set(chunkKey, last);
  return payload;
}

// ─── Hop frame advancement ───────────────────────────────────────────────────

export function tickHopFrames(world: WorldState): void {
  for (const player of world.players.values()) {
    if (player.hopFrame > 0) {
      player.hopFrame++;
      if (player.hopFrame > 12) player.hopFrame = 0;
    }
  }
}

// ─── Main tick ───────────────────────────────────────────────────────────────

export type BroadcastFn = (chunkX: number, chunkY: number, payload: string) => void;

export function runTick(world: WorldState, broadcast: BroadcastFn): void {
  world.tickCount++;
  const now = Date.now();

  // 1. Evict stale players
  evictStalePlayers(world, now);

  // 2. Update hop frames
  tickHopFrames(world);

  // 3. Update NPCs (tile-aware)
  tickNpcs(world.npcs, world.chunks, world.congress.active);

  // 4. Update Warthog
  tickWarthog(world.warthog, world.players);

  // 5. Update audition walkers
  tickWalkers(world.walkers);

  // 6. Broadcast tick to each chunk group
  const chunkGroups = groupPlayersByChunk(world.players);
  for (const [chunkKey, players] of chunkGroups) {
    const [chunkX, chunkY] = chunkKey.split(":").map(Number);
    const payload = buildTickPayload(world, chunkKey, players, world.tickCount, now);
    broadcast(chunkX, chunkY, JSON.stringify(payload));
  }

  // 7. Persist every 20 ticks (~1s)
  if (world.tickCount % 20 === 0) {
    try {
      persistState(world);
    } catch (err) {
      console.error("[game-loop] Persist failed:", err);
    }
  }
}

function groupPlayersByChunk(players: Map<string, PlayerState>): Map<string, PlayerState[]> {
  const groups = new Map<string, PlayerState[]>();
  for (const player of players.values()) {
    const key = `${String(player.chunkX)}:${String(player.chunkY)}`;
    const group = groups.get(key);
    if (group) {
      group.push(player);
    } else {
      groups.set(key, [player]);
    }
  }
  return groups;
}
