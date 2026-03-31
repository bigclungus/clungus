// Stat calculation for dungeon players: base persona stats + powerup modifiers.

import type { ActiveTempPowerup } from "./temp-powerups.ts";
import { getTempPowerupTemplate } from "./temp-powerups.ts";

export type { ActiveTempPowerup };

export interface BaseStats {
  maxHP: number;
  ATK: number;
  DEF: number;
  SPD: number; // movement speed (px/tick)
  LCK: number; // luck, affects crit
}

export interface Powerup {
  id: number;
  name: string;
  modifiers: Partial<BaseStats>;
}

export interface EffectiveStats extends BaseStats {
  autoAttackIntervalMs: number; // ms between auto-attacks
  critChance: number;           // 0-1 probability
}

/**
 * Combine base persona stats with all acquired powerup modifiers.
 * Permanent powerups are additive first; then temp powerup multipliers are applied on top.
 */
export function calculateEffectiveStats(
  base: BaseStats,
  powerups: Powerup[],
  activeTempPowerups?: ActiveTempPowerup[],
): EffectiveStats {
  const effective: BaseStats = {
    maxHP: base.maxHP,
    ATK: base.ATK,
    DEF: base.DEF,
    SPD: base.SPD,
    LCK: base.LCK,
  };

  for (const p of powerups) {
    if (p.modifiers.maxHP) effective.maxHP += p.modifiers.maxHP;
    if (p.modifiers.ATK) effective.ATK += p.modifiers.ATK;
    if (p.modifiers.DEF) effective.DEF += p.modifiers.DEF;
    if (p.modifiers.SPD) effective.SPD += p.modifiers.SPD;
    if (p.modifiers.LCK) effective.LCK += p.modifiers.LCK;
  }

  // Clamp stats to minimum reasonable values
  effective.maxHP = Math.max(1, effective.maxHP);
  effective.ATK = Math.max(0, effective.ATK);
  effective.DEF = Math.max(0, effective.DEF);
  effective.SPD = Math.max(0.5, effective.SPD);
  effective.LCK = Math.max(0, effective.LCK);

  // Auto-attack rate: 6 / (1 + SPD * 0.05) ms — 100x faster than original 600
  const autoAttackIntervalMs = 6 / (1 + effective.SPD * 0.05);

  // Crit chance: LCK * 0.02, capped at 0.8
  const critChance = Math.min(0.8, effective.LCK * 0.02);

  let result: EffectiveStats = {
    ...effective,
    autoAttackIntervalMs,
    critChance,
  };

  // Apply active temp powerup multipliers on top of permanent stats
  if (activeTempPowerups && activeTempPowerups.length > 0) {
    const now = Date.now();
    for (const active of activeTempPowerups) {
      if (active.expiresAt <= now) continue;
      let tmpl;
      try {
        tmpl = getTempPowerupTemplate(active.templateId);
      } catch {
        continue;
      }
      if (tmpl.applyMultipliers) {
        result = tmpl.applyMultipliers(result) as EffectiveStats;
        // Recalculate derived values after multipliers
        result.autoAttackIntervalMs = 6 / (1 + result.SPD * 0.05);
        result.critChance = Math.min(0.8, result.LCK * 0.02);
      }
    }
  }

  return result;
}
