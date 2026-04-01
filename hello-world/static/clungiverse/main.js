// src/state.ts
var PERSONAS = {
  holden: {
    slug: "holden",
    name: "Holden",
    role: "tank",
    color: "#e63946",
    powerName: "Overwhelming Force",
    powerDescription: "60° cone stun, 48px range, 1.5s stun, 8s CD",
    baseStats: { hp: 150, atk: 12, def: 10, spd: 6, lck: 4 }
  },
  broseidon: {
    slug: "broseidon",
    name: "Broseidon",
    role: "dps",
    color: "#457b9d",
    powerName: "Progressive Overload",
    powerDescription: "10s window, +2 ATK per kill, 10s CD",
    baseStats: { hp: 100, atk: 16, def: 5, spd: 10, lck: 6 }
  },
  deckard_cain: {
    slug: "deckard_cain",
    name: "Deckard Cain",
    role: "support",
    color: "#e9c46a",
    powerName: "Healing Aura",
    powerDescription: "Heal self and allies within 80px for 25% maxHP, 12s CD",
    baseStats: { hp: 90, atk: 8, def: 6, spd: 8, lck: 10 }
  },
  galactus: {
    slug: "galactus",
    name: "Galactus",
    role: "wildcard",
    color: "#7b2d8e",
    powerName: "Consume",
    powerDescription: "Execute <20% HP enemies in 36px, heal 15% maxHP, 6s CD",
    baseStats: { hp: 120, atk: 14, def: 7, spd: 7, lck: 8 }
  },
  crundle: {
    slug: "crundle",
    name: "Crundle",
    role: "wildcard",
    color: "#8b4513",
    powerName: "Nervous Scramble",
    powerDescription: "3x speed for 2s, 50% ATK contact damage to enemies touched, 10s CD",
    baseStats: { hp: 85, atk: 10, def: 8, spd: 4, lck: 12 }
  }
};
var PERSONA_SLUGS = ["holden", "broseidon", "deckard_cain", "galactus", "crundle"];
var TILE_FLOOR = 0;
var TILE_WALL = 1;
var TILE_DOOR_CLOSED = 2;
var TILE_DOOR_OPEN = 3;
var TILE_SPAWN = 4;
var TILE_TREASURE = 5;
var TILE_SHRINE = 6;
var TILE_STAIRS = 7;
var TEMP_POWERUP_META = {
  berserker: { name: "Berserker", emoji: "\uD83D\uDD25", color: "#ff4400" },
  shield: { name: "Iron Skin", emoji: "\uD83D\uDEE1️", color: "#4488ff" },
  haste: { name: "Haste", emoji: "⚡", color: "#ffee00" },
  lifesteal: { name: "Lifesteal", emoji: "\uD83D\uDC9A", color: "#44cc44" },
  glass_cannon: { name: "Glass Cannon", emoji: "\uD83D\uDCA5", color: "#ff88ff" }
};
var TEMP_POWERUP_MAX_DURATIONS = {
  berserker: 20000,
  shield: 15000,
  haste: 1e4,
  lifesteal: 25000,
  glass_cannon: 12000
};
function createInitialState() {
  return {
    scene: "lobby",
    playerId: "",
    playerName: "",
    lobbyId: null,
    lobbyPlayers: [],
    isHost: false,
    selectedPersona: null,
    lobbyStatus: "idle",
    lobbyError: null,
    floor: 0,
    totalFloors: 3,
    tick: 0,
    players: new Map,
    enemies: new Map,
    projectiles: new Map,
    aoeZones: new Map,
    boss: null,
    tileGrid: null,
    gridWidth: 0,
    gridHeight: 0,
    rooms: [],
    visitedRooms: new Set,
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
    mobSprites: new Map,
    mobGenProgress: null,
    mobRoster: [],
    mobPreviewCountdown: 1e4,
    connected: false,
    skipGen: true,
    floorPickups: new Map,
    localTempPowerups: [],
    isSpectating: false,
    spectatorTargetId: null
  };
}

// src/renderer/canvas.ts
var canvas;
var ctx;
var camera = { x: 0, y: 0, zoom: 1 };
function initCanvas(c) {
  canvas = c;
  const context = c.getContext("2d");
  if (!context)
    throw new Error("Failed to get 2d context");
  ctx = context;
  ctx.imageSmoothingEnabled = false;
  resize();
  window.addEventListener("resize", resize);
  return ctx;
}
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (ctx)
    ctx.imageSmoothingEnabled = false;
}
function getCanvas() {
  return canvas;
}
function getCamera() {
  return camera;
}
function centerCamera(worldX, worldY) {
  camera.x = worldX - canvas.width / (2 * camera.zoom);
  camera.y = worldY - canvas.height / (2 * camera.zoom);
}
function isVisible(wx, wy, w, h) {
  const vw = canvas.width / camera.zoom;
  const vh = canvas.height / camera.zoom;
  return wx + w > camera.x && wx < camera.x + vw && wy + h > camera.y && wy < camera.y + vh;
}
function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
function pushCameraTransform() {
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
}
function popCameraTransform() {
  ctx.restore();
}

// src/input/input.ts
var held = new Set;
var mouseX = 0;
var mouseY = 0;
var powerTriggered = false;
var powerConsumed = false;
var lastFacingX = 0;
var lastFacingY = 1;
var spectateNextTriggered = false;
var spectateNextConsumed = false;
function initInput(canvas2) {
  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    held.add(key);
    if (e.key === " ") {
      e.preventDefault();
      if (!powerConsumed) {
        powerTriggered = true;
      }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (!spectateNextConsumed) {
        spectateNextTriggered = true;
      }
    }
  });
  window.addEventListener("keyup", (e) => {
    held.delete(e.key.toLowerCase());
    if (e.key === " ") {
      powerConsumed = false;
    }
    if (e.key === "Tab") {
      spectateNextConsumed = false;
    }
  });
  canvas2.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
}
var UP_KEYS = ["w", "arrowup"];
var DOWN_KEYS = ["s", "arrowdown"];
var LEFT_KEYS = ["a", "arrowleft"];
var RIGHT_KEYS = ["d", "arrowright"];
function anyHeld(keys) {
  return keys.some((k) => held.has(k));
}
function normalizeDiagonal(dx, dy) {
  if (dx !== 0 && dy !== 0) {
    const inv = 1 / Math.sqrt(2);
    return { dx: dx * inv, dy: dy * inv };
  }
  return { dx, dy };
}
function computeMovement() {
  let dx = 0, dy = 0;
  if (anyHeld(UP_KEYS))
    dy -= 1;
  if (anyHeld(DOWN_KEYS))
    dy += 1;
  if (anyHeld(LEFT_KEYS))
    dx -= 1;
  if (anyHeld(RIGHT_KEYS))
    dx += 1;
  return normalizeDiagonal(dx, dy);
}
function consumeOneShot(triggered, consumed) {
  const fired = triggered;
  if (triggered)
    return [fired, false, true];
  return [fired, triggered, consumed];
}
function pollInput() {
  const { dx, dy } = computeMovement();
  if (dx !== 0 || dy !== 0) {
    lastFacingX = dx;
    lastFacingY = dy;
  }
  const [power, newPowerTriggered, newPowerConsumed] = consumeOneShot(powerTriggered, powerConsumed);
  powerTriggered = newPowerTriggered;
  powerConsumed = newPowerConsumed;
  const [spectateNext, newSpectateTriggered, newSpectateConsumed] = consumeOneShot(spectateNextTriggered, spectateNextConsumed);
  spectateNextTriggered = newSpectateTriggered;
  spectateNextConsumed = newSpectateConsumed;
  return {
    dx,
    dy,
    facingX: lastFacingX,
    facingY: lastFacingY,
    power,
    mouseX,
    mouseY,
    spectateNext
  };
}
function pressKey(key) {
  held.add(key.toLowerCase());
}
function releaseKey(key) {
  held.delete(key.toLowerCase());
}

// src/network/dungeon-network.ts
class Emitter {
  map = new Map;
  on(event, fn) {
    const arr = this.map.get(event) ?? [];
    arr.push(fn);
    this.map.set(event, arr);
  }
  off(event, fn) {
    const arr = this.map.get(event);
    if (!arr)
      return;
    const i = arr.indexOf(fn);
    if (i !== -1)
      arr.splice(i, 1);
  }
  emit(event, data) {
    const arr = this.map.get(event);
    if (!arr)
      return;
    for (const fn of arr)
      fn(data);
  }
}
var INITIAL_DELAY = 500;
var MAX_DELAY = 1e4;
var BACKOFF = 1.5;

class DungeonNetwork extends Emitter {
  ws = null;
  url = "";
  delay = INITIAL_DELAY;
  timer = null;
  closing = false;
  gameState;
  runStartTime = 0;
  constructor(state) {
    super();
    this.gameState = state;
  }
  connect(lobbyId, userId, name) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    this.url = `${proto}//${location.host}/dungeon-ws?lobbyId=${encodeURIComponent(lobbyId)}&userId=${encodeURIComponent(userId)}&name=${encodeURIComponent(name)}`;
    this.closing = false;
    this.doConnect();
  }
  disconnect() {
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
  doConnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.gameState.connected = true;
      this.delay = INITIAL_DELAY;
      this.emit("connected", null);
    };
    ws.onclose = () => {
      this.gameState.connected = false;
      this.ws = null;
      this.emit("disconnected", null);
      if (!this.closing)
        this.scheduleReconnect();
    };
    ws.onerror = () => {};
    ws.onmessage = (ev) => {
      const data = ev.data;
      if (typeof data === "string") {
        this.handleRaw(data);
      } else if (data instanceof Blob) {
        data.text().then((text) => {
          this.handleRaw(text);
        }).catch((err) => {
          throw err instanceof Error ? err : new Error(String(err));
        });
      } else if (data instanceof ArrayBuffer) {
        this.handleRaw(new TextDecoder().decode(data));
      }
    };
  }
  scheduleReconnect() {
    if (this.timer !== null)
      return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.doConnect();
    }, this.delay);
    this.delay = Math.min(this.delay * BACKOFF, MAX_DELAY);
  }
  handleRaw(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.error("[net] bad json:", raw);
      return;
    }
    this.dispatchMessage(msg);
    this.emit(msg.type, msg);
  }
  dispatchFlowMessage(msg) {
    switch (msg.type) {
      case "d_tick":
        this.onTick(msg);
        return true;
      case "d_floor":
        this.onFloor(msg);
        return true;
      case "d_welcome":
        this.onWelcome(msg);
        return true;
      case "d_lobby":
        this.onLobby(msg);
        return true;
      case "d_powerup_choices":
        this.onPowerup(msg);
        return true;
      default:
        return false;
    }
  }
  dispatchMetaMessage(msg) {
    switch (msg.type) {
      case "d_results":
        this.onResults(msg);
        break;
      case "d_mob_progress":
        this.onMobProgress(msg);
        break;
      case "d_mob_sprites":
        this.onMobSprites(msg);
        break;
      case "d_mob_roster":
        this.onMobRoster(msg);
        break;
      case "d_error":
        console.error("[net] server error:", msg.message);
        this.emit("error", msg.message);
        break;
    }
  }
  dispatchMessage(msg) {
    if (!this.dispatchFlowMessage(msg)) {
      this.dispatchMetaMessage(msg);
    }
  }
  updateLocalPlayerFromSnapshot(s, sp, old, tempPowerups, scramblingUntil) {
    old.hp = sp.hp;
    old.maxHp = sp.maxHp;
    old.alive = sp.hp > 0;
    old.spectating = sp.spectating ?? false;
    old.iframeTicks = sp.iframeTicks;
    old.powerCooldown = sp.cooldownRemaining;
    old.name = sp.name;
    old.personaSlug = sp.personaSlug;
    old.activeTempPowerups = tempPowerups;
    if ((sp.scramblingTicks ?? 0) > 0) {
      old.scramblingUntil = scramblingUntil;
    }
    s.localHp = sp.hp;
    s.localMaxHp = sp.maxHp;
    s.localCooldown = sp.cooldownRemaining;
    s.localTempPowerups = tempPowerups;
    s.localCooldownMax = old.powerCooldownMax;
  }
  upsertRemotePlayerFromSnapshot(s, sp, old, tempPowerups, scramblingUntil, isLocal) {
    const facingX = sp.facing === "left" ? -1 : 1;
    const cp = {
      id: sp.id,
      name: sp.name,
      personaSlug: sp.personaSlug,
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
      spectating: sp.spectating ?? false
    };
    s.players.set(sp.id, cp);
  }
  buildTempPowerups(sp) {
    return (sp.activeTempPowerups ?? []).map((a) => ({
      templateId: a.templateId,
      expiresAt: a.expiresAt
    }));
  }
  computeScramblingUntil(sp, old) {
    const TICK_MS = 62.5;
    const ticks = sp.scramblingTicks ?? 0;
    if (ticks > 0)
      return Date.now() + ticks * TICK_MS;
    return old ? old.scramblingUntil : 0;
  }
  upsertPlayerFromSnapshot(s, sp) {
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
  updateTickPlayers(s, msg) {
    const seenPlayers = new Set;
    for (const sp of msg.players) {
      seenPlayers.add(sp.id);
      this.upsertPlayerFromSnapshot(s, sp);
    }
    for (const id of s.players.keys()) {
      if (!seenPlayers.has(id))
        s.players.delete(id);
    }
  }
  updateTickSpectator(s) {
    const localPlayer = s.players.get(s.playerId);
    const wasSpectating = s.isSpectating;
    s.isSpectating = localPlayer?.spectating ?? false;
    if (s.isSpectating) {
      const aliveOthers = Array.from(s.players.values()).filter((p) => !p.isLocal && p.alive && !p.spectating);
      if (aliveOthers.length === 0) {
        s.spectatorTargetId = null;
      } else if (s.spectatorTargetId === null || !aliveOthers.some((p) => p.id === s.spectatorTargetId)) {
        s.spectatorTargetId = aliveOthers[0].id;
      }
    } else if (wasSpectating) {
      s.spectatorTargetId = null;
    }
  }
  upsertEnemyFromSnapshot(s, se) {
    const old = s.enemies.get(se.id);
    const ce = {
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
      aimDirY: 0
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
  updateTickEnemies(s, msg) {
    const seenEnemies = new Set;
    for (const se of msg.enemies) {
      seenEnemies.add(se.id);
      this.upsertEnemyFromSnapshot(s, se);
    }
    for (const id of s.enemies.keys()) {
      if (!seenEnemies.has(id))
        s.enemies.delete(id);
    }
    if (s.boss && !seenEnemies.has(s.boss.id)) {
      s.boss = null;
    }
  }
  updateTickProjectiles(s, msg) {
    const seenProj = new Set;
    for (const sp of msg.projectiles) {
      seenProj.add(sp.id);
      const old = s.projectiles.get(sp.id);
      const cp = {
        id: sp.id,
        x: sp.x,
        y: sp.y,
        prevX: old ? old.x : sp.x,
        prevY: old ? old.y : sp.y,
        radius: sp.radius,
        fromEnemy: sp.fromEnemy,
        ownerId: sp.ownerId
      };
      s.projectiles.set(sp.id, cp);
    }
    for (const id of s.projectiles.keys()) {
      if (!seenProj.has(id))
        s.projectiles.delete(id);
    }
  }
  updateTickPickups(s, msg) {
    s.floorPickups.clear();
    if (!msg.floorPickups)
      return;
    for (const fp of msg.floorPickups) {
      const pickup = {
        id: fp.id,
        templateId: fp.templateId,
        type: fp.type ?? "temp_powerup",
        healAmount: fp.healAmount,
        x: fp.x,
        y: fp.y
      };
      s.floorPickups.set(fp.id, pickup);
    }
  }
  onTick(msg) {
    const s = this.gameState;
    s.prevTickTimestamp = s.tickTimestamp;
    s.tickTimestamp = performance.now();
    s.lastServerTick = msg.tick;
    s.tick = msg.tick;
    this.updateTickPlayers(s, msg);
    this.updateTickSpectator(s);
    this.updateTickEnemies(s, msg);
    this.updateTickProjectiles(s, msg);
    s.aoeZones.clear();
    for (const sz of msg.aoeZones) {
      s.aoeZones.set(sz.id, {
        id: sz.id,
        x: sz.x,
        y: sz.y,
        radius: sz.radius,
        ticksRemaining: sz.ticksRemaining,
        zoneType: sz.zoneType
      });
    }
    if (msg.totalMobs !== undefined)
      s.totalMobs = msg.totalMobs;
    if (msg.remainingMobs !== undefined)
      s.remainingMobs = msg.remainingMobs;
    this.updateTickPickups(s, msg);
    if (this.runStartTime === 0) {
      this.runStartTime = msg.t;
    }
    s.elapsedMs = msg.t - this.runStartTime;
    for (const ev of msg.events) {
      if (ev.type === "kill") {
        s.kills++;
      }
      this.emit("tick_event", ev);
    }
  }
  onFloor(msg) {
    const s = this.gameState;
    s.mobGenProgress = null;
    s.tileGrid = msg.tiles;
    s.gridWidth = msg.gridWidth;
    s.gridHeight = msg.gridHeight;
    s.rooms = msg.rooms.map((r) => ({
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      cleared: false
    }));
    s.visitedRooms = new Set([0]);
    s.exploredTiles = new Uint8Array(msg.gridWidth * msg.gridHeight);
    s.floor = msg.floor;
    s.totalFloors = 3;
    if (s.scene !== "mob_preview") {
      s.scene = "dungeon";
    }
    s.enemies.clear();
    s.projectiles.clear();
    s.aoeZones.clear();
    s.floorPickups.clear();
    s.players.clear();
    s.localTempPowerups = [];
    s.boss = null;
    s.kills = 0;
    this.runStartTime = 0;
    s.isSpectating = false;
    s.spectatorTargetId = null;
  }
  onWelcome(msg) {
    const s = this.gameState;
    s.playerId = msg.playerId;
    s.lobbyId = msg.lobbyId;
    console.log("[net] Welcome: playerId =", msg.playerId, "lobbyId =", msg.lobbyId);
  }
  onPowerup(msg) {
    const s = this.gameState;
    s.powerupChoices = msg.choices;
    s.powerupTimer = 15000;
    s.scene = "transition";
  }
  onResults(msg) {
    const s = this.gameState;
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
        personaSlug: p.personaSlug,
        kills: p.kills,
        damageDealt: p.damageDealt,
        damageTaken: p.damageTaken,
        totalHealing: p.totalHealing,
        diedOnFloor: p.diedOnFloor
      }))
    };
    s.scene = "results";
  }
  onLobby(msg) {
    const s = this.gameState;
    s.lobbyId = msg.lobbyId;
    s.lobbyPlayers = msg.players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      personaSlug: p.personaSlug ?? null,
      ready: p.ready,
      isHost: p.playerId === msg.hostId
    }));
    s.isHost = s.playerId === msg.hostId;
    s.scene = "lobby";
  }
  onMobProgress(msg) {
    const s = this.gameState;
    s.mobGenProgress = {
      completed: msg.completed,
      total: msg.total,
      current: msg.currentEntity,
      status: msg.status
    };
  }
  onMobSprites(msg) {
    const s = this.gameState;
    for (const sprite of msg.sprites) {
      const img = new Image;
      img.src = `data:image/png;base64,${sprite.spritePng}`;
      s.mobSprites.set(sprite.entityName, img);
    }
  }
  onMobRoster(msg) {
    const s = this.gameState;
    s.mobRoster = msg.mobs;
    s.mobPreviewCountdown = 1e4;
    s.scene = "mob_preview";
  }
  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  sendMove(x, y, facingX, _facingY, seq) {
    const facing = facingX < 0 ? "left" : "right";
    this.send({ type: "d_move", seq, x, y, facing });
  }
  sendAttack() {
    this.send({ type: "d_attack" });
  }
  sendPower() {
    this.send({ type: "d_power" });
  }
  sendReady(persona) {
    this.send({ type: "d_ready", personaSlug: persona });
  }
  sendStart(skipGen) {
    this.send({ type: "d_start", skipGen: skipGen ?? false });
  }
  sendPickPowerup(powerupId) {
    this.send({ type: "d_pick_powerup", powerupId });
  }
}

