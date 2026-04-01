// Clungiverse v2 — Tile Grid Renderer (PixiJS Graphics)
// Phase 4 visual enhancements: wall autotiling (4-bit bitmask), room theming by type

import { Container, Graphics } from 'pixi.js';
import {
  TILE_SIZE,
  TILE_FLOOR,
  TILE_WALL,
  TILE_DOOR_CLOSED,
  TILE_DOOR_OPEN,
  TILE_SPAWN,
  TILE_TREASURE,
  TILE_SHRINE,
  TILE_STAIRS,
  TEMP_POWERUP_META,
} from '../state';
import type { DungeonClientState, ClientRoom, RoomTheme } from '../state';

// Full-brightness tile colors (matching v1) — used for non-floor/non-spawn/non-corridor tiles
const TILE_COLORS: Record<number, number> = {
  [TILE_FLOOR]: 0xc2b280,
  [TILE_WALL]: 0x333333,
  [TILE_DOOR_CLOSED]: 0x8b5a2b,
  [TILE_DOOR_OPEN]: 0xa0784a,
  [TILE_SPAWN]: 0xc2b280,
  [TILE_TREASURE]: 0xdaa520,
  [TILE_SHRINE]: 0x2e8b57,
  [TILE_STAIRS]: 0x4682b4,
};

// Dimmed tile colors for explored-but-not-visible fog
const TILE_COLORS_DIM: Record<number, number> = {
  [TILE_FLOOR]: 0x7a7050,
  [TILE_WALL]: 0x222222,
  [TILE_DOOR_CLOSED]: 0x5a3a1b,
  [TILE_DOOR_OPEN]: 0x6a5030,
  [TILE_SPAWN]: 0x7a7050,
  [TILE_TREASURE]: 0x8a6810,
  [TILE_SHRINE]: 0x1e5a38,
  [TILE_STAIRS]: 0x2e5474,
};

// Enhancement B: Per-room-type floor color palettes (6 variants each)
const ROOM_FLOOR_VARIANTS: Record<RoomTheme, number[]> = {
  start:   [0xd4cba0, 0xd0c89a, 0xd6cfa8, 0xccc494, 0xdcd1ae, 0xc8bc8a],
  combat:  [0xc2b280, 0xbfae7a, 0xc5b888, 0xb8a874, 0xcabb8e, 0xbaa670],
  treasure:[0xd4b860, 0xd0b45a, 0xd6bc68, 0xccb054, 0xdcc26e, 0xc8a84a],
  rest:    [0xa8b880, 0xa4b47a, 0xacbc88, 0x9eb074, 0xb2c08e, 0x98a86a],
  boss:    [0xb89070, 0xb48c6a, 0xbc9478, 0xae8864, 0xc29a7e, 0xa88060],
};

// Dimmed variants (50% brightness approx)
const ROOM_FLOOR_VARIANTS_DIM: Record<RoomTheme, number[]> = {
  start:   [0x6a6650, 0x68644d, 0x6b6854, 0x66624a, 0x6e6957, 0x645e45],
  combat:  [0x615840, 0x60573d, 0x635c44, 0x5c543a, 0x655e47, 0x5d5433],
  treasure:[0x6a5c30, 0x685a2d, 0x6b5e34, 0x66582a, 0x6e6137, 0x645425],
  rest:    [0x545c40, 0x525a3d, 0x565e44, 0x4f583a, 0x596047, 0x4c5435],
  boss:    [0x5c4838, 0x5a4635, 0x5e4a3c, 0x574432, 0x614d3f, 0x544030],
};

// Corridor color variants (darker/cooler than room floors)
const CORRIDOR_VARIANTS: number[] = [0xa89870, 0xa59368, 0xab9d78, 0x9e8c64, 0xb0a07e, 0x988856];
const CORRIDOR_VARIANTS_DIM: number[] = [0x544c38, 0x534a34, 0x564f3c, 0x4f4632, 0x58503f, 0x4c442b];

