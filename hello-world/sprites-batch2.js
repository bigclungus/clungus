// sprites-batch2.js — Pixel art sprites for hume, otto, pm, trump, uncle-bob, spengler
// Format: drawSprite_<name>_<variant>(ctx, cx, cy)
// cx = horizontal center, cy = bottom (feet), ~40px tall, ~20px wide, fillRect only

// ─────────────────────────────────────────────
// HUME — David Hume — #38bdf8
// ─────────────────────────────────────────────

function drawSprite_hume_A(ctx, cx, cy) {
  // A: 18th Century Gentleman — powdered wig, frock coat, breeches, quill, waistcoat
  const x = cx - 10;
  const y = cy - 40;

  // Legs / breeches (#b0c8e8 cream-blue)
  ctx.fillStyle = '#b0c8e8';
  ctx.fillRect(x + 3, y + 30, 4, 10); // left leg
  ctx.fillRect(x + 9, y + 30, 4, 10); // right leg

  // Shoes
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 2, y + 38, 5, 2);
  ctx.fillRect(x + 9, y + 38, 5, 2);

  // Frock coat body (#38bdf8)
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(x + 2, y + 18, 12, 14);

  // Coat tail flare
  ctx.fillStyle = '#2ea8e0';
  ctx.fillRect(x + 1, y + 26, 3, 6);
  ctx.fillRect(x + 12, y + 26, 3, 6);

  // Waistcoat buttons (#ffffff)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 7, y + 20, 2, 2);
  ctx.fillRect(x + 7, y + 24, 2, 2);
  ctx.fillRect(x + 7, y + 28, 2, 2);

  // Waistcoat strip (cream)
  ctx.fillStyle = '#f0e8d0';
  ctx.fillRect(x + 6, y + 18, 4, 12);

  // Neck / cravat (#ffffff)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 7, y + 14, 3, 4);

  // Head (#f5d0a9)
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 5, y + 7, 8, 8);

  // Eyes
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 7, y + 9, 1, 1);
  ctx.fillRect(x + 10, y + 9, 1, 1);

  // Mouth (neutral)
  ctx.fillStyle = '#c0906a';
  ctx.fillRect(x + 8, y + 12, 2, 1);

  // Powdered wig (#e8e8e8 white-grey)
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(x + 4, y + 2, 10, 7); // top puff
  ctx.fillRect(x + 2, y + 4, 4, 10); // left curl
  ctx.fillRect(x + 12, y + 4, 4, 10); // right curl
  ctx.fillRect(x + 3, y + 1, 12, 4); // top dome

  // Quill pen (#f5e08a yellow)
  ctx.fillStyle = '#f5e08a';
  ctx.fillRect(x + 15, y + 16, 2, 10);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 15, y + 14, 2, 3);

  // Left arm holding quill
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(x + 13, y + 18, 3, 7);
}

function drawSprite_hume_B(ctx, cx, cy) {
  // B: Scottish Empiricist — tartan kilt, tam o'shanter, raised eyebrow
  const x = cx - 10;
  const y = cy - 40;

  // Legs / socks (#ffffff)
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 3, y + 34, 4, 6);
  ctx.fillRect(x + 9, y + 34, 4, 6);

  // Shoes / brogues
  ctx.fillStyle = '#3d2b1f';
  ctx.fillRect(x + 2, y + 38, 5, 2);
  ctx.fillRect(x + 9, y + 38, 5, 2);

  // Kilt base (#38bdf8)
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(x + 2, y + 26, 14, 10);

  // Tartan plaid pattern (alternating rects)
  ctx.fillStyle = '#1e6fa8';
  ctx.fillRect(x + 2, y + 26, 3, 10);
  ctx.fillRect(x + 8, y + 26, 3, 10);
  ctx.fillRect(x + 14, y + 26, 2, 10);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 4, y + 28, 1, 7);
  ctx.fillRect(x + 10, y + 28, 1, 7);
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(x + 2, y + 29, 14, 1);
  ctx.fillRect(x + 2, y + 33, 14, 1);

  // Jacket / shirt (#38bdf8)
  ctx.fillStyle = '#2ea8e0';
  ctx.fillRect(x + 3, y + 17, 11, 10);

  // Arms
  ctx.fillStyle = '#2ea8e0';
  ctx.fillRect(x + 0, y + 18, 3, 7);
  ctx.fillRect(x + 14, y + 18, 3, 7);

  // Neck
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 7, y + 14, 3, 3);

  // Head
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 5, y + 7, 8, 8);

  // Raised eyebrow (skeptical)
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(x + 6, y + 8, 3, 1);  // left brow normal
  ctx.fillRect(x + 10, y + 7, 3, 1); // right brow raised

  // Eyes
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 7, y + 10, 1, 1);
  ctx.fillRect(x + 11, y + 10, 1, 1);

  // Smirk
  ctx.fillStyle = '#c0906a';
  ctx.fillRect(x + 8, y + 13, 3, 1);
  ctx.fillRect(x + 10, y + 12, 1, 1);

  // Tam o'shanter (#38bdf8 with pompom)
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(x + 4, y + 3, 10, 5);
  ctx.fillRect(x + 3, y + 4, 12, 4);
  // Band
  ctx.fillStyle = '#1e6fa8';
  ctx.fillRect(x + 4, y + 7, 10, 2);
  // Pompom
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 8, y + 1, 3, 3);
}

function drawSprite_hume_C(ctx, cx, cy) {
  // C: Enlightenment Scholar — dark study coat, open book, spectacles, candle
  const x = cx - 10;
  const y = cy - 40;

  // Legs
  ctx.fillStyle = '#2a3a4a';
  ctx.fillRect(x + 3, y + 30, 4, 10);
  ctx.fillRect(x + 9, y + 30, 4, 10);

  // Shoes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + 2, y + 38, 5, 2);
  ctx.fillRect(x + 9, y + 38, 5, 2);

  // Dark study coat (#1e3a4a)
  ctx.fillStyle = '#1e3a4a';
  ctx.fillRect(x + 2, y + 15, 12, 16);

  // Inner shirt / cravat (#f0e8d0)
  ctx.fillStyle = '#f0e8d0';
  ctx.fillRect(x + 7, y + 15, 3, 5);

  // Arms holding book
  ctx.fillStyle = '#1e3a4a';
  ctx.fillRect(x + 0, y + 18, 3, 8);
  ctx.fillRect(x + 14, y + 18, 3, 8);

  // Open book (#f0e8d0) in both hands
  ctx.fillStyle = '#f0e8d0';
  ctx.fillRect(x + 1, y + 25, 7, 5);
  ctx.fillRect(x + 9, y + 25, 7, 5);
  // Book spine / binding
  ctx.fillStyle = '#8b6a2a';
  ctx.fillRect(x + 8, y + 24, 2, 7);
  // Book text lines
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(x + 2, y + 27, 5, 1);
  ctx.fillRect(x + 2, y + 29, 5, 1);
  ctx.fillRect(x + 10, y + 27, 5, 1);
  ctx.fillRect(x + 10, y + 29, 5, 1);

  // Neck
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 7, y + 12, 3, 3);

  // Head
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 5, y + 5, 8, 8);

  // Spectacles (#888888)
  ctx.fillStyle = '#888888';
  ctx.fillRect(x + 5, y + 8, 3, 2);
  ctx.fillRect(x + 10, y + 8, 3, 2);
  ctx.fillRect(x + 8, y + 8, 2, 1); // bridge

  // Eyes behind spectacles
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 6, y + 9, 1, 1);
  ctx.fillRect(x + 11, y + 9, 1, 1);

  // Mouth (focused)
  ctx.fillStyle = '#c0906a';
  ctx.fillRect(x + 7, y + 11, 3, 1);

  // Dark hair / hat (#2a1a0a)
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(x + 4, y + 2, 10, 5);
  ctx.fillRect(x + 5, y + 1, 8, 2);

  // Candle nearby (right side, offset)
  ctx.fillStyle = '#f5e08a';
  ctx.fillRect(x + 17, y + 28, 3, 8);
  // Candle body (#f0f0f0)
  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(x + 17, y + 30, 3, 8);
  // Flame
  ctx.fillStyle = '#ff9900';
  ctx.fillRect(x + 18, y + 26, 2, 3);
  ctx.fillStyle = '#ffff44';
  ctx.fillRect(x + 18, y + 25, 1, 2);
}

