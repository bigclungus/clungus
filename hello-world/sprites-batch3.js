// sprites-batch3.js — Pixel art sprite variants for bloodfeast, adelbert, jhaddu, morgan, the-kid
// Each function: cx = horizontal center, cy = bottom edge. fillRect only. ~40px tall, ~20px wide.

// ─── BLOODFEAST (Holden Bloodfeast) — #dc2626 ────────────────────────────────

function drawSprite_bloodfeast_A(ctx, cx, cy) {
  // Classic Bloodfeast — massive blob in wheelchair, oxygen mask, raised tiny fist
  // ~1.5x wider than standard sprites: 30px wide, centered on cx
  const x = Math.floor(cx - 15);
  const y = Math.floor(cy - 44);

  // === WHEELCHAIR ===
  // Big rear wheel (left)
  ctx.fillStyle = '#555566';
  ctx.fillRect(x + 0, y + 26, 3, 18);  // left spoke vertical
  ctx.fillRect(x + 0, y + 26, 14, 3);  // top of wheel arc
  ctx.fillRect(x + 0, y + 41, 14, 3);  // bottom of wheel arc
  ctx.fillRect(x + 11, y + 26, 3, 18); // right side of wheel
  // wheel spokes
  ctx.fillStyle = '#888899';
  ctx.fillRect(x + 5, y + 28, 2, 13);
  ctx.fillRect(x + 1, y + 32, 11, 2);
  // Big rear wheel (right)
  ctx.fillStyle = '#555566';
  ctx.fillRect(x + 17, y + 26, 3, 18);
  ctx.fillRect(x + 17, y + 26, 13, 3);
  ctx.fillRect(x + 17, y + 41, 13, 3);
  ctx.fillRect(x + 27, y + 26, 3, 18);
  ctx.fillStyle = '#888899';
  ctx.fillRect(x + 22, y + 28, 2, 13);
  ctx.fillRect(x + 18, y + 32, 11, 2);
  // Small front caster wheels
  ctx.fillStyle = '#444455';
  ctx.fillRect(x + 11, y + 40, 5, 4);
  ctx.fillRect(x + 14, y + 40, 5, 4);
  // Seat frame
  ctx.fillStyle = '#778899';
  ctx.fillRect(x + 11, y + 20, 9, 3);  // seat bar
  ctx.fillRect(x + 11, y + 20, 2, 22); // left frame post
  ctx.fillRect(x + 18, y + 20, 2, 22); // right frame post
  // Footrests
  ctx.fillStyle = '#667788';
  ctx.fillRect(x + 10, y + 38, 11, 2);
  ctx.fillRect(x + 11, y + 40, 2, 4);
  ctx.fillRect(x + 18, y + 40, 2, 4);

  // === OXYGEN TANK (right side of chair) ===
  ctx.fillStyle = '#c0c8d0';
  ctx.fillRect(x + 24, y + 18, 5, 18); // tank body
  ctx.fillStyle = '#a0a8b0';
  ctx.fillRect(x + 24, y + 18, 5, 3);  // tank top
  ctx.fillRect(x + 24, y + 33, 5, 3);  // tank bottom
  // Valve on top
  ctx.fillStyle = '#667788';
  ctx.fillRect(x + 26, y + 15, 2, 4);
  ctx.fillRect(x + 25, y + 16, 4, 2);
  // Tubing from tank to face (runs left across top)
  ctx.fillStyle = '#88aa66';
  ctx.fillRect(x + 25, y + 17, 1, 2);
  ctx.fillRect(x + 14, y + 16, 12, 2); // horizontal tube
  ctx.fillRect(x + 14, y + 16, 2, 5);  // drop to face

  // === MASSIVE BLOB BODY ===
  ctx.fillStyle = '#d4905a';
  ctx.fillRect(x + 4, y + 20, 22, 18); // main torso blob
  ctx.fillRect(x + 2, y + 22, 26, 14); // extra girth sides
  ctx.fillRect(x + 5, y + 17, 20, 5);  // upper torso bulge
  // Belly rolls
  ctx.fillStyle = '#c07848';
  ctx.fillRect(x + 3, y + 28, 24, 2);
  ctx.fillRect(x + 3, y + 32, 24, 2);
  // Shirt / robe (dark maroon, barely fits)
  ctx.fillStyle = '#6a1a1a';
  ctx.fillRect(x + 4, y + 20, 22, 8);  // shirt front
  ctx.fillRect(x + 4, y + 20, 2, 16);  // shirt left side
  ctx.fillRect(x + 24, y + 20, 2, 16); // shirt right side

  // === HEAD (big, round, jowly) ===
  ctx.fillStyle = '#d4905a';
  ctx.fillRect(x + 6, y + 6, 18, 13); // head block
  ctx.fillRect(x + 4, y + 8, 22, 9);  // extra width for jowls
  ctx.fillRect(x + 7, y + 4, 16, 4);  // top of head
  // Jowl shading
  ctx.fillStyle = '#b87040';
  ctx.fillRect(x + 4, y + 13, 5, 5);
  ctx.fillRect(x + 21, y + 13, 5, 5);
  // Chin double
  ctx.fillStyle = '#c88050';
  ctx.fillRect(x + 6, y + 17, 18, 3);

  // === OXYGEN MASK ===
  ctx.fillStyle = '#88aa88';
  ctx.fillRect(x + 9, y + 13, 12, 5); // mask body
  ctx.fillStyle = '#aaccaa';
  ctx.fillRect(x + 10, y + 14, 10, 3); // mask highlight
  // Mask straps
  ctx.fillStyle = '#557755';
  ctx.fillRect(x + 8, y + 13, 2, 3);
  ctx.fillRect(x + 20, y + 13, 2, 3);

  // === EYES (small, piggy, above mask) ===
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(x + 10, y + 10, 3, 2);
  ctx.fillRect(x + 17, y + 10, 3, 2);
  // Eye gleam
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 10, y + 10, 1, 1);
  ctx.fillRect(x + 17, y + 10, 1, 1);
  // Bushy brows
  ctx.fillStyle = '#6a4020';
  ctx.fillRect(x + 9, y + 9, 5, 1);
  ctx.fillRect(x + 16, y + 9, 5, 1);

  // === TINY RAISED FIST (left arm) — approval ===
  ctx.fillStyle = '#6a1a1a'; // sleeve
  ctx.fillRect(x + 1, y + 22, 4, 8);
  ctx.fillRect(x + 0, y + 18, 4, 6); // arm raised up
  // fist
  ctx.fillStyle = '#d4905a';
  ctx.fillRect(x + 0, y + 15, 4, 4);
  // knuckle lines
  ctx.fillStyle = '#b87040';
  ctx.fillRect(x + 0, y + 16, 4, 1);
  // thumb
  ctx.fillRect(x - 1, y + 16, 2, 2);

  // === RIGHT ARM (resting on wheelchair arm) ===
  ctx.fillStyle = '#6a1a1a';
  ctx.fillRect(x + 25, y + 22, 4, 8);
  ctx.fillStyle = '#d4905a';
  ctx.fillRect(x + 25, y + 29, 4, 3); // hand resting
}

