// sprites-batch1.js — 18 pixel art sprite variants for 6 personas
// Each function draws on a canvas 2D context using fillRect only.
// cx, cy = center-bottom of sprite (feet position)
// Body spans roughly cy-40 to cy, width ~20px centered on cx

// ─────────────────────────────────────────────
// CHAIRMAN (Ibrahim the Immovable) — #8B1A1A
// ─────────────────────────────────────────────

// Chairman A: Classic Judge — tall black robe, white collar, gavel
function drawSprite_chairman_A(ctx, cx, cy) {
  const x = cx, y = cy;
  // Robe (black, tall)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 9, y - 38, 18, 28); // main robe body
  ctx.fillRect(x - 8, y - 10, 16, 10); // lower robe
  // White collar band
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x - 4, y - 38, 8, 3);
  // Face (skin)
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x - 5, y - 40, 10, 8); // head
  // Eyes (stern)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 4, y - 37, 2, 2);
  ctx.fillRect(x + 2, y - 37, 2, 2);
  // Eyebrows (heavy, stern)
  ctx.fillRect(x - 5, y - 39, 3, 1);
  ctx.fillRect(x + 2, y - 39, 3, 1);
  // Mouth (thin line)
  ctx.fillRect(x - 2, y - 33, 4, 1);
  // Hair (black, judicial wig hint)
  ctx.fillStyle = '#f5f5f0';
  ctx.fillRect(x - 6, y - 42, 12, 3);
  ctx.fillRect(x - 7, y - 40, 2, 5);
  ctx.fillRect(x + 5, y - 40, 2, 5);
  // Robe shoulders
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 10, y - 36, 3, 6);
  ctx.fillRect(x + 7, y - 36, 3, 6);
  // Right arm holding gavel
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + 8, y - 30, 3, 10);
  // Gavel handle
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(x + 9, y - 22, 2, 8);
  // Gavel head
  ctx.fillStyle = '#5a3010';
  ctx.fillRect(x + 7, y - 24, 6, 4);
  // Left arm
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 11, y - 30, 3, 12);
  // Feet/shoes
  ctx.fillStyle = '#111111';
  ctx.fillRect(x - 7, y - 2, 6, 2);
  ctx.fillRect(x + 1, y - 2, 6, 2);
  // Red trim on robe edges
  ctx.fillStyle = '#8B1A1A';
  ctx.fillRect(x - 9, y - 38, 2, 28);
  ctx.fillRect(x + 7, y - 38, 2, 28);
}

// Chairman B: Ancient Patriarch — crown, staff, flowing robes, gold trim
function drawSprite_chairman_B(ctx, cx, cy) {
  const x = cx, y = cy;
  // Robe body (deep red)
  ctx.fillStyle = '#8B1A1A';
  ctx.fillRect(x - 9, y - 36, 18, 26);
  ctx.fillRect(x - 8, y - 10, 16, 10);
  // Gold trim stripes on robe
  ctx.fillStyle = '#f0d060';
  ctx.fillRect(x - 9, y - 36, 2, 26);
  ctx.fillRect(x + 7, y - 36, 2, 26);
  ctx.fillRect(x - 8, y - 20, 16, 2);
  ctx.fillRect(x - 8, y - 28, 16, 2);
  // Face
  ctx.fillStyle = '#c8945a';
  ctx.fillRect(x - 5, y - 40, 10, 8);
  // Eyes
  ctx.fillStyle = '#2a1a00';
  ctx.fillRect(x - 4, y - 37, 2, 2);
  ctx.fillRect(x + 2, y - 37, 2, 2);
  // Beard (long, flowing gray)
  ctx.fillStyle = '#b0b0b0';
  ctx.fillRect(x - 4, y - 34, 8, 3);  // upper beard
  ctx.fillRect(x - 3, y - 31, 7, 4);  // mid beard
  ctx.fillRect(x - 2, y - 27, 5, 4);  // lower beard
  ctx.fillRect(x - 1, y - 23, 3, 5);  // beard tip
  // Ornate crown
  ctx.fillStyle = '#f0d060';
  ctx.fillRect(x - 6, y - 43, 12, 4);  // crown base
  ctx.fillRect(x - 5, y - 47, 2, 4);   // spike left
  ctx.fillRect(x - 1, y - 47, 2, 4);   // spike center
  ctx.fillRect(x + 3, y - 47, 2, 4);   // spike right
  // Crown gems
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(x - 4, y - 43, 2, 2);
  ctx.fillStyle = '#2255cc';
  ctx.fillRect(x, y - 43, 2, 2);
  ctx.fillStyle = '#22aa44';
  ctx.fillRect(x + 4, y - 43, 2, 2);
  // Staff (left hand)
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(x - 13, y - 38, 2, 38);
  // Staff top ornament
  ctx.fillStyle = '#f0d060';
  ctx.fillRect(x - 15, y - 40, 6, 4);
  ctx.fillRect(x - 13, y - 42, 2, 2);
  // Left arm holding staff
  ctx.fillStyle = '#8B1A1A';
  ctx.fillRect(x - 11, y - 30, 3, 10);
  // Right arm (gesturing)
  ctx.fillRect(x + 8, y - 30, 3, 8);
  ctx.fillStyle = '#c8945a';
  ctx.fillRect(x + 9, y - 23, 3, 5);
  // Shoes
  ctx.fillStyle = '#4a0a0a';
  ctx.fillRect(x - 8, y - 2, 6, 2);
  ctx.fillRect(x + 2, y - 2, 6, 2);
}

// Chairman C: Chairman Mao Era Official — Mao suit, red book, black cap with star
function drawSprite_chairman_C(ctx, cx, cy) {
  const x = cx, y = cy;
  // Body — Mao-collar suit (deep red)
  ctx.fillStyle = '#8B1A1A';
  ctx.fillRect(x - 8, y - 36, 16, 26);
  ctx.fillRect(x - 7, y - 10, 14, 10);
  // Mao collar (stand-up collar)
  ctx.fillStyle = '#6a1010';
  ctx.fillRect(x - 5, y - 36, 10, 4);
  // Button row
  ctx.fillStyle = '#5a0808';
  ctx.fillRect(x - 1, y - 34, 2, 24);
  // Jacket pockets
  ctx.fillStyle = '#7a1515';
  ctx.fillRect(x - 7, y - 28, 5, 4);
  ctx.fillRect(x + 2, y - 28, 5, 4);
  // Face
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x - 4, y - 40, 9, 7);
  // Eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 3, y - 37, 2, 2);
  ctx.fillRect(x + 2, y - 37, 2, 2);
  // Mouth
  ctx.fillRect(x - 1, y - 33, 3, 1);
  // Black cap
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 6, y - 43, 12, 4);  // cap body
  ctx.fillRect(x - 7, y - 44, 14, 2);  // cap brim
  // Red star on cap
  ctx.fillStyle = '#ff2222';
  ctx.fillRect(x - 1, y - 44, 3, 3);
  ctx.fillRect(x, y - 46, 1, 1);
  ctx.fillRect(x - 2, y - 45, 1, 1);
  ctx.fillRect(x + 2, y - 45, 1, 1);
  // Left arm
  ctx.fillStyle = '#8B1A1A';
  ctx.fillRect(x - 11, y - 34, 3, 12);
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x - 12, y - 23, 4, 5);
  // Right arm holding red book
  ctx.fillStyle = '#8B1A1A';
  ctx.fillRect(x + 8, y - 34, 3, 10);
  // Red book (held up)
  ctx.fillStyle = '#cc1111';
  ctx.fillRect(x + 7, y - 30, 6, 8);
  ctx.fillStyle = '#ffdd00';
  ctx.fillRect(x + 8, y - 29, 4, 1);
  ctx.fillRect(x + 8, y - 27, 4, 1);
  // Shoes
  ctx.fillStyle = '#111111';
  ctx.fillRect(x - 7, y - 2, 6, 2);
  ctx.fillRect(x + 1, y - 2, 6, 2);
}


// ─────────────────────────────────────────────
// CRITIC (Pippi the Pitiless) — #f87171
// ─────────────────────────────────────────────

