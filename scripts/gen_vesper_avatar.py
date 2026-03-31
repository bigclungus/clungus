#!/usr/bin/env python3
"""
Vesper the Vivid — pixel art avatar generator
64x64, 8-12 frames, dark background, art-school energy
Animation: sketchbook pages flip through, pencil scratches, glasses glint
"""

from PIL import Image, ImageDraw
import math

# --- Palette ---
BG       = (28, 28, 32)        # charcoal background
SKIN     = (210, 170, 130)     # warm medium skin
SKIN_S   = (180, 140, 105)     # shadow
HAIR     = (38, 28, 22)        # very dark brown/black
HAIR_H   = (60, 45, 35)        # hair highlight
TURTLE   = (40, 42, 46)        # dark turtleneck
TURTLE_S = (28, 30, 34)        # turtleneck shadow
GLASS_F  = (90, 110, 115)      # wire glasses frame (cool grey)
GLASS_L  = (200, 235, 240)     # glasses lens (light reflection)
GLINT    = (255, 255, 255)     # glasses glint
BOOK_C   = (235, 228, 210)     # sketchbook cover (cream)
BOOK_P   = (248, 245, 238)     # sketchbook page
BOOK_S   = (180, 175, 160)     # book shadow
PENCIL   = (215, 180, 90)      # pencil body
PENCIL_T = (245, 245, 245)     # pencil tip
PENCIL_G = (80, 75, 70)        # pencil graphite
# Accent: vivid teal
TEAL     = (0, 200, 185)
TEAL_D   = (0, 155, 145)
# Accent marks on sketchbook
MARK_RED = (200, 80, 70)
MARK_BLU = (70, 100, 190)
MARK_YEL = (220, 185, 50)
MARK_TEA = TEAL

SIZE = 64
N_FRAMES = 10


def new_frame():
    img = Image.new("RGBA", (SIZE, SIZE), BG + (255,))
    d = ImageDraw.Draw(img)
    return img, d


def px(d, x, y, c, a=255):
    """Draw a single pixel with optional alpha."""
    if 0 <= x < SIZE and 0 <= y < SIZE:
        d.point((x, y), fill=c + (a,))


def rect(d, x1, y1, x2, y2, c):
    d.rectangle([x1, y1, x2, y2], fill=c + (255,))


def hline(d, y, x1, x2, c):
    for x in range(x1, x2 + 1):
        px(d, x, y, c)


def vline(d, x, y1, y2, c):
    for y in range(y1, y2 + 1):
        px(d, x, y, c)


