#!/usr/bin/env python3
"""
Generate isometric pixel art avatar for David Hume (Option A — 18th Century Scholar).
64x64 animated GIF, 8 frames, quill writes then pauses + eyebrow raise animation.
"""

from PIL import Image, ImageDraw
import math

# ── Palette ──────────────────────────────────────────────────────────────────
BG_DARK       = (42,  34,  22)   # very dark sepia background
BG_MID        = (62,  50,  32)   # mid sepia for depth
PARCHMENT     = (110, 88,  55)   # faint parchment silhouette
WIG_WHITE     = (230, 228, 220)  # powdered white wig, base
WIG_SHADOW    = (185, 183, 175)  # wig shadow / curl definition
WIG_HILIGHT   = (248, 248, 244)  # wig highlight
SKIN          = (210, 172, 130)  # face skin tone
SKIN_SHADOW   = (175, 135,  95)  # face shadow/contour
SKIN_HILIGHT  = (230, 195, 158)  # forehead highlight
EYE_WHITE     = (235, 228, 210)  # eye sclera (slightly warm)
EYE_DARK      = ( 45,  38,  30)  # iris/pupil
COAT_NAVY     = ( 28,  42,  82)  # deep navy coat
COAT_SHADOW   = ( 18,  28,  58)  # coat shadow
COAT_HILIGHT  = ( 45,  62, 108)  # coat highlight edge
CRAVAT_WHITE  = (245, 243, 235)  # white cravat / jabot
CRAVAT_SHADOW = (200, 198, 188)  # cravat fold shadow
QUILL_SHAFT   = (215, 195, 140)  # quill feather — warm ivory
QUILL_TIP     = ( 55,  45,  30)  # quill nib (dark)
INK_BLACK     = ( 25,  18,  12)  # ink stroke
INKWELL_BODY  = ( 38,  30,  20)  # inkwell silhouette
BROW_DARK     = ( 90,  68,  42)  # eyebrow
LIP_COLOR     = (175, 118,  90)  # lips

TRANSPARENT   = (0, 0, 0, 0)

W, H = 64, 64


def make_base() -> Image.Image:
    """Render the static background: dark sepia + faint quill/inkwell silhouette."""
    img = Image.new("RGBA", (W, H), BG_DARK)
    d = ImageDraw.Draw(img)

    # Soft radial-ish gradient feel — lighten centre slightly
    for y in range(H):
        for x in range(W):
            cx, cy = abs(x - 32), abs(y - 36)
            dist = math.sqrt(cx*cx + cy*cy)
            if dist < 20:
                t = (20 - dist) / 20 * 0.18
                r = int(BG_DARK[0] + (BG_MID[0] - BG_DARK[0]) * t)
                g = int(BG_DARK[1] + (BG_MID[1] - BG_DARK[1]) * t)
                b = int(BG_DARK[2] + (BG_MID[2] - BG_DARK[2]) * t)
                img.putpixel((x, y), (r, g, b, 255))

    # Faint inkwell silhouette — bottom-left corner
    d.ellipse([3, 52, 12, 62], fill=INKWELL_BODY)
    d.rectangle([5, 50, 10, 53], fill=INKWELL_BODY)
    d.line([6, 50, 6, 49], fill=PARCHMENT, width=1)
    d.line([9, 50, 9, 49], fill=PARCHMENT, width=1)

    return img


