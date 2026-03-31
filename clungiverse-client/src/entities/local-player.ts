// Clungiverse Local Player
// Client-authoritative movement — no server reconciliation

import type { DungeonClientState, ClientPlayer } from '../state';
import { TILE_WALL, TILE_DOOR_CLOSED } from '../state';
import { TILE_SIZE } from '../renderer/dungeon-renderer';

const PLAYER_RADIUS = 10;
// Average persona SPD is ~3.0, so ~48 px/sec at 16Hz. Use that as base.
const BASE_SPEED = 280; // pixels per second

export function applyLocalInput(
  state: DungeonClientState,
  dx: number,
  dy: number,
  facingX: number,
  facingY: number,
  dt: number,
): void {
  const local = getLocalPlayer(state);
  if (!local || !local.alive) return;

  // Track sequence for network messages
  state.inputSeq++;

  // Apply movement locally — this is the authoritative position
  if (dx !== 0 || dy !== 0) {
    const scrambleMultiplier = (local.scramblingUntil ?? 0) > Date.now() ? 3 : 1;
    const moveX = dx * BASE_SPEED * scrambleMultiplier * dt;
    const moveY = dy * BASE_SPEED * scrambleMultiplier * dt;
    const newX = local.x + moveX;
    const newY = local.y + moveY;

    // Wall collision check (client-authoritative)
    if (!collidesWithWall(state, newX, local.y)) {
      local.x = newX;
    }
    if (!collidesWithWall(state, local.x, newY)) {
      local.y = newY;
    }
  }

  local.facingX = facingX;
  local.facingY = facingY;
}

function collidesWithWall(state: DungeonClientState, x: number, y: number): boolean {
  const grid = state.tileGrid;
  if (!grid) return false;

  const w = state.gridWidth;
  const r = PLAYER_RADIUS;

  // Check corners of bounding box
  const checks = [
    { cx: x - r, cy: y - r },
    { cx: x + r, cy: y - r },
    { cx: x - r, cy: y + r },
    { cx: x + r, cy: y + r },
  ];

  for (const pt of checks) {
    const col = Math.floor(pt.cx / TILE_SIZE);
    const row = Math.floor(pt.cy / TILE_SIZE);

    if (col < 0 || col >= w || row < 0 || row >= state.gridHeight) {
      return true; // out of bounds = wall
    }

    const tile = grid[row * w + col];
    if (tile === TILE_WALL || tile === TILE_DOOR_CLOSED) {
      return true;
    }
  }

  return false;
}

export function getLocalPlayer(state: DungeonClientState): ClientPlayer | undefined {
  return state.players.get(state.playerId);
}
