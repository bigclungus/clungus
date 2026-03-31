// Clungiverse Client — Entry point
// Canvas init, scene management, game loop, networking

import { createInitialState, type DungeonClientState, type SceneName } from './state';
import { initCanvas, getCanvas, clearCanvas } from './renderer/canvas';
import { initInput } from './input/input';
import { DungeonNetwork } from './network/dungeon-network';
import { createLobbyScene } from './scenes/lobby';
import { createDungeonScene } from './scenes/dungeon';
import { createTransitionScene } from './scenes/transition';
import { createResultsScene } from './scenes/results';
import { createMobPreviewScene } from './scenes/mob-preview';
import { preloadAvatars } from './renderer/entity-renderer';

// === Canvas Setup ===

const canvasEl = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvasEl) throw new Error('Missing #game-canvas element');

const ctx = initCanvas(canvasEl);

// === State ===

const state: DungeonClientState = createInitialState();

// === Network ===

const network = new DungeonNetwork(state);

// === Input ===

initInput(getCanvas());
preloadAvatars();

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
    const res = await fetch('/api/me');
    if (res.ok) {
      const data = await res.json() as { username?: string };
      if (data.username) return data.username;
    }
  } catch {
    // Not authenticated or network error — use fallback
  }
  return 'Adventurer';
}

const userId = `player-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
let userName = 'Adventurer';
state.playerId = userId;
state.playerName = userName;

// Start with lobby scene
switchScene('lobby');

network.on('connected', () => {
  console.log('[clungiverse] Connected to dungeon server');
});

network.on('disconnected', () => {
  console.log('[clungiverse] Disconnected from dungeon server');
});

network.on('error', (msg) => {
  console.error('[clungiverse] Server error:', msg);
});

// Check URL params for ?lobby=<id> to join an existing lobby
const urlParams = new URLSearchParams(window.location.search);
const joinLobbyId = urlParams.get('lobby');

// Create or join lobby, then connect WebSocket
async function initLobby(): Promise<void> {
  // Resolve GitHub username before creating/joining lobby
  userName = await fetchUsername();
  state.playerName = userName;

  try {
    let lobbyId: string;
    let joinedExisting = false;

    if (joinLobbyId) {
      // Try to join an existing lobby from invite/URL param
      state.lobbyStatus = 'joining';
      console.log('[clungiverse] Joining lobby from invite:', joinLobbyId);

      try {
        const joinRes = await fetch(`/api/clungiverse/lobby/${joinLobbyId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, name: userName }),
        });
        if (!joinRes.ok) {
          const err = await joinRes.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error ?? `HTTP ${joinRes.status}`);
        }
        lobbyId = joinLobbyId;
        joinedExisting = true;
        console.log('[clungiverse] Joined lobby:', lobbyId);
      } catch (joinErr) {
        // Lobby doesn't exist or join failed — clear stale URL param and create fresh
        console.warn('[clungiverse] Failed to join lobby from URL, creating new one:', joinErr);
        clearLobbyParam();
      }
    }

    if (!joinedExisting) {
      // Create a new lobby
      state.lobbyStatus = 'creating';
      const createRes = await fetch('/api/clungiverse/lobby/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name: userName }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${createRes.status}`);
      }
      const createData = await createRes.json() as { lobbyId: string };
      lobbyId = createData.lobbyId;
      console.log('[clungiverse] Created lobby:', lobbyId);

      state.lobbyStatus = 'joining';
      const joinRes = await fetch(`/api/clungiverse/lobby/${lobbyId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name: userName }),
      });
      if (!joinRes.ok) {
        const err = await joinRes.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${joinRes.status}`);
      }
      console.log('[clungiverse] Joined lobby:', lobbyId);
    }

    state.lobbyId = lobbyId!;
    state.lobbyStatus = 'connected';

    // Persist lobby ID in URL while game is active
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('lobby', lobbyId!);
    window.history.replaceState(null, '', newUrl.toString());

    network.connect(lobbyId!, userId, userName);
  } catch (err) {
    console.error('[clungiverse] Lobby init failed:', err);
    state.lobbyStatus = 'error';
    state.lobbyError = String(err);
  }
}

initLobby();

// Start game loop
requestAnimationFrame(gameLoop);

console.log('[clungiverse] Client initialized');
