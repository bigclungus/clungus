// Dungeon Manager — manages active dungeon instances (lobbies and runs)

import type {
  DungeonInstance,
  DungeonPlayer,
  DungeonClientMessage,
  DungeonServerMessage,
  DungeonLobbyMessage,
  LobbyPlayerSnapshot,
} from "./dungeon-protocol.ts";

type SendFn = (playerId: string, msg: DungeonServerMessage) => void;

// Global send function reference (set from index.ts)
let globalSendFn: SendFn | null = null;

export function setManagerSendFunction(fn: SendFn): void {
  globalSendFn = fn;
}

function broadcastLobbyState(instance: DungeonInstance): void {
  if (!globalSendFn) return;

  const players: LobbyPlayerSnapshot[] = Array.from(instance.players.values()).map((p) => ({
    playerId: p.id,
    name: p.name,
    personaSlug: p.personaSlug || null,
    ready: !!p.personaSlug,
  }));

  // Determine host (first player added)
  const hostId = instance.players.keys().next().value ?? "";

  const msg: DungeonLobbyMessage = {
    type: "d_lobby",
    lobbyId: instance.lobbyId,
    hostId,
    players,
    status: instance.status === "lobby" ? "waiting" : "in_progress",
  };

  for (const [id, player] of instance.players) {
    if (player.connected) {
      globalSendFn(id, msg);
    }
  }
}

const instances = new Map<string, DungeonInstance>();

let idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

function genSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Lobby lifecycle ─────────────────────────────────────────────────────────

export function createLobby(hostId: string, hostName: string): DungeonInstance {
  const id = genId("dng");
  const lobbyId = genId("lob");

  const instance: DungeonInstance = {
    id,
    lobbyId,
    seed: genSeed(),
    floor: 0,
    tick: 0,
    status: "lobby",
    startedAt: 0,
    players: new Map(),
    enemies: new Map(),
    projectiles: new Map(),
    aoeZones: new Map(),
    floorPickups: new Map(),
    layout: null,
    tickInterval: null,
    skipGen: false,
  };

  // Add host as first player (no persona selected yet)
  const hostPlayer: DungeonPlayer = {
    id: hostId,
    socketId: "",
    name: hostName,
    personaSlug: "",
    x: 0,
    y: 0,
    facing: "right",
    hp: 0,
    maxHp: 0,
    atk: 0,
    def: 0,
    spd: 0,
    lck: 0,
    iframeTicks: 0,
    cooldownTicks: 0,
    cooldownMax: 0,
    scramblingTicks: 0,
    kills: 0,
    damageDealt: 0,
    damageTaken: 0,
    totalHealing: 0,
    diedOnFloor: null,
    powerups: [],
    activeTempPowerups: [],
    inputQueue: [],
    connected: true,
    disconnectedAt: null,
    lastProcessedSeq: 0,
  };

  instance.players.set(hostId, hostPlayer);
  instances.set(lobbyId, instance);

  console.log(`[dungeon] Lobby ${lobbyId} created by ${hostName}`);
  return instance;
}

export function joinLobby(
  lobbyId: string,
  playerId: string,
  playerName: string
): DungeonInstance | null {
  const instance = instances.get(lobbyId);
  if (!instance) return null;
  if (instance.status !== "lobby") return null;
  if (instance.players.size >= 4) return null;
  if (instance.players.has(playerId)) return instance; // already in

  const player: DungeonPlayer = {
    id: playerId,
    socketId: "",
    name: playerName,
    personaSlug: "",
    x: 0,
    y: 0,
    facing: "right",
    hp: 0,
    maxHp: 0,
    atk: 0,
    def: 0,
    spd: 0,
    lck: 0,
    iframeTicks: 0,
    cooldownTicks: 0,
    cooldownMax: 0,
    scramblingTicks: 0,
    kills: 0,
    damageDealt: 0,
    damageTaken: 0,
    totalHealing: 0,
    diedOnFloor: null,
    powerups: [],
    activeTempPowerups: [],
    inputQueue: [],
    connected: true,
    disconnectedAt: null,
    lastProcessedSeq: 0,
  };

  instance.players.set(playerId, player);
  console.log(`[dungeon] ${playerName} joined lobby ${lobbyId}`);
  return instance;
}

