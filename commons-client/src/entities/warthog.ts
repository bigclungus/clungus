// entities/warthog.ts — Warthog vehicle rendering, boarding, and driving
//
// Server is authoritative over warthog position and seats.
// Client sends warthog_join / warthog_leave / warthog_input messages.
// E-key toggles join/leave. WASD drives when seated as driver (seat 0).
//
// Mutation contract: this module writes state.seatedInWarthog and
// state.warthogDrive (both in WorldState). All other state fields are read-only
// from this module's perspective.
//
// Drive input is only sent when dx/dy change — reset when not seated so the
// first send after re-boarding always goes through.

import { WorldState } from "../state.ts";

const WARTHOG_W = 60;

// Approximate distance threshold to board the warthog
const BOARD_DISTANCE = 60;

// ── Key state for warthog driving ───────────────────────────────────────────
// Drive state lives in WorldState.warthogDrive — not module-level variables —
// so there are no hidden mutable singletons in this module.

let lastSentDx = 0;
let lastSentDy = 0;

function isTextInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

type WarthogDrive = WorldState["warthogDrive"];

const WARTHOG_MOVE_KEYS: Partial<Record<string, keyof WarthogDrive>> = {
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
};

function applyWarthogKeyDown(e: KeyboardEvent, d: WarthogDrive): void {
  if (e.key === "e" || e.key === "E") {
    d.ePressedOnce = true;
    e.preventDefault();
    return;
  }
  const field = WARTHOG_MOVE_KEYS[e.key];
  if (field) (d as Record<string, boolean>)[field] = true;
}

function applyWarthogKeyUp(e: KeyboardEvent, d: WarthogDrive): void {
  const field = WARTHOG_MOVE_KEYS[e.key];
  if (field) (d as Record<string, boolean>)[field] = false;
}

export function initWarthogInput(state: WorldState): void {
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (isTextInputFocused()) return;
    applyWarthogKeyDown(e, state.warthogDrive);
  });
  window.addEventListener("keyup", (e: KeyboardEvent) => {
    applyWarthogKeyUp(e, state.warthogDrive);
  });
}

// ── Tick logic ───────────────────────────────────────────────────────────────
// sendFn is passed in as a parameter so this module has no stored reference to
// the network layer (avoids module-level mutable _sendFn).

function handleEKeyToggle(
  state: WorldState,
  sendFn: (type: string, payload?: Record<string, unknown>) => void
): void {
  const { warthog, localPlayer } = state;
  if (!warthog || !localPlayer) return;
  const myId = localPlayer.socketId;
  if (warthog.seats.includes(myId)) {
    sendFn("warthog_leave");
  } else {
    const dx = localPlayer.x - warthog.x;
    const dy = localPlayer.y - warthog.y;
    if (Math.sqrt(dx * dx + dy * dy) < BOARD_DISTANCE) {
      sendFn("warthog_join");
    }
  }
}

function sendDriveInput(
  d: WarthogDrive,
  sendFn: (type: string, payload?: Record<string, unknown>) => void
): void {
  const dx = ((d.right ? 1 : 0) - (d.left ? 1 : 0)) * 10;
  const dy = ((d.down  ? 1 : 0) - (d.up   ? 1 : 0)) * 10;
  if (dx === lastSentDx && dy === lastSentDy) return;
  lastSentDx = dx;
  lastSentDy = dy;
  sendFn("warthog_input", { dx, dy });
}

