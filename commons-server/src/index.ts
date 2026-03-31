// Commons Game Server — Bun WS on :8090
// Phases 1 & 2: tile-aware NPC AI, SQLite, 20Hz tick, player validation, delta snapshots

import { serve } from "bun";
import type {
  WorldState,
  PlayerState,
  ClientToServerMessage,
} from "./protocol.ts";
import { buildChunk } from "./map.ts";
import { initNpcs , resetNpcPositions } from "./npc-ai.ts";
import {
  runTick,
  handleClientMessage,
  setChunkSubscriptionCallback,
  setForceSyncCallback,
  buildTickPayload,
  type BroadcastFn,
} from "./game-loop.ts";
import { loadNpcPositions, recordWornPath, persistState, resetNpcPositionsInDb, loadWornPathsForChunk, getLeaderboard , db } from "./persistence.ts";
import {
  startSpawnSchedule,
  getWalkersResponse,
  pauseWalker,
  resumeWalker,
  keepWalker,
  dismissWalker,
} from "./audition.ts";
import {
  createLobby,
  joinLobby,
  getInstance,
  handleDisconnect,
  handleReconnect,
  handleMessage as handleDungeonMessage,
  startRun,
  setManagerSendFunction,
} from "./dungeon/dungeon-manager.ts";
import type { DungeonClientMessage, DungeonServerMessage } from "./dungeon/dungeon-protocol.ts";
import {
  startDungeonLoop,
  stopDungeonLoop,
  setSendFunction,
  initFloor,
  queuePowerActivation,
  handlePowerupPick,
} from "./dungeon/dungeon-loop.ts";
import { initLootSystem } from "./dungeon/loot.ts";
import { initMobRegistry, mobRegistry } from "./dungeon/mob-registry.ts";

// ─── World state initialisation ──────────────────────────────────────────────

const npcs = initNpcs();

// Restore persisted NPC positions if available
try {
  const savedPositions = loadNpcPositions();
  for (const [name, pos] of savedPositions) {
    const npc = npcs.get(name);
    if (npc) {
      npc.x = pos.x;
      npc.y = pos.y;
      npc.facing = (pos.facing === "left" || pos.facing === "right") ? pos.facing : "right";
      console.log(`[init] Restored NPC ${name} position from DB`);
    }
  }
} catch (err) {
  console.warn("[init] Could not load NPC positions from DB:", err);
}

const chunks = new Map<string, ReturnType<typeof buildChunk>>();
// Pre-load chunk (0,0) since NPCs live there
chunks.set("0:0", buildChunk(0, 0));

const world: WorldState = {
  players: new Map(),
  npcs,
  warthog: {
    x: 350,
    y: 280,
    vx: 0,
    vy: 0,
    facing: "right",
    seats: [null, null, null, null],
  },
  walkers: [],
  congress: { active: false },
  chunks,
  tickCount: 0,
};

// ─── WebSocket socket data type ──────────────────────────────────────────────

interface SocketData {
  userId: string;
  name: string;
  color: string;
  socketId: string;
  chunkX: number;
  chunkY: number;
  lastSeen: number;
  isDungeon?: false;
}

interface DungeonSocketData {
  userId: string;
  name: string;
  socketId: string;
  lobbyId: string;
  isDungeon: true;
}

type AnySocketData = SocketData | DungeonSocketData;

// Track dungeon websocket connections for sending messages back
const dungeonSockets = new Map<string, import("bun").ServerWebSocket<DungeonSocketData>>();

// Discord message IDs for lobby notifications — lobbyId → Discord message ID
// Populated when the auto-notify fires on lobby create; used to edit the message later (e.g. on run start).
const lobbyDiscordMessages = new Map<string, string>();

/**
 * PATCH an existing lobby Discord notification message with new content.
 * No-ops (with a warning) if no message ID is stored for the lobby or DISCORD_BOT_TOKEN is absent.
 */
