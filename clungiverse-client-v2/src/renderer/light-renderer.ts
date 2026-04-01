// Clungiverse v2 — Player Light & Vignette + Per-Floor Color Grading
// Phase 3 visual enhancements + Phase 4 Enhancement E

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { TILE_SIZE } from '../state';

const FOG_RADIUS = 9;

// === Enhancement 3: Player Light Gradient ===

let lightTexture: Texture | null = null;
let lightSprite: Sprite | null = null;

function createLightTexture(radius: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = radius * 2;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, 'rgba(255,240,200,0.12)');
  grad.addColorStop(0.5, 'rgba(255,240,200,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, radius * 2, radius * 2);
  return Texture.from(canvas);
}

export function initPlayerLight(worldContainer: Container): Sprite {
  const radius = Math.round(FOG_RADIUS * TILE_SIZE * 0.7);
  lightTexture = createLightTexture(radius);
  lightSprite = new Sprite(lightTexture);
  lightSprite.anchor.set(0.5);
  lightSprite.blendMode = 'add';
  lightSprite.visible = false;
  worldContainer.addChild(lightSprite);
  return lightSprite;
}

export function updatePlayerLight(x: number, y: number): void {
  if (!lightSprite) return;
  lightSprite.visible = true;
  lightSprite.position.set(x, y);
  // Subtle flicker
  const flicker = Math.sin(performance.now() / 400) * 0.02;
  lightSprite.alpha = 1.0 + flicker;
}

export function hidePlayerLight(): void {
  if (lightSprite) lightSprite.visible = false;
}

export function destroyPlayerLight(worldContainer: Container): void {
  if (lightSprite) {
    worldContainer.removeChild(lightSprite);
    lightSprite.destroy();
    lightSprite = null;
  }
  if (lightTexture) {
    lightTexture.destroy(true);
    lightTexture = null;
  }
}

// === Enhancement 4: Vignette Overlay ===

let vignetteTexture: Texture | null = null;
let vignetteSprite: Sprite | null = null;
let vignetteW = 0;
let vignetteH = 0;

function createVignetteTexture(w: number, h: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const cx = w / 2;
  const cy = h / 2;
  const outerRadius = Math.sqrt(cx * cx + cy * cy);
  const grad = ctx.createRadialGradient(cx, cy, outerRadius * 0.35, cx, cy, outerRadius);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return Texture.from(canvas);
}

export function initVignette(hudContainer: Container, screenW: number, screenH: number): void {
  vignetteW = screenW;
  vignetteH = screenH;
  vignetteTexture = createVignetteTexture(screenW, screenH);
  vignetteSprite = new Sprite(vignetteTexture);
  vignetteSprite.position.set(0, 0);
  hudContainer.addChild(vignetteSprite);
}

export function resizeVignette(hudContainer: Container, screenW: number, screenH: number): void {
  if (screenW === vignetteW && screenH === vignetteH) return;
  destroyVignette(hudContainer);
  initVignette(hudContainer, screenW, screenH);
}

export function destroyVignette(hudContainer: Container): void {
  if (vignetteSprite) {
    hudContainer.removeChild(vignetteSprite);
    vignetteSprite.destroy();
    vignetteSprite = null;
  }
  if (vignetteTexture) {
    vignetteTexture.destroy(true);
    vignetteTexture = null;
  }
  vignetteW = 0;
  vignetteH = 0;
}

// === Enhancement E: Per-Floor Color Grading ===

const FLOOR_GRADE_COLORS: Record<number, number> = {
  1: 0xE6DCC8,  // warm sepia
  // 2: neutral (no overlay)
  3: 0xC8D8E6,  // cool blue
  4: 0xE6D0B4,  // warm amber
};
// Floor 5+ uses dark purple
const FLOOR_GRADE_DEFAULT_5PLUS = 0xD0C0D8;
const COLOR_GRADE_ALPHA = 0.15;

let colorGradeGfx: Graphics | null = null;
let currentGradeFloor = -1;
let currentGradeW = 0;
let currentGradeH = 0;

export function initColorGrade(hudContainer: Container): void {
  if (colorGradeGfx) return;
  colorGradeGfx = new Graphics();
  colorGradeGfx.blendMode = 'multiply';
  hudContainer.addChild(colorGradeGfx);
}

export function updateColorGrade(floor: number, screenW: number, screenH: number): void {
  if (!colorGradeGfx) return;

  // Floor 2 = neutral, no overlay
  if (floor === 2) {
    colorGradeGfx.visible = false;
    currentGradeFloor = floor;
    return;
  }

  // Only redraw if floor or screen size changed
  if (floor === currentGradeFloor && screenW === currentGradeW && screenH === currentGradeH) return;

  currentGradeFloor = floor;
  currentGradeW = screenW;
  currentGradeH = screenH;

  let gradeColor: number;
  if (floor >= 5) {
    gradeColor = FLOOR_GRADE_DEFAULT_5PLUS;
  } else {
    gradeColor = FLOOR_GRADE_COLORS[floor] ?? 0xffffff;
  }

  // If color is white-ish (no real grading), hide
  if (gradeColor === 0xffffff) {
    colorGradeGfx.visible = false;
    return;
  }

  colorGradeGfx.clear();
  colorGradeGfx.rect(0, 0, screenW, screenH);
  colorGradeGfx.fill({ color: gradeColor, alpha: COLOR_GRADE_ALPHA });
  colorGradeGfx.visible = true;
}

export function destroyColorGrade(hudContainer: Container): void {
  if (colorGradeGfx) {
    hudContainer.removeChild(colorGradeGfx);
    colorGradeGfx.destroy();
    colorGradeGfx = null;
  }
  currentGradeFloor = -1;
  currentGradeW = 0;
  currentGradeH = 0;
}
