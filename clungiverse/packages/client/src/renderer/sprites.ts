// Clungiverse v2 — Sprite Infrastructure (PixiJS)
// Mob canvas sprite lookup, PNG image cache, and persona avatar preloading as PixiJS Textures.

import { Texture } from 'pixi.js';
import { mobSlug } from '../utils';
import type { PersonaSlug } from '../state';

// ─── Canvas Sprite Functions ──────────────────────────────────────────────────

/**
 * Look up a canvas sprite draw function for a mob by its display_name.
 * Returns the function if found in mob-sprites.js (loaded as window globals), otherwise null.
 */
export function getMobSpriteDrawFn(displayName: string): ((ctx: CanvasRenderingContext2D, cx: number, cy: number) => void) | null {
  const slug = mobSlug(displayName);
  const fn = (window as unknown as Record<string, unknown>)[`drawSprite_${slug}`];
  if (typeof fn === 'function') {
    return fn as (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void;
  }
  return null;
}

// ─── Mob Texture Cache ───────────────────────────────────────────────────────
// Three-tier lookup: (1) canvas draw function -> Texture, (2) PNG URL -> Texture,
// (3) base64 from state.mobSprites -> Texture, (4) null for fallback shape.

const _mobTextureCache = new Map<string, Texture | 'missing'>();

// Offscreen canvas for converting draw functions / base64 images to textures
const _offscreen = document.createElement('canvas');
_offscreen.width = 32;
_offscreen.height = 32;
const _offCtx = _offscreen.getContext('2d')!;

function textureFromCanvas(canvas: HTMLCanvasElement): Texture {
  // Create a copy so the source canvas can be reused
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const copyCtx = copy.getContext('2d')!;
  copyCtx.drawImage(canvas, 0, 0);
  return Texture.from(copy);
}

/**
 * Try to build a Texture from a canvas draw function (window.drawSprite_<slug>).
 */
function tryCanvasDrawTexture(displayName: string): Texture | null {
  const drawFn = getMobSpriteDrawFn(displayName);
  if (!drawFn) return null;
  _offCtx.clearRect(0, 0, 32, 32);
  drawFn(_offCtx, 16, 16);
  return textureFromCanvas(_offscreen);
}

/**
 * Get a mob Texture through the three-tier lookup.
 * Returns null if no texture is available (caller should use fallback shape).
 */
export function getMobTexture(displayName: string, mobSprites?: Map<string, HTMLImageElement>): Texture | null {
  const slug = mobSlug(displayName);
  const cached = _mobTextureCache.get(slug);
  if (cached === 'missing') return null;
  if (cached) return cached;

  // Tier 1: Canvas draw function
  const canvasTex = tryCanvasDrawTexture(displayName);
  if (canvasTex) {
    _mobTextureCache.set(slug, canvasTex);
    return canvasTex;
  }

  // Tier 2: PNG from /mob-images/<slug>.png — kick off async load
  const img = new Image();
  img.src = `/mob-images/${slug}.png`;
  img.onload = () => {
    const tex = Texture.from(img);
    _mobTextureCache.set(slug, tex);
  };
  img.onerror = () => {
    // Tier 3: base64 from state.mobSprites
    const mobImg = mobSprites?.get(displayName);
    if (mobImg && mobImg.complete && mobImg.naturalWidth > 0) {
      const tex = Texture.from(mobImg);
      _mobTextureCache.set(slug, tex);
    } else {
      _mobTextureCache.set(slug, 'missing');
    }
  };

  // Store a sentinel so we don't fire duplicate loads
  // Return null this frame; texture will be available on subsequent frames
  return null;
}

/**
 * Check the base64 mob sprites and create textures for any that haven't been cached yet.
 * Call this periodically (e.g. each render frame) to pick up newly generated sprites.
 */
export function syncMobSprites(mobSprites: Map<string, HTMLImageElement>): void {
  for (const [displayName, img] of mobSprites) {
    const slug = mobSlug(displayName);
    if (_mobTextureCache.has(slug)) continue;
    if (img.complete && img.naturalWidth > 0) {
      _mobTextureCache.set(slug, Texture.from(img));
    }
  }
}

// ─── Persona Avatar Cache ─────────────────────────────────────────────────────

const PERSONA_AVATAR_FILES: Record<PersonaSlug, string> = {
  holden: 'bloodfeast.gif',
  broseidon: 'fit-bro_a.gif',
  deckard_cain: 'deckard-cain_a.gif',
  galactus: 'galactus_a.gif',
  crundle: 'crundle.png',
};

const avatarTextureCache = new Map<PersonaSlug, Texture>();
const avatarImageCache = new Map<PersonaSlug, HTMLImageElement>();
let avatarsPreloaded = false;

export function preloadAvatars(): void {
  if (avatarsPreloaded) return;
  avatarsPreloaded = true;
  for (const [slug, filename] of Object.entries(PERSONA_AVATAR_FILES)) {
    const img = new Image();
    img.onload = () => {
      // Draw to canvas first — more reliable than Texture.from(HTMLImageElement) in PixiJS 8,
      // and avoids any GIF / cross-origin canvas taint issues.
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, size, size);
        avatarTextureCache.set(slug as PersonaSlug, textureFromCanvas(canvas));
      }
    };
    img.onerror = () => {
      // eslint-disable-next-line no-console
      console.warn(`[sprites] Failed to load avatar: /avatars/${filename}`);
    };
    img.src = `/avatars/${filename}`;
    avatarImageCache.set(slug as PersonaSlug, img);
  }
}

export function getAvatarTexture(slug: PersonaSlug): Texture | null {
  return avatarTextureCache.get(slug) ?? null;
}
