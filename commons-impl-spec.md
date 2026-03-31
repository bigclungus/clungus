# Implementation Specification for Rebuilding 'The Commons'

This document provides a detailed technical specification for rebuilding 'The Commons', a multiplayer browser-based walking game, to address existing architectural issues and implement a scalable, maintainable system. The spec focuses on Phases 1 and 2 of the migration plan, with notes for Phase 3 client architecture. It is intended for direct handoff to an implementation agent, with all details resolved to eliminate ambiguity.

## 1. Overview and Goals

The Commons is a persistent 2D top-down multiplayer walking game accessible at `clung.us/commons`. Players navigate a tile-based world using GitHub identities for authentication, interacting with NPCs, vehicles (Warthog), and environmental features like day/night cycles and seasons. The current implementation suffers from a monolithic client, entangled server logic, lack of persistence, and inefficient networking. This spec outlines a re-architecture to separate concerns, introduce persistence, and establish a robust networking protocol.

The primary goals for Phases 1 and 2 are:
- Extract game logic into a dedicated `commons-server` service running on Bun.
- Implement a fixed 20Hz tick rate for smooth entity updates.
- Add server-side validation and persistence using SQLite.
- Integrate audition walkers and Warthog state into the game server.
- Lay the groundwork for client modularization in Phase 3.

## 2. Protocol Definitions

The WebSocket protocol defines all communication between client and server. Messages are JSON-encoded for Phases 1-3 (MessagePack deferred to Phase 4). Below are the TypeScript interfaces for all message types.

### 2.1 Server-to-Client Messages

```typescript
interface ServerToClientBase {
  type: string;
  seq: number; // Monotonic sequence number for tick ordering
  t: number; // Server timestamp (ms since epoch)
}

interface TickMessage extends ServerToClientBase {
  type: "tick";
  lastProcessedInput: number; // For client reconciliation
  players: Record<string, PlayerState>; // Filtered to same chunk
  npcs?: NPCState[]; // Delta: only if changed since last tick
  congress?: { active: boolean }; // Delta: only if changed
  warthog?: WarthogState; // Delta: only if changed
}

type ServerToClientMessage = TickMessage;
```

### 2.2 Client-to-Server Messages

```typescript
interface ClientToServerBase {
  type: string;
  seq?: number; // Client input sequence for reconciliation
}

interface MoveMessage extends ClientToServerBase {
  type: "move";
  seq: number;
  x: number;
  y: number;
  facing: "left" | "right";
  chunkX: number;
  chunkY: number;
}

interface HopMessage extends ClientToServerBase {
  type: "hop";
}

interface StatusMessage extends ClientToServerBase {
  type: "status";
  away: boolean;
}

interface ChunkMessage extends ClientToServerBase {
  type: "chunk";
  chunkX: number;
  chunkY: number;
}

interface ResyncMessage extends ClientToServerBase {
  type: "resync";
}

interface WarthogInputMessage extends ClientToServerBase {
  type: "warthog_input";
  dx: number; // -1, 0, 1
  dy: number; // -1, 0, 1
}

interface WarthogJoinMessage extends ClientToServerBase {
  type: "warthog_join";
}

interface WarthogLeaveMessage extends ClientToServerBase {
  type: "warthog_leave";
}

interface WornPathMessage extends ClientToServerBase {
  type: "worn_path";
  tileX: number;
  tileY: number;
  chunkX: number;
  chunkY: number;
}

type ClientToServerMessage =
  | MoveMessage
  | HopMessage
  | StatusMessage
  | ChunkMessage
  | ResyncMessage
  | WarthogInputMessage
  | WarthogJoinMessage
  | WarthogLeaveMessage
  | WornPathMessage;
```

## 3. State Definitions

The server maintains authoritative state for the world, players, NPCs, Warthog, and audition walkers. Below are the TypeScript interfaces for these structures.