// ─────────────────────────────────────────────
// OTTO — Otto Atreides — #a78bfa
// ─────────────────────────────────────────────

function drawSprite_otto_A(ctx, cx, cy) {
  // A: Atreides Noble — stillsuit, family crest, contemplative pose
  const x = cx - 10;
  const y = cy - 40;

  // Legs / stillsuit lower (#2a2035)
  ctx.fillStyle = '#2a2035';
  ctx.fillRect(x + 3, y + 30, 4, 10);
  ctx.fillRect(x + 9, y + 30, 4, 10);

  // Stillsuit boots (#1a1025)
  ctx.fillStyle = '#1a1025';
  ctx.fillRect(x + 2, y + 36, 5, 4);
  ctx.fillRect(x + 9, y + 36, 5, 4);

  // Stillsuit body (#2a2035 dark)
  ctx.fillStyle = '#2a2035';
  ctx.fillRect(x + 2, y + 16, 12, 15);

  // Stillsuit tubing / details (#a78bfa)
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(x + 3, y + 18, 2, 10); // left tube
  ctx.fillRect(x + 11, y + 18, 2, 10); // right tube
  ctx.fillRect(x + 5, y + 22, 6, 2); // chest band

  // Family crest (#ffd700 gold)
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(x + 7, y + 17, 4, 4);
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(x + 8, y + 18, 2, 2);

  // Mantle / shoulders (#3d2f5a)
  ctx.fillStyle = '#3d2f5a';
  ctx.fillRect(x + 0, y + 16, 4, 5);
  ctx.fillRect(x + 12, y + 16, 4, 5);

  // Contemplative arms (one across chest, one at side)
  ctx.fillStyle = '#2a2035';
  ctx.fillRect(x + 1, y + 20, 3, 6);  // left arm at side
  ctx.fillRect(x + 14, y + 18, 3, 5); // right arm raised

  // Neck
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x + 7, y + 13, 3, 3);

  // Head
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x + 5, y + 6, 8, 8);

  // Hair (#1a0a30 dark)
  ctx.fillStyle = '#1a0a30';
  ctx.fillRect(x + 5, y + 4, 8, 4);
  ctx.fillRect(x + 4, y + 5, 2, 3);

  // Eyes (contemplative, half-lidded)
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(x + 6, y + 9, 2, 1);
  ctx.fillRect(x + 10, y + 9, 2, 1);
  ctx.fillStyle = '#1a0a30';
  ctx.fillRect(x + 7, y + 9, 1, 1);
  ctx.fillRect(x + 11, y + 9, 1, 1);

  // Mouth (neutral, composed)
  ctx.fillStyle = '#b08060';
  ctx.fillRect(x + 7, y + 12, 3, 1);

  // Hood draped behind (#3d2f5a)
  ctx.fillStyle = '#3d2f5a';
  ctx.fillRect(x + 3, y + 5, 3, 8);
  ctx.fillRect(x + 12, y + 5, 3, 8);
}

function drawSprite_otto_B(ctx, cx, cy) {
  // B: Chaos Theorist — wild hair, equations floating, lab coat, manic expression
  const x = cx - 10;
  const y = cy - 40;

  // Legs (#333355)
  ctx.fillStyle = '#333355';
  ctx.fillRect(x + 3, y + 30, 4, 10);
  ctx.fillRect(x + 9, y + 30, 4, 10);

  // Shoes
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 2, y + 38, 5, 2);
  ctx.fillRect(x + 9, y + 38, 5, 2);

  // Lab coat (#f0f0f8)
  ctx.fillStyle = '#f0f0f8';
  ctx.fillRect(x + 2, y + 16, 12, 15);

  // Coat lapels
  ctx.fillStyle = '#d0d0e8';
  ctx.fillRect(x + 2, y + 16, 3, 8);
  ctx.fillRect(x + 11, y + 16, 3, 8);

  // Shirt under (#a78bfa)
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(x + 6, y + 17, 5, 6);

  // Equations floating around (small rects as symbols)
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(x - 3, y + 5, 3, 1);  // =
  ctx.fillRect(x - 3, y + 3, 3, 1);  // =
  ctx.fillRect(x - 2, y + 10, 2, 1);
  ctx.fillRect(x + 18, y + 4, 3, 1);
  ctx.fillRect(x + 18, y + 6, 1, 3);
  ctx.fillRect(x + 19, y + 10, 2, 1);
  ctx.fillRect(x + 17, y + 14, 3, 1);
  ctx.fillStyle = '#7755cc';
  ctx.fillRect(x - 1, y + 15, 2, 2);
  ctx.fillRect(x + 18, y + 18, 2, 2);

  // Arms (one gesturing up, one at side)
  ctx.fillStyle = '#f0f0f8';
  ctx.fillRect(x + 0, y + 18, 3, 8);
  ctx.fillRect(x + 14, y + 16, 3, 9);

  // Pointing finger
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x + 14, y + 15, 2, 2);

  // Neck
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x + 7, y + 13, 3, 3);

  // Head
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x + 5, y + 6, 8, 8);

  // Wild hair (#a78bfa crazy)
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(x + 4, y + 2, 10, 5);
  ctx.fillRect(x + 3, y + 3, 2, 6); // left wild
  ctx.fillRect(x + 13, y + 2, 2, 7); // right wild
  ctx.fillRect(x + 5, y + 1, 2, 2);
  ctx.fillRect(x + 10, y + 0, 2, 3);
  ctx.fillRect(x + 7, y + 1, 2, 1);

  // Manic eyes (wide open)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 6, y + 8, 3, 2);
  ctx.fillRect(x + 10, y + 8, 3, 2);
  ctx.fillStyle = '#1a0a30';
  ctx.fillRect(x + 7, y + 8, 1, 2);
  ctx.fillRect(x + 11, y + 8, 1, 2);

  // Manic grin
  ctx.fillStyle = '#c0906a';
  ctx.fillRect(x + 6, y + 12, 5, 1);
  ctx.fillRect(x + 6, y + 11, 1, 1);
  ctx.fillRect(x + 10, y + 11, 1, 1);
}

