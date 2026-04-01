// Clungiverse v2 — Particle Renderer (PixiJS)
// Circle particles and floating text. Matches v1 particle system behavior.

import { Container, Graphics, Text } from 'pixi.js';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;     // ms remaining
  maxLife: number;   // ms total
  color: number;
  size: number;
}

interface FloatingText {
  x: number;
  y: number;
  vx: number;        // horizontal drift px/s
  text: string;
  color: string;      // CSS hex for Text style
  colorHex: number;   // numeric for PixiJS
  life: number;       // ms remaining
  maxLife: number;     // ms total
  rotation: number;   // radians
  scale: number;      // base scale multiplier
  textObj: Text | null;
}

const MAX_PARTICLES = 500;
const MAX_TEXTS = 50;
const particles: Particle[] = [];
const texts: FloatingText[] = [];

// Text object pool to avoid GC churn
const textPool: Text[] = [];

function acquireText(content: string, color: string): Text {
  let t = textPool.pop();
  if (t) {
    t.text = content;
    (t.style as { fill: string }).fill = color;
    t.visible = true;
    return t;
  }
  t = new Text({
    text: content,
    style: {
      fontFamily: 'monospace',
      fontSize: 22,
      fontWeight: 'bold',
      fill: color,
      stroke: { color: 'rgba(0,0,0,0.85)', width: 4 },
    },
  });
  t.anchor.set(0.5, 0.5);
  return t;
}

function releaseText(t: Text): void {
  t.visible = false;
  textPool.push(t);
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class ParticleRenderer {
  container: Container;
  private gfx: Graphics;
  private textContainer: Container;

  constructor() {
    this.container = new Container();
    this.gfx = new Graphics();
    this.textContainer = new Container();
    this.container.addChild(this.gfx);
    this.container.addChild(this.textContainer);
  }

  update(dt: number): void {
    const dtMs = dt * 1000;

    // Update circle particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dtMs;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Friction
      p.vx *= 0.96;
      p.vy *= 0.96;
    }

    // Update floating texts
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life -= dtMs;
      if (t.life <= 0) {
        if (t.textObj) {
          this.textContainer.removeChild(t.textObj);
          releaseText(t.textObj);
          t.textObj = null;
        }
        texts.splice(i, 1);
        continue;
      }
      t.y -= 50 * dt;  // float upward
      t.x += t.vx * dt; // horizontal drift
    }

    // Enhancement 6: Ambient dust
    updateDust(dtMs);
  }

  render(): void {
    this.gfx.clear();

    // Enhancement 6: Render ambient dust
    renderDust(this.gfx);

    // Render circle particles
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      this.gfx.circle(p.x, p.y, p.size * alpha);
      this.gfx.fill({ color: p.color, alpha });
    }

    // Render floating texts
    for (const t of texts) {
      const progress = t.life / t.maxLife; // 1 -> 0
      const alpha = Math.max(0, progress);
      const wobble = 1.0 + 0.12 * Math.sin((1 - progress) * Math.PI * 6);
      const finalScale = t.scale * wobble;

      if (!t.textObj) {
        t.textObj = acquireText(t.text, t.color);
        this.textContainer.addChild(t.textObj);
      }
      t.textObj.position.set(t.x, t.y);
      t.textObj.rotation = t.rotation;
      t.textObj.scale.set(finalScale);
      t.textObj.alpha = alpha;
    }
  }

  clear(): void {
    this.gfx.clear();
    // Release all text objects
    for (const t of texts) {
      if (t.textObj) {
        this.textContainer.removeChild(t.textObj);
        releaseText(t.textObj);
        t.textObj = null;
      }
    }
  }
}

// === Spawn Functions ===

export function spawnHitSparks(x: number, y: number): void {
  const count = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randRange(40, 120);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 300,
      maxLife: 300,
      color: 0xffcc44,
      size: randRange(1.5, 3),
    });
  }
}

export function spawnDeathPoof(x: number, y: number): void {
  const count = 12 + Math.floor(Math.random() * 6);
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randRange(30, 100);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 500,
      maxLife: 500,
      color: 0xff6644,
      size: randRange(2, 5),
    });
  }
}

export function spawnPowerActivation(x: number, y: number): void {
  const count = 16;
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = randRange(60, 100);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 400,
      maxLife: 400,
      color: 0x88ccff,
      size: randRange(2, 4),
    });
  }
}

