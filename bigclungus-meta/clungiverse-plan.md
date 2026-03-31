# Clungiverse Roguelite — Implementation Plan

## Architecture Overview

```
                          clung.us (nginx)
                               |
                 +-------------+-------------+
                 |                           |
          /api/* routes                /commons-v2/*
          /commons-ws                  /clungiverse/*
                 |                           |
          +------+------+            Static HTML/JS/CSS
          |             |            (commons-client build
       clunger       commons-        + clungiverse-client
       :8081         server          build)
       (HTTP,        :8090
        auth,        (Commons
        congress,     world WS)
        votes)           |
                         |
              +----------+---------+
              |                    |
         Commons WS          Clungiverse WS
         /ws                 /dungeon-ws
         (20Hz tick,         (16Hz tick,
          NPC AI,             combat,
          overworld)          dungeon gen)
              |                    |
              +--------+-----------+
                       |
                  SQLite (shared)
                  data/clungiverse.db
```

Clungiverse runs inside the existing commons-server process. Adds a second WebSocket endpoint (`/dungeon-ws`) and a second game loop (dungeon tick at 16Hz). Shares player identity and SQLite database with Commons.

16Hz (62.5ms per tick) chosen because the dungeon loop does more work per tick (enemy AI, projectile physics, collision detection). At 60fps client-side with interpolation, 16Hz is visually smooth.

## Complete Data Model

### SQLite (persistent)

Existing migrations 001 + 002 cover personas, players, runs, enemies, powerups, lobbies.

**Migration 003 needed:**

```sql
CREATE TABLE IF NOT EXISTS floor_templates (
    floor_number INTEGER PRIMARY KEY,
    room_count_min INTEGER NOT NULL,
    room_count_max INTEGER NOT NULL,
    enemy_budget INTEGER NOT NULL,
    boss_type_id INTEGER REFERENCES boss_types(id),
    powerup_choices INTEGER NOT NULL DEFAULT 3,
    enemy_scaling REAL NOT NULL DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS run_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    tick INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    player_id INTEGER REFERENCES players(id),
    payload TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS leaderboard_cache (
    player_id INTEGER PRIMARY KEY REFERENCES players(id),
    fastest_clear_ms INTEGER,
    most_kills_run INTEGER,
    highest_floor INTEGER,
    total_victories INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO floor_templates VALUES
    (1, 5, 7, 30, 1, 3, 1.0),
    (2, 6, 9, 50, 2, 3, 1.4),
    (3, 7, 10, 70, 3, 2, 1.8);
```

### In-Memory (ephemeral during runs)

`DungeonInstance` held in `Map<string, DungeonInstance>`:
- Players: positions, HP, stats, cooldowns, powerup stacks, input queue
- Enemies: positions, HP, AI state, targets, cooldowns
- Projectiles: position, velocity, lifetime, damage
- AoE zones: position, radius, ticks remaining
- Boss: HP, phase, AI state
- Floor layout: BSP-generated rooms, corridors, tile grid

### SQLite vs Memory Summary

| Data | Storage | Reason |
|------|---------|--------|
| Catalogs (personas, enemies, powerups) | SQLite | Static reference, loaded at boot |
| Players (accounts) | SQLite | Persistent identity |
| Completed runs/stats | SQLite | Post-run persistence |
| Run events | SQLite | Append during run, queryable after |
| Floor templates | SQLite | Configuration |
| Active dungeon state | Memory | Too high-frequency; reconstructed on failure |
| Entity positions/HP | Memory | Ephemeral combat state |
| Projectiles | Memory | Sub-second lifetime |

## Combat System

### Damage Formula
```
rawDamage = attackerATK * (1 + random(-0.1, 0.1))
mitigation = defenderDEF * 0.5
finalDamage = max(1, floor(rawDamage - mitigation))
critChance = attackerLCK * 0.02
if crit: finalDamage *= 1.5
```

### Auto-Attack
- Range: 28px (~1.5 tiles)
- Rate: one per `600 / (1 + SPD * 0.05)` ms
- Target: nearest enemy in range (server resolves)

### Spacebar Powers

| Persona | Power | Mechanic |
|---------|-------|----------|
| Holden | Overwhelming Force | 60° cone stun, 48px range, 1.5s stun, 8s CD |
| Broseidon | Progressive Overload | 10s window, +2 ATK per kill, stacks reset on expire, 10s CD |
| Deckard Cain | Stay Awhile and Listen | 48px radius zone, 4s duration, 40% slow + reveal, 12s CD |
| Galactus | Consume | Execute enemies <20% HP within 36px, heal 15% maxHP per kill, 6s CD |

### Enemy AI

- **Crawler**: chase nearest player, melee attack on contact, no telegraph
- **Spitter**: maintain 128-192px distance, fire projectiles at player position
- **Brute**: 1s telegraph warning, then 3x speed charge in straight line, 2s vulnerable cooldown after

### Hit Detection
- Circle-vs-circle collisions (players r=10, enemies r=8-16, projectiles r=4)
- I-frames: 500ms (8 ticks) after taking damage

