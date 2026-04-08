// Clungiverse v2 — Dungeon Scene (PixiJS)
// Main gameplay: input -> network -> render via PixiJS display objects

import type { DungeonClientState, PersonaSlug } from '../state';
import { TILE_SIZE, TILE_DOOR_CLOSED, TILE_DOOR_OPEN, PERSONAS } from '../state';
import type { DungeonNetwork } from '../network/dungeon-network';
import { pollInput } from '../input/input';
import { applyLocalInput, getLocalPlayer, tryActivateSprint } from '../entities/local-player';
import { app, worldContainer, hudContainer } from '../renderer/pixi-app';
import { camera, centerCamera, applyCamera, startShake } from '../renderer/camera';
import { TileRenderer, invalidateRoomMap } from '../renderer/tile-renderer';
import { EntityRenderer } from '../renderer/entity-renderer';
import {
  ParticleRenderer, clearAllParticles, spawnHitSparks, spawnDeathPoof,
  spawnPowerActivation, spawnSpinSweep, spawnHealText, spawnDamageText, spawnSprintTrail,
  setDustViewport, updateFootstepDust, resetFootstepTracking,
} from '../renderer/particle-renderer';
import { HudRenderer } from '../renderer/hud-renderer';
import {
  initPlayerLight, updatePlayerLight, hidePlayerLight, destroyPlayerLight,
  initVignette, resizeVignette, destroyVignette,
  initColorGrade, updateColorGrade, destroyColorGrade,
} from '../renderer/light-renderer';
import {
  DecorationRenderer, generateDecorations, clearDecorations,
} from '../renderer/decoration-renderer';
import {
  initParallax, updateParallax, destroyParallax,
} from '../renderer/parallax-renderer';

interface DungeonScene {
  enter(state: DungeonClientState): void;
  update(state: DungeonClientState, dt: number): void;
  render(state: DungeonClientState, screenW: number, screenH: number): void;
  exit(state: DungeonClientState): void;
}

// Flash effect
let flashAlpha = 0;

function triggerFlash(): void {
  flashAlpha = 0.3;
}

function sprintTrailColor(slug: PersonaSlug): number {
  const hex = PERSONAS[slug]?.color ?? '#ffffff';
  return parseInt(hex.replace('#', ''), 16);
}

const FOG_RADIUS = 9;

function demoteFogTiles(explored: Uint8Array, gw: number, gh: number, col: number, row: number): void {
  const minR = Math.max(0, row - FOG_RADIUS - 2);
  const maxR = Math.min(gh - 1, row + FOG_RADIUS + 2);
  const minC = Math.max(0, col - FOG_RADIUS - 2);
  const maxC = Math.min(gw - 1, col + FOG_RADIUS + 2);
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const idx = r * gw + c;
      if (explored[idx] === 2) explored[idx] = 1;
    }
  }
}

function markVisibleTiles(explored: Uint8Array, gw: number, gh: number, col: number, row: number): void {
  const rSq = FOG_RADIUS * FOG_RADIUS;
  const minRow = Math.max(0, row - FOG_RADIUS);
  const maxRow = Math.min(gh - 1, row + FOG_RADIUS);
  const minCol = Math.max(0, col - FOG_RADIUS);
  const maxCol = Math.min(gw - 1, col + FOG_RADIUS);
  for (let r = minRow; r <= maxRow; r++) {
    const dr = r - row;
    for (let c = minCol; c <= maxCol; c++) {
      const dc = c - col;
      if (dr * dr + dc * dc <= rSq) {
        explored[r * gw + c] = 2;
      }
    }
  }
}

function updateFogOfWar(state: DungeonClientState, wx: number, wy: number): void {
  const explored = state.exploredTiles;
  const gw = state.gridWidth;
  const gh = state.gridHeight;
  if (explored.length !== gw * gh || gw === 0) return;

  const col = Math.floor(wx / TILE_SIZE);
  const row = Math.floor(wy / TILE_SIZE);
  demoteFogTiles(explored, gw, gh, col, row);
  markVisibleTiles(explored, gw, gh, col, row);
}

type TickPayload = Record<string, unknown>;

