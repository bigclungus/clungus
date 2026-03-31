#!/usr/bin/env python3
"""
Generate isometric pixel art avatar for Kwame the Constructor (Option A — Classic Architect).
64x64 animated GIF, 8 frames, blueprint-line appearing animation.
"""

from PIL import Image, ImageDraw
import math

# ---- Palette ----
NAVY_BG      = (10, 18, 40)
GRID_LINE    = (20, 35, 70)
SKIN_MID     = (180, 120, 70)
SKIN_LIGHT   = (210, 150, 100)
SKIN_SHADOW  = (130, 80, 40)
HARD_HAT_Y   = (240, 180, 30)
HARD_HAT_SHD = (180, 130, 10)
HARD_HAT_HL  = (255, 220, 80)
SHIRT_BLUE   = (40, 80, 160)
SHIRT_SHADOW = (25, 55, 120)
SHIRT_LIGHT  = (70, 110, 200)
COLLAR_W     = (220, 225, 235)
EYE_DARK     = (30, 20, 15)
EYE_WHITE    = (240, 240, 230)
MOUTH_LINE   = (110, 60, 30)
BLUEPRINT    = (80, 160, 255)
BP_BRIGHT    = (140, 200, 255)
PENCIL_WOOD  = (220, 180, 80)
PENCIL_TIP   = (60, 40, 20)
PENCIL_ERR   = (220, 80, 80)

SIZE = 64


def draw_background(draw):
    """Dark navy with faint isometric grid lines."""
    draw.rectangle([0, 0, SIZE - 1, SIZE - 1], fill=NAVY_BG)
    # Horizontal faint lines
    for y in range(0, SIZE, 6):
        draw.line([(0, y), (SIZE - 1, y)], fill=GRID_LINE, width=1)
    # Diagonal iso-lines (slope 1:2)
    for x in range(-SIZE, SIZE * 2, 8):
        pts = []
        for px in range(0, SIZE):
            py = (px - x) // 2
            if 0 <= py < SIZE:
                pts.append((px, py))
        if len(pts) >= 2:
            for i in range(len(pts) - 1):
                draw.line([pts[i], pts[i + 1]], fill=GRID_LINE, width=1)


def draw_bust(draw):
    """Draw the isometric bust: torso + neck + head + hard hat."""

    # --- Torso / shirt (trapezoid) ---
    # Isometric: wider at bottom, narrower at top
    torso_pts = [
        (18, 52),  # bottom-left
        (46, 52),  # bottom-right
        (42, 38),  # top-right
        (22, 38),  # top-left
    ]
    draw.polygon(torso_pts, fill=SHIRT_BLUE)
    # shadow on left face
    shadow_pts = [
        (18, 52),
        (22, 38),
        (20, 38),
        (16, 52),
    ]
    draw.polygon(shadow_pts, fill=SHIRT_SHADOW)
    # highlight strip on right
    hl_pts = [
        (44, 40),
        (46, 52),
        (44, 52),
        (42, 40),
    ]
    draw.polygon(hl_pts, fill=SHIRT_LIGHT)

    # --- Collar / white shirt peek ---
    collar_pts = [
        (28, 38),
        (36, 38),
        (34, 35),
        (30, 35),
    ]
    draw.polygon(collar_pts, fill=COLLAR_W)

    # --- Neck ---
    neck_pts = [
        (29, 35),
        (35, 35),
        (34, 30),
        (30, 30),
    ]
    draw.polygon(neck_pts, fill=SKIN_MID)

    # --- Head (slightly angled isometric box-face) ---
    head_pts = [
        (22, 30),  # bottom-left
        (42, 30),  # bottom-right
        (40, 14),  # top-right
        (24, 14),  # top-left
    ]
    draw.polygon(head_pts, fill=SKIN_MID)
    # right-face shadow for iso depth
    rface_pts = [
        (42, 30),
        (40, 14),
        (43, 14),
        (45, 30),
    ]
    draw.polygon(rface_pts, fill=SKIN_SHADOW)
    # subtle forehead highlight
    draw.rectangle([25, 15, 39, 20], fill=SKIN_LIGHT)

    # --- Eyes ---
    # Left eye
    draw.rectangle([26, 22, 30, 25], fill=EYE_WHITE)
    draw.rectangle([27, 23, 29, 25], fill=EYE_DARK)
    # Right eye
    draw.rectangle([34, 22, 38, 25], fill=EYE_WHITE)
    draw.rectangle([35, 23, 37, 25], fill=EYE_DARK)

    # --- Serious straight mouth ---
    draw.line([(28, 28), (36, 28)], fill=MOUTH_LINE, width=1)
    draw.line([(29, 29), (35, 29)], fill=SKIN_SHADOW, width=1)

    # --- Hard hat ---
    # Brim (flat polygon across top of head + overhang)
    brim_pts = [
        (18, 16),  # left edge
        (46, 16),  # right edge
        (44, 13),  # right inner
        (20, 13),  # left inner
    ]
    draw.polygon(brim_pts, fill=HARD_HAT_Y)
    # Crown dome (rounded rectangle)
    draw.ellipse([22, 5, 42, 17], fill=HARD_HAT_Y)
    # shadow underside of brim
    draw.line([(18, 16), (46, 16)], fill=HARD_HAT_SHD, width=2)
    # highlight on crown
    draw.ellipse([25, 6, 38, 13], fill=HARD_HAT_HL)
    # right-side shadow on hat
    hat_shadow = [
        (42, 13),
        (46, 16),
        (44, 17),
        (40, 14),
    ]
    draw.polygon(hat_shadow, fill=HARD_HAT_SHD)


