#!/usr/bin/env python3
"""
Priya the Pitiless — Avatar Option A
Isometric 64x64 animated GIF, pure Pillow.

Visual concept: A stern judge at an isometric desk, red pen raised mid-strike.
She sits behind a dark stone slab desk, marked up papers in front of her,
one arm raised with a glowing red annotation stylus. Her expression is a flat,
unreadable line — no warmth. Colors: deep charcoal base, crimson accents,
pale cool skin. Animation: red pen sweeps down and marks an X, then resets.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# --- Palette ---
BG          = (18, 16, 22, 255)        # near-black background
FLOOR       = (38, 34, 50, 255)        # dark isometric floor
DESK_TOP    = (55, 48, 70, 255)        # desk top face
DESK_SIDE_L = (35, 30, 45, 255)        # desk left side
DESK_SIDE_R = (28, 24, 38, 255)        # desk right side
PAPER       = (210, 205, 220, 255)     # paper on desk
PAPER_MARK  = (180, 40, 40, 255)       # red X mark on paper
BODY        = (72, 60, 90, 255)        # dark robe/jacket body
BODY_SHADOW = (50, 42, 62, 255)        # body shadow side
HEAD        = (210, 185, 170, 255)     # skin tone
HAIR        = (28, 22, 28, 255)        # near-black hair
EYE         = (220, 60, 60, 255)       # sharp red eyes
PEN_BODY    = (200, 200, 210, 255)     # pen barrel
PEN_TIP     = (220, 40, 40, 255)       # pen tip / nib (red)
PEN_GLOW    = (255, 80, 80, 180)       # pen glow (semi)
MOUTH_LINE  = (160, 120, 110, 255)     # flat line mouth

def draw_iso_box(draw, cx, cy, w, h_top, depth, col_top, col_left, col_right):
    """Draw an isometric box centered at (cx, cy) on the top face."""
    # Top face (rhombus)
    top = [
        (cx,        cy),
        (cx + w//2, cy + w//4),
        (cx,        cy + w//2),
        (cx - w//2, cy + w//4),
    ]
    draw.polygon(top, fill=col_top)
    # Left face
    left = [
        (cx - w//2, cy + w//4),
        (cx,        cy + w//2),
        (cx,        cy + w//2 + depth),
        (cx - w//2, cy + w//4 + depth),
    ]
    draw.polygon(left, fill=col_left)
    # Right face
    right = [
        (cx,        cy + w//2),
        (cx + w//2, cy + w//4),
        (cx + w//2, cy + w//4 + depth),
        (cx,        cy + w//2 + depth),
    ]
    draw.polygon(right, fill=col_right)

def make_frame(pen_angle_deg, mark_alpha):
    """
    pen_angle_deg: 0 = pen raised (up-right), 1.0 = pen down (striking paper)
    mark_alpha: 0..255 opacity of the red X mark appearing on paper
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # --- Floor tiles (isometric grid suggestion) ---
    for gx in range(-2, 4):
        for gy in range(-1, 4):
            px = 32 + (gx - gy) * 10
            py = 22 + (gx + gy) * 5
            tile = [
                (px,      py),
                (px + 10, py + 5),
                (px,      py + 10),
                (px - 10, py + 5),
            ]
            shade = 30 + (gx + gy) % 3 * 4
            draw.polygon(tile, fill=(shade + 8, shade + 4, shade + 14, 255))

    # --- Desk ---
    draw_iso_box(draw, cx=34, cy=26, w=28, h_top=0, depth=8,
                 col_top=DESK_TOP, col_left=DESK_SIDE_L, col_right=DESK_SIDE_R)

    # --- Paper on desk top ---
    paper_poly = [
        (32, 26), (40, 30), (36, 34), (28, 30)
    ]
    draw.polygon(paper_poly, fill=PAPER)

    # Red X on paper — fades in as pen strikes
    if mark_alpha > 0:
        mark_col = (*PAPER_MARK[:3], mark_alpha)
        # Two strokes of X
        draw.line([(29, 27), (35, 33)], fill=mark_col, width=2)
        draw.line([(35, 27), (29, 33)], fill=mark_col, width=2)

    # --- Body (torso, isometric slab) ---
    # Centered slightly left of desk, sitting behind it
    body_top = [
        (28, 20), (34, 23), (32, 28), (26, 25)
    ]
    draw.polygon(body_top, fill=BODY)
    body_side = [
        (26, 25), (32, 28), (32, 35), (26, 32)
    ]
    draw.polygon(body_side, fill=BODY_SHADOW)

    # --- Head ---
    # Small isometric head above body
    draw.ellipse([(26, 10), (34, 19)], fill=HEAD)

    # --- Hair (flat top / severe bun) ---
    draw.ellipse([(26, 10), (34, 15)], fill=HAIR)
    draw.rectangle([(27, 10), (33, 13)], fill=HAIR)

    # --- Eyes (sharp red slits) ---
    draw.line([(27, 15), (29, 15)], fill=EYE, width=1)
    draw.line([(31, 15), (33, 15)], fill=EYE, width=1)

    # --- Mouth (flat line) ---
    draw.line([(28, 17), (32, 17)], fill=MOUTH_LINE, width=1)

    # --- Raised arm + pen ---
    # Arm root at shoulder ~(33, 22), pen tip travels in arc
    arm_root = (33, 23)
    # angle=0 → pen raised upper right, angle=90 → pen tip down at desk
    angle_rad = math.radians(pen_angle_deg)
    # Arc: tip goes from (43, 14) raised → (37, 27) striking
    tip_x = int(arm_root[0] + 10 * math.cos(math.radians(-50 + pen_angle_deg * 0.8)))
    tip_y = int(arm_root[1] - 10 * math.sin(math.radians(40 - pen_angle_deg * 0.7)))

    # Forearm line
    draw.line([arm_root, (tip_x, tip_y)], fill=BODY, width=3)

    # Pen body (slightly offset from tip toward root)
    dx = tip_x - arm_root[0]
    dy = tip_y - arm_root[1]
    length = math.sqrt(dx*dx + dy*dy) or 1
    nx, ny = dx/length, dy/length
    pen_base = (int(tip_x - nx*7), int(tip_y - ny*7))
    draw.line([pen_base, (tip_x, tip_y)], fill=PEN_BODY, width=2)

    # Pen tip glow (red)
    draw.ellipse([(tip_x-2, tip_y-2), (tip_x+2, tip_y+2)], fill=PEN_TIP)

    # Subtle glow halo when pen is striking (mark_alpha > 128)
    if mark_alpha > 128:
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        gdraw = ImageDraw.Draw(glow)
        gdraw.ellipse([(tip_x-5, tip_y-5), (tip_x+5, tip_y+5)],
                      fill=(*PEN_GLOW[:3], int(PEN_GLOW[3] * mark_alpha / 255)))
        img = Image.alpha_composite(img, glow)

    return img.convert("RGBA")


