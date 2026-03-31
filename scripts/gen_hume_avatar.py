#!/usr/bin/env python3
"""
David Hume — Looksmaxxer Edition (Empiricismmogged)
64x64 pixel art avatar, 10 frames
18th-century powdered wig + sigma male glow-up
Animated: eyes shift from tired philosopher → locked-in sigma stare
"""

from PIL import Image, ImageDraw
import math
import os

OUTPUT_PATH = "/mnt/data/static/avatars/hume.png"
SIZE = 128  # 128x128 for readability, then save as PNG
FRAMES = 10

# --- Palette (looksmaxxed 18c aesthetic) ---
BG           = (12, 10, 20)        # dark background
BG_GRAD      = (20, 18, 35)        # slightly lighter bg

# Skin — chiseled, golden hour lit
SKIN         = (220, 180, 140)
SKIN_SHADOW  = (170, 125, 90)
SKIN_LIGHT   = (245, 215, 175)
SKIN_GLOW    = (255, 230, 190)     # highlight on cheekbone

# Hair / wig — powdered white, aristocratic
WIG          = (240, 238, 235)
WIG_SHADOW   = (195, 192, 188)
WIG_CURL     = (215, 212, 208)
WIG_DARK     = (160, 157, 153)

# Coat — deep navy 18c coat (main character energy)
COAT         = (28, 35, 75)
COAT_MID     = (40, 50, 100)
COAT_LIGHT   = (60, 72, 130)
COAT_TRIM    = (200, 170, 80)      # gold trim

# Cravat / jabot — white frilly neck thing
CRAVAT       = (245, 245, 242)
CRAVAT_S     = (200, 198, 195)

# Eyes — sigma locked-in gaze
EYE_WHITE    = (230, 225, 215)
EYE_IRIS_DIM = (90, 75, 55)       # tired philosopher
EYE_IRIS     = (110, 88, 60)      # piercing hazel
EYE_SIGMA    = (140, 105, 65)     # looksmaxxed sigma mode
EYE_PUPIL    = (15, 10, 8)
EYE_SHINE    = (255, 250, 240)    # catchlight
EYE_BROW     = (60, 45, 30)       # dark refined brow

# Jawline — chiseled
JAW          = (175, 130, 95)
JAW_SHADOW   = (130, 90, 60)

# Lips — subtle
LIPS         = (185, 120, 100)

# Neck cloth / stock
STOCK        = (245, 242, 238)
STOCK_S      = (190, 188, 183)


def lerp(a, b, t):
    return int(a + (b - a) * t)


def lerp_color(c1, c2, t):
    return tuple(lerp(c1[i], c2[i], t) for i in range(len(c1)))


