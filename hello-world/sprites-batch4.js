// sprites-batch4.js — Pixel art sprite variants for hasan, pepe, ronpaul
// Each function: cx = horizontal center, cy = bottom edge. fillRect only. ~40px tall, ~20px wide.

// ─── HASAN (Hasan Piker) — streaming socialist ──────────────────────────────

// Hasan A: Streamer — dark hair, white tee with red print, headset
function drawSprite_hasan_A(ctx, cx, cy) {
  const x = cx, y = cy;
  // Legs
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x - 5, y - 10, 4, 10);
  ctx.fillRect(x + 1, y - 10, 4, 10);
  // Shoes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 6, y - 2, 5, 2);
  ctx.fillRect(x + 1, y - 2, 5, 2);
  // Body — white tee
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(x - 8, y - 28, 16, 18);
  // Red fist print on shirt
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(x - 3, y - 24, 6, 8);
  // Arms
  ctx.fillStyle = '#b88a60';
  ctx.fillRect(x - 10, y - 26, 3, 12);
  ctx.fillRect(x + 7, y - 26, 3, 12);
  // Neck
  ctx.fillStyle = '#b88a60';
  ctx.fillRect(x - 3, y - 30, 6, 3);
  // Head
  ctx.fillStyle = '#b88a60';
  ctx.fillRect(x - 6, y - 40, 12, 12);
  // Hair — thick dark
  ctx.fillStyle = '#1c1610';
  ctx.fillRect(x - 7, y - 42, 14, 6);
  ctx.fillRect(x - 7, y - 40, 2, 8);
  ctx.fillRect(x + 5, y - 40, 2, 8);
  // Eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 4, y - 37, 2, 2);
  ctx.fillRect(x + 2, y - 37, 2, 2);
  // Eyebrows (thick)
  ctx.fillRect(x - 5, y - 39, 3, 1);
  ctx.fillRect(x + 2, y - 39, 3, 1);
  // Stubble
  ctx.fillStyle = '#6e4e34';
  ctx.fillRect(x - 4, y - 33, 8, 2);
  // Mouth
  ctx.fillStyle = '#a06848';
  ctx.fillRect(x - 2, y - 32, 4, 1);
  // Headset
  ctx.fillStyle = '#444444';
  ctx.fillRect(x - 8, y - 42, 16, 1);
  ctx.fillRect(x - 8, y - 36, 2, 4);
  // Headset mic
  ctx.fillStyle = '#333333';
  ctx.fillRect(x - 7, y - 33, 3, 2);
}

// Hasan B: Rally Speaker — red jacket, megaphone, raised fist
function drawSprite_hasan_B(ctx, cx, cy) {
  const x = cx, y = cy;
  // Legs
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x - 5, y - 10, 4, 10);
  ctx.fillRect(x + 1, y - 10, 4, 10);
  // Shoes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 6, y - 2, 5, 2);
  ctx.fillRect(x + 1, y - 2, 5, 2);
  // Body — red jacket
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(x - 8, y - 28, 16, 18);
  // Jacket lapels
  ctx.fillStyle = '#aa1a1a';
  ctx.fillRect(x - 2, y - 28, 4, 10);
  // Left arm raised (fist)
  ctx.fillStyle = '#b88a60';
  ctx.fillRect(x - 11, y - 38, 3, 14);
  // Fist
  ctx.fillRect(x - 12, y - 40, 4, 3);
  // Right arm with megaphone
  ctx.fillStyle = '#b88a60';
  ctx.fillRect(x + 8, y - 26, 3, 6);
  // Megaphone
  ctx.fillStyle = '#dddddd';
  ctx.fillRect(x + 10, y - 28, 6, 3);
  ctx.fillRect(x + 14, y - 30, 3, 7);
  // Neck
  ctx.fillStyle = '#b88a60';
  ctx.fillRect(x - 3, y - 30, 6, 3);
  // Head
  ctx.fillStyle = '#b88a60';
  ctx.fillRect(x - 6, y - 40, 12, 12);
  // Hair
  ctx.fillStyle = '#1c1610';
  ctx.fillRect(x - 7, y - 42, 14, 6);
  ctx.fillRect(x - 7, y - 40, 2, 8);
  ctx.fillRect(x + 5, y - 40, 2, 8);
  // Eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 4, y - 37, 2, 2);
  ctx.fillRect(x + 2, y - 37, 2, 2);
  // Brows (angry)
  ctx.fillRect(x - 5, y - 39, 4, 1);
  ctx.fillRect(x + 1, y - 39, 4, 1);
  // Open mouth (shouting)
  ctx.fillStyle = '#7a3a2a';
  ctx.fillRect(x - 3, y - 33, 6, 3);
  ctx.fillStyle = '#f0e8e0';
  ctx.fillRect(x - 2, y - 33, 4, 1);
}