function drawSprite_bloodfeast_B(ctx, cx, cy) {
  // Warmonger Bloodfeast — blob in wheelchair, oxygen tank, waving tiny flag, medals on chest
  const x = Math.floor(cx - 15);
  const y = Math.floor(cy - 44);

  // === WHEELCHAIR ===
  ctx.fillStyle = '#555566';
  ctx.fillRect(x + 0, y + 26, 3, 18);
  ctx.fillRect(x + 0, y + 26, 14, 3);
  ctx.fillRect(x + 0, y + 41, 14, 3);
  ctx.fillRect(x + 11, y + 26, 3, 18);
  ctx.fillStyle = '#888899';
  ctx.fillRect(x + 5, y + 28, 2, 13);
  ctx.fillRect(x + 1, y + 32, 11, 2);
  ctx.fillStyle = '#555566';
  ctx.fillRect(x + 17, y + 26, 3, 18);
  ctx.fillRect(x + 17, y + 26, 13, 3);
  ctx.fillRect(x + 17, y + 41, 13, 3);
  ctx.fillRect(x + 27, y + 26, 3, 18);
  ctx.fillStyle = '#888899';
  ctx.fillRect(x + 22, y + 28, 2, 13);
  ctx.fillRect(x + 18, y + 32, 11, 2);
  ctx.fillStyle = '#444455';
  ctx.fillRect(x + 11, y + 40, 5, 4);
  ctx.fillRect(x + 14, y + 40, 5, 4);
  ctx.fillStyle = '#778899';
  ctx.fillRect(x + 11, y + 20, 9, 3);
  ctx.fillRect(x + 11, y + 20, 2, 22);
  ctx.fillRect(x + 18, y + 20, 2, 22);
  ctx.fillStyle = '#667788';
  ctx.fillRect(x + 10, y + 38, 11, 2);
  ctx.fillRect(x + 11, y + 40, 2, 4);
  ctx.fillRect(x + 18, y + 40, 2, 4);

  // === OXYGEN TANK ===
  ctx.fillStyle = '#c0c8d0';
  ctx.fillRect(x + 24, y + 18, 5, 18);
  ctx.fillStyle = '#a0a8b0';
  ctx.fillRect(x + 24, y + 18, 5, 3);
  ctx.fillRect(x + 24, y + 33, 5, 3);
  ctx.fillStyle = '#667788';
  ctx.fillRect(x + 26, y + 15, 2, 4);
  ctx.fillRect(x + 25, y + 16, 4, 2);
  // Tubing
  ctx.fillStyle = '#88aa66';
  ctx.fillRect(x + 25, y + 17, 1, 2);
  ctx.fillRect(x + 14, y + 16, 12, 2);
  ctx.fillRect(x + 14, y + 16, 2, 5);

  // === MASSIVE BLOB BODY ===
  ctx.fillStyle = '#d4905a';
  ctx.fillRect(x + 4, y + 20, 22, 18);
  ctx.fillRect(x + 2, y + 22, 26, 14);
  ctx.fillRect(x + 5, y + 17, 20, 5);
  ctx.fillStyle = '#c07848';
  ctx.fillRect(x + 3, y + 28, 24, 2);
  ctx.fillRect(x + 3, y + 32, 24, 2);
  // Military dress shirt (olive green, barely fits)
  ctx.fillStyle = '#4a5a30';
  ctx.fillRect(x + 4, y + 20, 22, 8);
  ctx.fillRect(x + 4, y + 20, 2, 16);
  ctx.fillRect(x + 24, y + 20, 2, 16);
  // Medals — row of colorful dots
  ctx.fillStyle = '#c8a020'; // gold
  ctx.fillRect(x + 7, y + 21, 2, 2);
  ctx.fillRect(x + 10, y + 21, 2, 2);
  ctx.fillRect(x + 13, y + 21, 2, 2);
  ctx.fillRect(x + 16, y + 21, 2, 2);
  // ribbons under medals
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(x + 7, y + 23, 2, 1);
  ctx.fillRect(x + 13, y + 23, 2, 1);
  ctx.fillStyle = '#3060c0';
  ctx.fillRect(x + 10, y + 23, 2, 1);
  ctx.fillRect(x + 16, y + 23, 2, 1);

  // === HEAD ===
  ctx.fillStyle = '#d4905a';
  ctx.fillRect(x + 6, y + 6, 18, 13);
  ctx.fillRect(x + 4, y + 8, 22, 9);
  ctx.fillRect(x + 7, y + 4, 16, 4);
  ctx.fillStyle = '#b87040';
  ctx.fillRect(x + 4, y + 13, 5, 5);
  ctx.fillRect(x + 21, y + 13, 5, 5);
  ctx.fillStyle = '#c88050';
  ctx.fillRect(x + 6, y + 17, 18, 3);

  // === OXYGEN MASK ===
  ctx.fillStyle = '#88aa88';
  ctx.fillRect(x + 9, y + 13, 12, 5);
  ctx.fillStyle = '#aaccaa';
  ctx.fillRect(x + 10, y + 14, 10, 3);
  ctx.fillStyle = '#557755';
  ctx.fillRect(x + 8, y + 13, 2, 3);
  ctx.fillRect(x + 20, y + 13, 2, 3);

  // === EYES — excited, wide ===
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(x + 10, y + 10, 3, 2);
  ctx.fillRect(x + 17, y + 10, 3, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 10, y + 10, 1, 1);
  ctx.fillRect(x + 17, y + 10, 1, 1);
  ctx.fillStyle = '#6a4020';
  ctx.fillRect(x + 9, y + 9, 5, 1);
  ctx.fillRect(x + 16, y + 9, 5, 1);

  // === FLAG POLE (right arm raised, waving tiny flag) ===
  ctx.fillStyle = '#4a5a30'; // sleeve
  ctx.fillRect(x + 25, y + 22, 4, 8);
  ctx.fillRect(x + 26, y + 16, 3, 8); // arm raised
  ctx.fillStyle = '#d4905a'; // hand
  ctx.fillRect(x + 26, y + 13, 3, 4);
  // Flag pole
  ctx.fillStyle = '#8a7050';
  ctx.fillRect(x + 28, y + 4, 2, 12);
  // Flag (red, white, blue stripes)
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(x + 30, y + 4, 8, 3);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(x + 30, y + 7, 8, 2);
  ctx.fillStyle = '#2a50a0';
  ctx.fillRect(x + 30, y + 9, 8, 3);

  // === LEFT ARM (resting on wheelchair arm) ===
  ctx.fillStyle = '#4a5a30';
  ctx.fillRect(x + 1, y + 22, 4, 8);
  ctx.fillStyle = '#d4905a';
  ctx.fillRect(x + 1, y + 29, 4, 3);
}

