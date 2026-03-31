// input.ts — Keyboard/mouse/touch → InputState
// Stateful but side-effect-free; state only changes on DOM events.

import { isModalOpen } from "./ui/chat-modal.ts";

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  hop: boolean; // set on keydown, cleared after consuming
}

const state: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  hop: false,
};

// Idle tracking — updated on any key/mouse/touch event
let lastInputAt: number = Date.now();

export function getLastInputAt(): number {
  return lastInputAt;
}

function touchInput(): void {
  lastInputAt = Date.now();
}

function keyToField(key: string): keyof InputState | null {
  switch (key) {
    case "ArrowLeft":  case "a": case "A": return "left";
    case "ArrowRight": case "d": case "D": return "right";
    case "ArrowUp":    case "w": case "W": return "up";
    case "ArrowDown":  case "s": case "S": return "down";
    case " ": return "hop";
    default: return null;
  }
}

function isTextInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function initInput(): void {
  window.addEventListener("keydown", (e) => {
    touchInput();
    const field = keyToField(e.key);
    if (!field) return;
    // Never steal keys from text inputs — let the browser handle them normally
    if (isTextInputFocused()) return;
    // Prevent page scroll for arrow/space only when game has control
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) {
      e.preventDefault();
    }
    // Suppress movement and hop while the chat modal is open — let the textarea capture input
    if (isModalOpen()) return;
    state[field] = true;
  });

  window.addEventListener("keyup", (e) => {
    touchInput();
    const field = keyToField(e.key);
    if (!field) return;
    // hop is consumed per-frame, don't clear on keyup — cleared in consumeHop()
    if (field !== "hop") state[field] = false;
  });

  // Mouse and touch also count as activity
  window.addEventListener("mousemove", touchInput, { passive: true });
  window.addEventListener("touchstart", touchInput, { passive: true });
}

// Called once per game loop frame to get the current input snapshot
export function getInput(): Readonly<InputState> {
  return state;
}

// Hop is a one-shot — consume clears it so it fires once per press
export function consumeHop(): boolean {
  if (state.hop) {
    state.hop = false;
    return true;
  }
  return false;
}
