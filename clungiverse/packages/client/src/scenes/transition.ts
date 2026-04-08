// Clungiverse Transition Scene
// Between-floor powerup selection

import type { DungeonClientState, PowerupChoice } from '../state';
import type { DungeonNetwork } from '../network/dungeon-network';
import { wrapText } from '../renderer/canvas-utils';

interface TransitionScene {
  enter(state: DungeonClientState): void;
  update(state: DungeonClientState, dt: number): void;
  render(state: DungeonClientState, ctx: CanvasRenderingContext2D): void;
  exit(state: DungeonClientState): void;
}

const CARD_W = 180;
const CARD_H = 260;
const CARD_GAP = 24;

interface CardRect {
  choice: PowerupChoice;
  x: number;
  y: number;
  w: number;
  h: number;
}

let cardRects: CardRect[] = [];
let clickHandler: ((e: MouseEvent) => void) | null = null;
let touchHandler: ((e: TouchEvent) => void) | null = null;
let picked = false;
let timerStart = 0;
const PICK_TIMEOUT_MS = 15000;

const RARITY_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  common: { bg: '#222222', border: '#777777', label: '#aaaaaa' },
  uncommon: { bg: '#1a2e1a', border: '#44aa44', label: '#44aa44' },
  rare: { bg: '#1a1a3e', border: '#4488ff', label: '#4488ff' },
  cursed: { bg: '#2a0808', border: '#cc2222', label: '#ff4444' },
};

function renderPowerupCard(
  ctx: CanvasRenderingContext2D,
  choice: PowerupChoice,
  cx: number,
  cy: number,
  isPicked: boolean,
): void {
  const isCursed = choice.rarity === 'cursed';
  const rarity = RARITY_COLORS[choice.rarity] ?? RARITY_COLORS.common;

  ctx.fillStyle = isPicked ? '#111111' : rarity.bg;
  ctx.fillRect(cx, cy, CARD_W, CARD_H);

  // Cursed card: pulsing red glow border using a double-stroke trick
  if (isCursed && !isPicked) {
    ctx.strokeStyle = 'rgba(200,0,0,0.25)';
    ctx.lineWidth = 6;
    ctx.strokeRect(cx - 2, cy - 2, CARD_W + 4, CARD_H + 4);
  }

  ctx.strokeStyle = rarity.border;
  ctx.lineWidth = isCursed ? 2.5 : 2;
  ctx.strokeRect(cx, cy, CARD_W, CARD_H);

  // Cursed label row: skull icon + "CURSED"
  if (isCursed) {
    ctx.fillStyle = rarity.label;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('☠ CURSED ☠', cx + CARD_W / 2, cy + 18);
  } else {
    ctx.fillStyle = rarity.label;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(choice.rarity.toUpperCase(), cx + CARD_W / 2, cy + 18);
  }

  ctx.fillStyle = isCursed ? '#ffaaaa' : '#eeeeee';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(choice.name, cx + CARD_W / 2, cy + 45);

  ctx.fillStyle = '#aaaaaa';
  ctx.font = '10px monospace';
  wrapText(ctx, choice.description, cx + CARD_W / 2, cy + 70, CARD_W - 20, 13);

  let my = cy + 140;
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  for (const [stat, value] of Object.entries(choice.statModifier)) {
    const sign = value > 0 ? '+' : '';
    ctx.fillStyle = value > 0 ? '#44aa44' : '#aa4444';
    ctx.fillText(`${stat.toUpperCase()} ${sign}${String(value)}`, cx + CARD_W / 2, my);
    my += 14;
  }

  // Cursed drawback: shown in red below stat mods
  if (isCursed && (choice as PowerupChoice & { curseDescription?: string }).curseDescription) {
    my += 4;
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    const curseDesc = (choice as PowerupChoice & { curseDescription?: string }).curseDescription ?? '';
    wrapText(ctx, `⚠ ${curseDesc}`, cx + CARD_W / 2, my, CARD_W - 16, 11);
  }

  if (!isPicked) {
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(cx, cy, CARD_W, CARD_H);
  }
}

export function createTransitionScene(network: DungeonNetwork): TransitionScene {
  return {
    enter(_state: DungeonClientState): void {
      picked = false;
      timerStart = performance.now();
      cardRects = [];

      clickHandler = (e: MouseEvent) => {
        if (picked) return;
        const mx = e.clientX;
        const my = e.clientY;

        for (const card of cardRects) {
          if (mx >= card.x && mx <= card.x + card.w && my >= card.y && my <= card.y + card.h) {
            picked = true;
            network.sendPickPowerup(card.choice.id);
            return;
          }
        }
      };

      touchHandler = (e: TouchEvent) => {
        if (picked || e.changedTouches.length !== 1) return;
        const t = e.changedTouches[0];
        const mx = t.clientX;
        const my = t.clientY;
        for (const card of cardRects) {
          if (mx >= card.x && mx <= card.x + card.w && my >= card.y && my <= card.y + card.h) {
            picked = true;
            network.sendPickPowerup(card.choice.id);
            e.preventDefault();
            return;
          }
        }
      };

      window.addEventListener('click', clickHandler);
      window.addEventListener('touchend', touchHandler, { passive: false });
    },

    update(state: DungeonClientState, _dt: number): void {
      // Count down timer
      const elapsed = performance.now() - timerStart;
      state.powerupTimer = Math.max(0, PICK_TIMEOUT_MS - elapsed);

      // Auto-pick random if timer runs out
      if (!picked && state.powerupTimer <= 0 && state.powerupChoices.length > 0) {
        const idx = Math.floor(Math.random() * state.powerupChoices.length);
        picked = true;
        network.sendPickPowerup(state.powerupChoices[idx].id);
      }
    },

    render(state: DungeonClientState, ctx: CanvasRenderingContext2D): void {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;

      // Background
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0d0d1a');
      grad.addColorStop(1, '#1a0d1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Title
      ctx.fillStyle = '#dddddd';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CHOOSE YOUR POWERUP', w / 2, 50);

      // Hint about cursed option
      ctx.fillStyle = '#883333';
      ctx.font = '10px monospace';
      ctx.fillText('☠  4th option is cursed — great power, dark cost', w / 2, 68);

      // Timer
      const timerSec = Math.ceil(state.powerupTimer / 1000);
      ctx.fillStyle = timerSec <= 5 ? '#ff4444' : '#aaaaaa';
      ctx.font = '16px monospace';
      ctx.fillText(`${String(timerSec)}s`, w / 2, 88);

      // Cards
      const choices = state.powerupChoices;
      const totalW = choices.length * CARD_W + (choices.length - 1) * CARD_GAP;
      const startX = (w - totalW) / 2;
      const startY = (h - CARD_H) / 2 - 20;

      cardRects = [];

      for (let i = 0; i < choices.length; i++) {
        const choice = choices[i];
        const cx = startX + i * (CARD_W + CARD_GAP);
        const cy = startY;
        cardRects.push({ choice, x: cx, y: cy, w: CARD_W, h: CARD_H });
        renderPowerupCard(ctx, choice, cx, cy, picked);
      }

      if (picked) {
        ctx.fillStyle = '#88cc88';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Powerup selected! Waiting for next floor...', w / 2, startY + CARD_H + 40);
      }
    },

    exit(_state: DungeonClientState): void {
      if (clickHandler) {
        window.removeEventListener('click', clickHandler);
        clickHandler = null;
      }
      if (touchHandler) {
        window.removeEventListener('touchend', touchHandler);
        touchHandler = null;
      }
      cardRects = [];
      picked = false;
    },
  };
}

