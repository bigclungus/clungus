# The Commons — Architecture Rebuild Spec

## 1. Functional Requirements (What Exists Now)

### Player
- Movement: Arrow/WASD, 1.8 px/frame, diagonal normalized
- Hop: Spacebar → 12-frame sine arc, broadcast as `player_hop`
- Facing: left/right from horizontal velocity
- Collision: per-tile blocking (water, buildings, trees, rocks, fountain)
- Chunk crossing: exit canvas bounds → load adjacent chunk, teleport to opposite edge
- Name: GitHub identity via `/api/me`; fallback `adj-animal` random name
- Away state: visibility/blur events → `player_status away/active`; remote players greyscale 40% opacity

### Multiplayer
- WebSocket: single `/api/commons/ws` endpoint
- Messages sent: `move`, `hop`, `chunk_change`, `player_status`
- Messages received: `welcome` (socket_id), `players` (snapshot ~200ms), `player_hop`, `npc_update`, `warthog_state`
- Remote players: lerp at 0.2/frame, stale after 10s, chunk-filtered
- Dual-avatar fix: client skips own socket_id from players broadcast

### NPC System (17 NPCs)
chairman, critic, architect, ux, designer, galactus, hume, otto, pm, spengler, trump, uncle-bob, bloodfeast, adelbert, jhaddu, morgan, the-kid

- **Server-authoritative**: clunger ticks NPCs every 500ms, broadcasts `npc_update`
- **Server logic**: pixel-space movement ~35 px/tick, random direction every 4–8 ticks, bounce off walls (no tile awareness on server ← known bug)
- **Client logic**: persona-specific patterns (Uncle Bob: straight lines; Designer: circular; Adelbert: stalks nearest NPC; The-Kid: fast)
- Congress mode: debaters pathfind toward council building tiles
- Gossip system: proximity timers → thought bubbles with quips
- Speech bubbles: per-persona quip arrays, response from `/api/invoke-persona`
- Drag-and-drop: click-hold to drag, short click opens invoke overlay
- Sprite system: `drawSprite_<id>_<A|B|C>()` from batch files; flip via canvas transform

### NPC Invoke (Chat)
- Click NPC → overlay with portrait (160×320 canvas)
- Textarea → `/api/invoke-persona` with name, prompt, location context
- Response shown as bubble with 7s TTL

### Congress Building
- Chunk (0,0) building at tiles (2–8, 2–6), doorway at (5,5)
- Walking into doorway triggers modal
- `pollCongress()` every 10s → `congressState`
- Debaters pathfind to COUNCIL_TILES during active sessions

### Map System
- **Chunk (0,0)**: Hand-crafted — cross-paths, pond, 3 buildings, fountain 3×3
- **Procedural chunks**: seeded by `chunkSeed(cx,cy)` (mulberry32 PRNG); deterministic; trees ~10%, water ponds, rocks, paths with entry/exit corridors cleared
- **Tiles**: 0=grass, 1=path, 2=water, 3=building, 4=tree, 5=rock, 6=fountain
- Map cache: tiles rendered once to offscreen canvas

### Day/Night & Seasons
- 06–18h: no tint; 18–21h: amber; 21–00h: blue-purple; 00–06h: dark navy + stars
- Week mod 4 → spring/summer/autumn/winter; affects grass, tree colors, NPC speed (winter −30%)

### Sprite Voting
- Polls `/api/vote/sprite-<slug>` every 30s; uses winning A/B/C variant per NPC

### Audition Walkers
- Fetches `/api/audition/walkers` every 2s (proxied to persona-audition on :8110)
- Walkers cross canvas row 18, hover pauses + shows concept card
- Keep/Dismiss → save to `candidates/` dir

### Traces & Worn Paths
- Server traces at tile positions, fade over 7 days
- Client-local localStorage tile visit counts; ≥10 visits = dark overlay, ≥30 = dirt

### Warthog
- Server: `WarthogState` (x,y,vx,vy,facing,4 seats) in clunger
- Driver: seat 0, controls with WASD
- Join/leave: E key within 60px of center
- State broadcast on every change

---

## 2. Current Problems

### Structural
- **2,965-line monolith**: HTML, CSS, game logic, rendering, networking, UI, map generation — all one file. No modules, no types, `var` throughout.
- **Game server buried in web server**: NPC ticking, warthog state, player registry all live inside `clunger/src/index.ts` alongside HTTP routing, auth, votes, congress API, etc.