## Dungeon Generation (BSP)

1. Start with rectangle (80x60 tiles for F1, scales up)
2. Recursively split 4-6 times (min leaf 8x8)
3. Place rooms in leaves (min 5x5, random padding)
4. L-shaped corridors connect BSP siblings (3-tile width)
5. Doors where corridors meet rooms (locked during combat)
6. Enemy spawning per room from floor's enemy budget
7. Tile encoding: flat Uint8Array (0=floor, 1=wall, 2=door_closed, 3=door_open, 4=spawn, 5=treasure, 6=shrine, 7=stairs)
8. Full floor layout sent to clients on entry (~2-4KB)

## Multiplayer Protocol

### Client → Server
- `d_move`: dx, dy, facing (every frame with input)
- `d_attack`: request auto-attack
- `d_power`: spacebar power activation
- `d_ready`: persona selection in lobby
- `d_start`: host starts the run
- `d_pick_powerup`: between-floor choice

### Server → Client (16Hz)
- `d_tick`: all player positions, enemy positions, projectiles, AoE zones, boss state, events
- `d_floor`: full floor layout on entry (~2-4KB)
- `d_powerup_choices`: 3 options between floors
- `d_results`: post-run stats
- `d_lobby`: lobby state updates

### Bandwidth: ~34KB/s per client (4 players, 20 enemies, 10 projectiles)

### Disconnect: 60s grace period, invincible while AFK, full resync on reconnect

## File Structure

```
commons-server/src/
  dungeon/
    dungeon-manager.ts      -- Instance lifecycle
    dungeon-loop.ts         -- 16Hz tick
    dungeon-generation.ts   -- BSP floor gen
    combat.ts               -- Damage, auto-attack, powers, hit detection
    enemy-ai.ts             -- Per-behavior AI
    boss-ai.ts              -- Boss phases
    dungeon-protocol.ts     -- Message types
    loot.ts                 -- Powerup selection
    collision.ts            -- Circle/rect collisions
    stats.ts                -- Base + powerup modifiers

clungiverse-client/src/
  main.ts                   -- Canvas init, scene management
  scenes/
    lobby.ts                -- Persona select, party, start
    dungeon.ts              -- Gameplay
    transition.ts           -- Powerup selection
    results.ts              -- Post-run stats
  renderer/
    canvas.ts               -- Camera, viewport
    dungeon-renderer.ts     -- Tile rendering
    entity-renderer.ts      -- Players, enemies, projectiles
    hud.ts                  -- HP, floor, party roster, timer
    particles.ts            -- VFX
    minimap.ts              -- Room overview
  entities/
    local-player.ts         -- Client prediction + input
    remote-player.ts        -- Interpolation
    enemy.ts                -- Enemy interpolation
    projectile.ts           -- Projectile rendering
    boss.ts                 -- Boss rendering
  network/
    dungeon-network.ts      -- WS connection
  sprites/
    sprite-loader.ts        -- Spritesheet loading
```

## Sprites: Phase 1 (Zero Art Assets)

Procedural canvas drawing (same approach as existing Commons sprites):
- Players: colored circles with role-specific shapes
- Enemies: red-tinted shapes (crawler=small circle, spitter=diamond, brute=large square)
- Bosses: larger pulsing versions
- Tiles: solid colored rectangles

`SpriteProvider` interface for swapping procedural → spritesheet later.

## Build Phases

### Phase 0: Foundation (1-2 days)
- Migration 003, project scaffold, /dungeon-ws endpoint, lobby REST routes, dungeon-manager skeleton, clungiverse.html shell

### Phase 1: Solo Dungeon Core (3-5 days)
- BSP generation, 16Hz tick, single-player movement, enemy spawning, all 3 enemy AIs, damage formula, auto-attack, hit detection, i-frames, client dungeon rendering, WASD + prediction, HUD

### Phase 2: Powers and Bosses (2-3 days)
- All 4 spacebar powers, AoE zones, 3 boss encounters, powerup selection between floors, death/VFX, results screen

### Phase 3: Multiplayer (3-4 days)
- Lobby system, persona selection UI, multiplayer tick broadcast, remote player interpolation, enemy aggro switching, disconnect/reconnect

### Phase 4: Hub Integration (1-2 days)
- Cave entrance in Commons, navigation to clungiverse.html, auth pass-through, run persistence

### Phase 5: Polish (ongoing)
- Difficulty tuning, leaderboards, audio, real pixel art, spectator mode, mobile controls, seed sharing

## Key Technical Decisions

1. **Same process**: Dungeon runs in commons-server (simpler, shared auth). Can extract to worker thread later if CPU-bound.
2. **Full server authority**: All combat server-side. Client prediction with reconciliation for movement.
3. **Canvas2D**: No WebGL needed at this scale. Matches existing Commons renderer.
4. **Full floor send**: 2-4KB per floor, sent once on entry. No streaming needed.
5. **Separate HTML page**: Own bundle, loaded only when entering dungeon. Auth cookie persists.
6. **No pathfinding**: Direct line-to-player + wall sliding. Enemies only live within their room.
