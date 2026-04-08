// Clungiverse Dungeon Network Client
// WebSocket connection to /dungeon-ws on commons-server

import type {
  DungeonClientState,
  ClientPlayer,
  ClientEnemy,
  ClientProjectile,
  ClientTempPowerup,
  ClientFloorPickup,
  PowerupChoice,
  MobRosterEntry,
  PersonaSlug,
  TickEvent,
  RoomTheme,
} from '../state';

import type {
  DungeonPlayerSnapshot,
  EnemySnapshot,
  ProjectileSnapshot,
  AoEZoneSnapshot,
  FloorPickupSnapshot,
  DungeonTickMessage,
  DungeonFloorMessage,
  DungeonWelcomeMessage,
  DungeonLobbyMessage,
  DungeonPowerupChoicesMessage,
  DungeonResultsMessage,
  DungeonMobProgressMessage,
  DungeonMobSpritesMessage,
  DungeonMobRosterMessage,
} from '@clungiverse/shared';

// Type aliases to keep internal code compatible
type ServerPlayerSnapshot = DungeonPlayerSnapshot;
type ServerEnemySnapshot = EnemySnapshot;
type ServerProjectileSnapshot = ProjectileSnapshot;
type ServerAoEZoneSnapshot = AoEZoneSnapshot;
type ServerFloorPickupSnapshot = FloorPickupSnapshot;
type ServerTickMsg = DungeonTickMessage;
type ServerFloorMsg = DungeonFloorMessage;
type ServerWelcomeMsg = DungeonWelcomeMessage;
type ServerLobbyMsg = DungeonLobbyMessage;
type ServerPowerupMsg = DungeonPowerupChoicesMessage;
type ServerResultsMsg = DungeonResultsMessage;
type ServerMobProgressMsg = DungeonMobProgressMessage;
type ServerMobSpritesMsg = DungeonMobSpritesMessage;
type ServerMobRosterMsg = DungeonMobRosterMessage;

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
  private map = new Map<string, Handler[]>();

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

// === Room Theme Derivation ===
// Server assigns room types (start/combat/treasure/rest/boss) but doesn't
// send them to the client. We derive them deterministically using the same
// rules: room 0 = start, last room on boss floors = boss, others by hash.

function deriveRoomTheme(index: number, totalRooms: number, floor: number, rx: number, ry: number): RoomTheme {
  if (index === 0) return 'start';
  // Last room on floor 3 (final floor) is the boss room
  if (index === totalRooms - 1 && floor >= 3) return 'boss';
  // Deterministic assignment for other rooms based on position hash
  const h = ((rx * 7 + ry * 13 + index * 31) >>> 0) % 10;
  if (h < 2) return 'treasure';  // 20%
  if (h < 4) return 'rest';      // 20%
  return 'combat';               // 60%
}

// === Network Class ===

const INITIAL_DELAY = 500;
const MAX_DELAY = 10000;
const BACKOFF = 1.5;

export class DungeonNetwork extends Emitter {
  private ws: WebSocket | null = null;
  private url = '';
  private delay: number = INITIAL_DELAY;
  private timer: number | null = null;
  private closing = false;
  private gameState: DungeonClientState;
  private runStartTime = 0;

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

    ws.onmessage = (ev: MessageEvent<string | Blob | ArrayBuffer>) => {
      const data = ev.data;
      if (typeof data === 'string') {
        this.handleRaw(data);
      } else if (data instanceof Blob) {
        data.text().then((text) => { this.handleRaw(text); }).catch((err: unknown) => { throw err instanceof Error ? err : new Error(String(err)); });
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
      // eslint-disable-next-line no-console
      console.error('[net] bad json:', raw);
      return;
    }

    this.dispatchMessage(msg);
    this.emit(msg.type, msg);
  }

  private dispatchFlowMessage(msg: ServerMessage): boolean {
    switch (msg.type) {
      case 'd_tick': this.onTick(msg); return true;
      case 'd_floor': this.onFloor(msg); return true;
      case 'd_welcome': this.onWelcome(msg); return true;
      case 'd_lobby': this.onLobby(msg); return true;
      case 'd_powerup_choices': this.onPowerup(msg); return true;
      default: return false;
    }
  }