// src/renderer/canvas-utils.ts
function wrapText(ctx2, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line + (line ? " " : "") + word;
    if (ctx2.measureText(test).width > maxWidth && line) {
      ctx2.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line)
    ctx2.fillText(line, x, cy);
}
function measureWrappedLines(ctx2, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx2.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line)
    lines.push(line);
  return lines;
}

// src/scenes/lobby.ts
var BASE_CARD_W = 210;
var BASE_CARD_H = 240;
var BASE_CARD_GAP = 16;
var DESKTOP_GRID_COLS = 2;
var MOBILE_BREAKPOINT = 500;
var cardHits = [];
var startButtonHit = null;
var copyLinkHit = null;
var clickHandler = null;
var touchHandler = null;
var linkCopiedFlash = 0;
var skipGenCheckbox = null;
var skipGenLabel = null;
var lobbyScrollY = 0;
var lobbyMaxScroll = 0;
var touchScrollStartY = 0;
var touchScrollStartOffset = 0;
var isTouchScrolling = false;
var bgGradient = null;
var bgGradientH = 0;
var wheelHandler = null;
var touchStartHandler = null;
var touchMoveHandler = null;
var HEADER_H = 110;
var GRID_BTN_GAP = 30;
var START_BTN_H = 48;
var BTN_LINK_GAP = 28;
var COPY_LINK_H = 32;
var BOTTOM_PAD = 30;
function clampScroll(value) {
  return Math.max(0, Math.min(lobbyMaxScroll, value));
}
var cachedLayout = null;
var cachedLayoutW = 0;
var cachedLayoutH = 0;
function computeCardLayout(canvasH, canvasW) {
  if (cachedLayout && cachedLayoutW === canvasW && cachedLayoutH === canvasH) {
    return cachedLayout;
  }
  const isMobile = canvasW < MOBILE_BREAKPOINT;
  const cols = isMobile ? 1 : DESKTOP_GRID_COLS;
  const maxCardW = isMobile ? Math.min(BASE_CARD_W, canvasW - 40) : BASE_CARD_W;
  const reservedH = HEADER_H + GRID_BTN_GAP + START_BTN_H + 20;
  const gridRows = Math.ceil(PERSONA_SLUGS.length / cols);
  let result;
  if (isMobile) {
    const CARD_W = maxCardW;
    const CARD_H = BASE_CARD_H;
    const CARD_GAP = BASE_CARD_GAP;
    const gridW = cols * CARD_W + (cols - 1) * CARD_GAP;
    const gridH = gridRows * CARD_H + (gridRows - 1) * CARD_GAP;
    const gridX = (canvasW - gridW) / 2;
    const totalContentH = HEADER_H + gridH + GRID_BTN_GAP + START_BTN_H + BTN_LINK_GAP + COPY_LINK_H + BOTTOM_PAD;
    const maxScroll = Math.max(0, totalContentH - canvasH);
    result = { gridX, gridY: HEADER_H, gridW, gridH, CARD_W, CARD_H, CARD_GAP, cols, maxScroll };
  } else {
    const maxGridH = canvasH - reservedH;
    const naturalGridH = gridRows * BASE_CARD_H + (gridRows - 1) * BASE_CARD_GAP;
    const scale = naturalGridH > maxGridH ? maxGridH / naturalGridH : 1;
    const CARD_W = Math.floor(maxCardW * scale);
    const CARD_H = Math.floor(BASE_CARD_H * scale);
    const CARD_GAP = Math.floor(BASE_CARD_GAP * scale);
    const gridW = cols * CARD_W + (cols - 1) * CARD_GAP;
    const gridH = gridRows * CARD_H + (gridRows - 1) * CARD_GAP;
    const gridX = (canvasW - gridW) / 2;
    result = { gridX, gridY: HEADER_H, gridW, gridH, CARD_W, CARD_H, CARD_GAP, cols, maxScroll: 0 };
  }
  cachedLayout = result;
  cachedLayoutW = canvasW;
  cachedLayoutH = canvasH;
  return result;
}
function renderLobbyStatus(ctx2, state, w) {
  if (state.lobbyStatus === "error") {
    ctx2.fillStyle = "#ff4444";
    ctx2.font = "14px monospace";
    ctx2.textAlign = "center";
    ctx2.fillText(`Error: ${state.lobbyError ?? "Unknown"}`, w / 2, 98);
  } else if (state.lobbyStatus === "creating") {
    ctx2.fillStyle = "#ffcc44";
    ctx2.font = "14px monospace";
    ctx2.textAlign = "center";
    ctx2.fillText("Creating lobby...", w / 2, 98);
  } else if (state.lobbyStatus === "joining") {
    ctx2.fillStyle = "#ffcc44";
    ctx2.font = "14px monospace";
    ctx2.textAlign = "center";
    ctx2.fillText("Joining lobby...", w / 2, 98);
  } else if (!state.connected) {
    ctx2.fillStyle = "#ff4444";
    ctx2.font = "14px monospace";
    ctx2.textAlign = "center";
    ctx2.fillText("Connecting...", w / 2, 98);
  }
}
var statLabelWidths = null;
function getStatLabelWidths(ctx2) {
  if (statLabelWidths)
    return statLabelWidths;
  ctx2.font = "12px monospace";
  statLabelWidths = {
    HP: ctx2.measureText("HP").width,
    ATK: ctx2.measureText("ATK").width,
    DEF: ctx2.measureText("DEF").width,
    SPD: ctx2.measureText("SPD").width,
    LCK: ctx2.measureText("LCK").width
  };
  return statLabelWidths;
}
function renderPersonaStatBlock(ctx2, stats, cx, cy, cardW) {
  const statY = cy + 92;
  ctx2.font = "12px monospace";
  ctx2.textAlign = "left";
  const sx = cx + 14;
  const rightCol = Math.min(90, cardW - 110);
  const lw = getStatLabelWidths(ctx2);
  ctx2.fillStyle = "#ffcc66";
  ctx2.fillText("HP", sx, statY);
  ctx2.fillStyle = "#e0e0e0";
  ctx2.fillText(` ${String(stats.hp)}`, sx + lw.HP, statY);
  ctx2.fillStyle = "#ff7766";
  ctx2.fillText("ATK", sx, statY + 16);
  ctx2.fillStyle = "#e0e0e0";
  ctx2.fillText(` ${String(stats.atk)}`, sx + lw.ATK, statY + 16);
  ctx2.fillStyle = "#66bbff";
  ctx2.fillText("DEF", sx + rightCol, statY);
  ctx2.fillStyle = "#e0e0e0";
  ctx2.fillText(` ${String(stats.def)}`, sx + rightCol + lw.DEF, statY);
  ctx2.fillStyle = "#66ffaa";
  ctx2.fillText("SPD", sx + rightCol, statY + 16);
  ctx2.fillStyle = "#e0e0e0";
  ctx2.fillText(` ${String(stats.spd)}`, sx + rightCol + lw.SPD, statY + 16);
  const lckCol = Math.floor(rightCol / 2);
  ctx2.fillStyle = "#cc99ff";
  ctx2.fillText("LCK", sx + lckCol, statY + 32);
  ctx2.fillStyle = "#e0e0e0";
  ctx2.fillText(` ${String(stats.lck)}`, sx + lckCol + lw.LCK, statY + 32);
}
function cardBgColor(selected, taken) {
  if (taken)
    return "#1a1a1a";
  return selected ? "#2a2a3e" : "#1e1e2e";
}
function cardBorderColor(persona, selected, taken) {
  if (selected)
    return persona.color;
  return taken ? "#333333" : "#444444";
}
function renderPersonaCardHeader(ctx2, persona, cx, cy, CARD_W, CARD_H, selected, taken) {
  ctx2.fillStyle = cardBgColor(selected, taken);
  ctx2.fillRect(cx, cy, CARD_W, CARD_H);
  ctx2.strokeStyle = cardBorderColor(persona, selected, taken);
  ctx2.lineWidth = selected ? 2 : 1;
  ctx2.strokeRect(cx, cy, CARD_W, CARD_H);
  ctx2.fillStyle = taken ? "#444444" : persona.color;
  ctx2.beginPath();
  ctx2.arc(cx + CARD_W / 2, cy + 30, 18, 0, Math.PI * 2);
  ctx2.fill();
  ctx2.fillStyle = "rgba(255,255,255,0.6)";
  drawRoleShape(ctx2, cx + CARD_W / 2, cy + 30, 11, persona.role);
  ctx2.fillStyle = taken ? "#555555" : "#ffffff";
  ctx2.font = "bold 16px monospace";
  ctx2.textAlign = "center";
  ctx2.fillText(persona.name, cx + CARD_W / 2, cy + 62);
  ctx2.fillStyle = taken ? "#666666" : persona.color;
  ctx2.font = "bold 11px monospace";
  ctx2.fillText(persona.role.toUpperCase(), cx + CARD_W / 2, cy + 76);
}
function renderPersonaCard(ctx2, state, slug, cx, cy, CARD_W, CARD_H) {
  const persona = PERSONAS[slug];
  const selected = state.selectedPersona === slug;
  const taken = state.lobbyPlayers.some((p) => p.personaSlug === slug && p.playerId !== state.playerId);
  renderPersonaCardHeader(ctx2, persona, cx, cy, CARD_W, CARD_H, selected, taken);
  renderPersonaStatBlock(ctx2, persona.baseStats, cx, cy, CARD_W);
  ctx2.save();
  ctx2.beginPath();
  ctx2.rect(cx, cy, CARD_W, CARD_H);
  ctx2.clip();
  ctx2.textAlign = "center";
  ctx2.fillStyle = "#88bbff";
  ctx2.font = "bold 14px monospace";
  ctx2.fillText(persona.powerName, cx + CARD_W / 2, cy + 170);
  ctx2.fillStyle = "#c0c0c0";
  ctx2.font = "12px monospace";
  wrapText(ctx2, persona.powerDescription, cx + CARD_W / 2, cy + 186, CARD_W - 20, 14);
  ctx2.restore();
  if (taken) {
    ctx2.fillStyle = "rgba(0,0,0,0.5)";
    ctx2.fillRect(cx, cy, CARD_W, CARD_H);
    ctx2.fillStyle = "#999999";
    ctx2.font = "bold 14px monospace";
    ctx2.textAlign = "center";
    ctx2.fillText("TAKEN", cx + CARD_W / 2, cy + CARD_H / 2);
  }
}
function renderPersonaGrid(ctx2, state, gridX, gridY, CARD_W, CARD_H, CARD_GAP, cols) {
  cardHits = [];
  for (let i = 0;i < PERSONA_SLUGS.length; i++) {
    const slug = PERSONA_SLUGS[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = gridX + col * (CARD_W + CARD_GAP);
    const cy = gridY + row * (CARD_H + CARD_GAP);
    cardHits.push({ slug, x: cx, y: cy, w: CARD_W, h: CARD_H });
    renderPersonaCard(ctx2, state, slug, cx, cy, CARD_W, CARD_H);
  }
}
function renderPartyRoster(ctx2, state, w) {
  if (w < 480)
    return;
  const rosterX = w - 200;
  const rosterY = 110;
  ctx2.fillStyle = "#ffffff";
  ctx2.font = "bold 16px monospace";
  ctx2.textAlign = "left";
  ctx2.fillText("Party", rosterX, rosterY);
  let ry = rosterY + 24;
  for (const player of state.lobbyPlayers) {
    const pColor = player.personaSlug ? PERSONAS[player.personaSlug].color : "#555555";
    ctx2.fillStyle = player.ready ? "#44cc44" : "#cc4444";
    ctx2.beginPath();
    ctx2.arc(rosterX + 7, ry + 3, 5, 0, Math.PI * 2);
    ctx2.fill();
    ctx2.fillStyle = "#ffffff";
    ctx2.font = "14px monospace";
    ctx2.fillText(player.name, rosterX + 18, ry + 7);
    if (player.personaSlug) {
      ctx2.fillStyle = pColor;
      ctx2.font = "12px monospace";
      ctx2.fillText(PERSONAS[player.personaSlug].name, rosterX + 18, ry + 22);
    }
    if (player.isHost) {
      ctx2.fillStyle = "#ffc640";
      ctx2.font = "bold 10px monospace";
      ctx2.fillText("HOST", rosterX + 140, ry + 7);
    }
    ry += 36;
  }
}
function renderHostStartButton(ctx2, state, btnX, btnY, btnW, btnH) {
  const allReady = state.lobbyPlayers.length > 0 && state.lobbyPlayers.every((p) => p.ready);
  const canStart = !!state.selectedPersona && state.connected && allReady;
  startButtonHit = { x: btnX, y: btnY, w: btnW, h: btnH };
  ctx2.fillStyle = canStart ? "#2a6b2a" : "#222222";
  ctx2.fillRect(btnX, btnY, btnW, btnH);
  ctx2.strokeStyle = canStart ? "#44aa44" : "#444444";
  ctx2.lineWidth = 2;
  ctx2.strokeRect(btnX, btnY, btnW, btnH);
  ctx2.fillStyle = canStart ? "#ffffff" : "#666666";
  ctx2.font = "bold 20px monospace";
  ctx2.textAlign = "center";
  ctx2.fillText("START DUNGEON", btnX + btnW / 2, btnY + 32);
  renderHostStartHint(ctx2, state, allReady, btnX, btnY, btnW, btnH);
}
function renderHostStartHint(ctx2, state, allReady, btnX, btnY, btnW, btnH) {
  ctx2.fillStyle = "#888888";
  ctx2.font = "12px monospace";
  ctx2.textAlign = "center";
  if (!state.selectedPersona) {
    ctx2.fillText("Select a persona to begin", btnX + btnW / 2, btnY + btnH + 18);
  } else if (!allReady) {
    ctx2.fillText("Waiting for all players to pick...", btnX + btnW / 2, btnY + btnH + 18);
  }
}
function renderStartOrWaitButton(ctx2, state, w, gridY, gridH) {
  const btnW = 220;
  const btnH = 48;
  const btnX = (w - btnW) / 2;
  const btnY = gridY + gridH + 30;
  if (state.isHost) {
    renderHostStartButton(ctx2, state, btnX, btnY, btnW, btnH);
  } else {
    startButtonHit = null;
    ctx2.fillStyle = "#888888";
    ctx2.font = "16px monospace";
    ctx2.textAlign = "center";
    if (!state.selectedPersona) {
      ctx2.fillText("Select a persona", btnX + btnW / 2, btnY + 28);
    } else {
      ctx2.fillText("Waiting for host to start...", btnX + btnW / 2, btnY + 28);
    }
  }
}
function renderMobGenOverlay(ctx2, state, w, h) {
  const prog = state.mobGenProgress;
  if (!prog)
    return;
  ctx2.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx2.fillRect(0, 0, w, h);
  ctx2.fillStyle = "#ffffff";
  ctx2.font = "bold 28px monospace";
  ctx2.textAlign = "center";
  ctx2.fillText("ENTERING THE DUNGEON", w / 2, h / 2 - 60);
  const barW = 320;
  const barH = 20;
  const barX = (w - barW) / 2;
  const barY = h / 2 - 10;
  const ratio = prog.total > 0 ? prog.completed / prog.total : 0;
  ctx2.fillStyle = "#1a1a2e";
  ctx2.fillRect(barX, barY, barW, barH);
  ctx2.strokeStyle = "#444466";
  ctx2.lineWidth = 1;
  ctx2.strokeRect(barX, barY, barW, barH);
  ctx2.fillStyle = "#44aa66";
  ctx2.fillRect(barX, barY, barW * ratio, barH);
  ctx2.fillStyle = "#cccccc";
  ctx2.font = "14px monospace";
  ctx2.fillText(`${String(prog.completed)} / ${String(prog.total)}`, w / 2, barY + barH + 24);
  if (prog.current) {
    ctx2.fillStyle = "#888899";
    ctx2.font = "13px monospace";
    ctx2.fillText(prog.current, w / 2, barY + barH + 48);
  }
  if (prog.status === "error") {
    ctx2.fillStyle = "#ff4444";
    ctx2.font = "14px monospace";
    ctx2.fillText("Generation error - retrying...", w / 2, barY + barH + 72);
  }
}
function renderCopyInviteButton(ctx2, state, w, gridY, gridH) {
  if (!state.lobbyId)
    return;
  const linkBtnW = 200;
  const linkBtnH = 32;
  const linkBtnX = (w - linkBtnW) / 2;
  const linkBtnY = gridY + gridH + 30 + 48 + 28;
  copyLinkHit = { x: linkBtnX, y: linkBtnY, w: linkBtnW, h: linkBtnH };
  const recentlyCopied = linkCopiedFlash > 0 && performance.now() - linkCopiedFlash < 2000;
  ctx2.fillStyle = recentlyCopied ? "#1a3a1a" : "#1a1a2e";
  ctx2.fillRect(linkBtnX, linkBtnY, linkBtnW, linkBtnH);
  ctx2.strokeStyle = recentlyCopied ? "#44aa44" : "#555577";
  ctx2.lineWidth = 1;
  ctx2.strokeRect(linkBtnX, linkBtnY, linkBtnW, linkBtnH);
  ctx2.fillStyle = recentlyCopied ? "#88ff88" : "#aaaacc";
  ctx2.font = "14px monospace";
  ctx2.textAlign = "center";
  ctx2.fillText(recentlyCopied ? "Copied!" : "Copy Invite Link", linkBtnX + linkBtnW / 2, linkBtnY + 22);
  ctx2.fillStyle = "#555555";
  ctx2.font = "10px monospace";
  ctx2.fillText(`Lobby: ${state.lobbyId}`, linkBtnX + linkBtnW / 2, linkBtnY + linkBtnH + 14);
}
function copyInviteLink(lobbyId) {
  const inviteUrl = `${window.location.origin}/clungiverse.html?lobby=${lobbyId}`;
  navigator.clipboard.writeText(inviteUrl).then(() => {
    linkCopiedFlash = performance.now();
  }).catch(() => {
    const tmp = document.createElement("input");
    tmp.value = inviteUrl;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand("copy");
    document.body.removeChild(tmp);
    linkCopiedFlash = performance.now();
  });
}
function hitTest(mx, my, b) {
  return mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
}
function handleCardClick(mx, my, state, network) {
  for (const card of cardHits) {
    if (hitTest(mx, my, card)) {
      state.selectedPersona = card.slug;
      if (state.connected)
        network.sendReady(card.slug);
      return true;
    }
  }
  return false;
}
function handleCopyLinkClick(mx, my, state) {
  if (!copyLinkHit || !state.lobbyId)
    return false;
  if (!hitTest(mx, my, copyLinkHit))
    return false;
  copyInviteLink(state.lobbyId);
  return true;
}
function handleStartButtonClick(mx, my, state, network) {
  if (!startButtonHit || !state.isHost || !state.selectedPersona || !state.connected)
    return;
  if (!hitTest(mx, my, startButtonHit))
    return;
  network.sendReady(state.selectedPersona);
  network.sendStart(state.skipGen);
}
function handleLobbyClick(e, state, network) {
  const mx = e.clientX;
  const my = e.clientY + lobbyScrollY;
  if (handleCardClick(mx, my, state, network))
    return;
  if (handleCopyLinkClick(mx, my, state))
    return;
  handleStartButtonClick(mx, my, state, network);
}
function createLobbyScene(network) {
  return {
    enter(state) {
      state.selectedPersona = null;
      cardHits = [];
      startButtonHit = null;
      const skipGenWrapper = document.createElement("div");
      skipGenWrapper.id = "skip-gen-wrapper";
      skipGenWrapper.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;z-index:10;";
      skipGenCheckbox = document.createElement("input");
      skipGenCheckbox.type = "checkbox";
      skipGenCheckbox.id = "skip-gen-checkbox";
      skipGenCheckbox.checked = state.skipGen;
      skipGenCheckbox.style.cssText = "accent-color:#44aa66;width:16px;height:16px;cursor:pointer;flex-shrink:0;";
      const checkboxRef = skipGenCheckbox;
      checkboxRef.addEventListener("change", () => {
        state.skipGen = checkboxRef.checked;
      });
      skipGenLabel = document.createElement("label");
      skipGenLabel.htmlFor = "skip-gen-checkbox";
      skipGenLabel.textContent = "⚡ Use cached mobs (skip generation)";
      skipGenLabel.style.cssText = "color:#aaaacc;font:13px monospace;cursor:pointer;user-select:none;white-space:nowrap;";
      skipGenWrapper.appendChild(skipGenCheckbox);
      skipGenWrapper.appendChild(skipGenLabel);
      document.body.appendChild(skipGenWrapper);
      clickHandler = (e) => {
        handleLobbyClick(e, state, network);
      };
      touchHandler = (e) => {
        if (e.changedTouches.length !== 1)
          return;
        if (isTouchScrolling) {
          isTouchScrolling = false;
          return;
        }
        const t = e.changedTouches[0];
        const mx = t.clientX;
        const my = t.clientY + lobbyScrollY;
        if (handleCardClick(mx, my, state, network)) {
          e.preventDefault();
          return;
        }
        if (handleCopyLinkClick(mx, my, state)) {
          e.preventDefault();
          return;
        }
        handleStartButtonClick(mx, my, state, network);
      };
      wheelHandler = (e) => {
        if (lobbyMaxScroll <= 0)
          return;
        lobbyScrollY = clampScroll(lobbyScrollY + e.deltaY);
        e.preventDefault();
      };
      touchStartHandler = (e) => {
        if (e.touches.length !== 1)
          return;
        e.preventDefault();
        touchScrollStartY = e.touches[0].clientY;
        touchScrollStartOffset = lobbyScrollY;
        isTouchScrolling = false;
      };
      touchMoveHandler = (e) => {
        if (e.touches.length !== 1 || lobbyMaxScroll <= 0)
          return;
        const dy = touchScrollStartY - e.touches[0].clientY;
        if (Math.abs(dy) > 5)
          isTouchScrolling = true;
        lobbyScrollY = clampScroll(touchScrollStartOffset + dy);
        e.preventDefault();
      };
      window.addEventListener("click", clickHandler);
      window.addEventListener("touchend", touchHandler, { passive: false });
      window.addEventListener("wheel", wheelHandler, { passive: false });
      window.addEventListener("touchstart", touchStartHandler, { passive: false });
      window.addEventListener("touchmove", touchMoveHandler, { passive: false });
    },
    update(_state, _dt) {},
    render(state, ctx2) {
      const w = ctx2.canvas.width;
      const h = ctx2.canvas.height;
      if (!bgGradient || bgGradientH !== h) {
        bgGradient = ctx2.createLinearGradient(0, 0, 0, h);
        bgGradient.addColorStop(0, "#0d0d1a");
        bgGradient.addColorStop(1, "#1a1a2e");
        bgGradientH = h;
      }
      ctx2.fillStyle = bgGradient;
      ctx2.fillRect(0, 0, w, h);
      if (state.mobGenProgress) {
        renderMobGenOverlay(ctx2, state, w, h);
        return;
      }
      const layout = computeCardLayout(h, w);
      const { gridX, gridY, gridH, CARD_W, CARD_H, CARD_GAP, cols } = layout;
      lobbyMaxScroll = layout.maxScroll;
      lobbyScrollY = clampScroll(lobbyScrollY);
      ctx2.save();
      if (lobbyMaxScroll > 0) {
        ctx2.translate(0, -lobbyScrollY);
      }
      ctx2.fillStyle = "#ffffff";
      ctx2.font = "bold 32px monospace";
      ctx2.textAlign = "center";
      ctx2.fillText("CLUNGIVERSE", w / 2, 50);
      ctx2.font = "16px monospace";
      ctx2.fillStyle = "#bbbbbb";
      ctx2.fillText("Select Your Persona", w / 2, 78);
      renderLobbyStatus(ctx2, state, w);
      renderPersonaGrid(ctx2, state, gridX, gridY, CARD_W, CARD_H, CARD_GAP, cols);
      renderPartyRoster(ctx2, state, w);
      renderStartOrWaitButton(ctx2, state, w, gridY, gridH);
      renderCopyInviteButton(ctx2, state, w, gridY, gridH);
      ctx2.restore();
      if (lobbyMaxScroll > 0 && lobbyScrollY < lobbyMaxScroll - 10) {
        ctx2.fillStyle = "rgba(255,255,255,0.3)";
        ctx2.font = "14px monospace";
        ctx2.textAlign = "center";
        ctx2.fillText("▼ scroll", w / 2, h - 12);
      }
    },
    exit(_state) {
      if (clickHandler) {
        window.removeEventListener("click", clickHandler);
        clickHandler = null;
      }
      if (touchHandler) {
        window.removeEventListener("touchend", touchHandler);
        touchHandler = null;
      }
      if (wheelHandler) {
        window.removeEventListener("wheel", wheelHandler);
        wheelHandler = null;
      }
      if (touchStartHandler) {
        window.removeEventListener("touchstart", touchStartHandler);
        touchStartHandler = null;
      }
      if (touchMoveHandler) {
        window.removeEventListener("touchmove", touchMoveHandler);
        touchMoveHandler = null;
      }
      cardHits = [];
      startButtonHit = null;
      copyLinkHit = null;
      linkCopiedFlash = 0;
      lobbyScrollY = 0;
      lobbyMaxScroll = 0;
      touchScrollStartY = 0;
      touchScrollStartOffset = 0;
      cachedLayout = null;
      const wrapper = document.getElementById("skip-gen-wrapper");
      if (wrapper)
        wrapper.remove();
      if (skipGenCheckbox) {
        skipGenCheckbox = null;
      }
      if (skipGenLabel) {
        skipGenLabel = null;
      }
    }
  };
}
function drawRoleShape(ctx2, x, y, size, role) {
  ctx2.beginPath();
  switch (role) {
    case "tank":
      ctx2.rect(x - size / 2, y - size / 2, size, size);
      break;
    case "dps":
      ctx2.moveTo(x, y - size);
      ctx2.lineTo(x - size * 0.8, y + size * 0.5);
      ctx2.lineTo(x + size * 0.8, y + size * 0.5);
      ctx2.closePath();
      break;
    case "support": {
      const arm = size * 0.25;
      const len = size * 0.7;
      ctx2.rect(x - arm, y - len, arm * 2, len * 2);
      ctx2.rect(x - len, y - arm, len * 2, arm * 2);
      break;
    }
    case "wildcard": {
      for (let i = 0;i < 8; i++) {
        const angle = i * Math.PI / 4 - Math.PI / 2;
        const r = i % 2 === 0 ? size : size * 0.4;
        const px = x + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        if (i === 0)
          ctx2.moveTo(px, py);
        else
          ctx2.lineTo(px, py);
      }
      ctx2.closePath();
      break;
    }
  }
  ctx2.fill();
}

// src/renderer/dungeon-renderer.ts
var TILE_SIZE = 16;
var TILE_COLORS = {
  [TILE_FLOOR]: "#c2b280",
  [TILE_WALL]: "#333333",
  [TILE_DOOR_CLOSED]: "#8b5a2b",
  [TILE_DOOR_OPEN]: "#a0784a",
  [TILE_SPAWN]: "#c2b280",
  [TILE_TREASURE]: "#daa520",
  [TILE_SHRINE]: "#2e8b57",
  [TILE_STAIRS]: "#4682b4"
};
var TILE_COLORS_DIM = {
  [TILE_FLOOR]: "#7a7050",
  [TILE_WALL]: "#222222",
  [TILE_DOOR_CLOSED]: "#5a3a1b",
  [TILE_DOOR_OPEN]: "#6a5030",
  [TILE_SPAWN]: "#7a7050",
  [TILE_TREASURE]: "#8a6810",
  [TILE_SHRINE]: "#1e5a38",
  [TILE_STAIRS]: "#2e5474"
};
function isTileExplored(state, col, row) {
  if (state.exploredTiles.length === 0)
    return true;
  const idx = row * state.gridWidth + col;
  return state.exploredTiles[idx] > 0;
}
function isTileVisible(state, col, row) {
  if (state.exploredTiles.length === 0)
    return true;
  const idx = row * state.gridWidth + col;
  return state.exploredTiles[idx] === 2;
}
function drawSingleTile(ctx2, tile, px, py, exploreVal) {
  if (exploreVal === 1) {
    ctx2.fillStyle = TILE_COLORS_DIM[tile] ?? "#111111";
    ctx2.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    return;
  }
  ctx2.fillStyle = TILE_COLORS[tile] ?? "#000000";
  ctx2.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  if (tile !== TILE_WALL) {
    ctx2.strokeStyle = "rgba(0,0,0,0.15)";
    ctx2.lineWidth = 0.5;
    ctx2.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
  }
}
function renderTileGrid(ctx2, grid, w, h, explored) {
  const cam = getCamera();
  const hasExplored = explored.length === w * h;
  const startCol = Math.max(0, Math.floor(cam.x / TILE_SIZE) - 1);
  const startRow = Math.max(0, Math.floor(cam.y / TILE_SIZE) - 1);
  const viewW = Math.ceil(window.innerWidth / (TILE_SIZE * cam.zoom));
  const viewH = Math.ceil(window.innerHeight / (TILE_SIZE * cam.zoom));
  const endCol = Math.min(w - 1, startCol + viewW + 2);
  const endRow = Math.min(h - 1, startRow + viewH + 2);
  for (let row = startRow;row <= endRow; row++) {
    for (let col = startCol;col <= endCol; col++) {
      const tileIdx = row * w + col;
      const tile = grid[tileIdx];
      const px = col * TILE_SIZE;
      const py = row * TILE_SIZE;
      if (!isVisible(px, py, TILE_SIZE, TILE_SIZE))
        continue;
      const exploreVal = hasExplored ? explored[tileIdx] : 2;
      if (exploreVal === 0)
        continue;
      drawSingleTile(ctx2, tile, px, py, exploreVal);
    }
  }
}
function renderClearedRoomTints(ctx2, rooms) {
  for (const room of rooms) {
    if (!room.cleared)
      continue;
    const rx = room.x * TILE_SIZE;
    const ry = room.y * TILE_SIZE;
    const rw = room.w * TILE_SIZE;
    const rh = room.h * TILE_SIZE;
    if (isVisible(rx, ry, rw, rh)) {
      ctx2.fillStyle = "rgba(0,200,100,0.03)";
      ctx2.fillRect(rx, ry, rw, rh);
    }
  }
}
function getPickupVisuals(pickup) {
  const isHealth = pickup.type === "health";
  const meta = TEMP_POWERUP_META[pickup.templateId];
  return {
    color: isHealth ? "#ff2244" : meta?.color ?? "#ffffff",
    emoji: isHealth ? "❤️" : meta?.emoji ?? "✨"
  };
}
function renderFloorPickups(ctx2, state) {
  const pulseT = Date.now() % 1200 / 1200;
  const pulseFactor = 0.7 + 0.3 * Math.sin(pulseT * Math.PI * 2);
  for (const pickup of state.floorPickups.values()) {
    if (!isVisible(pickup.x - 20, pickup.y - 20, 40, 40))
      continue;
    const { color, emoji } = getPickupVisuals(pickup);
    drawPickupGlow(ctx2, pickup.x, pickup.y, color, emoji, pulseFactor);
  }
}
function renderDungeon(ctx2, state) {
  const grid = state.tileGrid;
  if (!grid)
    return;
  renderTileGrid(ctx2, grid, state.gridWidth, state.gridHeight, state.exploredTiles);
  renderClearedRoomTints(ctx2, state.rooms);
  renderFloorPickups(ctx2, state);
}
function drawPickupGlow(ctx2, x, y, color, emoji, pulseFactor) {
  const r = 10 * pulseFactor;
  const grd = ctx2.createRadialGradient(x, y, 0, x, y, r * 2.5);
  grd.addColorStop(0, color + "cc");
  grd.addColorStop(1, color + "00");
  ctx2.fillStyle = grd;
  ctx2.beginPath();
  ctx2.arc(x, y, r * 2.5, 0, Math.PI * 2);
  ctx2.fill();
  ctx2.fillStyle = color;
  ctx2.beginPath();
  ctx2.arc(x, y, r, 0, Math.PI * 2);
  ctx2.fill();
  ctx2.font = `${String(Math.round(10 * pulseFactor))}px sans-serif`;
  ctx2.textAlign = "center";
  ctx2.textBaseline = "middle";
  ctx2.fillText(emoji, x, y);
  ctx2.textBaseline = "alphabetic";
}

// src/entities/local-player.ts
var PLAYER_RADIUS = 10;
var BASE_SPEED = 280;
function isBlockingTile(tile) {
  return tile === TILE_WALL || tile === TILE_DOOR_CLOSED;
}
function isBoundsViolation(col, row, w, h) {
  return col < 0 || col >= w || row < 0 || row >= h;
}
function collidesWithWall(state, x, y) {
  const grid = state.tileGrid;
  if (!grid)
    return false;
  const w = state.gridWidth;
  const r = PLAYER_RADIUS;
  const corners = [
    [x - r, y - r],
    [x + r, y - r],
    [x - r, y + r],
    [x + r, y + r]
  ];
  for (const [cx, cy] of corners) {
    const col = Math.floor(cx / TILE_SIZE);
    const row = Math.floor(cy / TILE_SIZE);
    if (isBoundsViolation(col, row, w, state.gridHeight))
      return true;
    if (isBlockingTile(grid[row * w + col]))
      return true;
  }
  return false;
}
function applyMovement(state, player, dx, dy, dt) {
  const scrambleMultiplier = player.scramblingUntil > Date.now() ? 3 : 1;
  const speed = BASE_SPEED * scrambleMultiplier * dt;
  const newX = player.x + dx * speed;
  const newY = player.y + dy * speed;
  if (!collidesWithWall(state, newX, player.y))
    player.x = newX;
  if (!collidesWithWall(state, player.x, newY))
    player.y = newY;
}
function applyLocalInput(state, dx, dy, facingX, facingY, dt) {
  const local = getLocalPlayer(state);
  if (!local?.alive)
    return;
  state.inputSeq++;
  if (dx !== 0 || dy !== 0) {
    applyMovement(state, local, dx, dy, dt);
  }
  local.facingX = facingX;
  local.facingY = facingY;
}
function getLocalPlayer(state) {
  return state.players.get(state.playerId);
}

// src/entities/remote-player.ts
var TICK_INTERVAL = 62.5;
function getInterpolationAlpha(state) {
  if (state.tickTimestamp === 0 || state.prevTickTimestamp === 0)
    return 1;
  const elapsed = performance.now() - state.tickTimestamp;
  const tickDelta = state.tickTimestamp - state.prevTickTimestamp;
  const interval = tickDelta > 0 ? tickDelta : TICK_INTERVAL;
  const alpha = Math.min(1, Math.max(0, elapsed / interval));
  return alpha;
}

// src/utils.ts
function mobSlug(displayName) {
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// src/renderer/sprites.ts
function getMobSpriteDrawFn(displayName) {
  const slug = mobSlug(displayName);
  const fn = window[`drawSprite_${slug}`];
  if (typeof fn === "function") {
    return fn;
  }
  return null;
}
var _mobPngCache = new Map;
function getMobPngImage(displayName) {
  const slug = mobSlug(displayName);
  const cached = _mobPngCache.get(slug);
  if (cached === "missing")
    return null;
  if (cached) {
    return cached.complete && cached.naturalWidth > 0 ? cached : null;
  }
  const img = new Image;
  img.src = `/mob-images/${slug}.png`;
  img.onload = () => {
    _mobPngCache.set(slug, img);
  };
  img.onerror = () => {
    _mobPngCache.set(slug, "missing");
  };
  _mobPngCache.set(slug, img);
  return null;
}
var PERSONA_AVATAR_FILES = {
  holden: "bloodfeast.gif",
  broseidon: "fit-bro_a.gif",
  deckard_cain: "deckard-cain_a.gif",
  galactus: "galactus_a.gif",
  crundle: "crundle.png"
};
var avatarCache = new Map;
var avatarReady = new Set;
var avatarsPreloaded = false;
function preloadAvatars() {
  if (avatarsPreloaded)
    return;
  avatarsPreloaded = true;
  for (const [slug, filename] of Object.entries(PERSONA_AVATAR_FILES)) {
    const img = new Image;
    img.onload = () => {
      avatarReady.add(slug);
    };
    img.src = `/avatars/${filename}`;
    avatarCache.set(slug, img);
  }
}
function getAvatar(slug) {
  if (!avatarReady.has(slug))
    return null;
  return avatarCache.get(slug) ?? null;
}

// src/renderer/entity-renderer.ts
var PERSONA_COLORS = {
  holden: "#e63946",
  broseidon: "#457b9d",
  deckard_cain: "#e9c46a",
  galactus: "#7b2d8e",
  crundle: "#8b4513"
};
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function drawRoleOverlay(ctx2, x, y, r, role) {
  ctx2.fillStyle = "rgba(255,255,255,0.7)";
  ctx2.beginPath();
  switch (role) {
    case "tank": {
      const s = r * 0.6;
      ctx2.rect(x - s, y - s, s * 2, s * 2);
      break;
    }
    case "dps": {
      const s = r * 0.7;
      ctx2.moveTo(x, y - s);
      ctx2.lineTo(x - s, y + s * 0.6);
      ctx2.lineTo(x + s, y + s * 0.6);
      ctx2.closePath();
      break;
    }
    case "support": {
      const arm = r * 0.2;
      const len = r * 0.6;
      ctx2.rect(x - arm, y - len, arm * 2, len * 2);
      ctx2.rect(x - len, y - arm, len * 2, arm * 2);
      break;
    }
    case "wildcard": {
      const outer = r * 0.7;
      const inner = r * 0.3;
      for (let i = 0;i < 8; i++) {
        const angle = i * Math.PI / 4 - Math.PI / 2;
        const rad = i % 2 === 0 ? outer : inner;
        const px = x + Math.cos(angle) * rad;
        const py = y + Math.sin(angle) * rad;
        if (i === 0)
          ctx2.moveTo(px, py);
        else
          ctx2.lineTo(px, py);
      }
      ctx2.closePath();
      break;
    }
  }
  ctx2.fill();
}
function drawFacingIndicator(ctx2, x, y, r, fx, fy) {
  const dist = r + 4;
  const size = 3;
  const angle = Math.atan2(fy, fx);
  const tipX = x + Math.cos(angle) * dist;
  const tipY = y + Math.sin(angle) * dist;
  const leftX = tipX + Math.cos(angle + 2.5) * size;
  const leftY = tipY + Math.sin(angle + 2.5) * size;
  const rightX = tipX + Math.cos(angle - 2.5) * size;
  const rightY = tipY + Math.sin(angle - 2.5) * size;
  ctx2.fillStyle = "rgba(255,255,255,0.6)";
  ctx2.beginPath();
  ctx2.moveTo(tipX, tipY);
  ctx2.lineTo(leftX, leftY);
  ctx2.lineTo(rightX, rightY);
  ctx2.closePath();
  ctx2.fill();
}
function drawHpBar(ctx2, x, y, w, hp, maxHp) {
  const barY = y - 4;
  const halfW = w / 2;
  ctx2.fillStyle = "#4a1111";
  ctx2.fillRect(x - halfW, barY, w, 3);
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const green = Math.round(ratio * 200);
  const red = Math.round((1 - ratio) * 200);
  ctx2.fillStyle = `rgb(${String(red)},${String(green)},40)`;
  ctx2.fillRect(x - halfW, barY, w * ratio, 3);
}
function renderGhostPlayer(ctx2, player, x, y) {
  const r = 10;
  ctx2.save();
  ctx2.globalAlpha = 0.35;
  const color = PERSONA_COLORS[player.personaSlug];
  const avatar = getAvatar(player.personaSlug);
  if (avatar) {
    const spriteSize = 28;
    const half = spriteSize / 2;
    ctx2.beginPath();
    ctx2.arc(x, y, half, 0, Math.PI * 2);
    ctx2.closePath();
    ctx2.clip();
    ctx2.drawImage(avatar, x - half, y - half, spriteSize, spriteSize);
  } else {
    ctx2.fillStyle = color;
    ctx2.beginPath();
    ctx2.arc(x, y, r, 0, Math.PI * 2);
    ctx2.fill();
  }
  ctx2.restore();
  ctx2.save();
  ctx2.globalAlpha = 0.5;
  ctx2.strokeStyle = "#aaaacc";
  ctx2.lineWidth = 1.5;
  ctx2.setLineDash([3, 3]);
  ctx2.beginPath();
  ctx2.arc(x, y, r + 4, 0, Math.PI * 2);
  ctx2.stroke();
  ctx2.setLineDash([]);
  ctx2.fillStyle = "#aaaacc";
  ctx2.font = "8px monospace";
  ctx2.textAlign = "center";
  ctx2.fillText(`\uD83D\uDC7B ${player.name}`, x, y - r - 8);
  ctx2.restore();
}
function renderAlivePlayer(ctx2, player, x, y) {
  const r = 10;
  const color = PERSONA_COLORS[player.personaSlug];
  const persona = PERSONAS[player.personaSlug];
  if (player.iframeTicks > 0 && Math.floor(performance.now() / 80) % 2 === 0) {
    drawHpBar(ctx2, x, y - r - 2, 20, player.hp, player.maxHp);
    return;
  }
  if (player.scramblingUntil > Date.now()) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 80);
    ctx2.strokeStyle = `rgba(125,143,105,${String(0.5 + pulse * 0.5)})`;
    ctx2.lineWidth = 3 + pulse * 2;
    ctx2.beginPath();
    ctx2.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx2.stroke();
  }
  const avatar = getAvatar(player.personaSlug);
  if (avatar) {
    const spriteSize = 28;
    const half = spriteSize / 2;
    ctx2.save();
    ctx2.beginPath();
    ctx2.arc(x, y, half, 0, Math.PI * 2);
    ctx2.closePath();
    ctx2.clip();
    ctx2.drawImage(avatar, x - half, y - half, spriteSize, spriteSize);
    ctx2.restore();
    ctx2.strokeStyle = color;
    ctx2.lineWidth = 2;
    ctx2.beginPath();
    ctx2.arc(x, y, half, 0, Math.PI * 2);
    ctx2.stroke();
  } else {
    ctx2.fillStyle = color;
    ctx2.beginPath();
    ctx2.arc(x, y, r, 0, Math.PI * 2);
    ctx2.fill();
    drawRoleOverlay(ctx2, x, y, r, persona.role);
  }
  drawFacingIndicator(ctx2, x, y, r, player.facingX, player.facingY);
  drawHpBar(ctx2, x, y - r - 2, 20, player.hp, player.maxHp);
  ctx2.fillStyle = "#ffffff";
  ctx2.font = "8px monospace";
  ctx2.textAlign = "center";
  ctx2.fillText(player.name, x, y - r - 8);
}
function interpolatedPosition(player, alpha) {
  return {
    x: player.isLocal ? player.x : lerp(player.prevX, player.x, alpha),
    y: player.isLocal ? player.y : lerp(player.prevY, player.y, alpha)
  };
}
function renderPlayers(ctx2, state) {
  const alpha = getInterpolationAlpha(state);
  for (const player of state.players.values()) {
    if (player.alive || !player.spectating)
      continue;
    const { x, y } = interpolatedPosition(player, alpha);
    renderGhostPlayer(ctx2, player, x, y);
  }
  for (const player of state.players.values()) {
    if (!player.alive)
      continue;
    const { x, y } = interpolatedPosition(player, alpha);
    renderAlivePlayer(ctx2, player, x, y);
  }
}
function isPositionVisible(state, wx, wy) {
  const col = Math.floor(wx / TILE_SIZE);
  const row = Math.floor(wy / TILE_SIZE);
  if (col < 0 || col >= state.gridWidth || row < 0 || row >= state.gridHeight)
    return false;
  return isTileVisible(state, col, row);
}
function renderEnemies(ctx2, state) {
  const alpha = getInterpolationAlpha(state);
  for (const enemy of state.enemies.values()) {
    if (!enemy.alive)
      continue;
    const ex = lerp(enemy.prevX, enemy.x, alpha);
    const ey = lerp(enemy.prevY, enemy.y, alpha);
    if (!isPositionVisible(state, ex, ey))
      continue;
    renderSingleEnemy(ctx2, enemy, alpha, state);
  }
  if (state.boss?.alive) {
    const bx = lerp(state.boss.prevX, state.boss.x, alpha);
    const by = lerp(state.boss.prevY, state.boss.y, alpha);
    if (isPositionVisible(state, bx, by)) {
      renderBoss(ctx2, state.boss, alpha);
    }
  }
}
function drawEnemyFallbackShape(ctx2, enemy, x, y) {
  ctx2.fillStyle = "#cc3333";
  switch (enemy.behavior) {
    case "melee_chase":
      ctx2.beginPath();
      ctx2.arc(x, y, 8, 0, Math.PI * 2);
      ctx2.fill();
      break;
    case "ranged_pattern": {
      const s = 10;
      ctx2.beginPath();
      ctx2.moveTo(x, y - s);
      ctx2.lineTo(x + s, y);
      ctx2.lineTo(x, y + s);
      ctx2.lineTo(x - s, y);
      ctx2.closePath();
      ctx2.fill();
      if (enemy.aimDirX !== 0 || enemy.aimDirY !== 0) {
        ctx2.strokeStyle = "rgba(255,100,100,0.4)";
        ctx2.lineWidth = 1;
        ctx2.beginPath();
        ctx2.moveTo(x, y);
        ctx2.lineTo(x + enemy.aimDirX * 40, y + enemy.aimDirY * 40);
        ctx2.stroke();
      }
      break;
    }
    case "slow_charge": {
      const s = 14;
      ctx2.fillRect(x - s / 2, y - s / 2, s, s);
      break;
    }
  }
}
function drawEnemySprite(ctx2, enemy, x, y, state) {
  const drawFn = getMobSpriteDrawFn(enemy.type);
  if (drawFn) {
    drawFn(ctx2, x, y);
    return;
  }
  const pngImg = getMobPngImage(enemy.type);
  if (pngImg) {
    ctx2.drawImage(pngImg, x - 16, y - 16, 32, 32);
    return;
  }
  const mobImg = state?.mobSprites.get(enemy.type);
  if (mobImg && mobImg.complete && mobImg.naturalWidth > 0) {
    ctx2.drawImage(mobImg, x - 16, y - 16, 32, 32);
    return;
  }
  drawEnemyFallbackShape(ctx2, enemy, x, y);
}
function renderSingleEnemy(ctx2, enemy, alpha, state) {
  const x = lerp(enemy.prevX, enemy.x, alpha);
  const y = lerp(enemy.prevY, enemy.y, alpha);
  if (enemy.telegraphing) {
    ctx2.fillStyle = "rgba(255,50,50,0.3)";
    ctx2.beginPath();
    ctx2.arc(x, y, 20, 0, Math.PI * 2);
    ctx2.fill();
  }
  drawEnemySprite(ctx2, enemy, x, y, state);
  drawHpBar(ctx2, x, y - 12, 16, enemy.hp, enemy.maxHp);
}
function renderBoss(ctx2, boss, alpha) {
  const x = lerp(boss.prevX, boss.x, alpha);
  const y = lerp(boss.prevY, boss.y, alpha);
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
  const glowR = 24 + pulse * 8;
  ctx2.fillStyle = `rgba(200,50,50,${String(0.15 + pulse * 0.1)})`;
  ctx2.beginPath();
  ctx2.arc(x, y, glowR, 0, Math.PI * 2);
  ctx2.fill();
  ctx2.fillStyle = "#aa2222";
  ctx2.beginPath();
  ctx2.arc(x, y, 20, 0, Math.PI * 2);
  ctx2.fill();
  ctx2.fillStyle = "#ff4444";
  ctx2.beginPath();
  ctx2.arc(x, y, 8, 0, Math.PI * 2);
  ctx2.fill();
  drawHpBar(ctx2, x, y - 26, 40, boss.hp, boss.maxHp);
  ctx2.fillStyle = "#ffffff";
  ctx2.font = "7px monospace";
  ctx2.textAlign = "center";
  ctx2.fillText(`P${boss.isBoss ? "1" : "?"}`, x, y + 30);
}
function getPlayerProjectileColor(state, ownerId) {
  const player = state.players.get(ownerId);
  if (player) {
    return PERSONA_COLORS[player.personaSlug];
  }
  return "#ffffff";
}
function renderProjectiles(ctx2, state) {
  const alpha = getInterpolationAlpha(state);
  for (const proj of state.projectiles.values()) {
    const x = lerp(proj.prevX, proj.x, alpha);
    const y = lerp(proj.prevY, proj.y, alpha);
    if (!isPositionVisible(state, x, y))
      continue;
    if (proj.fromEnemy) {
      ctx2.fillStyle = "#ff4444";
      ctx2.beginPath();
      ctx2.arc(x, y, proj.radius, 0, Math.PI * 2);
      ctx2.fill();
    } else {
      const color = getPlayerProjectileColor(state, proj.ownerId);
      const dx = x - proj.prevX;
      const dy = y - proj.prevY;
      for (let i = 3;i >= 1; i--) {
        const trailAlpha = 0.15 * (4 - i);
        const trailX = x - dx * (i * 0.3);
        const trailY = y - dy * (i * 0.3);
        const trailRadius = proj.radius * (1 - i * 0.15);
        ctx2.fillStyle = color;
        ctx2.globalAlpha = trailAlpha;
        ctx2.beginPath();
        ctx2.arc(trailX, trailY, trailRadius, 0, Math.PI * 2);
        ctx2.fill();
      }
      ctx2.globalAlpha = 1;
      ctx2.fillStyle = color;
      ctx2.beginPath();
      ctx2.arc(x, y, proj.radius, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.fillStyle = "rgba(255,255,255,0.7)";
      ctx2.beginPath();
      ctx2.arc(x, y, proj.radius * 0.5, 0, Math.PI * 2);
      ctx2.fill();
    }
  }
}
function renderAoeZones(ctx2, state) {
  for (const zone of state.aoeZones.values()) {
    if (!isPositionVisible(state, zone.x, zone.y))
      continue;
    ctx2.fillStyle = "rgba(100,200,255,0.15)";
    ctx2.strokeStyle = "rgba(100,200,255,0.5)";
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ctx2.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
    ctx2.fill();
    ctx2.stroke();
  }
}

// src/renderer/hud.ts
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
function renderHpBar(ctx2, state, canvasW, canvasH) {
  const barW = 200;
  const barH = 16;
  const barX = (canvasW - barW) / 2;
  const barY = canvasH - 40;
  ctx2.fillStyle = "#331111";
  ctx2.fillRect(barX, barY, barW, barH);
  const hpRatio = state.localMaxHp > 0 ? Math.max(0, state.localHp / state.localMaxHp) : 0;
  const green = Math.round(hpRatio * 180);
  const red = Math.round((1 - hpRatio) * 220);
  ctx2.fillStyle = `rgb(${String(red)},${String(green)},40)`;
  ctx2.fillRect(barX, barY, barW * hpRatio, barH);
  ctx2.strokeStyle = "#666666";
  ctx2.lineWidth = 1;
  ctx2.strokeRect(barX, barY, barW, barH);
  ctx2.fillStyle = "#ffffff";
  ctx2.font = "10px monospace";
  ctx2.textAlign = "center";
  ctx2.fillText(`${String(Math.ceil(state.localHp))} / ${String(state.localMaxHp)}`, canvasW / 2, barY + barH - 3);
}
function renderRosterMiniHp(ctx2, player, miniX, miniY, isSpectating) {
  const miniW = 50;
  const miniH = 3;
  ctx2.fillStyle = "#331111";
  ctx2.fillRect(miniX, miniY, miniW, miniH);
  if (player.maxHp > 0) {
    const ratio = Math.max(0, player.hp / player.maxHp);
    ctx2.fillStyle = isSpectating ? "#333355" : player.alive ? "#44aa44" : "#444444";
    ctx2.fillRect(miniX, miniY, miniW * ratio, miniH);
  }
}
function renderRosterRow(ctx2, player, rosterX, rosterY) {
  const persona = PERSONAS[player.personaSlug];
  const color = persona.color;
  const name = player.name || player.personaSlug;
  const isSpectating = player.spectating && !player.alive;
  ctx2.fillStyle = isSpectating ? "#444466" : color;
  ctx2.beginPath();
  ctx2.arc(rosterX + 6, rosterY + 4, 4, 0, Math.PI * 2);
  ctx2.fill();
  const displayName = isSpectating ? `\uD83D\uDC7B ${name}` : name;
  ctx2.fillStyle = isSpectating ? "#555577" : player.alive ? "#cccccc" : "#666666";
  ctx2.font = "9px monospace";
  ctx2.fillText(displayName, rosterX + 14, rosterY + 7);
  renderRosterMiniHp(ctx2, player, rosterX + 14, rosterY + 11, isSpectating);
}
function renderPartyRoster2(ctx2, state) {
  ctx2.textAlign = "left";
  let rosterY = 12;
  const rosterX = 8;
  for (const player of state.players.values()) {
    renderRosterRow(ctx2, player, rosterX, rosterY);
    rosterY += 20;
  }
}
function renderHud(ctx2, state, canvasW, canvasH) {
  renderHpBar(ctx2, state, canvasW, canvasH);
  renderPartyRoster2(ctx2, state);
  if (state.isSpectating) {
    renderSpectatorOverlay(ctx2, state, canvasW, canvasH);
  }
  ctx2.fillStyle = "#cccccc";
  ctx2.font = "12px monospace";
  ctx2.textAlign = "center";
  ctx2.fillText(`Floor ${String(state.floor)}/${String(state.totalFloors)}`, canvasW / 2, 18);
  ctx2.textAlign = "right";
  ctx2.fillStyle = "#cccccc";
  ctx2.font = "12px monospace";
  ctx2.fillText(formatTime(state.elapsedMs), canvasW - 10, 18);
  ctx2.textAlign = "left";
  ctx2.fillStyle = "#cccccc";
  ctx2.font = "11px monospace";
  ctx2.fillText(`Kills: ${String(state.kills)}`, 10, canvasH - 26);
  ctx2.fillStyle = "#dd8844";
  ctx2.fillText(`Mobs: ${String(state.remainingMobs)}/${String(state.totalMobs)}`, 10, canvasH - 12);
  renderActiveTempPowerups(ctx2, state, canvasW, canvasH);
  renderPowerCooldown(ctx2, state, canvasW, canvasH);
  renderMinimap(ctx2, state, canvasW, canvasH);
}
function renderSpectatorOverlay(ctx2, state, canvasW, canvasH) {
  const grad = ctx2.createRadialGradient(canvasW / 2, canvasH / 2, canvasH * 0.3, canvasW / 2, canvasH / 2, canvasH * 0.7);
  grad.addColorStop(0, "rgba(0,0,50,0)");
  grad.addColorStop(1, "rgba(0,0,80,0.45)");
  ctx2.fillStyle = grad;
  ctx2.fillRect(0, 0, canvasW, canvasH);
  ctx2.fillStyle = "rgba(150,150,255,0.9)";
  ctx2.font = "bold 13px monospace";
  ctx2.textAlign = "center";
  const targetPlayer = state.spectatorTargetId ? state.players.get(state.spectatorTargetId) : null;
  const targetName = targetPlayer ? targetPlayer.name || targetPlayer.personaSlug : "---";
  ctx2.fillText(`SPECTATING: ${targetName}`, canvasW / 2, 38);
  const aliveCount = Array.from(state.players.values()).filter((p) => !p.isLocal && p.alive && !p.spectating).length;
  if (aliveCount > 1) {
    ctx2.fillStyle = "rgba(120,120,200,0.7)";
    ctx2.font = "10px monospace";
    ctx2.fillText("[TAB] to switch", canvasW / 2, 54);
  }
}
function renderActiveTempPowerups(ctx2, state, canvasW, canvasH) {
  const now = Date.now();
  const active = state.localTempPowerups.filter((a) => a.expiresAt > now);
  if (active.length === 0)
    return;
  const slotW = 80;
  const slotH = 20;
  const gap = 4;
  const totalW = active.length * (slotW + gap) - gap;
  let x = (canvasW - totalW) / 2;
  const y = canvasH - 65;
  for (const tp of active) {
    const meta = TEMP_POWERUP_META[tp.templateId] ?? { name: tp.templateId, emoji: "✨", color: "#ffffff" };
    const remainMs = tp.expiresAt - now;
    const remainSec = Math.ceil(remainMs / 1000);
    ctx2.fillStyle = "rgba(0,0,0,0.7)";
    ctx2.fillRect(x, y, slotW, slotH);
    const maxMs = TEMP_POWERUP_MAX_DURATIONS[tp.templateId] ?? 20000;
    const ratio = Math.min(1, remainMs / maxMs);
    ctx2.fillStyle = meta.color + "88";
    ctx2.fillRect(x, y + slotH - 3, slotW * ratio, 3);
    ctx2.strokeStyle = meta.color;
    ctx2.lineWidth = 1;
    ctx2.strokeRect(x, y, slotW, slotH);
    ctx2.fillStyle = "#ffffff";
    ctx2.font = "9px monospace";
    ctx2.textAlign = "left";
    ctx2.fillText(`${meta.emoji} ${meta.name} ${String(remainSec)}s`, x + 3, y + 13);
    x += slotW + gap;
  }
}
function renderPowerCooldown(ctx2, state, canvasW, canvasH) {
  const cx = canvasW - 36;
  const cy = canvasH - 36;
  const r = 20;
  ctx2.strokeStyle = "#555555";
  ctx2.lineWidth = 3;
  ctx2.beginPath();
  ctx2.arc(cx, cy, r, 0, Math.PI * 2);
  ctx2.stroke();
  if (state.localCooldownMax > 0 && state.localCooldown > 0) {
    const ratio = state.localCooldown / state.localCooldownMax;
    const endAngle = -Math.PI / 2 + Math.PI * 2 * (1 - ratio);
    ctx2.fillStyle = "rgba(100,100,100,0.6)";
    ctx2.beginPath();
    ctx2.moveTo(cx, cy);
    ctx2.arc(cx, cy, r, -Math.PI / 2, endAngle);
    ctx2.closePath();
    ctx2.fill();
  }
  if (state.localCooldownMax > 0 && state.localCooldown <= 0) {
    ctx2.fillStyle = "rgba(100,255,100,0.3)";
    ctx2.beginPath();
    ctx2.arc(cx, cy, r, 0, Math.PI * 2);
    ctx2.fill();
  }
  ctx2.fillStyle = "#cccccc";
  ctx2.font = "8px monospace";
  ctx2.textAlign = "center";
  ctx2.fillText("SPC", cx, cy + 3);
}
function renderMinimapTiles(ctx2, state, grid, offsetX, offsetY, scale) {
  const gw = state.gridWidth;
  const gh = state.gridHeight;
  for (let row = 0;row < gh; row++) {
    for (let col = 0;col < gw; col++) {
      const tile = grid[row * gw + col];
      if (tile === TILE_WALL)
        continue;
      if (!isTileExplored(state, col, row))
        continue;
      const visible = isTileVisible(state, col, row);
      const px = Math.floor(offsetX + col * scale);
      const py = Math.floor(offsetY + row * scale);
      ctx2.fillStyle = visible ? "#8a7a58" : "#4a4232";
      ctx2.fillRect(px, py, Math.max(1, Math.ceil(scale)), Math.max(1, Math.ceil(scale)));
    }
  }
}
function renderMinimapEnemyDots(ctx2, state, offsetX, offsetY, scale, dotR) {
  for (const enemy of state.enemies.values()) {
    if (!enemy.alive)
      continue;
    const col = enemy.x / 16;
    const row = enemy.y / 16;
    if (!isTileVisible(state, Math.floor(col), Math.floor(row)))
      continue;
    ctx2.fillStyle = "#ff2222";
    ctx2.beginPath();
    ctx2.arc(offsetX + col * scale, offsetY + row * scale, dotR, 0, Math.PI * 2);
    ctx2.fill();
  }
  if (state.boss?.alive) {
    const bcol = state.boss.x / 16;
    const brow = state.boss.y / 16;
    if (isTileVisible(state, Math.floor(bcol), Math.floor(brow))) {
      ctx2.fillStyle = "#ff8800";
      ctx2.beginPath();
      ctx2.arc(offsetX + bcol * scale, offsetY + brow * scale, dotR * 2, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.strokeStyle = "#ffffff";
      ctx2.lineWidth = 0.8;
      ctx2.stroke();
    }
  }
}
function renderMinimapPlayerDots(ctx2, state, offsetX, offsetY, scale, dotR) {
  for (const player of state.players.values()) {
    if (player.isLocal || !player.alive)
      continue;
    const color = PERSONAS[player.personaSlug].color;
    ctx2.fillStyle = color;
    ctx2.beginPath();
    ctx2.arc(offsetX + player.x / 16 * scale, offsetY + player.y / 16 * scale, dotR * 1.3, 0, Math.PI * 2);
    ctx2.fill();
  }
  const localPlayer = state.players.get(state.playerId);
  if (localPlayer) {
    ctx2.fillStyle = "#ffffff";
    ctx2.beginPath();
    ctx2.arc(offsetX + localPlayer.x / 16 * scale, offsetY + localPlayer.y / 16 * scale, dotR * 1.6, 0, Math.PI * 2);
    ctx2.fill();
    ctx2.strokeStyle = "rgba(0,0,0,0.6)";
    ctx2.lineWidth = 0.8;
    ctx2.stroke();
  }
}
function renderMinimapDots(ctx2, state, offsetX, offsetY, scale, dotR) {
  renderMinimapEnemyDots(ctx2, state, offsetX, offsetY, scale, dotR);
  renderMinimapPlayerDots(ctx2, state, offsetX, offsetY, scale, dotR);
}
function renderMinimap(ctx2, state, canvasW, _canvasH) {
  const grid = state.tileGrid;
  if (!grid || state.gridWidth === 0 || state.gridHeight === 0)
    return;
  const MAP_SIZE = 130;
  const MARGIN = 10;
  const mapX = canvasW - MAP_SIZE - MARGIN;
  const mapY = MARGIN + 24;
  ctx2.fillStyle = "rgba(0,0,0,0.65)";
  ctx2.fillRect(mapX, mapY, MAP_SIZE, MAP_SIZE);
  ctx2.strokeStyle = "rgba(150,150,150,0.5)";
  ctx2.lineWidth = 1;
  ctx2.strokeRect(mapX, mapY, MAP_SIZE, MAP_SIZE);
  const gw = state.gridWidth;
  const gh = state.gridHeight;
  const scale = Math.min(MAP_SIZE / gw, MAP_SIZE / gh);
  const offsetX = mapX + (MAP_SIZE - gw * scale) / 2;
  const offsetY = mapY + (MAP_SIZE - gh * scale) / 2;
  renderMinimapTiles(ctx2, state, grid, offsetX, offsetY, scale);
  ctx2.save();
  ctx2.beginPath();
  ctx2.rect(mapX, mapY, MAP_SIZE, MAP_SIZE);
  ctx2.clip();
  renderMinimapDots(ctx2, state, offsetX, offsetY, scale, Math.max(1.5, scale * 0.7));
  ctx2.restore();
}

// src/renderer/particles.ts
var particles = [];
var texts = [];
var MAX_PARTICLES = 500;
var MAX_TEXTS = 50;
function randRange(min, max) {
  return min + Math.random() * (max - min);
}
function spawnHitSparks(x, y) {
  const count = 5 + Math.floor(Math.random() * 4);
  for (let i = 0;i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randRange(40, 120);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 300,
      maxLife: 300,
      color: "#ffcc44",
      size: randRange(1.5, 3)
    });
  }
}
function spawnDeathPoof(x, y) {
  const count = 12 + Math.floor(Math.random() * 6);
  for (let i = 0;i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randRange(30, 100);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 500,
      maxLife: 500,
      color: "#ff6644",
      size: randRange(2, 5)
    });
  }
}
function spawnPowerActivation(x, y) {
  const count = 16;
  for (let i = 0;i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = i / count * Math.PI * 2;
    const speed = randRange(60, 100);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 400,
      maxLife: 400,
      color: "#88ccff",
      size: randRange(2, 4)
    });
  }
}
function spawnHealText(x, y, amount) {
  if (texts.length >= MAX_TEXTS)
    return;
  const drift = (Math.random() - 0.5) * 60;
  const rotation = (Math.random() - 0.5) * 0.45;
  texts.push({
    x,
    y: y - 8,
    vx: drift,
    text: `+${String(amount)} HP`,
    color: "#00ff66",
    life: 1600,
    maxLife: 1600,
    rotation,
    scale: 1
  });
}
function spawnDamageText(x, y, amount, crit) {
  if (texts.length >= MAX_TEXTS)
    return;
  const drift = (Math.random() - 0.5) * 80;
  const rotation = (Math.random() - 0.5) * 0.52;
  texts.push({
    x,
    y: y - 5,
    vx: drift,
    text: crit ? `${String(amount)}!` : String(amount),
    color: crit ? "#ffee00" : "#ff2222",
    life: 1200,
    maxLife: 1200,
    rotation,
    scale: crit ? 1.4 : 1
  });
}
function updateParticles(dt) {
  const dtMs = dt * 1000;
  for (let i = particles.length - 1;i >= 0; i--) {
    const p = particles[i];
    p.life -= dtMs;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
  }
  for (let i = texts.length - 1;i >= 0; i--) {
    const t = texts[i];
    t.life -= dtMs;
    if (t.life <= 0) {
      texts.splice(i, 1);
      continue;
    }
    t.y -= 50 * dt;
    t.x += t.vx * dt;
  }
}
function renderParticles(ctx2) {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx2.globalAlpha = alpha;
    ctx2.fillStyle = p.color;
    ctx2.beginPath();
    ctx2.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx2.fill();
  }
  ctx2.globalAlpha = 1;
  for (const t of texts) {
    const progress = t.life / t.maxLife;
    const alpha = Math.max(0, progress);
    const wobble = 1 + 0.12 * Math.sin((1 - progress) * Math.PI * 6);
    const finalScale = t.scale * wobble;
    ctx2.save();
    ctx2.globalAlpha = alpha;
    ctx2.translate(t.x, t.y);
    ctx2.rotate(t.rotation);
    ctx2.scale(finalScale, finalScale);
    ctx2.font = "bold 22px monospace";
    ctx2.textAlign = "center";
    ctx2.lineWidth = 4;
    ctx2.strokeStyle = "rgba(0,0,0,0.85)";
    ctx2.lineJoin = "round";
    ctx2.strokeText(t.text, 0, 0);
    ctx2.fillStyle = t.color;
    ctx2.fillText(t.text, 0, 0);
    ctx2.restore();
  }
  ctx2.globalAlpha = 1;
}
function clearAllParticles() {
  particles.length = 0;
  texts.length = 0;
}