// Hasan C: Cozy Streamer — hoodie, chat emotes floating
function drawSprite_hasan_C(ctx, cx, cy) {
  const x = cx, y = cy;
  // Legs
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x - 5, y - 10, 4, 10);
  ctx.fillRect(x + 1, y - 10, 4, 10);
  // Shoes
  ctx.fillStyle = '#333333';
  ctx.fillRect(x - 6, y - 2, 5, 2);
  ctx.fillRect(x + 1, y - 2, 5, 2);
  // Body — grey hoodie
  ctx.fillStyle = '#555566';
  ctx.fillRect(x - 9, y - 30, 18, 20);
  // Hood
  ctx.fillStyle = '#444455';
  ctx.fillRect(x - 7, y - 32, 14, 4);
  // Hoodie pocket
  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(x - 5, y - 16, 10, 4);
  // Arms in hoodie
  ctx.fillStyle = '#555566';
  ctx.fillRect(x - 11, y - 28, 3, 12);
  ctx.fillRect(x + 8, y - 28, 3, 12);
  // Neck
  ctx.fillStyle = '#b88a60';
  ctx.fillRect(x - 3, y - 32, 6, 3);
  // Head
  ctx.fillStyle = '#b88a60';
  ctx.fillRect(x - 6, y - 40, 12, 10);
  // Hair
  ctx.fillStyle = '#1c1610';
  ctx.fillRect(x - 7, y - 42, 14, 5);
  ctx.fillRect(x - 7, y - 40, 2, 7);
  ctx.fillRect(x + 5, y - 40, 2, 7);
  // Eyes (relaxed)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 4, y - 37, 2, 1);
  ctx.fillRect(x + 2, y - 37, 2, 1);
  // Slight smile
  ctx.fillStyle = '#a06848';
  ctx.fillRect(x - 2, y - 33, 4, 1);
  ctx.fillRect(x + 2, y - 34, 1, 1);
  // Floating chat emote (red heart)
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(x + 8, y - 42, 2, 2);
  ctx.fillRect(x + 10, y - 42, 2, 2);
  ctx.fillRect(x + 7, y - 40, 6, 2);
  ctx.fillRect(x + 8, y - 38, 4, 2);
  ctx.fillRect(x + 9, y - 36, 2, 1);
}

// ─── PEPE (The Frog) — doomer-comfy oscillator ──────────────────────────────

// Pepe A: Classic Smug — half-closed eyes, smirk, green frog
function drawSprite_pepe_A(ctx, cx, cy) {
  const x = cx, y = cy;
  // Legs (stumpy frog legs)
  ctx.fillStyle = '#4a8828';
  ctx.fillRect(x - 5, y - 8, 4, 8);
  ctx.fillRect(x + 1, y - 8, 4, 8);
  // Feet (wide frog feet)
  ctx.fillStyle = '#3a7020';
  ctx.fillRect(x - 7, y - 2, 6, 2);
  ctx.fillRect(x + 1, y - 2, 6, 2);
  // Body — round green
  ctx.fillStyle = '#5a9830';
  ctx.fillRect(x - 8, y - 24, 16, 16);
  // Belly
  ctx.fillStyle = '#6aaa40';
  ctx.fillRect(x - 5, y - 20, 10, 10);
  // Arms
  ctx.fillStyle = '#4a8828';
  ctx.fillRect(x - 10, y - 22, 3, 10);
  ctx.fillRect(x + 7, y - 22, 3, 10);
  // Head — wide frog head
  ctx.fillStyle = '#5a9830';
  ctx.fillRect(x - 9, y - 38, 18, 16);
  // Big round cheeks
  ctx.fillRect(x - 10, y - 34, 20, 8);
  // Eyes — big protruding
  ctx.fillStyle = '#e8e8e0';
  ctx.fillRect(x - 8, y - 38, 6, 6);
  ctx.fillRect(x + 2, y - 38, 6, 6);
  // Half-closed lids (smug)
  ctx.fillStyle = '#5a9830';
  ctx.fillRect(x - 8, y - 38, 6, 3);
  ctx.fillRect(x + 2, y - 38, 6, 3);
  // Pupils
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 5, y - 34, 2, 2);
  ctx.fillRect(x + 4, y - 34, 2, 2);
  // Smug grin
  ctx.fillStyle = '#3a7020';
  ctx.fillRect(x - 7, y - 26, 14, 2);
  // Upturned corners
  ctx.fillRect(x - 8, y - 27, 1, 1);
  ctx.fillRect(x + 7, y - 27, 1, 1);
}

