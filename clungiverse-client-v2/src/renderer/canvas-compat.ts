// Clungiverse v2 — Canvas 2D Compatibility Layer
// Provides a secondary Canvas 2D context for scenes that haven't been ported to PixiJS yet
// (lobby, transition, results, mob-preview).
//
// The canvas overlays on top of the PixiJS canvas when active, hidden otherwise.

let canvas2d: HTMLCanvasElement | null = null;
let ctx2d: CanvasRenderingContext2D | null = null;

export function initCanvas2dOverlay(): CanvasRenderingContext2D {
  canvas2d = document.createElement('canvas');
  canvas2d.id = 'canvas-2d-overlay';
  canvas2d.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10;pointer-events:auto;display:none;';
  document.body.appendChild(canvas2d);

  const context = canvas2d.getContext('2d');
  if (!context) throw new Error('Failed to get 2d context for overlay canvas');
  ctx2d = context;
  ctx2d.imageSmoothingEnabled = false;

  resize();
  window.addEventListener('resize', resize);

  return ctx2d;
}

function resize(): void {
  if (!canvas2d || !ctx2d) return;
  canvas2d.width = window.innerWidth;
  canvas2d.height = window.innerHeight;
  ctx2d.imageSmoothingEnabled = false;
}

export function showCanvas2d(): void {
  if (canvas2d) canvas2d.style.display = 'block';
}

export function hideCanvas2d(): void {
  if (canvas2d) canvas2d.style.display = 'none';
}

export function clearCanvas2d(): void {
  if (!ctx2d || !canvas2d) return;
  ctx2d.clearRect(0, 0, canvas2d.width, canvas2d.height);
  ctx2d.fillStyle = '#0a0a0a';
  ctx2d.fillRect(0, 0, canvas2d.width, canvas2d.height);
}

export function getCanvas2d(): HTMLCanvasElement | null {
  return canvas2d;
}

export function getCtx2d(): CanvasRenderingContext2D | null {
  return ctx2d;
}
