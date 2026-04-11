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

function recalcDerived(s: EffectiveStats): void {
  s.autoAttackIntervalMs = 6 / (1 + s.SPD * 0.05);
  s.critChance = Math.min(0.8, s.LCK * 0.02);
}

function applyTempMultipliers(result: EffectiveStats, activeTempPowerups: ActiveTempPowerup[]): EffectiveStats {
  const now = Date.now();
  let current = result;
  for (const active of activeTempPowerups) {
    if (active.expiresAt <= now) continue;
    let tmpl;
    try { tmpl = getTempPowerupTemplate(active.templateId); } catch (err) { console.warn("[stats] Unknown temp powerup template:", active.templateId, err); continue; }
    if (tmpl.applyMultipliers) {
      current = { ...tmpl.applyMultipliers(current), autoAttackIntervalMs: 0, critChance: 0 };
      recalcDerived(current);
    }
  }
  return current;
}

function applyPowerupModifiers(effective: BaseStats, powerups: Powerup[]): void {
  for (const p of powerups) {
    if (p.modifiers.maxHP) effective.maxHP += p.modifiers.maxHP;
    if (p.modifiers.ATK) effective.ATK += p.modifiers.ATK;
    if (p.modifiers.DEF) effective.DEF += p.modifiers.DEF;
    if (p.modifiers.SPD) effective.SPD += p.modifiers.SPD;
    if (p.modifiers.LCK) effective.LCK += p.modifiers.LCK;
  }
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
  const effective: BaseStats = { maxHP: base.maxHP, ATK: base.ATK, DEF: base.DEF, SPD: base.SPD, LCK: base.LCK };
  applyPowerupModifiers(effective, powerups);

  effective.maxHP = Math.max(1, effective.maxHP);
  effective.ATK = Math.max(0, effective.ATK);
  effective.DEF = Math.max(0, effective.DEF);
  effective.SPD = Math.max(0.5, effective.SPD);
  effective.LCK = Math.max(0, effective.LCK);

  const result: EffectiveStats = {
    ...effective,
    autoAttackIntervalMs: 6 / (1 + effective.SPD * 0.05),
    critChance: Math.min(0.8, effective.LCK * 0.02),
  };

  if (activeTempPowerups && activeTempPowerups.length > 0) {
    return applyTempMultipliers(result, activeTempPowerups);
  }
  return result;
}