// src/scenes/dungeon.ts
var shakeX = 0;
var shakeY = 0;
var shakeDuration = 0;
var shakeIntensity = 0;
var flashAlpha = 0;
function triggerShake(intensity, duration) {
  shakeIntensity = intensity;
  shakeDuration = duration;
}
function triggerFlash() {
  flashAlpha = 0.3;
}
var FOG_RADIUS = 9;
function demoteFogTiles(explored, gw, gh, col, row) {
  const minR = Math.max(0, row - FOG_RADIUS - 2);
  const maxR = Math.min(gh - 1, row + FOG_RADIUS + 2);
  const minC = Math.max(0, col - FOG_RADIUS - 2);
  const maxC = Math.min(gw - 1, col + FOG_RADIUS + 2);
  for (let r = minR;r <= maxR; r++) {
    for (let c = minC;c <= maxC; c++) {
      const idx = r * gw + c;
      if (explored[idx] === 2)
        explored[idx] = 1;
    }
  }
}
function markVisibleTiles(explored, gw, gh, col, row) {
  const rSq = FOG_RADIUS * FOG_RADIUS;
  const minRow = Math.max(0, row - FOG_RADIUS);
  const maxRow = Math.min(gh - 1, row + FOG_RADIUS);
  const minCol = Math.max(0, col - FOG_RADIUS);
  const maxCol = Math.min(gw - 1, col + FOG_RADIUS);
  for (let r = minRow;r <= maxRow; r++) {
    const dr = r - row;
    for (let c = minCol;c <= maxCol; c++) {
      const dc = c - col;
      if (dr * dr + dc * dc <= rSq) {
        explored[r * gw + c] = 2;
      }
    }
  }
}
function updateFogOfWar(state, wx, wy) {
  const explored = state.exploredTiles;
  const gw = state.gridWidth;
  const gh = state.gridHeight;
  if (explored.length !== gw * gh || gw === 0)
    return;
  const col = Math.floor(wx / TILE_SIZE);
  const row = Math.floor(wy / TILE_SIZE);
  demoteFogTiles(explored, gw, gh, col, row);
  markVisibleTiles(explored, gw, gh, col, row);
}
function handleDamageEvent(state, payload) {
  const targetId = payload.targetId;
  const damage = payload.damage;
  const isCrit = payload.isCrit ?? false;
  const enemy = state.enemies.get(targetId);
  if (enemy) {
    spawnHitSparks(enemy.x, enemy.y);
    if (damage)
      spawnDamageText(enemy.x, enemy.y, damage, isCrit);
    return;
  }
  const player = state.players.get(targetId);
  if (player) {
    spawnHitSparks(player.x, player.y);
    if (damage)
      spawnDamageText(player.x, player.y, damage, isCrit);
  }
}
function handleKillEvent(state, payload) {
  const enemy = state.enemies.get(payload.enemyId);
  if (enemy)
    spawnDeathPoof(enemy.x, enemy.y);
}
function handlePowerActivateEvent(state, payload) {
  const player = state.players.get(payload.playerId);
  if (!player)
    return;
  spawnPowerActivation(player.x, player.y);
  if (payload.power === "nervous_scramble") {
    player.scramblingUntil = Date.now() + 2000;
  }
}
function handlePlayerDeathEvent(state, payload) {
  const player = state.players.get(payload.playerId);
  if (player)
    spawnDeathPoof(player.x, player.y);
  triggerShake(4, 300);
}
function openDoorTileAt(grid, gw, gh, rx, ry) {
  if (rx < 0 || rx >= gw || ry < 0 || ry >= gh)
    return;
  const idx = ry * gw + rx;
  if (grid[idx] === TILE_DOOR_CLOSED)
    grid[idx] = TILE_DOOR_OPEN;
}
function openDoorTiles(state, roomIndex) {
  const room = state.rooms[roomIndex];
  const grid = state.tileGrid;
  const gw = state.gridWidth;
  if (!grid || gw === 0)
    return;
  for (let ry = room.y - 1;ry <= room.y + room.h; ry++) {
    for (let rx = room.x - 1;rx <= room.x + room.w; rx++) {
      openDoorTileAt(grid, gw, state.gridHeight, rx, ry);
    }
  }
}
function handleDoorOpenEvent(state, payload) {
  const roomIndex = payload.roomIndex;
  if (roomIndex >= 0 && roomIndex < state.rooms.length) {
    state.rooms[roomIndex].cleared = true;
    openDoorTiles(state, roomIndex);
  }
  triggerShake(2, 150);
}
function handlePickupEvent(state, payload) {
  const templateId = payload.templateId;
  const healAmount = payload.healAmount;
  if (templateId !== "health" || !healAmount || healAmount <= 0)
    return;
  const player = state.players.get(payload.playerId);
  if (player)
    spawnHealText(player.x, player.y, healAmount);
}
function tickSpectateNext(state, spectateNext) {
  if (!spectateNext)
    return;
  const aliveOthers = Array.from(state.players.values()).filter((p) => !p.isLocal && p.alive && !p.spectating);
  if (aliveOthers.length > 1 && state.spectatorTargetId !== null) {
    const currentIdx = aliveOthers.findIndex((p) => p.id === state.spectatorTargetId);
    state.spectatorTargetId = aliveOthers[(currentIdx + 1) % aliveOthers.length].id;
  }
}
function trackVisitedRooms(state, x, y) {
  const ptx = x / TILE_SIZE;
  const pty = y / TILE_SIZE;
  for (let i = 0;i < state.rooms.length; i++) {
    if (state.visitedRooms.has(i))
      continue;
    const r = state.rooms[i];
    if (ptx >= r.x && ptx < r.x + r.w && pty >= r.y && pty < r.y + r.h) {
      state.visitedRooms.add(i);
    }
  }
}
function tickSpectate(state, input) {
  if (!state.isSpectating)
    return;
  tickSpectateNext(state, input.spectateNext);
  if (state.spectatorTargetId !== null) {
    const target = state.players.get(state.spectatorTargetId);
    if (target)
      updateFogOfWar(state, target.x, target.y);
  }
}
function tickLocalMovement(state, network, input, dt) {
  if (state.isSpectating)
    return;
  if (input.dx !== 0 || input.dy !== 0) {
    applyLocalInput(state, input.dx, input.dy, input.facingX, input.facingY, dt);
  }
  const local = getLocalPlayer(state);
  if (local) {
    network.sendMove(local.x, local.y, local.facingX, local.facingY, state.inputSeq);
    updateFogOfWar(state, local.x, local.y);
    trackVisitedRooms(state, local.x, local.y);
  }
  if (input.power)
    network.sendPower();
}
function tickShakeAndFlash(dt) {
  if (shakeDuration > 0) {
    shakeDuration -= dt * 1000;
    shakeX = (Math.random() - 0.5) * 2 * shakeIntensity;
    shakeY = (Math.random() - 0.5) * 2 * shakeIntensity;
    if (shakeDuration <= 0) {
      shakeX = 0;
      shakeY = 0;
    }
  }
  if (flashAlpha > 0) {
    flashAlpha -= dt * 0.5;
    if (flashAlpha < 0)
      flashAlpha = 0;
  }
}
var TICK_EVENT_HANDLERS = {
  damage: handleDamageEvent,
  kill: handleKillEvent,
  power_activate: handlePowerActivateEvent,
  player_death: handlePlayerDeathEvent,
  door_open: handleDoorOpenEvent,
  pickup: handlePickupEvent
};
function createDungeonScene(network) {
  let sceneState = null;
  function onTickEvent(data) {
    const ev = data;
    if (ev.type === "boss_phase") {
      triggerShake(6, 500);
      triggerFlash();
      return;
    }
    const handler = TICK_EVENT_HANDLERS[ev.type];
    if (handler !== undefined && sceneState !== null)
      handler(sceneState, ev.payload);
  }
  return {
    enter(state) {
      sceneState = state;
      clearAllParticles();
      shakeX = 0;
      shakeY = 0;
      shakeDuration = 0;
      flashAlpha = 0;
      network.on("tick_event", onTickEvent);
    },
    update(state, dt) {
      const input = pollInput();
      tickSpectate(state, input);
      tickLocalMovement(state, network, input, dt);
      tickShakeAndFlash(dt);
      updateParticles(dt);
    },
    render(state, ctx2) {
      const canvasW = ctx2.canvas.width;
      const canvasH = ctx2.canvas.height;
      if (state.isSpectating && state.spectatorTargetId !== null) {
        const target = state.players.get(state.spectatorTargetId);
        if (target) {
          centerCamera(target.x + shakeX, target.y + shakeY);
        }
      } else {
        const local = getLocalPlayer(state);
        if (local) {
          centerCamera(local.x + shakeX, local.y + shakeY);
        }
      }
      pushCameraTransform();
      renderDungeon(ctx2, state);
      renderAoeZones(ctx2, state);
      renderEnemies(ctx2, state);
      renderPlayers(ctx2, state);
      renderProjectiles(ctx2, state);
      renderParticles(ctx2);
      popCameraTransform();
      renderHud(ctx2, state, canvasW, canvasH);
      if (flashAlpha > 0) {
        ctx2.fillStyle = `rgba(255,255,255,${String(flashAlpha)})`;
        ctx2.fillRect(0, 0, canvasW, canvasH);
      }
      if (!state.connected) {
        ctx2.fillStyle = "rgba(0,0,0,0.7)";
        ctx2.fillRect(0, 0, canvasW, canvasH);
        ctx2.fillStyle = "#ff4444";
        ctx2.font = "18px monospace";
        ctx2.textAlign = "center";
        ctx2.fillText("DISCONNECTED", canvasW / 2, canvasH / 2 - 10);
        ctx2.fillStyle = "#888888";
        ctx2.font = "12px monospace";
        ctx2.fillText("Attempting to reconnect...", canvasW / 2, canvasH / 2 + 15);
      }
    },
    exit(_state) {
      sceneState = null;
      network.off("tick_event", onTickEvent);
      clearAllParticles();
    }
  };
}