function drawSprite_bloodfeast_C(ctx, cx, cy) {
  // Scheming Bloodfeast — blob in wheelchair, oxygen tank, leaning forward conspiratorially, monocle
  const x = Math.floor(cx - 15);
  const y = Math.floor(cy - 44);

  // === WHEELCHAIR (leaned forward slightly) ===
  ctx.fillStyle = '#555566';
  ctx.fillRect(x + 0, y + 28, 3, 16);
  ctx.fillRect(x + 0, y + 28, 14, 3);
  ctx.fillRect(x + 0, y + 41, 14, 3);
  ctx.fillRect(x + 11, y + 28, 3, 16);
  ctx.fillStyle = '#888899';
  ctx.fillRect(x + 5, y + 30, 2, 11);
  ctx.fillRect(x + 1, y + 34, 11, 2);
  ctx.fillStyle = '#555566';
  ctx.fillRect(x + 17, y + 28, 3, 16);
  ctx.fillRect(x + 17, y + 28, 13, 3);
  ctx.fillRect(x + 17, y + 41, 13, 3);
  ctx.fillRect(x + 27, y + 28, 3, 16);
  ctx.fillStyle = '#888899';
  ctx.fillRect(x + 22, y + 30, 2, 11);
  ctx.fillRect(x + 18, y + 34, 11, 2);
  ctx.fillStyle = '#444455';
  ctx.fillRect(x + 11, y + 40, 5, 4);
  ctx.fillRect(x + 14, y + 40, 5, 4);
  ctx.fillStyle = '#778899';
  ctx.fillRect(x + 11, y + 22, 9, 3);
  ctx.fillRect(x + 11, y + 22, 2, 20);
  ctx.fillRect(x + 18, y + 22, 2, 20);
  ctx.fillStyle = '#667788';
  ctx.fillRect(x + 10, y + 38, 11, 2);
  ctx.fillRect(x + 11, y + 40, 2, 4);
  ctx.fillRect(x + 18, y + 40, 2, 4);

  // === OXYGEN TANK ===
  ctx.fillStyle = '#c0c8d0';
  ctx.fillRect(x + 24, y + 20, 5, 18);
  ctx.fillStyle = '#a0a8b0';
  ctx.fillRect(x + 24, y + 20, 5, 3);
  ctx.fillRect(x + 24, y + 35, 5, 3);
  ctx.fillStyle = '#667788';
  ctx.fillRect(x + 26, y + 17, 2, 4);
  ctx.fillRect(x + 25, y + 18, 4, 2);
  ctx.fillStyle = '#88aa66';
  ctx.fillRect(x + 25, y + 19, 1, 2);
  ctx.fillRect(x + 13, y + 18, 13, 2);
  ctx.fillRect(x + 13, y + 18, 2, 6);

  // === MASSIVE BLOB BODY (leaning forward) ===
  ctx.fillStyle = '#d4905a';
  ctx.fillRect(x + 4, y + 22, 22, 18);
  ctx.fillRect(x + 2, y + 24, 26, 14);
  ctx.fillRect(x + 5, y + 19, 20, 5);
  ctx.fillStyle = '#c07848';
  ctx.fillRect(x + 3, y + 30, 24, 2);
  ctx.fillRect(x + 3, y + 34, 24, 2);
  // Dark waistcoat / vest
  ctx.fillStyle = '#2a1a3a';
  ctx.fillRect(x + 5, y + 22, 20, 10);
  ctx.fillRect(x + 4, y + 22, 2, 16);
  ctx.fillRect(x + 24, y + 22, 2, 16);
  // Waistcoat buttons
  ctx.fillStyle = '#c8a020';
  ctx.fillRect(x + 14, y + 23, 2, 2);
  ctx.fillRect(x + 14, y + 26, 2, 2);
  ctx.fillRect(x + 14, y + 29, 2, 2);
  // White collar/cravat
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(x + 12, y + 22, 6, 3);

  // === HEAD (tilted forward — leaning) ===
  ctx.fillStyle = '#d4905a';
  ctx.fillRect(x + 7, y + 8, 18, 13);   // slightly offset right (leaning)
  ctx.fillRect(x + 5, y + 10, 22, 9);
  ctx.fillRect(x + 8, y + 6, 16, 4);
  ctx.fillStyle = '#b87040';
  ctx.fillRect(x + 5, y + 15, 5, 5);
  ctx.fillRect(x + 22, y + 15, 5, 5);
  ctx.fillStyle = '#c88050';
  ctx.fillRect(x + 7, y + 19, 18, 3);

  // === OXYGEN MASK ===
  ctx.fillStyle = '#88aa88';
  ctx.fillRect(x + 10, y + 15, 12, 5);
  ctx.fillStyle = '#aaccaa';
  ctx.fillRect(x + 11, y + 16, 10, 3);
  ctx.fillStyle = '#557755';
  ctx.fillRect(x + 9, y + 15, 2, 3);
  ctx.fillRect(x + 21, y + 15, 2, 3);

  // === EYES — scheming, narrowed ===
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(x + 11, y + 11, 3, 1);  // left eye (narrow slit)
  ctx.fillRect(x + 18, y + 11, 3, 1);  // right eye (narrow slit)
  ctx.fillStyle = '#6a4020'; // heavy brows furrowed
  ctx.fillRect(x + 10, y + 10, 5, 1);
  ctx.fillRect(x + 17, y + 10, 5, 1);
  // Brow inner edges angled down (scheming V shape)
  ctx.fillRect(x + 14, y + 11, 1, 1);
  ctx.fillRect(x + 17, y + 11, 1, 1);

  // === MONOCLE (right eye) ===
  ctx.fillStyle = '#c8a020'; // gold frame
  ctx.fillRect(x + 17, y + 10, 6, 1);  // top
  ctx.fillRect(x + 17, y + 13, 6, 1);  // bottom
  ctx.fillRect(x + 17, y + 10, 1, 4);  // left side
  ctx.fillRect(x + 22, y + 10, 1, 4);  // right side
  // Monocle cord
  ctx.fillRect(x + 22, y + 12, 3, 1);
  ctx.fillRect(x + 24, y + 12, 1, 5);

  // === BOTH ARMS LEANING FORWARD ===
  // Left arm on surface/leaning
  ctx.fillStyle = '#2a1a3a';
  ctx.fillRect(x + 1, y + 24, 4, 9);
  ctx.fillRect(x + 1, y + 31, 8, 3);  // forearm extends forward
  ctx.fillStyle = '#d4905a';
  ctx.fillRect(x + 7, y + 31, 4, 4);  // hand clasped
  // Fingertips
  ctx.fillStyle = '#c07848';
  ctx.fillRect(x + 7, y + 33, 4, 2);
  // Right arm mirrored
  ctx.fillStyle = '#2a1a3a';
  ctx.fillRect(x + 25, y + 24, 4, 9);
  ctx.fillRect(x + 21, y + 31, 8, 3);
  ctx.fillStyle = '#d4905a';
  ctx.fillRect(x + 19, y + 31, 4, 4);
  ctx.fillStyle = '#c07848';
  ctx.fillRect(x + 19, y + 33, 4, 2);
}

// ─── ADELBERT (Adelbert Hominem) — #94a3b8 ───────────────────────────────────

function drawSprite_adelbert_A(ctx, cx, cy) {
  // Internet Troll — hunched, laptop, glasses reflecting screen, smug grin
  const x = Math.floor(cx - 10);
  const y = Math.floor(cy - 40);

  // Chair legs
  ctx.fillStyle = '#3a3040';
  ctx.fillRect(x + 2, y + 34, 2, 6);
  ctx.fillRect(x + 14, y + 34, 2, 6);

  // Seat
  ctx.fillStyle = '#4a405a';
  ctx.fillRect(x + 1, y + 31, 16, 3);

  // Legs (rumpled jeans)
  ctx.fillStyle = '#2a3050';
  ctx.fillRect(x + 4, y + 28, 5, 6);
  ctx.fillRect(x + 9, y + 28, 5, 6);

  // Body — hunched, t-shirt (muted gray)
  ctx.fillStyle = '#5a5868';
  ctx.fillRect(x + 3, y + 17, 14, 13);

  // Hunch — shoulders curved forward
  ctx.fillStyle = '#4a4858';
  ctx.fillRect(x + 3, y + 17, 2, 4);
  ctx.fillRect(x + 15, y + 17, 2, 4);

  // Laptop (open, on lap)
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x + 3, y + 26, 12, 7);  // base
  ctx.fillRect(x + 4, y + 19, 12, 8);  // screen open upward

  // Screen glow (blue-white)
  ctx.fillStyle = '#8ab8e0';
  ctx.fillRect(x + 5, y + 20, 10, 6);

  // Screen reflection in glasses (handled below)

  // Neck
  ctx.fillStyle = '#9a8878';
  ctx.fillRect(x + 8, y + 13, 4, 5);

  // Head
  ctx.fillStyle = '#a89880';
  ctx.fillRect(x + 6, y + 6, 8, 8);

  // Disheveled hair
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(x + 6, y + 6, 8, 2);
  ctx.fillRect(x + 5, y + 7, 2, 3);
  ctx.fillRect(x + 13, y + 7, 2, 2);
  ctx.fillRect(x + 7, y + 6, 1, 1); // cowlick

  // Glasses frame
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x + 6, y + 9, 3, 2);
  ctx.fillRect(x + 11, y + 9, 3, 2);
  ctx.fillRect(x + 9, y + 10, 2, 1); // bridge

  // Lens glow (screen reflected)
  ctx.fillStyle = '#7ab0d8';
  ctx.fillRect(x + 7, y + 9, 2, 2);
  ctx.fillRect(x + 11, y + 9, 2, 2);

  // Smug grin
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(x + 7, y + 12, 5, 1);
  ctx.fillRect(x + 11, y + 12, 1, 1); // smirk corner

  // Arms reaching to keyboard
  ctx.fillStyle = '#5a5868';
  ctx.fillRect(x + 2, y + 18, 3, 8);
  ctx.fillRect(x + 15, y + 18, 3, 8);
  // hands on keyboard
  ctx.fillStyle = '#a89880';
  ctx.fillRect(x + 2, y + 25, 3, 2);
  ctx.fillRect(x + 15, y + 25, 3, 2);
}

