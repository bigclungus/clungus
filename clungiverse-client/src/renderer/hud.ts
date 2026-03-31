// Clungiverse HUD Renderer
// Draws overlay UI elements (not affected by camera)

import type { DungeonClientState, PersonaSlug } from '../state';
import { PERSONAS, TEMP_POWERUP_META, TEMP_POWERUP_MAX_DURATIONS } from '../state';
import { TILE_WALL, TILE_FLOOR } from '../state';
import { isTileExplored, isTileVisible } from './dungeon-renderer';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function renderHud(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  canvasW: number,
  canvasH: number,
): void {
  // === Player HP Bar (bottom center, large) ===
  const barW = 200;
  const barH = 16;
  const barX = (canvasW - barW) / 2;
  const barY = canvasH - 40;

  // Background
  ctx.fillStyle = '#331111';
  ctx.fillRect(barX, barY, barW, barH);

  // Fill
  const hpRatio = state.localMaxHp > 0 ? Math.max(0, state.localHp / state.localMaxHp) : 0;
  const green = Math.round(hpRatio * 180);
  const red = Math.round((1 - hpRatio) * 220);
  ctx.fillStyle = `rgb(${red},${green},40)`;
  ctx.fillRect(barX, barY, barW * hpRatio, barH);

  // Border
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);

  // HP text
  ctx.fillStyle = '#ffffff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    `${Math.ceil(state.localHp)} / ${state.localMaxHp}`,
    canvasW / 2,
    barY + barH - 3,
  );

  // === Party Roster (top left) ===
  ctx.textAlign = 'left';
  let rosterY = 12;
  const rosterX = 8;

  for (const player of state.players.values()) {
    const persona = PERSONAS[player.personaSlug];
    const color = persona?.color ?? '#888888';
    const name = player.name || player.personaSlug;
    const isSpectating = player.spectating && !player.alive;

    // Small colored dot (greyed out if spectating)
    ctx.fillStyle = isSpectating ? '#444466' : color;
    ctx.beginPath();
    ctx.arc(rosterX + 6, rosterY + 4, 4, 0, Math.PI * 2);
    ctx.fill();

    // Ghost emoji prefix for spectating players
    const displayName = isSpectating ? `👻 ${name}` : name;

    // Name
    ctx.fillStyle = isSpectating ? '#555577' : (player.alive ? '#cccccc' : '#666666');
    ctx.font = '9px monospace';
    ctx.fillText(displayName, rosterX + 14, rosterY + 7);

    // Mini HP bar
    const miniW = 50;
    const miniH = 3;
    const miniX = rosterX + 14;
    const miniY = rosterY + 11;

    ctx.fillStyle = '#331111';
    ctx.fillRect(miniX, miniY, miniW, miniH);

    if (player.maxHp > 0) {
      const ratio = Math.max(0, player.hp / player.maxHp);
      ctx.fillStyle = isSpectating ? '#333355' : (player.alive ? '#44aa44' : '#444444');
      ctx.fillRect(miniX, miniY, miniW * ratio, miniH);
    }

    rosterY += 20;
  }

  // === Spectator Overlay ===
  if (state.isSpectating) {
    renderSpectatorOverlay(ctx, state, canvasW, canvasH);
  }

  // === Floor Indicator (top center) ===
  ctx.fillStyle = '#cccccc';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`Floor ${state.floor}/${state.totalFloors}`, canvasW / 2, 18);

  // === Timer (top right) ===
  ctx.textAlign = 'right';
  ctx.fillStyle = '#cccccc';
  ctx.font = '12px monospace';
  ctx.fillText(formatTime(state.elapsedMs), canvasW - 10, 18);

  // === Kill Counter + Mob Count (bottom left) ===
  ctx.textAlign = 'left';
  ctx.fillStyle = '#cccccc';
  ctx.font = '11px monospace';
  ctx.fillText(`Kills: ${state.kills}`, 10, canvasH - 26);

  // Use server-provided mob count (pre-placed enemies only, excludes boss spawns)
  const mobsRemaining = state.remainingMobs;
  const mobsTotal = state.totalMobs;
  ctx.fillStyle = '#dd8844';
  ctx.fillText(`Mobs: ${mobsRemaining}/${mobsTotal}`, 10, canvasH - 12);

  // === Active Temp Powerups (above HP bar, center) ===
  renderActiveTempPowerups(ctx, state, canvasW, canvasH);

  // === Power Cooldown (bottom right) ===
  renderPowerCooldown(ctx, state, canvasW, canvasH);

  // === Minimap (top right, below timer) ===
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
    ctx.fillText(`${meta.emoji} ${meta.name} ${remainSec}s`, x + 3, y + 13);

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

