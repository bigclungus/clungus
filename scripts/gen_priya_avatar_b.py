#!/usr/bin/env python3
"""
Priya the Pitiless — Avatar Option B
Isometric 64x64 animated GIF, pure Pillow.

Visual concept: A standing gatekeeper at an isometric threshold — stone arch,
arms crossed, unmoved. No desk. She blocks the frame like a bouncer at the
gate of good ideas. Colors: cold slate/steel, deep violet shadow, ice-white
highlights. Animation: a slow, rhythmic single eyebrow raise + a subtle
"rejected" stamp flash in front of her — cycling like a heartbeat.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# --- Palette ---
BG           = (14, 14, 20, 255)
FLOOR_A      = (30, 28, 38, 255)
FLOOR_B      = (24, 22, 32, 255)
ARCH_STONE   = (58, 54, 72, 255)
ARCH_SHADOW  = (38, 35, 50, 255)
ARCH_LIGHT   = (80, 76, 95, 255)
BODY_MAIN    = (55, 50, 75, 255)
BODY_DARK    = (38, 34, 54, 255)
BODY_TRIM    = (90, 80, 110, 255)       # collar / cuffs
HEAD_SKIN    = (205, 178, 162, 255)
HAIR_COL     = (24, 18, 24, 255)
EYE_COL      = (200, 50, 50, 255)       # red
BROW_COL     = (18, 14, 18, 255)
MOUTH_COL    = (140, 105, 95, 255)
ARM_CROSS    = (48, 43, 65, 255)        # crossed arms
STAMP_RED    = (210, 35, 35, 255)
STAMP_BG     = (255, 240, 240, 220)     # near-white stamp bg

def draw_floor(draw):
    for gx in range(-3, 5):
        for gy in range(0, 5):
            px = 32 + (gx - gy) * 9
            py = 42 + (gx + gy) * 4
            if py > H + 5:
                continue
            tile = [
                (px,     py),
                (px + 9, py + 4),
                (px,     py + 8),
                (px - 9, py + 4),
            ]
            col = FLOOR_A if (gx + gy) % 2 == 0 else FLOOR_B
            draw.polygon(tile, fill=col)

def draw_arch(draw):
    # Left pillar (isometric box)
    # Left pillar
    lp_top = [(10, 18), (18, 22), (18, 50), (10, 46)]
    draw.polygon(lp_top, fill=ARCH_STONE)
    lp_front = [(10, 18), (18, 22), (18, 50), (10, 46)]
    lp_side = [(6, 20), (10, 18), (10, 46), (6, 44)]
    draw.polygon(lp_side, fill=ARCH_SHADOW)
    # Right pillar
    rp_top = [(46, 18), (54, 22), (54, 50), (46, 46)]
    draw.polygon(rp_top, fill=ARCH_STONE)
    rp_light = [(54, 22), (58, 20), (58, 48), (54, 50)]
    draw.polygon(rp_light, fill=ARCH_LIGHT)
    # Arch lintel (top bar)
    lintel = [(10, 18), (54, 18), (54, 22), (10, 22)]
    draw.polygon(lintel, fill=ARCH_STONE)
    lintel_top = [(10, 16), (54, 16), (54, 18), (10, 18)]
    draw.polygon(lintel_top, fill=ARCH_LIGHT)

def draw_body(draw):
    # Torso — isometric slab, centered
    torso = [(26, 32), (38, 32), (38, 52), (26, 52)]
    draw.polygon(torso, fill=BODY_MAIN)
    # Shadow side
    side = [(24, 34), (26, 32), (26, 52), (24, 50)]
    draw.polygon(side, fill=BODY_DARK)
    # Collar highlight
    draw.line([(28, 32), (36, 32)], fill=BODY_TRIM, width=2)
    # Cuffs (crossed arms suggestion)
    cross_l = [(22, 40), (32, 40), (32, 44), (22, 44)]
    cross_r = [(30, 40), (40, 40), (40, 44), (30, 44)]
    draw.polygon(cross_l, fill=ARM_CROSS)
    draw.polygon(cross_r, fill=ARM_CROSS)
    # Arms folded horizontal band
    draw.rectangle([(22, 40), (42, 44)], fill=ARM_CROSS)
    draw.line([(22, 40), (42, 40)], fill=BODY_TRIM, width=1)

def draw_head(draw, brow_lift_left=0, brow_lift_right=0):
    # Head ellipse
    draw.ellipse([(26, 16), (38, 28)], fill=HEAD_SKIN)
    # Hair top
    draw.ellipse([(26, 16), (38, 22)], fill=HAIR_COL)
    draw.rectangle([(27, 16), (37, 20)], fill=HAIR_COL)
    # Tight bun detail
    draw.ellipse([(34, 14), (39, 19)], fill=HAIR_COL)

    # Eyebrows — flat/severe, with optional left lift
    by = 22
    # Left brow (screen-left = her right — the one that raises)
    draw.line([(27, by - brow_lift_left), (30, by - brow_lift_left)],
              fill=BROW_COL, width=1)
    # Right brow stays flat
    draw.line([(32, by - brow_lift_right), (35, by - brow_lift_right)],
              fill=BROW_COL, width=1)

    # Eyes — sharp horizontal slits
    draw.line([(27, 23), (30, 23)], fill=EYE_COL, width=1)
    draw.line([(32, 23), (35, 23)], fill=EYE_COL, width=1)

    # Mouth — thin flat line, slight downward tilt on one side
    draw.line([(28, 26), (32, 27)], fill=MOUTH_COL, width=1)

def draw_stamp(draw, alpha, scale=1.0):
    """Draw a floating 'REJECTED' hexagon stamp in front of her."""
    if alpha <= 0:
        return
    cx, cy = 32, 36
    r = int(8 * scale)
    # Stamp background
    pts = [(int(cx + r * math.cos(math.radians(a))),
            int(cy + r * math.sin(math.radians(a)))) for a in range(0, 360, 60)]
    stamp_fill = (*STAMP_BG[:3], min(255, alpha))
    stamp_outline = (*STAMP_RED[:3], min(255, alpha))
    draw.polygon(pts, fill=stamp_fill, outline=stamp_outline)
    # X mark inside
    line_col = (*STAMP_RED[:3], min(255, alpha))
    draw.line([(cx - r//2, cy - r//2), (cx + r//2, cy + r//2)], fill=line_col, width=2)
    draw.line([(cx + r//2, cy - r//2), (cx - r//2, cy + r//2)], fill=line_col, width=2)

def make_frame(brow_lift=0, stamp_alpha=0, stamp_scale=1.0):
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    draw_floor(draw)
    draw_arch(draw)
    draw_body(draw)
    draw_head(draw, brow_lift_left=brow_lift, brow_lift_right=0)

    # Stamp drawn on a separate layer for alpha compositing
    if stamp_alpha > 0:
        stamp_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(stamp_layer)
        draw_stamp(sdraw, stamp_alpha, stamp_scale)
        img = Image.alpha_composite(img, stamp_layer)

    return img


def make_frame_with_tick(brow_lift, stamp_alpha, stamp_scale, tick):
    """Wrapper that embeds a 1-pixel tick so Pillow won't collapse identical frames."""
    img = make_frame(brow_lift, stamp_alpha, stamp_scale)
    draw = ImageDraw.Draw(img)
    v = (tick * 3) % 8
    draw.point((63, 63), fill=(BG[0] + v, BG[1], BG[2], 255))
    return img