function drawSprite_adelbert_B(ctx, cx, cy) {
  // Armchair Philosopher — large armchair drawn, pointing upward making a point
  const x = Math.floor(cx - 10);
  const y = Math.floor(cy - 40);

  // Armchair — large, worn
  // Chair back (tall)
  ctx.fillStyle = '#6a4a2a';
  ctx.fillRect(x + 0, y + 6, 3, 30);   // left back post
  ctx.fillRect(x + 17, y + 6, 3, 30);  // right back post
  ctx.fillRect(x + 0, y + 6, 20, 4);   // top rail

  // Chair cushion back fill
  ctx.fillStyle = '#8a6040';
  ctx.fillRect(x + 3, y + 10, 14, 20);

  // Armrests
  ctx.fillStyle = '#7a5030';
  ctx.fillRect(x + 0, y + 20, 4, 2);
  ctx.fillRect(x + 16, y + 20, 4, 2);

  // Seat cushion
  ctx.fillStyle = '#9a7050';
  ctx.fillRect(x + 1, y + 28, 18, 5);

  // Chair legs
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(x + 1, y + 33, 3, 7);
  ctx.fillRect(x + 16, y + 33, 3, 7);

  // Person sitting in chair
  // Trousers
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(x + 5, y + 26, 4, 6);
  ctx.fillRect(x + 11, y + 26, 4, 6);

  // Body — tweed-ish sweater
  ctx.fillStyle = '#6a5a38';
  ctx.fillRect(x + 4, y + 16, 12, 11);

  // Collar
  ctx.fillStyle = '#e0d8c0';
  ctx.fillRect(x + 8, y + 16, 4, 3);

  // Neck
  ctx.fillStyle = '#a89870';
  ctx.fillRect(x + 8, y + 13, 4, 4);

  // Head
  ctx.fillStyle = '#b09870';
  ctx.fillRect(x + 6, y + 6, 8, 8);

  // Hair — thinning, messy
  ctx.fillStyle = '#4a3820';
  ctx.fillRect(x + 6, y + 6, 8, 2);
  ctx.fillRect(x + 14, y + 8, 1, 2);

  // Glasses (round)
  ctx.fillStyle = '#2a2020';
  ctx.fillRect(x + 6, y + 9, 3, 2);
  ctx.fillRect(x + 11, y + 9, 3, 2);
  ctx.fillRect(x + 9, y + 10, 2, 1);
  ctx.fillStyle = '#c8c0a0';
  ctx.fillRect(x + 7, y + 9, 2, 2);
  ctx.fillRect(x + 11, y + 9, 2, 2);

  // Mouth open — making a point
  ctx.fillStyle = '#7a5030';
  ctx.fillRect(x + 8, y + 12, 4, 1);
  ctx.fillRect(x + 9, y + 12, 2, 2); // open mouth

  // Right arm raised, finger pointing up
  ctx.fillStyle = '#6a5a38';
  ctx.fillRect(x + 16, y + 17, 3, 6);
  ctx.fillRect(x + 16, y + 12, 3, 6); // upper arm raised
  ctx.fillStyle = '#b09870';
  ctx.fillRect(x + 16, y + 10, 2, 3); // hand
  ctx.fillRect(x + 17, y + 7, 1, 4);  // finger pointing up

  // Left arm resting on armrest
  ctx.fillStyle = '#6a5a38';
  ctx.fillRect(x + 1, y + 18, 3, 6);
  ctx.fillStyle = '#b09870';
  ctx.fillRect(x + 1, y + 23, 3, 2);
}

function drawSprite_adelbert_C(ctx, cx, cy) {
  // Devil's Advocate — devil horns on head, one angel wing, sly smile
  const x = Math.floor(cx - 10);
  const y = Math.floor(cy - 40);

  // Shoes
  ctx.fillStyle = '#2a2020';
  ctx.fillRect(x + 4, y + 36, 5, 4);
  ctx.fillRect(x + 11, y + 36, 5, 4);

  // Trousers (dark)
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x + 5, y + 26, 4, 10);
  ctx.fillRect(x + 11, y + 26, 4, 10);

  // Body — casual dark jacket
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(x + 3, y + 14, 14, 13);

  // Collar
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 8, y + 14, 4, 3);

  // Neck
  ctx.fillStyle = '#a08870';
  ctx.fillRect(x + 8, y + 11, 4, 4);

  // Head
  ctx.fillStyle = '#b09870';
  ctx.fillRect(x + 6, y + 5, 8, 8);

  // Hair — dark, slight widow's peak
  ctx.fillStyle = '#2a1818';
  ctx.fillRect(x + 6, y + 5, 8, 2);
  ctx.fillRect(x + 9, y + 4, 2, 2); // widow's peak
  ctx.fillRect(x + 6, y + 7, 1, 2);
  ctx.fillRect(x + 13, y + 7, 1, 2);

  // Devil horns (small red rects on top of head)
  ctx.fillStyle = '#cc2020';
  ctx.fillRect(x + 7, y + 3, 2, 3);
  ctx.fillRect(x + 11, y + 3, 2, 3);
  // horn tips (pointy, one pixel)
  ctx.fillRect(x + 8, y + 2, 1, 1);
  ctx.fillRect(x + 12, y + 2, 1, 1);

  // Angel wing on left side only (white feathered)
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(x - 4, y + 12, 5, 8);
  ctx.fillRect(x - 5, y + 15, 4, 5);
  ctx.fillRect(x - 3, y + 10, 3, 4);
  // feather detail lines
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(x - 4, y + 14, 5, 1);
  ctx.fillRect(x - 4, y + 17, 5, 1);

  // Eyes — sly, half-lidded
  ctx.fillStyle = '#3a2820';
  ctx.fillRect(x + 7, y + 9, 2, 1);
  ctx.fillRect(x + 11, y + 9, 2, 1);
  // heavy brow
  ctx.fillStyle = '#2a1818';
  ctx.fillRect(x + 7, y + 8, 2, 1);
  ctx.fillRect(x + 11, y + 8, 2, 1);

  // Sly smile (asymmetric)
  ctx.fillStyle = '#7a5030';
  ctx.fillRect(x + 8, y + 12, 4, 1);
  ctx.fillRect(x + 12, y + 11, 1, 1); // smirk side up

  // Right arm — down at side (no wing)
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(x + 17, y + 15, 3, 11);
  ctx.fillStyle = '#a08870';
  ctx.fillRect(x + 17, y + 26, 3, 2);

  // Left arm (wing-side, partially hidden)
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(x + 0, y + 15, 3, 10);
  ctx.fillStyle = '#a08870';
  ctx.fillRect(x + 0, y + 25, 3, 2);
}

// ─── JHADDU — #fb923c ─────────────────────────────────────────────────────────

