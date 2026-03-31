#!/usr/bin/env python3
"""Generate a 64x64 animated GIF avatar for Pepe — variant C: Comfy Pepe with blanket."""

from PIL import Image, ImageDraw
import math
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/pepe_c.gif"
SIZE = 64
FRAMES = 12

BG         = (18, 18, 22)
GREEN      = (100, 160, 60)
GREEN_D    = (70, 120, 40)
GREEN_L    = (130, 190, 80)
EYE_WHITE  = (230, 230, 225)
PUPIL      = (20, 15, 10)
LIP        = (110, 170, 65)
BLANKET    = (140, 80, 50)
BLANKET_L  = (170, 100, 65)
BLANKET_D  = (100, 55, 30)
MUG        = (200, 190, 170)
MUG_D      = (160, 150, 135)
STEAM      = (120, 120, 130)
COCOA      = (80, 45, 20)


def px(d, x, y, c):
    if 0 <= x < SIZE and 0 <= y < SIZE:
        d.point((x, y), fill=c)

def rect(d, x1, y1, x2, y2, c):
    d.rectangle([x1, y1, x2, y2], fill=c)

def hline(d, y, x1, x2, c):
    for x in range(x1, x2 + 1):
        px(d, x, y, c)


def draw_frame(steam_phase=0.0, blink=False):
    img = Image.new("RGB", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)

    # Blanket — wraps around lower body
    rect(d, 6, 38, 58, 63, BLANKET)
    rect(d, 8, 36, 56, 40, BLANKET)
    # Blanket pattern — horizontal stripes
    for y in range(40, 64, 4):
        hline(d, y, 6, 58, BLANKET_D)
    # Blanket top fold highlight
    hline(d, 36, 8, 56, BLANKET_L)
    hline(d, 37, 8, 56, BLANKET_L)

    # Head — slightly tilted for cozy vibe
    rect(d, 12, 10, 50, 38, GREEN)
    rect(d, 16, 38, 48, 42, GREEN)
    rect(d, 16, 6, 48, 12, GREEN)
    # Shading
    for y in range(10, 38):
        px(d, 12, y, GREEN_D)
        px(d, 50, y, GREEN_D)
    # Highlight
    rect(d, 24, 8, 40, 11, GREEN_L)

    # Eyes — half-closed, content
    if blink:
        hline(d, 22, 16, 28, GREEN_D)
        hline(d, 22, 36, 48, GREEN_D)
    else:
        # Left eye
        rect(d, 16, 20, 28, 28, EYE_WHITE)
        rect(d, 16, 18, 28, 22, GREEN)  # heavy lid
        rect(d, 20, 24, 24, 27, PUPIL)
        px(d, 21, 24, (100, 100, 95))
        # Right eye
        rect(d, 36, 20, 48, 28, EYE_WHITE)
        rect(d, 36, 18, 48, 22, GREEN)  # heavy lid
        rect(d, 40, 24, 44, 27, PUPIL)
        px(d, 41, 24, (100, 100, 95))

    # Small content smile
    hline(d, 34, 24, 40, LIP)
    px(d, 24, 33, LIP)
    px(d, 40, 33, LIP)

    # Mug held in front (by green hand peeking out of blanket)
    # Hand
    rect(d, 42, 36, 48, 42, GREEN)
    # Mug body
    rect(d, 48, 30, 58, 42, MUG)
    rect(d, 48, 30, 58, 32, MUG_D)
    # Mug handle
    rect(d, 58, 33, 62, 39, MUG_D)
    rect(d, 58, 34, 61, 38, BG)
    # Cocoa inside
    rect(d, 49, 31, 57, 33, COCOA)

    # Steam wisps
    sx = 52
    for j in range(3):
        sy = 28 - j * 5
        off = int(math.sin(steam_phase + j * 1.5) * 2)
        if 0 <= sy < SIZE:
            px(d, sx + off, sy, STEAM)
            px(d, sx + off + 1, sy - 1, STEAM)

    return img


def main():
    frames = []
    for i in range(FRAMES):
        t = i / FRAMES
        steam_phase = 2 * math.pi * t
        blink = (i == 5 or i == 6)
        frame = draw_frame(steam_phase=steam_phase, blink=blink)
        frames.append(frame)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    frames[0].save(
        OUTPUT_PATH, save_all=True, append_images=frames[1:],
        loop=0, duration=140, optimize=False,
    )
    print(f"Saved {FRAMES}-frame GIF to {OUTPUT_PATH}")
    print(f"File size: {os.path.getsize(OUTPUT_PATH) / 1024:.1f} KB")

if __name__ == "__main__":
    main()
