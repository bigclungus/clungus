// map/renderer.ts — Tile rendering with offscreen cache, season-aware colors
// Pure: no globals, no side effects, no state mutation.

import { TILE, COLS, ROWS, DUNGEON_BUILDING_COL_MIN, DUNGEON_BUILDING_COL_MAX } from "../state.ts";
import {
  TILE_GRASS, TILE_PATH, TILE_WATER, TILE_BUILDING, TILE_TREE, TILE_ROCK, TILE_FOUNTAIN,
} from "./chunk.ts";
export { TILE_GRASS, TILE_PATH, TILE_WATER, TILE_BUILDING, TILE_TREE, TILE_ROCK, TILE_FOUNTAIN };

export type Season = "spring" | "summer" | "autumn" | "winter";

export interface TileColors {
  grass: string;
  grassAlt: string;
  path: string;
  water: string;
  waterDark: string;
  building: string;
  buildingRoof: string;
  tree: string;
  treeTop: string;
  rock: string;
  rockLight: string;
  fountain: string;
  fountainWater: string;
}

export function getSeason(serverTime?: number): Season {
  // Use server-authoritative time when available so all clients agree on the season.
  const ts = serverTime != null && serverTime > 0 ? serverTime : Date.now();
  const week = Math.floor(ts / (1000 * 60 * 60 * 24 * 7));
  const idx = week % 4;
  return (["spring", "summer", "autumn", "winter"] as Season[])[idx];
}

export function getTileColors(season: Season): TileColors {
  switch (season) {
    case "spring":
      return {
        grass: "#5a8f3c", grassAlt: "#4e7d34",
        path: "#c8a96e", water: "#4a90d9", waterDark: "#3a7bc8",
        building: "#8b7355", buildingRoof: "#6b5535",
        tree: "#2d7a2d", treeTop: "#1d5a1d",
        rock: "#888", rockLight: "#aaa",
        fountain: "#aaa", fountainWater: "#5bc",
      };
    case "summer":
      return {
        grass: "#4a8f2c", grassAlt: "#3e7d24",
        path: "#d4b47a", water: "#3a8fd9", waterDark: "#2a7bc8",
        building: "#8b7355", buildingRoof: "#6b5535",
        tree: "#1d7a1d", treeTop: "#0d5a0d",
        rock: "#888", rockLight: "#aaa",
        fountain: "#aaa", fountainWater: "#5bc",
      };
    case "autumn":
      return {
        grass: "#8f7a3c", grassAlt: "#7d6a34",
        path: "#c8a96e", water: "#4a7ac9", waterDark: "#3a6ab8",
        building: "#8b7355", buildingRoof: "#6b5535",
        tree: "#c45a1d", treeTop: "#a34a0d",
        rock: "#888", rockLight: "#aaa",
        fountain: "#aaa", fountainWater: "#5bc",
      };
    case "winter":
      return {
        grass: "#a0b0b8", grassAlt: "#909fa8",
        path: "#d8d8c8", water: "#aac0e8", waterDark: "#8aa0d8",
        building: "#9a8a75", buildingRoof: "#7a6a55",
        tree: "#4a6a4a", treeTop: "#3a5a3a",
        rock: "#999", rockLight: "#bbb",
        fountain: "#bbb", fountainWater: "#8bd",
      };
  }
}

interface TileCache {
  canvas: OffscreenCanvas;
  chunkX: number;
  chunkY: number;
  season: Season;
}

let tileCache: TileCache | null = null;