// Critic A: Punk Critic — torn jacket, spiky hair, arms crossed, heavy boots
function drawSprite_critic_A(ctx, cx, cy) {
  const x = cx, y = cy;
  // Heavy boots
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 8, y - 5, 7, 5);
  ctx.fillRect(x + 1, y - 5, 7, 5);
  // Boots detail
  ctx.fillStyle = '#333333';
  ctx.fillRect(x - 8, y - 6, 7, 2);
  ctx.fillRect(x + 1, y - 6, 7, 2);
  // Pants (black, ripped)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 7, y - 18, 6, 13);
  ctx.fillRect(x + 1, y - 18, 6, 13);
  // Rip marks on pants
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x - 6, y - 14, 4, 1);
  ctx.fillRect(x + 2, y - 12, 4, 1);
  // Torn jacket (red and black)
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(x - 9, y - 34, 18, 16);
  // Jacket tears
  ctx.fillStyle = '#aa1111';
  ctx.fillRect(x - 9, y - 30, 3, 2);
  ctx.fillRect(x + 6, y - 26, 3, 2);
  // Black underlayer shirt
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 5, y - 34, 10, 16);
  // Arms crossed
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(x - 11, y - 32, 4, 10); // left arm
  ctx.fillRect(x + 7, y - 32, 4, 10);  // right arm
  // Crossed arm position
  ctx.fillStyle = '#d4857a';
  ctx.fillRect(x - 9, y - 26, 5, 4);   // left hand over right
  ctx.fillRect(x + 4, y - 26, 5, 4);   // right hand under left
  // Face (pale with scowl)
  ctx.fillStyle = '#f0d0d0';
  ctx.fillRect(x - 5, y - 40, 10, 8);
  // Eyes (narrow, angry)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 4, y - 37, 3, 1);
  ctx.fillRect(x + 1, y - 37, 3, 1);
  // Angry eyebrows (slanted)
  ctx.fillRect(x - 5, y - 39, 3, 1);
  ctx.fillRect(x + 2, y - 39, 3, 1);
  // Scowling mouth
  ctx.fillRect(x - 3, y - 33, 2, 1);
  ctx.fillRect(x + 1, y - 33, 2, 1);
  ctx.fillRect(x - 1, y - 34, 2, 1);
  // Spiky hair (multiple spikes)
  ctx.fillStyle = '#f87171';
  ctx.fillRect(x - 5, y - 43, 2, 4);
  ctx.fillRect(x - 2, y - 45, 2, 6);
  ctx.fillRect(x + 1, y - 44, 2, 5);
  ctx.fillRect(x + 4, y - 42, 2, 3);
  ctx.fillRect(x - 8, y - 41, 2, 2);
  // Studs on jacket
  ctx.fillStyle = '#888888';
  ctx.fillRect(x - 8, y - 33, 1, 1);
  ctx.fillRect(x - 8, y - 30, 1, 1);
  ctx.fillRect(x + 7, y - 33, 1, 1);
  ctx.fillRect(x + 7, y - 30, 1, 1);
}

// Critic B: Academic Red-Pen — blazer with elbow patches, glasses, red pen
function drawSprite_critic_B(ctx, cx, cy) {
  const x = cx, y = cy;
  // Shoes
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(x - 8, y - 3, 6, 3);
  ctx.fillRect(x + 2, y - 3, 6, 3);
  // Pants (dark gray)
  ctx.fillStyle = '#444444';
  ctx.fillRect(x - 7, y - 18, 6, 15);
  ctx.fillRect(x + 1, y - 18, 6, 15);
  // Blazer body (burgundy)
  ctx.fillStyle = '#8B3030';
  ctx.fillRect(x - 9, y - 35, 18, 17);
  // Shirt underneath (white)
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x - 4, y - 35, 8, 17);
  // Blazer lapels
  ctx.fillStyle = '#8B3030';
  ctx.fillRect(x - 4, y - 35, 4, 10);
  ctx.fillRect(x, y - 35, 4, 10);
  // Elbow patches (brown leather)
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(x - 11, y - 28, 4, 4);
  ctx.fillRect(x + 7, y - 28, 4, 4);
  // Left arm
  ctx.fillStyle = '#8B3030';
  ctx.fillRect(x - 11, y - 34, 3, 14);
  // Right arm holding pen up
  ctx.fillRect(x + 8, y - 34, 3, 10);
  // Hand
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x + 8, y - 26, 4, 4);
  // Red pen
  ctx.fillStyle = '#cc0000';
  ctx.fillRect(x + 10, y - 36, 2, 12);
  ctx.fillStyle = '#880000';
  ctx.fillRect(x + 10, y - 38, 2, 2);
  // Pen cap tip
  ctx.fillStyle = '#cc0000';
  ctx.fillRect(x + 11, y - 39, 1, 1);
  // Face
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x - 5, y - 42, 10, 9);
  // Bun hair
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(x - 5, y - 44, 10, 4);
  ctx.fillRect(x - 3, y - 46, 6, 4);
  ctx.fillRect(x - 1, y - 48, 2, 2);
  // Glasses frames (two rects)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 5, y - 38, 4, 3);
  ctx.fillRect(x + 1, y - 38, 4, 3);
  ctx.fillRect(x - 1, y - 37, 2, 1);
  // Lens tint
  ctx.fillStyle = 'rgba(200,220,255,0.5)';
  ctx.fillRect(x - 4, y - 37, 2, 2);
  ctx.fillRect(x + 2, y - 37, 2, 2);
  // Eyes behind glasses
  ctx.fillStyle = '#333333';
  ctx.fillRect(x - 4, y - 37, 2, 2);
  ctx.fillRect(x + 2, y - 37, 2, 2);
  // Mouth (pursed, judging)
  ctx.fillStyle = '#b07050';
  ctx.fillRect(x - 2, y - 33, 4, 1);
  // Left hand (holding papers, implied)
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x - 12, y - 24, 4, 4);
}

// Critic C: Gothic Critic — all black, cape, pale skin, choker
function drawSprite_critic_C(ctx, cx, cy) {
  const x = cx, y = cy;
  // Black platform boots
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(x - 8, y - 7, 7, 7);
  ctx.fillRect(x + 1, y - 7, 7, 7);
  // Platform soles
  ctx.fillStyle = '#222222';
  ctx.fillRect(x - 9, y - 3, 9, 3);
  ctx.fillRect(x, y - 3, 9, 3);
  // Black skirt/pants
  ctx.fillStyle = '#111111';
  ctx.fillRect(x - 8, y - 20, 16, 13);
  // Cape body (sweeping black)
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(x - 10, y - 36, 20, 16);
  ctx.fillRect(x - 11, y - 30, 3, 10);  // cape left drape
  ctx.fillRect(x + 8, y - 30, 3, 10);   // cape right drape
  // Cape lining (dark purple)
  ctx.fillStyle = '#2a0040';
  ctx.fillRect(x - 11, y - 30, 2, 10);
  ctx.fillRect(x + 9, y - 30, 2, 10);
  // Body under cape (black top)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 7, y - 36, 14, 16);
  // Pale face
  ctx.fillStyle = '#ffe0e0';
  ctx.fillRect(x - 5, y - 42, 10, 8);
  // Dark eye makeup
  ctx.fillStyle = '#1a0033';
  ctx.fillRect(x - 5, y - 39, 4, 3);  // left eye shadow
  ctx.fillRect(x + 1, y - 39, 4, 3);  // right eye shadow
  // Eyes (dark, outlined)
  ctx.fillStyle = '#800080';
  ctx.fillRect(x - 4, y - 38, 2, 2);
  ctx.fillRect(x + 2, y - 38, 2, 2);
  // Eye whites
  ctx.fillStyle = '#f0e0ff';
  ctx.fillRect(x - 4, y - 38, 1, 1);
  ctx.fillRect(x + 3, y - 38, 1, 1);
  // Eyebrows (sharp, arched)
  ctx.fillStyle = '#1a0033';
  ctx.fillRect(x - 5, y - 41, 4, 1);
  ctx.fillRect(x + 1, y - 41, 4, 1);
  // Pale lips (dark)
  ctx.fillStyle = '#660055';
  ctx.fillRect(x - 2, y - 35, 4, 2);
  // Black hair (down both sides)
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(x - 6, y - 44, 12, 4);
  ctx.fillRect(x - 7, y - 43, 2, 12);
  ctx.fillRect(x + 5, y - 43, 2, 12);
  // Choker
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 4, y - 35, 8, 2);
  // Choker gem
  ctx.fillStyle = '#800080';
  ctx.fillRect(x - 1, y - 35, 2, 2);
  // Left arm with lace detail
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 11, y - 34, 3, 14);
  ctx.fillStyle = '#333333';
  ctx.fillRect(x - 11, y - 22, 3, 3);
  // Right arm
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + 8, y - 34, 3, 14);
  ctx.fillStyle = '#333333';
  ctx.fillRect(x + 8, y - 22, 3, 3);
}