def draw_bust(d: ImageDraw.ImageDraw, brow_raise: int = 0):
    """
    Draw the isometric bust of Hume.
    brow_raise: 0 = neutral, 1 = left brow slightly up, 2 = both brows up
    """
    # ── Wig (drawn behind head) ──────────────────────────────────────────────
    # Full powdered wig: wide on sides, curled rolls
    # Left side curl mass
    d.ellipse([10, 14, 22, 30], fill=WIG_SHADOW)
    d.ellipse([11, 13, 21, 27], fill=WIG_WHITE)
    # Right side curl mass
    d.ellipse([42, 14, 54, 30], fill=WIG_SHADOW)
    d.ellipse([43, 13, 53, 27], fill=WIG_WHITE)
    # Top of wig (rounded dome)
    d.ellipse([18, 8, 46, 24], fill=WIG_WHITE)
    d.ellipse([20, 7, 44, 18], fill=WIG_HILIGHT)

    # Curl detail lines on sides
    for y_off in range(0, 10, 3):
        d.arc([11, 15 + y_off, 20, 20 + y_off], 0, 180, fill=WIG_SHADOW, width=1)
        d.arc([44, 15 + y_off, 53, 20 + y_off], 0, 180, fill=WIG_SHADOW, width=1)

    # ── Neck & Shirt collar peek ─────────────────────────────────────────────
    d.rectangle([27, 42, 37, 50], fill=SKIN_SHADOW)  # neck
    d.rectangle([28, 42, 36, 49], fill=SKIN)

    # ── Coat shoulders (isometric — left shoulder slightly further) ───────────
    # Right shoulder (viewer's left in iso) — brighter
    d.polygon([(20, 44), (32, 38), (32, 58), (12, 58), (12, 52)], fill=COAT_NAVY)
    d.line([(20, 44), (12, 52)], fill=COAT_HILIGHT, width=1)
    # Left shoulder (viewer's right) — darker
    d.polygon([(44, 44), (32, 38), (32, 58), (52, 58), (52, 52)], fill=COAT_SHADOW)
    d.line([(44, 44), (52, 52)], fill=COAT_NAVY, width=1)

    # Coat lapel hint on right side
    d.polygon([(29, 38), (26, 44), (30, 48), (32, 44)], fill=COAT_HILIGHT)

    # ── Cravat / jabot ────────────────────────────────────────────────────────
    d.polygon([(28, 37), (32, 36), (36, 37), (34, 48), (30, 48)], fill=CRAVAT_WHITE)
    # fold lines
    d.line([(31, 38), (30, 46)], fill=CRAVAT_SHADOW, width=1)
    d.line([(33, 38), (34, 46)], fill=CRAVAT_SHADOW, width=1)

    # ── Face (isometric oval, slight left-lean for 3/4 view) ─────────────────
    # Shadow side (right of face)
    d.ellipse([25, 16, 47, 42], fill=SKIN_SHADOW)
    # Main face
    d.ellipse([22, 15, 45, 41], fill=SKIN)
    # Highlight on forehead/left
    d.ellipse([23, 15, 38, 28], fill=SKIN_HILIGHT)

    # ── Wig overlap on face sides (to sell the wig framing the face) ─────────
    d.rectangle([10, 17, 23, 38], fill=WIG_WHITE)
    d.rectangle([45, 17, 55, 38], fill=WIG_SHADOW)
    # re-draw face edge over wig
    d.ellipse([22, 15, 45, 41], outline=SKIN_SHADOW, width=1)

    # ── Eyes ─────────────────────────────────────────────────────────────────
    # Isometric: right eye slightly higher/left, left eye lower/right
    # Right eye (viewer sees left eye of subject)
    ey_r = 26 - brow_raise
    d.ellipse([25, ey_r + 2, 32, ey_r + 7], fill=EYE_WHITE)
    d.ellipse([27, ey_r + 3, 31, ey_r + 6], fill=EYE_DARK)
    d.point((28, ey_r + 4), fill=(200, 200, 200))  # tiny catchlight

    # Left eye
    ey_l = 28
    d.ellipse([34, ey_l + 2, 41, ey_l + 7], fill=EYE_WHITE)
    d.ellipse([36, ey_l + 3, 40, ey_l + 6], fill=EYE_DARK)

    # ── Eyebrows — skeptical: right brow arched up at outer edge ─────────────
    brow_y_r = 23 - (2 if brow_raise >= 1 else 0)
    brow_y_l = 25 - (1 if brow_raise >= 2 else 0)
    # Right brow (skeptically raised at outer end)
    d.line([(25, brow_y_r + 1), (29, brow_y_r), (32, brow_y_r - 1)],
           fill=BROW_DARK, width=1)
    # Left brow (straighter, mildly raised)
    d.line([(34, brow_y_l), (38, brow_y_l), (41, brow_y_l + 1)],
           fill=BROW_DARK, width=1)

    # ── Nose (subtle, isometric) ─────────────────────────────────────────────
    d.line([(32, 31), (32, 34), (34, 35)], fill=SKIN_SHADOW, width=1)

    # ── Lips — thin, pressed together (skeptical) ────────────────────────────
    d.line([(28, 38), (35, 38)], fill=LIP_COLOR, width=1)
    d.line([(29, 37), (34, 37)], fill=SKIN_SHADOW, width=1)
    # slight downward curve at corners
    d.point((28, 39), fill=SKIN_SHADOW)
    d.point((35, 39), fill=SKIN_SHADOW)


