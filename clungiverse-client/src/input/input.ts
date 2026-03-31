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

const held: Set<string> = new Set();
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

export function pollInput(): InputSnapshot {
  let dx = 0;
  let dy = 0;

  if (held.has('w') || held.has('arrowup')) dy -= 1;
  if (held.has('s') || held.has('arrowdown')) dy += 1;
  if (held.has('a') || held.has('arrowleft')) dx -= 1;
  if (held.has('d') || held.has('arrowright')) dx += 1;

  // Normalize diagonals
  if (dx !== 0 && dy !== 0) {
    const inv = 1 / Math.sqrt(2);
    dx *= inv;
    dy *= inv;
  }

  // Update facing from movement; keep last facing if idle
  if (dx !== 0 || dy !== 0) {
    lastFacingX = dx;
    lastFacingY = dy;
  }

  const power = powerTriggered;
  if (powerTriggered) {
    powerTriggered = false;
    powerConsumed = true;
  }

  const spectateNext = spectateNextTriggered;
  if (spectateNextTriggered) {
    spectateNextTriggered = false;
    spectateNextConsumed = true;
  }

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
