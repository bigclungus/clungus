#!/usr/bin/env python3
"""
Adelbert Hominem - Avatar B
"The Character Assassin"

A different visual take: Adelbert seen from isometric side angle, holding a quill/pen
as a weapon metaphor. He's leaning forward over a scroll/paper, crossing out words
with a sharp diagonal slash — a visual metaphor for striking out arguments and attacking
the arguer. Monocle glint. Smug expression.

Animated: quill moves in a slashing motion across the paper; monocle glints.

64x64 animated GIF, pure Pillow, loop=0, disposal=2.
"""

from PIL import Image, ImageDraw
import os

OUTPUT = "/mnt/data/hello-world/static/avatars/adelbert_b.gif"

# Palette
BG           = (0, 0, 0, 0)
SUIT_DARK    = (25, 18, 45)
SUIT_MID     = (40, 30, 62)
SUIT_LIGHT   = (65, 52, 90)
SKIN         = (215, 170, 125)
SKIN_SHADOW  = (170, 128, 85)
HAIR         = (18, 12, 8)
HAIR_HIGH    = (45, 36, 24)
EYE_WHITE    = (238, 233, 220)
EYE_IRIS     = (55, 38, 18)
SHIRT        = (228, 225, 215)
TIE          = (170, 25, 25)
TIE_DARK     = (110, 8, 8)
DESK_TOP     = (95, 65, 35)
DESK_FRONT   = (65, 42, 18)
PAPER        = (240, 235, 210)
PAPER_SHADOW = (200, 195, 170)
QUILL_SHAFT  = (230, 215, 180)
QUILL_TIP    = (220, 200, 160)
QUILL_BARB1  = (210, 195, 150)
QUILL_BARB2  = (245, 235, 200)
INK_RED      = (180, 20, 20)      # red ink — strikes out with red
MONOCLE      = (180, 160, 80)     # gold monocle frame
MONOCLE_LENS = (160, 200, 220, 80)  # tinted lens
GLINT        = (255, 255, 220)    # monocle glint


