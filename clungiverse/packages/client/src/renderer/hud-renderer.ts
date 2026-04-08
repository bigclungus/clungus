// Clungiverse v2 — HUD Renderer (PixiJS)
// Full port of v1 HUD: HP bar, party roster, floor indicator, timer,
// kill counter, minimap, power cooldown, temp powerups, spectator overlay.

import { Container, Graphics, Text } from 'pixi.js';
import type { DungeonClientState } from '../state';
import { PERSONAS, TEMP_POWERUP_META, TEMP_POWERUP_MAX_DURATIONS, TILE_WALL, TILE_SIZE } from '../state';
import { isTileExplored, isTileVisible } from './tile-renderer';
import { SPRINT_COOLDOWN_MS } from '../entities/local-player';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

const MONO_STYLE = { fontFamily: 'monospace', fontSize: 12, fill: 0xcccccc };

export class HudRenderer {
  container: Container;
  private gfx: Graphics;

  // Persistent text elements (updated in-place each frame)
  private floorText: Text;
  private timerText: Text;
  private killText: Text;
  private mobText: Text;
  private hpText: Text;
  private spectateText: Text;
  private spectateHint: Text;
  private disconnectText: Text;
  private cdLabel: Text;
  private sprintLabel: Text;
  private spinLabel: Text;

  // Party roster text elements keyed by player ID
  private rosterTexts = new Map<string, { dot: boolean; nameText: Text }>();

  // Temp powerup text elements
  private powerupTexts: Text[] = [];