def draw_frame(img_draw_pair, sigma_t: float):
    """
    sigma_t: 0.0 = sleepy empiricist, 1.0 = looksmaxxed sigma stare
    """
    img, d = img_draw_pair
    W, H = SIZE, SIZE

    # === BACKGROUND — dark gradient vignette ===
    for y in range(H):
        for x in range(W):
            # Radial vignette from center
            cx, cy = W // 2, H // 2
            dist = math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / (W * 0.7)
            t = min(dist, 1.0)
            c = lerp_color(BG_GRAD, BG, t)
            img.putpixel((x, y), c)

    # === POWDERED WIG ===
    # Main wig mass — big billowing 18c style
    # Top dome
    d.ellipse([24, 4, 104, 58], fill=WIG)
    # Side curls hanging down
    d.ellipse([4, 30, 40, 90], fill=WIG_SHADOW)   # left hang
    d.ellipse([88, 30, 124, 90], fill=WIG_SHADOW)  # right hang
    # Inner wig shadows for volume
    d.ellipse([8, 34, 38, 86], fill=WIG_DARK)      # deep shadow left
    d.ellipse([90, 34, 120, 86], fill=WIG_DARK)    # deep shadow right
    # Wig highlight on top
    d.ellipse([38, 6, 90, 42], fill=WIG)
    # Curl details
    for i, (cx, cy, r) in enumerate([
        (15, 55, 8), (12, 70, 7), (16, 82, 6),
        (113, 55, 8), (116, 70, 7), (112, 82, 6),
    ]):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WIG_CURL)
    # Top of wig bow / queue hint
    d.rectangle([56, 5, 72, 14], fill=WIG_SHADOW)

    # === FACE ===
    # Main face oval
    d.ellipse([30, 36, 98, 100], fill=SKIN)
    # Forehead (slightly lighter, lit from above)
    d.ellipse([36, 36, 92, 68], fill=SKIN_LIGHT)

    # Cheekbone glow (sigma hunter eyes → high cheekbones lit)
    glow_strength = int(lerp(0, 200, sigma_t))
    d.ellipse([32, 60, 55, 80], fill=(*SKIN_GLOW, glow_strength))
    d.ellipse([73, 60, 96, 80], fill=(*SKIN_GLOW, glow_strength))

    # Jaw shadow for CHISELED look
    d.ellipse([30, 75, 98, 108], fill=SKIN_SHADOW)
    # Re-light center of jaw
    d.ellipse([42, 78, 86, 102], fill=SKIN)
    # Very bottom jaw highlight
    d.ellipse([48, 88, 80, 103], fill=SKIN_LIGHT)

    # === EYEBROWS — thick, refined, slightly furrowed ===
    brow_y = 50
    brow_furrow = int(lerp(0, 3, sigma_t))  # sigma furrowing
    # Left brow
    d.rectangle([36, brow_y - brow_furrow, 56, brow_y + 3 - brow_furrow], fill=EYE_BROW)
    # Right brow
    d.rectangle([72, brow_y - brow_furrow, 92, brow_y + 3 - brow_furrow], fill=EYE_BROW)
    # Inner brow ends angled down for intensity
    d.rectangle([53, brow_y + 1 - brow_furrow, 57, brow_y + 4 - brow_furrow], fill=EYE_BROW)
    d.rectangle([71, brow_y + 1 - brow_furrow, 75, brow_y + 4 - brow_furrow], fill=EYE_BROW)

    # === EYES ===
    # Iris color shifts from dim to sigma
    iris_color = lerp_color(EYE_IRIS_DIM, EYE_SIGMA, sigma_t)

    # Eye openness: sigma stare = wider, intense
    eye_open = lerp(3, 5, sigma_t)

    left_eye_cx, left_eye_cy = 46, 62
    right_eye_cx, right_eye_cy = 82, 62

    for ecx, ecy in [(left_eye_cx, left_eye_cy), (right_eye_cx, right_eye_cy)]:
        # Eye white
        d.ellipse([ecx - 10, ecy - eye_open, ecx + 10, ecy + eye_open], fill=EYE_WHITE)
        # Iris
        d.ellipse([ecx - 6, ecy - eye_open + 1, ecx + 6, ecy + eye_open - 1], fill=iris_color)
        # Pupil — dilated sigma
        pupil_r = lerp(3, 4, sigma_t)
        d.ellipse([ecx - pupil_r, ecy - pupil_r, ecx + pupil_r, ecy + pupil_r], fill=EYE_PUPIL)
        # Catchlight (upper left)
        d.ellipse([ecx - 3, ecy - eye_open + 1, ecx, ecy - 1], fill=EYE_SHINE)

    # === NOSE — straight, aristocratic ===
    # Bridge
    d.rectangle([61, 62, 67, 78], fill=SKIN_SHADOW)
    # Tip
    d.ellipse([57, 74, 71, 84], fill=SKIN_SHADOW)
    d.ellipse([59, 75, 69, 82], fill=SKIN)
    # Nostril hints
    d.ellipse([56, 77, 63, 83], fill=JAW_SHADOW)
    d.ellipse([65, 77, 72, 83], fill=JAW_SHADOW)

    # === LIPS — subtle, serious empiricist ===
    # Upper lip
    d.ellipse([51, 84, 77, 92], fill=LIPS)
    # Center line (slight smirk — knows more than you)
    smirk_offset = int(lerp(0, 2, sigma_t))
    d.line([(51, 88 - smirk_offset), (77, 88)], fill=JAW_SHADOW, width=2)
    # Lower lip
    d.ellipse([53, 88, 75, 96], fill=lerp_color(LIPS, SKIN, 0.4))

    # === CHISELED JAW / CHIN ===
    # Strong chin
    d.ellipse([52, 92, 76, 108], fill=SKIN_LIGHT)
    # Jaw shadow lines
    d.line([(30, 82), (52, 102)], fill=JAW_SHADOW, width=3)
    d.line([(98, 82), (76, 102)], fill=JAW_SHADOW, width=3)

    # === NECK ===
    d.rectangle([50, 100, 78, 116], fill=SKIN_SHADOW)
    d.rectangle([54, 100, 74, 116], fill=SKIN)

    # === STOCK / CRAVAT ===
    # White neck cloth
    d.ellipse([40, 108, 88, 126], fill=STOCK)
    d.ellipse([44, 110, 84, 124], fill=CRAVAT)
    # Ruffle detail
    for x in range(48, 80, 6):
        d.line([(x, 110), (x, 124)], fill=CRAVAT_S, width=1)

    # === COAT ===
    # Left lapel
    coat_left = [(0, 118), (48, 112), (52, 128), (20, 128)]
    d.polygon(coat_left, fill=COAT_MID)
    d.polygon([(4, 120), (46, 114), (50, 126), (18, 126)], fill=COAT)
    # Right lapel
    coat_right = [(128, 118), (80, 112), (76, 128), (108, 128)]
    d.polygon(coat_right, fill=COAT_MID)
    d.polygon([(124, 120), (82, 114), (78, 126), (110, 126)], fill=COAT)
    # Gold trim on coat edges
    d.line([(4, 120), (46, 114)], fill=COAT_TRIM, width=2)
    d.line([(124, 120), (82, 114)], fill=COAT_TRIM, width=2)

    # === SIGMA AURA (appears at high sigma_t) ===
    if sigma_t > 0.6:
        aura_alpha = int((sigma_t - 0.6) / 0.4 * 60)
        aura_color = (180, 150, 80, aura_alpha)
        for r in range(3):
            d.ellipse(
                [30 - r * 3, 36 - r * 3, 98 + r * 3, 100 + r * 3],
                outline=aura_color,
                width=2
            )

    return img


def make_hume():
    # Just produce a single static PNG (looksmaxxed peak sigma state)
    img = Image.new("RGBA", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img, "RGBA")
    draw_frame((img, d), sigma_t=1.0)

    # Downscale to 128x128 (already 128, just save)
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    img.convert("RGB").save(OUTPUT_PATH, format="PNG")
    size = os.path.getsize(OUTPUT_PATH)
    print(f"Saved Hume looksmaxxer avatar to {OUTPUT_PATH}")
    print(f"File size: {size} bytes ({size // 1024} KB)")


if __name__ == "__main__":
    make_hume()
