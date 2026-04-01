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

// === Virtual Joystick + Fire Button (touch devices) ===

function createTouchControls(): void {
  const BASE_SIZE = 100;
  const THUMB_SIZE = 40;
  const RADIUS = BASE_SIZE / 2;
  const DEAD_ZONE = RADIUS * 0.15;

  const style = document.createElement('style');
  style.textContent = `
    #joystick-base {
      position: fixed;
      bottom: 24px;
      left: 24px;
      width: ${String(BASE_SIZE)}px;
      height: ${String(BASE_SIZE)}px;
      border-radius: 50%;
      background: rgba(40,40,40,0.55);
      border: 1px solid rgba(255,255,255,0.15);
      display: none;
      z-index: 100;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
    }
    @media (hover: none) and (pointer: coarse) {
      #joystick-base { display: block; }
    }
    #joystick-thumb {
      position: absolute;
      width: ${String(THUMB_SIZE)}px;
      height: ${String(THUMB_SIZE)}px;
      border-radius: 50%;
      background: rgba(200,200,200,0.5);
      border: 1px solid rgba(255,255,255,0.3);
      top: ${String((BASE_SIZE - THUMB_SIZE) / 2)}px;
      left: ${String((BASE_SIZE - THUMB_SIZE) / 2)}px;
      pointer-events: none;
    }
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
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
    }
    .dpad-fire::after {
      content: '';
      display: block;
      width: 10px;
      height: 10px;
      background: #ffe;
      border-radius: 50%;
    }
    @media (hover: none) and (pointer: coarse) {
      .dpad-fire { display: flex; }
    }
  `;
  document.head.appendChild(style);

  // --- Joystick ---
  const base = document.createElement('div');
  base.id = 'joystick-base';
  const thumb = document.createElement('div');
  thumb.id = 'joystick-thumb';
  base.appendChild(thumb);
  document.body.appendChild(base);

  const centerX = RADIUS;
  const centerY = RADIUS;
  const thumbRadius = THUMB_SIZE / 2;
  const maxThumbOffset = RADIUS - thumbRadius;

  // Direction keys currently held by the joystick
  const heldKeys = new Set<string>();
  let joystickTouchId: number | null = null;

  function setThumbPosition(dx: number, dy: number): void {
    thumb.style.left = `${String(centerX - thumbRadius + dx)}px`;
    thumb.style.top = `${String(centerY - thumbRadius + dy)}px`;
  }

  function resetThumb(): void {
    setThumbPosition(0, 0);
  }

  function releaseAllHeld(): void {
    for (const k of heldKeys) releaseKey(k);
    heldKeys.clear();
  }

  /** Map angle + distance to direction keys. Angle in radians, 0 = right, counter-clockwise positive. */
  function updateDirection(dx: number, dy: number): void {
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < DEAD_ZONE) {
      releaseAllHeld();
      return;
    }

    // atan2 with screen coords: dy is inverted (down = positive)
    // Angle: 0=right, positive=clockwise in screen space
    let angle = Math.atan2(dy, dx); // radians, -PI to PI
    if (angle < 0) angle += Math.PI * 2; // normalize to 0..2PI

    // Convert to degrees for sector math
    const deg = (angle * 180) / Math.PI;

    // 8 sectors of 45 degrees each, centered on the cardinal/diagonal
    // Sector boundaries: 22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5
    let keys: string[];
    if (deg < 22.5 || deg >= 337.5) {
      keys = ['arrowright'];                          // E  (0)
    } else if (deg < 67.5) {
      keys = ['arrowright', 'arrowdown'];             // SE (45)
    } else if (deg < 112.5) {
      keys = ['arrowdown'];                           // S  (90)
    } else if (deg < 157.5) {
      keys = ['arrowleft', 'arrowdown'];              // SW (135)
    } else if (deg < 202.5) {
      keys = ['arrowleft'];                           // W  (180)
    } else if (deg < 247.5) {
      keys = ['arrowleft', 'arrowup'];                // NW (225)
    } else if (deg < 292.5) {
      keys = ['arrowup'];                             // N  (270)
    } else {
      keys = ['arrowright', 'arrowup'];               // NE (315)
    }

    const wanted = new Set(keys);

    // Release keys no longer wanted
    for (const k of heldKeys) {
      if (!wanted.has(k)) {
        releaseKey(k);
        heldKeys.delete(k);
      }
    }

    // Press newly wanted keys
    for (const k of wanted) {
      if (!heldKeys.has(k)) {
        pressKey(k);
        heldKeys.add(k);
      }
    }
  }

  function handleJoystickTouch(clientX: number, clientY: number): void {
    const rect = base.getBoundingClientRect();
    let dx = clientX - (rect.left + centerX);
    let dy = clientY - (rect.top + centerY);

    // Clamp thumb to base circle
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxThumbOffset) {
      dx = (dx / dist) * maxThumbOffset;
      dy = (dy / dist) * maxThumbOffset;
    }

    setThumbPosition(dx, dy);
    updateDirection(dx, dy);
  }

  base.addEventListener('touchstart', (e: TouchEvent) => {
    e.preventDefault();
    if (joystickTouchId !== null) return; // already tracking a touch
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    handleJoystickTouch(touch.clientX, touch.clientY);
  }, { passive: false });

  base.addEventListener('touchmove', (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchId) {
        handleJoystickTouch(touch.clientX, touch.clientY);
        break;
      }
    }
  }, { passive: false });

  const handleJoystickEnd = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId) {
        joystickTouchId = null;
        resetThumb();
        releaseAllHeld();
        break;
      }
    }
  };

  base.addEventListener('touchend', handleJoystickEnd, { passive: false });
  base.addEventListener('touchcancel', handleJoystickEnd, { passive: false });

  // --- Fire button (bottom-right) ---
  const fireBtn = document.createElement('div');
  fireBtn.className = 'dpad-fire';
  let fireTouchId: number | null = null;

  fireBtn.addEventListener('touchstart', (e: TouchEvent) => {
    e.preventDefault();
    if (fireTouchId !== null) return;
    fireTouchId = e.changedTouches[0].identifier;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  }, { passive: false });

  fireBtn.addEventListener('touchend', (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === fireTouchId) {
        fireTouchId = null;
        window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
        break;
      }
    }
  }, { passive: false });

  fireBtn.addEventListener('touchcancel', (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === fireTouchId) {
        fireTouchId = null;
        window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
        break;
      }
    }
  }, { passive: false });

  document.body.appendChild(fireBtn);
}

createTouchControls();

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
