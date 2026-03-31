// sprites.ts — Sprite winner polling for NPC rendering
// Mirrors V1 grazing.html SPRITE_SLUG_MAP + fetchSpriteWinners logic

// Single source of truth for all NPC metadata.
// displayName: human-readable label shown on hover.
// sprite: present only for NPCs with a sprite poll; id = sprite function prefix,
//         pollSlug = /api/vote/sprite-<pollSlug> key.
const NPC_REGISTRY: Record<string, { displayName: string; sprite?: { id: string; pollSlug: string } }> = {
  'chairman':          { displayName: 'Ibrahim the Immovable',  sprite: { id: 'chairman',   pollSlug: 'chairman'   } },
  'critic':            { displayName: 'Pippi the Pitiless',     sprite: { id: 'critic',     pollSlug: 'critic'     } },
  'architect':         { displayName: 'Kwame the Constructor',  sprite: { id: 'architect',  pollSlug: 'architect'  } },
  'ux':                { displayName: 'Yuki the Yielding',      sprite: { id: 'ux',         pollSlug: 'ux'         } },
  'designer':          { displayName: 'Vesper the Vivid',       sprite: { id: 'designer',   pollSlug: 'designer'   } },
  'galactus':          { displayName: 'Galactus',               sprite: { id: 'galactus',   pollSlug: 'galactus'   } },
  'hume':              { displayName: 'David Hume',             sprite: { id: 'hume',       pollSlug: 'hume'       } },
  'otto':              { displayName: 'Otto Atreides',          sprite: { id: 'otto',       pollSlug: 'otto'       } },
  'pm':                { displayName: "Chud O'Bikeshedder",     sprite: { id: 'pm',         pollSlug: 'pm'         } },
  'spengler':          { displayName: 'Spengler the Doomed',    sprite: { id: 'spengler',   pollSlug: 'spengler'   } },
  'trump':             { displayName: 'Punished Trump',         sprite: { id: 'trump',      pollSlug: 'trump'      } },
  'uncle-bob':         { displayName: 'Uncle Bob',              sprite: { id: 'unclebob',   pollSlug: 'uncle-bob'  } },
  'bloodfeast':        { displayName: 'Holden Bloodfeast',      sprite: { id: 'bloodfeast', pollSlug: 'bloodfeast' } },
  'adelbert':          { displayName: 'Adelbert Hominem',       sprite: { id: 'adelbert',   pollSlug: 'adelbert'   } },
  'jhaddu':            { displayName: 'Jhaddu',                 sprite: { id: 'jhaddu',     pollSlug: 'jhaddu'     } },
  'morgan':            { displayName: 'Morgan (they/them)',     sprite: { id: 'morgan',     pollSlug: 'morgan'     } },
  'the-kid':           { displayName: 'The Kid',                sprite: { id: 'the_kid',    pollSlug: 'the-kid'    } },
  'the-correspondent': { displayName: 'The Correspondent' },
  'chaz':              { displayName: 'Chaz the Destroyer' },
};

// Derived maps — do not edit these directly; update NPC_REGISTRY above.
export const NPC_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(NPC_REGISTRY).map(([slug, { displayName }]) => [slug, displayName])
);

// Maps NPC name (server slug) → { id: sprite function ID, pollSlug: poll slug }
// Only NPCs with sprite entries appear here.
const SPRITE_SLUG_MAP: Record<string, { id: string; pollSlug: string }> = Object.fromEntries(
  Object.entries(NPC_REGISTRY)
    .filter(([, { sprite }]) => sprite !== undefined)
    .map(([slug, { sprite }]) => [slug, sprite as { id: string; pollSlug: string }])
);

// Current winners: npcName → "A"|"B"|"C"
const SPRITE_WINNERS: Record<string, string> = {};

function fetchSpriteWinners(): void {
  const slugs = Object.keys(SPRITE_SLUG_MAP);
  for (const name of slugs) {
    const info = SPRITE_SLUG_MAP[name];
    fetch('/api/vote/sprite-' + encodeURIComponent(info.pollSlug))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { winner?: string } | null) => {
        if (d?.winner) {
          SPRITE_WINNERS[name] = d.winner;
        }
      })
      .catch((err: unknown) => { throw err instanceof Error ? err : new Error(String(err)); });
  }
}

// Initial fetch + poll every 30s
fetchSpriteWinners();
setInterval(fetchSpriteWinners, 30000);

/**
 * Returns the winning sprite variant ("A"|"B"|"C") for a given NPC name slug,
 * or null if no winner is known yet or the NPC has no sprite poll.
 */
export function getWinner(npcName: string): string | null {
  return SPRITE_WINNERS[npcName] ?? null;
}

/**
 * Returns the sprite function ID for a given NPC name slug,
 * or null if the NPC has no sprite entry.
 */
export function getSpriteId(npcName: string): string | null {
  if (!(npcName in SPRITE_SLUG_MAP)) return null;
  return SPRITE_SLUG_MAP[npcName].id;
}

export type SpriteFn = (ctx: CanvasRenderingContext2D, x: number, y: number) => void;

/**
 * Returns the sprite draw function for a given sprite ID + winner variant,
 * or null if the function isn't loaded on window yet.
 */
export function getSpriteFn(spriteId: string, winner: string): SpriteFn | null {
  return (window as Record<string, SpriteFn | undefined>)[`drawSprite_${spriteId}_${winner}`] ?? null;
}

// All expected sprite function names, derived from SPRITE_SLUG_MAP ids × variants A/B/C
const SPRITE_FUNCTION_NAMES: string[] = Object.values(SPRITE_SLUG_MAP).flatMap(({ id }) => [
  `drawSprite_${id}_A`,
  `drawSprite_${id}_B`,
  `drawSprite_${id}_C`,
]);

/**
 * Validates that all expected sprite functions are present on window.
 * Called at startup (with a delay to allow sprite scripts to load).
 * Missing sprites fall back to colored boxes — this is expected if scripts
 * haven't loaded yet, but a persistent warning indicates a load failure.
 */
export function validateSprites(): void {
  const missing: string[] = [];
  for (const name of SPRITE_FUNCTION_NAMES) {
    if (typeof (window as Record<string, unknown>)[name] !== 'function') {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    console.warn('[sprites] missing sprite functions:', missing);
    // Missing sprites will fall back to colored boxes — expected if scripts haven't loaded yet
  } else {
    console.log('[sprites] all', SPRITE_FUNCTION_NAMES.length, 'sprite functions validated OK');
  }
}