def draw_blueprint_line(draw, progress):
    """Draw a partial horizontal blueprint line below the bust.
    progress: 0.0 to 1.0 — how much of the line has appeared.
    """
    y = 57
    x_start = 8
    x_end = 56
    x_cur = int(x_start + (x_end - x_start) * progress)
    if x_cur > x_start:
        draw.line([(x_start, y), (x_cur, y)], fill=BLUEPRINT, width=1)
    # small tick marks
    for tx in range(x_start, x_cur, 8):
        draw.line([(tx, y - 2), (tx, y + 2)], fill=BP_BRIGHT, width=1)


def draw_pencil(draw, tap_offset):
    """Draw a pencil in the right hand area, with tap_offset vertical shift."""
    # Pencil at right side of torso, diagonal
    px, py = 44, 44 + tap_offset
    # body
    draw.line([(px, py), (px - 8, py - 12)], fill=PENCIL_WOOD, width=2)
    # tip
    draw.line([(px - 8, py - 12), (px - 10, py - 15)], fill=PENCIL_TIP, width=2)
    # eraser end
    draw.line([(px, py), (px + 2, py + 3)], fill=PENCIL_ERR, width=2)


N_FRAMES = 9

frames = []

for frame_idx in range(N_FRAMES):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    draw_background(draw)
    draw_bust(draw)

    # Blueprint line grows across 8 frames (frame 0 = 0%, frame 7 = 100%, frame 8 wraps back)
    if frame_idx < 8:
        bp_progress = frame_idx / 7.0
    else:
        bp_progress = 1.0

    draw_blueprint_line(draw, bp_progress)

    # Pencil tap: small vertical bounce (2px down on even frames, 0 on odd)
    tap = 1 if (frame_idx % 2 == 0) else 0
    draw_pencil(draw, tap)

    frames.append(img.convert("RGB"))

out_path = "/mnt/data/hello-world/static/avatars/architect_a.gif"

# Convert all frames to palette mode with a consistent palette
palette_frames = [f.convert("P", palette=Image.ADAPTIVE, colors=256) for f in frames]

palette_frames[0].save(
    out_path,
    save_all=True,
    append_images=palette_frames[1:],
    duration=120,
    loop=0,
    disposal=2,
    optimize=False,
)

print(f"Saved: {out_path}")

# Verify
from PIL import Image as PILImage
verify = PILImage.open(out_path)
print(f"Format: {verify.format}, Size: {verify.size}, Frames: {getattr(verify, 'n_frames', 1)}")
