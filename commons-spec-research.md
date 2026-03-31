# Commons Spec — Web Research Findings

Research gathered 2026-03-26 to inform the commons-server rebuild. Covers: Bun WebSocket API, multiplayer netcode patterns, SQLite persistence, NPC pathfinding, and client-side prediction.

---

## 1. Bun WebSocket Server

**Source:** https://bun.sh/docs/api/websockets

### Performance

Bun's WebSocket implementation is built on [uWebSockets](https://github.com/uNetworking/uWebSockets). Benchmarks show ~700,000 messages/sec throughput on Linux x64 vs ~100,000 for Node.js + `ws` — roughly 7x more throughput at 16 clients. This headroom is more than sufficient for the commons at any realistic concurrent player count.

### Handler pattern

Bun uses a **shared handler object** (one per server, not per socket), which reduces memory overhead significantly compared to Node event-based patterns. All lifecycle events (`open`, `message`, `close`, `drain`) are declared once in `Bun.serve()`.

```ts
Bun.serve({
  fetch(req, server) {
    server.upgrade(req, { data: { userId: parseUserId(req) } });
  },
  websocket: {
    data: {} as { userId: string },
    open(ws) {},
    message(ws, message) {},
    close(ws, code, reason) {},
  },
});
```

### Contextual data on sockets

Per-socket state (player name, color, chunk coords) can be attached at upgrade time via `server.upgrade(req, { data: {...} })` and accessed as `ws.data` in all handlers. This is the right place to store per-connection game identity without a separate Map.

### Native pub/sub for chunk broadcasting

Bun has a built-in topic-based pub/sub API:
- `ws.subscribe("chunk:0:0")` — subscribe socket to a topic
- `server.publish("chunk:0:0", payload)` — broadcast to all subscribers except sender
- `ws.publish(topic, payload)` — broadcast excluding self

This maps cleanly to chunk-based visibility: each player subscribes to their current chunk topic. On chunk change, unsubscribe old topic, subscribe new. Server tick broadcasts via `server.publish("chunk:X:Y", tickPayload)` — no manual iteration over player lists needed.

### Backpressure

`ws.send()` returns:
- `-1` — enqueued but backpressured
- `0` — dropped (connection issue)
- `1+` — bytes sent

Useful for the tick loop: if a socket is backpressured, skip that tick's send rather than queuing up stale frames.

### Compression

Per-message `perMessageDeflate` is available. At <50 concurrent clients and JSON tick payloads, the CPU cost likely outweighs benefit. Revisit for Phase 4 if bandwidth becomes a concern.

### Idle timeout

Default 120s idle timeout. Configure with `idleTimeout`. For the commons, 30s is more appropriate — stale players should be evicted aggressively.

---

## 2. Multiplayer Netcode: Snapshot Interpolation

**Sources:**
- https://www.snapnet.dev/blog/netcode-architectures-part-3-snapshot-interpolation/
- https://www.gabrielgambetta.com/client-server-game-architecture.html
- https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking

### Authoritative server model

The canonical pattern: server owns all state; clients send only inputs; server broadcasts authoritative updates. Clients are "privileged spectators." This prevents teleport exploits and position spoofing.

The spec's proposed `|newPos - lastPos| <= PLAYER_SPEED * ticksSinceLastMove * 2` validation is the right approach — clamp rather than kick, to handle legitimate jitter.

### Snapshot interpolation (the right fit for commons)

**How it works:**
1. Server sends snapshots at a fixed tick rate (20Hz = 50ms)
2. Clients maintain a buffer of recent snapshots (100–200ms worth)
3. Clients render slightly **in the past** — interpolating between two confirmed snapshots
4. Local player gets client-side prediction (instant response); all other entities are interpolated

