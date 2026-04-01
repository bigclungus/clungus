// Clungiverse Client — Entry point
// Canvas init, scene management, game loop, networking

import { createInitialState, type DungeonClientState, type SceneName } from './state';
import { initCanvas, getCanvas, clearCanvas } from './renderer/canvas';
import { initInput, pressKey, releaseKey } from './input/input';
import { DungeonNetwork } from './network/dungeon-network';
import { createLobbyScene } from './scenes/lobby';
import { createDungeonScene } from './scenes/dungeon';
import { createTransitionScene } from './scenes/transition';
import { createResultsScene } from './scenes/results';
import { createMobPreviewScene } from './scenes/mob-preview';
import { preloadAvatars } from './renderer/entity-renderer';

// === Canvas Setup ===

const canvasEl = document.getElementById('game-canvas');
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('Missing #game-canvas element');

const ctx = initCanvas(canvasEl);

// === State ===

const state: DungeonClientState = createInitialState();

// === Network ===

const network = new DungeonNetwork(state);

// === Input ===

initInput(getCanvas());
preloadAvatars();

// === Virtual D-Pad (touch devices) ===

function createDpad(): void {
  const style = document.createElement('style');
  style.textContent = `
    #dpad {
      position: fixed;
      bottom: 24px;
      left: 24px;
      width: 144px;
      height: 144px;
      display: none;
      z-index: 100;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    @media (hover: none) and (pointer: coarse) {
      #dpad { display: grid; }
    }
    #dpad {
      grid-template-columns: repeat(3, 48px);
      grid-template-rows: repeat(3, 48px);
    }
    .dpad-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 8px;
      color: #fff;
      font-size: 22px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.08s;
    }
    .dpad-btn:active,
    .dpad-btn.pressed {
      background: rgba(255,255,255,0.3);
    }
    .dpad-center { background: transparent; border: none; }
    .dpad-fire {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 64px;
      height: 64px;
      display: none;
      z-index: 100;
      align-items: center;
      justify-content: center;
      background: rgba(255,180,0,0.22);
      border: 1px solid rgba(255,180,0,0.5);
      border-radius: 50%;
      color: #ffe;
      font-size: 22px;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    @media (hover: none) and (pointer: coarse) {
      .dpad-fire { display: flex; }
    }
  `;
  document.head.appendChild(style);

  const dpad = document.createElement('div');
  dpad.id = 'dpad';

  // 3x3 grid: row 0 = up, row 1 = left/right, row 2 = down
  // cell positions (row, col): up=(0,1) left=(1,0) right=(1,2) down=(2,1) center=(1,1)
  const cells: { row: number; col: number; key: string; label: string }[] = [
    { row: 0, col: 0, key: '', label: '' },
    { row: 0, col: 1, key: 'arrowup', label: '▲' },
    { row: 0, col: 2, key: '', label: '' },
    { row: 1, col: 0, key: 'arrowleft', label: '◀' },
    { row: 1, col: 1, key: '', label: '' },
    { row: 1, col: 2, key: 'arrowright', label: '▶' },
    { row: 2, col: 0, key: '', label: '' },
    { row: 2, col: 1, key: 'arrowdown', label: '▼' },
    { row: 2, col: 2, key: '', label: '' },
  ];

  const activeKeys = new Map<number, string>(); // pointerId -> key

  cells.forEach(({ key, label }) => {
    const btn = document.createElement('div');
    btn.className = key ? 'dpad-btn' : 'dpad-btn dpad-center';
    btn.textContent = label;

    if (key) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        activeKeys.set(e.pointerId, key);
        pressKey(key);
        btn.classList.add('pressed');
      });

      const release = (e: PointerEvent): void => {
        const k = activeKeys.get(e.pointerId);
        if (k) {
          releaseKey(k);
          activeKeys.delete(e.pointerId);
        }
        btn.classList.remove('pressed');
      };

      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
    }

    dpad.appendChild(btn);
  });

  document.body.appendChild(dpad);

  // Fire / power button (bottom-right)
  const fireBtn = document.createElement('div');
  fireBtn.className = 'dpad-fire';
  fireBtn.textContent = '⚡';
  fireBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    // Dispatch a synthetic spacebar keydown so the power one-shot logic fires
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  });
  fireBtn.addEventListener('pointerup', () => {
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
  });
  document.body.appendChild(fireBtn);
}

createDpad();

// === Scene Interface ===

interface Scene {
  enter(state: DungeonClientState): void;
  update(state: DungeonClientState, dt: number): void;
  render(state: DungeonClientState, ctx: CanvasRenderingContext2D): void;
  exit(state: DungeonClientState): void;
}

// === Scene Registry ===

function handleReturnToCommons(): void {
  network.disconnect();
  clearLobbyParam();
  // Navigate back to commons
  window.location.href = '/commons-v2/';
}

const scenes = new Map<SceneName, Scene>();
scenes.set('lobby', createLobbyScene(network));
scenes.set('mob_preview', createMobPreviewScene());
scenes.set('dungeon', createDungeonScene(network));
scenes.set('transition', createTransitionScene(network));
scenes.set('results', createResultsScene(handleReturnToCommons));

