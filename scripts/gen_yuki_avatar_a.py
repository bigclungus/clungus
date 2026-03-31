"""
gen_yuki_avatar_a.py — Yuki the Yielding, Option A
Isometric 64x64 animated GIF, pure Pillow, loop=0, disposal=2.

Visual concept: Yuki seated at an isometric desk, leaning forward and pointing
at a monitor that pulses between a normal teal glow and an orange-red error
highlight. Warm amber desk, dark background. 8 frames.
"""

from PIL import Image, ImageDraw
import os

OUT_PATH = "/mnt/data/hello-world/static/avatars/ux_a.gif"
W, H = 64, 64

BG           = (18, 20, 28)
DESK_TOP     = (180, 130, 60)
DESK_LEFT    = (110, 78, 28)
DESK_RIGHT   = (145, 105, 45)
MONITOR_B    = (28, 28, 48)
SCREEN_NORM  = (38, 195, 175)
SCREEN_ERR   = (235, 95, 55)
CHAIR_TOP    = (60, 68, 108)
CHAIR_DARK   = (38, 46, 72)
SKIN         = (228, 182, 142)
SKIN_SH      = (188, 145, 108)
HAIR         = (42, 28, 18)
SHIRT        = (75, 158, 148)
SHIRT_SH     = (48, 108, 98)
ARM          = (228, 182, 142)
UI_DARK_N    = (18, 138, 118)
UI_DARK_E    = (175, 55, 28)


def lerp_col(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_iso_box(d, cx, cy, hw, qw, depth, top_col, left_col, right_col):
    top = [(cx, cy - qw), (cx + hw, cy), (cx, cy + qw), (cx - hw, cy)]
    d.polygon(top, fill=top_col)
    left_f = [(cx - hw, cy), (cx, cy + qw), (cx, cy + qw + depth), (cx - hw, cy + depth)]
    d.polygon(left_f, fill=left_col)
    right_f = [(cx, cy + qw), (cx + hw, cy), (cx + hw, cy + depth), (cx, cy + qw + depth)]
    d.polygon(right_f, fill=right_col)


def draw_frame(pulse, hand_dy):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Chair seat
    draw_iso_box(d, 22, 42, 7, 4, 3, CHAIR_TOP, CHAIR_DARK, CHAIR_DARK)
    # Chair back
    d.rectangle([14, 32, 17, 42], fill=CHAIR_DARK)

    # Desk
    draw_iso_box(d, 36, 38, 14, 7, 6, DESK_TOP, DESK_LEFT, DESK_RIGHT)

    # Monitor stand
    d.rectangle([40, 31, 42, 37], fill=MONITOR_B)
    d.rectangle([38, 37, 44, 38], fill=MONITOR_B)

    # Monitor bezel
    d.rectangle([32, 21, 50, 32], fill=MONITOR_B)

    # Screen
    scr = lerp_col(SCREEN_NORM, SCREEN_ERR, pulse)
    d.rectangle([33, 22, 49, 31], fill=scr)

    # UI elements on screen
    ui_col = lerp_col(UI_DARK_N, UI_DARK_E, pulse)
    d.rectangle([33, 22, 49, 24], fill=ui_col)       # header
    d.rectangle([33, 25, 40, 28], fill=ui_col)       # left block
    d.rectangle([42, 25, 49, 28], fill=ui_col)       # right block

    # Error X on screen
    if pulse > 0.3:
        ex = 41
        ey = 26
        w2 = int(pulse * 2)
        for i in range(-w2, w2 + 1):
            for xx, yy in [(ex + i, ey + i), (ex + i, ey - i)]:
                if 33 <= xx <= 49 and 22 <= yy <= 31:
                    d.point((xx, yy), fill=(250, 250, 250))

    # Figure body
    bx, by = 24, 33

    # Torso
    d.polygon([
        (bx,     by - 6),
        (bx + 5, by - 3),
        (bx + 5, by + 1),
        (bx,     by + 3),
        (bx - 5, by + 1),
        (bx - 5, by - 3),
    ], fill=SHIRT)
    d.polygon([
        (bx,     by - 3),
        (bx + 5, by - 3),
        (bx + 5, by + 1),
        (bx,     by + 3),
    ], fill=SHIRT_SH)

    # Head
    hx, hy = bx, by - 10
    d.ellipse([hx - 5, hy - 4, hx + 5, hy + 4], fill=SKIN)
    d.chord([hx - 5, hy - 5, hx + 5, hy + 1], 180, 360, fill=HAIR)
    d.ellipse([hx + 3, hy - 3, hx + 6, hy], fill=HAIR)
    # Right-side shadow
    d.chord([hx, hy - 4, hx + 5, hy + 4], 270, 90, fill=SKIN_SH)
    # Eyes
    d.ellipse([hx - 3, hy - 1, hx - 1, hy + 1], fill=(38, 28, 18))
    d.ellipse([hx + 1, hy - 1, hx + 3, hy + 1], fill=(38, 28, 18))
    # Mouth — slightly open, engaged
    d.arc([hx - 2, hy + 1, hx + 2, hy + 3], 0, 180, fill=(155, 95, 75))

    # Pointing arm
    hy2 = int(by - 2 + hand_dy)
    d.line([(bx + 5, by - 2), (bx + 11, hy2)], fill=ARM, width=2)
    d.line([(bx + 11, hy2), (bx + 18, hy2 - 2)], fill=ARM, width=2)
    d.ellipse([bx + 16, hy2 - 3, bx + 20, hy2 + 1], fill=SKIN)

    # Left arm resting
    d.line([(bx - 5, by - 1), (bx - 5, by + 5)], fill=ARM, width=2)
    d.ellipse([bx - 7, by + 4, bx - 3, by + 7], fill=SKIN)

    # Legs
    d.line([(bx - 2, by + 3), (bx - 2, by + 8)], fill=SHIRT_SH, width=2)
    d.line([(bx + 2, by + 3), (bx + 2, by + 8)], fill=SHIRT_SH, width=2)

    return img


def main():
    pulse_seq   = [0.0, 0.2, 0.55, 1.0, 1.0, 0.6, 0.25, 0.0]
    hand_dy_seq = [0,   0,   -1,   -1,  -1,  0,   1,    0  ]
    durations   = [80,  80,  80,   120, 120, 80,  80,   80 ]
    n = len(pulse_seq)

    # Collect all RGB frames first, then quantize with a shared palette
    rgb_frames = [draw_frame(pulse_seq[i], hand_dy_seq[i]) for i in range(n)]

    # Build a palette from all frames combined
    combined = Image.new("RGB", (W, H * n))
    for i, f in enumerate(rgb_frames):
        combined.paste(f, (0, i * H))
    palette_img = combined.quantize(colors=32, method=Image.Quantize.MEDIANCUT)

    # Quantize each frame using the master palette
    p_frames = []
    for f in rgb_frames:
        pf = f.quantize(palette=palette_img, dither=0)
        p_frames.append(pf)

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    p_frames[0].save(
        OUT_PATH,
        save_all=True,
        append_images=p_frames[1:],
        loop=0,
        duration=durations,
        disposal=2,
        optimize=False,
    )
    print(f"Saved {OUT_PATH} ({n} frames)")


if __name__ == "__main__":
    main()
