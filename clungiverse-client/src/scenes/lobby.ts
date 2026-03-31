// Clungiverse Lobby Scene
// Persona selection, party roster, ready/start

import type { DungeonClientState, PersonaSlug } from '../state';
import { PERSONAS, PERSONA_SLUGS } from '../state';
import type { DungeonNetwork } from '../network/dungeon-network';
import { wrapText } from '../renderer/canvas-utils';

interface LobbyScene {
  enter(state: DungeonClientState): void;
  update(state: DungeonClientState, dt: number): void;
  render(state: DungeonClientState, ctx: CanvasRenderingContext2D): void;
  exit(state: DungeonClientState): void;
}

// Card layout — base values, scaled down when viewport is short
const BASE_CARD_W = 210;
const BASE_CARD_H = 240;
const BASE_CARD_GAP = 16;
const GRID_COLS = 2;

interface CardHit {
  slug: PersonaSlug;
  x: number;
  y: number;
  w: number;
  h: number;
}

let cardHits: CardHit[] = [];
let startButtonHit: { x: number; y: number; w: number; h: number } | null = null;
let copyLinkHit: { x: number; y: number; w: number; h: number } | null = null;
let clickHandler: ((e: MouseEvent) => void) | null = null;
let linkCopiedFlash = 0; // timestamp when "Copied!" was triggered
let skipGenCheckbox: HTMLInputElement | null = null;
let skipGenLabel: HTMLLabelElement | null = null;

