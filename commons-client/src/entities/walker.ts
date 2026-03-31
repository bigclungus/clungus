// entities/walker.ts — Audition walker rendering and interaction
//
// Polls /api/audition/walkers every 2s via setInterval (owned here — not driven
// by the per-frame game loop).
// Walkers cross at canvas row 18 (y = 18*TILE + TILE/2 = 370).
// Hover pauses the walker and shows a concept card.
// Keep/dismiss buttons send to /api/audition/keep and /api/audition/dismiss.

import { WorldState, AuditionWalker, TILE } from "../state.ts";
import { lightenHex } from "../utils/color.ts";

// Walker Y position — row 18 center (the horizontal path area)
const WALKER_Y = 18 * TILE + TILE / 2;

// Hit radius for hover detection
const WALKER_HIT_W = 10;
const WALKER_HIT_H = 18;

// ── Polling ──────────────────────────────────────────────────────────────────
// Polling is owned here via setInterval — the game loop does NOT call pollWalkers
// per frame. This keeps scheduling in one place.

// Audition service URL — proxied via clunger at /api/audition/*
const AUDITION_BASE = "";

function pollWalkers(state: WorldState): void {
  fetch(`${AUDITION_BASE}/api/audition/walkers`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${String(r.status)}`);
      return r.json();
    })
    .then((data: AuditionWalker[]) => {
      state.walkers = data;
    })
    .catch((err: unknown) => {
      console.warn("[walkers] fetch failed:", err instanceof Error ? err.message : String(err));
    });
}

let _pollingInterval: ReturnType<typeof setInterval> | null = null;

/** Call once at startup to begin the 2s polling loop. */
export function initWalkerPolling(state: WorldState): void {
  if (_pollingInterval !== null) return; // guard against double-init
  pollWalkers(state); // immediate first fetch
  _pollingInterval = setInterval(() => { pollWalkers(state); }, 2000);
}

// ── Concept card UI ──────────────────────────────────────────────────────────
// Module-level DOM references — cleaned up by teardownWalkers().

let cardEl: HTMLDivElement | null = null;
let cardWalkerId: string | null = null;

function createCard(): HTMLDivElement {
  const div = document.createElement("div");
  div.id = "cv2-audition-card";
  div.style.cssText = `
    display: none;
    position: fixed;
    background: #0a0f1a;
    border: 1.5px solid #4ecca3;
    border-radius: 8px;
    padding: 12px 14px;
    font-family: 'JetBrains Mono', monospace;
    color: #e0e0ff;
    min-width: 200px;
    max-width: 280px;
    z-index: 900;
    box-shadow: 0 0 18px #4ecca322;
    pointer-events: auto;
  `;
  document.body.appendChild(div);
  return div;
}

function getCard(): HTMLDivElement {
  cardEl ??= createCard();
  return cardEl;
}

function showCard(walker: AuditionWalker, canvasX: number, canvasY: number): void {
  const card = getCard();
  cardWalkerId = walker.id;

  const traits = walker.traits.map((t) => `<span style="color:#4ecca3">·</span> ${t}`).join("<br>");

  card.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:#4ecca3;margin-bottom:4px">${escapeHtml(walker.name)}</div>
    <div style="font-size:10px;color:#a0c8ff;margin-bottom:8px;font-style:italic">${escapeHtml(walker.title)}</div>
    <div style="font-size:10px;line-height:1.5;margin-bottom:8px">${traits}</div>
    <div style="font-size:10px;color:#b0b0cc;margin-bottom:10px;white-space:pre-wrap">${escapeHtml(walker.description)}</div>
    <div style="display:flex;gap:8px">
      <button id="cv2-walker-keep" style="
        background:#4ecca322;border:1px solid #4ecca3;color:#4ecca3;
        font-family:'JetBrains Mono',monospace;font-size:10px;
        padding:4px 12px;cursor:pointer;border-radius:3px;">Keep ✦</button>
      <button id="cv2-walker-dismiss" style="
        background:none;border:1px solid #555;color:#888;
        font-family:'JetBrains Mono',monospace;font-size:10px;
        padding:4px 12px;cursor:pointer;border-radius:3px;">Dismiss</button>
    </div>
  `;

  // Position card near click, keeping in viewport
  const margin = 12;
  const cw = 280;
  let left = canvasX + margin;
  let top = canvasY - 60;
  if (left + cw > window.innerWidth - margin) left = canvasX - cw - margin;
  if (top < margin) top = margin;
  card.style.left = `${String(left)}px`;
  card.style.top = `${String(top)}px`;
  card.style.display = "block";

  document.getElementById("cv2-walker-keep")?.addEventListener("click", () => { keepWalker(walker.id); }, { once: true });
  document.getElementById("cv2-walker-dismiss")?.addEventListener("click", () => { dismissWalker(walker.id); }, { once: true });
}

function hideCard(): void {
  if (cardEl) cardEl.style.display = "none";
  cardWalkerId = null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function keepWalker(id: string): void {
  hideCard();
  fetch(`${AUDITION_BASE}/api/audition/keep`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${String(r.status)}`); })
    .catch((err: unknown) => { console.error("[walkers] keep failed:", err instanceof Error ? err.message : String(err)); });
}

function dismissWalker(id: string): void {
  hideCard();
  fetch(`${AUDITION_BASE}/api/audition/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${String(r.status)}`); })
    .catch((err: unknown) => { console.error("[walkers] dismiss failed:", err instanceof Error ? err.message : String(err)); });
}

function pauseWalker(id: string): void {
  fetch(`${AUDITION_BASE}/api/audition/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${String(r.status)}`); })
    .catch((err: unknown) => { console.error("[walkers] pause failed:", err instanceof Error ? err.message : String(err)); });
}

function resumeWalker(id: string): void {
  fetch(`${AUDITION_BASE}/api/audition/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${String(r.status)}`); })
    .catch((err: unknown) => { console.error("[walkers] resume failed:", err instanceof Error ? err.message : String(err)); });
}

// ── Teardown ──────────────────────────────────────────────────────────────────

/**
 * Remove the audition card from DOM and clear all module references.
 * Call on reconnect or when leaving the page to avoid orphaned DOM nodes.
 */
export function teardownWalkers(): void {
  if (cardEl) {
    cardEl.remove();
    cardEl = null;
  }
  cardWalkerId = null;
  _hoveredId = null;
  _mouseCanvasX = -1;
  _mouseCanvasY = -1;
}

// ── Hover tracking (updated from main.ts canvas mousemove) ───────────────────

let _hoveredId: string | null = null;
let _mouseCanvasX = -1;
let _mouseCanvasY = -1;

function findHoveredWalkerId(walkers: AuditionWalker[], canvasX: number, canvasY: number): string | null {
  for (const w of walkers) {
    if (w.x < 0) continue;
    const dy = canvasY - WALKER_Y;
    const dx = canvasX - w.x;
    if (Math.abs(dx) <= WALKER_HIT_W && Math.abs(dy) <= WALKER_HIT_H) {
      return w.id;
    }
  }
  return null;
}

export function updateWalkerHover(
  state: WorldState,
  canvasX: number,
  canvasY: number
): void {
  _mouseCanvasX = canvasX;
  _mouseCanvasY = canvasY;

  const prevHovered = _hoveredId;
  _hoveredId = findHoveredWalkerId(state.walkers, canvasX, canvasY);

  // Pausing/resuming on hover
  if (_hoveredId !== prevHovered) {
    if (prevHovered && prevHovered !== cardWalkerId) {
      // Left a hovered walker — resume if card not open for it
      resumeWalker(prevHovered);
    }
    if (_hoveredId) {
      pauseWalker(_hoveredId);
    }
  }
}

export function handleWalkerClick(
  state: WorldState,
  canvasX: number,
  canvasY: number,
  clientX: number,
  clientY: number
): boolean {
  for (const w of state.walkers) {
    if (w.x < 0) continue;
    const dy = canvasY - WALKER_Y;
    const dx = canvasX - w.x;
    if (Math.abs(dx) <= WALKER_HIT_W && Math.abs(dy) <= WALKER_HIT_H) {
      showCard(w, clientX, clientY);
      return true;
    }
  }
  return false;
}

export function closeWalkerCardIfOpen(): void {
  if (cardWalkerId) {
    const id = cardWalkerId;
    hideCard();
    resumeWalker(id);
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

export function drawWalkers(
  ctx: CanvasRenderingContext2D,
  walkers: AuditionWalker[]
): void {
  for (const w of walkers) {
    if (w.x < 0) continue;
    const wx = Math.round(w.x);
    const wy = WALKER_Y;
    const color = w.avatar_color || "#a78bfa";
    const isHovered = w.id === _hoveredId || w.id === cardWalkerId;

    ctx.save();

    if (isHovered) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.27)";
    ctx.fillRect(wx - 4 + 2, wy + 12 - 2, 8, 4);

    // Body
    ctx.fillStyle = color;
    ctx.fillRect(wx - 4, wy, 8, 12);

    // Head (slightly lighter)
    ctx.globalAlpha = 1;
    ctx.fillStyle = lightenHex(color, 30);
    ctx.fillRect(wx - 3, wy - 6, 6, 6);

    // Eyes
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(wx - 2, wy - 5, 1, 2);
    ctx.fillRect(wx + 1, wy - 5, 1, 2);

    ctx.restore();

    if (isHovered) {
      // Name + title bubble above
      ctx.save();
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "center";
      const lines = [w.name, w.title];
      const lineH = 10;
      const pad = 4;
      const maxW = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
      const bw = maxW + pad * 2;
      const bh = lineH * lines.length + pad * 2;
      const bx = wx - bw / 2;
      const by = wy - 8 - bh - 4;

      ctx.fillStyle = "rgba(10,15,26,0.88)";
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(bx, by, bw, bh);

      lines.forEach((line, i) => {
        ctx.fillStyle = i === 0 ? color : "#c0c0e0";
        ctx.fillText(line, wx, by + pad + lineH * (i + 1) - 2);
      });
      ctx.restore();
    } else {
      // "?" indicator above
      ctx.save();
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = color + "aa";
      ctx.fillText("?", wx, wy - 10);
      ctx.restore();
    }
  }
}