// Wall colors for autotiling
const WALL_COLOR_BASE = 0x333333;
const WALL_COLOR_INTERIOR = 0x282828;
const WALL_HIGHLIGHT = 0xffffff;
const WALL_SHADOW = 0x000000;

// Precomputed room membership map: stores room theme index (0 = not in room / corridor)
// 1 = start, 2 = combat, 3 = treasure, 4 = rest, 5 = boss
const THEME_TO_INDEX: Record<RoomTheme, number> = { start: 1, combat: 2, treasure: 3, rest: 4, boss: 5 };
const INDEX_TO_THEME: RoomTheme[] = ['combat', 'start', 'combat', 'treasure', 'rest', 'boss'];

let roomMap: Uint8Array = new Uint8Array(0);
let roomMapW = 0;
let roomMapH = 0;

function rebuildRoomMap(rooms: ClientRoom[], gridW: number, gridH: number): void {
  if (gridW === roomMapW && gridH === roomMapH && roomMap.length === gridW * gridH) return;
  roomMapW = gridW;
  roomMapH = gridH;
  roomMap = new Uint8Array(gridW * gridH);
  for (const room of rooms) {
    const themeIdx = THEME_TO_INDEX[room.theme] ?? 2;
    for (let r = room.y; r < room.y + room.h; r++) {
      for (let c = room.x; c < room.x + room.w; c++) {
        if (r >= 0 && r < gridH && c >= 0 && c < gridW) {
          roomMap[r * gridW + c] = themeIdx;
        }
      }
    }
  }
}

export function invalidateRoomMap(): void {
  roomMapW = 0;
  roomMapH = 0;
}

function tileHash(col: number, row: number): number {
  return ((col * 7 + row * 13 + col * row * 3) >>> 0);
}

function getFloorColor(col: number, row: number, isDim: boolean, themeIdx: number): number {
  const h = tileHash(col, row);
  const idx = h % 6;
  if (themeIdx === 0) {
    // Corridor
    return isDim ? CORRIDOR_VARIANTS_DIM[idx] : CORRIDOR_VARIANTS[idx];
  }
  const theme = INDEX_TO_THEME[themeIdx] ?? 'combat';
  return isDim
    ? ROOM_FLOOR_VARIANTS_DIM[theme][idx]
    : ROOM_FLOOR_VARIANTS[theme][idx];
}

// Enhancement A: 4-bit wall bitmask for autotiling
function getWallMask(grid: number[], gridW: number, gridH: number, col: number, row: number): number {
  let mask = 0;
  // North
  if (row > 0 && grid[(row - 1) * gridW + col] === TILE_WALL) mask |= 1;
  // East
  if (col + 1 < gridW && grid[row * gridW + col + 1] === TILE_WALL) mask |= 2;
  // South
  if (row + 1 < gridH && grid[(row + 1) * gridW + col] === TILE_WALL) mask |= 4;
  // West
  if (col > 0 && grid[row * gridW + col - 1] === TILE_WALL) mask |= 8;
  return mask;
}

export class TileRenderer {
  container: Container;
  private gfx: Graphics;

  constructor() {
    this.container = new Container();
    this.gfx = new Graphics();
    this.container.addChild(this.gfx);
  }