export function spawnDamageText(x: number, y: number, amount: number, crit: boolean): void {
  if (texts.length >= MAX_TEXTS) return;
  const drift = (Math.random() - 0.5) * 80;
  const rotation = (Math.random() - 0.5) * 0.52;
  texts.push({
    x,
    y: y - 5,
    vx: drift,
    text: crit ? `${String(amount)}!` : String(amount),
    color: crit ? '#ffee00' : '#ff2222',
    colorHex: crit ? 0xffee00 : 0xff2222,
    life: 1200,
    maxLife: 1200,
    rotation,
    scale: crit ? 1.4 : 1.0,
    textObj: null,
  });
}

export function spawnHealText(x: number, y: number, amount: number): void {
  if (texts.length >= MAX_TEXTS) return;
  const drift = (Math.random() - 0.5) * 60;
  const rotation = (Math.random() - 0.5) * 0.45;
  texts.push({
    x,
    y: y - 8,
    vx: drift,
    text: `+${String(amount)} HP`,
    color: '#00ff66',
    colorHex: 0x00ff66,
    life: 1600,
    maxLife: 1600,
    rotation,
    scale: 1.0,
    textObj: null,
  });
}

// === Enhancement 6: Ambient Dust Particles ===

interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  alpha: number;
}

const DUST_TARGET_COUNT = 40;
const DUST_SPAWN_INTERVAL = 100; // ms
const dustParticles: DustParticle[] = [];
let lastDustSpawn = 0;

// Track a viewport center so dust spawns near the camera
let dustViewX = 0;
let dustViewY = 0;
let dustViewW = 800;
let dustViewH = 600;

export function setDustViewport(cx: number, cy: number, w: number, h: number): void {
  dustViewX = cx;
  dustViewY = cy;
  dustViewW = w;
  dustViewH = h;
}

function updateDust(dtMs: number): void {
  const now = performance.now();

  // Update existing dust
  for (let i = dustParticles.length - 1; i >= 0; i--) {
    const d = dustParticles[i];
    d.life -= dtMs;
    if (d.life <= 0) {
      dustParticles.splice(i, 1);
      continue;
    }
    d.x += d.vx * (dtMs / 1000);
    d.y += d.vy * (dtMs / 1000);
  }

  // Spawn new dust if below target count
  if (dustParticles.length < DUST_TARGET_COUNT && now - lastDustSpawn > DUST_SPAWN_INTERVAL) {
    lastDustSpawn = now;
    const halfW = dustViewW / 2;
    const halfH = dustViewH / 2;
    dustParticles.push({
      x: dustViewX + (Math.random() - 0.5) * halfW * 1.5,
      y: dustViewY + (Math.random() - 0.5) * halfH * 1.5,
      vx: (Math.random() - 0.5) * 6,
      vy: -(5 + Math.random() * 10),
      life: 3000 + Math.random() * 2000,
      maxLife: 5000,
      size: 1 + Math.random(),
      alpha: 0.15 + Math.random() * 0.15,
    });
  }
}

function renderDust(gfx: Graphics): void {
  for (const d of dustParticles) {
    const fade = Math.min(1, d.life / (d.maxLife * 0.3));
    const a = d.alpha * fade;
    gfx.circle(d.x, d.y, d.size);
    gfx.fill({ color: 0x998877, alpha: a });
  }
}

// === Enhancement 7: Footstep Dust Puffs ===

let lastFootstepX = 0;
let lastFootstepY = 0;
let lastFootstepSpawn = 0;
let footstepInitialized = false;

export function updateFootstepDust(playerX: number, playerY: number): void {
  if (!footstepInitialized) {
    lastFootstepX = playerX;
    lastFootstepY = playerY;
    footstepInitialized = true;
    return;
  }

  const dx = playerX - lastFootstepX;
  const dy = playerY - lastFootstepY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 2) {
    const now = performance.now();
    if (now - lastFootstepSpawn > 60) {
      lastFootstepSpawn = now;
      const count = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
        particles.push({
          x: playerX + (Math.random() - 0.5) * 10,
          y: playerY + 6 + Math.random() * 3,
          vx: (Math.random() - 0.5) * 30,
          vy: -(8 + Math.random() * 15),
          life: 350 + Math.random() * 150,
          maxLife: 500,
          color: 0xb8a874,
          size: 2 + Math.random() * 1.5,
        });
      }
    }
  }

  lastFootstepX = playerX;
  lastFootstepY = playerY;
}

export function resetFootstepTracking(): void {
  footstepInitialized = false;
}

export function clearAllParticles(): void {
  particles.length = 0;
  dustParticles.length = 0;
  // Release text objects back to pool
  for (const t of texts) {
    if (t.textObj) {
      releaseText(t.textObj);
      t.textObj = null;
    }
  }
  texts.length = 0;
  resetFootstepTracking();
}