function drawSprite_otto_C(ctx, cx, cy) {
  // C: Void Wanderer — all black with star dots, hovering, arms spread
  const x = cx - 10;
  const y = cy - 40;

  // Hovering — shift figure up 3px, no feet on ground
  const oy = 3; // hover offset

  // Flowing void robe (#0a0a14 near-black)
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(x + 3, y + 28 - oy, 10, 12);
  // Robe flare at bottom (floating)
  ctx.fillRect(x + 1, y + 33 - oy, 3, 6);
  ctx.fillRect(x + 12, y + 33 - oy, 3, 6);

  // Body (#0a0a14)
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(x + 2, y + 15 - oy, 12, 14);

  // Arms spread wide
  ctx.fillRect(x - 4, y + 16 - oy, 7, 3);
  ctx.fillRect(x + 13, y + 16 - oy, 7, 3);

  // Stars embedded in costume (#ffffff dots)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 4, y + 17 - oy, 1, 1);
  ctx.fillRect(x + 9, y + 20 - oy, 1, 1);
  ctx.fillRect(x + 6, y + 24 - oy, 1, 1);
  ctx.fillRect(x + 12, y + 17 - oy, 1, 1);
  ctx.fillRect(x + 3, y + 27 - oy, 1, 1);
  ctx.fillRect(x + 11, y + 30 - oy, 1, 1);
  ctx.fillRect(x + 7, y + 32 - oy, 1, 1);
  ctx.fillRect(x - 2, y + 18 - oy, 1, 1);
  ctx.fillRect(x + 17, y + 17 - oy, 1, 1);
  ctx.fillRect(x - 1, y + 21 - oy, 1, 1);
  ctx.fillRect(x + 16, y + 22 - oy, 1, 1);

  // Dim purple glow trim (#a78bfa faint)
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(x + 2, y + 15 - oy, 12, 1);
  ctx.fillRect(x + 2, y + 28 - oy, 12, 1);
  ctx.fillRect(x - 4, y + 16 - oy, 1, 3);
  ctx.fillRect(x + 19, y + 16 - oy, 1, 3);

  // Neck (#0a0a14)
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(x + 7, y + 12 - oy, 3, 3);

  // Head (#1a1a2e dark)
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 5, y + 5 - oy, 8, 8);

  // Hood / cowl (#0a0a14)
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(x + 4, y + 3 - oy, 10, 6);
  ctx.fillRect(x + 3, y + 5 - oy, 3, 5);
  ctx.fillRect(x + 12, y + 5 - oy, 3, 5);

  // Eyes (glowing void-purple)
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(x + 7, y + 8 - oy, 2, 1);
  ctx.fillRect(x + 10, y + 8 - oy, 2, 1);

  // Floating glow beneath feet
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(x + 5, y + 39, 8, 1);
  ctx.fillStyle = '#7755cc';
  ctx.fillRect(x + 6, y + 40, 6, 1);
}

// ─────────────────────────────────────────────
// PM — Chud O'Bikeshedder — #84cc16
// ─────────────────────────────────────────────

function drawSprite_pm_A(ctx, cx, cy) {
  // A: Enterprise PM — polo shirt, khakis, badge lanyard, roadmap printout
  const x = cx - 10;
  const y = cy - 40;

  // Khaki legs (#c8a86a)
  ctx.fillStyle = '#c8a86a';
  ctx.fillRect(x + 3, y + 28, 4, 12);
  ctx.fillRect(x + 9, y + 28, 4, 12);

  // Shoes (#4a3520)
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(x + 2, y + 38, 5, 2);
  ctx.fillRect(x + 9, y + 38, 5, 2);

  // Polo shirt (#84cc16)
  ctx.fillStyle = '#84cc16';
  ctx.fillRect(x + 2, y + 17, 12, 12);

  // Polo collar
  ctx.fillStyle = '#6ab010';
  ctx.fillRect(x + 6, y + 17, 5, 3);

  // Belt (#5a4020)
  ctx.fillStyle = '#5a4020';
  ctx.fillRect(x + 2, y + 27, 12, 2);
  ctx.fillStyle = '#c8a020';
  ctx.fillRect(x + 7, y + 27, 3, 2);

  // Badge lanyard (#84cc16 string)
  ctx.fillStyle = '#84cc16';
  ctx.fillRect(x + 8, y + 19, 1, 6);
  // Badge itself (#ffffff)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 6, y + 24, 5, 4);
  ctx.fillStyle = '#84cc16';
  ctx.fillRect(x + 7, y + 25, 3, 1);
  ctx.fillRect(x + 7, y + 27, 2, 1);

  // Arms — one holding roadmap
  ctx.fillStyle = '#84cc16';
  ctx.fillRect(x + 0, y + 19, 3, 8);  // left arm
  ctx.fillRect(x + 14, y + 19, 3, 8); // right arm

  // Roadmap printout (#f0f0f0)
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 14, y + 22, 5, 7);
  ctx.fillStyle = '#84cc16';
  ctx.fillRect(x + 15, y + 23, 3, 1);
  ctx.fillRect(x + 15, y + 25, 3, 1);
  ctx.fillRect(x + 15, y + 27, 3, 1);

  // Neck
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 7, y + 14, 3, 3);

  // Head
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 5, y + 6, 8, 9);

  // Sensible haircut (#5a3a1a medium brown)
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(x + 5, y + 4, 8, 4);
  ctx.fillRect(x + 4, y + 5, 2, 3);

  // Eyes (attentive)
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 7, y + 9, 1, 2);
  ctx.fillRect(x + 10, y + 9, 1, 2);

  // Slight smile
  ctx.fillStyle = '#c0906a';
  ctx.fillRect(x + 7, y + 13, 4, 1);
  ctx.fillRect(x + 10, y + 12, 1, 1);
}

