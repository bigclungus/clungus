#!/usr/bin/env python3
"""
Generate Ibrahim the Immovable avatar - Option D: Composure as Armor
64x64 animated GIF, isometric bust, 8 frames
"""

from PIL import Image, ImageDraw
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/hiring-manager_d.gif"
SIZE = (64, 64)

# ── Palette ──────────────────────────────────────────────────────────────────
BG_NEAR_BLACK   = (10,  8, 12)
WARM_GLOW_FAINT = (28, 18, 10)   # faint warm wash at bottom
SUIT_DARK       = (22, 22, 30)   # near-black formal jacket
SUIT_MID        = (34, 34, 46)
SUIT_HIGHLIGHT  = (52, 50, 66)   # very subtle edge catch
COLLAR_WHITE    = (210, 205, 198)
TIE_DARK        = (40, 20, 20)
SKIN_MID        = (180, 130, 95)
SKIN_LIGHT      = (200, 150, 110)
SKIN_SHADOW     = (130,  88, 60)
SKIN_DEEP       = (100,  65, 42)
DARK_CIRCLE     = (90,  60, 50)   # under-eye shadow
EYE_WHITE       = (220, 215, 208)
IRIS_FOCUSED    = (55,  42, 35)   # dark brown iris, present
IRIS_UNFOCUSED  = (100,  90, 85)  # grey-brown, absent
PUPIL_FOCUSED   = (12,   8,  6)
PUPIL_UNFOCUSED = (60,  55, 52)   # dim pupil when mentally gone
EYELID          = (155, 108, 74)
BROW            = (55,  38, 28)
PEN_BARREL      = (160, 140, 80)
PEN_TIP         = (120, 100, 55)
PEN_CLIP        = (190, 170, 100)
HAND_SKIN       = (175, 125, 90)

def draw_background(draw, warm=False):
    """Near-black bg with very faint warm glow from bottom (desk lamp)."""
    for y in range(64):
        # Gradient: warmer near bottom
        t = max(0, (y - 38) / 25.0)
        r = int(BG_NEAR_BLACK[0] + (WARM_GLOW_FAINT[0] - BG_NEAR_BLACK[0]) * t)
        g = int(BG_NEAR_BLACK[1] + (WARM_GLOW_FAINT[1] - BG_NEAR_BLACK[1]) * t)
        b = int(BG_NEAR_BLACK[2] + (WARM_GLOW_FAINT[2] - BG_NEAR_BLACK[2]) * t)
        draw.line([(0, y), (63, y)], fill=(r, g, b))

def draw_suit(draw):
    """
    Isometric bust — formal dark suit, slight top-down.
    Shoulders wider at top, jacket body below.
    """
    # Jacket body — fills lower ~30 rows
    # Isometric slight-right bias
    jacket_pts = [
        (10, 64), (10, 40), (18, 36), (32, 34), (46, 36), (54, 40), (54, 64)
    ]
    draw.polygon(jacket_pts, fill=SUIT_DARK)

    # Left shoulder facet (slightly lighter — catches ambient)
    left_shoulder = [(10, 40), (18, 36), (18, 44), (10, 48)]
    draw.polygon(left_shoulder, fill=SUIT_MID)

    # Right shoulder facet (darker)
    right_shoulder = [(46, 36), (54, 40), (54, 48), (46, 44)]
    draw.polygon(right_shoulder, fill=SUIT_DARK)

    # Very subtle highlight on left lapel edge
    draw.line([(18, 36), (26, 38)], fill=SUIT_HIGHLIGHT)

    # White shirt collar — two small triangles
    # Left collar
    draw.polygon([(26, 37), (32, 34), (32, 40), (28, 41)], fill=COLLAR_WHITE)
    # Right collar
    draw.polygon([(38, 37), (32, 34), (32, 40), (36, 41)], fill=COLLAR_WHITE)

    # Tie — narrow dark strip
    draw.polygon([(31, 40), (33, 40), (34, 52), (30, 52)], fill=TIE_DARK)