function drawSprite_jhaddu_A(ctx, cx, cy) {
  // Enterprise Consultant — expensive suit, luxury watch, confidence, branded laptop
  const x = Math.floor(cx - 10);
  const y = Math.floor(cy - 40);

  // Shoes (expensive, polished)
  ctx.fillStyle = '#1a0808';
  ctx.fillRect(x + 4, y + 36, 5, 4);
  ctx.fillRect(x + 11, y + 36, 5, 4);
  // shine on shoes
  ctx.fillStyle = '#3a1818';
  ctx.fillRect(x + 5, y + 36, 2, 1);
  ctx.fillRect(x + 12, y + 36, 2, 1);

  // Trousers (premium charcoal pinstripe)
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(x + 5, y + 26, 4, 10);
  ctx.fillRect(x + 11, y + 26, 4, 10);
  // pinstripe
  ctx.fillStyle = '#3a3a42';
  ctx.fillRect(x + 7, y + 26, 1, 10);
  ctx.fillRect(x + 13, y + 26, 1, 10);

  // Suit jacket (premium charcoal)
  ctx.fillStyle = '#2a2a38';
  ctx.fillRect(x + 3, y + 14, 14, 13);

  // Pocket square (orange, matching brand)
  ctx.fillStyle = '#fb923c';
  ctx.fillRect(x + 13, y + 15, 2, 2);

  // White shirt
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 8, y + 14, 4, 4);

  // Lapels
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(x + 6, y + 14, 3, 6);
  ctx.fillRect(x + 11, y + 14, 3, 6);

  // Tie (orange power tie)
  ctx.fillStyle = '#fb923c';
  ctx.fillRect(x + 9, y + 14, 2, 8);
  ctx.fillStyle = '#e07020';
  ctx.fillRect(x + 9, y + 15, 2, 2); // tie knot shadow

  // Luxury watch (gold, left wrist)
  ctx.fillStyle = '#c8a020';
  ctx.fillRect(x + 1, y + 25, 4, 3);
  ctx.fillStyle = '#e8c030';
  ctx.fillRect(x + 2, y + 25, 2, 2);

  // Neck
  ctx.fillStyle = '#c09060';
  ctx.fillRect(x + 8, y + 11, 4, 4);

  // Head (confident bearing)
  ctx.fillStyle = '#c8a070';
  ctx.fillRect(x + 6, y + 4, 8, 8);

  // Neat hair (well-groomed)
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(x + 6, y + 4, 8, 2);
  ctx.fillRect(x + 6, y + 6, 1, 1);
  ctx.fillRect(x + 13, y + 6, 1, 1);

  // Eyes (confident, direct)
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(x + 7, y + 8, 2, 2);
  ctx.fillRect(x + 11, y + 8, 2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 8, y + 8, 1, 1);
  ctx.fillRect(x + 12, y + 8, 1, 1);

  // Confident smile
  ctx.fillStyle = '#8a5a30';
  ctx.fillRect(x + 7, y + 11, 6, 1);
  ctx.fillRect(x + 7, y + 12, 1, 1);
  ctx.fillRect(x + 12, y + 12, 1, 1);

  // Left arm — carrying laptop
  ctx.fillStyle = '#2a2a38';
  ctx.fillRect(x + 0, y + 16, 3, 10);
  ctx.fillRect(x + 0, y + 24, 5, 3);

  // Branded laptop under arm (thin, premium)
  ctx.fillStyle = '#d0d0d0';
  ctx.fillRect(x - 1, y + 26, 7, 4);
  ctx.fillStyle = '#fb923c'; // brand logo
  ctx.fillRect(x + 1, y + 27, 2, 2);

  // Right arm — slightly out, confident posture
  ctx.fillStyle = '#2a2a38';
  ctx.fillRect(x + 17, y + 16, 3, 10);
  ctx.fillStyle = '#c8a070';
  ctx.fillRect(x + 17, y + 26, 3, 2);
}

function drawSprite_jhaddu_B(ctx, cx, cy) {
  // Pattern Evangelist — holding large book titled "Patterns", serene smile
  const x = Math.floor(cx - 10);
  const y = Math.floor(cy - 40);

  // Shoes
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(x + 4, y + 36, 5, 4);
  ctx.fillRect(x + 11, y + 36, 5, 4);

  // Trousers (warm tan)
  ctx.fillStyle = '#8a7050';
  ctx.fillRect(x + 5, y + 26, 4, 10);
  ctx.fillRect(x + 11, y + 26, 4, 10);

  // Body — relaxed blazer (warm orange-tan)
  ctx.fillStyle = '#c07840';
  ctx.fillRect(x + 3, y + 14, 14, 13);

  // Collar
  ctx.fillStyle = '#f0e8d0';
  ctx.fillRect(x + 8, y + 14, 4, 3);

  // Lapels
  ctx.fillStyle = '#a06030';
  ctx.fillRect(x + 6, y + 14, 3, 6);
  ctx.fillRect(x + 11, y + 14, 3, 6);

  // Neck
  ctx.fillStyle = '#c09060';
  ctx.fillRect(x + 8, y + 11, 4, 4);

  // Head
  ctx.fillStyle = '#c8a070';
  ctx.fillRect(x + 6, y + 4, 8, 8);

  // Hair
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(x + 6, y + 4, 8, 2);

  // Eyes — serene, warm
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(x + 7, y + 8, 2, 2);
  ctx.fillRect(x + 11, y + 8, 2, 2);

  // Serene smile
  ctx.fillStyle = '#8a5a30';
  ctx.fillRect(x + 7, y + 11, 6, 1);
  ctx.fillRect(x + 7, y + 12, 1, 1);
  ctx.fillRect(x + 12, y + 12, 1, 1);

  // Large book held in both hands in front
  ctx.fillStyle = '#1a3a6a';  // book cover (blue/deep)
  ctx.fillRect(x + 2, y + 20, 15, 12);
  ctx.fillStyle = '#0e2a50';  // book spine
  ctx.fillRect(x + 2, y + 20, 2, 12);
  ctx.fillStyle = '#f0e8d0';  // page edges
  ctx.fillRect(x + 17, y + 20, 1, 12);

  // Title text blocks on cover (representing "PATTERNS")
  ctx.fillStyle = '#fb923c';  // title in orange
  ctx.fillRect(x + 5, y + 23, 9, 2);  // title bar
  ctx.fillRect(x + 6, y + 26, 7, 1);  // subtitle line
  ctx.fillRect(x + 7, y + 28, 5, 1);

  // Decorative pattern symbol on book
  ctx.fillStyle = '#c8a020';
  ctx.fillRect(x + 8, y + 30, 3, 2); // diamond shape
  ctx.fillRect(x + 7, y + 31, 5, 1);

  // Hands holding book
  ctx.fillStyle = '#c8a070';
  ctx.fillRect(x + 2, y + 31, 3, 2);
  ctx.fillRect(x + 14, y + 31, 3, 2);

  // Arms
  ctx.fillStyle = '#c07840';
  ctx.fillRect(x + 1, y + 18, 3, 13);
  ctx.fillRect(x + 16, y + 18, 3, 13);
}

function drawSprite_jhaddu_C(ctx, cx, cy) {
  // Conference Speaker — at podium, laser pointer, audience suggested
  const x = Math.floor(cx - 10);
  const y = Math.floor(cy - 40);

  // Audience seats (tiny dots behind/below speaker)
  ctx.fillStyle = '#2a2a4a';
  ctx.fillRect(x - 2, y + 34, 4, 3);
  ctx.fillRect(x + 4, y + 34, 4, 3);
  ctx.fillRect(x + 16, y + 34, 4, 3);
  ctx.fillRect(x - 2, y + 38, 3, 2);
  ctx.fillRect(x + 5, y + 38, 3, 2);
  ctx.fillRect(x + 17, y + 38, 3, 2);

  // Podium (trapezoid drawn as rects, wider at bottom)
  ctx.fillStyle = '#5a4a30';
  ctx.fillRect(x + 4, y + 22, 12, 3);   // top surface
  ctx.fillRect(x + 3, y + 25, 14, 2);   // upper body
  ctx.fillRect(x + 2, y + 27, 16, 3);   // lower body
  ctx.fillRect(x + 1, y + 30, 18, 4);   // base
  ctx.fillRect(x + 0, y + 34, 20, 3);   // foot

  // Podium front detail
  ctx.fillStyle = '#4a3a20';
  ctx.fillRect(x + 3, y + 26, 14, 1);

  // Notes on podium
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 6, y + 22, 8, 3);
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(x + 7, y + 23, 6, 1);

  // Speaker body (standing behind podium, upper visible)
  // Suit
  ctx.fillStyle = '#2a2a38';
  ctx.fillRect(x + 4, y + 12, 12, 11);

  // Shirt
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 8, y + 12, 4, 4);

  // Tie (orange)
  ctx.fillStyle = '#fb923c';
  ctx.fillRect(x + 9, y + 12, 2, 6);

  // Neck
  ctx.fillStyle = '#c09060';
  ctx.fillRect(x + 8, y + 9, 4, 4);

  // Head
  ctx.fillStyle = '#c8a070';
  ctx.fillRect(x + 6, y + 2, 8, 8);

  // Hair
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(x + 6, y + 2, 8, 2);

  // Eyes — engaged, looking out at audience
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(x + 7, y + 6, 2, 2);
  ctx.fillRect(x + 11, y + 6, 2, 2);

  // Confident speaking mouth (slightly open)
  ctx.fillStyle = '#8a5a30';
  ctx.fillRect(x + 7, y + 9, 6, 1);
  ctx.fillStyle = '#4a2010';
  ctx.fillRect(x + 8, y + 10, 4, 1);

  // Left arm gripping podium sides
  ctx.fillStyle = '#2a2a38';
  ctx.fillRect(x + 3, y + 14, 3, 8);
  ctx.fillStyle = '#c8a070';
  ctx.fillRect(x + 3, y + 21, 3, 2);

  // Right arm extended with laser pointer
  ctx.fillStyle = '#2a2a38';
  ctx.fillRect(x + 14, y + 14, 3, 7);
  ctx.fillRect(x + 16, y + 18, 5, 2); // arm extending right
  ctx.fillStyle = '#c8a070';
  ctx.fillRect(x + 19, y + 18, 2, 2); // hand

  // Laser pointer (thin pen)
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(x + 21, y + 18, 3, 1);
  // laser dot (red)
  ctx.fillStyle = '#ff2020';
  ctx.fillRect(x + 24, y + 17, 2, 2);
}

