// entities/local-player.ts — Client-side prediction, movement, chunk detection
// Mutates state.localPlayer. Reads map for collision.

import {
  WorldState, LocalPlayer, PendingInput, Facing,
  TILE, COLS, ROWS, PLAYER_SPEED, PENDING_INPUT_CAP,
  CANVAS_W, CANVAS_H, BLOCKING_TILES,
} from "../state.ts";
import { InputState, consumeHop } from "../input.ts";

const HOP_FRAMES = 12;

export function initLocalPlayer(state: WorldState): void {
  state.localPlayer = {
    socketId: state.socketId || "",
    name: state.playerName,
    color: state.playerColor,
    x: CANVAS_W / 2,
    y: CANVAS_H / 2,
    facing: "right",
    hopFrame: 0,
    isAway: false,
    chunkX: 0,
    chunkY: 0,
    pendingInputs: [],
    inputSeq: 0,
    chunkTransitionAt: 0,
  };
}

function tileAt(map: Uint8Array[], px: number, py: number): number {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS) return 0;
  return map[ty][tx];
}

function isBlocked(map: Uint8Array[], x: number, y: number): boolean {
  // Check all four corners of the player hitbox (12×12, centered)
  const hw = 6, hh = 6;
  const corners = [
    [x - hw, y - hh], [x + hw - 1, y - hh],
    [x - hw, y + hh - 1], [x + hw - 1, y + hh - 1],
  ];
  return corners.some(([cx, cy]) => BLOCKING_TILES.has(tileAt(map, cx, cy)));
}

export function applyMovement(player: LocalPlayer, dx: number, dy: number, map: Uint8Array[]): void {
  const nx = player.x + dx;
  const ny = player.y + dy;

  // Try full move
  if (!isBlocked(map, nx, ny)) {
    player.x = nx;
    player.y = ny;
    return;
  }
  // Try horizontal only
  if (!isBlocked(map, nx, player.y)) {
    player.x = nx;
    return;
  }
  // Try vertical only
  if (!isBlocked(map, player.x, ny)) {
    player.y = ny;
    return;
  }
  // Blocked in both — no move
}

export function tickLocalPlayer(state: WorldState, input: Readonly<InputState>, dt: number): {
  dx: number; dy: number; chunkChanged: boolean; moved: boolean;
} {
  const player = state.localPlayer;
  if (!player || !state.map) return { dx: 0, dy: 0, chunkChanged: false, moved: false };

  // dt is seconds per frame. PLAYER_SPEED is px/second — multiply to get px this frame.
  // Clamp dt to 100ms (0.1s) to prevent huge jumps after tab-unfocus or missed frames.
  const dtClamped = Math.min(dt, 0.1);
  const speed = PLAYER_SPEED * dtClamped;

  let dx = 0, dy = 0;
  if (input.left)  dx -= speed;
  if (input.right) dx += speed;
  if (input.up)    dy -= speed;
  if (input.down)  dy += speed;

  // Normalize diagonal
  if (dx !== 0 && dy !== 0) {
    const norm = 1 / Math.sqrt(2);
    dx *= norm;
    dy *= norm;
  }

  const moved = dx !== 0 || dy !== 0;

  if (moved) {
    if (dx > 0) player.facing = "right";
    else if (dx < 0) player.facing = "left";

    // Record pending input for reconciliation
    player.inputSeq++;
    const pending: PendingInput = {
      seq: player.inputSeq,
      dx,
      dy,
      timestamp: performance.now(),
    };
    player.pendingInputs.push(pending);
    if (player.pendingInputs.length > PENDING_INPUT_CAP) {
      player.pendingInputs.shift();
    }

    applyMovement(player, dx, dy, state.map);
  }

  // Hop
  if (consumeHop() && player.hopFrame === 0) {
    player.hopFrame = 1;
  }
  if (player.hopFrame > 0) {
    player.hopFrame++;
    if (player.hopFrame > HOP_FRAMES) player.hopFrame = 0;
  }

  // Chunk crossing — clamp to canvas, detect exit
  let chunkChanged = false;
  const EDGE_BUFFER = 2;

  if (player.x < EDGE_BUFFER) {
    player.chunkX--;
    player.x = CANVAS_W - EDGE_BUFFER - 1;
    chunkChanged = true;
  } else if (player.x > CANVAS_W - EDGE_BUFFER) {
    player.chunkX++;
    player.x = EDGE_BUFFER + 1;
    chunkChanged = true;
  }

  if (player.y < EDGE_BUFFER) {
    player.chunkY--;
    player.y = CANVAS_H - EDGE_BUFFER - 1;
    chunkChanged = true;
  } else if (player.y > CANVAS_H - EDGE_BUFFER) {
    player.chunkY++;
    player.y = EDGE_BUFFER + 1;
    chunkChanged = true;
  }

  if (chunkChanged) {
    player.chunkTransitionAt = Date.now();
  }

  return { dx, dy, chunkChanged, moved };
}

export function reconcile(
  player: LocalPlayer,
  authX: number,
  authY: number,
  lastProcessedSeq: number,
  map: Uint8Array[]
): void {
  const predX = player.x;
  const predY = player.y;

  // Start from authoritative position
  player.x = authX;
  player.y = authY;

  // Drop acknowledged inputs
  player.pendingInputs = player.pendingInputs.filter(i => i.seq > lastProcessedSeq);

  // Replay unacknowledged inputs
  for (const input of player.pendingInputs) {
    applyMovement(player, input.dx, input.dy, map);
  }

  // Snap vs smooth correction
  const errX = player.x - predX;
  const errY = player.y - predY;
  const errDist = Math.sqrt(errX * errX + errY * errY);

  if (errDist > 0 && errDist < 8) {
    // Smooth correction over 3 frames — lerp back toward server position
    // We just apply 1/3 of the correction each frame by setting x/y partway
    player.x = predX + errX * 0.33;
    player.y = predY + errY * 0.33;
  }
  // If errDist >= 8 or 0: hard snap (already done by setting to replayed position)

  // Fix 1: velocity reconciliation — when position is corrected by more than 2px,
  // clear pending inputs so replayed inputs don't immediately re-diverge the player
  // from the corrected position. In this input-driven model (no explicit vx/vy),
  // clearing pendingInputs is equivalent to zeroing velocity after a hard snap.
  if (errDist > 2) {
    player.pendingInputs = [];
  }
}