def draw_neck(draw):
    draw.rectangle([29, 32, 35, 38], fill=SKIN_MID)
    # Neck shadow sides
    draw.line([(29, 32), (29, 38)], fill=SKIN_SHADOW)
    draw.line([(35, 32), (35, 38)], fill=SKIN_SHADOW)

def draw_head(draw):
    """
    Isometric head — slightly wider than tall, top-down angle means
    top of head foreshortened.
    """
    # Main head shape
    head_pts = [
        (18, 28), (22, 18), (32, 14), (42, 18), (46, 28),
        (44, 36), (32, 38), (20, 36)
    ]
    draw.polygon(head_pts, fill=SKIN_MID)

    # Top of head — darker (top-down foreshortening)
    top_pts = [(22, 18), (32, 14), (42, 18), (38, 22), (32, 20), (26, 22)]
    draw.polygon(top_pts, fill=SKIN_SHADOW)

    # Hair — dark, flat on top, slight iso sheen
    hair_pts = [(22, 18), (32, 13), (42, 18), (38, 21), (32, 19), (26, 21)]
    draw.polygon(hair_pts, fill=(28, 20, 16))
    # Hair highlight — single pixel glint
    draw.point((32, 14), fill=(55, 42, 35))

    # Left face plane — slightly shadowed
    left_face = [(18, 28), (22, 18), (26, 22), (24, 32)]
    draw.polygon(left_face, fill=SKIN_SHADOW)

    # Jaw / chin
    draw.polygon([(24, 34), (32, 36), (40, 34), (38, 38), (32, 40), (26, 38)],
                 fill=SKIN_DEEP)

def draw_ears(draw):
    # Left ear (partially visible)
    draw.polygon([(18, 27), (20, 24), (20, 30), (18, 31)], fill=SKIN_MID)
    draw.line([(19, 25), (19, 30)], fill=SKIN_SHADOW)
    # Right ear (partially visible, slightly lighter)
    draw.polygon([(44, 27), (46, 24), (46, 30), (44, 31)], fill=SKIN_LIGHT)

def draw_dark_circles(draw):
    """Just a few pixels of muted shadow beneath each eye socket."""
    # Under left eye
    draw.point((26, 29), fill=DARK_CIRCLE)
    draw.point((27, 30), fill=DARK_CIRCLE)
    # Under right eye
    draw.point((37, 29), fill=DARK_CIRCLE)
    draw.point((38, 30), fill=DARK_CIRCLE)

def draw_eyebrows(draw):
    # Left brow — slightly inward, mild furrow
    draw.line([(24, 23), (28, 22)], fill=BROW, width=1)
    # Right brow — matching
    draw.line([(36, 22), (40, 23)], fill=BROW, width=1)

def draw_eyes(draw, unfocused=False):
    """
    Eyes: neutral, direct. When unfocused: pupils go grey/dim.
    """
    iris = IRIS_UNFOCUSED if unfocused else IRIS_FOCUSED
    pupil = PUPIL_UNFOCUSED if unfocused else PUPIL_FOCUSED

    # Left eye socket shadow
    draw.ellipse([23, 24, 30, 29], fill=SKIN_SHADOW)
    # Left eye white
    draw.ellipse([24, 25, 29, 28], fill=EYE_WHITE)
    # Left iris
    draw.ellipse([25, 25, 28, 28], fill=iris)
    # Left pupil
    draw.point((26, 26), fill=pupil)
    draw.point((27, 26), fill=pupil)
    # Left upper eyelid line
    draw.line([(24, 25), (29, 25)], fill=EYELID)

    # Right eye socket shadow
    draw.ellipse([34, 24, 41, 29], fill=SKIN_SHADOW)
    # Right eye white
    draw.ellipse([35, 25, 40, 28], fill=EYE_WHITE)
    # Right iris
    draw.ellipse([36, 25, 39, 28], fill=iris)
    # Right pupil
    draw.point((37, 26), fill=pupil)
    draw.point((38, 26), fill=pupil)
    # Right upper eyelid line
    draw.line([(35, 25), (40, 25)], fill=EYELID)