def draw_scene(d, slash_progress=0.0, monocle_glint=False, rgba=True):
    """
    slash_progress: 0.0 (no slash) to 1.0 (full slash across paper)
    monocle_glint: bool
    """

    # floor shadow
    d.ellipse([8, 46, 56, 54], fill=(8, 6, 18, 70) if rgba else (8, 6, 18))

    # --- desk ---
    d.polygon([(10, 38), (50, 38), (54, 42), (14, 42)], fill=DESK_TOP)
    d.polygon([(14, 42), (54, 42), (54, 50), (14, 50)], fill=DESK_FRONT)
    d.polygon([(10, 38), (14, 42), (14, 50), (10, 46)], fill=(50, 30, 12))
    d.line([(10, 38), (50, 38)], fill=(130, 90, 48), width=1)

    # --- paper on desk ---
    d.polygon([(18, 34), (46, 34), (48, 40), (20, 40)], fill=PAPER)
    d.polygon([(18, 34), (20, 40), (20, 38), (18, 36)], fill=PAPER_SHADOW)
    # paper lines (text being crossed out)
    for y in [36, 37, 38]:
        d.line([(22, y), (44, y - 1)], fill=(180, 175, 155), width=1)

    # --- red slash on paper (growing with progress) ---
    if slash_progress > 0:
        sx_start, sy_start = 20, 35
        sx_end, sy_end = 46, 39
        sx_cur = int(sx_start + (sx_end - sx_start) * slash_progress)
        sy_cur = int(sy_start + (sy_end - sy_start) * slash_progress)
        d.line([(sx_start, sy_start), (sx_cur, sy_cur)], fill=INK_RED, width=2)
        # second slash line (double strike)
        if slash_progress > 0.4:
            p2 = (slash_progress - 0.4) / 0.6
            sx2_cur = int(sx_start + (sx_end - sx_start) * p2)
            sy2_cur = int(sy_start + 1 + (sy_end - sy_start) * p2)
            d.line([(sx_start, sy_start + 1), (sx2_cur, sy2_cur)],
                   fill=(220, 30, 30), width=1)

    # --- body ---
    d.polygon([(22, 16), (42, 16), (44, 38), (20, 38)], fill=SUIT_DARK)
    d.polygon([(22, 16), (27, 16), (29, 38), (20, 38)], fill=SUIT_MID)
    d.polygon([(37, 16), (42, 16), (44, 38), (40, 38)], fill=(16, 10, 32))

    # shirt & tie
    d.polygon([(28, 17), (36, 17), (35, 36), (29, 36)], fill=SHIRT)
    d.polygon([(30, 18), (34, 18), (33, 34), (31, 34)], fill=TIE)
    d.polygon([(30, 18), (32, 18), (31, 34)], fill=TIE_DARK)
    d.ellipse([29, 17, 35, 21], fill=TIE)

    # lapels
    d.polygon([(27, 17), (22, 23), (28, 25)], fill=SUIT_LIGHT)
    d.polygon([(37, 17), (42, 23), (36, 25)], fill=(14, 9, 28))

    # shoulders
    d.ellipse([17, 13, 27, 21], fill=SUIT_MID)
    d.ellipse([37, 13, 47, 21], fill=SUIT_DARK)

    # --- left arm (leaning forward on desk) ---
    d.polygon([(20, 22), (25, 22), (23, 36), (18, 36)], fill=SUIT_DARK)
    d.rectangle([18, 34, 24, 37], fill=SHIRT)
    d.ellipse([17, 35, 25, 40], fill=SKIN)  # hand on desk

    # --- right arm (holding quill, angled down to paper) ---
    d.polygon([(40, 20), (44, 20), (50, 30), (46, 30)], fill=SUIT_MID)
    d.rectangle([46, 28, 52, 31], fill=SHIRT)
    # hand holding quill
    d.ellipse([46, 28, 54, 34], fill=SKIN)

    # --- quill ---
    # shaft
    qx_base, qy_base = 50, 29   # held end
    qx_tip, qy_tip = 38, 37    # tip on paper
    d.line([(qx_base, qy_base), (qx_tip, qy_tip)], fill=QUILL_SHAFT, width=2)
    # barbs on quill
    for i in range(4):
        t = i / 4.0
        mx = int(qx_base + (qx_tip - qx_base) * t)
        my = int(qy_base + (qy_tip - qy_base) * t)
        d.line([(mx - 2, my - 2), (mx + 2, my)], fill=QUILL_BARB1, width=1)
        d.line([(mx - 2, my + 2), (mx + 1, my)], fill=QUILL_BARB2, width=1)
    # tip
    d.ellipse([qx_tip - 1, qy_tip - 1, qx_tip + 1, qy_tip + 1], fill=(20, 20, 20))

    # --- neck ---
    d.rectangle([28, 10, 36, 17], fill=SKIN)

    # --- head ---
    d.ellipse([22, 2, 42, 14], fill=SKIN)
    d.polygon([(22, 8), (42, 8), (40, 14), (24, 14)], fill=SKIN)
    d.ellipse([22, 7, 28, 13], fill=SKIN_SHADOW)  # cheek shadow

    # --- hair (slicked, severe side part) ---
    d.ellipse([22, 1, 42, 9], fill=HAIR)
    d.polygon([(22, 5), (42, 5), (40, 2), (24, 2)], fill=HAIR)
    d.line([(27, 3), (39, 3)], fill=HAIR_HIGH, width=1)
    # part line
    d.line([(32, 2), (32, 7)], fill=HAIR_HIGH, width=1)

    # --- right eye (with monocle) ---
    # monocle frame
    d.ellipse([34, 8, 40, 13], fill=None, outline=MONOCLE, width=1)
    # lens tint
    d.ellipse([35, 9, 39, 12], fill=(160, 200, 220, 60) if rgba else (160, 200, 220))
    # eye inside monocle
    d.ellipse([35, 9, 39, 12], fill=EYE_WHITE)
    d.ellipse([36, 9, 38, 11], fill=EYE_IRIS)
    d.point((37, 10), fill=(5, 5, 5))
    # monocle chain
    d.line([(40, 11), (42, 14)], fill=MONOCLE, width=1)

    # glint on monocle
    if monocle_glint:
        d.point((35, 9), fill=GLINT)
        d.point((36, 9), fill=GLINT)

    # --- left eye (narrowed, contemptuous) ---
    d.ellipse([25, 9, 31, 12], fill=EYE_WHITE)
    d.ellipse([26, 9, 30, 11], fill=EYE_IRIS)
    d.point((28, 10), fill=(5, 5, 5))
    # heavy brow
    d.line([(24, 8), (32, 8)], fill=HAIR, width=2)
    d.line([(33, 8), (41, 8)], fill=HAIR, width=1)
    # left brow inner raised (sneer)
    d.line([(24, 8), (27, 7)], fill=HAIR, width=1)

    # --- nose ---
    d.line([(30, 10), (30, 12)], fill=SKIN_SHADOW, width=1)
    d.point((29, 12), fill=SKIN_SHADOW)
    d.point((31, 12), fill=SKIN_SHADOW)

    # --- mouth (smug half-smile) ---
    d.arc([26, 12, 34, 15], start=15, end=165, fill=(150, 90, 70), width=1)
    d.line([(33, 13), (35, 12)], fill=(150, 90, 70), width=1)  # smug upturn right


def make_frame(slash_progress=0.0, monocle_glint=False):
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_scene(d, slash_progress=slash_progress, monocle_glint=monocle_glint, rgba=True)
    return img


def make_frames():
    frames = []
    durations = []

    # Frame 1: quill poised, no slash yet
    frames.append(make_frame(slash_progress=0.0, monocle_glint=False))
    durations.append(200)

    # Frame 2: slash begins
    frames.append(make_frame(slash_progress=0.3, monocle_glint=False))
    durations.append(60)

    # Frame 3: slash midway + monocle glints
    frames.append(make_frame(slash_progress=0.6, monocle_glint=True))
    durations.append(60)

    # Frame 4: slash complete
    frames.append(make_frame(slash_progress=1.0, monocle_glint=True))
    durations.append(180)

    # Frame 5: held — admiring the strike
    frames.append(make_frame(slash_progress=1.0, monocle_glint=False))
    durations.append(400)

    # Frame 6: glint flashes again
    frames.append(make_frame(slash_progress=1.0, monocle_glint=True))
    durations.append(80)

    # Frame 7: back to start (quill lifts)
    frames.append(make_frame(slash_progress=0.0, monocle_glint=False))
    durations.append(120)

    return frames, durations


def main():
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    frames, durations = make_frames()

    palette_frames = []
    for f in frames:
        out = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        out.paste(f, (0, 0), f)
        palette_frames.append(out.convert("P", palette=Image.ADAPTIVE, colors=128))

    palette_frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=palette_frames[1:],
        loop=0,
        duration=durations,
        disposal=2,
        transparency=0,
    )
    print(f"Saved: {OUTPUT}")


if __name__ == "__main__":
    main()