// ─────────────────────────────────────────────
// ARCHITECT (Kwame the Constructor) — #f59e0b
// ─────────────────────────────────────────────

// Architect A: Blueprint Man — hard hat, blueprint roll, construction vest
function drawSprite_architect_A(ctx, cx, cy) {
  const x = cx, y = cy;
  // Work boots
  ctx.fillStyle = '#5a3010';
  ctx.fillRect(x - 8, y - 4, 7, 4);
  ctx.fillRect(x + 1, y - 4, 7, 4);
  ctx.fillStyle = '#3a2000';
  ctx.fillRect(x - 8, y - 2, 7, 2);
  ctx.fillRect(x + 1, y - 2, 7, 2);
  // Pants (work jeans, blue)
  ctx.fillStyle = '#2a4a7a';
  ctx.fillRect(x - 7, y - 18, 6, 14);
  ctx.fillRect(x + 1, y - 18, 6, 14);
  // Belt
  ctx.fillStyle = '#4a3010';
  ctx.fillRect(x - 7, y - 20, 14, 2);
  ctx.fillStyle = '#888840';
  ctx.fillRect(x - 1, y - 20, 2, 2);
  // Construction vest (orange/yellow)
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(x - 9, y - 35, 18, 15);
  // Reflective stripes on vest
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 9, y - 28, 18, 2);
  ctx.fillRect(x - 9, y - 24, 18, 2);
  // Vest pockets
  ctx.fillStyle = '#e08800';
  ctx.fillRect(x - 8, y - 35, 5, 5);
  ctx.fillRect(x + 3, y - 35, 5, 5);
  // Shirt underneath (gray)
  ctx.fillStyle = '#aaaaaa';
  ctx.fillRect(x - 5, y - 35, 10, 15);
  // Left arm
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(x - 12, y - 33, 4, 13);
  // Right arm holding blueprint
  ctx.fillRect(x + 8, y - 33, 4, 10);
  // Blueprint roll (blue cylinder)
  ctx.fillStyle = '#2255cc';
  ctx.fillRect(x + 8, y - 30, 4, 10);
  ctx.fillStyle = '#3366dd';
  ctx.fillRect(x + 9, y - 30, 2, 10);
  // Blueprint end
  ctx.fillStyle = '#1144aa';
  ctx.fillRect(x + 8, y - 32, 4, 2);
  ctx.fillRect(x + 8, y - 20, 4, 2);
  // Hands
  ctx.fillStyle = '#c8955a';
  ctx.fillRect(x - 13, y - 22, 4, 4);
  // Face
  ctx.fillStyle = '#a06030';
  ctx.fillRect(x - 5, y - 41, 10, 8);
  // Eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 4, y - 38, 2, 2);
  ctx.fillRect(x + 2, y - 38, 2, 2);
  // Eyebrows
  ctx.fillRect(x - 4, y - 40, 2, 1);
  ctx.fillRect(x + 2, y - 40, 2, 1);
  // Mouth (focused)
  ctx.fillStyle = '#804020';
  ctx.fillRect(x - 2, y - 34, 4, 1);
  // Hard hat (orange/yellow)
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(x - 7, y - 45, 14, 5);
  ctx.fillRect(x - 5, y - 48, 10, 4);
  // Hard hat brim
  ctx.fillStyle = '#e08800';
  ctx.fillRect(x - 8, y - 43, 16, 2);
  // Hat stripe detail
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 5, y - 47, 10, 1);
}

// Architect B: Digital Architect — holographic outfit, floating geometry, tablet
function drawSprite_architect_B(ctx, cx, cy) {
  const x = cx, y = cy;
  // Shoes (sleek, white/blue)
  ctx.fillStyle = '#c0d8ff';
  ctx.fillRect(x - 8, y - 3, 7, 3);
  ctx.fillRect(x + 1, y - 3, 7, 3);
  // Pants (light blue-gray, techy)
  ctx.fillStyle = '#7090c0';
  ctx.fillRect(x - 7, y - 18, 6, 15);
  ctx.fillRect(x + 1, y - 18, 6, 15);
  // Tech lines on pants
  ctx.fillStyle = '#90b0e0';
  ctx.fillRect(x - 6, y - 15, 1, 10);
  ctx.fillRect(x + 5, y - 15, 1, 10);
  // Holographic jacket (cyan-blue)
  ctx.fillStyle = '#40a8f0';
  ctx.fillRect(x - 9, y - 36, 18, 18);
  // Holographic shimmer layer
  ctx.fillStyle = '#80ccff';
  ctx.fillRect(x - 5, y - 36, 3, 18);
  ctx.fillRect(x + 2, y - 36, 3, 18);
  // Face
  ctx.fillStyle = '#a06030';
  ctx.fillRect(x - 5, y - 42, 10, 8);
  // Eyes (glowing blue tint)
  ctx.fillStyle = '#0066cc';
  ctx.fillRect(x - 4, y - 39, 3, 3);
  ctx.fillRect(x + 1, y - 39, 3, 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 3, y - 38, 1, 1);
  ctx.fillRect(x + 2, y - 38, 1, 1);
  // Short hair
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 5, y - 44, 10, 4);
  // Mouth
  ctx.fillStyle = '#805030';
  ctx.fillRect(x - 2, y - 34, 4, 1);
  // Left arm
  ctx.fillStyle = '#40a8f0';
  ctx.fillRect(x - 12, y - 34, 4, 14);
  ctx.fillStyle = '#a06030';
  ctx.fillRect(x - 13, y - 22, 4, 4);
  // Right arm holding tablet
  ctx.fillStyle = '#40a8f0';
  ctx.fillRect(x + 8, y - 34, 4, 12);
  // Tablet
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(x + 7, y - 32, 7, 10);
  // Tablet screen glow
  ctx.fillStyle = '#00ccff';
  ctx.fillRect(x + 8, y - 31, 5, 8);
  // Grid on screen
  ctx.fillStyle = '#0088aa';
  ctx.fillRect(x + 8, y - 29, 5, 1);
  ctx.fillRect(x + 8, y - 27, 5, 1);
  ctx.fillRect(x + 10, y - 31, 1, 8);
  // Floating geometric shapes
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(x - 15, y - 30, 4, 4);   // floating square left
  ctx.fillStyle = '#f0d060';
  ctx.fillRect(x - 16, y - 22, 3, 3);
  ctx.fillStyle = '#80ffcc';
  ctx.fillRect(x + 13, y - 35, 4, 4);   // floating square right
  ctx.fillStyle = '#00ffcc';
  ctx.fillRect(x + 14, y - 27, 3, 3);
  // Floating triangle dots (apex detail)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 14, y - 32, 1, 1);
  ctx.fillRect(x + 13, y - 37, 1, 1);
}