async function updateLobbyDiscordMessage(lobbyId: string, content: string): Promise<void> {
  const messageId = lobbyDiscordMessages.get(lobbyId);
  if (!messageId) {
    console.warn(`[clungiverse] updateLobbyDiscordMessage: no stored message ID for lobby ${lobbyId}`);
    return;
  }
  const discordToken = process.env.DISCORD_BOT_TOKEN;
  if (!discordToken) {
    console.warn(`[clungiverse] updateLobbyDiscordMessage: DISCORD_BOT_TOKEN not set`);
    return;
  }
  const res = await fetch(
    `https://discord.com/api/v10/channels/1488315244190236723/messages/${messageId}`,
    {
      method: "PATCH",
      headers: {
        "Authorization": `Bot ${discordToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    console.warn(`[clungiverse] Discord message PATCH failed: ${String(res.status)} ${errText}`);
  }
}

// ─── Congress state polling ───────────────────────────────────────────────────

let congressPollFailures = 0;

async function pollCongressState(): Promise<void> {
  try {
    const res = await fetch("http://localhost:8081/api/congress/state", { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json() as { active?: boolean };
      world.congress.active = !!data.active;
      congressPollFailures = 0;
    }
  } catch (err: unknown) {
    congressPollFailures += 1;
    if (congressPollFailures === 1 || congressPollFailures % 10 === 0) {
      console.warn(`[congress-poll] clunger unreachable (${String(congressPollFailures)} failures):`, err);
    }
  }
}

// Poll congress state every 10s
setInterval(() => {
  pollCongressState().catch((err: unknown) => { console.error("[congress-poll] Error:", err); });
}, 10_000);

// ─── WebSocket message handlers ───────────────────────────────────────────────

function sendToLobby(lobbyId: string, msg: DungeonServerMessage): void {
  for (const [_sid, sock] of dungeonSockets) {
    if (sock.data.lobbyId === lobbyId) {
      try {
        sock.send(JSON.stringify(msg));
      } catch (err: unknown) {
        console.error(`[dungeon] Failed to send to lobby ${lobbyId}:`, err);
      }
    }
  }
}

function handleDungeonStart(lobbyId: string, userId: string, skipGen: boolean): void {
  const inst = getInstance(lobbyId);
  if (inst?.status !== "lobby") return;
  const hostId = inst.players.keys().next().value ?? "";
  if (userId !== hostId) {
    console.warn(`[dungeon-ws] Non-host ${userId} tried to start lobby ${lobbyId}`);
    return;
  }
  const started = startRun(lobbyId, skipGen);
  if (!started) return;

  updateLobbyDiscordMessage(
    lobbyId,
    `~~⚔️ **Adventurer** created a Clungiverse lobby! Join here: https://clung.us/clungiverse?lobby=${lobbyId}~~ *(game in progress)*`
  ).catch((err: unknown) => { console.warn(`[dungeon-ws] Failed to update lobby Discord message:`, err); });

  const mobTotal = mobRegistry.size;
  sendToLobby(lobbyId, { type: "d_mob_progress", completed: 0, total: mobTotal, currentEntity: "Preparing mobs...", status: "loading" });
  setTimeout(() => {
    sendToLobby(lobbyId, { type: "d_mob_progress", completed: mobTotal, total: mobTotal, currentEntity: "Ready", status: "complete" });
  }, 600);
  setTimeout(() => { initFloor(started); }, 800);

  if (!skipGen) {
    const workflowId = `mob-gen-${started.id}-${String(Date.now())}`;
    const excludeNames = Array.from(started.players.values()).map((p) => p.name);
    void (async () => {
      try {
        const { Client, Connection } = await import("@temporalio/client");
        const connection = await Connection.connect({ address: "localhost:7233" });
        const client = new Client({ connection });
        await client.workflow.start("MobGenerationWorkflow", { workflowId, taskQueue: "listings-queue", args: [30, excludeNames] });
        console.log(`[dungeon-ws] MobGenerationWorkflow started: ${workflowId}`);
      } catch (err: unknown) {
        console.warn("[dungeon-ws] MobGenerationWorkflow trigger failed:", err);
      }
    })();
  } else {
    console.log(`[dungeon-ws] skipGen=true — skipping MobGenerationWorkflow for lobby ${lobbyId}`);
  }
}

function makeSendToPlayer(): (targetId: string, serverMsg: DungeonServerMessage) => void {
  return (targetId: string, serverMsg: DungeonServerMessage): void => {
    for (const [_sid, sock] of dungeonSockets) {
      if (sock.data.userId === targetId) {
        try {
          sock.send(JSON.stringify(serverMsg));
        } catch (err: unknown) {
          console.error(`[dungeon] Failed to send to player ${targetId}:`, err);
        }
        break;
      }
    }
  };
}

function handleDPower(lobbyId: string, userId: string): void {
  const inst = getInstance(lobbyId);
  if (inst && (inst.status === "running" || inst.status === "boss")) queuePowerActivation(inst.id, userId);
}

function handleDPickPowerup(lobbyId: string, userId: string, msg: DungeonClientMessage): void {
  if (msg.type !== "d_pick_powerup") return;
  const inst = getInstance(lobbyId);
  if (inst?.status === "between_floors") handlePowerupPick(inst.id, userId, msg.powerupId);
}

function handleDungeonWsActions(lobbyId: string, userId: string, msg: DungeonClientMessage): void {
  if (msg.type === "d_start") { handleDungeonStart(lobbyId, userId, !!msg.skipGen); return; }
  if (msg.type === "d_power") { handleDPower(lobbyId, userId); return; }
  if (msg.type === "d_pick_powerup") { handleDPickPowerup(lobbyId, userId, msg); return; }
  handleDungeonMessage(lobbyId, userId, msg, makeSendToPlayer());
}

function handleDungeonWsMessage(dws: import("bun").ServerWebSocket<DungeonSocketData>, raw: string): void {
  const { userId, lobbyId } = dws.data;
  let msg: DungeonClientMessage;
  try {
    msg = JSON.parse(raw) as DungeonClientMessage;
  } catch {
    return;
  }
  handleDungeonWsActions(lobbyId, userId, msg);
}

function handleCommonsWsMessage(ws: import("bun").ServerWebSocket<SocketData>, raw: string): void {
  const { socketId } = ws.data;
  const player = world.players.get(socketId);
  if (!player) return;
  player.lastSeen = Date.now();
  ws.data.lastSeen = player.lastSeen;
  let msg: ClientToServerMessage;
  try {
    msg = JSON.parse(raw) as ClientToServerMessage;
  } catch (err) {
    console.error(`[ws] Invalid JSON from ${socketId}:`, err);
    return;
  }
  if (msg.type === "worn_path") {
    recordWornPath(msg.chunkX, msg.chunkY, msg.tileX, msg.tileY);
    return;
  }
  handleClientMessage(socketId, msg, world);
}

// ─── Route handler helpers ────────────────────────────────────────────────────

function jsonOk(body: unknown, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...extra },
  });
}

