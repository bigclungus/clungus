// Core combat resolution — all server-authoritative.
// Handles auto-attacks, spacebar powers, damage application, and kill tracking.

import { circleVsCircle, pointInCone } from "./collision";
import type { EffectiveStats } from "./stats";
import type { ActiveTempPowerup } from "./temp-powerups.ts";

// ─── Local Types ────────────────────────────────────────────────────────────

export interface DamageResult {
  hit: boolean;
  damage: number;
  isCrit: boolean;
  targetId: string;
  attackerId: string;
}

export interface HealEvent {
  targetId: string;
  amount: number;
}

export interface PowerResult {
  activated: boolean;
  powerName: string;
  /** Entities affected (enemy IDs, player IDs, zone IDs depending on power). */
  affected: string[];
  /** Optional spawned AoE zone. */
  spawnedZone?: AoEZone;
  /** HP healed (Galactus consume). */
  healed?: number;
  /** ATK bonus gained (Broseidon stacks). */
  atkBonus?: number;
  /** Per-target heal events (Deckard Cain healing aura). */
  healEvents?: HealEvent[];
}

export type PersonaPower = "holden" | "broseidon" | "deckard_cain" | "galactus" | "crundle";

export interface CombatEntity {
  id: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHP: number;
  stats: EffectiveStats;
  facing: "left" | "right";
  iFrameUntilTick: number; // tick at which i-frames expire
  alive: boolean;
}

export interface PlayerEntity extends CombatEntity {
  persona: PersonaPower;
  powerCooldownUntilTick: number;
  /** Broseidon-specific: active kill-stack window end tick. */
  broseidonWindowEnd: number;
  /** Broseidon-specific: accumulated ATK bonus from kills in current window. */
  broseidonStacks: number;
  /** Currently active temporary powerups for this player. */
  activeTempPowerups: ActiveTempPowerup[];
  /** Crundle-specific: tick until which Nervous Scramble is active. 0 = inactive. */
  scramblingUntilTick: number;
}

export interface EnemyEntity extends CombatEntity {
  /** Enemies below this HP fraction can be consumed by Galactus. */
  stunUntilTick: number;
  slowMultiplier: number; // 1.0 = normal, <1.0 = slowed
}

export interface AoEZone {
  id: string;
  x: number;
  y: number;
  radius: number;
  expiresAtTick: number;
  owner: string; // player ID
  type: "deckard_slow"; // extensible
  slowFactor: number; // e.g. 0.6
}

// ─── Constants ──────────────────────────────────────────────────────────────

const AUTO_ATTACK_RANGE = 44;
const I_FRAME_TICKS = 8; // 8 ticks at 16Hz = 500ms

// Power constants
const HOLDEN_CONE_ANGLE = 60;
const HOLDEN_RANGE = 48;
const HOLDEN_STUN_TICKS = 24; // 1.5s at 16Hz
const HOLDEN_COOLDOWN_TICKS = 128; // 8s

const BROSEIDON_WINDOW_TICKS = 160; // 10s
const BROSEIDON_ATK_PER_KILL = 2;
const BROSEIDON_COOLDOWN_TICKS = 160; // 10s

const DECKARD_HEAL_RADIUS = 80;
const DECKARD_HEAL_MIN = 0.25; // 25% maxHP
const DECKARD_HEAL_MAX = 0.30; // 30% maxHP
const DECKARD_COOLDOWN_TICKS = 192; // 12s

const GALACTUS_RANGE = 36;
const GALACTUS_HP_THRESHOLD = 0.2;
const GALACTUS_HEAL_FRACTION = 0.15;
const GALACTUS_COOLDOWN_TICKS = 96; // 6s

const CRUNDLE_SCRAMBLE_TICKS = 32; // 2s at 16Hz
const CRUNDLE_CONTACT_DAMAGE_FRACTION = 0.5; // 50% ATK
const CRUNDLE_COOLDOWN_TICKS = 160; // 10s

// ─── Auto-Attack ────────────────────────────────────────────────────────────

/**
 * Resolve an auto-attack from attacker against the nearest in-range target.
 * Returns null if no valid target in range or target has i-frames.
 */
