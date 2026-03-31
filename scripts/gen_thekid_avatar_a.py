#!/usr/bin/env python3
"""
The Kid — Avatar Option A: SPEED BLUR
Pure kinetic energy. A figure that's already gone before you see it.
Near-black background. Neon yellow/white motion trails. Rapid flicker,
barely-there form, mostly streak. The Kid as pure velocity — frame rate
itself can't keep up.
Animation: figure streaks left-to-right in explosive bursts, leaving
smeared afterimage trails. Fast, chaotic, repeating before you can parse it.
"""

from PIL import Image, ImageDraw, ImageFilter
import math
import random

W, H = 64, 64

# Palette
BG          = (8, 8, 10, 255)       # near-black
TRAIL_HOT   = (255, 240, 40, 255)   # hot neon yellow core
TRAIL_MID   = (255, 160, 0, 200)    # orange falloff
TRAIL_FADE  = (180, 80, 0, 100)     # dim orange tail
TRAIL_GHOST = (60, 40, 0, 50)       # ghost smear
BODY_BRIGHT = (255, 255, 200, 255)  # near-white body core (barely seen)
BODY_MID    = (255, 220, 100, 200)  # body mid
SPARK       = (255, 255, 255, 255)  # spark white
SPEED_LINE  = (255, 200, 0, 80)     # background speed lines


def draw_speed_lines(draw, x_origin, count=8):
    """Horizontal speed lines emanating left from x_origin."""
    for i in range(count):
        y = 8 + i * 7
        length = random.randint(12, 30)
        alpha = random.randint(30, 90)
        col = (*SPEED_LINE[:3], alpha)
        x_start = max(0, x_origin - length)
        draw.line([(x_start, y), (x_origin - 2, y)],
                  fill=col, width=1)


def draw_figure(draw, cx, cy, squash=1.0, bright=1.0):
    """
    Draw a stick-figure-ish runner, heavily squashed horizontally (motion blur effect).
    squash: 1.0 = normal, >1 = wider/more blurred
    bright: 0..1 opacity multiplier for the body color
    """
    b = int(255 * bright)
    body_col = (255, 255, max(0, 200 - int(55 * (1 - bright))), b)
    limb_col = (255, int(180 * bright), 0, b)

    # Head — small ellipse, squashed
    hw = max(1, int(4 * squash))
    hh = 4
    draw.ellipse([(cx - hw, cy - 14), (cx + hw, cy - 10)], fill=body_col)

    # Torso — vertical line, squashed wide
    tw = max(1, int(2 * squash))
    draw.rectangle([(cx - tw, cy - 10), (cx + tw, cy - 4)], fill=body_col)

    # Legs — angled, mid-stride
    # Front leg (right, forward)
    draw.line([(cx, cy - 4), (cx + int(6 * squash), cy + 4)],
              fill=limb_col, width=max(1, int(2 * squash)))
    # Back leg (left, trailing)
    draw.line([(cx, cy - 4), (cx - int(5 * squash), cy + 2)],
              fill=limb_col, width=max(1, int(1 * squash)))

    # Arms — pumping
    draw.line([(cx - int(2 * squash), cy - 8),
               (cx + int(5 * squash), cy - 4)],
              fill=limb_col, width=max(1, int(1 * squash)))
    draw.line([(cx + int(2 * squash), cy - 8),
               (cx - int(4 * squash), cy - 5)],
              fill=limb_col, width=max(1, int(1 * squash)))


def draw_trail(draw, cx, cy, length=20):
    """Horizontal smear trail behind figure."""
    for i in range(length):
        t = i / length
        x = cx - i - 1
        if x < 0:
            break
        alpha = int(180 * (1 - t) ** 1.5)
        if t < 0.3:
            col = (*TRAIL_HOT[:3], alpha)
        elif t < 0.6:
            col = (*TRAIL_MID[:3], alpha)
        elif t < 0.85:
            col = (*TRAIL_FADE[:3], alpha)
        else:
            col = (*TRAIL_GHOST[:3], alpha)
        width = max(1, int(3 * (1 - t * 0.7)))
        draw.line([(x, cy - 8), (x, cy + 4)], fill=col, width=width)


