// Collision detection and spatial queries for the dungeon combat system.
// Tile encoding: 0=floor, 1=wall, 2=door_closed, 3=door_open, 4=spawn, 5=treasure, 6=shrine, 7=stairs

const SOLID_TILES = new Set([1, 2]); // wall + closed door block movement/LOS

/** Circle-vs-circle overlap test. */
export function circleVsCircle(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const rSum = ar + br;
  return dx * dx + dy * dy <= rSum * rSum;
}

/** Circle-vs-axis-aligned-rect overlap test. */
export function circleVsRect(
  cx: number, cy: number, cr: number,
  rx: number, ry: number, rw: number, rh: number,
): boolean {
  // Find the closest point on the rect to the circle center
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= cr * cr;
}

/** Check whether a point falls inside a cone emanating from an origin. */
export function pointInCone(
  px: number, py: number,
  originX: number, originY: number,
  facing: "left" | "right",
  angleDeg: number,
  range: number,
): boolean {
  const dx = px - originX;
  const dy = py - originY;
  const distSq = dx * dx + dy * dy;
  if (distSq > range * range) return false;

  // Facing direction: right = 0 rad, left = PI
  const facingAngle = facing === "right" ? 0 : Math.PI;
  const angleToPoint = Math.atan2(dy, dx);

  // Signed angular difference, normalized to [-PI, PI]
  let diff = angleToPoint - facingAngle;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;

  const halfCone = (angleDeg / 2) * (Math.PI / 180);
  return Math.abs(diff) <= halfCone;
}

/**
 * Bresenham-based line-of-sight check against a tile grid.
 * Returns true if the line from (x1,y1) to (x2,y2) is unobstructed.
 * Coordinates are in pixels; TILE_SIZE assumed 16px.
 */
function isTileSolid(tx: number, ty: number, tileGrid: Uint8Array, gridWidth: number): boolean {
  const idx = ty * gridWidth + tx;
  return idx >= 0 && idx < tileGrid.length && SOLID_TILES.has(tileGrid[idx]);
}

function bresenhamStep(
  err: number, dx: number, dy: number, sx: number, sy: number,
  tx: number, ty: number,
): { err: number; tx: number; ty: number } {
  const e2 = 2 * err;
  let newErr = err;
  let newTx = tx;
  let newTy = ty;
  if (e2 > -dy) { newErr -= dy; newTx += sx; }
  if (e2 < dx) { newErr += dx; newTy += sy; }
  return { err: newErr, tx: newTx, ty: newTy };
}

export function lineOfSight(
  x1: number, y1: number,
  x2: number, y2: number,
  tileGrid: Uint8Array,
  gridWidth: number,
  tileSize = 16,
): boolean {
  let tx0 = Math.floor(x1 / tileSize);
  let ty0 = Math.floor(y1 / tileSize);
  const tx1 = Math.floor(x2 / tileSize);
  const ty1 = Math.floor(y2 / tileSize);

  const dx = Math.abs(tx1 - tx0);
  const dy = Math.abs(ty1 - ty0);
  const sx = tx0 < tx1 ? 1 : -1;
  const sy = ty0 < ty1 ? 1 : -1;
  let err = dx - dy;

  for (;;) {
    if (isTileSolid(tx0, ty0, tileGrid, gridWidth)) return false;
    if (tx0 === tx1 && ty0 === ty1) break;
    ({ err, tx: tx0, ty: ty0 } = bresenhamStep(err, dx, dy, sx, sy, tx0, ty0));
  }
  return true;
}

export interface SlideResult {
  x: number;
  y: number;
}

/**
 * Attempt to move a circle entity by (dx, dy) against a tile grid.
 * If the full move is blocked, try sliding along each axis independently.
 * Returns the final valid position.
 */
export function wallSlide(
  x: number, y: number,
  dx: number, dy: number,
  radius: number,
  tileGrid: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  tileSize = 16,
): SlideResult {
  // Try full move first
  const nx = x + dx;
  const ny = y + dy;
  if (!collidesWithGrid(nx, ny, radius, tileGrid, gridWidth, gridHeight, tileSize)) {
    return { x: nx, y: ny };
  }

  // Try sliding along X only
  const slideX = !collidesWithGrid(nx, y, radius, tileGrid, gridWidth, gridHeight, tileSize);
  // Try sliding along Y only
  const slideY = !collidesWithGrid(x, ny, radius, tileGrid, gridWidth, gridHeight, tileSize);

  if (slideX && slideY) {
    // Both work — pick the axis with larger movement
    return Math.abs(dx) >= Math.abs(dy) ? { x: nx, y } : { x, y: ny };
  }
  if (slideX) return { x: nx, y };
  if (slideY) return { x, y: ny };

  // Fully blocked
  return { x, y };
}

/**
 * Check whether a circle at (cx,cy) with given radius overlaps any solid tile.
 * Checks all tiles the circle's bounding box touches.
 */
function collidesWithGrid(
  cx: number, cy: number,
  radius: number,
  tileGrid: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  tileSize: number,
): boolean {
  const minTX = Math.max(0, Math.floor((cx - radius) / tileSize));
  const maxTX = Math.min(gridWidth - 1, Math.floor((cx + radius) / tileSize));
  const minTY = Math.max(0, Math.floor((cy - radius) / tileSize));
  const maxTY = Math.min(gridHeight - 1, Math.floor((cy + radius) / tileSize));

  for (let ty = minTY; ty <= maxTY; ty++) {
    for (let tx = minTX; tx <= maxTX; tx++) {
      const tile = tileGrid[ty * gridWidth + tx];
      if (SOLID_TILES.has(tile)) {
        // Tile rect in pixel space
        if (circleVsRect(cx, cy, radius, tx * tileSize, ty * tileSize, tileSize, tileSize)) {
          return true;
        }
      }
    }
  }
  return false;
}
