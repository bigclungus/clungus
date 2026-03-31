// Clungiverse HUD Renderer
// Draws overlay UI elements (not affected by camera)

import type { DungeonClientState, ClientPlayer } from '../state';
import { PERSONAS, TEMP_POWERUP_META, TEMP_POWERUP_MAX_DURATIONS, TILE_WALL } from '../state';
import { isTileExplored, isTileVisible } from './dungeon-renderer';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function renderHpBar(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  canvasW: number,
  canvasH: number,
): void {
  const barW = 200;
  const barH = 16;
  const barX = (canvasW - barW) / 2;
  const barY = canvasH - 40;

  ctx.fillStyle = '#331111';
  ctx.fillRect(barX, barY, barW, barH);

  const hpRatio = state.localMaxHp > 0 ? Math.max(0, state.localHp / state.localMaxHp) : 0;
  const green = Math.round(hpRatio * 180);
  const red = Math.round((1 - hpRatio) * 220);
  ctx.fillStyle = `rgb(${String(red)},${String(green)},40)`;
  ctx.fillRect(barX, barY, barW * hpRatio, barH);

  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);

  ctx.fillStyle = '#ffffff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    `${String(Math.ceil(state.localHp))} / ${String(state.localMaxHp)}`,
    canvasW / 2,
    barY + barH - 3,
  );
}

function renderRosterMiniHp(
  ctx: CanvasRenderingContext2D,
  player: ClientPlayer,
  miniX: number,
  miniY: number,
  isSpectating: boolean,
): void {
  const miniW = 50;
  const miniH = 3;
  ctx.fillStyle = '#331111';
  ctx.fillRect(miniX, miniY, miniW, miniH);
  if (player.maxHp > 0) {
    const ratio = Math.max(0, player.hp / player.maxHp);
    ctx.fillStyle = isSpectating ? '#333355' : (player.alive ? '#44aa44' : '#444444');
    ctx.fillRect(miniX, miniY, miniW * ratio, miniH);
  }
}

function renderRosterRow(
  ctx: CanvasRenderingContext2D,
  player: ClientPlayer,
  rosterX: number,
  rosterY: number,
): void {
  const persona = PERSONAS[player.personaSlug];
  const color = persona.color;
  const name = player.name || player.personaSlug;
  const isSpectating = player.spectating && !player.alive;

  ctx.fillStyle = isSpectating ? '#444466' : color;
  ctx.beginPath();
  ctx.arc(rosterX + 6, rosterY + 4, 4, 0, Math.PI * 2);
  ctx.fill();

  const displayName = isSpectating ? `👻 ${name}` : name;
  ctx.fillStyle = isSpectating ? '#555577' : (player.alive ? '#cccccc' : '#666666');
  ctx.font = '9px monospace';
  ctx.fillText(displayName, rosterX + 14, rosterY + 7);

  renderRosterMiniHp(ctx, player, rosterX + 14, rosterY + 11, isSpectating);
}

function renderPartyRoster(ctx: CanvasRenderingContext2D, state: DungeonClientState): void {
  ctx.textAlign = 'left';
  let rosterY = 12;
  const rosterX = 8;
  for (const player of state.players.values()) {
    renderRosterRow(ctx, player, rosterX, rosterY);
    rosterY += 20;
  }
}

export function renderHud(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  canvasW: number,
  canvasH: number,
): void {
  renderHpBar(ctx, state, canvasW, canvasH);
  renderPartyRoster(ctx, state);

  if (state.isSpectating) {
    renderSpectatorOverlay(ctx, state, canvasW, canvasH);
  }

  // Floor Indicator (top center)
  ctx.fillStyle = '#cccccc';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`Floor ${String(state.floor)}/${String(state.totalFloors)}`, canvasW / 2, 18);

  // Timer (top right)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#cccccc';
  ctx.font = '12px monospace';
  ctx.fillText(formatTime(state.elapsedMs), canvasW - 10, 18);

  // Kill Counter + Mob Count (bottom left)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#cccccc';
  ctx.font = '11px monospace';
  ctx.fillText(`Kills: ${String(state.kills)}`, 10, canvasH - 26);

  ctx.fillStyle = '#dd8844';
  ctx.fillText(`Mobs: ${String(state.remainingMobs)}/${String(state.totalMobs)}`, 10, canvasH - 12);

  renderActiveTempPowerups(ctx, state, canvasW, canvasH);
  renderPowerCooldown(ctx, state, canvasW, canvasH);
  renderMinimap(ctx, state, canvasW, canvasH);
}

