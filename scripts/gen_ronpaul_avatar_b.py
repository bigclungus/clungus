#!/usr/bin/env python3
"""Generate a 64x64 animated GIF avatar for Ron Paul — variant B: Constitution Scholar."""

from PIL import Image, ImageDraw
import math
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/ronpaul_b.gif"
SIZE = 64
FRAMES = 12

BG         = (18, 18, 22)
SKIN       = (215, 185, 155)
SKIN_S     = (185, 155, 125)
SKIN_H     = (235, 205, 175)
HAIR       = (200, 200, 205)
HAIR_S     = (170, 170, 178)
SUIT       = (30, 35, 55)
SUIT_L     = (45, 50, 75)
SHIRT      = (230, 230, 235)
TIE_GOLD   = (180, 160, 60)
TIE_GOLD_D = (140, 120, 40)
EYE_WHITE  = (225, 225, 220)
PUPIL      = (50, 45, 35)
BROW       = (140, 140, 148)
LIP        = (175, 135, 115)
SCROLL     = (220, 200, 160)
SCROLL_D   = (190, 170, 130)
SCROLL_INK = (60, 40, 20)
GLASSES    = (140, 140, 150)


def px(d, x, y, c):
    if 0 <= x < SIZE and 0 <= y < SIZE:
        d.point((x, y), fill=c)

def rect(d, x1, y1, x2, y2, c):
    d.rectangle([x1, y1, x2, y2], fill=c)

def hline(d, y, x1, x2, c):
    for x in range(x1, x2 + 1):
        px(d, x, y, c)

def vline(d, x, y1, y2, c):
    for y in range(y1, y2 + 1):
        px(d, x, y, c)


def draw_frame(reading_phase=0):
    img = Image.new("RGB", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)

    # Constitution scroll held in front
    scroll_y = 44 + int(math.sin(reading_phase) * 1)
    rect(d, 4, scroll_y, 60, scroll_y + 18, SCROLL)
    hline(d, scroll_y, 4, 60, SCROLL_D)
    hline(d, scroll_y + 18, 4, 60, SCROLL_D)
    # Rolled edges
    rect(d, 2, scroll_y - 1, 6, scroll_y + 19, SCROLL_D)
    rect(d, 58, scroll_y - 1, 62, scroll_y + 19, SCROLL_D)
    # Text lines on scroll
    for row in range(3):
        line_y = scroll_y + 3 + row * 5
        for x in range(10, 54, 2):
            if (x + row) % 3 != 0 and line_y < SIZE:
                px(d, x, line_y, SCROLL_INK)

    # Suit body
    rect(d, 20, 36, 44, 50, SUIT)
    vline(d, 28, 36, 46, SUIT_L)
    vline(d, 36, 36, 46, SUIT_L)
    rect(d, 29, 36, 35, 46, SHIRT)
    rect(d, 31, 37, 33, 46, TIE_GOLD)
    px(d, 30, 37, TIE_GOLD_D)
    px(d, 34, 37, TIE_GOLD_D)

    # Neck
    rect(d, 28, 32, 36, 38, SKIN)

    # Head
    rect(d, 18, 8, 46, 32, SKIN)
    rect(d, 20, 32, 44, 36, SKIN)
    vline(d, 18, 10, 30, SKIN_S)
    vline(d, 46, 10, 30, SKIN_S)

    # Hair
    rect(d, 16, 10, 20, 26, HAIR)
    rect(d, 44, 10, 48, 26, HAIR)
    rect(d, 18, 6, 46, 11, HAIR)
    for x in range(22, 42):
        if (x % 3) != 1:
            px(d, x, 7, HAIR)

    # Ears
    rect(d, 15, 18, 18, 26, SKIN)
    rect(d, 46, 18, 49, 26, SKIN)

    # Glasses — reading glasses
    rect(d, 20, 18, 30, 24, GLASSES)
    rect(d, 34, 18, 44, 24, GLASSES)
    hline(d, 20, 30, 34, GLASSES)  # bridge
    rect(d, 21, 19, 29, 23, EYE_WHITE)
    rect(d, 35, 19, 43, 23, EYE_WHITE)

    # Pupils — looking down at scroll
    rect(d, 24, 21, 26, 23, PUPIL)
    rect(d, 38, 21, 40, 23, PUPIL)

    # Eyebrows — above glasses
    hline(d, 16, 21, 28, BROW)
    hline(d, 16, 35, 42, BROW)

    # Nose
    vline(d, 32, 23, 27, SKIN_S)
    px(d, 31, 28, SKIN_S)
    px(d, 33, 28, SKIN_S)

    # Mouth — thoughtful/closed
    hline(d, 30, 28, 36, LIP)

    # Hands holding scroll
    rect(d, 8, scroll_y - 2, 14, scroll_y + 4, SKIN)
    rect(d, 50, scroll_y - 2, 56, scroll_y + 4, SKIN)

    return img


def main():
    frames = []
    for i in range(FRAMES):
        reading_phase = 2 * math.pi * i / FRAMES
        frame = draw_frame(reading_phase=reading_phase)
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
