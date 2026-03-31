// BSP Dungeon Generator for the Clungiverse roguelite
// Standalone module — no external dependencies beyond types defined here.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FloorTemplate {
  floor_number: number;
  room_count_min: number;
  room_count_max: number;
  enemy_budget: number;
  boss_type_id: number | null;
  powerup_choices: number;
  enemy_scaling: number;
}

export interface EnemyVariant {
  id: number;
  name: string;
  behavior: "crawler" | "spitter" | "brute";
  hp: number;
  atk: number;
  def: number;
  spd: number;
  floor_min: number;
  /** Cost against the floor's enemy_budget */
  budget_cost: number;
}

export type RoomType = "combat" | "treasure" | "rest" | "boss" | "start";

export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: RoomType;
}

export interface Corridor {
  /** Sequence of {x,y} tiles forming the corridor path (3-wide) */
  points: { x: number; y: number }[];
  roomA: number;
  roomB: number;
}

export interface EnemySpawn {
  variantId: number;
  x: number;
  y: number;
  roomId: number;
}

export interface FloorLayout {
  width: number;
  height: number;
  rooms: Room[];
  corridors: Corridor[];
  tileGrid: Uint8Array;
  enemySpawns: EnemySpawn[];
  seed: string;
  floorNumber: number;
}

// Tile encoding
export const Tile = {
  FLOOR: 0,
  WALL: 1,
  DOOR_CLOSED: 2,
  DOOR_OPEN: 3,
  SPAWN_POINT: 4,
  TREASURE_CHEST: 5,
  REST_SHRINE: 6,
  STAIRS: 7,
} as const;
export type TileType = (typeof Tile)[keyof typeof Tile];

// ─── Seeded PRNG (mulberry32) ────────────────────────────────────────────────

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

class SeededRNG {
  private state: number;

  constructor(seed: string) {
    this.state = hashSeed(seed);
    if (this.state === 0) this.state = 1;
  }