function renderSpectatorOverlay(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  canvasW: number,
  canvasH: number,
): void {
  // Dark vignette border to indicate spectator mode
  const grad = ctx.createRadialGradient(
    canvasW / 2, canvasH / 2, canvasH * 0.3,
    canvasW / 2, canvasH / 2, canvasH * 0.7,
  );
  grad.addColorStop(0, 'rgba(0,0,50,0)');
  grad.addColorStop(1, 'rgba(0,0,80,0.45)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // "SPECTATING" label at top center
  ctx.fillStyle = 'rgba(150,150,255,0.9)';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';

  const targetPlayer = state.spectatorTargetId ? state.players.get(state.spectatorTargetId) : null;
  const targetName = targetPlayer ? (targetPlayer.name || targetPlayer.personaSlug) : '---';
  ctx.fillText(`SPECTATING: ${targetName}`, canvasW / 2, 38);

  // Tab hint if multiple alive players
  const aliveCount = Array.from(state.players.values()).filter((p) => !p.isLocal && p.alive && !p.spectating).length;
  if (aliveCount > 1) {
    ctx.fillStyle = 'rgba(120,120,200,0.7)';
    ctx.font = '10px monospace';
    ctx.fillText('[TAB] to switch', canvasW / 2, 54);
  }
}

function renderActiveTempPowerups(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  canvasW: number,
  canvasH: number,
): void {
  const now = Date.now();
  const active = state.localTempPowerups.filter((a) => a.expiresAt > now);
  if (active.length === 0) return;

  const slotW = 80;
  const slotH = 20;
  const gap = 4;
  const totalW = active.length * (slotW + gap) - gap;
  let x = (canvasW - totalW) / 2;
  const y = canvasH - 65;

  for (const tp of active) {
    const meta = TEMP_POWERUP_META[tp.templateId] ?? { name: tp.templateId, emoji: '✨', color: '#ffffff' };
    const remainMs = tp.expiresAt - now;
    const remainSec = Math.ceil(remainMs / 1000);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x, y, slotW, slotH);

    const maxMs = TEMP_POWERUP_MAX_DURATIONS[tp.templateId] ?? 20000;
    const ratio = Math.min(1, remainMs / maxMs);

    ctx.fillStyle = meta.color + '88';
    ctx.fillRect(x, y + slotH - 3, slotW * ratio, 3);

    // Border
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, slotW, slotH);

    // Emoji + name + countdown
    ctx.fillStyle = '#ffffff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${meta.emoji} ${meta.name} ${String(remainSec)}s`, x + 3, y + 13);

    x += slotW + gap;
  }
}

