// ui/dungeon-modal.ts — Dungeon entrance modal
//
// Triggered when the local player walks into the dungeon entrance doorway
// (chunk 0,0: tile column 43, rows 5–8).
//
// Shows: dungeon flavour text + "Enter the Dungeon" button → /clungiverse
// Trigger is detected each frame in main.ts (tickDungeonModal).

import { WorldState, TILE, DUNGEON_BUILDING_COL } from "../state.ts";

// Dungeon doorway rows — chunk (0,0), rows 5–8.
// The column is shared with renderer.ts via DUNGEON_BUILDING_COL in state.ts.
const DUNGEON_BUILDING_ROW_MIN = 5;
const DUNGEON_BUILDING_ROW_MAX = 8;

let _open = false;
let _lastTriggerTile = ""; // suppress repeated triggers from the same tile

// ── DOM ──────────────────────────────────────────────────────────────────────

let overlay: HTMLDivElement | null = null;

function buildModal(): void {
  overlay = document.createElement("div");
  overlay.id = "cv2-dungeon-overlay";
  overlay.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.80);
    z-index: 1100;
    align-items: center;
    justify-content: center;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background: #0d0d0d;
    border: 2px solid #3a5a3a;
    border-radius: 10px;
    padding: 28px 32px 24px;
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
    color: #a0d0a0;
    max-width: 380px;
    box-shadow: 0 0 48px rgba(0,80,20,0.35);
  `;

  const icon = document.createElement("div");
  icon.style.cssText = "font-size: 28px; margin-bottom: 12px;";
  icon.textContent = "⚔️";

  const title = document.createElement("div");
  title.style.cssText = "font-size: 16px; font-weight: 700; letter-spacing: 0.15em; margin-bottom: 10px; color: #80c080;";
  title.textContent = "DUNGEON";

  const body = document.createElement("div");
  body.style.cssText = "font-size: 12px; color: #607060; line-height: 1.6; margin-bottom: 18px;";
  body.innerHTML = "A cold wind rises from the depths.<br>Few who enter return unchanged.";

  const enterBtn = document.createElement("button");
  enterBtn.textContent = "Enter the Dungeon →";
  enterBtn.style.cssText = `
    display: inline-block;
    background: #0a1a0a;
    border: 1px solid #3a5a3a;
    color: #80c080;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    padding: 7px 20px;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 14px;
    transition: background 0.15s;
  `;
  enterBtn.addEventListener("mouseover", () => { enterBtn.style.background = "rgba(0,100,30,0.25)"; });
  enterBtn.addEventListener("mouseout",  () => { enterBtn.style.background = "#0a1a0a"; });
  enterBtn.addEventListener("click", () => { window.location.href = "/clungiverse"; });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.title = "Close (Esc)";
  closeBtn.style.cssText = `
    position: absolute;
    top: 10px;
    right: 12px;
    background: none;
    border: none;
    color: #3a5a3a;
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
  modal.appendChild(enterBtn);

  const dismissNote = document.createElement("div");
  dismissNote.style.cssText = "font-size: 10px; color: #2a3a2a; margin-top: 4px;";
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

export function isDungeonModalOpen(): boolean {
  return _open;
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initDungeonModal(): void {
  buildModal();
}

// ── Per-frame check ───────────────────────────────────────────────────────────
// Called from main.ts game loop each frame.
// Dungeon doorway: chunk 0,0, tile column 43, rows 5–8.

export function tickDungeonModal(state: WorldState): void {
  const player = state.localPlayer;
  if (!player) return;
  if (state.localPlayer!.chunkX !== 0 || state.localPlayer!.chunkY !== 0) return;

  const tileX = Math.floor(player.x / TILE);
  const tileY = Math.floor(player.y / TILE);

  const inDoorway = tileX === DUNGEON_BUILDING_COL &&
    tileY >= DUNGEON_BUILDING_ROW_MIN && tileY <= DUNGEON_BUILDING_ROW_MAX;

  if (inDoorway) {
    const key = `${tileX},${tileY}`;
    if (!_open && key !== _lastTriggerTile) {
      _lastTriggerTile = key;
      openModal();
    }
  }
}
