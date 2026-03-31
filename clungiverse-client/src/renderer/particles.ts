// Clungiverse Particle System
// Hit sparks, death poofs, power activation rings, heal text

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FloatingText {
  x: number;
  y: number;
  vx: number;      // horizontal drift px/s
  text: string;
  color: string;
  life: number;
  maxLife: number;
  rotation: number; // radians
  scale: number;    // base scale multiplier
}

const particles: Particle[] = [];
const texts: FloatingText[] = [];

// Max particles to prevent runaway allocation
const MAX_PARTICLES = 500;
const MAX_TEXTS = 50;

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
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
      color: '#ffcc44',
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
      color: '#ff6644',
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
      color: '#88ccff',
      size: randRange(2, 4),
    });
  }
}

export function spawnHealText(x: number, y: number, amount: number): void {
  if (texts.length >= MAX_TEXTS) return;
  const drift = (Math.random() - 0.5) * 60; // ±30 px/s horizontal
  const rotation = (Math.random() - 0.5) * 0.45; // ±~13°
  texts.push({
    x,
    y: y - 8,
    vx: drift,
    text: `+${String(amount)} HP`,
    color: '#00ff66',
    life: 1600,
    maxLife: 1600,
    rotation,
    scale: 1.0,
  });
}

export function spawnDamageText(x: number, y: number, amount: number, crit: boolean): void {
  if (texts.length >= MAX_TEXTS) return;
  const drift = (Math.random() - 0.5) * 80; // ±40 px/s horizontal
  const rotation = (Math.random() - 0.5) * 0.52; // ±~15°
  texts.push({
    x,
    y: y - 5,
    vx: drift,
    text: crit ? `${String(amount)}!` : String(amount),
    color: crit ? '#ffee00' : '#ff2222',
    life: 1200,
    maxLife: 1200,
    rotation,
    scale: crit ? 1.4 : 1.0,
  });
}

// === Update ===

export function updateParticles(dt: number): void {
  const dtMs = dt * 1000;

  // Update particles
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
      texts.splice(i, 1);
      continue;
    }
    t.y -= 50 * dt; // float upward faster
    t.x += t.vx * dt; // horizontal drift
  }
}

// === Render ===

export function renderParticles(ctx: CanvasRenderingContext2D): void {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const t of texts) {
    const progress = t.life / t.maxLife; // 1→0
    const alpha = Math.max(0, progress);
    // Wobble scale: pulse early in life, fade toward end
    const wobble = 1.0 + 0.12 * Math.sin((1 - progress) * Math.PI * 6);
    const finalScale = t.scale * wobble;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(t.x, t.y);
    ctx.rotate(t.rotation);
    ctx.scale(finalScale, finalScale);
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineJoin = 'round';
    ctx.strokeText(t.text, 0, 0);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export function clearAllParticles(): void {
  particles.length = 0;
  texts.length = 0;
}