// Pepe B: Doomer Pepe — hoodie, cigarette, sad eyes
function drawSprite_pepe_B(ctx, cx, cy) {
  const x = cx, y = cy;
  // Legs
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x - 5, y - 10, 4, 10);
  ctx.fillRect(x + 1, y - 10, 4, 10);
  // Shoes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 6, y - 2, 5, 2);
  ctx.fillRect(x + 1, y - 2, 5, 2);
  // Body — black hoodie
  ctx.fillStyle = '#222233';
  ctx.fillRect(x - 9, y - 28, 18, 18);
  // Hood up
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(x - 8, y - 36, 16, 10);
  ctx.fillRect(x - 7, y - 38, 14, 4);
  // Arms in pockets
  ctx.fillStyle = '#222233';
  ctx.fillRect(x - 11, y - 26, 3, 12);
  ctx.fillRect(x + 8, y - 26, 3, 12);
  // Head peeking from hood
  ctx.fillStyle = '#4a8828';
  ctx.fillRect(x - 7, y - 36, 14, 12);
  // Sad droopy eyes
  ctx.fillStyle = '#d0d0c8';
  ctx.fillRect(x - 6, y - 34, 5, 4);
  ctx.fillRect(x + 1, y - 34, 5, 4);
  // Heavy lids
  ctx.fillStyle = '#4a8828';
  ctx.fillRect(x - 6, y - 34, 5, 2);
  ctx.fillRect(x + 1, y - 34, 5, 2);
  // Pupils (looking down)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 4, y - 31, 2, 2);
  ctx.fillRect(x + 3, y - 31, 2, 2);
  // Sad mouth
  ctx.fillStyle = '#3a6020';
  ctx.fillRect(x - 4, y - 27, 8, 1);
  ctx.fillRect(x - 5, y - 28, 1, 1);
  ctx.fillRect(x + 4, y - 28, 1, 1);
  // Cigarette
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(x + 4, y - 27, 6, 1);
  // Cigarette ember
  ctx.fillStyle = '#ff6622';
  ctx.fillRect(x + 9, y - 28, 2, 2);
  // Smoke wisp
  ctx.fillStyle = '#888888';
  ctx.fillRect(x + 10, y - 30, 1, 1);
  ctx.fillRect(x + 11, y - 32, 1, 1);
}

