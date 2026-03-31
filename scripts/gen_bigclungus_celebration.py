#!/usr/bin/env python3
"""
BigClungus Celebration Avatar
"Server Rewrite Complete"

BigClungus as a chunky bot-rabbit silhouette, celebrating the Clunger
TypeScript rewrite milestone. Wide grin, one fist raised, confetti raining
down, a small glowing "TS" badge on the chest.

Palette: dark navy background, vibrant celebration colors — gold, cyan,
magenta confetti. Body is the same BigChungus silhouette shape but rendered
as a friendly blue-tinted bot. Eyes are wide and bright, not menacing.

Animation: confetti falls in a loop, fist bobs up/down, grin holds steady.
"""

from PIL import Image, ImageDraw
import math
import random

W, H = 64, 64

# --- Palette ---
BG              = (8, 10, 22, 255)        # deep navy
BODY_OUTLINE    = (12, 18, 38, 255)       # near-black outline
BODY_MID        = (40, 65, 120, 255)      # mid-blue bot body
BODY_LIGHT      = (65, 100, 170, 255)     # highlight blue
BODY_SHADOW     = (22, 38, 72, 255)       # shadow
FACE_LIGHT      = (80, 120, 195, 255)     # face highlight
EAR_INNER       = (100, 80, 140, 255)     # inner ear purple
EYE_WHITE       = (230, 235, 255, 255)    # bright eye whites
EYE_IRIS        = (60, 200, 240, 255)     # cyan iris (bot eyes)
EYE_PUPIL       = (10, 20, 40, 255)       # dark pupil
EYE_GLINT       = (255, 255, 255, 255)    # glint
NOSE            = (60, 80, 140, 255)      # blue-ish nose
MOUTH_OPEN      = (15, 20, 45, 255)       # open mouth interior
TEETH           = (240, 245, 255, 255)    # teeth
CHEEK           = (80, 100, 200, 100)     # subtle blush
TS_BG           = (50, 120, 200, 255)     # TypeScript blue badge
TS_TEXT         = (255, 255, 255, 255)    # TS letters
FIST            = (50, 80, 140, 255)      # raised fist
FIST_OUTLINE    = (20, 40, 80, 255)
CONFETTI_COLORS = [
    (255, 215, 0, 255),    # gold
    (0, 230, 180, 255),    # cyan-green
    (230, 60, 200, 255),   # magenta
    (255, 120, 30, 255),   # orange
    (120, 255, 80, 255),   # lime
    (80, 160, 255, 255),   # sky blue
]


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)


def draw_body(draw):
    """Chunky bot body — same BigChungus silhouette shape, blue-tinted."""
    # Outer outline
    draw.ellipse([(0, 29), (64, 68)], fill=BODY_OUTLINE)
    # Main body
    draw.ellipse([(1, 30), (63, 66)], fill=BODY_MID)
    # Belly highlight
    draw.ellipse([(14, 36), (50, 62)], fill=BODY_LIGHT)
    # Shadow sides
    draw.ellipse([(0, 36), (16, 58)], fill=BODY_SHADOW)
    draw.ellipse([(48, 36), (64, 58)], fill=BODY_SHADOW)
    # Left arm (little nub)
    draw.ellipse([(0, 38), (12, 52)], fill=BODY_SHADOW)
    draw.ellipse([(1, 39), (10, 51)], fill=BODY_MID)
    # Base shadow
    draw.ellipse([(8, 60), (56, 70)], fill=BODY_OUTLINE)


def draw_head(draw):
    """Round friendly bot head with big grin."""
    # Head outline
    draw.ellipse([(4, 3), (60, 42)], fill=BODY_OUTLINE)
    # Head base
    draw.ellipse([(5, 4), (59, 41)], fill=BODY_MID)
    # Face highlight
    draw.ellipse([(12, 10), (52, 40)], fill=FACE_LIGHT)

    # Left jowl
    draw.ellipse([(0, 18), (22, 40)], fill=BODY_OUTLINE)
    draw.ellipse([(1, 19), (21, 39)], fill=BODY_MID)
    draw.ellipse([(2, 20), (20, 38)], fill=FACE_LIGHT)

    # Right jowl
    draw.ellipse([(42, 18), (64, 40)], fill=BODY_OUTLINE)
    draw.ellipse([(43, 19), (63, 39)], fill=BODY_MID)
    draw.ellipse([(44, 20), (62, 38)], fill=FACE_LIGHT)

    # Ears
    draw.ellipse([(8, 0), (22, 16)], fill=BODY_OUTLINE)
    draw.ellipse([(9, 0), (21, 15)], fill=BODY_MID)
    draw.ellipse([(10, 1), (20, 13)], fill=EAR_INNER)
    draw.ellipse([(42, 0), (56, 16)], fill=BODY_OUTLINE)
    draw.ellipse([(43, 0), (55, 15)], fill=BODY_MID)
    draw.ellipse([(44, 1), (54, 13)], fill=EAR_INNER)


