#!/usr/bin/env python3
"""
Generate Ibrahim the Immovable - Option C: World-Weary Bureaucrat
Isometric bust, 64x64 animated GIF
"""

from PIL import Image, ImageDraw
import os

OUT_PATH = "/mnt/data/hello-world/static/avatars/hiring-manager_c.gif"

# Color palette
BG         = (98,  108,  95)   # muted grey-green office wall
SKIN       = (198, 155, 110)   # warm medium brown
SKIN_SHAD  = (165, 120,  78)   # shadow/jaw area
HAIR       = ( 28,  22,  18)   # near-black hair (close-cropped, greying temples)
HAIR_GREY  = ( 90,  85,  80)   # grey temple streak
SUIT       = ( 38,  42,  52)   # dark charcoal suit
SUIT_SHAD  = ( 24,  27,  34)   # suit shadow / lapel crease
COLLAR     = (220, 215, 205)   # off-white shirt collar, slightly yellowed
TIE        = ( 88,  45,  45)   # dark burgundy tie
GLASSES_FR = ( 28,  18,   8)   # dark tortoiseshell frames
GLASSES_LN = (180, 210, 220)   # lens glint (pale blue)
EYE_WHITE  = (230, 220, 210)   # slightly yellowed sclera
EYE_IRIS   = ( 55,  38,  22)   # dark brown iris
PUPIL      = ( 12,   8,   4)
EYEBROW    = ( 32,  22,  14)   # dark brow
LID        = SKIN              # eyelid = skin
PAPER      = (230, 225, 210)   # aged paper stack
PAPER_LINE = (160, 155, 140)   # paper lines/shadow
PAPER_EDGE = (200, 195, 180)   # paper stack side

W, H = 64, 64

