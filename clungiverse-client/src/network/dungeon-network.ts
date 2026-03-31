// Clungiverse Dungeon Network Client
// WebSocket connection to /dungeon-ws on commons-server

import type {
  DungeonClientState,
  ClientPlayer,
  ClientEnemy,
  ClientProjectile,
  ClientAoEZone,
  ClientTempPowerup,
  ClientFloorPickup,
  PowerupChoice,
  MobRosterEntry,
  PersonaSlug,
  TickEvent,
} from '../state';

// === Server Message Shapes (must match server's wire format exactly) ===

// Server sends DungeonPlayerSnapshot from dungeon-loop.ts buildPlayerSnapshots
interface ServerPlayerSnapshot {
  id: string;
  name: string;
  personaSlug: string;
  x: number;
  y: number;
  facing: 'left' | 'right'; // server uses "left"/"right", not facingX/facingY
  hp: number;
  maxHp: number;
  iframeTicks: number;
  cooldownRemaining: number; // server field name for cooldown ticks left
  scramblingTicks?: number;
  activeTempPowerups?: Array<{ templateId: string; expiresAt: number }>;
  spectating?: boolean; // dead but party still alive
}

// Server sends EnemySnapshot from dungeon-loop.ts buildEnemySnapshots
interface ServerEnemySnapshot {
  id: string;
  variantName: string;
  behavior: 'melee_chase' | 'ranged_pattern' | 'slow_charge';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  isBoss: boolean;
  telegraphing: boolean;
}

// Server sends ProjectileSnapshot
interface ServerProjectileSnapshot {
  id: string;
  x: number;
  y: number;
  radius: number;
  fromEnemy: boolean;
  ownerId: string;
}

// Server sends AoEZoneSnapshot
interface ServerAoEZoneSnapshot {
  id: string;
  x: number;
  y: number;
  radius: number;
  ticksRemaining: number;
  zoneType: string;
}

interface ServerFloorPickupSnapshot {
  id: string;
  templateId: string;
  type?: 'temp_powerup' | 'health';
  healAmount?: number;
  x: number;
  y: number;
}

interface ServerTickMsg {
  type: 'd_tick';
  tick: number;
  t: number;
  players: ServerPlayerSnapshot[];
  enemies: ServerEnemySnapshot[];
  projectiles: ServerProjectileSnapshot[];
  aoeZones: ServerAoEZoneSnapshot[];
  events: TickEvent[];
  totalMobs?: number;
  remainingMobs?: number;
  floorPickups?: ServerFloorPickupSnapshot[];
}

interface ServerFloorMsg {
  type: 'd_floor';
  floor: number;
  gridWidth: number;
  gridHeight: number;
  tiles: number[];
  rooms: { x: number; y: number; w: number; h: number }[];
  corridors: { x1: number; y1: number; x2: number; y2: number; width: number }[];
}

interface ServerWelcomeMsg {
  type: 'd_welcome';
  playerId: string;
  lobbyId: string;
}

interface ServerLobbyMsg {
  type: 'd_lobby';
  lobbyId: string;
  hostId: string;
  players: { playerId: string; name: string; personaSlug: string | null; ready: boolean }[];
  status: 'waiting' | 'starting' | 'in_progress';
}

interface ServerPowerupMsg {
  type: 'd_powerup_choices';
  choices: PowerupChoice[];
}

interface ServerResultsMsg {
  type: 'd_results';
  outcome: 'victory' | 'death' | 'abandoned';
  floorReached: number;
  durationMs: number;
  players: { playerId: string; name: string; personaSlug: string; kills: number; damageDealt: number; damageTaken: number; totalHealing: number; diedOnFloor: number | null }[];
}

interface ServerMobProgressMsg {
  type: 'd_mob_progress';
  completed: number;
  total: number;
  currentEntity: string;
  status: 'generating' | 'complete' | 'error';
}

interface ServerMobSpritesMsg {
  type: 'd_mob_sprites';
  sprites: Array<{ entityName: string; spritePng: string }>;
}

interface ServerMobRosterMsg {
  type: 'd_mob_roster';
  mobs: Array<{
    entityName: string;
    displayName: string;
    behavior: 'melee_chase' | 'ranged_pattern' | 'slow_charge';
    hp: number;
    atk: number;
    def: number;
    spd: number;
    flavorText: string | null;
  }>;
}

