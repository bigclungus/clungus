"""
gen_yuki_avatar_c.py — Yuki the Yielding, Option C: "Soft Collapse"

Pastel lavender/pink gradient background. Yuki centered, head bowed slightly,
eyes looking down and away. Hands clasped at chest level. Expression: genuine
empathy tipping into being overwhelmed. Animation: slow gentle head tilt — 2px
over 4 frames, then back — the physical "I understand but..." gesture. 10 frames.
"""

from PIL import Image, ImageDraw
import os
import math

OUT_PATH = "/mnt/data/hello-world/static/avatars/ux_c.gif"
W, H = 64, 64

# Pastel lavender/pink gradient background — almost too warm
BG_TOP        = (235, 210, 240)   # pale lavender
BG_BOT        = (250, 210, 220)   # blush pink
SKIN          = (238, 195, 158)
SKIN_SH       = (200, 155, 118)
SKIN_DARK     = (175, 130, 98)
HAIR          = (52, 34, 22)
HAIR_SHINE    = (88, 58, 38)
SHIRT         = (210, 170, 215)   # muted lavender shirt
SHIRT_SH      = (175, 135, 180)
EYE           = (48, 34, 24)
TEAR_GLOSS    = (200, 220, 255)   # subtle eye moisture highlight
BLUSH         = (240, 180, 185)   # blush on cheeks
LIP           = (210, 130, 120)
HAND          = (238, 195, 158)
HAND_SH       = (200, 155, 118)


def draw_gradient_bg(d, w, h, top_col, bot_col):
    for y in range(h):
        t = y / (h - 1)
        col = tuple(int(top_col[i] + (bot_col[i] - top_col[i]) * t) for i in range(3))
        d.line([(0, y), (w - 1, y)], fill=col)


