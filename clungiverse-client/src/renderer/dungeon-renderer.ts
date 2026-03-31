// Clungiverse Dungeon Tile Renderer
// Renders the BSP-generated tile grid with radius-based fog of war

import type { DungeonClientState } from '../state';
import {
  TILE_WALL,
  TILE_FLOOR,
  TILE_DOOR_CLOSED,
  TILE_DOOR_OPEN,
  TILE_SPAWN,
  TILE_TREASURE,
  TILE_SHRINE,
  TILE_STAIRS,
  TEMP_POWERUP_META,
} from '../state';
import { getCamera, isVisible } from './canvas';

export const TILE_SIZE = 16;

const TILE_COLORS: Record<number, string> = {
  [TILE_FLOOR]: '#c2b280',   // tan/sandy
  [TILE_WALL]: '#333333',    // dark grey
  [TILE_DOOR_CLOSED]: '#8b5a2b', // brown
  [TILE_DOOR_OPEN]: '#a0784a',   // lighter brown
  [TILE_SPAWN]: '#c2b280',       // same as floor
  [TILE_TREASURE]: '#daa520',    // gold/yellow
  [TILE_SHRINE]: '#2e8b57',      // green
  [TILE_STAIRS]: '#4682b4',      // blue
};

// Dimmed versions of tile colors for explored-but-not-visible tiles
const TILE_COLORS_DIM: Record<number, string> = {
  [TILE_FLOOR]: '#7a7050',
  [TILE_WALL]: '#222222',
  [TILE_DOOR_CLOSED]: '#5a3a1b',
  [TILE_DOOR_OPEN]: '#6a5030',
  [TILE_SPAWN]: '#7a7050',
  [TILE_TREASURE]: '#8a6810',
  [TILE_SHRINE]: '#1e5a38',
  [TILE_STAIRS]: '#2e5474',
};

/** Check whether a tile at (col, row) has been explored. */
export function isTileExplored(state: DungeonClientState, col: number, row: number): boolean {
  if (state.exploredTiles.length === 0) return true;
  const idx = row * state.gridWidth + col;
  return state.exploredTiles[idx] > 0;
}

/** Check whether a tile at (col, row) is currently visible (within player radius). */
export function isTileVisible(state: DungeonClientState, col: number, row: number): boolean {
  if (state.exploredTiles.length === 0) return true;
  const idx = row * state.gridWidth + col;
  return state.exploredTiles[idx] === 2;
}

function drawSingleTile(
  ctx: CanvasRenderingContext2D,
  tile: number,
  px: number,
  py: number,
  exploreVal: number,
): void {
  if (exploreVal === 1) {
    ctx.fillStyle = TILE_COLORS_DIM[tile] ?? '#111111';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    return;
  }
  ctx.fillStyle = TILE_COLORS[tile] ?? '#000000';
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  if (tile !== TILE_WALL) {
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
  }
}

function renderTileGrid(
  ctx: CanvasRenderingContext2D,
  grid: number[],
  w: number,
  h: number,
  explored: Uint8Array,
): void {
  const cam = getCamera();
  const hasExplored = explored.length === w * h;

  const startCol = Math.max(0, Math.floor(cam.x / TILE_SIZE) - 1);
  const startRow = Math.max(0, Math.floor(cam.y / TILE_SIZE) - 1);
  const viewW = Math.ceil(window.innerWidth / (TILE_SIZE * cam.zoom));
  const viewH = Math.ceil(window.innerHeight / (TILE_SIZE * cam.zoom));
  const endCol = Math.min(w - 1, startCol + viewW + 2);
  const endRow = Math.min(h - 1, startRow + viewH + 2);

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const tileIdx = row * w + col;
      const tile = grid[tileIdx];
      const px = col * TILE_SIZE;
      const py = row * TILE_SIZE;
      if (!isVisible(px, py, TILE_SIZE, TILE_SIZE)) continue;
      const exploreVal = hasExplored ? explored[tileIdx] : 2;
      if (exploreVal === 0) continue;
      drawSingleTile(ctx, tile, px, py, exploreVal);
    }
  }
}

function renderClearedRoomTints(
  ctx: CanvasRenderingContext2D,
  rooms: DungeonClientState['rooms'],
): void {
  for (const room of rooms) {
    if (!room.cleared) continue;
    const rx = room.x * TILE_SIZE;
    const ry = room.y * TILE_SIZE;
    const rw = room.w * TILE_SIZE;
    const rh = room.h * TILE_SIZE;
    if (isVisible(rx, ry, rw, rh)) {
      ctx.fillStyle = 'rgba(0,200,100,0.03)';
      ctx.fillRect(rx, ry, rw, rh);
    }
  }
}

function getPickupVisuals(pickup: DungeonClientState['floorPickups'] extends Map<string, infer V> ? V : never): { color: string; emoji: string } {
  const isHealth = pickup.type === 'health';
  const meta = TEMP_POWERUP_META[pickup.templateId];
  return {
    color: isHealth ? '#ff2244' : (meta?.color ?? '#ffffff'),
    emoji: isHealth ? '❤️' : (meta?.emoji ?? '✨'),
  };
}

function renderFloorPickups(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
): void {
  const pulseT = (Date.now() % 1200) / 1200;
  const pulseFactor = 0.7 + 0.3 * Math.sin(pulseT * Math.PI * 2);

  for (const pickup of state.floorPickups.values()) {
    if (!isVisible(pickup.x - 20, pickup.y - 20, 40, 40)) continue;
    const { color, emoji } = getPickupVisuals(pickup);
    drawPickupGlow(ctx, pickup.x, pickup.y, color, emoji, pulseFactor);
  }
}

export function renderDungeon(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
): void {
  const grid = state.tileGrid;
  if (!grid) return;

  renderTileGrid(ctx, grid, state.gridWidth, state.gridHeight, state.exploredTiles);
  renderClearedRoomTints(ctx, state.rooms);
  renderFloorPickups(ctx, state);
}

function drawPickupGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  emoji: string,
  pulseFactor: number,
): void {
  const r = 10 * pulseFactor;

  const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
  grd.addColorStop(0, color + 'cc');
  grd.addColorStop(1, color + '00');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = `${String(Math.round(10 * pulseFactor))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, y);
  ctx.textBaseline = 'alphabetic';
}
