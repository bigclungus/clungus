// main.ts — Init, rAF game loop
// Entry point for CommonsV2. Owns the canvas, runs the loop.

import { createWorldState, TILE } from "./state.ts";
import { initInput, getInput, getLastInputAt } from "./input.ts";
import { initNetwork, sendMove, sendHop, sendChunk, sendStatus, sendWarthog, sendWornPath } from "./network.ts";
import { tickLocalPlayer } from "./entities/local-player.ts";
import { NPC_HIT_RADIUS } from "./state.ts";
import { tickRemotePlayers } from "./entities/remote-player.ts";
import { tickNPCs } from "./entities/npc.ts";
import { tickWarthog, initWarthogInput } from "./entities/warthog.ts";
import { initWalkerPolling, updateWalkerHover, handleWalkerClick, closeWalkerCardIfOpen } from "./entities/walker.ts";
import { getChunk } from "./map/chunk.ts";
import { invalidateTileCache } from "./map/renderer.ts";
import { recordTileVisit } from "./map/worn-paths.ts";
import { render } from "./renderer.ts";
import { initChatModal, checkNPCClick } from "./ui/chat-modal.ts";
import { initCongressModal, tickCongressModal } from "./ui/congress-modal.ts";
import { initDungeonModal, tickDungeonModal } from "./ui/dungeon-modal.ts";
import { initLeaderboardModal, tickLeaderboardModal } from "./ui/leaderboard-modal.ts";
import { validateSprites } from "./sprites.ts";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const state = createWorldState();

// -- Init -------------------------------------------------------------------

initInput();
initChatModal();
initCongressModal();
initDungeonModal();
initLeaderboardModal();
initWarthogInput(state);
initWalkerPolling(state);

// -- NPC drag-and-drop state ------------------------------------------------
// Short click → open chat modal.  Hold > DRAG_THRESHOLD_MS → drag NPC.
// (Dragging is client-side visual only; NPCs snap back when the server sends
// the next tick. Full server-side NPC dragging is not implemented.)

const DRAG_THRESHOLD_MS = 250;
// NPC_HIT_RADIUS is imported from state.ts (shared with renderer.ts)

let mousedownAt = 0;
let mousedownNPC: string | null = null;
let draggingNPC: string | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

function canvasCoords(e: MouseEvent): { mx: number; my: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    mx: (e.clientX - rect.left) * scaleX,
    my: (e.clientY - rect.top) * scaleY,
  };
}

function npcAtPoint(mx: number, my: number): string | null {
  for (const npc of state.npcs.values()) {
    const dx = mx - npc.displayX;
    const dy = my - (npc.displayY - 8);
    if (Math.abs(dx) < NPC_HIT_RADIUS && Math.abs(dy) < NPC_HIT_RADIUS + 4) {
      return npc.name;
    }
  }
  return null;
}

// mousedown — record start for drag/click disambiguation
canvas.addEventListener("mousedown", (e: MouseEvent) => {
  const { mx, my } = canvasCoords(e);
  const hit = npcAtPoint(mx, my);
  if (hit) {
    mousedownAt = performance.now();
    mousedownNPC = hit;
    e.preventDefault(); // avoid text selection during drag
  }
});

// mousemove — begin drag if held long enough
canvas.addEventListener("mousemove", (e: MouseEvent) => {
  const { mx, my } = canvasCoords(e);
  state.mouseX = mx;
  state.mouseY = my;

  // Start drag if threshold exceeded
  if (mousedownNPC && !draggingNPC && performance.now() - mousedownAt > DRAG_THRESHOLD_MS) {
    const npc = state.npcs.get(mousedownNPC);
    if (npc) {
      draggingNPC = mousedownNPC;
      dragOffsetX = npc.displayX - mx;
      dragOffsetY = npc.displayY - my;
    }
    mousedownNPC = null;
  }

  // Apply drag
  if (draggingNPC) {
    const npc = state.npcs.get(draggingNPC);
    if (npc) {
      npc.displayX = mx + dragOffsetX;
      npc.displayY = my + dragOffsetY;
    }
    canvas.style.cursor = "grabbing";
    return;
  }

  // Walker hover
  updateWalkerHover(state, mx, my);

  // Cursor feedback: pointer when hovering over any NPC
  let overNPC = false;
  for (const npc of state.npcs.values()) {
    const dx = mx - npc.displayX;
    const dy = my - (npc.displayY - 8);
    if (Math.abs(dx) < NPC_HIT_RADIUS && Math.abs(dy) < NPC_HIT_RADIUS + 4) {
      overNPC = true;
      break;
    }
  }
  canvas.style.cursor = overNPC ? "pointer" : "default";
});

// mouseup — either end drag or fire click
canvas.addEventListener("mouseup", (e: MouseEvent) => {
  const { mx, my } = canvasCoords(e);

  if (draggingNPC) {
    // End drag — NPC position will snap back on next server tick
    draggingNPC = null;
    canvas.style.cursor = "default";
    return;
  }

  if (mousedownNPC) {
    // Short click → open chat modal
    checkNPCClick(state, mx, my);
    mousedownNPC = null;
  }
});