def draw_character(d, frame, pencil_offset=0, glint_on=False, swatch_color=None):
    """
    Draw Vesper. Character occupies roughly rows 10-58, centered horizontally.
    Layout:
      - Asymmetric undercut bun: rows 10-20
      - Face: rows 20-34
      - Wire glasses: rows 25-31
      - Turtleneck neck: rows 34-39
      - Body/shoulders: rows 39-58
      - Left hand: holds sketchbook (left side)
      - Right hand: holds pencil (right side, animates)
    """
    cx = 32  # horizontal center

    # ── Background atmosphere: subtle dark vignette corners ──
    for corner in [(0, 0), (63, 0), (0, 63), (63, 63)]:
        for r in range(6):
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    nx, ny = corner[0] + (dx if corner[0] < 32 else -dx), \
                              corner[1] + (dy if corner[1] < 32 else -dy)
                    px(d, nx, ny, (20, 20, 24))

    # ── Turtleneck body ──
    # Shoulders: wide trapezoid
    rect(d, 18, 42, 45, 58, TURTLE)
    # Shadow under collar
    hline(d, 42, 18, 45, TURTLE_S)
    # Collar detail lines
    hline(d, 44, 22, 41, TURTLE_S)
    hline(d, 46, 23, 40, TURTLE_S)

    # Neck
    rect(d, 27, 36, 36, 42, TURTLE)

    # ── Teal accent: small patch / badge on jacket ──
    # Little teal band at collar
    hline(d, 38, 27, 36, TEAL_D)
    px(d, 28, 39, TEAL)
    px(d, 29, 39, TEAL)

    # ── Head ──
    # Head shape (slightly wider at cheeks)
    rect(d, 24, 20, 39, 35, SKIN)
    # Cheek width
    px(d, 23, 25, SKIN)
    px(d, 23, 26, SKIN)
    px(d, 23, 27, SKIN)
    px(d, 40, 25, SKIN)
    px(d, 40, 26, SKIN)
    px(d, 40, 27, SKIN)
    # Jaw taper
    px(d, 24, 34, SKIN_S)
    px(d, 39, 34, SKIN_S)
    px(d, 25, 35, SKIN_S)
    px(d, 38, 35, SKIN_S)
    # Shadow side (left)
    vline(d, 24, 21, 33, SKIN_S)

    # ── Asymmetric hair ──
    # Right side: shaved/close-cropped undercut
    # Left side: voluminous shaggy bun piled high
    # Bun base (left-heavy)
    rect(d, 20, 10, 35, 22, HAIR)
    # Bun overflow — extra height on left
    rect(d, 20, 8, 30, 13, HAIR)
    # Bun texture highlights
    px(d, 22, 9, HAIR_H)
    px(d, 25, 8, HAIR_H)
    px(d, 23, 11, HAIR_H)
    px(d, 28, 10, HAIR_H)
    px(d, 21, 13, HAIR_H)
    # Bun wrap/tie hint (teal scrunchie)
    hline(d, 14, 21, 29, TEAL_D)
    px(d, 21, 15, TEAL)
    px(d, 22, 15, TEAL)
    # Right side: low undercut, just a strip
    hline(d, 20, 33, 40, HAIR)
    hline(d, 21, 35, 40, HAIR)
    px(d, 36, 19, HAIR)
    px(d, 37, 19, HAIR)
    px(d, 38, 20, HAIR)
    # Stray wisp over forehead
    px(d, 28, 20, HAIR)
    px(d, 29, 19, HAIR)

    # ── Wire-rim glasses ──
    # Left lens frame (small square/round)
    # Left lens: cols 25-29, rows 25-29
    for x in range(25, 30):
        px(d, x, 25, GLASS_F)
        px(d, x, 29, GLASS_F)
    for y in range(25, 30):
        px(d, 25, y, GLASS_F)
        px(d, 29, y, GLASS_F)
    # Right lens: cols 31-35, rows 25-29
    for x in range(31, 36):
        px(d, x, 25, GLASS_F)
        px(d, x, 29, GLASS_F)
    for y in range(25, 30):
        px(d, 31, y, GLASS_F)
        px(d, 35, y, GLASS_F)
    # Bridge
    px(d, 30, 27, GLASS_F)
    # Arms
    px(d, 24, 26, GLASS_F)
    px(d, 23, 27, GLASS_F)
    px(d, 36, 26, GLASS_F)
    px(d, 37, 27, GLASS_F)
    # Lens fill (translucent suggestion)
    for x in range(26, 29):
        for y in range(26, 29):
            px(d, x, y, GLASS_L, 80)
    for x in range(32, 35):
        for y in range(26, 29):
            px(d, x, y, GLASS_L, 80)
    # Glasses glint (animated)
    if glint_on:
        px(d, 26, 26, GLINT)
        px(d, 32, 26, GLINT)
    else:
        px(d, 27, 27, GLASS_L)
        px(d, 33, 27, GLASS_L)

    # ── Eyes (behind glasses) ──
    px(d, 27, 27, (50, 40, 35))
    px(d, 33, 27, (50, 40, 35))

    # ── Nose ──
    px(d, 31, 30, SKIN_S)
    px(d, 30, 31, SKIN_S)

    # ── Mouth: subtle slight-smirk left ──
    px(d, 28, 32, SKIN_S)
    px(d, 29, 33, (160, 110, 90))
    px(d, 30, 33, (160, 110, 90))
    px(d, 31, 33, SKIN_S)

    # ── Left arm / hand holding sketchbook ──
    # Arm runs down left side
    rect(d, 16, 46, 21, 56, TURTLE)
    # Hand
    rect(d, 14, 52, 20, 57, SKIN)

    # ── Sketchbook ──
    # Book body: held on left, angled slightly
    rect(d, 5, 40, 20, 57, BOOK_C)
    # Page interior
    rect(d, 6, 41, 19, 56, BOOK_P)
    # Spine
    vline(d, 5, 40, 57, BOOK_S)
    # Lines on page (sketchy)
    for row in [43, 46, 49, 52, 55]:
        hline(d, row, 7, 18, (200, 195, 185))
    # Teal accent mark on cover corner
    rect(d, 6, 41, 8, 43, TEAL)

    # Swatch color on current page (animated)
    if swatch_color:
        rect(d, 9, 44, 16, 50, swatch_color)
        # Small outline
        for x in range(9, 17):
            px(d, x, 44, BOOK_S)
            px(d, x, 50, BOOK_S)
        for y in range(44, 51):
            px(d, 9, y, BOOK_S)
            px(d, 16, y, BOOK_S)

    # ── Right arm / pencil ──
    # Arm
    rect(d, 43, 46, 48, 56, TURTLE)
    # Hand
    rect(d, 43, 50, 50, 55, SKIN)
    # Pencil (held at angle, tip toward sketchbook/down-left)
    # Pencil body: diagonal from (50, 46) toward (44, 54+offset)
    tip_y = 53 + pencil_offset
    for i in range(8):
        bx = 50 - i
        by = 46 + i + (pencil_offset if i > 4 else 0)
        if 0 <= bx < SIZE and 0 <= by < SIZE:
            px(d, bx, by, PENCIL)
    # Tip (graphite)
    px(d, 43, tip_y, PENCIL_G)
    px(d, 44, tip_y - 1, PENCIL_T)
    # Eraser end
    px(d, 52, 44, (220, 160, 155))
    px(d, 53, 43, (200, 140, 135))

    # ── Subtle teal earring hint (left ear) ──
    px(d, 23, 30, TEAL)
    px(d, 23, 31, TEAL_D)