function drawTile(
  ctx: OffscreenCanvasRenderingContext2D,
  tile: number,
  x: number,
  y: number,
  tx: number,
  ty: number,
  colors: TileColors,
  frame: number
): void {
  switch (tile) {
    case TILE_GRASS: {
      // Subtle variation by position
      const variant = (tx * 7 + ty * 13) % 5;
      ctx.fillStyle = variant === 0 ? colors.grassAlt : colors.grass;
      ctx.fillRect(x, y, TILE, TILE);
      break;
    }
    case TILE_PATH:
      ctx.fillStyle = colors.path;
      ctx.fillRect(x, y, TILE, TILE);
      // Subtle edge lines
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(x, y, TILE, 1);
      ctx.fillRect(x, y, 1, TILE);
      break;
    case TILE_WATER: {
      ctx.fillStyle = colors.water;
      ctx.fillRect(x, y, TILE, TILE);
      // Inner darker
      ctx.fillStyle = colors.waterDark;
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      // Ripple lines (static for cache)
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(x + 4, y + 8, 8, 1);
      ctx.fillRect(x + 8, y + 13, 6, 1);
      break;
    }
    case TILE_BUILDING:
      // Congress / council building (rows 2-6, cols 2-8 in chunk 0,0)
      if (ty >= 2 && ty <= 6 && tx >= 2 && tx <= 8) {
        // Base: deep indigo wall
        ctx.fillStyle = "#2a2050";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "#3a3068";
        ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);

        if (ty === 2) {
          // Pediment row: triangular peak effect
          const distFromCenter = Math.abs(tx - 5);
          const peakColor = distFromCenter <= 1 ? "#8a8aaa" : distFromCenter <= 2 ? "#6a6a8a" : "#4a4a6a";
          ctx.fillStyle = peakColor;
          ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
          const triH = Math.max(0, (3 - distFromCenter) * 4);
          if (triH > 0) {
            ctx.fillStyle = "#9a9abb";
            ctx.fillRect(x + 2, y + 1, TILE - 4, triH);
          }
        } else if (ty === 6) {
          // Steps row
          ctx.fillStyle = "#4a4080";
          ctx.fillRect(x, y + 10, TILE, 6);
          ctx.fillStyle = "#5a5090";
          ctx.fillRect(x, y + 12, TILE, 4);
          ctx.fillStyle = "#6a60a0";
          ctx.fillRect(x, y + 14, TILE, TILE - 14);
        }

        // Columns at tx 2, 4, 6, 8
        if (tx === 2 || tx === 4 || tx === 6 || tx === 8) {
          if (ty > 2 && ty < 6) {
            ctx.fillStyle = "#7a7a9a";
            ctx.fillRect(x + 5, y, 5, TILE);
            ctx.fillStyle = "#9a9ab8";
            ctx.fillRect(x + 6, y, 2, TILE);
          } else if (ty === 6) {
            ctx.fillStyle = "#7a7a9a";
            ctx.fillRect(x + 5, y, 5, 10);
          }
        }

        // Doorway at center column, lower rows
        if (tx === 5 && (ty === 5 || ty === 6)) {
          ctx.fillStyle = "#000010";
          ctx.fillRect(x + 3, y + (ty === 5 ? 4 : 0), 9, ty === 5 ? TILE - 4 : 10);
          // Amber glow
          ctx.fillStyle = "rgba(240,208,96,0.27)";
          ctx.fillRect(x + 2, y + (ty === 5 ? 4 : 0), 1, ty === 5 ? TILE - 4 : 10);
          ctx.fillRect(x + 12, y + (ty === 5 ? 4 : 0), 1, ty === 5 ? TILE - 4 : 10);
          if (ty === 5) {
            ctx.fillStyle = "rgba(240,208,96,0.4)";
            ctx.fillRect(x + 3, y + 3, 9, 2);
          }
        }
      } else if (ty >= 2 && ty <= 6 && tx >= DUNGEON_BUILDING_COL_MIN && tx <= DUNGEON_BUILDING_COL_MAX) {
        // Dungeon entrance building — top-right corner (rows 2-6, cols 40-47)
        // Dark stone walls
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);

        // Stone block texture: mortar lines
        ctx.fillStyle = "#111";
        ctx.fillRect(x, y + TILE / 2, TILE, 1);
        const brickOffset = (ty % 2 === 0) ? 0 : TILE / 2;
        ctx.fillRect(x + brickOffset, y, 1, TILE);

        if (ty === 2) {
          // Battlements / crenellations on top row
          ctx.fillStyle = "#3a3a3a";
          ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
          // Merlon notch pattern
          if ((tx % 2) === 0) {
            ctx.fillStyle = "#0a0a0a";
            ctx.fillRect(x + 4, y, TILE - 8, 8);
          } else {
            ctx.fillStyle = "#3a3a3a";
            ctx.fillRect(x + 1, y + 1, TILE - 2, 8);
          }
        } else if (ty === 6) {
          // Bottom row: gate arch base / steps
          ctx.fillStyle = "#222";
          ctx.fillRect(x, y + 14, TILE, TILE - 14);
          ctx.fillStyle = "#2e2e2e";
          ctx.fillRect(x, y + 10, TILE, 4);
        }

        // Torch sconces on col 41 and 46, rows 4-5
        if ((tx === 41 || tx === 46) && (ty === 4 || ty === 5)) {
          ctx.fillStyle = "#8b4513";
          ctx.fillRect(x + 8, y + 2, 3, 8);
          // Flame flicker (static for cached tile)
          ctx.fillStyle = "rgba(255,140,0,0.85)";
          ctx.fillRect(x + 7, y, 5, 5);
          ctx.fillStyle = "rgba(255,220,0,0.6)";
          ctx.fillRect(x + 8, y + 1, 3, 3);
        }

        // Dungeon doorway arch at tx=43, rows 5-6
        if (tx === 43 && (ty === 5 || ty === 6)) {
          // Arch opening (void black)
          ctx.fillStyle = "#000";
          ctx.fillRect(x + 2, y + (ty === 5 ? 3 : 0), 12, ty === 5 ? TILE - 3 : 14);
          // Stone arch surround
          ctx.fillStyle = "#3a3030";
          ctx.fillRect(x + 1, y + (ty === 5 ? 2 : 0), 2, ty === 5 ? TILE - 2 : 14);
          ctx.fillRect(x + 14, y + (ty === 5 ? 2 : 0), 2, ty === 5 ? TILE - 2 : 14);
          if (ty === 5) {
            ctx.fillStyle = "#3a3030";
            ctx.fillRect(x + 2, y + 2, 12, 2);
          }
          // Eerie green glow from the void
          ctx.fillStyle = "rgba(0,80,30,0.22)";
          ctx.fillRect(x + 3, y + (ty === 5 ? 5 : 0), 10, ty === 5 ? TILE - 5 : 14);
        }
      } else {
        // Generic building tile
        ctx.fillStyle = colors.building;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = colors.buildingRoof;
        ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
        // Window
        if ((tx + ty) % 3 === 0) {
          ctx.fillStyle = "rgba(240,208,96,0.67)";
          ctx.fillRect(x + 4, y + 4, 4, 5);
        }
      }
      break;
    case TILE_TREE: {
      // Base pass only: grass background + trunk stub
      // The canopy is drawn in the tall-sprite pass (after entities) via drawTallSprites()
      ctx.fillStyle = colors.grass;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#5a3a1a";
      ctx.fillRect(x + 8, y + 10, 4, TILE - 10);
      break;
    }
    case TILE_ROCK:
      // Base pass only: grass background
      // The rock body is drawn in the tall-sprite pass (after entities) via drawTallSprites()
      ctx.fillStyle = colors.grass;
      ctx.fillRect(x, y, TILE, TILE);
      break;
    case TILE_FOUNTAIN: {
      ctx.fillStyle = colors.path;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = colors.fountain;
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = colors.fountainWater;
      ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
      break;
    }
    default:
      ctx.fillStyle = colors.grass;
      ctx.fillRect(x, y, TILE, TILE);
  }
}

