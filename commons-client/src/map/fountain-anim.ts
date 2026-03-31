// map/fountain-anim.ts — Animated fountain tile overlay
//
// The tile cache is static (built once per chunk). Fountain animation is drawn
// as a per-frame overlay on top of the cached map.
//
// Fountain tiles in chunk 0,0: rows 13–15, cols 19–21 (3×3 grid).
// Animation: cycling water ripples using sinusoidal frame offsets.

import { TILE, ROWS, COLS } from "../state.ts";
import { TILE_FOUNTAIN } from "./chunk.ts";

const ANIM_PERIOD = 40; // frames per full cycle

export function drawFountainAnimation(
  ctx: CanvasRenderingContext2D,
  map: Uint8Array[] | null,
  frame: number,
  _fountainWaterColor: string
): void {
  if (!map) return;

  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (map[ty][tx] !== TILE_FOUNTAIN) continue;

      const x = tx * TILE;
      const y = ty * TILE;

      // Phase offset per tile position for ripple effect
      const phase = ((tx + ty) * 7 + frame) % ANIM_PERIOD;
      const t = phase / ANIM_PERIOD;
      const rippleAlpha = 0.15 + Math.sin(t * Math.PI * 2) * 0.12;

      // Ripple overlay
      ctx.save();
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, rippleAlpha)})`;
      ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);

      // Sparkle dot (animated position within tile)
      const sparkX = x + 5 + Math.round(Math.sin(t * Math.PI * 2 + tx) * 3);
      const sparkY = y + 5 + Math.round(Math.cos(t * Math.PI * 2 + ty) * 3);
      ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(t * Math.PI * 4) * 0.3})`;
      ctx.fillRect(sparkX, sparkY, 2, 2);

      ctx.restore();
    }
  }
}
