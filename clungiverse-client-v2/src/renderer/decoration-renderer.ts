// Clungiverse v2 — Procedural Decoration Renderer
// Phase 4 Enhancement C: client-side decorations placed deterministically per room

import { Container, Graphics } from 'pixi.js';
import {
  TILE_SIZE,
  TILE_FLOOR,
  TILE_WALL,
  TILE_SPAWN,
  TILE_TREASURE,
  TILE_SHRINE,
  TILE_STAIRS,
} from '../state';
import type { ClientRoom, RoomTheme } from '../state';

interface Decoration {
  x: number; // world pixel x (center)
  y: number; // world pixel y (center)
  type: DecoType;
  seed: number; // for variation
}

type DecoType =
  | 'bones' | 'weapon_rack' | 'blood_splatter'
  | 'gold_pile' | 'open_chest'
  | 'plant' | 'bench' | 'fountain'
  | 'skull' | 'cracked_floor' | 'brazier'
  | 'torch_sconce';

// Seeded pseudo-random number generator (mulberry32)
function seededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROOM_DECO_TYPES: Record<RoomTheme, DecoType[]> = {
  combat:  ['bones', 'weapon_rack', 'blood_splatter'],
  treasure:['gold_pile', 'open_chest'],
  rest:    ['plant', 'bench', 'fountain'],
  boss:    ['skull', 'cracked_floor', 'brazier'],
  start:   ['torch_sconce'],
};

let decorations: Decoration[] = [];

/**
 * Generate decorations for all rooms. Call once per floor after tile grid arrives.
 */
export function generateDecorations(
  rooms: ClientRoom[],
  grid: number[],
  gridW: number,
  gridH: number,
): void {
  decorations = [];

  for (const room of rooms) {
    const seed = (room.x * 31 + room.y * 17 + gridW) >>> 0;
    const rng = seededRng(seed);
    const types = ROOM_DECO_TYPES[room.theme];
    if (!types || types.length === 0) continue;

    const count = 2 + Math.floor(rng() * 4); // 2-5 decorations
    const centerX = room.x + room.w / 2;
    const centerY = room.y + room.h / 2;

    // Collect candidate tiles: floor tiles near walls, away from center, not special
    const candidates: { col: number; row: number }[] = [];
    for (let r = room.y; r < room.y + room.h; r++) {
      for (let c = room.x; c < room.x + room.w; c++) {
        if (c < 0 || c >= gridW || r < 0 || r >= gridH) continue;
        const tile = grid[r * gridW + c];
        // Must be plain floor
        if (tile !== TILE_FLOOR) continue;
        // Not spawn/treasure/shrine/stairs (check neighbors too)
        if (isSpecialTile(grid, gridW, gridH, c, r)) continue;
        // At least 2 tiles from room center
        const dx = c - centerX;
        const dy = r - centerY;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue;
        // Within 1 tile of a wall
        if (!nearWall(grid, gridW, gridH, c, r)) continue;
        candidates.push({ col: c, row: r });
      }
    }

    // Shuffle candidates with RNG and pick up to `count`
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    const placed = Math.min(count, candidates.length);
    for (let i = 0; i < placed; i++) {
      const c = candidates[i];
      const decoType = types[Math.floor(rng() * types.length)];
      decorations.push({
        x: c.col * TILE_SIZE + TILE_SIZE / 2,
        y: c.row * TILE_SIZE + TILE_SIZE / 2,
        type: decoType,
        seed: Math.floor(rng() * 65536),
      });
    }
  }
}

function isSpecialTile(grid: number[], gridW: number, gridH: number, col: number, row: number): boolean {
  const idx = row * gridW + col;
  const t = grid[idx];
  if (t === TILE_SPAWN || t === TILE_TREASURE || t === TILE_SHRINE || t === TILE_STAIRS) return true;
  // Check cardinal neighbors for special tiles too (don't block paths to them)
  const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dc, dr] of offsets) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nc >= gridW || nr < 0 || nr >= gridH) continue;
    const nt = grid[nr * gridW + nc];
    if (nt === TILE_SPAWN || nt === TILE_TREASURE || nt === TILE_SHRINE || nt === TILE_STAIRS) return true;
  }
  return false;
}

function nearWall(grid: number[], gridW: number, gridH: number, col: number, row: number): boolean {
  const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [dc, dr] of offsets) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nc >= gridW || nr < 0 || nr >= gridH) return true; // edge counts as wall
    if (grid[nr * gridW + nc] === TILE_WALL) return true;
  }
  return false;
}

export function clearDecorations(): void {
  decorations = [];
}

export class DecorationRenderer {
  container: Container;
  private gfx: Graphics;

  constructor() {
    this.container = new Container();
    this.gfx = new Graphics();
    this.container.addChild(this.gfx);
  }

  render(
    exploredTiles: Uint8Array,
    gridW: number,
    cameraX: number,
    cameraY: number,
    screenW: number,
    screenH: number,
    zoom: number,
  ): void {
    this.gfx.clear();

    const halfW = screenW / (2 * zoom);
    const halfH = screenH / (2 * zoom);
    const minX = cameraX - halfW - TILE_SIZE;
    const maxX = cameraX + halfW + TILE_SIZE;
    const minY = cameraY - halfH - TILE_SIZE;
    const maxY = cameraY + halfH + TILE_SIZE;

    for (const deco of decorations) {
      // Frustum cull
      if (deco.x < minX || deco.x > maxX || deco.y < minY || deco.y > maxY) continue;

      // Fog check: only render if tile is visible (fogState === 2)
      const col = Math.floor(deco.x / TILE_SIZE);
      const row = Math.floor(deco.y / TILE_SIZE);
      const idx = row * gridW + col;
      if (exploredTiles.length > 0 && exploredTiles[idx] !== 2) continue;

      this.drawDecoration(deco);
    }
  }

