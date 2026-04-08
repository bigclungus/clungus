// renderer.ts — Pure render(state, ctx, frame) — no mutation, no globals
// This module has zero side effects. It only reads state and draws to the passed-in ctx.

import { WorldState, NPC, Facing, TILE, CANVAS_W, CANVAS_H, NPC_HIT_RADIUS,
  CONGRESS_BUILDING_COL, CONGRESS_BUILDING_LABEL_ROW,
  DUNGEON_BUILDING_COL, DUNGEON_BUILDING_LABEL_ROW,
  LEADERBOARD_COL, LEADERBOARD_ROW } from "./state.ts";
import { getOrBuildTileCache, getSeason, drawTallSprites } from "./map/renderer.ts";
import { getWinner, getSpriteId, getSpriteFn, NPC_DISPLAY_NAMES } from "./sprites.ts";
import { drawWarthog } from "./entities/warthog.ts";
import { drawWalkers } from "./entities/walker.ts";
import { drawWornPaths } from "./map/worn-paths.ts";
import { drawFountainAnimation } from "./map/fountain-anim.ts";

const HOP_FRAMES = 12;
const PLAYER_SIZE = 12;

// -- Night tint -------------------------------------------------------------

function getNightTint(serverTime: number): string | null {
  // Use server-authoritative time so all clients see the same day/night cycle.
  const hour = new Date(serverTime).getUTCHours();
  if (hour >= 6 && hour < 18) return null;
  if (hour >= 18 && hour < 21) return "rgba(180,120,0,0.12)";
  if (hour >= 21 || hour < 0) return "rgba(0,0,60,0.20)";
  return "rgba(0,0,30,0.35)";
}

// -- Hop arc ----------------------------------------------------------------

function hopOffset(hopFrame: number): number {
  if (hopFrame <= 0) return 0;
  const t = hopFrame / HOP_FRAMES;
  return Math.sin(t * Math.PI) * 14;
}

// -- Player drawing ---------------------------------------------------------

function drawPlayerBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  facing: Facing,
  hopFrame: number,
  isAway: boolean,
  isLocal: boolean
): void {
  const yOff = -hopOffset(hopFrame);
  const alpha = isAway ? 0.4 : 1.0;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (isAway) {
    ctx.filter = "grayscale(100%)";
  }

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(x - PLAYER_SIZE / 2, y - PLAYER_SIZE / 2 + yOff, PLAYER_SIZE, PLAYER_SIZE);

  // Direction indicator (small dot on face)
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  const eyeX = facing === "right" ? x + 3 : x - 3;
  ctx.fillRect(eyeX - 1, y - 2 + yOff, 2, 2);

  // Local player highlight ring
  if (isLocal) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - PLAYER_SIZE / 2 - 1, y - PLAYER_SIZE / 2 - 1 + yOff, PLAYER_SIZE + 2, PLAYER_SIZE + 2);
  }

  ctx.restore();
}

function drawPlayerLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  hopFrame: number
): void {
  const yOff = -hopOffset(hopFrame);
  ctx.save();
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText(name, x + 1, y - PLAYER_SIZE - 2 + yOff);
  ctx.fillStyle = "#fff";
  ctx.fillText(name, x, y - PLAYER_SIZE - 3 + yOff);
  ctx.restore();
}

// NPC_HIT_RADIUS is imported from state.ts (single source of truth, shared with main.ts)

// -- Speech bubble ----------------------------------------------------------

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  text: string,
  alpha: number
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = "8px monospace";
  ctx.textAlign = "center";

  const padding = 4;
  const textW = ctx.measureText(text).width;
  const bw = textW + padding * 2;
  const bh = 12;
  const bx = cx - bw / 2;
  const by = topY - bh - 6;

  // Bubble background with tail
  ctx.fillStyle = "rgba(255,255,255,0.93)";
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 0.8;

  ctx.beginPath();
  const r = 3;
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  // Tail pointing down toward NPC
  ctx.lineTo(cx + 3, by + bh);
  ctx.lineTo(cx, by + bh + 5);
  ctx.lineTo(cx - 3, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Text
  ctx.fillStyle = "rgba(20,20,20,0.9)";
  ctx.fillText(text, cx, by + bh - 3);

  ctx.restore();
}