def draw_frame(d: ImageDraw.ImageDraw, head_dy: int = 0, blink: float = 0.0):
    """
    head_dy: vertical offset for head (0 or 1 for exhale)
    blink: 0.0=open, 1.0=fully closed
    """

    # --- Background ---
    d._image.paste(BG, [0, 0, W, H])

    # Slight vignette / shadow at bottom
    for y in range(H-12, H):
        alpha = int(30 * (y - (H-12)) / 12)
        vig = tuple(max(0, c - alpha) for c in BG)
        d.line([(0, y), (W, y)], fill=vig)

    hy = head_dy  # head vertical offset

    # ---- SUIT / SHOULDERS (isometric) ----
    # Shoulders form an isometric trapezoid
    # Left shoulder (viewer's right in isometric)
    d.polygon([
        (10, 52+hy), (20, 45+hy), (32, 45+hy), (32, 56+hy)
    ], fill=SUIT)
    # Right shoulder
    d.polygon([
        (54, 52+hy), (44, 45+hy), (32, 45+hy), (32, 56+hy)
    ], fill=SUIT_SHAD)
    # Suit body bottom
    d.rectangle([10, 52+hy, 54, 64], fill=SUIT)
    d.rectangle([32, 52+hy, 54, 64], fill=SUIT_SHAD)

    # Collar (shirt peeking out)
    d.polygon([
        (27, 45+hy), (32, 42+hy), (37, 45+hy), (35, 49+hy), (29, 49+hy)
    ], fill=COLLAR)

    # Tie
    d.polygon([
        (31, 44+hy), (33, 44+hy), (34, 50+hy), (32, 52+hy), (30, 50+hy)
    ], fill=TIE)
    # Tie knot
    d.ellipse([30, 43+hy, 34, 47+hy], fill=TIE)

    # Lapels / suit crease at collar
    d.line([(27, 45+hy), (22, 52+hy)], fill=SUIT_SHAD, width=2)
    d.line([(37, 45+hy), (42, 52+hy)], fill=SUIT_SHAD, width=2)

    # ---- HEAD ----
    # Main head oval (isometric: slightly wider than tall, shifted)
    # Head center ~32, 28
    hx, hy_c = 32, 28 + hy
    # Head base (neck)
    d.ellipse([26, 38+hy, 38, 48+hy], fill=SKIN)
    # Main head
    d.ellipse([18, 14+hy, 46, 42+hy], fill=SKIN)
    # Jaw shadow (bottom of face, 3D isometric shading)
    d.ellipse([20, 34+hy, 44, 44+hy], fill=SKIN_SHAD)
    # Restore face center over jaw shadow
    d.ellipse([20, 14+hy, 44, 38+hy], fill=SKIN)

    # ---- HAIR ----
    # Close-cropped — just a cap on top of head
    d.ellipse([18, 13+hy, 46, 26+hy], fill=HAIR)
    # Hair line — face starts below
    d.ellipse([20, 18+hy, 44, 30+hy], fill=SKIN)  # face reclaim

    # Grey temple streaks (left & right)
    d.line([(19, 19+hy), (22, 24+hy)], fill=HAIR_GREY, width=2)
    d.line([(45, 19+hy), (42, 24+hy)], fill=HAIR_GREY, width=2)

    # Subtle ear bumps
    d.ellipse([16, 24+hy, 21, 30+hy], fill=SKIN_SHAD)
    d.ellipse([43, 24+hy, 48, 30+hy], fill=SKIN_SHAD)
    d.ellipse([17, 25+hy, 20, 29+hy], fill=SKIN)
    d.ellipse([44, 25+hy, 47, 29+hy], fill=SKIN)

    # ---- EYEBROWS ----
    # Heavy, slightly furrowed brows (world-weariness)
    # Left brow
    d.line([(22, 22+hy), (28, 21+hy)], fill=EYEBROW, width=2)
    # Right brow — slightly raised on outer edge (tired asymmetry)
    d.line([(36, 21+hy), (42, 22+hy)], fill=EYEBROW, width=2)
    # Inner brow pinch
    d.point((28, 22+hy), fill=EYEBROW)
    d.point((36, 22+hy), fill=EYEBROW)

    # ---- EYES ----
    # Heavy-lidded — upper lid droops. blink=0 open, blink=1 closed
    open_h = 4  # max open height in px
    eye_open = max(0, int(open_h * (1.0 - blink)))

    # Left eye (viewer perspective left = character's right)
    lx, ly = 25, 26
    # Socket / white
    if eye_open > 0:
        d.ellipse([lx, ly+hy, lx+6, ly+eye_open+hy], fill=EYE_WHITE)
        # iris
        d.ellipse([lx+1, ly+hy, lx+5, ly+min(eye_open,4)+hy], fill=EYE_IRIS)
        # pupil
        d.point((lx+3, ly+1+hy), fill=PUPIL)
        d.point((lx+3, ly+2+hy), fill=PUPIL)

    # Upper lid (heavy — always covers top ~40% of eye)
    lid_h = max(2, int(open_h * blink) + 2)
    d.ellipse([lx, ly+hy, lx+6, ly+lid_h+hy], fill=LID)
    # Lower lid line
    d.line([(lx, ly+eye_open+hy), (lx+6, ly+eye_open+hy)], fill=SKIN_SHAD)

    # Right eye
    rx, ry = 33, 26
    if eye_open > 0:
        d.ellipse([rx, ry+hy, rx+6, ry+eye_open+hy], fill=EYE_WHITE)
        d.ellipse([rx+1, ry+hy, rx+5, ry+min(eye_open,4)+hy], fill=EYE_IRIS)
        d.point((rx+3, ry+1+hy), fill=PUPIL)
        d.point((rx+3, ry+2+hy), fill=PUPIL)

    d.ellipse([rx, ry+hy, rx+6, ry+lid_h+hy], fill=LID)
    d.line([(rx, ry+eye_open+hy), (rx+6, ry+eye_open+hy)], fill=SKIN_SHAD)

    # ---- GLASSES ----
    # Frames perched LOW — sitting mid-nose, below eyes
    # He's looking OVER them
    gly = 29  # glasses y (below the eye line)
    # Left lens outline
    d.rectangle([22, gly+hy, 29, gly+4+hy], outline=GLASSES_FR, width=1)
    # Right lens outline
    d.rectangle([31, gly+hy, 38, gly+4+hy], outline=GLASSES_FR, width=1)
    # Bridge
    d.line([(29, gly+2+hy), (31, gly+2+hy)], fill=GLASSES_FR, width=1)
    # Temples going back to ears
    d.line([(22, gly+2+hy), (18, gly+3+hy)], fill=GLASSES_FR, width=1)
    d.line([(38, gly+2+hy), (44, gly+3+hy)], fill=GLASSES_FR, width=1)
    # Lens glint (tiny highlight)
    d.point((24, gly+1+hy), fill=GLASSES_LN)
    d.point((33, gly+1+hy), fill=GLASSES_LN)

    # ---- NOSE ----
    # Simple isometric nose — shadow and highlight
    d.ellipse([30, 30+hy, 34, 33+hy], fill=SKIN_SHAD)
    d.point((31, 31+hy), fill=SKIN)
    # Nostril hints
    d.point((30, 32+hy), fill=SKIN_SHAD)
    d.point((34, 32+hy), fill=SKIN_SHAD)

    # ---- MOUTH ----
    # Neutral with very slight downward pull at corners — not frowning, just done
    mx, my = 32, 36
    # Lip line — straight center with 1px dip at corners
    d.line([(mx-4, my+hy), (mx+4, my+hy)], fill=SKIN_SHAD, width=1)
    # Corner dips
    d.point((mx-4, my+1+hy), fill=SKIN_SHAD)
    d.point((mx+4, my+1+hy), fill=SKIN_SHAD)
    # Lower lip suggestion
    d.line([(mx-3, my+2+hy), (mx+3, my+2+hy)], fill=SKIN_SHAD, width=1)
    # Upper lip center bow (subtle)
    d.point((mx, my-1+hy), fill=SKIN_SHAD)

    # ---- PAPER STACK (bottom of frame) ----
    # A stack of papers / clipboard at bottom, slightly angled (isometric)
    px, py = 8, 54
    # Stack depth (side of stack — isometric right face)
    d.polygon([
        (px+2, py), (px+38, py), (px+40, py+2), (px+4, py+2)
    ], fill=PAPER_EDGE)
    # Stack depth layer 2
    d.polygon([
        (px+2, py+2), (px+38, py+2), (px+40, py+4), (px+4, py+4)
    ], fill=PAPER_LINE)
    # Top sheet face
    d.polygon([
        (px, py-2), (px+36, py-2), (px+38, py), (px+2, py)
    ], fill=PAPER)
    # Ruled lines on top sheet
    for i in range(3):
        lpy = py - 1 + i * 0  # only one visible line on this face angle
        d.line([(px+4, py-1), (px+32, py-1)], fill=PAPER_LINE)
    # Clipboard clip (small dark rectangle at top of stack)
    d.rectangle([px+14, py-4, px+22, py-2], fill=SUIT_SHAD)
    d.rectangle([px+16, py-5, px+20, py-3], fill=HAIR_GREY)

    # ---- SHADOW under head on shoulders ----
    d.ellipse([24, 43+hy, 40, 47+hy], fill=SUIT_SHAD)
    # neck over shadow
    d.ellipse([27, 39+hy, 37, 47+hy], fill=SKIN)


