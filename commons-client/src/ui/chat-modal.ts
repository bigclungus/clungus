// ui/chat-modal.ts — NPC click-to-chat modal
// Click an NPC on the canvas to open a chat prompt. Sends to /api/invoke-persona.

import { WorldState, NPC } from "../state.ts";
import { getSpriteId, getWinner, getSpriteFn, NPC_DISPLAY_NAMES } from "../sprites.ts";

const NPC_HIT_RADIUS = 14; // px — half-width of NPC hitbox for click detection

// Modal DOM elements (created lazily on first initChatModal() call)
let overlay: HTMLDivElement | null = null;
let titleEl: HTMLSpanElement | null = null;
let portraitCanvas: HTMLCanvasElement | null = null;
let inputEl: HTMLTextAreaElement | null = null;
let submitBtnEl: HTMLButtonElement | null = null;
let bubbleEl: HTMLDivElement | null = null;
let activeNPC: NPC | null = null;
let currentAbortController: AbortController | null = null;

// Flag checked by input.ts to suppress WASD/space while modal is open
let _modalOpen = false;
export function isModalOpen(): boolean {
  return _modalOpen;
}

// slug → { displayName, role } lookup map built from agent frontmatter
const NPC_META: Record<string, { displayName: string; role: string }> = {
  chairman:    { displayName: "Ibrahim the Immovable",         role: "Chairman" },
  critic:      { displayName: "Pippi the Pitiless",            role: "Code and Work Reviewer" },
  architect:   { displayName: "Kwame the Constructor",         role: "Systems Designer and Long-Term Thinker" },
  ux:          { displayName: "Yuki the Yielding",             role: "User Experience Advocate" },
  designer:    { displayName: "Vesper the Vivid",              role: "Visual Craft and Aesthetic Systems" },
  galactus:    { displayName: "Galactus",                      role: "PLANET EATER" },
  hume:        { displayName: "David Hume",                    role: "Empiricist" },
  otto:        { displayName: "Otto Atreides",                 role: "Optimist-Nihilist and Limit-Pusher" },
  pm:          { displayName: "Chud O'Bikeshedder",            role: "Operational Outcomes Wrangler" },
  spengler:    { displayName: "Spengler the Doomed",           role: "Faustian Pragmatist and Civilizational Decline Analyst" },
  trump:       { displayName: "Punished Trump",                role: "Deal-Closer" },
  "uncle-bob": { displayName: "Uncle Bob",                     role: "Clean Code Evangelist and Software Craftsman" },
  bloodfeast:  { displayName: "Holden Bloodfeast",             role: "Geriatric Hawk" },
  adelbert:    { displayName: "Adelbert Hominem",              role: "Ad Hominem Specialist" },
  jhaddu:      { displayName: "Jhaddu",                        role: "Senior Enterprise Architect and Design Pattern Authority" },
  morgan:      { displayName: "Morgan (they/them)",            role: "Community Standards and Harm Reduction" },
  "the-kid":   { displayName: "The Kid",                       role: "Goes Fast" },
};

function drawPortrait(npc: NPC): void {
  if (!portraitCanvas) return;
  const pw = portraitCanvas.width;   // 96
  const ph = portraitCanvas.height;  // 192
  const pctx = portraitCanvas.getContext("2d");
  if (!pctx) return;
  pctx.clearRect(0, 0, pw, ph);

  const spriteId = getSpriteId(npc.name);
  const winner = spriteId ? getWinner(npc.name) : null;
  const spriteFn = winner && spriteId ? getSpriteFn(spriteId, winner) : null;

  const scale = 4;
  const cx = Math.round(pw / 2);
  const cy_feet = Math.round(ph * 0.78);

  if (typeof spriteFn === "function") {
    pctx.save();
    pctx.scale(scale, scale);
    spriteFn(pctx, cx / scale, cy_feet / scale);
    pctx.restore();
  } else {
    // Fallback: colored box at 4x
    const hash = npc.name.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
    const hue = Math.abs(hash) % 360;
    pctx.fillStyle = `hsl(${String(hue)},60%,45%)`;
    const bw = 16 * scale;
    const bh = 16 * scale;
    pctx.fillRect(cx - bw / 2, cy_feet - bh, bw, bh);
  }
}

