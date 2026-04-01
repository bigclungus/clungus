// Clungiverse v2 — PixiJS Application Setup

import { Application, Container } from 'pixi.js';

export let app: Application;
export let worldContainer: Container;  // camera-affected
export let hudContainer: Container;    // screen-space, not camera-affected

export async function initPixiApp(canvas: HTMLCanvasElement): Promise<void> {
  app = new Application();
  await app.init({
    canvas,
    resizeTo: window,
    background: 0x0a0a0a,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  worldContainer = new Container();
  hudContainer = new Container();
  app.stage.addChild(worldContainer);
  app.stage.addChild(hudContainer);
}

export function getScreenWidth(): number {
  return app.screen.width;
}

export function getScreenHeight(): number {
  return app.screen.height;
}
