#!/usr/bin/env python3
"""
Generate isometric pixel art avatar for Ibrahim the Immovable (Option B).
Stoic Elder: deep burgundy robes, grey temples, strong jaw, gold medallion,
dark navy background with faint concentric circle mandala pattern.
Animation: eyes slowly survey left then right (2-pixel gaze shift).
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64
FRAME_COUNT = 10
DURATION = 150

# Color palette
BG_NAVY       = (8, 12, 28)        # very dark navy
BG_MID        = (12, 16, 36)       # slightly lighter navy
MANDALA_COL   = (16, 22, 50)       # faint concentric circles
SKIN_BASE     = (148, 106, 68)     # warm brown (weathered)
SKIN_SHADOW   = (108, 76, 46)      # deep shadow side
SKIN_LIGHT    = (172, 130, 88)     # highlight
SKIN_AGED     = (130, 94, 60)      # mid-aged tone
HAIR_DARK     = (28, 22, 20)       # dark hair body
HAIR_GREY     = (160, 155, 150)    # grey at temples
BEARD_GREY    = (140, 132, 124)    # grey-brown beard stubble
NECK_COL      = (128, 90, 55)      # neck
ROBE_BASE     = (80, 18, 30)       # deep burgundy/wine
ROBE_SHADOW   = (52, 10, 18)       # robe shadow
ROBE_LIGHT    = (108, 28, 44)      # robe highlight/fold
ROBE_COLLAR   = (64, 12, 22)       # high collar
COLLAR_EDGE   = (100, 22, 38)      # collar highlight edge
GOLD_BASE     = (192, 152, 48)     # brass/gold medallion
GOLD_LIGHT    = (230, 200, 100)    # gold highlight
GOLD_SHADOW   = (140, 108, 28)     # gold shadow
EYE_WHITE     = (210, 205, 195)    # slightly weathered whites
EYE_IRIS      = (52, 38, 24)       # dark brown iris
EYE_PUPIL     = (14, 10, 8)        # near-black pupil
EYEBROW_COL   = (70, 56, 44)       # dark-grey brow (going grey)
WRINKLE_COL   = (118, 84, 52)      # weathered wrinkle lines
MOUTH_COL     = (110, 76, 50)      # firm set mouth


# --- Gaze positions for animation ---
# 10 frames: center (0..2), sweep left (-2..3), hold left (4), sweep right (5..7),
# hold right (8), return center (9)
GAZE_X_OFFSETS = [0, 0, -1, -2, -2, -1, 0, 1, 2, 2]  # left then right
GAZE_Y_OFFSETS = [0, 0,  0,  0,  0,  0, 0, 0, 0, 0]


def draw_mandala_bg(draw):
    """Very faint concentric circles in dark navy — mandala / target feel."""
    cx, cy = 32, 32
    for r in range(4, 36, 5):
        # Draw as a sequence of points (no fill, just outline) at low contrast
        # Use a bounding box to approximate
        x0, y0 = cx - r, cy - r
        x1, y1 = cx + r, cy + r
        draw.ellipse([x0, y0, x1, y1], outline=MANDALA_COL)
    # Add two faint radial spokes (very subtle)
    for angle_deg in range(0, 360, 45):
        angle = math.radians(angle_deg)
        x_end = int(cx + 30 * math.cos(angle))
        y_end = int(cy + 30 * math.sin(angle))
        # Only draw every other spoke and only the outer half
        x_mid = int(cx + 14 * math.cos(angle))
        y_mid = int(cy + 14 * math.sin(angle))
        draw.line([(x_mid, y_mid), (x_end, y_end)], fill=MANDALA_COL)


def draw_bust(draw, gaze_dx, gaze_dy):
    """Draw Ibrahim's isometric bust."""

    # --- Robe / body (wide, council-like) ---
    # Main robe body — trapezoid widening downward
    robe_pts = [
        (10, 50), (54, 50),
        (58, 64), (6, 64),
    ]
    draw.polygon(robe_pts, fill=ROBE_BASE)

    # Robe shadow side (left face in isometric light from upper-right)
    robe_shadow_pts = [
        (10, 50), (24, 50),
        (22, 64), (6, 64),
    ]
    draw.polygon(robe_shadow_pts, fill=ROBE_SHADOW)

    # Robe fold highlight (right side)
    robe_fold = [
        (44, 50), (54, 50),
        (58, 64), (50, 64),
    ]
    draw.polygon(robe_fold, fill=ROBE_LIGHT)

    # Robe top / shoulder plane
    shoulder_pts = [
        (10, 48), (54, 48),
        (52, 54), (12, 54),
    ]
    draw.polygon(shoulder_pts, fill=ROBE_LIGHT)

    # --- High collar ---
    # Collar rises up around neck, ancient council feel
    collar_left = [
        (16, 40), (24, 40),
        (22, 52), (12, 52),
    ]
    draw.polygon(collar_left, fill=ROBE_COLLAR)
    draw.line([(16, 40), (12, 52)], fill=COLLAR_EDGE, width=1)

    collar_right = [
        (40, 40), (48, 40),
        (52, 52), (42, 52),
    ]
    draw.polygon(collar_right, fill=ROBE_COLLAR)
    draw.line([(48, 40), (52, 52)], fill=COLLAR_EDGE, width=1)

    # Collar center V
    collar_center = [
        (24, 40), (40, 40),
        (38, 52), (26, 52),
    ]
    draw.polygon(collar_center, fill=ROBE_SHADOW)

    # --- Gold/brass circular medallion at collar center ---
    # Position it at the collar V notch
    mx, my = 32, 50
    mr = 5
    # Outer ring
    draw.ellipse([mx-mr, my-mr, mx+mr, my+mr], fill=GOLD_BASE, outline=GOLD_SHADOW)
    # Inner circle
    draw.ellipse([mx-3, my-3, mx+3, my+3], fill=GOLD_SHADOW)
    # Highlight arc (top-left)
    draw.arc([mx-mr, my-mr, mx+mr, my+mr], start=200, end=300, fill=GOLD_LIGHT, width=1)
    # Center dot
    draw.ellipse([mx-1, my-1, mx+1, my+1], fill=GOLD_LIGHT)
    # Cross engraving (thin lines on medallion)
    draw.line([(mx, my-3), (mx, my+3)], fill=GOLD_SHADOW, width=1)
    draw.line([(mx-3, my), (mx+3, my)], fill=GOLD_SHADOW, width=1)

    # --- Neck ---
    draw.rectangle([26, 42, 38, 50], fill=NECK_COL)
    # Shadow on left of neck
    draw.rectangle([26, 42, 29, 50], fill=SKIN_SHADOW)

    # --- Head (isometric bust, slight top-down angle) ---
    # Slightly wider at jaw for strong-jaw look
    head_pts = [
        (19, 16),   # top-left
        (45, 16),   # top-right
        (47, 42),   # bottom-right (jaw)
        (17, 42),   # bottom-left (jaw)
    ]
    draw.polygon(head_pts, fill=SKIN_BASE)

    # Shadow left side (isometric — light from upper right)
    shadow_pts = [
        (19, 16),
        (25, 16),
        (23, 42),
        (17, 42),
    ]
    draw.polygon(shadow_pts, fill=SKIN_SHADOW)

    # Weathered/aged mid-tone on lower cheeks
    for y in range(32, 42):
        draw.point((25, y), fill=SKIN_AGED)
        draw.point((26, y), fill=SKIN_AGED)

    # Highlight — right cheek plane
    for i in range(2):
        draw.line([(42 - i, 20), (45 - i, 35)], fill=SKIN_LIGHT, width=1)

    # Strong jaw definition (wider lower face)
    draw.line([(18, 38), (46, 38)], fill=SKIN_SHADOW, width=1)

    # --- Hair ---
    # Dark crown hair
    hair_pts = [
        (19, 16),
        (45, 16),
        (45, 21),
        (43, 19),
        (21, 19),
        (19, 21),
    ]
    draw.polygon(hair_pts, fill=HAIR_DARK)

    # Grey at temples — left temple
    left_temple = [
        (17, 18), (22, 16),
        (23, 22), (17, 26),
    ]
    draw.polygon(left_temple, fill=HAIR_GREY)

    # Grey at temples — right temple
    right_temple = [
        (42, 16), (47, 18),
        (47, 26), (42, 22),
    ]
    draw.polygon(right_temple, fill=HAIR_GREY)

    # Small grey streak in crown center
    draw.line([(30, 16), (34, 16)], fill=HAIR_GREY, width=1)

    # --- Eyebrows (strong, slightly greying) ---
    # Left brow — straight, commanding
    draw.line([(23, 25), (30, 23)], fill=EYEBROW_COL, width=2)
    draw.line([(23, 25), (30, 23)], fill=BEARD_GREY, width=1)  # grey overlay
    # Right brow
    draw.line([(34, 23), (41, 25)], fill=EYEBROW_COL, width=2)
    draw.line([(34, 23), (41, 25)], fill=BEARD_GREY, width=1)

    # --- Eyes with gaze shift ---
    # Left eye socket
    draw.ellipse([23, 27, 31, 33], fill=SKIN_SHADOW)  # socket shadow
    # Left eye white
    draw.ellipse([24, 28, 30, 32], fill=EYE_WHITE)
    # Iris and pupil — shifted by gaze
    lx = 26 + gaze_dx
    ly = 29 + gaze_dy
    draw.ellipse([lx, ly, lx+2, ly+2], fill=EYE_IRIS)
    draw.point((lx+1, ly+1), fill=EYE_PUPIL)
    # Eyelid line
    draw.line([(24, 28), (30, 28)], fill=SKIN_SHADOW, width=1)

    # Right eye socket
    draw.ellipse([33, 27, 41, 33], fill=SKIN_SHADOW)
    # Right eye white
    draw.ellipse([34, 28, 40, 32], fill=EYE_WHITE)
    # Iris and pupil — shifted
    rx = 36 + gaze_dx
    ry = 29 + gaze_dy
    draw.ellipse([rx, ry, rx+2, ry+2], fill=EYE_IRIS)
    draw.point((rx+1, ry+1), fill=EYE_PUPIL)
    # Eyelid line
    draw.line([(34, 28), (40, 28)], fill=SKIN_SHADOW, width=1)

    # --- Weathered wrinkle lines ---
    # Crow's feet — left eye
    draw.line([(23, 29), (21, 28)], fill=WRINKLE_COL, width=1)
    draw.line([(23, 31), (21, 32)], fill=WRINKLE_COL, width=1)
    # Crow's feet — right eye
    draw.line([(41, 29), (43, 28)], fill=WRINKLE_COL, width=1)
    draw.line([(41, 31), (43, 32)], fill=WRINKLE_COL, width=1)
    # Forehead line (single horizontal)
    draw.line([(24, 22), (40, 22)], fill=WRINKLE_COL, width=1)
    # Nasolabial fold hints
    draw.line([(27, 34), (25, 39)], fill=WRINKLE_COL, width=1)
    draw.line([(37, 34), (39, 39)], fill=WRINKLE_COL, width=1)

    # --- Nose (broad, strong) ---
    draw.point((32, 34), fill=SKIN_SHADOW)
    draw.point((30, 35), fill=SKIN_SHADOW)
    draw.point((34, 35), fill=SKIN_SHADOW)
    draw.line([(31, 33), (31, 35)], fill=SKIN_SHADOW, width=1)
    draw.line([(33, 33), (33, 35)], fill=SKIN_SHADOW, width=1)

    # --- Mouth (set firm — immovable) ---
    # Straight, thin-lipped, no smile
    draw.line([(27, 38), (37, 38)], fill=MOUTH_COL, width=1)
    draw.line([(28, 39), (36, 39)], fill=SKIN_SHADOW, width=1)
    # Slight downward corners — gravitas
    draw.point((27, 39), fill=SKIN_SHADOW)
    draw.point((37, 39), fill=SKIN_SHADOW)

    # --- Stubble / beard shadow on jaw ---
    for x in range(22, 42, 2):
        for y in range(36, 42, 2):
            draw.point((x, y), fill=BEARD_GREY)