function createModal(): void {
  overlay = document.createElement("div");
  overlay.id = "cv2-chat-overlay";
  overlay.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.72);
    z-index: 1000;
    align-items: center;
    justify-content: center;
  `;

  // Outer row: portrait left + dialog right
  const row = document.createElement("div");
  row.style.cssText = `
    display: flex;
    align-items: flex-start;
    gap: 16px;
    max-width: 90vw;
  `;

  // Portrait column
  const portraitCol = document.createElement("div");
  portraitCol.style.cssText = `
    display: flex;
    align-items: center;
    flex-shrink: 0;
  `;

  portraitCanvas = document.createElement("canvas");
  portraitCanvas.width = 96;
  portraitCanvas.height = 192;
  portraitCanvas.style.cssText = `
    image-rendering: pixelated;
    display: block;
  `;
  portraitCol.appendChild(portraitCanvas);

  // Dialog box
  const box = document.createElement("div");
  box.style.cssText = `
    background: #0a0f1a;
    border: 2px solid #00ffaa;
    border-radius: 8px;
    padding: 18px 20px 16px;
    width: 420px;
    max-width: calc(90vw - 112px);
    font-family: 'JetBrains Mono', monospace;
    color: #e0e0ff;
    box-shadow: 0 0 24px #00ffaa22;
  `;

  const header = document.createElement("div");
  header.style.cssText = `
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 10px;
    letter-spacing: 0.05em;
  `;
  header.textContent = "speak to ";
  titleEl = document.createElement("span");
  titleEl.style.cssText = "color: #00ffaa;";
  header.appendChild(titleEl);

  inputEl = document.createElement("textarea");
  inputEl.rows = 3;
  inputEl.placeholder = "ask something...";
  inputEl.style.cssText = `
    width: 100%;
    box-sizing: border-box;
    background: #111827;
    border: none;
    border-bottom: 1px solid #2a2a40;
    border-radius: 0;
    color: #e0e0ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    padding: 7px 9px;
    resize: none;
    margin-bottom: 6px;
    outline: none;
  `;
  inputEl.addEventListener("focus", () => {
    if (inputEl) inputEl.style.borderBottomColor = "#00ffaa";
  });
  inputEl.addEventListener("blur", () => {
    if (inputEl) inputEl.style.borderBottomColor = "#2a2a40";
  });

  const hint = document.createElement("div");
  hint.style.cssText = "font-size: 10px; color: #4a5568; margin-bottom: 10px;";
  hint.textContent = "Enter to send · Shift+Enter for newline · Esc to cancel";

  bubbleEl = document.createElement("div");
  bubbleEl.style.cssText = `
    display: none;
    background: #111827;
    border: 1px solid #1a3a2a;
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 12px;
    color: #a0f0c8;
    min-height: 40px;
    margin-top: 8px;
    white-space: pre-wrap;
    font-family: 'JetBrains Mono', monospace;
  `;

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display: flex; gap: 8px; margin-top: 10px; align-items: center;";

  submitBtnEl = document.createElement("button");
  submitBtnEl.textContent = "send";
  submitBtnEl.style.cssText = `
    background: #00ffaa18;
    border: 1px solid #00ffaa;
    color: #00ffaa;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    padding: 5px 16px;
    cursor: pointer;
    border-radius: 3px;
    letter-spacing: 0.05em;
  `;
  submitBtnEl.addEventListener("click", submitChat);

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "cancel";
  cancelBtn.style.cssText = `
    background: none;
    border: none;
    color: #4a5568;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    padding: 5px 8px;
    cursor: pointer;
    border-radius: 3px;
  `;
  cancelBtn.addEventListener("click", closeModal);

  btnRow.appendChild(submitBtnEl);
  btnRow.appendChild(cancelBtn);

  box.appendChild(header);
  box.appendChild(inputEl);
  box.appendChild(hint);
  box.appendChild(bubbleEl);
  box.appendChild(btnRow);

  row.appendChild(portraitCol);
  row.appendChild(box);
  overlay.appendChild(row);
  document.body.appendChild(overlay);

  // Close on overlay backdrop click
  overlay.addEventListener("click", (e: MouseEvent) => {
    if (e.target === overlay) closeModal();
  });

  // Send on Enter (not Shift+Enter), cancel on Escape
  inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitChat();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
    }
  });
}

function openModal(npc: NPC): void {
  if (!overlay || !titleEl || !inputEl || !bubbleEl) return;
  activeNPC = npc;

  if (npc.name in NPC_META) {
    const meta = NPC_META[npc.name];
    titleEl.textContent = `${meta.displayName}, ${meta.role} (${npc.name})`;
  } else {
    titleEl.textContent = NPC_DISPLAY_NAMES[npc.name] ?? npc.name;
  }

  // Draw portrait after a short delay to allow sprite scripts to be present
  setTimeout(() => { drawPortrait(npc); }, 10);

  inputEl.value = "";
  bubbleEl.style.display = "none";
  bubbleEl.textContent = "";
  overlay.style.display = "flex";
  _modalOpen = true;
  setTimeout(() => inputEl?.focus(), 50);
}

function closeModal(): void {
  if (!overlay) return;
  overlay.style.display = "none";
  _modalOpen = false;
  activeNPC = null;
  // Abort any in-flight LLM request when modal closes
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

function submitChat(): void {
  if (!inputEl || !bubbleEl || !activeNPC) return;
  const text = inputEl.value.trim();
  if (!text) return;

  // Cancel any previous in-flight request before starting a new one
  if (currentAbortController) currentAbortController.abort();
  currentAbortController = new AbortController();

  const npc = activeNPC;
  const abortController = currentAbortController;

  // Keep modal open, show loading state
  inputEl.disabled = true;
  submitBtnEl.disabled = true;
  bubbleEl.style.display = "block";
  bubbleEl.style.color = "#a0f0c8";
  bubbleEl.textContent = "...";

  fetch("/api/invoke-persona", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: npc.name, prompt: text }),
    signal: AbortSignal.any([abortController.signal, AbortSignal.timeout(90_000)]),
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${String(r.status)}`);
      return r.json();
    })
    .then((data: { response?: string; error?: string }) => {
      if (!bubbleEl || !inputEl || !submitBtnEl) return;
      const raw = (data.response ?? data.error ?? "no response").trim();
      bubbleEl.textContent = raw;
      inputEl.disabled = false;
      submitBtnEl.disabled = false;
      currentAbortController = null;
      setTimeout(() => inputEl?.focus(), 50);
    })
    .catch((err: unknown) => {
      if (err instanceof Error && err.name === "AbortError") return; // modal closed or new request started — ignore silently
      if (!bubbleEl || !inputEl || !submitBtnEl) return;
      bubbleEl.textContent = `(error: ${(err instanceof Error ? err.message : String(err)).slice(0, 60)})`;
      bubbleEl.style.color = "#f87171";
      inputEl.disabled = false;
      submitBtnEl.disabled = false;
      currentAbortController = null;
    });
}

export function initChatModal(): void {
  createModal();

  // Global Escape key to close modal
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && overlay?.style.display === "flex") {
      e.stopPropagation();
      closeModal();
    }
  });
}

export function checkNPCClick(state: WorldState, mx: number, my: number): void {
  if (!overlay) return;
  // Don't open if modal already open
  if (overlay.style.display === "flex") return;

  for (const npc of state.npcs.values()) {
    const dx = mx - npc.displayX;
    const dy = my - (npc.displayY - 8);
    if (Math.abs(dx) < NPC_HIT_RADIUS && Math.abs(dy) < NPC_HIT_RADIUS + 4) {
      openModal(npc);
      return;
    }
  }
}