// Architect C: Ancient Builder — Egyptian architect, linen robes, khepresh crown, papyrus
function drawSprite_architect_C(ctx, cx, cy) {
  const x = cx, y = cy;
  // Sandals
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(x - 8, y - 2, 7, 2);
  ctx.fillRect(x + 1, y - 2, 7, 2);
  // Straps
  ctx.fillStyle = '#6a5010';
  ctx.fillRect(x - 6, y - 4, 1, 4);
  ctx.fillRect(x - 3, y - 4, 1, 4);
  ctx.fillRect(x + 2, y - 4, 1, 4);
  ctx.fillRect(x + 5, y - 4, 1, 4);
  // Linen kilt/skirt (white)
  ctx.fillStyle = '#f0ead0';
  ctx.fillRect(x - 7, y - 18, 14, 16);
  // Kilt pleats
  ctx.fillStyle = '#d4ccaa';
  ctx.fillRect(x - 5, y - 18, 1, 16);
  ctx.fillRect(x - 2, y - 18, 1, 16);
  ctx.fillRect(x + 1, y - 18, 1, 16);
  ctx.fillRect(x + 4, y - 18, 1, 16);
  // Belt/sash with gold
  ctx.fillStyle = '#f0d060';
  ctx.fillRect(x - 7, y - 20, 14, 2);
  // Upper body (linen robe)
  ctx.fillStyle = '#f0ead0';
  ctx.fillRect(x - 8, y - 36, 16, 16);
  // Gold collar (broad collar necklace)
  ctx.fillStyle = '#f0d060';
  ctx.fillRect(x - 7, y - 36, 14, 3);
  ctx.fillStyle = '#e0b040';
  ctx.fillRect(x - 6, y - 34, 12, 2);
  // Lapis blue gems on collar
  ctx.fillStyle = '#2255cc';
  ctx.fillRect(x - 5, y - 36, 2, 2);
  ctx.fillRect(x - 1, y - 36, 2, 2);
  ctx.fillRect(x + 3, y - 36, 2, 2);
  // Face (Egyptian dark skin)
  ctx.fillStyle = '#8B5a2a';
  ctx.fillRect(x - 5, y - 42, 10, 8);
  // Kohl-lined eyes (Egyptian style)
  ctx.fillStyle = '#1a1a00';
  ctx.fillRect(x - 5, y - 39, 4, 2);
  ctx.fillRect(x + 1, y - 39, 4, 2);
  ctx.fillStyle = '#8B5a2a';
  ctx.fillRect(x - 4, y - 39, 2, 2);
  ctx.fillRect(x + 2, y - 39, 2, 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 4, y - 38, 1, 1);
  ctx.fillRect(x + 3, y - 38, 1, 1);
  // Khepresh-style crown (blue war crown)
  ctx.fillStyle = '#1a44cc';
  ctx.fillRect(x - 5, y - 46, 10, 5);  // main crown body
  ctx.fillRect(x - 4, y - 48, 8, 3);   // crown top rounded
  // Crown gold band at base
  ctx.fillStyle = '#f0d060';
  ctx.fillRect(x - 5, y - 43, 10, 2);
  // Crown dots detail
  ctx.fillStyle = '#2266ff';
  ctx.fillRect(x - 3, y - 46, 1, 1);
  ctx.fillRect(x, y - 47, 1, 1);
  ctx.fillRect(x + 3, y - 46, 1, 1);
  // Left arm
  ctx.fillStyle = '#f0ead0';
  ctx.fillRect(x - 12, y - 34, 4, 14);
  ctx.fillStyle = '#8B5a2a';
  ctx.fillRect(x - 13, y - 22, 4, 5);
  // Right arm holding papyrus
  ctx.fillStyle = '#f0ead0';
  ctx.fillRect(x + 8, y - 34, 4, 12);
  // Papyrus scroll (unrolled, tan)
  ctx.fillStyle = '#d4b870';
  ctx.fillRect(x + 8, y - 34, 6, 10);
  ctx.fillStyle = '#b89040';
  ctx.fillRect(x + 8, y - 34, 6, 1);
  ctx.fillRect(x + 8, y - 24, 6, 1);
  // Lines on papyrus (hieroglyphs)
  ctx.fillStyle = '#4a3010';
  ctx.fillRect(x + 9, y - 32, 4, 1);
  ctx.fillRect(x + 9, y - 30, 3, 1);
  ctx.fillRect(x + 9, y - 28, 4, 1);
  ctx.fillRect(x + 9, y - 26, 2, 1);
}


// ─────────────────────────────────────────────
// UX (Yuki the Yielding) — #60a5fa
// ─────────────────────────────────────────────

// UX A: UX Researcher — casual blazer, clipboard, wide eyes
function drawSprite_ux_A(ctx, cx, cy) {
  const x = cx, y = cy;
  // Shoes (neat, white sneakers)
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x - 8, y - 3, 7, 3);
  ctx.fillRect(x + 1, y - 3, 7, 3);
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(x - 7, y - 4, 5, 1);
  ctx.fillRect(x + 2, y - 4, 5, 1);
  // Pants (neat light gray)
  ctx.fillStyle = '#d0d8e8';
  ctx.fillRect(x - 7, y - 18, 6, 15);
  ctx.fillRect(x + 1, y - 18, 6, 15);
  // Casual blazer (soft blue)
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(x - 9, y - 35, 18, 17);
  // Lighter shirt beneath
  ctx.fillStyle = '#e8f4ff';
  ctx.fillRect(x - 5, y - 35, 10, 17);
  // Blazer lapels
  ctx.fillStyle = '#4a90e8';
  ctx.fillRect(x - 5, y - 35, 5, 10);
  ctx.fillRect(x, y - 35, 5, 10);
  // Small button detail
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 1, y - 28, 2, 2);
  // Left arm
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(x - 12, y - 33, 4, 13);
  // Right arm holding clipboard
  ctx.fillRect(x + 8, y - 33, 4, 12);
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x + 9, y - 23, 3, 4);
  // Clipboard
  ctx.fillStyle = '#c8a060';
  ctx.fillRect(x + 7, y - 33, 6, 12);
  // Clipboard clip
  ctx.fillStyle = '#888888';
  ctx.fillRect(x + 9, y - 34, 2, 3);
  // Clipboard paper
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 8, y - 32, 4, 9);
  // Lines on paper
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(x + 9, y - 30, 2, 1);
  ctx.fillRect(x + 9, y - 28, 2, 1);
  ctx.fillRect(x + 9, y - 26, 2, 1);
  // Face (friendly, open)
  ctx.fillStyle = '#f5c8a0';
  ctx.fillRect(x - 5, y - 42, 10, 9);
  // Wide, empathetic eyes
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x - 5, y - 39, 4, 4);
  ctx.fillRect(x + 1, y - 39, 4, 4);
  // Eye whites
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 4, y - 38, 2, 2);
  ctx.fillRect(x + 2, y - 38, 2, 2);
  // Pupils
  ctx.fillStyle = '#1a1a44';
  ctx.fillRect(x - 4, y - 38, 1, 1);
  ctx.fillRect(x + 3, y - 38, 1, 1);
  // Eyebrows (soft, raised slightly)
  ctx.fillStyle = '#2a1a00';
  ctx.fillRect(x - 4, y - 41, 3, 1);
  ctx.fillRect(x + 1, y - 41, 3, 1);
  // Smile
  ctx.fillStyle = '#c07050';
  ctx.fillRect(x - 3, y - 33, 6, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 2, y - 33, 4, 1);
  // Hair (medium length, dark)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 5, y - 44, 10, 4);
  ctx.fillRect(x - 6, y - 43, 2, 6);
  ctx.fillRect(x + 4, y - 43, 2, 4);
  // Left hand (open, gesturing)
  ctx.fillStyle = '#f5c8a0';
  ctx.fillRect(x - 13, y - 24, 4, 4);
}

