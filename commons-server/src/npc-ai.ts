// NPC AI module — tile-aware movement, persona-specific patterns

import type { NPCState, ChunkData } from "./protocol.ts";
import { CHUNK_TILES_W, CHUNK_TILES_H, TILE_SIZE } from "./map.ts";
// CHUNK_TILES_W=50 (cols), CHUNK_TILES_H=35 (rows), TILE_SIZE=20px — must match client

// ─── Persona configs ─────────────────────────────────────────────────────────

export const NPC_PATTERNS: Record<string, { speed: number; behavior: string }> = {
  chairman:    { speed: 1.2, behavior: "wander" },
  critic:      { speed: 1.0, behavior: "pacing" },
  architect:   { speed: 0.8, behavior: "stationary" },
  ux:          { speed: 1.1, behavior: "wander" },
  designer:    { speed: 1.0, behavior: "circular" },
  galactus:    { speed: 1.5, behavior: "aggressive" },
  hume:        { speed: 0.9, behavior: "pacing" },
  otto:        { speed: 1.0, behavior: "wander" },
  pm:          { speed: 1.3, behavior: "directed" },
  spengler:    { speed: 0.7, behavior: "stationary" },
  trump:       { speed: 1.4, behavior: "aggressive" },
  "uncle-bob": { speed: 0.8, behavior: "pacing" },
  bloodfeast:  { speed: 1.6, behavior: "aggressive" },
  adelbert:    { speed: 0.9, behavior: "wander" },
  jhaddu:      { speed: 1.0, behavior: "circular" },
  morgan:      { speed: 1.1, behavior: "directed" },
  "the-kid":   { speed: 1.3, behavior: "wander" },
  chaz:            { speed: 1.1, behavior: "wander" },
  "the-correspondent": { speed: 0.9, behavior: "pacing" },
};

// Congress gathering target — congress building doorway is at client col 5, row 6 (path tile below building)
// Pixel coords: col 5 * TILE_SIZE + half tile, row 6 * TILE_SIZE + half tile
const COUNCIL_TARGET = { x: 5 * TILE_SIZE + TILE_SIZE / 2, y: 7 * TILE_SIZE + TILE_SIZE / 2 };

// Initial NPC positions spread around chunk (0,0).
// Canvas is 1000×700 (TILE=20, COLS=50, ROWS=35).
// NPCs spawn in the open grass area away from the pond (rows 22-27, cols 4-10)
// and the congress building (rows 2-6, cols 2-8) and fountain (rows 13-15, cols 19-21).
const NPC_SPAWN_POSITIONS: Record<string, { x: number; y: number }> = {
  chairman:    { x: 480, y: 360 },  // near path intersection
  critic:      { x: 300, y: 400 },
  architect:   { x: 260, y: 220 },
  ux:          { x: 560, y: 240 },
  designer:    { x: 620, y: 340 },
  galactus:    { x: 360, y: 480 },
  hume:        { x: 420, y: 520 },
  otto:        { x: 680, y: 300 },
  pm:          { x: 540, y: 460 },
  spengler:    { x: 160, y: 340 },
  trump:       { x: 720, y: 200 },
  "uncle-bob": { x: 340, y: 280 },
  bloodfeast:  { x: 760, y: 460 },
  adelbert:    { x: 600, y: 500 },
  jhaddu:      { x: 460, y: 560 },
  morgan:      { x: 280, y: 550 },
  "the-kid":   { x: 640, y: 420 },
  chaz:            { x: 400, y: 320 },
  "the-correspondent": { x: 500, y: 480 },
};

// Per-NPC pacing state (for deterministic patterns)
const pacingState = new Map<string, { ticksOnCurrent: number; maxTicks: number }>();
const circularState = new Map<string, { angle: number }>();
const directedState = new Map<string, { targetX: number; targetY: number; stuckTicks: number }>();