  private dispatchMetaMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'd_results': this.onResults(msg); break;
      case 'd_mob_progress': this.onMobProgress(msg); break;
      case 'd_mob_sprites': this.onMobSprites(msg); break;
      case 'd_mob_roster': this.onMobRoster(msg); break;
      case 'd_error':
        // eslint-disable-next-line no-console
        console.error('[net] server error:', (msg).message);
        this.emit('error', (msg).message);
        break;
    }
  }

  private dispatchMessage(msg: ServerMessage): void {
    if (!this.dispatchFlowMessage(msg)) {
      this.dispatchMetaMessage(msg);
    }
  }

  private updateLocalPlayerFromSnapshot(
    s: typeof this.gameState,
    sp: ServerPlayerSnapshot,
    old: ClientPlayer,
    tempPowerups: ClientTempPowerup[],
    scramblingUntil: number,
  ): void {
    old.hp = sp.hp;
    old.maxHp = sp.maxHp;
    old.alive = sp.hp > 0;
    old.spectating = sp.spectating ?? false;
    old.iframeTicks = sp.iframeTicks;
    old.powerCooldown = sp.cooldownRemaining;
    old.spinCooldown = sp.spinCooldownRemaining ?? 0;
    old.name = sp.name;
    old.personaSlug = sp.personaSlug as PersonaSlug;
    old.activeTempPowerups = tempPowerups;
    if ((sp.scramblingTicks ?? 0) > 0) {
      old.scramblingUntil = scramblingUntil;
    }
    s.localHp = sp.hp;
    s.localMaxHp = sp.maxHp;
    s.localCooldown = sp.cooldownRemaining;
    s.localSpinCooldown = sp.spinCooldownRemaining ?? 0;
    s.localTempPowerups = tempPowerups;
    s.localCooldownMax = old.powerCooldownMax;
  }

  private upsertRemotePlayerFromSnapshot(
    s: typeof this.gameState,
    sp: ServerPlayerSnapshot,
    old: ClientPlayer | undefined,
    tempPowerups: ClientTempPowerup[],
    scramblingUntil: number,
    isLocal: boolean,
  ): void {
    const facingX = sp.facing === 'left' ? -1 : 1;
    const cp: ClientPlayer = {
      id: sp.id,
      name: sp.name,
      personaSlug: sp.personaSlug as PersonaSlug,
      x: sp.x,
      y: sp.y,
      prevX: old ? old.x : sp.x,
      prevY: old ? old.y : sp.y,
      facingX: old ? old.facingX : facingX,
      facingY: old ? old.facingY : 0,
      hp: sp.hp,
      maxHp: sp.maxHp,
      alive: sp.hp > 0,
      isLocal,
      iframeTicks: sp.iframeTicks,
      powerCooldown: sp.cooldownRemaining,
      powerCooldownMax: old ? old.powerCooldownMax : 128,
      activeTempPowerups: tempPowerups,
      scramblingUntil,
      sprintingUntil: old ? old.sprintingUntil : 0,
      sprintCooldownUntil: old ? old.sprintCooldownUntil : 0,
      spinCooldown: old ? old.spinCooldown : 0,
      spectating: sp.spectating ?? false,
    };
    s.players.set(sp.id, cp);
  }

  private buildTempPowerups(sp: ServerTickMsg['players'][number]): ClientTempPowerup[] {
    return (sp.activeTempPowerups ?? []).map((a) => ({
      templateId: a.templateId,
      expiresAt: a.expiresAt,
    }));
  }

  private computeScramblingUntil(sp: ServerTickMsg['players'][number], old: ClientPlayer | undefined): number {
    const TICK_MS = 62.5;
    const ticks = sp.scramblingTicks ?? 0;
    if (ticks > 0) return Date.now() + ticks * TICK_MS;
    return old ? old.scramblingUntil : 0;
  }

  private upsertPlayerFromSnapshot(
    s: typeof this.gameState,
    sp: ServerTickMsg['players'][number],
  ): void {
    const old = s.players.get(sp.id);
    const isLocal = sp.id === s.playerId;
    const tempPowerups = this.buildTempPowerups(sp);
    const scramblingUntil = this.computeScramblingUntil(sp, old);
    if (isLocal && old) {
      this.updateLocalPlayerFromSnapshot(s, sp, old, tempPowerups, scramblingUntil);
    } else {
      this.upsertRemotePlayerFromSnapshot(s, sp, old, tempPowerups, scramblingUntil, isLocal);
    }
  }

  private updateTickPlayers(s: typeof this.gameState, msg: ServerTickMsg): void {
    const seenPlayers = new Set<string>();
    for (const sp of msg.players) {
      seenPlayers.add(sp.id);
      this.upsertPlayerFromSnapshot(s, sp);
    }
    for (const id of s.players.keys()) {
      if (!seenPlayers.has(id)) s.players.delete(id);
    }
  }

  private updateTickSpectator(s: typeof this.gameState): void {
    const localPlayer = s.players.get(s.playerId);
    const wasSpectating = s.isSpectating;
    s.isSpectating = (localPlayer?.spectating ?? false);

    if (s.isSpectating) {
      const aliveOthers = Array.from(s.players.values()).filter(
        (p) => !p.isLocal && p.alive && !p.spectating
      );
      if (aliveOthers.length === 0) {
        s.spectatorTargetId = null;
      } else if (
        s.spectatorTargetId === null ||
        !aliveOthers.some((p) => p.id === s.spectatorTargetId)
      ) {
        s.spectatorTargetId = aliveOthers[0].id;
      }
    } else if (wasSpectating) {
      s.spectatorTargetId = null;
    }
  }

  private upsertEnemyFromSnapshot(
    s: typeof this.gameState,
    se: ServerTickMsg['enemies'][number],
  ): void {
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
    if (se.isBoss) {
      if (s.boss) {
        ce.prevX = s.boss.x;
        ce.prevY = s.boss.y;
      }
      s.boss = ce;
    }
  }

  private updateTickEnemies(s: typeof this.gameState, msg: ServerTickMsg): void {
    const seenEnemies = new Set<string>();
    for (const se of msg.enemies) {
      seenEnemies.add(se.id);
      this.upsertEnemyFromSnapshot(s, se);
    }
    for (const id of s.enemies.keys()) {
      if (!seenEnemies.has(id)) s.enemies.delete(id);
    }
    if (s.boss && !seenEnemies.has(s.boss.id)) {
      s.boss = null;
    }
  }

  private updateTickProjectiles(s: typeof this.gameState, msg: ServerTickMsg): void {
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
  }

  private updateTickPickups(s: typeof this.gameState, msg: ServerTickMsg): void {
    s.floorPickups.clear();
    if (!msg.floorPickups) return;
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

  private onTick(msg: ServerTickMsg): void {
    const s = this.gameState;
    s.prevTickTimestamp = s.tickTimestamp;
    s.tickTimestamp = performance.now();
    s.lastServerTick = msg.tick;
    s.tick = msg.tick;

    this.updateTickPlayers(s, msg);
    this.updateTickSpectator(s);
    this.updateTickEnemies(s, msg);
    this.updateTickProjectiles(s, msg);

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

    this.updateTickPickups(s, msg);

    // Elapsed time: derive from server timestamp
    if (this.runStartTime === 0) {
      this.runStartTime = msg.t;
    }
    s.elapsedMs = msg.t - this.runStartTime;

    // Tick events (kills are tracked client-side from kill events)
    for (const ev of msg.events) {
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
    s.rooms = msg.rooms.map((r, i) => ({
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      cleared: false, // rooms start uncleared; door_open events mark them
      theme: deriveRoomTheme(i, msg.rooms.length, msg.floor, r.x, r.y),
      shape: (r.shape as import('../state').RoomShape) ?? 'rect',
      tileSet: r.tileSet,
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
    // eslint-disable-next-line no-console
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
        totalHealing: p.totalHealing,
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
    if (this.ws?.readyState === WebSocket.OPEN) {
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

  sendSpin(): void {
    this.send({ type: 'd_spin' });
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
