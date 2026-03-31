#!/usr/bin/env python3
"""
GigaClungus — Avatar v2
"The Shadow"

A different visual treatment: near-monochrome silhouette with sickly
acid-green accent eyes. He faces slightly left (3/4 profile suggestion —
jowl asymmetry gives the impression). The body is a dark mass, barely
distinguishable from the void bg. A dripping shadow falls below him
(3-4 dark droplet shapes cycle down each loop). He doesn't move much.
He doesn't need to.

Palette: near-black everything, sickly yellow-green eyes, toxic green
aura wisp, off-white bone-colored teeth only visible element.
Animation: shadow drip pulses downward. Jaw shifts once. Eyes hold.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# Palette — nearly monochrome
BG            = (6, 6, 6, 255)          # true void black
SHADOW_DRIP   = (15, 20, 15, 255)       # shadow drip — near-black green
AURA_WISP     = (10, 30, 10, 255)       # toxic green wisp, very dark
BODY_OUTLINE  = (6, 6, 6, 255)          # same as bg — silhouette bleeds in
BODY_DARK     = (28, 20, 14, 255)       # body darkest
BODY_MID      = (52, 34, 18, 255)       # body mid
BODY_LIGHT    = (80, 52, 24, 255)       # body edge highlight
BODY_CREAM    = (120, 95, 65, 255)      # face/belly — very muted, dark cream
JOWL_UNDER    = (22, 14, 8, 255)        # deep jowl shadow
EYE_SOCKET    = (10, 10, 10, 255)       # black socket
EYE_GLOW_OUT  = (60, 100, 20, 255)      # acid green outer glow
EYE_GLOW_MID  = (110, 160, 30, 255)     # acid green mid
EYE_IRIS      = (140, 200, 40, 255)     # bright acid green iris
EYE_PUPIL     = (4, 4, 4, 255)          # void
EYE_LID       = (40, 26, 12, 255)       # heavy dark lid
NOSE          = (80, 40, 40, 255)       # almost invisible nose
MOUTH         = (20, 10, 4, 255)        # dark shadow mouth
CARROT        = (170, 80, 8, 255)       # very muted carrot, barely visible
CARROT_DARK   = (100, 45, 4, 255)
CARROT_GREEN  = (30, 70, 15, 255)
EAR_INNER     = (60, 25, 25, 255)       # almost invisible
TEETH         = (190, 182, 158, 255)    # bone white — the only light element
TOOTH_SHADOW  = (100, 92, 78, 255)


def draw_drip_shadow(draw, drip_phase):
    """
    Shadow drips below the figure. drip_phase 0..3 controls how far
    the drips have fallen. Creates an organic ooze feel.
    """
    # Base shadow pool at very bottom
    draw.ellipse([(10, 61), (54, 68)], fill=SHADOW_DRIP)

    # Drip 1: center-left, fast
    drip1_y = 58 + drip_phase * 1
    draw.ellipse([(24, drip1_y), (30, drip1_y + 4)], fill=SHADOW_DRIP)

    # Drip 2: center-right, offset phase
    drip2_y = 56 + ((drip_phase + 1) % 4) * 1
    draw.ellipse([(36, drip2_y), (41, drip2_y + 5)], fill=SHADOW_DRIP)

    # Drip 3: far left, slow
    drip3_y = 60 + ((drip_phase + 2) % 4) * 1
    draw.ellipse([(15, drip3_y), (20, drip3_y + 3)], fill=SHADOW_DRIP)


def draw_aura_wisp(draw):
    """Faint toxic green mist around the figure — barely visible."""
    for r in [3, 2, 1]:
        draw.ellipse([(32 - 26 - r, 32 - 26 - r),
                      (32 + 26 + r, 32 + 26 + r)],
                     fill=AURA_WISP)


def draw_body(draw):
    """Dark mass body. Mostly silhouette."""
    # Outer edge — barely different from bg
    draw.ellipse([(0, 34), (64, 72)], fill=BODY_DARK)
    # Inner body
    draw.ellipse([(2, 36), (62, 70)], fill=BODY_MID)
    # Belly — muted
    draw.ellipse([(14, 40), (50, 68)], fill=BODY_CREAM)
    # Shadow overlay to darken belly
    draw.ellipse([(14, 54), (50, 72)], fill=BODY_DARK)
    draw.ellipse([(16, 52), (48, 68)], fill=JOWL_UNDER)
    # Side shadows — almost invisible
    draw.ellipse([(0, 40), (16, 62)], fill=BODY_DARK)
    draw.ellipse([(48, 40), (64, 62)], fill=BODY_DARK)
    # Arms (tiny stubs)
    draw.ellipse([(0, 42), (14, 56)], fill=BODY_DARK)
    draw.ellipse([(1, 43), (12, 55)], fill=BODY_MID)
    draw.ellipse([(50, 42), (64, 56)], fill=BODY_DARK)
    draw.ellipse([(52, 43), (63, 55)], fill=BODY_MID)


def draw_head(draw, eye_squint, jaw_open):
    """
    Head with acid green eyes. jaw_open=True drops jaw slightly.
    Profile suggestion: left jowl slightly larger.
    """
    # Head — dark, blends into bg at edges
    draw.ellipse([(3, 8), (61, 44)], fill=BODY_DARK)
    draw.ellipse([(5, 9), (59, 43)], fill=BODY_MID)
    # Face overlay
    draw.ellipse([(12, 14), (52, 42)], fill=BODY_CREAM)

    # Left jowl (bigger — slight profile lean)
    draw.ellipse([(0, 20), (26, 42)], fill=BODY_DARK)
    draw.ellipse([(1, 21), (25, 41)], fill=BODY_MID)
    draw.ellipse([(2, 22), (23, 40)], fill=BODY_CREAM)
    draw.ellipse([(1, 34), (22, 44)], fill=JOWL_UNDER)
    draw.ellipse([(2, 33), (21, 42)], fill=BODY_CREAM)

    # Right jowl (normal)
    draw.ellipse([(38, 20), (64, 42)], fill=BODY_DARK)
    draw.ellipse([(39, 21), (63, 41)], fill=BODY_MID)
    draw.ellipse([(41, 22), (62, 40)], fill=BODY_CREAM)
    draw.ellipse([(40, 34), (62, 44)], fill=JOWL_UNDER)
    draw.ellipse([(41, 33), (61, 42)], fill=BODY_CREAM)

    # Ears
    draw.ellipse([(8, 0), (22, 16)], fill=BODY_DARK)
    draw.ellipse([(9, 0), (21, 15)], fill=BODY_MID)
    draw.ellipse([(10, 1), (20, 13)], fill=EAR_INNER)

    draw.ellipse([(42, 0), (56, 16)], fill=BODY_DARK)
    draw.ellipse([(43, 0), (55, 15)], fill=BODY_MID)
    draw.ellipse([(44, 1), (54, 13)], fill=EAR_INNER)

    ey = 18

    # Eye sockets — very dark
    draw.ellipse([(12, ey - 1), (29, ey + 13)], fill=EYE_SOCKET)
    draw.ellipse([(35, ey - 1), (52, ey + 13)], fill=EYE_SOCKET)

    # Acid green glow — outer ring
    draw.ellipse([(12, ey), (29, ey + 12)], fill=EYE_GLOW_OUT)
    draw.ellipse([(35, ey), (52, ey + 12)], fill=EYE_GLOW_OUT)

    # Green mid
    draw.ellipse([(14, ey + 1), (27, ey + 11)], fill=EYE_GLOW_MID)
    draw.ellipse([(37, ey + 1), (50, ey + 11)], fill=EYE_GLOW_MID)

    # Iris — bright acid
    draw.ellipse([(16, ey + 3), (24, ey + 9)], fill=EYE_IRIS)
    draw.ellipse([(39, ey + 3), (47, ey + 9)], fill=EYE_IRIS)

    # Pupils — void
    draw.ellipse([(18, ey + 4), (23, ey + 8)], fill=EYE_PUPIL)
    draw.ellipse([(41, ey + 4), (46, ey + 8)], fill=EYE_PUPIL)

    # Glint (toxic green)
    draw.point((19, ey + 4), fill=(200, 255, 80, 255))
    draw.point((42, ey + 4), fill=(200, 255, 80, 255))

    # Heavy lids
    lid_drop = int(eye_squint * 8)
    draw.ellipse([(12, ey - 1), (29, ey + 4 + lid_drop)], fill=EYE_LID)
    draw.ellipse([(35, ey - 1), (52, ey + 4 + lid_drop)], fill=EYE_LID)

    peek = max(0, 8 - lid_drop)
    if peek > 1:
        draw.ellipse([(16, ey + 3), (24, ey + 3 + peek)], fill=EYE_IRIS)
        draw.ellipse([(18, ey + 4), (23, ey + 4 + max(0, peek - 2))], fill=EYE_PUPIL)
        draw.ellipse([(39, ey + 3), (47, ey + 3 + peek)], fill=EYE_IRIS)
        draw.ellipse([(41, ey + 4), (46, ey + 4 + max(0, peek - 2))], fill=EYE_PUPIL)

    # Nose — barely there
    draw.ellipse([(27, 29), (39, 35)], fill=NOSE)
    draw.ellipse([(27, 30), (30, 34)], fill=BODY_DARK)
    draw.ellipse([(35, 30), (38, 34)], fill=BODY_DARK)

    # Jaw open shift
    jaw_y = 2 if jaw_open else 0

    # Mouth
    draw.arc([(23, 32 + jaw_y), (41, 42 + jaw_y)],
             start=15, end=165, fill=MOUTH, width=2)

    # Teeth — the only truly bright thing in the image
    draw.rectangle([(28, 34 + jaw_y), (31, 39 + jaw_y)], fill=TEETH)
    draw.rectangle([(33, 34 + jaw_y), (36, 39 + jaw_y)], fill=TEETH)
    draw.line([(32, 34 + jaw_y), (32, 39 + jaw_y)], fill=TOOTH_SHADOW, width=1)
    draw.line([(28, 34 + jaw_y), (36, 34 + jaw_y)], fill=MOUTH, width=1)


def draw_carrot(draw, chew_offset):
    """Carrot — muted, barely visible. Held at right."""
    cx = 52 + chew_offset
    cy = 44
    draw.polygon([
        (cx, cy),
        (cx + 10, cy + 3),
        (cx + 9, cy + 7),
        (cx - 1, cy + 4),
    ], fill=CARROT)
    draw.polygon([
        (cx, cy + 3),
        (cx + 9, cy + 6),
        (cx + 9, cy + 7),
        (cx - 1, cy + 4),
    ], fill=CARROT_DARK)
    draw.polygon([
        (cx + 9, cy + 3),
        (cx + 13, cy + 5),
        (cx + 12, cy + 7),
        (cx + 9, cy + 7),
    ], fill=CARROT_DARK)
    for i, (dx, dy) in enumerate([(-1, -6), (1, -7), (2, -5)]):
        draw.line([(cx + 9 + i, cy + 3), (cx + 9 + i + dx, cy + 3 + dy)],
                  fill=CARROT_GREEN, width=1)


def make_frame(eye_squint, drip_phase, jaw_open, chew_offset):
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_aura_wisp(draw)
    draw_drip_shadow(draw, drip_phase)
    draw_body(draw)
    draw_head(draw, eye_squint, jaw_open)
    draw_carrot(draw, chew_offset)
    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    def add(sq, drip, jaw, chew, dur):
        frames.append(make_frame(sq, drip, jaw, chew))
        durations.append(dur)

    BASE = 0.65   # high baseline squint — more closed than a/b

    # Dead still — just the drip pulsing
    add(BASE, 0, False, 0, 150)
    add(BASE, 1, False, 0, 120)
    add(BASE, 2, False, 0, 120)
    add(BASE, 3, False, 0, 120)
    add(BASE, 0, False, 0, 150)
    add(BASE, 1, False, 0, 120)

    # Stare continues
    for _ in range(3):
        add(BASE, 0, False, 0, 160)

    # Single jaw drop — contemptuous, slow
    add(BASE, 0, False, 0, 100)
    add(BASE, 0, True,  1, 90)
    add(BASE, 0, True,  2, 90)
    add(BASE, 0, True,  1, 100)
    add(BASE, 0, False, 0, 130)

    # Drip resumes
    add(BASE, 0, False, 0, 140)
    add(BASE, 1, False, 0, 120)
    add(BASE, 2, False, 0, 120)
    add(BASE, 3, False, 0, 120)
    add(BASE, 0, False, 0, 140)

    # Squint tightens — THE GAZE
    add(BASE + 0.1, 0, False, 0, 110)
    add(BASE + 0.2, 1, False, 0, 110)
    add(BASE + 0.3, 2, False, 0, 140)   # near-closed, drip visible
    add(BASE + 0.3, 3, False, 0, 160)
    add(BASE + 0.3, 0, False, 0, 160)
    add(BASE + 0.2, 0, False, 0, 110)
    add(BASE + 0.1, 0, False, 0, 110)
    add(BASE,       0, False, 0, 130)

    # Drip again then settle
    add(BASE, 1, False, 0, 120)
    add(BASE, 2, False, 0, 120)
    add(BASE, 3, False, 0, 120)

    for _ in range(4):
        add(BASE, 0, False, 0, 160)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/gigaclungus_v2.gif"
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