export function createLobbyScene(network: DungeonNetwork): LobbyScene {
  return {
    enter(state: DungeonClientState): void {
      state.selectedPersona = null;
      cardHits = [];
      startButtonHit = null;

      // Create skip-gen checkbox as a DOM overlay (host-only, shown on enter)
      const skipGenWrapper = document.createElement('div');
      skipGenWrapper.id = 'skip-gen-wrapper';
      skipGenWrapper.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;z-index:10;';

      skipGenCheckbox = document.createElement('input');
      skipGenCheckbox.type = 'checkbox';
      skipGenCheckbox.id = 'skip-gen-checkbox';
      skipGenCheckbox.checked = state.skipGen;
      skipGenCheckbox.style.cssText = 'accent-color:#44aa66;width:16px;height:16px;cursor:pointer;flex-shrink:0;';
      skipGenCheckbox.addEventListener('change', () => {
        state.skipGen = skipGenCheckbox!.checked;
      });

      skipGenLabel = document.createElement('label');
      skipGenLabel.htmlFor = 'skip-gen-checkbox';
      skipGenLabel.textContent = '⚡ Use cached mobs (skip generation)';
      skipGenLabel.style.cssText = 'color:#aaaacc;font:13px monospace;cursor:pointer;user-select:none;white-space:nowrap;';

      skipGenWrapper.appendChild(skipGenCheckbox);
      skipGenWrapper.appendChild(skipGenLabel);
      document.body.appendChild(skipGenWrapper);

      clickHandler = (e: MouseEvent) => {
        const mx = e.clientX;
        const my = e.clientY;

        // Check persona cards
        for (const card of cardHits) {
          if (mx >= card.x && mx <= card.x + card.w && my >= card.y && my <= card.y + card.h) {
            state.selectedPersona = card.slug;
            if (state.connected) {
              network.sendReady(card.slug);
            }
            return;
          }
        }

        // Check copy invite link button
        if (copyLinkHit && state.lobbyId) {
          const b = copyLinkHit;
          if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
            const inviteUrl = `${window.location.origin}/clungiverse.html?lobby=${state.lobbyId}`;
            navigator.clipboard.writeText(inviteUrl).then(() => {
              linkCopiedFlash = performance.now();
            }).catch(() => {
              // Fallback: select from a temporary input
              const tmp = document.createElement('input');
              tmp.value = inviteUrl;
              document.body.appendChild(tmp);
              tmp.select();
              document.execCommand('copy');
              document.body.removeChild(tmp);
              linkCopiedFlash = performance.now();
            });
            return;
          }
        }

        // Check start button — host only, enabled when a persona is selected
        if (startButtonHit && state.isHost && state.selectedPersona && state.connected) {
          const b = startButtonHit;
          if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
            network.sendReady(state.selectedPersona);
            network.sendStart(state.skipGen);
          }
        }
      };

      window.addEventListener('click', clickHandler);
    },

    update(_state: DungeonClientState, _dt: number): void {
      // Lobby state updates come from network
    },

    render(state: DungeonClientState, ctx: CanvasRenderingContext2D): void {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;

      // Background: dark cave gradient
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0d0d1a');
      grad.addColorStop(1, '#1a1a2e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CLUNGIVERSE', w / 2, 50);

      ctx.font = '16px monospace';
      ctx.fillStyle = '#bbbbbb';
      ctx.fillText('Select Your Persona', w / 2, 78);

      // Connection status
      if (state.lobbyStatus === 'error') {
        ctx.fillStyle = '#ff4444';
        ctx.font = '14px monospace';
        ctx.fillText(`Error: ${state.lobbyError ?? 'Unknown'}`, w / 2, 98);
      } else if (state.lobbyStatus === 'creating') {
        ctx.fillStyle = '#ffcc44';
        ctx.font = '14px monospace';
        ctx.fillText('Creating lobby...', w / 2, 98);
      } else if (state.lobbyStatus === 'joining') {
        ctx.fillStyle = '#ffcc44';
        ctx.font = '14px monospace';
        ctx.fillText('Joining lobby...', w / 2, 98);
      } else if (!state.connected) {
        ctx.fillStyle = '#ff4444';
        ctx.font = '14px monospace';
        ctx.fillText('Connecting...', w / 2, 98);
      }

      // === Persona Selection Grid (2x2) ===
      // Scale cards to fit viewport: header(110) + grid + gap(30) + button(48) + margin(20)
      const reservedH = 110 + 30 + 48 + 20;
      const gridRows = Math.ceil(PERSONA_SLUGS.length / GRID_COLS);
      const maxGridH = h - reservedH;
      const naturalGridH = gridRows * BASE_CARD_H + (gridRows - 1) * BASE_CARD_GAP;
      const scale = naturalGridH > maxGridH ? maxGridH / naturalGridH : 1;
      const CARD_W = Math.floor(BASE_CARD_W * scale);
      const CARD_H = Math.floor(BASE_CARD_H * scale);
      const CARD_GAP = Math.floor(BASE_CARD_GAP * scale);

      const gridW = GRID_COLS * CARD_W + (GRID_COLS - 1) * CARD_GAP;
      const gridH = gridRows * CARD_H + (gridRows - 1) * CARD_GAP;
      const gridX = (w - gridW) / 2;
      const gridY = 110;

      cardHits = [];

      for (let i = 0; i < PERSONA_SLUGS.length; i++) {
        const slug = PERSONA_SLUGS[i];
        const persona = PERSONAS[slug];
        const col = i % GRID_COLS;
        const row = Math.floor(i / GRID_COLS);
        const cx = gridX + col * (CARD_W + CARD_GAP);
        const cy = gridY + row * (CARD_H + CARD_GAP);

        cardHits.push({ slug, x: cx, y: cy, w: CARD_W, h: CARD_H });

        const selected = state.selectedPersona === slug;
        const taken = state.lobbyPlayers.some(
          (p) => p.personaSlug === slug && p.playerId !== state.playerId,
        );

        // Card background
        ctx.fillStyle = taken ? '#1a1a1a' : selected ? '#2a2a3e' : '#1e1e2e';
        ctx.fillRect(cx, cy, CARD_W, CARD_H);

        // Border
        ctx.strokeStyle = selected ? persona.color : taken ? '#333333' : '#444444';
        ctx.lineWidth = selected ? 2 : 1;
        ctx.strokeRect(cx, cy, CARD_W, CARD_H);

        // Persona color circle
        ctx.fillStyle = taken ? '#444444' : persona.color;
        ctx.beginPath();
        ctx.arc(cx + CARD_W / 2, cy + 30, 18, 0, Math.PI * 2);
        ctx.fill();

        // Role shape inside circle
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        drawRoleShape(ctx, cx + CARD_W / 2, cy + 30, 11, persona.role);

        // Name
        ctx.fillStyle = taken ? '#555555' : '#ffffff';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(persona.name, cx + CARD_W / 2, cy + 62);

        // Role — use persona color for visibility
        ctx.fillStyle = taken ? '#666666' : persona.color;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(persona.role.toUpperCase(), cx + CARD_W / 2, cy + 76);

        // Stats
        const stats = persona.baseStats;
        const statY = cy + 92;
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        const sx = cx + 14;
        ctx.fillStyle = '#ffcc66';
        ctx.fillText('HP', sx, statY);
        ctx.fillStyle = '#e0e0e0';
        ctx.fillText(` ${stats.hp}`, sx + ctx.measureText('HP').width, statY);
        ctx.fillStyle = '#ff7766';
        ctx.fillText('ATK', sx, statY + 16);
        ctx.fillStyle = '#e0e0e0';
        ctx.fillText(` ${stats.atk}`, sx + ctx.measureText('ATK').width, statY + 16);
        ctx.fillStyle = '#66bbff';
        ctx.fillText('DEF', sx + 90, statY);
        ctx.fillStyle = '#e0e0e0';
        ctx.fillText(` ${stats.def}`, sx + 90 + ctx.measureText('DEF').width, statY);
        ctx.fillStyle = '#66ffaa';
        ctx.fillText('SPD', sx + 90, statY + 16);
        ctx.fillStyle = '#e0e0e0';
        ctx.fillText(` ${stats.spd}`, sx + 90 + ctx.measureText('SPD').width, statY + 16);
        ctx.fillStyle = '#cc99ff';
        ctx.fillText('LCK', sx + 45, statY + 32);
        ctx.fillStyle = '#e0e0e0';
        ctx.fillText(` ${stats.lck}`, sx + 45 + ctx.measureText('LCK').width, statY + 32);

        // Power
        ctx.textAlign = 'center';
        ctx.fillStyle = '#88bbff';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(persona.powerName, cx + CARD_W / 2, cy + 170);

        ctx.fillStyle = '#c0c0c0';
        ctx.font = '12px monospace';
        wrapText(ctx, persona.powerDescription, cx + CARD_W / 2, cy + 186, CARD_W - 20, 14);

        if (taken) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(cx, cy, CARD_W, CARD_H);
          ctx.fillStyle = '#999999';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('TAKEN', cx + CARD_W / 2, cy + CARD_H / 2);
        }
      }

      // === Party Roster ===
      const rosterX = w - 200;
      const rosterY = 110;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Party', rosterX, rosterY);

      let ry = rosterY + 24;
      for (const player of state.lobbyPlayers) {
        const pColor = player.personaSlug
          ? PERSONAS[player.personaSlug]?.color ?? '#888888'
          : '#555555';

        // Ready indicator
        ctx.fillStyle = player.ready ? '#44cc44' : '#cc4444';
        ctx.beginPath();
        ctx.arc(rosterX + 7, ry + 3, 5, 0, Math.PI * 2);
        ctx.fill();

        // Name
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px monospace';
        ctx.fillText(player.name, rosterX + 18, ry + 7);

        // Persona label
        if (player.personaSlug) {
          ctx.fillStyle = pColor;
          ctx.font = '12px monospace';
          ctx.fillText(
            PERSONAS[player.personaSlug]?.name ?? player.personaSlug,
            rosterX + 18,
            ry + 22,
          );
        }

        // Host badge
        if (player.isHost) {
          ctx.fillStyle = '#ffc640';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('HOST', rosterX + 140, ry + 7);
        }

        ry += 36;
      }

      // === Start Button (host only) / Waiting text (non-host) ===
      {
        const btnW = 220;
        const btnH = 48;
        const btnX = (w - btnW) / 2;
        const btnY = gridY + gridH + 30;

        if (state.isHost) {
          const allReady = state.lobbyPlayers.length > 0 &&
            state.lobbyPlayers.every((p) => p.ready);
          const canStart = !!state.selectedPersona && state.connected && allReady;

          startButtonHit = { x: btnX, y: btnY, w: btnW, h: btnH };

          ctx.fillStyle = canStart ? '#2a6b2a' : '#222222';
          ctx.fillRect(btnX, btnY, btnW, btnH);
          ctx.strokeStyle = canStart ? '#44aa44' : '#444444';
          ctx.lineWidth = 2;
          ctx.strokeRect(btnX, btnY, btnW, btnH);

          ctx.fillStyle = canStart ? '#ffffff' : '#666666';
          ctx.font = 'bold 20px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('START DUNGEON', btnX + btnW / 2, btnY + 32);

          if (!state.selectedPersona) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px monospace';
            ctx.fillText('Select a persona to begin', btnX + btnW / 2, btnY + btnH + 18);
          } else if (!allReady) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px monospace';
            ctx.fillText('Waiting for all players to pick...', btnX + btnW / 2, btnY + btnH + 18);
          }
        } else {
          startButtonHit = null;

          ctx.fillStyle = '#888888';
          ctx.font = '16px monospace';
          ctx.textAlign = 'center';
          if (!state.selectedPersona) {
            ctx.fillText('Select a persona', btnX + btnW / 2, btnY + 28);
          } else {
            ctx.fillText('Waiting for host to start...', btnX + btnW / 2, btnY + 28);
          }
        }
      }

      // === Mob Generation Loading Overlay ===
      if (state.mobGenProgress) {
        const prog = state.mobGenProgress;

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, w, h);

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ENTERING THE DUNGEON', w / 2, h / 2 - 60);

        // Progress bar
        const barW = 320;
        const barH = 20;
        const barX = (w - barW) / 2;
        const barY = h / 2 - 10;
        const ratio = prog.total > 0 ? prog.completed / prog.total : 0;

        // Bar background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.strokeStyle = '#444466';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        // Bar fill
        ctx.fillStyle = '#44aa66';
        ctx.fillRect(barX, barY, barW * ratio, barH);

        // Progress text
        ctx.fillStyle = '#cccccc';
        ctx.font = '14px monospace';
        ctx.fillText(`${prog.completed} / ${prog.total}`, w / 2, barY + barH + 24);

        // Current entity
        if (prog.current) {
          ctx.fillStyle = '#888899';
          ctx.font = '13px monospace';
          ctx.fillText(prog.current, w / 2, barY + barH + 48);
        }

        // Status indicator
        if (prog.status === 'error') {
          ctx.fillStyle = '#ff4444';
          ctx.font = '14px monospace';
          ctx.fillText('Generation error - retrying...', w / 2, barY + barH + 72);
        }

        return; // Don't render the rest of the lobby underneath
      }

      // === Copy Invite Link Button ===
      if (state.lobbyId) {
        const linkBtnW = 200;
        const linkBtnH = 32;
        const linkBtnX = (w - linkBtnW) / 2;
        const linkBtnY = gridY + gridH + 30 + 48 + 28; // below start button

        copyLinkHit = { x: linkBtnX, y: linkBtnY, w: linkBtnW, h: linkBtnH };

        const recentlyCopied = linkCopiedFlash > 0 && (performance.now() - linkCopiedFlash) < 2000;

        ctx.fillStyle = recentlyCopied ? '#1a3a1a' : '#1a1a2e';
        ctx.fillRect(linkBtnX, linkBtnY, linkBtnW, linkBtnH);
        ctx.strokeStyle = recentlyCopied ? '#44aa44' : '#555577';
        ctx.lineWidth = 1;
        ctx.strokeRect(linkBtnX, linkBtnY, linkBtnW, linkBtnH);

        ctx.fillStyle = recentlyCopied ? '#88ff88' : '#aaaacc';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          recentlyCopied ? 'Copied!' : 'Copy Invite Link',
          linkBtnX + linkBtnW / 2,
          linkBtnY + 22,
        );

        // Show lobby ID below the button
        ctx.fillStyle = '#555555';
        ctx.font = '10px monospace';
        ctx.fillText(`Lobby: ${state.lobbyId}`, linkBtnX + linkBtnW / 2, linkBtnY + linkBtnH + 14);
      }
    },

    exit(_state: DungeonClientState): void {
      if (clickHandler) {
        window.removeEventListener('click', clickHandler);
        clickHandler = null;
      }
      cardHits = [];
      startButtonHit = null;
      copyLinkHit = null;
      linkCopiedFlash = 0;
      const wrapper = document.getElementById('skip-gen-wrapper');
      if (wrapper) wrapper.remove();
      if (skipGenCheckbox) {
        skipGenCheckbox = null;
      }
      if (skipGenLabel) {
        skipGenLabel = null;
      }
    },
  };
}

function drawRoleShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  role: string,
): void {
  ctx.beginPath();
  switch (role) {
    case 'tank':
      ctx.rect(x - size / 2, y - size / 2, size, size);
      break;
    case 'dps':
      ctx.moveTo(x, y - size);
      ctx.lineTo(x - size * 0.8, y + size * 0.5);
      ctx.lineTo(x + size * 0.8, y + size * 0.5);
      ctx.closePath();
      break;
    case 'support': {
      const arm = size * 0.25;
      const len = size * 0.7;
      ctx.rect(x - arm, y - len, arm * 2, len * 2);
      ctx.rect(x - len, y - arm, len * 2, arm * 2);
      break;
    }
    case 'wildcard': {
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 - Math.PI / 2;
        const r = i % 2 === 0 ? size : size * 0.4;
        const px = x + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
  }
  ctx.fill();
}

