// ui/leaderboard-modal.ts — Dungeon run leaderboard
//
// Triggered when the local player walks within LEADERBOARD_PROXIMITY_TILES tiles
// of the leaderboard object at (LEADERBOARD_COL, LEADERBOARD_ROW) in chunk (0,0).
//
// Shows: top 10 dungeon runs ranked by floor reached, with party composition and date.
// Dismissed by Escape or clicking outside the panel.

import {
  WorldState,
  TILE,
  LEADERBOARD_COL,
  LEADERBOARD_ROW,
  LEADERBOARD_PROXIMITY_TILES,
} from "../state.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RunPartyMember {
  name: string;
  personaSlug: string;
}

interface LeaderboardEntry {
  rank: number;
  outcome: "victory" | "death";
  floorReached: number;
  durationMs: number;
  party: RunPartyMember[];
  runAt: number;
}

// ─── Module state ─────────────────────────────────────────────────────────────

let _open = false;
let _lastProximityKey = ""; // suppress repeated triggers until player moves away
let _fetchInFlight = false;

// ─── DOM elements ─────────────────────────────────────────────────────────────

let overlay: HTMLDivElement | null = null;
let entriesContainer: HTMLDivElement | null = null;
let loadingEl: HTMLDivElement | null = null;

// ─── Build DOM ────────────────────────────────────────────────────────────────

function buildModal(): void {
  overlay = document.createElement("div");
  overlay.id = "cv2-leaderboard-overlay";
  overlay.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.80);
    z-index: 1100;
    align-items: center;
    justify-content: center;
  `;

  const panel = document.createElement("div");
  panel.style.cssText = `
    background: #0d0d1a;
    border: 2px solid #4a3a8a;
    border-radius: 10px;
    padding: 28px 32px 24px;
    font-family: 'JetBrains Mono', monospace;
    color: #c0b0e0;
    width: 520px;
    max-width: 96vw;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 0 48px rgba(60,20,100,0.45);
    position: relative;
  `;

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.title = "Close (Esc)";
  closeBtn.style.cssText = `
    position: absolute;
    top: 10px;
    right: 12px;
    background: none;
    border: none;
    color: #6a5a9a;
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
  `;
  closeBtn.addEventListener("click", closeModal);

  const icon = document.createElement("div");
  icon.style.cssText = "font-size: 24px; margin-bottom: 10px; text-align: center;";
  icon.textContent = "🏆";

  const title = document.createElement("div");
  title.style.cssText = `
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.18em;
    margin-bottom: 4px;
    color: #a090d0;
    text-align: center;
  `;
  title.textContent = "DUNGEON LEADERBOARD";

  const subtitle = document.createElement("div");
  subtitle.style.cssText = "font-size: 10px; color: #5a4a7a; text-align: center; margin-bottom: 20px;";
  subtitle.textContent = "Top 10 runs — ranked by deepest floor reached";

  loadingEl = document.createElement("div");
  loadingEl.style.cssText = "font-size: 12px; color: #5a4a7a; text-align: center; padding: 20px 0;";
  loadingEl.textContent = "Loading...";

  entriesContainer = document.createElement("div");

  panel.appendChild(closeBtn);
  panel.appendChild(icon);
  panel.appendChild(title);
  panel.appendChild(subtitle);
  panel.appendChild(loadingEl);
  panel.appendChild(entriesContainer);

  const dismissNote = document.createElement("div");
  dismissNote.style.cssText = "font-size: 10px; color: #2a2a4a; text-align: center; margin-top: 16px;";
  dismissNote.textContent = "Press Esc or click outside to dismiss";
  panel.appendChild(dismissNote);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && _open) {
      e.stopPropagation();
      closeModal();
    }
  });
}

// ─── Render entries ───────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${String(yr)}-${mo}-${day}`;
}

function getRankColor(rank: number): string {
  if (rank === 1) return "#d4af37";
  if (rank === 2) return "#aaa9ad";
  if (rank === 3) return "#cd7f32";
  return "#4a3a8a";
}

