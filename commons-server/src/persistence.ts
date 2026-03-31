// SQLite persistence module — WAL mode, prepared statements
import { Database } from "bun:sqlite";
import type { WorldState } from "./protocol.ts";
import { mkdirSync } from "fs";

// Ensure db directory exists
mkdirSync("./db", { recursive: true });

export const db = new Database("./db/commons.db", { create: true });

// WAL mode for concurrent access
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");

// Schema
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
  CREATE TABLE IF NOT EXISTS dungeon_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    outcome TEXT NOT NULL,
    floor_reached INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    party TEXT NOT NULL,
    run_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dungeon_runs_floor ON dungeon_runs(floor_reached DESC, run_at DESC);
`);

// Prepared statements
const saveNpcStmt = db.prepare(
  "INSERT OR REPLACE INTO npc_positions (name, x, y, facing, updated_at) VALUES (?, ?, ?, ?, ?)"
);
const savePlayerStmt = db.prepare(
  "INSERT OR REPLACE INTO player_sessions (socket_id, name, color, x, y, chunk_x, chunk_y, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
const loadNpcsStmt = db.prepare("SELECT name, x, y, facing FROM npc_positions");
const upsertWornPathStmt = db.prepare(
  `INSERT INTO worn_path_tiles (chunk_x, chunk_y, tile_x, tile_y, visit_count, last_visited)
   VALUES (?, ?, ?, ?, 1, ?)
   ON CONFLICT (chunk_x, chunk_y, tile_x, tile_y) DO UPDATE
   SET visit_count = visit_count + 1, last_visited = excluded.last_visited`
);

const persistTx = db.transaction((world: WorldState) => {
  const now = Date.now();
  for (const npc of world.npcs.values()) {
    saveNpcStmt.run(npc.name, npc.x, npc.y, npc.facing, now);
  }
  for (const player of world.players.values()) {
    savePlayerStmt.run(
      player.socketId,
      player.name,
      player.color,
      player.x,
      player.y,
      player.chunkX,
      player.chunkY,
      player.lastSeen
    );
  }
});

export function persistState(world: WorldState): void {
  try {
    persistTx(world);
  } catch (err) {
    console.error("[persistence] persistState failed:", err);
    throw err;
  }
}

export function loadNpcPositions(): Map<string, { x: number; y: number; facing: string }> {
  const rows = loadNpcsStmt.all() as { name: string; x: number; y: number; facing: string }[];
  const result = new Map<string, { x: number; y: number; facing: string }>();
  for (const row of rows) {
    result.set(row.name, { x: row.x, y: row.y, facing: row.facing });
  }
  return result;
}

export function recordWornPath(chunkX: number, chunkY: number, tileX: number, tileY: number): void {
  try {
    upsertWornPathStmt.run(chunkX, chunkY, tileX, tileY, Date.now());
  } catch (err) {
    console.error("[persistence] recordWornPath failed:", err);
    throw err;
  }
}

const loadWornPathsStmt = db.prepare(
  "SELECT tile_x, tile_y, visit_count FROM worn_path_tiles WHERE chunk_x = ? AND chunk_y = ? ORDER BY visit_count DESC LIMIT 500"
);

export function loadWornPathsForChunk(
  chunkX: number,
  chunkY: number
): { tileX: number; tileY: number; visitCount: number }[] {
  try {
    const rows = loadWornPathsStmt.all(chunkX, chunkY) as {
      tile_x: number;
      tile_y: number;
      visit_count: number;
    }[];
    return rows.map((r) => ({ tileX: r.tile_x, tileY: r.tile_y, visitCount: r.visit_count }));
  } catch (err) {
    console.error("[persistence] loadWornPathsForChunk failed:", err);
    throw err;
  }
}

/**
 * Reset all NPC positions in the DB to the center of chunk (0,0).
 * Center is the path intersection at cols 24-25, rows 17-18:
 *   x = 24 * TILE_SIZE + TILE_SIZE/2 = 490px
 *   y = 17 * TILE_SIZE + TILE_SIZE/2 = 350px
 * Returns the target pixel coords so callers can sync in-memory state.
 */
export function resetNpcPositionsInDb(npcNames: string[]): { x: number; y: number } {
  const CENTER_X = 490; // path intersection, walkable, center of chunk (0,0)
  const CENTER_Y = 350;
  const now = Date.now();
  const resetTx = db.transaction(() => {
    for (const name of npcNames) {
      saveNpcStmt.run(name, CENTER_X, CENTER_Y, "right", now);
    }
  });
  try {
    resetTx();
    console.log(`[persistence] Reset ${npcNames.length} NPC positions to center (${CENTER_X}, ${CENTER_Y})`);
  } catch (err) {
    console.error("[persistence] resetNpcPositionsInDb failed:", err);
    throw err;
  }
  return { x: CENTER_X, y: CENTER_Y };
}

// ─── Dungeon run leaderboard ─────────────────────────────────────────────────

export interface RunPartyMember {
  name: string;
  personaSlug: string;
}

const saveRunStmt = db.prepare(
  "INSERT INTO dungeon_runs (outcome, floor_reached, duration_ms, party, run_at) VALUES (?, ?, ?, ?, ?)"
);

export function saveRunResult(
  outcome: "victory" | "death",
  floorReached: number,
  durationMs: number,
  party: RunPartyMember[]
): void {
  try {
    saveRunStmt.run(outcome, floorReached, durationMs, JSON.stringify(party), Date.now());
    console.log(`[persistence] Saved dungeon run: ${outcome} floor ${floorReached} (${party.length} players)`);
  } catch (err) {
    console.error("[persistence] saveRunResult failed:", err);
    throw err;
  }
}

export interface LeaderboardEntry {
  rank: number;
  outcome: "victory" | "death";
  floorReached: number;
  durationMs: number;
  party: RunPartyMember[];
  runAt: number;
}

const getLeaderboardStmt = db.prepare(
  `SELECT outcome, floor_reached, duration_ms, party, run_at
   FROM dungeon_runs
   ORDER BY floor_reached DESC, run_at DESC
   LIMIT 10`
);

export function getLeaderboard(): LeaderboardEntry[] {
  try {
    const rows = getLeaderboardStmt.all() as {
      outcome: string;
      floor_reached: number;
      duration_ms: number;
      party: string;
      run_at: number;
    }[];
    return rows.map((row, i) => ({
      rank: i + 1,
      outcome: row.outcome as "victory" | "death",
      floorReached: row.floor_reached,
      durationMs: row.duration_ms,
      party: JSON.parse(row.party) as RunPartyMember[],
      runAt: row.run_at,
    }));
  } catch (err) {
    console.error("[persistence] getLeaderboard failed:", err);
    throw err;
  }
}