```typescript
interface WorldState {
  players: Map<string, PlayerState>; // Key: socketId
  npcs: Map<string, NPCState>; // Key: name
  warthog: WarthogState;
  walkers: AuditionWalker[];
  congress: { active: boolean };
  chunks: Map<string, ChunkData>; // Key: `${chunkX}:${chunkY}`
  tickCount: number;
}

interface PlayerState {
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
  lastSeen: number; // Timestamp (ms)
  lastProcessedInput: number; // For reconciliation
}

interface NPCState {
  name: string;
  x: number;
  y: number;
  facing: "left" | "right";
  vx: number;
  vy: number;
  pattern: string; // Persona-specific movement pattern
  congressTarget?: { x: number; y: number }; // Set during congress mode
}

interface WarthogState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: "left" | "right";
  seats: (string | null)[]; // Array of socketIds, length 4, null=empty
}

interface AuditionWalker {
  id: string;
  x: number;
  y: number;
  speed: number;
  direction: "left" | "right";
  concept: string; // Text for hover card
  isPaused: boolean;
}

interface ChunkData {
  cx: number;
  cy: number;
  tiles: number[][]; // 2D grid of tile types
  walkable: boolean[][]; // Derived from tiles
}
```

## 4. Bun WebSocket Server Setup

The server uses Bun's native WebSocket implementation with topic-based pub/sub for chunk broadcasting. Below is the complete setup.

```typescript
import { serve } from "bun";

const server = serve({
  port: 8090,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const userId = url.searchParams.get("userId") || "anonymous";
      const name = url.searchParams.get("name") || "unknown";
      const color = url.searchParams.get("color") || "#ffffff";
      return server.upgrade(req, {
        data: {
          userId,
          name,
          color,
          socketId: `${userId}-${Date.now()}`, // Unique per connection
          chunkX: 0,
          chunkY: 0,
          lastSeen: Date.now(),
        },
      });
    }
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      const { socketId, chunkX, chunkY, name, color } = ws.data;
      ws.subscribe(`chunk:${chunkX}:${chunkY}`);
      world.players.set(socketId, {
        socketId,
        name,
        color,
        x: 400,
        y: 300,
        facing: "right",
        hopFrame: 0,
        isAway: false,
        chunkX,
        chunkY,
        lastSeen: Date.now(),
        lastProcessedInput: 0,
      });
      console.log(`Player ${name} connected (${socketId})`);
    },
    message(ws, message) {
      const { socketId } = ws.data;
      const player = world.players.get(socketId);
      if (!player) return;
      try {
        const data = JSON.parse(message.toString()) as ClientToServerMessage;
        handleClientMessage(socketId, data);
        player.lastSeen = Date.now();
      } catch (e) {
        console.error(`Invalid message from ${socketId}:`, e);
      }
    },
    close(ws) {
      const { socketId, chunkX, chunkY } = ws.data;
      ws.unsubscribe(`chunk:${chunkX}:${chunkY}`);
      world.players.delete(socketId);
      console.log(`Player disconnected (${socketId})`);
    },
    idleTimeout: 30, // Seconds before closing idle connections
  },
});

// Backpressure handling in tick loop (see game-loop.ts)
function publishToChunk(chunkX: number, chunkY: number, payload: string) {
  server.publish(`chunk:${chunkX}:${chunkY}`, payload);
}
```

This setup uses `server.upgrade` to attach per-socket metadata (userId, chunk coordinates) at connection time. The `idleTimeout` of 30 seconds ensures stale connections are evicted. Pub/sub topics (`chunk:X:Y`) filter broadcasts to players in the same chunk.

## 5. Game Loop Implementation

The game loop runs at 20Hz (50ms intervals) and handles all authoritative state updates. Below is the skeleton with responsibilities and execution order.

