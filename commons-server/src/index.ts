// Commons Game Server — Bun WS on :8090
// Phases 1 & 2: tile-aware NPC AI, SQLite, 20Hz tick, player validation, delta snapshots

import { serve } from "bun";
import type {
  WorldState,
  PlayerState,
  ClientToServerMessage,
  WornPathMessage,
} from "./protocol.ts";
import { buildChunk } from "./map.ts";
import { initNpcs } from "./npc-ai.ts";
import {
  runTick,
  handleClientMessage,
  setChunkSubscriptionCallback,
  setForceSyncCallback,
  buildTickPayload,
  type BroadcastFn,
} from "./game-loop.ts";
import { loadNpcPositions, recordWornPath, persistState, resetNpcPositionsInDb, loadWornPathsForChunk, getLeaderboard } from "./persistence.ts";
import { handleWalkerInteraction } from "./game-loop.ts";
import { resetNpcPositions } from "./npc-ai.ts";
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
import { db } from "./persistence.ts";

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
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    console.warn(`[clungiverse] Discord message PATCH failed: ${res.status} ${errText}`);
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
  } catch (err) {
    congressPollFailures = (congressPollFailures ?? 0) + 1;
    if (congressPollFailures === 1 || congressPollFailures % 10 === 0) {
      console.warn(`[congress-poll] clunger unreachable (${congressPollFailures} failures):`, err);
    }
  }
}

// Poll congress state every 10s
setInterval(() => {
  pollCongressState().catch((err) => console.error("[congress-poll] Error:", err));
}, 10_000);

// ─── Bun server setup ─────────────────────────────────────────────────────────