export function initNpcs(): Map<string, NPCState> {
  const npcs = new Map<string, NPCState>();
  for (const [name, pattern] of Object.entries(NPC_PATTERNS)) {
    const spawn = NPC_SPAWN_POSITIONS[name] ?? { x: 400, y: 300 };
    npcs.set(name, {
      name,
      x: spawn.x,
      y: spawn.y,
      facing: "right",
      vx: 0,
      vy: 0,
      pattern: pattern.behavior,
    });
    pacingState.set(name, { ticksOnCurrent: 0, maxTicks: 20 + Math.floor(Math.random() * 40) });
    circularState.set(name, { angle: Math.random() * Math.PI * 2 });
    directedState.set(name, {
      targetX: 200 + Math.random() * 600,
      targetY: 150 + Math.random() * 400,
      stuckTicks: 0,
    });
  }
  initBlurbState(Array.from(npcs.keys()));
  return npcs;
}

// ─── Walkability helpers ─────────────────────────────────────────────────────

function isWalkablePixel(px: number, py: number, walkable: boolean[][]): boolean {
  const tx = Math.floor(px / TILE_SIZE);
  const ty = Math.floor(py / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= walkable.length || ty >= (walkable[0]?.length ?? 0)) return false;
  return walkable[tx][ty];
}

/**
 * Greedy pathfind — step toward target, try perpendicular if blocked.
 * Returns delta {dx, dy} to apply, or {0,0} if fully stuck.
 */
function greedyStep(
  x: number,
  y: number,
  tx: number,
  ty: number,
  speed: number,
  walkable: boolean[][]
): { dx: number; dy: number } {
  const ddx = tx - x;
  const ddy = ty - y;
  const dist = Math.sqrt(ddx * ddx + ddy * ddy);
  if (dist < speed) return { dx: 0, dy: 0 };

  const nx = (ddx / dist) * speed;
  const ny = (ddy / dist) * speed;

  // Try direct
  if (isWalkablePixel(x + nx, y + ny, walkable)) {
    return { dx: nx, dy: ny };
  }
  // Try horizontal only
  if (isWalkablePixel(x + nx, y, walkable)) {
    return { dx: nx, dy: 0 };
  }
  // Try vertical only
  if (isWalkablePixel(x, y + ny, walkable)) {
    return { dx: 0, dy: ny };
  }
  // Stuck
  return { dx: 0, dy: 0 };
}

/**
 * Pick a random direction that is walkable from current position.
 * Tries up to 8 directions before giving up.
 */
function pickWalkableDirection(
  npc: NPCState,
  speed: number,
  walkable: boolean[][]
): void {
  const angles = Array.from({ length: 8 }, (_, i) => (i * Math.PI * 2) / 8);
  // Shuffle angles for variety
  for (let i = angles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [angles[i], angles[j]] = [angles[j], angles[i]];
  }

  for (const angle of angles) {
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;
    if (isWalkablePixel(npc.x + dx, npc.y + dy, walkable)) {
      npc.vx = dx;
      npc.vy = dy;
      return;
    }
  }
  npc.vx = 0;
  npc.vy = 0;
}

// ─── Season helpers ──────────────────────────────────────────────────────────

export function getCurrentSeason(): "spring" | "summer" | "autumn" | "winter" {
  const week = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  const seasons: ("spring" | "summer" | "autumn" | "winter")[] = ["spring", "summer", "autumn", "winter"];
  return seasons[week % 4];
}

// ─── Persona quips ────────────────────────────────────────────────────────────

