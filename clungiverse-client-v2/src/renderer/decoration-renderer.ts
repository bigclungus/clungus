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
import type { ClientRoom, RoomTheme, RoomShape } from '../state';

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
  | 'torch_sconce'
  | 'stalactite' | 'mushroom' | 'moss_patch' | 'cobweb'
  | 'pillar' | 'altar';

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

// Default decoration pools per room theme
const ROOM_DECO_TYPES: Record<RoomTheme, DecoType[]> = {
  combat:  ['bones', 'weapon_rack', 'blood_splatter'],
  treasure:['gold_pile', 'open_chest'],
  rest:    ['plant', 'bench', 'fountain'],
  boss:    ['skull', 'cracked_floor', 'brazier'],
  start:   ['torch_sconce'],
};

// Shape-specific decoration overrides (merged with theme pool)
const SHAPE_DECO_TYPES: Record<RoomShape, DecoType[]> = {
  rect:   [], // use theme defaults
  cave:   ['cobweb', 'stalactite', 'mushroom', 'moss_patch', 'bones'],
  circle: ['pillar', 'brazier', 'fountain', 'gold_pile'],
  L:      ['weapon_rack', 'bench', 'open_chest'],
  cross:  ['brazier', 'skull', 'altar'],
};

function getDecoTypes(theme: RoomTheme, shape: RoomShape): DecoType[] {
  const shapeTypes = SHAPE_DECO_TYPES[shape];
  if (shapeTypes.length > 0) return shapeTypes;
  return ROOM_DECO_TYPES[theme] ?? [];
}

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
    const types = getDecoTypes(room.theme, room.shape ?? 'rect');
    if (!types || types.length === 0) continue;

    const count = 2 + Math.floor(rng() * 4); // 2-5 decorations
    const centerX = room.x + room.w / 2;
    const centerY = room.y + room.h / 2;

    // Collect candidate tiles: use tileSet if available, otherwise bounding box
    const candidates: { col: number; row: number }[] = [];
    const tilesToScan = room.tileSet && room.tileSet.length > 0
      ? room.tileSet.map((t) => ({ c: t.x, r: t.y }))
      : (() => {
          const arr: { c: number; r: number }[] = [];
          for (let r = room.y; r < room.y + room.h; r++) {
            for (let c = room.x; c < room.x + room.w; c++) {
              arr.push({ c, r });
            }
          }
          return arr;
        })();

    for (const { c, r } of tilesToScan) {
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
    // Scale factor: decorations should fill ~40-60% of a tile
    const k = TILE_SIZE / 8; // 2x at TILE_SIZE=16

    switch (d.type) {
      case 'bones': {
        // White X lines
        const size = (3 + (s % 2)) * k;
        this.gfx.moveTo(x - size, y - size);
        this.gfx.lineTo(x + size, y + size);
        this.gfx.stroke({ color: 0xccccbb, alpha: 0.6, width: 1.5 * k });
        this.gfx.moveTo(x + size, y - size);
        this.gfx.lineTo(x - size, y + size);
        this.gfx.stroke({ color: 0xccccbb, alpha: 0.6, width: 1.5 * k });
        break;
      }
      case 'weapon_rack': {
        // Brown rect
        this.gfx.rect(x - 3 * k, y - 2 * k, 6 * k, 4 * k);
        this.gfx.fill({ color: 0x6b4226, alpha: 0.7 });
        // Weapon lines
        this.gfx.moveTo(x - k, y - 4 * k);
        this.gfx.lineTo(x - k, y + 2 * k);
        this.gfx.stroke({ color: 0x888888, alpha: 0.6, width: k });
        this.gfx.moveTo(x + k, y - 3 * k);
        this.gfx.lineTo(x + k, y + 2 * k);
        this.gfx.stroke({ color: 0x888888, alpha: 0.6, width: k });
        break;
      }
      case 'blood_splatter': {
        // Dark red dots
        const count = 3 + (s % 3);
        for (let i = 0; i < count; i++) {
          const ox = (((s >>> (i * 3)) % 7) - 3) * k;
          const oy = (((s >>> (i * 3 + 8)) % 7) - 3) * k;
          this.gfx.circle(x + ox, y + oy, (1.2 + (i % 2) * 0.6) * k);
          this.gfx.fill({ color: 0x661111, alpha: 0.45 });
        }
        break;
      }
      case 'gold_pile': {
        // Yellow circles
        for (let i = 0; i < 4; i++) {
          const ox = (((s >>> (i * 2)) % 5) - 2) * k;
          const oy = (((s >>> (i * 2 + 6)) % 5) - 2) * k;
          this.gfx.circle(x + ox, y + oy, 1.5 * k);
          this.gfx.fill({ color: 0xdaa520, alpha: 0.7 });
        }
        break;
      }
      case 'open_chest': {
        // Brown rect body
        this.gfx.rect(x - 3 * k, y - k, 6 * k, 4 * k);
        this.gfx.fill({ color: 0x6b4226, alpha: 0.8 });
        // Yellow top (open lid)
        this.gfx.rect(x - 3 * k, y - 3 * k, 6 * k, 2 * k);
        this.gfx.fill({ color: 0xccaa22, alpha: 0.6 });
        break;
      }
      case 'plant': {
        // Green circle
        this.gfx.circle(x, y, 3 * k);
        this.gfx.fill({ color: 0x44aa44, alpha: 0.55 });
        this.gfx.circle(x - k, y - k, 2 * k);
        this.gfx.fill({ color: 0x66cc66, alpha: 0.5 });
        break;
      }
      case 'bench': {
        // Brown rect
        this.gfx.rect(x - 4 * k, y - k, 8 * k, 3 * k);
        this.gfx.fill({ color: 0x7a5030, alpha: 0.6 });
        break;
      }
      case 'fountain': {
        // Blue circle
        this.gfx.circle(x, y, 3.5 * k);
        this.gfx.fill({ color: 0x4488cc, alpha: 0.4 });
        this.gfx.circle(x, y, 1.8 * k);
        this.gfx.fill({ color: 0x66aaee, alpha: 0.5 });
        break;
      }
      case 'skull': {
        // White circle head
        this.gfx.circle(x, y, 3 * k);
        this.gfx.fill({ color: 0xccccbb, alpha: 0.6 });
        // Dark eye dots
        this.gfx.circle(x - k, y - 0.5 * k, 0.8 * k);
        this.gfx.fill({ color: 0x000000, alpha: 0.7 });
        this.gfx.circle(x + k, y - 0.5 * k, 0.8 * k);
        this.gfx.fill({ color: 0x000000, alpha: 0.7 });
        break;
      }
      case 'cracked_floor': {
        // Dark lines
        this.gfx.moveTo(x - 3 * k, y);
        this.gfx.lineTo(x, y - 2 * k);
        this.gfx.lineTo(x + 3 * k, y + k);
        this.gfx.stroke({ color: 0x000000, alpha: 0.25, width: k });
        this.gfx.moveTo(x, y - 2 * k);
        this.gfx.lineTo(x + k, y + 3 * k);
        this.gfx.stroke({ color: 0x000000, alpha: 0.2, width: 0.8 * k });
        break;
      }
      case 'brazier': {
        // Orange circle base
        this.gfx.circle(x, y, 2.5 * k);
        this.gfx.fill({ color: 0x885522, alpha: 0.7 });
        // Flicker flame
        const flicker = Math.sin(performance.now() / 200 + s) * 0.3;
        this.gfx.circle(x, y - 2.5 * k, (1.8 + flicker) * k);
        this.gfx.fill({ color: 0xff8822, alpha: 0.6 + flicker * 0.3 });
        this.gfx.circle(x, y - 3 * k, k);
        this.gfx.fill({ color: 0xffcc44, alpha: 0.5 });
        break;
      }
      case 'torch_sconce': {
        // Orange dot near wall
        this.gfx.circle(x, y, 2 * k);
        this.gfx.fill({ color: 0xcc6600, alpha: 0.6 });
        // Glow
        const flicker2 = Math.sin(performance.now() / 300 + s) * 0.15;
        this.gfx.circle(x, y, 5 * k);
        this.gfx.fill({ color: 0xff8800, alpha: 0.12 + flicker2 });
        break;
      }
      case 'stalactite': {
        // Pointed downward triangle
        this.gfx.moveTo(x - 2 * k, y - 2 * k);
        this.gfx.lineTo(x + 2 * k, y - 2 * k);
        this.gfx.lineTo(x, y + 3 * k);
        this.gfx.closePath();
        this.gfx.fill({ color: 0x888877, alpha: 0.6 });
        break;
      }
      case 'mushroom': {
        // Brown stem + colored cap
        this.gfx.rect(x - 0.5 * k, y, k, 3 * k);
        this.gfx.fill({ color: 0x8b7355, alpha: 0.7 });
        const capColor = (s % 3 === 0) ? 0xcc4444 : (s % 3 === 1) ? 0x88bb44 : 0xddcc55;
        this.gfx.circle(x, y, 2.5 * k);
        this.gfx.fill({ color: capColor, alpha: 0.55 });
        break;
      }
      case 'moss_patch': {
        // Dark green irregular blobs
        for (let i = 0; i < 3; i++) {
          const ox = (((s >>> (i * 3)) % 5) - 2) * k;
          const oy = (((s >>> (i * 3 + 8)) % 5) - 2) * k;
          this.gfx.circle(x + ox, y + oy, (1.5 + (i % 2)) * k);
          this.gfx.fill({ color: 0x2d5a1e, alpha: 0.35 });
        }
        break;
      }
      case 'cobweb': {
        // White lines radiating from a corner
        const angle0 = ((s % 4) * Math.PI) / 2;
        for (let i = 0; i < 3; i++) {
          const a = angle0 + (i - 1) * 0.4;
          this.gfx.moveTo(x, y);
          this.gfx.lineTo(x + Math.cos(a) * 4 * k, y + Math.sin(a) * 4 * k);
          this.gfx.stroke({ color: 0xcccccc, alpha: 0.25, width: 0.5 * k });
        }
        break;
      }
      case 'pillar': {
        // Gray circle (stone pillar from above)
        this.gfx.circle(x, y, 3 * k);
        this.gfx.fill({ color: 0x666666, alpha: 0.7 });
        this.gfx.circle(x, y, 2 * k);
        this.gfx.fill({ color: 0x888888, alpha: 0.5 });
        break;
      }
      case 'altar': {
        // Dark rect with a red glow
        this.gfx.rect(x - 3 * k, y - 2 * k, 6 * k, 4 * k);
        this.gfx.fill({ color: 0x444444, alpha: 0.8 });
        this.gfx.circle(x, y, 4 * k);
        this.gfx.fill({ color: 0x881111, alpha: 0.15 });
        break;
      }
    }
  }

  clear(): void {
    this.gfx.clear();
  }
}
