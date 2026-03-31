#!/usr/bin/env python3
"""
GigaClungus — Avatar Variant 4
"The Crowned Tyrant"

GigaClungus has decided he rules. He wears a crude pixel crown — gold,
blocky, slightly too small for his enormous head. His palette is a corrupt
gold-sludge: sickly yellow-brown body, toxic green background with a dim
vignette. He grins. Not the contemptuous flat mouth of variants 1&2 — an
actual grin. Wide. Too wide. More teeth than necessary.

Animation: the crown sways gently (1px left/right), then he opens his
mouth wide in a grin that holds for a beat, teeth gleaming, before
snapping shut. Repeat.

Palette: toxic chartreuse-black bg, sludge gold body, acid yellow highlights,
rotten cream face, sickly green ears, amber-gold crown, gleaming white teeth.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# --- Palette ---
BG           = (8, 18, 5, 255)        # toxic dark green void
BG_VIGNETTE  = (15, 30, 8, 255)       # slightly lighter vignette ring
BODY_OUTLINE = (10, 12, 5, 255)       # near-black green-tint outline
BODY_SHADOW  = (55, 48, 10, 255)      # sludge shadow
BODY_MID     = (120, 100, 20, 255)    # sludge gold main body
BODY_LIGHT   = (170, 148, 40, 255)    # acid gold highlight
BODY_CREAM   = (195, 180, 110, 255)   # sickly cream face/belly
JOWL_SHADE   = (80, 65, 12, 255)      # jowl shadow
EYE_SOCKET   = (12, 10, 5, 255)       # dark socket
EYE_WHITE    = (240, 235, 200, 255)   # slightly yellow whites
EYE_IRIS     = (90, 130, 20, 255)     # acid green iris
EYE_PUPIL    = (8, 8, 5, 255)         # dark pupil
EYE_LID      = (95, 80, 15, 255)      # heavy lid gold-brown
EYE_VEIN     = (170, 130, 20, 255)    # yellow-tinged vein (jaundiced)
NOSE         = (155, 110, 50, 255)    # ruddy gold nose
MOUTH        = (30, 22, 5, 255)       # dark mouth interior
TEETH        = (245, 242, 220, 255)   # gleaming ivory
TOOTH_SHADOW = (180, 175, 140, 255)   # tooth gap
EAR_INNER    = (80, 120, 20, 255)     # sickly green inner ear
CROWN_GOLD   = (240, 190, 20, 255)    # bright crown gold
CROWN_DARK   = (160, 120, 5, 255)     # crown shadow side
CROWN_GEM    = (200, 30, 30, 255)     # red gem center point
CROWN_GEM2   = (30, 180, 60, 255)     # green gem side
CROWN_OUTLINE= (20, 15, 3, 255)       # crown outline


def draw_vignette(draw):
    """Faint green vignette — toxic glow at edges."""
    for r in range(3, 0, -1):
        alpha_val = 20 + r * 10
        cx, cy = 32, 32
        rad = 30 + r * 3
        draw.ellipse([(cx - rad, cy - rad), (cx + rad, cy + rad)],
                     fill=(*BG_VIGNETTE[:3], alpha_val))


def draw_body(draw):
    # Outer outline
    draw.ellipse([(0, 28), (64, 68)], fill=BODY_OUTLINE)
    # Main body
    draw.ellipse([(1, 30), (63, 66)], fill=BODY_MID)
    # Light highlight top
    draw.ellipse([(10, 29), (40, 48)], fill=BODY_LIGHT)
    draw.ellipse([(12, 31), (38, 46)], fill=BODY_MID)
    # Shadow flanks
    draw.ellipse([(0, 35), (18, 60)], fill=BODY_SHADOW)
    draw.ellipse([(46, 35), (64, 60)], fill=BODY_SHADOW)
    # Belly
    draw.ellipse([(12, 34), (52, 64)], fill=BODY_CREAM)
    # Lower belly shadow
    draw.ellipse([(12, 52), (52, 68)], fill=BODY_SHADOW)
    draw.ellipse([(14, 50), (50, 64)], fill=BODY_CREAM)
    # Arms
    draw.ellipse([(0, 38), (13, 52)], fill=BODY_SHADOW)
    draw.ellipse([(1, 39), (11, 51)], fill=BODY_MID)
    draw.ellipse([(51, 38), (64, 52)], fill=BODY_SHADOW)
    draw.ellipse([(53, 39), (63, 51)], fill=BODY_MID)
    # Base
    draw.ellipse([(6, 58), (58, 70)], fill=BODY_OUTLINE)


def draw_crown(draw, sway_x):
    """
    Crude pixel crown sitting on top of the head.
    sway_x: -1, 0, or 1 — horizontal sway offset.
    """
    # Crown base band
    cx = 32 + sway_x
    # Base rectangle
    draw.rectangle([(cx - 14, 0), (cx + 14, 5)], fill=CROWN_OUTLINE)
    draw.rectangle([(cx - 13, 1), (cx + 13, 4)], fill=CROWN_GOLD)
    # Shadow side of band
    draw.rectangle([(cx - 13, 3), (cx + 13, 4)], fill=CROWN_DARK)

    # Three points/spikes on crown (blocky pixel spikes)
    # Left spike
    draw.polygon([
        (cx - 13, 1),
        (cx - 9, 1),
        (cx - 9, -4),
        (cx - 11, -6),
        (cx - 13, -4),
    ], fill=CROWN_OUTLINE)
    draw.polygon([
        (cx - 12, 0),
        (cx - 10, 0),
        (cx - 10, -3),
        (cx - 11, -5),
        (cx - 12, -3),
    ], fill=CROWN_GOLD)

    # Center spike — tallest
    draw.polygon([
        (cx - 5, 1),
        (cx + 5, 1),
        (cx + 5, -5),
        (cx, -9),
        (cx - 5, -5),
    ], fill=CROWN_OUTLINE)
    draw.polygon([
        (cx - 4, 0),
        (cx + 4, 0),
        (cx + 4, -4),
        (cx, -8),
        (cx - 4, -4),
    ], fill=CROWN_GOLD)
    # Center gem
    draw.point((cx, -5), fill=CROWN_GEM)
    draw.point((cx + 1, -5), fill=CROWN_GEM)

    # Right spike
    draw.polygon([
        (cx + 9, 1),
        (cx + 13, 1),
        (cx + 13, -4),
        (cx + 11, -6),
        (cx + 9, -4),
    ], fill=CROWN_OUTLINE)
    draw.polygon([
        (cx + 10, 0),
        (cx + 12, 0),
        (cx + 12, -3),
        (cx + 11, -5),
        (cx + 10, -3),
    ], fill=CROWN_GOLD)
    # Side gems
    draw.point((cx - 11, -3), fill=CROWN_GEM2)
    draw.point((cx + 11, -3), fill=CROWN_GEM2)


def draw_head(draw, eye_squint, mouth_open, sway_x):
    """
    eye_squint: 0.0..1.0
    mouth_open: 0.0 = closed, 1.0 = full grin
    sway_x: crown sway carried into head position (subtle)
    """
    # Head outline
    draw.ellipse([(3, 3), (61, 42)], fill=BODY_OUTLINE)
    # Head base
    draw.ellipse([(4, 4), (60, 41)], fill=BODY_MID)
    # Face
    draw.ellipse([(11, 11), (53, 40)], fill=BODY_CREAM)

    # Left jowl
    draw.ellipse([(0, 18), (23, 40)], fill=BODY_OUTLINE)
    draw.ellipse([(1, 19), (22, 39)], fill=BODY_MID)
    draw.ellipse([(2, 20), (20, 38)], fill=BODY_CREAM)
    draw.ellipse([(1, 32), (20, 42)], fill=JOWL_SHADE)
    draw.ellipse([(2, 31), (19, 40)], fill=BODY_CREAM)

    # Right jowl
    draw.ellipse([(41, 18), (64, 40)], fill=BODY_OUTLINE)
    draw.ellipse([(42, 19), (63, 39)], fill=BODY_MID)
    draw.ellipse([(44, 20), (62, 38)], fill=BODY_CREAM)
    draw.ellipse([(44, 32), (63, 42)], fill=JOWL_SHADE)
    draw.ellipse([(45, 31), (62, 40)], fill=BODY_CREAM)

    # Ears — sickly green inner
    draw.ellipse([(8, 0), (22, 16)], fill=BODY_OUTLINE)
    draw.ellipse([(9, 0), (21, 15)], fill=BODY_MID)
    draw.ellipse([(10, 1), (20, 13)], fill=EAR_INNER)
    draw.ellipse([(42, 0), (56, 16)], fill=BODY_OUTLINE)
    draw.ellipse([(43, 0), (55, 15)], fill=BODY_MID)
    draw.ellipse([(44, 1), (54, 13)], fill=EAR_INNER)

    # Eyes
    ey = 15
    draw.ellipse([(12, ey), (28, ey + 13)], fill=EYE_SOCKET)
    draw.ellipse([(36, ey), (52, ey + 13)], fill=EYE_SOCKET)
    draw.ellipse([(13, ey + 1), (27, ey + 12)], fill=EYE_WHITE)
    draw.ellipse([(37, ey + 1), (51, ey + 12)], fill=EYE_WHITE)

    # Jaundiced veins
    draw.line([(14, ey + 9), (18, ey + 7)], fill=EYE_VEIN, width=1)
    draw.line([(49, ey + 9), (45, ey + 7)], fill=EYE_VEIN, width=1)

    # Irises
    draw.ellipse([(16, ey + 3), (24, ey + 10)], fill=EYE_IRIS)
    draw.ellipse([(40, ey + 3), (48, ey + 10)], fill=EYE_IRIS)
    # Pupils
    draw.ellipse([(18, ey + 4), (22, ey + 9)], fill=EYE_PUPIL)
    draw.ellipse([(42, ey + 4), (46, ey + 9)], fill=EYE_PUPIL)
    # Eye glint
    draw.point((18, ey + 4), fill=(255, 255, 200, 255))
    draw.point((42, ey + 4), fill=(255, 255, 200, 255))

    # Heavy eyelids (contempt — but less than A/B, he's pleased with himself)
    lid_drop_l = int(eye_squint * 6)
    lid_drop_r = int(eye_squint * 5)
    draw.ellipse([(12, ey), (28, ey + 4 + lid_drop_l)], fill=EYE_LID)
    draw.ellipse([(36, ey), (52, ey + 4 + lid_drop_r)], fill=EYE_LID)
    peek_l = max(0, 7 - lid_drop_l)
    peek_r = max(0, 7 - lid_drop_r)
    if peek_l > 1:
        draw.ellipse([(16, ey + 3), (24, ey + 3 + peek_l)], fill=EYE_IRIS)
        draw.ellipse([(18, ey + 4), (22, ey + 4 + max(0, peek_l - 2))], fill=EYE_PUPIL)
    if peek_r > 1:
        draw.ellipse([(40, ey + 3), (48, ey + 3 + peek_r)], fill=EYE_IRIS)
        draw.ellipse([(42, ey + 4), (46, ey + 4 + max(0, peek_r - 2))], fill=EYE_PUPIL)

    # Nose
    draw.ellipse([(26, 26), (38, 33)], fill=BODY_OUTLINE)
    draw.ellipse([(27, 26), (37, 32)], fill=NOSE)
    draw.ellipse([(27, 27), (30, 31)], fill=BODY_OUTLINE)
    draw.ellipse([(34, 27), (37, 31)], fill=BODY_OUTLINE)

    # Mouth — scales from flat to wide grin
    if mouth_open < 0.05:
        # Closed: slight upward curl (smug not contemptuous)
        draw.arc([(23, 30), (41, 40)], start=200, end=340, fill=MOUTH, width=2)
        # Buck teeth barely visible
        draw.rectangle([(28, 32), (31, 36)], fill=TEETH)
        draw.rectangle([(33, 32), (36, 36)], fill=TEETH)
        draw.line([(32, 32), (32, 36)], fill=TOOTH_SHADOW, width=1)
    else:
        # Open grin — mouth cavity
        grin_h = int(mouth_open * 10)
        draw.ellipse([(22, 29), (42, 29 + grin_h + 4)], fill=MOUTH)
        # Upper teeth row
        tooth_w = 3
        for i, tx in enumerate(range(24, 41, tooth_w)):
            draw.rectangle([(tx, 30), (tx + tooth_w - 1, 30 + 3 + int(mouth_open * 2))], fill=TEETH)
            if i > 0:
                draw.line([(tx, 30), (tx, 30 + 3 + int(mouth_open * 2))], fill=TOOTH_SHADOW, width=1)
        # Lower teeth (smaller)
        if mouth_open > 0.5:
            lower_y = 29 + grin_h
            for i, tx in enumerate(range(26, 39, tooth_w + 1)):
                draw.rectangle([(tx, lower_y - 2), (tx + tooth_w, lower_y)], fill=TEETH)


def make_frame(eye_squint, mouth_open, crown_sway):
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_vignette(draw)
    draw_body(draw)
    draw_head(draw, eye_squint, mouth_open, crown_sway)
    draw_crown(draw, crown_sway)
    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    def add(squint, mouth, sway, dur):
        frames.append(make_frame(squint, mouth, sway))
        durations.append(dur)

    BASE_SQUINT = 0.3  # less squinted — smug, not contemptuous

    # Idle — crown sways gently
    for _ in range(4):
        add(BASE_SQUINT, 0.0, 0, 130)

    # Crown sway right
    add(BASE_SQUINT, 0.0, 0, 100)
    add(BASE_SQUINT, 0.0, 1, 100)
    add(BASE_SQUINT, 0.0, 1, 120)
    add(BASE_SQUINT, 0.0, 0, 100)

    # Hold
    for _ in range(3):
        add(BASE_SQUINT, 0.0, 0, 130)

    # Crown sway left
    add(BASE_SQUINT, 0.0, 0, 100)
    add(BASE_SQUINT, 0.0, -1, 100)
    add(BASE_SQUINT, 0.0, -1, 120)
    add(BASE_SQUINT, 0.0, 0, 100)

    # Hold
    for _ in range(2):
        add(BASE_SQUINT, 0.0, 0, 130)

    # THE GRIN — mouth opens wide
    add(BASE_SQUINT, 0.0, 0, 100)
    add(BASE_SQUINT, 0.25, 0, 80)
    add(BASE_SQUINT, 0.5, 0, 80)
    add(BASE_SQUINT, 0.75, 0, 80)
    add(BASE_SQUINT - 0.1, 1.0, 0, 130)  # slightly less squinted when grinning wide
    add(BASE_SQUINT - 0.1, 1.0, 0, 160)  # hold the grin
    add(BASE_SQUINT - 0.1, 1.0, 0, 160)
    add(BASE_SQUINT - 0.1, 1.0, 0, 130)
    # Snap shut
    add(BASE_SQUINT, 0.5, 0, 60)
    add(BASE_SQUINT, 0.0, 0, 80)

    # Back to idle sway
    for _ in range(3):
        add(BASE_SQUINT, 0.0, 0, 130)

    add(BASE_SQUINT, 0.0, 1, 100)
    add(BASE_SQUINT, 0.0, 0, 100)

    for _ in range(3):
        add(BASE_SQUINT, 0.0, 0, 130)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/gigaclungus_v4.gif"
    frames, durations = build_frames()

    palettes = [f.quantize(colors=128, method=Image.Quantize.FASTOCTREE) for f in frames]

    bg_idx = palettes[0].getpixel((0, 0))
    alt_idx = (bg_idx + 1) % 128
    for i, p in enumerate(palettes):
        p.putpixel((63, 63), alt_idx if i % 2 == 0 else bg_idx)

    palettes[0].save(
        out_path,
        save_all=True,
        append_images=palettes[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )
    print(f"Saved {len(frames)} frames -> {out_path}")
