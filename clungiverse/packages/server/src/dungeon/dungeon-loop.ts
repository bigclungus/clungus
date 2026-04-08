// Clungiverse Dungeon Loop — 16Hz server tick
// Ties together: dungeon-manager, dungeon-generation, combat, enemy-ai, boss-ai, collision, stats

import type {
  DungeonInstance,
  DungeonPlayer,
  EnemyInstance,
  ProjectileInstance,
  FloorLayout as ProtocolFloorLayout,
  DungeonServerMessage,
  DungeonFloorMessage,
  DungeonMobRosterMessage,
  TickEvent,
  Corridor as ProtocolCorridor,
} from "./dungeon-protocol.ts";

import {
  TEMP_POWERUP_TEMPLATES,
  getTempPowerupTemplate,
  type FloorPickup,
} from "./temp-powerups.ts";

import {
  getAllInstances,
  destroyRun,
} from "./dungeon-manager.ts";

import {
  buildPlayerSnapshots,
  buildEnemySnapshots,
  buildProjectileSnapshots,
  buildAoEZoneSnapshots,
  buildFloorPickupSnapshots,
  buildResults,
  persistRunResult,
} from "./dungeon-snapshots.ts";

import {
  generateFloor,
  type FloorLayout as GenFloorLayout,
  type EnemyVariant,
  type FloorTemplate,
} from "./dungeon-generation.ts";

import { mobRegistry } from "./mob-registry.ts";
import { db } from "../persistence.ts";

import {
  resolvePower,
  resolveSpinAttack,
  SPIN_COOLDOWN_TICKS,
  tickAoEZones,
  getCrundleContactDamage,
  isCrundleScrambling,
  type PlayerEntity,
  type EnemyEntity,
  type AoEZone,
} from "./combat.ts";

import {
  updateEnemyAI,
  createEnemyAIState,
  resetSlowMultipliers,
  type EnemyAIState,
  type ProjectileSpawn,
} from "./enemy-ai.ts";

import {
  updateBossAI,
  createBossAIState,
  type BossAIState,
  type BossType,
} from "./boss-ai.ts";

import {
  circleVsCircle,
} from "./collision.ts";

import {
  calculateEffectiveStats,
  type BaseStats,
} from "./stats.ts";

import { TILE } from "./dungeon-protocol.ts";

import {
  lootRegistry,
  type LootItem,
} from "./loot.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

const TICK_MS = 62.5; // 16Hz
const TILE_SIZE = 16;
const PLAYER_RADIUS = 10;
const DISCONNECT_TIMEOUT_MS = 60_000;
const AUTO_ATTACK_INTERVAL_TICKS = 1; // every tick (~62.5ms) — maximum fire rate
const PLAYER_PROJECTILE_SPEED = 300 / (1000 / TICK_MS); // 300px/s → px/tick
const PLAYER_PROJECTILE_RADIUS = 4;
const PLAYER_PROJECTILE_LIFETIME_TICKS = Math.ceil(1500 / TICK_MS); // 1.5s
const PLAYER_AUTO_ATTACK_RANGE = 120; // px — detection range for spawning projectiles
const TOTAL_FLOORS = 3;
const POWERUP_PICK_TIMEOUT_MS = 15_000; // 15s to pick a powerup between floors
// BULLET HELL MODE: scale enemy ATK down at spawn time (applies to all mob sources incl. DB mobs)
const ENEMY_ATK_SCALE = 0.1;

// ─── Per-instance ephemeral state ────────────────────────────────────────────

interface InstanceEphemeral {
  aiStates: Map<string, EnemyAIState>;
  bossAIState: BossAIState | null;
  bossId: string | null;
  autoAttackTimers: Map<string, number>; // playerId -> tick of next allowed auto-attack
  pendingAttacks: Set<string>; // playerIds that requested an attack this tick
  pendingPowers: Set<string>; // playerIds that activated power this tick
  pendingSpins: Set<string>; // playerIds that requested a spin attack this tick
  genLayout: GenFloorLayout | null;
  // Powerup transition state
  transitionChoices: LootItem[] | null; // current powerup choices offered
  transitionPicks: Map<string, number>; // playerId → chosen powerup ID
  transitionTimer: ReturnType<typeof setTimeout> | null;
  // Mob counting: only pre-placed enemies count toward HUD total
  originalEnemyCount: number;
  // Boss room bounds (pixel coords) for activation check
  bossRoomBounds: { x: number; y: number; w: number; h: number } | null;
}

const ephemeralMap = new Map<string, InstanceEphemeral>();

function getEphemeral(instance: DungeonInstance): InstanceEphemeral {
  let e = ephemeralMap.get(instance.id);
  if (!e) {
    e = {
      aiStates: new Map(),
      bossAIState: null,
      bossId: null,
      autoAttackTimers: new Map(),
      pendingAttacks: new Set(),
      pendingPowers: new Set(),
      pendingSpins: new Set(),
      genLayout: null,
      transitionChoices: null,
      transitionPicks: new Map(),
      transitionTimer: null,
      originalEnemyCount: 0,
      bossRoomBounds: null,
    };
    ephemeralMap.set(instance.id, e);
  }
  return e;
}

function cleanupEphemeral(instanceId: string): void {
  const eph = ephemeralMap.get(instanceId);
  if (eph?.transitionTimer) {
    clearTimeout(eph.transitionTimer);
  }
  ephemeralMap.delete(instanceId);
}

// ─── Send function registry ──────────────────────────────────────────────────

type SendFn = (playerId: string, msg: DungeonServerMessage) => void;

let globalSendFn: SendFn | null = null;

export function setSendFunction(fn: SendFn): void {
  globalSendFn = fn;
}

function sendToPlayer(playerId: string, msg: DungeonServerMessage): void {
  if (globalSendFn) globalSendFn(playerId, msg);
}

function broadcastToInstance(instance: DungeonInstance, msg: DungeonServerMessage): void {
  for (const [id, player] of instance.players) {
    // Send to all connected players — including dead/spectating ones so they can watch
    if (player.connected) {
      sendToPlayer(id, msg);
    }
  }
}

// ─── Persona base stats ─────────────────────────────────────────────────────

const PERSONA_STATS: Record<string, BaseStats> = {
  holden: { maxHP: 150, ATK: 12, DEF: 10, SPD: 2.5, LCK: 4 },
  broseidon: { maxHP: 100, ATK: 16, DEF: 5, SPD: 3.5, LCK: 6 },
  deckard_cain: { maxHP: 90, ATK: 8, DEF: 6, SPD: 3.0, LCK: 10 },
  galactus: { maxHP: 120, ATK: 14, DEF: 7, SPD: 2.8, LCK: 8 },
  crundle: { maxHP: 85, ATK: 10, DEF: 8, SPD: 4.0, LCK: 12 },
};

// SPD in base stats is px/tick movement speed; the state file uses big numbers
// for the client display, but server combat uses the base values directly.

const PERSONA_POWER: Record<string, "holden" | "broseidon" | "deckard_cain" | "galactus" | "crundle"> = {
  holden: "holden",
  broseidon: "broseidon",
  deckard_cain: "deckard_cain",
  galactus: "galactus",
  crundle: "crundle",
};

// ─── Default enemy variants (until DB is populated) ─────────────────────────

// BULLET HELL MODE: budget_cost reduced to 1 (pack rooms full), atk divided by 10 (each hit lighter)
const DEFAULT_ENEMY_VARIANTS: EnemyVariant[] = [
  { id: 1, name: "Crawler", behavior: "crawler", hp: 20, atk: 1, def: 2, spd: 1.5, floor_min: 1, budget_cost: 1 },
  { id: 2, name: "Spitter", behavior: "spitter", hp: 15, atk: 1, def: 1, spd: 1.2, floor_min: 1, budget_cost: 1 },
  { id: 3, name: "Brute", behavior: "brute", hp: 40, atk: 1, def: 5, spd: 0.8, floor_min: 2, budget_cost: 1 },
];

// BULLET HELL MODE: enemy_budget x100 → rooms fill to spawn attempt cap (100x more enemies)
const DEFAULT_FLOOR_TEMPLATES: FloorTemplate[] = [
  { floor_number: 1, room_count_min: 5, room_count_max: 7, enemy_budget: 60000, boss_type_id: 1, powerup_choices: 3, enemy_scaling: 1.0 },
  { floor_number: 2, room_count_min: 6, room_count_max: 9, enemy_budget: 100000, boss_type_id: 2, powerup_choices: 3, enemy_scaling: 1.4 },
  { floor_number: 3, room_count_min: 7, room_count_max: 10, enemy_budget: 140000, boss_type_id: 3, powerup_choices: 2, enemy_scaling: 1.8 },
];