def draw_eyes(draw, blink_t=0.0):
    """Wide, bright, happy bot eyes. blink_t: 0=open, 1=closed."""
    ey = 14
    ex_l, ex_r = 12, 36

    # Eye sockets
    draw.ellipse([(ex_l - 1, ey - 1), (ex_l + 16, ey + 13)], fill=BODY_SHADOW)
    draw.ellipse([(ex_r - 1, ey - 1), (ex_r + 16, ey + 13)], fill=BODY_SHADOW)

    # Whites
    draw.ellipse([(ex_l, ey), (ex_l + 15, ey + 12)], fill=EYE_WHITE)
    draw.ellipse([(ex_r, ey), (ex_r + 15, ey + 12)], fill=EYE_WHITE)

    # Irises — cyan bot eyes
    draw.ellipse([(ex_l + 3, ey + 2), (ex_l + 12, ey + 10)], fill=EYE_IRIS)
    draw.ellipse([(ex_r + 3, ey + 2), (ex_r + 12, ey + 10)], fill=EYE_IRIS)

    # Pupils
    draw.ellipse([(ex_l + 5, ey + 3), (ex_l + 10, ey + 9)], fill=EYE_PUPIL)
    draw.ellipse([(ex_r + 5, ey + 3), (ex_r + 10, ey + 9)], fill=EYE_PUPIL)

    # Glint
    draw.point((ex_l + 5, ey + 3), fill=EYE_GLINT)
    draw.point((ex_r + 5, ey + 3), fill=EYE_GLINT)

    # Blink (eyelids drop)
    if blink_t > 0.0:
        lid_h = int(blink_t * 14)
        for ex in [ex_l, ex_r]:
            draw.ellipse([(ex - 1, ey - 1), (ex + 16, ey - 1 + lid_h)], fill=BODY_MID)


def draw_face(draw):
    """Nose and big happy open grin."""
    # Nose — small blue dot
    draw.ellipse([(26, 25), (38, 32)], fill=BODY_OUTLINE)
    draw.ellipse([(27, 25), (37, 31)], fill=NOSE)
    draw.ellipse([(27, 26), (30, 30)], fill=BODY_OUTLINE)   # nostril L
    draw.ellipse([(34, 26), (37, 30)], fill=BODY_OUTLINE)   # nostril R

    # Wide open grin — arc + open mouth
    draw.arc([(18, 26), (46, 42)], start=20, end=160, fill=BODY_OUTLINE, width=3)
    # Open mouth fill (dark inside)
    draw.pieslice([(19, 27), (45, 43)], start=20, end=160, fill=MOUTH_OPEN)
    # Teeth — top row of two buck teeth visible
    draw.rectangle([(26, 28), (29, 33)], fill=TEETH)
    draw.rectangle([(32, 28), (35, 33)], fill=TEETH)
    draw.line([(30, 28), (30, 33)], fill=MOUTH_OPEN, width=1)
    # Grin redraw over teeth top (clean line)
    draw.line([(19, 31), (45, 31)], fill=BODY_OUTLINE, width=1)

    # Cheek blush marks (pair of small dots each side)
    for px in [8, 11]:
        draw.point((px, 30), fill=(180, 140, 220, 180))
    for px in [53, 56]:
        draw.point((px, 30), fill=(180, 140, 220, 180))


def draw_ts_badge(draw):
    """Small TypeScript badge on the belly. Blue square, 'TS' text."""
    # Badge background
    draw.rectangle([(20, 42), (30, 50)], fill=TS_BG)
    draw.rectangle([(19, 41), (31, 51)], outline=BODY_OUTLINE)
    # 'T' — vertical bar + horizontal top
    draw.line([(21, 43), (29, 43)], fill=TS_TEXT, width=1)   # top bar
    draw.line([(25, 43), (25, 49)], fill=TS_TEXT, width=1)   # stem
    # 'S' — simplified as two horizontal bars + connectors (pixel art)
    draw.line([(31, 43), (37, 43)], fill=TS_TEXT, width=1)   # top
    draw.line([(31, 46), (37, 46)], fill=TS_TEXT, width=1)   # mid
    draw.line([(31, 49), (37, 49)], fill=TS_TEXT, width=1)   # bot
    draw.point((31, 44), fill=TS_TEXT)
    draw.point((31, 45), fill=TS_TEXT)
    draw.point((37, 47), fill=TS_TEXT)
    draw.point((37, 48), fill=TS_TEXT)