export function startRun(lobbyId: string, skipGen = false): DungeonInstance | null {
  const instance = instances.get(lobbyId);
  if (!instance) return null;
  if (instance.status !== "lobby") return null;

  // Verify all players have selected a persona
  for (const [_id, player] of instance.players) {
    if (!player.personaSlug) {
      console.warn(`[dungeon] Cannot start — ${player.name} has no persona selected`);
      return null;
    }
  }

  instance.status = "running";
  instance.floor = 1;
  instance.tick = 0;
  instance.startedAt = Date.now();
  instance.skipGen = skipGen;

  console.log(`[dungeon] Run started for lobby ${lobbyId} (${String(instance.players.size)} players, skipGen=${String(skipGen)})`);

  // Floor generation is triggered by the caller after startRun returns
  return instance;
}

export function destroyRun(lobbyId: string): void {
  const instance = instances.get(lobbyId);
  if (!instance) return;

  if (instance.tickInterval) {
    clearInterval(instance.tickInterval);
    instance.tickInterval = null;
  }

  instances.delete(lobbyId);
  console.log(`[dungeon] Instance ${lobbyId} destroyed`);
}

export function getInstance(lobbyId: string): DungeonInstance | null {
  return instances.get(lobbyId) ?? null;
}

export function getAllInstances(): Map<string, DungeonInstance> {
  return instances;
}

// ─── Connection management ───────────────────────────────────────────────────

export function handleDisconnect(lobbyId: string, playerId: string): void {
  const instance = instances.get(lobbyId);
  if (!instance) return;

  const player = instance.players.get(playerId);
  if (!player) return;

  player.connected = false;
  player.disconnectedAt = Date.now();
  console.log(`[dungeon] ${player.name} disconnected from ${lobbyId}`);

  // If in lobby and all players disconnect, destroy
  if (instance.status === "lobby") {
    const anyConnected = Array.from(instance.players.values()).some((p) => p.connected);
    if (!anyConnected) {
      destroyRun(lobbyId);
    }
  }
}

export function handleReconnect(
  lobbyId: string,
  playerId: string,
  socketId: string
): DungeonInstance | null {
  const instance = instances.get(lobbyId);
  if (!instance) return null;

  const player = instance.players.get(playerId);
  if (!player) return null;

  player.connected = true;
  player.disconnectedAt = null;
  player.socketId = socketId;
  console.log(`[dungeon] ${player.name} reconnected to ${lobbyId}`);
  return instance;
}

// ─── Message routing ─────────────────────────────────────────────────────────

function handleReadyMessage(instance: DungeonInstance, player: DungeonPlayer, msg: Extract<DungeonClientMessage, { type: "d_ready" }>): void {
  if (instance.status === "lobby") {
    player.personaSlug = msg.personaSlug;
    broadcastLobbyState(instance);
  }
}

function handleMoveMessage(instance: DungeonInstance, player: DungeonPlayer, msg: Extract<DungeonClientMessage, { type: "d_move" }>): void {
  if (instance.status === "running" || instance.status === "boss") {
    player.inputQueue.push(msg);
  }
}

function dispatchMessage(instance: DungeonInstance, player: DungeonPlayer, lobbyId: string, msg: DungeonClientMessage): void {
  switch (msg.type) {
    case "d_ready": handleReadyMessage(instance, player, msg); break;
    case "d_start": startRun(lobbyId); break;
    case "d_move": handleMoveMessage(instance, player, msg); break;
    case "d_attack": break;
    case "d_power": break;
    case "d_pick_powerup": break;
  }
}

export function handleMessage(
  lobbyId: string,
  playerId: string,
  msg: DungeonClientMessage,
  _send: SendFn
): void {
  const instance = instances.get(lobbyId);
  if (!instance) return;
  const player = instance.players.get(playerId);
  if (!player) return;
  dispatchMessage(instance, player, lobbyId, msg);
}