// Pepe C: Comfy Pepe — blanket, hot cocoa, content smile
function drawSprite_pepe_C(ctx, cx, cy) {
  const x = cx, y = cy;
  // Blanket wrapping lower body
  ctx.fillStyle = '#8a5030';
  ctx.fillRect(x - 10, y - 16, 20, 16);
  // Blanket pattern
  ctx.fillStyle = '#a06038';
  ctx.fillRect(x - 10, y - 12, 20, 2);
  ctx.fillRect(x - 10, y - 6, 20, 2);
  // Blanket top fold
  ctx.fillStyle = '#9a5834';
  ctx.fillRect(x - 10, y - 16, 20, 2);
  // Body above blanket
  ctx.fillStyle = '#5a9830';
  ctx.fillRect(x - 8, y - 28, 16, 14);
  // Arms holding mug
  ctx.fillStyle = '#4a8828';
  ctx.fillRect(x - 4, y - 18, 3, 4);
  ctx.fillRect(x + 1, y - 18, 3, 4);
  // Mug
  ctx.fillStyle = '#d0c8b8';
  ctx.fillRect(x - 2, y - 20, 6, 6);
  ctx.fillStyle = '#a08060';
  ctx.fillRect(x - 1, y - 19, 4, 2);
  // Mug handle
  ctx.fillStyle = '#d0c8b8';
  ctx.fillRect(x + 4, y - 18, 2, 4);
  // Head
  ctx.fillStyle = '#5a9830';
  ctx.fillRect(x - 9, y - 40, 18, 14);
  ctx.fillRect(x - 10, y - 36, 20, 8);
  // Eyes — happy squint
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 6, y - 34, 4, 1);
  ctx.fillRect(x + 2, y - 34, 4, 1);
  // Rosy cheeks
  ctx.fillStyle = '#88bb55';
  ctx.fillRect(x - 8, y - 32, 3, 2);
  ctx.fillRect(x + 5, y - 32, 3, 2);
  // Content smile
  ctx.fillStyle = '#3a7020';
  ctx.fillRect(x - 5, y - 28, 10, 2);
  ctx.fillRect(x - 6, y - 29, 1, 1);
  ctx.fillRect(x + 5, y - 29, 1, 1);
}

// ─── RONPAUL (Ron Paul) — constitutional libertarian ────────────────────────

// Ron Paul A: Podium Speaker — suit, American flag pin, gesturing
function drawSprite_ronpaul_A(ctx, cx, cy) {
  const x = cx, y = cy;
  // Legs
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x - 4, y - 10, 3, 10);
  ctx.fillRect(x + 1, y - 10, 3, 10);
  // Shoes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 5, y - 2, 4, 2);
  ctx.fillRect(x + 1, y - 2, 4, 2);
  // Suit body — dark navy
  ctx.fillStyle = '#1e2340';
  ctx.fillRect(x - 7, y - 28, 14, 18);
  // Shirt
  ctx.fillStyle = '#e0e0e8';
  ctx.fillRect(x - 2, y - 28, 4, 12);
  // Red tie
  ctx.fillStyle = '#b82020';
  ctx.fillRect(x - 1, y - 27, 2, 10);
  // Suit lapels
  ctx.fillStyle = '#283050';
  ctx.fillRect(x - 3, y - 28, 2, 8);
  ctx.fillRect(x + 1, y - 28, 2, 8);
  // Flag pin
  ctx.fillStyle = '#cc3333';
  ctx.fillRect(x + 3, y - 26, 2, 1);
  ctx.fillStyle = '#3344aa';
  ctx.fillRect(x + 3, y - 25, 1, 1);
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(x + 4, y - 25, 1, 1);
  // Arms
  ctx.fillStyle = '#1e2340';
  ctx.fillRect(x - 9, y - 26, 3, 10);
  // Right arm raised (pointing)
  ctx.fillRect(x + 6, y - 32, 3, 10);
  // Pointing hand
  ctx.fillStyle = '#d8b898';
  ctx.fillRect(x + 8, y - 34, 4, 2);
  // Neck
  ctx.fillStyle = '#d8b898';
  ctx.fillRect(x - 3, y - 30, 6, 3);
  // Head
  ctx.fillStyle = '#d8b898';
  ctx.fillRect(x - 6, y - 40, 12, 12);
  // Silver hair — thinning on top
  ctx.fillStyle = '#c8c8d0';
  ctx.fillRect(x - 7, y - 42, 14, 4);
  ctx.fillRect(x - 7, y - 40, 2, 6);
  ctx.fillRect(x + 5, y - 40, 2, 6);
  // Ears
  ctx.fillStyle = '#d0a888';
  ctx.fillRect(x - 7, y - 36, 2, 4);
  ctx.fillRect(x + 5, y - 36, 2, 4);
  // Eyes — sharp, determined
  ctx.fillStyle = '#e0e0d8';
  ctx.fillRect(x - 4, y - 37, 3, 2);
  ctx.fillRect(x + 1, y - 37, 3, 2);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x - 3, y - 37, 2, 2);
  ctx.fillRect(x + 2, y - 37, 2, 2);
  // Eyebrows
  ctx.fillStyle = '#b0b0b8';
  ctx.fillRect(x - 4, y - 38, 3, 1);
  ctx.fillRect(x + 1, y - 38, 3, 1);
  // Nose
  ctx.fillStyle = '#c8a080';
  ctx.fillRect(x - 1, y - 34, 2, 3);
  // Mouth
  ctx.fillStyle = '#b08868';
  ctx.fillRect(x - 2, y - 31, 4, 1);
}

