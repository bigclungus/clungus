// Clungiverse Entity Renderer
// Procedural placeholder sprites for players, enemies, projectiles, bosses

import type { DungeonClientState, ClientEnemy, ClientPlayer, PersonaSlug } from '../state';
import { PERSONAS } from '../state';
import { getInterpolationAlpha } from '../entities/remote-player';
import { TILE_SIZE, isTileVisible } from './dungeon-renderer';
import { getMobSpriteDrawFn, getMobPngImage, getAvatar, preloadAvatars } from './sprites';

export { preloadAvatars };

// === Color / Shape Helpers ===

const PERSONA_COLORS: Record<PersonaSlug, string> = {
  holden: '#e63946',
  broseidon: '#457b9d',
  deckard_cain: '#e9c46a',
  galactus: '#7b2d8e',
  crundle: '#8b4513',
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function drawRoleOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  role: string,
): void {
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();

  switch (role) {
    case 'tank': {
      // Square
      const s = r * 0.6;
      ctx.rect(x - s, y - s, s * 2, s * 2);
      break;
    }
    case 'dps': {
      // Triangle pointing up
      const s = r * 0.7;
      ctx.moveTo(x, y - s);
      ctx.lineTo(x - s, y + s * 0.6);
      ctx.lineTo(x + s, y + s * 0.6);
      ctx.closePath();
      break;
    }
    case 'support': {
      // Cross
      const arm = r * 0.2;
      const len = r * 0.6;
      ctx.rect(x - arm, y - len, arm * 2, len * 2);
      ctx.rect(x - len, y - arm, len * 2, arm * 2);
      break;
    }
    case 'wildcard': {
      // Star (4-pointed)
      const outer = r * 0.7;
      const inner = r * 0.3;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 - Math.PI / 2;
        const rad = i % 2 === 0 ? outer : inner;
        const px = x + Math.cos(angle) * rad;
        const py = y + Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
  }

  ctx.fill();
}

function drawFacingIndicator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fx: number,
  fy: number,
): void {
  // Small triangle pointing in facing direction
  const dist = r + 4;
  const size = 3;
  const angle = Math.atan2(fy, fx);
  const tipX = x + Math.cos(angle) * dist;
  const tipY = y + Math.sin(angle) * dist;
  const leftX = tipX + Math.cos(angle + 2.5) * size;
  const leftY = tipY + Math.sin(angle + 2.5) * size;
  const rightX = tipX + Math.cos(angle - 2.5) * size;
  const rightY = tipY + Math.sin(angle - 2.5) * size;

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fill();
}

function drawHpBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  hp: number,
  maxHp: number,
): void {
  const barY = y - 4;
  const halfW = w / 2;

  // Background
  ctx.fillStyle = '#4a1111';
  ctx.fillRect(x - halfW, barY, w, 3);

  // Health fill
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const green = Math.round(ratio * 200);
  const red = Math.round((1 - ratio) * 200);
  ctx.fillStyle = `rgb(${String(red)},${String(green)},40)`;
  ctx.fillRect(x - halfW, barY, w * ratio, 3);
}

// === Render Functions ===