const BOSS_TYPE_MAP: Record<number, BossType> = {
  1: "hive_mother",
  2: "spore_lord",
  3: "the_architect",
};

// ─── Floor Initialization ────────────────────────────────────────────────────

interface GenCorridor { points: { x: number; y: number }[] }

function corridorEndpoint(pt: { x: number; y: number } | undefined): { x: number; y: number } {
  return { x: pt?.x ?? 0, y: pt?.y ?? 0 };
}

function corridorToProtocol(c: GenCorridor): ProtocolCorridor {
  const start = corridorEndpoint(c.points[0]);
  const end = corridorEndpoint(c.points[c.points.length - 1]);
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y, width: 3 };
}

function selectMobsForFloor1(seedStr: string, runId: string, skipGen: boolean): EnemyVariant[] {
  let rngState = 0;
  for (let i = 0; i < seedStr.length; i++) {
    rngState = (Math.imul(31, rngState) + seedStr.charCodeAt(i)) | 0;
  }
  if (rngState === 0) rngState = 1;
  const seededRng = (): number => {
    let t = (rngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const variants = mobRegistry.selectForRun(Math.min(mobRegistry.size, 6), seededRng, skipGen);
  try {
    const insertSel = db.prepare(
      "INSERT OR IGNORE INTO run_mob_selections (run_id, entity_name) VALUES (?, ?)"
    );
    for (const v of variants) {
      const item = mobRegistry.getByDisplayName(v.name);
      if (item) insertSel.run(runId, item.entityName);
    }
    console.log(`[dungeon-loop] Persisted ${String(variants.length)} mob selections for run ${runId}`);
  } catch (err) {
    console.error("[dungeon-loop] Failed to persist run_mob_selections:", err);
  }
  return variants;
}

function loadMobsForFloor(runId: string, floorNum: number, skipGen: boolean): EnemyVariant[] {
  try {
    const rows = db
      .query<{ entity_name: string }, [string]>(
        "SELECT entity_name FROM run_mob_selections WHERE run_id = ?"
      )
      .all(runId);
    if (rows.length > 0) {
      const loaded = rows
        .map((r, i) => {
          const item = mobRegistry.getMob(r.entity_name);
          return item ? mobRegistry.toVariantPublic(item, i + 1) : null;
        })
        .filter((v): v is EnemyVariant => v !== null);
      console.log(`[dungeon-loop] Loaded ${String(loaded.length)} mob selections for run ${runId} (floor ${String(floorNum)})`);
      return loaded;
    }
    console.warn(`[dungeon-loop] No run_mob_selections for run ${runId} on floor ${String(floorNum)}, selecting fresh`);
  } catch (err) {
    console.error("[dungeon-loop] Failed to load run_mob_selections:", err);
  }
  return mobRegistry.selectForRun(Math.min(mobRegistry.size, 6), Math.random, skipGen);
}

function selectVariants(instance: DungeonInstance, floorNum: number, seedStr: string): EnemyVariant[] {
  if (mobRegistry.size === 0) return DEFAULT_ENEMY_VARIANTS;
  if (floorNum === 1) return selectMobsForFloor1(seedStr, instance.id, instance.skipGen);
  return loadMobsForFloor(instance.id, floorNum, instance.skipGen);
}

function broadcastMobRoster(instance: DungeonInstance, variants: EnemyVariant[]): void {
  const rosterMsg: DungeonMobRosterMessage = {
    type: "d_mob_roster",
    mobs: variants.map((v) => {
      const registryItem = mobRegistry.getByDisplayName(v.name);
      return {
        entityName: registryItem?.entityName ?? v.name.toLowerCase().replace(/\s+/g, "_"),
        displayName: v.name,
        behavior: registryItem?.behavior ?? "melee_chase",
        hp: v.hp,
        atk: v.atk,
        def: v.def,
        spd: v.spd,
        flavorText: registryItem?.flavorText ?? null,
      };
    }),
  };
  broadcastToInstance(instance, rosterMsg);
}

function spawnEnemiesFromLayout(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  layout: ProtocolFloorLayout,
  genLayout: GenFloorLayout,
  variants: EnemyVariant[],
  template: FloorTemplate,
): void {
  const behaviorMap: Record<string, "melee_chase" | "ranged_pattern" | "slow_charge"> = {
    crawler: "melee_chase",
    spitter: "ranged_pattern",
    brute: "slow_charge",
  };

  // Aggregate cursed modifiers across all players: enemyHpMult and enemyAtkMult
  let totalEnemyHpMult = 0;
  let totalEnemyAtkMult = 0;
  for (const [, p] of instance.players) {
    totalEnemyHpMult += p.cursedEffects?.enemyHpMult ?? 0;
    totalEnemyAtkMult += p.cursedEffects?.enemyAtkMult ?? 0;
  }
  const enemyHpScale = 1 + totalEnemyHpMult;
  const enemyAtkScale = 1 + totalEnemyAtkMult;

  let enemyCounter = 0;
  for (const spawn of genLayout.enemySpawns) {
    const variant = variants.find((v) => v.id === spawn.variantId);
    if (!variant) continue;
    const enemyId = `e-${instance.id}-${String(enemyCounter++)}`;
    const baseHp = Math.floor(variant.hp * template.enemy_scaling * enemyHpScale);
    const baseAtk = Math.max(1, Math.floor(variant.atk * template.enemy_scaling * enemyAtkScale * ENEMY_ATK_SCALE));
    const enemy: EnemyInstance = {
      id: enemyId,
      variantId: variant.id,
      variantName: variant.name,
      behavior: behaviorMap[variant.behavior] ?? "melee_chase",
      x: spawn.x * TILE_SIZE + TILE_SIZE / 2,
      y: spawn.y * TILE_SIZE + TILE_SIZE / 2,
      hp: baseHp,
      maxHp: baseHp,
      atk: baseAtk,
      def: variant.def,
      spd: variant.spd,
      isBoss: false,
      bossSpawned: false,
      roomIndex: spawn.roomId,
      targetPlayerId: null,
      cooldownTicks: 0,
      telegraphing: false,
      telegraphTicks: 0,
      phase: 0,
      phaseData: {},
    };
    instance.enemies.set(enemyId, enemy);
    eph.aiStates.set(enemyId, createEnemyAIState(enemy.behavior));
    layout.rooms[spawn.roomId].enemyIds.push(enemyId);
  }
}

function spawnBoss(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  layout: ProtocolFloorLayout,
  genLayout: GenFloorLayout,
  template: FloorTemplate,
  floorNum: number,
): void {
  if (template.boss_type_id === null) return;
  const bossRoom = genLayout.rooms.find((r) => r.type === "boss");
  if (!bossRoom) return;

  const bossId = `boss-${instance.id}-f${String(floorNum)}`;
  const bossType = BOSS_TYPE_MAP[template.boss_type_id] ?? "hive_mother";
  const bossHp = Math.floor(200 * template.enemy_scaling);
  const boss: EnemyInstance = {
    id: bossId,
    variantId: 0,
    variantName: bossType,
    behavior: "melee_chase",
    x: (bossRoom.x + Math.floor(bossRoom.w / 2)) * TILE_SIZE + TILE_SIZE / 2,
    y: (bossRoom.y + Math.floor(bossRoom.h / 2)) * TILE_SIZE + TILE_SIZE / 2,
    hp: bossHp,
    maxHp: bossHp,
    atk: Math.floor(15 * template.enemy_scaling),
    def: Math.floor(8 * template.enemy_scaling),
    spd: 1.5,
    isBoss: true,
    bossSpawned: false,
    roomIndex: genLayout.rooms.indexOf(bossRoom),
    targetPlayerId: null,
    cooldownTicks: 0,
    telegraphing: false,
    telegraphTicks: 0,
    phase: 1,
    phaseData: {},
  };
  instance.enemies.set(bossId, boss);
  eph.bossId = bossId;
  eph.bossAIState = createBossAIState(bossType);
  layout.rooms[genLayout.rooms.indexOf(bossRoom)].enemyIds.push(bossId);
}

function positionPlayersAtStart(instance: DungeonInstance, genLayout: GenFloorLayout): void {
  const startRoom = genLayout.rooms.find((r) => r.type === "start");
  if (!startRoom) return;
  const cx = (startRoom.x + Math.floor(startRoom.w / 2)) * TILE_SIZE + TILE_SIZE / 2;
  const cy = (startRoom.y + Math.floor(startRoom.h / 2)) * TILE_SIZE + TILE_SIZE / 2;
  let offset = 0;
  for (const [_id, player] of instance.players) {
    player.inputQueue.length = 0;
    player.x = cx + (offset % 2 === 0 ? offset * 8 : -offset * 8);
    player.y = cy + (offset < 2 ? -8 : 8);
    offset++;
  }
}

function initPlayerStats(instance: DungeonInstance, floorNum: number): void {
  for (const [_id, player] of instance.players) {
    const wasSpectating = player.diedOnFloor !== null || player.hp <= 0;
    const base = PERSONA_STATS[player.personaSlug] ?? PERSONA_STATS.holden;
    const effective = calculateEffectiveStats(base, []);
    player.maxHp = effective.maxHP;

    // halfHpOnFloor curse: start each floor at 50% max HP
    const halfHpCurse = (player.cursedEffects?.halfHpOnFloor ?? 0) > 0;
    player.hp = (wasSpectating || halfHpCurse)
      ? Math.max(1, Math.floor(effective.maxHP / 2))
      : effective.maxHP;

    player.atk = effective.ATK;
    player.def = effective.DEF;
    player.spd = effective.SPD;
    player.lck = effective.LCK;
    player.iframeTicks = 0;
    player.cooldownTicks = 0;
    player.scramblingTicks = 0;
    player.spinCooldownTicks = 0;
    player.cooldownMax = Math.ceil(effective.autoAttackIntervalMs / TICK_MS);
    player.diedOnFloor = null;
    player.activeTempPowerups = [];
    if (wasSpectating) {
      console.log(`[dungeon-loop] Reviving spectating player ${player.name} with ${String(player.hp)}/${String(player.maxHp)} HP on floor ${String(floorNum)}`);
    }
    if (halfHpCurse && !wasSpectating) {
      console.log(`[dungeon-loop] Player ${player.name} starts floor ${String(floorNum)} at half HP (Iron Hubris curse)`);
    }
  }
}

function openInitialDoors(
  instance: DungeonInstance,
  layout: ProtocolFloorLayout,
  genLayout: GenFloorLayout,
): void {
  const bossRoomIndex = genLayout.rooms.findIndex((r) => r.type === "boss");
  for (let i = 0; i < layout.rooms.length; i++) {
    if (i === bossRoomIndex) continue;
    layout.rooms[i].cleared = true;
    openDoorsForRoom(layout, i);
  }
  if (bossRoomIndex >= 0) {
    const allNonBossCleared = layout.rooms.every((r, idx) => idx === bossRoomIndex || r.cleared);
    if (allNonBossCleared) {
      layout.rooms[bossRoomIndex].cleared = true;
      openDoorsForRoom(layout, bossRoomIndex);
    }
  }
}

export function initFloor(instance: DungeonInstance): void {
  const floorNum = instance.floor;
  const template = DEFAULT_FLOOR_TEMPLATES[floorNum - 1] ?? DEFAULT_FLOOR_TEMPLATES[0];
  const seedStr = `${instance.seed}-f${String(floorNum)}`;

  const variants = selectVariants(instance, floorNum, seedStr);

  if (floorNum === 1) broadcastMobRoster(instance, variants);

  const genLayout = generateFloor(seedStr, floorNum, template, variants);
  const eph = getEphemeral(instance);
  eph.genLayout = genLayout;

  const layout: ProtocolFloorLayout = {
    width: genLayout.width,
    height: genLayout.height,
    tiles: genLayout.tileGrid,
    rooms: genLayout.rooms.map((r) => ({
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      enemyIds: [],
      cleared: r.type === "start" || r.type === "rest" || r.type === "treasure",
    })),
    corridors: genLayout.corridors.map(corridorToProtocol),
  };
  instance.layout = layout;

  instance.enemies.clear();
  instance.projectiles.clear();
  instance.aoeZones.clear();
  instance.floorPickups.clear();
  eph.aiStates.clear();
  eph.bossAIState = null;
  eph.bossId = null;

  spawnEnemiesFromLayout(instance, eph, layout, genLayout, variants, template);
  spawnBoss(instance, eph, layout, genLayout, template, floorNum);

  let preplacedCount = 0;
  for (const [, e] of instance.enemies) {
    if (!e.isBoss && !e.bossSpawned) preplacedCount++;
  }
  eph.originalEnemyCount = preplacedCount;

  const bossRoomGen = genLayout.rooms.find((r) => r.type === "boss");
  if (bossRoomGen) {
    eph.bossRoomBounds = {
      x: bossRoomGen.x * TILE_SIZE,
      y: bossRoomGen.y * TILE_SIZE,
      w: bossRoomGen.w * TILE_SIZE,
      h: bossRoomGen.h * TILE_SIZE,
    };
  } else {
    eph.bossRoomBounds = null;
  }

  positionPlayersAtStart(instance, genLayout);
  initPlayerStats(instance, floorNum);

  const floorMsg: DungeonFloorMessage = {
    type: "d_floor",
    floor: floorNum,
    gridWidth: genLayout.width,
    gridHeight: genLayout.height,
    tiles: Array.from(genLayout.tileGrid),
    rooms: genLayout.rooms.map((r, i) => ({
      x: r.x, y: r.y, w: r.w, h: r.h,
      shape: r.shape,
      tileSet: r.shape !== "rect" ? r.tileSet : undefined,
    })),
    corridors: layout.corridors.map((c) => ({
      x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, width: c.width,
    })),
  };

  openInitialDoors(instance, layout, genLayout);
  floorMsg.tiles = Array.from(layout.tiles);
  broadcastToInstance(instance, floorMsg);

  console.log(`[dungeon-loop] Floor ${String(floorNum)} initialized for ${instance.id}: ${String(genLayout.rooms.length)} rooms, ${String(instance.enemies.size)} enemies`);
}

// ─── Adapter: DungeonPlayer → combat PlayerEntity ────────────────────────────

function toPlayerEntity(p: DungeonPlayer, tick: number): PlayerEntity {
  // Build effective stats including temp powerup multipliers
  const baseStats: BaseStats = {
    maxHP: p.maxHp,
    ATK: p.atk,
    DEF: p.def,
    SPD: p.spd,
    LCK: p.lck,
  };
  const effectiveStats = calculateEffectiveStats(baseStats, [], p.activeTempPowerups);
  return {
    id: p.id,
    x: p.x,
    y: p.y,
    radius: PLAYER_RADIUS,
    hp: p.hp,
    maxHP: p.maxHp,
    stats: effectiveStats,
    facing: p.facing,
    iFrameUntilTick: tick + p.iframeTicks,
    alive: p.hp > 0 && p.diedOnFloor === null,
    persona: PERSONA_POWER[p.personaSlug] ?? "holden",
    powerCooldownUntilTick: tick + p.cooldownTicks,
    broseidonWindowEnd: 0,
    broseidonStacks: 0,
    activeTempPowerups: p.activeTempPowerups,
    scramblingUntilTick: tick + p.scramblingTicks,
  };
}

function toEnemyEntity(e: EnemyInstance, _tick: number): EnemyEntity {
  const radiusMap: Record<string, number> = {
    melee_chase: 8,
    ranged_pattern: 8,
    slow_charge: 16,
  };
  return {
    id: e.id,
    x: e.x,
    y: e.y,
    radius: e.isBoss ? 20 : (radiusMap[e.behavior] ?? 8),
    hp: e.hp,
    maxHP: e.maxHp,
    stats: {
      maxHP: e.maxHp,
      ATK: e.atk,
      DEF: e.def,
      SPD: e.spd,
      LCK: 0,
      autoAttackIntervalMs: 1000,
      critChance: 0,
    },
    facing: "right",
    iFrameUntilTick: 0,
    alive: e.hp > 0,
    stunUntilTick: 0,
    slowMultiplier: 1.0,
  };
}

// ─── Write combat results back to instance ───────────────────────────────────

// ─── Temp Powerup Helpers ────────────────────────────────────────────────────

const PICKUP_DROP_CHANCE = 0.20; // 20% per enemy kill (temp powerup)
const HEALTH_DROP_CHANCE = 0.075; // 7.5% per enemy kill (HP heart) — independent roll
const PICKUP_RADIUS = 20; // px — collection radius

let pickupCounter = 0;

function maybeDropPickup(instance: DungeonInstance, x: number, y: number): void {
  // Temp powerup drop (20% independent roll)
  if (Math.random() < PICKUP_DROP_CHANCE) {
    if (TEMP_POWERUP_TEMPLATES.length > 0) {
      const templateIdx = Math.floor(Math.random() * TEMP_POWERUP_TEMPLATES.length);
      // Safe: index bounded by array length, guarded above
      const template = TEMP_POWERUP_TEMPLATES[templateIdx];
      const pickupId = `pu-${instance.id}-${Date.now().toString(36)}-${(++pickupCounter).toString(36)}`;
      const pickup: FloorPickup = {
        id: pickupId,
        templateId: template.id,
        type: 'temp_powerup',
        x,
        y,
        pickedUpBy: null,
      };
      instance.floorPickups.set(pickupId, pickup);
    }
  }

  // Health drop (15% independent roll)
  if (Math.random() < HEALTH_DROP_CHANCE) {
    const pickupId = `hp-${instance.id}-${Date.now().toString(36)}-${(++pickupCounter).toString(36)}`;
    const pickup: FloorPickup = {
      id: pickupId,
      templateId: 'health',
      type: 'health',
      // healAmount is resolved at collection time using the player's current maxHp
      x: x + 4, // slight offset so it doesn't overlap a temp powerup dropped at same position
      y: y + 4,
      pickedUpBy: null,
    };
    instance.floorPickups.set(pickupId, pickup);
  }
}

function applyTempPowerupToPlayer(player: DungeonPlayer, templateId: string): void {
  let tmpl;
  try {
    tmpl = getTempPowerupTemplate(templateId);
  } catch (err) {
    console.error("[dungeon-loop] applyTempPowerupToPlayer: unknown template", templateId, err);
    return;
  }

  const now = Date.now();
  // Remove any existing stack of the same powerup (refresh it)
  player.activeTempPowerups = player.activeTempPowerups.filter((a) => a.templateId !== templateId);
  player.activeTempPowerups.push({
    templateId,
    expiresAt: now + tmpl.durationMs,
  });
}

function expireTempPowerups(player: DungeonPlayer): void {
  const now = Date.now();
  player.activeTempPowerups = player.activeTempPowerups.filter((a) => a.expiresAt > now);
}

// ─── Main Tick — Phase Functions ─────────────────────────────────────────────

interface AlivePlayers {
  players: DungeonPlayer[];
  targets: { id: string; x: number; y: number; radius: number; alive: boolean }[];
}

function tickPhasePlayerInputs(instance: DungeonInstance): void {
  for (const [_pid, player] of instance.players) {
    if (player.hp <= 0 || !player.connected) continue;
    while (player.inputQueue.length > 0) {
      const input = player.inputQueue.shift();
      if (!input) break;
      player.x = input.x;
      player.y = input.y;
      player.facing = input.facing;
      player.lastProcessedSeq = input.seq;
    }
  }
}

function buildCombatArrays(instance: DungeonInstance, tick: number): {
  aliveData: AlivePlayers;
  enemyEntities: EnemyEntity[];
} {
  const players = Array.from(instance.players.values()).filter(
    (p) => p.hp > 0 && p.diedOnFloor === null
  );
  const targets = players.map((p) => ({
    id: p.id, x: p.x, y: p.y, radius: PLAYER_RADIUS, alive: true,
  }));
  const enemyEntities: EnemyEntity[] = [];
  for (const [_eid, enemy] of instance.enemies) {
    if (enemy.hp <= 0) continue;
    enemyEntities.push(toEnemyEntity(enemy, tick));
  }
  return { aliveData: { players, targets }, enemyEntities };
}

function tickPhaseAoE(
  instance: DungeonInstance,
  enemyEntities: EnemyEntity[],
  tick: number,
): void {
  resetSlowMultipliers(enemyEntities);
  const combatAoeZones: AoEZone[] = [];
  for (const [_zid, zone] of instance.aoeZones) {
    combatAoeZones.push({
      id: zone.id, x: zone.x, y: zone.y, radius: zone.radius,
      expiresAtTick: tick + zone.ticksRemaining,
      owner: zone.ownerId, type: "deckard_slow", slowFactor: zone.slowFactor,
    });
  }
  const expiredZones = tickAoEZones(combatAoeZones, enemyEntities, tick);
  for (const zoneId of expiredZones) instance.aoeZones.delete(zoneId);
  for (const [zid, zone] of instance.aoeZones) {
    zone.ticksRemaining--;
    if (zone.ticksRemaining <= 0) instance.aoeZones.delete(zid);
  }
}

function applyEnemyAttackAction(
  instance: DungeonInstance,
  enemy: EnemyInstance,
  eid: string,
  combatEnemy: EnemyEntity,
  action: { type: string; dx: number; dy: number; projectile?: ProjectileSpawn | null; telegraphTicks?: number },
  alivePlayers: DungeonPlayer[],
  events: TickEvent[],
): void {
  if (!action.projectile) {
    for (const p of alivePlayers) {
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= (combatEnemy.radius + PLAYER_RADIUS + 2) && p.iframeTicks <= 0) {
        const rawDamage = Math.max(1, enemy.atk - Math.floor(p.def * 0.5));
        const damageMult = 1 + (p.cursedEffects?.damageTakenMult ?? 0);
        const damage = Math.max(1, Math.floor(rawDamage * damageMult));
        p.hp -= damage;
        p.iframeTicks = 8;
        p.damageTaken += damage;
        events.push({ type: "damage", payload: { targetId: p.id, damage, attackerId: eid, isCrit: false } });
        if (p.hp <= 0) {
          p.hp = 0;
          p.diedOnFloor = instance.floor;
          events.push({ type: "player_death", payload: { playerId: p.id, floor: instance.floor } });
        }
        break;
      }
    }
  }
  if (action.projectile) {
    enemy.x += action.dx;
    enemy.y += action.dy;
    spawnProjectile(instance, action.projectile, eid, true);
  }
}

function applyEnemyAction(
  instance: DungeonInstance,
  enemy: EnemyInstance,
  eid: string,
  combatEnemy: EnemyEntity,
  action: ReturnType<typeof updateEnemyAI>,
  alivePlayers: DungeonPlayer[],
  events: TickEvent[],
): void {
  switch (action.type) {
    case "move":
    case "charge":
      enemy.x += action.dx;
      enemy.y += action.dy;
      break;
    case "attack":
      applyEnemyAttackAction(instance, enemy, eid, combatEnemy, action, alivePlayers, events);
      break;
    case "telegraph":
      enemy.telegraphing = true;
      enemy.telegraphTicks = action.telegraphTicks ?? 0;
      break;
    case "idle":
      enemy.telegraphing = false;
      break;
  }
}

function tickPhaseEnemyAI(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  layout: ProtocolFloorLayout,
  enemyEntities: EnemyEntity[],
  alivePlayers: DungeonPlayer[],
  playerTargets: { id: string; x: number; y: number; radius: number; alive: boolean }[],
  tick: number,
  events: TickEvent[],
): void {
  for (const [eid, enemy] of instance.enemies) {
    if (enemy.hp <= 0 || enemy.isBoss) continue;
    const aiState = eph.aiStates.get(eid);
    if (!aiState) continue;
    const ee = enemyEntities.find((e) => e.id === eid);
    const combatEnemy = ee ?? toEnemyEntity(enemy, tick);
    const action = updateEnemyAI(combatEnemy, aiState, playerTargets, layout.tiles, layout.width, layout.height, tick, TILE_SIZE);
    applyEnemyAction(instance, enemy, eid, combatEnemy, action, alivePlayers, events);
  }
}

interface BossSpawnReq { behavior: string; x: number; y: number; hpScale: number }
interface BossProjReq { x: number; y: number; vx: number; vy: number; damage: number; radius: number; lifetimeTicks: number }

function spawnBossWave(instance: DungeonInstance, eph: InstanceEphemeral, boss: EnemyInstance, spawns: BossSpawnReq[]): void {
  const behaviorMap: Record<string, "melee_chase" | "ranged_pattern" | "slow_charge"> = {
    melee_chase: "melee_chase", ranged_pattern: "ranged_pattern", slow_charge: "slow_charge",
  };
  for (const spawnReq of spawns) {
    const newId = `e-${instance.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const newEnemy: EnemyInstance = {
      id: newId, variantId: 0, variantName: spawnReq.behavior,
      behavior: behaviorMap[spawnReq.behavior] ?? "melee_chase",
      x: spawnReq.x, y: spawnReq.y,
      hp: Math.floor(20 * spawnReq.hpScale), maxHp: Math.floor(20 * spawnReq.hpScale),
      atk: 5, def: 2, spd: 1.5, isBoss: false, bossSpawned: true,
      roomIndex: boss.roomIndex, targetPlayerId: null, cooldownTicks: 0,
      telegraphing: false, telegraphTicks: 0, phase: 0, phaseData: {},
    };
    instance.enemies.set(newId, newEnemy);
    eph.aiStates.set(newId, createEnemyAIState(newEnemy.behavior));
  }
}

function spawnBossProjectiles(instance: DungeonInstance, bossId: string, projectiles: BossProjReq[]): void {
  for (const proj of projectiles) {
    spawnProjectile(instance, { x: proj.x, y: proj.y, vx: proj.vx, vy: proj.vy, damage: proj.damage, radius: proj.radius, lifetimeTicks: proj.lifetimeTicks }, bossId, true);
  }
}

function spawnBossAoEZone(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  zone: NonNullable<ReturnType<typeof updateBossAI>["zone"]>,
  tick: number,
): void {
  const zoneId = `bz-${String(tick)}-${Math.random().toString(36).slice(2, 5)}`;
  instance.aoeZones.set(zoneId, {
    id: zoneId, x: zone.x, y: zone.y, radius: zone.radius,
    ticksRemaining: zone.durationTicks, zoneType: zone.type,
    ownerId: eph.bossId ?? "", damagePerTick: zone.damagePerTick, slowFactor: 0.5,
  });
}

function syncBossPhase(boss: EnemyInstance, eph: InstanceEphemeral, events: TickEvent[]): void {
  if (!eph.bossAIState) return;
  if (boss.phase !== eph.bossAIState.phase) {
    events.push({ type: "boss_phase", payload: { bossId: boss.id, oldPhase: boss.phase, newPhase: eph.bossAIState.phase } });
  }
  boss.phase = eph.bossAIState.phase;
}

function applyBossMoveOrWave(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  boss: EnemyInstance,
  bossAction: ReturnType<typeof updateBossAI>,
): boolean {
  if (bossAction.type === "move") {
    boss.x += bossAction.dx;
    boss.y += bossAction.dy;
    return true;
  }
  if (bossAction.type === "spawn_wave") {
    if (bossAction.spawns) spawnBossWave(instance, eph, boss, bossAction.spawns);
    return true;
  }
  return false;
}

function applyBossProjOrZone(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  bossAction: ReturnType<typeof updateBossAI>,
  tick: number,
): boolean {
  if (bossAction.type === "projectile_burst" || bossAction.type === "combo") {
    if (bossAction.projectiles) spawnBossProjectiles(instance, eph.bossId ?? "", bossAction.projectiles);
    return true;
  }
  if (bossAction.type === "spawn_zone") {
    if (bossAction.zone) spawnBossAoEZone(instance, eph, bossAction.zone, tick);
    return true;
  }
  return false;
}

function applyBossActionSwitch(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  boss: EnemyInstance,
  bossAction: ReturnType<typeof updateBossAI>,
  tick: number,
): void {
  if (applyBossMoveOrWave(instance, eph, boss, bossAction)) return;
  if (applyBossProjOrZone(instance, eph, bossAction, tick)) return;
  if (bossAction.type === "telegraph") {
    boss.telegraphing = true;
    boss.telegraphTicks = bossAction.telegraphTicks ?? 0;
  } else if (bossAction.type === "idle") {
    boss.telegraphing = false;
  }
}

function applyBossAction(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  boss: EnemyInstance,
  bossAction: ReturnType<typeof updateBossAI>,
  tick: number,
  events: TickEvent[],
): void {
  applyBossActionSwitch(instance, eph, boss, bossAction, tick);
  syncBossPhase(boss, eph, events);
}

function isPlayerInBossRoom(instance: DungeonInstance, eph: InstanceEphemeral): boolean {
  if (!eph.bossRoomBounds) return true;
  const br = eph.bossRoomBounds;
  for (const [, player] of instance.players) {
    if (player.hp <= 0) continue;
    if (player.x >= br.x && player.x <= br.x + br.w && player.y >= br.y && player.y <= br.y + br.h) return true;
  }
  return false;
}

function tickPhaseBossAI(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  layout: ProtocolFloorLayout,
  enemyEntities: EnemyEntity[],
  playerTargets: { id: string; x: number; y: number; radius: number; alive: boolean }[],
  tick: number,
  events: TickEvent[],
): void {
  if (!eph.bossId || !eph.bossAIState) return;
  const boss = instance.enemies.get(eph.bossId);
  if (!boss || boss.hp <= 0) return;
  if (!isPlayerInBossRoom(instance, eph)) return;
  instance.status = "boss";
  const bossEntity = toEnemyEntity(boss, tick);
  const bossAction = updateBossAI(bossEntity, eph.bossAIState, playerTargets, enemyEntities, layout.tiles, layout.width, tick);
  applyBossAction(instance, eph, boss, bossAction, tick, events);
}

function isProjectileBlocked(proj: ProjectileInstance, layout: ProtocolFloorLayout): boolean {
  const tileX = Math.floor(proj.x / TILE_SIZE);
  const tileY = Math.floor(proj.y / TILE_SIZE);
  if (tileX < 0 || tileX >= layout.width || tileY < 0 || tileY >= layout.height) return true;
  const tileVal = layout.tiles[tileY * layout.width + tileX];
  return tileVal === TILE.WALL || tileVal === TILE.DOOR_CLOSED;
}

function tickPhaseProjectiles(
  instance: DungeonInstance,
  layout: ProtocolFloorLayout,
  alivePlayers: DungeonPlayer[],
  tick: number,
  events: TickEvent[],
): void {
  const toRemove: string[] = [];
  for (const [pid, proj] of instance.projectiles) {
    proj.x += proj.vx;
    proj.y += proj.vy;
    proj.lifetimeTicks--;
    if (proj.lifetimeTicks <= 0 || isProjectileBlocked(proj, layout)) { toRemove.push(pid); continue; }
    if (proj.fromEnemy) {
      tickEnemyProjectile(instance, pid, proj, alivePlayers, events, toRemove);
    } else {
      tickPlayerProjectile(instance, pid, proj, events, toRemove);
    }
  }
  for (const pid of toRemove) instance.projectiles.delete(pid);
}

function tickEnemyProjectile(
  instance: DungeonInstance,
  pid: string,
  proj: ProjectileInstance,
  alivePlayers: DungeonPlayer[],
  events: TickEvent[],
  toRemove: string[],
): void {
  for (const p of alivePlayers) {
    if (p.iframeTicks > 0) continue;
    if (!circleVsCircle(proj.x, proj.y, proj.radius, p.x, p.y, PLAYER_RADIUS)) continue;
    const rawProjDamage = Math.max(1, proj.damage - Math.floor(p.def * 0.5));
    const projDamageMult = 1 + (p.cursedEffects?.damageTakenMult ?? 0);
    const damage = Math.max(1, Math.floor(rawProjDamage * projDamageMult));
    p.hp -= damage;
    p.iframeTicks = 8;
    p.damageTaken += damage;
    events.push({ type: "damage", payload: { targetId: p.id, damage, attackerId: proj.ownerId, isCrit: false } });
    if (p.hp <= 0) {
      p.hp = 0;
      p.diedOnFloor = instance.floor;
      events.push({ type: "player_death", payload: { playerId: p.id, floor: instance.floor } });
    }
    toRemove.push(pid);
    break;
  }
}

function applyLifesteal(killer: DungeonPlayer, damage: number): void {
  const hasLifesteal = killer.activeTempPowerups.some((a) => a.templateId === "lifesteal" && a.expiresAt > Date.now());
  if (hasLifesteal) killer.hp = Math.min(killer.maxHp, killer.hp + Math.max(1, Math.floor(damage * 0.1)));
}

function applyProjectileHitEnemy(
  instance: DungeonInstance,
  pid: string,
  proj: ProjectileInstance,
  eid: string,
  enemy: EnemyInstance,
  events: TickEvent[],
  toRemove: string[],
): void {
  enemy.hp -= proj.damage;
  const killer = instance.players.get(proj.ownerId);
  if (killer) { killer.damageDealt += proj.damage; applyLifesteal(killer, proj.damage); }
  events.push({ type: "damage", payload: { targetId: eid, damage: proj.damage, attackerId: proj.ownerId, isCrit: false } });
  if (enemy.hp <= 0) {
    enemy.hp = 0;
    events.push({ type: "kill", payload: { enemyId: eid, killerId: proj.ownerId } });
    if (killer) killer.kills++;
    if (!enemy.isBoss) maybeDropPickup(instance, enemy.x, enemy.y);
  }
  toRemove.push(pid);
}

function tickPlayerProjectile(
  instance: DungeonInstance,
  pid: string,
  proj: ProjectileInstance,
  events: TickEvent[],
  toRemove: string[],
): void {
  for (const [eid, enemy] of instance.enemies) {
    if (enemy.hp <= 0) continue;
    const eRadius = enemy.isBoss ? 20 : 8;
    if (!circleVsCircle(proj.x, proj.y, proj.radius, enemy.x, enemy.y, eRadius)) continue;
    applyProjectileHitEnemy(instance, pid, proj, eid, enemy, events, toRemove);
    break;
  }
}

function tickPhaseAoEDamage(
  instance: DungeonInstance,
  alivePlayers: DungeonPlayer[],
  events: TickEvent[],
): void {
  for (const [_zid, zone] of instance.aoeZones) {
    if (zone.damagePerTick <= 0) continue;
    for (const p of alivePlayers) {
      if (p.iframeTicks > 0) continue;
      if (!circleVsCircle(p.x, p.y, PLAYER_RADIUS, zone.x, zone.y, zone.radius)) continue;
      p.hp -= zone.damagePerTick;
      p.damageTaken += zone.damagePerTick;
      if (p.hp <= 0) {
        p.hp = 0;
        p.diedOnFloor = instance.floor;
        events.push({ type: "player_death", payload: { playerId: p.id, floor: instance.floor } });
      }
    }
  }
}

function findNearestEnemy(player: DungeonPlayer, enemyEntities: EnemyEntity[]): EnemyEntity | null {
  let bestDist = Infinity;
  let bestTarget: EnemyEntity | null = null;
  for (const ee of enemyEntities) {
    if (!ee.alive) continue;
    const dx = player.x - ee.x;
    const dy = player.y - ee.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= PLAYER_AUTO_ATTACK_RANGE && dist < bestDist) { bestDist = dist; bestTarget = ee; }
  }
  return bestTarget;
}

function firePlayerAutoAttack(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  pid: string,
  player: DungeonPlayer,
  pe: PlayerEntity,
  target: EnemyEntity,
  tick: number,
): void {
  const variance = 1 + (Math.random() * 0.2 - 0.1);
  let finalDamage = Math.max(1, Math.floor(pe.stats.ATK * variance - target.stats.DEF * 0.5));
  if (Math.random() < pe.stats.critChance) finalDamage = Math.floor(finalDamage * 1.5);
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  spawnProjectile(instance, {
    x: player.x, y: player.y,
    vx: (dx / dist) * PLAYER_PROJECTILE_SPEED, vy: (dy / dist) * PLAYER_PROJECTILE_SPEED,
    damage: finalDamage, radius: PLAYER_PROJECTILE_RADIUS, lifetimeTicks: PLAYER_PROJECTILE_LIFETIME_TICKS,
  }, pid, false);
  eph.autoAttackTimers.set(pid, tick + AUTO_ATTACK_INTERVAL_TICKS);
}

function tickPhaseAutoAttacks(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  enemyEntities: EnemyEntity[],
  tick: number,
): void {
  for (const [pid, player] of instance.players) {
    if (player.hp <= 0 || player.diedOnFloor !== null) continue;
    const nextAttackTick = eph.autoAttackTimers.get(pid) ?? 0;
    if (tick < nextAttackTick) continue;
    const bestTarget = findNearestEnemy(player, enemyEntities);
    if (!bestTarget) continue;
    const pe = toPlayerEntity(player, tick);
    firePlayerAutoAttack(instance, eph, pid, player, pe, bestTarget, tick);
  }
}

function syncPowerKills(
  instance: DungeonInstance,
  pid: string,
  player: DungeonPlayer,
  affected: string[],
  targets: EnemyEntity[],
  events: TickEvent[],
): void {
  for (const eid of affected) {
    const enemy = instance.enemies.get(eid);
    if (!enemy) continue;
    const ce = targets.find((t) => t.id === eid);
    if (!ce) continue;
    enemy.hp = ce.hp;
    if (enemy.hp <= 0) {
      enemy.hp = 0;
      player.kills++;
      events.push({ type: "kill", payload: { enemyId: eid, killerId: pid } });
      if (!enemy.isBoss) maybeDropPickup(instance, enemy.x, enemy.y);
    }
  }
}

function applyHealEvents(
  instance: DungeonInstance,
  pid: string,
  healEvents: { targetId: string; amount: number }[],
  allPlayerEntities: PlayerEntity[],
  events: TickEvent[],
): void {
  for (const he of healEvents) {
    const healTarget = instance.players.get(he.targetId);
    if (healTarget) {
      const ce = allPlayerEntities.find((p) => p.id === he.targetId);
      if (ce) healTarget.hp = ce.hp;
    }
    events.push({ type: "heal", payload: { targetId: he.targetId, amount: he.amount, healerId: pid } });
  }
}

function applyPowerEffects(
  instance: DungeonInstance,
  pid: string,
  player: DungeonPlayer,
  pe: PlayerEntity,
  powerResult: NonNullable<ReturnType<typeof resolvePower>>,
  targets: EnemyEntity[],
  allPlayerEntities: PlayerEntity[],
  tick: number,
  events: TickEvent[],
): void {
  // Apply power cooldown curse: double the cooldown if player has powerCooldownMult > 0
  const baseCooldownTicks = Math.max(0, pe.powerCooldownUntilTick - tick);
  const cooldownCurseMult = 1 + (player.cursedEffects?.powerCooldownMult ?? 0);
  player.cooldownTicks = Math.round(baseCooldownTicks * cooldownCurseMult);
  player.scramblingTicks = Math.max(0, pe.scramblingUntilTick - tick);
  events.push({ type: "power_activate", payload: { playerId: pid, power: powerResult.powerName, affected: powerResult.affected } });
  syncPowerKills(instance, pid, player, powerResult.affected, targets, events);
  if (powerResult.spawnedZone) {
    const sz = powerResult.spawnedZone;
    instance.aoeZones.set(sz.id, {
      id: sz.id, x: sz.x, y: sz.y, radius: sz.radius, ticksRemaining: sz.expiresAtTick - tick,
      zoneType: sz.type, ownerId: sz.owner, damagePerTick: 0, slowFactor: sz.slowFactor,
    });
  }
  if (powerResult.healed) player.hp = Math.min(player.maxHp, player.hp + powerResult.healed);
  if (powerResult.healEvents) applyHealEvents(instance, pid, powerResult.healEvents, allPlayerEntities, events);
}

function applyCrundleContactDamage(
  instance: DungeonInstance,
  pid: string,
  player: DungeonPlayer,
  contactDamage: number,
  events: TickEvent[],
): void {
  for (const [eid, enemy] of instance.enemies) {
    if (enemy.hp <= 0) continue;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    if (Math.sqrt(dx * dx + dy * dy) > PLAYER_RADIUS + 8 + 4) continue;
    enemy.hp = Math.max(0, enemy.hp - contactDamage);
    events.push({ type: "damage", payload: { targetId: eid, damage: contactDamage, attackerId: pid, isCrit: false } });
    if (enemy.hp <= 0) {
      const killer = instance.players.get(pid);
      if (killer) killer.kills++;
      events.push({ type: "kill", payload: { enemyId: eid, killerId: pid } });
    }
  }
}

function tickCrundleScramble(
  instance: DungeonInstance,
  allPlayerEntities: PlayerEntity[],
  tick: number,
  events: TickEvent[],
): void {
  for (const [pid, player] of instance.players) {
    if (player.hp <= 0 || player.diedOnFloor !== null || player.scramblingTicks <= 0) continue;
    const pe = allPlayerEntities.find((p) => p.id === pid);
    if (!pe || !isCrundleScrambling(pe, tick)) continue;
    applyCrundleContactDamage(instance, pid, player, getCrundleContactDamage(pe), events);
  }
}

function processPendingPowers(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  enemyEntities: EnemyEntity[],
  allPlayerEntities: PlayerEntity[],
  tick: number,
  events: TickEvent[],
): void {
  for (const pid of eph.pendingPowers) {
    const player = instance.players.get(pid);
    if (!player || player.hp <= 0 || player.cooldownTicks > 0) continue;
    const pe = allPlayerEntities.find((p) => p.id === pid);
    if (!pe) continue;
    const targets = enemyEntities.filter((e) => e.alive);
    const powerResult = resolvePower(pe, targets, [], tick, allPlayerEntities);
    if (powerResult?.activated) {
      applyPowerEffects(instance, pid, player, pe, powerResult, targets, allPlayerEntities, tick, events);
    }
  }
  eph.pendingPowers.clear();
}

function processPendingSpins(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  enemyEntities: EnemyEntity[],
  tick: number,
  events: TickEvent[],
): void {
  for (const pid of eph.pendingSpins) {
    const player = instance.players.get(pid);
    if (!player || player.hp <= 0 || player.diedOnFloor !== null) continue;
    if (player.spinCooldownTicks > 0) continue;

    const pe = toPlayerEntity(player, tick);
    const aliveEnemyEntities = enemyEntities.filter((e) => e.alive);
    const spinResult = resolveSpinAttack(pe, aliveEnemyEntities, tick);

    // Apply spin cooldown
    player.spinCooldownTicks = SPIN_COOLDOWN_TICKS;

    // Emit spin_activate event for visual effect
    events.push({ type: "spin_activate", payload: { playerId: pid } });

    // Sync damage and kills back to instance enemies
    for (const hit of spinResult.hits) {
      const enemy = instance.enemies.get(hit.targetId);
      if (!enemy) continue;
      const ce = aliveEnemyEntities.find((e) => e.id === hit.targetId);
      if (!ce) continue;

      player.damageDealt += hit.damage;
      enemy.hp = ce.hp;

      events.push({
        type: "damage",
        payload: { targetId: hit.targetId, attackerId: pid, damage: hit.damage, isCrit: hit.isCrit, source: "spin" },
      });

      if (enemy.hp <= 0) {
        enemy.hp = 0;
        player.kills++;
        events.push({ type: "kill", payload: { enemyId: hit.targetId, killerId: pid } });
        if (!enemy.isBoss) maybeDropPickup(instance, enemy.x, enemy.y);
      }
    }
  }
  eph.pendingSpins.clear();
}

function tickPhasePowers(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  enemyEntities: EnemyEntity[],
  tick: number,
  events: TickEvent[],
): void {
  const allPlayerEntities: PlayerEntity[] = [];
  for (const [, p] of instance.players) {
    if (p.hp > 0 && p.diedOnFloor === null) allPlayerEntities.push(toPlayerEntity(p, tick));
  }
  processPendingPowers(instance, eph, enemyEntities, allPlayerEntities, tick, events);
  processPendingSpins(instance, eph, enemyEntities, tick, events);
  tickCrundleScramble(instance, allPlayerEntities, tick, events);
}

function collectPickup(
  instance: DungeonInstance,
  player: DungeonPlayer,
  puid: string,
  pickup: FloorPickup,
  events: TickEvent[],
): void {
  pickup.pickedUpBy = player.id;
  if (pickup.type === "health") {
    const healAmount = Math.floor(player.maxHp * 0.20);
    const actualHeal = Math.min(healAmount, player.maxHp - player.hp);
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    player.totalHealing += actualHeal;
    events.push({ type: "pickup", payload: { playerId: player.id, pickupId: puid, templateId: "health", name: "Health", emoji: "❤️", healAmount: actualHeal } });
  } else {
    applyTempPowerupToPlayer(player, pickup.templateId);
    let tmplName = pickup.templateId;
    let tmplEmoji = "";
    try { const tmpl = getTempPowerupTemplate(pickup.templateId); tmplName = tmpl.name; tmplEmoji = tmpl.emoji; } catch { /* unknown template */ }
    events.push({ type: "pickup", payload: { playerId: player.id, pickupId: puid, templateId: pickup.templateId, name: tmplName, emoji: tmplEmoji } });
  }
}

function processPlayerPickups(
  instance: DungeonInstance,
  player: DungeonPlayer,
  events: TickEvent[],
): void {
  expireTempPowerups(player);
  for (const [puid, pickup] of instance.floorPickups) {
    if (pickup.pickedUpBy !== null) continue;
    if (circleVsCircle(player.x, player.y, PLAYER_RADIUS, pickup.x, pickup.y, PICKUP_RADIUS)) {
      collectPickup(instance, player, puid, pickup, events);
    }
  }
  for (const [puid, pickup] of instance.floorPickups) {
    if (pickup.pickedUpBy !== null) instance.floorPickups.delete(puid);
  }
}

function tickPhaseTimersAndPickups(
  instance: DungeonInstance,
  events: TickEvent[],
): void {
  for (const [_pid, player] of instance.players) {
    if (player.iframeTicks > 0) player.iframeTicks--;
    if (player.cooldownTicks > 0) player.cooldownTicks--;
    if (player.scramblingTicks > 0) player.scramblingTicks--;
    if (player.spinCooldownTicks > 0) player.spinCooldownTicks--;
  }
  for (const [_pid, player] of instance.players) {
    if (player.hp <= 0 || player.diedOnFloor !== null) continue;
    processPlayerPickups(instance, player, events);
  }
}

function tickPhaseRoomClear(
  instance: DungeonInstance,
  layout: ProtocolFloorLayout,
  events: TickEvent[],
): void {
  for (let i = 0; i < layout.rooms.length; i++) {
    const room = layout.rooms[i];
    if (room.cleared) continue;
    const allDead = room.enemyIds.length === 0 || room.enemyIds.every((eid) => {
      const enemy = instance.enemies.get(eid);
      return !enemy || enemy.hp <= 0;
    });
    if (allDead) {
      room.cleared = true;
      events.push({ type: "door_open", payload: { roomIndex: i } });
      openDoorsForRoom(layout, i);
    }
  }
}

/** Returns true if the tick should stop (victory, defeat, or floor transition triggered). */
function tickPhaseEndConditions(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
): boolean {
  if (eph.bossId) {
    const boss = instance.enemies.get(eph.bossId);
    if (boss && boss.hp <= 0) {
      if (instance.floor >= TOTAL_FLOORS) {
        instance.status = "completed";
        broadcastToInstance(instance, buildResults(instance, "victory"));
        persistRunResult(instance, "victory");
        console.log(`[dungeon-loop] Victory for ${instance.id}!`);
        setTimeout(() => { cleanupEphemeral(instance.id); destroyRun(instance.lobbyId); }, 5000);
      } else {
        instance.status = "between_floors";
        startPowerupTransition(instance, eph);
      }
      return true;
    }
  }
  const anyAlive = Array.from(instance.players.values()).some((p) => p.hp > 0 && p.diedOnFloor === null);
  if (!anyAlive) {
    instance.status = "completed";
    broadcastToInstance(instance, buildResults(instance, "death"));
    persistRunResult(instance, "death");
    console.log(`[dungeon-loop] Defeat for ${instance.id} on floor ${String(instance.floor)}`);
    setTimeout(() => { cleanupEphemeral(instance.id); destroyRun(instance.lobbyId); }, 5000);
    return true;
  }
  return false;
}

function tickPhaseDisconnects(instance: DungeonInstance): void {
  const now = Date.now();
  for (const [_pid, player] of instance.players) {
    if (!player.connected && player.disconnectedAt && now - player.disconnectedAt > DISCONNECT_TIMEOUT_MS) {
      player.hp = 0;
      player.diedOnFloor = instance.floor;
    }
  }
}

function tickPhaseBroadcast(
  instance: DungeonInstance,
  eph: InstanceEphemeral,
  tick: number,
  events: TickEvent[],
): void {
  let remainingMobs = 0;
  for (const [, e] of instance.enemies) {
    if (e.hp > 0 && !e.isBoss && !e.bossSpawned) remainingMobs++;
  }
  broadcastToInstance(instance, {
    type: "d_tick", tick, t: Date.now(),
    players: buildPlayerSnapshots(instance),
    enemies: buildEnemySnapshots(instance),
    projectiles: buildProjectileSnapshots(instance),
    aoeZones: buildAoEZoneSnapshots(instance),
    events, totalMobs: eph.originalEnemyCount, remainingMobs,
    floorPickups: buildFloorPickupSnapshots(instance),
  });
}

// ─── Main Tick ───────────────────────────────────────────────────────────────

function tickInstance(instance: DungeonInstance): void {
  if (instance.status !== "running" && instance.status !== "boss") return;

  instance.tick++;
  const tick = instance.tick;
  const layout = instance.layout;
  if (!layout) return;

  const eph = getEphemeral(instance);
  const events: TickEvent[] = [];

  tickPhasePlayerInputs(instance);
  const { aliveData, enemyEntities } = buildCombatArrays(instance, tick);
  tickPhaseAoE(instance, enemyEntities, tick);
  tickPhaseEnemyAI(instance, eph, layout, enemyEntities, aliveData.players, aliveData.targets, tick, events);
  tickPhaseBossAI(instance, eph, layout, enemyEntities, aliveData.targets, tick, events);
  tickPhaseProjectiles(instance, layout, aliveData.players, tick, events);
  tickPhaseAoEDamage(instance, aliveData.players, events);
  tickPhaseAutoAttacks(instance, eph, enemyEntities, tick);
  tickPhasePowers(instance, eph, enemyEntities, tick, events);
  tickPhaseTimersAndPickups(instance, events);
  tickPhaseRoomClear(instance, layout, events);
  if (tickPhaseEndConditions(instance, eph)) return;
  tickPhaseDisconnects(instance);
  tickPhaseBroadcast(instance, eph, tick, events);
}

// ─── Powerup transition ─────────────────────────────────────────────────────

function startPowerupTransition(instance: DungeonInstance, eph: InstanceEphemeral): void {
  // Generate 3 normal choices + 1 cursed choice from registry
  const normalChoices = lootRegistry.generateChoices(3, instance.floor);
  const cursedChoice = lootRegistry.generateCursedChoice();
  const choices: LootItem[] = cursedChoice
    ? [...normalChoices, cursedChoice]
    : normalChoices;
  eph.transitionChoices = choices;
  eph.transitionPicks = new Map();

  // Broadcast choices to all players
  const choicesMsg = {
    type: "d_powerup_choices" as const,
    choices: choices.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      rarity: c.rarity,
      statModifier: c.statModifier,
      cursed: c.cursed ?? false,
      curseDescription: c.curseDescription,
    })),
  };
  broadcastToInstance(instance, choicesMsg);

  console.log(`[dungeon-loop] Powerup transition for ${instance.id} floor ${String(instance.floor)}: ${choices.map((c) => c.name).join(", ")}`);

  // Start timeout — after 15s, assign random picks to anyone who hasn't chosen
  eph.transitionTimer = setTimeout(() => {
    finalizePowerupTransition(instance);
  }, POWERUP_PICK_TIMEOUT_MS);
}

function findInstanceById(instanceId: string): DungeonInstance | null {
  for (const [_lobbyId, inst] of getAllInstances()) {
    if (inst.id === instanceId) return inst;
  }
  return null;
}

function cancelTransitionTimerAndFinalize(instance: DungeonInstance): void {
  const eph = getEphemeral(instance);
  if (eph.transitionTimer) {
    clearTimeout(eph.transitionTimer);
    eph.transitionTimer = null;
  }
  finalizePowerupTransition(instance);
}

/**
 * Handle a player's powerup pick. Called from index.ts message handler.
 */
export function handlePowerupPick(instanceId: string, playerId: string, powerupId: number): void {
  const instance = findInstanceById(instanceId);
  if (instance?.status !== "between_floors") return;

  const eph = getEphemeral(instance);
  if (!eph.transitionChoices) return;

  const validChoice = eph.transitionChoices.find((c) => c.id === powerupId);
  if (!validChoice) return;

  eph.transitionPicks.set(playerId, powerupId);

  const alivePlayers = Array.from(instance.players.values()).filter(
    (p) => p.hp > 0 && p.diedOnFloor === null
  );
  const allPicked = alivePlayers.every((p) => eph.transitionPicks.has(p.id));
  if (allPicked) cancelTransitionTimerAndFinalize(instance);
}

function applyPickedLoot(
  player: DungeonPlayer,
  picks: Map<string, number>,
  choices: LootItem[],
): void {
  const chosenId = picks.get(player.id);
  if (chosenId === undefined) return;
  const lootItem = choices.find((c) => c.id === chosenId);
  if (!lootItem) return;
  player.powerups.push(lootItem.id);
  const mods = lootItem.statModifier;
  if (mods.hp) {
    player.maxHp += mods.hp;
    player.hp = Math.min(player.hp + Math.max(0, mods.hp), player.maxHp);
    player.maxHp = Math.max(1, player.maxHp);
    player.hp = Math.max(1, Math.min(player.hp, player.maxHp));
  }
  if (mods.atk) player.atk = Math.max(0, player.atk + mods.atk);
  if (mods.def) player.def = Math.max(0, player.def + mods.def);
  if (mods.spd) player.spd = Math.max(0.5, player.spd + mods.spd);
  if (mods.lck) player.lck = Math.max(0, player.lck + mods.lck);

  // Apply curse side effects (additive stacking on player's cursedEffects bag)
  if (lootItem.cursed && lootItem.curseEffect) {
    if (!player.cursedEffects) player.cursedEffects = {};
    for (const [key, value] of Object.entries(lootItem.curseEffect)) {
      player.cursedEffects[key] = (player.cursedEffects[key] ?? 0) + value;
    }
    console.log(`[dungeon-loop] Player ${player.name} picked CURSED ${lootItem.name} — curse: ${lootItem.curseDescription ?? "unknown"}`);
  } else {
    console.log(`[dungeon-loop] Player ${player.name} picked ${lootItem.name} (${lootItem.rarity})`);
  }
}

function finalizePowerupTransition(instance: DungeonInstance): void {
  const eph = getEphemeral(instance);
  if (!eph.transitionChoices || eph.transitionChoices.length === 0) {
    // No choices available — just advance
    advanceFloor(instance, eph);
    return;
  }

  const alivePlayers = Array.from(instance.players.values()).filter(
    (p) => p.hp > 0 && p.diedOnFloor === null
  );

  // Assign random picks for players who didn't choose
  for (const player of alivePlayers) {
    if (!eph.transitionPicks.has(player.id)) {
      const randomChoice = eph.transitionChoices[Math.floor(Math.random() * eph.transitionChoices.length)];
      eph.transitionPicks.set(player.id, randomChoice.id);
    }
  }

  // Apply powerups to players
  for (const player of alivePlayers) {
    applyPickedLoot(player, eph.transitionPicks, eph.transitionChoices);
  }

  // Clear transition state
  eph.transitionChoices = null;
  eph.transitionPicks.clear();
  eph.transitionTimer = null;

  advanceFloor(instance, eph);
}

function advanceFloor(instance: DungeonInstance, _eph: InstanceEphemeral): void {
  instance.floor++;
  instance.status = "running";
  initFloor(instance);
}

// ─── Projectile spawning ─────────────────────────────────────────────────────

let projCounter = 0;

function spawnProjectile(
  instance: DungeonInstance,
  spawn: ProjectileSpawn,
  ownerId: string,
  fromEnemy: boolean,
): void {
  const id = `proj-${String(projCounter++)}`;
  const proj: ProjectileInstance = {
    id,
    x: spawn.x,
    y: spawn.y,
    vx: spawn.vx,
    vy: spawn.vy,
    radius: spawn.radius,
    damage: spawn.damage,
    fromEnemy,
    ownerId,
    lifetimeTicks: spawn.lifetimeTicks,
  };
  instance.projectiles.set(id, proj);
}

// ─── Door opening ────────────────────────────────────────────────────────────

function openDoorTile(layout: ProtocolFloorLayout, x: number, y: number): void {
  if (x < 0 || x >= layout.width || y < 0 || y >= layout.height) return;
  const idx = y * layout.width + x;
  if (layout.tiles[idx] === TILE.DOOR_CLOSED) {
    layout.tiles[idx] = TILE.DOOR_OPEN;
  }
}

function openDoorsForRoom(layout: ProtocolFloorLayout, roomIndex: number): void {
  if (roomIndex < 0 || roomIndex >= layout.rooms.length) return;
  const room = layout.rooms[roomIndex];
  for (let y = room.y - 1; y <= room.y + room.h; y++) {
    for (let x = room.x - 1; x <= room.x + room.w; x++) {
      openDoorTile(layout, x, y);
    }
  }
}

// Snapshot builders, results, and persistence are now in dungeon-snapshots.ts

// ─── Public: queue power activation from message handler ─────────────────────

export function queuePowerActivation(instanceId: string, playerId: string): void {
  // Find instance by iterating all instances
  for (const [_lobbyId, instance] of getAllInstances()) {
    if (instance.id === instanceId) {
      const eph = getEphemeral(instance);
      eph.pendingPowers.add(playerId);
      return;
    }
  }
}

export function queueSpinAttack(instanceId: string, playerId: string): void {
  for (const [_lobbyId, instance] of getAllInstances()) {
    if (instance.id === instanceId) {
      const eph = getEphemeral(instance);
      eph.pendingSpins.add(playerId);
      return;
    }
  }
}

// ─── Loop lifecycle ──────────────────────────────────────────────────────────

let loopInterval: ReturnType<typeof setInterval> | null = null;

export function startDungeonLoop(): void {
  if (loopInterval) return;

  loopInterval = setInterval(() => {
    for (const [_lobbyId, instance] of getAllInstances()) {
      if (instance.status === "running" || instance.status === "boss") {
        try {
          tickInstance(instance);
        } catch (err) {
          console.error(`[dungeon-loop] Tick error for ${instance.id}:`, err);
        }
      }
    }
  }, TICK_MS);

  console.log("[dungeon-loop] Started at 16Hz");
}

export function stopDungeonLoop(): void {
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
    console.log("[dungeon-loop] Stopped");
  }
}