  /** Returns float in [0, 1) */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Pick random element from array */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Shuffle array in place (Fisher-Yates) */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// ─── BSP Tree ────────────────────────────────────────────────────────────────

interface BSPNode {
  x: number;
  y: number;
  w: number;
  h: number;
  left: BSPNode | null;
  right: BSPNode | null;
  room: Room | null;
}

const MIN_LEAF_SIZE = 30;
const MIN_ROOM_SIZE = 25;

function preferredSplitH(node: BSPNode, rng: SeededRNG): boolean {
  if (node.w > node.h * 1.4) return false;
  if (node.h > node.w * 1.4) return true;
  return rng.next() < 0.5;
}

function canSplitAxis(size: number): boolean {
  return size >= MIN_LEAF_SIZE * 2;
}

function chooseSplitHorizontal(node: BSPNode, rng: SeededRNG): boolean | null {
  let splitH = preferredSplitH(node, rng);
  // If preferred axis is too small, try the other
  if (splitH && !canSplitAxis(node.h)) splitH = false;
  else if (!splitH && !canSplitAxis(node.w)) splitH = true;
  // Validate final choice
  if (splitH ? !canSplitAxis(node.h) : !canSplitAxis(node.w)) return null;
  return splitH;
}

function applySplit(node: BSPNode, splitH: boolean, rng: SeededRNG): [BSPNode, BSPNode] {
  if (splitH) {
    const splitAt = rng.int(MIN_LEAF_SIZE, node.h - MIN_LEAF_SIZE);
    node.left = { x: node.x, y: node.y, w: node.w, h: splitAt, left: null, right: null, room: null };
    node.right = { x: node.x, y: node.y + splitAt, w: node.w, h: node.h - splitAt, left: null, right: null, room: null };
  } else {
    const splitAt = rng.int(MIN_LEAF_SIZE, node.w - MIN_LEAF_SIZE);
    node.left = { x: node.x, y: node.y, w: splitAt, h: node.h, left: null, right: null, room: null };
    node.right = { x: node.x + splitAt, y: node.y, w: node.w - splitAt, h: node.h, left: null, right: null, room: null };
  }
  return [node.left, node.right];
}

function splitBSP(node: BSPNode, depth: number, maxDepth: number, rng: SeededRNG): void {
  if (depth >= maxDepth) return;
  if (node.w < MIN_LEAF_SIZE * 2 && node.h < MIN_LEAF_SIZE * 2) return;

  const splitH = chooseSplitHorizontal(node, rng);
  if (splitH === null) return;

  const [left, right] = applySplit(node, splitH, rng);
  splitBSP(left, depth + 1, maxDepth, rng);
  splitBSP(right, depth + 1, maxDepth, rng);
}

function getLeaves(node: BSPNode): BSPNode[] {
  if (!node.left && !node.right) return [node];
  const leaves: BSPNode[] = [];
  if (node.left) leaves.push(...getLeaves(node.left));
  if (node.right) leaves.push(...getLeaves(node.right));
  return leaves;
}

// ─── Room Placement ──────────────────────────────────────────────────────────

function placeRooms(leaves: BSPNode[], rng: SeededRNG): Room[] {
  const rooms: Room[] = [];
  let id = 0;

  for (const leaf of leaves) {
    const maxW = leaf.w - 2; // leave 1-tile border
    const maxH = leaf.h - 2;
    if (maxW < MIN_ROOM_SIZE || maxH < MIN_ROOM_SIZE) continue;

    const roomW = rng.int(MIN_ROOM_SIZE, maxW);
    const roomH = rng.int(MIN_ROOM_SIZE, maxH);
    const roomX = leaf.x + rng.int(1, leaf.w - roomW - 1);
    const roomY = leaf.y + rng.int(1, leaf.h - roomH - 1);

    const room: Room = { id: id++, x: roomX, y: roomY, w: roomW, h: roomH, type: "combat" };
    leaf.room = room;
    rooms.push(room);
  }

  return rooms;
}

// ─── Room Type Assignment ────────────────────────────────────────────────────

function rollRoomType(rng: SeededRNG): RoomType {
  const roll = rng.next();
  if (roll < 0.10) return "rest";
  if (roll < 0.25) return "treasure";
  return "combat";
}

function guaranteeRoomType(rooms: Room[], type: RoomType, minRooms: number, rng: SeededRNG): void {
  if (rooms.length <= minRooms) return;
  const types = new Set(rooms.map((r) => r.type));
  if (!types.has(type)) {
    const candidates = rooms.filter((r) => r.type === "combat");
    if (candidates.length > 0) rng.pick(candidates).type = type;
  }
}

function assignRoomTypes(rooms: Room[], hasBoss: boolean, rng: SeededRNG): void {
  if (rooms.length === 0) return;

  rooms[0].type = "start";
  if (hasBoss && rooms.length > 1) {
    rooms[rooms.length - 1].type = "boss";
  }

  for (let i = 1; i < rooms.length; i++) {
    if (rooms[i].type !== "combat") continue;
    rooms[i].type = rollRoomType(rng);
  }

  guaranteeRoomType(rooms, "treasure", 3, rng);
  guaranteeRoomType(rooms, "rest", 4, rng);
}

// ─── Corridor Connection ─────────────────────────────────────────────────────

function getRoomCenter(room: Room): { x: number; y: number } {
  return { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
}

/** Find any room within a BSP subtree */
function findRoom(node: BSPNode): Room | null {
  if (node.room) return node.room;
  if (node.left) {
    const r = findRoom(node.left);
    if (r) return r;
  }
  if (node.right) {
    const r = findRoom(node.right);
    if (r) return r;
  }
  return null;
}

function buildLPath(
  aCenter: { x: number; y: number },
  bCenter: { x: number; y: number },
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const dx = bCenter.x > aCenter.x ? 1 : -1;
  const dy = bCenter.y > aCenter.y ? 1 : -1;
  for (let x = aCenter.x; x !== bCenter.x; x += dx) {
    points.push({ x, y: aCenter.y });
  }
  for (let y = aCenter.y; y !== bCenter.y + dy; y += dy) {
    points.push({ x: bCenter.x, y });
  }
  return points;
}

/** Connect BSP siblings with L-shaped corridors */
function connectBSP(node: BSPNode, corridors: Corridor[]): void {
  if (!node.left || !node.right) return;
  connectBSP(node.left, corridors);
  connectBSP(node.right, corridors);
  const roomA = findRoom(node.left);
  const roomB = findRoom(node.right);
  if (!roomA || !roomB) return;
  const points = buildLPath(getRoomCenter(roomA), getRoomCenter(roomB));
  corridors.push({ points, roomA: roomA.id, roomB: roomB.id });
}

// ─── Tile Grid ───────────────────────────────────────────────────────────────

type TileSetFn = (x: number, y: number, tile: TileType) => void;
type TileGetFn = (x: number, y: number) => TileType;

function carveRooms(rooms: Room[], set: TileSetFn): void {
  for (const room of rooms) {
    for (let ry = room.y; ry < room.y + room.h; ry++) {
      for (let rx = room.x; rx < room.x + room.w; rx++) {
        set(rx, ry, Tile.FLOOR);
      }
    }
  }
}

function carveCorridors(corridors: Corridor[], get: TileGetFn, set: TileSetFn): void {
  const CORRIDOR_HALF_WIDTH = 2;
  for (const corridor of corridors) {
    for (const pt of corridor.points) {
      for (let dy = -CORRIDOR_HALF_WIDTH; dy <= CORRIDOR_HALF_WIDTH; dy++) {
        for (let dx = -CORRIDOR_HALF_WIDTH; dx <= CORRIDOR_HALF_WIDTH; dx++) {
          const tx = pt.x + dx;
          const ty = pt.y + dy;
          if (get(tx, ty) === Tile.WALL) {
            set(tx, ty, Tile.FLOOR);
          }
        }
      }
    }
  }
}

function isAdjacentToRoom(rx: number, ry: number, room: Room, get: TileGetFn): boolean {
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  for (const [dx, dy] of dirs) {
    if (get(rx + dx, ry + dy) === Tile.FLOOR && isInRoom(rx + dx, ry + dy, room)) return true;
  }
  return false;
}

function checkDoorTile(rx: number, ry: number, room: Room, get: TileGetFn, set: TileSetFn): void {
  if (rx >= room.x && rx < room.x + room.w && ry >= room.y && ry < room.y + room.h) return;
  if (get(rx, ry) !== Tile.FLOOR) return;
  if (isAdjacentToRoom(rx, ry, room, get)) {
    set(rx, ry, Tile.DOOR_CLOSED);
  }
}

function placeDoors(rooms: Room[], get: TileGetFn, set: TileSetFn): void {
  for (const room of rooms) {
    for (let rx = room.x - 1; rx <= room.x + room.w; rx++) {
      for (let ry = room.y - 1; ry <= room.y + room.h; ry++) {
        checkDoorTile(rx, ry, room, get, set);
      }
    }
  }
}

function placeSpecialTiles(rooms: Room[], set: TileSetFn): void {
  for (const room of rooms) {
    const cx = Math.floor(room.x + room.w / 2);
    const cy = Math.floor(room.y + room.h / 2);
    switch (room.type) {
      case "start": set(cx, cy, Tile.SPAWN_POINT); break;
      case "treasure": set(cx, cy, Tile.TREASURE_CHEST); break;
      case "rest": set(cx, cy, Tile.REST_SHRINE); break;
      case "boss": set(cx, cy, Tile.SPAWN_POINT); break;
    }
  }
  const stairsRoom = rooms[rooms.length - 1];
  const sx = stairsRoom.x + stairsRoom.w - 2;
  const sy = stairsRoom.y + stairsRoom.h - 2;
  if (sx > stairsRoom.x && sy > stairsRoom.y) {
    set(sx, sy, Tile.STAIRS);
  }
}

function buildTileGrid(
  width: number,
  height: number,
  rooms: Room[],
  corridors: Corridor[]
): Uint8Array {
  const grid = new Uint8Array(width * height);
  grid.fill(Tile.WALL);

  const set = (x: number, y: number, tile: TileType): void => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      grid[y * width + x] = tile;
    }
  };