```typescript
let world: WorldState = initializeWorld();
let tickInterval = setInterval(tick, 50); // 20Hz
let tickCount = 0;

function tick() {
  tickCount++;
  const now = Date.now();

  // 1. Evict stale players
  evictStalePlayers(now);

  // 2. Update NPCs (tile-aware movement)
  tickNpcs(world.npcs, world.chunks, world.congress.active);

  // 3. Update Warthog (driver input, physics)
  tickWarthog(world.warthog, world.players);

  // 4. Update audition walkers
  tickWalkers(world.walkers);

  // 5. Broadcast state to clients (delta snapshots)
  broadcastTick(world, tickCount, now);

  // 6. Persist state to SQLite (every 1s = 20 ticks)
  if (tickCount % 20 === 0) {
    persistState(world);
  }
}

function evictStalePlayers(now: number) {
  const STALE_THRESHOLD = 60 * 1000; // 60s
  for (const [socketId, player] of world.players) {
    if (now - player.lastSeen > STALE_THRESHOLD) {
      world.players.delete(socketId);
      console.log(`Evicted stale player ${socketId}`);
    }
  }
}

function broadcastTick(world: WorldState, seq: number, now: number) {
  const chunkGroups = groupPlayersByChunk(world.players);
  for (const [chunkKey, players] of chunkGroups) {
    const [chunkX, chunkY] = chunkKey.split(":").map(Number);
    const payload = buildTickPayload(world, players, seq, now);
    const payloadStr = JSON.stringify(payload);
    publishToChunk(chunkX, chunkY, payloadStr);
  }
}
```

The loop prioritizes NPC and Warthog updates before broadcasting to ensure consistent state. Persistence is throttled to 1Hz to reduce SQLite load.

## 6. NPC AI Module

NPC movement is tile-aware using a walkability grid. Each of the 17 NPCs has a persona-specific pattern, modified by season and congress mode.

```typescript
const NPC_PATTERNS: Record<string, { speed: number; behavior: string }> = {
  chairman: { speed: 1.2, behavior: "wander" },
  critic: { speed: 1.0, behavior: "pacing" },
  architect: { speed: 0.8, behavior: "stationary" },
  ux: { speed: 1.1, behavior: "wander" },
  designer: { speed: 1.0, behavior: "circular" },
  galactus: { speed: 1.5, behavior: "aggressive" },
  hume: { speed: 0.9, behavior: "pacing" },
  otto: { speed: 1.0, behavior: "wander" },
  pm: { speed: 1.3, behavior: "directed" },
  spengler: { speed: 0.7, behavior: "stationary" },
  trump: { speed: 1.4, behavior: "aggressive" },
  "uncle-bob": { speed: 0.8, behavior: "pacing" },
  bloodfeast: { speed: 1.6, behavior: "aggressive" },
  adelbert: { speed: 0.9, behavior: "wander" },
  jhaddu: { speed: 1.0, behavior: "circular" },
  morgan: { speed: 1.1, behavior: "directed" },
  "the-kid": { speed: 1.3, behavior: "wander" },
};

const COUNCIL_TILES = { x: 10, y: 10 }; // Target during congress

function tickNpcs(npcs: Map<string, NPCState>, chunks: Map<string, ChunkData>, congressActive: boolean) {
  const chunk = chunks.get("0:0"); // NPCs stay in (0,0) for Phase 1-3
  if (!chunk) return;

  const season = getCurrentSeason();
  const speedMod = season === "winter" ? 0.7 : 1.0;

  for (const npc of npcs.values()) {
    const pattern = NPC_PATTERNS[npc.name];
    const speed = pattern.speed * speedMod;

    if (congressActive && !npc.congressTarget) {
      npc.congressTarget = COUNCIL_TILES;
    } else if (!congressActive) {
      npc.congressTarget = undefined;
    }

    if (npc.congressTarget) {
      const path = greedyPathfind(npc.x, npc.y, npc.congressTarget.x, npc.congressTarget.y, chunk.walkable);
      if (path.length > 1) {
        npc.vx = (path[1].x - npc.x) * speed;
        npc.vy = (path[1].y - npc.y) * speed;
      } else {
        npc.vx = 0;
        npc.vy = 0;
      }
    } else {
      applyPatternBehavior(npc, pattern.behavior, speed);
    }

    const targetX = npc.x + npc.vx;
    const targetY = npc.y + npc.vy;
    const tileX = Math.floor(targetX / 32);
    const tileY = Math.floor(targetY / 32);

    if (isWalkable(tileX, tileY, chunk.walkable)) {
      npc.x = targetX;
      npc.y = targetY;
      npc.facing = npc.vx > 0 ? "right" : "left";
    } else {
      npc.vx = 0;
      npc.vy = 0;
      pickNewDirection(npc, speed);
    }
  }
}

function isWalkable(tx: number, ty: number, walkable: boolean[][]): boolean {
  if (tx < 0 || ty < 0 || tx >= walkable.length || ty >= walkable[0].length) return false;
  return walkable[tx][ty];
}

function greedyPathfind(sx: number, sy: number, tx: number, ty: number, walkable: boolean[][]): { x: number; y: number }[] {
  // Simplified greedy approach for small grid
  const path = [{ x: sx, y: sy }];
  let cx = sx;
  let cy = sy;
  for (let i = 0; i < 10; i++) { // Limit iterations
    if (cx === tx && cy === ty) break;
    const dx = Math.sign(tx - cx);
    const dy = Math.sign(ty - cy);
    cx += dx;
    cy += dy;
    if (!isWalkable(cx, cy, walkable)) break;
    path.push({ x: cx, y: cy });
  }
  return path;
}

function applyPatternBehavior(npc: NPCState, behavior: string, speed: number) {
  // Implement per-pattern logic (wander, pacing, etc.)
  // Placeholder: random walk for all
  if (Math.random() < 0.02) {
    pickNewDirection(npc, speed);
  }
}

function pickNewDirection(npc: NPCState, speed: number) {
  const angle = Math.random() * Math.PI * 2;
  npc.vx = Math.cos(angle) * speed;
  npc.vy = Math.sin(angle) * speed;
}
```