function jsonErr(body: unknown, status = 500): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleAdminCongress(req: Request): Promise<Response> {
  return req.json().then(
    (body: { active: boolean }) => {
      world.congress.active = body.active;
      console.log(`[admin] Congress active: ${String(world.congress.active)}`);
      return jsonOk({ active: world.congress.active });
    },
    (err: unknown) => {
      console.error("[admin] Congress toggle failed to parse body:", err);
      return jsonErr({ error: "Invalid JSON body" }, 400);
    }
  );
}

function handleAdminResetNpcs(): Response {
  try {
    const npcNames = Array.from(world.npcs.keys());
    const center = resetNpcPositionsInDb(npcNames);
    resetNpcPositions(world.npcs, center.x, center.y);
    console.log(`[admin] NPC reset triggered — ${String(npcNames.length)} NPCs moved to center (${String(center.x)}, ${String(center.y)})`);
    return jsonOk({ ok: true, npcsReset: npcNames.length, center });
  } catch (err) {
    console.error("[admin] NPC reset failed:", err);
    return jsonErr({ error: String(err) });
  }
}

function handleAdminTerrainChanged(): Response {
  try {
    const npcNames = Array.from(world.npcs.keys());
    const center = resetNpcPositionsInDb(npcNames);
    resetNpcPositions(world.npcs, center.x, center.y);
    chunks.set("0:0", buildChunk(0, 0));
    console.log(`[admin] Terrain changed — rebuilt chunk (0,0) and reset ${String(npcNames.length)} NPCs to center`);
    return jsonOk({ ok: true, npcsReset: npcNames.length, center, chunkRebuilt: "0:0" });
  } catch (err) {
    console.error("[admin] terrain-changed handler failed:", err);
    return jsonErr({ error: String(err) });
  }
}