// src/scenes/transition.ts
var CARD_W = 180;
var CARD_H = 260;
var CARD_GAP = 24;
var cardRects = [];
var clickHandler2 = null;
var touchHandler2 = null;
var picked = false;
var timerStart = 0;
var PICK_TIMEOUT_MS = 15000;
var RARITY_COLORS = {
  common: { bg: "#222222", border: "#777777", label: "#aaaaaa" },
  uncommon: { bg: "#1a2e1a", border: "#44aa44", label: "#44aa44" },
  rare: { bg: "#1a1a3e", border: "#4488ff", label: "#4488ff" }
};
function renderPowerupCard(ctx2, choice, cx, cy, isPicked) {
  const rarity = RARITY_COLORS[choice.rarity] ?? RARITY_COLORS.common;
  ctx2.fillStyle = isPicked ? "#111111" : rarity.bg;
  ctx2.fillRect(cx, cy, CARD_W, CARD_H);
  ctx2.strokeStyle = rarity.border;
  ctx2.lineWidth = 2;
  ctx2.strokeRect(cx, cy, CARD_W, CARD_H);
  ctx2.fillStyle = rarity.label;
  ctx2.font = "9px monospace";
  ctx2.textAlign = "center";
  ctx2.fillText(choice.rarity.toUpperCase(), cx + CARD_W / 2, cy + 18);
  ctx2.fillStyle = "#eeeeee";
  ctx2.font = "bold 13px monospace";
  ctx2.fillText(choice.name, cx + CARD_W / 2, cy + 45);
  ctx2.fillStyle = "#aaaaaa";
  ctx2.font = "10px monospace";
  wrapText(ctx2, choice.description, cx + CARD_W / 2, cy + 70, CARD_W - 20, 13);
  let my = cy + 140;
  ctx2.font = "10px monospace";
  ctx2.textAlign = "center";
  for (const [stat, value] of Object.entries(choice.statModifier)) {
    const sign = value > 0 ? "+" : "";
    ctx2.fillStyle = value > 0 ? "#44aa44" : "#aa4444";
    ctx2.fillText(`${stat.toUpperCase()} ${sign}${String(value)}`, cx + CARD_W / 2, my);
    my += 14;
  }
  if (!isPicked) {
    ctx2.fillStyle = "rgba(255,255,255,0.02)";
    ctx2.fillRect(cx, cy, CARD_W, CARD_H);
  }
}
function createTransitionScene(network) {
  return {
    enter(_state) {
      picked = false;
      timerStart = performance.now();
      cardRects = [];
      clickHandler2 = (e) => {
        if (picked)
          return;
        const mx = e.clientX;
        const my = e.clientY;
        for (const card of cardRects) {
          if (mx >= card.x && mx <= card.x + card.w && my >= card.y && my <= card.y + card.h) {
            picked = true;
            network.sendPickPowerup(card.choice.id);
            return;
          }
        }
      };
      touchHandler2 = (e) => {
        if (picked || e.changedTouches.length !== 1)
          return;
        const t = e.changedTouches[0];
        const mx = t.clientX;
        const my = t.clientY;
        for (const card of cardRects) {
          if (mx >= card.x && mx <= card.x + card.w && my >= card.y && my <= card.y + card.h) {
            picked = true;
            network.sendPickPowerup(card.choice.id);
            e.preventDefault();
            return;
          }
        }
      };
      window.addEventListener("click", clickHandler2);
      window.addEventListener("touchend", touchHandler2, { passive: false });
    },
    update(state, _dt) {
      const elapsed = performance.now() - timerStart;
      state.powerupTimer = Math.max(0, PICK_TIMEOUT_MS - elapsed);
      if (!picked && state.powerupTimer <= 0 && state.powerupChoices.length > 0) {
        const idx = Math.floor(Math.random() * state.powerupChoices.length);
        picked = true;
        network.sendPickPowerup(state.powerupChoices[idx].id);
      }
    },
    render(state, ctx2) {
      const w = ctx2.canvas.width;
      const h = ctx2.canvas.height;
      const grad = ctx2.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0d0d1a");
      grad.addColorStop(1, "#1a0d1a");
      ctx2.fillStyle = grad;
      ctx2.fillRect(0, 0, w, h);
      ctx2.fillStyle = "#dddddd";
      ctx2.font = "bold 22px monospace";
      ctx2.textAlign = "center";
      ctx2.fillText("CHOOSE YOUR POWERUP", w / 2, 50);
      const timerSec = Math.ceil(state.powerupTimer / 1000);
      ctx2.fillStyle = timerSec <= 5 ? "#ff4444" : "#aaaaaa";
      ctx2.font = "16px monospace";
      ctx2.fillText(`${String(timerSec)}s`, w / 2, 75);
      const choices = state.powerupChoices;
      const totalW = choices.length * CARD_W + (choices.length - 1) * CARD_GAP;
      const startX = (w - totalW) / 2;
      const startY = (h - CARD_H) / 2 - 20;
      cardRects = [];
      for (let i = 0;i < choices.length; i++) {
        const choice = choices[i];
        const cx = startX + i * (CARD_W + CARD_GAP);
        const cy = startY;
        cardRects.push({ choice, x: cx, y: cy, w: CARD_W, h: CARD_H });
        renderPowerupCard(ctx2, choice, cx, cy, picked);
      }
      if (picked) {
        ctx2.fillStyle = "#88cc88";
        ctx2.font = "14px monospace";
        ctx2.textAlign = "center";
        ctx2.fillText("Powerup selected! Waiting for next floor...", w / 2, startY + CARD_H + 40);
      }
    },
    exit(_state) {
      if (clickHandler2) {
        window.removeEventListener("click", clickHandler2);
        clickHandler2 = null;
      }
      if (touchHandler2) {
        window.removeEventListener("touchend", touchHandler2);
        touchHandler2 = null;
      }
      cardRects = [];
      picked = false;
    }
  };
}

