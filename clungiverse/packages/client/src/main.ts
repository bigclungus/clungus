// Clungiverse v2 Client — Entry point
// PixiJS renderer for dungeon scene, Canvas 2D fallback for lobby/transition/results/mob-preview

import { createInitialState, type DungeonClientState, type SceneName } from './state';
import { initPixiApp, getScreenWidth, getScreenHeight } from './renderer/pixi-app';
import { initCanvas2dOverlay, showCanvas2d, hideCanvas2d, clearCanvas2d, getCanvas2d } from './renderer/canvas-compat';
import { initInput, pressKey, releaseKey } from './input/input';
import { DungeonNetwork } from './network/dungeon-network';
import { createLobbyScene } from './scenes/lobby';
import { createDungeonScene } from './scenes/dungeon';
import { createTransitionScene } from './scenes/transition';
import { createResultsScene } from './scenes/results';
import { createMobPreviewScene } from './scenes/mob-preview';
import { preloadAvatars } from './renderer/entity-renderer';

// === Canvas Setup ===

const pixiCanvasEl = document.getElementById('game-canvas');
if (!(pixiCanvasEl instanceof HTMLCanvasElement)) throw new Error('Missing #game-canvas element');
const pixiCanvas: HTMLCanvasElement = pixiCanvasEl;

// === State ===

const state: DungeonClientState = createInitialState();

// === Network ===

const network = new DungeonNetwork(state);

// === Scene Interfaces ===

// Canvas 2D scenes use the v1 interface
interface Canvas2DScene {
  enter(state: DungeonClientState): void;
  update(state: DungeonClientState, dt: number): void;
  render(state: DungeonClientState, ctx: CanvasRenderingContext2D): void;
  exit(state: DungeonClientState): void;
}

// PixiJS scenes use the v2 interface
interface PixiScene {
  enter(state: DungeonClientState): void;
  update(state: DungeonClientState, dt: number): void;
  render(state: DungeonClientState, screenW: number, screenH: number): void;
  exit(state: DungeonClientState): void;
}

// Scenes that use Canvas 2D overlay
const CANVAS2D_SCENES = new Set<SceneName>(['lobby', 'mob_preview', 'transition', 'results']);

function isCanvas2DScene(name: SceneName): boolean {
  return CANVAS2D_SCENES.has(name);
}

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

  function updateDirection(dx: number, dy: number): void {
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < DEAD_ZONE) {
      releaseAllHeld();
      return;
    }

    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI * 2;
    const deg = (angle * 180) / Math.PI;

    let keys: string[];
    if (deg < 22.5 || deg >= 337.5) {
      keys = ['arrowright'];
    } else if (deg < 67.5) {
      keys = ['arrowright', 'arrowdown'];
    } else if (deg < 112.5) {
      keys = ['arrowdown'];
    } else if (deg < 157.5) {
      keys = ['arrowleft', 'arrowdown'];
    } else if (deg < 202.5) {
      keys = ['arrowleft'];
    } else if (deg < 247.5) {
      keys = ['arrowleft', 'arrowup'];
    } else if (deg < 292.5) {
      keys = ['arrowup'];
    } else {
      keys = ['arrowright', 'arrowup'];
    }

    const wanted = new Set(keys);
    for (const k of heldKeys) {
      if (!wanted.has(k)) {
        releaseKey(k);
        heldKeys.delete(k);
      }
    }
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
    if (joystickTouchId !== null) return;
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

  // --- Fire button ---
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

// === Scene Registry ===

function handleReturnToCommons(): void {
  network.disconnect();
  clearLobbyParam();
  window.location.href = '/commons-v2/';
}

let canvas2dScenes: Map<SceneName, Canvas2DScene>;
let pixiScenes: Map<SceneName, PixiScene>;
let ctx2d: CanvasRenderingContext2D;

let activeSceneName: SceneName | null = null;
let lastScene: SceneName;

// Clear lobby param from URL
function clearLobbyParam(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.has('lobby')) {
    url.searchParams.delete('lobby');
    window.history.replaceState(null, '', url.toString());
  }
}