async function handleAdminRoutes(req: Request, url: URL): Promise<Response | null> {
  if (url.pathname === "/health") {
    return jsonOk({ status: "ok", players: world.players.size, tick: world.tickCount });
  }
  if (url.pathname === "/admin/congress" && req.method === "POST") return handleAdminCongress(req);
  if (url.pathname === "/admin/reset-npcs" && req.method === "POST") return handleAdminResetNpcs();
  if (url.pathname === "/admin/terrain-changed" && req.method === "POST") return handleAdminTerrainChanged();
  return null;
}

async function handleAuditionPostById(
  req: Request,
  fn: (world: WorldState, id: string) => Response | Promise<Response>,
): Promise<Response> {
  const body = (await req.json()) as { id: string };
  return fn(world, body.id);
}

async function routeAuditionPost(req: Request, path: string): Promise<Response | null> {
  if (path === "/api/audition/pause") return handleAuditionPostById(req, pauseWalker);
  if (path === "/api/audition/resume") return handleAuditionPostById(req, resumeWalker);
  if (path === "/api/audition/keep") return handleAuditionPostById(req, keepWalker);
  if (path === "/api/audition/dismiss") return handleAuditionPostById(req, dismissWalker);
  return null;
}

async function handleAuditionRoutes(req: Request, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/audition/")) return null;
  if (url.pathname === "/api/audition/walkers" && req.method === "GET") return getWalkersResponse(world);
  if (req.method === "POST") return routeAuditionPost(req, url.pathname);
  return null;
}

function handleClungiverseLeaderboard(): Response {
  try {
    const entries = getLeaderboard();
    return jsonOk(entries, { "Access-Control-Allow-Origin": "*" });
  } catch (err) {
    return jsonErr({ error: String(err) });
  }
}

function notifyDiscordLobbyCreated(lobbyId: string, token: string): void {
  fetch('https://discord.com/api/v10/channels/1488315244190236723/messages', {
    method: 'POST',
    headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `⚔️ **Adventurer** created a Clungiverse lobby! Join here: https://clung.us/clungiverse?lobby=${lobbyId}` }),
    signal: AbortSignal.timeout(8000),
  }).then(async (res) => {
    if (res.ok) {
      const data = await res.json() as { id: string };
      lobbyDiscordMessages.set(lobbyId, data.id);
    } else {
      const errText = await res.text();
      console.warn(`[clungiverse] Discord notify failed: ${String(res.status)} ${errText}`);
    }
  }).catch((err: unknown) => { console.warn('[clungiverse] Discord notify failed:', err); });
}

async function handleClungiverseLobbyCreate(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { userId: string; name: string };
    if (!body.userId || !body.name) return jsonErr({ error: "userId and name required" }, 400);
    const instance = createLobby(body.userId, body.name);
    const discordToken = process.env.DISCORD_BOT_TOKEN;
    if (discordToken) {
      notifyDiscordLobbyCreated(instance.lobbyId, discordToken);
    } else {
      console.warn('[clungiverse] DISCORD_BOT_TOKEN not set, skipping notification');
    }
    return jsonOk({ lobbyId: instance.lobbyId, hostId: body.userId });
  } catch (err) {
    return jsonErr({ error: String(err) });
  }
}

function handleClungiverseLobbyGet(lobbyId: string): Response {
  const instance = getInstance(lobbyId);
  if (!instance) return jsonErr({ error: "Lobby not found" }, 404);
  const players = Array.from(instance.players.values()).map((p) => ({
    playerId: p.id, name: p.name, personaSlug: p.personaSlug || null, ready: !!p.personaSlug,
  }));
  return jsonOk({ lobbyId: instance.lobbyId, status: instance.status, playerCount: instance.players.size, players });
}

