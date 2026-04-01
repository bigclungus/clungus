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
let touchHandler: ((e: TouchEvent) => void) | null = null;
let linkCopiedFlash = 0; // timestamp when "Copied!" was triggered
let skipGenCheckbox: HTMLInputElement | null = null;
let skipGenLabel: HTMLLabelElement | null = null;

interface CardLayout {
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  CARD_W: number;
  CARD_H: number;
  CARD_GAP: number;
}

function computeCardLayout(canvasH: number, canvasW: number): CardLayout {
  const reservedH = 110 + 30 + 48 + 20;
  const gridRows = Math.ceil(PERSONA_SLUGS.length / GRID_COLS);
  const maxGridH = canvasH - reservedH;
  const naturalGridH = gridRows * BASE_CARD_H + (gridRows - 1) * BASE_CARD_GAP;
  const scale = naturalGridH > maxGridH ? maxGridH / naturalGridH : 1;
  const CARD_W = Math.floor(BASE_CARD_W * scale);
  const CARD_H = Math.floor(BASE_CARD_H * scale);
  const CARD_GAP = Math.floor(BASE_CARD_GAP * scale);
  const gridW = GRID_COLS * CARD_W + (GRID_COLS - 1) * CARD_GAP;
  const gridH = gridRows * CARD_H + (gridRows - 1) * CARD_GAP;
  const gridX = (canvasW - gridW) / 2;
  return { gridX, gridY: 110, gridW, gridH, CARD_W, CARD_H, CARD_GAP };
}