# Swatch sequence: colors that cycle through
SWATCHES = [
    MARK_RED,
    MARK_YEL,
    TEAL,
    MARK_BLU,
    (180, 80, 160),   # purple
    MARK_RED,
    MARK_YEL,
    TEAL,
    MARK_BLU,
    (220, 130, 50),   # orange
]

frames = []

for f in range(N_FRAMES):
    img, d = new_frame()

    # Pencil bobs: 0,1,0,-1 pattern
    cycle = [0, 1, 1, 0, -1, -1, 0, 1, 0, -1]
    p_off = cycle[f % len(cycle)]

    # Glasses glint on frames 3 and 7
    glint = (f in (3, 7))

    # Swatch changes each frame
    swatch = SWATCHES[f % len(SWATCHES)]

    draw_character(d, f, pencil_offset=p_off, glint_on=glint, swatch_color=swatch)

    frames.append(img)

# Save as GIF
out_path = "/mnt/data/hello-world/static/avatars/designer.gif"

frames[0].save(
    out_path,
    save_all=True,
    append_images=frames[1:],
    optimize=False,
    loop=0,
    duration=120,    # ms per frame → ~8fps
    disposal=2,
)

print(f"Saved {N_FRAMES} frames to {out_path}")

# Quick verification
from PIL import Image as PILImage
check = PILImage.open(out_path)
print(f"Verified: format={check.format}, size={check.size}, n_frames={getattr(check, 'n_frames', 1)}")
