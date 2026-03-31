// Per-tick enemy AI for each behavior type.
// Each enemy runs one AI update per game tick (16Hz).

import { circleVsCircle, lineOfSight, wallSlide } from "./collision";
import type { EnemyEntity, AoEZone } from "./combat";

// ─── Types ──────────────────────────────────────────────────────────────────

export type EnemyBehavior = "melee_chase" | "ranged_pattern" | "slow_charge";

export interface EnemyAction {
  type: "idle" | "move" | "attack" | "telegraph" | "charge";
  dx: number;
  dy: number;
  /** For ranged enemies: spawns a projectile. */
  projectile?: ProjectileSpawn;
  /** For brutes: telegraph visual before charge. */
  telegraphTicks?: number;
}

export interface ProjectileSpawn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  lifetimeTicks: number;
}

export interface EnemyAIState {
  behavior: EnemyBehavior;
  /** Whether this enemy has aggro'd on a player. */
  aggrod: boolean;
  /** Brute: tick when telegraph started. 0 = not telegraphing. */
  telegraphStartTick: number;
  /** Brute: tick when charge started. 0 = not charging. */
  chargeStartTick: number;
  /** Brute: direction of the charge (normalized). */
  chargeDx: number;
  chargeDy: number;
  /** Brute: cooldown — tick when next action is allowed. */
  cooldownUntilTick: number;
  /** Spitter: cooldown between shots. */
  shotCooldownUntilTick: number;
}