def make_frame(phase):
    """
    phase: 0.0..1.0 position across the frame (left to right run cycle)
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Background speed lines (always present, faint)
    # Fixed seed per position for consistency
    rng = random.Random(int(phase * 100))
    for i in range(6):
        y = 5 + i * 10
        length = rng.randint(8, 22)
        x_end = rng.randint(20, 55)
        alpha = rng.randint(15, 45)
        draw.line([(x_end - length, y), (x_end, y)],
                  fill=(*SPEED_LINE[:3], alpha), width=1)

    # Figure x position — sweeps left to right across frame
    cx = int(10 + phase * 50)
    cy = 36

    # Trail behind figure
    trail_len = int(18 + phase * 8)
    draw_trail(draw, cx, cy, length=trail_len)

    # Squash increases mid-frame (peak speed in center)
    squash = 1.0 + 1.8 * math.sin(phase * math.pi)
    bright = 0.7 + 0.3 * math.sin(phase * math.pi)
    draw_figure(draw, cx, cy, squash=squash, bright=bright)

    # Sparks — tiny dots ahead of figure at peak
    if 0.3 < phase < 0.8:
        spark_count = int(4 * math.sin((phase - 0.3) / 0.5 * math.pi))
        srng = random.Random(int(phase * 999))
        for _ in range(spark_count):
            sx = cx + srng.randint(3, 10)
            sy = cy + srng.randint(-8, 4)
            if 0 <= sx < W and 0 <= sy < H:
                draw.point([(sx, sy)], fill=SPARK)

    # Ground line — faint dash
    for gx in range(0, W, 4):
        alpha = 30 if (gx // 4) % 2 == 0 else 15
        draw.line([(gx, cy + 5), (gx + 2, cy + 5)],
                  fill=(80, 60, 0, alpha), width=1)

    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    # Fast run cycle: 12 frames across the screen, then 2 blank frames (flash out)
    # Total: 14 frames, very fast

    # Phase 1: streak across — 10 frames, very fast (30ms each)
    num_run = 10
    for i in range(num_run):
        t = i / (num_run - 1)
        frames.append(make_frame(t))
        # Accelerate through: start slower, blaze through middle, exit fast
        if t < 0.15 or t > 0.85:
            durations.append(60)   # slight pause at entry/exit
        elif 0.35 < t < 0.65:
            durations.append(20)   # blazing fast center
        else:
            durations.append(35)

    # Phase 2: flash white (afterimage) — 1 frame
    flash = Image.new("RGBA", (W, H), BG)
    fdraw = ImageDraw.Draw(flash)
    # Horizontal white flash across middle
    for fy in range(28, 46):
        alpha = max(0, 120 - abs(fy - 37) * 15)
        fdraw.line([(0, fy), (W - 1, fy)],
                   fill=(255, 240, 100, alpha), width=1)
    frames.append(flash.convert("RGBA"))
    durations.append(25)

    # Phase 3: blank — 1 frame (figure gone, just faint trail remnant)
    blank = Image.new("RGBA", (W, H), BG)
    bdraw = ImageDraw.Draw(blank)
    # Ghost trail — far right edge
    for i in range(8):
        t = i / 8
        x = W - 2 - i
        alpha = int(60 * (1 - t))
        bdraw.line([(x, 30), (x, 42)],
                   fill=(*TRAIL_GHOST[:3], alpha), width=1)
    frames.append(blank.convert("RGBA"))
    durations.append(80)

    # Phase 4: hold blank — 2 frames (short pause before loop)
    frames.append(Image.new("RGBA", (W, H), BG).convert("RGBA"))
    durations.append(60)
    frames.append(Image.new("RGBA", (W, H), BG).convert("RGBA"))
    durations.append(40)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/the-kid_a.gif"
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
