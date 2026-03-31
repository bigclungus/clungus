// Clungiverse Dungeon Scene
// Main gameplay: input -> network -> render

import type { DungeonClientState } from '../state';
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

/**
 * Update fog-of-war tiles around a world position.
 * Demotes previously-visible tiles (2) to explored-not-visible (1),
 * then marks tiles within FOG_RADIUS as currently visible (2).
 */
function updateFogOfWar(state: DungeonClientState, wx: number, wy: number): void {
  const explored = state.exploredTiles;
  const gw = state.gridWidth;
  const gh = state.gridHeight;
  if (!explored || explored.length !== gw * gh || gw === 0) return;

  const FOG_RADIUS = 9;
  const col = Math.floor(wx / FOG_TILE_SIZE);
  const row = Math.floor(wy / FOG_TILE_SIZE);
  const rSq = FOG_RADIUS * FOG_RADIUS;

  // Demote visible tiles in the scan window to explored-not-visible
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

  // Mark tiles within radius as currently visible
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

export function createDungeonScene(network: DungeonNetwork): DungeonScene {
  // Reference to state for event handler (set in enter())
  let sceneState: DungeonClientState | null = null;

  // Tick event handler for VFX — maps server event types to client VFX
  function onTickEvent(data: unknown): void {
    const ev = data as { type: string; payload: Record<string, unknown> };
    switch (ev.type) {
      // Server sends "damage" events for both enemy and player hits
      case 'damage': {
        // Attempt to render at target position
        const targetId = ev.payload.targetId as string;
        const damage = ev.payload.damage as number;
        const isCrit = ev.payload.isCrit as boolean;
        // Find target position from enemies or players
        if (sceneState) {
          const enemy = sceneState.enemies.get(targetId);
          if (enemy) {
            spawnHitSparks(enemy.x, enemy.y);
            if (damage) spawnDamageText(enemy.x, enemy.y, damage, isCrit ?? false);
          } else {
            const player = sceneState.players.get(targetId);
            if (player) {
              spawnHitSparks(player.x, player.y);
              if (damage) spawnDamageText(player.x, player.y, damage, isCrit ?? false);
            }
          }
        }
        break;
      }
      case 'kill': {
        // Enemy killed — spawn death effect at enemy position
        const enemyId = ev.payload.enemyId as string;
        if (sceneState) {
          const enemy = sceneState.enemies.get(enemyId);
          if (enemy) {
            spawnDeathPoof(enemy.x, enemy.y);
          }
        }
        break;
      }
      case 'power_activate': {
        const playerId = ev.payload.playerId as string;
        if (sceneState) {
          const player = sceneState.players.get(playerId);
          if (player) {
            spawnPowerActivation(player.x, player.y);
            // Crundle: set scramble window on client immediately for responsive speed
            if (ev.payload.power === 'nervous_scramble') {
              player.scramblingUntil = Date.now() + 2000;
            }
          }
        }
        break;
      }
      case 'player_death': {
        const playerId = ev.payload.playerId as string;
        if (sceneState) {
          const player = sceneState.players.get(playerId);
          if (player) {
            spawnDeathPoof(player.x, player.y);
          }
        }
        triggerShake(4, 300);
        break;
      }
      case 'door_open': {
        // Mark room as cleared and update tile grid
        const roomIndex = ev.payload.roomIndex as number;
        if (sceneState && roomIndex >= 0 && roomIndex < sceneState.rooms.length) {
          sceneState.rooms[roomIndex].cleared = true;
          // Open door tiles: scan room border for door_closed tiles (value 2) -> door_open (3)
          const room = sceneState.rooms[roomIndex];
          const grid = sceneState.tileGrid;
          const gw = sceneState.gridWidth;
          if (grid && gw > 0) {
            for (let ry = room.y - 1; ry <= room.y + room.h; ry++) {
              for (let rx = room.x - 1; rx <= room.x + room.w; rx++) {
                if (rx < 0 || rx >= gw || ry < 0 || ry >= sceneState.gridHeight) continue;
                const idx = ry * gw + rx;
                if (grid[idx] === 2) { // TILE_DOOR_CLOSED
                  grid[idx] = 3; // TILE_DOOR_OPEN
                }
              }
            }
          }
        }
        triggerShake(2, 150);
        break;
      }
      case 'boss_phase': {
        triggerShake(6, 500);
        triggerFlash();
        break;
      }
      case 'pickup': {
        // Show floating heal text for health pickups
        const pickupPlayerId = ev.payload.playerId as string;
        const templateId = ev.payload.templateId as string;
        const healAmount = ev.payload.healAmount as number | undefined;
        if (templateId === 'health' && healAmount && healAmount > 0 && sceneState) {
          const pickupPlayer = sceneState.players.get(pickupPlayerId);
          if (pickupPlayer) {
            spawnHealText(pickupPlayer.x, pickupPlayer.y, healAmount);
          }
        }
        break;
      }
    }
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
      // 1. Apply input immediately (client prediction — renders this frame)
      const input = pollInput();

      // Handle spectate-next (Tab) if we're spectating
      if (state.isSpectating && input.spectateNext) {
        const aliveOthers = Array.from(state.players.values()).filter(
          (p) => !p.isLocal && p.alive && !p.spectating
        );
        if (aliveOthers.length > 1 && state.spectatorTargetId !== null) {
          const currentIdx = aliveOthers.findIndex((p) => p.id === state.spectatorTargetId);
          const nextIdx = (currentIdx + 1) % aliveOthers.length;
          state.spectatorTargetId = aliveOthers[nextIdx].id;
        }
      }

      if (!state.isSpectating && (input.dx !== 0 || input.dy !== 0)) {
        applyLocalInput(state, input.dx, input.dy, input.facingX, input.facingY, dt);
      }

      // Send absolute position to server every frame (client-authoritative)
      const local = getLocalPlayer(state);
      if (local && !state.isSpectating) {
        network.sendMove(local.x, local.y, local.facingX, local.facingY, state.inputSeq);

        // Update fog of war around local player
        updateFogOfWar(state, local.x, local.y);

        // Track visited rooms for cleared-room tint
        const ptx = local.x / FOG_TILE_SIZE;
        const pty = local.y / FOG_TILE_SIZE;
        for (let i = 0; i < state.rooms.length; i++) {
          if (state.visitedRooms.has(i)) continue;
          const r = state.rooms[i];
          if (ptx >= r.x && ptx < r.x + r.w && pty >= r.y && pty < r.y + r.h) {
            state.visitedRooms.add(i);
          }
        }
      }

      // Spectator fog of war: reveal tiles around the spectated player's position
      if (state.isSpectating && state.spectatorTargetId !== null) {
        const spectatedPlayer = state.players.get(state.spectatorTargetId);
        if (spectatedPlayer) {
          updateFogOfWar(state, spectatedPlayer.x, spectatedPlayer.y);
        }
      }

      if (input.power && !state.isSpectating) {
        network.sendPower();
      }

      // Update particles
      updateParticles(dt);

      // Update screen shake
      if (shakeDuration > 0) {
        shakeDuration -= dt * 1000;
        shakeX = (Math.random() - 0.5) * 2 * shakeIntensity;
        shakeY = (Math.random() - 0.5) * 2 * shakeIntensity;
        if (shakeDuration <= 0) {
          shakeX = 0;
          shakeY = 0;
        }
      }

      // Fade flash
      if (flashAlpha > 0) {
        flashAlpha -= dt * 0.5;
        if (flashAlpha < 0) flashAlpha = 0;
      }
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