function renderPowerCooldown(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  canvasW: number,
  canvasH: number,
): void {
  const cx = canvasW - 36;
  const cy = canvasH - 36;
  const r = 20;

  // Outer ring
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Cooldown fill (sweeps clockwise from top)
  if (state.localCooldownMax > 0 && state.localCooldown > 0) {
    const ratio = state.localCooldown / state.localCooldownMax;
    const endAngle = -Math.PI / 2 + Math.PI * 2 * (1 - ratio);

    ctx.fillStyle = 'rgba(100,100,100,0.6)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, -Math.PI / 2, endAngle);
    ctx.closePath();
    ctx.fill();
  }

  // Ready indicator
  if (state.localCooldownMax > 0 && state.localCooldown <= 0) {
    ctx.fillStyle = 'rgba(100,255,100,0.3)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Label
  ctx.fillStyle = '#cccccc';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SPC', cx, cy + 3);
}

function renderMinimapTiles(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  grid: number[],
  offsetX: number,
  offsetY: number,
  scale: number,
): void {
  const gw = state.gridWidth;
  const gh = state.gridHeight;
  for (let row = 0; row < gh; row++) {
    for (let col = 0; col < gw; col++) {
      const tile = grid[row * gw + col];
      if (tile === TILE_WALL) continue;

      if (!isTileExplored(state, col, row)) continue;
      const visible = isTileVisible(state, col, row);

      const px = Math.floor(offsetX + col * scale);
      const py = Math.floor(offsetY + row * scale);
      ctx.fillStyle = visible ? '#8a7a58' : '#4a4232';
      ctx.fillRect(px, py, Math.max(1, Math.ceil(scale)), Math.max(1, Math.ceil(scale)));
    }
  }
}

function renderMinimapEnemyDots(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  offsetX: number,
  offsetY: number,
  scale: number,
  dotR: number,
): void {
  for (const enemy of state.enemies.values()) {
    if (!enemy.alive) continue;
    const col = enemy.x / 16;
    const row = enemy.y / 16;
    if (!isTileVisible(state, Math.floor(col), Math.floor(row))) continue;
    ctx.fillStyle = '#ff2222';
    ctx.beginPath();
    ctx.arc(offsetX + col * scale, offsetY + row * scale, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.boss?.alive) {
    const bcol = state.boss.x / 16;
    const brow = state.boss.y / 16;
    if (isTileVisible(state, Math.floor(bcol), Math.floor(brow))) {
      ctx.fillStyle = '#ff8800';
      ctx.beginPath();
      ctx.arc(offsetX + bcol * scale, offsetY + brow * scale, dotR * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
}

function renderMinimapPlayerDots(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  offsetX: number,
  offsetY: number,
  scale: number,
  dotR: number,
): void {
  for (const player of state.players.values()) {
    if (player.isLocal || !player.alive) continue;
    const color = PERSONAS[player.personaSlug].color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(offsetX + (player.x / 16) * scale, offsetY + (player.y / 16) * scale, dotR * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  const localPlayer = state.players.get(state.playerId);
  if (localPlayer) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(offsetX + (localPlayer.x / 16) * scale, offsetY + (localPlayer.y / 16) * scale, dotR * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

function renderMinimapDots(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  offsetX: number,
  offsetY: number,
  scale: number,
  dotR: number,
): void {
  renderMinimapEnemyDots(ctx, state, offsetX, offsetY, scale, dotR);
  renderMinimapPlayerDots(ctx, state, offsetX, offsetY, scale, dotR);
}

function renderMinimap(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  canvasW: number,
  _canvasH: number,
): void {
  const grid = state.tileGrid;
  if (!grid || state.gridWidth === 0 || state.gridHeight === 0) return;

  const MAP_SIZE = 130;
  const MARGIN = 10;
  const mapX = canvasW - MAP_SIZE - MARGIN;
  const mapY = MARGIN + 24;

  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(mapX, mapY, MAP_SIZE, MAP_SIZE);

  ctx.strokeStyle = 'rgba(150,150,150,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mapX, mapY, MAP_SIZE, MAP_SIZE);

  const gw = state.gridWidth;
  const gh = state.gridHeight;
  const scale = Math.min(MAP_SIZE / gw, MAP_SIZE / gh);
  const offsetX = mapX + (MAP_SIZE - gw * scale) / 2;
  const offsetY = mapY + (MAP_SIZE - gh * scale) / 2;

  renderMinimapTiles(ctx, state, grid, offsetX, offsetY, scale);

  ctx.save();
  ctx.beginPath();
  ctx.rect(mapX, mapY, MAP_SIZE, MAP_SIZE);
  ctx.clip();

  renderMinimapDots(ctx, state, offsetX, offsetY, scale, Math.max(1.5, scale * 0.7));

  ctx.restore();
}