def draw_raised_fist(draw, fist_y_offset=0):
    """Raised right fist — small blocky fist above body right side."""
    fx = 48
    fy = 28 + fist_y_offset

    # Arm stub going up
    draw.rectangle([(fx + 2, fy + 8), (fx + 9, fy + 16)], fill=BODY_MID)

    # Fist block
    draw.rectangle([(fx, fy), (fx + 12, fy + 10)], fill=FIST_OUTLINE)
    draw.rectangle([(fx + 1, fy + 1), (fx + 11, fy + 9)], fill=FIST)
    # Finger creases (horizontal lines)
    draw.line([(fx + 1, fy + 4), (fx + 11, fy + 4)], fill=FIST_OUTLINE, width=1)
    draw.line([(fx + 1, fy + 7), (fx + 11, fy + 7)], fill=FIST_OUTLINE, width=1)
    # Thumb nub on side
    draw.rectangle([(fx + 9, fy + 5), (fx + 14, fy + 9)], fill=FIST_OUTLINE)
    draw.rectangle([(fx + 10, fy + 6), (fx + 13, fy + 9)], fill=FIST)


def draw_confetti(draw, frame_idx):
    """Rain confetti from the top. Pieces shift down each frame."""
    # Deterministic but varied — seeded per confetti piece
    pieces = [
        # (x_base, y_speed, color_idx, shape)  shape: 0=dot, 1=rect_h, 2=rect_v
        (5,  2, 0, 0),
        (10, 3, 1, 1),
        (16, 2, 2, 2),
        (22, 4, 3, 0),
        (28, 2, 4, 1),
        (34, 3, 0, 2),
        (40, 4, 5, 0),
        (46, 2, 1, 1),
        (52, 3, 2, 2),
        (58, 4, 3, 0),
        (8,  3, 4, 2),
        (18, 4, 5, 1),
        (30, 2, 0, 0),
        (42, 3, 2, 1),
        (55, 2, 4, 2),
        (3,  4, 1, 0),
        (25, 3, 3, 1),
        (48, 4, 5, 2),
        (13, 2, 0, 1),
        (37, 3, 4, 0),
    ]

    for i, (x_base, y_speed, color_idx, shape) in enumerate(pieces):
        # Stagger start so they don't all begin at top simultaneously
        offset = (i * 7) % 64
        y = (frame_idx * y_speed + offset) % 68 - 4   # -4 so some start above
        color = CONFETTI_COLORS[color_idx]

        if shape == 0:
            draw.point((x_base, y), fill=color)
        elif shape == 1:
            draw.rectangle([(x_base, y), (x_base + 2, y + 1)], fill=color)
        else:
            draw.rectangle([(x_base, y), (x_base + 1, y + 2)], fill=color)


def make_frame(frame_idx, fist_y_offset=0, blink_t=0.0):
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_confetti(draw, frame_idx)
    draw_body(draw)
    draw_head(draw)
    draw_eyes(draw, blink_t)
    draw_face(draw)
    draw_ts_badge(draw)
    draw_raised_fist(draw, fist_y_offset)
    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    def add(frame_idx, fist_y, blink_t, dur):
        frames.append(make_frame(frame_idx, fist_y, blink_t))
        durations.append(dur)

    # Loop: confetti falls, fist pumps, occasional blink
    # 20 frames total for smooth confetti, ~2s loop
    total = 20

    for i in range(total):
        # Fist pump: bobs up and down over 10 frames
        fist_phase = (i % 10) / 10.0
        fist_y = int(-3 * math.sin(fist_phase * 2 * math.pi))

        # Blink on frame 15 briefly
        if i == 15:
            blink = 0.7
        elif i == 16:
            blink = 0.3
        else:
            blink = 0.0

        add(i * 2, fist_y, blink, 80)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/bigclungus_celebration.gif"
    frames, durations = build_frames()

    palettes = [f.quantize(colors=128, method=Image.Quantize.FASTOCTREE) for f in frames]

    # Force palette variation so GIF loop doesn't collapse to static
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