function renderLobbyStatus(ctx: CanvasRenderingContext2D, state: DungeonClientState, w: number): void {
  if (state.lobbyStatus === 'error') {
    ctx.fillStyle = '#ff4444';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Error: ${state.lobbyError ?? 'Unknown'}`, w / 2, 98);
  } else if (state.lobbyStatus === 'creating') {
    ctx.fillStyle = '#ffcc44';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Creating lobby...', w / 2, 98);
  } else if (state.lobbyStatus === 'joining') {
    ctx.fillStyle = '#ffcc44';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Joining lobby...', w / 2, 98);
  } else if (!state.connected) {
    ctx.fillStyle = '#ff4444';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Connecting...', w / 2, 98);
  }
}

function renderPersonaStatBlock(
  ctx: CanvasRenderingContext2D,
  stats: { hp: number; atk: number; def: number; spd: number; lck: number },
  cx: number,
  cy: number,
): void {
  const statY = cy + 92;
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  const sx = cx + 14;
  ctx.fillStyle = '#ffcc66'; ctx.fillText('HP', sx, statY);
  ctx.fillStyle = '#e0e0e0'; ctx.fillText(` ${String(stats.hp)}`, sx + ctx.measureText('HP').width, statY);
  ctx.fillStyle = '#ff7766'; ctx.fillText('ATK', sx, statY + 16);
  ctx.fillStyle = '#e0e0e0'; ctx.fillText(` ${String(stats.atk)}`, sx + ctx.measureText('ATK').width, statY + 16);
  ctx.fillStyle = '#66bbff'; ctx.fillText('DEF', sx + 90, statY);
  ctx.fillStyle = '#e0e0e0'; ctx.fillText(` ${String(stats.def)}`, sx + 90 + ctx.measureText('DEF').width, statY);
  ctx.fillStyle = '#66ffaa'; ctx.fillText('SPD', sx + 90, statY + 16);
  ctx.fillStyle = '#e0e0e0'; ctx.fillText(` ${String(stats.spd)}`, sx + 90 + ctx.measureText('SPD').width, statY + 16);
  ctx.fillStyle = '#cc99ff'; ctx.fillText('LCK', sx + 45, statY + 32);
  ctx.fillStyle = '#e0e0e0'; ctx.fillText(` ${String(stats.lck)}`, sx + 45 + ctx.measureText('LCK').width, statY + 32);
}

function cardBgColor(selected: boolean, taken: boolean): string {
  if (taken) return '#1a1a1a';
  return selected ? '#2a2a3e' : '#1e1e2e';
}

function cardBorderColor(persona: typeof PERSONAS[PersonaSlug], selected: boolean, taken: boolean): string {
  if (selected) return persona.color;
  return taken ? '#333333' : '#444444';
}

function renderPersonaCardHeader(
  ctx: CanvasRenderingContext2D,
  persona: typeof PERSONAS[PersonaSlug],
  cx: number,
  cy: number,
  CARD_W: number,
  CARD_H: number,
  selected: boolean,
  taken: boolean,
): void {
  ctx.fillStyle = cardBgColor(selected, taken);
  ctx.fillRect(cx, cy, CARD_W, CARD_H);
  ctx.strokeStyle = cardBorderColor(persona, selected, taken);
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeRect(cx, cy, CARD_W, CARD_H);
  ctx.fillStyle = taken ? '#444444' : persona.color;
  ctx.beginPath();
  ctx.arc(cx + CARD_W / 2, cy + 30, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  drawRoleShape(ctx, cx + CARD_W / 2, cy + 30, 11, persona.role);
  ctx.fillStyle = taken ? '#555555' : '#ffffff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(persona.name, cx + CARD_W / 2, cy + 62);
  ctx.fillStyle = taken ? '#666666' : persona.color;
  ctx.font = 'bold 11px monospace';
  ctx.fillText(persona.role.toUpperCase(), cx + CARD_W / 2, cy + 76);
}

function renderPersonaCard(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  slug: PersonaSlug,
  cx: number,
  cy: number,
  CARD_W: number,
  CARD_H: number,
): void {
  const persona = PERSONAS[slug];
  const selected = state.selectedPersona === slug;
  const taken = state.lobbyPlayers.some(
    (p) => p.personaSlug === slug && p.playerId !== state.playerId,
  );

  renderPersonaCardHeader(ctx, persona, cx, cy, CARD_W, CARD_H, selected, taken);
  renderPersonaStatBlock(ctx, persona.baseStats, cx, cy);

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

function renderPersonaGrid(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  gridX: number,
  gridY: number,
  CARD_W: number,
  CARD_H: number,
  CARD_GAP: number,
): void {
  cardHits = [];
  for (let i = 0; i < PERSONA_SLUGS.length; i++) {
    const slug = PERSONA_SLUGS[i];
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const cx = gridX + col * (CARD_W + CARD_GAP);
    const cy = gridY + row * (CARD_H + CARD_GAP);
    cardHits.push({ slug, x: cx, y: cy, w: CARD_W, h: CARD_H });
    renderPersonaCard(ctx, state, slug, cx, cy, CARD_W, CARD_H);
  }
}

function renderPartyRoster(ctx: CanvasRenderingContext2D, state: DungeonClientState, w: number): void {
  // On narrow viewports (mobile), skip the sidebar roster — player list is visible in the persona cards
  if (w < 480) return;
  const rosterX = w - 200;
  const rosterY = 110;

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Party', rosterX, rosterY);

  let ry = rosterY + 24;
  for (const player of state.lobbyPlayers) {
    const pColor = player.personaSlug ? PERSONAS[player.personaSlug].color : '#555555';

    ctx.fillStyle = player.ready ? '#44cc44' : '#cc4444';
    ctx.beginPath();
    ctx.arc(rosterX + 7, ry + 3, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.fillText(player.name, rosterX + 18, ry + 7);

    if (player.personaSlug) {
      ctx.fillStyle = pColor;
      ctx.font = '12px monospace';
      ctx.fillText(PERSONAS[player.personaSlug].name, rosterX + 18, ry + 22);
    }

    if (player.isHost) {
      ctx.fillStyle = '#ffc640';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('HOST', rosterX + 140, ry + 7);
    }

    ry += 36;
  }
}

function renderHostStartButton(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  btnX: number,
  btnY: number,
  btnW: number,
  btnH: number,
): void {
  const allReady = state.lobbyPlayers.length > 0 && state.lobbyPlayers.every((p) => p.ready);
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
  renderHostStartHint(ctx, state, allReady, btnX, btnY, btnW, btnH);
}

function renderHostStartHint(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  allReady: boolean,
  btnX: number,
  btnY: number,
  btnW: number,
  btnH: number,
): void {
  ctx.fillStyle = '#888888';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  if (!state.selectedPersona) {
    ctx.fillText('Select a persona to begin', btnX + btnW / 2, btnY + btnH + 18);
  } else if (!allReady) {
    ctx.fillText('Waiting for all players to pick...', btnX + btnW / 2, btnY + btnH + 18);
  }
}

function renderStartOrWaitButton(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  w: number,
  gridY: number,
  gridH: number,
): void {
  const btnW = 220;
  const btnH = 48;
  const btnX = (w - btnW) / 2;
  const btnY = gridY + gridH + 30;

  if (state.isHost) {
    renderHostStartButton(ctx, state, btnX, btnY, btnW, btnH);
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

function renderMobGenOverlay(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  w: number,
  h: number,
): void {
  const prog = state.mobGenProgress;
  if (!prog) return;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ENTERING THE DUNGEON', w / 2, h / 2 - 60);

  const barW = 320;
  const barH = 20;
  const barX = (w - barW) / 2;
  const barY = h / 2 - 10;
  const ratio = prog.total > 0 ? prog.completed / prog.total : 0;

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.strokeStyle = '#444466';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);

  ctx.fillStyle = '#44aa66';
  ctx.fillRect(barX, barY, barW * ratio, barH);

  ctx.fillStyle = '#cccccc';
  ctx.font = '14px monospace';
  ctx.fillText(`${String(prog.completed)} / ${String(prog.total)}`, w / 2, barY + barH + 24);

  if (prog.current) {
    ctx.fillStyle = '#888899';
    ctx.font = '13px monospace';
    ctx.fillText(prog.current, w / 2, barY + barH + 48);
  }

  if (prog.status === 'error') {
    ctx.fillStyle = '#ff4444';
    ctx.font = '14px monospace';
    ctx.fillText('Generation error - retrying...', w / 2, barY + barH + 72);
  }
}

function renderCopyInviteButton(
  ctx: CanvasRenderingContext2D,
  state: DungeonClientState,
  w: number,
  gridY: number,
  gridH: number,
): void {
  if (!state.lobbyId) return;

  const linkBtnW = 200;
  const linkBtnH = 32;
  const linkBtnX = (w - linkBtnW) / 2;
  const linkBtnY = gridY + gridH + 30 + 48 + 28;

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

  ctx.fillStyle = '#555555';
  ctx.font = '10px monospace';
  ctx.fillText(`Lobby: ${state.lobbyId}`, linkBtnX + linkBtnW / 2, linkBtnY + linkBtnH + 14);
}

function copyInviteLink(lobbyId: string): void {
  const inviteUrl = `${window.location.origin}/clungiverse.html?lobby=${lobbyId}`;
  navigator.clipboard.writeText(inviteUrl).then(() => {
    linkCopiedFlash = performance.now();
  }).catch(() => {
    const tmp = document.createElement('input');
    tmp.value = inviteUrl;
    document.body.appendChild(tmp);
    tmp.select();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand('copy');
    document.body.removeChild(tmp);
    linkCopiedFlash = performance.now();
  });
}

interface HitBox { x: number; y: number; w: number; h: number; }

function hitTest(mx: number, my: number, b: HitBox): boolean {
  return mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
}

function handleCardClick(mx: number, my: number, state: DungeonClientState, network: DungeonNetwork): boolean {
  for (const card of cardHits) {
    if (hitTest(mx, my, card)) {
      state.selectedPersona = card.slug;
      if (state.connected) network.sendReady(card.slug);
      return true;
    }
  }
  return false;
}

function handleCopyLinkClick(mx: number, my: number, state: DungeonClientState): boolean {
  if (!copyLinkHit || !state.lobbyId) return false;
  if (!hitTest(mx, my, copyLinkHit)) return false;
  copyInviteLink(state.lobbyId);
  return true;
}

function handleStartButtonClick(mx: number, my: number, state: DungeonClientState, network: DungeonNetwork): void {
  if (!startButtonHit || !state.isHost || !state.selectedPersona || !state.connected) return;
  if (!hitTest(mx, my, startButtonHit)) return;
  network.sendReady(state.selectedPersona);
  network.sendStart(state.skipGen);
}

function handleLobbyClick(e: MouseEvent, state: DungeonClientState, network: DungeonNetwork): void {
  const mx = e.clientX;
  const my = e.clientY;
  if (handleCardClick(mx, my, state, network)) return;
  if (handleCopyLinkClick(mx, my, state)) return;
  handleStartButtonClick(mx, my, state, network);
}

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
      const checkboxRef = skipGenCheckbox;
      checkboxRef.addEventListener('change', () => {
        state.skipGen = checkboxRef.checked;
      });

      skipGenLabel = document.createElement('label');
      skipGenLabel.htmlFor = 'skip-gen-checkbox';
      skipGenLabel.textContent = '⚡ Use cached mobs (skip generation)';
      skipGenLabel.style.cssText = 'color:#aaaacc;font:13px monospace;cursor:pointer;user-select:none;white-space:nowrap;';

      skipGenWrapper.appendChild(skipGenCheckbox);
      skipGenWrapper.appendChild(skipGenLabel);
      document.body.appendChild(skipGenWrapper);

      clickHandler = (e: MouseEvent) => {
        handleLobbyClick(e, state, network);
      };

      touchHandler = (e: TouchEvent) => {
        // Only handle single-finger taps; ignore multi-touch
        if (e.changedTouches.length !== 1) return;
        const t = e.changedTouches[0];
        const mx = t.clientX;
        const my = t.clientY;
        if (handleCardClick(mx, my, state, network)) { e.preventDefault(); return; }
        if (handleCopyLinkClick(mx, my, state)) { e.preventDefault(); return; }
        handleStartButtonClick(mx, my, state, network);
      };

      window.addEventListener('click', clickHandler);
      window.addEventListener('touchend', touchHandler, { passive: false });
    },

    update(_state: DungeonClientState, _dt: number): void {
      // Lobby state updates come from network
    },

    render(state: DungeonClientState, ctx: CanvasRenderingContext2D): void {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;

      // Background
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0d0d1a');
      grad.addColorStop(1, '#1a1a2e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CLUNGIVERSE', w / 2, 50);

      ctx.font = '16px monospace';
      ctx.fillStyle = '#bbbbbb';
      ctx.fillText('Select Your Persona', w / 2, 78);

      renderLobbyStatus(ctx, state, w);

      // Mob generation loading overlay (shown over everything while floor is initializing)
      if (state.mobGenProgress) {
        renderMobGenOverlay(ctx, state, w, h);
        return;
      }

      const { gridX, gridY, gridW: _gridW, gridH, CARD_W, CARD_H, CARD_GAP } = computeCardLayout(h, w);

      renderPersonaGrid(ctx, state, gridX, gridY, CARD_W, CARD_H, CARD_GAP);
      renderPartyRoster(ctx, state, w);
      renderStartOrWaitButton(ctx, state, w, gridY, gridH);
      renderCopyInviteButton(ctx, state, w, gridY, gridH);
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