function drawSprite_pm_B(ctx, cx, cy) {
  // B: Agile Zealot — hoodie with sticky notes, laptop under arm, coffee in hand
  const x = cx - 10;
  const y = cy - 40;

  // Jeans (#3a5fa8)
  ctx.fillStyle = '#3a5fa8';
  ctx.fillRect(x + 3, y + 28, 4, 12);
  ctx.fillRect(x + 9, y + 28, 4, 12);

  // Sneakers (#f0f0f0)
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 2, y + 37, 5, 3);
  ctx.fillRect(x + 9, y + 37, 5, 3);
  ctx.fillStyle = '#84cc16';
  ctx.fillRect(x + 2, y + 37, 5, 1);
  ctx.fillRect(x + 9, y + 37, 5, 1);

  // Hoodie base (#84cc16)
  ctx.fillStyle = '#84cc16';
  ctx.fillRect(x + 2, y + 15, 12, 14);

  // Hood on back (#6ab010)
  ctx.fillStyle = '#6ab010';
  ctx.fillRect(x + 3, y + 13, 10, 4);

  // Pocket
  ctx.fillStyle = '#6ab010';
  ctx.fillRect(x + 5, y + 22, 6, 4);

  // Sticky notes on hoodie (small colored rects)
  ctx.fillStyle = '#ffe44d'; // yellow
  ctx.fillRect(x + 3, y + 16, 3, 3);
  ctx.fillStyle = '#ff9999'; // pink
  ctx.fillRect(x + 10, y + 16, 3, 3);
  ctx.fillStyle = '#99ddff'; // blue
  ctx.fillRect(x + 3, y + 20, 3, 3);
  ctx.fillStyle = '#aaffaa'; // green
  ctx.fillRect(x + 10, y + 21, 3, 3);
  ctx.fillStyle = '#ffcc88'; // orange
  ctx.fillRect(x + 7, y + 18, 3, 2);

  // Arms
  ctx.fillStyle = '#84cc16';
  ctx.fillRect(x + 0, y + 17, 3, 9);  // left arm (coffee)
  ctx.fillRect(x + 13, y + 17, 3, 9); // right arm (laptop)

  // Laptop under right arm (#e0e0e0)
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(x + 14, y + 24, 7, 4);
  ctx.fillStyle = '#84cc16';
  ctx.fillRect(x + 15, y + 25, 5, 2);

  // Coffee cup (left hand)
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(x - 2, y + 25, 4, 5);
  ctx.fillStyle = '#f5e0c0';
  ctx.fillRect(x - 1, y + 24, 2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 2, y + 25, 4, 1);

  // Neck
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 7, y + 12, 3, 3);

  // Head
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 5, y + 5, 8, 8);

  // Hair / hoodie framing
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(x + 5, y + 4, 8, 3);
  ctx.fillRect(x + 4, y + 5, 2, 4);
  ctx.fillRect(x + 12, y + 5, 2, 4);

  // Enthusiastic eyes
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 7, y + 8, 2, 2);
  ctx.fillRect(x + 10, y + 8, 2, 2);

  // Big grin
  ctx.fillStyle = '#c0906a';
  ctx.fillRect(x + 6, y + 11, 6, 1);
  ctx.fillRect(x + 6, y + 10, 1, 1);
  ctx.fillRect(x + 11, y + 10, 1, 1);
}

function drawSprite_pm_C(ctx, cx, cy) {
  // C: Bikeshedder — standing next to tiny shed, arguing about its color, paint can
  const x = cx - 10;
  const y = cy - 40;

  // Legs (#c8a86a khaki)
  ctx.fillStyle = '#c8a86a';
  ctx.fillRect(x + 3, y + 28, 4, 12);
  ctx.fillRect(x + 9, y + 28, 4, 12);

  // Shoes
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(x + 2, y + 38, 5, 2);
  ctx.fillRect(x + 9, y + 38, 5, 2);

  // Shirt (#84cc16 polo)
  ctx.fillStyle = '#84cc16';
  ctx.fillRect(x + 2, y + 17, 12, 12);

  // Collar
  ctx.fillStyle = '#6ab010';
  ctx.fillRect(x + 6, y + 17, 5, 2);

  // Arms (one pointing at shed, one holding paint can)
  ctx.fillStyle = '#84cc16';
  ctx.fillRect(x + 0, y + 18, 3, 8);  // left (paint can)
  ctx.fillRect(x + 13, y + 17, 3, 7); // right (pointing)
  // Pointing finger
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 15, y + 16, 2, 2);

  // Paint can (left hand)
  ctx.fillStyle = '#aaaaaa';
  ctx.fillRect(x - 2, y + 25, 4, 5);
  ctx.fillStyle = '#ff4444'; // red paint (arguing about THIS color)
  ctx.fillRect(x - 2, y + 25, 4, 1);
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(x - 2, y + 23, 4, 2); // handle top

  // Tiny shed (off to right of figure)
  ctx.fillStyle = '#a0522d'; // walls
  ctx.fillRect(x + 18, y + 25, 12, 15);
  // Shed roof (#cc4444 — the disputed color)
  ctx.fillStyle = '#cc4444';
  ctx.fillRect(x + 17, y + 22, 14, 4);
  ctx.fillRect(x + 18, y + 20, 12, 3);
  ctx.fillRect(x + 20, y + 18, 8, 3);
  // Shed door
  ctx.fillStyle = '#6b3a1f';
  ctx.fillRect(x + 22, y + 30, 5, 10);
  // Shed window
  ctx.fillStyle = '#aaddff';
  ctx.fillRect(x + 19, y + 27, 4, 4);

  // Neck
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 7, y + 14, 3, 3);

  // Head
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 5, y + 6, 8, 9);

  // Hair (#5a3a1a)
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(x + 5, y + 4, 8, 4);

  // Furrowed brow (arguing)
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(x + 6, y + 8, 3, 1);
  ctx.fillRect(x + 9, y + 7, 3, 1);

  // Eyes (indignant)
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 7, y + 9, 1, 2);
  ctx.fillRect(x + 10, y + 9, 1, 2);

  // Open arguing mouth
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 7, y + 13, 4, 2);
  ctx.fillStyle = '#cc4444';
  ctx.fillRect(x + 8, y + 13, 2, 1);
}

// ─────────────────────────────────────────────
// TRUMP — Punished Trump — #eab308
// ─────────────────────────────────────────────

function drawSprite_trump_A(ctx, cx, cy) {
  // A: Deal Closer — power suit in gold tones, distinctive hair, thumbs up, big tie
  const x = cx - 10;
  const y = cy - 40;

  // Suit trousers (#c8950a dark gold)
  ctx.fillStyle = '#c8950a';
  ctx.fillRect(x + 3, y + 28, 4, 12);
  ctx.fillRect(x + 9, y + 28, 4, 12);

  // Shoes (#1a1a1a)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + 2, y + 38, 5, 2);
  ctx.fillRect(x + 9, y + 38, 5, 2);

  // Suit jacket (#eab308 gold)
  ctx.fillStyle = '#eab308';
  ctx.fillRect(x + 2, y + 16, 12, 13);

  // Jacket lapels
  ctx.fillStyle = '#c8950a';
  ctx.fillRect(x + 2, y + 16, 4, 9);
  ctx.fillRect(x + 10, y + 16, 4, 9);

  // White shirt front
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 6, y + 16, 4, 5);

  // Big tie (#cc2200 red)
  ctx.fillStyle = '#cc2200';
  ctx.fillRect(x + 7, y + 17, 3, 12);
  ctx.fillRect(x + 6, y + 27, 5, 3); // wide tie bottom

  // Arms — thumbs up right side
  ctx.fillStyle = '#eab308';
  ctx.fillRect(x + 0, y + 18, 3, 8);  // left arm at side
  ctx.fillRect(x + 13, y + 18, 3, 7); // right arm raised
  // Thumb up
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 14, y + 15, 2, 3);
  ctx.fillRect(x + 15, y + 13, 2, 3); // thumb

  // Neck
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 7, y + 13, 3, 3);

  // Head (big)
  ctx.fillStyle = '#f5a050';
  ctx.fillRect(x + 4, y + 5, 10, 9);

  // Distinctive hair (#f5c842 blonde-orange)
  ctx.fillStyle = '#f0b830';
  ctx.fillRect(x + 3, y + 2, 12, 5);
  ctx.fillRect(x + 4, y + 1, 10, 3);
  ctx.fillRect(x + 2, y + 4, 3, 4);  // left comb-over
  ctx.fillRect(x + 13, y + 3, 3, 5); // right side

  // Eyes (squinting confident)
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 6, y + 9, 3, 1);
  ctx.fillRect(x + 10, y + 9, 3, 1);

  // Pursed lips
  ctx.fillStyle = '#d0806a';
  ctx.fillRect(x + 6, y + 12, 5, 2);
}