interface ServerErrorMsg {
  type: 'd_error';
  message: string;
}

type ServerMessage =
  | ServerTickMsg
  | ServerFloorMsg
  | ServerWelcomeMsg
  | ServerLobbyMsg
  | ServerPowerupMsg
  | ServerResultsMsg
  | ServerMobProgressMsg
  | ServerMobSpritesMsg
  | ServerMobRosterMsg
  | ServerErrorMsg;

// === Event Emitter ===

type Handler = (data: unknown) => void;

class Emitter {
  private map: Map<string, Handler[]> = new Map();

  on(event: string, fn: Handler): void {
    const arr = this.map.get(event) ?? [];
    arr.push(fn);
    this.map.set(event, arr);
  }

  off(event: string, fn: Handler): void {
    const arr = this.map.get(event);
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i !== -1) arr.splice(i, 1);
  }

  emit(event: string, data: unknown): void {
    const arr = this.map.get(event);
    if (!arr) return;
    for (const fn of arr) fn(data);
  }
}

// === Network Class ===

const INITIAL_DELAY = 500;
const MAX_DELAY = 10000;
const BACKOFF = 1.5;

export class DungeonNetwork extends Emitter {
  private ws: WebSocket | null = null;
  private url: string = '';
  private delay: number = INITIAL_DELAY;
  private timer: number | null = null;
  private closing: boolean = false;
  private gameState: DungeonClientState;
  private runStartTime: number = 0;

  constructor(state: DungeonClientState) {
    super();
    this.gameState = state;
  }

  connect(lobbyId: string, userId: string, name: string): void {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${proto}//${location.host}/dungeon-ws?lobbyId=${encodeURIComponent(lobbyId)}&userId=${encodeURIComponent(userId)}&name=${encodeURIComponent(name)}`;
    this.closing = false;
    this.doConnect();
  }

  disconnect(): void {
    this.closing = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.gameState.connected = false;
  }