// -- NPC drawing ------------------------------------------------------------

function drawNPCSprite(
  ctx: CanvasRenderingContext2D,
  npc: NPC,
  x: number,
  cy_feet: number,
  hopOff: number,
  hovered: boolean,
  spriteFn: ((ctx: CanvasRenderingContext2D, x: number, y: number) => void) | null,
): void {
  if (typeof spriteFn === "function") {
    if (hovered) ctx.filter = "brightness(1.3)";
    if (npc.facing === "left") {
      ctx.translate(x * 2, 0);
      ctx.scale(-1, 1);
    }
    spriteFn(ctx, x, cy_feet);
  } else {
    const hash = npc.name.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
    const hue = Math.abs(hash) % 360;
    ctx.fillStyle = `hsl(${String(hue)},60%,${String(hovered ? 58 : 45)}%)`;
    ctx.fillRect(x - 8, npc.displayY - 8 + hopOff, 16, 16);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    const eyeX = npc.facing === "right" ? x + 3 : x - 3;
    ctx.fillRect(eyeX - 1, npc.displayY - 2 + hopOff, 2, 3);
  }
}

function drawNPCHoverLabel(ctx: CanvasRenderingContext2D, npc: NPC, x: number, hopOff: number): void {
  const displayName = NPC_DISPLAY_NAMES[npc.name] ?? npc.name;
  ctx.save();
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  const tw = ctx.measureText(displayName).width;
  const ly = npc.displayY - 14 + hopOff;
  ctx.fillStyle = "rgba(20,20,40,0.82)";
  ctx.beginPath();
  ctx.roundRect(x - tw / 2 - 4, ly - 10, tw + 8, 13, 3);
  ctx.fill();
  ctx.fillStyle = "#e8e8ff";
  ctx.fillText(displayName, x, ly);
  ctx.restore();
}

function isNPCHovered(npc: NPC, mouseX: number, mouseY: number): boolean {
  const mdx = mouseX - npc.displayX;
  const mdy = mouseY - (npc.displayY - 8);
  return Math.abs(mdx) < NPC_HIT_RADIUS && Math.abs(mdy) < NPC_HIT_RADIUS + 4;
}

function drawNPCBlurb(
  ctx: CanvasRenderingContext2D,
  npc: NPC,
  x: number,
  hopOff: number,
  hovered: boolean,
  now: number,
): void {
  if (!npc.blurb || npc.blurbExpiry === undefined || npc.blurbExpiry <= now) return;
  const remaining = npc.blurbExpiry - now;
  const fadeMs = 1200;
  const alpha = remaining < fadeMs ? remaining / fadeMs : 1.0;
  const bubbleY = npc.displayY - 14 + hopOff - (hovered ? 12 : 0);
  drawSpeechBubble(ctx, x, bubbleY, npc.blurb, alpha);
}

function drawNPCHoverGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hopOff: number,
): void {
  ctx.save();
  ctx.shadowColor = "rgba(200,200,255,0.9)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "rgba(200,200,255,0.18)";
  ctx.fillRect(x - 10, y - 10 + hopOff, 20, 20);
  ctx.restore();
}

function drawNPC(
  ctx: CanvasRenderingContext2D,
  npc: NPC,
  frame: number,
  now: number,
  mouseX: number,
  mouseY: number
): void {
  const x = npc.displayX;
  const y = npc.displayY;
  const hopOff = -hopOffset(npc.hopFrame ?? 0);
  const cy_feet = y + 8 + hopOff;
  const hovered = isNPCHovered(npc, mouseX, mouseY);

  const spriteId = getSpriteId(npc.name);
  const winner = spriteId ? getWinner(npc.name) : null;
  const spriteFn = winner && spriteId ? getSpriteFn(spriteId, winner) : null;

  ctx.save();
  if (hovered) drawNPCHoverGlow(ctx, x, y, hopOff);
  drawNPCSprite(ctx, npc, x, cy_feet, hopOff, hovered, spriteFn);
  ctx.restore();

  if (hovered) drawNPCHoverLabel(ctx, npc, x, hopOff);
  drawNPCBlurb(ctx, npc, x, hopOff, hovered, now);

  void frame;
}