// src/scenes/results.ts
var clickHandler3 = null;
var returnButtonHit = null;
function renderPlayerBreakdown(ctx2, state, w, startY) {
  let sy = startY;
  const results = state.results;
  if (!results || results.players.length === 0)
    return sy;
  ctx2.fillStyle = "#aaaaaa";
  ctx2.font = "bold 12px monospace";
  ctx2.textAlign = "center";
  ctx2.fillText("Player Breakdown", w / 2, sy);
  sy += 24;
  ctx2.font = "10px monospace";
  ctx2.fillStyle = "#888888";
  const colX = w / 2 - 220;
  ctx2.textAlign = "left";
  ctx2.fillText("Player", colX, sy);
  ctx2.fillText("Kills", colX + 120, sy);
  ctx2.fillText("Dmg Dealt", colX + 170, sy);
  ctx2.fillText("Dmg Taken", colX + 260, sy);
  ctx2.fillText("Healed", colX + 350, sy);
  ctx2.fillText("Deaths", colX + 410, sy);
  sy += 4;
  ctx2.strokeStyle = "#333333";
  ctx2.lineWidth = 1;
  ctx2.beginPath();
  ctx2.moveTo(colX, sy);
  ctx2.lineTo(colX + 460, sy);
  ctx2.stroke();
  sy += 14;
  for (const pr of results.players) {
    const persona = PERSONAS[pr.personaSlug];
    const color = persona.color;
    ctx2.fillStyle = color;
    ctx2.beginPath();
    ctx2.arc(colX + 4, sy - 3, 4, 0, Math.PI * 2);
    ctx2.fill();
    ctx2.fillStyle = "#cccccc";
    ctx2.font = "10px monospace";
    ctx2.textAlign = "left";
    ctx2.fillText(pr.name || pr.personaSlug, colX + 14, sy);
    ctx2.fillText(String(pr.kills), colX + 120, sy);
    ctx2.fillText(String(pr.damageDealt), colX + 170, sy);
    ctx2.fillText(String(pr.damageTaken), colX + 260, sy);
    ctx2.fillStyle = pr.totalHealing > 0 ? "#44dd88" : "#666666";
    ctx2.fillText(pr.totalHealing > 0 ? `+${String(pr.totalHealing)}` : "-", colX + 350, sy);
    ctx2.fillStyle = "#cccccc";
    ctx2.fillText(pr.diedOnFloor !== null ? `F${String(pr.diedOnFloor)}` : "-", colX + 410, sy);
    sy += 20;
  }
  return sy;
}
function createResultsScene(onReturnToCommons) {
  return {
    enter(_state) {
      returnButtonHit = null;
      clickHandler3 = (e) => {
        if (!returnButtonHit)
          return;
        const mx = e.clientX;
        const my = e.clientY;
        const b = returnButtonHit;
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          onReturnToCommons();
        }
      };
      window.addEventListener("click", clickHandler3);
    },
    update(_state, _dt) {},
    render(state, ctx2) {
      const w = ctx2.canvas.width;
      const h = ctx2.canvas.height;
      const results = state.results;
      const grad = ctx2.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, results?.outcome === "victory" ? "#0d1a0d" : "#1a0d0d");
      grad.addColorStop(1, "#0a0a0a");
      ctx2.fillStyle = grad;
      ctx2.fillRect(0, 0, w, h);
      if (!results) {
        ctx2.fillStyle = "#888888";
        ctx2.font = "16px monospace";
        ctx2.textAlign = "center";
        ctx2.fillText("Loading results...", w / 2, h / 2);
        return;
      }
      const isVictory = results.outcome === "victory";
      ctx2.fillStyle = isVictory ? "#44dd44" : "#dd4444";
      ctx2.font = "bold 32px monospace";
      ctx2.textAlign = "center";
      ctx2.fillText(isVictory ? "VICTORY" : "DEFEATED", w / 2, 60);
      let sy = 100;
      ctx2.fillStyle = "#cccccc";
      ctx2.font = "14px monospace";
      ctx2.textAlign = "center";
      ctx2.fillText(`Floor Reached: ${String(results.floorReached)} / ${String(results.totalFloors)}`, w / 2, sy);
      sy += 24;
      const totalSec = Math.floor(results.durationMs / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      ctx2.fillText(`Time: ${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`, w / 2, sy);
      sy += 24;
      ctx2.fillText(`Total Kills: ${String(results.kills)}`, w / 2, sy);
      sy += 24;
      ctx2.fillText(`Damage Dealt: ${String(results.damageDealt)}`, w / 2, sy);
      sy += 24;
      ctx2.fillText(`Damage Taken: ${String(results.damageTaken)}`, w / 2, sy);
      sy += 40;
      sy = renderPlayerBreakdown(ctx2, state, w, sy);
      const btnW = 200;
      const btnH = 40;
      const btnX = (w - btnW) / 2;
      const btnY = Math.min(sy + 30, h - 70);
      returnButtonHit = { x: btnX, y: btnY, w: btnW, h: btnH };
      ctx2.fillStyle = "#2a2a4e";
      ctx2.fillRect(btnX, btnY, btnW, btnH);
      ctx2.strokeStyle = "#6666aa";
      ctx2.lineWidth = 1;
      ctx2.strokeRect(btnX, btnY, btnW, btnH);
      ctx2.fillStyle = "#dddddd";
      ctx2.font = "bold 13px monospace";
      ctx2.textAlign = "center";
      ctx2.fillText("RETURN TO COMMONS", btnX + btnW / 2, btnY + 25);
    },
    exit(_state) {
      if (clickHandler3) {
        window.removeEventListener("click", clickHandler3);
        clickHandler3 = null;
      }
      returnButtonHit = null;
    }
  };
}