let activeScene: Scene | null = null;
let activeSceneName: SceneName | null = null;

function switchScene(name: SceneName): void {
  if (activeSceneName === name) return;
  if (activeScene) {
    activeScene.exit(state);
  }
  activeSceneName = name;
  activeScene = scenes.get(name) ?? null;
  if (activeScene) {
    activeScene.enter(state);
  }
}

// Clear lobby param from URL (used on game over / error fallback)
function clearLobbyParam(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.has('lobby')) {
    url.searchParams.delete('lobby');
    window.history.replaceState(null, '', url.toString());
  }
}

// Watch for scene changes from network messages
let lastScene: SceneName = state.scene;

// === Game Loop ===

let lastTime = 0;

function gameLoop(timestamp: number): void {
  const dt = lastTime === 0 ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1); // cap at 100ms
  lastTime = timestamp;

  // Check if scene changed (from network state updates)
  if (state.scene !== lastScene) {
    switchScene(state.scene);
    // Clear lobby URL param when game ends so refresh starts fresh
    if (state.scene === 'results') {
      clearLobbyParam();
    }
    lastScene = state.scene;
  }

  // Update
  if (activeScene) {
    activeScene.update(state, dt);
  }

  // Render
  clearCanvas();

  if (activeScene) {
    activeScene.render(state, ctx);
  }

  requestAnimationFrame(gameLoop);
}

// === Boot ===

// Fetch GitHub username from auth, fall back to "Adventurer"
async function fetchUsername(): Promise<string> {
  try {
    const res = await fetch('/api/me', { signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      const data = await res.json() as { username?: string };
      if (data.username) return data.username;
    }
  } catch {
    // Not authenticated or network error — use fallback
  }
  return 'Adventurer';
}

const userId = `player-${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}`;
let userName = 'Adventurer';
state.playerId = userId;
state.playerName = userName;

// Start with lobby scene
switchScene('lobby');

network.on('connected', () => {
  // eslint-disable-next-line no-console
  console.log('[clungiverse] Connected to dungeon server');
});

network.on('disconnected', () => {
  // eslint-disable-next-line no-console
  console.log('[clungiverse] Disconnected from dungeon server');
});

network.on('error', (msg) => {
  // eslint-disable-next-line no-console
  console.error('[clungiverse] Server error:', msg);
});

// Check URL params for ?lobby=<id> to join an existing lobby
const urlParams = new URLSearchParams(window.location.search);
const joinLobbyId = urlParams.get('lobby');

async function joinExistingLobby(id: string): Promise<string | null> {
  state.lobbyStatus = 'joining';
  // eslint-disable-next-line no-console
  console.log('[clungiverse] Joining lobby from invite:', id);
  try {
    const joinRes = await fetch(`/api/clungiverse/lobby/${id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name: userName }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!joinRes.ok) {
      const err = await joinRes.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? `HTTP ${String(joinRes.status)}`);
    }
    // eslint-disable-next-line no-console
    console.log('[clungiverse] Joined lobby:', id);
    return id;
  } catch (joinErr) {
    // Lobby doesn't exist or join failed — clear stale URL param and create fresh
    // eslint-disable-next-line no-console
    console.warn('[clungiverse] Failed to join lobby from URL, creating new one:', joinErr);
    clearLobbyParam();
    return null;
  }
}

async function createAndJoinLobby(): Promise<string> {
  state.lobbyStatus = 'creating';
  const createRes = await fetch('/api/clungiverse/lobby/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, name: userName }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `HTTP ${String(createRes.status)}`);
  }
  const createData = await createRes.json() as { lobbyId: string };
  const lobbyId = createData.lobbyId;
  // eslint-disable-next-line no-console
  console.log('[clungiverse] Created lobby:', lobbyId);

  state.lobbyStatus = 'joining';
  const joinRes = await fetch(`/api/clungiverse/lobby/${lobbyId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, name: userName }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!joinRes.ok) {
    const err = await joinRes.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `HTTP ${String(joinRes.status)}`);
  }
  // eslint-disable-next-line no-console
  console.log('[clungiverse] Joined lobby:', lobbyId);
  return lobbyId;
}

// Create or join lobby, then connect WebSocket
async function initLobby(): Promise<void> {
  // Resolve GitHub username before creating/joining lobby
  userName = await fetchUsername();
  state.playerName = userName;

  try {
    let lobbyId: string | null = null;

    if (joinLobbyId) {
      lobbyId = await joinExistingLobby(joinLobbyId);
    }

    lobbyId ??= await createAndJoinLobby();

    state.lobbyId = lobbyId;
    state.lobbyStatus = 'connected';

    // Persist lobby ID in URL while game is active
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('lobby', lobbyId);
    window.history.replaceState(null, '', newUrl.toString());

    network.connect(lobbyId, userId, userName);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[clungiverse] Lobby init failed:', err);
    state.lobbyStatus = 'error';
    state.lobbyError = String(err);
  }
}

void initLobby();

// Start game loop
requestAnimationFrame(gameLoop);

// eslint-disable-next-line no-console
console.log('[clungiverse] Client initialized');