def build_frames():
    frames = []
    durations = []
    tick = 0

    def add(brow_lift, stamp_alpha, dur, stamp_scale=1.0):
        nonlocal tick
        frames.append(make_frame_with_tick(brow_lift, stamp_alpha, stamp_scale, tick))
        durations.append(dur)
        tick += 1

    # Phase 1: Neutral — hold (4 frames)
    add(0, 0, 150)
    add(0, 0, 150)
    add(0, 0, 150)
    add(0, 0, 150)

    # Phase 2: Single eyebrow arches up — 3 frames
    for i in range(3):
        t = (i + 1) / 3
        add(int(t * 2), 0, 80)

    # Phase 3: Hold raised brow (2 frames)
    add(2, 0, 180)
    add(2, 0, 180)

    # Phase 4: Stamp appears (flash) — 3 frames
    for i in range(3):
        t = (i + 1) / 3
        add(2, int(t * 220), 60, stamp_scale=1.0 + (1 - t) * 0.3)

    # Phase 5: Hold stamp + brow (2 frames)
    add(2, 220, 200)
    add(2, 220, 200)

    # Phase 6: Stamp fades, brow lowers — 3 frames
    for i in range(3):
        t = (i + 1) / 3
        add(int(2 * (1 - t)), int(220 * (1 - t)), 80)

    # Phase 7: Return to neutral — 2 frames pause
    add(0, 0, 200)
    add(0, 0, 200)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/critic_b.gif"
    frames, durations = build_frames()

    palettes = [f.quantize(colors=128, method=Image.Quantize.FASTOCTREE) for f in frames]

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