def draw_frame(tilt_x, tilt_y, blink_t):
    """
    tilt_x, tilt_y: pixel offset for head bow (positive y = downward)
    blink_t: 0=open eyes, 1=closed eyes
    """
    img = Image.new("RGB", (W, H), BG_TOP)
    d = ImageDraw.Draw(img)

    # Gradient background
    draw_gradient_bg(d, W, H, BG_TOP, BG_BOT)

    # -- Body / torso --
    bx, by = 32, 44
    # Shoulders — soft, rounded
    d.ellipse([bx - 14, by - 4, bx + 14, by + 10], fill=SHIRT)
    # Shirt shadow side
    d.chord([bx, by - 4, bx + 14, by + 10], 270, 90, fill=SHIRT_SH)
    # Collar area
    d.ellipse([bx - 5, by - 6, bx + 5, by + 2], fill=SKIN)

    # -- Clasped hands --
    # Hands visible at center, slightly below collar, clasped
    hcx, hcy = bx, by + 6
    d.ellipse([hcx - 8, hcy - 3, hcx + 8, hcy + 5], fill=HAND)
    d.chord([hcx, hcy - 3, hcx + 8, hcy + 5], 270, 90, fill=HAND_SH)
    # Finger lines
    for fx in range(-5, 6, 3):
        d.line([(hcx + fx, hcy - 2), (hcx + fx, hcy + 4)], fill=HAND_SH, width=1)

    # -- Head (with tilt offset) --
    hx = bx + tilt_x
    hy = by - 18 + tilt_y

    # Neck
    d.rectangle([bx - 3, by - 8, bx + 3, by - 4], fill=SKIN)
    d.rectangle([bx, by - 8, bx + 3, by - 4], fill=SKIN_SH)

    # Head base
    d.ellipse([hx - 9, hy - 9, hx + 9, hy + 9], fill=SKIN)
    # Right-side shadow
    d.chord([hx, hy - 9, hx + 9, hy + 9], 270, 90, fill=SKIN_SH)

    # Hair — covering top and sides
    # Top hair mass
    d.chord([hx - 9, hy - 11, hx + 9, hy + 2], 180, 360, fill=HAIR)
    # Left side hair
    d.ellipse([hx - 11, hy - 6, hx - 4, hy + 8], fill=HAIR)
    # Right side hair
    d.ellipse([hx + 3, hy - 6, hx + 11, hy + 8], fill=HAIR)
    # Hair shine highlight
    d.chord([hx - 5, hy - 10, hx + 2, hy - 4], 180, 360, fill=HAIR_SHINE)

    # Blush on cheeks
    d.ellipse([hx - 8, hy + 1, hx - 3, hy + 5], fill=BLUSH)
    d.ellipse([hx + 3, hy + 1, hx + 8, hy + 5], fill=BLUSH)

    # Eyes — looking down and away (shifted down, slightly outward)
    # When head tilts, eyes look further down
    eye_down = int(blink_t * 3)  # 0=open, closes as blink_t increases
    # Left eye
    lex, ley = hx - 3, hy + 1
    if blink_t < 0.5:
        eye_h = max(1, int(3 * (1 - blink_t * 1.5)))
        d.ellipse([lex - 2, ley, lex + 2, ley + eye_h], fill=EYE)
        # Pupil shifted down-left (looking away)
        d.ellipse([lex - 2, ley + 1, lex, ley + eye_h], fill=(20, 14, 8))
        # Gloss
        d.point((lex - 1, ley + 1), fill=(255, 255, 255))
    else:
        # Closed eye — just a curved line
        d.arc([lex - 2, ley, lex + 2, ley + 2], 0, 180, fill=EYE)

    # Right eye
    rex, rey = hx + 3, hy + 1
    if blink_t < 0.5:
        eye_h = max(1, int(3 * (1 - blink_t * 1.5)))
        d.ellipse([rex - 2, rey, rex + 2, rey + eye_h], fill=EYE)
        # Pupil shifted down (looking down/away)
        d.ellipse([rex - 1, rey + 1, rex + 2, rey + eye_h], fill=(20, 14, 8))
        d.point((rex, rey + 1), fill=(255, 255, 255))
    else:
        d.arc([rex - 2, rey, rex + 2, rey + 2], 0, 180, fill=EYE)

    # Brow — soft, slightly inward (the weighted brow of concern)
    d.arc([hx - 5, hy - 4, hx - 1, hy - 1], 200, 340, fill=HAIR, width=1)
    d.arc([hx + 1, hy - 4, hx + 5, hy - 1], 200, 340, fill=HAIR, width=1)

    # Mouth — slightly parted, downturned corners (empathy + weight)
    mx, my = hx, hy + 5
    d.arc([mx - 3, my - 1, mx + 3, my + 2], 180, 360, fill=LIP, width=1)
    # Corner droop
    d.line([(mx - 3, my), (mx - 4, my + 1)], fill=LIP)
    d.line([(mx + 3, my), (mx + 4, my + 1)], fill=LIP)

    # Subtle tear-gloss under eye (just a 1px bright point)
    if tilt_y > 0:
        d.point((lex, ley + 3), fill=TEAR_GLOSS)

    return img


def main():
    # Tilt sequence: head bows gently (tilt_x=-1, tilt_y=+2), holds, returns
    # 10 frames total
    # tilt_x, tilt_y, blink_t
    frames_params = [
        (0,  0,  0.0),   # f0 — neutral
        (0,  0,  0.0),   # f1 — hold neutral
        (-1, 1,  0.0),   # f2 — beginning of tilt
        (-1, 2,  0.05),  # f3 — full tilt, eyes start to soften
        (-1, 2,  0.1),   # f4 — holding tilt
        (-1, 2,  0.05),  # f5 — still there
        (-1, 1,  0.0),   # f6 — easing back
        (0,  0,  0.0),   # f7 — returned neutral
        (0,  0,  0.0),   # f8 — hold neutral
        (0,  0,  0.0),   # f9 — hold
    ]
    durations = [100, 80, 80, 120, 200, 120, 80, 80, 100, 120]

    n = len(frames_params)
    rgb_frames = [draw_frame(*p) for p in frames_params]

    # Build shared palette from all frames
    combined = Image.new("RGB", (W, H * n))
    for i, f in enumerate(rgb_frames):
        combined.paste(f, (0, i * H))
    palette_img = combined.quantize(colors=48, method=Image.Quantize.MEDIANCUT)

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