async function handleClungiverseLobbyNotifyDiscord(lobbyId: string): Promise<Response> {
  try {
    const instance = getInstance(lobbyId);
    if (!instance) return jsonErr({ error: "Lobby not found" }, 404);
    const discordToken = process.env.DISCORD_BOT_TOKEN;
    if (!discordToken) return jsonErr({ error: "DISCORD_BOT_TOKEN not set" });
    const quickJoinUrl = `https://clung.us/clungiverse?lobby=${lobbyId}`;
    const discordRes = await fetch("https://discord.com/api/v10/channels/1488315244190236723/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bot ${discordToken}` },
      body: JSON.stringify({ content: `⚔️ **Adventurer** created a Clungiverse lobby! Join here: ${quickJoinUrl}` }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!discordRes.ok) {
      const errText = await discordRes.text();
      return jsonErr({ error: `Discord API error: ${String(discordRes.status)} ${errText}` }, 502);
    }
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonErr({ error: String(err) });
  }
}

async function handleClungiverseLobbyJoin(req: Request, lobbyId: string): Promise<Response> {
  try {
    const body = (await req.json()) as { userId: string; name: string };
    if (!body.userId || !body.name) return jsonErr({ error: "userId and name required" }, 400);
    const instance = joinLobby(lobbyId, body.userId, body.name);
    if (!instance) return jsonErr({ error: "Cannot join lobby (full, not found, or in progress)" }, 400);
    return jsonOk({ lobbyId: instance.lobbyId, joined: true });
  } catch (err) {
    return jsonErr({ error: String(err) });
  }
}

async function routeClungiverseLobbyById(req: Request, path: string): Promise<Response | null> {
  const lobbyGetMatch = path.match(/^\/api\/clungiverse\/lobby\/([^/]+)$/);
  if (lobbyGetMatch && req.method === "GET") return handleClungiverseLobbyGet(lobbyGetMatch[1]);

  const lobbyNotifyMatch = path.match(/^\/api\/clungiverse\/lobby\/([^/]+)\/notify-discord$/);
  if (lobbyNotifyMatch && req.method === "POST") return handleClungiverseLobbyNotifyDiscord(lobbyNotifyMatch[1]);

  const lobbyJoinMatch = path.match(/^\/api\/clungiverse\/lobby\/([^/]+)\/join$/);
  if (lobbyJoinMatch && req.method === "POST") return handleClungiverseLobbyJoin(req, lobbyJoinMatch[1]);

  return null;
}

async function handleClungiverseLobbyRoutes(req: Request, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/clungiverse/leaderboard" && req.method === "GET") return handleClungiverseLeaderboard();
  if (url.pathname === "/api/clungiverse/lobby/create" && req.method === "POST") return handleClungiverseLobbyCreate(req);
  return routeClungiverseLobbyById(req, url.pathname);
}

// ─── WebSocket upgrade helpers ────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
function tryUpgradeCommonsWs(
  req: Request,
  server: import("bun").Server,
  url: URL,
): Response | undefined {
  const userId = url.searchParams.get("userId") ?? "anonymous";
  const name = url.searchParams.get("name") ?? "unknown";
  const color = url.searchParams.get("color") ?? "#ffffff";
  const socketId = `${userId}-${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}`;
  const upgraded = server.upgrade(req, {
    data: { userId, name, color, socketId, chunkX: 0, chunkY: 0, lastSeen: Date.now() } satisfies SocketData,
  });
  if (upgraded) return undefined;
  return new Response("WebSocket upgrade failed", { status: 400 });
}

function tryUpgradeDungeonWs(
  req: Request,
  server: import("bun").Server,
  url: URL,
): Response | undefined {
  const userId = url.searchParams.get("userId") ?? "anonymous";
  const name = url.searchParams.get("name") ?? "unknown";
  const lobbyId = url.searchParams.get("lobbyId") ?? "";
  const socketId = `dng-${userId}-${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}`;
  const upgraded = server.upgrade(req, {
    data: { userId, name, socketId, lobbyId, isDungeon: true } satisfies DungeonSocketData,
  });
  if (upgraded) return undefined;
  return new Response("WebSocket upgrade failed", { status: 400 });
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

// ─── Bun server setup ─────────────────────────────────────────────────────────

const bunServer = serve<AnySocketData>({
  port: 8090,

  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") return tryUpgradeCommonsWs(req, server, url);
    if (url.pathname === "/dungeon-ws") return tryUpgradeDungeonWs(req, server, url);

    const adminRes = await handleAdminRoutes(req, url);
    if (adminRes) return adminRes;

    const auditionRes = await handleAuditionRoutes(req, url);
    if (auditionRes) return auditionRes;

    const clungiverseRes = await handleClungiverseLobbyRoutes(req, url);
    if (clungiverseRes) return clungiverseRes;

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws: import("bun").ServerWebSocket<AnySocketData>) {
      // ── Dungeon WebSocket ──
      if (ws.data.isDungeon) {
        const dws = ws as import("bun").ServerWebSocket<DungeonSocketData>;
        const { socketId, userId, name, lobbyId } = dws.data;
        dungeonSockets.set(socketId, dws);

        // Auto-reconnect if instance exists
        if (lobbyId) {
          const instance = handleReconnect(lobbyId, userId, socketId);
          if (instance) {
            dws.send(JSON.stringify({
              type: "d_welcome",
              playerId: userId,
              lobbyId: instance.lobbyId,
            }));

            // Send current lobby state if still in lobby phase
            if (instance.status === "lobby") {
              const players = Array.from(instance.players.values()).map((p) => ({
                playerId: p.id,
                name: p.name,
                personaSlug: p.personaSlug || null,
                ready: !!p.personaSlug,
              }));
              const hostId = instance.players.keys().next().value ?? "";
              dws.send(JSON.stringify({
                type: "d_lobby",
                lobbyId: instance.lobbyId,
                hostId,
                players,
                status: "waiting",
              }));
            }
          }
        }
        console.log(`[dungeon-ws] ${name} (${userId}) connected — socketId=${socketId}`);
        return;
      }

      // ── Commons WebSocket ──
      const { socketId, chunkX, chunkY, name, color, userId } = ws.data;
      ws.subscribe(`chunk:${String(chunkX)}:${String(chunkY)}`);

      // Ensure chunk data is loaded
      const chunkKey = `${String(chunkX)}:${String(chunkY)}`;
      if (!world.chunks.has(chunkKey)) {
        world.chunks.set(chunkKey, buildChunk(chunkX, chunkY));
      }

      const player: PlayerState = {
        socketId,
        name,
        color,
        x: 500, // pixel coords — V2 client canvas is 1000×700, center = (500, 350)
        y: 350,
        facing: "right",
        hopFrame: 0,
        isAway: false,
        chunkX,
        chunkY,
        lastSeen: Date.now(),
        lastProcessedInput: 0,
      };
      world.players.set(socketId, player);
      console.log(`[ws] Player ${name} (${userId}) connected — socketId=${socketId}`);

      // Send welcome message first so client knows its own socketId
      try {
        ws.send(JSON.stringify({ type: "welcome", socket_id: socketId }));
      } catch (e) {
        console.warn(`[ws] welcome send failed for ${socketId}:`, e);
        return;
      }

      // Send immediate full state to new player
      const chunkPlayers = Array.from(world.players.values()).filter(
        (p) => p.chunkX === chunkX && p.chunkY === chunkY
      );
      const initialTick = buildTickPayload(world, chunkKey, chunkPlayers, world.tickCount, Date.now());
      // Force NPC/warthog/congress into welcome even if no delta
      initialTick.npcs = Array.from(world.npcs.values());
      initialTick.warthog = { ...world.warthog, seats: [...world.warthog.seats] };
      initialTick.congress = { active: world.congress.active };
      // Include server-side worn path data so all clients see the shared world state
      const wornPaths = loadWornPathsForChunk(chunkX, chunkY);
      if (wornPaths.length > 0) initialTick.wornPaths = wornPaths;
      try {
        ws.send(JSON.stringify(initialTick));
      } catch (e) {
        console.warn(`[ws] initialTick send failed for ${socketId}:`, e);
      }
    },

    message(ws: import("bun").ServerWebSocket<AnySocketData>, rawMessage) {
      if (ws.data.isDungeon) {
        handleDungeonWsMessage(ws as import("bun").ServerWebSocket<DungeonSocketData>, rawMessage.toString());
        return;
      }
      handleCommonsWsMessage(ws as import("bun").ServerWebSocket<SocketData>, rawMessage.toString());
    },

    close(ws: import("bun").ServerWebSocket<AnySocketData>) {
      // ── Dungeon WebSocket close ──
      if (ws.data.isDungeon) {
        const { socketId, userId, lobbyId, name } = ws.data;
        dungeonSockets.delete(socketId);
        if (lobbyId) {
          handleDisconnect(lobbyId, userId);
        }
        console.log(`[dungeon-ws] ${name} disconnected (${socketId})`);
        return;
      }

      // ── Commons WebSocket close ──
      const { socketId, chunkX, chunkY, name } = ws.data;
      ws.unsubscribe(`chunk:${String(chunkX)}:${String(chunkY)}`);

      // Remove from warthog seats if present
      const seatIdx = world.warthog.seats.indexOf(socketId);
      if (seatIdx >= 0) {
        world.warthog.seats[seatIdx] = null;
      }

      world.players.delete(socketId);
      console.log(`[ws] Player ${name} disconnected (${socketId})`);
    },

    idleTimeout: 30,
  },
});

