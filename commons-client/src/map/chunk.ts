// map/chunk.ts — Deterministic tile generation using the same seeded PRNG as grazing.html
// Must produce identical output for any given (cx, cy) to match the server and V1 client.

import { COLS, ROWS } from "../state.ts";

export const TILE_GRASS    = 0;
export const TILE_PATH     = 1;
export const TILE_WATER    = 2;
export const TILE_BUILDING = 3;
export const TILE_TREE     = 4;
export const TILE_ROCK     = 5;
export const TILE_FOUNTAIN = 6;

// Exact hash from grazing.html
function chunkSeed(cx: number, cy: number): number {
  let h = cx * 374761393 + cy * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return h ^ (h >> 16);
}

// mulberry32-ish PRNG — matches grazing.html seededRand
function seededRand(seed: number): () => number {
  let s = seed;
  return function () {
    s = (s | 0) + (0x6D2B79F5 | 0) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hand-crafted chunk (0,0) — matches V1 grazing.html buildChunk00 exactly
function generateChunk00(): Uint8Array[] {
  const m: Uint8Array[] = [];
  for (let r = 0; r < ROWS; r++) m.push(new Uint8Array(COLS));

  // Horizontal path across middle (rows 17-18)
  for (let c = 0; c < COLS; c++) {
    m[17][c] = TILE_PATH;
    m[18][c] = TILE_PATH;
  }
  // Vertical path down center (cols 24-25)
  for (let r = 0; r < ROWS; r++) {
    m[r][24] = TILE_PATH;
    m[r][25] = TILE_PATH;
  }

  // Pond bottom-left area (rows 22-27, cols 4-10)
  for (let r = 22; r <= 27; r++) {
    for (let c = 4; c <= 10; c++) {
      m[r][c] = TILE_WATER;
    }
  }

  // Congress building top-left (rows 2-6, cols 2-8)
  for (let r = 2; r <= 6; r++) {
    for (let c = 2; c <= 8; c++) {
      m[r][c] = TILE_BUILDING;
    }
  }

  // Building top-right (rows 2-6, cols 40-47) — dungeon entrance
  for (let r = 2; r <= 6; r++) {
    for (let c = 40; c <= 47; c++) {
      if (c < COLS) m[r][c] = TILE_BUILDING;
    }
  }
  // Dungeon doorway path approach: row 7, col 43
  m[7][43] = TILE_PATH;

  // Building bottom-right (rows 26-31, cols 38-46)
  for (let r = 26; r <= 31; r++) {
    for (let c = 38; c <= 46; c++) {
      if (r < ROWS && c < COLS) m[r][c] = TILE_BUILDING;
    }
  }

  // Trees scattered (matching V1 exactly)
  const trees: [number, number][] = [
    [1,1],[1,12],[1,35],[1,48],
    [8,3],[8,14],[8,38],[8,47],
    [10,10],[10,30],[10,45],
    [14,2],[14,20],[14,44],
    [20,5],[20,15],[20,35],[20,48],
    [22,18],[22,40],
    [28,3],[28,20],[28,47],
    [32,8],[32,30],[32,46],
    [33,1],[33,48],
    [34,14],[34,35],
  ];
  for (const [tr, tc] of trees) {
    if (tr < ROWS && tc < COLS) m[tr][tc] = TILE_TREE;
  }

  // Rocks (matching V1 exactly)
  const rocks: [number, number][] = [
    [9,22],[11,40],[15,12],[16,32],[21,27],[25,14],[29,35],[31,12],[33,40],
  ];
  for (const [rr, rc] of rocks) {
    if (rr < ROWS && rc < COLS) m[rr][rc] = TILE_ROCK;
  }

  // Fountain — 3×3 near path intersection (rows 13-15, cols 19-21)
  for (let r = 13; r <= 15; r++) {
    for (let c = 19; c <= 21; c++) {
      m[r][c] = TILE_FOUNTAIN;
    }
  }

  return m;
}

// Procedural chunk generation — matches grazing.html generateChunk exactly
export function generateChunk(cx: number, cy: number): Uint8Array[] {
  if (cx === 0 && cy === 0) return generateChunk00();

  const m: Uint8Array[] = [];
  for (let r = 0; r < ROWS; r++) m.push(new Uint8Array(COLS));

  const rng = seededRand(chunkSeed(cx, cy));

  // Scatter trees (~10%) — keep 2-tile border clear
  for (let r = 2; r < ROWS - 2; r++) {
    for (let c = 2; c < COLS - 2; c++) {
      // Keep center 20x12 area mostly clear for NPCs
      const inCenter = (c >= 15 && c <= 35 && r >= 12 && r <= 23);
      if (inCenter) continue;
      if (rng() < 0.10) m[r][c] = TILE_TREE;
    }
  }

  // Scatter water clusters (~5%)
  const numPonds = 1 + Math.floor(rng() * 3);
  for (let p = 0; p < numPonds; p++) {
    const pr = 5 + Math.floor(rng() * (ROWS - 12));
    const pc = 5 + Math.floor(rng() * (COLS - 12));
    const pw = 3 + Math.floor(rng() * 5);
    const ph = 2 + Math.floor(rng() * 4);
    for (let wr = pr; wr < Math.min(pr + ph, ROWS - 3); wr++) {
      for (let wc = pc; wc < Math.min(pc + pw, COLS - 3); wc++) {
        m[wr][wc] = TILE_WATER;
      }
    }
  }

  // Scatter rocks
  const numRocks = 3 + Math.floor(rng() * 6);
  for (let k = 0; k < numRocks; k++) {
    const rr = 2 + Math.floor(rng() * (ROWS - 4));
    const rc = 2 + Math.floor(rng() * (COLS - 4));
    if (m[rr][rc] === 0) m[rr][rc] = TILE_ROCK;
  }

  // Add 1-2 path corridors
  const numPaths = 1 + Math.floor(rng() * 2);
  for (let pp = 0; pp < numPaths; pp++) {
    if (rng() < 0.5) {
      const pathRow = 3 + Math.floor(rng() * (ROWS - 6));
      for (let pc2 = 0; pc2 < COLS; pc2++) {
        if (m[pathRow][pc2] === TILE_TREE || m[pathRow][pc2] === TILE_ROCK) m[pathRow][pc2] = TILE_PATH;
      }
    } else {
      const pathCol = 3 + Math.floor(rng() * (COLS - 6));
      for (let pr2 = 0; pr2 < ROWS; pr2++) {
        if (m[pr2][pathCol] === TILE_TREE || m[pr2][pathCol] === TILE_ROCK) m[pr2][pathCol] = TILE_PATH;
      }
    }
  }

  // Always clear entry/exit corridors at each edge (middle 10 tiles)
  const midC = Math.floor(COLS / 2);
  const midR = Math.floor(ROWS / 2);
  for (let i = -5; i <= 5; i++) {
    if (m[0][midC + i] !== 0) m[0][midC + i] = 0;
    if (m[1][midC + i] !== 0) m[1][midC + i] = 0;
    if (m[ROWS - 1][midC + i] !== 0) m[ROWS - 1][midC + i] = 0;
    if (m[ROWS - 2][midC + i] !== 0) m[ROWS - 2][midC + i] = 0;
    if (m[midR + i][0] !== 0) m[midR + i][0] = 0;
    if (m[midR + i][1] !== 0) m[midR + i][1] = 0;
    if (m[midR + i][COLS - 1] !== 0) m[midR + i][COLS - 1] = 0;
    if (m[midR + i][COLS - 2] !== 0) m[midR + i][COLS - 2] = 0;
  }

  return m;
}

// Cache for generated chunks — LRU capped at MAX_CACHE_SIZE to prevent OOM on long sessions
const MAX_CACHE_SIZE = 16;
const chunkCache = new Map<string, Uint8Array[]>();
const cacheOrder: string[] = [];

export function getChunk(cx: number, cy: number): Uint8Array[] {
  const key = `${cx},${cy}`;
  let chunk = chunkCache.get(key);
  if (chunk) {
    // Move to end (most recently used)
    const idx = cacheOrder.indexOf(key);
    if (idx !== -1) cacheOrder.splice(idx, 1);
    cacheOrder.push(key);
    return chunk;
  }
  chunk = generateChunk(cx, cy);
  chunkCache.set(key, chunk);
  cacheOrder.push(key);
  // Evict oldest entry if over cap
  if (cacheOrder.length > MAX_CACHE_SIZE) {
    const oldest = cacheOrder.shift()!;
    chunkCache.delete(oldest);
  }
  return chunk;
}

export function isTileBlocking(tile: number): boolean {
  return tile === TILE_WATER || tile === TILE_BUILDING || tile === TILE_TREE || tile === TILE_ROCK || tile === TILE_FOUNTAIN;
}
