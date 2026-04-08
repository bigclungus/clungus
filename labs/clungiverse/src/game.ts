/**
 * game.ts — Clungiverse canvas game
 * A simple 2D canvas game with player movement and attacks.
 */

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

canvas.width = 800;
canvas.height = 600;

interface Player {
  x: number;
  y: number;
  radius: number;
  speed: number;
  spinAttack: {
    active: boolean;
    angle: number;
    duration: number;
    elapsed: number;
  };
}

const player: Player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 20,
  speed: 3,
  spinAttack: {
    active: false,
    angle: 0,
    duration: 120, // frames
    elapsed: 0,
  },
};

const keys: Record<string, boolean> = {};

document.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  if (e.key === " " && !player.spinAttack.active) {
    player.spinAttack.active = true;
    player.spinAttack.elapsed = 0;
    player.spinAttack.angle = 0;
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

function drawPlayer() {
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.fillStyle = "#4a9eff";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawSwordSpinAttack() {
  if (!player.spinAttack.active) return;

  const angle = player.spinAttack.angle;
  const orbitRadius = player.radius + 30;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(angle);
  ctx.translate(orbitRadius, 0);

  // Draw sword blade (elongated triangle)
  ctx.beginPath();
  ctx.moveTo(0, 0); // tip of the blade
  ctx.lineTo(-40, 5); // bottom left of blade
  ctx.lineTo(-40, -5); // bottom right of blade
  ctx.closePath();
  ctx.fillStyle = "#c0c0c0"; // silver color for blade
  ctx.fill();

  // Draw crossguard (horizontal rectangle)
  ctx.beginPath();
  ctx.rect(-45, -10, 5, 20);
  ctx.fillStyle = "#8b4513"; // brown color for crossguard
  ctx.fill();

  // Draw handle (vertical rectangle)
  ctx.beginPath();
  ctx.rect(-50, -5, 5, 10);
  ctx.fillStyle = "#8b4513"; // brown color for handle
  ctx.fill();

  ctx.restore();
}

function updateSpinAttack() {
  if (!player.spinAttack.active) return;

  player.spinAttack.elapsed++;
  player.spinAttack.angle += 0.15; // radians per frame

  if (player.spinAttack.elapsed >= player.spinAttack.duration) {
    player.spinAttack.active = false;
    player.spinAttack.elapsed = 0;
    player.spinAttack.angle = 0;
  }
}

function update() {
  if (keys["ArrowLeft"] || keys["a"]) player.x -= player.speed;
  if (keys["ArrowRight"] || keys["d"]) player.x += player.speed;
  if (keys["ArrowUp"] || keys["w"]) player.y -= player.speed;
  if (keys["ArrowDown"] || keys["s"]) player.y += player.speed;

  player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
  player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

  updateSpinAttack();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawPlayer();
  drawSwordSpinAttack();

  // HUD
  ctx.fillStyle = "#fff";
  ctx.font = "14px monospace";
  ctx.fillText("WASD: move | SPACE: spin attack", 10, 20);
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