  const get = (x: number, y: number): TileType => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      return grid[y * width + x] as TileType;
    }
    return Tile.WALL;
  };

  carveRooms(rooms, set);
  carveCorridors(corridors, get, set);
  placeDoors(rooms, get, set);
  placeSpecialTiles(rooms, set);

  return grid;
}

function isInRoom(x: number, y: number, room: Room): boolean {
  return x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
}

// ─── Enemy Spawning ──────────────────────────────────────────────────────────

function distributeBudget(combatRooms: Room[], totalBudget: number, rng: SeededRNG): Map<number, number> {
  const roomBudgets = new Map<number, number>();
  let remaining = totalBudget;
  const basePer = Math.floor(totalBudget / combatRooms.length);
  for (const room of combatRooms) {
    const variance = rng.int(-Math.floor(basePer * 0.3), Math.floor(basePer * 0.3));
    const budget = Math.max(1, basePer + variance);
    roomBudgets.set(room.id, Math.min(budget, remaining));
    remaining -= Math.min(budget, remaining);
    if (remaining <= 0) break;
  }
  if (remaining > 0) {
    const target = combatRooms.find((r) => r.type === "boss") ?? combatRooms[0];
    roomBudgets.set(target.id, (roomBudgets.get(target.id) ?? 0) + remaining);
  }
  return roomBudgets;
}

