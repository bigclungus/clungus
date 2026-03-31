#!/usr/bin/env python3
"""Generate a 64x64 animated GIF avatar for Hasan Piker — streaming socialist."""

from PIL import Image, ImageDraw
import math
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/hasan.gif"
SIZE = 64
FRAMES = 12

# --- Palette ---
BG          = (18, 18, 22)       # dark background
SKIN        = (185, 138, 95)     # olive/tan skin tone
SKIN_S      = (155, 110, 72)     # shadow
SKIN_H      = (205, 158, 112)    # highlight
HAIR        = (28, 22, 18)       # very dark brown/black
STUBBLE     = (55, 42, 30)       # beard stubble
RED         = (210, 35, 35)      # socialist red — primary accent
RED_D       = (160, 20, 20)      # dark red
WHITE       = (235, 235, 235)    # shirt/text
SHIRT_DARK  = (200, 200, 200)    # shirt shadow
EYE_DARK    = (30, 22, 15)       # dark pupils/eyes
EYE_WHITE   = (220, 210, 200)    # eye white
BROW        = (38, 28, 18)       # eyebrow
LIP         = (165, 105, 75)     # lips
TEETH       = (240, 235, 225)    # teeth when smiling
CHAT_BG     = (30, 30, 38)       # stream chat background
CHAT_LINE1  = (90, 200, 100)     # chat username green
CHAT_LINE2  = (100, 150, 240)    # chat username blue
CHAT_TEXT   = (180, 180, 190)    # chat message text


def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


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


def draw_chat_panel(d, scroll_offset=0):
    """Draw a small Twitch-chat-style panel in bottom-right corner."""
    # Panel background
    rect(d, 38, 44, 63, 63, CHAT_BG)
    # Border top
    hline(d, 44, 38, 63, RED_D)

    # Scrolling chat lines — 3 rows, each with username + message stub
    lines = [
        (CHAT_LINE1, (150, 150, 155)),
        (CHAT_LINE2, (150, 150, 155)),
        (RED,        (150, 150, 155)),
    ]
    for i, (name_col, txt_col) in enumerate(lines):
        y = 47 + ((i + scroll_offset) % 3) * 6
        if 45 <= y <= 60:
            # username dot
            px(d, 40, y, name_col)
            px(d, 41, y, name_col)
            # text stub
            for x in range(43, 43 + 16):
                if (x + y) % 3 != 0:
                    px(d, x, y, txt_col)