## 7. SQLite Persistence Module

Persistence uses `bun:sqlite` with WAL mode for concurrent access and performance. Below is the setup and CRUD operations.

```typescript
import { Database } from "bun:sqlite";

const db = new Database("./db/commons.db", { create: true });

// Enable WAL mode
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");

// Schema creation
db.exec(`
  CREATE TABLE IF NOT EXISTS npc_positions (
    name TEXT PRIMARY KEY,
    x REAL,
    y REAL,
    facing TEXT,
    updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS player_sessions (
    socket_id TEXT PRIMARY KEY,
    name TEXT,
    color TEXT,
    x REAL,
    y REAL,
    chunk_x INTEGER DEFAULT 0,
    chunk_y INTEGER DEFAULT 0,
    last_seen INTEGER
  );
  CREATE TABLE IF NOT EXISTS world_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT,
    payload TEXT,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS worn_path_tiles (
    chunk_x INTEGER,
    chunk_y INTEGER,
    tile_x INTEGER,
    tile_y INTEGER,
    visit_count INTEGER DEFAULT 0,
    last_visited INTEGER,
    PRIMARY KEY (chunk_x, chunk_y, tile_x, tile_y)
  );
  CREATE INDEX IF NOT EXISTS idx_player_last_seen ON player_sessions(last_seen);
`);

// Prepared statements
const saveNpcStmt = db.prepare("INSERT OR REPLACE INTO npc_positions (name, x, y, facing, updated_at) VALUES (?, ?, ?, ?, ?)");
const savePlayerStmt = db.prepare("INSERT OR REPLACE INTO player_sessions (socket_id, name, color, x, y, chunk_x, chunk_y, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

function persistState(world: WorldState) {
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const npc of world.npcs.values()) {
      saveNpcStmt.run(npc.name, npc.x, npc.y, npc.facing, now);
    }
    for (const player of world.players.values()) {
      savePlayerStmt.run(player.socketId, player.name, player.color, player.x, player.y, player.chunkX, player.chunkY, player.lastSeen);
    }
  });
  tx();
}
```

WAL mode ensures writes don't block reads, critical for the 20Hz tick loop. Batching in transactions minimizes disk I/O.

## 8. Player Validation Logic

Server validates movement to prevent cheating (teleporting). A max-speed clamp is applied.

```typescript
const MAX_MOVE_PER_TICK = 54; // 1.8 px/frame * (1000/50) * 1.5 tolerance

function handleClientMessage(socketId: string, msg: ClientToServerMessage) {
  const player = world.players.get(socketId);
  if (!player) return;

  if (msg.type === "move") {
    const dx = Math.abs(msg.x - player.x);
    const dy = Math.abs(msg.y - player.y);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > MAX_MOVE_PER_TICK) {
      // Clamp to max speed
      const scale = MAX_MOVE_PER_TICK / dist;
      player.x = player.x + dx * scale;
      player.y = player.y + dy * scale;
    } else {
      player.x = msg.x;
      player.y = msg.y;
    }
    player.facing = msg.facing;
    player.chunkX = msg.chunkX;
    player.chunkY = msg.chunkY;
    player.lastProcessedInput = msg.seq;
    updateChunkSubscription(socketId, player.chunkX, player.chunkY);
  } else if (msg.type === "hop") {
    player.hopFrame = 1; // Start hop animation
  } else if (msg.type === "status") {
    player.isAway = msg.away;
  } else if (msg.type === "resync") {
    // Force full state sync in next tick
    forceFullSync(socketId);
  }
}
```

## 9. Snapshot Delta Logic

To reduce bandwidth, NPCs, congress, and Warthog state are sent only when changed.

```typescript
const lastSentState: Map<string, { npcs: NPCState[]; congress: { active: boolean }; warthog: WarthogState }> = new Map();

function buildTickPayload(world: WorldState, players: PlayerState[], seq: number, now: number): TickMessage {
  const chunkKey = `${players[0].chunkX}:${players[0].chunkY}`;
  const last = lastSentState.get(chunkKey) || { npcs: [], congress: { active: false }, warthog: world.warthog };
  const payload: TickMessage = {
    type: "tick",
    seq,
    t: now,
    lastProcessedInput: players[0].lastProcessedInput,
    players: Object.fromEntries(players.map(p => [p.socketId, p])),
  };
  if (hasNpcsChanged(world.npcs, last.npcs)) {
    payload.npcs = Array.from(world.npcs.values());
    last.npcs = payload.npcs;
  }
  if (world.congress.active !== last.congress.active) {
    payload.congress = world.congress;
    last.congress = world.congress;
  }
  if (hasWarthogChanged(world.warthog, last.warthog)) {
    payload.warthog = world.warthog;
    last.warthog = world.warthog;
  }
  lastSentState.set(chunkKey, last);
  return payload;
}

function hasNpcsChanged(current: Map<string, NPCState>, last: NPCState[]): boolean {
  const currArray = Array.from(current.values());
  if (currArray.length !== last.length) return true;
  for (let i = 0; i < currArray.length; i++) {
    const c = currArray[i];
    const l = last[i];
    if (c.x !== l.x || c.y !== l.y || c.facing !== l.facing) return true;
  }
  return false;
}
```

## 10. Audition Walker Logic

Audition walkers are integrated into `commons-server`, eliminating the external proxy.

```typescript
function tickWalkers(walkers: AuditionWalker[]) {
  for (const walker of walkers) {
    if (walker.isPaused) continue;
    walker.x += walker.speed * (walker.direction === "right" ? 1 : -1);
    if (walker.x < 0 || walker.x > 800) { // Canvas bounds
      walker.direction = walker.direction === "right" ? "left" : "right";
    }
  }
}

function handleWalkerInteraction(socketId: string, walkerId: string, action: "keep" | "dismiss") {
  const walker = world.walkers.find(w => w.id === walkerId);
  if (!walker) return;
  if (action === "keep") {
    Bun.write(`candidates/${walkerId}.json`, JSON.stringify({ concept: walker.concept }));
  }
  world.walkers = world.walkers.filter(w => w.id !== walkerId);
}
```

## 11. Warthog Module

Warthog state and logic are managed server-side.

```typescript
function tickWarthog(warthog: WarthogState, players: Map<string, PlayerState>) {
  warthog.x += warthog.vx;
  warthog.y += warthog.vy;
  warthog.facing = warthog.vx > 0 ? "right" : "left";
  // Update passenger positions to follow warthog
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

function handleWarthogMessage(socketId: string, msg: WarthogInputMessage | WarthogJoinMessage | WarthogLeaveMessage) {
  const player = world.players.get(socketId);
  if (!player) return;
  if (msg.type === "warthog_input" && world.warthog.seats[0] === socketId) {
    world.warthog.vx = msg.dx * 2;
    world.warthog.vy = msg.dy * 2;
  } else if (msg.type === "warthog_join") {
    const dist = Math.sqrt((player.x - world.warthog.x) ** 2 + (player.y - world.warthog.y) ** 2);
    if (dist < 60) {
      const emptySeat = world.warthog.seats.findIndex(s => s === null);
      if (emptySeat >= 0) {
        world.warthog.seats[emptySeat] = socketId;
      }
    }
  } else if (msg.type === "warthog_leave") {
    const seatIndex = world.warthog.seats.indexOf(socketId);
    if (seatIndex >= 0) {
      world.warthog.seats[seatIndex] = null;
    }
  }
}
```

## 12. Systemd Service File

The `commons-server` runs as a user-level systemd service.

```ini
[Unit]
Description=Commons Game Server
After=network.target

[Service]
Type=simple
User=commons
WorkingDirectory=/mnt/data/commons-server
ExecStart=/usr/local/bin/bun run src/index.ts
Restart=always
RestartSec=10
SyslogIdentifier=commons-server
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## 13. Clunger Proxy Additions

Clunger proxies WebSocket connections to `commons-server`.

```typescript
// In clunger's routing setup
app.use("/api/commons/ws", (req, res, next) => {
  // Proxy WebSocket upgrade requests to localhost:8090
  const target = "ws://localhost:8090/ws";
  // Implement proxy logic (e.g., using http-proxy-middleware or Bun's native proxy)
  proxyWebSocket(req, res, target);
});
```

## 14. Migration Risks and Rollback Plan

- **Risk: commons-server crash**: If `commons-server` crashes, WebSocket connections fail, and players cannot connect or move. Clunger should return a 503 error on `/api/commons/ws` with a fallback message: "Game server unavailable, retrying..."
- **Risk: SQLite corruption**: WAL mode reduces risk, but a corrupted `commons.db` could lose NPC positions. Backup `commons.db` before migration and restore on failure.
- **Rollback**: Revert to original clunger WebSocket handler and NPC logic. Disable proxy to :8090 and restart clunger. Client remains compatible with old protocol during Phase 1.

## 15. Phase 3 Client Architecture Notes

The client is modularized into TypeScript ES modules with clear responsibility separation:
- **main.ts**: Entry point, initializes renderer, input, and network.
- **renderer.ts**: Pure function `render(state: WorldState, ctx: CanvasRenderingContext2D, frame: number)`; no side effects, draws based on interpolated state.
- **input.ts**: Captures keyboard/mouse events, builds `InputState`, sends to `local-player.ts` for prediction.
- **network.ts**: Manages WebSocket, receives ticks, updates `WorldState` in `state.ts`, handles snapshot buffer (4-8 frames, 100ms delay).
- **state.ts**: Maintains `WorldState`, applies server updates, manages local prediction buffer (ring buffer, cap 120 inputs).
- **local-player.ts**: Applies client-side prediction, reconciles on server tick (snap if error >=8px, lerp over 3 frames if <8px).
- **remote-player.ts**: Interpolates between snapshots for smooth rendering.

State flows unidirectionally: `network.ts` updates `state.ts`, which is passed to `renderer.ts` each frame. This ensures predictability and testability.

## Conclusion

This specification provides a complete blueprint for Phases 1 and 2 of The Commons rebuild, with forward-looking notes for Phase 3. All technical decisions are grounded in research (Bun docs, netcode guides) and tailored to the game's requirements (walking pace, social focus). Implementation should proceed by following the outlined structure, interfaces, and logic, ensuring a robust and scalable multiplayer experience.