// UX B: Wireframe Wizard — light gray outfit with wireframe grid, sticky note
function drawSprite_ux_B(ctx, cx, cy) {
  const x = cx, y = cy;
  // Shoes (gray)
  ctx.fillStyle = '#888888';
  ctx.fillRect(x - 8, y - 3, 7, 3);
  ctx.fillRect(x + 1, y - 3, 7, 3);
  // Pants (light gray)
  ctx.fillStyle = '#c0c8d0';
  ctx.fillRect(x - 7, y - 18, 6, 15);
  ctx.fillRect(x + 1, y - 18, 6, 15);
  // Wireframe grid on pants
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(x - 6, y - 16, 4, 1);
  ctx.fillRect(x - 6, y - 12, 4, 1);
  ctx.fillRect(x + 2, y - 14, 4, 1);
  ctx.fillRect(x + 2, y - 10, 4, 1);
  // Body (gray #60a5fa tinted outfit)
  ctx.fillStyle = '#9ab8d8';
  ctx.fillRect(x - 9, y - 35, 18, 17);
  // Wireframe grid pattern on top (drawn as lines)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 8, y - 32, 16, 1);
  ctx.fillRect(x - 8, y - 27, 16, 1);
  ctx.fillRect(x - 8, y - 22, 16, 1);
  ctx.fillRect(x - 4, y - 35, 1, 17);
  ctx.fillRect(x, y - 35, 1, 17);
  ctx.fillRect(x + 4, y - 35, 1, 17);
  // Sticky note on chest (yellow)
  ctx.fillStyle = '#ffee44';
  ctx.fillRect(x - 3, y - 30, 6, 6);
  // Lines on sticky note
  ctx.fillStyle = '#ccaa00';
  ctx.fillRect(x - 2, y - 29, 4, 1);
  ctx.fillRect(x - 2, y - 27, 4, 1);
  ctx.fillRect(x - 2, y - 25, 3, 1);
  // Left arm
  ctx.fillStyle = '#9ab8d8';
  ctx.fillRect(x - 12, y - 33, 4, 13);
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(x - 8, y - 35, 1, 17);
  // Right arm
  ctx.fillStyle = '#9ab8d8';
  ctx.fillRect(x + 8, y - 33, 4, 13);
  // Face
  ctx.fillStyle = '#f5c8a0';
  ctx.fillRect(x - 5, y - 42, 10, 9);
  // Eyes (focused)
  ctx.fillStyle = '#2a2a4a';
  ctx.fillRect(x - 4, y - 39, 3, 2);
  ctx.fillRect(x + 1, y - 39, 3, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 3, y - 39, 1, 1);
  ctx.fillRect(x + 2, y - 39, 1, 1);
  // Eyebrows
  ctx.fillStyle = '#333333';
  ctx.fillRect(x - 4, y - 41, 3, 1);
  ctx.fillRect(x + 1, y - 41, 3, 1);
  // Neutral/focused mouth
  ctx.fillStyle = '#c07050';
  ctx.fillRect(x - 2, y - 34, 4, 1);
  // Hair (shorter, swept)
  ctx.fillStyle = '#4a3010';
  ctx.fillRect(x - 5, y - 44, 10, 4);
  ctx.fillRect(x + 4, y - 43, 2, 2);
  // Hands
  ctx.fillStyle = '#f5c8a0';
  ctx.fillRect(x - 13, y - 23, 4, 4);
  ctx.fillRect(x + 9, y - 23, 4, 4);
}

// UX C: Accessibility Advocate — bright friendly, large gesturing hands, hearing aid, colorful
function drawSprite_ux_C(ctx, cx, cy) {
  const x = cx, y = cy;
  // Bright shoes (colorful)
  ctx.fillStyle = '#ff6644';
  ctx.fillRect(x - 8, y - 4, 7, 4);
  ctx.fillStyle = '#44aaff';
  ctx.fillRect(x + 1, y - 4, 7, 4);
  // Pants (warm yellow)
  ctx.fillStyle = '#f0c030';
  ctx.fillRect(x - 7, y - 18, 6, 14);
  ctx.fillRect(x + 1, y - 18, 6, 14);
  // Bright top (teal/green)
  ctx.fillStyle = '#20c080';
  ctx.fillRect(x - 9, y - 36, 18, 18);
  // Colorful stripes
  ctx.fillStyle = '#ff6644';
  ctx.fillRect(x - 9, y - 33, 18, 3);
  ctx.fillStyle = '#ffee44';
  ctx.fillRect(x - 9, y - 27, 18, 3);
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(x - 9, y - 21, 18, 3);
  // Face (warm)
  ctx.fillStyle = '#e0a870';
  ctx.fillRect(x - 5, y - 42, 10, 8);
  // Friendly wide eyes
  ctx.fillStyle = '#1a2a1a';
  ctx.fillRect(x - 5, y - 39, 4, 3);
  ctx.fillRect(x + 1, y - 39, 4, 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 4, y - 38, 2, 1);
  ctx.fillRect(x + 2, y - 38, 2, 1);
  // Big smile
  ctx.fillStyle = '#cc6040';
  ctx.fillRect(x - 4, y - 34, 8, 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 3, y - 33, 6, 1);
  // Hair (natural, loose)
  ctx.fillStyle = '#2a1a00';
  ctx.fillRect(x - 6, y - 44, 12, 4);
  ctx.fillRect(x - 7, y - 43, 2, 8);
  ctx.fillRect(x + 5, y - 43, 2, 6);
  ctx.fillRect(x - 6, y - 37, 2, 3);
  // Hearing aid (small pixel behind ear)
  ctx.fillStyle = '#cc8844';
  ctx.fillRect(x + 5, y - 41, 2, 2);
  ctx.fillRect(x + 6, y - 40, 1, 3);
  // Eyebrows (friendly arc)
  ctx.fillStyle = '#2a1a00';
  ctx.fillRect(x - 4, y - 41, 3, 1);
  ctx.fillRect(x + 1, y - 41, 3, 1);
  // Left arm (large, gesturing outward)
  ctx.fillStyle = '#20c080';
  ctx.fillRect(x - 13, y - 34, 5, 12);
  // Large left hand (gesturing open)
  ctx.fillStyle = '#e0a870';
  ctx.fillRect(x - 15, y - 26, 6, 6);
  ctx.fillRect(x - 16, y - 27, 2, 2);  // thumb
  ctx.fillRect(x - 14, y - 29, 1, 3);  // fingers
  ctx.fillRect(x - 12, y - 29, 1, 3);
  ctx.fillRect(x - 10, y - 29, 1, 3);
  // Right arm (also gesturing)
  ctx.fillStyle = '#20c080';
  ctx.fillRect(x + 8, y - 34, 5, 12);
  // Large right hand
  ctx.fillStyle = '#e0a870';
  ctx.fillRect(x + 9, y - 26, 6, 6);
  ctx.fillRect(x + 13, y - 27, 2, 2);  // thumb
  ctx.fillRect(x + 9, y - 29, 1, 3);   // fingers
  ctx.fillRect(x + 11, y - 29, 1, 3);
  ctx.fillRect(x + 13, y - 29, 1, 3);
  // Colorful accessories — bracelet
  ctx.fillStyle = '#ff3399';
  ctx.fillRect(x - 15, y - 23, 6, 2);
  ctx.fillStyle = '#ffee44';
  ctx.fillRect(x + 9, y - 23, 6, 2);
}


// ─────────────────────────────────────────────
// DESIGNER (Vesper the Vivid) — #ec4899
// ─────────────────────────────────────────────