// ─── MORGAN (Morgan they/them) — #d946ef ────────────────────────────────────

function drawSprite_morgan_A(ctx, cx, cy) {
  // Wellness Coach — lavender cardigan, holding crystals, rainbow on chest
  const x = Math.floor(cx - 10);
  const y = Math.floor(cy - 40);

  // Shoes (soft, rounded)
  ctx.fillStyle = '#b090c0';
  ctx.fillRect(x + 4, y + 36, 5, 4);
  ctx.fillRect(x + 11, y + 36, 5, 4);

  // Legs (soft lavender leggings)
  ctx.fillStyle = '#c4a8d8';
  ctx.fillRect(x + 5, y + 26, 4, 10);
  ctx.fillRect(x + 11, y + 26, 4, 10);

  // Cardigan body (soft lavender)
  ctx.fillStyle = '#c4a8d8';
  ctx.fillRect(x + 3, y + 14, 14, 13);

  // Cardigan texture (slightly lighter front panel)
  ctx.fillStyle = '#d4b8e8';
  ctx.fillRect(x + 7, y + 14, 6, 13);

  // Cardigan buttons (small)
  ctx.fillStyle = '#f0e8f8';
  ctx.fillRect(x + 9, y + 16, 2, 1);
  ctx.fillRect(x + 9, y + 19, 2, 1);
  ctx.fillRect(x + 9, y + 22, 2, 1);

  // Rainbow on chest (small arc)
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(x + 4, y + 18, 6, 1);
  ctx.fillStyle = '#fb923c';
  ctx.fillRect(x + 4, y + 19, 5, 1);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x + 4, y + 20, 4, 1);
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(x + 5, y + 21, 3, 1);
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(x + 5, y + 22, 3, 1);
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(x + 6, y + 23, 2, 1);

  // Neck
  ctx.fillStyle = '#d4a890';
  ctx.fillRect(x + 8, y + 11, 4, 4);

  // Head
  ctx.fillStyle = '#e0b898';
  ctx.fillRect(x + 6, y + 4, 8, 8);

  // Hair (soft, flowing — medium length)
  ctx.fillStyle = '#7a4a80';
  ctx.fillRect(x + 5, y + 4, 10, 2);
  ctx.fillRect(x + 5, y + 6, 2, 6);
  ctx.fillRect(x + 13, y + 6, 2, 6);
  ctx.fillRect(x + 5, y + 11, 1, 3);
  ctx.fillRect(x + 14, y + 11, 1, 3);

  // Eyes — gentle, warm
  ctx.fillStyle = '#5a3060';
  ctx.fillRect(x + 7, y + 8, 2, 2);
  ctx.fillRect(x + 11, y + 8, 2, 2);
  // sparkle
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 8, y + 8, 1, 1);
  ctx.fillRect(x + 12, y + 8, 1, 1);

  // Gentle smile
  ctx.fillStyle = '#c07880';
  ctx.fillRect(x + 7, y + 11, 6, 1);
  ctx.fillRect(x + 7, y + 12, 1, 1);
  ctx.fillRect(x + 12, y + 12, 1, 1);

  // Left hand holding crystal cluster
  ctx.fillStyle = '#c4a8d8';
  ctx.fillRect(x + 0, y + 16, 3, 10);
  ctx.fillStyle = '#e0b898';
  ctx.fillRect(x + 0, y + 25, 3, 2);
  // crystals (purple/pink cluster)
  ctx.fillStyle = '#d946ef';
  ctx.fillRect(x - 2, y + 23, 3, 4);
  ctx.fillStyle = '#a020c0';
  ctx.fillRect(x - 1, y + 21, 2, 4);
  ctx.fillStyle = '#f0a0f8';
  ctx.fillRect(x + 0, y + 22, 2, 3);
  // crystal highlights
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 1, y + 21, 1, 1);
  ctx.fillRect(x + 0, y + 22, 1, 1);

  // Right arm (at side)
  ctx.fillStyle = '#c4a8d8';
  ctx.fillRect(x + 17, y + 16, 3, 10);
  ctx.fillStyle = '#e0b898';
  ctx.fillRect(x + 17, y + 26, 3, 2);
}

function drawSprite_morgan_B(ctx, cx, cy) {
  // Reddit Therapist — computer with reddit alien, thoughtful expression, notebook
  const x = Math.floor(cx - 10);
  const y = Math.floor(cy - 40);

  // Chair
  ctx.fillStyle = '#3a3050';
  ctx.fillRect(x + 2, y + 33, 2, 7);
  ctx.fillRect(x + 14, y + 33, 2, 7);
  ctx.fillRect(x + 1, y + 30, 16, 3);

  // Legs
  ctx.fillStyle = '#5a4060';
  ctx.fillRect(x + 5, y + 26, 4, 6);
  ctx.fillRect(x + 11, y + 26, 4, 6);

  // Body — soft purple sweater
  ctx.fillStyle = '#7a4a90';
  ctx.fillRect(x + 3, y + 15, 14, 12);

  // Collar
  ctx.fillStyle = '#e0d0f0';
  ctx.fillRect(x + 8, y + 15, 4, 3);

  // Neck
  ctx.fillStyle = '#d4a890';
  ctx.fillRect(x + 8, y + 12, 4, 4);

  // Head
  ctx.fillStyle = '#e0b898';
  ctx.fillRect(x + 6, y + 5, 8, 8);

  // Hair (loose, medium)
  ctx.fillStyle = '#7a4a80';
  ctx.fillRect(x + 5, y + 5, 10, 2);
  ctx.fillRect(x + 5, y + 7, 2, 5);
  ctx.fillRect(x + 13, y + 7, 2, 5);

  // Eyes — thoughtful (looking slightly to side)
  ctx.fillStyle = '#5a3060';
  ctx.fillRect(x + 7, y + 9, 2, 2);
  ctx.fillRect(x + 11, y + 9, 2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 8, y + 9, 1, 1);
  ctx.fillRect(x + 12, y + 9, 1, 1);

  // Thoughtful neutral mouth
  ctx.fillStyle = '#c07880';
  ctx.fillRect(x + 8, y + 12, 4, 1);

  // Monitor/screen to the right
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x + 16, y + 12, 10, 8);  // screen body
  ctx.fillStyle = '#1a90ff';             // blue screen background
  ctx.fillRect(x + 17, y + 13, 8, 6);
  // Reddit alien head (small orange oval on screen)
  ctx.fillStyle = '#ff6314';
  ctx.fillRect(x + 18, y + 14, 4, 4);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 19, y + 15, 1, 2);
  ctx.fillRect(x + 21, y + 15, 1, 2);
  // alien antennae
  ctx.fillStyle = '#ff6314';
  ctx.fillRect(x + 19, y + 13, 1, 2);
  ctx.fillRect(x + 22, y + 13, 1, 2);
  // monitor stand
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(x + 20, y + 20, 2, 3);
  ctx.fillRect(x + 18, y + 22, 6, 2);

  // Notebook on lap (open)
  ctx.fillStyle = '#d4b896';
  ctx.fillRect(x + 4, y + 24, 10, 7);
  ctx.fillStyle = '#c8a870';
  ctx.fillRect(x + 4, y + 24, 2, 7); // binding
  ctx.fillStyle = '#b89870';
  ctx.fillRect(x + 7, y + 26, 6, 1);
  ctx.fillRect(x + 7, y + 28, 6, 1);

  // Arms holding notebook / pen
  ctx.fillStyle = '#7a4a90';
  ctx.fillRect(x + 1, y + 17, 3, 8);
  ctx.fillRect(x + 15, y + 17, 3, 8);
  ctx.fillStyle = '#d4a890';
  ctx.fillRect(x + 1, y + 25, 3, 2);
  ctx.fillRect(x + 15, y + 25, 3, 2);
  // pen in right hand
  ctx.fillStyle = '#8a6040';
  ctx.fillRect(x + 14, y + 24, 1, 4);
}

