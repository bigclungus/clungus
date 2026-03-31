#!/usr/bin/env python3
"""Generate a 64x64 animated GIF avatar for Pepe — variant B: Sad/Doomer Pepe."""

from PIL import Image, ImageDraw
import math
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/pepe_b.gif"
SIZE = 64
FRAMES = 12

BG         = (18, 18, 22)
GREEN      = (85, 140, 55)
GREEN_D    = (60, 105, 38)
GREEN_L    = (110, 165, 70)
MOUTH      = (50, 85, 30)
LIP        = (95, 150, 58)
EYE_WHITE  = (225, 225, 220)
EYE_RED    = (180, 60, 60)
PUPIL      = (20, 15, 10)
TEAR       = (80, 150, 220)
TEAR_L     = (120, 180, 240)
HOODIE     = (40, 40, 50)
HOODIE_L   = (55, 55, 68)


def px(d, x, y, c):
    if 0 <= x < SIZE and 0 <= y < SIZE:
        d.point((x, y), fill=c)

def rect(d, x1, y1, x2, y2, c):
    d.rectangle([x1, y1, x2, y2], fill=c)

def hline(d, y, x1, x2, c):
    for x in range(x1, x2 + 1):
        px(d, x, y, c)


def draw_frame(tear_offset=0, mouth_quiver=0):
    img = Image.new("RGB", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)

    # Hoodie body
    rect(d, 12, 48, 52, 63, HOODIE)
    rect(d, 16, 44, 48, 50, HOODIE)
    # Hood edges
    rect(d, 8, 14, 14, 48, HOODIE)
    rect(d, 50, 14, 56, 48, HOODIE)
    rect(d, 12, 8, 52, 14, HOODIE)
    # Hood highlights
    hline(d, 10, 14, 50, HOODIE_L)
    for y in range(14, 44):
        px(d, 9, y, HOODIE_L)

    # Head
    rect(d, 14, 14, 50, 46, GREEN)
    rect(d, 18, 46, 46, 50, GREEN)
    rect(d, 18, 10, 46, 16, GREEN)
    # Shading
    for y in range(14, 46):
        px(d, 14, y, GREEN_D)
        px(d, 50, y, GREEN_D)

    # Eyes — droopy, sad, slightly red
    rect(d, 16, 22, 30, 34, EYE_WHITE)
    rect(d, 34, 22, 48, 34, EYE_WHITE)
    # Reddened lower lids
    hline(d, 33, 16, 30, EYE_RED)
    hline(d, 34, 18, 28, EYE_RED)
    hline(d, 33, 34, 48, EYE_RED)
    hline(d, 34, 36, 46, EYE_RED)

    # Droopy eyelids
    rect(d, 16, 20, 30, 24, GREEN)
    rect(d, 34, 20, 48, 24, GREEN)

    # Pupils (looking down)
    rect(d, 21, 28, 25, 32, PUPIL)
    rect(d, 39, 28, 43, 32, PUPIL)

    # Tears — streams running down both cheeks
    for ty in range(0, 16, 3):
        actual_y = 34 + ty + (tear_offset % 3)
        if actual_y < 54:
            px(d, 30, actual_y, TEAR)
            px(d, 31, actual_y, TEAR_L)
            px(d, 34, actual_y, TEAR)
            px(d, 33, actual_y, TEAR_L)

    # Mouth — sad frown
    my = 42 + mouth_quiver
    hline(d, my, 22, 42, LIP)
    px(d, 22, my - 1, LIP)
    px(d, 23, my - 2, LIP)
    px(d, 42, my - 1, LIP)
    px(d, 41, my - 2, LIP)
    # Inner mouth shadow
    hline(d, my + 1, 24, 40, MOUTH)

    return img


def main():
    frames = []
    for i in range(FRAMES):
        tear_offset = i
        mouth_quiver = 1 if (i % 4) in (1, 3) else 0
        frame = draw_frame(tear_offset=tear_offset, mouth_quiver=mouth_quiver)
        frames.append(frame)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    frames[0].save(
        OUTPUT_PATH, save_all=True, append_images=frames[1:],
        loop=0, duration=150, optimize=False,
    )
    print(f"Saved {FRAMES}-frame GIF to {OUTPUT_PATH}")
    print(f"File size: {os.path.getsize(OUTPUT_PATH) / 1024:.1f} KB")

if __name__ == "__main__":
    main()
