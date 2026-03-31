// Clungiverse Dungeon Protocol — client/server message types and game state interfaces

// ─── Tile encoding ───────────────────────────────────────────────────────────

export const TILE = {
  FLOOR: 0,
  WALL: 1,
  DOOR_CLOSED: 2,
  DOOR_OPEN: 3,
  SPAWN: 4,
  TREASURE: 5,
  SHRINE: 6,
  STAIRS: 7,
} as const;

export type TileType = (typeof TILE)[keyof typeof TILE];

// ─── Client → Server messages ────────────────────────────────────────────────

export interface DungeonMoveMessage {
  type: "d_move";
  seq: number;
  x: number;
  y: number;
  facing: "left" | "right";
}

export interface DungeonAttackMessage {
  type: "d_attack";
}

export interface DungeonPowerMessage {
  type: "d_power";
}

export interface DungeonReadyMessage {
  type: "d_ready";
  personaSlug: string;
}

export interface DungeonStartMessage {
  type: "d_start";
  skipGen?: boolean;
}

export interface DungeonPickPowerupMessage {
  type: "d_pick_powerup";
  powerupId: number;
}

export type DungeonClientMessage =
  | DungeonMoveMessage
  | DungeonAttackMessage
  | DungeonPowerMessage
  | DungeonReadyMessage
  | DungeonStartMessage
  | DungeonPickPowerupMessage;

// ─── Server → Client messages ────────────────────────────────────────────────

export interface TempPowerupSnapshot {
  templateId: string;
  expiresAt: number; // ms timestamp
}

export interface FloorPickupSnapshot {
  id: string;
  templateId: string;
  type: 'temp_powerup' | 'health';
  healAmount?: number;
  x: number;
  y: number;
}

export interface DungeonTickMessage {
  type: "d_tick";
  tick: number;
  t: number;
  players: DungeonPlayerSnapshot[];
  enemies: EnemySnapshot[];
  projectiles: ProjectileSnapshot[];
  aoeZones: AoEZoneSnapshot[];
  events: TickEvent[];
  totalMobs: number;
  remainingMobs: number;
  floorPickups: FloorPickupSnapshot[];
}

export interface DungeonFloorMessage {
  type: "d_floor";
  floor: number;
  gridWidth: number;
  gridHeight: number;
  tiles: number[]; // flat Uint8Array-compatible
  rooms: RoomSnapshot[];
  corridors: CorridorSnapshot[];
}

export interface DungeonPowerupChoicesMessage {
  type: "d_powerup_choices";
  choices: PowerupChoiceSnapshot[];
}

export interface DungeonResultsMessage {
  type: "d_results";
  outcome: "victory" | "death" | "abandoned";
  floorReached: number;
  durationMs: number;
  players: PlayerResultSnapshot[];
}

export interface DungeonLobbyMessage {
  type: "d_lobby";
  lobbyId: string;
  hostId: string;
  players: LobbyPlayerSnapshot[];
  status: "waiting" | "starting" | "in_progress";
}

export interface DungeonWelcomeMessage {
  type: "d_welcome";
  playerId: string;
  lobbyId: string;
}

export interface DungeonMobProgressMessage {
  type: "d_mob_progress";
  completed: number;
  total: number;
  currentEntity: string;
  status: "generating" | "complete" | "error";
}

export interface DungeonMobSpritesMessage {
  type: "d_mob_sprites";
  sprites: { entityName: string; spritePng: string }[];
}

export interface DungeonMobRosterMessage {
  type: "d_mob_roster";
  mobs: {
    entityName: string;
    displayName: string;
    behavior: "melee_chase" | "ranged_pattern" | "slow_charge";
    hp: number;
    atk: number;
    def: number;
    spd: number;
    flavorText: string | null;
  }[];
}

export type DungeonServerMessage =
  | DungeonTickMessage
  | DungeonFloorMessage
  | DungeonPowerupChoicesMessage
  | DungeonResultsMessage
  | DungeonLobbyMessage
  | DungeonWelcomeMessage
  | DungeonMobProgressMessage
  | DungeonMobSpritesMessage
  | DungeonMobRosterMessage;

// ─── Snapshot types (wire format) ────────────────────────────────────────────

export interface DungeonPlayerSnapshot {
  id: string;
  name: string;
  personaSlug: string;
  x: number;
  y: number;
  facing: "left" | "right";
  hp: number;
  maxHp: number;
  iframeTicks: number;
  cooldownRemaining: number;
  activeTempPowerups: TempPowerupSnapshot[];
  /** Crundle Nervous Scramble: ticks remaining in scramble. 0 = inactive. */
  scramblingTicks: number;
  /** True when this player is dead and spectating (party still alive). */
  spectating: boolean;
}

export interface EnemySnapshot {
  id: string;
  variantName: string;
  behavior: "melee_chase" | "ranged_pattern" | "slow_charge";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  isBoss: boolean;
  telegraphing: boolean;
}

export interface ProjectileSnapshot {
  id: string;
  x: number;
  y: number;
  radius: number;
  fromEnemy: boolean;
  ownerId: string;
}

export interface AoEZoneSnapshot {
  id: string;
  x: number;
  y: number;
  radius: number;
  ticksRemaining: number;
  zoneType: string;
}

export interface RoomSnapshot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CorridorSnapshot {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

export interface PowerupChoiceSnapshot {
  id: number;
  slug: string;
  name: string;
  description: string;
  rarity: "common" | "uncommon" | "rare";
  statModifier: Record<string, number>;
}

export interface PlayerResultSnapshot {
  playerId: string;
  name: string;
  personaSlug: string;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  totalHealing: number;
  diedOnFloor: number | null;
}

export interface LobbyPlayerSnapshot {
  playerId: string;
  name: string;
  personaSlug: string | null;
  ready: boolean;
}

export interface TickEvent {
  type: "damage" | "kill" | "power_activate" | "door_open" | "pickup" | "player_death" | "boss_phase";
  payload: Record<string, unknown>;
}

// ─── Server-side game state interfaces ───────────────────────────────────────

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
  facing: "left" | "right";
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  lck: number;
  iframeTicks: number;
  cooldownTicks: number;
  cooldownMax: number;
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
}

export interface EnemyInstance {
  id: string;
  variantId: number;
  variantName: string;
  behavior: "melee_chase" | "ranged_pattern" | "slow_charge";
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