function renderGhostPlayer(ctx: CanvasRenderingContext2D, player: ClientPlayer, x: number, y: number): void {
  const r = 10;

  ctx.save();
  ctx.globalAlpha = 0.35;

  const color = PERSONA_COLORS[player.personaSlug];
  const avatar = getAvatar(player.personaSlug);
  if (avatar) {
    const spriteSize = 28;
    const half = spriteSize / 2;
    ctx.beginPath();
    ctx.arc(x, y, half, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, x - half, y - half, spriteSize, spriteSize);
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#aaaacc';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, r + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#aaaacc';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`👻 ${player.name}`, x, y - r - 8);
  ctx.restore();
}

function renderAlivePlayer(ctx: CanvasRenderingContext2D, player: ClientPlayer, x: number, y: number): void {
  const r = 10;
  const color = PERSONA_COLORS[player.personaSlug];
  const persona = PERSONAS[player.personaSlug];

  // I-frame flash: skip rendering every other frame
  if (player.iframeTicks > 0 && Math.floor(performance.now() / 80) % 2 === 0) {
    drawHpBar(ctx, x, y - r - 2, 20, player.hp, player.maxHp);
    return;
  }

  // Crundle scramble: pulsing glow ring
  if (player.scramblingUntil > Date.now()) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 80);
    ctx.strokeStyle = `rgba(125,143,105,${String(0.5 + pulse * 0.5)})`;
    ctx.lineWidth = 3 + pulse * 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  const avatar = getAvatar(player.personaSlug);
  if (avatar) {
    const spriteSize = 28;
    const half = spriteSize / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, half, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, x - half, y - half, spriteSize, spriteSize);
    ctx.restore();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, half, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    drawRoleOverlay(ctx, x, y, r, persona.role);
  }

  drawFacingIndicator(ctx, x, y, r, player.facingX, player.facingY);
  drawHpBar(ctx, x, y - r - 2, 20, player.hp, player.maxHp);

  ctx.fillStyle = '#ffffff';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(player.name, x, y - r - 8);
}

function interpolatedPosition(player: ClientPlayer, alpha: number): { x: number; y: number } {
  return {
    x: player.isLocal ? player.x : lerp(player.prevX, player.x, alpha),
    y: player.isLocal ? player.y : lerp(player.prevY, player.y, alpha),
  };
}

export function renderPlayers(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
): void {
  const alpha = getInterpolationAlpha(state);

  // First pass: render dead/spectating players as ghosts (behind alive players)
  for (const player of state.players.values()) {
    if (player.alive || !player.spectating) continue;
    const { x, y } = interpolatedPosition(player, alpha);
    renderGhostPlayer(ctx, player, x, y);
  }

  // Second pass: render alive players normally
  for (const player of state.players.values()) {
    if (!player.alive) continue;
    const { x, y } = interpolatedPosition(player, alpha);
    renderAlivePlayer(ctx, player, x, y);
  }
}

/** Check if a world-space position is in a currently visible tile. */
function isPositionVisible(state: DungeonClientState, wx: number, wy: number): boolean {
  const col = Math.floor(wx / TILE_SIZE);
  const row = Math.floor(wy / TILE_SIZE);
  if (col < 0 || col >= state.gridWidth || row < 0 || row >= state.gridHeight) return false;
  return isTileVisible(state, col, row);
}

export function renderEnemies(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
): void {
  const alpha = getInterpolationAlpha(state);

  for (const enemy of state.enemies.values()) {
    if (!enemy.alive) continue;
    // Hide enemies in fog
    const ex = lerp(enemy.prevX, enemy.x, alpha);
    const ey = lerp(enemy.prevY, enemy.y, alpha);
    if (!isPositionVisible(state, ex, ey)) continue;
    renderSingleEnemy(ctx, enemy, alpha, state);
  }

  if (state.boss?.alive) {
    const bx = lerp(state.boss.prevX, state.boss.x, alpha);
    const by = lerp(state.boss.prevY, state.boss.y, alpha);
    if (isPositionVisible(state, bx, by)) {
      renderBoss(ctx, state.boss, alpha);
    }
  }
}

function drawEnemyFallbackShape(ctx: CanvasRenderingContext2D, enemy: ClientEnemy, x: number, y: number): void {
  ctx.fillStyle = '#cc3333';
  switch (enemy.behavior) {
    case 'melee_chase':
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ranged_pattern': {
      const s = 10;
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s, y);
      ctx.closePath();
      ctx.fill();
      if (enemy.aimDirX !== 0 || enemy.aimDirY !== 0) {
        ctx.strokeStyle = 'rgba(255,100,100,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + enemy.aimDirX * 40, y + enemy.aimDirY * 40);
        ctx.stroke();
      }
      break;
    }
    case 'slow_charge': {
      const s = 14;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      break;
    }
  }
}