export function resolveAutoAttack(
  attacker: CombatEntity,
  targets: EnemyEntity[],
  tick: number,
): DamageResult | null {
  // Find nearest alive enemy in range
  let bestDist = Infinity;
  let bestTarget: EnemyEntity | null = null;

  for (const t of targets) {
    if (!t.alive) continue;
    if (t.iFrameUntilTick > tick) continue;
    const dx = attacker.x - t.x;
    const dy = attacker.y - t.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= AUTO_ATTACK_RANGE + attacker.radius + t.radius && dist < bestDist) {
      bestDist = dist;
      bestTarget = t;
    }
  }

  if (!bestTarget) return null;

  return rollDamage(attacker, bestTarget, tick);
}

// ─── Damage Calculation ─────────────────────────────────────────────────────

function rollDamage(
  attacker: CombatEntity,
  target: CombatEntity,
  tick: number,
): DamageResult {
  const variance = 1 + (Math.random() * 0.2 - 0.1); // 0.9 to 1.1
  const rawDamage = attacker.stats.ATK * variance;
  const mitigation = target.stats.DEF * 0.5;
  let finalDamage = Math.max(1, Math.floor(rawDamage - mitigation));

  const isCrit = Math.random() < attacker.stats.critChance;
  if (isCrit) {
    finalDamage = Math.floor(finalDamage * 1.5);
  }

  return {
    hit: true,
    damage: finalDamage,
    isCrit,
    targetId: target.id,
    attackerId: attacker.id,
  };
}

// ─── Spacebar Powers ────────────────────────────────────────────────────────

/**
 * Dispatch to the correct power handler based on player persona.
 */
export function resolvePower(
  player: PlayerEntity,
  enemies: EnemyEntity[],
  aoeZones: AoEZone[],
  tick: number,
  allPlayers?: PlayerEntity[],
): PowerResult | null {
  if (player.powerCooldownUntilTick > tick) return null;
  if (!player.alive) return null;

  switch (player.persona) {
    case "holden":
      return resolveHolden(player, enemies, tick);
    case "broseidon":
      return resolveBroseidon(player, tick);
    case "deckard_cain":
      return resolveDeckard(player, allPlayers ?? [player], tick);
    case "galactus":
      return resolveGalactus(player, enemies, tick);
    case "crundle":
      return resolveCrundle(player, tick);
  }
}

/** Holden — Overwhelming Force: 60deg cone stun, 48px range. */
function resolveHolden(
  player: PlayerEntity,
  enemies: EnemyEntity[],
  tick: number,
): PowerResult {
  const affected: string[] = [];

  for (const e of enemies) {
    if (!e.alive) continue;
    if (pointInCone(e.x, e.y, player.x, player.y, player.facing, HOLDEN_CONE_ANGLE, HOLDEN_RANGE)) {
      e.stunUntilTick = tick + HOLDEN_STUN_TICKS;
      affected.push(e.id);
    }
  }

  player.powerCooldownUntilTick = tick + HOLDEN_COOLDOWN_TICKS;
  return { activated: true, powerName: "overwhelming_force", affected };
}

/** Broseidon — Progressive Overload: 10s window, +2 ATK per kill. */
function resolveBroseidon(
  player: PlayerEntity,
  tick: number,
): PowerResult {
  player.broseidonWindowEnd = tick + BROSEIDON_WINDOW_TICKS;
  player.broseidonStacks = 0;
  player.powerCooldownUntilTick = tick + BROSEIDON_COOLDOWN_TICKS;

  return {
    activated: true,
    powerName: "progressive_overload",
    affected: [],
    atkBonus: 0,
  };
}

/** Deckard Cain — Healing Aura: AoE heal for self and allies within 80px. */
function resolveDeckard(
  player: PlayerEntity,
  allPlayers: PlayerEntity[],
  tick: number,
): PowerResult {
  const affected: string[] = [];
  const healEvents: HealEvent[] = [];

  for (const p of allPlayers) {
    if (!p.alive) continue;
    const dx = player.x - p.x;
    const dy = player.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > DECKARD_HEAL_RADIUS && p.id !== player.id) continue;

    const fraction = DECKARD_HEAL_MIN + Math.random() * (DECKARD_HEAL_MAX - DECKARD_HEAL_MIN);
    const healAmount = Math.floor(p.maxHP * fraction);
    p.hp = Math.min(p.maxHP, p.hp + healAmount);
    affected.push(p.id);
    healEvents.push({ targetId: p.id, amount: healAmount });
  }

  player.powerCooldownUntilTick = tick + DECKARD_COOLDOWN_TICKS;
  return {
    activated: true,
    powerName: "healing_aura",
    affected,
    healEvents,
  };
}