def make_frames():
    """
    Animation sequence:
    Frames 0-1:  idle (eyes open)
    Frames 2-4:  blink (close → hold → open)
    Frames 5-6:  exhale (head drops 1px, rises)
    Frames 7-9:  idle (eyes open, back to rest)
    Total: 10 frames @ 150ms = 1.5s loop
    """

    blink_seq = [0.0, 0.0, 0.7, 1.0, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0]
    dy_seq    = [0,   0,   0,   0,   0,   1,   1,   0,   0,   0  ]

    frames = []
    for i in range(10):
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        draw_frame(d, head_dy=dy_seq[i], blink=blink_seq[i])
        frames.append(img)

    return frames


def main():
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    frames = make_frames()

    # Pillow collapses identical frames by summing durations.
    # Force each frame to be unique by writing a 1-pixel breadcrumb in the
    # bottom-right corner (pixel varies per frame, invisible at this scale).
    for i, img in enumerate(frames):
        r, g, b = img.getpixel((63, 63))
        # XOR low bits with frame index so pixels differ but colour is imperceptible
        img.putpixel((63, 63), (r ^ (i & 0x3), g ^ ((i >> 1) & 0x3), b))

    frames[0].save(
        OUT_PATH,
        save_all=True,
        append_images=frames[1:],
        duration=150,
        loop=0,
        disposal=2,
        optimize=False,
    )
    print(f"Saved: {OUT_PATH}")

    # Verify
    verify = Image.open(OUT_PATH)
    n = getattr(verify, "n_frames", 1)
    print(f"Verified: {n} frames, size={verify.size}, mode={verify.mode}")
    assert n == 10, f"Expected 10 frames, got {n}"
    assert verify.size == (64, 64)
    print("All checks passed.")


if __name__ == "__main__":
    main()
