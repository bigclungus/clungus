// Clungiverse Dungeon Protocol — server-side types + re-exports from shared

// Re-export all shared wire types so existing server imports keep working
export {
  TILE,
  type TileType,
  type MobBehavior,
  type RoomShape,
  type Rarity,
  type Facing,
  type PickupType,
  type RunOutcome,
  type LobbyStatus,
  type MobGenStatus,
  type DungeonMoveMessage,
  type DungeonAttackMessage,
  type DungeonPowerMessage,
  type DungeonReadyMessage,
  type DungeonStartMessage,
  type DungeonPickPowerupMessage,
  type DungeonSpinMessage,
  type DungeonClientMessage,
  type TempPowerupSnapshot,
  type FloorPickupSnapshot,
  type DungeonTickMessage,
  type DungeonFloorMessage,
  type DungeonPowerupChoicesMessage,
  type DungeonResultsMessage,
  type DungeonLobbyMessage,
  type DungeonWelcomeMessage,
  type DungeonMobProgressMessage,
  type DungeonMobSpritesMessage,
  type DungeonMobRosterMessage,
  type DungeonServerMessage,
  type DungeonPlayerSnapshot,
  type EnemySnapshot,
  type ProjectileSnapshot,
  type AoEZoneSnapshot,
  type RoomSnapshot,
  type CorridorSnapshot,
  type PowerupChoiceSnapshot,
  type PlayerResultSnapshot,
  type LobbyPlayerSnapshot,
  type MobRosterSnapshot,
  type TickEvent,
} from "@clungiverse/shared";

// ─── Server-side game state interfaces ───────────────────────────────────────

import type { DungeonMoveMessage, Facing, MobBehavior } from "@clungiverse/shared";

export interface DungeonInstance {
  id: string;
  lobbyId: string;
  seed: string;
  floor: number;
  tick: number;
  status: "lobby" | "running" | "between_floors" | "boss" | "completed";
  startedAt: number;
  players: Map<string, DungeonPlayer>;
  enemies: Map<string, EnemyInstance>;
  projectiles: Map<string, ProjectileInstance>;
  aoeZones: Map<string, AoEZoneInstance>;
  floorPickups: Map<string, import("./temp-powerups.ts").FloorPickup>;
  layout: FloorLayout | null;
  tickInterval: ReturnType<typeof setInterval> | null;
  /** When true, mob selection is restricted to mobs that have rendered PNG images. */
  skipGen: boolean;
}

export interface DungeonPlayer {
  id: string;
  socketId: string;
  name: string;
  personaSlug: string;
  x: number;
  y: number;
  facing: Facing;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  lck: number;
  iframeTicks: number;
  cooldownTicks: number;
  cooldownMax: number;
  /** Spin attack cooldown: ticks remaining. 0 = ready. ~4.8s = 77 ticks at 16Hz. */
  spinCooldownTicks: number;
  /** Crundle Nervous Scramble: ticks remaining in scramble. 0 = inactive. */
  scramblingTicks: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  totalHealing: number;
  diedOnFloor: number | null;
  powerups: number[];
  activeTempPowerups: import("./temp-powerups.ts").ActiveTempPowerup[];
  inputQueue: DungeonMoveMessage[];
  connected: boolean;
  disconnectedAt: number | null;
  lastProcessedSeq: number;
  /**
   * Accumulated curse modifiers from picked cursed loot items.
   * Keys: "enemyHpMult", "powerCooldownMult", "damageTakenMult", "halfHpOnFloor", "enemyAtkMult"
   * Values: additive stacking floats (e.g. enemyHpMult: 0.8 = enemies have +80% HP).
   */
  cursedEffects: Record<string, number>;
}

export interface EnemyInstance {
  id: string;
  variantId: number;
  variantName: string;
  behavior: MobBehavior;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  isBoss: boolean;
  bossSpawned: boolean;
  roomIndex: number;
  targetPlayerId: string | null;
  cooldownTicks: number;
  telegraphing: boolean;
  telegraphTicks: number;
  // Boss-specific
  phase: number;
  phaseData: Record<string, unknown>;
}

export interface ProjectileInstance {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  fromEnemy: boolean;
  ownerId: string;
  lifetimeTicks: number;
}

export interface AoEZoneInstance {
  id: string;
  x: number;
  y: number;
  radius: number;
  ticksRemaining: number;
  zoneType: string;
  ownerId: string;
  damagePerTick: number;
  slowFactor: number;
}

export interface FloorLayout {
  width: number;
  height: number;
  tiles: Uint8Array;
  rooms: Room[];
  corridors: Corridor[];
}

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  enemyIds: string[];
  cleared: boolean;
}

export interface Corridor {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}