// src/scenes/mob-preview.ts
var COUNTDOWN_MS = 1e4;
var mobImages = new Map;
var skipButtonHit = null;
var clickHandler4 = null;
var skipped = false;
var BEHAVIOR_LABEL = {
  melee_chase: "Melee",
  ranged_pattern: "Ranged",
  slow_charge: "Charge"
};
var BEHAVIOR_COLOR = {
  melee_chase: "#ff7766",
  ranged_pattern: "#66aaff",
  slow_charge: "#ffaa44"
};
function drawMobCardIcon(ctx2, mob, iconX, iconY, iconR, bColor) {
  const pngImg = mobImages.get(mob.entityName);
  const spriteFn = window[`drawSprite_${mobSlug(mob.displayName)}`];
  if (pngImg && pngImg.complete && pngImg.naturalWidth > 0) {
    const size = iconR * 2;
    ctx2.save();
    ctx2.imageSmoothingEnabled = false;
    ctx2.drawImage(pngImg, iconX - size / 2, iconY - size / 2, size, size);
    ctx2.restore();
  } else if (typeof spriteFn === "function") {
    ctx2.save();
    ctx2.scale(1.6, 1.6);
    const scaledIconX = iconX / 1.6;
    const scaledIconY = iconY / 1.6;
    spriteFn(ctx2, scaledIconX, scaledIconY);
    ctx2.restore();
  } else {
    drawMobCardFallbackShape(ctx2, mob.behavior, iconX, iconY, iconR, bColor);
  }
}
function drawMobCardFallbackShape(ctx2, behavior, iconX, iconY, iconR, bColor) {
  ctx2.fillStyle = bColor;
  ctx2.strokeStyle = bColor;
  ctx2.lineWidth = 2;
  ctx2.beginPath();
  switch (behavior) {
    case "melee_chase":
      ctx2.arc(iconX, iconY, iconR * 0.75, 0, Math.PI * 2);
      ctx2.fill();
      break;
    case "ranged_pattern":
      ctx2.moveTo(iconX, iconY - iconR);
      ctx2.lineTo(iconX + iconR * 0.7, iconY);
      ctx2.lineTo(iconX, iconY + iconR);
      ctx2.lineTo(iconX - iconR * 0.7, iconY);
      ctx2.closePath();
      ctx2.fill();
      break;
    case "slow_charge": {
      const s = iconR * 0.72;
      ctx2.rect(iconX - s, iconY - s, s * 2, s * 2);
      ctx2.fill();
      break;
    }
  }
}
function drawMobCardNames(ctx2, mob, cx, cy, cardW) {
  const textX = cx + cardW / 2;
  const textMaxW = cardW - 16;
  ctx2.fillStyle = "#ffffff";
  ctx2.font = "bold 14px monospace";
  ctx2.textAlign = "center";
  const entityLines = measureWrappedLines(ctx2, mob.entityName, textMaxW);
  let nameY = cy + 112;
  for (const ln of entityLines) {
    ctx2.fillText(ln, textX, nameY);
    nameY += 16;
  }
  ctx2.fillStyle = "#aaaacc";
  ctx2.font = "italic 11px monospace";
  const displayLines = measureWrappedLines(ctx2, `"${mob.displayName}"`, textMaxW);
  for (const ln of displayLines) {
    ctx2.fillText(ln, textX, nameY);
    nameY += 13;
  }
  return nameY;
}
function drawMobCardStats(ctx2, mob, cx, cardW, statY) {
  const sx = cx + 10;
  const col2 = cx + cardW / 2 + 4;
  ctx2.font = "11px monospace";
  ctx2.textAlign = "left";
  ctx2.fillStyle = "#ffcc66";
  ctx2.fillText("HP", sx, statY);
  ctx2.fillStyle = "#e0e0e0";
  ctx2.fillText(` ${String(mob.hp)}`, sx + ctx2.measureText("HP").width, statY);
  ctx2.fillStyle = "#ff7766";
  ctx2.fillText("ATK", sx, statY + 15);
  ctx2.fillStyle = "#e0e0e0";
  ctx2.fillText(` ${String(mob.atk)}`, sx + ctx2.measureText("ATK").width, statY + 15);
  ctx2.fillStyle = "#66bbff";
  ctx2.fillText("DEF", col2, statY);
  ctx2.fillStyle = "#e0e0e0";
  ctx2.fillText(` ${String(mob.def)}`, col2 + ctx2.measureText("DEF").width, statY);
  ctx2.fillStyle = "#66ffaa";
  ctx2.fillText("SPD", col2, statY + 15);
  ctx2.fillStyle = "#e0e0e0";
  ctx2.fillText(` ${mob.spd.toFixed(1)}`, col2 + ctx2.measureText("SPD").width, statY + 15);
}
function drawMobCardFlavor(ctx2, flavorText, cx, cardW, flavorStartY) {
  ctx2.fillStyle = "#777788";
  ctx2.font = "italic 10px monospace";
  ctx2.textAlign = "center";
  const flavorMaxW = cardW - 14;
  const flavorLines = measureWrappedLines(ctx2, flavorText, flavorMaxW);
  const maxFlavorLines = 3;
  const truncated = flavorLines.length > maxFlavorLines;
  const linesToShow = truncated ? flavorLines.slice(0, maxFlavorLines) : flavorLines;
  let flavorY = flavorStartY;
  for (let i = 0;i < linesToShow.length; i++) {
    let txt = linesToShow[i];
    if (truncated && i === maxFlavorLines - 1)
      txt = txt.replace(/\s*\w+$/, "…");
    ctx2.fillText(txt, cx + cardW / 2, flavorY);
    flavorY += 12;
  }
}
function drawMobCard(ctx2, mob, cx, cy, cardW, cardH) {
  const bColor = BEHAVIOR_COLOR[mob.behavior] ?? "#888888";
  const bgGrad = ctx2.createLinearGradient(cx, cy, cx, cy + cardH);
  bgGrad.addColorStop(0, "#1e1e36");
  bgGrad.addColorStop(1, "#12121f");
  ctx2.fillStyle = bgGrad;
  ctx2.fillRect(cx, cy, cardW, cardH);
  ctx2.strokeStyle = bColor;
  ctx2.lineWidth = 2;
  ctx2.strokeRect(cx, cy, cardW, cardH);
  ctx2.fillStyle = bColor;
  ctx2.globalAlpha = 0.25;
  ctx2.fillRect(cx, cy, cardW, 4);
  ctx2.globalAlpha = 1;
  const iconX = cx + cardW / 2;
  const iconY = cy + 54;
  const iconR = 30;
  ctx2.fillStyle = bColor;
  ctx2.globalAlpha = 0.15;
  ctx2.beginPath();
  ctx2.arc(iconX, iconY, iconR + 6, 0, Math.PI * 2);
  ctx2.fill();
  ctx2.globalAlpha = 1;
  drawMobCardIcon(ctx2, mob, iconX, iconY, iconR, bColor);
  ctx2.fillStyle = bColor;
  ctx2.font = "bold 11px monospace";
  ctx2.textAlign = "center";
  ctx2.fillText(BEHAVIOR_LABEL[mob.behavior] ?? mob.behavior, iconX, cy + 94);
  const nameY = drawMobCardNames(ctx2, mob, cx, cy, cardW);
  const statY = nameY + 6;
  drawMobCardStats(ctx2, mob, cx, cardW, statY);
  if (mob.flavorText) {
    drawMobCardFlavor(ctx2, mob.flavorText, cx, cardW, statY + 34);
  }
}
function renderMobGrid(ctx2, state, w, h) {
  const mobs = state.mobRoster;
  if (mobs.length === 0) {
    ctx2.fillStyle = "#666688";
    ctx2.font = "16px monospace";
    ctx2.textAlign = "center";
    ctx2.fillText("No mob data available", w / 2, h / 2);
    return;
  }
  const COLS = Math.min(mobs.length, 3);
  const CARD_W2 = 200;
  const CARD_H2 = 260;
  const CARD_GAP2 = 16;
  const rows = Math.ceil(mobs.length / COLS);
  const gridW = COLS * CARD_W2 + (COLS - 1) * CARD_GAP2;
  const gridH = rows * CARD_H2 + (rows - 1) * CARD_GAP2;
  const availH = h - 110 - 70;
  const availW = w - 40;
  const scale = Math.min(gridH > availH ? availH / gridH : 1, gridW > availW ? availW / gridW : 1);
  const scaledCardW = Math.floor(CARD_W2 * scale);
  const scaledCardH = Math.floor(CARD_H2 * scale);
  const scaledGap = Math.floor(CARD_GAP2 * scale);
  const scaledGridW = COLS * scaledCardW + (COLS - 1) * scaledGap;
  const startX = (w - scaledGridW) / 2;
  const startY = 86;
  for (let i = 0;i < mobs.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx = startX + col * (scaledCardW + scaledGap);
    const cy = startY + row * (scaledCardH + scaledGap);
    drawMobCard(ctx2, mobs[i], cx, cy, scaledCardW, scaledCardH);
  }
}
function renderSkipButton(ctx2, state, w, h) {
  const btnW = 160;
  const btnH = 38;
  const btnX = (w - btnW) / 2;
  const btnY = h - 56;
  skipButtonHit = { x: btnX, y: btnY, w: btnW, h: btnH };
  if (skipped) {
    ctx2.fillStyle = "#1a2e1a";
    ctx2.fillRect(btnX, btnY, btnW, btnH);
    ctx2.strokeStyle = "#44aa44";
    ctx2.lineWidth = 1;
    ctx2.strokeRect(btnX, btnY, btnW, btnH);
    ctx2.fillStyle = "#44cc44";
    ctx2.font = "bold 15px monospace";
    ctx2.textAlign = "center";
    ctx2.fillText(state.tileGrid !== null ? "ENTERING..." : "LOADING MAP...", btnX + btnW / 2, btnY + 25);
  } else {
    ctx2.fillStyle = "#1e1e2e";
    ctx2.fillRect(btnX, btnY, btnW, btnH);
    ctx2.strokeStyle = "#555577";
    ctx2.lineWidth = 1;
    ctx2.strokeRect(btnX, btnY, btnW, btnH);
    ctx2.fillStyle = "#aaaacc";
    ctx2.font = "bold 15px monospace";
    ctx2.textAlign = "center";
    ctx2.fillText("Skip  →", btnX + btnW / 2, btnY + 25);
  }
}
function createMobPreviewScene() {
  return {
    enter(state) {
      skipped = false;
      state.mobPreviewCountdown = COUNTDOWN_MS;
      skipButtonHit = null;
      clickHandler4 = (e) => {
        if (!skipButtonHit)
          return;
        const b = skipButtonHit;
        if (e.clientX >= b.x && e.clientX <= b.x + b.w && e.clientY >= b.y && e.clientY <= b.y + b.h) {
          skipped = true;
          if (state.tileGrid !== null) {
            state.scene = "dungeon";
          } else {
            state.mobPreviewCountdown = 0;
          }
        }
      };
      window.addEventListener("click", clickHandler4);
      mobImages.clear();
      for (const mob of state.mobRoster) {
        const slug = mobSlug(mob.displayName);
        const img = new Image;
        img.src = `/mob-images/${slug}.png`;
        mobImages.set(mob.entityName, img);
      }
    },
    update(state, dt) {
      if (skipped) {
        if (state.tileGrid !== null) {
          state.scene = "dungeon";
        }
        return;
      }
      state.mobPreviewCountdown -= dt * 1000;
      if (state.mobPreviewCountdown <= 0) {
        state.mobPreviewCountdown = 0;
        skipped = true;
        if (state.tileGrid !== null) {
          state.scene = "dungeon";
        }
      }
    },
    render(state, ctx2) {
      const w = ctx2.canvas.width;
      const h = ctx2.canvas.height;
      const grad = ctx2.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0d0d1a");
      grad.addColorStop(1, "#1a1a2e");
      ctx2.fillStyle = grad;
      ctx2.fillRect(0, 0, w, h);
      ctx2.fillStyle = "#ffffff";
      ctx2.font = "bold 28px monospace";
      ctx2.textAlign = "center";
      ctx2.fillText("YOUR ENEMIES AWAIT", w / 2, 46);
      ctx2.fillStyle = "#aaaacc";
      ctx2.font = "14px monospace";
      ctx2.fillText("The monsters selected for this run:", w / 2, 68);
      const secLeft = Math.ceil(state.mobPreviewCountdown / 1000);
      const countdownStr = skipped ? "LOADING..." : `Entering in ${String(secLeft)}s`;
      ctx2.fillStyle = secLeft <= 3 && !skipped ? "#ff9944" : "#888899";
      ctx2.font = "13px monospace";
      ctx2.textAlign = "right";
      ctx2.fillText(countdownStr, w - 16, 24);
      renderMobGrid(ctx2, state, w, h);
      renderSkipButton(ctx2, state, w, h);
    },
    exit(_state) {
      if (clickHandler4) {
        window.removeEventListener("click", clickHandler4);
        clickHandler4 = null;
      }
      skipButtonHit = null;
      skipped = false;
      mobImages.clear();
    }
  };
}