### State & Persistence
- **No persistent world state**: NPC positions lost on server restart
- **Server NPC logic is tile-blind**: `tickNpcs()` bounces off canvas walls only. NPCs walk through buildings and water on the server.
- **Worn paths are local**: per-browser localStorage only. No shared world memory.
- **Chunk state is pure client**: server doesn't know which chunk players are in

### Networking
- **Full player snapshot every broadcast**: O(n²) bandwidth as player count grows
- **No tick-rate separation**: broadcasts triggered by client move events, not a fixed server tick
- **NPC at 500ms (2Hz)**: forces aggressive lerp; NPCs always chasing stale positions
- **No server-side input validation**: clients can teleport to any position

### Services
- **Audition proxy is fragile**: separate process on :8110, no health check, silently fails
- **No shared type contract** between client JS and clunger TypeScript

---

## 3. Proposed Architecture

### Backend: `commons-server` (new Bun TypeScript service)

Separate game server from clunger entirely. Clunger handles HTTP, auth, congress, votes. Commons-server owns the game world.

**Port**: `:8090` (internal, proxied through clunger at `/api/commons/`)

```
/mnt/data/commons-server/
  src/
    index.ts          — HTTP + WS server setup
    game-loop.ts      — authoritative 20Hz tick (50ms)
    world.ts          — world state: players, NPCs, chunks
    npc-ai.ts         — NPC behaviour (tile-aware, persona-specific)
    map.ts            — chunk generation (shared with client)
    persistence.ts    — SQLite read/write
    protocol.ts       — message type definitions
    audition.ts       — absorbs audition walker management
  db/
    commons.db
```

**Game loop (20Hz, 50ms tick):**
```typescript
setInterval(() => {
  tickNPCs();            // tile-collision-aware movement
  tickAuditionWalkers(); // advance walker positions
  evictStalePlayers();   // remove players not seen in 10s
  broadcastSnapshot();   // fixed-rate delta snapshots
  persistIfDue();        // SQLite every 20 ticks (1s)
}, 50);
```

**SQLite schema:**
```sql
CREATE TABLE npc_positions (name TEXT PRIMARY KEY, x REAL, y REAL, facing TEXT, updated_at INTEGER);
CREATE TABLE player_sessions (socket_id TEXT PRIMARY KEY, name TEXT, color TEXT, x REAL, y REAL, chunk_x INTEGER DEFAULT 0, chunk_y INTEGER DEFAULT 0, last_seen INTEGER);
CREATE TABLE world_events (id INTEGER PRIMARY KEY, event_type TEXT, payload TEXT, created_at INTEGER);
CREATE TABLE worn_path_tiles (chunk_x INTEGER, chunk_y INTEGER, tile_x INTEGER, tile_y INTEGER, visit_count INTEGER DEFAULT 0, last_visited INTEGER, PRIMARY KEY (chunk_x, chunk_y, tile_x, tile_y));
```

### WebSocket Protocol (revised)

**Server → Client (20Hz tick):**
```json
{
  "type": "tick",
  "seq": 1234,
  "t": 1711234567890,
  "players": { "<socketId>": { "name": "...", "color": "...", "x": 430, "y": 320, "facing": "left", "hopFrame": 0, "isAway": false, "chunkX": 0, "chunkY": 0 } },
  "npcs": [ { "name": "chairman", "x": 210, "y": 340, "facing": "right" } ],
  "congress": { "active": false }
}
```
NPCs and congress only sent when changed. Players filtered to same chunk in v2.

**Client → Server:**
```json
{ "type": "move", "seq": 42, "x": 430, "y": 320, "facing": "left", "chunkX": 0, "chunkY": 0 }
{ "type": "hop" }
{ "type": "status", "away": true }
{ "type": "chunk", "chunkX": 1, "chunkY": 0 }
```
Server validates: `|newPos - lastPos| <= PLAYER_SPEED * ticksSinceLastMove * 2`. Violators clamped.

**Tick rate rationale**: At 20Hz + lerp 0.2/frame × 60fps, clients reach 99% of target in ~350ms. NPC positions are at most 50ms stale — smooth for a walking-pace social game.

### Frontend: TypeScript Modules

Replace IIFE monolith with ES modules compiled by Bun.

```
/mnt/data/commons-client/
  src/
    main.ts              — init, rAF game loop
    renderer.ts          — pure render(state, ctx, frame) — no mutation
    input.ts             — keyboard/mouse/touch → InputState
    network.ts           — WS client, applies server ticks to world state
    state.ts             — WorldState (mutated only by network.ts + local-player.ts)
    entities/
      local-player.ts    — client-side prediction, chunk detection
      remote-player.ts   — interpolation, rendering
      npc.ts             — lerp, speech bubbles, drag-drop
      walker.ts          — audition walker rendering
    map/
      chunk.ts           — shared generation logic (mirrors server map.ts)
      renderer.ts        — tile cache, fountain animation
    ui/
      invoke-modal.ts
      audition-card.ts
      congress-modal.ts
  index.html             — thin shell
```

