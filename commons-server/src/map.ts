// Tile map: chunk generation and walkability
// Tile IDs: 0=grass, 1=path, 2=water, 3=building, 4=tree, 5=rock, 6=fountain
//
// IMPORTANT: These dimensions must match the client (commons-v2/src/map/chunk.ts).
// Client uses CANVAS_W=1000, CANVAS_H=700, TILE=20px → COLS=50, ROWS=35.
// Server uses same: CHUNK_TILES_W=50, CHUNK_TILES_H=35, TILE_SIZE=20px.

import type { ChunkData } from "./protocol.ts";

export const TILE = {
  GRASS: 0,
  PATH: 1,
  WATER: 2,
  BUILDING: 3,
  TREE: 4,
  ROCK: 5,
  FOUNTAIN: 6,
} as const;

// Tile types that are not walkable
const SOLID_TILES = new Set([TILE.WATER, TILE.BUILDING, TILE.TREE, TILE.ROCK, TILE.FOUNTAIN]);

// Dimensions must match client: commons-v2/src/state.ts COLS=50, ROWS=35, TILE=20
export const CHUNK_TILES_W = 50;  // tiles per chunk (width) — matches client COLS
export const CHUNK_TILES_H = 35;  // tiles per chunk (height) — matches client ROWS
export const TILE_SIZE = 20;      // pixels per tile — matches client TILE

// mulberry32 PRNG — deterministic per seed
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkSeed(cx: number, cy: number): number {
  // Deterministic hash of chunk coordinates
  return (((cx * 73856093) ^ (cy * 19349663)) >>> 0);
}

// ─── Tile setter helper ───────────────────────────────────────────────────────

function setTile(tiles: number[][], col: number, row: number, t: number): void {
  const W = CHUNK_TILES_W;
  const H = CHUNK_TILES_H;
  if (col >= 0 && col < W && row >= 0 && row < H) tiles[col][row] = t;
}

function fillRect(tiles: number[][], colMin: number, colMax: number, rowMin: number, rowMax: number, t: number): void {
  for (let r = rowMin; r <= rowMax; r++) {
    for (let c = colMin; c <= colMax; c++) {
      setTile(tiles, c, r, t);
    }
  }
}

// ─── Chunk 00 section builders ────────────────────────────────────────────────

function setChunk00Paths(tiles: number[][]): void {
  const W = CHUNK_TILES_W;
  const H = CHUNK_TILES_H;
  for (let c = 0; c < W; c++) { setTile(tiles, c, 17, TILE.PATH); setTile(tiles, c, 18, TILE.PATH); }
  for (let r = 0; r < H; r++) { setTile(tiles, 24, r, TILE.PATH); setTile(tiles, 25, r, TILE.PATH); }
}

function setChunk00Buildings(tiles: number[][]): void {
  fillRect(tiles, 2, 8, 2, 6, TILE.BUILDING);     // congress building
  fillRect(tiles, 40, 47, 2, 6, TILE.BUILDING);    // top-right (dungeon entrance)
  setTile(tiles, 43, 7, TILE.PATH);                 // dungeon doorway
  fillRect(tiles, 38, 46, 26, 31, TILE.BUILDING);  // bottom-right
}

function setChunk00Water(tiles: number[][]): void {
  fillRect(tiles, 4, 10, 22, 27, TILE.WATER);
}

function setChunk00Trees(tiles: number[][]): void {
  const W = CHUNK_TILES_W;
  const H = CHUNK_TILES_H;
  const treeTiles: [number, number][] = [
    [1,1],[12,1],[35,1],[48,1],
    [3,8],[14,8],[38,8],[47,8],
    [10,10],[30,10],[45,10],
    [2,14],[20,14],[44,14],
    [5,20],[15,20],[35,20],[48,20],
    [18,22],[40,22],
    [3,28],[20,28],[47,28],
    [8,32],[30,32],[46,32],
    [1,33],[48,33],
    [14,34],[35,34],
  ];
  for (const [tc, tr] of treeTiles) {
    if (tc < W && tr < H && tiles[tc][tr] === TILE.GRASS) {
      tiles[tc][tr] = TILE.TREE;
    }
  }
}