  private drawDecoration(d: Decoration): void {
    const x = d.x;
    const y = d.y;
    const s = d.seed;

    switch (d.type) {
      case 'bones': {
        // White X lines
        const size = 3 + (s % 2);
        this.gfx.moveTo(x - size, y - size);
        this.gfx.lineTo(x + size, y + size);
        this.gfx.stroke({ color: 0xccccbb, alpha: 0.5, width: 1 });
        this.gfx.moveTo(x + size, y - size);
        this.gfx.lineTo(x - size, y + size);
        this.gfx.stroke({ color: 0xccccbb, alpha: 0.5, width: 1 });
        break;
      }
      case 'weapon_rack': {
        // Brown rect
        this.gfx.rect(x - 3, y - 2, 6, 4);
        this.gfx.fill({ color: 0x6b4226, alpha: 0.6 });
        // Weapon lines
        this.gfx.moveTo(x - 1, y - 4);
        this.gfx.lineTo(x - 1, y + 2);
        this.gfx.stroke({ color: 0x888888, alpha: 0.5, width: 0.5 });
        this.gfx.moveTo(x + 1, y - 3);
        this.gfx.lineTo(x + 1, y + 2);
        this.gfx.stroke({ color: 0x888888, alpha: 0.5, width: 0.5 });
        break;
      }
      case 'blood_splatter': {
        // Dark red dots
        const count = 3 + (s % 3);
        for (let i = 0; i < count; i++) {
          const ox = ((s >>> (i * 3)) % 7) - 3;
          const oy = ((s >>> (i * 3 + 8)) % 7) - 3;
          this.gfx.circle(x + ox, y + oy, 0.8 + (i % 2) * 0.4);
          this.gfx.fill({ color: 0x661111, alpha: 0.35 });
        }
        break;
      }
      case 'gold_pile': {
        // Small yellow circles
        for (let i = 0; i < 4; i++) {
          const ox = ((s >>> (i * 2)) % 5) - 2;
          const oy = ((s >>> (i * 2 + 6)) % 5) - 2;
          this.gfx.circle(x + ox, y + oy, 1);
          this.gfx.fill({ color: 0xdaa520, alpha: 0.6 });
        }
        break;
      }
      case 'open_chest': {
        // Brown rect body
        this.gfx.rect(x - 3, y - 1, 6, 4);
        this.gfx.fill({ color: 0x6b4226, alpha: 0.7 });
        // Yellow top (open lid)
        this.gfx.rect(x - 3, y - 3, 6, 2);
        this.gfx.fill({ color: 0xccaa22, alpha: 0.5 });
        break;
      }
      case 'plant': {
        // Green small circle
        this.gfx.circle(x, y, 2.5);
        this.gfx.fill({ color: 0x44aa44, alpha: 0.5 });
        this.gfx.circle(x - 1, y - 1, 1.5);
        this.gfx.fill({ color: 0x66cc66, alpha: 0.4 });
        break;
      }
      case 'bench': {
        // Brown rect
        this.gfx.rect(x - 4, y - 1, 8, 3);
        this.gfx.fill({ color: 0x7a5030, alpha: 0.5 });
        break;
      }
      case 'fountain': {
        // Blue circle
        this.gfx.circle(x, y, 3);
        this.gfx.fill({ color: 0x4488cc, alpha: 0.35 });
        this.gfx.circle(x, y, 1.5);
        this.gfx.fill({ color: 0x66aaee, alpha: 0.4 });
        break;
      }
      case 'skull': {
        // White circle head
        this.gfx.circle(x, y, 2.5);
        this.gfx.fill({ color: 0xccccbb, alpha: 0.5 });
        // Dark eye dots
        this.gfx.circle(x - 1, y - 0.5, 0.6);
        this.gfx.fill({ color: 0x000000, alpha: 0.6 });
        this.gfx.circle(x + 1, y - 0.5, 0.6);
        this.gfx.fill({ color: 0x000000, alpha: 0.6 });
        break;
      }
      case 'cracked_floor': {
        // Dark lines
        this.gfx.moveTo(x - 3, y);
        this.gfx.lineTo(x, y - 2);
        this.gfx.lineTo(x + 3, y + 1);
        this.gfx.stroke({ color: 0x000000, alpha: 0.2, width: 0.7 });
        this.gfx.moveTo(x, y - 2);
        this.gfx.lineTo(x + 1, y + 3);
        this.gfx.stroke({ color: 0x000000, alpha: 0.15, width: 0.5 });
        break;
      }
      case 'brazier': {
        // Orange circle base
        this.gfx.circle(x, y, 2);
        this.gfx.fill({ color: 0x885522, alpha: 0.6 });
        // Flicker flame
        const flicker = Math.sin(performance.now() / 200 + s) * 0.3;
        this.gfx.circle(x, y - 2, 1.5 + flicker);
        this.gfx.fill({ color: 0xff8822, alpha: 0.5 + flicker * 0.3 });
        this.gfx.circle(x, y - 2.5, 0.8);
        this.gfx.fill({ color: 0xffcc44, alpha: 0.4 });
        break;
      }
      case 'torch_sconce': {
        // Small orange dot near wall
        this.gfx.circle(x, y, 1.5);
        this.gfx.fill({ color: 0xcc6600, alpha: 0.5 });
        // Glow
        const flicker2 = Math.sin(performance.now() / 300 + s) * 0.15;
        this.gfx.circle(x, y, 4);
        this.gfx.fill({ color: 0xff8800, alpha: 0.1 + flicker2 });
        break;
      }
    }
  }

  clear(): void {
    this.gfx.clear();
  }
}
