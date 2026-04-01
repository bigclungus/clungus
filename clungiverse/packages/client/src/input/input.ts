// Clungiverse Input Handler
// WASD movement, spacebar power, mouse tracking

export interface InputSnapshot {
  dx: number;
  dy: number;
  facingX: number;
  facingY: number;
  power: boolean;
  mouseX: number;
  mouseY: number;
  spectateNext: boolean; // Tab to cycle spectate target
}

const held = new Set<string>();
let mouseX = 0;
let mouseY = 0;
let powerTriggered = false;
let powerConsumed = false;
let lastFacingX = 0;
let lastFacingY = 1;
let spectateNextTriggered = false;
let spectateNextConsumed = false;

export function initInput(canvas: HTMLCanvasElement): void {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    held.add(key);
    if (e.key === ' ') {
      e.preventDefault();
      if (!powerConsumed) {
        powerTriggered = true;
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!spectateNextConsumed) {
        spectateNextTriggered = true;
      }
    }
  });

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    held.delete(e.key.toLowerCase());
    if (e.key === ' ') {
      powerConsumed = false;
    }
    if (e.key === 'Tab') {
      spectateNextConsumed = false;
    }
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
}

const UP_KEYS = ['w', 'arrowup'] as const;
const DOWN_KEYS = ['s', 'arrowdown'] as const;
const LEFT_KEYS = ['a', 'arrowleft'] as const;
const RIGHT_KEYS = ['d', 'arrowright'] as const;

function anyHeld(keys: readonly string[]): boolean {
  return keys.some((k) => held.has(k));
}

function normalizeDiagonal(dx: number, dy: number): { dx: number; dy: number } {
  if (dx !== 0 && dy !== 0) {
    const inv = 1 / Math.sqrt(2);
    return { dx: dx * inv, dy: dy * inv };
  }
  return { dx, dy };
}

function computeMovement(): { dx: number; dy: number } {
  let dx = 0, dy = 0;
  if (anyHeld(UP_KEYS)) dy -= 1;
  if (anyHeld(DOWN_KEYS)) dy += 1;
  if (anyHeld(LEFT_KEYS)) dx -= 1;
  if (anyHeld(RIGHT_KEYS)) dx += 1;
  return normalizeDiagonal(dx, dy);
}

function consumeOneShot(triggered: boolean, consumed: boolean): [boolean, boolean, boolean] {
  const fired = triggered;
  if (triggered) return [fired, false, true];
  return [fired, triggered, consumed];
}

export function pollInput(): InputSnapshot {
  const { dx, dy } = computeMovement();

  if (dx !== 0 || dy !== 0) {
    lastFacingX = dx;
    lastFacingY = dy;
  }

  const [power, newPowerTriggered, newPowerConsumed] = consumeOneShot(powerTriggered, powerConsumed);
  powerTriggered = newPowerTriggered;
  powerConsumed = newPowerConsumed;

  const [spectateNext, newSpectateTriggered, newSpectateConsumed] = consumeOneShot(spectateNextTriggered, spectateNextConsumed);
  spectateNextTriggered = newSpectateTriggered;
  spectateNextConsumed = newSpectateConsumed;

  return {
    dx,
    dy,
    facingX: lastFacingX,
    facingY: lastFacingY,
    power,
    mouseX,
    mouseY,
    spectateNext,
  };
}

export function isKeyDown(key: string): boolean {
  return held.has(key.toLowerCase());
}

// Synthetic key press/release — used by the virtual d-pad overlay
export function pressKey(key: string): void {
  held.add(key.toLowerCase());
}

export function releaseKey(key: string): void {
  held.delete(key.toLowerCase());
}
