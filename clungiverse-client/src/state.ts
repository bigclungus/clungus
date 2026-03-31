// Client-side state for the dungeon crawler

export type SceneName = 'lobby' | 'mob_preview' | 'dungeon' | 'transition' | 'results';

// === Persona Catalog ===

export type PersonaSlug = 'holden' | 'broseidon' | 'deckard_cain' | 'galactus' | 'crundle';
export type RoleType = 'tank' | 'dps' | 'support' | 'wildcard';

export interface PersonaInfo {
  slug: PersonaSlug;
  name: string;
  role: RoleType;
  color: string;
  powerName: string;
  powerDescription: string;
  baseStats: { hp: number; atk: number; def: number; spd: number; lck: number };
}

export const PERSONAS: Record<PersonaSlug, PersonaInfo> = {
  holden: {
    slug: 'holden',
    name: 'Holden',
    role: 'tank',
    color: '#e63946',
    powerName: 'Overwhelming Force',
    powerDescription: '60\u00b0 cone stun, 48px range, 1.5s stun, 8s CD',
    baseStats: { hp: 150, atk: 12, def: 10, spd: 6, lck: 4 },
  },
  broseidon: {
    slug: 'broseidon',
    name: 'Broseidon',
    role: 'dps',
    color: '#457b9d',
    powerName: 'Progressive Overload',
    powerDescription: '10s window, +2 ATK per kill, 10s CD',
    baseStats: { hp: 100, atk: 16, def: 5, spd: 10, lck: 6 },
  },
  deckard_cain: {
    slug: 'deckard_cain',
    name: 'Deckard Cain',
    role: 'support',
    color: '#e9c46a',
    powerName: 'Healing Aura',
    powerDescription: 'Heal self and allies within 80px for 25% maxHP, 12s CD',
    baseStats: { hp: 90, atk: 8, def: 6, spd: 8, lck: 10 },
  },
  galactus: {
    slug: 'galactus',
    name: 'Galactus',
    role: 'wildcard',
    color: '#7b2d8e',
    powerName: 'Consume',
    powerDescription: 'Execute <20% HP enemies in 36px, heal 15% maxHP, 6s CD',
    baseStats: { hp: 120, atk: 14, def: 7, spd: 7, lck: 8 },
  },
  crundle: {
    slug: 'crundle',
    name: 'Crundle',
    role: 'wildcard',
    color: '#8b4513',
    powerName: 'Nervous Scramble',
    powerDescription: '3x speed for 2s, 50% ATK contact damage to enemies touched, 10s CD',
    baseStats: { hp: 85, atk: 10, def: 8, spd: 4, lck: 12 },
  },
};

export const PERSONA_SLUGS: PersonaSlug[] = ['holden', 'broseidon', 'deckard_cain', 'galactus', 'crundle'];

// === Tile Constants ===

export const TILE_FLOOR = 0;
export const TILE_WALL = 1;
export const TILE_DOOR_CLOSED = 2;
export const TILE_DOOR_OPEN = 3;
export const TILE_SPAWN = 4;
export const TILE_TREASURE = 5;
export const TILE_SHRINE = 6;
export const TILE_STAIRS = 7;

// === Entity Types ===

export interface DungeonClientState {
  scene: SceneName;
  playerId: string;
  playerName: string;

  // Lobby
  lobbyId: string | null;
  lobbyPlayers: LobbyPlayerInfo[];
  isHost: boolean;
  selectedPersona: PersonaSlug | null;
  lobbyStatus: 'idle' | 'creating' | 'joining' | 'connected' | 'error';
  lobbyError: string | null;

  // Dungeon
  floor: number;
  totalFloors: number;
  tick: number;
  players: Map<string, ClientPlayer>;
  enemies: Map<string, ClientEnemy>;
  projectiles: Map<string, ClientProjectile>;
  aoeZones: Map<string, ClientAoEZone>;
  boss: ClientEnemy | null;
  tileGrid: number[] | null;
  gridWidth: number;
  gridHeight: number;
  rooms: ClientRoom[];
  visitedRooms: Set<number>;
  exploredTiles: Uint8Array;  // 0=unexplored, 1=explored-not-visible, 2=currently-visible

  // HUD
  localHp: number;
  localMaxHp: number;
  localCooldown: number;
  localCooldownMax: number;
  elapsedMs: number;
  kills: number;
  totalMobs: number;
  remainingMobs: number;

  // Transition (powerup selection)
  powerupChoices: PowerupChoice[];
  powerupTimer: number;

  // Results
  results: RunResults | null;

  // Timing / interpolation
  lastServerTick: number;
  tickTimestamp: number;
  prevTickTimestamp: number;

  // Client prediction
  pendingInputs: PendingInput[];
  inputSeq: number;

  // Mob sprites
  mobSprites: Map<string, HTMLImageElement>;
  mobGenProgress: { completed: number; total: number; current: string; status: string } | null;

  // Mob preview (shown after gen completes, before dungeon starts)
  mobRoster: MobRosterEntry[];
  mobPreviewCountdown: number; // ms remaining

  // Connection
  connected: boolean;

  // Lobby options
  skipGen: boolean;