function spawnInRoom(
  room: Room, budget: number, available: EnemyVariant[], spawns: EnemySpawn[], rng: SeededRNG,
): void {
  const minX = room.x + 1;
  const maxX = room.x + room.w - 2;
  const minY = room.y + 1;
  const maxY = room.y + room.h - 2;
  if (maxX <= minX || maxY <= minY) return;
  let remaining = budget;
  let attempts = 0;
  while (remaining > 0 && attempts < 100) {
    attempts++;
    const variant = rng.pick(available);
    if (variant.budget_cost > remaining) {
      const cheaper = available.filter((v) => v.budget_cost <= remaining);
      if (cheaper.length === 0) break;
      const picked = rng.pick(cheaper);
      spawns.push({ variantId: picked.id, x: rng.int(minX, maxX), y: rng.int(minY, maxY), roomId: room.id });
      remaining -= picked.budget_cost;
    } else {
      spawns.push({ variantId: variant.id, x: rng.int(minX, maxX), y: rng.int(minY, maxY), roomId: room.id });
      remaining -= variant.budget_cost;
    }
  }
}

function spawnEnemies(
  rooms: Room[],
  floorNumber: number,
  enemyBudget: number,
  enemyScaling: number,
  enemyVariants: EnemyVariant[],
  rng: SeededRNG
): EnemySpawn[] {
  const spawns: EnemySpawn[] = [];
  const available = enemyVariants.filter((v) => v.floor_min <= floorNumber);
  if (available.length === 0) return spawns;
  const combatRooms = rooms.filter((r) => r.type === "combat" || r.type === "boss");
  if (combatRooms.length === 0) return spawns;

  const totalBudget = Math.floor(enemyBudget * enemyScaling);
  const roomBudgets = distributeBudget(combatRooms, totalBudget, rng);

  for (const room of combatRooms) {
    spawnInRoom(room, roomBudgets.get(room.id) ?? 0, available, spawns, rng);
  }
  return spawns;
}

// ─── Floor Size ──────────────────────────────────────────────────────────────

function floorDimensions(floorNumber: number): { width: number; height: number } {
  // F1: 200x150, scales up slightly per floor
  const scale = 1 + (floorNumber - 1) * 0.15;
  return {
    width: Math.floor(200 * scale),
    height: Math.floor(150 * scale),
  };
}

