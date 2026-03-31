// Clungiverse Dungeon Scene
// Main gameplay: input -> network -> render

import type { DungeonClientState } from '../state';
import { TILE_DOOR_CLOSED, TILE_DOOR_OPEN } from '../state';
import type { DungeonNetwork } from '../network/dungeon-network';
import { pollInput } from '../input/input';
import { applyLocalInput, getLocalPlayer } from '../entities/local-player';
import {
  centerCamera,
  pushCameraTransform,
  popCameraTransform,
} from '../renderer/canvas';
import { renderDungeon, TILE_SIZE as FOG_TILE_SIZE } from '../renderer/dungeon-renderer';
import { renderPlayers, renderEnemies, renderProjectiles, renderAoeZones } from '../renderer/entity-renderer';
import { renderHud } from '../renderer/hud';
import { updateParticles, renderParticles, spawnHitSparks, spawnDeathPoof, spawnPowerActivation, spawnHealText, spawnDamageText, clearAllParticles } from '../renderer/particles';

interface DungeonScene {
  enter(state: DungeonClientState): void;
  update(state: DungeonClientState, dt: number): void;
  render(state: DungeonClientState, ctx: CanvasRenderingContext2D): void;
  exit(state: DungeonClientState): void;
}

// Screen shake
let shakeX = 0;
let shakeY = 0;
let shakeDuration = 0;
let shakeIntensity = 0;

// Flash effect
let flashAlpha = 0;

function triggerShake(intensity: number, duration: number): void {
  shakeIntensity = intensity;
  shakeDuration = duration;
}