function drawSprite_trump_B(ctx, cx, cy) {
  // B: Big League Builder — construction hat, blueprints, grand gesture, gold
  const x = cx - 10;
  const y = cy - 40;

  // Suit trousers (#c8950a)
  ctx.fillStyle = '#c8950a';
  ctx.fillRect(x + 3, y + 28, 4, 12);
  ctx.fillRect(x + 9, y + 28, 4, 12);

  // Shoes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + 2, y + 38, 5, 2);
  ctx.fillRect(x + 9, y + 38, 5, 2);

  // Suit jacket (#eab308)
  ctx.fillStyle = '#eab308';
  ctx.fillRect(x + 2, y + 16, 12, 13);
  ctx.fillStyle = '#c8950a';
  ctx.fillRect(x + 2, y + 16, 4, 9);
  ctx.fillRect(x + 10, y + 16, 4, 9);

  // White shirt
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 6, y + 16, 4, 5);

  // Red tie
  ctx.fillStyle = '#cc2200';
  ctx.fillRect(x + 7, y + 17, 3, 11);
  ctx.fillRect(x + 6, y + 26, 5, 3);

  // Arms — one swept wide gesturing, one holding blueprints
  ctx.fillStyle = '#eab308';
  ctx.fillRect(x - 2, y + 17, 5, 4);  // left arm wide out
  ctx.fillRect(x + 14, y + 18, 4, 7); // right arm with blueprints

  // Blueprints (#a8c8ff blue roll)
  ctx.fillStyle = '#a8c8ff';
  ctx.fillRect(x + 16, y + 22, 5, 8);
  ctx.fillStyle = '#3a6aaa';
  ctx.fillRect(x + 16, y + 22, 5, 1);
  ctx.fillRect(x + 16, y + 29, 5, 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 17, y + 24, 3, 1);
  ctx.fillRect(x + 17, y + 26, 3, 1);

  // Neck
  ctx.fillStyle = '#f5a050';
  ctx.fillRect(x + 7, y + 13, 3, 3);

  // Head
  ctx.fillStyle = '#f5a050';
  ctx.fillRect(x + 4, y + 5, 10, 9);

  // Construction hard hat (#f5c842 gold-yellow)
  ctx.fillStyle = '#f5c842';
  ctx.fillRect(x + 3, y + 2, 12, 5);
  ctx.fillRect(x + 4, y + 1, 10, 2);
  ctx.fillRect(x + 2, y + 5, 14, 2); // brim

  // Hair visible at sides
  ctx.fillStyle = '#f0b830';
  ctx.fillRect(x + 3, y + 5, 2, 3);
  ctx.fillRect(x + 13, y + 5, 2, 3);

  // Gold accent on hat
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(x + 7, y + 2, 4, 2);

  // Eyes (confident)
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 6, y + 9, 3, 1);
  ctx.fillRect(x + 10, y + 9, 3, 1);

  // Mouth (speaking)
  ctx.fillStyle = '#d0806a';
  ctx.fillRect(x + 6, y + 12, 5, 2);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 7, y + 12, 3, 1);
}

function drawSprite_trump_C(ctx, cx, cy) {
  // C: Punished — eye patch, battle-worn suit, resolute stance
  const x = cx - 10;
  const y = cy - 40;

  // Suit trousers (worn, darker #9a7008)
  ctx.fillStyle = '#9a7008';
  ctx.fillRect(x + 3, y + 28, 4, 12);
  ctx.fillRect(x + 9, y + 28, 4, 12);

  // Shoes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + 2, y + 38, 5, 2);
  ctx.fillRect(x + 9, y + 38, 5, 2);

  // Battle-worn suit (#c8950a with wear marks)
  ctx.fillStyle = '#c8950a';
  ctx.fillRect(x + 2, y + 16, 12, 13);

  // Jacket tears / wear
  ctx.fillStyle = '#9a7008';
  ctx.fillRect(x + 2, y + 22, 2, 2);
  ctx.fillRect(x + 12, y + 18, 2, 2);
  ctx.fillRect(x + 4, y + 28, 2, 1);

  // Lapels
  ctx.fillStyle = '#9a7008';
  ctx.fillRect(x + 2, y + 16, 4, 9);
  ctx.fillRect(x + 10, y + 16, 4, 9);

  // White shirt (rumpled)
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(x + 6, y + 16, 4, 5);

  // Tie (loosened, askew)
  ctx.fillStyle = '#cc2200';
  ctx.fillRect(x + 7, y + 17, 3, 9);
  ctx.fillRect(x + 8, y + 25, 4, 4);

  // Resolute arms (fists clenched at sides)
  ctx.fillStyle = '#c8950a';
  ctx.fillRect(x + 0, y + 18, 3, 9);
  ctx.fillRect(x + 13, y + 18, 3, 9);
  // Clenched fists
  ctx.fillStyle = '#f5a050';
  ctx.fillRect(x + 0, y + 26, 3, 3);
  ctx.fillRect(x + 13, y + 26, 3, 3);

  // Neck
  ctx.fillStyle = '#f5a050';
  ctx.fillRect(x + 7, y + 13, 3, 3);

  // Head
  ctx.fillStyle = '#f5a050';
  ctx.fillRect(x + 4, y + 5, 10, 9);

  // Hair (#f0b830 but rougher)
  ctx.fillStyle = '#d09020';
  ctx.fillRect(x + 3, y + 2, 12, 5);
  ctx.fillRect(x + 4, y + 1, 10, 3);
  ctx.fillRect(x + 2, y + 4, 3, 4);

  // Eye patch (left eye, black square)
  ctx.fillStyle = '#111111';
  ctx.fillRect(x + 5, y + 8, 4, 3);
  // Eye patch strap
  ctx.fillRect(x + 3, y + 9, 3, 1);
  ctx.fillRect(x + 9, y + 8, 3, 1);

  // Right eye (resolute)
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 11, y + 9, 2, 1);

  // Grimace
  ctx.fillStyle = '#d0806a';
  ctx.fillRect(x + 6, y + 12, 5, 1);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 7, y + 12, 3, 1);
}

