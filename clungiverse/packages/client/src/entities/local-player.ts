// Clungiverse Local Player
// Client-authoritative movement — no server reconciliation

import type { DungeonClientState, ClientPlayer } from '../state';
import { TILE_WALL, TILE_DOOR_CLOSED, TILE_SIZE } from '../state';

const PLAYER_RADIUS = 10;
// Average persona SPD is ~3.0, so ~48 px/sec at 16Hz. Use that as base.
const BASE_SPEED = 280; // pixels per second

// Sprint constants
const SPRINT_MULTIPLIER = 1.9;
const SPRINT_DURATION_MS = 600;
const SPRINT_COOLDOWN_MS = 3500;

function isBlockingTile(tile: number): boolean {
  return tile === TILE_WALL || tile === TILE_DOOR_CLOSED;
}

function isBoundsViolation(col: number, row: number, w: number, h: number): boolean {
  return col < 0 || col >= w || row < 0 || row >= h;
}

function collidesWithWall(state: DungeonClientState, x: number, y: number): boolean {
  const grid = state.tileGrid;
  if (!grid) return false;

  const w = state.gridWidth;
  const r = PLAYER_RADIUS;
  const corners = [
    [x - r, y - r], [x + r, y - r],
    [x - r, y + r], [x + r, y + r],
  ] as const;

  for (const [cx, cy] of corners) {
    const col = Math.floor(cx / TILE_SIZE);
    const row = Math.floor(cy / TILE_SIZE);
    if (isBoundsViolation(col, row, w, state.gridHeight)) return true;
    if (isBlockingTile(grid[row * w + col])) return true;
  }
  return false;
}

function applyMovement(
  state: DungeonClientState, player: ClientPlayer, dx: number, dy: number, dt: number
): void {
  const now = Date.now();
  const scrambleMultiplier = player.scramblingUntil > now ? 3 : 1;
  const sprintMultiplier = player.sprintingUntil > now ? SPRINT_MULTIPLIER : 1;
  const speed = BASE_SPEED * scrambleMultiplier * sprintMultiplier * dt;
  const newX = player.x + dx * speed;
  const newY = player.y + dy * speed;
  if (!collidesWithWall(state, newX, player.y)) player.x = newX;
  if (!collidesWithWall(state, player.x, newY)) player.y = newY;
}

export function tryActivateSprint(player: ClientPlayer): boolean {
  const now = Date.now();
  if (player.sprintCooldownUntil > now) return false;
  player.sprintingUntil = now + SPRINT_DURATION_MS;
  player.sprintCooldownUntil = now + SPRINT_COOLDOWN_MS;
  return true;
}

export { SPRINT_DURATION_MS, SPRINT_COOLDOWN_MS };

export function applyLocalInput(
  state: DungeonClientState,
  dx: number,
  dy: number,
  facingX: number,
  facingY: number,
  dt: number,
): void {
  const local = getLocalPlayer(state);
  if (!local?.alive) return;

  state.inputSeq++;

  if (dx !== 0 || dy !== 0) {
    applyMovement(state, local, dx, dy, dt);
  }

  local.facingX = facingX;
  local.facingY = facingY;
}

export function getLocalPlayer(state: DungeonClientState): ClientPlayer | undefined {
  return state.players.get(state.playerId);
}