// Ron Paul B: Constitution Scholar — reading glasses, parchment scroll
function drawSprite_ronpaul_B(ctx, cx, cy) {
  const x = cx, y = cy;
  // Legs
  ctx.fillStyle = '#3a3a48';
  ctx.fillRect(x - 4, y - 10, 3, 10);
  ctx.fillRect(x + 1, y - 10, 3, 10);
  // Shoes
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x - 5, y - 2, 4, 2);
  ctx.fillRect(x + 1, y - 2, 4, 2);
  // Suit body
  ctx.fillStyle = '#2a3048';
  ctx.fillRect(x - 7, y - 28, 14, 18);
  // Shirt
  ctx.fillStyle = '#e0e0e8';
  ctx.fillRect(x - 2, y - 28, 4, 12);
  // Gold tie
  ctx.fillStyle = '#b8a038';
  ctx.fillRect(x - 1, y - 27, 2, 10);
  // Arms holding scroll
  ctx.fillStyle = '#2a3048';
  ctx.fillRect(x - 10, y - 24, 4, 6);
  ctx.fillRect(x + 6, y - 24, 4, 6);
  // Scroll
  ctx.fillStyle = '#e0d8c0';
  ctx.fillRect(x - 12, y - 22, 24, 8);
  // Scroll rolled edges
  ctx.fillStyle = '#c8c0a8';
  ctx.fillRect(x - 12, y - 22, 2, 8);
  ctx.fillRect(x + 10, y - 22, 2, 8);
  // Text lines on scroll
  ctx.fillStyle = '#4a3820';
  ctx.fillRect(x - 8, y - 20, 16, 1);
  ctx.fillRect(x - 8, y - 18, 14, 1);
  // Neck
  ctx.fillStyle = '#d8b898';
  ctx.fillRect(x - 3, y - 30, 6, 3);
  // Head
  ctx.fillStyle = '#d8b898';
  ctx.fillRect(x - 6, y - 40, 12, 12);
  // Hair
  ctx.fillStyle = '#c8c8d0';
  ctx.fillRect(x - 7, y - 42, 14, 4);
  ctx.fillRect(x - 7, y - 40, 2, 6);
  ctx.fillRect(x + 5, y - 40, 2, 6);
  // Ears
  ctx.fillStyle = '#d0a888';
  ctx.fillRect(x - 7, y - 36, 2, 4);
  ctx.fillRect(x + 5, y - 36, 2, 4);
  // Reading glasses
  ctx.fillStyle = '#8888a0';
  ctx.fillRect(x - 5, y - 37, 4, 3);
  ctx.fillRect(x + 1, y - 37, 4, 3);
  ctx.fillRect(x - 1, y - 36, 2, 1);
  // Eyes behind glasses
  ctx.fillStyle = '#e0e0d8';
  ctx.fillRect(x - 4, y - 36, 3, 2);
  ctx.fillRect(x + 1, y - 36, 3, 2);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x - 3, y - 36, 1, 2);
  ctx.fillRect(x + 2, y - 36, 1, 2);
  // Brows
  ctx.fillStyle = '#b0b0b8';
  ctx.fillRect(x - 5, y - 38, 4, 1);
  ctx.fillRect(x + 1, y - 38, 4, 1);
  // Nose
  ctx.fillStyle = '#c8a080';
  ctx.fillRect(x - 1, y - 34, 2, 3);
  // Thoughtful expression
  ctx.fillStyle = '#b08868';
  ctx.fillRect(x - 2, y - 31, 4, 1);
}