def make_frame_with_tick(pen_angle_deg, mark_alpha, tick=0):
    """Returns RGBA frame (tick applied post-quantize to force uniqueness)."""
    return make_frame(pen_angle_deg, mark_alpha)


def build_frames():
    frames = []
    durations = []
    tick = 0

    def add(pen_angle_deg, mark_alpha, dur):
        nonlocal tick
        frames.append(make_frame_with_tick(pen_angle_deg, mark_alpha, tick))
        durations.append(dur)
        tick += 1

    # Phase 1: pen raised, static (hold) — 3 frames
    add(0, 0, 120)
    add(0, 0, 120)
    add(0, 0, 120)

    # Phase 2: pen sweeps down — 4 frames
    for i in range(4):
        t = (i + 1) / 4
        add(t * 80, int(t * 255), 60)

    # Phase 3: pen at bottom, mark fully visible — 2 frames (hold)
    add(80, 255, 160)
    add(80, 255, 160)

    # Phase 4: pen lifts back up — 4 frames
    for i in range(4):
        t = (i + 1) / 4
        add(80 * (1 - t), int(255 * (1 - t * 0.5)), 70)

    # Phase 5: reset, mark fades — 2 frames
    for i in range(2):
        t = (i + 1) / 2
        add(0, int(255 * 0.5 * (1 - t)), 100)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/critic_a.gif"
    frames, durations = build_frames()

    # Quantize each frame to P mode
    palettes = [f.quantize(colors=128, method=Image.Quantize.FASTOCTREE) for f in frames]

    # Force each frame to be unique by writing a distinct palette index at pixel (63,63).
    # This prevents Pillow's GIF encoder from collapsing identical frames.
    # We use two alternating palette indices that both map to near-black so it's invisible.
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
    print(f"Saved {len(frames)} frames → {out_path}")
