"""
gen_yuki_avatar_b.py — Yuki the Yielding, Option B
Isometric 64x64 animated GIF, pure Pillow, loop=0, disposal=2.

Visual concept: Yuki standing upright in isometric view, holding a clipboard
at her side, with a thought bubble cycling through three symbols representing
the confused users she fights for:
  - Frame 0-1: question mark (confused user)
  - Frame 2-3: warning triangle (friction / error)
  - Frame 4-5: broken UI box (system failure the user experiences)

Cool lavender/rose palette — empathetic, observational, slightly worried.
6 frames.
"""

from PIL import Image, ImageDraw
import os

OUT_PATH = "/mnt/data/hello-world/static/avatars/ux_b.gif"
W, H = 64, 64

BG          = (20, 18, 28)
FLOOR_T     = (55, 50, 80)
FLOOR_L     = (35, 32, 55)
FLOOR_R     = (45, 42, 68)
SKIN        = (238, 192, 155)
SKIN_SH     = (198, 152, 115)
HAIR        = (35, 25, 52)
SHIRT       = (175, 118, 158)
SHIRT_SH    = (128, 78, 112)
PANTS       = (78, 88, 138)
PANTS_SH    = (52, 60, 98)
SHOE        = (38, 33, 58)
CLIP_L      = (218, 212, 232)
CLIP_D      = (158, 152, 178)
BUBBLE_BG   = (232, 228, 248)
BUBBLE_OUT  = (155, 145, 198)
SYM_Q       = (78, 58, 158)
SYM_WARN    = (218, 158, 38)
SYM_BROKEN  = (198, 78, 98)


def draw_floor(d, cx, cy, hw, qw):
    pts = [(cx, cy - qw), (cx + hw, cy), (cx, cy + qw), (cx - hw, cy)]
    d.polygon(pts, fill=FLOOR_T)
    d.line([pts[0], pts[1]], fill=FLOOR_R, width=1)
    d.line([pts[1], pts[2]], fill=FLOOR_L, width=1)
    d.line([pts[2], pts[3]], fill=FLOOR_L, width=1)
    d.line([pts[3], pts[0]], fill=FLOOR_R, width=1)


def bresenham(x0, y0, x1, y1):
    pts = []
    dx = abs(x1 - x0); dy = abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx - dy
    while True:
        pts.append((x0, y0))
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 > -dy: err -= dy; x0 += sx
        if e2 < dx:  err += dx; y0 += sy
    return pts


def dot(img, x, y, col):
    if 0 <= x < W and 0 <= y < H:
        img.putpixel((x, y), col)


def draw_bubble_q(img, bx1, by1, bx2, by2):
    """Draw question mark symbol inside bubble bounds."""
    cx = (bx1 + bx2) // 2
    cy = (by1 + by2) // 2
    col = SYM_Q
    # Arc (top of Q) — manually placed pixels
    arc = [
        (cx - 1, cy - 5), (cx, cy - 6), (cx + 1, cy - 6),
        (cx + 2, cy - 5), (cx + 2, cy - 4),
        (cx + 1, cy - 3), (cx, cy - 3),
    ]
    for px, py in arc:
        dot(img, px, py, col)
    dot(img, cx, cy - 2, col)
    dot(img, cx, cy - 1, col)
    dot(img, cx, cy + 1, col)


def draw_bubble_warn(img, bx1, by1, bx2, by2):
    """Draw warning triangle inside bubble bounds."""
    cx = (bx1 + bx2) // 2
    cy = (by1 + by2) // 2
    col = SYM_WARN
    tri = [(cx, cy - 5), (cx - 4, cy + 2), (cx + 4, cy + 2)]
    for p1, p2 in [(tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])]:
        for px, py in bresenham(*p1, *p2):
            dot(img, px, py, col)
    # ! mark
    for dy in range(-3, 0):
        dot(img, cx, cy + dy, col)


def draw_bubble_broken(img, bx1, by1, bx2, by2):
    """Draw broken UI rectangle inside bubble bounds."""
    cx = (bx1 + bx2) // 2
    cy = (by1 + by2) // 2
    col = SYM_BROKEN
    # Box outline
    rx1, ry1, rx2, ry2 = cx - 4, cy - 4, cx + 4, cy + 3
    for x in range(rx1, rx2 + 1):
        dot(img, x, ry1, col)
        dot(img, x, ry2, col)
    for y in range(ry1, ry2 + 1):
        dot(img, rx1, y, col)
        dot(img, rx2, y, col)
    # Diagonal crack
    for px, py in bresenham(rx1 + 1, ry1 + 1, rx2 - 1, ry2 - 1):
        dot(img, px, py, col)


def draw_thought_cloud(d, img, cx, cy, sym_fn):
    """
    Draw thought bubble: ascending dots then cloud oval, then symbol.
    cx, cy = anchor point (top of head area).
    sym_fn = function(img, bx1, by1, bx2, by2) to draw symbol.
    """
    # Trailing dots (ascending from head toward bubble)
    dots = [(cx + 1, cy - 2, 1), (cx - 1, cy - 4, 2), (cx - 2, cy - 7, 2)]
    for dx, dy, r in dots:
        d.ellipse([dx - r, dy - r, dx + r, dy + r], fill=BUBBLE_BG, outline=BUBBLE_OUT)

    # Main cloud blob — union of overlapping ellipses
    # Center cloud around (cx - 4, cy - 15), width ~18, height ~12
    ecx, ecy = cx - 4, cy - 15
    cloud_parts = [
        (ecx,     ecy,     8, 5),
        (ecx - 4, ecy + 1, 5, 4),
        (ecx + 4, ecy + 1, 5, 4),
        (ecx - 2, ecy - 3, 5, 3),
        (ecx + 2, ecy - 3, 5, 3),
    ]
    for ox, oy, rw, rh in cloud_parts:
        d.ellipse([ox - rw, oy - rh, ox + rw, oy + rh], fill=BUBBLE_BG)

    # Outline the cloud blobs
    for ox, oy, rw, rh in cloud_parts:
        d.ellipse([ox - rw, oy - rh, ox + rw, oy + rh], outline=BUBBLE_OUT)

    # Symbol inside the main blob
    bx1 = ecx - 6
    by1 = ecy - 6
    bx2 = ecx + 6
    by2 = ecy + 6
    sym_fn(img, bx1, by1, bx2, by2)