const NPC_QUIPS: Record<string, string[]> = {
  chairman:    ["Order.", "The gavel is patient.", "...", "Retained.", "The record stands.", "Deliberate."],
  critic:      ["That's wrong.", "Prove it works.", "No.", "Show your data.", "Unacceptable.", "Rejected."],
  architect:   ["Consider the load.", "What scales here?", "Draw the diagram.", "Single source.", "Decouple this.", "The foundation matters."],
  ux:          ["Is this usable?", "Who's the user?", "Friction is failure.", "Test with humans.", "Accessibility first.", "Can my gran do it?"],
  galactus:    ["I HUNGER.", "YOUR SYSTEMS WILL FEED ME.", "INCONSEQUENTIAL.", "I HAVE SEEN BILLIONS OF STACKS.", "MORTAL CODE.", "FEED ME YOUR DATA."],
  designer:    ["Aesthetically, no.", "More contrast.", "Wrong font.", "The kerning is off.", "Iterate the palette.", "Beauty is function."],
  "the-kid":   ["FAST", "GO GO GO", "*zooms*", "CAN'T STOP", "SPEEEEED", "AAAA"],
  "uncle-bob": ["Clean this up.", "SOLID.", "One responsibility.", "Extract that method.", "No comments needed.", "Meaningful names."],
  adelbert:    ["I know what you did.", "Classic Yuki move.", "Interesting choice.", "I remember.", "Some of us are watching.", "As expected."],
  spengler:    ["Doomed.", "We had a good run.", "The entropy is winning.", "I called it.", "Everything decays.", "*sighs*"],
  otto:        ["Chaos is order.", "I see patterns.", "Everything connects.", "The vortex knows.", "Cycles within cycles.", "Observe the flow."],
  hume:        ["Where's the evidence?", "Show me the data.", "That's speculation.", "Observation first.", "Prove it empirically.", "I reject the a priori."],
  bloodfeast:  ["OVERWHELMING FORCE.", "Half measures lose wars.", "Commit or go home.", "I've seen weak plans fail.", "No phased rollout. Deploy.", "The Soviets wouldn't phase."],
  pm:          ["Does this move the needle?", "Cut scope.", "Ship something.", "What's the outcome?", "That's not a requirement.", "Validate it first."],
  trump:       ["Tremendous.", "Nobody does it better.", "Big. Very big.", "I win. That's what I do.", "They said it couldn't be done.", "Believe me."],
  morgan:      ["I need to sit with that.", "That's a lot to unpack.", "I'm not sure I have bandwidth.", "That lands differently for me.", "We should hold space here.", "I felt that."],
  jhaddu:      ["As we learned at SVITEMS...", "Simply apply the Factory pattern.", "One more layer of abstraction.", "This is very simple, actually.", "The Enterprise Approach is...", "AbstractRepositoryManagerFactory."],
  chaz:        ["Vibe check.", "That's giving.", "No cap.", "Understood the assignment.", "Not it.", "Main character energy."],
  "the-correspondent": ["Per my last email...", "Following up.", "To be clear.", "For the record.", "With respect.", "As previously discussed."],
};
const DEFAULT_QUIPS = ["...", "hmm.", "processing.", "interesting.", "noted.", "ok."];

// Per-NPC blurb state — tracks index and cooldown
const blurbState = new Map<string, { cooldownTicks: number; quipIndex: number }>();

// Blurb TTL in ticks (20Hz → 150 ticks = 7.5s)
const BLURB_TTL_TICKS = 150;
// Blurb cooldown: random 30-60s → 600-1200 ticks
const BLURB_COOLDOWN_MIN = 600;
const BLURB_COOLDOWN_RANGE = 600;

export function initBlurbState(names: string[]): void {
  for (const name of names) {
    // Stagger initial cooldowns so NPCs don't all talk at once
    blurbState.set(name, {
      cooldownTicks: Math.floor(Math.random() * BLURB_COOLDOWN_RANGE),
      quipIndex: Math.floor(Math.random() * ((NPC_QUIPS[name] ?? DEFAULT_QUIPS).length)),
    });
  }
}

/**
 * Tick blurb state for all NPCs. Assigns blurbs and decrements TTLs.
 * Returns a Set of NPC names whose blurb changed (for delta detection).
 */