  private doConnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.gameState.connected = true;
      this.delay = INITIAL_DELAY;
      this.emit('connected', null);
    };

    ws.onclose = () => {
      this.gameState.connected = false;
      this.ws = null;
      this.emit('disconnected', null);
      if (!this.closing) this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires after onerror
    };

    ws.onmessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (typeof data === 'string') {
        this.handleRaw(data);
      } else if (data instanceof Blob) {
        data.text().then((text) => this.handleRaw(text));
      } else if (data instanceof ArrayBuffer) {
        this.handleRaw(new TextDecoder().decode(data));
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.doConnect();
    }, this.delay);
    this.delay = Math.min(this.delay * BACKOFF, MAX_DELAY);
  }

  private handleRaw(raw: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      console.error('[net] bad json:', raw);
      return;
    }

    switch (msg.type) {
      case 'd_tick': this.onTick(msg as ServerTickMsg); break;
      case 'd_floor': this.onFloor(msg as ServerFloorMsg); break;
      case 'd_welcome': this.onWelcome(msg as ServerWelcomeMsg); break;
      case 'd_lobby': this.onLobby(msg as ServerLobbyMsg); break;
      case 'd_powerup_choices': this.onPowerup(msg as ServerPowerupMsg); break;
      case 'd_results': this.onResults(msg as ServerResultsMsg); break;
      case 'd_mob_progress': this.onMobProgress(msg as ServerMobProgressMsg); break;
      case 'd_mob_sprites': this.onMobSprites(msg as ServerMobSpritesMsg); break;
      case 'd_mob_roster': this.onMobRoster(msg as ServerMobRosterMsg); break;
      case 'd_error':
        console.error('[net] server error:', (msg as ServerErrorMsg).message);
        this.emit('error', (msg as ServerErrorMsg).message);
        break;
    }

    this.emit(msg.type, msg);
  }

  private onTick(msg: ServerTickMsg): void {
    const s = this.gameState;
    s.prevTickTimestamp = s.tickTimestamp;
    s.tickTimestamp = performance.now();
    s.lastServerTick = msg.tick;
    s.tick = msg.tick;

    // Players: convert server snapshot to ClientPlayer format
    const seenPlayers = new Set<string>();
    for (const sp of msg.players) {
      seenPlayers.add(sp.id);
      const old = s.players.get(sp.id);
      const isLocal = sp.id === s.playerId;

      // Convert server "left"/"right" facing to facingX/facingY
      const facingX = sp.facing === 'left' ? -1 : 1;
      const facingY = 0;

      const tempPowerups: ClientTempPowerup[] = (sp.activeTempPowerups ?? []).map((a) => ({
        templateId: a.templateId,
        expiresAt: a.expiresAt,
      }));

      const TICK_MS = 62.5;
      const scramblingUntil = (sp.scramblingTicks ?? 0) > 0
        ? Date.now() + (sp.scramblingTicks ?? 0) * TICK_MS
        : (old ? old.scramblingUntil : 0);

      if (isLocal && old) {
        // Client-authoritative: keep local position, only update non-position fields
        old.hp = sp.hp;
        old.maxHp = sp.maxHp;
        old.alive = sp.hp > 0;
        old.spectating = sp.spectating ?? false;
        old.iframeTicks = sp.iframeTicks;
        old.powerCooldown = sp.cooldownRemaining;
        old.name = sp.name;
        old.personaSlug = sp.personaSlug as PersonaSlug;
        old.activeTempPowerups = tempPowerups;
        // Only update scramblingUntil from server if it's currently active
        if ((sp.scramblingTicks ?? 0) > 0) {
          old.scramblingUntil = scramblingUntil;
        }
      } else {
        const cp: ClientPlayer = {
          id: sp.id,
          name: sp.name,
          personaSlug: sp.personaSlug as PersonaSlug,
          x: sp.x,
          y: sp.y,
          prevX: old ? old.x : sp.x,
          prevY: old ? old.y : sp.y,
          facingX: old ? old.facingX : facingX,
          facingY: old ? old.facingY : facingY,
          hp: sp.hp,
          maxHp: sp.maxHp,
          alive: sp.hp > 0,
          isLocal,
          iframeTicks: sp.iframeTicks,
          powerCooldown: sp.cooldownRemaining,
          powerCooldownMax: old ? old.powerCooldownMax : 128,
          activeTempPowerups: tempPowerups,
          scramblingUntil,
          spectating: sp.spectating ?? false,
        };
        s.players.set(sp.id, cp);
      }

      if (isLocal) {
        s.localHp = sp.hp;
        s.localMaxHp = sp.maxHp;
        s.localCooldown = sp.cooldownRemaining;
        s.localTempPowerups = tempPowerups;
        const localPlayer = s.players.get(sp.id);
        s.localCooldownMax = localPlayer ? localPlayer.powerCooldownMax : 128;
      }
    }
    for (const id of s.players.keys()) {
      if (!seenPlayers.has(id)) s.players.delete(id);
    }

    // Update spectator state based on current local player status
    const localPlayer = s.players.get(s.playerId);
    const wasSpectating = s.isSpectating;
    s.isSpectating = (localPlayer?.spectating ?? false);

    if (s.isSpectating) {
      // Pick or validate spectator target: must be an alive (non-spectating) player
      const aliveOthers = Array.from(s.players.values()).filter(
        (p) => !p.isLocal && p.alive && !p.spectating
      );
      if (aliveOthers.length === 0) {
        s.spectatorTargetId = null;
      } else if (
        s.spectatorTargetId === null ||
        !aliveOthers.some((p) => p.id === s.spectatorTargetId)
      ) {
        // Auto-pick first alive player if current target is gone or unset
        s.spectatorTargetId = aliveOthers[0].id;
      }
    } else {
      // If we stopped spectating (revived), clear spectator state
      if (wasSpectating) {
        s.spectatorTargetId = null;
      }
    }

    // Enemies: convert server snapshot to ClientEnemy format
    const seenEnemies = new Set<string>();
    for (const se of msg.enemies) {
      seenEnemies.add(se.id);
      const old = s.enemies.get(se.id);

      const ce: ClientEnemy = {
        id: se.id,
        type: se.variantName,
        behavior: se.behavior,
        x: se.x,
        y: se.y,
        prevX: old ? old.x : se.x,
        prevY: old ? old.y : se.y,
        hp: se.hp,
        maxHp: se.maxHp,
        alive: se.hp > 0,
        isBoss: se.isBoss,
        telegraphing: se.telegraphing,
        aimDirX: 0,
        aimDirY: 0,
      };

      s.enemies.set(se.id, ce);

      // Track boss separately
      if (se.isBoss) {
        if (s.boss) {
          ce.prevX = s.boss.x;
          ce.prevY = s.boss.y;
        }
        s.boss = ce;
      }
    }
    // Remove enemies no longer in snapshot
    for (const id of s.enemies.keys()) {
      if (!seenEnemies.has(id)) s.enemies.delete(id);
    }
    // Clear boss if not present in snapshot
    if (s.boss && !seenEnemies.has(s.boss.id)) {
      s.boss = null;
    }

    // Projectiles: convert server snapshot to ClientProjectile format
    const seenProj = new Set<string>();
    for (const sp of msg.projectiles) {
      seenProj.add(sp.id);
      const old = s.projectiles.get(sp.id);

      const cp: ClientProjectile = {
        id: sp.id,
        x: sp.x,
        y: sp.y,
        prevX: old ? old.x : sp.x,
        prevY: old ? old.y : sp.y,
        radius: sp.radius,
        fromEnemy: sp.fromEnemy,
        ownerId: sp.ownerId,
      };

      s.projectiles.set(sp.id, cp);
    }
    for (const id of s.projectiles.keys()) {
      if (!seenProj.has(id)) s.projectiles.delete(id);
    }

    // AoE zones
    s.aoeZones.clear();
    for (const sz of msg.aoeZones) {
      s.aoeZones.set(sz.id, {
        id: sz.id,
        x: sz.x,
        y: sz.y,
        radius: sz.radius,
        ticksRemaining: sz.ticksRemaining,
        zoneType: sz.zoneType,
      });
    }

    // Mob counts from server (pre-placed enemies only, excludes boss spawns)
    if (msg.totalMobs !== undefined) s.totalMobs = msg.totalMobs;
    if (msg.remainingMobs !== undefined) s.remainingMobs = msg.remainingMobs;

    // Floor pickups (temp powerup drops + health hearts)
    s.floorPickups.clear();
    if (msg.floorPickups) {
      for (const fp of msg.floorPickups) {
        const pickup: ClientFloorPickup = {
          id: fp.id,
          templateId: fp.templateId,
          type: fp.type ?? 'temp_powerup',
          healAmount: fp.healAmount,
          x: fp.x,
          y: fp.y,
        };
        s.floorPickups.set(fp.id, pickup);
      }
    }

    // Elapsed time: derive from server timestamp
    if (this.runStartTime === 0) {
      this.runStartTime = msg.t;
    }
    s.elapsedMs = msg.t - this.runStartTime;

    // Tick events (kills are tracked client-side from kill events)
    for (const ev of msg.events) {
      // Track kills from events
      if (ev.type === 'kill') {
        s.kills++;
      }
      this.emit('tick_event', ev);
    }
  }

  private onFloor(msg: ServerFloorMsg): void {
    const s = this.gameState;
    s.mobGenProgress = null; // clear loading overlay when floor data arrives
    s.tileGrid = msg.tiles;
    s.gridWidth = msg.gridWidth;
    s.gridHeight = msg.gridHeight;
    s.rooms = msg.rooms.map((r) => ({
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      cleared: false, // rooms start uncleared; door_open events mark them
    }));
    // Start room (index 0) is always visited; fog of war hides the rest
    s.visitedRooms = new Set([0]);
    // Radius-based fog: allocate explored tile grid (all unexplored)
    s.exploredTiles = new Uint8Array(msg.gridWidth * msg.gridHeight);
    s.floor = msg.floor;
    s.totalFloors = 3; // hardcoded to match server's TOTAL_FLOORS
    // If mob_preview is active, floor data is buffered — scene transition happens
    // when the countdown finishes or skip is pressed. Otherwise switch immediately.
    if (s.scene !== 'mob_preview') {
      s.scene = 'dungeon';
    }
    s.enemies.clear();
    s.projectiles.clear();
    s.aoeZones.clear();
    s.floorPickups.clear();
    // Clear player records so the next d_tick sets position from the server's
    // authoritative spawn coordinates. Without this, the client-authoritative
    // override (isLocal && old) keeps the player at the previous floor's position,
    // which is inside a wall on the new floor layout.
    s.players.clear();
    s.localTempPowerups = [];
    s.boss = null;
    s.kills = 0;
    this.runStartTime = 0; // reset timer for new floor
    // Revived players are no longer spectating on the new floor
    s.isSpectating = false;
    s.spectatorTargetId = null;
  }

  private onWelcome(msg: ServerWelcomeMsg): void {
    const s = this.gameState;
    s.playerId = msg.playerId;
    s.lobbyId = msg.lobbyId;
    console.log('[net] Welcome: playerId =', msg.playerId, 'lobbyId =', msg.lobbyId);
  }

  private onPowerup(msg: ServerPowerupMsg): void {
    const s = this.gameState;
    s.powerupChoices = msg.choices;
    s.powerupTimer = 15000; // default timer
    s.scene = 'transition';
  }

  private onResults(msg: ServerResultsMsg): void {
    const s = this.gameState;
    // Convert server format to client RunResults
    // Aggregate totals from per-player data
    let totalKills = 0;
    let totalDmgDealt = 0;
    let totalDmgTaken = 0;
    for (const p of msg.players) {
      totalKills += p.kills;
      totalDmgDealt += p.damageDealt;
      totalDmgTaken += p.damageTaken;
    }

    s.results = {
      outcome: msg.outcome,
      floorReached: msg.floorReached,
      totalFloors: s.totalFloors,
      durationMs: msg.durationMs,
      kills: totalKills,
      damageDealt: totalDmgDealt,
      damageTaken: totalDmgTaken,
      players: msg.players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        personaSlug: p.personaSlug as PersonaSlug,
        kills: p.kills,
        damageDealt: p.damageDealt,
        damageTaken: p.damageTaken,
        totalHealing: p.totalHealing ?? 0,
        diedOnFloor: p.diedOnFloor,
      })),
    };
    s.scene = 'results';
  }

  private onLobby(msg: ServerLobbyMsg): void {
    const s = this.gameState;
    s.lobbyId = msg.lobbyId;
    s.lobbyPlayers = msg.players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      personaSlug: (p.personaSlug ?? null) as PersonaSlug | null,
      ready: p.ready,
      isHost: p.playerId === msg.hostId,
    }));
    s.isHost = s.playerId === msg.hostId;
    s.scene = 'lobby';
  }

  private onMobProgress(msg: ServerMobProgressMsg): void {
    const s = this.gameState;
    s.mobGenProgress = {
      completed: msg.completed,
      total: msg.total,
      current: msg.currentEntity,
      status: msg.status,
    };
  }

  private onMobSprites(msg: ServerMobSpritesMsg): void {
    const s = this.gameState;
    for (const sprite of msg.sprites) {
      const img = new Image();
      img.src = `data:image/png;base64,${sprite.spritePng}`;
      s.mobSprites.set(sprite.entityName, img);
    }
  }

  private onMobRoster(msg: ServerMobRosterMsg): void {
    const s = this.gameState;
    s.mobRoster = msg.mobs as MobRosterEntry[];
    s.mobPreviewCountdown = 10000;
    s.scene = 'mob_preview';
  }

  // === Send Helpers ===

  private send(data: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendMove(x: number, y: number, facingX: number, _facingY: number, seq: number): void {
    // Client-authoritative: send absolute position to server
    const facing = facingX < 0 ? 'left' : 'right';
    this.send({ type: 'd_move', seq, x, y, facing });
  }

  sendAttack(): void {
    this.send({ type: 'd_attack' });
  }

  sendPower(): void {
    this.send({ type: 'd_power' });
  }

  sendReady(persona: PersonaSlug): void {
    this.send({ type: 'd_ready', personaSlug: persona });
  }

  sendStart(skipGen?: boolean): void {
    this.send({ type: 'd_start', skipGen: skipGen ?? false });
  }

  sendPickPowerup(powerupId: number): void {
    this.send({ type: 'd_pick_powerup', powerupId });
  }
}
