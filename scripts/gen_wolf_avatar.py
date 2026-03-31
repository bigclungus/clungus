#!/usr/bin/env python3
"""Generate a 64x64 animated GIF avatar for Ferrus the Feral — neon wolf Rust evangelist."""

from PIL import Image, ImageDraw
import math
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/wolf.gif"
SIZE = 64
FRAMES = 12

# Colors
NEON_ORANGE = (255, 100, 0)
NEON_ORANGE_DARK = (200, 60, 0)
ELECTRIC_BLUE = (30, 100, 255)
ELECTRIC_BLUE_DARK = (10, 50, 180)
CYAN_EYE = (0, 240, 255)
WHITE_EYE = (255, 255, 255)
DARK_BG = (12, 14, 20)
GRID_COLOR = (20, 30, 45)
FUR_DARK = (180, 65, 0)
RUST_ORANGE = (222, 95, 0)
SNOUT_COLOR = (220, 130, 50)
INNER_EAR = (255, 60, 80)


def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def draw_grid(draw, size, color):
    """Draw a subtle terminal/code grid background."""
    step = 8
    for x in range(0, size, step):
        draw.line([(x, 0), (x, size)], fill=color, width=1)
    for y in range(0, size, step):
        draw.line([(0, y), (size, y)], fill=color, width=1)


def draw_rust_logo(draw, cx, cy, radius=5):
    """Draw a simplified Rust gear/cog logo — circle with spokes."""
    # Outer circle
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        outline=RUST_ORANGE,
        width=1,
    )
    # Inner circle
    inner = radius - 2
    draw.ellipse(
        [cx - inner, cy - inner, cx + inner, cy + inner],
        outline=RUST_ORANGE,
        width=1,
    )
    # 8 spokes (gear teeth stubs)
    for i in range(8):
        angle = math.radians(i * 45)
        x1 = cx + math.cos(angle) * (radius - 1)
        y1 = cy + math.sin(angle) * (radius - 1)
        x2 = cx + math.cos(angle) * (radius + 1)
        y2 = cy + math.sin(angle) * (radius + 1)
        draw.line([(x1, y1), (x2, y2)], fill=RUST_ORANGE, width=1)


def draw_wolf_frame(eye_color, glow_strength):
    """Draw a single wolf frame. eye_color interpolates between CYAN and WHITE."""
    img = Image.new("RGB", (SIZE, SIZE), DARK_BG)
    draw = ImageDraw.Draw(img)

    # Grid background
    draw_grid(draw, SIZE, GRID_COLOR)

    # --- Body (wide, jacked shoulders) ---
    # Torso — neon orange, wide trapezoid
    torso_pts = [(14, 52), (50, 52), (54, 64), (10, 64)]
    draw.polygon(torso_pts, fill=NEON_ORANGE_DARK)

    # Chest highlight
    draw.polygon([(22, 46), (42, 46), (46, 58), (18, 58)], fill=NEON_ORANGE)

    # Shoulders (wide, muscular bumps)
    draw.ellipse([6, 40, 22, 56], fill=NEON_ORANGE)   # left shoulder
    draw.ellipse([42, 40, 58, 56], fill=NEON_ORANGE)  # right shoulder

    # Electric-blue stripe down center of chest
    draw.polygon([(29, 46), (35, 46), (37, 64), (27, 64)], fill=ELECTRIC_BLUE_DARK)

    # Rust logo on chest
    draw_rust_logo(draw, 32, 54, radius=4)

    # --- Head ---
    # Head base — neon orange
    draw.ellipse([16, 14, 48, 44], fill=NEON_ORANGE)

    # Blue accent stripe on top of head
    draw.ellipse([20, 14, 44, 26], fill=ELECTRIC_BLUE)

    # Ears (pointed, triangular)
    # Left ear
    left_ear = [(14, 22), (20, 8), (26, 20)]
    draw.polygon(left_ear, fill=NEON_ORANGE_DARK)
    draw.polygon([(16, 20), (20, 10), (24, 19)], fill=INNER_EAR)

    # Right ear
    right_ear = [(38, 20), (44, 8), (50, 22)]
    draw.polygon(right_ear, fill=NEON_ORANGE_DARK)
    draw.polygon([(40, 19), (44, 10), (48, 20)], fill=INNER_EAR)

    # Snout
    draw.ellipse([24, 30, 40, 44], fill=SNOUT_COLOR)
    # Nose
    draw.ellipse([29, 30, 35, 34], fill=(40, 20, 20))

    # Eyes — glowing, pulsing
    # Glow halo (larger ellipse, semi-transparent feel via color blend)
    glow_col = lerp_color((0, 80, 100), CYAN_EYE, glow_strength)
    # Left eye glow
    draw.ellipse([19, 20, 27, 28], fill=glow_col)
    # Right eye glow
    draw.ellipse([37, 20, 45, 28], fill=glow_col)

    # Eye pupils
    pupil_col = lerp_color(CYAN_EYE, WHITE_EYE, glow_strength)
    draw.ellipse([21, 22, 25, 26], fill=pupil_col)
    draw.ellipse([39, 22, 43, 26], fill=pupil_col)

    # Fur detail lines (dark orange)
    draw.line([(32, 28), (32, 34)], fill=FUR_DARK, width=1)  # center face line
    draw.line([(26, 26), (24, 28)], fill=FUR_DARK, width=1)  # left cheek
    draw.line([(38, 26), (40, 28)], fill=FUR_DARK, width=1)  # right cheek

    # Blue streak on jaw/cheek
    draw.polygon([(16, 32), (20, 30), (20, 38), (14, 38)], fill=ELECTRIC_BLUE_DARK)
    draw.polygon([(44, 30), (48, 32), (50, 38), (44, 38)], fill=ELECTRIC_BLUE_DARK)

    return img


def main():
    frames = []
    for i in range(FRAMES):
        # Pulse: sine wave from 0 to 1 and back
        t = (math.sin(2 * math.pi * i / FRAMES) + 1) / 2
        eye_col = lerp_color(CYAN_EYE, WHITE_EYE, t)
        frame = draw_wolf_frame(eye_col, t)
        frames.append(frame)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    frames[0].save(
        OUTPUT_PATH,
        save_all=True,
        append_images=frames[1:],
        loop=0,
        duration=80,  # ms per frame
        optimize=False,
    )
    print(f"Saved {FRAMES}-frame GIF to {OUTPUT_PATH}")
    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"File size: {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