// ─────────────────────────────────────────────
// UNCLE-BOB — Uncle Bob — #34d399
// ─────────────────────────────────────────────

function drawSprite_unclebob_A(ctx, cx, cy) {
  // A: Clean Coder — button-down, whiteboard with SOLID, marker in hand
  const x = cx - 10;
  const y = cy - 40;

  // Pants (#2a2a4a dark)
  ctx.fillStyle = '#2a2a4a';
  ctx.fillRect(x + 3, y + 28, 4, 12);
  ctx.fillRect(x + 9, y + 28, 4, 12);

  // Shoes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + 2, y + 38, 5, 2);
  ctx.fillRect(x + 9, y + 38, 5, 2);

  // Button-down shirt (#34d399)
  ctx.fillStyle = '#34d399';
  ctx.fillRect(x + 2, y + 15, 12, 14);

  // Collar
  ctx.fillStyle = '#20b880';
  ctx.fillRect(x + 6, y + 15, 5, 3);

  // Shirt buttons (#ffffff)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 8, y + 17, 1, 1);
  ctx.fillRect(x + 8, y + 20, 1, 1);
  ctx.fillRect(x + 8, y + 23, 1, 1);
  ctx.fillRect(x + 8, y + 26, 1, 1);

  // Arms — one holding marker
  ctx.fillStyle = '#34d399';
  ctx.fillRect(x + 0, y + 17, 3, 8);
  ctx.fillRect(x + 13, y + 17, 3, 7);

  // Marker (#34d399 green marker)
  ctx.fillStyle = '#34d399';
  ctx.fillRect(x + 14, y + 23, 2, 6);
  ctx.fillStyle = '#111111';
  ctx.fillRect(x + 14, y + 28, 2, 1);

  // Whiteboard (behind, offset left)
  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(x - 8, y + 5, 18, 14);
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(x - 8, y + 5, 18, 1);
  ctx.fillRect(x - 8, y + 18, 18, 1);
  // SOLID acronym on board
  ctx.fillStyle = '#34d399';
  ctx.fillRect(x - 7, y + 7, 2, 4); // S
  ctx.fillRect(x - 4, y + 7, 2, 4); // O
  ctx.fillRect(x - 1, y + 7, 2, 4); // L
  ctx.fillRect(x + 2, y + 7, 2, 4); // I
  ctx.fillRect(x + 5, y + 7, 2, 4); // D
  ctx.fillStyle = '#20b880';
  ctx.fillRect(x - 7, y + 7, 2, 1);
  ctx.fillRect(x - 7, y + 9, 2, 1);
  ctx.fillRect(x - 7, y + 11, 2, 1);

  // Neck
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 7, y + 12, 3, 3);

  // Head
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 5, y + 5, 8, 8);

  // Neat short hair / partially bald (#8a6a4a)
  ctx.fillStyle = '#8a6a4a';
  ctx.fillRect(x + 5, y + 4, 8, 3);
  ctx.fillRect(x + 5, y + 5, 2, 2);
  ctx.fillRect(x + 11, y + 5, 2, 2);

  // Glasses (#888888)
  ctx.fillStyle = '#888888';
  ctx.fillRect(x + 5, y + 8, 3, 2);
  ctx.fillRect(x + 10, y + 8, 3, 2);
  ctx.fillRect(x + 8, y + 8, 2, 1);

  // Eyes
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 6, y + 9, 1, 1);
  ctx.fillRect(x + 11, y + 9, 1, 1);

  // Confident smile
  ctx.fillStyle = '#c0906a';
  ctx.fillRect(x + 7, y + 11, 4, 1);
  ctx.fillRect(x + 10, y + 10, 1, 1);
}

function drawSprite_unclebob_B(ctx, cx, cy) {
  // B: Bowtie Bob — full bowtie, vest, pocketwatch chain, code printout
  const x = cx - 10;
  const y = cy - 40;

  // Trousers (#1a2a3a dark)
  ctx.fillStyle = '#1a2a3a';
  ctx.fillRect(x + 3, y + 28, 4, 12);
  ctx.fillRect(x + 9, y + 28, 4, 12);

  // Shoes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + 2, y + 38, 5, 2);
  ctx.fillRect(x + 9, y + 38, 5, 2);

  // Vest (#34d399)
  ctx.fillStyle = '#34d399';
  ctx.fillRect(x + 2, y + 15, 12, 14);

  // Vest buttons
  ctx.fillStyle = '#20b880';
  ctx.fillRect(x + 2, y + 15, 4, 14); // left panel
  ctx.fillRect(x + 10, y + 15, 4, 14); // right panel

  // White shirt front
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 6, y + 15, 5, 14);

  // Vest buttons
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(x + 8, y + 18, 1, 1);
  ctx.fillRect(x + 8, y + 21, 1, 1);
  ctx.fillRect(x + 8, y + 24, 1, 1);

  // Pocketwatch chain (#ffd700)
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(x + 5, y + 19, 1, 5);
  ctx.fillRect(x + 5, y + 23, 3, 1);

  // Arms
  ctx.fillStyle = '#34d399';
  ctx.fillRect(x + 0, y + 17, 3, 9);
  ctx.fillRect(x + 13, y + 17, 3, 9);

  // Code printout in hand
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x - 3, y + 23, 5, 8);
  ctx.fillStyle = '#34d399';
  ctx.fillRect(x - 2, y + 24, 3, 1);
  ctx.fillRect(x - 2, y + 26, 3, 1);
  ctx.fillRect(x - 2, y + 28, 3, 1);

  // Neck
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 7, y + 12, 3, 3);

  // Bowtie (#34d399) — full butterfly shape
  ctx.fillStyle = '#34d399';
  ctx.fillRect(x + 5, y + 13, 3, 2); // left wing
  ctx.fillRect(x + 10, y + 13, 3, 2); // right wing
  ctx.fillStyle = '#20b880';
  ctx.fillRect(x + 8, y + 13, 2, 2); // center knot

  // Head
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 5, y + 5, 8, 8);

  // Neat hair / slight balding
  ctx.fillStyle = '#8a6a4a';
  ctx.fillRect(x + 5, y + 4, 8, 3);
  ctx.fillRect(x + 4, y + 5, 2, 3);
  ctx.fillRect(x + 12, y + 5, 2, 3);

  // Glasses
  ctx.fillStyle = '#888888';
  ctx.fillRect(x + 5, y + 8, 3, 2);
  ctx.fillRect(x + 10, y + 8, 3, 2);
  ctx.fillRect(x + 8, y + 8, 2, 1);

  // Eyes
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 6, y + 9, 1, 1);
  ctx.fillRect(x + 11, y + 9, 1, 1);

  // Dignified smile
  ctx.fillStyle = '#c0906a';
  ctx.fillRect(x + 7, y + 11, 4, 1);
}

