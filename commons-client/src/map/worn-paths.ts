// map/worn-paths.ts — Worn path tile tracking and rendering
//
// Worn paths are tracked both client-side (localStorage) and server-side (SQLite).
// main.ts sends a worn_path WS message to the server on each tile visit.
// On join, the server sends accumulated worn path counts for the chunk; the client
// merges them (taking the max) so all players see the shared world state.
//
// Visit thresholds (matching V1):
//   >= 10 visits → "worn" (slight dark overlay)
//   >= 30 visits → "dirt" (light brown overlay)

import { TILE, ROWS, COLS } from "../state.ts";

const STORAGE_KEY = "commons_worn_tiles";
const WORN_THRESHOLD = 10;
const DIRT_THRESHOLD = 30;
const SAVE_EVERY_N_VISITS = 30;

// Tile counts for the current session (keyed "tileX,tileY" in chunk coords)
interface WornStore {
  counts: Record<string, number>;
}

function loadStore(): WornStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.counts === 'object' && parsed.counts !== null) {
        return parsed as WornStore;
      }
    }
  } catch (e) {
    console.warn('[worn-paths] corrupt localStorage, resetting:', e)
  }
  return { counts: {} };
}

let store: WornStore = loadStore();

function saveStore(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('[worn-paths] localStorage write failed:', e)
  }
}

// Save on tab hide / page unload so we don't lose the last <30 visits
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveStore();
  });
  window.addEventListener("beforeunload", () => {
    saveStore();
  });
}

// Called on join to merge server-side worn path counts into local store.
// Takes the max of server and local so neither is lost.
export function mergeServerWornPaths(
  tiles: { tileX: number; tileY: number; visitCount: number }[]
): void {
  for (const { tileX, tileY, visitCount } of tiles) {
    const key = `${tileX},${tileY}`;
    const local = store.counts[key] ?? 0;
    if (visitCount > local) {
      store.counts[key] = visitCount;
    }
  }
  saveStore();
}

// Called by main.ts when the local player moves
export function recordTileVisit(tileX: number, tileY: number): void {
  const key = `${tileX},${tileY}`;
  store.counts[key] = (store.counts[key] ?? 0) + 1;
  // Persist every 30 visits to avoid thrashing localStorage.
  // The visibilitychange/beforeunload handlers above ensure the remainder
  // is flushed when the tab closes.
  if (store.counts[key] % SAVE_EVERY_N_VISITS === 0) {
    saveStore();
  }
}

export function getWornLevel(tileX: number, tileY: number): 0 | 1 | 2 {
  const count = store.counts[`${tileX},${tileY}`] ?? 0;
  if (count >= DIRT_THRESHOLD) return 2;
  if (count >= WORN_THRESHOLD) return 1;
  return 0;
}

// Drawn on top of the tile cache (before players/NPCs).
// Only applies to grass tiles (tile type 0).
export function drawWornPaths(
  ctx: CanvasRenderingContext2D,
  map: Uint8Array[] | null
): void {
  if (!map) return;

  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (map[ty][tx] !== 0) continue; // only overlay on grass
      const level = getWornLevel(tx, ty);
      if (level === 0) continue;

      const x = tx * TILE;
      const y = ty * TILE;

      if (level === 2) {
        // Dirt: light brown overlay
        ctx.fillStyle = "rgba(107,76,24,0.53)";
      } else {
        // Worn: slight dark overlay
        ctx.fillStyle = "rgba(0,0,0,0.16)";
      }
      ctx.fillRect(x, y, TILE, TILE);
    }
  }
}