def draw_frame(mouth_open=False, scroll_offset=0, brow_raise=False):
    img = Image.new("RGB", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)

    # --- Chat panel (background element) ---
    draw_chat_panel(d, scroll_offset)

    # --- Body / shirt ---
    # Torso — white/grey t-shirt
    rect(d, 14, 46, 50, 63, WHITE)
    rect(d, 14, 46, 14, 63, SHIRT_DARK)
    # Red logo/print on shirt (fist silhouette suggestion — just a bold red block)
    rect(d, 26, 50, 38, 58, RED_D)
    px(d, 27, 49, RED)
    px(d, 28, 49, RED)
    px(d, 30, 49, RED)
    px(d, 33, 49, RED)
    px(d, 35, 49, RED)
    px(d, 37, 49, RED)

    # Neck
    rect(d, 27, 40, 36, 47, SKIN)

    # --- Head ---
    # Head base
    rect(d, 18, 18, 45, 40, SKIN)
    # Cheek rounding
    for x in [18, 45]:
        for y in [18, 19, 38, 39, 40]:
            px(d, x, y, BG)
    px(d, 18, 20, SKIN)
    px(d, 45, 20, SKIN)
    px(d, 18, 37, SKIN)
    px(d, 45, 37, SKIN)
    # Jaw shadow
    hline(d, 39, 20, 43, SKIN_S)
    hline(d, 40, 22, 41, SKIN_S)

    # Side shadow
    vline(d, 18, 21, 36, SKIN_S)
    vline(d, 45, 21, 36, SKIN_S)

    # Cheek highlight
    vline(d, 44, 22, 30, SKIN_H)
    rect(d, 19, 22, 21, 30, SKIN_S)

    # --- Hair ---
    # Top hair — full dark cap
    rect(d, 18, 10, 45, 22, HAIR)
    # Hair shape — rounded top
    for x in range(18, 46):
        for y in range(8, 12):
            if abs(x - 31) + abs(y - 14) < 14:
                px(d, x, y, HAIR)
    # Fade into forehead
    hline(d, 18, 19, 44, HAIR)
    hline(d, 19, 20, 43, HAIR)
    hline(d, 20, 20, 43, HAIR)
    # Side hair / ears region
    rect(d, 15, 18, 19, 32, HAIR)
    rect(d, 45, 18, 48, 32, HAIR)

    # Ears
    rect(d, 15, 26, 18, 33, SKIN)
    rect(d, 46, 26, 49, 33, SKIN)
    px(d, 16, 29, SKIN_S)
    px(d, 47, 29, SKIN_S)

    # --- Eyebrows ---
    brow_y = 22 if brow_raise else 23
    hline(d, brow_y, 22, 27, BROW)
    hline(d, brow_y, 36, 41, BROW)
    if brow_raise:
        hline(d, brow_y - 1, 23, 26, BROW)
        hline(d, brow_y - 1, 37, 40, BROW)

    # --- Eyes ---
    # Eye whites
    rect(d, 22, 25, 28, 29, EYE_WHITE)
    rect(d, 35, 25, 41, 29, EYE_WHITE)
    # Pupils (dark brown)
    rect(d, 24, 26, 26, 28, EYE_DARK)
    rect(d, 37, 26, 39, 28, EYE_DARK)
    # Specular
    px(d, 25, 26, (90, 75, 60))
    px(d, 38, 26, (90, 75, 60))
    # Lower lid shadow
    hline(d, 29, 22, 28, SKIN_S)
    hline(d, 29, 35, 41, SKIN_S)

    # --- Nose ---
    # Bridge
    vline(d, 31, 29, 33, SKIN_S)
    # Nostrils
    px(d, 29, 34, SKIN_S)
    px(d, 33, 34, SKIN_S)
    hline(d, 34, 29, 33, SKIN_S)

    # --- Beard / stubble ---
    # Heavy stubble on jaw and cheeks
    for x in range(19, 45):
        for y in range(34, 41):
            if (x * 7 + y * 13) % 5 == 0:
                px(d, x, y, STUBBLE)
    # Thick mustache
    hline(d, 35, 26, 37, STUBBLE)
    hline(d, 36, 25, 38, STUBBLE)
    hline(d, 35, 26, 38, STUBBLE)

    # --- Mouth ---
    if mouth_open:
        # Open mouth — talking / streaming
        rect(d, 26, 36, 37, 39, (100, 55, 40))
        hline(d, 36, 27, 36, TEETH)
        px(d, 27, 37, (80, 40, 30))
    else:
        # Slight confident smirk
        hline(d, 36, 27, 36, LIP)
        px(d, 26, 37, LIP)
        px(d, 37, 37, LIP)
        px(d, 37, 36, LIP)

    return img


def main():
    frames = []
    for i in range(FRAMES):
        t = i / FRAMES
        phase = (math.sin(2 * math.pi * t) + 1) / 2

        # Mouth opens briefly every ~4 frames (simulating talking)
        mouth_open = (i % 4) in (1, 2)

        # Eyebrow raise on certain frames
        brow_raise = (i % 6) == 0

        # Chat scrolls every 3 frames
        scroll_offset = i // 3

        frame = draw_frame(
            mouth_open=mouth_open,
            scroll_offset=scroll_offset,
            brow_raise=brow_raise,
        )
        frames.append(frame)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    frames[0].save(
        OUTPUT_PATH,
        save_all=True,
        append_images=frames[1:],
        loop=0,
        duration=100,
        optimize=False,
    )
    print(f"Saved {FRAMES}-frame GIF to {OUTPUT_PATH}")
    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"File size: {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
