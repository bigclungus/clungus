#!/usr/bin/env python3
"""
GigaClungus — Avatar Option B
"Giga Energy"

Same BigChungus silhouette — grotesquely wide, fills the entire frame,
spills past the edges — but the energy is oppressive. Darker palette.
Deep shadow under the jowls. Eyes are dead, heavy, red-veined. The
carrot glows like contraband. He doesn't look at you. He looks through you.

Background: dark grey-purple void with a subtle power aura (dark glow).
Body: near-black outline, deep mahogany brown, heavy shading.
Eyes: bloodshot whites, cold grey-green iris, massive dark pupils.
Animation: imperceptibly slow chew. One eye twitches slightly.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# --- Palette (darker, more imposing) ---
BG           = (12, 8, 18, 255)       # deep void purple
AURA         = (30, 15, 40, 255)      # dark power glow around figure
BODY_OUTLINE = (10, 5, 5, 255)        # near-black outline
BODY_SHADOW  = (55, 28, 12, 255)      # deep shadow brown
BODY_MID     = (95, 52, 22, 255)      # main body
BODY_LIGHT   = (135, 78, 38, 255)     # highlight
BODY_CREAM   = (185, 158, 118, 255)   # belly/face — darker cream, not soft
JOWL_SHADE   = (75, 42, 18, 255)      # jowl underside
EYE_WHITE    = (200, 190, 175, 255)   # off-white, yellowed
EYE_IRIS     = (35, 70, 35, 255)      # muddy green
EYE_PUPIL    = (5, 4, 4, 255)         # void black pupil
EYE_LID      = (80, 45, 20, 255)      # heavy dark eyelid
EYE_VEIN     = (160, 40, 40, 255)     # bloodshot veins
NOSE         = (160, 70, 70, 255)     # dark ruddy nose
MOUTH        = (40, 18, 8, 255)       # shadow mouth
CARROT       = (220, 105, 15, 255)    # vivid orange carrot
CARROT_DARK  = (160, 70, 5, 255)      # carrot shadow
CARROT_GREEN = (45, 105, 30, 255)     # carrot tops
EAR_INNER    = (130, 55, 55, 255)     # dark inner ear
TEETH        = (215, 208, 188, 255)   # ivory teeth
TOOTH_SHADOW = (150, 140, 120, 255)   # tooth gap shadow


def draw_aura(draw):
    """Dark power aura surrounding the figure — subtle purple glow."""
    for r in range(4, 0, -1):
        alpha = 40 + r * 15
        draw.ellipse([(32 - 30 - r, 32 - 30 - r),
                      (32 + 30 + r, 32 + 30 + r)],
                     fill=(*AURA[:3], alpha))


def draw_body(draw):
    """Grotesque mass. He fills the frame entirely."""
    # Outer shadow (outline)
    draw.ellipse([(0, 28), (64, 68)], fill=BODY_OUTLINE)
    # Main body — extends past frame edges
    draw.ellipse([(1, 30), (63, 66)], fill=BODY_MID)
    # Belly
    draw.ellipse([(12, 34), (52, 64)], fill=BODY_CREAM)
    # Shadow under belly (heavy gravity)
    draw.ellipse([(12, 52), (52, 68)], fill=BODY_SHADOW)
    draw.ellipse([(14, 50), (50, 64)], fill=BODY_CREAM)
    # Left side shadow
    draw.ellipse([(0, 35), (18, 58)], fill=BODY_SHADOW)
    # Right side shadow
    draw.ellipse([(46, 35), (64, 58)], fill=BODY_SHADOW)
    # Left arm (tiny, useless)
    draw.ellipse([(0, 38), (13, 52)], fill=BODY_SHADOW)
    draw.ellipse([(1, 39), (11, 51)], fill=BODY_MID)
    # Right arm (holding carrot)
    draw.ellipse([(51, 38), (64, 52)], fill=BODY_SHADOW)
    draw.ellipse([(53, 39), (63, 51)], fill=BODY_MID)
    # Heavy base shadow — he presses down
    draw.ellipse([(6, 58), (58, 70)], fill=BODY_OUTLINE)


def draw_head(draw, eye_squint, eye_twitch_x):
    """
    Enormous head. Wide jowls dominate.
    eye_squint: 0..1, contempt level
    eye_twitch_x: -1..1, subtle eye twitch offset
    """
    # Head outline
    draw.ellipse([(3, 3), (61, 42)], fill=BODY_OUTLINE)
    # Head base
    draw.ellipse([(4, 4), (60, 41)], fill=BODY_MID)
    # Face cream — darker, less soft
    draw.ellipse([(11, 11), (53, 40)], fill=BODY_CREAM)

    # Jowl pouches — the signature: massive, sag down
    # Left jowl
    draw.ellipse([(0, 18), (23, 40)], fill=BODY_OUTLINE)
    draw.ellipse([(1, 19), (22, 39)], fill=BODY_MID)
    draw.ellipse([(2, 20), (20, 38)], fill=BODY_CREAM)
    # Jowl underside shadow
    draw.ellipse([(1, 32), (20, 42)], fill=JOWL_SHADE)
    draw.ellipse([(2, 31), (19, 40)], fill=BODY_CREAM)

    # Right jowl
    draw.ellipse([(41, 18), (64, 40)], fill=BODY_OUTLINE)
    draw.ellipse([(42, 19), (63, 39)], fill=BODY_MID)
    draw.ellipse([(44, 20), (62, 38)], fill=BODY_CREAM)
    # Jowl underside shadow
    draw.ellipse([(44, 32), (63, 42)], fill=JOWL_SHADE)
    draw.ellipse([(45, 31), (62, 40)], fill=BODY_CREAM)

    # Ears — wide, pressed into frame top
    # Left ear
    draw.ellipse([(8, 0), (22, 16)], fill=BODY_OUTLINE)
    draw.ellipse([(9, 0), (21, 15)], fill=BODY_MID)
    draw.ellipse([(10, 1), (20, 13)], fill=EAR_INNER)
    # Right ear
    draw.ellipse([(42, 0), (56, 16)], fill=BODY_OUTLINE)
    draw.ellipse([(43, 0), (55, 15)], fill=BODY_MID)
    draw.ellipse([(44, 1), (54, 13)], fill=EAR_INNER)

    # Eyes
    ey = 16  # eye baseline y
    ex_l = 13 + eye_twitch_x  # left eye x start
    ex_r = 37 + eye_twitch_x  # right eye x start

    # Eye sockets (dark)
    draw.ellipse([(ex_l - 1, ey - 1), (ex_l + 15, ey + 12)], fill=BODY_SHADOW)
    draw.ellipse([(ex_r - 1, ey - 1), (ex_r + 15, ey + 12)], fill=BODY_SHADOW)

    # Eye whites
    draw.ellipse([(ex_l, ey), (ex_l + 14, ey + 11)], fill=EYE_WHITE)
    draw.ellipse([(ex_r, ey), (ex_r + 14, ey + 11)], fill=EYE_WHITE)

    # Bloodshot veins
    draw.line([(ex_l + 1, ey + 8), (ex_l + 5, ey + 6)], fill=EYE_VEIN, width=1)
    draw.line([(ex_l + 1, ey + 4), (ex_l + 4, ey + 6)], fill=EYE_VEIN, width=1)
    draw.line([(ex_r + 12, ey + 8), (ex_r + 8, ey + 6)], fill=EYE_VEIN, width=1)
    draw.line([(ex_r + 13, ey + 4), (ex_r + 10, ey + 5)], fill=EYE_VEIN, width=1)

    # Irises
    draw.ellipse([(ex_l + 4, ey + 2), (ex_l + 11, ey + 9)], fill=EYE_IRIS)
    draw.ellipse([(ex_r + 3, ey + 2), (ex_r + 10, ey + 9)], fill=EYE_IRIS)

    # Pupils — large, void
    draw.ellipse([(ex_l + 5, ey + 3), (ex_l + 10, ey + 8)], fill=EYE_PUPIL)
    draw.ellipse([(ex_r + 4, ey + 3), (ex_r + 9, ey + 8)], fill=EYE_PUPIL)

    # Eye glint (cold, small)
    draw.point((ex_l + 5, ey + 3), fill=(220, 220, 240, 255))
    draw.point((ex_r + 4, ey + 3), fill=(220, 220, 240, 255))

    # Heavy upper eyelids — the core contempt squint
    lid_l_drop = int(eye_squint * 7)
    lid_r_drop = int(eye_squint * 5)  # right slightly less (asymmetric)

    # Left lid
    draw.ellipse([(ex_l - 1, ey - 1), (ex_l + 15, ey + 4 + lid_l_drop)],
                 fill=EYE_LID)
    # Right lid
    draw.ellipse([(ex_r - 1, ey - 1), (ex_r + 15, ey + 4 + lid_r_drop)],
                 fill=EYE_LID)

    # Re-expose iris peek under lid
    peek_l = max(0, 7 - lid_l_drop)
    peek_r = max(0, 7 - lid_r_drop)
    if peek_l > 1:
        draw.ellipse([(ex_l + 4, ey + 2), (ex_l + 11, ey + 2 + peek_l)], fill=EYE_IRIS)
        draw.ellipse([(ex_l + 5, ey + 3), (ex_l + 10, ey + 3 + max(0, peek_l - 2))], fill=EYE_PUPIL)
    if peek_r > 1:
        draw.ellipse([(ex_r + 3, ey + 2), (ex_r + 10, ey + 2 + peek_r)], fill=EYE_IRIS)
        draw.ellipse([(ex_r + 4, ey + 3), (ex_r + 9, ey + 3 + max(0, peek_r - 2))], fill=EYE_PUPIL)

    # Nose
    draw.ellipse([(26, 26), (38, 33)], fill=BODY_OUTLINE)
    draw.ellipse([(27, 26), (37, 32)], fill=NOSE)
    draw.ellipse([(27, 27), (30, 31)], fill=BODY_OUTLINE)   # left nostril
    draw.ellipse([(34, 27), (37, 31)], fill=BODY_OUTLINE)   # right nostril

    # Mouth — contemptuous flat line, slight downward curl
    draw.arc([(23, 28), (41, 40)], start=15, end=165, fill=MOUTH, width=2)
    # Buck teeth
    draw.rectangle([(28, 30), (31, 36)], fill=TEETH)
    draw.rectangle([(33, 30), (36, 36)], fill=TEETH)
    draw.line([(32, 30), (32, 36)], fill=TOOTH_SHADOW, width=1)
    # Tooth shadow at top (where they emerge from lip)
    draw.line([(28, 30), (36, 30)], fill=MOUTH, width=1)


def draw_carrot(draw, chew_offset):
    """Carrot held at right side. Glows slightly against dark bg."""
    cx = 53 + chew_offset
    cy = 36
    # Carrot body
    draw.polygon([
        (cx, cy),
        (cx + 10, cy + 3),
        (cx + 9, cy + 7),
        (cx - 1, cy + 4),
    ], fill=CARROT)
    # Carrot shadow side
    draw.polygon([
        (cx, cy + 3),
        (cx + 9, cy + 6),
        (cx + 9, cy + 7),
        (cx - 1, cy + 4),
    ], fill=CARROT_DARK)
    # Carrot tip
    draw.polygon([
        (cx + 9, cy + 3),
        (cx + 14, cy + 5),
        (cx + 13, cy + 7),
        (cx + 9, cy + 7),
    ], fill=CARROT_DARK)
    # Carrot greens (wispy)
    for i, (dx, dy) in enumerate([(-1, -8), (1, -9), (3, -7)]):
        draw.line([(cx + 9 + i, cy + 3), (cx + 9 + i + dx, cy + 3 + dy)],
                  fill=CARROT_GREEN, width=1)


def make_frame(eye_squint, eye_twitch_x, chew_offset):
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_aura(draw)
    draw_body(draw)
    draw_head(draw, eye_squint, eye_twitch_x)
    draw_carrot(draw, chew_offset)
    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    def add(squint, twitch, chew, dur):
        frames.append(make_frame(squint, twitch, chew))
        durations.append(dur)

    # Baseline: dead stare, maximum contempt baseline (0.6 squint)
    BASE = 0.6

    for _ in range(5):
        add(BASE, 0, 0, 130)

    # Slow chew #1
    add(BASE, 0, 0, 90)
    add(BASE, 0, 1, 80)
    add(BASE + 0.05, 0, 2, 80)
    add(BASE, 0, 1, 80)
    add(BASE, 0, 0, 90)

    # Stare
    for _ in range(4):
        add(BASE, 0, 0, 130)

    # The Look — eyes narrow further. Does not look away. Does not blink.
    add(BASE + 0.1, 0, 0, 110)
    add(BASE + 0.2, 0, 0, 110)
    add(BASE + 0.3, 0, 0, 130)   # maximum squint
    add(BASE + 0.3, 0, 0, 160)
    add(BASE + 0.3, 0, 0, 160)
    add(BASE + 0.2, 0, 0, 110)
    add(BASE + 0.1, 0, 0, 110)
    add(BASE, 0, 0, 110)

    # Hold
    for _ in range(3):
        add(BASE, 0, 0, 130)

    # Subtle eye twitch (left eye only — simulated via whole-head offset)
    add(BASE, 0, 0, 100)
    add(BASE, 1, 0, 60)
    add(BASE, 0, 0, 60)
    add(BASE, 1, 0, 60)
    add(BASE, 0, 0, 100)

    # Chew #2 — still doesn't care
    add(BASE, 0, 0, 90)
    add(BASE, 0, 1, 80)
    add(BASE + 0.05, 0, 2, 80)
    add(BASE, 0, 1, 80)
    add(BASE, 0, 0, 90)

    # Final hold before loop
    for _ in range(4):
        add(BASE, 0, 0, 130)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/gigaclungus_b.gif"
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