/** Galactus — Consume: execute low-HP enemies, heal per kill. */
function resolveGalactus(
  player: PlayerEntity,
  enemies: EnemyEntity[],
  tick: number,
): PowerResult {
  const affected: string[] = [];
  let totalHeal = 0;

  for (const e of enemies) {
    if (!e.alive) continue;
    const hpFraction = e.hp / e.maxHP;
    if (hpFraction >= GALACTUS_HP_THRESHOLD) continue;

    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > GALACTUS_RANGE + player.radius + e.radius) continue;

    // Instant kill
    e.hp = 0;
    e.alive = false;
    affected.push(e.id);

    const heal = Math.floor(player.maxHP * GALACTUS_HEAL_FRACTION);
    totalHeal += heal;
  }

  // Apply healing (capped at maxHP)
  player.hp = Math.min(player.maxHP, player.hp + totalHeal);

  player.powerCooldownUntilTick = tick + GALACTUS_COOLDOWN_TICKS;
  return {
    activated: true,
    powerName: "consume",
    affected,
    healed: totalHeal,
  };
}

/** Crundle — Nervous Scramble: sets scramblingUntilTick; contact damage is applied each tick in dungeon-loop. */
function resolveCrundle(
  player: PlayerEntity,
  tick: number,
): PowerResult {
  player.scramblingUntilTick = tick + CRUNDLE_SCRAMBLE_TICKS;
  player.powerCooldownUntilTick = tick + CRUNDLE_COOLDOWN_TICKS;

  return {
    activated: true,
    powerName: "nervous_scramble",
    affected: [],
  };
}

// ─── Crundle Scramble Helpers ────────────────────────────────────────────────

/** Returns the contact damage Crundle deals per hit during Nervous Scramble. */
export function getCrundleContactDamage(player: PlayerEntity): number {
  return Math.floor(player.stats.ATK * CRUNDLE_CONTACT_DAMAGE_FRACTION);
}

/** Returns true if Crundle's Nervous Scramble is currently active. */
export function isCrundleScrambling(player: PlayerEntity, tick: number): boolean {
  return player.persona === "crundle" && tick < player.scramblingUntilTick;
}

// ─── Damage Application ─────────────────────────────────────────────────────

/** Apply damage to a target, set i-frames, check death. */
export function applyDamage(
  target: CombatEntity,
  damage: number,
  tick: number,
): void {
  if (!target.alive) return;
  if (target.iFrameUntilTick > tick) return;

  target.hp -= damage;
  target.iFrameUntilTick = tick + I_FRAME_TICKS;

  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
  }
}

// ─── Kill Processing ────────────────────────────────────────────────────────

/**
 * Post-kill bookkeeping. Handles Broseidon stack accumulation
 * and any future on-kill effects.
 */
export function processKill(
  killer: PlayerEntity,
  _victim: EnemyEntity,
  tick: number,
): void {
  // Broseidon: gain ATK stacks during active window
  if (killer.persona === "broseidon" && tick < killer.broseidonWindowEnd) {
    killer.broseidonStacks += 1;
    killer.stats.ATK += BROSEIDON_ATK_PER_KILL;
  }
}

/**
 * Check Broseidon window expiry each tick. Call this in the game loop
 * for every player with active stacks.
 */
export function tickBroseidonWindow(player: PlayerEntity, tick: number): void {
  if (
    player.persona === "broseidon" &&
    player.broseidonStacks > 0 &&
    tick >= player.broseidonWindowEnd
  ) {
    // Remove accumulated bonus
    player.stats.ATK -= player.broseidonStacks * BROSEIDON_ATK_PER_KILL;
    player.broseidonStacks = 0;
  }
}

/**
 * Apply AoE zone effects to enemies each tick.
 * Returns list of expired zone IDs for cleanup.
 */
export function tickAoEZones(
  zones: AoEZone[],
  enemies: EnemyEntity[],
  tick: number,
): string[] {
  const expired: string[] = [];

  for (const zone of zones) {
    if (tick >= zone.expiresAtTick) {
      expired.push(zone.id);
      continue;
    }

    if (zone.type === "deckard_slow") {
      for (const e of enemies) {
        if (!e.alive) continue;
        if (circleVsCircle(e.x, e.y, e.radius, zone.x, zone.y, zone.radius)) {
          e.slowMultiplier = zone.slowFactor;
        }
      }
    }
  }

  return expired;
}
