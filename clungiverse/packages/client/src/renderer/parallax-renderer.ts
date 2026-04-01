// Clungiverse v2 — Parallax Background Renderer
// Phase 4 Enhancement D: multi-layer parallax behind the tile grid

import { Container, Sprite, Texture } from 'pixi.js';

// Layer 0: subtle dark starfield/noise pattern (tiling 256x256)
// Layer 1: faint fog wisps (tiling 512x256)

let bgContainer: Container | null = null;
let layer0Sprite: Sprite | null = null;
let layer1Sprite: Sprite | null = null;
let layer0Tex: Texture | null = null;
let layer1Tex: Texture | null = null;

const LAYER0_SPEED = 0.05;
const LAYER1_SPEED = 0.15;

function createStarfieldTexture(): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, size, size);

  // Scatter dim dots
  const rng = mulberry32(42);
  for (let i = 0; i < 120; i++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    const brightness = 20 + Math.floor(rng() * 30);
    const alpha = 0.3 + rng() * 0.4;
    ctx.fillStyle = `rgba(${brightness},${brightness},${brightness + 10},${alpha})`;
    const r = 0.5 + rng() * 0.8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return Texture.from(canvas);
}

function createFogTexture(): Texture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Transparent base
  ctx.clearRect(0, 0, w, h);

  // A few soft horizontal blurred shapes
  const rng = mulberry32(77);
  for (let i = 0; i < 6; i++) {
    const cx = rng() * w;
    const cy = h * 0.2 + rng() * h * 0.6;
    const rx = 60 + rng() * 100;
    const ry = 10 + rng() * 20;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    grad.addColorStop(0, 'rgba(180,180,200,0.08)');
    grad.addColorStop(0.5, 'rgba(160,160,180,0.04)');
    grad.addColorStop(1, 'rgba(140,140,160,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  return Texture.from(canvas);
}

// Simple seeded RNG (mulberry32)
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function initParallax(stage: Container): Container {
  bgContainer = new Container();

  // Layer 0: starfield
  layer0Tex = createStarfieldTexture();
  layer0Sprite = new Sprite(layer0Tex);
  // Scale to cover a large area; we'll tile by repositioning
  layer0Sprite.width = 256 * 8;
  layer0Sprite.height = 256 * 6;
  layer0Sprite.alpha = 0.6;
  bgContainer.addChild(layer0Sprite);

  // Layer 1: fog wisps
  layer1Tex = createFogTexture();
  layer1Sprite = new Sprite(layer1Tex);
  layer1Sprite.width = 512 * 6;
  layer1Sprite.height = 256 * 6;
  layer1Sprite.alpha = 0.06;
  bgContainer.addChild(layer1Sprite);

  // Insert at index 0 (behind worldContainer)
  stage.addChildAt(bgContainer, 0);

  return bgContainer;
}

export function updateParallax(
  cameraX: number,
  cameraY: number,
  screenW: number,
  screenH: number,
  zoom: number,
): void {
  if (!bgContainer || !layer0Sprite || !layer1Sprite) return;

  // Position layers based on camera with parallax factor
  // Layer 0: slowest (0.05x)
  const l0x = -(cameraX * LAYER0_SPEED * zoom) + screenW / 2;
  const l0y = -(cameraY * LAYER0_SPEED * zoom) + screenH / 2;
  layer0Sprite.position.set(
    l0x - layer0Sprite.width / 2,
    l0y - layer0Sprite.height / 2,
  );

  // Layer 1: mid (0.15x)
  const l1x = -(cameraX * LAYER1_SPEED * zoom) + screenW / 2;
  const l1y = -(cameraY * LAYER1_SPEED * zoom) + screenH / 2;
  layer1Sprite.position.set(
    l1x - layer1Sprite.width / 2,
    l1y - layer1Sprite.height / 2,
  );
}

export function destroyParallax(stage: Container): void {
  if (bgContainer) {
    stage.removeChild(bgContainer);
    bgContainer.destroy({ children: true });
    bgContainer = null;
  }
  if (layer0Tex) {
    layer0Tex.destroy(true);
    layer0Tex = null;
  }
  if (layer1Tex) {
    layer1Tex.destroy(true);
    layer1Tex = null;
  }
  layer0Sprite = null;
  layer1Sprite = null;
}