const bunServer = serve<AnySocketData>({
  port: 8090,

  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const userId = url.searchParams.get("userId") ?? "anonymous";
      const name = url.searchParams.get("name") ?? "unknown";
      const color = url.searchParams.get("color") ?? "#ffffff";
      const socketId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const upgraded = server.upgrade(req, {
        data: {
          userId,
          name,
          color,
          socketId,
          chunkX: 0,
          chunkY: 0,
          lastSeen: Date.now(),
        } satisfies SocketData,
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", players: world.players.size, tick: world.tickCount }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Admin: toggle congress state (internal use)
    if (url.pathname === "/admin/congress" && req.method === "POST") {
      return req.json().then(
        (body: { active: boolean }) => {
          world.congress.active = !!body.active;
          console.log(`[admin] Congress active: ${world.congress.active}`);
          return new Response(JSON.stringify({ active: world.congress.active }), {
            headers: { "Content-Type": "application/json" },
          });
        },
        (err) => {
          console.error("[admin] Congress toggle failed to parse body:", err);
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      );
    }

    // Admin: reset all NPC positions to center of chunk (0,0)
    // Called after terrain modifications or when NPCs are stuck in impassable tiles.
    if (url.pathname === "/admin/reset-npcs" && req.method === "POST") {
      try {
        const npcNames = Array.from(world.npcs.keys());
        const center = resetNpcPositionsInDb(npcNames);
        resetNpcPositions(world.npcs, center.x, center.y);

        // Force a full NPC broadcast on the next tick by clearing lastSentState
        // (accomplished by simply logging; the delta logic will detect position changes)
        console.log(`[admin] NPC reset triggered — ${npcNames.length} NPCs moved to center (${center.x}, ${center.y})`);
        return new Response(
          JSON.stringify({ ok: true, npcsReset: npcNames.length, center }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (err) {
        console.error("[admin] NPC reset failed:", err);
        return new Response(
          JSON.stringify({ error: String(err) }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Admin: notify server that terrain/map was modified — resets NPC positions
    // to prevent NPCs being stuck in newly-impassable tiles.
    if (url.pathname === "/admin/terrain-changed" && req.method === "POST") {
      try {
        const npcNames = Array.from(world.npcs.keys());
        const center = resetNpcPositionsInDb(npcNames);
        resetNpcPositions(world.npcs, center.x, center.y);

        // Rebuild chunk (0,0) from scratch so the server walkability grid reflects the change
        chunks.set("0:0", buildChunk(0, 0));

        console.log(`[admin] Terrain changed — rebuilt chunk (0,0) and reset ${npcNames.length} NPCs to center`);
        return new Response(
          JSON.stringify({ ok: true, npcsReset: npcNames.length, center, chunkRebuilt: "0:0" }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (err) {
        console.error("[admin] terrain-changed handler failed:", err);
        return new Response(
          JSON.stringify({ error: String(err) }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // ── Audition REST endpoints ──────────────────────────────────────────────
    if (url.pathname === "/api/audition/walkers" && req.method === "GET") {
      return getWalkersResponse(world);
    }

    if (url.pathname === "/api/audition/pause" && req.method === "POST") {
      const body = (await req.json()) as { id: string };
      return pauseWalker(world, body.id);
    }

    if (url.pathname === "/api/audition/resume" && req.method === "POST") {
      const body = (await req.json()) as { id: string };
      return resumeWalker(world, body.id);
    }

    if (url.pathname === "/api/audition/keep" && req.method === "POST") {
      const body = (await req.json()) as { id: string };
      return keepWalker(world, body.id);
    }

    if (url.pathname === "/api/audition/dismiss" && req.method === "POST") {
      const body = (await req.json()) as { id: string };
      return dismissWalker(world, body.id);
    }

    // ── Clungiverse Dungeon WebSocket upgrade ─────────────────────────────
    if (url.pathname === "/dungeon-ws") {
      const userId = url.searchParams.get("userId") ?? "anonymous";
      const name = url.searchParams.get("name") ?? "unknown";
      const lobbyId = url.searchParams.get("lobbyId") ?? "";
      const socketId = `dng-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const upgraded = server.upgrade(req, {
        data: {
          userId,
          name,
          socketId,
          lobbyId,
          isDungeon: true,
        } satisfies DungeonSocketData,
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // ── Clungiverse REST routes ─────────────────────────────────────────
    if (url.pathname === "/api/clungiverse/lobby/create" && req.method === "POST") {
      try {
        const body = (await req.json()) as { userId: string; name: string };
        if (!body.userId || !body.name) {
          return new Response(JSON.stringify({ error: "userId and name required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const instance = createLobby(body.userId, body.name);

        // Auto-notify #clungiverse channel and store the returned message ID for later editing
        const discordToken = process.env.DISCORD_BOT_TOKEN;
        if (discordToken) {
          fetch('https://discord.com/api/v10/channels/1488315244190236723/messages', {
            method: 'POST',
            headers: {
              'Authorization': `Bot ${discordToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: `⚔️ **Adventurer** created a Clungiverse lobby! Join here: https://clung.us/clungiverse?lobby=${instance.lobbyId}`,
            }),
          }).then(async (res) => {
            if (res.ok) {
              const data = await res.json() as { id: string };
              lobbyDiscordMessages.set(instance.lobbyId, data.id);
            } else {
              const errText = await res.text();
              console.warn(`[clungiverse] Discord notify failed: ${res.status} ${errText}`);
            }
          }).catch((err) => console.warn('[clungiverse] Discord notify failed:', err));
        } else {
          console.warn('[clungiverse] DISCORD_BOT_TOKEN not set, skipping notification');
        }

        return new Response(
          JSON.stringify({ lobbyId: instance.lobbyId, hostId: body.userId }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // GET /api/clungiverse/leaderboard
    if (url.pathname === "/api/clungiverse/leaderboard" && req.method === "GET") {
      try {
        const entries = getLeaderboard();
        return new Response(JSON.stringify(entries), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // GET /api/clungiverse/lobby/:id
    const lobbyGetMatch = url.pathname.match(/^\/api\/clungiverse\/lobby\/([^/]+)$/);
    if (lobbyGetMatch && req.method === "GET") {
      const lobbyId = lobbyGetMatch[1];
      const instance = getInstance(lobbyId);
      if (!instance) {
        return new Response(JSON.stringify({ error: "Lobby not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      const players = Array.from(instance.players.values()).map((p) => ({
        playerId: p.id,
        name: p.name,
        personaSlug: p.personaSlug || null,
        ready: !!p.personaSlug,
      }));
      return new Response(
        JSON.stringify({
          lobbyId: instance.lobbyId,
          status: instance.status,
          playerCount: instance.players.size,
          players,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // POST /api/clungiverse/lobby/:id/notify-discord
    const lobbyNotifyMatch = url.pathname.match(/^\/api\/clungiverse\/lobby\/([^/]+)\/notify-discord$/);
    if (lobbyNotifyMatch && req.method === "POST") {
      try {
        const lobbyId = lobbyNotifyMatch[1];
        const instance = getInstance(lobbyId);
        if (!instance) {
          return new Response(JSON.stringify({ error: "Lobby not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        const quickJoinUrl = `https://clung.us/clungiverse?lobby=${lobbyId}`;
        const discordToken = process.env.DISCORD_BOT_TOKEN;
        if (!discordToken) {
          return new Response(JSON.stringify({ error: "DISCORD_BOT_TOKEN not set" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const discordRes = await fetch("https://discord.com/api/v10/channels/1488315244190236723/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bot ${discordToken}`,
          },
          body: JSON.stringify({
            content: `⚔️ **Adventurer** created a Clungiverse lobby! Join here: ${quickJoinUrl}`,
          }),
        });
        if (!discordRes.ok) {
          const errText = await discordRes.text();
          return new Response(JSON.stringify({ error: `Discord API error: ${discordRes.status} ${errText}` }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // POST /api/clungiverse/lobby/:id/join
    const lobbyJoinMatch = url.pathname.match(/^\/api\/clungiverse\/lobby\/([^/]+)\/join$/);
    if (lobbyJoinMatch && req.method === "POST") {
      try {
        const lobbyId = lobbyJoinMatch[1];
        const body = (await req.json()) as { userId: string; name: string };
        if (!body.userId || !body.name) {
          return new Response(JSON.stringify({ error: "userId and name required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const instance = joinLobby(lobbyId, body.userId, body.name);
        if (!instance) {
          return new Response(JSON.stringify({ error: "Cannot join lobby (full, not found, or in progress)" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ lobbyId: instance.lobbyId, joined: true }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

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
      const { socketId, chunkX, chunkY, name, color, userId } = ws.data as SocketData;
      ws.subscribe(`chunk:${chunkX}:${chunkY}`);

      // Ensure chunk data is loaded
      const chunkKey = `${chunkX}:${chunkY}`;
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
      ws.send(JSON.stringify({ type: "welcome", socket_id: socketId }));

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
      ws.send(JSON.stringify(initialTick));
    },

    message(ws: import("bun").ServerWebSocket<AnySocketData>, rawMessage) {
      // ── Dungeon WebSocket messages ──
      if (ws.data.isDungeon) {
        const dws = ws as import("bun").ServerWebSocket<DungeonSocketData>;
        const { userId, lobbyId } = dws.data;
        let msg: DungeonClientMessage;
        try {
          msg = JSON.parse(rawMessage.toString()) as DungeonClientMessage;
        } catch {
          return;
        }
        const sendToPlayer = (targetId: string, serverMsg: DungeonServerMessage) => {
          for (const [_sid, sock] of dungeonSockets) {
            if (sock.data.userId === targetId) {
              sock.send(JSON.stringify(serverMsg));
              break;
            }
          }
        };

        // Intercept d_start to trigger floor generation after startRun
        // Only the host (first player in the lobby) can start
        if (msg.type === "d_start") {
          const inst = getInstance(lobbyId);
          if (inst && inst.status === "lobby") {
            const hostId = inst.players.keys().next().value ?? "";
            if (userId !== hostId) {
              console.warn(`[dungeon-ws] Non-host ${userId} tried to start lobby ${lobbyId}`);
              return;
            }
            const started = startRun(lobbyId, !!msg.skipGen);
            if (started) {
              const playerCount = started.players.size;

              // Edit the lobby Discord notification to show the game is in progress
              updateLobbyDiscordMessage(
                lobbyId,
                `~~⚔️ **Adventurer** created a Clungiverse lobby! Join here: https://clung.us/clungiverse?lobby=${lobbyId}~~ *(game in progress)*`
              ).catch((err) => console.warn(`[dungeon-ws] Failed to update lobby Discord message: ${err}`));

              // Step 1: Send loading status immediately so the overlay appears
              const mobTotal = mobRegistry.size;
              const mobLoadingMsg: DungeonServerMessage = {
                type: "d_mob_progress",
                completed: 0,
                total: mobTotal,
                currentEntity: "Preparing mobs...",
                status: "loading",
              };
              for (const [_sid, sock] of dungeonSockets) {
                if (sock.data.lobbyId === lobbyId) {
                  sock.send(JSON.stringify(mobLoadingMsg));
                }
              }

              // Step 2: After 600ms, send complete status
              setTimeout(() => {
                const mobCompleteMsg: DungeonServerMessage = {
                  type: "d_mob_progress",
                  completed: mobTotal,
                  total: mobTotal,
                  currentEntity: "Ready",
                  status: "complete",
                };
                for (const [_sid, sock] of dungeonSockets) {
                  if (sock.data.lobbyId === lobbyId) {
                    sock.send(JSON.stringify(mobCompleteMsg));
                  }
                }
              }, 600);

              // Step 3: After 800ms, init the floor (loading screen visible for ~800ms total)
              setTimeout(() => {
                initFloor(started);
              }, 800);

              // Trigger MobGenerationWorkflow in background for future run enrichment
              // Fire-and-forget: don't block game start on LLM generation
              // Skip if the host requested cached-only mode (skipGen: true)
              if (!msg.skipGen) {
                const workflowId = `mob-gen-${started.id}-${Date.now()}`;
                const excludeNames = Array.from(started.players.values())
                  .map((p) => p.name);
                (async () => {
                  try {
                    const { Client, Connection } = await import("@temporalio/client");
                    const connection = await Connection.connect({ address: "localhost:7233" });
                    const client = new Client({ connection });
                    await client.workflow.start("MobGenerationWorkflow", {
                      workflowId,
                      taskQueue: "listings-queue",
                      args: [30, excludeNames],
                    });
                    console.log(`[dungeon-ws] MobGenerationWorkflow started: ${workflowId}`);
                  } catch (err) {
                    console.warn("[dungeon-ws] MobGenerationWorkflow trigger failed:", err);
                  }
                })();
              } else {
                console.log(`[dungeon-ws] skipGen=true — skipping MobGenerationWorkflow for lobby ${lobbyId}`);
              }
            }
          }
          return;
        }

        // Intercept d_power to queue power activation
        if (msg.type === "d_power") {
          const inst = getInstance(lobbyId);
          if (inst && (inst.status === "running" || inst.status === "boss")) {
            queuePowerActivation(inst.id, userId);
          }
          return;
        }

        // Intercept d_pick_powerup to handle powerup selection between floors
        if (msg.type === "d_pick_powerup") {
          const inst = getInstance(lobbyId);
          if (inst && inst.status === "between_floors") {
            handlePowerupPick(inst.id, userId, msg.powerupId);
          }
          return;
        }

        handleDungeonMessage(lobbyId, userId, msg, sendToPlayer);
        return;
      }

      // ── Commons WebSocket messages ──
      const { socketId } = ws.data as SocketData;
      const player = world.players.get(socketId);
      if (!player) return;

      player.lastSeen = Date.now();
      ws.data.lastSeen = player.lastSeen;

      let msg: ClientToServerMessage;
      try {
        msg = JSON.parse(rawMessage.toString()) as ClientToServerMessage;
      } catch (err) {
        console.error(`[ws] Invalid JSON from ${socketId}:`, err);
        return;
      }

      // worn_path needs async SQLite write — handle separately
      if (msg.type === "worn_path") {
        const wpm = msg as WornPathMessage;
        recordWornPath(wpm.chunkX, wpm.chunkY, wpm.tileX, wpm.tileY);
        return;
      }

      handleClientMessage(socketId, msg, world);
    },

    close(ws: import("bun").ServerWebSocket<AnySocketData>) {
      // ── Dungeon WebSocket close ──
      if (ws.data.isDungeon) {
        const { socketId, userId, lobbyId, name } = ws.data as DungeonSocketData;
        dungeonSockets.delete(socketId);
        if (lobbyId) {
          handleDisconnect(lobbyId, userId);
        }
        console.log(`[dungeon-ws] ${name} disconnected (${socketId})`);
        return;
      }

      // ── Commons WebSocket close ──
      const { socketId, chunkX, chunkY, name } = ws.data as SocketData;
      ws.unsubscribe(`chunk:${chunkX}:${chunkY}`);

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
const dungeonSendFn = (playerId: string, msg: DungeonServerMessage) => {
  for (const [_sid, sock] of dungeonSockets) {
    if (sock.data.userId === playerId) {
      try {
        sock.send(JSON.stringify(msg));
      } catch (err) {
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
  const newKey = `${newChunkX}:${newChunkY}`;
  if (!world.chunks.has(newKey)) {
    world.chunks.set(newKey, buildChunk(newChunkX, newChunkY));
  }
});

setForceSyncCallback((_socketId: string) => {
  // Full resync will happen on next broadcast since we always send all players
});

// ─── Broadcast helper ─────────────────────────────────────────────────────────

const broadcast: BroadcastFn = (chunkX, chunkY, payload) => {
  bunServer.publish(`chunk:${chunkX}:${chunkY}`, payload);
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

console.log(`[commons-server] Listening on :8090 — 20Hz tick, ${world.npcs.size} NPCs loaded`);
