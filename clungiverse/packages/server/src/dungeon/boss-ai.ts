// Boss phase management and AI for each floor's boss encounter.
// Bosses follow multi-phase patterns that escalate as HP drops.

import type { EnemyEntity } from "./combat";
import type { EnemyBehavior } from "./enemy-ai";

// ─── Types ──────────────────────────────────────────────────────────────────

export type BossType = "hive_mother" | "spore_lord" | "the_architect";

export interface BossAction {
  type: "idle" | "move" | "attack" | "spawn_wave" | "projectile_burst" | "spawn_zone" | "telegraph" | "combo";
  dx: number;
  dy: number;
  /** Enemy spawns requested this tick. */
  spawns?: EnemySpawnRequest[];
  /** Projectiles fired this tick. */
  projectiles?: BossProjectile[];
  /** AoE zone to create. */
  zone?: AoEZoneRequest;
  /** Telegraph duration remaining (visual cue for players). */
  telegraphTicks?: number;
}

export interface EnemySpawnRequest {
  behavior: EnemyBehavior;
  x: number;
  y: number;
  hpScale: number; // multiplier on base HP
}

export interface BossProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  lifetimeTicks: number;
}

export interface AoEZoneRequest {
  x: number;
  y: number;
  radius: number;
  durationTicks: number;
  type: "poison" | "hazard";
  damagePerTick: number;
}

export interface BossAIState {
  bossType: BossType;
  phase: number; // 1, 2, or 3
  /** Ticks since last wave/burst/action. */
  actionCooldownUntilTick: number;
  /** For Architect: current combo step. */
  comboStep: number;
  comboStartTick: number;
  /** Enraged flag (Hive Mother P2). */
  enraged: boolean;
}

