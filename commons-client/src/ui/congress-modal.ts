// ui/congress-modal.ts — Congress building entry modal
//
// Triggered when the local player walks into the congress building doorway
// (chunk 0,0: tile column 5, rows 5–7).
//
// Shows: "The congress chamber awaits" + link to /congress
// Trigger is detected each frame in main.ts (tickCongressModal).

import { WorldState, TILE, CONGRESS_BUILDING_COL } from "../state.ts";

// Congress building doorway rows — chunk (0,0), rows 5–7.
// The column is shared with renderer.ts via CONGRESS_BUILDING_COL in state.ts.
// Update if the chunk map layout changes.
const CONGRESS_BUILDING_ROW_MIN = 5;
const CONGRESS_BUILDING_ROW_MAX = 7;

let _open = false;
let _lastTriggerTile = ""; // suppress repeated triggers from the same tile

// ── DOM ──────────────────────────────────────────────────────────────────────

let overlay: HTMLDivElement | null = null;

function buildModal(): void {
  overlay = document.createElement("div");
  overlay.id = "cv2-congress-overlay";
  overlay.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.70);
    z-index: 1100;
    align-items: center;
    justify-content: center;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background: #0a0f1a;
    border: 2px solid #7a7aaa;
    border-radius: 10px;
    padding: 28px 32px 24px;
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
    color: #c8c8e8;
    max-width: 380px;
    box-shadow: 0 0 32px #7a7aaa22;
  `;

  const icon = document.createElement("div");
  icon.style.cssText = "font-size: 28px; margin-bottom: 12px;";
  icon.textContent = "⚖️";

  const title = document.createElement("div");
  title.style.cssText = "font-size: 16px; font-weight: 700; letter-spacing: 0.1em; margin-bottom: 10px; color: #9a9abf;";
  title.textContent = "CONGRESS";

  const body = document.createElement("div");
  body.style.cssText = "font-size: 12px; color: #8888aa; line-height: 1.6; margin-bottom: 18px;";
  body.innerHTML = "The congress chamber awaits.<br>Sessions are broadcast live when in progress.";

  const link = document.createElement("a");
  link.href = "/congress";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Open Congress →";
  link.style.cssText = `
    display: inline-block;
    background: #2a2050;
    border: 1px solid #7a7aaa;
    color: #9a9abf;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    padding: 7px 20px;
    border-radius: 4px;
    text-decoration: none;
    margin-bottom: 14px;
    transition: background 0.15s;
  `;
  link.addEventListener("mouseover", () => { link.style.background = "#4ecca322"; });
  link.addEventListener("mouseout",  () => { link.style.background = "#2a2050"; });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.title = "Close (Esc)";
  closeBtn.style.cssText = `
    position: absolute;
    top: 10px;
    right: 12px;
    background: none;
    border: none;
    color: #6666aa;
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
  `;
  closeBtn.addEventListener("click", closeModal);

  modal.style.position = "relative";
  modal.appendChild(closeBtn);
  modal.appendChild(icon);
  modal.appendChild(title);
  modal.appendChild(body);
  modal.appendChild(link);

  const dismissNote = document.createElement("div");
  dismissNote.style.cssText = "font-size: 10px; color: #44445a; margin-top: 4px;";
  dismissNote.textContent = "Press Esc or click outside to dismiss";
  modal.appendChild(dismissNote);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  // Close on Escape
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && _open) {
      e.stopPropagation();
      closeModal();
    }
  });
}

function openModal(): void {
  if (!overlay) return;
  _open = true;
  overlay.style.display = "flex";
}

function closeModal(): void {
  if (!overlay) return;
  _open = false;
  overlay.style.display = "none";
  // Allow re-trigger only after player moves to a different tile
  _lastTriggerTile = "";
}

export function isCongressModalOpen(): boolean {
  return _open;
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initCongressModal(): void {
  buildModal();
}

// ── Per-frame check ───────────────────────────────────────────────────────────
// Called from main.ts game loop each frame.
// Congress doorway: chunk 0,0, tile column 5, rows 5/6/7.

function checkDoorwayTrigger(tileX: number, tileY: number): void {
  const inDoorway = tileX === CONGRESS_BUILDING_COL &&
    tileY >= CONGRESS_BUILDING_ROW_MIN && tileY <= CONGRESS_BUILDING_ROW_MAX;
  if (!inDoorway) return;
  const key = `${String(tileX)},${String(tileY)}`;
  if (!_open && key !== _lastTriggerTile) {
    _lastTriggerTile = key;
    openModal();
  }
}

export function tickCongressModal(state: WorldState): void {
  const player = state.localPlayer;
  if (!player) return;
  if (player.chunkX !== 0 || player.chunkY !== 0) return;
  checkDoorwayTrigger(Math.floor(player.x / TILE), Math.floor(player.y / TILE));
}