// ─── Loot system init ──────────────────────────────────────────────────────

initLootSystem(db);
initMobRegistry(db);

// ─── Dungeon loop setup ─────────────────────────────────────────────────────

// Wire dungeon send function to route messages through dungeonSockets
const dungeonSendFn = (playerId: string, msg: DungeonServerMessage): void => {
  for (const [_sid, sock] of dungeonSockets) {
    if (sock.data.userId === playerId) {
      try {
        sock.send(JSON.stringify(msg));
      } catch (err: unknown) {
        console.error(`[dungeon] Failed to send to ${playerId}:`, err);
      }
      break;
    }
  }
};
setSendFunction(dungeonSendFn);
setManagerSendFunction(dungeonSendFn);

// Start the 16Hz dungeon tick loop
startDungeonLoop();
console.log("[commons-server] Dungeon loop started");

// ─── Chunk subscription callback ─────────────────────────────────────────────

setChunkSubscriptionCallback((socketId, oldChunkX, oldChunkY, newChunkX, newChunkY) => {
  // Find the ServerWebSocket for this socketId
  // Bun doesn't expose a lookup — we rely on the world.players map for state,
  // but the WS subscription is managed via ws.subscribe/unsubscribe in handlers.
  // Since we can't look up ws by socketId here, chunk pub/sub re-subscription
  // happens when the player sends their next "chunk" message via the ws handler.
  // The player will still receive ticks in their new chunk after the update.

  // Ensure new chunk data is loaded
  const newKey = `${String(newChunkX)}:${String(newChunkY)}`;
  if (!world.chunks.has(newKey)) {
    world.chunks.set(newKey, buildChunk(newChunkX, newChunkY));
  }
});