def draw_quill(d: ImageDraw.ImageDraw, tip_x: int, tip_y: int,
               ink_len: int = 0, visible: bool = True):
    """
    Draw a quill pen with tip at roughly (tip_x, tip_y).
    ink_len: length of ink stroke already drawn (0-5 pixels).
    visible: whether the quill itself is shown.
    """
    if not visible:
        return

    # Quill shaft goes from tip up-left (isometric diagonal)
    sx, sy = tip_x + 16, tip_y - 14  # shaft end (feather base)

    # Feather vane — polygon
    d.polygon([
        (sx,      sy),
        (sx + 4,  sy - 5),
        (tip_x,   tip_y),
        (sx - 3,  sy - 2),
    ], fill=QUILL_SHAFT)
    d.polygon([
        (sx,      sy),
        (sx - 4,  sy + 3),
        (tip_x,   tip_y),
        (sx + 2,  sy + 4),
    ], fill=WIG_SHADOW)

    # Shaft line
    d.line([(sx, sy), (tip_x, tip_y)], fill=QUILL_SHAFT, width=1)
    # Nib (dark tip)
    d.line([(tip_x, tip_y), (tip_x - 1, tip_y + 1)], fill=QUILL_TIP, width=1)

    # Ink stroke (grows left-to-right as animation progresses)
    if ink_len > 0:
        d.line([(tip_x - 1, tip_y + 2),
                (tip_x - 1 + ink_len, tip_y + 2)],
               fill=INK_BLACK, width=1)


# ── Frame builder ─────────────────────────────────────────────────────────────

def build_frame(quill_phase: int, brow_raise: int) -> Image.Image:
    """
    quill_phase: 0-9
      0-4: quill moves down to paper, ink grows
      5-9: quill lifts slightly, pauses
    brow_raise: 0-2 (skeptical eyebrow state)
    """
    img = make_base()
    d = ImageDraw.Draw(img)

    draw_bust(d, brow_raise=brow_raise)

    # Quill position: lower-right area, writing on implied surface
    base_tx, base_ty = 46, 50
    if quill_phase < 5:
        # writing stroke: tip moves slightly right
        tx = base_tx + quill_phase
        ty = base_ty
        ink = quill_phase + 1
    else:
        # lift and pause
        tx = base_tx + 4
        ty = base_ty - (quill_phase - 4)
        ink = 5

    draw_quill(d, tx, ty, ink_len=ink)

    return img


# ── Animation schedule ────────────────────────────────────────────────────────
#  Frame: (quill_phase, brow_raise)
#  8 frames total:
#   0-2: neutral brow, quill descends and writes
#   3-4: skeptical brow (raise=1), quill still writing
#   5  : skeptical brow (raise=2) — peak skepticism
#   6-7: brow settles, quill lifts

SCHEDULE = [
    (0, 0),   # quill approaching paper
    (1, 0),   # touching paper
    (2, 0),   # writing begins
    (3, 1),   # brow starts to raise
    (4, 1),   # ink longer, brow raised
    (5, 2),   # peak skepticism — both brows up
    (6, 1),   # brow settling
    (7, 0),   # brow neutral, quill lifting
    (8, 0),   # quill lifted, pause
    (9, 0),   # pause (holds before loop)
]


def main():
    frames = []
    for quill_phase, brow_raise in SCHEDULE:
        f = build_frame(quill_phase, brow_raise)
        frames.append(f)

    out_path = "/mnt/data/hello-world/static/avatars/hume_a.gif"

    frames[0].save(
        out_path,
        save_all=True,
        append_images=frames[1:],
        duration=130,
        loop=0,
        disposal=2,
        optimize=False,
    )

    print(f"Saved: {out_path}")
    print(f"Frames: {len(frames)}, size: 64x64, duration: 130ms/frame")

    # Verify
    verify = Image.open(out_path)
    print(f"Verified: format={verify.format}, n_frames={getattr(verify, 'n_frames', 1)}, "
          f"size={verify.size}, mode={verify.mode}")


if __name__ == "__main__":
    main()
