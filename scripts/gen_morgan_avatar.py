#!/usr/bin/env python3
"""
Morgan (they/them) — pixel art avatar generator
64x64, 10 frames, muted warm background, perpetually exhausted millennial energy
Animation: slow blink, subtle latte steam, occasional tired eye-close
Character: messy bun, round glasses, ironic band tee, oat milk latte in hand
"""

from PIL import Image, ImageDraw
import math

# --- Palette ---
BG        = (38, 35, 42)        # soft dark purple-grey background
SKIN      = (220, 185, 155)     # warm medium skin
SKIN_S    = (190, 155, 128)     # skin shadow
SKIN_ROSY = (210, 160, 140)     # tired/rosy cheek
HAIR      = (95, 72, 58)        # warm medium brown (messy bun)
HAIR_H    = (125, 98, 80)       # hair highlight
HAIR_S    = (68, 50, 40)        # hair shadow
SCRUNCHIE = (180, 130, 155)     # dusty mauve scrunchie
GLASS_F   = (140, 115, 100)     # warm tortoiseshell glasses frame
GLASS_L   = (210, 225, 235)     # glasses lens reflection
GLASS_S   = (110, 90, 78)       # glasses shadow
TEE       = (55, 58, 65)        # faded dark band tee
TEE_S     = (40, 42, 48)        # tee shadow
TEE_PRINT = (100, 95, 110)      # washed-out band logo print
TEE_ACC   = (130, 90, 120)      # small accent on tee (faded pink)
LATTE     = (200, 165, 120)     # oat milk latte
LATTE_S   = (170, 138, 98)      # latte shadow
CUP       = (245, 240, 232)     # to-go cup (off-white)
CUP_S     = (210, 205, 195)     # cup shadow
CUP_BAND  = (175, 160, 145)     # cardboard sleeve
CUP_LID   = (90, 85, 80)        # dark lid
STEAM     = (200, 198, 205)     # steam color
STEAM_BG  = BG                  # background for steam fade
EYE_D     = (65, 50, 45)        # eye dark
EYE_W     = (240, 235, 228)     # eye white
EYEBAG    = (190, 158, 138)     # under-eye tiredness
BROW      = (85, 65, 52)        # eyebrow
LIP       = (175, 128, 115)     # lips

SIZE = 64
N_FRAMES = 10


def new_frame():
    img = Image.new("RGBA", (SIZE, SIZE), BG + (255,))
    d = ImageDraw.Draw(img)
    return img, d


def px(d, x, y, c, a=255):
    if 0 <= x < SIZE and 0 <= y < SIZE:
        d.point((x, y), fill=c + (a,))


def rect(d, x1, y1, x2, y2, c, a=255):
    if a == 255:
        d.rectangle([x1, y1, x2, y2], fill=c + (255,))
    else:
        for xx in range(x1, x2 + 1):
            for yy in range(y1, y2 + 1):
                px(d, xx, yy, c, a)


def hline(d, y, x1, x2, c, a=255):
    for x in range(x1, x2 + 1):
        px(d, x, y, c, a)


def vline(d, x, y1, y2, c, a=255):
    for y in range(y1, y2 + 1):
        px(d, x, y, c, a)