function drawSprite_unclebob_C(ctx, cx, cy) {
  // C: Furious Refactorer — sleeves rolled up, red face, scribbling out bad code
  const x = cx - 10;
  const y = cy - 40;

  // Trousers (#2a2a4a)
  ctx.fillStyle = '#2a2a4a';
  ctx.fillRect(x + 3, y + 28, 4, 12);
  ctx.fillRect(x + 9, y + 28, 4, 12);

  // Shoes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + 2, y + 38, 5, 2);
  ctx.fillRect(x + 9, y + 38, 5, 2);

  // Shirt (sleeves rolled, #34d399)
  ctx.fillStyle = '#34d399';
  ctx.fillRect(x + 2, y + 15, 12, 14);

  // Rolled sleeve cuffs (#20b880)
  ctx.fillStyle = '#20b880';
  ctx.fillRect(x + 0, y + 22, 3, 2);
  ctx.fillRect(x + 13, y + 22, 3, 2);

  // Forearms exposed (#f5d0a9)
  ctx.fillStyle = '#f5d0a9';
  ctx.fillRect(x + 0, y + 24, 3, 5);
  ctx.fillRect(x + 13, y + 24, 3, 5);

  // Upper arms (sleeves)
  ctx.fillStyle = '#34d399';
  ctx.fillRect(x + 0, y + 17, 3, 6);
  ctx.fillRect(x + 13, y + 17, 3, 6);

  // Code page being attacked (in hands)
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 14, y + 26, 7, 9);
  // Bad code lines
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(x + 15, y + 27, 5, 1);
  ctx.fillRect(x + 15, y + 29, 5, 1);
  ctx.fillRect(x + 15, y + 31, 5, 1);
  // Scribble-outs (X marks over bad code)
  ctx.fillStyle = '#cc0000';
  ctx.fillRect(x + 15, y + 27, 5, 5); // big scratch-out area
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 16, y + 28, 1, 1);
  ctx.fillRect(x + 18, y + 28, 1, 1);
  ctx.fillRect(x + 17, y + 29, 1, 1);
  ctx.fillRect(x + 16, y + 30, 1, 1);
  ctx.fillRect(x + 18, y + 30, 1, 1);

  // Collar (disheveled, open)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 6, y + 15, 5, 4);
  ctx.fillStyle = '#20b880';
  ctx.fillRect(x + 6, y + 15, 2, 6);
  ctx.fillRect(x + 10, y + 15, 2, 6);

  // Neck
  ctx.fillStyle = '#f5a0a0'; // red flush
  ctx.fillRect(x + 7, y + 12, 3, 3);

  // Head (red with fury #ff9999)
  ctx.fillStyle = '#ff9999';
  ctx.fillRect(x + 5, y + 5, 8, 8);

  // Veins on forehead
  ctx.fillStyle = '#cc4444';
  ctx.fillRect(x + 6, y + 6, 1, 2);
  ctx.fillRect(x + 11, y + 6, 1, 2);

  // Glasses (slightly askew)
  ctx.fillStyle = '#888888';
  ctx.fillRect(x + 5, y + 8, 3, 2);
  ctx.fillRect(x + 10, y + 9, 3, 2);
  ctx.fillRect(x + 8, y + 8, 2, 2);

  // Furious eyes
  ctx.fillStyle = '#cc0000';
  ctx.fillRect(x + 6, y + 9, 1, 1);
  ctx.fillRect(x + 11, y + 10, 1, 1);

  // Scowl / grimace
  ctx.fillStyle = '#cc4444';
  ctx.fillRect(x + 6, y + 12, 5, 1);
  ctx.fillRect(x + 6, y + 11, 2, 1);
  ctx.fillRect(x + 9, y + 11, 2, 1);

  // Hair (disheveled)
  ctx.fillStyle = '#8a6a4a';
  ctx.fillRect(x + 5, y + 3, 8, 4);
  ctx.fillRect(x + 4, y + 4, 2, 3);
  ctx.fillRect(x + 12, y + 4, 3, 2);
  ctx.fillRect(x + 11, y + 3, 2, 2); // cowlick
}

// ─────────────────────────────────────────────
// SPENGLER — Spengler the Doomed — #94a3b8
// ─────────────────────────────────────────────

function drawSprite_spengler_A(ctx, cx, cy) {
  // A: Decline Scholar — 1920s academic, heavy overcoat, pince-nez, stack of books
  const x = cx - 10;
  const y = cy - 40;

  // Book stack on ground (left side)
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(x - 4, y + 34, 7, 3);
  ctx.fillStyle = '#4a7a2a';
  ctx.fillRect(x - 4, y + 31, 7, 3);
  ctx.fillStyle = '#2a3a7a';
  ctx.fillRect(x - 4, y + 28, 7, 3);
  ctx.fillStyle = '#7a2a2a';
  ctx.fillRect(x - 4, y + 25, 7, 3);

  // Leg / trouser bottoms (#3a3a3a)
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x + 3, y + 32, 4, 8);
  ctx.fillRect(x + 9, y + 32, 4, 8);

  // Shoes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + 2, y + 38, 5, 2);
  ctx.fillRect(x + 9, y + 38, 5, 2);

  // Heavy overcoat (#4a5568 dark grey)
  ctx.fillStyle = '#4a5568';
  ctx.fillRect(x + 0, y + 14, 16, 20);

  // Overcoat collar (upturned)
  ctx.fillStyle = '#2d3748';
  ctx.fillRect(x + 0, y + 14, 5, 8);
  ctx.fillRect(x + 11, y + 14, 5, 8);

  // Coat buttons
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 8, y + 17, 1, 1);
  ctx.fillRect(x + 8, y + 20, 1, 1);
  ctx.fillRect(x + 8, y + 23, 1, 1);

  // Scarf / cravat (#94a3b8)
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 6, y + 14, 5, 4);

  // Arms at sides, slightly drooped
  ctx.fillStyle = '#4a5568';
  ctx.fillRect(x + 0, y + 20, 2, 10);
  ctx.fillRect(x + 14, y + 20, 2, 10);

  // Neck
  ctx.fillStyle = '#d0c8b8';
  ctx.fillRect(x + 7, y + 11, 3, 3);

  // Head (gaunt, long)
  ctx.fillStyle = '#d0c8b8';
  ctx.fillRect(x + 5, y + 4, 8, 8);

  // Dark hair, side-parted (#2a1a0a)
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(x + 5, y + 3, 8, 3);
  ctx.fillRect(x + 5, y + 4, 3, 3);

  // Pince-nez glasses (#888888 — on nose, no arms)
  ctx.fillStyle = '#888888';
  ctx.fillRect(x + 6, y + 8, 2, 1);
  ctx.fillRect(x + 10, y + 8, 2, 1);
  ctx.fillRect(x + 8, y + 7, 2, 2); // nose bridge / pinch

  // Eyes (downward, grave)
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x + 6, y + 9, 2, 1);
  ctx.fillRect(x + 10, y + 9, 2, 1);

  // Somber, downturned mouth
  ctx.fillStyle = '#a0988a';
  ctx.fillRect(x + 7, y + 11, 3, 1);
  ctx.fillRect(x + 7, y + 12, 1, 1);
  ctx.fillRect(x + 9, y + 12, 1, 1);
}

