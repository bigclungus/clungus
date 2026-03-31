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
  if (!state.exploredTiles || state.exploredTiles.length === 0) return true;
  const idx = row * state.gridWidth + col;
  return state.exploredTiles[idx] > 0;
}

/** Check whether a tile at (col, row) is currently visible (within player radius). */
export function isTileVisible(state: DungeonClientState, col: number, row: number): boolean {
  if (!state.exploredTiles || state.exploredTiles.length === 0) return true;
  const idx = row * state.gridWidth + col;
  return state.exploredTiles[idx] === 2;
}

export function renderDungeon(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
): void {
  const grid = state.tileGrid;
  if (!grid) return;

  const w = state.gridWidth;
  const h = state.gridHeight;
  const cam = getCamera();
  const explored = state.exploredTiles;
  const hasExplored = explored && explored.length === w * h;

  // Compute visible tile range (with 1-tile margin)
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

      // Check fog state from exploredTiles
      const exploreVal = hasExplored ? explored[tileIdx] : 2; // no array = fully visible

      if (exploreVal === 0) {
        // Unexplored: dark
        // Unexplored: skip rendering entirely (background shows through as #0a0a0a)
        continue;
      }

      if (exploreVal === 1) {
        // Explored but not currently visible: dimmed
        ctx.fillStyle = TILE_COLORS_DIM[tile] ?? '#111111';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        continue;
      }

      // Currently visible (value 2)
      ctx.fillStyle = TILE_COLORS[tile] ?? '#000000';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      // Subtle grid lines on floor tiles
      if (tile !== TILE_WALL) {
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // Cleared room tint (only for visible tiles)
  for (let i = 0; i < state.rooms.length; i++) {
    const room = state.rooms[i];
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

  // Floor pickups — glowing colored circles with pulsing animation
  const pulseT = (Date.now() % 1200) / 1200; // 0..1 over 1.2s
  const pulseFactor = 0.7 + 0.3 * Math.sin(pulseT * Math.PI * 2);

  for (const pickup of state.floorPickups.values()) {
    if (!isVisible(pickup.x - 20, pickup.y - 20, 40, 40)) continue;

    const isHealth = pickup.type === 'health';
    const color = isHealth ? '#ff2244' : (TEMP_POWERUP_META[pickup.templateId]?.color ?? '#ffffff');
    const emoji = isHealth ? '❤️' : (TEMP_POWERUP_META[pickup.templateId]?.emoji ?? '✨');
    drawPickupGlow(ctx, pickup.x, pickup.y, color, emoji, pulseFactor);
  }
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

  ctx.font = `${Math.round(10 * pulseFactor)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, y);
  ctx.textBaseline = 'alphabetic';
}