  // Floor pickups (temp powerup drops)
  floorPickups: Map<string, ClientFloorPickup>;
  // Local player's active temp powerups
  localTempPowerups: ClientTempPowerup[];

  // Spectator mode (when local player is dead but others are alive)
  isSpectating: boolean;
  spectatorTargetId: string | null; // ID of the player being spectated
}

export interface PendingInput {
  seq: number;
  dx: number;
  dy: number;
  tick: number;
}

export interface LobbyPlayerInfo {
  playerId: string;
  name: string;
  personaSlug: PersonaSlug | null;
  ready: boolean;
  isHost: boolean;
}

export interface ClientPlayer {
  id: string;
  name: string;
  personaSlug: PersonaSlug;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  facingX: number;
  facingY: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  isLocal: boolean;
  iframeTicks: number;
  powerCooldown: number;
  powerCooldownMax: number;
  activeTempPowerups: ClientTempPowerup[];
  /** Crundle Nervous Scramble: ms timestamp until which scramble is active. 0 = inactive. */
  scramblingUntil: number;
  /** True when dead but spectating (party still alive). */
  spectating: boolean;
}

export interface ClientEnemy {
  id: string;
  type: string;
  behavior: 'melee_chase' | 'ranged_pattern' | 'slow_charge';
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  isBoss: boolean;
  telegraphing: boolean;
  aimDirX: number;
  aimDirY: number;
}

export interface ClientProjectile {
  id: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  radius: number;
  fromEnemy: boolean;
  ownerId: string;
}

export interface ClientAoEZone {
  id: string;
  x: number;
  y: number;
  radius: number;
  ticksRemaining: number;
  zoneType: string;
}

export interface ClientRoom {
  x: number;
  y: number;
  w: number;
  h: number;
  cleared: boolean;
}

export interface PowerupChoice {
  id: number;
  slug: string;
  name: string;
  description: string;
  rarity: 'common' | 'uncommon' | 'rare';
  statModifier: Record<string, number>;
}

export interface RunResults {
  outcome: 'victory' | 'death' | 'abandoned';
  floorReached: number;
  totalFloors: number;
  durationMs: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  players: RunPlayerResult[];
}

export interface RunPlayerResult {
  playerId: string;
  name: string;
  personaSlug: PersonaSlug;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  totalHealing: number;
  diedOnFloor: number | null;
}

export interface MobRosterEntry {
  entityName: string;
  displayName: string;
  behavior: 'melee_chase' | 'ranged_pattern' | 'slow_charge';
  hp: number;
  atk: number;
  def: number;
  spd: number;
  flavorText: string | null;
}

export interface TickEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface ClientTempPowerup {
  templateId: string;
  expiresAt: number; // ms timestamp
}

export interface ClientFloorPickup {
  id: string;
  templateId: string;
  type: 'temp_powerup' | 'health';
  healAmount?: number;
  x: number;
  y: number;
}

// Temp powerup display metadata (matches server TEMP_POWERUP_TEMPLATES)
export const TEMP_POWERUP_META: Record<string, { name: string; emoji: string; color: string }> = {
  berserker:    { name: "Berserker",    emoji: "🔥", color: "#ff4400" },
  shield:       { name: "Iron Skin",    emoji: "🛡️", color: "#4488ff" },
  haste:        { name: "Haste",        emoji: "⚡", color: "#ffee00" },
  lifesteal:    { name: "Lifesteal",    emoji: "💚", color: "#44cc44" },
  glass_cannon: { name: "Glass Cannon", emoji: "💥", color: "#ff88ff" },
};

// Duration (ms) for each temp powerup — co-located with TEMP_POWERUP_META so both
// stay in sync when templates are added or removed.
export const TEMP_POWERUP_MAX_DURATIONS: Record<string, number> = {
  berserker: 20000,
  shield: 15000,
  haste: 10000,
  lifesteal: 25000,
  glass_cannon: 12000,
};

export function createInitialState(): DungeonClientState {
  return {
    scene: 'lobby',
    playerId: '',
    playerName: '',
    lobbyId: null,
    lobbyPlayers: [],
    isHost: false,
    selectedPersona: null,
    lobbyStatus: 'idle',
    lobbyError: null,
    floor: 0,
    totalFloors: 3,
    tick: 0,
    players: new Map(),
    enemies: new Map(),
    projectiles: new Map(),
    aoeZones: new Map(),
    boss: null,
    tileGrid: null,
    gridWidth: 0,
    gridHeight: 0,
    rooms: [],
    visitedRooms: new Set(),
    exploredTiles: new Uint8Array(0),
    localHp: 0,
    localMaxHp: 0,
    localCooldown: 0,
    localCooldownMax: 0,
    elapsedMs: 0,
    kills: 0,
    totalMobs: 0,
    remainingMobs: 0,
    powerupChoices: [],
    powerupTimer: 15000,
    results: null,
    lastServerTick: 0,
    tickTimestamp: 0,
    prevTickTimestamp: 0,
    pendingInputs: [],
    inputSeq: 0,
    mobSprites: new Map(),
    mobGenProgress: null,
    mobRoster: [],
    mobPreviewCountdown: 10000,
    connected: false,
    skipGen: true,
    floorPickups: new Map(),
    localTempPowerups: [],
    isSpectating: false,
    spectatorTargetId: null,
  };
}