function drawSprite_morgan_C(ctx, cx, cy) {
  // Conflict-Averse — backing away, hands raised "let's calm down", soft colors
  const x = Math.floor(cx - 10);
  const y = Math.floor(cy - 40);

  // Shoes (turned slightly — backing pose)
  ctx.fillStyle = '#b0a0c0';
  ctx.fillRect(x + 3, y + 36, 5, 4);
  ctx.fillRect(x + 10, y + 36, 4, 4);

  // Legs (slightly offset — backing)
  ctx.fillStyle = '#c8b8d8';
  ctx.fillRect(x + 4, y + 27, 4, 9);
  ctx.fillRect(x + 10, y + 28, 4, 8);

  // Body — soft pastel lilac
  ctx.fillStyle = '#d8c0e8';
  ctx.fillRect(x + 3, y + 15, 14, 13);

  // Collar
  ctx.fillStyle = '#f0e8f8';
  ctx.fillRect(x + 8, y + 15, 4, 3);

  // Neck (slightly turned — chin tucked)
  ctx.fillStyle = '#d4a890';
  ctx.fillRect(x + 8, y + 12, 4, 4);

  // Head (turned slightly away)
  ctx.fillStyle = '#e0b898';
  ctx.fillRect(x + 5, y + 5, 8, 8);

  // Hair
  ctx.fillStyle = '#7a4a80';
  ctx.fillRect(x + 4, y + 5, 10, 2);
  ctx.fillRect(x + 4, y + 7, 2, 6);
  ctx.fillRect(x + 12, y + 7, 2, 5);

  // Eyes — wide, slightly alarmed
  ctx.fillStyle = '#5a3060';
  ctx.fillRect(x + 6, y + 8, 3, 2);
  ctx.fillRect(x + 10, y + 8, 3, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 7, y + 8, 1, 1);
  ctx.fillRect(x + 11, y + 8, 1, 1);

  // Mouth — small "o" of concern
  ctx.fillStyle = '#c07880';
  ctx.fillRect(x + 7, y + 11, 4, 2);
  ctx.fillStyle = '#f0c0c0';
  ctx.fillRect(x + 8, y + 11, 2, 1);

  // Both arms raised in "please calm down" gesture
  // Left arm raised up and out
  ctx.fillStyle = '#d8c0e8';
  ctx.fillRect(x + 0, y + 15, 3, 5);   // upper arm
  ctx.fillRect(x - 2, y + 12, 3, 6);   // forearm raised
  ctx.fillStyle = '#d4a890';
  ctx.fillRect(x - 3, y + 10, 4, 3);   // hand open, palm out
  // palm detail lines
  ctx.fillStyle = '#c09070';
  ctx.fillRect(x - 3, y + 11, 4, 1);

  // Right arm raised up and out
  ctx.fillStyle = '#d8c0e8';
  ctx.fillRect(x + 17, y + 15, 3, 5);  // upper arm
  ctx.fillRect(x + 19, y + 12, 3, 6);  // forearm raised
  ctx.fillStyle = '#d4a890';
  ctx.fillRect(x + 19, y + 10, 4, 3);  // hand open, palm out
  ctx.fillStyle = '#c09070';
  ctx.fillRect(x + 19, y + 11, 4, 1);
}

// ─── THE-KID — #facc15 ───────────────────────────────────────────────────────

function drawSprite_the_kid_A(ctx, cx, cy) {
  // Skater — mid-kickflip, board sideways in air, arms spread wide for balance
  const x = Math.floor(cx - 10);
  const y = Math.floor(cy - 40);

  // Skateboard (sideways in kickflip, tilted)
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(x + 2, y + 28, 16, 3);  // board deck
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(x + 3, y + 31, 3, 2);   // truck left
  ctx.fillRect(x + 14, y + 31, 3, 2);  // truck right
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + 4, y + 33, 2, 2);   // wheel left
  ctx.fillRect(x + 14, y + 33, 2, 2);  // wheel right
  // grip tape pattern
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x + 5, y + 28, 2, 1);
  ctx.fillRect(x + 9, y + 28, 2, 1);
  ctx.fillRect(x + 13, y + 28, 2, 1);

  // Legs (tucked up, mid-air)
  ctx.fillStyle = '#1a1a3a';  // dark jeans
  ctx.fillRect(x + 5, y + 20, 4, 9);   // left leg bent
  ctx.fillRect(x + 11, y + 18, 4, 8);  // right leg more extended

  // Baggy jeans cuffs
  ctx.fillStyle = '#2a2a5a';
  ctx.fillRect(x + 4, y + 27, 5, 2);
  ctx.fillRect(x + 10, y + 25, 5, 2);

  // Sneakers
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(x + 4, y + 29, 5, 3);   // left shoe
  ctx.fillRect(x + 10, y + 27, 6, 3);  // right shoe (front, slightly higher)
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(x + 5, y + 30, 3, 1);   // red stripe left
  ctx.fillRect(x + 11, y + 28, 4, 1);  // red stripe right

  // Baggy hoodie body (teal/cyan)
  ctx.fillStyle = '#1a9a8a';
  ctx.fillRect(x + 4, y + 12, 12, 10);

  // Hoodie pocket
  ctx.fillStyle = '#158070';
  ctx.fillRect(x + 6, y + 17, 8, 4);
  ctx.fillRect(x + 7, y + 18, 3, 3);   // left pocket side
  ctx.fillRect(x + 10, y + 18, 3, 3);  // right pocket side

  // Arms spread wide (balance)
  ctx.fillStyle = '#1a9a8a';
  ctx.fillRect(x - 4, y + 12, 5, 4);   // left arm out far
  ctx.fillRect(x + 19, y + 12, 5, 4);  // right arm out far
  ctx.fillRect(x - 5, y + 14, 3, 4);   // left forearm down
  ctx.fillRect(x + 22, y + 14, 3, 4);  // right forearm down
  // hands
  ctx.fillStyle = '#e0b870';
  ctx.fillRect(x - 6, y + 17, 3, 3);
  ctx.fillRect(x + 23, y + 17, 3, 3);

  // Neck
  ctx.fillStyle = '#e0b870';
  ctx.fillRect(x + 8, y + 9, 4, 4);

  // Head
  ctx.fillStyle = '#f0c870';
  ctx.fillRect(x + 6, y + 3, 9, 7);

  // Beanie hat (dark green, folded cuff)
  ctx.fillStyle = '#1a4a20';
  ctx.fillRect(x + 5, y + 1, 11, 5);
  ctx.fillStyle = '#2a6a30';
  ctx.fillRect(x + 5, y + 4, 11, 2);   // cuff fold
  ctx.fillRect(x + 9, y + 0, 4, 2);    // top pom hint

  // Eyes (concentrated squint)
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(x + 7, y + 6, 3, 1);
  ctx.fillRect(x + 11, y + 6, 3, 1);

  // Focused lips (slight smirk)
  ctx.fillStyle = '#9a5020';
  ctx.fillRect(x + 8, y + 8, 5, 1);
  ctx.fillStyle = '#c07040';
  ctx.fillRect(x + 10, y + 8, 2, 1);
}