export function tickWarthog(
  state: WorldState,
  sendFn: (type: string, payload?: Record<string, unknown>) => void
): void {
  const { warthog, localPlayer, warthogDrive: d } = state;
  if (!warthog || !localPlayer) return;

  if (d.ePressedOnce) {
    d.ePressedOnce = false;
    handleEKeyToggle(state, sendFn);
  }

  state.seatedInWarthog = warthog.seats.includes(localPlayer.socketId);

  if (state.seatedInWarthog && warthog.seats[0] === localPlayer.socketId) {
    sendDriveInput(d, sendFn);
  } else {
    lastSentDx = 0;
    lastSentDy = 0;
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

function drawWarthogBody(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(0,0,0,0.27)";
  ctx.fillRect(4, 28, 52, 4);
  ctx.fillStyle = "#6b7c3a";
  ctx.fillRect(8, 8, 44, 18);
  ctx.fillRect(12, 2, 36, 10);
  ctx.fillStyle = "#5a6830";
  ctx.fillRect(8, 20, 44, 6);
  ctx.fillRect(12, 2, 4, 8);
  ctx.fillRect(44, 2, 4, 8);
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(4, 22, 14, 8);
  ctx.fillRect(42, 22, 14, 8);
  ctx.fillStyle = "#555";
  ctx.fillRect(7, 24, 8, 4);
  ctx.fillRect(45, 24, 8, 4);
  ctx.fillStyle = "#888";
  ctx.fillRect(10, 25, 2, 2);
  ctx.fillRect(48, 25, 2, 2);
  ctx.fillStyle = "#4a8fa8";
  ctx.fillRect(14, 4, 14, 7);
  ctx.fillStyle = "#7abfcc";
  ctx.fillRect(15, 5, 4, 2);
  ctx.fillStyle = "#7a8c42";
  ctx.fillRect(8, 10, 8, 4);
  ctx.fillStyle = "#3a3a2a";
  ctx.fillRect(10, 11, 4, 2);
  ctx.fillRect(10, 14, 4, 2);
  ctx.fillRect(44, 4, 4, 8);
  ctx.fillRect(40, 4, 12, 3);
  ctx.fillStyle = "#555";
  ctx.fillRect(40, 5, 2, 1);
}

function drawWarthogOccupants(ctx: CanvasRenderingContext2D, state: WorldState): void {
  const { warthog } = state;
  if (!warthog) return;
  for (let i = 0; i < warthog.seats.length; i++) {
    const seatId = warthog.seats[i];
    if (!seatId) continue;
    let seatColor = "#fff";
    if (seatId === state.localPlayer?.socketId) {
      seatColor = state.localPlayer.color;
    } else {
      const rp = state.remotePlayers.get(seatId);
      if (rp) seatColor = rp.color;
    }
    const headX = 16 + i * 10;
    const headY = 3;
    ctx.fillStyle = seatColor;
    ctx.fillRect(headX, headY, 6, 6);
    ctx.fillStyle = "#000";
    ctx.fillRect(headX + 1, headY + 2, 1, 1);
    ctx.fillRect(headX + 4, headY + 2, 1, 1);
  }
}

function drawBoardHint(ctx: CanvasRenderingContext2D, state: WorldState, wx: number, wy: number): void {
  const { warthog, localPlayer } = state;
  if (!warthog || !localPlayer) return;

  if (state.seatedInWarthog) {
    ctx.save();
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText("[E] exit", wx + WARTHOG_W / 2 + 1, wy - 5);
    ctx.fillStyle = "#f87171";
    ctx.fillText("[E] exit", wx + WARTHOG_W / 2, wy - 6);
    ctx.restore();
    return;
  }

  const dx = localPlayer.x - warthog.x;
  const dy = localPlayer.y - warthog.y;
  if (Math.sqrt(dx * dx + dy * dy) < BOARD_DISTANCE) {
    ctx.save();
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText("[E] board", wx + WARTHOG_W / 2 + 1, wy - 5);
    ctx.fillStyle = "#ffe97a";
    ctx.fillText("[E] board", wx + WARTHOG_W / 2, wy - 6);
    ctx.restore();
  }
}

export function drawWarthog(
  ctx: CanvasRenderingContext2D,
  state: WorldState
): void {
  const warthog = state.warthog;
  if (!warthog) return;

  const wx = Math.round(warthog.x);
  const wy = Math.round(warthog.y);

  ctx.save();
  if (warthog.facing === "left") {
    ctx.translate(wx + WARTHOG_W, wy);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(wx, wy);
  }

  drawWarthogBody(ctx);
  drawWarthogOccupants(ctx, state);
  ctx.restore();

  drawBoardHint(ctx, state, wx, wy);
}
