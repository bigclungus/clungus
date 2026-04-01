// Clungiverse Mob Preview Scene
// Shown after mob generation completes and before the dungeon starts.
// Displays the selected mob roster with a 10-second countdown timer.

import type { DungeonClientState, MobRosterEntry } from '../state';
import { mobSlug } from '../utils';
import { measureWrappedLines } from '../renderer/canvas-utils';

interface MobPreviewScene {
  enter(state: DungeonClientState): void;
  update(state: DungeonClientState, dt: number): void;
  render(state: DungeonClientState, ctx: CanvasRenderingContext2D): void;
  exit(state: DungeonClientState): void;
}

const COUNTDOWN_MS = 10000;

const mobImages = new Map<string, HTMLImageElement>();

interface SkipButtonHit {
  x: number;
  y: number;
  w: number;
  h: number;
}

let skipButtonHit: SkipButtonHit | null = null;
let clickHandler: ((e: MouseEvent) => void) | null = null;
let skipped = false;

const BEHAVIOR_LABEL: Record<string, string> = {
  melee_chase: 'Melee',
  ranged_pattern: 'Ranged',
  slow_charge: 'Charge',
};

const BEHAVIOR_COLOR: Record<string, string> = {
  melee_chase: '#ff7766',
  ranged_pattern: '#66aaff',
  slow_charge: '#ffaa44',
};


function drawMobCardIcon(
  ctx: CanvasRenderingContext2D,
  mob: MobRosterEntry,
  iconX: number,
  iconY: number,
  iconR: number,
  bColor: string,
): void {
  const pngImg = mobImages.get(mob.entityName);
  const spriteFn = (window as unknown as Record<string, unknown>)[`drawSprite_${mobSlug(mob.displayName)}`];
  if (pngImg && pngImg.complete && pngImg.naturalWidth > 0) {
    const size = iconR * 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pngImg, iconX - size / 2, iconY - size / 2, size, size);
    ctx.restore();
  } else if (typeof spriteFn === 'function') {
    ctx.save();
    ctx.scale(1.6, 1.6);
    const scaledIconX = iconX / 1.6;
    const scaledIconY = iconY / 1.6;
    (spriteFn as (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void)(ctx, scaledIconX, scaledIconY);
    ctx.restore();
  } else {
    drawMobCardFallbackShape(ctx, mob.behavior, iconX, iconY, iconR, bColor);
  }
}