function buildEntryRow(entry: LeaderboardEntry): HTMLDivElement {
  const isVictory = entry.outcome === "victory";
  const rankColor = getRankColor(entry.rank);

  const row = document.createElement("div");
  row.style.cssText = "display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid #1e1830;";

  const rankBadge = document.createElement("div");
  rankBadge.style.cssText = `min-width: 28px; height: 28px; border-radius: 4px; background: ${rankColor}22; border: 1px solid ${rankColor}; color: ${rankColor}; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;`;
  rankBadge.textContent = `#${String(entry.rank)}`;

  const info = document.createElement("div");
  info.style.cssText = "flex: 1; min-width: 0;";

  const topLine = document.createElement("div");
  topLine.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 4px;";

  const floorSpan = document.createElement("span");
  floorSpan.style.cssText = `font-size: 13px; font-weight: 700; color: ${isVictory ? "#a0e0a0" : "#e0a0a0"};`;
  floorSpan.textContent = `Floor ${String(entry.floorReached)}`;

  const outcomeTag = document.createElement("span");
  outcomeTag.style.cssText = `font-size: 9px; padding: 1px 5px; border-radius: 3px; background: ${isVictory ? "#0d2a0d" : "#2a0d0d"}; border: 1px solid ${isVictory ? "#3a7a3a" : "#7a3a3a"}; color: ${isVictory ? "#5aaa5a" : "#aa5a5a"};`;
  outcomeTag.textContent = isVictory ? "VICTORY" : "DEFEATED";

  const durationSpan = document.createElement("span");
  durationSpan.style.cssText = "font-size: 10px; color: #5a4a7a; margin-left: auto;";
  durationSpan.textContent = formatDuration(entry.durationMs);

  topLine.appendChild(floorSpan);
  topLine.appendChild(outcomeTag);
  topLine.appendChild(durationSpan);

  const partyLine = document.createElement("div");
  partyLine.style.cssText = "display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 2px;";
  for (const member of entry.party) {
    const chip = document.createElement("span");
    chip.style.cssText = "font-size: 10px; padding: 1px 6px; border-radius: 10px; background: #1a1430; border: 1px solid #3a2a5a; color: #9080b0;";
    chip.textContent = `${member.name} (${member.personaSlug.replace(/_/g, " ")})`;
    partyLine.appendChild(chip);
  }

  const dateLine = document.createElement("div");
  dateLine.style.cssText = "font-size: 9px; color: #3a2a5a; margin-top: 2px;";
  dateLine.textContent = formatDate(entry.runAt);

  info.appendChild(topLine);
  info.appendChild(partyLine);
  info.appendChild(dateLine);
  row.appendChild(rankBadge);
  row.appendChild(info);
  return row;
}

function renderEntries(entries: LeaderboardEntry[]): void {
  if (!entriesContainer || !loadingEl) return;

  loadingEl.style.display = "none";
  entriesContainer.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "font-size: 12px; color: #5a4a7a; text-align: center; padding: 20px 0;";
    empty.textContent = "No runs recorded yet. Be the first to venture into the dungeon!";
    entriesContainer.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    entriesContainer.appendChild(buildEntryRow(entry));
  }
}

function renderError(message: string): void {
  if (!entriesContainer || !loadingEl) return;
  loadingEl.style.display = "none";
  entriesContainer.innerHTML = "";
  const errEl = document.createElement("div");
  errEl.style.cssText = "font-size: 12px; color: #aa5a5a; text-align: center; padding: 20px 0;";
  errEl.textContent = `Failed to load leaderboard: ${message}`;
  entriesContainer.appendChild(errEl);
}

// ─── Fetch leaderboard data ───────────────────────────────────────────────────

async function fetchLeaderboard(): Promise<void> {
  if (_fetchInFlight) return;
  _fetchInFlight = true;

  // Reset state before fetching
  if (entriesContainer) entriesContainer.innerHTML = "";
  if (loadingEl) loadingEl.style.display = "block";

  try {
    const res = await fetch("/api/clungiverse/leaderboard");
    if (!res.ok) {
      throw new Error(`HTTP ${String(res.status)}`);
    }
    const entries = await res.json() as LeaderboardEntry[];
    renderEntries(entries);
  } catch (err) {
    renderError(err instanceof Error ? err.message : String(err));
  } finally {
    _fetchInFlight = false;
  }
}

// ─── Open / close ─────────────────────────────────────────────────────────────

function openModal(): void {
  if (!overlay) return;
  _open = true;
  overlay.style.display = "flex";
  // Fetch fresh data each time the leaderboard is opened
  fetchLeaderboard().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[leaderboard] fetchLeaderboard failed:", err);
  });
}

function closeModal(): void {
  if (!overlay) return;
  _open = false;
  overlay.style.display = "none";
  // Allow re-trigger after the player moves away and comes back
  _lastProximityKey = "";
}

export function isLeaderboardOpen(): boolean {
  return _open;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initLeaderboardModal(): void {
  buildModal();
}

// ─── Per-frame proximity check ────────────────────────────────────────────────
// Called from main.ts game loop each frame.
// Leaderboard is at chunk 0,0: tile (LEADERBOARD_COL, LEADERBOARD_ROW).

export function tickLeaderboardModal(state: WorldState): void {
  const player = state.localPlayer;
  if (!player) return;
  if (player.chunkX !== 0 || player.chunkY !== 0) return;

  const playerTileX = Math.floor(player.x / TILE);
  const playerTileY = Math.floor(player.y / TILE);

  const dx = Math.abs(playerTileX - LEADERBOARD_COL);
  const dy = Math.abs(playerTileY - LEADERBOARD_ROW);

  const inProximity = dx <= LEADERBOARD_PROXIMITY_TILES && dy <= LEADERBOARD_PROXIMITY_TILES;

  if (inProximity) {
    const key = `${String(playerTileX)},${String(playerTileY)}`;
    if (!_open && key !== _lastProximityKey) {
      _lastProximityKey = key;
      openModal();
    }
  }
}