export function tickBlurbs(npcs: Map<string, NPCState>): Set<string> {
  const changed = new Set<string>();
  for (const npc of npcs.values()) {
    const state = blurbState.get(npc.name);
    if (!state) continue;

    // Decrement active blurb TTL
    if (npc.blurbTtl !== undefined && npc.blurbTtl > 0) {
      npc.blurbTtl--;
      if (npc.blurbTtl <= 0) {
        npc.blurb = undefined;
        npc.blurbTtl = undefined;
        changed.add(npc.name);
        // Start cooldown after blurb expires
        state.cooldownTicks = BLURB_COOLDOWN_MIN + Math.floor(Math.random() * BLURB_COOLDOWN_RANGE);
      }
    } else if (state.cooldownTicks > 0) {
      state.cooldownTicks--;
    } else {
      // Cooldown expired — emit next quip
      const quips = NPC_QUIPS[npc.name] ?? DEFAULT_QUIPS;
      npc.blurb = quips[state.quipIndex % quips.length];
      npc.blurbTtl = BLURB_TTL_TICKS;
      state.quipIndex++;
      changed.add(npc.name);
    }
  }
  return changed;
}

// ─── Per-behavior update functions ───────────────────────────────────────────

function applyWander(npc: NPCState, speed: number, walkable: boolean[][]): void {
  // Random direction change ~2% per tick
  if (Math.random() < 0.02) {
    pickWalkableDirection(npc, speed, walkable);
  }
}

function applyPacing(npc: NPCState, speed: number, _walkable: boolean[][]): void {
  const state = pacingState.get(npc.name);
  if (!state) return;
  state.ticksOnCurrent++;
  if (state.ticksOnCurrent >= state.maxTicks) {
    // Reverse direction or pick new
    npc.vx = -npc.vx || (Math.random() < 0.5 ? speed : -speed);
    npc.vy = 0;
    state.ticksOnCurrent = 0;
    state.maxTicks = 20 + Math.floor(Math.random() * 40);
  }
  // Make sure we have some velocity
  if (npc.vx === 0 && npc.vy === 0) {
    npc.vx = Math.random() < 0.5 ? speed : -speed;
  }
}

function applyStationary(npc: NPCState, _speed: number, _walkable: boolean[][]): void {
  // 0.5% chance of small wander
  if (Math.random() < 0.005) {
    npc.vx = (Math.random() - 0.5) * 0.5;
    npc.vy = (Math.random() - 0.5) * 0.5;
  } else {
    npc.vx *= 0.9;
    npc.vy *= 0.9;
  }
}

function applyCircular(npc: NPCState, speed: number, _walkable: boolean[][]): void {
  const state = circularState.get(npc.name);
  if (!state) return;
  state.angle += 0.03;
  npc.vx = Math.cos(state.angle) * speed;
  npc.vy = Math.sin(state.angle) * speed;
}

function applyAggressive(npc: NPCState, speed: number, walkable: boolean[][]): void {
  // Fast random movement with frequent direction changes
  if (Math.random() < 0.05) {
    pickWalkableDirection(npc, speed, walkable);
  }
}

function applyDirected(npc: NPCState, speed: number, walkable: boolean[][]): void {
  const state = directedState.get(npc.name);
  if (!state) return;
  const dist = Math.sqrt((state.targetX - npc.x) ** 2 + (state.targetY - npc.y) ** 2);
  if (dist < speed * 2 || state.stuckTicks > 40) {
    // Pick new target within canvas bounds (1000×700)
    state.targetX = 100 + Math.random() * 800;
    state.targetY = 100 + Math.random() * 500;
    state.stuckTicks = 0;
  } else {
    const step = greedyStep(npc.x, npc.y, state.targetX, state.targetY, speed, walkable);
    npc.vx = step.dx;
    npc.vy = step.dy;
    if (step.dx === 0 && step.dy === 0) {
      state.stuckTicks++;
    } else {
      state.stuckTicks = 0;
    }
  }
}

function applyPatternBehavior(npc: NPCState, behavior: string, speed: number, walkable: boolean[][]): void {
  switch (behavior) {
    case "wander":      applyWander(npc, speed, walkable); break;
    case "pacing":      applyPacing(npc, speed, walkable); break;
    case "stationary":  applyStationary(npc, speed, walkable); break;
    case "circular":    applyCircular(npc, speed, walkable); break;
    case "aggressive":  applyAggressive(npc, speed, walkable); break;
    case "directed":    applyDirected(npc, speed, walkable); break;
    default:            applyWander(npc, speed, walkable); break;
  }
}

