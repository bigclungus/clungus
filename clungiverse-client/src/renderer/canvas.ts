// Clungiverse Canvas & Camera System

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
const camera: Camera = { x: 0, y: 0, zoom: 1 };

export function initCanvas(c: HTMLCanvasElement): CanvasRenderingContext2D {
  canvas = c;
  const context = c.getContext('2d');
  if (!context) throw new Error('Failed to get 2d context');
  ctx = context;
  ctx.imageSmoothingEnabled = false;
  resize();
  window.addEventListener('resize', resize);
  return ctx;
}

function resize(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // Re-apply after resize — canvas resize resets context state
  if (ctx) ctx.imageSmoothingEnabled = false;
}

export function getCanvas(): HTMLCanvasElement {
  return canvas;
}

export function getCtx(): CanvasRenderingContext2D {
  return ctx;
}

export function getCamera(): Camera {
  return camera;
}

export function getViewWidth(): number {
  return canvas.width;
}

export function getViewHeight(): number {
  return canvas.height;
}

// Center camera on a world position
export function centerCamera(worldX: number, worldY: number): void {
  camera.x = worldX - canvas.width / (2 * camera.zoom);
  camera.y = worldY - canvas.height / (2 * camera.zoom);
}

// World coords -> screen coords
export function worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
  return {
    sx: (wx - camera.x) * camera.zoom,
    sy: (wy - camera.y) * camera.zoom,
  };
}

// Screen coords -> world coords
export function screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
  return {
    wx: sx / camera.zoom + camera.x,
    wy: sy / camera.zoom + camera.y,
  };
}

// Check if a world-space rectangle is visible in the viewport
export function isVisible(wx: number, wy: number, w: number, h: number): boolean {
  const vw = canvas.width / camera.zoom;
  const vh = canvas.height / camera.zoom;
  return (
    wx + w > camera.x &&
    wx < camera.x + vw &&
    wy + h > camera.y &&
    wy < camera.y + vh
  );
}

// Clear the full canvas
export function clearCanvas(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Push camera transform onto the canvas context
export function pushCameraTransform(): void {
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
}

// Pop camera transform
export function popCameraTransform(): void {
  ctx.restore();
}
