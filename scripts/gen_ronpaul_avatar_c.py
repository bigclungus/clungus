#!/usr/bin/env python3
"""Generate a 64x64 animated GIF avatar for Ron Paul — variant C: Gold Standard / Liberty Bell."""

from PIL import Image, ImageDraw
import math
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/ronpaul_c.gif"
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
TIE_FLAG   = (180, 35, 35)
EYE_WHITE  = (225, 225, 220)
PUPIL      = (50, 45, 35)
BROW       = (140, 140, 148)
LIP        = (175, 135, 115)
GOLD       = (210, 185, 70)
GOLD_D     = (170, 145, 40)
GOLD_L     = (240, 215, 100)
FLAG_BLUE  = (30, 40, 100)
FLAG_RED   = (180, 30, 30)
FLAG_WHITE = (230, 230, 235)


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


def draw_frame(coin_glow=0.0, flag_wave=0):
    img = Image.new("RGB", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)

    # American flag in background (right side)
    flag_x = 44
    # Pole
    vline(d, flag_x, 4, 36, (120, 120, 130))
    # Flag body
    for stripe in range(7):
        y = 6 + stripe * 2
        c = FLAG_RED if stripe % 2 == 0 else FLAG_WHITE
        hline(d, y + flag_wave % 2, flag_x + 1, 62, c)
        hline(d, y + 1 + flag_wave % 2, flag_x + 1, 62, c)
    # Blue canton
    rect(d, flag_x + 1, 6 + flag_wave % 2, flag_x + 8, 12 + flag_wave % 2, FLAG_BLUE)

    # Suit body
    rect(d, 10, 38, 38, 52, SUIT)
    vline(d, 18, 38, 48, SUIT_L)
    vline(d, 30, 38, 48, SUIT_L)
    rect(d, 19, 38, 29, 48, SHIRT)
    rect(d, 22, 39, 26, 48, TIE_FLAG)

    # Neck
    rect(d, 20, 34, 30, 40, SKIN)

    # Head — slightly turned toward viewer
    rect(d, 10, 10, 38, 34, SKIN)
    rect(d, 14, 34, 36, 38, SKIN)
    vline(d, 10, 12, 32, SKIN_S)
    vline(d, 38, 12, 32, SKIN_S)
    rect(d, 20, 12, 32, 15, SKIN_H)

    # Hair
    rect(d, 8, 12, 12, 28, HAIR)
    rect(d, 36, 12, 40, 28, HAIR)
    rect(d, 10, 6, 38, 12, HAIR)
    for x in range(14, 34):
        if (x % 3) != 0:
            px(d, x, 7, HAIR)

    # Ears
    rect(d, 7, 20, 10, 28, SKIN)
    rect(d, 38, 20, 41, 28, SKIN)

    # Eyebrows
    hline(d, 17, 14, 22, BROW)
    hline(d, 17, 28, 36, BROW)

    # Eyes — warm, determined
    rect(d, 14, 19, 22, 24, EYE_WHITE)
    rect(d, 28, 19, 36, 24, EYE_WHITE)
    rect(d, 17, 20, 19, 23, PUPIL)
    rect(d, 31, 20, 33, 23, PUPIL)
    px(d, 18, 20, (100, 90, 80))
    px(d, 32, 20, (100, 90, 80))

    # Nose
    vline(d, 24, 23, 28, SKIN_S)
    px(d, 23, 29, SKIN_S)
    px(d, 25, 29, SKIN_S)

    # Confident smile
    hline(d, 31, 20, 30, LIP)
    px(d, 30, 30, LIP)

    # Gold coin held up in left hand
    # Hand
    rect(d, 2, 36, 10, 42, SKIN)
    # Coin
    glow_extra = int(coin_glow * 15)
    coin_c = tuple(min(255, c + glow_extra) for c in GOLD)
    rect(d, 0, 26, 12, 38, GOLD_D)
    rect(d, 1, 27, 11, 37, coin_c)
    # $ symbol on coin
    vline(d, 6, 29, 35, GOLD_D)
    hline(d, 30, 4, 8, GOLD_D)
    hline(d, 32, 4, 8, GOLD_D)
    hline(d, 34, 4, 8, GOLD_D)

    return img


def main():
    frames = []
    for i in range(FRAMES):
        t = i / FRAMES
        coin_glow = (math.sin(2 * math.pi * t) + 1) / 2
        flag_wave = i
        frame = draw_frame(coin_glow=coin_glow, flag_wave=flag_wave)
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