function drawEnemySprite(
  ctx: CanvasRenderingContext2D,
  enemy: ClientEnemy,
  x: number,
  y: number,
  state?: DungeonClientState,
): void {
  const drawFn = getMobSpriteDrawFn(enemy.type);
  if (drawFn) {
    drawFn(ctx, x, y);
    return;
  }

  const pngImg = getMobPngImage(enemy.type);
  if (pngImg) {
    ctx.drawImage(pngImg, x - 16, y - 16, 32, 32);
    return;
  }

  const mobImg = state?.mobSprites.get(enemy.type);
  if (mobImg && mobImg.complete && mobImg.naturalWidth > 0) {
    ctx.drawImage(mobImg, x - 16, y - 16, 32, 32);
    return;
  }

  drawEnemyFallbackShape(ctx, enemy, x, y);
}

function renderSingleEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: ClientEnemy,
  alpha: number,
  state?: DungeonClientState,
): void {
  const x = lerp(enemy.prevX, enemy.x, alpha);
  const y = lerp(enemy.prevY, enemy.y, alpha);

  if (enemy.telegraphing) {
    ctx.fillStyle = 'rgba(255,50,50,0.3)';
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  drawEnemySprite(ctx, enemy, x, y, state);
  drawHpBar(ctx, x, y - 12, 16, enemy.hp, enemy.maxHp);
}

function renderBoss(
  ctx: CanvasRenderingContext2D,
  boss: ClientEnemy,
  alpha: number,
): void {
  const x = lerp(boss.prevX, boss.x, alpha);
  const y = lerp(boss.prevY, boss.y, alpha);

  // Pulsing glow
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
  const glowR = 24 + pulse * 8;
  ctx.fillStyle = `rgba(200,50,50,${String(0.15 + pulse * 0.1)})`;
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, Math.PI * 2);
  ctx.fill();

  // Body (large circle)
  ctx.fillStyle = '#aa2222';
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.fill();

  // Inner marking
  ctx.fillStyle = '#ff4444';
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();

  // HP bar (wider)
  drawHpBar(ctx, x, y - 26, 40, boss.hp, boss.maxHp);

  // Phase indicator
  ctx.fillStyle = '#ffffff';
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`P${boss.isBoss ? '1' : '?'}`, x, y + 30);
}

/** Resolve the color for a player projectile based on the owner's persona. */
function getPlayerProjectileColor(state: DungeonClientState, ownerId: string): string {
  const player = state.players.get(ownerId);
  if (player) {
    return PERSONA_COLORS[player.personaSlug];
  }
  return '#ffffff';
}

export function renderProjectiles(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
): void {
  const alpha = getInterpolationAlpha(state);

  for (const proj of state.projectiles.values()) {
    const x = lerp(proj.prevX, proj.x, alpha);
    const y = lerp(proj.prevY, proj.y, alpha);

    // Hide projectiles in fog
    if (!isPositionVisible(state, x, y)) continue;

    if (proj.fromEnemy) {
      // Enemy projectiles: red circles
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(x, y, proj.radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Player projectiles: persona-colored with trail
      const color = getPlayerProjectileColor(state, proj.ownerId);

      // Draw trail (3 faded circles behind the projectile)
      const dx = x - proj.prevX;
      const dy = y - proj.prevY;
      for (let i = 3; i >= 1; i--) {
        const trailAlpha = 0.15 * (4 - i);
        const trailX = x - dx * (i * 0.3);
        const trailY = y - dy * (i * 0.3);
        const trailRadius = proj.radius * (1 - i * 0.15);
        ctx.fillStyle = color;
        ctx.globalAlpha = trailAlpha;
        ctx.beginPath();
        ctx.arc(trailX, trailY, trailRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw main projectile (bright, with glow)
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, proj.radius, 0, Math.PI * 2);
      ctx.fill();

      // Bright white core
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(x, y, proj.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function renderAoeZones(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
): void {
  for (const zone of state.aoeZones.values()) {
    // Hide AoE zones in fog
    if (!isPositionVisible(state, zone.x, zone.y)) continue;

    ctx.fillStyle = 'rgba(100,200,255,0.15)';
    ctx.strokeStyle = 'rgba(100,200,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
