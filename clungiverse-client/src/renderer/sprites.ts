// Clungiverse Sprite Infrastructure
// Mob canvas sprite lookup, PNG image cache, and persona avatar preloading.
// Extracted from entity-renderer.ts to separate asset-loading concerns from rendering.

import { mobSlug } from '../utils';
import type { PersonaSlug } from '../state';

// ─── Canvas Sprite Functions ──────────────────────────────────────────────────

/**
 * Look up a canvas sprite draw function for a mob by its display_name.
 * Returns the function if found in mob-sprites.js (loaded as window globals), otherwise null.
 */
export function getMobSpriteDrawFn(displayName: string): ((ctx: CanvasRenderingContext2D, cx: number, cy: number) => void) | null {
  const slug = mobSlug(displayName);
  const fn = (window as Record<string, unknown>)[`drawSprite_${slug}`];
  if (typeof fn === 'function') {
    return fn as (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void;
  }
  return null;
}

// ─── Mob PNG Image Cache ──────────────────────────────────────────────────────
// Lazy-loads /mob-images/<slug>.png on first request.
// Returns a ready HTMLImageElement or null if not loaded/not found.

const _mobPngCache = new Map<string, HTMLImageElement | 'missing'>();

export function getMobPngImage(displayName: string): HTMLImageElement | null {
  const slug = mobSlug(displayName);
  const cached = _mobPngCache.get(slug);
  if (cached === 'missing') return null;
  if (cached) {
    return cached.complete && cached.naturalWidth > 0 ? cached : null;
  }
  // Not yet requested — kick off a load
  const img = new Image();
  img.src = `/mob-images/${slug}.png`;
  img.onload = () => { _mobPngCache.set(slug, img); };
  img.onerror = () => { _mobPngCache.set(slug, 'missing'); };
  // Store immediately so we don't fire duplicate loads
  _mobPngCache.set(slug, img);
  return null; // Not ready yet on first call
}

// ─── Persona Avatar Cache ─────────────────────────────────────────────────────

const PERSONA_AVATAR_FILES: Record<PersonaSlug, string> = {
  holden: 'bloodfeast.gif',
  broseidon: 'fit-bro_a.gif',
  deckard_cain: 'deckard-cain_a.gif',
  galactus: 'galactus_a.gif',
  crundle: 'crundle.png',
};

const avatarCache = new Map<PersonaSlug, HTMLImageElement>();
const avatarReady = new Set<PersonaSlug>();
let avatarsPreloaded = false;

export function preloadAvatars(): void {
  if (avatarsPreloaded) return;
  avatarsPreloaded = true;
  for (const [slug, filename] of Object.entries(PERSONA_AVATAR_FILES)) {
    const img = new Image();
    img.onload = () => { avatarReady.add(slug as PersonaSlug); };
    img.src = `/avatars/${filename}`;
    avatarCache.set(slug as PersonaSlug, img);
  }
}

export function getAvatar(slug: PersonaSlug): HTMLImageElement | null {
  if (!avatarReady.has(slug)) return null;
  return avatarCache.get(slug) ?? null;
}