function switchScene(name: SceneName): void {
  if (activeSceneName === name) return;

  // Exit current scene
  if (activeSceneName !== null) {
    if (isCanvas2DScene(activeSceneName)) {
      const scene = canvas2dScenes.get(activeSceneName);
      if (scene) scene.exit(state);
      hideCanvas2d();
    } else {
      const scene = pixiScenes.get(activeSceneName);
      if (scene) scene.exit(state);
    }
  }

  activeSceneName = name;

  // Enter new scene
  if (isCanvas2DScene(name)) {
    const scene = canvas2dScenes.get(name);
    if (scene) {
      showCanvas2d();
      scene.enter(state);
    }
  } else {
    const scene = pixiScenes.get(name);
    if (scene) {
      hideCanvas2d();
      scene.enter(state);
    }
  }
}

// === Game Loop ===

let lastTime = 0;

function gameLoop(timestamp: number): void {
  const dt = lastTime === 0 ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  // Check for scene changes from network
  if (state.scene !== lastScene) {
    switchScene(state.scene);
    if (state.scene === 'results') {
      clearLobbyParam();
    }
    lastScene = state.scene;
  }

  const screenW = getScreenWidth();
  const screenH = getScreenHeight();

  if (activeSceneName !== null) {
    if (isCanvas2DScene(activeSceneName)) {
      const scene = canvas2dScenes.get(activeSceneName);
      if (scene) {
        scene.update(state, dt);
        clearCanvas2d();
        scene.render(state, ctx2d);
      }
    } else {
      const scene = pixiScenes.get(activeSceneName);
      if (scene) {
        scene.update(state, dt);
        scene.render(state, screenW, screenH);
      }
    }
  }

  requestAnimationFrame(gameLoop);
}

// === Boot ===

async function fetchUsername(): Promise<string> {
  try {
    const res = await fetch('/api/me', { signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      const data = await res.json() as { username?: string };
      if (data.username) return data.username;
    }
  } catch (err) {
    console.warn('[clungiverse] Failed to fetch username:', err);
  }
  return 'Adventurer';
}

const userId = `player-${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}`;
let userName = 'Adventurer';
state.playerId = userId;
state.playerName = userName;

// Check URL params for ?lobby=<id>
const urlParams = new URLSearchParams(window.location.search);
const joinLobbyId = urlParams.get('lobby');

async function joinExistingLobby(id: string): Promise<string | null> {
  state.lobbyStatus = 'joining';
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
    return id;
  } catch (err) {
    console.warn('[clungiverse] Failed to join lobby:', err);
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
  return lobbyId;
}

async function initLobby(): Promise<void> {
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

// === Initialization ===

async function init(): Promise<void> {
  // Initialize PixiJS
  await initPixiApp(pixiCanvas);

  // Initialize Canvas 2D overlay for legacy scenes
  ctx2d = initCanvas2dOverlay();

  // Input uses the overlay canvas for mouse tracking (it's on top)
  const canvas2dEl = getCanvas2d();
  initInput(canvas2dEl ?? pixiCanvas);
  preloadAvatars();

  // Touch controls
  createTouchControls();

  // Register scenes
  canvas2dScenes = new Map<SceneName, Canvas2DScene>();
  canvas2dScenes.set('lobby', createLobbyScene(network));
  canvas2dScenes.set('mob_preview', createMobPreviewScene());
  canvas2dScenes.set('transition', createTransitionScene(network));
  canvas2dScenes.set('results', createResultsScene(handleReturnToCommons));

  pixiScenes = new Map<SceneName, PixiScene>();
  pixiScenes.set('dungeon', createDungeonScene(network));

  // Add HUD container to stage (always on top, screen-space)
  // The dungeon scene manages adding its HudRenderer to hudContainer

  lastScene = state.scene;
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

  void initLobby();

  requestAnimationFrame(gameLoop);

  // eslint-disable-next-line no-console
  console.log('[clungiverse] v2 Client initialized (PixiJS)');
}

void init();