// Designer A: Bauhaus — geometric color-blocked outfit, beret, measuring tape
function drawSprite_designer_A(ctx, cx, cy) {
  const x = cx, y = cy;
  // Shoes (black, sleek)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 8, y - 3, 7, 3);
  ctx.fillRect(x + 1, y - 3, 7, 3);
  // Left leg — primary red block
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(x - 7, y - 18, 6, 15);
  // Right leg — primary blue block
  ctx.fillStyle = '#2244cc';
  ctx.fillRect(x + 1, y - 18, 6, 15);
  // Body — geometric color blocks
  ctx.fillStyle = '#f0c030'; // yellow top-left
  ctx.fillRect(x - 9, y - 36, 9, 9);
  ctx.fillStyle = '#cc2222'; // red top-right
  ctx.fillRect(x, y - 36, 9, 9);
  ctx.fillStyle = '#2244cc'; // blue bottom-left
  ctx.fillRect(x - 9, y - 27, 9, 9);
  ctx.fillStyle = '#f0f0f0'; // white bottom-right
  ctx.fillRect(x, y - 27, 9, 9);
  // Black dividing lines (Mondrian style)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 1, y - 36, 2, 18);
  ctx.fillRect(x - 9, y - 28, 18, 2);
  // Left arm
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(x - 12, y - 34, 4, 14);
  // Right arm holding measuring tape
  ctx.fillStyle = '#2244cc';
  ctx.fillRect(x + 8, y - 34, 4, 10);
  // Measuring tape (yellow roll)
  ctx.fillStyle = '#f0c030';
  ctx.fillRect(x + 8, y - 28, 5, 5);
  ctx.fillStyle = '#ccaa10';
  ctx.fillRect(x + 9, y - 27, 3, 3);
  // Tape unrolling
  ctx.fillStyle = '#f0c030';
  ctx.fillRect(x + 13, y - 28, 4, 1);
  // Face
  ctx.fillStyle = '#f5c8b0';
  ctx.fillRect(x - 5, y - 42, 10, 8);
  // Eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 4, y - 39, 3, 2);
  ctx.fillRect(x + 1, y - 39, 3, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 3, y - 39, 1, 1);
  ctx.fillRect(x + 2, y - 39, 1, 1);
  // Eyebrows
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 4, y - 41, 3, 1);
  ctx.fillRect(x + 1, y - 41, 3, 1);
  // Confident mouth
  ctx.fillStyle = '#ec4899';
  ctx.fillRect(x - 3, y - 34, 6, 2);
  // Beret (black with red trim)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 6, y - 45, 12, 4);
  ctx.fillRect(x - 4, y - 47, 8, 3);
  // Beret stem
  ctx.fillRect(x + 3, y - 48, 2, 2);
  // Beret pop of color
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(x - 4, y - 45, 4, 2);
  // Hands
  ctx.fillStyle = '#f5c8b0';
  ctx.fillRect(x - 13, y - 23, 4, 4);
  // Hair peeking from beret
  ctx.fillStyle = '#4a2010';
  ctx.fillRect(x - 6, y - 43, 2, 2);
  ctx.fillRect(x + 4, y - 43, 2, 2);
}

// Designer B: Art Nouveau — flowing robes, organic swirling patterns, flowing hair
function drawSprite_designer_B(ctx, cx, cy) {
  const x = cx, y = cy;
  // Flowing robe base (lighter pink)
  ctx.fillStyle = '#f9a8d4';
  ctx.fillRect(x - 10, y - 36, 20, 36);
  // Robe tapering at hem
  ctx.fillStyle = '#f9a8d4';
  ctx.fillRect(x - 9, y - 10, 18, 10);
  ctx.fillRect(x - 8, y - 4, 16, 4);
  // Swirling organic pattern in #ec4899 on lighter pink robe
  ctx.fillStyle = '#ec4899';
  // Swirl curves approximated with fillRect
  ctx.fillRect(x - 8, y - 34, 3, 1);
  ctx.fillRect(x - 9, y - 33, 2, 2);
  ctx.fillRect(x - 9, y - 31, 3, 1);
  ctx.fillRect(x - 7, y - 30, 2, 2);
  ctx.fillRect(x - 5, y - 29, 3, 1);
  ctx.fillRect(x - 4, y - 28, 1, 3);
  ctx.fillRect(x - 5, y - 25, 3, 1);
  // Right side swirl
  ctx.fillRect(x + 5, y - 34, 3, 1);
  ctx.fillRect(x + 7, y - 33, 2, 2);
  ctx.fillRect(x + 6, y - 31, 3, 1);
  ctx.fillRect(x + 4, y - 30, 2, 2);
  ctx.fillRect(x + 3, y - 28, 3, 1);
  ctx.fillRect(x + 3, y - 26, 1, 3);
  // Center floral
  ctx.fillRect(x - 2, y - 22, 4, 1);
  ctx.fillRect(x - 1, y - 23, 2, 3);
  ctx.fillRect(x - 3, y - 21, 6, 1);
  // Belt/sash (deep pink)
  ctx.fillStyle = '#be185d';
  ctx.fillRect(x - 9, y - 20, 18, 2);
  // Face
  ctx.fillStyle = '#f5d0c0';
  ctx.fillRect(x - 5, y - 42, 10, 8);
  // Flowing hair (wide, multi-layered)
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(x - 7, y - 46, 14, 6);   // top of hair
  ctx.fillRect(x - 9, y - 43, 4, 12);   // left hair flow
  ctx.fillRect(x + 5, y - 43, 4, 14);   // right hair flow
  ctx.fillRect(x - 10, y - 38, 3, 6);   // extra left sweep
  ctx.fillRect(x + 7, y - 38, 3, 8);    // extra right sweep
  ctx.fillStyle = '#a05020';
  ctx.fillRect(x - 8, y - 45, 2, 4);
  ctx.fillRect(x + 6, y - 45, 2, 4);
  // Eyes (soft, expressive)
  ctx.fillStyle = '#2a1a00';
  ctx.fillRect(x - 4, y - 38, 3, 3);
  ctx.fillRect(x + 1, y - 38, 3, 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 3, y - 37, 1, 1);
  ctx.fillRect(x + 2, y - 37, 1, 1);
  ctx.fillStyle = '#6a3010';
  ctx.fillRect(x - 4, y - 41, 3, 1);
  ctx.fillRect(x + 1, y - 41, 3, 1);
  // Lips
  ctx.fillStyle = '#ec4899';
  ctx.fillRect(x - 2, y - 34, 4, 2);
  // Flowing sleeves
  ctx.fillStyle = '#f9a8d4';
  ctx.fillRect(x - 13, y - 34, 5, 16);
  ctx.fillRect(x + 8, y - 34, 5, 16);
  ctx.fillRect(x - 15, y - 28, 4, 6);   // sleeve flare left
  ctx.fillRect(x + 11, y - 28, 4, 6);   // sleeve flare right
  // Hands
  ctx.fillStyle = '#f5d0c0';
  ctx.fillRect(x - 14, y - 22, 4, 4);
  ctx.fillRect(x + 10, y - 22, 4, 4);
}

// Designer C: Cyberpunk Designer — neon pink suit, half-shaved hair, holographic palette
function drawSprite_designer_C(ctx, cx, cy) {
  const x = cx, y = cy;
  // Boots (dark, platform)
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(x - 8, y - 6, 7, 6);
  ctx.fillRect(x + 1, y - 6, 7, 6);
  // Platform soles (neon pink)
  ctx.fillStyle = '#ff69b4';
  ctx.fillRect(x - 9, y - 3, 9, 3);
  ctx.fillRect(x, y - 3, 9, 3);
  // Dark pants
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(x - 7, y - 20, 6, 14);
  ctx.fillRect(x + 1, y - 20, 6, 14);
  // Neon stripe on pants
  ctx.fillStyle = '#ff69b4';
  ctx.fillRect(x - 5, y - 20, 1, 14);
  ctx.fillRect(x + 4, y - 20, 1, 14);
  // Dark fitted jacket
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(x - 9, y - 36, 18, 16);
  // Neon pink jacket accents
  ctx.fillStyle = '#ff69b4';
  ctx.fillRect(x - 9, y - 36, 2, 16);
  ctx.fillRect(x + 7, y - 36, 2, 16);
  ctx.fillRect(x - 9, y - 36, 18, 2);
  // Collar (stand-up)
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x - 5, y - 36, 10, 4);
  // Neon highlights on collar
  ctx.fillStyle = '#ff69b4';
  ctx.fillRect(x - 4, y - 36, 2, 1);
  ctx.fillRect(x + 2, y - 36, 2, 1);
  // Face (pale, dramatic makeup)
  ctx.fillStyle = '#f0e0f0';
  ctx.fillRect(x - 5, y - 42, 10, 8);
  // Half shaved hair — one side has hair, other shaved
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 5, y - 46, 10, 5);  // top
  ctx.fillRect(x - 6, y - 44, 2, 8);   // left side full hair
  ctx.fillRect(x - 7, y - 42, 2, 4);   // left extra drape
  // Shaved side (skin shows, right side)
  ctx.fillStyle = '#f0e0f0';
  ctx.fillRect(x + 4, y - 43, 2, 4);
  // Neon pink hair stripe
  ctx.fillStyle = '#ff69b4';
  ctx.fillRect(x - 4, y - 46, 2, 5);
  // Eyes (dramatic, heavy liner)
  ctx.fillStyle = '#1a001a';
  ctx.fillRect(x - 5, y - 39, 4, 3);
  ctx.fillRect(x + 1, y - 39, 4, 3);
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(x - 4, y - 38, 2, 2);
  ctx.fillRect(x + 2, y - 38, 2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 4, y - 38, 1, 1);
  ctx.fillRect(x + 3, y - 38, 1, 1);
  // Eyebrows (sharp)
  ctx.fillStyle = '#1a001a';
  ctx.fillRect(x - 5, y - 41, 4, 1);
  ctx.fillRect(x + 1, y - 41, 4, 1);
  // Lips (neon pink)
  ctx.fillStyle = '#ff69b4';
  ctx.fillRect(x - 3, y - 34, 6, 2);
  // Left arm
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(x - 12, y - 34, 4, 14);
  ctx.fillStyle = '#ff69b4';
  ctx.fillRect(x - 12, y - 34, 1, 14);
  // Right arm holding holographic palette
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(x + 8, y - 34, 4, 12);
  // Holographic palette
  ctx.fillStyle = '#330066';
  ctx.fillRect(x + 8, y - 34, 7, 10);
  // Palette holes (thumb hole)
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(x + 10, y - 30, 2, 2);
  // Color swatches on palette (neon colors)
  ctx.fillStyle = '#ff0080';
  ctx.fillRect(x + 8, y - 33, 2, 2);
  ctx.fillStyle = '#00ffff';
  ctx.fillRect(x + 11, y - 33, 2, 2);
  ctx.fillStyle = '#ffff00';
  ctx.fillRect(x + 8, y - 29, 2, 2);
  ctx.fillStyle = '#00ff80';
  ctx.fillRect(x + 11, y - 29, 2, 2);
  // Hands
  ctx.fillStyle = '#f0e0f0';
  ctx.fillRect(x - 13, y - 23, 4, 4);
}