def blend(c1, c2, t):
    """Linear blend between two colors."""
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def draw_character(d, frame, eye_state="open", steam_phase=0):
    """
    Draw Morgan. Layout:
      - Messy bun with loose wisps: rows 8-22
      - Face: rows 22-37
      - Round tortoiseshell glasses: rows 26-32
      - Neck + band tee body: rows 37-58
      - Left hand: holds oat milk latte cup
    """
    cx = 32  # horizontal center

    # ── Soft background vignette ──
    for r in range(8):
        alpha = int(60 * (1 - r / 8))
        for corner in [(0, 0), (63, 0), (0, 63), (63, 63)]:
            for dx in range(r + 1):
                for dy in range(r + 1):
                    nx = corner[0] + (dx if corner[0] < 32 else -dx)
                    ny = corner[1] + (dy if corner[1] < 32 else -dy)
                    px(d, nx, ny, (25, 22, 28), alpha)

    # ── Band tee body ──
    # Shoulders and torso
    rect(d, 17, 41, 46, 58, TEE)
    # Shadow under neck
    hline(d, 41, 17, 46, TEE_S)
    # Sleeve hints
    rect(d, 14, 44, 19, 54, TEE)
    rect(d, 44, 44, 49, 54, TEE)
    # Washed-out band logo on chest (just abstract pixel smudge)
    for lx, ly in [(27, 48), (28, 48), (29, 48), (30, 48), (31, 48),
                   (28, 49), (30, 49), (27, 50), (29, 50), (31, 50),
                   (28, 51), (30, 51)]:
        px(d, lx, ly, TEE_PRINT)
    # Tiny faded accent (like a worn patch)
    rect(d, 35, 47, 37, 49, TEE_ACC)

    # ── Neck ──
    rect(d, 28, 37, 35, 42, SKIN)
    # Shadow sides of neck
    px(d, 28, 38, SKIN_S)
    px(d, 28, 39, SKIN_S)
    px(d, 35, 38, SKIN_S)

    # ── Head shape ──
    rect(d, 23, 22, 40, 37, SKIN)
    # Cheek width
    for y in range(26, 32):
        px(d, 22, y, SKIN)
        px(d, 41, y, SKIN)
    # Jaw taper
    px(d, 23, 36, SKIN_S)
    px(d, 40, 36, SKIN_S)
    px(d, 24, 37, SKIN_S)
    px(d, 39, 37, SKIN_S)
    # Tired shadow under eyes / cheeks
    for x in range(25, 31):
        px(d, x, 33, EYEBAG, 60)
    for x in range(33, 39):
        px(d, x, 33, EYEBAG, 60)
    # Rosy under-cheek hint
    px(d, 23, 31, SKIN_ROSY, 100)
    px(d, 24, 31, SKIN_ROSY, 80)
    px(d, 40, 31, SKIN_ROSY, 100)
    px(d, 41, 31, SKIN_ROSY, 80)

    # ── Messy bun hair ──
    # Main bun mass — slightly off-center left, piled and loose
    rect(d, 21, 10, 38, 23, HAIR)
    # Extra bun height, bulgy and uneven
    rect(d, 22, 8, 36, 12, HAIR)
    rect(d, 24, 7, 33, 10, HAIR)
    px(d, 23, 9, HAIR)
    px(d, 35, 10, HAIR)
    # Bun texture and volume
    for hx, hy in [(25, 7), (29, 8), (31, 7), (26, 9), (33, 9), (24, 11), (28, 11), (35, 12)]:
        px(d, hx, hy, HAIR_H)
    for hx, hy in [(22, 10), (36, 11), (23, 13), (37, 13)]:
        px(d, hx, hy, HAIR_S)
    # Loose wisps / flyaways
    px(d, 20, 14, HAIR)
    px(d, 19, 15, HAIR)
    px(d, 38, 13, HAIR)
    px(d, 39, 14, HAIR)
    px(d, 27, 22, HAIR)  # wisp over forehead
    px(d, 28, 21, HAIR)
    px(d, 34, 22, HAIR)
    # Scrunchie band across bun
    hline(d, 14, 23, 35, SCRUNCHIE)
    px(d, 23, 15, SCRUNCHIE)
    px(d, 35, 15, SCRUNCHIE)
    # Hair framing face sides
    hline(d, 22, 21, 23, HAIR)
    hline(d, 23, 21, 22, HAIR)
    hline(d, 22, 40, 42, HAIR)
    hline(d, 23, 41, 42, HAIR)

    # ── Round tortoiseshell glasses ──
    # Left lens: round, cols 24-29, rows 26-31
    for gx in range(24, 30):
        px(d, gx, 26, GLASS_F)
        px(d, gx, 31, GLASS_F)
    for gy in range(26, 32):
        px(d, 24, gy, GLASS_F)
        px(d, 29, gy, GLASS_F)
    # Round the corners
    px(d, 24, 26, GLASS_S)
    px(d, 29, 26, GLASS_S)
    px(d, 24, 31, GLASS_S)
    px(d, 29, 31, GLASS_S)
    # Right lens: cols 32-37, rows 26-31
    for gx in range(32, 38):
        px(d, gx, 26, GLASS_F)
        px(d, gx, 31, GLASS_F)
    for gy in range(26, 32):
        px(d, 32, gy, GLASS_F)
        px(d, 37, gy, GLASS_F)
    px(d, 32, 26, GLASS_S)
    px(d, 37, 26, GLASS_S)
    px(d, 32, 31, GLASS_S)
    px(d, 37, 31, GLASS_S)
    # Bridge connecting lenses
    px(d, 30, 28, GLASS_F)
    px(d, 31, 28, GLASS_F)
    # Temple arms
    px(d, 23, 27, GLASS_F)
    px(d, 22, 28, GLASS_F)
    px(d, 38, 27, GLASS_F)
    px(d, 39, 28, GLASS_F)
    # Lens fill (subtle tint)
    for gx in range(25, 29):
        for gy in range(27, 31):
            px(d, gx, gy, GLASS_L, 55)
    for gx in range(33, 37):
        for gy in range(27, 31):
            px(d, gx, gy, GLASS_L, 55)
    # Lens glint (small, top-left of each lens)
    px(d, 25, 27, GLASS_L, 160)
    px(d, 33, 27, GLASS_L, 160)

    # ── Eyebrows (slightly furrowed — perpetual low-grade concern) ──
    hline(d, 24, 25, 28, BROW)
    hline(d, 24, 33, 36, BROW)
    # Slight inner raise (worried/tired)
    px(d, 28, 25, BROW)
    px(d, 33, 25, BROW)

    # ── Eyes ──
    if eye_state == "open":
        # Left eye
        px(d, 26, 28, EYE_W)
        px(d, 27, 28, EYE_D)  # pupil
        px(d, 27, 29, EYE_D)
        px(d, 28, 28, EYE_W)
        # Right eye
        px(d, 34, 28, EYE_W)
        px(d, 35, 28, EYE_D)  # pupil
        px(d, 35, 29, EYE_D)
        px(d, 36, 28, EYE_W)
        # Tired lower lid line
        hline(d, 30, 25, 28, EYEBAG, 90)
        hline(d, 30, 33, 36, EYEBAG, 90)
    elif eye_state == "half":
        # Half-lidded tired eyes
        hline(d, 27, 25, 28, HAIR_S, 180)  # top lid drooping
        px(d, 27, 28, EYE_D)
        px(d, 35, 28, EYE_D)
        hline(d, 27, 33, 36, HAIR_S, 180)
        hline(d, 30, 25, 28, EYEBAG, 90)
        hline(d, 30, 33, 36, EYEBAG, 90)
    elif eye_state == "closed":
        # Slow blink — lids closed
        hline(d, 28, 25, 28, BROW)
        hline(d, 28, 33, 36, BROW)
        hline(d, 29, 25, 28, SKIN_S)
        hline(d, 29, 33, 36, SKIN_S)

    # ── Nose ──
    px(d, 31, 32, SKIN_S)
    px(d, 30, 33, SKIN_S)

    # ── Mouth: flat, slightly downturned, neutral/tired ──
    hline(d, 35, 28, 34, LIP)
    px(d, 27, 35, SKIN_S)   # left corner slight down
    px(d, 35, 35, SKIN_S)   # right corner slight down

    # ── Left arm holding latte ──
    rect(d, 15, 46, 20, 56, TEE)
    rect(d, 13, 52, 19, 57, SKIN)

    # ── Oat milk latte cup ──
    # Cup body
    rect(d, 5, 38, 16, 57, CUP)
    # Cardboard sleeve
    rect(d, 5, 44, 16, 52, CUP_BAND)
    # Cup shadow/gradient suggestion (right side darker)
    vline(d, 16, 38, 57, CUP_S)
    vline(d, 15, 38, 57, CUP_S)
    # Lid
    rect(d, 4, 36, 17, 39, CUP_LID)
    # Drink opening hint (small gap in lid)
    px(d, 9, 36, (140, 120, 100))
    px(d, 10, 36, (140, 120, 100))
    # Latte liquid visible at top
    rect(d, 6, 40, 15, 43, LATTE)
    px(d, 6, 40, LATTE_S)
    px(d, 15, 40, LATTE_S)

    # ── Steam animation ──
    # steam_phase: 0-3, steam rises from cup opening
    steam_positions = [
        [(10, 35), (10, 34), (9, 33)],
        [(10, 34), (9, 33), (11, 32)],
        [(9, 33), (11, 32), (10, 31)],
        [(11, 32), (10, 31), (9, 30)],
    ]
    alphas = [200, 130, 70]
    if steam_phase < len(steam_positions):
        for i, (sx, sy) in enumerate(steam_positions[steam_phase]):
            if i < len(alphas):
                px(d, sx, sy, STEAM, alphas[i])

    # ── Right arm, hanging down / slightly off body ──
    rect(d, 43, 46, 48, 56, TEE)
    # Hand slightly visible
    rect(d, 43, 53, 49, 57, SKIN)


# Eye state sequence — slow blink every ~3 seconds at 8fps
# Frames: open open open open half closed half open open open
EYE_STATES = ["open", "open", "open", "open", "half", "closed", "half", "open", "open", "open"]
STEAM_PHASES = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1]

frames = []

for f in range(N_FRAMES):
    img, d = new_frame()
    draw_character(d, f, eye_state=EYE_STATES[f], steam_phase=STEAM_PHASES[f])
    frames.append(img)

# Save as GIF
out_path = "/mnt/data/hello-world/static/avatars/morgan.gif"

frames[0].save(
    out_path,
    save_all=True,
    append_images=frames[1:],
    optimize=False,
    loop=0,
    duration=150,    # ms per frame → ~6.7fps (slightly slower, more lethargic)
    disposal=2,
)

print(f"Saved {N_FRAMES} frames to {out_path}")

from PIL import Image as PILImage
check = PILImage.open(out_path)
print(f"Verified: format={check.format}, size={check.size}, n_frames={getattr(check, 'n_frames', 1)}")
