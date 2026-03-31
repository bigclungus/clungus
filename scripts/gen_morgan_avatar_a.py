#!/usr/bin/env python3
"""
Morgan (they/them) — Avatar Option A
64x64 animated GIF, pure Pillow.

Visual concept: "Hold Space Mode"
Morgan sits cross-legged in a meditation circle, eyes closed,
hands in lap, permanently tired expression. Floating Reddit
upvote/downvote arrows orbit them in a slow ring, pulsing
like notifications that never stop arriving. Soft sage/lavender
palette — the aesthetic of someone who has a diffuser and a
declining will to engage. The loop never resolves. Neither does Morgan.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# --- Palette ---
BG           = (22, 20, 30, 255)      # dark room, soft
FLOOR_CIRCLE = (38, 45, 42, 255)      # meditation circle mat, sage-dark
FLOOR_INNER  = (44, 52, 48, 255)      # inner circle lighter
BODY         = (88, 100, 95, 255)     # sage-green hoodie
BODY_SHADOW  = (62, 72, 68, 255)      # hoodie shadow
BODY_POCKET  = (70, 82, 76, 255)      # hoodie pocket line
SKIN         = (195, 170, 155, 255)   # hands/face
SKIN_SHADOW  = (165, 140, 128, 255)   # face shadow side
HAIR         = (55, 45, 50, 255)      # dark muted brown, messy bun ish
HAIR_ACC     = (75, 60, 65, 255)      # hair highlight
EYELID       = (175, 150, 138, 255)   # closed eyes
MOUTH        = (160, 128, 118, 255)   # barely-open passive mouth
LEGS         = (70, 80, 110, 255)     # muted blue-grey sweatpants
LEGS_SHADOW  = (50, 58, 82, 255)      # legs shadow
# Upvote orange, downvote blue, text grey
UP_COL       = (200, 100, 40, 255)    # reddit upvote orange
DOWN_COL     = (80, 110, 180, 255)    # reddit downvote blue
ARROW_GLOW   = (200, 100, 40, 120)    # upvote glow semi
TEXT_COL     = (130, 140, 130, 255)   # ambient text color (muted)
AURA         = (90, 110, 95, 40)      # subtle green aura ring


def draw_upvote_arrow(draw, cx, cy, size, color, flipped=False):
    """Draw a simple triangle arrow (upvote or downvote)."""
    if not flipped:
        pts = [
            (cx, cy - size),
            (cx - size, cy + size // 2),
            (cx + size, cy + size // 2),
        ]
    else:
        pts = [
            (cx, cy + size),
            (cx - size, cy - size // 2),
            (cx + size, cy - size // 2),
        ]
    draw.polygon(pts, fill=color)


def make_frame(t):
    """
    t: 0.0 .. 1.0, full animation cycle
    Arrows orbit; body breathes very slightly (±1px scale suggestion).
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # --- Meditation circle / mat ---
    draw.ellipse([(8, 38), (56, 58)], fill=FLOOR_CIRCLE)
    draw.ellipse([(14, 41), (50, 55)], fill=FLOOR_INNER)

    # --- Legs (cross-legged, two lobes at bottom) ---
    # Left leg lobe
    draw.ellipse([(14, 42), (32, 56)], fill=LEGS)
    draw.ellipse([(15, 43), (30, 54)], fill=LEGS_SHADOW)
    # Right leg lobe
    draw.ellipse([(32, 42), (50, 56)], fill=LEGS)
    draw.ellipse([(33, 43), (49, 54)], fill=LEGS_SHADOW)
    # Overlap center (lap area)
    draw.ellipse([(26, 44), (38, 54)], fill=LEGS)

    # --- Body/hoodie torso ---
    # Breathing: tiny vertical shift ±0.5
    breath = math.sin(t * 2 * math.pi) * 0.8
    by = int(26 + breath)

    body_pts = [
        (22, by + 14),   # bottom left
        (18, by + 4),    # left shoulder
        (24, by - 2),    # left neck
        (40, by - 2),    # right neck
        (46, by + 4),    # right shoulder
        (42, by + 14),   # bottom right
    ]
    draw.polygon(body_pts, fill=BODY)
    # Hoodie shadow (right side)
    shadow_pts = [
        (34, by - 2),
        (40, by - 2),
        (46, by + 4),
        (42, by + 14),
        (34, by + 14),
    ]
    draw.polygon(shadow_pts, fill=BODY_SHADOW)
    # Pocket line (horizontal)
    draw.line([(25, by + 10), (39, by + 10)], fill=BODY_POCKET, width=1)

    # --- Hands in lap ---
    draw.ellipse([(24, by + 12), (30, by + 17)], fill=SKIN)
    draw.ellipse([(34, by + 12), (40, by + 17)], fill=SKIN)

    # --- Head ---
    hx, hy = 32, int(by - 8)
    draw.ellipse([(hx - 7, hy - 8), (hx + 7, hy + 6)], fill=SKIN)
    # shadow side (right)
    draw.ellipse([(hx + 1, hy - 7), (hx + 7, hy + 5)], fill=SKIN_SHADOW)

    # --- Hair (messy low bun situation) ---
    draw.ellipse([(hx - 7, hy - 8), (hx + 7, hy - 2)], fill=HAIR)
    draw.ellipse([(hx - 6, hy - 9), (hx + 6, hy - 4)], fill=HAIR)
    # bun nub top-right
    draw.ellipse([(hx + 3, hy - 10), (hx + 8, hy - 5)], fill=HAIR)
    draw.ellipse([(hx + 4, hy - 9), (hx + 7, hy - 6)], fill=HAIR_ACC)

    # --- Face: closed eyes (tired eyelids) ---
    # Left eye closed line
    draw.arc([(hx - 6, hy - 4), (hx - 1, hy - 1)], start=180, end=0, fill=EYELID, width=1)
    draw.line([(hx - 6, hy - 2), (hx - 1, hy - 2)], fill=(100, 80, 75, 255), width=1)
    # Right eye closed line
    draw.arc([(hx + 1, hy - 4), (hx + 6, hy - 1)], start=180, end=0, fill=EYELID, width=1)
    draw.line([(hx + 1, hy - 2), (hx + 6, hy - 2)], fill=(100, 80, 75, 255), width=1)

    # --- Mouth (barely open, neutral) ---
    draw.arc([(hx - 3, hy + 1), (hx + 3, hy + 4)], start=0, end=180, fill=MOUTH, width=1)

    # --- Orbiting arrows ---
    # 4 upvotes + 2 downvotes orbiting at different radii/phases
    orbit_r = 20
    arrow_defs = [
        # (phase_offset, is_downvote, size, radius)
        (0.0,   False, 3, 20),
        (0.25,  False, 2, 18),
        (0.5,   False, 3, 20),
        (0.75,  False, 2, 19),
        (0.12,  True,  2, 22),
        (0.62,  True,  2, 21),
    ]
    for phase, is_down, asize, radius in arrow_defs:
        angle = (t + phase) * 2 * math.pi
        ax = int(32 + radius * math.cos(angle))
        ay = int(36 + radius * math.sin(angle) * 0.45)  # flatten orbit (isometric feel)
        color = DOWN_COL if is_down else UP_COL
        # Pulse opacity: brighter when closer to "front" (bottom of orbit)
        brightness = 0.5 + 0.5 * math.sin(angle + math.pi / 2)
        r = int(color[0] * brightness)
        g = int(color[1] * brightness)
        b = int(color[2] * brightness)
        draw_upvote_arrow(draw, ax, ay, asize, (r, g, b, 220), flipped=is_down)

    # --- Subtle aura ring (behind arrows, drawn early — redo with layer) ---
    # We'll just draw a faint ring on the floor
    aura_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    adraw = ImageDraw.Draw(aura_layer)
    aura_alpha = int(30 + 20 * math.sin(t * 2 * math.pi))
    adraw.ellipse([(10, 30), (54, 54)], outline=(*AURA[:3], aura_alpha), width=2)
    img = Image.alpha_composite(img, aura_layer)

    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    n_frames = 20
    for i in range(n_frames):
        t = i / n_frames
        frames.append(make_frame(t))
        # Slow orbit — ~2.5 seconds per loop
        durations.append(125)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/morgan_a.gif"
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