export function renderChunkToCache(map: Uint8Array[], chunkX: number, chunkY: number, season: Season): OffscreenCanvas {
  const offscreen = new OffscreenCanvas(COLS * TILE, ROWS * TILE);
  const ctx = offscreen.getContext("2d")!;
  const colors = getTileColors(season);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      drawTile(ctx, map[r][c], c * TILE, r * TILE, c, r, colors, 0);
    }
  }

  tileCache = { canvas: offscreen, chunkX, chunkY, season };
  return offscreen;
}

export function getOrBuildTileCache(
  map: Uint8Array[],
  chunkX: number,
  chunkY: number,
  season: Season
): OffscreenCanvas {
  if (
    tileCache &&
    tileCache.chunkX === chunkX &&
    tileCache.chunkY === chunkY &&
    tileCache.season === season
  ) {
    return tileCache.canvas;
  }
  return renderChunkToCache(map, chunkX, chunkY, season);
}

export function invalidateTileCache(): void {
  tileCache = null;
}

/**
 * Draw the top portions of tall tiles (tree canopies, rock bodies) directly onto the
 * main canvas AFTER all entity sprites have been rendered. This makes trees and rocks
 * visually occlude players and NPCs that pass behind them, without any z-order sorting
 * or compositing tricks.
 */
export function drawTallSprites(
  ctx: CanvasRenderingContext2D,
  map: Uint8Array[],
  season: Season
): void {
  const colors = getTileColors(season);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = map[r][c];
      const x = c * TILE;
      const y = r * TILE;
      if (tile === TILE_TREE) {
        // Canopy on top of entities
        ctx.fillStyle = colors.tree;
        ctx.fillRect(x + 2, y + 1, TILE - 4, 12);
        ctx.fillStyle = colors.treeTop;
        ctx.fillRect(x + 4, y + 1, TILE - 8, 8);
      } else if (tile === TILE_ROCK) {
        // Rock body on top of entities
        ctx.fillStyle = colors.rock;
        ctx.fillRect(x + 3, y + 4, TILE - 6, TILE - 8);
        ctx.fillStyle = colors.rockLight;
        ctx.fillRect(x + 5, y + 5, 5, 4);
      }
    }
  }
}