**Why it fits commons well:**
- Commons is a social walking game — no fast-paced combat requiring sub-frame precision
- Dual time-stream limitation (can't interact directly with interpolated objects) is not a problem for NPC gossip/drag mechanics, which are inherently async
- Low CPU requirement — most entities need no game logic on the client between server ticks

**Buffer sizing:** 2–4 snapshots is standard (100–200ms at 20Hz). Too small = stutter when a packet is late; too large = visible latency lag between player actions and world response.

### Delta compression

Only send fields that changed since last acknowledged snapshot. At 20Hz with ~17 NPCs and potentially 20 players, a full snapshot is manageable as JSON, but delta compression defers bandwidth growth. Implementation: server tracks `lastAckedSeq` per client; encodes only entities whose state changed since that seq.

The spec's current design sends NPCs and congress state "only when changed" — this is the right instinct, aligned with standard delta practices.

### Tick rate rationale

At 20Hz fixed server tick:
- NPC positions are at most 50ms stale
- Client lerp at 0.2/frame × 60fps reaches 99% of target in ~350ms — smooth for walking-pace movement
- Server loop CPU at 50ms intervals is trivial for Bun

10Hz (100ms) is viable for NPC-only updates if the game loop needs to be split. 20Hz for the full world tick is a reasonable default.

---

## 3. Client-Side Prediction and Server Reconciliation

**Sources:**
- https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html
- https://www.webgamedev.com/backend/prediction-reconciliation

### The pattern

1. Client applies input immediately (predict locally)
2. Client sends input with a sequence number to server
3. Server processes input, returns authoritative state with `lastProcessedSeq`
4. Client compares: if predicted state matches, nothing to do
5. If diverged: client snaps to server state and replays all inputs with seq > `lastProcessedSeq`

### For commons specifically

The current commons is client-authoritative for local player position. The spec proposes adding server validation. Given the walking pace and social nature of the game, a light implementation is appropriate:

- **Keep** client-side prediction for local player (instant movement feel)
- **Add** server max-speed validation (clamp violations, don't kick)
- **Skip** full reconciliation replay for now (Phase 3/4) — at walking speed with a 50ms tick, position drift on a valid clamp is invisible

The main value of server validation here is preventing teleport exploits, not achieving frame-perfect reconciliation.

---

## 4. SQLite with Bun for Game State Persistence

**Sources:**
- https://bun.com/docs/runtime/sqlite
- https://www.powersync.com/blog/sqlite-optimizations-for-ultra-high-performance
- https://dev.to/software_mvp-factory/sqlite-wal-mode-and-connection-strategies-for-high-throughput-mobile-apps-beyond-the-basics-eh0

### Performance

`bun:sqlite` is built natively into Bun (no separate install). Benchmarks show:
- 3–6x faster than `better-sqlite3` (Node)
- 8–9x faster than `deno.land/x/sqlite`

A real-world example processed 150–350 WebSocket messages/sec into SQLite — well above the commons' persistence needs (1 write per second per the spec's "persist every 20 ticks" plan).

### WAL mode is mandatory

WAL (Write-Ahead Log) mode provides:
- 4x improvement vs default DELETE journal mode for write-heavy workloads
- Concurrent reads while writing (critical for a game server that reads NPC positions while ticking)

```ts
const db = new Database("commons.db");
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA synchronous = NORMAL"); // safe with WAL, faster than FULL
```

### Batch writes in transactions

For the 1Hz persistence flush (every 20 ticks), wrap all NPC position updates in a single transaction:

```ts
const upsertNpc = db.prepare(
  "INSERT OR REPLACE INTO npc_positions (name, x, y, facing, updated_at) VALUES (?, ?, ?, ?, ?)"
);
db.transaction(() => {
  for (const npc of world.npcs) {
    upsertNpc.run(npc.name, npc.x, npc.y, npc.facing, Date.now());
  }
})();
```

Transactions are dramatically faster than individual writes — critical if worn path tile counts become server-aggregated (many writes per tick).

### Schema notes

The spec's proposed schema is sound. Consider adding an index on `player_sessions.last_seen` for efficient stale player eviction queries:

```sql
CREATE INDEX idx_player_last_seen ON player_sessions(last_seen);
```

---

## 5. NPC Pathfinding (Tile-Aware)

**Sources:**
- https://developer.mozilla.org/en-US/docs/Games/Techniques/Tilemaps
- https://github.com/Kaetram/Kaetram-Open/wiki/Game-Map
- http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter20_Precomputed_Pathfinding_for_Large_and_Detailed_Worlds_on_MMO_Servers.pdf

### Current problem

The server's `tickNpcs()` bounces NPCs off canvas walls only — no tile awareness. NPCs walk through buildings and water on the server, while the client applies (different) persona-specific movement patterns. The result is server and client positions diverging, and NPCs appearing inside walls from other clients' perspectives.

### Recommended approach for commons scale

For a 32×32 or similar tile grid with 17 NPCs, a simple **walkability bitmask + random walk with obstacle avoidance** is sufficient — full A* is overkill for wandering NPCs.

**Implementation pattern:**
1. Build a `walkable: boolean[][]` grid from the chunk tile map at server startup (tile types 0=grass, 1=path are walkable; 2=water, 3=building, 4=tree, 5=rock, 6=fountain are not)
2. In `tickNpcs()`, before applying velocity, check if the target tile is walkable
3. If not walkable, pick a new random direction (or reverse)
4. For congress mode, use simple BFS/greedy pathfinding toward COUNCIL_TILES — grid is small enough that BFS is instantaneous

**Shared chunk generation:** The spec notes that map/chunk generation should be a shared module between server and client. This is critical: the server needs the same tile layout as what clients render. The shared `chunkSeed()` PRNG (mulberry32) already handles determinism — the server just needs to call the same generation function and build its walkability grid from it.

**Per-chunk walkability caches:** Generate and cache walkability grids lazily when a player first enters a chunk. For chunk (0,0), generate at startup (it's hand-crafted, so the walkable set is known statically).

### MMO-scale context (not needed here, but for reference)

For large worlds, precomputed pathfinding (navigation meshes split into 32×32 tile cells, with inter-cell connectivity tables) scales to millions of tiles. Commons is orders of magnitude smaller — a per-tick BFS on a single chunk grid is trivially fast.

---

## 6. TypeScript ES Modules for Client

**Sources:**
- https://gamefromscratch.com/javascript-typescript-game-engines-in-2025/
- https://stephendoddtech.com/blog/game-design/simple-typescript-canvas-game-project-setup

### Module structure

The spec's proposed module split is well-aligned with standard practice. Key principle: **renderer is a pure function** that takes world state and produces pixels, with no side effects. This is the single most important architectural change from the current monolith.

Standard ES module game loop pattern:
```ts
// main.ts
import { createInputState } from './input.js';
import { render } from './renderer.js';
import { applyTick } from './network.js';
import { WorldState } from './state.js';

const state: WorldState = initialState();
const input = createInputState();

function loop(timestamp: number) {
  applyTick(state, pendingServerMessages);
  updateLocalPlayer(state, input);
  render(state, ctx, timestamp);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
```

### Bun as the build tool

Bun can bundle ES modules for the browser with `bun build`:
```bash
bun build src/main.ts --outdir dist --target browser
```

This handles TypeScript transpilation and module bundling in one step — no separate webpack/vite needed. Source maps are supported for debugging.

### Sprite batch compatibility

The current sprite batch files (`sprites-batch*.js`) use global function declarations (`drawSprite_chairman_A()`, etc.). For Phase 3, these can be included as `<script>` tags before the module bundle, making them available as globals that `npc.ts` calls. A clean Phase 4 refactor would convert them to named exports and import them properly.

---

## 7. Summary of Key Decisions Supported by Research

| Question (from spec §4) | Research-supported answer |
|---|---|
| Tick rate: 20Hz vs 10Hz? | 20Hz is correct for smooth NPC interpolation. 10Hz introduces visible stutter at lerp 0.2/frame. Consider 20Hz world tick, 10Hz NPC-only for CPU savings if needed. |
| Worn paths shared? | WAL mode + batched transactions makes this feasible with low overhead. Recommend server-aggregating in Phase 4. |
| Chunk NPCs: chunk 0,0 only? | Start with NPCs in chunk (0,0) only. Shared walkability grid makes per-chunk NPC sets tractable later. |
| Client prediction + reconciliation? | Keep prediction for local player. Add max-speed clamp on server. Full reconciliation replay is Phase 4. |
| Audition consolidation? | Absorb into commons-server. Eliminates fragile external process; audition walkers are game world entities anyway. |
| Binary protocol (MessagePack)? | Not needed at <50 concurrent. JSON is fine. Revisit when bandwidth is measurable. |
| Hosting: subdomain vs proxied? | Proxied through clunger at `/api/commons/` is simpler operationally. Subdomain adds SSL complexity with no user-visible benefit. |
| Sprite batches: module exports or globals? | Keep globals in Phase 3. Named exports in Phase 4 alongside shared-types work. |
| Warthog? | Move to commons-server with rest of game state. It's a game entity; keeping it in clunger is the same structural problem as the current NPC tick. |

---

## Sources

- [Bun WebSocket API docs](https://bun.sh/docs/api/websockets)
- [Bun SQLite docs](https://bun.com/docs/runtime/sqlite)
- [Snapshot Interpolation — SnapNet](https://www.snapnet.dev/blog/netcode-architectures-part-3-snapshot-interpolation/)
- [Client-Server Game Architecture — Gabriel Gambetta](https://www.gabrielgambetta.com/client-server-game-architecture.html)
- [Client-Side Prediction and Server Reconciliation — Gabriel Gambetta](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)
- [Client-Side Prediction — WebGameDev](https://www.webgamedev.com/backend/prediction-reconciliation)
- [Source Multiplayer Networking — Valve](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking)
- [Game Networking Complete Guide 2025 — GeneralistProgrammer](https://generalistprogrammer.com/tutorials/game-networking-complete-multiplayer-guide-2025)
- [SQLite Optimizations for Ultra High-Performance — PowerSync](https://www.powersync.com/blog/sqlite-optimizations-for-ultra-high-performance)
- [SQLite WAL Mode — Dev.to](https://dev.to/software_mvp_factory/sqlite-wal-mode-and-connection-strategies-for-high-throughput-mobile-apps-beyond-the-basics-eh0)
- [Tilemap NPC Pathfinding — MDN](https://developer.mozilla.org/en-US/docs/Games/Techniques/Tilemaps)
- [Precomputed Pathfinding for MMO Servers — GameAIPro](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter20_Precomputed_Pathfinding_for_Large_and_Detailed_Worlds_on_MMO_Servers.pdf)
- [Kaetram Open MMORPG — Game Map Wiki](https://github.com/Kaetram/Kaetram-Open/wiki/Game-Map)
- [JavaScript/TypeScript Game Engines 2025 — GameFromScratch](https://gamefromscratch.com/javascript-typescript-game-engines-in-2025/)
- [TypeScript Canvas Game Setup — StephenDoddTech](https://stephendoddtech.com/blog/game-design/simple-typescript-canvas-game-project-setup)