// ─────────────────────────────────────────────
// GALACTUS — #6366f1 (drawn at 1x; caller applies 1.8x scale)
// ─────────────────────────────────────────────

// Galactus A: Classic Cosmic — purple-blue armor, crown spikes, stars in chest
function drawSprite_galactus_A(ctx, cx, cy) {
  const x = cx, y = cy;
  // Massive feet/boots (cosmic purple)
  ctx.fillStyle = '#4a3a8a';
  ctx.fillRect(x - 10, y - 6, 9, 6);
  ctx.fillRect(x + 1, y - 6, 9, 6);
  // Boot tops (lighter band)
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x - 10, y - 8, 9, 2);
  ctx.fillRect(x + 1, y - 8, 9, 2);
  // Legs (armored, imposing)
  ctx.fillStyle = '#3a2a7a';
  ctx.fillRect(x - 9, y - 22, 7, 14);
  ctx.fillRect(x + 2, y - 22, 7, 14);
  // Knee armor plates
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x - 9, y - 16, 7, 3);
  ctx.fillRect(x + 2, y - 16, 7, 3);
  // Massive torso
  ctx.fillStyle = '#2a1a6a';
  ctx.fillRect(x - 12, y - 38, 24, 16);
  // Armor chest plate
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x - 9, y - 38, 18, 12);
  // Chest star field (white dots)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 7, y - 36, 1, 1);
  ctx.fillRect(x - 3, y - 34, 1, 1);
  ctx.fillRect(x + 1, y - 37, 1, 1);
  ctx.fillRect(x + 5, y - 35, 1, 1);
  ctx.fillRect(x - 5, y - 32, 1, 1);
  ctx.fillRect(x + 3, y - 31, 1, 1);
  ctx.fillRect(x - 1, y - 29, 1, 1);
  ctx.fillRect(x + 6, y - 33, 1, 1);
  ctx.fillRect(x - 8, y - 30, 1, 1);
  // Central emblem (bright)
  ctx.fillStyle = '#a5b4fc';
  ctx.fillRect(x - 3, y - 34, 6, 6);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 1, y - 32, 2, 2);
  // Shoulder armor (massive)
  ctx.fillStyle = '#4a3a8a';
  ctx.fillRect(x - 14, y - 38, 5, 8);
  ctx.fillRect(x + 9, y - 38, 5, 8);
  // Shoulder spikes
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x - 16, y - 42, 3, 6);
  ctx.fillRect(x + 13, y - 42, 3, 6);
  // Arms (massive)
  ctx.fillStyle = '#3a2a7a';
  ctx.fillRect(x - 14, y - 34, 4, 12);
  ctx.fillRect(x + 10, y - 34, 4, 12);
  // Fists (imposing)
  ctx.fillStyle = '#4a3a8a';
  ctx.fillRect(x - 15, y - 24, 6, 6);
  ctx.fillRect(x + 9, y - 24, 6, 6);
  // Neck
  ctx.fillStyle = '#3a2a7a';
  ctx.fillRect(x - 4, y - 42, 8, 4);
  // Head (massive, angular)
  ctx.fillStyle = '#2a1a6a';
  ctx.fillRect(x - 8, y - 50, 16, 10);
  // Face (stern, cosmic)
  ctx.fillStyle = '#6060aa';
  ctx.fillRect(x - 6, y - 48, 12, 8);
  // Eyes (glowing)
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(x - 5, y - 46, 4, 3);
  ctx.fillRect(x + 1, y - 46, 4, 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 4, y - 46, 2, 2);
  ctx.fillRect(x + 2, y - 46, 2, 2);
  // Mouth (stern line)
  ctx.fillStyle = '#1a1a4a';
  ctx.fillRect(x - 3, y - 41, 6, 1);
  // Crown base
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x - 8, y - 52, 16, 3);
  // Crown spikes (tall)
  ctx.fillStyle = '#818cf8';
  ctx.fillRect(x - 7, y - 58, 3, 6);
  ctx.fillRect(x - 2, y - 60, 4, 8);  // center tallest
  ctx.fillRect(x + 4, y - 58, 3, 6);
  // Crown spike tips
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 6, y - 58, 1, 1);
  ctx.fillRect(x - 1, y - 60, 2, 1);
  ctx.fillRect(x + 5, y - 58, 1, 1);
}

