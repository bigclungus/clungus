// Temporary combat powerups — dropped by enemies, expire after a set duration.
// These are separate from the permanent between-floor powerups (loot.ts).

import type { EffectiveStats } from "./stats.ts";

export interface TempPowerupTemplate {
  id: string;
  name: string;
  emoji: string;
  durationMs: number;
  description: string;
  /** Mutate a copy of EffectiveStats to apply the powerup's multipliers. */
  applyMultipliers?: (stats: EffectiveStats) => EffectiveStats;
  /** Special flag for effects that require custom handling in the game loop. */
  special?: "lifesteal";
}

export const TEMP_POWERUP_TEMPLATES: TempPowerupTemplate[] = [
  {
    id: "berserker",
    name: "Berserker",
    emoji: "🔥",
    durationMs: 20000,
    description: "ATK ×3, DEF halved",
    applyMultipliers: (s) => ({ ...s, ATK: s.ATK * 3, DEF: Math.floor(s.DEF / 2) }),
  },
  {
    id: "shield",
    name: "Iron Skin",
    emoji: "🛡️",
    durationMs: 15000,
    description: "DEF ×5",
    applyMultipliers: (s) => ({ ...s, DEF: s.DEF * 5 }),
  },
  {
    id: "haste",
    name: "Haste",
    emoji: "⚡",
    durationMs: 10000,
    description: "SPD ×2",
    applyMultipliers: (s) => ({ ...s, SPD: s.SPD * 2 }),
  },
  {
    id: "lifesteal",
    name: "Lifesteal",
    emoji: "💚",
    durationMs: 25000,
    description: "Heals 10% of damage dealt",
    special: "lifesteal",
    // No applyMultipliers — handled separately in damage resolution
  },
  {
    id: "glass_cannon",
    name: "Glass Cannon",
    emoji: "💥",
    durationMs: 12000,
    description: "ATK ×5, DEF = 0",
    applyMultipliers: (s) => ({ ...s, ATK: s.ATK * 5, DEF: 0 }),
  },
];

/** Lookup by template id. Throws if not found so callers can't silently swallow bad ids. */
export function getTempPowerupTemplate(id: string): TempPowerupTemplate {
  const tmpl = TEMP_POWERUP_TEMPLATES.find((t) => t.id === id);
  if (!tmpl) throw new Error(`Unknown temp powerup template id: ${id}`);
  return tmpl;
}

export interface ActiveTempPowerup {
  templateId: string;
  expiresAt: number; // ms timestamp (Date.now())
}

export interface FloorPickup {
  id: string;
  /** For temp_powerup pickups: the template id. For health pickups: 'health'. */
  templateId: string;
  type: 'temp_powerup' | 'health';
  /** Only set for type === 'health'. Amount of HP to restore. */
  healAmount?: number;
  x: number;
  y: number;
  pickedUpBy: string | null; // playerId or null
}
