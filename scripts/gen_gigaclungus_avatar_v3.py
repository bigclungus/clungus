#!/usr/bin/env python3
"""
GigaClungus — Avatar Variant 3
"The Void Stare"

Same grotesquely rotund BigChungus silhouette, but he has ascended beyond
contempt into something colder. Palette is midnight blue-black. His eyes
don't have irises — they glow red, solid, unblinking. The background is
deep space with a handful of cold pixel stars.

He does not chew. He does not squint. He simply exists, taking up mass,
and the red glow in his eyes pulses slowly like a reactor warming up.
Then: one single slow blink. Returns to the stare. The stars don't move.

Palette: near-void navy bg, deep charcoal-blue body, cold cream face,
red-glow eyes with no iris, dark plum nose, pale teeth, no carrot —
he doesn't need one.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# --- Palette ---
BG           = (5, 8, 18, 255)        # near-void midnight navy
STAR         = (200, 210, 230, 255)   # cold star pixel
BODY_OUTLINE = (8, 10, 20, 255)       # deep near-black blue outline
BODY_SHADOW  = (25, 30, 55, 255)      # cold shadow
BODY_MID     = (50, 58, 95, 255)      # blue-grey body
BODY_LIGHT   = (75, 85, 125, 255)     # lighter highlight
BODY_CREAM   = (175, 168, 155, 255)   # cold grey-cream face/belly
JOWL_SHADE   = (35, 40, 70, 255)      # jowl underside cold shadow
EYE_SOCKET   = (10, 5, 5, 255)        # dark socket
EYE_GLOW_HOT = (255, 40, 40, 255)     # red eye glow — peak
EYE_GLOW_MID = (200, 20, 20, 255)     # red eye glow — mid pulse
EYE_GLOW_DIM = (140, 10, 10, 255)     # red eye glow — dim pulse
EYE_LID      = (40, 45, 80, 255)      # cold dark eyelid
NOSE         = (100, 80, 95, 255)     # dark muted plum nose
MOUTH        = (20, 18, 30, 255)      # near-void mouth
TEETH        = (195, 192, 180, 255)   # cold pale teeth
TOOTH_GAP    = (15, 12, 20, 255)      # tooth gap void
EAR_INNER    = (70, 55, 70, 255)      # cold dark inner ear


STAR_POSITIONS = [
    (3, 5), (58, 3), (60, 55), (2, 52),
    (30, 2), (55, 28), (8, 30),
]


def draw_bg(draw):
    for sx, sy in STAR_POSITIONS:
        draw.point((sx, sy), fill=STAR)
    # faint second star pixel for some
    draw.point((4, 5), fill=(120, 130, 155, 255))
    draw.point((59, 3), fill=(120, 130, 155, 255))


def draw_body(draw):
    # Outer shadow
    draw.ellipse([(0, 28), (64, 68)], fill=BODY_OUTLINE)
    # Main body
    draw.ellipse([(1, 30), (63, 66)], fill=BODY_MID)
    # Cold shadow flanks
    draw.ellipse([(0, 35), (18, 60)], fill=BODY_SHADOW)
    draw.ellipse([(46, 35), (64, 60)], fill=BODY_SHADOW)
    # Belly
    draw.ellipse([(12, 34), (52, 64)], fill=BODY_CREAM)
    # Belly lower shadow
    draw.ellipse([(12, 52), (52, 68)], fill=BODY_SHADOW)
    draw.ellipse([(14, 50), (50, 64)], fill=BODY_CREAM)
    # Arms
    draw.ellipse([(0, 38), (13, 52)], fill=BODY_SHADOW)
    draw.ellipse([(1, 39), (11, 51)], fill=BODY_MID)
    draw.ellipse([(51, 38), (64, 52)], fill=BODY_SHADOW)
    draw.ellipse([(53, 39), (63, 51)], fill=BODY_MID)
    # Base weight shadow
    draw.ellipse([(6, 58), (58, 70)], fill=BODY_OUTLINE)


def draw_head(draw, eye_glow, blink_frac):
    """
    eye_glow: color tuple for the eye glow
    blink_frac: 0.0 = open, 1.0 = fully closed
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

    # Ears — dark, cold
    draw.ellipse([(8, 0), (22, 16)], fill=BODY_OUTLINE)
    draw.ellipse([(9, 0), (21, 15)], fill=BODY_MID)
    draw.ellipse([(10, 1), (20, 13)], fill=EAR_INNER)
    draw.ellipse([(42, 0), (56, 16)], fill=BODY_OUTLINE)
    draw.ellipse([(43, 0), (55, 15)], fill=BODY_MID)
    draw.ellipse([(44, 1), (54, 13)], fill=EAR_INNER)

    # Eye sockets
    ey = 15
    draw.ellipse([(12, ey), (28, ey + 13)], fill=EYE_SOCKET)
    draw.ellipse([(36, ey), (52, ey + 13)], fill=EYE_SOCKET)

    if blink_frac < 0.95:
        # Eyes open: solid red glow, no iris
        draw.ellipse([(13, ey + 1), (27, ey + 12)], fill=eye_glow)
        draw.ellipse([(37, ey + 1), (51, ey + 12)], fill=eye_glow)
        # Glow fringe (slightly larger, dimmer)
        glow_fringe = (eye_glow[0] // 3, eye_glow[1] // 3, eye_glow[2] // 3, 255)
        draw.ellipse([(11, ey - 1), (29, ey + 14)], fill=glow_fringe)
        draw.ellipse([(35, ey - 1), (53, ey + 14)], fill=glow_fringe)
        # Re-draw solid center on top
        draw.ellipse([(13, ey + 1), (27, ey + 12)], fill=eye_glow)
        draw.ellipse([(37, ey + 1), (51, ey + 12)], fill=eye_glow)
        # Single bright pixel center
        draw.point((20, ey + 6), fill=(255, 180, 180, 255))
        draw.point((44, ey + 6), fill=(255, 180, 180, 255))

    # Eyelid — comes down over eye
    lid_drop = int(blink_frac * 14)
    if lid_drop > 0:
        draw.ellipse([(12, ey), (28, ey + lid_drop + 2)], fill=EYE_LID)
        draw.ellipse([(36, ey), (52, ey + lid_drop + 2)], fill=EYE_LID)

    # Nose
    draw.ellipse([(26, 26), (38, 33)], fill=BODY_OUTLINE)
    draw.ellipse([(27, 26), (37, 32)], fill=NOSE)
    draw.ellipse([(27, 27), (30, 31)], fill=BODY_OUTLINE)
    draw.ellipse([(34, 27), (37, 31)], fill=BODY_OUTLINE)

    # Mouth — flat, expressionless line
    draw.line([(26, 34), (38, 34)], fill=MOUTH, width=2)
    # Buck teeth barely visible (no grin, no expression)
    draw.rectangle([(29, 35), (31, 38)], fill=TEETH)
    draw.rectangle([(33, 35), (35, 38)], fill=TEETH)
    draw.line([(32, 35), (32, 38)], fill=TOOTH_GAP, width=1)


def make_frame(eye_glow, blink_frac):
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_bg(draw)
    draw_body(draw)
    draw_head(draw, eye_glow, blink_frac)
    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    def add(glow, blink, dur):
        frames.append(make_frame(glow, blink))
        durations.append(dur)

    # Stare — eyes at mid glow
    for _ in range(5):
        add(EYE_GLOW_MID, 0.0, 140)

    # Pulse up to hot
    add(EYE_GLOW_MID, 0.0, 100)
    add(EYE_GLOW_HOT, 0.0, 90)
    add(EYE_GLOW_HOT, 0.0, 120)
    add(EYE_GLOW_HOT, 0.0, 140)
    add(EYE_GLOW_MID, 0.0, 90)
    add(EYE_GLOW_DIM, 0.0, 90)
    add(EYE_GLOW_MID, 0.0, 100)

    # Hold stare
    for _ in range(4):
        add(EYE_GLOW_MID, 0.0, 140)

    # Second pulse — faster, more aggressive
    add(EYE_GLOW_HOT, 0.0, 60)
    add(EYE_GLOW_DIM, 0.0, 50)
    add(EYE_GLOW_HOT, 0.0, 60)
    add(EYE_GLOW_DIM, 0.0, 50)
    add(EYE_GLOW_HOT, 0.0, 60)
    add(EYE_GLOW_MID, 0.0, 120)

    # Hold
    for _ in range(3):
        add(EYE_GLOW_MID, 0.0, 140)

    # The Blink — slow, deliberate, terrifying
    add(EYE_GLOW_MID, 0.0, 100)
    add(EYE_GLOW_MID, 0.25, 80)
    add(EYE_GLOW_MID, 0.5, 80)
    add(EYE_GLOW_MID, 0.75, 80)
    add(EYE_GLOW_DIM, 1.0, 150)   # fully closed — dims
    add(EYE_GLOW_MID, 0.75, 80)
    add(EYE_GLOW_MID, 0.5, 80)
    add(EYE_GLOW_MID, 0.25, 80)
    add(EYE_GLOW_MID, 0.0, 100)   # open again — nothing changed

    # Final hold
    for _ in range(5):
        add(EYE_GLOW_MID, 0.0, 140)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/gigaclungus_v3.gif"
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