function setChunk00Rocks(tiles: number[][]): void {
  const W = CHUNK_TILES_W;
  const H = CHUNK_TILES_H;
  const rockTiles: [number, number][] = [
    [22,9],[40,11],[12,15],[32,16],[27,21],[14,25],[35,29],[12,31],[40,33],
  ];
  for (const [rc, rr] of rockTiles) {
    if (rc < W && rr < H && tiles[rc][rr] === TILE.GRASS) {
      tiles[rc][rr] = TILE.ROCK;
    }
  }
}

/**
 * Build the hand-crafted chunk (0,0) tile grid.
 * Must match the client layout in commons-v2/src/map/chunk.ts generateChunk00 exactly.
 * Client uses row-major Uint8Array[] indexed [row][col]; server uses col-major number[][x][y].
 * Both must agree on which tiles are solid so NPC walkability matches what players see.
 *
 * Client layout (row,col):
 *   Horizontal path: rows 17-18, all cols
 *   Vertical path: all rows, cols 24-25
 *   Pond: rows 22-27, cols 4-10
 *   Congress building: rows 2-6, cols 2-8
 *   Building top-right: rows 2-6, cols 40-47
 *   Building bottom-right: rows 26-31, cols 38-46
 *   Trees: scattered (see list below)
 *   Rocks: scattered (see list below)
 *   Fountain: rows 13-15, cols 19-21
 */
function buildChunk00(): number[][] {
  const W = CHUNK_TILES_W; // 50 cols
  const H = CHUNK_TILES_H; // 35 rows
  const tiles: number[][] = Array.from({ length: W }, () => Array.from<number>({ length: H }).fill(TILE.GRASS));

  setChunk00Paths(tiles);
  setChunk00Water(tiles);
  setChunk00Buildings(tiles);
  setChunk00Trees(tiles);
  setChunk00Rocks(tiles);
  fillRect(tiles, 19, 21, 13, 15, TILE.FOUNTAIN);

  return tiles;
}

// ─── Procedural chunk section builders ───────────────────────────────────────

type RandFn = () => number;

function procScatterTrees(tiles: number[][], rand: RandFn): void {
  const W = CHUNK_TILES_W;
  const H = CHUNK_TILES_H;
  for (let r = 2; r < H - 2; r++) {
    for (let c = 2; c < W - 2; c++) {
      const inCenter = (c >= 15 && c <= 35 && r >= 12 && r <= 23);
      if (!inCenter && rand() < 0.10) tiles[c][r] = TILE.TREE;
    }
  }
}

function procPlacePonds(tiles: number[][], rand: RandFn): void {
  const W = CHUNK_TILES_W;
  const H = CHUNK_TILES_H;
  const numPonds = 1 + Math.floor(rand() * 3);
  for (let p = 0; p < numPonds; p++) {
    const pr = 5 + Math.floor(rand() * (H - 12));
    const pc = 5 + Math.floor(rand() * (W - 12));
    const pw = 3 + Math.floor(rand() * 5);
    const ph = 2 + Math.floor(rand() * 4);
    for (let wr = pr; wr < Math.min(pr + ph, H - 3); wr++) {
      for (let wc = pc; wc < Math.min(pc + pw, W - 3); wc++) {
        tiles[wc][wr] = TILE.WATER;
      }
    }
  }
}

function procPlaceRocks(tiles: number[][], rand: RandFn): void {
  const W = CHUNK_TILES_W;
  const H = CHUNK_TILES_H;
  const numRocks = 3 + Math.floor(rand() * 6);
  for (let k = 0; k < numRocks; k++) {
    const rr = 2 + Math.floor(rand() * (H - 4));
    const rc = 2 + Math.floor(rand() * (W - 4));
    if (tiles[rc][rr] === TILE.GRASS) tiles[rc][rr] = TILE.ROCK;
  }
}

