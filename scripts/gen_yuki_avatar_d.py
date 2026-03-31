"""
gen_yuki_avatar_d.py — Yuki the Yielding, Option D: "Steely User Advocate"

Cool grey/slate background, clean. Yuki looking DIRECTLY at viewer, jaw set,
expression determined. This is Yuki when a stakeholder has said "users will
figure it out" for the fifth time. No soft colors — muted teal/deep jade accents.
Animation: eyebrows drop very slightly (suppressed frustration micro-expression),
hold, return. 8 frames.
"""

from PIL import Image, ImageDraw
import os

OUT_PATH = "/mnt/data/hello-world/static/avatars/ux_d.gif"
W, H = 64, 64

# Cool grey/slate — clean, unforgiving
BG            = (58, 64, 72)
BG_GRAD_BOT   = (42, 48, 56)

SKIN          = (215, 172, 138)   # slightly cooler/less warm than Option C
SKIN_SH       = (172, 135, 105)
SKIN_DARK     = (145, 112, 86)
HAIR          = (38, 26, 16)
HAIR_MID      = (68, 48, 32)
# Muted teal / deep jade accent — shirt and trim
SHIRT         = (52, 105, 98)     # deep teal
SHIRT_SH      = (34, 72, 68)      # darker jade
SHIRT_ACC     = (72, 145, 132)    # lighter teal accent (collar edge)
EYE           = (44, 32, 20)
EYE_IRIS      = (68, 90, 85)      # cool grey-green iris
LIP           = (175, 108, 92)    # muted, set — not soft
LIP_LINE      = (145, 85, 72)


def draw_gradient_bg(d, w, h, top_col, bot_col):
    for y in range(h):
        t = y / (h - 1)
        col = tuple(int(top_col[i] + (bot_col[i] - top_col[i]) * t) for i in range(3))
        d.line([(0, y), (w - 1, y)], fill=col)


def draw_frame(brow_drop):
    """
    brow_drop: int 0-2, pixels the inner brow corners drop.
    The micro-expression: inner brows draw together and down slightly.
    """
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    draw_gradient_bg(d, W, H, BG, BG_GRAD_BOT)

    # -- Body / torso --
    bx, by = 32, 46

    # Torso — broader, more upright posture than C
    d.polygon([
        (bx - 14, by + 12),
        (bx + 14, by + 12),
        (bx + 12, by - 2),
        (bx,      by - 6),
        (bx - 12, by - 2),
    ], fill=SHIRT)
    # Right-side shadow
    d.polygon([
        (bx,      by - 6),
        (bx + 12, by - 2),
        (bx + 14, by + 12),
        (bx,      by + 12),
    ], fill=SHIRT_SH)
    # Collar — clean teal accent line
    d.line([(bx - 3, by - 6), (bx, by - 2)], fill=SHIRT_ACC, width=1)
    d.line([(bx + 3, by - 6), (bx, by - 2)], fill=SHIRT_ACC, width=1)

    # -- Neck --
    d.rectangle([bx - 3, by - 10, bx + 3, by - 5], fill=SKIN)
    d.rectangle([bx, by - 10, bx + 3, by - 5], fill=SKIN_SH)

    # -- Head --
    hx, hy = bx, by - 20

    # Head — slightly wider/squarer than C — jaw set
    d.ellipse([hx - 9, hy - 8, hx + 9, hy + 10], fill=SKIN)
    # Jaw shadow (more defined)
    d.chord([hx, hy - 8, hx + 9, hy + 10], 270, 90, fill=SKIN_SH)
    # Chin emphasis — jaw line
    d.arc([hx - 7, hy + 5, hx + 7, hy + 12], 0, 180, fill=SKIN_DARK, width=1)

    # Hair — pulled back, no-nonsense
    d.chord([hx - 9, hy - 10, hx + 9, hy + 0], 180, 360, fill=HAIR)
    # Tight sides
    d.ellipse([hx - 11, hy - 5, hx - 5, hy + 4], fill=HAIR)
    d.ellipse([hx + 5,  hy - 5, hx + 11, hy + 4], fill=HAIR)
    # Hair mid-tone (slight sheen, still dark)
    d.chord([hx - 4, hy - 9, hx + 3, hy - 3], 180, 360, fill=HAIR_MID)

    # -- Eyes -- looking DIRECTLY forward, level
    # Left eye
    lex, ley = hx - 3, hy + 1
    d.ellipse([lex - 3, ley - 2, lex + 3, ley + 3], fill=(255, 255, 255))  # white
    d.ellipse([lex - 2, ley - 1, lex + 2, ley + 2], fill=EYE_IRIS)
    d.ellipse([lex - 1, ley,     lex + 1, ley + 2], fill=EYE)
    d.point((lex - 1, ley), fill=(255, 255, 255))  # glint — sharp

    # Right eye
    rex, rey = hx + 3, hy + 1
    d.ellipse([rex - 3, rey - 2, rex + 3, rey + 3], fill=(255, 255, 255))
    d.ellipse([rex - 2, rey - 1, rex + 2, rey + 2], fill=EYE_IRIS)
    d.ellipse([rex - 1, rey,     rex + 1, rey + 2], fill=EYE)
    d.point((rex + 1, rey), fill=(255, 255, 255))

    # -- Brows -- the micro-expression
    # Neutral: straight brows, slightly stern
    # brow_drop affects the inner corner only — pulls them down and together
    # Left brow: inner corner drops by brow_drop px
    lbx0, lby0 = hx - 5, hy - 4              # outer corner (fixed)
    lbx1, lby1 = hx - 1, hy - 5 + brow_drop  # inner corner (drops)
    d.line([(lbx0, lby0), (lbx1, lby1)], fill=HAIR, width=2)

    # Right brow: inner corner drops by brow_drop px
    rbx0, rby0 = hx + 5, hy - 4              # outer corner (fixed)
    rbx1, rby1 = hx + 1, hy - 5 + brow_drop  # inner corner (drops)
    d.line([(rbx0, rby0), (rbx1, rby1)], fill=HAIR, width=2)

    # -- Mouth -- set, jaw held, slight compression
    mx, my = hx, hy + 6
    # Lips pressed together — flat, controlled
    d.line([(mx - 4, my), (mx + 4, my)], fill=LIP_LINE, width=1)
    d.arc([mx - 4, my - 2, mx + 4, my + 1], 0, 180, fill=LIP, width=1)
    # No visible upturn, no downturn — held
    # Very subtle cheek tension lines
    d.point((mx - 5, my - 1), fill=SKIN_SH)
    d.point((mx + 5, my - 1), fill=SKIN_SH)

    return img


def main():
    # brow_drop sequence: 0 -> 0 -> 1 -> 2 -> 2 -> 2 -> 1 -> 0
    frames_params = [0, 0, 1, 2, 2, 2, 1, 0]
    durations     = [80, 80, 60, 80, 200, 200, 60, 100]

    n = len(frames_params)
    rgb_frames = [draw_frame(p) for p in frames_params]

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