// Galactus B: Eldritch Horror — tentacles, void-black with purple highlights, multiple eyes
function drawSprite_galactus_B(ctx, cx, cy) {
  const x = cx, y = cy;
  // Main void body (dark)
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(x - 12, y - 40, 24, 40);
  // Purple highlights on body
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x - 12, y - 40, 3, 40);
  ctx.fillRect(x + 9, y - 40, 3, 40);
  ctx.fillRect(x - 10, y - 20, 20, 2);
  ctx.fillRect(x - 10, y - 32, 20, 2);
  // Tentacles (emerging from body, left side)
  ctx.fillStyle = '#1a0a2a';
  ctx.fillRect(x - 16, y - 38, 5, 3);
  ctx.fillRect(x - 19, y - 36, 4, 3);
  ctx.fillRect(x - 21, y - 33, 4, 3);
  ctx.fillRect(x - 20, y - 30, 3, 3);
  ctx.fillRect(x - 22, y - 27, 4, 3);
  // Left tentacle suckers
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x - 18, y - 35, 1, 1);
  ctx.fillRect(x - 20, y - 32, 1, 1);
  ctx.fillRect(x - 21, y - 29, 1, 1);
  // Tentacles right side
  ctx.fillStyle = '#1a0a2a';
  ctx.fillRect(x + 11, y - 36, 5, 3);
  ctx.fillRect(x + 14, y - 33, 5, 3);
  ctx.fillRect(x + 16, y - 30, 4, 3);
  ctx.fillRect(x + 15, y - 27, 4, 3);
  ctx.fillRect(x + 17, y - 24, 4, 3);
  // Right tentacle suckers
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x + 14, y - 35, 1, 1);
  ctx.fillRect(x + 16, y - 31, 1, 1);
  ctx.fillRect(x + 17, y - 27, 1, 1);
  // Lower tentacles
  ctx.fillStyle = '#1a0a2a';
  ctx.fillRect(x - 14, y - 12, 4, 3);
  ctx.fillRect(x - 16, y - 8, 3, 4);
  ctx.fillRect(x + 10, y - 12, 4, 3);
  ctx.fillRect(x + 13, y - 8, 3, 4);
  // Head region (bulbous)
  ctx.fillStyle = '#0d0d22';
  ctx.fillRect(x - 10, y - 52, 20, 14);
  ctx.fillRect(x - 8, y - 54, 16, 4);
  // Multiple glowing eyes (5 eyes total)
  ctx.fillStyle = '#aa00ff';
  ctx.fillRect(x - 8, y - 50, 4, 3);   // eye 1
  ctx.fillRect(x - 2, y - 52, 4, 3);   // eye 2 (center top)
  ctx.fillRect(x + 4, y - 50, 4, 3);   // eye 3
  ctx.fillRect(x - 6, y - 46, 3, 2);   // eye 4 (lower)
  ctx.fillRect(x + 3, y - 46, 3, 2);   // eye 5 (lower)
  // Eye pupils (void black)
  ctx.fillStyle = '#000000';
  ctx.fillRect(x - 7, y - 50, 2, 2);
  ctx.fillRect(x - 1, y - 52, 2, 2);
  ctx.fillRect(x + 5, y - 50, 2, 2);
  ctx.fillRect(x - 5, y - 46, 1, 1);
  ctx.fillRect(x + 4, y - 46, 1, 1);
  // Eye glow halos
  ctx.fillStyle = '#6600cc';
  ctx.fillRect(x - 9, y - 51, 1, 1);
  ctx.fillRect(x - 1, y - 53, 1, 1);
  ctx.fillRect(x + 8, y - 51, 1, 1);
  // Mouth (gaping, void)
  ctx.fillStyle = '#000000';
  ctx.fillRect(x - 5, y - 42, 10, 4);
  // Teeth
  ctx.fillStyle = '#9966ff';
  ctx.fillRect(x - 5, y - 43, 2, 2);
  ctx.fillRect(x - 1, y - 43, 2, 2);
  ctx.fillRect(x + 3, y - 43, 2, 2);
  ctx.fillRect(x - 4, y - 39, 2, 2);
  ctx.fillRect(x, y - 39, 2, 2);
  ctx.fillRect(x + 4, y - 39, 2, 2);
  // Purple void aura dots
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x - 15, y - 42, 1, 1);
  ctx.fillRect(x + 14, y - 44, 1, 1);
  ctx.fillRect(x - 13, y - 46, 1, 1);
  ctx.fillRect(x + 12, y - 38, 1, 1);
  ctx.fillRect(x, y - 55, 1, 1);
}

// Galactus C: Corporate Galactus — enormous business suit, briefcase, crown, power tie
function drawSprite_galactus_C(ctx, cx, cy) {
  const x = cx, y = cy;
  // Dress shoes (enormous, shiny)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 11, y - 5, 10, 5);
  ctx.fillRect(x + 1, y - 5, 10, 5);
  // Shine on shoes
  ctx.fillStyle = '#444444';
  ctx.fillRect(x - 10, y - 5, 3, 2);
  ctx.fillRect(x + 2, y - 5, 3, 2);
  // Trousers (dark charcoal)
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x - 10, y - 22, 8, 17);
  ctx.fillRect(x + 2, y - 22, 8, 17);
  // Trouser crease
  ctx.fillStyle = '#333333';
  ctx.fillRect(x - 6, y - 22, 1, 17);
  ctx.fillRect(x + 5, y - 22, 1, 17);
  // Suit jacket (enormous, dark charcoal)
  ctx.fillStyle = '#222222';
  ctx.fillRect(x - 13, y - 40, 26, 18);
  // Suit jacket lapels
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x - 13, y - 40, 5, 14);
  ctx.fillRect(x + 8, y - 40, 5, 14);
  // White shirt
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x - 4, y - 40, 8, 18);
  // Power tie (bright purple)
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x - 2, y - 40, 4, 18);
  // Tie knot
  ctx.fillStyle = '#4a4ac0';
  ctx.fillRect(x - 2, y - 40, 4, 3);
  // Jacket buttons
  ctx.fillStyle = '#444444';
  ctx.fillRect(x - 2, y - 28, 1, 1);
  ctx.fillRect(x + 1, y - 28, 1, 1);
  ctx.fillRect(x - 2, y - 24, 1, 1);
  ctx.fillRect(x + 1, y - 24, 1, 1);
  // Pocket square (white)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 11, y - 38, 4, 3);
  // Massive shoulders
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 15, y - 40, 4, 8);
  ctx.fillRect(x + 11, y - 40, 4, 8);
  // Left arm (enormous)
  ctx.fillStyle = '#222222';
  ctx.fillRect(x - 16, y - 36, 5, 14);
  // Left hand
  ctx.fillStyle = '#9090c0';
  ctx.fillRect(x - 16, y - 24, 5, 6);
  // Right arm holding briefcase
  ctx.fillStyle = '#222222';
  ctx.fillRect(x + 11, y - 36, 5, 14);
  // Briefcase
  ctx.fillStyle = '#4a3010';
  ctx.fillRect(x + 10, y - 28, 9, 7);
  // Briefcase detail
  ctx.fillStyle = '#3a2000';
  ctx.fillRect(x + 10, y - 28, 9, 2);
  ctx.fillStyle = '#888840';
  ctx.fillRect(x + 13, y - 29, 3, 3);  // latch
  // Briefcase handle
  ctx.fillStyle = '#4a3010';
  ctx.fillRect(x + 12, y - 30, 5, 2);
  ctx.fillStyle = '#2a1a00';
  ctx.fillRect(x + 13, y - 31, 3, 1);
  // Neck (enormous)
  ctx.fillStyle = '#7070a0';
  ctx.fillRect(x - 4, y - 44, 8, 4);
  // Head (massive)
  ctx.fillStyle = '#5a5a8a';
  ctx.fillRect(x - 9, y - 54, 18, 12);
  // Face (severe)
  ctx.fillStyle = '#7070a0';
  ctx.fillRect(x - 7, y - 52, 14, 10);
  // Eyes (imposing, still has the cosmic glow)
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x - 6, y - 49, 5, 3);
  ctx.fillRect(x + 1, y - 49, 5, 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 5, y - 49, 2, 2);
  ctx.fillRect(x + 2, y - 49, 2, 2);
  ctx.fillStyle = '#1a1a3a';
  ctx.fillRect(x - 5, y - 48, 1, 1);
  ctx.fillRect(x + 3, y - 48, 1, 1);
  // Stern mouth
  ctx.fillStyle = '#3a3a6a';
  ctx.fillRect(x - 4, y - 43, 8, 2);
  // Still has the crown (smaller, businesslike)
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x - 8, y - 56, 16, 3);
  // Crown spikes (shorter, still regal)
  ctx.fillStyle = '#818cf8';
  ctx.fillRect(x - 6, y - 60, 3, 4);
  ctx.fillRect(x - 1, y - 62, 3, 6);  // tallest center spike
  ctx.fillRect(x + 3, y - 60, 3, 4);
  // Tiny gold star on tie (subtle flex)
  ctx.fillStyle = '#ffdd00';
  ctx.fillRect(x, y - 34, 1, 1);
}

// Export all sprite functions for module use (optional)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    drawSprite_chairman_A,
    drawSprite_chairman_B,
    drawSprite_chairman_C,
    drawSprite_critic_A,
    drawSprite_critic_B,
    drawSprite_critic_C,
    drawSprite_architect_A,
    drawSprite_architect_B,
    drawSprite_architect_C,
    drawSprite_ux_A,
    drawSprite_ux_B,
    drawSprite_ux_C,
    drawSprite_designer_A,
    drawSprite_designer_B,
    drawSprite_designer_C,
    drawSprite_galactus_A,
    drawSprite_galactus_B,
    drawSprite_galactus_C,
  };
}
