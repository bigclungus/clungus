#!/usr/bin/env python3
"""Generate a 64x64 animated GIF avatar for Ron Paul — variant A: Podium Speaker."""

from PIL import Image, ImageDraw
import math
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/ronpaul_a.gif"
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
TIE        = (160, 25, 25)
TIE_D      = (120, 15, 15)
EYE_WHITE  = (225, 225, 220)
PUPIL      = (50, 45, 35)
BROW       = (140, 140, 148)
LIP        = (175, 135, 115)
PODIUM     = (80, 60, 40)
PODIUM_L   = (100, 78, 52)
GOLD       = (200, 175, 80)


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


def draw_frame(gesture=0, mouth_open=False):
    img = Image.new("RGB", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)

    # Podium
    rect(d, 8, 50, 56, 63, PODIUM)
    hline(d, 50, 8, 56, PODIUM_L)
    # Gold seal on podium
    rect(d, 28, 54, 36, 60, GOLD)

    # Suit body
    rect(d, 20, 38, 44, 52, SUIT)
    # Lapels
    vline(d, 28, 38, 48, SUIT_L)
    vline(d, 36, 38, 48, SUIT_L)
    # Shirt
    rect(d, 29, 38, 35, 48, SHIRT)
    # Tie
    rect(d, 31, 39, 33, 48, TIE)
    px(d, 30, 39, TIE_D)
    px(d, 34, 39, TIE_D)

    # Neck
    rect(d, 28, 34, 36, 40, SKIN)

    # Head
    rect(d, 18, 10, 46, 34, SKIN)
    # Jaw
    rect(d, 20, 34, 44, 38, SKIN)
    rect(d, 22, 38, 42, 40, SKIN)
    # Side shadow
    vline(d, 18, 12, 32, SKIN_S)
    vline(d, 46, 12, 32, SKIN_S)
    # Highlight
    rect(d, 28, 12, 38, 15, SKIN_H)

    # Hair — white/silver, balding on top
    rect(d, 16, 12, 20, 28, HAIR)
    rect(d, 44, 12, 48, 28, HAIR)
    rect(d, 18, 8, 46, 13, HAIR)
    # Thinning top
    for x in range(22, 42):
        if (x % 3) != 0:
            px(d, x, 9, HAIR)
            px(d, x, 10, HAIR)
    # Hair shadow
    hline(d, 12, 16, 20, HAIR_S)
    hline(d, 12, 44, 48, HAIR_S)

    # Ears
    rect(d, 15, 20, 18, 28, SKIN)
    rect(d, 46, 20, 49, 28, SKIN)
    px(d, 16, 23, SKIN_S)
    px(d, 47, 23, SKIN_S)

    # Eyebrows
    hline(d, 17, 22, 28, BROW)
    hline(d, 17, 36, 42, BROW)

    # Eyes
    rect(d, 22, 19, 28, 24, EYE_WHITE)
    rect(d, 36, 19, 42, 24, EYE_WHITE)
    rect(d, 24, 20, 26, 23, PUPIL)
    rect(d, 38, 20, 40, 23, PUPIL)
    px(d, 25, 20, (100, 90, 80))
    px(d, 39, 20, (100, 90, 80))

    # Nose
    vline(d, 32, 24, 29, SKIN_S)
    px(d, 31, 30, SKIN_S)
    px(d, 33, 30, SKIN_S)

    # Mouth
    if mouth_open:
        rect(d, 28, 32, 36, 35, (120, 60, 50))
        hline(d, 32, 29, 35, (200, 195, 185))
    else:
        hline(d, 33, 28, 36, LIP)

    # Gesturing arm — raised hand
    if gesture > 0:
        # Right arm raised
        rect(d, 44, 32, 52, 38, SUIT)
        rect(d, 50, 26, 56, 34, SKIN)
        # Pointing finger
        rect(d, 54, 26, 58, 29, SKIN)

    return img


def main():
    frames = []
    for i in range(FRAMES):
        mouth_open = (i % 3) == 1
        gesture = 1 if (i % 4) < 2 else 0
        frame = draw_frame(gesture=gesture, mouth_open=mouth_open)
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