// -- Connection overlay -----------------------------------------------------

function drawConnectingOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#7eb8f7";
  ctx.font = "bold 18px monospace";
  ctx.textAlign = "center";
  ctx.fillText("CommonsV2 — connecting...", CANVAS_W / 2, CANVAS_H / 2);
  ctx.font = "12px monospace";
  ctx.fillStyle = "#999";
  ctx.fillText("waiting for server", CANVAS_W / 2, CANVAS_H / 2 + 24);
  ctx.restore();
}

// -- Debug HUD --------------------------------------------------------------

// Hidden by default; toggle with backtick (`) or F3
let debugVisible = false;

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "`" || e.key === "F3") {
      e.preventDefault();
      debugVisible = !debugVisible;
    }
  });
}

function buildHUDLines(state: WorldState): string[] {
  const player = state.localPlayer;
  const totalPlayers = state.remotePlayers.size + (player ? 1 : 0);
  const posStr = player ? `(${String(Math.round(player.x))},${String(Math.round(player.y))})` : "no player";
  return [
    `CommonsV2 [${posStr}]`,
    `chunk: (${String(player?.chunkX ?? 0)}, ${String(player?.chunkY ?? 0)})`,
    `players: ${String(totalPlayers)}  npcs: ${String(state.npcs.size)}`,
    `frame: ${String(state.frame)}  ${state.connected ? "● connected" : "○ offline"}`,
  ];
}

function drawHUD(ctx: CanvasRenderingContext2D, state: WorldState): void {
  if (!debugVisible) return;

  ctx.save();
  ctx.font = "10px monospace";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(4, 4, 200, 56);
  ctx.fillStyle = "#ccc";
  ctx.textAlign = "left";
  buildHUDLines(state).forEach((line, i) => { ctx.fillText(line, 8, 17 + i * 12); });
  ctx.restore();
}

// -- Chunk (0,0) fixed overlays -----------------------------------------------

function drawChunk00Overlays(ctx: CanvasRenderingContext2D, congressActive: boolean): void {
  ctx.save();
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillText("CONGRESS", CONGRESS_BUILDING_COL * TILE + TILE / 2 + 1, CONGRESS_BUILDING_LABEL_ROW * TILE - 2);
  ctx.fillStyle = "#c8c8e8";
  ctx.fillText("CONGRESS", CONGRESS_BUILDING_COL * TILE + TILE / 2, CONGRESS_BUILDING_LABEL_ROW * TILE - 3);
  ctx.restore();

  ctx.save();
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText("⚔ DUNGEON", DUNGEON_BUILDING_COL * TILE + TILE / 2 + 1, DUNGEON_BUILDING_LABEL_ROW * TILE - 2);
  ctx.fillStyle = "#a0ffa0";
  ctx.fillText("⚔ DUNGEON", DUNGEON_BUILDING_COL * TILE + TILE / 2, DUNGEON_BUILDING_LABEL_ROW * TILE - 3);
  ctx.restore();

  // Leaderboard sign — 2 tiles wide, taller board, text inside
  const bx = LEADERBOARD_COL * TILE;
  const by = LEADERBOARD_ROW * TILE;
  const signW = TILE * 2 + 4;       // ~44px wide
  const signH = 22;                  // board height
  const poleH = TILE + 8;            // pole goes below board into tile
  const signX = bx - 2;             // left edge of board
  const signCX = bx + TILE;         // center x (mid of 2-tile span)
  ctx.save();
  // Pole
  ctx.fillStyle = "#6b4226";
  ctx.fillRect(signCX - 2, by - signH + poleH, 4, poleH);
  // Board background + border
  ctx.fillStyle = "#1a0d02";
  ctx.strokeStyle = "#c8a028";
  ctx.lineWidth = 1.5;
  ctx.fillRect(signX, by - signH, signW, signH);
  ctx.strokeRect(signX, by - signH, signW, signH);
  // Trophy icon row
  ctx.font = "10px monospace";
  ctx.fillStyle = "#d4af37";
  ctx.textAlign = "center";
  ctx.fillText("🏆", signCX, by - signH + 12);
  // LEADERBOARD label inside board
  ctx.font = "bold 6px monospace";
  ctx.fillStyle = "#e8c040";
  ctx.fillText("LEADERBOARD", signCX, by - signH + 20);
  ctx.restore();

  if (congressActive) {
    ctx.save();
    const fx = CONGRESS_BUILDING_COL * TILE;
    const fy = TILE;
    ctx.fillStyle = "#222";
    ctx.fillRect(fx, fy, 2, TILE);
    ctx.fillStyle = "#f87171";
    ctx.fillRect(fx + 2, fy, 12, 8);
    ctx.fillStyle = "#fff";
    ctx.fillRect(fx + 4, fy + 2, 2, 4);
    ctx.fillRect(fx + 8, fy + 2, 2, 4);
    ctx.fillRect(fx + 6, fy + 1, 2, 2);
    ctx.restore();
  }
}