interface PlayerTarget {
  id: string;
  x: number;
  y: number;
  radius: number;
  alive: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const AGGRO_RADIUS = 128;   // px — enemies engage when player is this close
const DEAGGRO_RADIUS = 192; // px — enemies disengage when player leaves this range

const BRUTE_TELEGRAPH_TICKS = 16; // 1s at 16Hz
const BRUTE_CHARGE_DISTANCE = 48;
const BRUTE_CHARGE_SPEED_MULT = 3;
const BRUTE_COOLDOWN_TICKS = 32; // 2s
const BRUTE_TRIGGER_RANGE = 80;

const SPITTER_MIN_DIST = 128;
const SPITTER_MAX_DIST = 192;
const SPITTER_SHOT_COOLDOWN = 32; // 2s between shots
const SPITTER_PROJECTILE_SPEED = 3;
const SPITTER_PROJECTILE_RADIUS = 4;
const SPITTER_PROJECTILE_LIFETIME = 64; // 4s
const SPITTER_SPREAD = 0.15; // radians of random spread

// ─── Main AI Update ─────────────────────────────────────────────────────────

/**
 * Run one tick of AI for an enemy. Returns the action to execute.
 * The game loop applies the resulting movement/attack.
 */
export function updateEnemyAI(
  enemy: EnemyEntity,
  aiState: EnemyAIState,
  players: PlayerTarget[],
  tileGrid: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  tick: number,
  tileSize: number = 16,
): EnemyAction {
  const idle: EnemyAction = { type: "idle", dx: 0, dy: 0 };

  if (!enemy.alive) return idle;

  // Stunned: skip all AI
  if (enemy.stunUntilTick > tick) return idle;

  // Find nearest alive player
  const target = findNearestPlayer(enemy, players);
  if (!target) return idle;

  // Aggro radius check: enemies idle until a player comes within range
  const dx0 = target.x - enemy.x;
  const dy0 = target.y - enemy.y;
  const distToTarget = Math.sqrt(dx0 * dx0 + dy0 * dy0);

  if (!aiState.aggrod) {
    if (distToTarget > AGGRO_RADIUS) return idle;
    aiState.aggrod = true;
  } else if (distToTarget > DEAGGRO_RADIUS) {
    aiState.aggrod = false;
    return idle;
  }

  // Apply slow multiplier to effective speed
  const effectiveSpeed = enemy.stats.SPD * enemy.slowMultiplier;

  switch (aiState.behavior) {
    case "melee_chase":
      return crawlerAI(enemy, target, effectiveSpeed, tileGrid, gridWidth, gridHeight, tileSize);
    case "ranged_pattern":
      return spitterAI(enemy, aiState, target, effectiveSpeed, tileGrid, gridWidth, gridHeight, tick, tileSize);
    case "slow_charge":
      return bruteAI(enemy, aiState, target, effectiveSpeed, tileGrid, gridWidth, gridHeight, tick, tileSize);
  }
}

// ─── Crawler (melee_chase) ──────────────────────────────────────────────────

function crawlerAI(
  enemy: EnemyEntity,
  target: PlayerTarget,
  speed: number,
  tileGrid: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  tileSize: number,
): EnemyAction {
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // In melee range — attack
  if (dist <= enemy.radius + target.radius + 2) {
    return { type: "attack", dx: 0, dy: 0 };
  }

  // Move toward target
  const nx = (dx / dist) * speed;
  const ny = (dy / dist) * speed;
  const slid = wallSlide(enemy.x, enemy.y, nx, ny, enemy.radius, tileGrid, gridWidth, gridHeight, tileSize);
  return {
    type: "move",
    dx: slid.x - enemy.x,
    dy: slid.y - enemy.y,
  };
}

// ─── Spitter (ranged_pattern) ───────────────────────────────────────────────

function spitterAI(
  enemy: EnemyEntity,
  aiState: EnemyAIState,
  target: PlayerTarget,
  speed: number,
  tileGrid: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  tick: number,
  tileSize: number,
): EnemyAction {
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Maintain sweet spot distance
  let moveDx = 0;
  let moveDy = 0;

  if (dist < SPITTER_MIN_DIST) {
    // Too close — back away
    moveDx = (-dx / dist) * speed;
    moveDy = (-dy / dist) * speed;
  } else if (dist > SPITTER_MAX_DIST) {
    // Too far — approach
    moveDx = (dx / dist) * speed * 0.5; // approach slowly
    moveDy = (dy / dist) * speed * 0.5;
  }

  const slid = wallSlide(enemy.x, enemy.y, moveDx, moveDy, enemy.radius, tileGrid, gridWidth, gridHeight, tileSize);
  const finalDx = slid.x - enemy.x;
  const finalDy = slid.y - enemy.y;

  // Fire projectile if off cooldown and has LOS
  if (tick >= aiState.shotCooldownUntilTick && dist <= SPITTER_MAX_DIST * 1.5) {
    if (lineOfSight(enemy.x, enemy.y, target.x, target.y, tileGrid, gridWidth, tileSize)) {
      aiState.shotCooldownUntilTick = tick + SPITTER_SHOT_COOLDOWN;

      // Aim at target with spread
      const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * SPITTER_SPREAD;
      const projVx = Math.cos(angle) * SPITTER_PROJECTILE_SPEED;
      const projVy = Math.sin(angle) * SPITTER_PROJECTILE_SPEED;

      return {
        type: "attack",
        dx: finalDx,
        dy: finalDy,
        projectile: {
          x: enemy.x,
          y: enemy.y,
          vx: projVx,
          vy: projVy,
          damage: enemy.stats.ATK,
          radius: SPITTER_PROJECTILE_RADIUS,
          lifetimeTicks: SPITTER_PROJECTILE_LIFETIME,
        },
      };
    }
  }

  return { type: "move", dx: finalDx, dy: finalDy };
}

// ─── Brute (slow_charge) ────────────────────────────────────────────────────

function bruteAI(
  enemy: EnemyEntity,
  aiState: EnemyAIState,
  target: PlayerTarget,
  speed: number,
  tileGrid: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  tick: number,
  tileSize: number,
): EnemyAction {
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Currently charging
  if (aiState.chargeStartTick > 0) {
    const chargeTicksElapsed = tick - aiState.chargeStartTick;
    const chargeSpeed = speed * BRUTE_CHARGE_SPEED_MULT;
    const distanceTraveled = chargeTicksElapsed * chargeSpeed;

    if (distanceTraveled >= BRUTE_CHARGE_DISTANCE) {
      // Charge complete — enter cooldown
      aiState.chargeStartTick = 0;
      aiState.cooldownUntilTick = tick + BRUTE_COOLDOWN_TICKS;
      return { type: "idle", dx: 0, dy: 0 };
    }

    // Continue charging in locked direction
    const chargeDx = aiState.chargeDx * chargeSpeed;
    const chargeDy = aiState.chargeDy * chargeSpeed;
    const slid = wallSlide(enemy.x, enemy.y, chargeDx, chargeDy, enemy.radius, tileGrid, gridWidth, gridHeight, tileSize);

    // If wall-blocked, end charge early
    if (slid.x === enemy.x && slid.y === enemy.y) {
      aiState.chargeStartTick = 0;
      aiState.cooldownUntilTick = tick + BRUTE_COOLDOWN_TICKS;
      return { type: "idle", dx: 0, dy: 0 };
    }

    return { type: "charge", dx: slid.x - enemy.x, dy: slid.y - enemy.y };
  }

  // Currently telegraphing
  if (aiState.telegraphStartTick > 0) {
    if (tick - aiState.telegraphStartTick >= BRUTE_TELEGRAPH_TICKS) {
      // Telegraph done — begin charge
      aiState.telegraphStartTick = 0;
      aiState.chargeStartTick = tick;
      // Lock charge direction toward current target position
      if (dist > 0) {
        aiState.chargeDx = dx / dist;
        aiState.chargeDy = dy / dist;
      }
      return { type: "charge", dx: 0, dy: 0 };
    }
    return { type: "telegraph", dx: 0, dy: 0, telegraphTicks: tick - aiState.telegraphStartTick };
  }

  // Cooldown after charge
  if (tick < aiState.cooldownUntilTick) {
    return { type: "idle", dx: 0, dy: 0 };
  }

  // In range — start telegraph
  if (dist <= BRUTE_TRIGGER_RANGE) {
    aiState.telegraphStartTick = tick;
    return { type: "telegraph", dx: 0, dy: 0, telegraphTicks: 0 };
  }

  // Out of range — approach slowly
  const moveDx = (dx / dist) * speed * 0.6;
  const moveDy = (dy / dist) * speed * 0.6;
  const slid = wallSlide(enemy.x, enemy.y, moveDx, moveDy, enemy.radius, tileGrid, gridWidth, gridHeight, tileSize);
  return { type: "move", dx: slid.x - enemy.x, dy: slid.y - enemy.y };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function findNearestPlayer(
  enemy: EnemyEntity,
  players: PlayerTarget[],
): PlayerTarget | null {
  let bestDist = Infinity;
  let best: PlayerTarget | null = null;

  for (const p of players) {
    if (!p.alive) continue;
    const dx = enemy.x - p.x;
    const dy = enemy.y - p.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

/** Create a fresh AI state for an enemy behavior type. */
export function createEnemyAIState(behavior: EnemyBehavior): EnemyAIState {
  return {
    behavior,
    aggrod: false,
    telegraphStartTick: 0,
    chargeStartTick: 0,
    chargeDx: 0,
    chargeDy: 0,
    cooldownUntilTick: 0,
    shotCooldownUntilTick: 0,
  };
}

/**
 * Reset slow multiplier for all enemies each tick (before re-applying zone effects).
 * Call this at the start of each tick, before tickAoEZones.
 */
export function resetSlowMultipliers(enemies: EnemyEntity[]): void {
  for (const e of enemies) {
    e.slowMultiplier = 1.0;
  }
}
