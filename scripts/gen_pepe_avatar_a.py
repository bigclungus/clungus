#!/usr/bin/env python3
"""Generate a 64x64 animated GIF avatar for Pepe — variant A: Classic Smug."""

from PIL import Image, ImageDraw
import math
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/pepe_a.gif"
SIZE = 64
FRAMES = 12

# --- Palette ---
BG         = (18, 18, 22)
GREEN      = (100, 160, 60)
GREEN_D    = (70, 120, 40)
GREEN_L    = (130, 190, 80)
MOUTH      = (60, 100, 35)
MOUTH_IN   = (40, 70, 25)
LIP        = (110, 170, 65)
EYE_WHITE  = (230, 230, 225)
EYE_BROWN  = (80, 50, 20)
PUPIL      = (20, 15, 10)
TEAR       = (80, 140, 210)


def px(d, x, y, c):
    if 0 <= x < SIZE and 0 <= y < SIZE:
        d.point((x, y), fill=c)

def rect(d, x1, y1, x2, y2, c):
    d.rectangle([x1, y1, x2, y2], fill=c)

def hline(d, y, x1, x2, c):
    for x in range(x1, x2 + 1):
        px(d, x, y, c)

def draw_frame(smug_phase=0.0, tear_y=0):
    img = Image.new("RGB", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)

    # Body / torso hint
    rect(d, 18, 52, 46, 63, GREEN_D)

    # Head — big round frog head
    rect(d, 10, 14, 54, 48, GREEN)
    # Chin roundness
    rect(d, 14, 48, 50, 52, GREEN)
    rect(d, 18, 52, 46, 54, GREEN)
    # Top roundness
    rect(d, 14, 10, 50, 16, GREEN)
    rect(d, 18, 8, 46, 12, GREEN)
    # Shading
    for y in range(14, 48):
        px(d, 10, y, GREEN_D)
        px(d, 54, y, GREEN_D)
    hline(d, 14, 10, 14, GREEN_D)
    hline(d, 14, 50, 54, GREEN_D)

    # Highlight on forehead
    rect(d, 24, 12, 40, 15, GREEN_L)

    # Eyes — big bulging frog eyes
    # Left eye
    rect(d, 14, 18, 30, 32, EYE_WHITE)
    rect(d, 14, 17, 30, 18, GREEN)  # eyelid top
    # Right eye
    rect(d, 34, 18, 50, 32, EYE_WHITE)
    rect(d, 34, 17, 50, 18, GREEN)  # eyelid top

    # Pupils — looking slightly to the side (smug)
    pupil_x_off = int(smug_phase * 2)
    rect(d, 22 + pupil_x_off, 22, 26 + pupil_x_off, 28, EYE_BROWN)
    rect(d, 23 + pupil_x_off, 23, 25 + pupil_x_off, 27, PUPIL)
    rect(d, 42 + pupil_x_off, 22, 46 + pupil_x_off, 28, EYE_BROWN)
    rect(d, 43 + pupil_x_off, 23, 45 + pupil_x_off, 27, PUPIL)

    # Eye shine
    px(d, 24 + pupil_x_off, 23, (200, 200, 195))
    px(d, 44 + pupil_x_off, 23, (200, 200, 195))

    # Smug half-closed eyelids
    hline(d, 19, 14, 30, GREEN)
    hline(d, 20, 14, 30, GREEN)
    hline(d, 19, 34, 50, GREEN)
    hline(d, 20, 34, 50, GREEN)

    # Mouth — smug grin
    hline(d, 40, 18, 46, LIP)
    hline(d, 41, 16, 48, MOUTH)
    hline(d, 42, 18, 46, MOUTH_IN)
    # Upturned corners
    px(d, 16, 40, LIP)
    px(d, 48, 40, LIP)
    px(d, 15, 39, LIP)
    px(d, 49, 39, LIP)

    # Single tear on right side (subtle)
    tear_start = 32 + tear_y
    if tear_start < 50:
        px(d, 33, tear_start, TEAR)
        px(d, 33, tear_start + 1, TEAR)

    return img


def main():
    frames = []
    for i in range(FRAMES):
        t = i / FRAMES
        smug_phase = math.sin(2 * math.pi * t) * 0.5
        tear_y = (i * 2) % 20
        frame = draw_frame(smug_phase=smug_phase, tear_y=tear_y)
        frames.append(frame)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    frames[0].save(
        OUTPUT_PATH, save_all=True, append_images=frames[1:],
        loop=0, duration=120, optimize=False,
    )
    print(f"Saved {FRAMES}-frame GIF to {OUTPUT_PATH}")
    print(f"File size: {os.path.getsize(OUTPUT_PATH) / 1024:.1f} KB")

if __name__ == "__main__":
    main()