// -- Main render entry point ------------------------------------------------

function drawMapLayers(
  ctx: CanvasRenderingContext2D,
  state: WorldState,
  frame: number,
  season: ReturnType<typeof getSeason>,
  refTime: number,
): void {
  if (state.map) {
    const tileCanvas = getOrBuildTileCache(state.map, state.mapChunkX, state.mapChunkY, season);
    ctx.drawImage(tileCanvas, 0, 0);
  }
  drawWornPaths(ctx, state.map);
  if (state.map) {
    drawFountainAnimation(ctx, state.map, frame);
  }
  const tint = getNightTint(refTime);
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
}

function drawRemotePlayers(
  ctx: CanvasRenderingContext2D,
  state: WorldState,
  localChunkX: number,
  localChunkY: number,
): void {
  const warthogSeatedIds = new Set(state.warthog?.seats.filter(Boolean) ?? []);
  for (const player of state.remotePlayers.values()) {
    if (player.chunkX !== localChunkX || player.chunkY !== localChunkY) continue;
    if (warthogSeatedIds.has(player.socketId)) continue;
    drawPlayerBody(ctx, player.displayX, player.displayY, player.color, player.facing, player.hopFrame, player.isAway, false);
    drawPlayerLabel(ctx, player.displayX, player.displayY, player.name, player.hopFrame);
  }
}

function drawNPCs(ctx: CanvasRenderingContext2D, state: WorldState, frame: number): void {
  const renderNow = performance.now();
  for (const npc of state.npcs.values()) {
    drawNPC(ctx, npc, frame, renderNow, state.mouseX, state.mouseY);
  }
}

function drawLocalPlayer(ctx: CanvasRenderingContext2D, state: WorldState): void {
  if (!state.localPlayer || state.seatedInWarthog) return;
  const p = state.localPlayer;
  drawPlayerBody(ctx, p.x, p.y, p.color, p.facing, p.hopFrame, p.isAway, true);
  drawPlayerLabel(ctx, p.x, p.y, p.name, p.hopFrame);
}

function drawConditionalOverlays(
  ctx: CanvasRenderingContext2D,
  state: WorldState,
  localChunkX: number,
  localChunkY: number,
  season: string,
): void {
  if (state.map) drawTallSprites(ctx, state.map, season);
  if (localChunkX === 0 && localChunkY === 0) drawChunk00Overlays(ctx, state.congress.active);
  drawHUD(ctx, state);
  if (!state.connected) drawConnectingOverlay(ctx);
}

export function render(state: WorldState, ctx: CanvasRenderingContext2D, frame: number): void {
  ctx.fillStyle = "#3a5a2a";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const refTime = state.serverTime > 0 ? state.serverTime : Date.now();
  const season = getSeason(refTime);

  drawMapLayers(ctx, state, frame, season, refTime);

  const localChunkX = state.localPlayer?.chunkX ?? 0;
  const localChunkY = state.localPlayer?.chunkY ?? 0;

  drawRemotePlayers(ctx, state, localChunkX, localChunkY);
  drawNPCs(ctx, state, frame);
  drawWalkers(ctx, state.walkers);
  drawWarthog(ctx, state);
  drawLocalPlayer(ctx, state);
  drawConditionalOverlays(ctx, state, localChunkX, localChunkY, season);
}