setForceSyncCallback((_socketId: string) => {
  // Full resync will happen on next broadcast since we always send all players
});

// ─── Broadcast helper ─────────────────────────────────────────────────────────

const broadcast: BroadcastFn = (chunkX, chunkY, payload) => {
  bunServer.publish(`chunk:${String(chunkX)}:${String(chunkY)}`, payload);
};

// ─── 20Hz game tick loop ─────────────────────────────────────────────────────

const tickInterval = setInterval(() => {
  try {
    runTick(world, broadcast);
  } catch (err) {
    console.error("[game-loop] Tick error:", err);
    // Don't swallow — but don't crash the whole server either; log and continue
  }
}, 50); // 20Hz

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on("SIGTERM", () => {
  console.log("[commons-server] SIGTERM received — flushing state and shutting down");
  clearInterval(tickInterval);
  stopDungeonLoop();
  try {
    persistState(world);
  } catch (err) {
    console.error("[shutdown] Final persist failed:", err);
  }
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[commons-server] SIGINT received — shutting down");
  clearInterval(tickInterval);
  process.exit(0);
});

// ─── Start audition walker spawning ──────────────────────────────────────────
// Spawning works with ANTHROPIC_API_KEY (direct API) or falls back to claude CLI
startSpawnSchedule(world);
console.log("[commons-server] Audition walker spawning enabled");

console.log(`[commons-server] Listening on :8090 — 20Hz tick, ${String(world.npcs.size)} NPCs loaded`);