Key rules:
- `renderer.ts` is a pure function — no globals, no side effects
- Portrait rendering uses a passed-in context, not global `ctx` reassignment
- All state mutation through `state.ts`; renderer only reads

### Migration Phases

**Phase 1 — Extract game server** (no user-visible change)
1. Extract NPC tick + WS handler from clunger → new `commons-server` service
2. Add tile-map awareness to server NPC AI (NPCs stop walking through buildings)
3. Add SQLite persistence (NPC positions survive restarts)
4. Register as systemd user service, clunger proxies `/api/commons/ws`

**Phase 2 — Protocol upgrade**
5. 20Hz fixed tick loop
6. Player move validation (max-speed check)
7. Absorb audition walkers into commons-server, eliminate fragile proxy

**Phase 3 — Client modularisation** (this is NightOwl's TS migration task)
8. Port grazing.html module by module to `commons-client`
9. grazing.html becomes thin loader: `<script type="module" src="/commons/main.js">`
10. Sprite batch files imported as globals (refactor to named exports is Phase 4)

**Phase 4 — Shared types + chunk protocol**
11. Extract map generation into shared package used by both server and client
12. Server-side chunk registration (deterministic chunk layouts server-enforced)
13. Worn path tile counts become server-aggregated across all players

---

## 4. Open Questions

1. **Tick rate**: 20Hz proposed. 10Hz acceptable for NPC-only? More CPU-frugal.
2. **Worn paths shared**: Make tile wear server-aggregated across all players? (write amplification tradeoff)
3. **Chunk NPCs**: Do NPCs stay in chunk (0,0) only, invisible from other chunks? Or per-chunk NPC sets?
4. **Client prediction**: Currently client-authoritative for local player. Add server reconciliation?
5. **Audition consolidation**: Absorb into commons-server vs. keep as separate POSTer service?
6. **Binary protocol**: MessagePack for tick messages vs. staying with JSON (fine at <50 concurrent)?
7. **Hosting**: `commons.clung.us` subdomain vs. staying proxied through `clung.us/api/commons`?
8. **Sprite batches**: Refactor to ES module named exports or keep as globals in Phase 3?
9. **The Warthog**: Moves to commons-server with rest of game state, or deferred?

---

## 5. Player Consistency — Client-Side Prediction & Server Reconciliation

### The Core Problem

The server is the single source of truth for all game state. If the client waits for server confirmation before moving the player, a 100ms round-trip produces visibly laggy input. The solution is **client-side prediction**: the client applies movement locally and immediately, while the server simultaneously processes the same input and sends back authoritative results.

This works because the game world is deterministic enough: given position (x, y) and input (dx, dy), the result is fully predictable. When client and server agree, nothing corrective happens. When they diverge — due to server-side validation, lag, or conflicting state — the client reconciles.

### Input Sequence Numbers

Every `move` message includes a monotonically increasing `seq` number:

```typescript
// Client sends:
{ type: "move", seq: 42, dx: 1.8, dy: 0, chunkX: 0, chunkY: 0 }

// Server replies in tick message:
{ type: "tick", seq: 1234, lastProcessedInput: 42, players: { ... } }
```

The client keeps an **input buffer** (a ring buffer or array) of all inputs sent but not yet acknowledged:

```typescript
interface PendingInput {
  seq: number;
  dx: number;
  dy: number;
  timestamp: number;
}
const pendingInputs: PendingInput[] = [];
```

### Reconciliation Algorithm

When a tick arrives from the server:

1. Extract the authoritative position for the local player from `players[mySocketId]`.
2. Set local position to that authoritative value.
3. Discard all entries in `pendingInputs` where `seq <= lastProcessedInput`.
4. Re-apply all remaining (unacknowledged) inputs to the authoritative position in order.
5. The result is the corrected predicted present position.

```typescript
function reconcile(authX: number, authY: number, lastProcessedSeq: number) {
  localPlayer.x = authX;
  localPlayer.y = authY;
  // Drop acknowledged inputs
  pendingInputs = pendingInputs.filter(i => i.seq > lastProcessedSeq);
  // Replay unacknowledged inputs
  for (const input of pendingInputs) {
    localPlayer.x += input.dx;
    localPlayer.y += input.dy;
    applyCollision(localPlayer); // same logic as server
  }
}
```

### Snap vs. Smooth Correction

For a walking-pace social game, hard snap is acceptable when divergence is small. Use a **position error threshold**:

- If `|predictedPos - authPos| < 8px`: apply correction gradually over 3 frames (lerp factor 0.33/frame). Invisible to the player.
- If `|predictedPos - authPos| >= 8px`: hard snap immediately to avoid accumulating divergence.

The 8px threshold is approximately half a tile (tile size is typically 16–20px at canvas scale). Divergences this large indicate real desyncs (server clamped a wall-clip, chunk boundary edge case, etc.).

### Server-Side Input Validation

The server must reject inputs that exceed physical possibility:

```typescript
const MAX_SPEED = 1.8; // px/frame at 60fps
const MAX_MOVE_PER_TICK = MAX_SPEED * (1000 / SERVER_TICK_MS) * 1.5; // 1.5× tolerance for jitter

function validateMove(player: Player, newX: number, newY: number, ticksSince: number): boolean {
  const dist = Math.hypot(newX - player.x, newY - player.y);
  return dist <= MAX_SPEED * ticksSince * 60 * 1.5; // ticks × frames/s × tolerance
}
```

Violators are **clamped**, not disconnected (network jitter can cause burst inputs). Their position is set to the nearest valid location and echoed back.

### Inputs During High Latency

When RTT is elevated (>300ms), the pending input buffer grows longer. To prevent the reconciliation replay from becoming expensive:

- Cap the pending input buffer at **120 inputs** (2 seconds at 60fps). If it overflows, drop oldest inputs — this trades a potential pop correction for unbounded buffer growth.
- The server also enforces: if no input has been received from a player for **500ms**, their last-known velocity is zeroed. This prevents ghost-sliding.
- On reconnect, the client sends a `resync` message requesting the server's current authoritative position, clears its pending buffer, and restarts from there. No replays across reconnect boundaries.

### What the Server Considers Authoritative

The server is the sole authority for:
- Player position (x, y, chunkX, chunkY)
- Collision outcome (the server runs the same tile-map collision as the client)
- Chunk membership (which chunk a player is in, for broadcast filtering)
- Away/active status
- Hop timing (the server stores hopFrame to send to late-joining clients)

The client is authoritative for:
- Visual smoothing (lerp, correction blending)
- Rendering frame (hopFrame animation interpolation beyond what server stores)
- Input intent before server acknowledgment

---

## 6. Multiplayer Consistency — Snapshot Interpolation & Packet Loss

### Why Interpolation, Not Extrapolation (Dead Reckoning)

**Dead reckoning** predicts future positions by extending last known velocity. It works for racing games where direction changes are gradual. For the Commons, NPCs and players can stop instantly, turn 180°, or warp to a new chunk — making velocity-based extrapolation unreliable. Snapshot interpolation is the correct choice.

**Snapshot interpolation** renders entities at a point slightly in the past, interpolating between two known authoritative positions. The client always has two real data points to interpolate between, regardless of network jitter.

### Interpolation Buffer Design

The client maintains a **snapshot ring buffer** for each remote entity (players and NPCs). The default depth is **4 snapshots** (approximately 200ms of history at 20Hz). This depth is the primary knob for trading latency against smoothness under packet loss.

```typescript
const INTERPOLATION_DELAY_MS = 100; // render this many ms behind the newest snapshot
const SNAPSHOT_BUFFER_SIZE = 8;     // keep 8 snapshots = 400ms of history at 20Hz

interface Snapshot {
  seq: number;
  t: number;  // server timestamp in ms
  x: number;
  y: number;
  facing: "left" | "right";
}

class InterpolatedEntity {
  buffer: Snapshot[] = [];

  addSnapshot(snap: Snapshot) {
    this.buffer.push(snap);
    if (this.buffer.length > SNAPSHOT_BUFFER_SIZE) this.buffer.shift();
  }

  getInterpolatedPosition(now: number): { x: number; y: number } {
    const renderTime = now - INTERPOLATION_DELAY_MS;
    // Find the two snapshots bracketing renderTime
    for (let i = this.buffer.length - 1; i > 0; i--) {
      const newer = this.buffer[i];
      const older = this.buffer[i - 1];
      if (older.t <= renderTime && renderTime <= newer.t) {
        const t = (renderTime - older.t) / (newer.t - older.t);
        return { x: older.x + (newer.x - older.x) * t, y: older.y + (newer.y - older.y) * t };
      }
    }
    // Fallback: use newest known position (render time is ahead of buffer)
    const latest = this.buffer[this.buffer.length - 1];
    return latest ? { x: latest.x, y: latest.y } : { x: 0, y: 0 };
  }
}
```

### Choosing Interpolation Delay

The delay must be larger than your expected jitter, and smaller than what feels laggy:

| Scenario | Recommended delay |
|---|---|
| LAN / same datacenter | 50ms (1 tick at 20Hz) |
| Typical internet (50–80ms RTT) | 100ms (2 ticks) |
| High jitter / mobile | 150–200ms (3–4 ticks) |

For the Commons: **100ms default**, configurable. At 20Hz this means always interpolating between 2+ known positions. Remote players will appear ~100ms behind reality — imperceptible for a walking-pace game.

### Handling Packet Loss

When a snapshot doesn't arrive by the expected time:

1. **Continue interpolating** toward the last known position for up to **3 consecutive missed ticks** (150ms at 20Hz).
2. If still no update after 3 missed ticks: **freeze the entity** at its last known position. Do not extrapolate. Extrapolation in a 2D tile game quickly puts entities through walls.
3. If still no update after **500ms**: mark entity as `stale`. Stale remote players go greyscale (existing behavior). Stale NPCs freeze in place.
4. If still no update after **10s**: evict the entity from local state entirely.

```typescript
const MAX_INTERPOLATE_WITHOUT_UPDATE_MS = 150;  // 3 ticks
const STALE_THRESHOLD_MS = 500;
const EVICT_THRESHOLD_MS = 10_000;
```

### Jitter Buffer for NPC Updates

NPCs are broadcast at 20Hz but their behavior changes are sparse. The jitter buffer strategy for NPCs differs from players:

- NPCs use a **2-snapshot minimum** before interpolation starts (smaller than player buffer because NPCs don't need prediction — they're server-authoritative only).
- If the NPC buffer has only one snapshot (just connected, or recovering from loss), render at that exact position — no extrapolation.
- NPC snapshots include the **AI phase** (direction vector and ticks-until-next-change) so clients can locally simulate NPC movement between server ticks, falling back to snapshot correction each tick. This is a lightweight form of dead reckoning acceptable for NPCs because their tile collision is also validated server-side.

### When Client View Diverges from Server Truth

Causes of client/server divergence for remote entities:
1. **Packet reordering**: seq numbers on snapshots allow the client to drop out-of-order packets (discard if `snap.seq < lastAppliedSeq`).
2. **Jitter spike**: covered by buffer depth above.
3. **Clock skew**: Use server-provided timestamps (`t` field in tick messages), not local `Date.now()`, for interpolation math. On first connect, establish a `clockOffset = serverT - localNow` and apply to all subsequent calculations.
4. **Chunk mismatch**: If a remote player's `chunkX/chunkY` differs from the local player's, they are not rendered. If chunkX/chunkY suddenly changes (chunk transition), teleport the entity to the new chunk edge immediately — no interpolation across chunk boundaries.

---

## 7. Shared State — Authority, Persistence, and Conflict Resolution

### State Authority Matrix

| State type | Authoritative location | Persistence | Broadcast strategy |
|---|---|---|---|
| Player position | Server (validated) | In-memory; last-seen in SQLite | Delta per tick |
| Player away status | Server (echoed from client) | In-memory only | On change |
| NPC position | Server only | SQLite every 1s | Delta per tick |
| NPC AI phase | Server only | In-memory (reseeds on restart) | Piggybacked on position |
| Worn path tile counts | Server (aggregated) | SQLite every 60s | On request / chunk load |
| Chunk tile layout | Deterministic PRNG | Computed on demand | Never sent (clients generate from seed) |
| Congress state | Clunger (separate service) | Existing persistence | Polled every 10s by clients |
| Warthog state | Server | In-memory; SQLite checkpoint | On every change |
| Sprite vote winners | Clunger | Existing persistence | Polled every 30s |

### Worn Paths as Shared Persistent Constructs

Worn paths represent collective footfall — they should be visible to all players, not local per-browser. The rebuild makes them server-aggregated:

**Write path**: On every player move that lands on a walkable tile, the server increments `worn_path_tiles.visit_count` for that (chunkX, chunkY, tileX, tileY). This is debounced: a single player moving across a tile only increments once per 5s (to avoid write amplification from fast movement).

**Read path**: When a player enters a chunk, the server sends a `chunk_worn` message containing the tile coordinates and visit counts for tiles meeting the display threshold (≥10 visits). The client applies this as an overlay.

**Display thresholds** (preserved from original):
- ≥10 visits: light dirt overlay
- ≥30 visits: dark dirt overlay / worn path visual

**Decay**: The server decrements all visit counts by 1 every 24h for tiles not visited in the last 7 days. Tiles reaching 0 are deleted from the table.

**Conflict resolution**: Visit counts are integers incremented server-side. No client can decrement or set; it can only trigger an increment via movement. This is a last-write-wins append-only counter — no conflicts possible.

**Bandwidth**: A densely-worn chunk (say, 50 worn tiles) sends ~50 × 3 integers ≈ 150 bytes on chunk load. Not meaningful.

### Chunk State Synchronization

The server never sends tile layouts to clients. Instead:

1. Both server and client share identical chunk generation code (the `map.ts` module, a shared package in Phase 4).
2. The chunk seed function `chunkSeed(cx, cy)` is the only input. Given the same seed, server and client produce the same tile grid deterministically.
3. On chunk entry, the server sends only the **delta from the deterministic baseline**: worn path tile counts, any placed world events (if added in future), and the list of NPC IDs present in this chunk.

This means chunk transition is nearly free in bandwidth — a `chunk_enter` response might be 100–300 bytes total.

### Congress State Propagation

Congress state is owned by Clunger (separate service). Commons-server does not directly know congress state — it learns it through a lightweight poll:

- Commons-server polls `GET http://localhost:8081/api/congress/state` every **10s** (same interval as current client polling).
- On change, commons-server broadcasts a `congress` delta to all connected clients in chunk (0,0).
- Clients in other chunks do not receive congress updates (no pathfinding needed, no building to enter).
- The `congress` object in tick messages is omitted entirely when unchanged (delta compression).

During an active session, NPC debaters receive a `target` field in their server-side AI state: `{ target: { tileX: 5, tileY: 3 } }`. The server pathfinding ticks them toward COUNCIL_TILES each game loop tick.

### Server Restart Recovery

On restart, commons-server:
1. Loads NPC positions from SQLite `npc_positions` table (last persisted state, at most 1s stale).
2. Reseeds NPC AI direction vectors randomly (direction is transient, not persisted).
3. Loads worn path tile counts from `worn_path_tiles`.
4. All connected players are evicted (WebSocket connections don't survive process restart). Clients reconnect via normal WebSocket reconnect logic.

No player position is persisted across restarts — players resume from their last client-known position on reconnect, which the server accepts as an initial position (bypassing the speed-clamp check for the first input after a `welcome` message).

---

## 8. NPC Consistency — Server-Side AI & Client Rendering

### Server-Side Tile-Aware Collision

The current bug: `tickNpcs()` only bounces off canvas bounds, causing NPCs to walk through buildings and water server-side (client-side persona patterns work around this visually but diverge from server truth).

The fix: server must run the same tile collision logic as the client.

```typescript
// In npc-ai.ts
function isWalkable(cx: number, cy: number, px: number, py: number): boolean {
  const tileX = Math.floor(px / TILE_SIZE);
  const tileY = Math.floor(py / TILE_SIZE);
  const tile = getChunkTile(cx, cy, tileX, tileY);  // from shared map.ts
  return tile === TILE.GRASS || tile === TILE.PATH;
}

function tickNPC(npc: NPC) {
  const nextX = npc.x + npc.vx;
  const nextY = npc.y + npc.vy;
  if (isWalkable(npc.chunkX, npc.chunkY, nextX, nextY)) {
    npc.x = nextX;
    npc.y = nextY;
  } else {
    // Reflect velocity and try new random direction
    npc.vx = -npc.vx + (Math.random() - 0.5) * 0.5;
    npc.vy = -npc.vy + (Math.random() - 0.5) * 0.5;
    normalizeSpeed(npc);
    npc.ticksUntilDirectionChange = 0; // force immediate re-roll
  }
}
```

**Tile lookup on server**: The server holds an in-memory tile cache for chunk (0,0) (always loaded) and for any chunk that currently has players. Cache entries are evicted when no players remain in that chunk. For procedural chunks, tiles are generated on-demand using the shared PRNG — no disk I/O required.

### Persona-Specific AI Patterns Server-Side

Current state: persona patterns (Uncle Bob straight lines, Designer circles, Adelbert stalking) only exist in client code. Server NPCs all use the same random-walk pattern. This means the server and client disagree on NPC positions, and the client "wins" visually only because the server broadcasts are treated as soft corrections.

The rebuild makes server-side AI the authority. Each NPC has a typed AI strategy:

```typescript
type NPCStrategy =
  | { type: "random_walk"; ticksUntilChange: number }
  | { type: "straight_line"; heading: number; ticksOnHeading: number }
  | { type: "circular"; centerX: number; centerY: number; angle: number; radius: number }
  | { type: "stalker"; targetId: string }
  | { type: "pathfind"; waypoints: Point[]; currentWaypoint: number };

interface NPC {
  name: string;
  x: number; y: number;
  chunkX: number; chunkY: number;
  facing: "left" | "right";
  speed: number;
  strategy: NPCStrategy;
}
```

Persona strategy assignments (these are the server truth; client rendering adds cosmetic extras like bobbing):

| Persona | Server strategy | Speed (px/tick at 20Hz) |
|---|---|---|
| uncle-bob | straight_line, reflects off walls | 35 |
| designer | circular, random center chosen at spawn | 28 |
| adelbert | stalker → nearest NPC | 32 |
| the-kid | random_walk, very short direction intervals | 55 |
| chairman | pathfind → COUNCIL_TILES during congress, else random_walk | 25 |
| critic | random_walk | 30 |
| All others | random_walk | 30–35 |

### What Clients Do Without NPC Updates

If a client hasn't received an NPC update for more than **3 ticks (150ms)**:

1. **Continue rendering at interpolated/last-known position.** Do not freeze immediately — natural tick jitter can cause occasional gaps.
2. After **6 ticks (300ms)** with no update: locally simulate the NPC's last known velocity (basic dead reckoning), capped at 1 tile per simulation step. This keeps the NPC visually moving rather than frozen.
3. After **1s** with no update: freeze the NPC at last known position. Display no gossip bubbles.
4. After **10s** with no update: hide the NPC sprite entirely.

The local simulation in step 2 is tile-aware (client has the tile map). NPCs locally simulated will not walk through walls even during server silence.

### Congress Mode Pathfinding

During an active congress session, debater NPCs receive target waypoints from the server. Pathfinding is A* or simple greedy (for a sparse tile grid, greedy is sufficient):

```typescript
function greedyPathStep(npc: NPC, target: Point): Point {
  const dx = target.x - npc.x;
  const dy = target.y - npc.y;
  const dist = Math.hypot(dx, dy);
  if (dist < npc.speed) return target; // arrived
  return {
    x: npc.x + (dx / dist) * npc.speed,
    y: npc.y + (dy / dist) * npc.speed,
  };
}
```

The server only sends the NPC's current position — not the waypoints — so clients don't need to know the pathfinding target. Clients see smooth interpolated movement toward the council area.

---

## 9. Protocol Design — Sequencing, Delta, and Encoding

### Message Sequencing

Every server tick message includes a monotonically increasing `seq` counter. Clients use this to:
1. Detect out-of-order delivery: discard any tick with `seq < lastAppliedSeq`.
2. Detect gaps: if `seq > lastAppliedSeq + 1`, one or more ticks were dropped. Log the gap; interpolation handles the visual smoothing.
3. Acknowledge: the client includes `ackSeq` in outgoing move messages so the server knows which tick the client last received (useful for lag compensation and measuring RTT).

### Delta Compression

The server never sends unchanged data in tick messages:

**Players**: Only players whose position, facing, hop state, or away state changed since the last tick are included in the `players` object. The server tracks a `dirty` flag per player, cleared after each broadcast.

**NPCs**: The `npcs` array is omitted entirely from the tick if no NPC moved or changed state. For chunks with no active players, NPC ticks still run server-side but are not broadcast (no recipients).

**Congress**: The `congress` field is omitted if `congressState` hasn't changed since the last broadcast. Congress transitions (start/end) are sent once, not repeated.

**Worn paths**: Not in tick messages. Sent once on chunk entry via a `chunk_worn` message.

Estimated payload sizes at 20Hz with 10 concurrent players (all in chunk 0,0):
- All 10 players moved: ~10 × 60 bytes = 600 bytes/tick → 12KB/s per client (negligible)
- 5 players moved: ~300 bytes/tick → 6KB/s per client
- All-NPC tick (17 NPCs, all moved): ~17 × 40 bytes = 680 bytes added to the tick → ~13KB/s extra, sent once per NPC movement (not always all 17 every tick)

### JSON vs. Binary Encoding

**Decision: Stay with JSON for Phase 1–3. Evaluate MessagePack in Phase 4.**

Rationale:
- At <50 concurrent players, JSON overhead is not the bottleneck. A 600-byte JSON tick message is trivially handled.
- Binary protocols (MessagePack, Protobuf) reduce payload by ~50% and latency by ~40% at high message rates, but add complexity in debugging and tooling.
- MessagePack's browser support is good (`@msgpack/msgpack` npm package, ~10KB gzip), but switching requires updating both client and server simultaneously.
- The Bun WebSocket server handles JSON serialization natively and efficiently.

**Threshold for switching**: If player count exceeds 50 concurrent or tick bandwidth exceeds 1Mbit/s aggregate, adopt MessagePack. The protocol.ts type definitions make this a localized change.

### Reconnection Behavior

WebSocket reconnection uses **exponential backoff with jitter**:

```typescript
let reconnectDelay = 1000; // start at 1s
const MAX_DELAY = 30_000;
const JITTER = 0.3; // ±30%

function scheduleReconnect() {
  const jitter = 1 + (Math.random() * 2 - 1) * JITTER;
  setTimeout(connect, reconnectDelay * jitter);
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
}
```

On successful reconnect:
1. Client sends `{ type: "hello", name: "...", color: "..." }` to re-register.
2. Server sends `welcome` with new `socket_id` and current server tick `seq`.
3. Client clears its pending input buffer (no replays across reconnect boundaries).
4. Client clears its snapshot buffer for all remote entities (stale interpolation data).
5. Server sends a full snapshot (not delta) as the first tick after `welcome`, so the client has a clean baseline.
6. Player position on reconnect: client submits its last local position as the initial move. Server accepts it (speed clamp bypassed for the first input after `welcome`).

**Reconnect storm mitigation**: The jitter component ensures that if the server restarts and 20 clients reconnect simultaneously, their reconnect attempts are spread across a ~10s window rather than arriving at once.

### Tick Rate & Timing Summary

| Parameter | Value | Rationale |
|---|---|---|
| Server tick rate | 20Hz (50ms) | Balance between smoothness and CPU load |
| NPC update rate | 20Hz (same tick) | Eliminate 500ms NPC lag |
| Snapshot interpolation delay | 100ms | 2 ticks of buffer, imperceptible at walking pace |
| Interpolation buffer size | 8 snapshots | 400ms of history; handles short jitter spikes |
| Position error snap threshold | 8px | ~half a tile; larger divergence snaps immediately |
| Position error smooth threshold | <8px | Blend over 3 frames at lerp 0.33 |
| Max pending input buffer | 120 inputs | 2s at 60fps; drop oldest on overflow |
| Player eviction (no input) | 10s | Stale detection, existing behavior |
| NPC persistence interval | 1s (every 20 ticks) | SQLite write every 1s |
| Worn path persistence interval | 60s | Low write pressure |
| Max position delta per tick | speed × ticks × 1.5 | 1.5× tolerance for burst inputs |
| Input velocity zero timeout | 500ms no input | Prevents ghost-sliding |
| Reconnect initial delay | 1s ± 30% jitter | Quick recovery for brief drops |
| Reconnect max delay | 30s | Caps backoff |
| Clock offset calculation | On first `welcome` | `serverT - localNow`; applied to all interpolation |

---

## 10. Future Considerations

### Binary Protocol Migration Path

If bandwidth becomes a concern, MessagePack migration is a localized change in `protocol.ts`:

```typescript
// Before: JSON
ws.send(JSON.stringify(tickMessage));

// After: MessagePack
import { encode, decode } from "@msgpack/msgpack";
ws.send(encode(tickMessage)); // Uint8Array
```

Client-side, `ws.binaryType = "arraybuffer"` and decode on receipt. No protocol redesign needed — same message structures, different encoding.

### Lag Compensation (Future, if combat is added)

For actions like "throwing an item" or any projectile, the server would need server-side rewind: when a throw event arrives, rewind world state to `event.timestamp - clientRTT`, evaluate hit against historical positions, and confirm or deny. The `Vault` snapshot history (8 snapshots = 400ms at 20Hz) provides exactly this history window. For the current walking-pace Commons, lag compensation is not needed.

### Scaling Beyond a Single Server

The current architecture (single Bun process) handles the expected load (<50 concurrent). If the Commons ever needs to scale:
- Shard by chunk: each chunk can be its own room on a separate process
- Use Redis pub/sub for cross-shard player visibility (rare at chunk boundaries)
- Colyseus or Nakama provide these primitives out of the box if a framework migration is ever warranted

### Per-Chunk NPC Sets

Currently all 17 NPCs exist only in chunk (0,0). A future option is per-chunk NPC populations — each procedural chunk has 2–3 randomly assigned NPCs from the roster. This would require:
- NPC → chunk ownership tracking in SQLite
- Chunk entry/exit messages triggering NPC visibility updates
- Congress pathfinding only affects chunk (0,0) NPCs regardless
