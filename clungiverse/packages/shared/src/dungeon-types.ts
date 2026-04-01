// Clungiverse Dungeon Protocol — shared client/server message types and wire format interfaces

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

// ─── Behavior type ──────────────────────────────────────────────────────────

export type MobBehavior = "melee_chase" | "ranged_pattern" | "slow_charge";

// ─── Room shape type ────────────────────────────────────────────────────────

export type RoomShape = "rect" | "L" | "circle" | "cross" | "cave";

// ─── Rarity type ────────────────────────────────────────────────────────────

export type Rarity = "common" | "uncommon" | "rare";

// ─── Facing type ────────────────────────────────────────────────────────────

export type Facing = "left" | "right";

// ─── Pickup type ────────────────────────────────────────────────────────────

export type PickupType = "temp_powerup" | "health";

// ─── Run outcome type ───────────────────────────────────────────────────────

export type RunOutcome = "victory" | "death" | "abandoned";

// ─── Lobby status type ──────────────────────────────────────────────────────

export type LobbyStatus = "waiting" | "starting" | "in_progress";

// ─── Mob generation status type ─────────────────────────────────────────────

export type MobGenStatus = "generating" | "complete" | "error";

// ─── Client → Server messages ────────────────────────────────────────────────

export interface DungeonMoveMessage {
  type: "d_move";
  seq: number;
  x: number;
  y: number;
  facing: Facing;
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
  type: PickupType;
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
  outcome: RunOutcome;
  floorReached: number;
  durationMs: number;
  players: PlayerResultSnapshot[];
}

export interface DungeonLobbyMessage {
  type: "d_lobby";
  lobbyId: string;
  hostId: string;
  players: LobbyPlayerSnapshot[];
  status: LobbyStatus;
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
  status: MobGenStatus;
}

export interface DungeonMobSpritesMessage {
  type: "d_mob_sprites";
  sprites: { entityName: string; spritePng: string }[];
}

export interface DungeonMobRosterMessage {
  type: "d_mob_roster";
  mobs: MobRosterSnapshot[];
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
  facing: Facing;
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
  behavior: MobBehavior;
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
  shape?: RoomShape;
  tileSet?: { x: number; y: number }[];
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
  rarity: Rarity;
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

export interface MobRosterSnapshot {
  entityName: string;
  displayName: string;
  behavior: MobBehavior;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  flavorText: string | null;
}

export interface TickEvent {
  type: "damage" | "kill" | "power_activate" | "door_open" | "pickup" | "player_death" | "boss_phase";
  payload: Record<string, unknown>;
}