def draw_nose(draw):
    # Simple isometric nose — a small shadow triangle
    draw.polygon([(31, 28), (33, 28), (32, 32)], fill=SKIN_SHADOW)
    draw.point((32, 31), fill=SKIN_DEEP)

def draw_mouth(draw):
    """Completely neutral — straight horizontal line, no smile/frown."""
    draw.line([(28, 34), (36, 34)], fill=SKIN_DEEP)
    # Very slight lip definition
    draw.point((29, 33), fill=SKIN_SHADOW)
    draw.point((35, 33), fill=SKIN_SHADOW)

def draw_hand_with_pen(draw):
    """
    Partial hand at bottom-left, loosely holding a pen.
    Not writing — just resting.
    """
    # Hand — partial, just fingers and thumb visible
    # Palm base
    draw.rectangle([8, 54, 20, 62], fill=HAND_SKIN)
    # Finger 1
    draw.rectangle([9, 50, 11, 56], fill=HAND_SKIN)
    # Finger 2
    draw.rectangle([12, 49, 14, 56], fill=HAND_SKIN)
    # Finger 3
    draw.rectangle([15, 50, 17, 56], fill=HAND_SKIN)
    # Thumb suggestion
    draw.rectangle([6, 55, 9, 60], fill=HAND_SKIN)
    # Shadow on hand
    draw.line([(8, 54), (8, 62)], fill=SKIN_SHADOW)
    draw.line([(20, 54), (20, 62)], fill=SKIN_SHADOW)

    # Pen — diagonal, resting loosely across fingers
    # Barrel
    draw.line([(5, 58), (22, 48)], fill=PEN_BARREL, width=2)
    # Tip
    draw.line([(22, 48), (24, 46)], fill=PEN_TIP, width=1)
    # Clip glint
    draw.line([(8, 56), (16, 51)], fill=PEN_CLIP, width=1)

def build_frame(unfocused=False, frame_idx=0):
    img = Image.new("RGB", SIZE, BG_NEAR_BLACK)
    draw = ImageDraw.Draw(img)

    draw_background(draw)
    draw_suit(draw)
    draw_neck(draw)
    draw_head(draw)
    draw_ears(draw)
    draw_dark_circles(draw)
    draw_eyebrows(draw)
    draw_eyes(draw, unfocused=unfocused)
    draw_nose(draw)
    draw_mouth(draw)
    draw_hand_with_pen(draw)

    # Invisible per-frame variation: single pixel in corner at bg color
    # (identical to bg so visually silent, but makes each frame distinct for PIL's encoder)
    r, g, b = BG_NEAR_BLACK
    draw.point((0, 0), fill=(r, g, b + frame_idx))

    return img

def main():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    # Frame sequence:
    # 0-3: focused (normal)
    # 4-5: unfocused (mentally absent)
    # 6-9: focused again (snaps back)
    unfocus_seq = [False, False, False, False, True, True, False, False, False, False]
    # durations: unfocused frames linger slightly longer
    durations = [150, 150, 150, 150, 200, 200, 150, 150, 150, 150]

    rgb_frames = [build_frame(u, i) for i, u in enumerate(unfocus_seq)]

    # Quantize each frame independently
    p_frames = [f.quantize(colors=256, dither=0) for f in rgb_frames]

    p_frames[0].save(
        OUTPUT_PATH,
        save_all=True,
        append_images=p_frames[1:],
        duration=durations,
        loop=0,
        disposal=0,
        optimize=False,
    )

    print(f"Saved: {OUTPUT_PATH}")

    # Verify
    verify = Image.open(OUTPUT_PATH)
    n = getattr(verify, "n_frames", 1)
    print(f"Verified: {n} frames, size={verify.size}, format={verify.format}")
    assert n == 10, f"Expected 10 frames, got {n}"
    print("OK")

if __name__ == "__main__":
    main()
