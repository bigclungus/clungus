// Clungiverse v2 — Entity Renderer (PixiJS)
// Full entity rendering: players (avatars, roles, ghosts, i-frames, scramble),
// enemies (sprite tiers, telegraph, boss), projectiles (trails), AoE zones.

import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { DungeonClientState, ClientEnemy, ClientPlayer, PersonaSlug } from '../state';
import { PERSONAS, TILE_SIZE } from '../state';
import { getInterpolationAlpha } from '../entities/remote-player';
import { isTileVisible } from './tile-renderer';
import { preloadAvatars, getAvatarTexture, getMobTexture, syncMobSprites } from './sprites';

export { preloadAvatars };

// === Color Helpers ===

const PERSONA_COLORS_HEX: Record<PersonaSlug, number> = {
  holden: 0xe63946,
  broseidon: 0x457b9d,
  deckard_cain: 0xe9c46a,
  galactus: 0x7b2d8e,
  crundle: 0x8b4513,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hpBarColor(ratio: number): number {
  const green = Math.round(ratio * 200);
  const red = Math.round((1 - ratio) * 200);
  return (red << 16) | (green << 8) | 40;
}

function isPositionVisible(state: DungeonClientState, wx: number, wy: number): boolean {
  const col = Math.floor(wx / TILE_SIZE);
  const row = Math.floor(wy / TILE_SIZE);
  if (col < 0 || col >= state.gridWidth || row < 0 || row >= state.gridHeight) return false;
  return isTileVisible(state, col, row);
}

// === Text cache for player names (avoid creating new Text every frame) ===

const nameTextCache = new Map<string, Text>();

function getNameText(key: string, label: string, color: number): Text {
  let t = nameTextCache.get(key);
  if (t) {
    if (t.text !== label) t.text = label;
    return t;
  }
  t = new Text({
    text: label,
    style: { fontFamily: 'monospace', fontSize: 8, fill: color },
  });
  t.anchor.set(0.5, 1);
  nameTextCache.set(key, t);
  return t;
}

export class EntityRenderer {
  container: Container;
  private gfx: Graphics;
  private spriteContainer: Container; // for Sprite-based entities (avatars, mob sprites)
  private textContainer: Container;   // for name labels

  // Track which sprite/text display objects are active this frame
  private activeSprites = new Set<string>();

  // Sprite pools for avatar rendering
  private avatarSprites = new Map<string, Sprite>();
  private mobSpriteMap = new Map<string, Sprite>();

  constructor() {
    this.container = new Container();
    this.gfx = new Graphics();
    this.spriteContainer = new Container();
    this.textContainer = new Container();
    this.container.addChild(this.gfx);
    this.container.addChild(this.spriteContainer);
    this.container.addChild(this.textContainer);
  }

  render(state: DungeonClientState): void {
    this.gfx.clear();
    this.activeSprites.clear();

    // Sync any newly generated mob sprites into texture cache
    syncMobSprites(state.mobSprites);

    const alpha = getInterpolationAlpha(state);

    // Render AoE zones (below everything)
    this.renderAoeZones(state);

    // Enhancement 8: Drop shadows for enemies (drawn before enemy bodies)
    for (const enemy of state.enemies.values()) {
      if (!enemy.alive) continue;
      const ex = lerp(enemy.prevX, enemy.x, alpha);
      const ey = lerp(enemy.prevY, enemy.y, alpha);
      if (!isPositionVisible(state, ex, ey)) continue;
      const shadowRX = enemy.isBoss ? 16 : 8;
      const shadowRY = enemy.isBoss ? 6 : 3;
      const shadowOff = enemy.isBoss ? 10 : 6;
      this.gfx.ellipse(ex, ey + shadowOff, shadowRX, shadowRY);
      this.gfx.fill({ color: 0x000000, alpha: 0.25 });
    }

    // Render enemies
    this.renderEnemies(state, alpha);

    // Enhancement 8: Drop shadows for players (drawn before player bodies)
    for (const player of state.players.values()) {
      if (!player.alive && !player.spectating) continue;
      const ix = player.isLocal ? player.x : lerp(player.prevX, player.x, alpha);
      const iy = player.isLocal ? player.y : lerp(player.prevY, player.y, alpha);
      this.gfx.ellipse(ix, iy + 6, 8, 3);
      this.gfx.fill({ color: 0x000000, alpha: player.alive ? 0.25 : 0.12 });
    }

    // Render ghost players first (behind alive)
    for (const player of state.players.values()) {
      if (player.alive || !player.spectating) continue;
      const ix = player.isLocal ? player.x : lerp(player.prevX, player.x, alpha);
      const iy = player.isLocal ? player.y : lerp(player.prevY, player.y, alpha);
      this.renderGhostPlayer(player, ix, iy);
    }

    // Render alive players
    for (const player of state.players.values()) {
      if (!player.alive) continue;
      const ix = player.isLocal ? player.x : lerp(player.prevX, player.x, alpha);
      const iy = player.isLocal ? player.y : lerp(player.prevY, player.y, alpha);
      this.renderAlivePlayer(player, ix, iy, state);
    }

    // Render projectiles
    this.renderProjectiles(state, alpha);

    // Clean up sprites/text for entities that no longer exist
    this.pruneStaleDisplayObjects();
  }

  // === AoE Zones ===

  private renderAoeZones(state: DungeonClientState): void {
    for (const zone of state.aoeZones.values()) {
      if (!isPositionVisible(state, zone.x, zone.y)) continue;
      this.gfx.circle(zone.x, zone.y, zone.radius);
      this.gfx.fill({ color: 0x64c8ff, alpha: 0.15 });
      this.gfx.circle(zone.x, zone.y, zone.radius);
      this.gfx.stroke({ color: 0x64c8ff, alpha: 0.5, width: 1 });
    }
  }

  // === Players ===

  private renderGhostPlayer(player: ClientPlayer, x: number, y: number): void {
    const r = 10;
    const key = `ghost-${player.id}`;
    this.activeSprites.add(key);

    const avatarTex = getAvatarTexture(player.personaSlug);
    if (avatarTex) {
      this.renderAvatarSprite(key, avatarTex, x, y, 28, 0.35);
    } else {
      const color = PERSONA_COLORS_HEX[player.personaSlug] ?? 0xcccccc;
      this.gfx.circle(x, y, r);
      this.gfx.fill({ color, alpha: 0.35 });
    }

    // Dashed ghost ring (draw as dotted segments)
    this.gfx.circle(x, y, r + 4);
    this.gfx.stroke({ color: 0xaaaacc, alpha: 0.5, width: 1.5 });

    // Ghost name
    const nameKey = `name-${player.id}`;
    this.activeSprites.add(nameKey);
    const nameText = getNameText(nameKey, `\u{1F47B} ${player.name}`, 0xaaaacc);
    nameText.position.set(x, y - r - 8);
    nameText.alpha = 0.5;
    if (!nameText.parent) this.textContainer.addChild(nameText);
  }

  private renderAlivePlayer(player: ClientPlayer, x: number, y: number, _state: DungeonClientState): void {
    const r = 10;
    const color = PERSONA_COLORS_HEX[player.personaSlug] ?? 0xcccccc;
    const persona = PERSONAS[player.personaSlug];

    // I-frame flash: skip rendering every other frame
    if (player.iframeTicks > 0 && Math.floor(performance.now() / 80) % 2 === 0) {
      // Still draw HP bar and name even during flash
      this.drawHpBar(x, y - r - 2, 20, player.hp, player.maxHp);
      return;
    }

    // Scramble glow ring
    if (player.scramblingUntil > Date.now()) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 80);
      this.gfx.circle(x, y, r + 4);
      this.gfx.stroke({ color: 0x7d8f69, alpha: 0.5 + pulse * 0.5, width: 3 + pulse * 2 });
    }

    // Avatar or fallback circle
    const avatarKey = `avatar-${player.id}`;
    this.activeSprites.add(avatarKey);
    const avatarTex = getAvatarTexture(player.personaSlug);
    if (avatarTex) {
      this.renderAvatarSprite(avatarKey, avatarTex, x, y, 28, 1.0);
      // Colored border ring
      this.gfx.circle(x, y, 14);
      this.gfx.stroke({ color, width: 2 });
    } else {
      // Fallback colored circle with role overlay
      this.gfx.circle(x, y, r);
      this.gfx.fill(color);
      this.drawRoleOverlay(x, y, r, persona.role);
    }

    // Facing indicator
    this.drawFacingIndicator(x, y, r, player.facingX, player.facingY);

    // HP bar
    this.drawHpBar(x, y - r - 2, 20, player.hp, player.maxHp);

    // Name label
    const nameKey = `name-${player.id}`;
    this.activeSprites.add(nameKey);
    const nameText = getNameText(nameKey, player.name, 0xffffff);
    nameText.position.set(x, y - r - 8);
    nameText.alpha = 1;
    if (!nameText.parent) this.textContainer.addChild(nameText);
  }

  private renderAvatarSprite(key: string, texture: Texture, x: number, y: number, size: number, alpha: number): void {
    let sprite = this.avatarSprites.get(key);
    if (!sprite) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.width = size;
      sprite.height = size;
      // Apply circular mask via a Graphics mask
      const maskGfx = new Graphics();
      maskGfx.circle(0, 0, size / 2);
      maskGfx.fill(0xffffff);
      sprite.addChild(maskGfx);
      sprite.mask = maskGfx;
      this.spriteContainer.addChild(sprite);
      this.avatarSprites.set(key, sprite);
    }
    sprite.texture = texture;
    sprite.position.set(x, y);
    sprite.alpha = alpha;
    sprite.visible = true;
  }

  // === Enemies ===

  private renderEnemies(state: DungeonClientState, alpha: number): void {
    for (const enemy of state.enemies.values()) {
      if (!enemy.alive) continue;
      const ex = lerp(enemy.prevX, enemy.x, alpha);
      const ey = lerp(enemy.prevY, enemy.y, alpha);
      if (!isPositionVisible(state, ex, ey)) continue;

      if (enemy.isBoss) {
        this.renderBoss(enemy, ex, ey);
      } else {
        this.renderSingleEnemy(enemy, ex, ey, state);
      }
    }

    // Also render boss from state.boss if present and distinct
    if (state.boss?.alive) {
      const bx = lerp(state.boss.prevX, state.boss.x, alpha);
      const by = lerp(state.boss.prevY, state.boss.y, alpha);
      if (isPositionVisible(state, bx, by)) {
        // Check if already rendered via enemies map
        if (!state.enemies.has(state.boss.id)) {
          this.renderBoss(state.boss, bx, by);
        }
      }
    }
  }

  private renderSingleEnemy(enemy: ClientEnemy, x: number, y: number, state: DungeonClientState): void {
    // Telegraph warning circle
    if (enemy.telegraphing) {
      this.gfx.circle(x, y, 20);
      this.gfx.fill({ color: 0xff3232, alpha: 0.3 });
    }

    // Try sprite texture first
    const spriteKey = `mob-${enemy.id}`;
    this.activeSprites.add(spriteKey);
    const tex = getMobTexture(enemy.type, state.mobSprites);

    if (tex) {
      let sprite = this.mobSpriteMap.get(spriteKey);
      if (!sprite) {
        sprite = new Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.width = 32;
        sprite.height = 32;
        this.spriteContainer.addChild(sprite);
        this.mobSpriteMap.set(spriteKey, sprite);
      }
      sprite.texture = tex;
      sprite.position.set(x, y);
      sprite.visible = true;
    } else {
      // Fallback shape by behavior
      this.drawEnemyFallbackShape(enemy, x, y);
    }

    // HP bar
    this.drawHpBar(x, y - 12, 16, enemy.hp, enemy.maxHp);
  }

  private renderBoss(boss: ClientEnemy, x: number, y: number): void {
    // Pulsing glow
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
    const glowR = 24 + pulse * 8;
    this.gfx.circle(x, y, glowR);
    this.gfx.fill({ color: 0xc83232, alpha: 0.15 + pulse * 0.1 });

    // Body (large circle)
    this.gfx.circle(x, y, 20);
    this.gfx.fill(0xaa2222);

    // Inner marking
    this.gfx.circle(x, y, 8);
    this.gfx.fill(0xff4444);

    // HP bar (wider)
    this.drawHpBar(x, y - 26, 40, boss.hp, boss.maxHp);

    // Phase indicator
    const phaseKey = `boss-phase-${boss.id}`;
    this.activeSprites.add(phaseKey);
    const phaseText = getNameText(phaseKey, `P${boss.isBoss ? '1' : '?'}`, 0xffffff);
    phaseText.position.set(x, y + 30);
    phaseText.anchor.set(0.5, 0);
    if (!phaseText.parent) this.textContainer.addChild(phaseText);
  }

  private drawEnemyFallbackShape(enemy: ClientEnemy, x: number, y: number): void {
    switch (enemy.behavior) {
      case 'melee_chase':
        this.gfx.circle(x, y, 8);
        this.gfx.fill(0xcc3333);
        break;
      case 'ranged_pattern': {
        const s = 10;
        this.gfx.moveTo(x, y - s);
        this.gfx.lineTo(x + s, y);
        this.gfx.lineTo(x, y + s);
        this.gfx.lineTo(x - s, y);
        this.gfx.closePath();
        this.gfx.fill(0xcc3333);
        // Aim direction line
        if (enemy.aimDirX !== 0 || enemy.aimDirY !== 0) {
          this.gfx.moveTo(x, y);
          this.gfx.lineTo(x + enemy.aimDirX * 40, y + enemy.aimDirY * 40);
          this.gfx.stroke({ color: 0xff6464, alpha: 0.4, width: 1 });
        }
        break;
      }
      case 'slow_charge': {
        const s = 14;
        this.gfx.rect(x - s / 2, y - s / 2, s, s);
        this.gfx.fill(0xcc3333);
        break;
      }
    }
  }

  // === Projectiles ===

  private renderProjectiles(state: DungeonClientState, alpha: number): void {
    for (const proj of state.projectiles.values()) {
      const ix = lerp(proj.prevX, proj.x, alpha);
      const iy = lerp(proj.prevY, proj.y, alpha);

      if (!isPositionVisible(state, ix, iy)) continue;

      if (proj.fromEnemy) {
        // Enemy projectiles: red circles
        this.gfx.circle(ix, iy, proj.radius);
        this.gfx.fill(0xff4444);
      } else {
        // Player projectiles: persona-colored with trail
        const playerColor = this.getPlayerProjectileColor(state, proj.ownerId);
        const dx = ix - proj.prevX;
        const dy = iy - proj.prevY;

        // 3-circle trail
        for (let i = 3; i >= 1; i--) {
          const trailAlpha = 0.15 * (4 - i);
          const trailX = ix - dx * (i * 0.3);
          const trailY = iy - dy * (i * 0.3);
          const trailRadius = proj.radius * (1 - i * 0.15);
          this.gfx.circle(trailX, trailY, trailRadius);
          this.gfx.fill({ color: playerColor, alpha: trailAlpha });
        }

        // Main projectile
        this.gfx.circle(ix, iy, proj.radius);
        this.gfx.fill(playerColor);

        // White core
        this.gfx.circle(ix, iy, proj.radius * 0.5);
        this.gfx.fill({ color: 0xffffff, alpha: 0.7 });
      }
    }
  }

  private getPlayerProjectileColor(state: DungeonClientState, ownerId: string): number {
    const player = state.players.get(ownerId);
    if (player) return PERSONA_COLORS_HEX[player.personaSlug] ?? 0xffffff;
    return 0xffffff;
  }

  // === Drawing Helpers ===

  private drawHpBar(x: number, y: number, w: number, hp: number, maxHp: number): void {
    const barY = y - 4;
    const halfW = w / 2;

    // Background
    this.gfx.rect(x - halfW, barY, w, 3);
    this.gfx.fill(0x4a1111);

    // Health fill
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    this.gfx.rect(x - halfW, barY, w * ratio, 3);
    this.gfx.fill(hpBarColor(ratio));
  }

  private drawRoleOverlay(x: number, y: number, r: number, role: string): void {
    const overlayColor = { color: 0xffffff, alpha: 0.7 };

    switch (role) {
      case 'tank': {
        const s = r * 0.6;
        this.gfx.rect(x - s, y - s, s * 2, s * 2);
        this.gfx.fill(overlayColor);
        break;
      }
      case 'dps': {
        const s = r * 0.7;
        this.gfx.moveTo(x, y - s);
        this.gfx.lineTo(x - s, y + s * 0.6);
        this.gfx.lineTo(x + s, y + s * 0.6);
        this.gfx.closePath();
        this.gfx.fill(overlayColor);
        break;
      }
      case 'support': {
        const arm = r * 0.2;
        const len = r * 0.6;
        this.gfx.rect(x - arm, y - len, arm * 2, len * 2);
        this.gfx.fill(overlayColor);
        this.gfx.rect(x - len, y - arm, len * 2, arm * 2);
        this.gfx.fill(overlayColor);
        break;
      }
      case 'wildcard': {
        const outer = r * 0.7;
        const inner = r * 0.3;
        this.gfx.moveTo(x, y - outer);
        for (let i = 1; i < 8; i++) {
          const angle = (i * Math.PI) / 4 - Math.PI / 2;
          const rad = i % 2 === 0 ? outer : inner;
          this.gfx.lineTo(x + Math.cos(angle) * rad, y + Math.sin(angle) * rad);
        }
        this.gfx.closePath();
        this.gfx.fill(overlayColor);
        break;
      }
    }
  }

  private drawFacingIndicator(x: number, y: number, r: number, fx: number, fy: number): void {
    const dist = r + 4;
    const size = 3;
    const angle = Math.atan2(fy, fx);
    const tipX = x + Math.cos(angle) * dist;
    const tipY = y + Math.sin(angle) * dist;
    const leftX = tipX + Math.cos(angle + 2.5) * size;
    const leftY = tipY + Math.sin(angle + 2.5) * size;
    const rightX = tipX + Math.cos(angle - 2.5) * size;
    const rightY = tipY + Math.sin(angle - 2.5) * size;

    this.gfx.moveTo(tipX, tipY);
    this.gfx.lineTo(leftX, leftY);
    this.gfx.lineTo(rightX, rightY);
    this.gfx.closePath();
    this.gfx.fill({ color: 0xffffff, alpha: 0.6 });
  }

  // === Cleanup ===

  private pruneStaleDisplayObjects(): void {
    // Hide avatar sprites that aren't active this frame
    for (const [key, sprite] of this.avatarSprites) {
      if (!this.activeSprites.has(key)) {
        sprite.visible = false;
      }
    }

    // Hide mob sprites that aren't active this frame
    for (const [key, sprite] of this.mobSpriteMap) {
      if (!this.activeSprites.has(key)) {
        sprite.visible = false;
      }
    }

    // Hide name texts that aren't active this frame
    for (const [key, text] of nameTextCache) {
      if (!this.activeSprites.has(key)) {
        text.visible = false;
      } else {
        text.visible = true;
      }
    }
  }

  clear(): void {
    this.gfx.clear();
    // Hide all sprites
    for (const sprite of this.avatarSprites.values()) sprite.visible = false;
    for (const sprite of this.mobSpriteMap.values()) sprite.visible = false;
    for (const text of nameTextCache.values()) text.visible = false;
  }
}