function renderMinimap(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  canvasW: number,
  canvasH: number,
): void {
  const grid = state.tileGrid;
  if (!grid || state.gridWidth === 0 || state.gridHeight === 0) return;

  const MAP_SIZE = 130; // px square
  const MARGIN = 10;
  const mapX = canvasW - MAP_SIZE - MARGIN;
  const mapY = MARGIN + 24; // below the timer text

  const gw = state.gridWidth;
  const gh = state.gridHeight;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(mapX, mapY, MAP_SIZE, MAP_SIZE);

  // Border
  ctx.strokeStyle = 'rgba(150,150,150,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mapX, mapY, MAP_SIZE, MAP_SIZE);

  // Scale: fit the grid into MAP_SIZE, keep aspect ratio
  const scaleX = MAP_SIZE / gw;
  const scaleY = MAP_SIZE / gh;
  const scale = Math.min(scaleX, scaleY);

  // Centered offset within the MAP_SIZE box
  const offsetX = mapX + (MAP_SIZE - gw * scale) / 2;
  const offsetY = mapY + (MAP_SIZE - gh * scale) / 2;

  // Draw tiles
  for (let row = 0; row < gh; row++) {
    for (let col = 0; col < gw; col++) {
      const tile = grid[row * gw + col];
      if (tile === TILE_WALL) continue; // skip walls — dark background shows through

      const explored = isTileExplored(state, col, row);
      if (!explored) continue;

      const visible = isTileVisible(state, col, row);

      const px = Math.floor(offsetX + col * scale);
      const py = Math.floor(offsetY + row * scale);
      const pw = Math.max(1, Math.ceil(scale));
      const ph = Math.max(1, Math.ceil(scale));

      if (visible) {
        ctx.fillStyle = '#8a7a58'; // floor visible
      } else {
        ctx.fillStyle = '#4a4232'; // floor explored-but-dim
      }
      ctx.fillRect(px, py, pw, ph);
    }
  }

  // Clip future drawing to minimap bounds so dots don't overflow
  ctx.save();
  ctx.beginPath();
  ctx.rect(mapX, mapY, MAP_SIZE, MAP_SIZE);
  ctx.clip();

  const DOT_R = Math.max(1.5, scale * 0.7);

  // Enemy dots (red)
  for (const enemy of state.enemies.values()) {
    if (!enemy.alive) continue;
    const col = enemy.x / 16; // TILE_SIZE = 16
    const row = enemy.y / 16;
    if (!isTileVisible(state, Math.floor(col), Math.floor(row))) continue;
    const ex = offsetX + col * scale;
    const ey = offsetY + row * scale;
    ctx.fillStyle = '#ff2222';
    ctx.beginPath();
    ctx.arc(ex, ey, DOT_R, 0, Math.PI * 2);
    ctx.fill();
  }

  // Boss dot (skull-orange, larger)
  if (state.boss && state.boss.alive) {
    const bcol = state.boss.x / 16;
    const brow = state.boss.y / 16;
    if (isTileVisible(state, Math.floor(bcol), Math.floor(brow))) {
      const bx = offsetX + bcol * scale;
      const by = offsetY + brow * scale;
      ctx.fillStyle = '#ff8800';
      ctx.beginPath();
      ctx.arc(bx, by, DOT_R * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  // Remote player dots
  for (const player of state.players.values()) {
    if (player.isLocal || !player.alive) continue;
    const persona = PERSONAS[player.personaSlug];
    const color = persona?.color ?? '#8888ff';
    const pcol = player.x / 16;
    const prow = player.y / 16;
    const px = offsetX + pcol * scale;
    const py = offsetY + prow * scale;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, DOT_R * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Local player dot (white, largest)
  const localPlayer = state.players.get(state.playerId);
  if (localPlayer) {
    const lcol = localPlayer.x / 16;
    const lrow = localPlayer.y / 16;
    const lx = offsetX + lcol * scale;
    const ly = offsetY + lrow * scale;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lx, ly, DOT_R * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  ctx.restore();
}
