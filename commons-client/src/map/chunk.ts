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

function fillRect00(m: Uint8Array[], rMin: number, rMax: number, cMin: number, cMax: number, tile: number): void {
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      if (r < ROWS && c < COLS) m[r][c] = tile;
    }
  }
}

function placeSprites00(m: Uint8Array[], positions: [number, number][], tile: number): void {
  for (const [r, c] of positions) {
    if (r < ROWS && c < COLS) m[r][c] = tile;
  }
}

function addPaths00(m: Uint8Array[]): void {
  for (let c = 0; c < COLS; c++) { m[17][c] = TILE_PATH; m[18][c] = TILE_PATH; }
  for (let r = 0; r < ROWS; r++) { m[r][24] = TILE_PATH; m[r][25] = TILE_PATH; }
  m[7][43] = TILE_PATH;
}

// Hand-crafted chunk (0,0) — matches V1 grazing.html buildChunk00 exactly
function generateChunk00(): Uint8Array[] {
  const m: Uint8Array[] = [];
  for (let r = 0; r < ROWS; r++) m.push(new Uint8Array(COLS));

  addPaths00(m);
  fillRect00(m, 22, 27, 4, 10, TILE_WATER);
  fillRect00(m, 2, 6, 2, 8, TILE_BUILDING);
  fillRect00(m, 2, 6, 40, 47, TILE_BUILDING);
  fillRect00(m, 26, 31, 38, 46, TILE_BUILDING);

  placeSprites00(m, [
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
  ], TILE_TREE);

  placeSprites00(m, [
    [9,22],[11,40],[15,12],[16,32],[21,27],[25,14],[29,35],[31,12],[33,40],
  ], TILE_ROCK);

  fillRect00(m, 13, 15, 19, 21, TILE_FOUNTAIN);

  return m;
}

function scatterTrees(m: Uint8Array[], rng: () => number): void {
  for (let r = 2; r < ROWS - 2; r++) {
    for (let c = 2; c < COLS - 2; c++) {
      const inCenter = (c >= 15 && c <= 35 && r >= 12 && r <= 23);
      if (!inCenter && rng() < 0.10) m[r][c] = TILE_TREE;
    }
  }
}

function scatterWater(m: Uint8Array[], rng: () => number): void {
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
}

function scatterRocks(m: Uint8Array[], rng: () => number): void {
  const numRocks = 3 + Math.floor(rng() * 6);
  for (let k = 0; k < numRocks; k++) {
    const rr = 2 + Math.floor(rng() * (ROWS - 4));
    const rc = 2 + Math.floor(rng() * (COLS - 4));
    if (m[rr][rc] === 0) m[rr][rc] = TILE_ROCK;
  }
}

function isObstacle(tile: number): boolean {
  return tile === TILE_TREE || tile === TILE_ROCK;
}

function clearCells(m: Uint8Array[], positions: [number, number][]): void {
  for (const [r, c] of positions) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS && m[r][c] !== 0) m[r][c] = 0;
  }
}

function addHorizontalPath(m: Uint8Array[], rng: () => number): void {
  const pathRow = 3 + Math.floor(rng() * (ROWS - 6));
  for (let c = 0; c < COLS; c++) {
    if (isObstacle(m[pathRow][c])) m[pathRow][c] = TILE_PATH;
  }
}

function addVerticalPath(m: Uint8Array[], rng: () => number): void {
  const pathCol = 3 + Math.floor(rng() * (COLS - 6));
  for (let r = 0; r < ROWS; r++) {
    if (isObstacle(m[r][pathCol])) m[r][pathCol] = TILE_PATH;
  }
}

function addPathCorridors(m: Uint8Array[], rng: () => number): void {
  const numPaths = 1 + Math.floor(rng() * 2);
  for (let pp = 0; pp < numPaths; pp++) {
    if (rng() < 0.5) addHorizontalPath(m, rng);
    else addVerticalPath(m, rng);
  }
}

function clearEdgeCorridors(m: Uint8Array[]): void {
  const midC = Math.floor(COLS / 2);
  const midR = Math.floor(ROWS / 2);
  const topBottom: [number, number][] = [];
  const leftRight: [number, number][] = [];
  for (let i = -5; i <= 5; i++) {
    topBottom.push([0, midC + i], [1, midC + i], [ROWS - 1, midC + i], [ROWS - 2, midC + i]);
    leftRight.push([midR + i, 0], [midR + i, 1], [midR + i, COLS - 1], [midR + i, COLS - 2]);
  }
  clearCells(m, topBottom);
  clearCells(m, leftRight);
}

// Procedural chunk generation — matches grazing.html generateChunk exactly
export function generateChunk(cx: number, cy: number): Uint8Array[] {
  if (cx === 0 && cy === 0) return generateChunk00();

  const m: Uint8Array[] = [];
  for (let r = 0; r < ROWS; r++) m.push(new Uint8Array(COLS));

  const rng = seededRand(chunkSeed(cx, cy));

  scatterTrees(m, rng);
  scatterWater(m, rng);
  scatterRocks(m, rng);
  addPathCorridors(m, rng);
  clearEdgeCorridors(m);

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
    const oldest = cacheOrder.shift();
    if (oldest) chunkCache.delete(oldest);
  }
  return chunk;
}

export function isTileBlocking(tile: number): boolean {
  return tile === TILE_WATER || tile === TILE_BUILDING || tile === TILE_TREE || tile === TILE_ROCK || tile === TILE_FOUNTAIN;
}