def draw_figure(d, img, fcx, fcy):
    """Draw Yuki standing, holding clipboard. fcx/fcy = base (feet) center."""

    # Shoes
    d.ellipse([fcx - 7, fcy - 2, fcx - 1, fcy + 2], fill=SHOE)
    d.ellipse([fcx + 1, fcy - 2, fcx + 7, fcy + 2], fill=SHOE)

    # Left leg
    d.polygon([
        (fcx - 5, fcy),
        (fcx - 2, fcy),
        (fcx - 2, fcy - 10),
        (fcx - 5, fcy - 10),
    ], fill=PANTS)
    # Right leg (slightly lighter/offset)
    d.polygon([
        (fcx + 2, fcy),
        (fcx + 5, fcy),
        (fcx + 5, fcy - 10),
        (fcx + 2, fcy - 10),
    ], fill=PANTS_SH)

    # Torso
    tt = fcy - 22
    d.polygon([
        (fcx - 6, tt + 2),
        (fcx + 6, tt + 2),
        (fcx + 7, fcy - 10),
        (fcx - 7, fcy - 10),
    ], fill=SHIRT)
    # Right-side shadow
    d.polygon([
        (fcx,     tt + 2),
        (fcx + 6, tt + 2),
        (fcx + 7, fcy - 10),
        (fcx,     fcy - 10),
    ], fill=SHIRT_SH)

    # Neck
    d.rectangle([fcx - 2, tt, fcx + 2, tt + 3], fill=SKIN)

    # Head
    hx, hy = fcx + 1, tt - 6
    d.ellipse([hx - 6, hy - 5, hx + 6, hy + 6], fill=SKIN)
    d.chord([hx, hy - 5, hx + 6, hy + 6], 270, 90, fill=SKIN_SH)
    # Hair — bob cut
    d.chord([hx - 6, hy - 6, hx + 6, hy + 1], 180, 360, fill=HAIR)
    d.rectangle([hx - 7, hy - 3, hx - 5, hy + 4], fill=HAIR)
    d.rectangle([hx + 5, hy - 3, hx + 7, hy + 3], fill=HAIR)
    # Eyes
    d.ellipse([hx - 4, hy,     hx - 2, hy + 2], fill=(32, 22, 48))
    d.ellipse([hx + 1, hy,     hx + 3, hy + 2], fill=(32, 22, 48))
    # Eyebrow crease (thinking)
    d.line([(hx - 4, hy - 1), (hx - 2, hy - 2)], fill=HAIR, width=1)
    # Neutral-concerned mouth
    d.arc([hx - 2, hy + 2, hx + 2, hy + 5], 10, 170, fill=(155, 95, 85))

    # Clipboard (left side)
    cx2, cy2 = fcx - 13, fcy - 17
    d.rectangle([cx2, cy2, cx2 + 9, cy2 + 13], fill=CLIP_L)
    d.rectangle([cx2 + 6, cy2, cx2 + 9, cy2 + 13], fill=CLIP_D)
    d.rectangle([cx2 + 2, cy2 - 2, cx2 + 7, cy2 + 1], fill=(128, 122, 148))
    # Lines on clipboard
    for ly in range(cy2 + 3, cy2 + 12, 2):
        d.line([(cx2 + 1, ly), (cx2 + 5, ly)], fill=CLIP_D, width=1)

    # Left arm holding clipboard
    d.line([(fcx - 6, tt + 5), (cx2 + 5, cy2 + 7)], fill=SKIN, width=2)

    # Right arm (slightly raised, relaxed)
    d.line([(fcx + 6, tt + 5), (fcx + 13, tt + 9)], fill=SKIN, width=2)
    d.ellipse([fcx + 11, tt + 8, fcx + 16, tt + 13], fill=SKIN)

    return hx, hy  # return head position for bubble anchoring


def draw_frame(sym_idx):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Floor tile
    draw_floor(d, 32, 52, 20, 10)

    # Figure — positioned left-center
    fcx, fcy = 28, 52
    hx, hy = draw_figure(d, img, fcx, fcy)

    # Thought bubble anchored above/right of head
    sym_fns = [draw_bubble_q, draw_bubble_warn, draw_bubble_broken]
    draw_thought_cloud(d, img, hx + 6, hy - 2, sym_fns[sym_idx])

    return img


def main():
    # 6 frames: 2 frames each for Q, warning, broken
    sym_seq  = [0, 0, 1, 1, 2, 2]
    durs     = [100, 80, 100, 80, 120, 120]
    n = len(sym_seq)

    rgb_frames = [draw_frame(sym_seq[i]) for i in range(n)]

    # Build shared palette from all frames
    combined = Image.new("RGB", (W, H * n))
    for i, f in enumerate(rgb_frames):
        combined.paste(f, (0, i * H))
    palette_img = combined.quantize(colors=32, method=Image.Quantize.MEDIANCUT)

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
        duration=durs,
        disposal=2,
        optimize=False,
    )
    print(f"Saved {OUT_PATH} ({n} frames)")


if __name__ == "__main__":
    main()