function drawMobCardFallbackShape(
  ctx: CanvasRenderingContext2D,
  behavior: string,
  iconX: number,
  iconY: number,
  iconR: number,
  bColor: string,
): void {
  ctx.fillStyle = bColor;
  ctx.strokeStyle = bColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  switch (behavior) {
    case 'melee_chase':
      ctx.arc(iconX, iconY, iconR * 0.75, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ranged_pattern':
      ctx.moveTo(iconX, iconY - iconR);
      ctx.lineTo(iconX + iconR * 0.7, iconY);
      ctx.lineTo(iconX, iconY + iconR);
      ctx.lineTo(iconX - iconR * 0.7, iconY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'slow_charge': {
      const s = iconR * 0.72;
      ctx.rect(iconX - s, iconY - s, s * 2, s * 2);
      ctx.fill();
      break;
    }
  }
}

function drawMobCardNames(
  ctx: CanvasRenderingContext2D,
  mob: MobRosterEntry,
  cx: number,
  cy: number,
  cardW: number,
): number {
  const textX = cx + cardW / 2;
  const textMaxW = cardW - 16;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  const entityLines = measureWrappedLines(ctx, mob.entityName, textMaxW);
  let nameY = cy + 112;
  for (const ln of entityLines) {
    ctx.fillText(ln, textX, nameY);
    nameY += 16;
  }
  ctx.fillStyle = '#aaaacc';
  ctx.font = 'italic 11px monospace';
  const displayLines = measureWrappedLines(ctx, `"${mob.displayName}"`, textMaxW);
  for (const ln of displayLines) {
    ctx.fillText(ln, textX, nameY);
    nameY += 13;
  }
  return nameY;
}

function drawMobCardStats(
  ctx: CanvasRenderingContext2D,
  mob: MobRosterEntry,
  cx: number,
  cardW: number,
  statY: number,
): void {
  const sx = cx + 10;
  const col2 = cx + cardW / 2 + 4;
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffcc66'; ctx.fillText('HP', sx, statY);
  ctx.fillStyle = '#e0e0e0'; ctx.fillText(` ${String(mob.hp)}`, sx + ctx.measureText('HP').width, statY);
  ctx.fillStyle = '#ff7766'; ctx.fillText('ATK', sx, statY + 15);
  ctx.fillStyle = '#e0e0e0'; ctx.fillText(` ${String(mob.atk)}`, sx + ctx.measureText('ATK').width, statY + 15);
  ctx.fillStyle = '#66bbff'; ctx.fillText('DEF', col2, statY);
  ctx.fillStyle = '#e0e0e0'; ctx.fillText(` ${String(mob.def)}`, col2 + ctx.measureText('DEF').width, statY);
  ctx.fillStyle = '#66ffaa'; ctx.fillText('SPD', col2, statY + 15);
  ctx.fillStyle = '#e0e0e0'; ctx.fillText(` ${mob.spd.toFixed(1)}`, col2 + ctx.measureText('SPD').width, statY + 15);
}

function drawMobCardFlavor(
  ctx: CanvasRenderingContext2D,
  flavorText: string,
  cx: number,
  cardW: number,
  flavorStartY: number,
): void {
  ctx.fillStyle = '#777788';
  ctx.font = 'italic 10px monospace';
  ctx.textAlign = 'center';
  const flavorMaxW = cardW - 14;
  const flavorLines = measureWrappedLines(ctx, flavorText, flavorMaxW);
  const maxFlavorLines = 3;
  const truncated = flavorLines.length > maxFlavorLines;
  const linesToShow = truncated ? flavorLines.slice(0, maxFlavorLines) : flavorLines;
  let flavorY = flavorStartY;
  for (let i = 0; i < linesToShow.length; i++) {
    let txt = linesToShow[i];
    if (truncated && i === maxFlavorLines - 1) txt = txt.replace(/\s*\w+$/, '…');
    ctx.fillText(txt, cx + cardW / 2, flavorY);
    flavorY += 12;
  }
}

function drawMobCard(
  ctx: CanvasRenderingContext2D,
  mob: MobRosterEntry,
  cx: number,
  cy: number,
  cardW: number,
  cardH: number,
): void {
  const bColor = BEHAVIOR_COLOR[mob.behavior] ?? '#888888';

  // Card background with subtle gradient
  const bgGrad = ctx.createLinearGradient(cx, cy, cx, cy + cardH);
  bgGrad.addColorStop(0, '#1e1e36');
  bgGrad.addColorStop(1, '#12121f');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(cx, cy, cardW, cardH);
  ctx.strokeStyle = bColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx, cy, cardW, cardH);
  ctx.fillStyle = bColor;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(cx, cy, cardW, 4);
  ctx.globalAlpha = 1;

  // Sprite / icon area
  const iconX = cx + cardW / 2;
  const iconY = cy + 54;
  const iconR = 30;
  ctx.fillStyle = bColor;
  ctx.globalAlpha = 0.15;
  ctx.beginPath();
  ctx.arc(iconX, iconY, iconR + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  drawMobCardIcon(ctx, mob, iconX, iconY, iconR, bColor);

  // Behavior tag
  ctx.fillStyle = bColor;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(BEHAVIOR_LABEL[mob.behavior] ?? mob.behavior, iconX, cy + 94);

  // Names
  const nameY = drawMobCardNames(ctx, mob, cx, cy, cardW);

  // Stats
  const statY = nameY + 6;
  drawMobCardStats(ctx, mob, cx, cardW, statY);

  // Flavor text
  if (mob.flavorText) {
    drawMobCardFlavor(ctx, mob.flavorText, cx, cardW, statY + 34);
  }
}

function renderMobGrid(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  w: number,
  h: number,
): void {
  const mobs = state.mobRoster;
  if (mobs.length === 0) {
    ctx.fillStyle = '#666688';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No mob data available', w / 2, h / 2);
    return;
  }

  const COLS = Math.min(mobs.length, 3);
  const CARD_W = 200;
  const CARD_H = 260;
  const CARD_GAP = 16;
  const rows = Math.ceil(mobs.length / COLS);
  const gridW = COLS * CARD_W + (COLS - 1) * CARD_GAP;
  const gridH = rows * CARD_H + (rows - 1) * CARD_GAP;
  const availH = h - 110 - 70;
  const availW = w - 40;
  const scale = Math.min(gridH > availH ? availH / gridH : 1, gridW > availW ? availW / gridW : 1);
  const scaledCardW = Math.floor(CARD_W * scale);
  const scaledCardH = Math.floor(CARD_H * scale);
  const scaledGap = Math.floor(CARD_GAP * scale);
  const scaledGridW = COLS * scaledCardW + (COLS - 1) * scaledGap;
  const startX = (w - scaledGridW) / 2;
  const startY = 86;

  for (let i = 0; i < mobs.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx = startX + col * (scaledCardW + scaledGap);
    const cy = startY + row * (scaledCardH + scaledGap);
    drawMobCard(ctx, mobs[i], cx, cy, scaledCardW, scaledCardH);
  }
}

function renderSkipButton(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  w: number,
  h: number,
): void {
  const btnW = 160;
  const btnH = 38;
  const btnX = (w - btnW) / 2;
  const btnY = h - 56;

  skipButtonHit = { x: btnX, y: btnY, w: btnW, h: btnH };

  if (skipped) {
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = '#44aa44';
    ctx.lineWidth = 1;
    ctx.strokeRect(btnX, btnY, btnW, btnH);
    ctx.fillStyle = '#44cc44';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(state.tileGrid !== null ? 'ENTERING...' : 'LOADING MAP...', btnX + btnW / 2, btnY + 25);
  } else {
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = '#555577';
    ctx.lineWidth = 1;
    ctx.strokeRect(btnX, btnY, btnW, btnH);
    ctx.fillStyle = '#aaaacc';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Skip  →', btnX + btnW / 2, btnY + 25);
  }
}

export function createMobPreviewScene(): MobPreviewScene {
  return {
    enter(state: DungeonClientState): void {
      skipped = false;
      state.mobPreviewCountdown = COUNTDOWN_MS;
      skipButtonHit = null;

      clickHandler = (e: MouseEvent) => {
        if (!skipButtonHit) return;
        const b = skipButtonHit;
        if (
          e.clientX >= b.x && e.clientX <= b.x + b.w &&
          e.clientY >= b.y && e.clientY <= b.y + b.h
        ) {
          skipped = true;
          // Only switch scene if floor data has already arrived (tileGrid is populated)
          if (state.tileGrid !== null) {
            state.scene = 'dungeon';
          } else {
            // Floor hasn't arrived yet; mark as skipped and let the update loop handle it
            state.mobPreviewCountdown = 0;
          }
        }
      };
      window.addEventListener('click', clickHandler);

      // Preload PNG images for all mobs
      mobImages.clear();
      for (const mob of state.mobRoster) {
        const slug = mobSlug(mob.displayName);
        const img = new Image();
        img.src = `/mob-images/${slug}.png`;
        mobImages.set(mob.entityName, img);
      }
    },

    update(state: DungeonClientState, dt: number): void {
      if (skipped) {
        // Waiting for floor data if it hasn't arrived yet
        if (state.tileGrid !== null) {
          state.scene = 'dungeon';
        }
        return;
      }

      state.mobPreviewCountdown -= dt * 1000;
      if (state.mobPreviewCountdown <= 0) {
        state.mobPreviewCountdown = 0;
        skipped = true;
        if (state.tileGrid !== null) {
          state.scene = 'dungeon';
        }
      }
    },

    render(state: DungeonClientState, ctx: CanvasRenderingContext2D): void {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;

      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0d0d1a');
      grad.addColorStop(1, '#1a1a2e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('YOUR ENEMIES AWAIT', w / 2, 46);

      ctx.fillStyle = '#aaaacc';
      ctx.font = '14px monospace';
      ctx.fillText('The monsters selected for this run:', w / 2, 68);

      const secLeft = Math.ceil(state.mobPreviewCountdown / 1000);
      const countdownStr = skipped ? 'LOADING...' : `Entering in ${String(secLeft)}s`;
      ctx.fillStyle = secLeft <= 3 && !skipped ? '#ff9944' : '#888899';
      ctx.font = '13px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(countdownStr, w - 16, 24);

      renderMobGrid(ctx, state, w, h);
      renderSkipButton(ctx, state, w, h);
    },

    exit(_state: DungeonClientState): void {
      if (clickHandler) {
        window.removeEventListener('click', clickHandler);
        clickHandler = null;
      }
      skipButtonHit = null;
      skipped = false;
      mobImages.clear();
    },
  };
}