function handleDamageEvent(state: DungeonClientState, payload: TickPayload): void {
  const targetId = payload.targetId as string;
  const damage = payload.damage as number;
  const isCrit = (payload.isCrit as boolean | undefined) ?? false;
  const enemy = state.enemies.get(targetId);
  if (enemy) {
    spawnHitSparks(enemy.x, enemy.y);
    if (damage) spawnDamageText(enemy.x, enemy.y, damage, isCrit);
    return;
  }
  const player = state.players.get(targetId);
  if (player) {
    spawnHitSparks(player.x, player.y);
    if (damage) spawnDamageText(player.x, player.y, damage, isCrit);
  }
}

function handleKillEvent(state: DungeonClientState, payload: TickPayload): void {
  const enemy = state.enemies.get(payload.enemyId as string);
  if (enemy) spawnDeathPoof(enemy.x, enemy.y);
}

function handlePowerActivateEvent(state: DungeonClientState, payload: TickPayload): void {
  const player = state.players.get(payload.playerId as string);
  if (!player) return;
  spawnPowerActivation(player.x, player.y);
  if (payload.power === 'nervous_scramble') {
    player.scramblingUntil = Date.now() + 2000;
  }
}

function handleSpinActivateEvent(state: DungeonClientState, payload: TickPayload): void {
  const player = state.players.get(payload.playerId as string);
  if (!player) return;
  spawnSpinSweep(player.x, player.y);
  startShake(2, 100);
}

function handlePlayerDeathEvent(state: DungeonClientState, payload: TickPayload): void {
  const player = state.players.get(payload.playerId as string);
  if (player) spawnDeathPoof(player.x, player.y);
  startShake(4, 300);
}

function openDoorTileAt(grid: number[], gw: number, gh: number, rx: number, ry: number): void {
  if (rx < 0 || rx >= gw || ry < 0 || ry >= gh) return;
  const idx = ry * gw + rx;
  if (grid[idx] === TILE_DOOR_CLOSED) grid[idx] = TILE_DOOR_OPEN;
}

function openDoorTiles(state: DungeonClientState, roomIndex: number): void {
  const room = state.rooms[roomIndex];
  const grid = state.tileGrid;
  const gw = state.gridWidth;
  if (!grid || gw === 0) return;
  for (let ry = room.y - 1; ry <= room.y + room.h; ry++) {
    for (let rx = room.x - 1; rx <= room.x + room.w; rx++) {
      openDoorTileAt(grid, gw, state.gridHeight, rx, ry);
    }
  }
}

function handleDoorOpenEvent(state: DungeonClientState, payload: TickPayload): void {
  const roomIndex = payload.roomIndex as number;
  if (roomIndex >= 0 && roomIndex < state.rooms.length) {
    state.rooms[roomIndex].cleared = true;
    openDoorTiles(state, roomIndex);
  }
  startShake(2, 150);
}

function handlePickupEvent(state: DungeonClientState, payload: TickPayload): void {
  const templateId = payload.templateId as string;
  const healAmount = payload.healAmount as number | undefined;
  if (templateId !== 'health' || !healAmount || healAmount <= 0) return;
  const player = state.players.get(payload.playerId as string);
  if (player) spawnHealText(player.x, player.y, healAmount);
}

function tickSpectateNext(state: DungeonClientState, spectateNext: boolean): void {
  if (!spectateNext) return;
  const aliveOthers = Array.from(state.players.values()).filter(
    (p) => !p.isLocal && p.alive && !p.spectating,
  );
  if (aliveOthers.length > 1 && state.spectatorTargetId !== null) {
    const currentIdx = aliveOthers.findIndex((p) => p.id === state.spectatorTargetId);
    state.spectatorTargetId = aliveOthers[(currentIdx + 1) % aliveOthers.length].id;
  }
}

function trackVisitedRooms(state: DungeonClientState, x: number, y: number): void {
  const ptx = x / TILE_SIZE;
  const pty = y / TILE_SIZE;
  for (let i = 0; i < state.rooms.length; i++) {
    if (state.visitedRooms.has(i)) continue;
    const r = state.rooms[i];
    if (ptx >= r.x && ptx < r.x + r.w && pty >= r.y && pty < r.y + r.h) {
      state.visitedRooms.add(i);
    }
  }
}