function drawSprite_spengler_B(ctx, cx, cy) {
  // B: Prophet of Doom — dark hooded robe, hourglass, skeletal thin, dramatic gesture
  const x = cx - 10;
  const y = cy - 40;

  // Robe base (#1a1a2e near-black)
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 2, y + 14, 12, 26);

  // Robe hem flares
  ctx.fillRect(x + 0, y + 30, 3, 10);
  ctx.fillRect(x + 13, y + 30, 3, 10);

  // Hood (#0a0a1e)
  ctx.fillStyle = '#0a0a1e';
  ctx.fillRect(x + 3, y + 4, 10, 12);
  ctx.fillRect(x + 2, y + 5, 3, 8);
  ctx.fillRect(x + 11, y + 5, 3, 8);

  // Robe trim (#94a3b8)
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 2, y + 14, 12, 1);
  ctx.fillRect(x + 3, y + 4, 10, 1);
  ctx.fillRect(x + 7, y + 14, 2, 26); // center robe line

  // Arms (dramatic gesture — one raised, one holding hourglass)
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x - 2, y + 14, 5, 3); // left arm dramatic raise
  ctx.fillRect(x - 3, y + 10, 3, 6);
  ctx.fillRect(x + 13, y + 16, 5, 8); // right arm, hourglass

  // Dramatic pointing finger (left)
  ctx.fillStyle = '#c0b0a0';
  ctx.fillRect(x - 4, y + 9, 2, 2);

  // Hourglass (#f5e0c0 sand, #888 glass)
  ctx.fillStyle = '#888888';
  ctx.fillRect(x + 16, y + 20, 4, 1);
  ctx.fillRect(x + 16, y + 28, 4, 1);
  ctx.fillStyle = '#f5e0c0';
  ctx.fillRect(x + 17, y + 21, 2, 3);
  ctx.fillStyle = '#d4c0a0';
  ctx.fillRect(x + 17, y + 25, 2, 3);
  ctx.fillStyle = '#888888';
  ctx.fillRect(x + 17, y + 24, 2, 1); // narrow
  ctx.fillRect(x + 16, y + 20, 4, 1);
  ctx.fillRect(x + 16, y + 28, 4, 1);

  // Gaunt face in shadow
  ctx.fillStyle = '#c0b0a0';
  ctx.fillRect(x + 5, y + 7, 8, 8);

  // Skeletal thin features
  ctx.fillStyle = '#a09080';
  ctx.fillRect(x + 5, y + 7, 1, 7); // gaunt cheek left
  ctx.fillRect(x + 12, y + 7, 1, 7); // gaunt cheek right

  // Deep-set eyes
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 5, y + 8, 3, 3);
  ctx.fillRect(x + 10, y + 8, 3, 3);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 6, y + 9, 1, 1);
  ctx.fillRect(x + 11, y + 9, 1, 1);

  // Hooked nose
  ctx.fillStyle = '#a09080';
  ctx.fillRect(x + 8, y + 11, 2, 2);
  ctx.fillRect(x + 7, y + 12, 1, 1);

  // Thin grimace
  ctx.fillStyle = '#8a7860';
  ctx.fillRect(x + 7, y + 13, 4, 1);
}

function drawSprite_spengler_C(ctx, cx, cy) {
  // C: Pragmatic Doomer — disheveled normal clothes, dark circles, resigned posture, coffee
  const x = cx - 10;
  const y = cy - 40;

  // Trousers (rumpled #445566)
  ctx.fillStyle = '#445566';
  ctx.fillRect(x + 3, y + 27, 5, 13);
  ctx.fillRect(x + 8, y + 27, 5, 13);

  // Shoes (scuffed)
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x + 2, y + 38, 6, 2);
  ctx.fillRect(x + 8, y + 38, 6, 2);

  // Untucked shirt (#94a3b8)
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 2, y + 15, 12, 14);

  // Shirt untucked hem
  ctx.fillRect(x + 1, y + 25, 4, 4);
  ctx.fillRect(x + 11, y + 24, 4, 4);

  // Shirt wrinkles
  ctx.fillStyle = '#7a8fa8';
  ctx.fillRect(x + 4, y + 17, 1, 5);
  ctx.fillRect(x + 11, y + 19, 1, 5);
  ctx.fillRect(x + 7, y + 22, 1, 4);

  // Open collar
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 6, y + 15, 5, 4);
  ctx.fillStyle = '#7a8fa8';
  ctx.fillRect(x + 6, y + 15, 2, 5);
  ctx.fillRect(x + 10, y + 15, 2, 5);

  // Arms — slumped, one holding coffee
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 0, y + 18, 3, 9);
  ctx.fillRect(x + 13, y + 18, 3, 9);

  // Coffee cup (held limply)
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(x + 13, y + 26, 4, 5);
  ctx.fillStyle = '#8b5e3c';
  ctx.fillRect(x + 14, y + 25, 2, 1);
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(x + 13, y + 26, 4, 1); // coffee surface dark
  // Cup handle
  ctx.fillStyle = '#5a3820';
  ctx.fillRect(x + 17, y + 27, 1, 3);

  // Neck
  ctx.fillStyle = '#d0c8b8';
  ctx.fillRect(x + 7, y + 12, 3, 3);

  // Head (tired)
  ctx.fillStyle = '#d0c8b8';
  ctx.fillRect(x + 5, y + 5, 8, 8);

  // Disheveled hair (messy #4a3820)
  ctx.fillStyle = '#4a3820';
  ctx.fillRect(x + 5, y + 3, 8, 4);
  ctx.fillRect(x + 4, y + 4, 2, 4);
  ctx.fillRect(x + 12, y + 4, 3, 3);
  ctx.fillRect(x + 6, y + 2, 2, 2); // stray hair
  ctx.fillRect(x + 10, y + 3, 3, 1);

  // Dark circles under eyes (#7a8fa8 shadow)
  ctx.fillStyle = '#7a8fa8';
  ctx.fillRect(x + 6, y + 10, 3, 2);
  ctx.fillRect(x + 10, y + 10, 3, 2);

  // Tired half-lidded eyes
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x + 7, y + 9, 1, 1);
  ctx.fillRect(x + 11, y + 9, 1, 1);
  // Heavy eyelids
  ctx.fillStyle = '#b0a898';
  ctx.fillRect(x + 6, y + 8, 3, 1);
  ctx.fillRect(x + 10, y + 8, 3, 1);

  // Resigned, flat mouth
  ctx.fillStyle = '#a0988a';
  ctx.fillRect(x + 7, y + 12, 4, 1);

  // Slouch — shoulders down
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 0, y + 15, 4, 3); // low left shoulder
  ctx.fillRect(x + 12, y + 15, 4, 3); // low right shoulder
}