// click — for walkers (NPC clicks handled in mouseup)
canvas.addEventListener("click", (e: MouseEvent) => {
  if (draggingNPC) return; // ignore clicks that ended a drag
  const { mx, my } = canvasCoords(e);

  // Walker click check
  handleWalkerClick(state, mx, my, e.clientX, e.clientY);
});

canvas.addEventListener("mouseleave", () => {
  state.mouseX = -1;
  state.mouseY = -1;
  if (!draggingNPC) canvas.style.cursor = "default";
  closeWalkerCardIfOpen();
});

// -- Game loop --------------------------------------------------------------

let lastFrameTime = performance.now();
let lastMoveSeq = -1;
let lastMoveSent = 0;
const MOVE_SEND_INTERVAL_MS = 50; // 20Hz max — matches server tick rate

// Worn path: track last tile the player was on to avoid redundant recording
let lastWornTileX = -1;
let lastWornTileY = -1;
// Throttle WS worn_path messages (send at most once per tile visit, not every frame)

function loop(now: number): void {
  const dtMs = now - lastFrameTime;
  lastFrameTime = now;
  const dt = dtMs / 1000; // convert to seconds for frame-rate-independent movement
  state.frame++;

  const input = getInput();

  // Tick local player (suppress movement when seated in warthog — server controls position)
  const { dx, dy, chunkChanged, moved } = state.seatedInWarthog
    ? { dx: 0, dy: 0, chunkChanged: false, moved: false }
    : tickLocalPlayer(state, input, dt);

  // Send movement to server at most 20Hz (50ms intervals) to avoid flooding server
  if (moved && state.localPlayer && state.localPlayer.inputSeq !== lastMoveSeq) {
    if (now - lastMoveSent >= MOVE_SEND_INTERVAL_MS) {
      lastMoveSeq = state.localPlayer.inputSeq;
      lastMoveSent = now;
      sendMove(state);
    }
  }

  // Record worn path tile visits
  if (state.localPlayer && state.map) {
    const tileX = Math.floor(state.localPlayer.x / TILE);
    const tileY = Math.floor(state.localPlayer.y / TILE);
    if (tileX !== lastWornTileX || tileY !== lastWornTileY) {
      lastWornTileX = tileX;
      lastWornTileY = tileY;
      recordTileVisit(tileX, tileY);
      // Also notify server (fire-and-forget)
      sendWornPath(state.localPlayer.chunkX, state.localPlayer.chunkY, tileX, tileY);
    }
  }

  // Handle chunk crossing
  if (chunkChanged && state.localPlayer) {
    const { chunkX, chunkY } = state.localPlayer;
    sendChunk(chunkX, chunkY);
    // Load new chunk map
    state.map = getChunk(chunkX, chunkY);
    state.mapChunkX = chunkX;
    state.mapChunkY = chunkY;
    invalidateTileCache();
    // Reset worn tile tracking on chunk change
    lastWornTileX = -1;
    lastWornTileY = -1;
  }

  // Interpolate remote entities
  tickRemotePlayers(state.remotePlayers, now);
  tickNPCs(state.npcs, now);

  // Warthog tick (E-key join/leave, WASD driving)
  tickWarthog(state, (type, payload) => sendWarthog(type, payload));

  // Congress building entry check
  tickCongressModal(state);

  // Dungeon entrance entry check
  tickDungeonModal(state);

  // Leaderboard proximity check
  tickLeaderboardModal(state);

  // Render
  render(state, ctx, state.frame);

  requestAnimationFrame(loop);
}

// Fetch player name/color from /api/me before connecting — so WS sends correct name
async function fetchAndConnect(): Promise<void> {
  try {
    const res = await fetch("/api/me");
    if (res.ok) {
      const data = await res.json();
      // /api/me returns { username: string|null }
      const name = data?.username ?? data?.login ?? data?.name ?? null;
      if (name) {
        state.playerName = name;
      }
      if (data?.color) {
        state.playerColor = data.color;
      }
    }
  } catch {
    // /api/me not available — keep random name
  }
  initNetwork(state);
  requestAnimationFrame(loop);
}

fetchAndConnect();

// Item 9: Idle timer for away detection (additive to visibilitychange handler in network.ts)
const IDLE_THRESHOLD_MS = 60_000;
setInterval(() => {
  if (!state.localPlayer) return;
  const idle = Date.now() - getLastInputAt() > IDLE_THRESHOLD_MS;
  if (idle !== state.localPlayer.isAway) {
    state.localPlayer.isAway = idle;
    sendStatus(idle);
  }
}, 5_000);

// Item 10: Sprite load validation — delay 2s to allow sprite scripts to load
setTimeout(() => {
  validateSprites();
}, 2_000);