function splitDepth(floorNumber: number): number {
  // 5 for F1, up to 7 for higher floors (deeper splits for larger maps)
  return Math.min(5 + Math.floor((floorNumber - 1) / 2), 7);
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export function generateFloor(
  seed: string,
  floorNumber: number,
  floorTemplate: FloorTemplate,
  enemyVariants: EnemyVariant[]
): FloorLayout {
  const rng = new SeededRNG(seed);
  const { width, height } = floorDimensions(floorNumber);
  const depth = splitDepth(floorNumber);

  // Build BSP tree
  const root: BSPNode = { x: 0, y: 0, w: width, h: height, left: null, right: null, room: null };
  splitBSP(root, 0, depth, rng);

  // Place rooms in leaves
  const leaves = getLeaves(root);
  const rooms = placeRooms(leaves, rng);

  if (rooms.length === 0) {
    throw new Error(`BSP produced zero rooms for seed="${seed}" floor=${String(floorNumber)}`);
  }

  // Assign room types
  const hasBoss = floorTemplate.boss_type_id !== null;
  assignRoomTypes(rooms, hasBoss, rng);

  // Connect rooms via corridors
  const corridors: Corridor[] = [];
  connectBSP(root, corridors);

  // Build tile grid
  const tileGrid = buildTileGrid(width, height, rooms, corridors);

  // Spawn enemies
  const enemySpawns = spawnEnemies(
    rooms,
    floorNumber,
    floorTemplate.enemy_budget,
    floorTemplate.enemy_scaling,
    enemyVariants,
    rng
  );

  return {
    width,
    height,
    rooms,
    corridors,
    tileGrid,
    enemySpawns,
    seed,
    floorNumber,
  };
}

// ─── ASCII Test ──────────────────────────────────────────────────────────────

const TILE_CHARS: Record<number, string> = {
  [Tile.WALL]: "#",
  [Tile.FLOOR]: ".",
  [Tile.DOOR_CLOSED]: "D",
  [Tile.DOOR_OPEN]: "d",
  [Tile.SPAWN_POINT]: "S",
  [Tile.TREASURE_CHEST]: "T",
  [Tile.REST_SHRINE]: "R",
  [Tile.STAIRS]: ">",
};

export function floorToAscii(layout: FloorLayout): string {
  const lines: string[] = [];
  for (let y = 0; y < layout.height; y++) {
    let line = "";
    for (let x = 0; x < layout.width; x++) {
      const tile = layout.tileGrid[y * layout.width + x];
      // Check if enemy is at this position
      const enemy = layout.enemySpawns.find((e) => e.x === x && e.y === y);
      if (enemy) {
        line += "E";
      } else {
        line += TILE_CHARS[tile] ?? "?";
      }
    }
    lines.push(line);
  }
  return lines.join("\n");
}

// ─── Self-test (run with: bun run src/dungeon/dungeon-generation.ts) ─────────

if (import.meta.main) {
  const testTemplate: FloorTemplate = {
    floor_number: 1,
    room_count_min: 5,
    room_count_max: 7,
    enemy_budget: 30,
    boss_type_id: 1,
    powerup_choices: 3,
    enemy_scaling: 1.0,
  };

  const testVariants: EnemyVariant[] = [
    { id: 1, name: "Crawler", behavior: "crawler", hp: 20, atk: 5, def: 2, spd: 3, floor_min: 1, budget_cost: 3 },
    { id: 2, name: "Spitter", behavior: "spitter", hp: 15, atk: 8, def: 1, spd: 2, floor_min: 1, budget_cost: 5 },
    { id: 3, name: "Brute", behavior: "brute", hp: 40, atk: 12, def: 5, spd: 1, floor_min: 2, budget_cost: 8 },
  ];

  const layout = generateFloor("test-seed-42", 1, testTemplate, testVariants);

  console.log(`Floor ${String(layout.floorNumber)} (${String(layout.width)}x${String(layout.height)})`);
  console.log(`Seed: ${layout.seed}`);
  console.log(`Rooms: ${String(layout.rooms.length)}`);
  for (const room of layout.rooms) {
    console.log(`  Room ${String(room.id)}: ${room.type} at (${String(room.x)},${String(room.y)}) ${String(room.w)}x${String(room.h)}`);
  }
  console.log(`Corridors: ${String(layout.corridors.length)}`);
  console.log(`Enemy spawns: ${String(layout.enemySpawns.length)}`);
  console.log(`Tile grid size: ${String(layout.tileGrid.length)} bytes`);
  console.log();
  console.log(floorToAscii(layout));

  // Verify determinism: same seed produces identical layout
  const layout2 = generateFloor("test-seed-42", 1, testTemplate, testVariants);
  const match = layout.tileGrid.every((v, i) => v === layout2.tileGrid[i]);
  console.log(`\nDeterminism check: ${match ? "PASS" : "FAIL"}`);

  // Test floor 3 (bigger, no brutes at floor_min=2 but they qualify for floor 3)
  const template3: FloorTemplate = {
    floor_number: 3,
    room_count_min: 7,
    room_count_max: 10,
    enemy_budget: 70,
    boss_type_id: 3,
    powerup_choices: 2,
    enemy_scaling: 1.8,
  };
  const layout3 = generateFloor("floor-3-seed", 3, template3, testVariants);
  console.log(`\nFloor 3: ${String(layout3.width)}x${String(layout3.height)}, ${String(layout3.rooms.length)} rooms, ${String(layout3.enemySpawns.length)} enemies`);
}
