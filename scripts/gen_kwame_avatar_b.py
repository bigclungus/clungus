#!/usr/bin/env python3
"""
Generate isometric pixel art avatar for Kwame the Constructor (Option B).
Modern Systems Architect: turtleneck, glasses, green/teal terminal aesthetic.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64
FRAME_COUNT = 10
DURATION = 120

# Color palette
BG_DARK       = (18, 24, 22)       # deep charcoal-green
BG_MID        = (24, 32, 28)       # slightly lighter
CIRCUIT_COL   = (32, 52, 42)       # subtle circuit lines
SKIN_BASE     = (139, 98, 62)      # warm medium-brown
SKIN_SHADOW   = (105, 72, 42)      # shadow side
SKIN_LIGHT    = (162, 118, 78)     # highlight
HAIR_COL      = (22, 16, 12)       # very dark brown-black
NECK_COL      = (120, 85, 52)
TURTLE_BASE   = (28, 32, 30)       # near-black turtleneck
TURTLE_HIGH   = (38, 46, 42)       # turtleneck highlight
GLASS_FRAME   = (60, 220, 140)     # terminal green
GLASS_LENS    = (20, 60, 38, 160)  # semi-transparent green tint (RGBA)
GLASS_GLINT   = (180, 255, 200)    # glint highlight
EYE_WHITE     = (220, 215, 205)
EYE_IRIS      = (45, 32, 20)
EYE_PUPIL     = (12, 10, 8)
EYEBROW_COL   = (30, 20, 12)
CURSOR_GREEN  = (80, 255, 160)
CURSOR_DIM    = (30, 90, 55)


def draw_circuit_bg(draw, frame):
    """Draw subtle circuit/node pattern in background."""
    # Horizontal traces
    for y in range(0, H, 8):
        for x in range(0, W, 1):
            if (x + frame) % 16 < 14:
                draw.point((x, y), fill=CIRCUIT_COL)
    # Vertical traces
    for x in range(0, W, 10):
        for y in range(0, H, 1):
            draw.point((x, y), fill=CIRCUIT_COL)
    # Nodes at intersections
    for y in range(0, H, 8):
        for x in range(0, W, 10):
            draw.ellipse([x-1, y-1, x+1, y+1], fill=CIRCUIT_COL)


def draw_bust(draw, glint_frame, cursor_on):
    """Draw the isometric bust of Kwame."""

    # --- Shoulders / turtleneck body ---
    # Isometric slight top-down: body is wider at bottom
    # Turtleneck collar
    collar_pts = [
        (16, 54), (48, 54),
        (50, 62), (14, 62),
    ]
    draw.polygon(collar_pts, fill=TURTLE_BASE)
    # Collar highlight (left face in isometric)
    collar_hi = [
        (16, 54), (28, 54),
        (28, 62), (14, 62),
    ]
    draw.polygon(collar_hi, fill=TURTLE_HIGH)

    # Shoulder plane (top of turtleneck)
    shoulder_pts = [
        (12, 50), (52, 50),
        (50, 56), (14, 56),
    ]
    draw.polygon(shoulder_pts, fill=TURTLE_HIGH)

    # Neck
    draw.rectangle([26, 44, 38, 54], fill=NECK_COL)

    # --- Head shape (isometric bust, slight top-angle) ---
    # Main head - slightly trapezoidal for iso feel
    head_pts = [
        (20, 18),   # top-left
        (44, 18),   # top-right
        (46, 44),   # bottom-right
        (18, 44),   # bottom-left
    ]
    draw.polygon(head_pts, fill=SKIN_BASE)

    # Shadow side (left face in iso light-from-right)
    shadow_pts = [
        (20, 18),
        (28, 18),
        (26, 44),
        (18, 44),
    ]
    draw.polygon(shadow_pts, fill=SKIN_SHADOW)

    # Highlight (right cheek)
    for i in range(3):
        draw.line([(40 - i, 22), (44 - i, 36)], fill=SKIN_LIGHT, width=1)

    # --- Hair ---
    # Top of head / natural hair (low fade / close crop)
    hair_pts = [
        (20, 18),
        (44, 18),
        (44, 22),
        (41, 20),
        (23, 20),
        (20, 22),
    ]
    draw.polygon(hair_pts, fill=HAIR_COL)
    # Side fade
    draw.rectangle([18, 18, 22, 30], fill=HAIR_COL)
    draw.rectangle([42, 18, 46, 24], fill=HAIR_COL)

    # --- Eyebrows ---
    # Left brow (slightly raised — thoughtful)
    draw.line([(24, 27), (30, 25)], fill=EYEBROW_COL, width=2)
    # Right brow (slightly raised / arched)
    draw.line([(34, 25), (40, 27)], fill=EYEBROW_COL, width=2)
    # Raise right brow a pixel more for the "slightly raised eyebrow" look
    draw.point((37, 24), fill=EYEBROW_COL)
    draw.point((38, 24), fill=EYEBROW_COL)

    # --- Eyes ---
    # Left eye
    draw.ellipse([24, 29, 30, 34], fill=EYE_WHITE)
    draw.ellipse([25, 30, 29, 33], fill=EYE_IRIS)
    draw.ellipse([26, 31, 28, 32], fill=EYE_PUPIL)
    # Right eye
    draw.ellipse([34, 29, 40, 34], fill=EYE_WHITE)
    draw.ellipse([35, 30, 39, 33], fill=EYE_IRIS)
    draw.ellipse([36, 31, 38, 32], fill=EYE_PUPIL)

    # --- Nose ---
    draw.point((32, 36), fill=SKIN_SHADOW)
    draw.point((31, 37), fill=SKIN_SHADOW)
    draw.point((33, 37), fill=SKIN_SHADOW)

    # --- Mouth (thoughtful, slight upturn right side) ---
    draw.line([(27, 41), (32, 40)], fill=SKIN_SHADOW, width=1)
    draw.line([(32, 40), (37, 41)], fill=SKIN_SHADOW, width=1)
    draw.point((37, 41), fill=SKIN_SHADOW)

    # --- Glasses (terminal green frames) ---
    # Left lens frame
    draw.rectangle([22, 27, 31, 35], outline=GLASS_FRAME, width=1)
    # Right lens frame
    draw.rectangle([33, 27, 42, 35], outline=GLASS_FRAME, width=1)
    # Bridge
    draw.line([(31, 31), (33, 31)], fill=GLASS_FRAME, width=1)
    # Left temple
    draw.line([(22, 30), (19, 29)], fill=GLASS_FRAME, width=1)
    # Right temple
    draw.line([(42, 30), (45, 29)], fill=GLASS_FRAME, width=1)

    # Lens tint overlay (draw slightly inside)
    # Use a separate layer for alpha; we'll composite it below
    # For now, use a very subtle fill
    draw.rectangle([23, 28, 30, 34], fill=(25, 65, 45))
    draw.rectangle([34, 28, 41, 34], fill=(25, 65, 45))

    # --- Glasses glint animation ---
    glint_positions = [
        [(23, 28), (25, 28), (23, 29)],   # left lens top-left corner
        [(24, 28), (26, 28), (24, 29)],
        [(25, 28), (27, 28), (25, 29)],
        [(26, 28), (28, 28), (26, 29)],
        [(27, 28), (29, 28), (27, 29)],
    ]
    if glint_frame >= 0:
        gf = glint_frame % len(glint_positions)
        for pt in glint_positions[gf]:
            draw.point(pt, fill=GLASS_GLINT)
        # Mirror glint on right lens
        mirror = [(x + 11, y) for (x, y) in glint_positions[gf]]
        for pt in mirror:
            draw.point(pt, fill=GLASS_GLINT)

    # --- Cursor blink (bottom-right of frame, like a terminal prompt) ---
    cursor_col = CURSOR_GREEN if cursor_on else CURSOR_DIM
    draw.rectangle([54, 56, 58, 60], fill=cursor_col)


def make_frame(frame_idx):
    img = Image.new("RGB", (W, H), BG_DARK)
    draw = ImageDraw.Draw(img)

    # Background gradient rows
    for y in range(H):
        t = y / H
        r = int(BG_DARK[0] * (1 - t) + BG_MID[0] * t)
        g = int(BG_DARK[1] * (1 - t) + BG_MID[1] * t)
        b = int(BG_DARK[2] * (1 - t) + BG_MID[2] * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))

    # Circuit background (subtle, only visible around edges)
    draw_circuit_bg(draw, frame_idx)

    # Redraw background in center to avoid circuit lines on face
    for y in range(H):
        t = y / H
        r = int(BG_DARK[0] * (1 - t) + BG_MID[0] * t)
        g = int(BG_DARK[1] * (1 - t) + BG_MID[1] * t)
        b = int(BG_DARK[2] * (1 - t) + BG_MID[2] * t)
        draw.line([(10, y), (54, y)], fill=(r, g, b))

    # Glint cycles every 3 frames, 5 positions
    glint_cycle = 15  # full glint sweep repeats every 15 frames
    glint_frame = frame_idx % glint_cycle
    if glint_frame >= 5:
        glint_frame = -1  # no glint most of the time

    cursor_on = (frame_idx % 4) < 2  # blink every 2 frames

    draw_bust(draw, glint_frame, cursor_on)

    return img


def main():
    frames_rgb = []
    for i in range(FRAME_COUNT):
        frame = make_frame(i)
        frames_rgb.append(frame)

    # Convert each RGB frame to palette mode with a shared palette
    # Build a global palette from all frames combined
    combined = Image.new("RGB", (W * FRAME_COUNT, H))
    for i, f in enumerate(frames_rgb):
        combined.paste(f, (i * W, 0))
    palette_img = combined.quantize(colors=128)

    pal_data = palette_img.getpalette()

    palette_frames = []
    for f in frames_rgb:
        pf = f.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
        palette_frames.append(pf)

    out_path = "/mnt/data/hello-world/static/avatars/architect_b.gif"

    # Use imageio-style manual save: write all frames as GIF via Pillow
    palette_frames[0].save(
        out_path,
        format="GIF",
        save_all=True,
        append_images=palette_frames[1:],
        duration=DURATION,
        loop=0,
        disposal=2,
        optimize=False,
    )
    print(f"Saved: {out_path}")

    # Verify
    check = Image.open(out_path)
    print(f"Format: {check.format}, Size: {check.size}, Frames: {getattr(check, 'n_frames', 1)}")


if __name__ == "__main__":
    main()