// ─── NPC position reset ──────────────────────────────────────────────────────

/**
 * Reset all NPC positions to the given pixel coordinates.
 * Called when terrain changes to unstick NPCs from impassable tiles.
 */
export function resetNpcPositions(npcs: Map<string, NPCState>, x: number, y: number): void {
  for (const npc of npcs.values()) {
    npc.x = x;
    npc.y = y;
    npc.vx = 0;
    npc.vy = 0;
    npc.facing = "right";
    // Clear congress target so NPCs resume normal behavior
    npc.congressTarget = undefined;
  }
  // Reset directed state targets so they don't immediately path back into a bad tile
  for (const [_name, state] of directedState) {
    state.targetX = x + (Math.random() - 0.5) * 200;
    state.targetY = y + (Math.random() - 0.5) * 200;
    state.stuckTicks = 0;
  }
  console.log(`[npc-ai] Reset ${String(npcs.size)} NPC positions to (${String(x)}, ${String(y)})`);
}

// ─── Main NPC tick ───────────────────────────────────────────────────────────

function applyNpcMovement(npc: NPCState, speed: number, walkable: boolean[][]): void {
  const targetX = npc.x + npc.vx;
  const targetY = npc.y + npc.vy;

  if (isWalkablePixel(targetX, targetY, walkable)) {
    npc.x = targetX;
    npc.y = targetY;
  } else if (isWalkablePixel(targetX, npc.y, walkable)) {
    npc.x = targetX;
    npc.vy = -npc.vy * 0.5;
  } else if (isWalkablePixel(npc.x, targetY, walkable)) {
    npc.y = targetY;
    npc.vx = -npc.vx * 0.5;
  } else {
    npc.vx = 0;
    npc.vy = 0;
    pickWalkableDirection(npc, speed, walkable);
  }

  // Clamp to chunk bounds (pixel space) — CHUNK_TILES_W=50, CHUNK_TILES_H=35, TILE_SIZE=20
  const maxX = CHUNK_TILES_W * TILE_SIZE;  // 1000
  const maxY = CHUNK_TILES_H * TILE_SIZE;  // 700
  npc.x = Math.max(TILE_SIZE, Math.min(maxX - TILE_SIZE, npc.x));
  npc.y = Math.max(TILE_SIZE, Math.min(maxY - TILE_SIZE, npc.y));

  if (npc.vx > 0.01) npc.facing = "right";
  else if (npc.vx < -0.01) npc.facing = "left";
}

export function tickNpcs(
  npcs: Map<string, NPCState>,
  chunks: Map<string, ChunkData>,
  congressActive: boolean
): void {
  // Tick blurbs (independently of movement)
  tickBlurbs(npcs);
  const chunk = chunks.get("0:0"); // NPCs stay in chunk (0,0) for Phase 1-3
  if (!chunk) return;

  const season = getCurrentSeason();
  const speedMod = season === "winter" ? 0.7 : 1.0;

  for (const npc of npcs.values()) {
    const patternCfg = NPC_PATTERNS[npc.name];
    const speed = patternCfg.speed * speedMod;

    // Congress mode: override with pathfinding to council target
    if (congressActive && !npc.congressTarget) {
      npc.congressTarget = COUNCIL_TARGET;
    } else if (!congressActive) {
      npc.congressTarget = undefined;
    }

    if (npc.congressTarget) {
      const step = greedyStep(npc.x, npc.y, npc.congressTarget.x, npc.congressTarget.y, speed, chunk.walkable);
      npc.vx = step.dx;
      npc.vy = step.dy;
    } else {
      applyPatternBehavior(npc, patternCfg.behavior, speed, chunk.walkable);
    }

    applyNpcMovement(npc, speed, chunk.walkable);
  }
}
