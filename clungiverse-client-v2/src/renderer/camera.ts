// Clungiverse v2 — Camera System (PixiJS container transforms)

import { worldContainer } from './pixi-app';

interface Camera {
  x: number;
  y: number;
  zoom: number;
  shakeIntensity: number;
  shakeDuration: number;
  shakeStart: number;
}

export const camera: Camera = {
  x: 0,
  y: 0,
  zoom: 1,
  shakeIntensity: 0,
  shakeDuration: 0,
  shakeStart: 0,
};

export function centerCamera(worldX: number, worldY: number): void {
  camera.x = worldX;
  camera.y = worldY;
}

export function applyCamera(screenW: number, screenH: number): void {
  let offsetX = 0;
  let offsetY = 0;

  if (camera.shakeDuration > 0) {
    const elapsed = performance.now() - camera.shakeStart;
    if (elapsed < camera.shakeDuration) {
      const decay = 1 - elapsed / camera.shakeDuration;
      offsetX = (Math.random() - 0.5) * camera.shakeIntensity * decay * 2;
      offsetY = (Math.random() - 0.5) * camera.shakeIntensity * decay * 2;
    } else {
      camera.shakeDuration = 0;
    }
  }

  worldContainer.scale.set(camera.zoom);
  worldContainer.position.set(
    screenW / 2 - (camera.x + offsetX) * camera.zoom,
    screenH / 2 - (camera.y + offsetY) * camera.zoom,
  );
}

export function startShake(intensity: number, duration: number): void {
  camera.shakeIntensity = intensity;
  camera.shakeDuration = duration;
  camera.shakeStart = performance.now();
}

export function worldToScreen(wx: number, wy: number): { x: number; y: number } {
  const p = worldContainer.toGlobal({ x: wx, y: wy });
  return { x: p.x, y: p.y };
}

export function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  return worldContainer.toLocal({ x: sx, y: sy });
}

export function isVisible(
  wx: number,
  wy: number,
  margin: number,
  screenW: number,
  screenH: number,
): boolean {
  const s = worldToScreen(wx, wy);
  return s.x > -margin && s.x < screenW + margin && s.y > -margin && s.y < screenH + margin;
}
