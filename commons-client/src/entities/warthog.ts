// entities/warthog.ts — Warthog vehicle rendering, boarding, and driving
//
// Server is authoritative over warthog position and seats.
// Client sends warthog_join / warthog_leave / warthog_input messages.
// E-key toggles join/leave. WASD drives when seated as driver (seat 0).
//
// Mutation contract: this module writes state.seatedInWarthog and
// state.warthogDrive (both in WorldState). All other state fields are read-only
// from this module's perspective.

import { WorldState, CANVAS_W, CANVAS_H } from "../state.ts";
import { lightenHex } from "../utils/color.ts";

const WARTHOG_W = 60;
const WARTHOG_H = 32;

// Approximate distance threshold to board the warthog
const BOARD_DISTANCE = 60;

// ── Key state for warthog driving ───────────────────────────────────────────
// Drive state lives in WorldState.warthogDrive — not module-level variables —
// so there are no hidden mutable singletons in this module.

function isTextInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function initWarthogInput(state: WorldState): void {
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    // Never steal keys from text inputs
    if (isTextInputFocused()) return;
    const d = state.warthogDrive;
    switch (e.key) {
      case "e": case "E":
        d.ePressedOnce = true;
        e.preventDefault();
        break;
      case "ArrowLeft":  case "a": case "A": d.left  = true; break;
      case "ArrowRight": case "d": case "D": d.right = true; break;
      case "ArrowUp":    case "w": case "W": d.up    = true; break;
      case "ArrowDown":  case "s": case "S": d.down  = true; break;
    }
  });
  window.addEventListener("keyup", (e: KeyboardEvent) => {
    const d = state.warthogDrive;
    switch (e.key) {
      case "ArrowLeft":  case "a": case "A": d.left  = false; break;
      case "ArrowRight": case "d": case "D": d.right = false; break;
      case "ArrowUp":    case "w": case "W": d.up    = false; break;
      case "ArrowDown":  case "s": case "S": d.down  = false; break;
    }
  });
}

// ── Tick logic ───────────────────────────────────────────────────────────────
// sendFn is passed in as a parameter so this module has no stored reference to
// the network layer (avoids module-level mutable _sendFn).

export function tickWarthog(
  state: WorldState,
  sendFn: (type: string, payload?: Record<string, unknown>) => void
): void {
  const { warthog, localPlayer, warthogDrive: d } = state;
  if (!warthog || !localPlayer) return;

  // E-key: toggle join/leave (one-shot per frame)
  if (d.ePressedOnce) {
    d.ePressedOnce = false;
    const myId = localPlayer.socketId;
    const seated = warthog.seats.includes(myId);
    if (seated) {
      sendFn("warthog_leave");
      // Don't optimistically set seatedInWarthog here — the server confirmation
      // (seats array update) will clear it on the next tick below.
    } else {
      // Only attempt if close enough
      const dx = localPlayer.x - warthog.x;
      const dy = localPlayer.y - warthog.y;
      if (Math.sqrt(dx * dx + dy * dy) < BOARD_DISTANCE) {
        sendFn("warthog_join");
        // Don't optimistically set seatedInWarthog = true here — it would be
        // immediately overwritten by the server-confirmed check below anyway.
      }
    }
  }

  // Server-confirmed seat state (authoritative)
  state.seatedInWarthog = warthog.seats.includes(localPlayer.socketId);

  // WASD driving — only if we are driver (seat 0)
  // Multiply by 10 so warthog moves ~10x foot speed (server applies its own *2 multiplier).
  if (state.seatedInWarthog && warthog.seats[0] === localPlayer.socketId) {
    const dx = ((d.right ? 1 : 0) - (d.left ? 1 : 0)) * 10;
    const dy = ((d.down  ? 1 : 0) - (d.up   ? 1 : 0)) * 10;
    sendFn("warthog_input", { dx, dy });
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

export function drawWarthog(
  ctx: CanvasRenderingContext2D,
  state: WorldState
): void {
  const warthog = state.warthog;
  if (!warthog) return;

  const wx = Math.round(warthog.x);
  const wy = Math.round(warthog.y);
  const facing = warthog.facing;

  ctx.save();

  if (facing === "left") {
    ctx.translate(wx + WARTHOG_W, wy);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(wx, wy);
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.27)";
  ctx.fillRect(4, 28, 52, 4);

  // Main body (military olive)
  ctx.fillStyle = "#6b7c3a";
  ctx.fillRect(8, 8, 44, 18);
  ctx.fillRect(12, 2, 36, 10);

  // Accent panels
  ctx.fillStyle = "#5a6830";
  ctx.fillRect(8, 20, 44, 6);
  ctx.fillRect(12, 2, 4, 8);
  ctx.fillRect(44, 2, 4, 8);

  // Wheels
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(4, 22, 14, 8);
  ctx.fillRect(42, 22, 14, 8);
  ctx.fillStyle = "#555";
  ctx.fillRect(7, 24, 8, 4);
  ctx.fillRect(45, 24, 8, 4);
  ctx.fillStyle = "#888";
  ctx.fillRect(10, 25, 2, 2);
  ctx.fillRect(48, 25, 2, 2);

  // Windshield
  ctx.fillStyle = "#4a8fa8";
  ctx.fillRect(14, 4, 14, 7);
  ctx.fillStyle = "#7abfcc";
  ctx.fillRect(15, 5, 4, 2);

  // Hood / grill
  ctx.fillStyle = "#7a8c42";
  ctx.fillRect(8, 10, 8, 4);
  ctx.fillStyle = "#3a3a2a";
  ctx.fillRect(10, 11, 4, 2);
  ctx.fillRect(10, 14, 4, 2);

  // Gun mount
  ctx.fillStyle = "#3a3a2a";
  ctx.fillRect(44, 4, 4, 8);
  ctx.fillRect(40, 4, 12, 3);
  ctx.fillStyle = "#555";
  ctx.fillRect(40, 5, 2, 1);

  // Seat occupants — draw colored heads
  for (let i = 0; i < warthog.seats.length; i++) {
    const seatId = warthog.seats[i];
    if (!seatId) continue;

    // Find the player color (local or remote)
    let seatColor = "#fff";
    if (state.localPlayer && seatId === state.localPlayer.socketId) {
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

  ctx.restore();

  // "E to board" hint — shown when nearby but not seated
  if (state.localPlayer && !state.seatedInWarthog) {
    const dx = state.localPlayer.x - warthog.x;
    const dy = state.localPlayer.y - warthog.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < BOARD_DISTANCE) {
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

  // "E to exit" hint when seated
  if (state.seatedInWarthog) {
    ctx.save();
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText("[E] exit", wx + WARTHOG_W / 2 + 1, wy - 5);
    ctx.fillStyle = "#f87171";
    ctx.fillText("[E] exit", wx + WARTHOG_W / 2, wy - 6);
    ctx.restore();
  }
}