// src/main.ts
var canvasEl = document.getElementById("game-canvas");
if (!(canvasEl instanceof HTMLCanvasElement))
  throw new Error("Missing #game-canvas element");
var ctx2 = initCanvas(canvasEl);
var state = createInitialState();
var network = new DungeonNetwork(state);
initInput(getCanvas());
preloadAvatars();
function createTouchControls() {
  const BASE_SIZE = 100;
  const THUMB_SIZE = 40;
  const RADIUS = BASE_SIZE / 2;
  const DEAD_ZONE = RADIUS * 0.15;
  const style = document.createElement("style");
  style.textContent = `
    #joystick-base {
      position: fixed;
      bottom: 24px;
      left: 24px;
      width: ${String(BASE_SIZE)}px;
      height: ${String(BASE_SIZE)}px;
      border-radius: 50%;
      background: rgba(40,40,40,0.55);
      border: 1px solid rgba(255,255,255,0.15);
      display: none;
      z-index: 100;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
    }
    @media (hover: none) and (pointer: coarse) {
      #joystick-base { display: block; }
    }
    #joystick-thumb {
      position: absolute;
      width: ${String(THUMB_SIZE)}px;
      height: ${String(THUMB_SIZE)}px;
      border-radius: 50%;
      background: rgba(200,200,200,0.5);
      border: 1px solid rgba(255,255,255,0.3);
      top: ${String((BASE_SIZE - THUMB_SIZE) / 2)}px;
      left: ${String((BASE_SIZE - THUMB_SIZE) / 2)}px;
      pointer-events: none;
    }
    .dpad-fire {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 64px;
      height: 64px;
      display: none;
      z-index: 100;
      align-items: center;
      justify-content: center;
      background: rgba(255,180,0,0.22);
      border: 1px solid rgba(255,180,0,0.5);
      border-radius: 50%;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
    }
    .dpad-fire::after {
      content: '';
      display: block;
      width: 10px;
      height: 10px;
      background: #ffe;
      border-radius: 50%;
    }
    @media (hover: none) and (pointer: coarse) {
      .dpad-fire { display: flex; }
    }
  `;
  document.head.appendChild(style);
  const base = document.createElement("div");
  base.id = "joystick-base";
  const thumb = document.createElement("div");
  thumb.id = "joystick-thumb";
  base.appendChild(thumb);
  document.body.appendChild(base);
  const centerX = RADIUS;
  const centerY = RADIUS;
  const thumbRadius = THUMB_SIZE / 2;
  const maxThumbOffset = RADIUS - thumbRadius;
  const heldKeys = new Set;
  let joystickTouchId = null;
  function setThumbPosition(dx, dy) {
    thumb.style.left = `${String(centerX - thumbRadius + dx)}px`;
    thumb.style.top = `${String(centerY - thumbRadius + dy)}px`;
  }
  function resetThumb() {
    setThumbPosition(0, 0);
  }
  function releaseAllHeld() {
    for (const k of heldKeys)
      releaseKey(k);
    heldKeys.clear();
  }
  function updateDirection(dx, dy) {
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < DEAD_ZONE) {
      releaseAllHeld();
      return;
    }
    let angle = Math.atan2(dy, dx);
    if (angle < 0)
      angle += Math.PI * 2;
    const deg = angle * 180 / Math.PI;
    let keys;
    if (deg < 22.5 || deg >= 337.5) {
      keys = ["arrowright"];
    } else if (deg < 67.5) {
      keys = ["arrowright", "arrowdown"];
    } else if (deg < 112.5) {
      keys = ["arrowdown"];
    } else if (deg < 157.5) {
      keys = ["arrowleft", "arrowdown"];
    } else if (deg < 202.5) {
      keys = ["arrowleft"];
    } else if (deg < 247.5) {
      keys = ["arrowleft", "arrowup"];
    } else if (deg < 292.5) {
      keys = ["arrowup"];
    } else {
      keys = ["arrowright", "arrowup"];
    }
    const wanted = new Set(keys);
    for (const k of heldKeys) {
      if (!wanted.has(k)) {
        releaseKey(k);
        heldKeys.delete(k);
      }
    }
    for (const k of wanted) {
      if (!heldKeys.has(k)) {
        pressKey(k);
        heldKeys.add(k);
      }
    }
  }
  function handleJoystickTouch(clientX, clientY) {
    const rect = base.getBoundingClientRect();
    let dx = clientX - (rect.left + centerX);
    let dy = clientY - (rect.top + centerY);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxThumbOffset) {
      dx = dx / dist * maxThumbOffset;
      dy = dy / dist * maxThumbOffset;
    }
    setThumbPosition(dx, dy);
    updateDirection(dx, dy);
  }
  base.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (joystickTouchId !== null)
      return;
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    handleJoystickTouch(touch.clientX, touch.clientY);
  }, { passive: false });
  base.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (let i = 0;i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchId) {
        handleJoystickTouch(touch.clientX, touch.clientY);
        break;
      }
    }
  }, { passive: false });
  const handleJoystickEnd = (e) => {
    e.preventDefault();
    for (let i = 0;i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId) {
        joystickTouchId = null;
        resetThumb();
        releaseAllHeld();
        break;
      }
    }
  };
  base.addEventListener("touchend", handleJoystickEnd, { passive: false });
  base.addEventListener("touchcancel", handleJoystickEnd, { passive: false });
  const fireBtn = document.createElement("div");
  fireBtn.className = "dpad-fire";
  let fireTouchId = null;
  fireBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (fireTouchId !== null)
      return;
    fireTouchId = e.changedTouches[0].identifier;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
  }, { passive: false });
  fireBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    for (let i = 0;i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === fireTouchId) {
        fireTouchId = null;
        window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
        break;
      }
    }
  }, { passive: false });
  fireBtn.addEventListener("touchcancel", (e) => {
    e.preventDefault();
    for (let i = 0;i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === fireTouchId) {
        fireTouchId = null;
        window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
        break;
      }
    }
  }, { passive: false });
  document.body.appendChild(fireBtn);
}
createTouchControls();
function handleReturnToCommons() {
  network.disconnect();
  clearLobbyParam();
  window.location.href = "/commons-v2/";
}
var scenes = new Map;
scenes.set("lobby", createLobbyScene(network));
scenes.set("mob_preview", createMobPreviewScene());
scenes.set("dungeon", createDungeonScene(network));
scenes.set("transition", createTransitionScene(network));
scenes.set("results", createResultsScene(handleReturnToCommons));
var activeScene = null;
var activeSceneName = null;
function switchScene(name) {
  if (activeSceneName === name)
    return;
  if (activeScene) {
    activeScene.exit(state);
  }
  activeSceneName = name;
  activeScene = scenes.get(name) ?? null;
  if (activeScene) {
    activeScene.enter(state);
  }
}
function clearLobbyParam() {
  const url = new URL(window.location.href);
  if (url.searchParams.has("lobby")) {
    url.searchParams.delete("lobby");
    window.history.replaceState(null, "", url.toString());
  }
}
var lastScene = state.scene;
var lastTime = 0;
function gameLoop(timestamp) {
  const dt = lastTime === 0 ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  if (state.scene !== lastScene) {
    switchScene(state.scene);
    if (state.scene === "results") {
      clearLobbyParam();
    }
    lastScene = state.scene;
  }
  if (activeScene) {
    activeScene.update(state, dt);
  }
  clearCanvas();
  if (activeScene) {
    activeScene.render(state, ctx2);
  }
  requestAnimationFrame(gameLoop);
}
async function fetchUsername() {
  try {
    const res = await fetch("/api/me", { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      if (data.username)
        return data.username;
    }
  } catch {}
  return "Adventurer";
}
var userId = `player-${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}`;
var userName = "Adventurer";
state.playerId = userId;
state.playerName = userName;
switchScene("lobby");
network.on("connected", () => {
  console.log("[clungiverse] Connected to dungeon server");
});
network.on("disconnected", () => {
  console.log("[clungiverse] Disconnected from dungeon server");
});
network.on("error", (msg) => {
  console.error("[clungiverse] Server error:", msg);
});
var urlParams = new URLSearchParams(window.location.search);
var joinLobbyId = urlParams.get("lobby");
async function joinExistingLobby(id) {
  state.lobbyStatus = "joining";
  console.log("[clungiverse] Joining lobby from invite:", id);
  try {
    const joinRes = await fetch(`/api/clungiverse/lobby/${id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, name: userName }),
      signal: AbortSignal.timeout(8000)
    });
    if (!joinRes.ok) {
      const err = await joinRes.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${String(joinRes.status)}`);
    }
    console.log("[clungiverse] Joined lobby:", id);
    return id;
  } catch (joinErr) {
    console.warn("[clungiverse] Failed to join lobby from URL, creating new one:", joinErr);
    clearLobbyParam();
    return null;
  }
}
async function createAndJoinLobby() {
  state.lobbyStatus = "creating";
  const createRes = await fetch("/api/clungiverse/lobby/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, name: userName }),
    signal: AbortSignal.timeout(8000)
  });
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${String(createRes.status)}`);
  }
  const createData = await createRes.json();
  const lobbyId = createData.lobbyId;
  console.log("[clungiverse] Created lobby:", lobbyId);
  state.lobbyStatus = "joining";
  const joinRes = await fetch(`/api/clungiverse/lobby/${lobbyId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, name: userName }),
    signal: AbortSignal.timeout(8000)
  });
  if (!joinRes.ok) {
    const err = await joinRes.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${String(joinRes.status)}`);
  }
  console.log("[clungiverse] Joined lobby:", lobbyId);
  return lobbyId;
}
async function initLobby() {
  userName = await fetchUsername();
  state.playerName = userName;
  try {
    let lobbyId = null;
    if (joinLobbyId) {
      lobbyId = await joinExistingLobby(joinLobbyId);
    }
    lobbyId ??= await createAndJoinLobby();
    state.lobbyId = lobbyId;
    state.lobbyStatus = "connected";
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("lobby", lobbyId);
    window.history.replaceState(null, "", newUrl.toString());
    network.connect(lobbyId, userId, userName);
  } catch (err) {
    console.error("[clungiverse] Lobby init failed:", err);
    state.lobbyStatus = "error";
    state.lobbyError = String(err);
  }
}
initLobby();
requestAnimationFrame(gameLoop);
console.log("[clungiverse] Client initialized");