interface PlayerTarget {
  id: string;
  x: number;
  y: number;
  radius: number;
  alive: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

// Hive Mother (F1)
// BULLET HELL MODE: faster spawns, more minions per wave
const HM_SPAWN_INTERVAL_P1 = 32;  // 2s at 16Hz (was 5s)
const HM_SPAWN_INTERVAL_P2 = 16;  // 1s (enraged, was 3s)
const HM_SPAWN_COUNT_P1 = 15;     // was 3
const HM_SPAWN_COUNT_P2 = 25;     // was 5
const HM_PHASE2_THRESHOLD = 0.5;

// Spore Lord (F2)
const SL_BURST_INTERVAL = 64;     // 4s
const SL_BURST_COUNT = 8;         // projectiles per radial burst
const SL_AIMED_COUNT = 3;         // aimed line projectiles
const SL_PROJ_SPEED = 2.5;
const SL_PROJ_RADIUS = 5;
const SL_PROJ_LIFETIME = 80;      // 5s
const SL_PHASE2_THRESHOLD = 0.5;
const SL_POISON_RADIUS = 32;
const SL_POISON_DURATION = 96;    // 6s
const SL_POISON_DAMAGE = 1;

// The Architect (F3)
const ARCH_SUMMON_INTERVAL = 96;   // 6s
const ARCH_PHASE2_THRESHOLD = 0.6;
const ARCH_PHASE3_THRESHOLD = 0.3;
const ARCH_COMBO_TELEGRAPH = 16;   // 1s warning
const ARCH_COMBO_STEPS = 3;
const ARCH_COMBO_STEP_TICKS = 12;
const ARCH_HAZARD_RADIUS = 40;
const ARCH_HAZARD_DURATION = 128;  // 8s
const ARCH_HAZARD_DAMAGE = 2;

// ─── Main Boss AI Update ────────────────────────────────────────────────────

/**
 * Run one tick of boss AI. Returns the action for the game loop to apply.
 */
export function updateBossAI(
  boss: EnemyEntity,
  aiState: BossAIState,
  players: PlayerTarget[],
  enemies: EnemyEntity[],
  tileGrid: Uint8Array,
  gridWidth: number,
  tick: number,
): BossAction {
  const idle: BossAction = { type: "idle", dx: 0, dy: 0 };
  if (!boss.alive) return idle;
  if (boss.stunUntilTick > tick) return idle;

  // Update phase based on HP thresholds
  updatePhase(boss, aiState);

  switch (aiState.bossType) {
    case "hive_mother":
      return hiveMother(boss, aiState, players, tick);
    case "spore_lord":
      return sporeLord(boss, aiState, players, tick);
    case "the_architect":
      return theArchitect(boss, aiState, players, enemies, tick);
  }
}

// ─── Phase Transitions ──────────────────────────────────────────────────────

function updateHiveMotherPhase(hpFrac: number, aiState: BossAIState): void {
  if (hpFrac <= HM_PHASE2_THRESHOLD && aiState.phase < 2) {
    aiState.phase = 2;
    aiState.enraged = true;
  }
}

function updateSporeLordPhase(hpFrac: number, aiState: BossAIState): void {
  if (hpFrac <= SL_PHASE2_THRESHOLD && aiState.phase < 2) {
    aiState.phase = 2;
  }
}

function updateArchitectPhase(hpFrac: number, aiState: BossAIState): void {
  if (hpFrac <= ARCH_PHASE3_THRESHOLD && aiState.phase < 3) {
    aiState.phase = 3;
  } else if (hpFrac <= ARCH_PHASE2_THRESHOLD && aiState.phase < 2) {
    aiState.phase = 2;
  }
}

function updatePhase(boss: EnemyEntity, aiState: BossAIState): void {
  const hpFrac = boss.hp / boss.maxHP;
  switch (aiState.bossType) {
    case "hive_mother": updateHiveMotherPhase(hpFrac, aiState); break;
    case "spore_lord": updateSporeLordPhase(hpFrac, aiState); break;
    case "the_architect": updateArchitectPhase(hpFrac, aiState); break;
  }
}

// ─── Hive Mother (Floor 1) ─────────────────────────────────────────────────

function hiveMother(
  boss: EnemyEntity,
  aiState: BossAIState,
  players: PlayerTarget[],
  tick: number,
): BossAction {
  const interval = aiState.phase >= 2 ? HM_SPAWN_INTERVAL_P2 : HM_SPAWN_INTERVAL_P1;
  const count = aiState.phase >= 2 ? HM_SPAWN_COUNT_P2 : HM_SPAWN_COUNT_P1;

  if (tick < aiState.actionCooldownUntilTick) {
    return { type: "idle", dx: 0, dy: 0 };
  }

  aiState.actionCooldownUntilTick = tick + interval;

  // Spawn crawlers around the boss
  const spawns: EnemySpawnRequest[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    const spawnDist = boss.radius + 24;
    spawns.push({
      behavior: "melee_chase",
      x: boss.x + Math.cos(angle) * spawnDist,
      y: boss.y + Math.sin(angle) * spawnDist,
      hpScale: aiState.enraged ? 1.3 : 1.0,
    });
  }

  return { type: "spawn_wave", dx: 0, dy: 0, spawns };
}

// ─── Spore Lord (Floor 2) ───────────────────────────────────────────────────

function sporeLord(
  boss: EnemyEntity,
  aiState: BossAIState,
  players: PlayerTarget[],
  tick: number,
): BossAction {
  if (tick < aiState.actionCooldownUntilTick) {
    return { type: "idle", dx: 0, dy: 0 };
  }

  aiState.actionCooldownUntilTick = tick + SL_BURST_INTERVAL;
  const target = findNearestPlayer(boss, players);

  if (aiState.phase >= 2 && target) {
    // Phase 2: alternate between projectile burst and poison zone
    // Use tick parity to alternate
    if ((tick / SL_BURST_INTERVAL) % 2 < 1) {
      return sporeLordBurst(boss, target);
    }
    return sporeLordPoison(boss, target);
  }

  // Phase 1: projectile patterns only
  if (target) {
    return sporeLordBurst(boss, target);
  }

  return { type: "idle", dx: 0, dy: 0 };
}

function sporeLordBurst(boss: EnemyEntity, target: PlayerTarget): BossAction {
  const projectiles: BossProjectile[] = [];

  // Radial burst
  for (let i = 0; i < SL_BURST_COUNT; i++) {
    const angle = (2 * Math.PI * i) / SL_BURST_COUNT;
    projectiles.push({
      x: boss.x,
      y: boss.y,
      vx: Math.cos(angle) * SL_PROJ_SPEED,
      vy: Math.sin(angle) * SL_PROJ_SPEED,
      damage: boss.stats.ATK,
      radius: SL_PROJ_RADIUS,
      lifetimeTicks: SL_PROJ_LIFETIME,
    });
  }

  // Aimed lines at target
  const dx = target.x - boss.x;
  const dy = target.y - boss.y;
  const baseAngle = Math.atan2(dy, dx);
  for (let i = 0; i < SL_AIMED_COUNT; i++) {
    const spread = (i - Math.floor(SL_AIMED_COUNT / 2)) * 0.15;
    const angle = baseAngle + spread;
    projectiles.push({
      x: boss.x,
      y: boss.y,
      vx: Math.cos(angle) * SL_PROJ_SPEED * 1.5,
      vy: Math.sin(angle) * SL_PROJ_SPEED * 1.5,
      damage: boss.stats.ATK,
      radius: SL_PROJ_RADIUS,
      lifetimeTicks: SL_PROJ_LIFETIME,
    });
  }

  return { type: "projectile_burst", dx: 0, dy: 0, projectiles };
}

function sporeLordPoison(boss: EnemyEntity, target: PlayerTarget): BossAction {
  return {
    type: "spawn_zone",
    dx: 0,
    dy: 0,
    zone: {
      x: target.x,
      y: target.y,
      radius: SL_POISON_RADIUS,
      durationTicks: SL_POISON_DURATION,
      type: "poison",
      damagePerTick: SL_POISON_DAMAGE,
    },
  };
}

// ─── The Architect (Floor 3) ────────────────────────────────────────────────

function theArchitect(
  boss: EnemyEntity,
  aiState: BossAIState,
  players: PlayerTarget[],
  enemies: EnemyEntity[],
  tick: number,
): BossAction {
  switch (aiState.phase) {
    case 1:
      return architectPhase1(boss, aiState, tick);
    case 2:
      return architectPhase2(boss, aiState, players, tick);
    case 3:
      return architectPhase3(boss, aiState, players, tick);
    default:
      return { type: "idle", dx: 0, dy: 0 };
  }
}

/** Phase 1: Summon waves of mixed enemy types. */
function architectPhase1(
  boss: EnemyEntity,
  aiState: BossAIState,
  tick: number,
): BossAction {
  if (tick < aiState.actionCooldownUntilTick) {
    return { type: "idle", dx: 0, dy: 0 };
  }

  aiState.actionCooldownUntilTick = tick + ARCH_SUMMON_INTERVAL;

  const behaviors: EnemyBehavior[] = ["melee_chase", "ranged_pattern", "slow_charge"];
  const spawns: EnemySpawnRequest[] = [];

  for (let i = 0; i < behaviors.length; i++) {
    const angle = (2 * Math.PI * i) / behaviors.length;
    const dist = boss.radius + 40;
    spawns.push({
      behavior: behaviors[i],
      x: boss.x + Math.cos(angle) * dist,
      y: boss.y + Math.sin(angle) * dist,
      hpScale: 1.2,
    });
  }

  return { type: "spawn_wave", dx: 0, dy: 0, spawns };
}

/** Phase 2: Direct combat with telegraphed combos. */
function architectPhase2(
  boss: EnemyEntity,
  aiState: BossAIState,
  players: PlayerTarget[],
  tick: number,
): BossAction {
  const target = findNearestPlayer(boss, players);
  if (!target) return { type: "idle", dx: 0, dy: 0 };

  // Mid-combo
  if (aiState.comboStartTick > 0) {
    const elapsed = tick - aiState.comboStartTick;

    // Telegraph phase
    if (elapsed < ARCH_COMBO_TELEGRAPH) {
      return { type: "telegraph", dx: 0, dy: 0, telegraphTicks: ARCH_COMBO_TELEGRAPH - elapsed };
    }

    // Combo strikes
    const strikePhase = elapsed - ARCH_COMBO_TELEGRAPH;
    const step = Math.floor(strikePhase / ARCH_COMBO_STEP_TICKS);

    if (step >= ARCH_COMBO_STEPS) {
      // Combo finished
      aiState.comboStartTick = 0;
      aiState.comboStep = 0;
      aiState.actionCooldownUntilTick = tick + 48; // 3s cooldown after combo
      return { type: "idle", dx: 0, dy: 0 };
    }

    if (step > aiState.comboStep) {
      aiState.comboStep = step;
      // Each combo step fires aimed projectiles
      const dx = target.x - boss.x;
      const dy = target.y - boss.y;
      const angle = Math.atan2(dy, dx);
      const projectiles: BossProjectile[] = [{
        x: boss.x,
        y: boss.y,
        vx: Math.cos(angle) * 4,
        vy: Math.sin(angle) * 4,
        damage: Math.floor(boss.stats.ATK * 1.5),
        radius: 6,
        lifetimeTicks: 48,
      }];
      return { type: "combo", dx: 0, dy: 0, projectiles };
    }

    return { type: "combo", dx: 0, dy: 0 };
  }

  if (tick < aiState.actionCooldownUntilTick) {
    // Move toward target between combos
    const dx = target.x - boss.x;
    const dy = target.y - boss.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 60) {
      const speed = boss.stats.SPD * boss.slowMultiplier;
      return {
        type: "move",
        dx: (dx / dist) * speed,
        dy: (dy / dist) * speed,
      };
    }
    return { type: "idle", dx: 0, dy: 0 };
  }

