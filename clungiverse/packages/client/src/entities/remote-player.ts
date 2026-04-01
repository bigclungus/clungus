// Clungiverse Remote Player Interpolation
// Smoothly renders remote players between server tick updates

import type { DungeonClientState } from '../state';

// Server ticks at 16Hz = 62.5ms between ticks
const TICK_INTERVAL = 62.5;

export function getInterpolationAlpha(state: DungeonClientState): number {
  if (state.tickTimestamp === 0 || state.prevTickTimestamp === 0) return 1;

  const elapsed = performance.now() - state.tickTimestamp;
  const tickDelta = state.tickTimestamp - state.prevTickTimestamp;

  // Use actual tick delta if available, otherwise default
  const interval = tickDelta > 0 ? tickDelta : TICK_INTERVAL;

  // Clamp alpha to [0, 1]
  const alpha = Math.min(1, Math.max(0, elapsed / interval));
  return alpha;
}

// Utility lerp used by entity renderers
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Get interpolated position for any entity with prev/current positions
export function getInterpolatedPos(
  prevX: number,
  prevY: number,
  x: number,
  y: number,
  state: DungeonClientState,
): { ix: number; iy: number } {
  const alpha = getInterpolationAlpha(state);
  return {
    ix: lerp(prevX, x, alpha),
    iy: lerp(prevY, y, alpha),
  };
}