type EventHandler = (state: DungeonClientState, payload: TickPayload) => void;
const TICK_EVENT_HANDLERS: Record<string, EventHandler> = {
  damage: handleDamageEvent,
  kill: handleKillEvent,
  power_activate: handlePowerActivateEvent,
  spin_activate: handleSpinActivateEvent,
  player_death: handlePlayerDeathEvent,
  door_open: handleDoorOpenEvent,
  pickup: handlePickupEvent,
};

export function createDungeonScene(network: DungeonNetwork): DungeonScene {
  const tileRenderer = new TileRenderer();
  const entityRenderer = new EntityRenderer();
  const particleRenderer = new ParticleRenderer();
  const hudRenderer = new HudRenderer();
  const decorationRenderer = new DecorationRenderer();

  let sceneState: DungeonClientState | null = null;
  let vignetteInitialized = false;
  let colorGradeInitialized = false;
  let parallaxInitialized = false;
  let decorationsGenerated = false;
  let lastDecoFloor = -1;

  function onTickEvent(data: unknown): void {
    const ev = data as { type: string; payload: TickPayload };
    if (ev.type === 'boss_phase') {
      startShake(6, 500);
      triggerFlash();
      return;
    }
    const handler: EventHandler | undefined = (TICK_EVENT_HANDLERS as Record<string, EventHandler | undefined>)[ev.type];
    if (handler !== undefined && sceneState !== null) handler(sceneState, ev.payload);
  }

  return {
    enter(state: DungeonClientState): void {
      sceneState = state;
      clearAllParticles();
      resetFootstepTracking();
      invalidateRoomMap();
      flashAlpha = 0;
      vignetteInitialized = false;
      colorGradeInitialized = false;
      parallaxInitialized = false;
      decorationsGenerated = false;
      lastDecoFloor = -1;
      network.on('tick_event', onTickEvent);

      // Enhancement D: Parallax background (behind worldContainer)
      initParallax(app.stage);
      parallaxInitialized = true;

      // Add renderers to world container (camera-affected)
      worldContainer.addChild(tileRenderer.container);

      // Enhancement C: Decorations (on top of tiles, below entities)
      worldContainer.addChild(decorationRenderer.container);

      // Enhancement 3: Player light (between tiles and entities)
      initPlayerLight(worldContainer);

      worldContainer.addChild(entityRenderer.container);
      worldContainer.addChild(particleRenderer.container);

      // Add HUD to screen-space container (not camera-affected)
      hudContainer.addChild(hudRenderer.container);
    },

    update(state: DungeonClientState, dt: number): void {
      const input = pollInput();

      // Spectator logic
      if (state.isSpectating) {
        tickSpectateNext(state, input.spectateNext);
        if (state.spectatorTargetId !== null) {
          const target = state.players.get(state.spectatorTargetId);
          if (target) updateFogOfWar(state, target.x, target.y);
        }
      } else {
        // Local movement
        if (input.dx !== 0 || input.dy !== 0) {
          applyLocalInput(state, input.dx, input.dy, input.facingX, input.facingY, dt);
        }
        const local = getLocalPlayer(state);
        if (local) {
          // Sprint: trigger on spacebar if not on cooldown
          if (input.sprint) {
            tryActivateSprint(local);
          }
          // Sprint trail particles while sprinting
          if (local.sprintingUntil > Date.now()) {
            spawnSprintTrail(local.x, local.y, sprintTrailColor(local.personaSlug));
          }
          // Update HUD sprint state
          state.localSprintCooldownUntil = local.sprintCooldownUntil;
          state.localSprintingUntil = local.sprintingUntil;

          network.sendMove(local.x, local.y, local.facingX, local.facingY, state.inputSeq);
          updateFogOfWar(state, local.x, local.y);
          trackVisitedRooms(state, local.x, local.y);
          // Enhancement 7: Footstep dust
          updateFootstepDust(local.x, local.y);
        }
        if (input.power) network.sendPower();
        if (input.spinAttack) network.sendSpin();
      }

      // Flash decay
      if (flashAlpha > 0) {
        flashAlpha -= dt * 0.5;
        if (flashAlpha < 0) flashAlpha = 0;
      }

      particleRenderer.update(dt);
    },

    render(state: DungeonClientState, screenW: number, screenH: number): void {
      // Camera target
      let camTargetX = camera.x;
      let camTargetY = camera.y;

      if (state.isSpectating && state.spectatorTargetId !== null) {
        const target = state.players.get(state.spectatorTargetId);
        if (target) {
          camTargetX = target.x;
          camTargetY = target.y;
          centerCamera(target.x, target.y);
        }
      } else {
        const local = getLocalPlayer(state);
        if (local) {
          camTargetX = local.x;
          camTargetY = local.y;
          centerCamera(local.x, local.y);
        }
      }

      // Apply camera transform to worldContainer
      applyCamera(screenW, screenH);

      // Enhancement D: Update parallax layers
      if (parallaxInitialized) {
        updateParallax(camTargetX, camTargetY, screenW, screenH, camera.zoom);
      }

      // Enhancement 6: Update dust viewport for spawning near camera
      setDustViewport(camTargetX, camTargetY, screenW / camera.zoom, screenH / camera.zoom);

      // Enhancement C: Generate decorations once per floor
      if (state.tileGrid && state.floor !== lastDecoFloor) {
        generateDecorations(state.rooms, state.tileGrid, state.gridWidth, state.gridHeight);
        decorationsGenerated = true;
        lastDecoFloor = state.floor;
      }

      // Tile grid
      if (state.tileGrid) {
        tileRenderer.render(
          state.tileGrid,
          state.gridWidth,
          state.gridHeight,
          state.exploredTiles,
          camera.x,
          camera.y,
          screenW,
          screenH,
          camera.zoom,
          state.rooms,
        );
        tileRenderer.renderClearedRoomTints(state.rooms);
        tileRenderer.renderFloorPickups(state);
      }

      // Enhancement C: Render decorations
      if (decorationsGenerated) {
        decorationRenderer.render(
          state.exploredTiles,
          state.gridWidth,
          camera.x,
          camera.y,
          screenW,
          screenH,
          camera.zoom,
        );
      }

      // Enhancement 3: Player light
      const lightTarget = state.isSpectating && state.spectatorTargetId
        ? state.players.get(state.spectatorTargetId)
        : getLocalPlayer(state);
      if (lightTarget) {
        updatePlayerLight(lightTarget.x, lightTarget.y);
      } else {
        hidePlayerLight();
      }

      // Entities
      entityRenderer.render(state);

      // Particles
      particleRenderer.render();

      // HUD (screen-space)
      hudRenderer.render(state, screenW, screenH);

      // Enhancement 4: Vignette overlay (initialize once, resize as needed)
      if (!vignetteInitialized) {
        initVignette(hudContainer, screenW, screenH);
        vignetteInitialized = true;
      } else {
        resizeVignette(hudContainer, screenW, screenH);
      }

      // Enhancement E: Per-floor color grading
      if (!colorGradeInitialized) {
        initColorGrade(hudContainer);
        colorGradeInitialized = true;
      }
      updateColorGrade(state.floor, screenW, screenH);
    },

    exit(_state: DungeonClientState): void {
      sceneState = null;
      network.off('tick_event', onTickEvent);
      clearAllParticles();
      clearDecorations();

      // Remove renderers from world container
      worldContainer.removeChild(tileRenderer.container);
      worldContainer.removeChild(decorationRenderer.container);
      worldContainer.removeChild(entityRenderer.container);
      worldContainer.removeChild(particleRenderer.container);

      // Enhancement 3: Clean up player light
      destroyPlayerLight(worldContainer);

      // Enhancement 4: Clean up vignette
      destroyVignette(hudContainer);
      vignetteInitialized = false;

      // Enhancement E: Clean up color grade
      destroyColorGrade(hudContainer);
      colorGradeInitialized = false;

      // Enhancement D: Clean up parallax
      if (parallaxInitialized) {
        destroyParallax(app.stage);
        parallaxInitialized = false;
      }

      // Remove HUD from screen-space container
      hudContainer.removeChild(hudRenderer.container);

      tileRenderer.clear();
      entityRenderer.clear();
      particleRenderer.clear();
      hudRenderer.clear();
      decorationRenderer.clear();

      decorationsGenerated = false;
      lastDecoFloor = -1;
    },
  };
}