function drawSprite_the_kid_B(ctx, cx, cy) {
  // Parkour kid — wall-jump pose, one foot pushing off a wall, arms reaching up
  const x = Math.floor(cx - 10);
  const y = Math.floor(cy - 40);

  // Wall (left side, brick texture)
  ctx.fillStyle = '#8a5a3a';
  ctx.fillRect(x - 2, y + 0, 5, 40);   // wall slab
  ctx.fillStyle = '#7a4a2a';
  ctx.fillRect(x - 2, y + 6, 5, 1);    // mortar line
  ctx.fillRect(x - 2, y + 12, 5, 1);
  ctx.fillRect(x - 2, y + 18, 5, 1);
  ctx.fillRect(x - 2, y + 24, 5, 1);
  ctx.fillRect(x - 2, y + 30, 5, 1);
  ctx.fillStyle = '#9a6a4a';
  ctx.fillRect(x + 0, y + 3, 1, 5);    // vertical mortar
  ctx.fillRect(x + 0, y + 9, 1, 5);
  ctx.fillRect(x + 0, y + 15, 1, 5);
  ctx.fillRect(x + 0, y + 21, 1, 5);
  ctx.fillRect(x + 0, y + 27, 1, 5);

  // Shoes
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 3, y + 33, 5, 4);   // lower foot (planted on wall stub)
  ctx.fillRect(x + 13, y + 25, 6, 4);  // upper foot (pushing off)
  ctx.fillStyle = '#222299';
  ctx.fillRect(x + 4, y + 35, 3, 1);   // blue stripe lower shoe
  ctx.fillRect(x + 14, y + 26, 4, 1);  // blue stripe upper shoe

  // Legs (one extended down, one bent up pushing)
  ctx.fillStyle = '#333355';  // dark tracksuit
  ctx.fillRect(x + 4, y + 25, 4, 9);   // lower leg extending down
  ctx.fillRect(x + 12, y + 18, 4, 8);  // upper leg bent at knee pushing wall

  // Tracksuit body (dark navy)
  ctx.fillStyle = '#222244';
  ctx.fillRect(x + 4, y + 12, 12, 14);

  // White racing stripe on side
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 4, y + 12, 2, 14);

  // Both arms reaching up (grabbing ledge)
  ctx.fillStyle = '#222244';
  ctx.fillRect(x + 5, y + 5, 3, 8);    // left arm reaching up
  ctx.fillRect(x + 12, y + 3, 3, 10);  // right arm reaching higher
  // hands gripping (bent)
  ctx.fillStyle = '#e0b870';
  ctx.fillRect(x + 4, y + 2, 4, 4);    // left hand
  ctx.fillRect(x + 11, y + 0, 5, 4);   // right hand (higher)

  // Neck
  ctx.fillStyle = '#e0b870';
  ctx.fillRect(x + 8, y + 9, 4, 4);

  // Head (looking up toward ledge)
  ctx.fillStyle = '#f0c870';
  ctx.fillRect(x + 6, y + 4, 8, 6);

  // Short hair (dark, tousled)
  ctx.fillStyle = '#1a0a00';
  ctx.fillRect(x + 6, y + 3, 8, 3);
  ctx.fillRect(x + 5, y + 4, 2, 3);
  ctx.fillRect(x + 14, y + 4, 2, 2);

  // Eyes (looking up, determined)
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(x + 7, y + 6, 2, 2);
  ctx.fillRect(x + 11, y + 6, 2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 7, y + 6, 1, 1);
  ctx.fillRect(x + 11, y + 6, 1, 1);

  // Gritted teeth (effort)
  ctx.fillStyle = '#5a2a10';
  ctx.fillRect(x + 7, y + 9, 6, 1);
  ctx.fillStyle = '#f0f0e0';
  ctx.fillRect(x + 7, y + 9, 2, 1);
  ctx.fillRect(x + 10, y + 9, 2, 1);

  // Scuff marks on wall from shoe
  ctx.fillStyle = '#6a4a2a';
  ctx.globalAlpha = 0.6;
  ctx.fillRect(x + 2, y + 26, 3, 1);
  ctx.fillRect(x + 1, y + 28, 4, 1);
  ctx.globalAlpha = 1.0;
}

function drawSprite_the_kid_C(ctx, cx, cy) {
  // Lightning sprint — static electricity crackling off body, mid-dash, hair standing up
  const x = Math.floor(cx - 10);
  const y = Math.floor(cy - 40);

  // Ground speed trail (motion lines under feet)
  ctx.fillStyle = '#aaddff';
  ctx.globalAlpha = 0.4;
  ctx.fillRect(x - 12, y + 37, 10, 1);
  ctx.fillRect(x - 14, y + 35, 8, 1);
  ctx.fillRect(x - 10, y + 33, 7, 1);
  ctx.globalAlpha = 1.0;

  // Electric sparks radiating from body
  ctx.fillStyle = '#88eeff';
  ctx.fillRect(x - 3, y + 14, 2, 1);
  ctx.fillRect(x - 5, y + 17, 3, 1);
  ctx.fillRect(x + 22, y + 13, 2, 1);
  ctx.fillRect(x + 21, y + 18, 3, 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 4, y + 15, 1, 1);
  ctx.fillRect(x + 23, y + 14, 1, 1);
  ctx.fillRect(x + 9, y - 1, 1, 1);
  ctx.fillRect(x + 14, y + 1, 1, 1);

  // Sneakers (one planted, one pushing off)
  ctx.fillStyle = '#101010';  // black sneakers
  ctx.fillRect(x + 13, y + 34, 7, 4);  // front foot flat
  ctx.fillRect(x + 2, y + 35, 5, 3);   // back foot on toe
  // neon trim
  ctx.fillStyle = '#00ffcc';
  ctx.fillRect(x + 14, y + 36, 5, 1);
  ctx.fillRect(x + 3, y + 36, 3, 1);

  // Legs (sprint stride, powerful push)
  ctx.fillStyle = '#111122';  // black tights
  ctx.fillRect(x + 12, y + 25, 5, 10);  // front leg extended
  ctx.fillRect(x + 3, y + 23, 4, 9);    // back leg pushing

  // Shorts (bright red, short)
  ctx.fillStyle = '#dd1111';
  ctx.fillRect(x + 3, y + 21, 14, 5);

  // Body — black compression shirt
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(x + 4, y + 12, 12, 11);

  // Neon lightning bolt on chest
  ctx.fillStyle = '#ffee00';
  ctx.fillRect(x + 9, y + 13, 3, 3);   // bolt top
  ctx.fillRect(x + 8, y + 15, 5, 2);   // bolt middle cross
  ctx.fillRect(x + 7, y + 17, 3, 3);   // bolt bottom

  // Neck
  ctx.fillStyle = '#e0b870';
  ctx.fillRect(x + 8, y + 9, 4, 4);

  // Head (leaning into sprint)
  ctx.fillStyle = '#f0c870';
  ctx.fillRect(x + 7, y + 3, 8, 7);

  // Hair — standing straight up from static electricity
  ctx.fillStyle = '#331100';
  ctx.fillRect(x + 7, y + 0, 2, 4);    // left hair spike up
  ctx.fillRect(x + 10, y - 1, 2, 5);   // center spike tallest
  ctx.fillRect(x + 13, y + 0, 2, 4);   // right spike
  ctx.fillRect(x + 8, y + 0, 1, 3);    // filler
  ctx.fillRect(x + 12, y + 0, 1, 3);

  // Glowing hair tips (static discharge)
  ctx.fillStyle = '#88eeff';
  ctx.fillRect(x + 7, y - 1, 2, 1);
  ctx.fillRect(x + 10, y - 2, 2, 1);
  ctx.fillRect(x + 13, y - 1, 2, 1);

  // Eyes (fierce, narrow, lit from below by bolt)
  ctx.fillStyle = '#ffee00';
  ctx.fillRect(x + 8, y + 6, 2, 1);    // left eye glow
  ctx.fillRect(x + 12, y + 6, 2, 1);   // right eye glow
  ctx.fillStyle = '#1a0808';
  ctx.fillRect(x + 8, y + 6, 2, 1);
  ctx.fillRect(x + 12, y + 6, 2, 1);

  // Arms pumping hard
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(x + 1, y + 13, 3, 8);   // back arm pumping behind
  ctx.fillRect(x + 16, y + 12, 3, 7);  // front arm driving forward
  ctx.fillRect(x + 0, y + 19, 3, 4);   // back forearm
  ctx.fillRect(x + 17, y + 18, 4, 3);  // front forearm
  // hands (fists)
  ctx.fillStyle = '#e0b870';
  ctx.fillRect(x - 1, y + 22, 3, 3);
  ctx.fillRect(x + 18, y + 20, 3, 3);
}