// Ron Paul C: Gold Standard — holding gold coin, liberty bell behind
function drawSprite_ronpaul_C(ctx, cx, cy) {
  const x = cx, y = cy;
  // Liberty bell in background (small)
  ctx.fillStyle = '#b8a048';
  ctx.fillRect(x + 4, y - 42, 8, 10);
  ctx.fillRect(x + 3, y - 34, 10, 3);
  ctx.fillStyle = '#a09040';
  ctx.fillRect(x + 6, y - 44, 4, 3);
  // Crack
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(x + 7, y - 40, 1, 6);
  // Legs
  ctx.fillStyle = '#3a3a48';
  ctx.fillRect(x - 4, y - 10, 3, 10);
  ctx.fillRect(x + 1, y - 10, 3, 10);
  // Shoes
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x - 5, y - 2, 4, 2);
  ctx.fillRect(x + 1, y - 2, 4, 2);
  // Suit body — charcoal
  ctx.fillStyle = '#2a2a38';
  ctx.fillRect(x - 7, y - 28, 14, 18);
  // Shirt
  ctx.fillStyle = '#e0e0e8';
  ctx.fillRect(x - 2, y - 28, 4, 12);
  // Flag tie
  ctx.fillStyle = '#cc3333';
  ctx.fillRect(x - 1, y - 27, 2, 5);
  ctx.fillStyle = '#3344aa';
  ctx.fillRect(x - 1, y - 22, 2, 5);
  // Left arm holding up coin
  ctx.fillStyle = '#2a2a38';
  ctx.fillRect(x - 10, y - 36, 3, 14);
  // Hand
  ctx.fillStyle = '#d8b898';
  ctx.fillRect(x - 12, y - 38, 4, 3);
  // Gold coin
  ctx.fillStyle = '#d8c050';
  ctx.fillRect(x - 14, y - 42, 6, 6);
  ctx.fillStyle = '#c0a840';
  ctx.fillRect(x - 12, y - 40, 2, 2);
  // Right arm at side
  ctx.fillStyle = '#2a2a38';
  ctx.fillRect(x + 6, y - 26, 3, 10);
  // Neck
  ctx.fillStyle = '#d8b898';
  ctx.fillRect(x - 3, y - 30, 6, 3);
  // Head
  ctx.fillStyle = '#d8b898';
  ctx.fillRect(x - 6, y - 40, 12, 12);
  // Hair
  ctx.fillStyle = '#c8c8d0';
  ctx.fillRect(x - 7, y - 42, 14, 4);
  ctx.fillRect(x - 7, y - 40, 2, 6);
  ctx.fillRect(x + 5, y - 40, 2, 6);
  // Ears
  ctx.fillStyle = '#d0a888';
  ctx.fillRect(x - 7, y - 36, 2, 4);
  ctx.fillRect(x + 5, y - 36, 2, 4);
  // Eyes — proud
  ctx.fillStyle = '#e0e0d8';
  ctx.fillRect(x - 4, y - 37, 3, 2);
  ctx.fillRect(x + 1, y - 37, 3, 2);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x - 3, y - 37, 2, 2);
  ctx.fillRect(x + 2, y - 37, 2, 2);
  // Brows
  ctx.fillStyle = '#b0b0b8';
  ctx.fillRect(x - 4, y - 38, 3, 1);
  ctx.fillRect(x + 1, y - 38, 3, 1);
  // Nose
  ctx.fillStyle = '#c8a080';
  ctx.fillRect(x - 1, y - 34, 2, 3);
  // Confident smile
  ctx.fillStyle = '#b08868';
  ctx.fillRect(x - 2, y - 31, 4, 1);
  ctx.fillRect(x + 1, y - 32, 1, 1);
}


// --- DECKARD-CAIN sprites (auto-generated) ---