function triggerFlash(): void {
  flashAlpha = 0.3;
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

/**
 * Update fog-of-war tiles around a world position.
 * Demotes previously-visible tiles (2) to explored-not-visible (1),
 * then marks tiles within FOG_RADIUS as currently visible (2).
 */
function updateFogOfWar(state: DungeonClientState, wx: number, wy: number): void {
  const explored = state.exploredTiles;
  const gw = state.gridWidth;
  const gh = state.gridHeight;
  if (explored?.length !== gw * gh || gw === 0) return;

  const col = Math.floor(wx / FOG_TILE_SIZE);
  const row = Math.floor(wy / FOG_TILE_SIZE);
  demoteFogTiles(explored, gw, gh, col, row);
  markVisibleTiles(explored, gw, gh, col, row);
}

type TickPayload = Record<string, unknown>;

function handleDamageEvent(state: DungeonClientState, payload: TickPayload): void {
  const targetId = payload.targetId as string;
  const damage = payload.damage as number;
  const isCrit = (payload.isCrit as boolean) ?? false;
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

function handlePlayerDeathEvent(state: DungeonClientState, payload: TickPayload): void {
  const player = state.players.get(payload.playerId as string);
  if (player) spawnDeathPoof(player.x, player.y);
  triggerShake(4, 300);
}

function openDoorTiles(state: DungeonClientState, roomIndex: number): void {
  const room = state.rooms[roomIndex];
  const grid = state.tileGrid;
  const gw = state.gridWidth;
  if (!grid || gw === 0) return;
  for (let ry = room.y - 1; ry <= room.y + room.h; ry++) {
    for (let rx = room.x - 1; rx <= room.x + room.w; rx++) {
      if (rx < 0 || rx >= gw || ry < 0 || ry >= state.gridHeight) continue;
      const idx = ry * gw + rx;
      if (grid[idx] === TILE_DOOR_CLOSED) grid[idx] = TILE_DOOR_OPEN;
    }
  }
}

function handleDoorOpenEvent(state: DungeonClientState, payload: TickPayload): void {
  const roomIndex = payload.roomIndex as number;
  if (roomIndex >= 0 && roomIndex < state.rooms.length) {
    state.rooms[roomIndex].cleared = true;
    openDoorTiles(state, roomIndex);
  }
  triggerShake(2, 150);
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
    (p) => !p.isLocal && p.alive && !p.spectating
  );
  if (aliveOthers.length > 1 && state.spectatorTargetId !== null) {
    const currentIdx = aliveOthers.findIndex((p) => p.id === state.spectatorTargetId);
    state.spectatorTargetId = aliveOthers[(currentIdx + 1) % aliveOthers.length].id;
  }
}

function trackVisitedRooms(state: DungeonClientState, x: number, y: number): void {
  const ptx = x / FOG_TILE_SIZE;
  const pty = y / FOG_TILE_SIZE;
  for (let i = 0; i < state.rooms.length; i++) {
    if (state.visitedRooms.has(i)) continue;
    const r = state.rooms[i];
    if (ptx >= r.x && ptx < r.x + r.w && pty >= r.y && pty < r.y + r.h) {
      state.visitedRooms.add(i);
    }
  }
}

function tickSpectate(
  state: DungeonClientState,
  input: { spectateNext: boolean; power: boolean },
): void {
  if (!state.isSpectating) return;
  tickSpectateNext(state, input.spectateNext);
  if (state.spectatorTargetId !== null) {
    const target = state.players.get(state.spectatorTargetId);
    if (target) updateFogOfWar(state, target.x, target.y);
  }
}

function tickLocalMovement(
  state: DungeonClientState,
  network: DungeonNetwork,
  input: { dx: number; dy: number; facingX: number; facingY: number; power: boolean; spectateNext: boolean },
  dt: number,
): void {
  if (state.isSpectating) return;
  if (input.dx !== 0 || input.dy !== 0) {
    applyLocalInput(state, input.dx, input.dy, input.facingX, input.facingY, dt);
  }
  const local = getLocalPlayer(state);
  if (local) {
    network.sendMove(local.x, local.y, local.facingX, local.facingY, state.inputSeq);
    updateFogOfWar(state, local.x, local.y);
    trackVisitedRooms(state, local.x, local.y);
  }
  if (input.power) network.sendPower();
}

function tickShakeAndFlash(dt: number): void {
  if (shakeDuration > 0) {
    shakeDuration -= dt * 1000;
    shakeX = (Math.random() - 0.5) * 2 * shakeIntensity;
    shakeY = (Math.random() - 0.5) * 2 * shakeIntensity;
    if (shakeDuration <= 0) { shakeX = 0; shakeY = 0; }
  }
  if (flashAlpha > 0) {
    flashAlpha -= dt * 0.5;
    if (flashAlpha < 0) flashAlpha = 0;
  }
}

type EventHandler = (state: DungeonClientState, payload: TickPayload) => void;
const TICK_EVENT_HANDLERS: Record<string, EventHandler> = {
  damage: handleDamageEvent,
  kill: handleKillEvent,
  power_activate: handlePowerActivateEvent,
  player_death: handlePlayerDeathEvent,
  door_open: handleDoorOpenEvent,
  pickup: handlePickupEvent,
};

export function createDungeonScene(network: DungeonNetwork): DungeonScene {
  // Reference to state for event handler (set in enter())
  let sceneState: DungeonClientState | null = null;

  function onTickEvent(data: unknown): void {
    const ev = data as { type: string; payload: TickPayload };
    if (ev.type === 'boss_phase') {
      triggerShake(6, 500);
      triggerFlash();
      return;
    }
    const handler = TICK_EVENT_HANDLERS[ev.type];
    if (handler && sceneState) handler(sceneState, ev.payload);
  }

  return {
    enter(state: DungeonClientState): void {
      sceneState = state;
      clearAllParticles();
      shakeX = 0;
      shakeY = 0;
      shakeDuration = 0;
      flashAlpha = 0;
      network.on('tick_event', onTickEvent);
    },

    update(state: DungeonClientState, dt: number): void {
      const input = pollInput();
      tickSpectate(state, input);
      tickLocalMovement(state, network, input, dt);
      tickShakeAndFlash(dt);
      updateParticles(dt);
    },

    render(state: DungeonClientState, ctx: CanvasRenderingContext2D): void {
      const canvasW = ctx.canvas.width;
      const canvasH = ctx.canvas.height;

      // Center camera: follow spectated player if spectating, otherwise local player
      if (state.isSpectating && state.spectatorTargetId !== null) {
        const target = state.players.get(state.spectatorTargetId);
        if (target) {
          centerCamera(target.x + shakeX, target.y + shakeY);
        }
      } else {
        const local = getLocalPlayer(state);
        if (local) {
          centerCamera(local.x + shakeX, local.y + shakeY);
        }
      }

      // World-space rendering (with camera transform)
      pushCameraTransform();

      // Dungeon tiles
      renderDungeon(ctx, state);

      // AoE zones (below entities)
      renderAoeZones(ctx, state);

      // Entities
      renderEnemies(ctx, state);
      renderPlayers(ctx, state);
      renderProjectiles(ctx, state);

      // Particles (world space)
      renderParticles(ctx);

      popCameraTransform();

      // Screen-space rendering (HUD)
      renderHud(ctx, state, canvasW, canvasH);

      // Flash overlay
      if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
        ctx.fillRect(0, 0, canvasW, canvasH);
      }

      // Disconnected overlay
      if (!state.connected) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.fillStyle = '#ff4444';
        ctx.font = '18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DISCONNECTED', canvasW / 2, canvasH / 2 - 10);
        ctx.fillStyle = '#888888';
        ctx.font = '12px monospace';
        ctx.fillText('Attempting to reconnect...', canvasW / 2, canvasH / 2 + 15);
      }
    },

    exit(_state: DungeonClientState): void {
      sceneState = null;
      network.off('tick_event', onTickEvent);
      clearAllParticles();
    },
  };
}