function procCarvePath(tiles: number[][], rand: RandFn): void {
  const W = CHUNK_TILES_W;
  const H = CHUNK_TILES_H;
  if (rand() < 0.5) {
    const pathRow = 3 + Math.floor(rand() * (H - 6));
    for (let c = 0; c < W; c++) {
      if (tiles[c][pathRow] === TILE.TREE || tiles[c][pathRow] === TILE.ROCK) tiles[c][pathRow] = TILE.PATH;
    }
  } else {
    const pathCol = 3 + Math.floor(rand() * (W - 6));
    for (let r = 0; r < H; r++) {
      if (tiles[pathCol][r] === TILE.TREE || tiles[pathCol][r] === TILE.ROCK) tiles[pathCol][r] = TILE.PATH;
    }
  }
}

function procClearEdgeCorridors(tiles: number[][]): void {
  const W = CHUNK_TILES_W;
  const H = CHUNK_TILES_H;
  const midC = Math.floor(W / 2);
  const midR = Math.floor(H / 2);
  for (let i = -5; i <= 5; i++) {
    if (tiles[midC + i]?.[0] !== 0) tiles[midC + i][0] = TILE.GRASS;
    if (tiles[midC + i]?.[1] !== 0) tiles[midC + i][1] = TILE.GRASS;
    if (tiles[midC + i]?.[H - 1] !== 0) tiles[midC + i][H - 1] = TILE.GRASS;
    if (tiles[midC + i]?.[H - 2] !== 0) tiles[midC + i][H - 2] = TILE.GRASS;
    if (tiles[0]?.[midR + i] !== 0) tiles[0][midR + i] = TILE.GRASS;
    if (tiles[1]?.[midR + i] !== 0) tiles[1][midR + i] = TILE.GRASS;
    if (tiles[W - 1]?.[midR + i] !== 0) tiles[W - 1][midR + i] = TILE.GRASS;
    if (tiles[W - 2]?.[midR + i] !== 0) tiles[W - 2][midR + i] = TILE.GRASS;
  }
}

/**
 * Build a procedurally generated chunk using deterministic PRNG.
 * Must match client's generateChunk logic in commons-v2/src/map/chunk.ts.
 */
function buildProceduralChunk(cx: number, cy: number): number[][] {
  const W = CHUNK_TILES_W; // 50 cols
  const H = CHUNK_TILES_H; // 35 rows
  const rand = mulberry32(chunkSeed(cx, cy));
  const tiles: number[][] = Array.from({ length: W }, () => Array.from<number>({ length: H }).fill(TILE.GRASS));

  procScatterTrees(tiles, rand);
  procPlacePonds(tiles, rand);
  procPlaceRocks(tiles, rand);

  const numPaths = 1 + Math.floor(rand() * 2);
  for (let pp = 0; pp < numPaths; pp++) {
    procCarvePath(tiles, rand);
  }

  procClearEdgeCorridors(tiles);
  return tiles;
}

/**
 * Derive walkability grid from tile grid.
 * walkable[x][y] = true if a character can stand on that tile.
 */
function buildWalkability(tiles: number[][]): boolean[][] {
  return tiles.map((col) =>
    col.map((tile) => !SOLID_TILES.has(tile))
  );
}

/**
 * Build or retrieve a ChunkData for the given chunk coordinates.
 */
export function buildChunk(cx: number, cy: number): ChunkData {
  let tiles: number[][];
  if (cx === 0 && cy === 0) {
    tiles = buildChunk00();
  } else {
    tiles = buildProceduralChunk(cx, cy);
  }
  const walkable = buildWalkability(tiles);
  return { cx, cy, tiles, walkable };
}

/**
 * Convert pixel coordinates to tile coordinates.
 */
export function pixelToTile(px: number, py: number): { tx: number; ty: number } {
  return {
    tx: Math.floor(px / TILE_SIZE),
    ty: Math.floor(py / TILE_SIZE),
  };
}

/**
 * Check if a pixel position is walkable within a chunk.
 */
export function isPixelWalkable(px: number, py: number, chunk: ChunkData): boolean {
  const { tx, ty } = pixelToTile(px, py);
  if (tx < 0 || ty < 0 || tx >= CHUNK_TILES_W || ty >= CHUNK_TILES_H) return false;
  return chunk.walkable[tx][ty];
}