  // Start combo
  aiState.comboStartTick = tick;
  aiState.comboStep = 0;
  return { type: "telegraph", dx: 0, dy: 0, telegraphTicks: ARCH_COMBO_TELEGRAPH };
}

/** Phase 3: Arena hazards + all mechanics. */
function architectPhase3(
  boss: EnemyEntity,
  aiState: BossAIState,
  players: PlayerTarget[],
  tick: number,
): BossAction {
  const target = findNearestPlayer(boss, players);
  if (!target) return { type: "idle", dx: 0, dy: 0 };

  if (tick < aiState.actionCooldownUntilTick) {
    // Continue with phase 2 combat behavior between hazard drops
    return architectPhase2(boss, aiState, players, tick);
  }

  // Alternate between spawning hazard zones and summoning enemies
  const actionCycle = Math.floor(tick / ARCH_SUMMON_INTERVAL) % 3;

  if (actionCycle === 0) {
    // Drop hazard zone on a player
    aiState.actionCooldownUntilTick = tick + ARCH_SUMMON_INTERVAL;
    return {
      type: "spawn_zone",
      dx: 0,
      dy: 0,
      zone: {
        x: target.x,
        y: target.y,
        radius: ARCH_HAZARD_RADIUS,
        durationTicks: ARCH_HAZARD_DURATION,
        type: "hazard",
        damagePerTick: ARCH_HAZARD_DAMAGE,
      },
    };
  }

  if (actionCycle === 1) {
    // Summon reinforcements
    aiState.actionCooldownUntilTick = tick + ARCH_SUMMON_INTERVAL;
    const spawns: EnemySpawnRequest[] = [
      { behavior: "melee_chase", x: boss.x + 40, y: boss.y, hpScale: 1.0 },
      { behavior: "melee_chase", x: boss.x - 40, y: boss.y, hpScale: 1.0 },
      { behavior: "ranged_pattern", x: boss.x, y: boss.y + 40, hpScale: 1.0 },
    ];
    return { type: "spawn_wave", dx: 0, dy: 0, spawns };
  }

  // Projectile burst
  aiState.actionCooldownUntilTick = tick + ARCH_SUMMON_INTERVAL;
  const projectiles: BossProjectile[] = [];
  for (let i = 0; i < 12; i++) {
    const angle = (2 * Math.PI * i) / 12;
    projectiles.push({
      x: boss.x,
      y: boss.y,
      vx: Math.cos(angle) * 3,
      vy: Math.sin(angle) * 3,
      damage: boss.stats.ATK,
      radius: 5,
      lifetimeTicks: 64,
    });
  }
  return { type: "projectile_burst", dx: 0, dy: 0, projectiles };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function findNearestPlayer(
  boss: EnemyEntity,
  players: PlayerTarget[],
): PlayerTarget | null {
  let bestDist = Infinity;
  let best: PlayerTarget | null = null;

  for (const p of players) {
    if (!p.alive) continue;
    const dx = boss.x - p.x;
    const dy = boss.y - p.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

/** Create a fresh boss AI state for a given boss type. */
export function createBossAIState(bossType: BossType): BossAIState {
  return {
    bossType,
    phase: 1,
    actionCooldownUntilTick: 0,
    comboStep: 0,
    comboStartTick: 0,
    enraged: false,
  };
}
