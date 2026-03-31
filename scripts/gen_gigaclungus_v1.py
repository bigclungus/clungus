#!/usr/bin/env python3
"""
GigaClungus — Avatar v1
"The Colossus"

Same BigChungus rotund silhouette but crowned. He fills the entire frame
and then some. A jagged dark crown sits on his skull. Eyes glow red —
not bloodshot, fully red-lit, like something that has eaten something it
shouldn't. A pulsing dark-red aura radiates off him. He breathes slowly.
The frame is not big enough for him.

Palette: near-void black bg, deep mahogany body, crimson eye glow,
dark gold crown, oppressive red aura ring.
Animation: slow breathing (body/head shift up/down by 1-2px). Crown
sits still — it doesn't move with him, it's fixed to his authority.
Occasional blink — one red flash.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# Palette
BG           = (8, 4, 8, 255)         # near-void black
AURA_1       = (60, 8, 8, 255)        # dark crimson aura outer
AURA_2       = (40, 5, 5, 255)        # aura inner
BODY_OUTLINE = (8, 4, 4, 255)         # near-black
BODY_SHADOW  = (50, 22, 8, 255)       # deep shadow brown
BODY_MID     = (85, 42, 15, 255)      # main body
BODY_LIGHT   = (120, 65, 28, 255)     # highlight
BODY_CREAM   = (175, 142, 100, 255)   # belly/face cream — muted
JOWL_SHADE   = (60, 28, 8, 255)       # jowl underside
EYE_WHITE    = (220, 30, 30, 255)     # RED eyes — not bloodshot, fully red
EYE_IRIS     = (180, 15, 15, 255)     # deeper red iris
EYE_PUPIL    = (8, 4, 4, 255)         # void pupil
EYE_LID      = (70, 30, 12, 255)      # heavy lid
EYE_GLOW     = (255, 60, 40, 255)     # eye glow
NOSE         = (140, 55, 55, 255)     # dark nose
MOUTH        = (35, 14, 6, 255)       # shadow
CARROT       = (210, 95, 10, 255)
CARROT_DARK  = (140, 55, 5, 255)
CARROT_GREEN = (40, 90, 20, 255)
EAR_INNER    = (110, 40, 40, 255)     # dark inner ear
TEETH        = (205, 195, 175, 255)
CROWN_BASE   = (100, 75, 10, 255)     # dark gold
CROWN_MID    = (140, 105, 15, 255)    # gold
CROWN_HIGH   = (185, 145, 30, 255)    # bright gold highlight
CROWN_GEM    = (180, 20, 20, 255)     # red gem in crown center


def draw_aura(draw, breath_y):
    """Pulsing crimson aura. Slightly shifts with breath."""
    cy = 32 + breath_y // 2
    for r in range(5, 0, -1):
        col = AURA_1 if r > 2 else AURA_2
        draw.ellipse([(32 - 28 - r, cy - 28 - r),
                      (32 + 28 + r, cy + 28 + r)],
                     fill=col)


def draw_crown(draw):
    """
    Jagged crown. Fixed position — sits at very top of frame.
    5-point crown: center tall spike, two medium side spikes, two short outer.
    """
    # Crown base band across top of head
    draw.rectangle([(16, 5), (48, 11)], fill=CROWN_BASE)
    draw.rectangle([(17, 5), (47, 10)], fill=CROWN_MID)
    # Crown highlight strip
    draw.line([(17, 5), (47, 5)], fill=CROWN_HIGH, width=1)

    # Spikes — drawn as filled polygons
    # Center spike (tallest)
    draw.polygon([(30, 0), (34, 0), (35, 5), (29, 5)], fill=CROWN_MID)
    draw.line([(30, 0), (32, 0)], fill=CROWN_HIGH, width=1)

    # Left-of-center spike
    draw.polygon([(23, 2), (26, 2), (27, 5), (22, 5)], fill=CROWN_MID)
    # Right-of-center spike
    draw.polygon([(37, 2), (40, 2), (41, 5), (36, 5)], fill=CROWN_MID)

    # Outer left stub
    draw.polygon([(16, 4), (18, 4), (19, 5), (15, 5)], fill=CROWN_BASE)
    # Outer right stub
    draw.polygon([(45, 4), (47, 4), (48, 5), (44, 5)], fill=CROWN_BASE)

    # Crown gems — small pixel gems
    # Center: red
    draw.rectangle([(30, 6), (33, 9)], fill=CROWN_GEM)
    draw.point((31, 7), fill=(255, 80, 60, 255))  # gem glint
    # Side gems: tiny gold
    draw.rectangle([(22, 7), (24, 9)], fill=CROWN_HIGH)
    draw.rectangle([(39, 7), (41, 9)], fill=CROWN_HIGH)


def draw_body(draw, breath_y):
    """Enormous body, shifts slightly with breathing."""
    by = breath_y
    draw.ellipse([(0, 32 + by), (64, 70 + by)], fill=BODY_OUTLINE)
    draw.ellipse([(1, 33 + by), (63, 68 + by)], fill=BODY_MID)
    # Belly cream
    draw.ellipse([(12, 37 + by), (52, 66 + by)], fill=BODY_CREAM)
    # Shadow under belly
    draw.ellipse([(12, 55 + by), (52, 70 + by)], fill=BODY_SHADOW)
    draw.ellipse([(14, 53 + by), (50, 66 + by)], fill=BODY_CREAM)
    # Side shadows
    draw.ellipse([(0, 38 + by), (18, 60 + by)], fill=BODY_SHADOW)
    draw.ellipse([(46, 38 + by), (64, 60 + by)], fill=BODY_SHADOW)
    # Arms
    draw.ellipse([(0, 40 + by), (13, 54 + by)], fill=BODY_SHADOW)
    draw.ellipse([(1, 41 + by), (11, 53 + by)], fill=BODY_MID)
    draw.ellipse([(51, 40 + by), (64, 54 + by)], fill=BODY_SHADOW)
    draw.ellipse([(53, 41 + by), (63, 53 + by)], fill=BODY_MID)
    # Heavy base press
    draw.ellipse([(8, 61 + by), (56, 72 + by)], fill=BODY_OUTLINE)


def draw_head(draw, breath_y, eye_squint, eye_flash):
    """Head with red-glowing eyes. breath_y shifts it up/down."""
    by = breath_y

    # Head outline
    draw.ellipse([(3, 10 + by), (61, 44 + by)], fill=BODY_OUTLINE)
    # Head base
    draw.ellipse([(4, 11 + by), (60, 43 + by)], fill=BODY_MID)
    # Face cream
    draw.ellipse([(11, 17 + by), (53, 42 + by)], fill=BODY_CREAM)

    # Jowls
    draw.ellipse([(0, 22 + by), (23, 42 + by)], fill=BODY_OUTLINE)
    draw.ellipse([(1, 23 + by), (22, 41 + by)], fill=BODY_MID)
    draw.ellipse([(2, 24 + by), (20, 40 + by)], fill=BODY_CREAM)
    draw.ellipse([(1, 35 + by), (20, 44 + by)], fill=JOWL_SHADE)
    draw.ellipse([(2, 34 + by), (19, 42 + by)], fill=BODY_CREAM)

    draw.ellipse([(41, 22 + by), (64, 42 + by)], fill=BODY_OUTLINE)
    draw.ellipse([(42, 23 + by), (63, 41 + by)], fill=BODY_MID)
    draw.ellipse([(44, 24 + by), (62, 40 + by)], fill=BODY_CREAM)
    draw.ellipse([(44, 35 + by), (63, 44 + by)], fill=JOWL_SHADE)
    draw.ellipse([(45, 34 + by), (62, 42 + by)], fill=BODY_CREAM)

    # Ears
    draw.ellipse([(8, 0 + by), (22, 17 + by)], fill=BODY_OUTLINE)
    draw.ellipse([(9, 1 + by), (21, 16 + by)], fill=BODY_MID)
    draw.ellipse([(10, 2 + by), (20, 14 + by)], fill=EAR_INNER)

    draw.ellipse([(42, 0 + by), (56, 17 + by)], fill=BODY_OUTLINE)
    draw.ellipse([(43, 1 + by), (55, 16 + by)], fill=BODY_MID)
    draw.ellipse([(44, 2 + by), (54, 14 + by)], fill=EAR_INNER)

    ey = 20 + by

    # Eye sockets
    draw.ellipse([(12, ey - 1), (28, ey + 13)], fill=BODY_SHADOW)
    draw.ellipse([(36, ey - 1), (52, ey + 13)], fill=BODY_SHADOW)

    # Eye glow effect (1px border of glow color)
    if eye_flash > 0:
        glow_col = EYE_GLOW
    else:
        glow_col = (80, 10, 10, 255)

    draw.ellipse([(12, ey), (28, ey + 12)], fill=glow_col)
    draw.ellipse([(36, ey), (52, ey + 12)], fill=glow_col)

    # Eye whites (red)
    draw.ellipse([(13, ey + 1), (27, ey + 11)], fill=EYE_WHITE)
    draw.ellipse([(37, ey + 1), (51, ey + 11)], fill=EYE_WHITE)

    # Irises
    draw.ellipse([(17, ey + 3), (24, ey + 9)], fill=EYE_IRIS)
    draw.ellipse([(40, ey + 3), (47, ey + 9)], fill=EYE_IRIS)

    # Pupils
    draw.ellipse([(18, ey + 4), (23, ey + 8)], fill=EYE_PUPIL)
    draw.ellipse([(41, ey + 4), (46, ey + 8)], fill=EYE_PUPIL)

    # Cold glint
    draw.point((19, ey + 4), fill=(255, 200, 200, 255))
    draw.point((42, ey + 4), fill=(255, 200, 200, 255))

    # Heavy eyelids
    lid_drop = int(eye_squint * 7)
    draw.ellipse([(12, ey - 1), (28, ey + 4 + lid_drop)], fill=EYE_LID)
    draw.ellipse([(36, ey - 1), (52, ey + 4 + lid_drop)], fill=EYE_LID)

    peek = max(0, 7 - lid_drop)
    if peek > 1:
        draw.ellipse([(17, ey + 3), (24, ey + 3 + peek)], fill=EYE_IRIS)
        draw.ellipse([(18, ey + 4), (23, ey + 4 + max(0, peek - 2))], fill=EYE_PUPIL)
        draw.ellipse([(40, ey + 3), (47, ey + 3 + peek)], fill=EYE_IRIS)
        draw.ellipse([(41, ey + 4), (46, ey + 4 + max(0, peek - 2))], fill=EYE_PUPIL)

    # Nose
    draw.ellipse([(26, 30 + by), (38, 37 + by)], fill=BODY_OUTLINE)
    draw.ellipse([(27, 30 + by), (37, 36 + by)], fill=NOSE)
    draw.ellipse([(27, 31 + by), (30, 35 + by)], fill=BODY_OUTLINE)
    draw.ellipse([(34, 31 + by), (37, 35 + by)], fill=BODY_OUTLINE)

    # Mouth
    draw.arc([(23, 33 + by), (41, 43 + by)], start=15, end=165, fill=MOUTH, width=2)
    draw.rectangle([(28, 35 + by), (31, 40 + by)], fill=TEETH)
    draw.rectangle([(33, 35 + by), (36, 40 + by)], fill=TEETH)
    draw.line([(32, 35 + by), (32, 40 + by)], fill=MOUTH, width=1)


def draw_carrot(draw, chew_offset, breath_y):
    by = breath_y
    cx = 53 + chew_offset
    cy = 42 + by
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
        (cx + 14, cy + 5),
        (cx + 13, cy + 7),
        (cx + 9, cy + 7),
    ], fill=CARROT_DARK)
    for i, (dx, dy) in enumerate([(-1, -7), (1, -8), (3, -6)]):
        draw.line([(cx + 9 + i, cy + 3), (cx + 9 + i + dx, cy + 3 + dy)],
                  fill=CARROT_GREEN, width=1)


def make_frame(breath_y, eye_squint, eye_flash, chew_offset):
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_aura(draw, breath_y)
    draw_body(draw, breath_y)
    draw_head(draw, breath_y, eye_squint, eye_flash)
    draw_crown(draw)   # crown is fixed — does NOT move with breath
    draw_carrot(draw, chew_offset, breath_y)
    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    def add(by, sq, flash, chew, dur):
        frames.append(make_frame(by, sq, flash, chew))
        durations.append(dur)

    BASE_SQ = 0.55

    # Breath cycle: inhale (body up = negative y), exhale (down)
    # breath_y: 0 = neutral, -1 = inhale up, +1 = exhale down

    # Neutral stare
    for _ in range(4):
        add(0, BASE_SQ, 0, 0, 140)

    # Slow inhale (head/body rise)
    add(-1, BASE_SQ, 0, 0, 160)
    add(-1, BASE_SQ, 0, 0, 160)

    # Brief chew at top of breath
    add(-1, BASE_SQ, 0, 1, 90)
    add(-1, BASE_SQ + 0.05, 0, 2, 80)
    add(-1, BASE_SQ, 0, 1, 90)

    # Exhale (body drop)
    add(0, BASE_SQ, 0, 0, 140)
    add(1, BASE_SQ, 0, 0, 160)
    add(1, BASE_SQ, 0, 0, 160)

    # Back to neutral
    add(0, BASE_SQ, 0, 0, 140)

    # THE LOOK — red eye flash, squint narrows
    for _ in range(3):
        add(0, BASE_SQ, 0, 0, 130)

    add(0, BASE_SQ + 0.1, 0, 0, 110)
    add(0, BASE_SQ + 0.2, 1, 0, 100)   # eye flash
    add(0, BASE_SQ + 0.3, 1, 0, 130)   # peak squint + glow
    add(0, BASE_SQ + 0.3, 1, 0, 150)
    add(0, BASE_SQ + 0.3, 0, 0, 130)
    add(0, BASE_SQ + 0.2, 0, 0, 110)
    add(0, BASE_SQ + 0.1, 0, 0, 110)
    add(0, BASE_SQ, 0, 0, 130)

    # Another breath
    add(-1, BASE_SQ, 0, 0, 160)
    add(-1, BASE_SQ, 0, 0, 160)
    add(0, BASE_SQ, 0, 0, 140)
    add(1, BASE_SQ, 0, 0, 160)
    add(0, BASE_SQ, 0, 0, 140)

    # Chew
    add(0, BASE_SQ, 0, 0, 90)
    add(0, BASE_SQ, 0, 1, 80)
    add(0, BASE_SQ + 0.05, 0, 2, 80)
    add(0, BASE_SQ, 0, 1, 80)
    add(0, BASE_SQ, 0, 0, 90)

    # Final hold
    for _ in range(4):
        add(0, BASE_SQ, 0, 0, 140)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/gigaclungus_v1.gif"
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