// Variant A: Hooded elder with long robe and gnarled walking staff
function drawSprite_deckard_cain_A(ctx, cx, cy) {
  // Staff (left side)
  ctx.fillStyle = '#5C3A1E';
  ctx.fillRect(cx - 12, cy - 42, 2, 38);
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(cx - 13, cy - 44, 4, 3);

  // Robe body
  ctx.fillStyle = '#4A3728';
  ctx.fillRect(cx - 8, cy - 24, 16, 20);
  ctx.fillRect(cx - 10, cy - 8, 20, 8);
  // Robe hem detail
  ctx.fillStyle = '#3A2A1C';
  ctx.fillRect(cx - 10, cy - 2, 20, 2);

  // Sleeves
  ctx.fillStyle = '#4A3728';
  ctx.fillRect(cx - 12, cy - 22, 4, 10);
  ctx.fillRect(cx + 8, cy - 22, 4, 10);
  // Hands
  ctx.fillStyle = '#D4A574';
  ctx.fillRect(cx - 12, cy - 12, 3, 3);
  ctx.fillRect(cx + 9, cy - 12, 3, 3);

  // Hood
  ctx.fillStyle = '#3A2A1C';
  ctx.fillRect(cx - 7, cy - 36, 14, 6);
  ctx.fillRect(cx - 8, cy - 34, 16, 4);

  // Face (under hood)
  ctx.fillStyle = '#D4A574';
  ctx.fillRect(cx - 4, cy - 30, 8, 6);
  // Eyes
  ctx.fillStyle = '#1A1A2E';
  ctx.fillRect(cx - 3, cy - 29, 2, 1);
  ctx.fillRect(cx + 1, cy - 29, 2, 1);
  // White beard
  ctx.fillStyle = '#E0D8CC';
  ctx.fillRect(cx - 3, cy - 25, 6, 4);
  ctx.fillRect(cx - 2, cy - 21, 4, 3);

  // Belt / sash
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(cx - 8, cy - 16, 16, 2);

  // Feet
  ctx.fillStyle = '#2A1E14';
  ctx.fillRect(cx - 8, cy - 2, 6, 2);
  ctx.fillRect(cx + 2, cy - 2, 6, 2);
}

// Variant B: Seated scholar with open tome, no hood — bald head and spectacles
function drawSprite_deckard_cain_B(ctx, cx, cy) {
  // Stool / seat
  ctx.fillStyle = '#5C3A1E';
  ctx.fillRect(cx - 8, cy - 10, 16, 3);
  ctx.fillRect(cx - 9, cy - 7, 2, 7);
  ctx.fillRect(cx + 7, cy - 7, 2, 7);

  // Robe (seated, shorter)
  ctx.fillStyle = '#2E4A62';
  ctx.fillRect(cx - 8, cy - 24, 16, 14);
  ctx.fillRect(cx - 10, cy - 14, 20, 6);

  // Open book (on lap)
  ctx.fillStyle = '#F5E6C8';
  ctx.fillRect(cx - 9, cy - 16, 8, 6);
  ctx.fillRect(cx + 1, cy - 16, 8, 6);
  ctx.fillStyle = '#5C3A1E';
  ctx.fillRect(cx, cy - 16, 1, 6);
  // Text lines
  ctx.fillStyle = '#2A1E14';
  ctx.fillRect(cx - 7, cy - 14, 5, 1);
  ctx.fillRect(cx - 7, cy - 12, 4, 1);
  ctx.fillRect(cx + 3, cy - 14, 5, 1);
  ctx.fillRect(cx + 3, cy - 12, 4, 1);

  // Shoulders
  ctx.fillStyle = '#2E4A62';
  ctx.fillRect(cx - 10, cy - 28, 20, 4);

  // Bald head
  ctx.fillStyle = '#D4A574';
  ctx.fillRect(cx - 5, cy - 38, 10, 10);
  // Top of head (bald)
  ctx.fillStyle = '#C89A6A';
  ctx.fillRect(cx - 4, cy - 39, 8, 2);
  // Eyes
  ctx.fillStyle = '#1A1A2E';
  ctx.fillRect(cx - 3, cy - 33, 2, 1);
  ctx.fillRect(cx + 2, cy - 33, 2, 1);
  // Spectacles
  ctx.fillStyle = '#A0A0B0';
  ctx.fillRect(cx - 4, cy - 34, 3, 3);
  ctx.fillRect(cx + 1, cy - 34, 3, 3);
  ctx.fillRect(cx, cy - 33, 1, 1);
  // Long white beard
  ctx.fillStyle = '#E0D8CC';
  ctx.fillRect(cx - 3, cy - 30, 6, 3);
  ctx.fillRect(cx - 2, cy - 27, 4, 4);
  ctx.fillStyle = '#D0C8BC';
  ctx.fillRect(cx - 1, cy - 23, 2, 2);

  // Sleeves / arms reaching to book
  ctx.fillStyle = '#2E4A62';
  ctx.fillRect(cx - 12, cy - 24, 4, 8);
  ctx.fillRect(cx + 8, cy - 24, 4, 8);
  // Hands on book
  ctx.fillStyle = '#D4A574';
  ctx.fillRect(cx - 10, cy - 16, 2, 2);
  ctx.fillRect(cx + 8, cy - 16, 2, 2);
}

