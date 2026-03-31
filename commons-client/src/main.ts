// main.ts — Init, rAF game loop
// Entry point for CommonsV2. Owns the canvas, runs the loop.

import { createWorldState, TILE , NPC_HIT_RADIUS } from "./state.ts";
import { initInput, getInput, getLastInputAt } from "./input.ts";
import { initNetwork, sendMove, sendChunk, sendStatus, sendWarthog, sendWornPath } from "./network.ts";
import { tickLocalPlayer } from "./entities/local-player.ts";
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
const canvasEl = canvas.getContext("2d");
if (!canvasEl) throw new Error("Could not get 2d canvas context");
const ctx = canvasEl;

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

function tryStartDrag(mx: number, my: number): void {
  if (!mousedownNPC || draggingNPC) return;
  if (performance.now() - mousedownAt <= DRAG_THRESHOLD_MS) return;
  const npc = state.npcs.get(mousedownNPC);
  if (npc) {
    draggingNPC = mousedownNPC;
    dragOffsetX = npc.displayX - mx;
    dragOffsetY = npc.displayY - my;
  }
  mousedownNPC = null;
}

function applyDrag(mx: number, my: number): boolean {
  if (!draggingNPC) return false;
  const npc = state.npcs.get(draggingNPC);
  if (npc) {
    npc.displayX = mx + dragOffsetX;
    npc.displayY = my + dragOffsetY;
  }
  canvas.style.cursor = "grabbing";
  return true;
}

function isOverNPC(mx: number, my: number): boolean {
  for (const npc of state.npcs.values()) {
    const dx = mx - npc.displayX;
    const dy = my - (npc.displayY - 8);
    if (Math.abs(dx) < NPC_HIT_RADIUS && Math.abs(dy) < NPC_HIT_RADIUS + 4) return true;
  }
  return false;
}

// mousemove — begin drag if held long enough
canvas.addEventListener("mousemove", (e: MouseEvent) => {
  const { mx, my } = canvasCoords(e);
  state.mouseX = mx;
  state.mouseY = my;

  tryStartDrag(mx, my);
  if (applyDrag(mx, my)) return;

  updateWalkerHover(state, mx, my);
  canvas.style.cursor = isOverNPC(mx, my) ? "pointer" : "default";
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

function tickMovement(now: number, dt: number): boolean {
  const input = getInput();
  const { chunkChanged, moved } = state.seatedInWarthog
    ? { chunkChanged: false, moved: false }
    : tickLocalPlayer(state, input, dt);

  if (moved && state.localPlayer && state.localPlayer.inputSeq !== lastMoveSeq) {
    if (now - lastMoveSent >= MOVE_SEND_INTERVAL_MS) {
      lastMoveSeq = state.localPlayer.inputSeq;
      lastMoveSent = now;
      sendMove(state);
    }
  }

  return chunkChanged;
}

function tickWornPaths(): void {
  if (!state.localPlayer || !state.map) return;
  const tileX = Math.floor(state.localPlayer.x / TILE);
  const tileY = Math.floor(state.localPlayer.y / TILE);
  if (tileX !== lastWornTileX || tileY !== lastWornTileY) {
    lastWornTileX = tileX;
    lastWornTileY = tileY;
    recordTileVisit(tileX, tileY);
    sendWornPath(state.localPlayer.chunkX, state.localPlayer.chunkY, tileX, tileY);
  }
}

function handleChunkChange(): void {
  if (!state.localPlayer) return;
  const { chunkX, chunkY } = state.localPlayer;
  sendChunk(chunkX, chunkY);
  state.map = getChunk(chunkX, chunkY);
  state.mapChunkX = chunkX;
  state.mapChunkY = chunkY;
  invalidateTileCache();
  lastWornTileX = -1;
  lastWornTileY = -1;
}

function loop(now: number): void {
  const dtMs = now - lastFrameTime;
  lastFrameTime = now;
  const dt = dtMs / 1000;
  state.frame++;

  const chunkChanged = tickMovement(now, dt);
  tickWornPaths();
  if (chunkChanged) handleChunkChange();

  tickRemotePlayers(state.remotePlayers, now);
  tickNPCs(state.npcs, now);
  tickWarthog(state, sendWarthog);
  tickCongressModal(state);
  tickDungeonModal(state);
  tickLeaderboardModal(state);

  render(state, ctx, state.frame);
  requestAnimationFrame(loop);
}

interface MeResponse {
  username?: string;
  login?: string;
  name?: string;
  color?: string;
}

async function fetchPlayerInfo(): Promise<void> {
  const res = await fetch("/api/me");
  if (!res.ok) return;
  const data = await res.json() as MeResponse;
  const name = data.username ?? data.login ?? data.name ?? null;
  if (name) state.playerName = name;
  if (data.color) state.playerColor = data.color;
}

// Fetch player name/color from /api/me before connecting — so WS sends correct name
async function fetchAndConnect(): Promise<void> {
  try {
    await fetchPlayerInfo();
  } catch {
    // /api/me not available — keep random name
  }
  initNetwork(state);
  requestAnimationFrame(loop);
}

void fetchAndConnect();

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