def make_frame(frame_idx):
    img = Image.new("RGB", (W, H), BG_NAVY)
    draw = ImageDraw.Draw(img)

    # Background gradient (dark navy, darker top to slightly lighter bottom)
    for y in range(H):
        t = y / H
        r = int(BG_NAVY[0] * (1 - t) + BG_MID[0] * t)
        g = int(BG_NAVY[1] * (1 - t) + BG_MID[1] * t)
        b = int(BG_NAVY[2] * (1 - t) + BG_MID[2] * t)
        draw.line([(0, y), (W - 1, y)], fill=(r, g, b))

    # Mandala background (static — same every frame)
    draw_mandala_bg(draw)

    # Redraw gradient in center rectangle to keep face clean
    for y in range(H):
        t = y / H
        r = int(BG_NAVY[0] * (1 - t) + BG_MID[0] * t)
        g = int(BG_NAVY[1] * (1 - t) + BG_MID[1] * t)
        b = int(BG_NAVY[2] * (1 - t) + BG_MID[2] * t)
        draw.line([(8, y), (56, y)], fill=(r, g, b))

    gaze_dx = GAZE_X_OFFSETS[frame_idx % FRAME_COUNT]
    gaze_dy = GAZE_Y_OFFSETS[frame_idx % FRAME_COUNT]

    draw_bust(draw, gaze_dx, gaze_dy)

    return img


def main():
    frames_rgb = [make_frame(i) for i in range(FRAME_COUNT)]

    # Build shared palette from all frames combined
    combined = Image.new("RGB", (W * FRAME_COUNT, H))
    for i, f in enumerate(frames_rgb):
        combined.paste(f, (i * W, 0))

    palette_frames = []
    for f in frames_rgb:
        pf = f.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
        palette_frames.append(pf)

    out_path = "/mnt/data/hello-world/static/avatars/hiring-manager_b.gif"

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

    check = Image.open(out_path)
    print(f"Format: {check.format}, Size: {check.size}, Frames: {getattr(check, 'n_frames', 1)}")
    assert check.format == "GIF", "Not a GIF!"
    assert getattr(check, "n_frames", 1) > 1, "Not animated!"
    print("Verification passed.")


if __name__ == "__main__":
    main()