// Variant C: Prophetic stance — arms raised, glowing Horadric runes, mystical aura
function drawSprite_deckard_cain_C(ctx, cx, cy) {
  // Mystical glow beneath feet
  ctx.fillStyle = 'rgba(100, 180, 255, 0.25)';
  ctx.fillRect(cx - 14, cy - 3, 28, 3);
  ctx.fillStyle = 'rgba(100, 180, 255, 0.15)';
  ctx.fillRect(cx - 18, cy - 1, 36, 2);

  // Floating runes (left and right)
  ctx.fillStyle = '#64B4FF';
  ctx.fillRect(cx - 16, cy - 30, 2, 2);
  ctx.fillRect(cx - 17, cy - 26, 2, 2);
  ctx.fillRect(cx + 14, cy - 32, 2, 2);
  ctx.fillRect(cx + 15, cy - 28, 2, 2);
  ctx.fillStyle = '#90D0FF';
  ctx.fillRect(cx - 15, cy - 34, 1, 1);
  ctx.fillRect(cx + 16, cy - 36, 1, 1);

  // Robe body
  ctx.fillStyle = '#5A2E4A';
  ctx.fillRect(cx - 8, cy - 24, 16, 20);
  ctx.fillRect(cx - 10, cy - 8, 20, 8);
  // Gold trim
  ctx.fillStyle = '#C8A832';
  ctx.fillRect(cx - 1, cy - 24, 2, 20);
  ctx.fillRect(cx - 8, cy - 16, 16, 1);

  // Arms raised
  ctx.fillStyle = '#5A2E4A';
  ctx.fillRect(cx - 12, cy - 26, 4, 6);
  ctx.fillRect(cx - 14, cy - 34, 4, 8);
  ctx.fillRect(cx + 8, cy - 26, 4, 6);
  ctx.fillRect(cx + 10, cy - 34, 4, 8);
  // Hands raised
  ctx.fillStyle = '#D4A574';
  ctx.fillRect(cx - 14, cy - 36, 3, 3);
  ctx.fillRect(cx + 11, cy - 36, 3, 3);

  // Glow from hands
  ctx.fillStyle = 'rgba(100, 180, 255, 0.4)';
  ctx.fillRect(cx - 15, cy - 38, 5, 5);
  ctx.fillRect(cx + 10, cy - 38, 5, 5);

  // Hood (deep purple)
  ctx.fillStyle = '#4A2040';
  ctx.fillRect(cx - 7, cy - 36, 14, 6);
  ctx.fillRect(cx - 8, cy - 34, 16, 4);

  // Face
  ctx.fillStyle = '#D4A574';
  ctx.fillRect(cx - 4, cy - 30, 8, 5);
  // Glowing eyes (prophetic)
  ctx.fillStyle = '#64B4FF';
  ctx.fillRect(cx - 3, cy - 29, 2, 1);
  ctx.fillRect(cx + 1, cy - 29, 2, 1);
  // White beard
  ctx.fillStyle = '#E0D8CC';
  ctx.fillRect(cx - 3, cy - 26, 6, 3);
  ctx.fillRect(cx - 2, cy - 23, 4, 4);

  // Robe hem
  ctx.fillStyle = '#4A2040';
  ctx.fillRect(cx - 10, cy - 2, 20, 2);
  // Feet
  ctx.fillStyle = '#2A1E14';
  ctx.fillRect(cx - 7, cy - 2, 5, 2);
  ctx.fillRect(cx + 2, cy - 2, 5, 2);
}