  render(
    grid: number[],
    gridW: number,
    gridH: number,
    exploredTiles: Uint8Array,
    cameraX: number,
    cameraY: number,
    screenW: number,
    screenH: number,
    zoom: number,
    rooms: ClientRoom[],
  ): void {
    this.gfx.clear();

    // Rebuild room map if grid size changed
    rebuildRoomMap(rooms, gridW, gridH);

    const hasExplored = exploredTiles.length === gridW * gridH;

    // Calculate visible tile range from camera
    const halfW = screenW / (2 * zoom);
    const halfH = screenH / (2 * zoom);
    const startCol = Math.max(0, Math.floor((cameraX - halfW) / TILE_SIZE) - 1);
    const endCol = Math.min(gridW - 1, Math.ceil((cameraX + halfW) / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor((cameraY - halfH) / TILE_SIZE) - 1);
    const endRow = Math.min(gridH - 1, Math.ceil((cameraY + halfH) / TILE_SIZE) + 1);

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const idx = row * gridW + col;
        const fogState = hasExplored ? exploredTiles[idx] : 2;
        if (fogState === 0) continue;

        const tile = grid[idx];
        const isDim = fogState !== 2;
        const px = col * TILE_SIZE;
        const py = row * TILE_SIZE;

        if (tile === TILE_WALL) {
          // Enhancement A: Autotiled walls
          const mask = getWallMask(grid, gridW, gridH, col, row);
          this.drawAutotiledWall(px, py, mask, isDim, fogState === 2, grid, gridW, gridH, col, row);
        } else if (tile === TILE_FLOOR || tile === TILE_SPAWN) {
          // Enhancement B: Room-themed floor colors
          const themeIdx = roomMap.length > 0 ? roomMap[idx] : 2;
          const color = getFloorColor(col, row, isDim, themeIdx);
          this.gfx.rect(px, py, TILE_SIZE, TILE_SIZE);
          this.gfx.fill(color);

          // Detail marks on ~5% of floor tiles
          if (!isDim) {
            const h = tileHash(col, row);
            if ((h % 20) === 0) {
              this.drawFloorDetail(px, py, h);
            }
          }
        } else {
          const colors = isDim ? TILE_COLORS_DIM : TILE_COLORS;
          const color = colors[tile] ?? 0x000000;
          this.gfx.rect(px, py, TILE_SIZE, TILE_SIZE);
          this.gfx.fill(color);
        }
      }
    }
  }

  // Enhancement A: Draw wall shapes based on 4-bit bitmask
  private drawAutotiledWall(
    px: number, py: number, mask: number, isDim: boolean,
    isVisible: boolean, grid: number[], gridW: number, gridH: number,
    col: number, row: number,
  ): void {
    const ts = TILE_SIZE;
    const baseColor = isDim ? 0x222222 : (mask === 15 ? WALL_COLOR_INTERIOR : WALL_COLOR_BASE);
    const inset = 2; // how much narrower shaped walls are

    // Draw base fill first (always full tile for background)
    this.gfx.rect(px, py, ts, ts);
    this.gfx.fill(isDim ? 0x1a1a1a : 0x1a1a1a);

    switch (mask) {
      case 0: // Isolated pillar
        this.gfx.rect(px + inset + 1, py + inset + 1, ts - (inset + 1) * 2, ts - (inset + 1) * 2);
        this.gfx.fill(baseColor);
        if (!isDim) {
          this.gfx.rect(px + inset + 1, py + inset + 1, ts - (inset + 1) * 2, 1);
          this.gfx.fill({ color: WALL_HIGHLIGHT, alpha: 0.12 });
        }
        break;

      case 1: // N only — stub extending down
        this.gfx.rect(px + inset, py, ts - inset * 2, ts - inset);
        this.gfx.fill(baseColor);
        break;

      case 2: // E only — extending left from right
        this.gfx.rect(px + inset, py + inset, ts - inset, ts - inset * 2);
        this.gfx.fill(baseColor);
        break;

      case 4: // S only — stub extending up
        this.gfx.rect(px + inset, py + inset, ts - inset * 2, ts - inset);
        this.gfx.fill(baseColor);
        break;

      case 8: // W only — extending right from left
        this.gfx.rect(px, py + inset, ts - inset, ts - inset * 2);
        this.gfx.fill(baseColor);
        break;

      case 5: // N+S — vertical segment (narrower)
        this.gfx.rect(px + inset, py, ts - inset * 2, ts);
        this.gfx.fill(baseColor);
        break;

      case 10: // E+W — horizontal segment (narrower)
        this.gfx.rect(px, py + inset, ts, ts - inset * 2);
        this.gfx.fill(baseColor);
        break;

      case 3: // N+E — corner top-right
        this.gfx.rect(px + inset, py, ts - inset, ts - inset * 2);
        this.gfx.fill(baseColor);
        this.gfx.rect(px + inset, py, ts - inset * 2, ts - inset);
        this.gfx.fill(baseColor);
        break;

      case 6: // E+S — corner bottom-right
        this.gfx.rect(px + inset, py + inset, ts - inset, ts - inset * 2);
        this.gfx.fill(baseColor);
        this.gfx.rect(px + inset, py + inset, ts - inset * 2, ts - inset);
        this.gfx.fill(baseColor);
        break;

      case 12: // S+W — corner bottom-left
        this.gfx.rect(px, py + inset, ts - inset, ts - inset * 2);
        this.gfx.fill(baseColor);
        this.gfx.rect(px + inset, py + inset, ts - inset * 2, ts - inset);
        this.gfx.fill(baseColor);
        break;

      case 9: // N+W — corner top-left
        this.gfx.rect(px, py, ts - inset, ts - inset * 2);
        this.gfx.fill(baseColor);
        this.gfx.rect(px + inset, py, ts - inset * 2, ts - inset);
        this.gfx.fill(baseColor);
        break;

      case 7: // N+E+S — T-junction right
        this.gfx.rect(px + inset, py, ts - inset, ts);
        this.gfx.fill(baseColor);
        break;

      case 11: // N+E+W — T-junction top
        this.gfx.rect(px, py, ts, ts - inset);
        this.gfx.fill(baseColor);
        break;

      case 13: // N+S+W — T-junction left
        this.gfx.rect(px, py, ts - inset, ts);
        this.gfx.fill(baseColor);
        break;

      case 14: // E+S+W — T-junction bottom
        this.gfx.rect(px, py + inset, ts, ts - inset);
        this.gfx.fill(baseColor);
        break;

      case 15: // All — interior (solid, darker)
        this.gfx.rect(px, py, ts, ts);
        this.gfx.fill(baseColor);
        break;

      default:
        this.gfx.rect(px, py, ts, ts);
        this.gfx.fill(baseColor);
        break;
    }

    // Edge highlights for visible walls (same as Phase 3 but applied to autotiled shapes)
    if (isVisible) {
      this.drawWallEdgeHighlights(grid, gridW, gridH, col, row, px, py);
    }
  }

  private drawFloorDetail(px: number, py: number, hash: number): void {
    const detailType = (hash >>> 4) % 3;
    const ts = TILE_SIZE;

    if (detailType === 0) {
      // Crack line
      const x1 = px + (hash % 5) + 3;
      const y1 = py + ((hash >>> 8) % 5) + 3;
      const x2 = px + ts - ((hash >>> 12) % 5) - 3;
      const y2 = py + ts - ((hash >>> 16) % 5) - 3;
      this.gfx.moveTo(x1, y1);
      this.gfx.lineTo(x2, y2);
      this.gfx.stroke({ color: 0x000000, alpha: 0.08, width: 0.5 });
    } else if (detailType === 1) {
      // Dot cluster (2-3 dots)
      const cx = px + ts * 0.5;
      const cy = py + ts * 0.5;
      for (let i = 0; i < 3; i++) {
        const ox = ((hash >>> (i * 4 + 8)) % 7) - 3;
        const oy = ((hash >>> (i * 4 + 12)) % 7) - 3;
        this.gfx.circle(cx + ox, cy + oy, 0.5);
        this.gfx.fill({ color: 0x000000, alpha: 0.1 });
      }
    } else {
      // Darker patch
      const patchX = px + ((hash >>> 8) % 4) + 2;
      const patchY = py + ((hash >>> 12) % 4) + 2;
      const patchW = 4 + (hash >>> 16) % 4;
      const patchH = 4 + (hash >>> 20) % 4;
      this.gfx.rect(patchX, patchY, patchW, patchH);
      this.gfx.fill({ color: 0x000000, alpha: 0.06 });
    }
  }

  private drawWallEdgeHighlights(
    grid: number[], gridW: number, gridH: number,
    col: number, row: number, px: number, py: number,
  ): void {
    const ts = TILE_SIZE;

    // South neighbor is floor: lighter bottom edge
    if (row + 1 < gridH) {
      const south = grid[(row + 1) * gridW + col];
      if (south !== TILE_WALL) {
        this.gfx.rect(px, py + ts - 2, ts, 2);
        this.gfx.fill({ color: WALL_HIGHLIGHT, alpha: 0.08 });
      }
    }

    // North neighbor is floor: darker top edge
    if (row - 1 >= 0) {
      const north = grid[(row - 1) * gridW + col];
      if (north !== TILE_WALL) {
        this.gfx.rect(px, py, ts, 2);
        this.gfx.fill({ color: WALL_SHADOW, alpha: 0.3 });
      }
    }

    // East neighbor is floor: subtle right edge shadow
    if (col + 1 < gridW) {
      const east = grid[row * gridW + col + 1];
      if (east !== TILE_WALL) {
        this.gfx.rect(px + ts - 2, py, 2, ts);
        this.gfx.fill({ color: WALL_HIGHLIGHT, alpha: 0.05 });
      }
    }

    // West neighbor is floor: subtle left edge shadow
    if (col - 1 >= 0) {
      const west = grid[row * gridW + col - 1];
      if (west !== TILE_WALL) {
        this.gfx.rect(px, py, 2, ts);
        this.gfx.fill({ color: WALL_SHADOW, alpha: 0.15 });
      }
    }
  }

  renderClearedRoomTints(rooms: DungeonClientState['rooms']): void {
    for (const room of rooms) {
      if (!room.cleared) continue;
      const rx = room.x * TILE_SIZE;
      const ry = room.y * TILE_SIZE;
      const rw = room.w * TILE_SIZE;
      const rh = room.h * TILE_SIZE;
      this.gfx.rect(rx, ry, rw, rh);
      this.gfx.fill({ color: 0x00c864, alpha: 0.03 });
    }
  }

  renderFloorPickups(state: DungeonClientState): void {
    const pulseT = (Date.now() % 1200) / 1200;
    const pulseFactor = 0.7 + 0.3 * Math.sin(pulseT * Math.PI * 2);

    for (const pickup of state.floorPickups.values()) {
      const isHealth = pickup.type === 'health';
      const meta = TEMP_POWERUP_META[pickup.templateId];
      const colorHex = isHealth ? 0xff2244 : (meta ? parseInt(meta.color.slice(1), 16) : 0xffffff);
      const r = 10 * pulseFactor;

      // Outer glow
      this.gfx.circle(pickup.x, pickup.y, r * 2.5);
      this.gfx.fill({ color: colorHex, alpha: 0.3 * pulseFactor });

      // Inner solid
      this.gfx.circle(pickup.x, pickup.y, r);
      this.gfx.fill(colorHex);
    }
  }

  clear(): void {
    this.gfx.clear();
  }
}

// Fog helpers (same logic as v1, used by dungeon scene and HUD)
export function isTileExplored(state: DungeonClientState, col: number, row: number): boolean {
  if (state.exploredTiles.length === 0) return true;
  const idx = row * state.gridWidth + col;
  return state.exploredTiles[idx] > 0;
}

export function isTileVisible(state: DungeonClientState, col: number, row: number): boolean {
  if (state.exploredTiles.length === 0) return true;
  const idx = row * state.gridWidth + col;
  return state.exploredTiles[idx] === 2;
}