  constructor() {
    this.container = new Container();
    this.gfx = new Graphics();
    this.container.addChild(this.gfx);

    // Floor indicator (top center)
    this.floorText = new Text({ text: '', style: { ...MONO_STYLE, fontSize: 12 } });
    this.floorText.anchor.set(0.5, 0);
    this.container.addChild(this.floorText);

    // Timer (top right)
    this.timerText = new Text({ text: '', style: { ...MONO_STYLE, fontSize: 12 } });
    this.timerText.anchor.set(1, 0);
    this.container.addChild(this.timerText);

    // Kill counter (bottom left)
    this.killText = new Text({ text: '', style: { ...MONO_STYLE, fontSize: 11 } });
    this.container.addChild(this.killText);

    // Mob counter (bottom left, below kills)
    this.mobText = new Text({ text: '', style: { ...MONO_STYLE, fontSize: 11, fill: 0xdd8844 } });
    this.container.addChild(this.mobText);

    // HP text overlay on bar
    this.hpText = new Text({ text: '', style: { ...MONO_STYLE, fontSize: 10 } });
    this.hpText.anchor.set(0.5, 1);
    this.container.addChild(this.hpText);

    // Spectator label
    this.spectateText = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', fill: 0x9696ff },
    });
    this.spectateText.anchor.set(0.5, 0);
    this.spectateText.visible = false;
    this.container.addChild(this.spectateText);

    // Spectator hint
    this.spectateHint = new Text({
      text: '[TAB] to switch',
      style: { fontFamily: 'monospace', fontSize: 10, fill: 0x7878c8 },
    });
    this.spectateHint.anchor.set(0.5, 0);
    this.spectateHint.visible = false;
    this.container.addChild(this.spectateHint);

    // Disconnect overlay
    this.disconnectText = new Text({
      text: 'DISCONNECTED\nAttempting to reconnect...',
      style: { fontFamily: 'monospace', fontSize: 18, fill: 0xff4444, align: 'center' },
    });
    this.disconnectText.anchor.set(0.5, 0.5);
    this.disconnectText.visible = false;
    this.container.addChild(this.disconnectText);

    // Cooldown label
    this.cdLabel = new Text({ text: 'SPC', style: { ...MONO_STYLE, fontSize: 8 } });
    this.cdLabel.anchor.set(0.5, 0.5);
    this.container.addChild(this.cdLabel);

    // Sprint label
    this.sprintLabel = new Text({ text: 'RUN', style: { ...MONO_STYLE, fontSize: 8 } });
    this.sprintLabel.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprintLabel);

    // Spin label
    this.spinLabel = new Text({ text: '[E]', style: { ...MONO_STYLE, fontSize: 8 } });
    this.spinLabel.anchor.set(0.5, 0.5);
    this.container.addChild(this.spinLabel);
  }

  render(state: DungeonClientState, screenW: number, screenH: number): void {
    this.gfx.clear();

    // === HP Bar (bottom center, 200px wide) ===
    const barW = 200;
    const barH = 16;
    const barX = (screenW - barW) / 2;
    const barY = screenH - 40;

    // Background
    this.gfx.rect(barX, barY, barW, barH);
    this.gfx.fill(0x331111);

    // Health fill
    const hpRatio = state.localMaxHp > 0 ? Math.max(0, state.localHp / state.localMaxHp) : 0;
    const green = Math.round(hpRatio * 180);
    const red = Math.round((1 - hpRatio) * 220);
    const hpColor = (red << 16) | (green << 8) | 40;
    this.gfx.rect(barX, barY, barW * hpRatio, barH);
    this.gfx.fill(hpColor || 0x00b428);

    // Border
    this.gfx.rect(barX, barY, barW, barH);
    this.gfx.stroke({ color: 0x666666, width: 1 });

    // HP text
    this.hpText.text = `${String(Math.ceil(state.localHp))} / ${String(state.localMaxHp)}`;
    this.hpText.position.set(screenW / 2, barY + barH - 3);

    // === Floor Indicator (top center) ===
    this.floorText.text = `Floor ${String(state.floor)}/${String(state.totalFloors)}`;
    this.floorText.position.set(screenW / 2, 8);

    // === Timer (top right) ===
    this.timerText.text = formatTime(state.elapsedMs);
    this.timerText.position.set(screenW - 10, 8);

    // === Kill Counter + Mob Count (bottom left) ===
    this.killText.text = `Kills: ${String(state.kills)}`;
    this.killText.position.set(10, screenH - 26);
    this.mobText.text = `Mobs: ${String(state.remainingMobs)}/${String(state.totalMobs)}`;
    this.mobText.position.set(10, screenH - 12);

    // === Party Roster (top left) ===
    this.renderPartyRoster(state);

    // === Temp Powerups (above HP bar) ===
    this.renderActiveTempPowerups(state, screenW, screenH);

    // === Power Cooldown (bottom right) ===
    this.renderPowerCooldown(state, screenW, screenH);

    // === Sprint Cooldown (bottom right, left of power) ===
    this.renderSprintCooldown(state, screenW, screenH);

    // === Spin Attack Cooldown (bottom right, left of sprint) ===
    this.renderSpinCooldown(state, screenW, screenH);

    // === Minimap (top right) ===
    this.renderMinimap(state, screenW);

    // === Spectator Overlay ===
    if (state.isSpectating) {
      this.renderSpectatorOverlay(state, screenW, screenH);
    } else {
      this.spectateText.visible = false;
      this.spectateHint.visible = false;
    }

    // === Disconnected Overlay ===
    if (!state.connected) {
      this.gfx.rect(0, 0, screenW, screenH);
      this.gfx.fill({ color: 0x000000, alpha: 0.7 });
      this.disconnectText.position.set(screenW / 2, screenH / 2);
      this.disconnectText.visible = true;
    } else {
      this.disconnectText.visible = false;
    }
  }

  // === Party Roster ===

  private renderPartyRoster(state: DungeonClientState): void {
    let rosterY = 12;
    const rosterX = 8;
    const activeIds = new Set<string>();

    for (const player of state.players.values()) {
      activeIds.add(player.id);
      const persona = PERSONAS[player.personaSlug];
      const color = persona?.color ?? '#cccccc';
      const colorHex = parseInt(color.slice(1), 16);
      const name = player.name || player.personaSlug;
      const isSpectating = player.spectating && !player.alive;

      // Dot
      const dotColor = isSpectating ? 0x444466 : colorHex;
      this.gfx.circle(rosterX + 6, rosterY + 4, 4);
      this.gfx.fill(dotColor);

      // Name text
      const displayName = isSpectating ? `\u{1F47B} ${name}` : name;
      let entry = this.rosterTexts.get(player.id);
      if (!entry) {
        const nameText = new Text({
          text: displayName,
          style: { fontFamily: 'monospace', fontSize: 9, fill: 0xcccccc },
        });
        this.container.addChild(nameText);
        entry = { dot: true, nameText };
        this.rosterTexts.set(player.id, entry);
      }
      entry.nameText.text = displayName;
      entry.nameText.style.fill = isSpectating ? 0x555577 : (player.alive ? 0xcccccc : 0x666666);
      entry.nameText.position.set(rosterX + 14, rosterY);
      entry.nameText.visible = true;

      // Mini HP bar
      const miniX = rosterX + 14;
      const miniY = rosterY + 11;
      const miniW = 50;
      const miniH = 3;
      this.gfx.rect(miniX, miniY, miniW, miniH);
      this.gfx.fill(0x331111);
      if (player.maxHp > 0) {
        const ratio = Math.max(0, player.hp / player.maxHp);
        const barColor = isSpectating ? 0x333355 : (player.alive ? 0x44aa44 : 0x444444);
        this.gfx.rect(miniX, miniY, miniW * ratio, miniH);
        this.gfx.fill(barColor);
      }

      rosterY += 20;
    }

    // Hide roster entries for players who left
    for (const [id, entry] of this.rosterTexts) {
      if (!activeIds.has(id)) {
        entry.nameText.visible = false;
      }
    }
  }

  // === Spectator Overlay ===

  private renderSpectatorOverlay(state: DungeonClientState, screenW: number, screenH: number): void {
    // Dark vignette — approximate with a semi-transparent border rectangle
    // (PixiJS Graphics doesn't do radial gradients natively, so use a simple overlay)
    this.gfx.rect(0, 0, screenW, screenH);
    this.gfx.fill({ color: 0x000032, alpha: 0.25 });

    // Spectating label
    const targetPlayer = state.spectatorTargetId ? state.players.get(state.spectatorTargetId) : null;
    const targetName = targetPlayer ? (targetPlayer.name || targetPlayer.personaSlug) : '---';
    this.spectateText.text = `SPECTATING: ${targetName}`;
    this.spectateText.position.set(screenW / 2, 38);
    this.spectateText.visible = true;

    // Tab hint if multiple alive players
    const aliveCount = Array.from(state.players.values()).filter(
      (p) => !p.isLocal && p.alive && !p.spectating,
    ).length;
    if (aliveCount > 1) {
      this.spectateHint.position.set(screenW / 2, 54);
      this.spectateHint.visible = true;
    } else {
      this.spectateHint.visible = false;
    }
  }

  // === Active Temp Powerups ===

  private renderActiveTempPowerups(state: DungeonClientState, screenW: number, screenH: number): void {
    const now = Date.now();
    const active = state.localTempPowerups.filter((a) => a.expiresAt > now);

    // Hide all existing powerup texts first
    for (const t of this.powerupTexts) t.visible = false;

    if (active.length === 0) return;

    const slotW = 80;
    const slotH = 20;
    const gap = 4;
    const totalW = active.length * (slotW + gap) - gap;
    let x = (screenW - totalW) / 2;
    const y = screenH - 65;

    for (let idx = 0; idx < active.length; idx++) {
      const tp = active[idx];
      const meta = TEMP_POWERUP_META[tp.templateId] ?? { name: tp.templateId, emoji: '\u2728', color: '#ffffff' };
      const remainMs = tp.expiresAt - now;
      const remainSec = Math.ceil(remainMs / 1000);
      const colorHex = parseInt(meta.color.slice(1), 16);

      // Background
      this.gfx.rect(x, y, slotW, slotH);
      this.gfx.fill({ color: 0x000000, alpha: 0.7 });

      // Progress bar at bottom
      const maxMs = TEMP_POWERUP_MAX_DURATIONS[tp.templateId] ?? 20000;
      const ratio = Math.min(1, remainMs / maxMs);
      this.gfx.rect(x, y + slotH - 3, slotW * ratio, 3);
      this.gfx.fill({ color: colorHex, alpha: 0.53 });

      // Border
      this.gfx.rect(x, y, slotW, slotH);
      this.gfx.stroke({ color: colorHex, width: 1 });

      // Text label
      if (idx >= this.powerupTexts.length) {
        const t = new Text({
          text: '',
          style: { fontFamily: 'monospace', fontSize: 9, fill: 0xffffff },
        });
        this.container.addChild(t);
        this.powerupTexts.push(t);
      }
      const textObj = this.powerupTexts[idx];
      textObj.text = `${meta.emoji} ${meta.name} ${String(remainSec)}s`;
      textObj.position.set(x + 3, y + 3);
      textObj.visible = true;

      x += slotW + gap;
    }
  }

  // === Power Cooldown (circular sweep, bottom right) ===

  private renderPowerCooldown(state: DungeonClientState, screenW: number, screenH: number): void {
    const cx = screenW - 36;
    const cy = screenH - 36;
    const r = 20;

    // Outer ring
    this.gfx.circle(cx, cy, r);
    this.gfx.stroke({ color: 0x555555, width: 3 });

    // Cooldown fill (sweeps clockwise from top)
    if (state.localCooldownMax > 0 && state.localCooldown > 0) {
      const ratio = state.localCooldown / state.localCooldownMax;
      const endAngle = -Math.PI / 2 + Math.PI * 2 * (1 - ratio);

      this.gfx.moveTo(cx, cy);
      this.gfx.arc(cx, cy, r, -Math.PI / 2, endAngle);
      this.gfx.closePath();
      this.gfx.fill({ color: 0x646464, alpha: 0.6 });
    }

    // Ready indicator
    if (state.localCooldownMax > 0 && state.localCooldown <= 0) {
      this.gfx.circle(cx, cy, r);
      this.gfx.fill({ color: 0x64ff64, alpha: 0.3 });
    }

    // Label
    this.cdLabel.position.set(cx, cy + 3);
  }

  // === Sprint Cooldown (circular, bottom right — left of power cooldown) ===

  private renderSprintCooldown(state: DungeonClientState, screenW: number, screenH: number): void {
    const cx = screenW - 86; // 50px left of the power cooldown circle
    const cy = screenH - 36;
    const r = 16;
    const now = Date.now();

    const onCooldown = state.localSprintCooldownUntil > now;
    const sprinting = state.localSprintingUntil > now;

    // Outer ring — brighter when ready, dim when on cooldown
    const ringColor = onCooldown ? 0x333333 : 0x888888;
    this.gfx.circle(cx, cy, r);
    this.gfx.stroke({ color: ringColor, width: 2 });

    if (onCooldown) {
      // Cooldown sweep: show how much cooldown remains
      const elapsed = SPRINT_COOLDOWN_MS - Math.max(0, state.localSprintCooldownUntil - now);
      const ratio = Math.min(1, elapsed / SPRINT_COOLDOWN_MS);
      const endAngle = -Math.PI / 2 + Math.PI * 2 * ratio;

      // Dark fill for remaining cooldown
      this.gfx.moveTo(cx, cy);
      this.gfx.arc(cx, cy, r, endAngle, Math.PI * 1.5);
      this.gfx.closePath();
      this.gfx.fill({ color: 0x222222, alpha: 0.75 });
    } else if (sprinting) {
      // Active sprint — bright cyan glow
      this.gfx.circle(cx, cy, r);
      this.gfx.fill({ color: 0x00eeff, alpha: 0.35 });
    } else {
      // Ready — subtle green tint
      this.gfx.circle(cx, cy, r);
      this.gfx.fill({ color: 0x44ff88, alpha: 0.2 });
    }

    // Label
    this.sprintLabel.text = sprinting ? '>>>' : 'RUN';
    this.sprintLabel.style.fill = sprinting ? 0x00eeff : (onCooldown ? 0x666666 : 0xaaaaaa);
    this.sprintLabel.position.set(cx, cy + 3);
  }

  // === Spin Attack Cooldown (circular, bottom right — left of sprint) ===

  private renderSpinCooldown(state: DungeonClientState, screenW: number, screenH: number): void {
    const SPIN_CD_MAX = 77; // ticks — matches server SPIN_COOLDOWN_TICKS
    const cx = screenW - 136; // 50px left of sprint cooldown circle
    const cy = screenH - 36;
    const r = 16;

    const onCooldown = state.localSpinCooldown > 0;

    // Outer ring
    const ringColor = onCooldown ? 0x333333 : 0x886600;
    this.gfx.circle(cx, cy, r);
    this.gfx.stroke({ color: ringColor, width: 2 });

    if (onCooldown) {
      const ratio = state.localSpinCooldown / SPIN_CD_MAX;
      const endAngle = -Math.PI / 2 + Math.PI * 2 * (1 - ratio);
      this.gfx.moveTo(cx, cy);
      this.gfx.arc(cx, cy, r, -Math.PI / 2, endAngle);
      this.gfx.closePath();
      this.gfx.fill({ color: 0x222222, alpha: 0.75 });
    } else {
      // Ready — golden tint
      this.gfx.circle(cx, cy, r);
      this.gfx.fill({ color: 0xffd700, alpha: 0.25 });
    }

    // Label
    this.spinLabel.text = '[E]';
    this.spinLabel.style.fill = onCooldown ? 0x666666 : 0xffd700;
    this.spinLabel.position.set(cx, cy + 3);
  }

  // === Minimap (130x130, top right) ===

  private renderMinimap(state: DungeonClientState, screenW: number): void {
    const grid = state.tileGrid;
    if (!grid || state.gridWidth === 0 || state.gridHeight === 0) return;

    const MAP_SIZE = 130;
    const MARGIN = 10;
    const mapX = screenW - MAP_SIZE - MARGIN;
    const mapY = MARGIN + 24;

    // Background
    this.gfx.rect(mapX, mapY, MAP_SIZE, MAP_SIZE);
    this.gfx.fill({ color: 0x000000, alpha: 0.65 });

    // Border
    this.gfx.rect(mapX, mapY, MAP_SIZE, MAP_SIZE);
    this.gfx.stroke({ color: 0x969696, alpha: 0.5, width: 1 });

    const gw = state.gridWidth;
    const gh = state.gridHeight;
    const scale = Math.min(MAP_SIZE / gw, MAP_SIZE / gh);
    const offsetX = mapX + (MAP_SIZE - gw * scale) / 2;
    const offsetY = mapY + (MAP_SIZE - gh * scale) / 2;

    // Tiles
    const tileSize = Math.max(1, Math.ceil(scale));
    for (let row = 0; row < gh; row++) {
      for (let col = 0; col < gw; col++) {
        const tile = grid[row * gw + col];
        if (tile === TILE_WALL) continue;
        if (!isTileExplored(state, col, row)) continue;

        const visible = isTileVisible(state, col, row);
        const px = Math.floor(offsetX + col * scale);
        const py = Math.floor(offsetY + row * scale);
        this.gfx.rect(px, py, tileSize, tileSize);
        this.gfx.fill(visible ? 0x8a7a58 : 0x4a4232);
      }
    }

    // Enemy dots (only visible ones)
    const dotR = Math.max(1.5, scale * 0.7);
    for (const enemy of state.enemies.values()) {
      if (!enemy.alive) continue;
      const col = enemy.x / TILE_SIZE;
      const row = enemy.y / TILE_SIZE;
      if (!isTileVisible(state, Math.floor(col), Math.floor(row))) continue;
      this.gfx.circle(offsetX + col * scale, offsetY + row * scale, dotR);
      this.gfx.fill(0xff2222);
    }

    // Boss dot
    if (state.boss?.alive) {
      const bcol = state.boss.x / TILE_SIZE;
      const brow = state.boss.y / TILE_SIZE;
      if (isTileVisible(state, Math.floor(bcol), Math.floor(brow))) {
        this.gfx.circle(offsetX + bcol * scale, offsetY + brow * scale, dotR * 2);
        this.gfx.fill(0xff8800);
        this.gfx.circle(offsetX + bcol * scale, offsetY + brow * scale, dotR * 2);
        this.gfx.stroke({ color: 0xffffff, width: 0.8 });
      }
    }

    // Other player dots
    for (const player of state.players.values()) {
      if (player.isLocal || !player.alive) continue;
      const persona = PERSONAS[player.personaSlug];
      const color = persona ? parseInt(persona.color.slice(1), 16) : 0x4488ff;
      this.gfx.circle(offsetX + (player.x / TILE_SIZE) * scale, offsetY + (player.y / TILE_SIZE) * scale, dotR * 1.3);
      this.gfx.fill(color);
    }

    // Local player dot (white, largest)
    const localPlayer = state.players.get(state.playerId);
    if (localPlayer) {
      const lx = offsetX + (localPlayer.x / TILE_SIZE) * scale;
      const ly = offsetY + (localPlayer.y / TILE_SIZE) * scale;
      this.gfx.circle(lx, ly, dotR * 1.6);
      this.gfx.fill(0xffffff);
      this.gfx.circle(lx, ly, dotR * 1.6);
      this.gfx.stroke({ color: 0x000000, alpha: 0.6, width: 0.8 });
    }
  }

  clear(): void {
    this.gfx.clear();
  }
}
