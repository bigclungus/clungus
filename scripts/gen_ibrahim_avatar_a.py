#!/usr/bin/env python3
"""
Generate Ibrahim the Immovable - Formal Authority avatar (Option A)
64x64 animated GIF, isometric bust, dark suit, amber accent, slow blink + head nod
"""
from PIL import Image, ImageDraw
import math

# Color palette
BG_CHARCOAL = (28, 26, 30)
GLOW_WARM = (80, 55, 30)
SUIT_DARK = (30, 30, 42)
SUIT_MID = (42, 42, 58)
SUIT_HIGHLIGHT = (62, 62, 80)
SHIRT_WHITE = (220, 220, 228)
SHIRT_SHADOW = (170, 170, 180)
SKIN_BASE = (180, 130, 90)
SKIN_DARK = (140, 95, 60)
SKIN_LIGHT = (210, 160, 110)
SKIN_HIGHLIGHT = (230, 185, 130)
AMBER_BRIGHT = (255, 185, 60)
AMBER_MID = (210, 145, 30)
AMBER_DARK = (160, 100, 15)
HAIR_DARK = (25, 18, 12)
HAIR_MID = (45, 32, 20)
EYE_DARK = (20, 15, 10)
EYE_WHITE = (235, 225, 215)
EYE_IRIS = (80, 55, 30)
HAND_BASE = (170, 120, 80)
HAND_DARK = (130, 90, 55)


def draw_background(draw, frame_idx, num_frames):
    """Deep charcoal background with subtle warm glow behind figure."""
    # Base fill
    draw.rectangle([0, 0, 63, 63], fill=BG_CHARCOAL)

    # Warm glow centered behind head (elliptical gradient approximated with concentric ellipses)
    cx, cy = 32, 26
    glow_intensity = 0.7 + 0.3 * math.sin(frame_idx / num_frames * 2 * math.pi)
    for r in range(18, 0, -1):
        alpha = int(30 * (1 - r / 18.0) * glow_intensity)
        shade = (
            min(255, BG_CHARCOAL[0] + int((GLOW_WARM[0] - BG_CHARCOAL[0]) * alpha / 30)),
            min(255, BG_CHARCOAL[1] + int((GLOW_WARM[1] - BG_CHARCOAL[1]) * alpha / 30)),
            min(255, BG_CHARCOAL[2] + int((GLOW_WARM[2] - BG_CHARCOAL[2]) * alpha / 30)),
        )
        draw.ellipse([cx - r * 2, cy - r, cx + r * 2, cy + r], fill=shade)


def draw_suit_body(draw, dy=0):
    """Draw the isometric bust — suit jacket, shirt front, pocket square."""
    # Suit jacket body (trapezoid, wider at bottom)
    # Left side of jacket
    jacket_pts_left = [
        (18, 50 + dy), (14, 58 + dy), (32, 63 + dy), (32, 50 + dy)
    ]
    draw.polygon(jacket_pts_left, fill=SUIT_DARK)

    # Right side of jacket
    jacket_pts_right = [
        (46, 50 + dy), (50, 58 + dy), (32, 63 + dy), (32, 50 + dy)
    ]
    draw.polygon(jacket_pts_right, fill=SUIT_MID)

    # Jacket lapels
    # Left lapel
    lapel_left = [(22, 46 + dy), (18, 50 + dy), (28, 52 + dy), (30, 47 + dy)]
    draw.polygon(lapel_left, fill=SUIT_MID)
    # Right lapel
    lapel_right = [(42, 46 + dy), (46, 50 + dy), (36, 52 + dy), (34, 47 + dy)]
    draw.polygon(lapel_right, fill=SUIT_DARK)

    # Shirt front (white strip between lapels)
    shirt_pts = [(30, 47 + dy), (34, 47 + dy), (36, 52 + dy), (28, 52 + dy)]
    draw.polygon(shirt_pts, fill=SHIRT_WHITE)

    # Shirt shadow on right
    shirt_shadow_pts = [(32, 47 + dy), (34, 47 + dy), (36, 52 + dy), (32, 52 + dy)]
    draw.polygon(shirt_shadow_pts, fill=SHIRT_SHADOW)

    # Pocket square (amber) — upper left chest
    ps_pts = [(20, 46 + dy), (24, 45 + dy), (25, 48 + dy), (21, 49 + dy)]
    draw.polygon(ps_pts, fill=AMBER_BRIGHT)
    # Pocket square fold detail
    draw.line([(20, 46 + dy), (22, 47 + dy)], fill=AMBER_DARK, width=1)

    # Shoulder highlights (isometric)
    draw.line([(18, 50 + dy), (32, 46 + dy)], fill=SUIT_HIGHLIGHT, width=1)
    draw.line([(46, 50 + dy), (32, 46 + dy)], fill=SUIT_MID, width=1)

    # Folded hands at bottom — partially visible
    # Left hand
    draw.ellipse([20, 58 + dy, 28, 63 + dy], fill=HAND_BASE)
    draw.ellipse([20, 59 + dy, 26, 63 + dy], fill=HAND_DARK)
    # Right hand overlapping
    draw.ellipse([28, 57 + dy, 38, 63 + dy], fill=HAND_BASE)
    draw.ellipse([30, 59 + dy, 38, 63 + dy], fill=HAND_DARK)
    # Knuckle lines
    draw.line([(30, 59 + dy), (36, 59 + dy)], fill=HAND_DARK, width=1)


def draw_neck(draw, dy=0):
    """Draw neck."""
    draw.rectangle([28, 43 + dy, 36, 48 + dy], fill=SKIN_BASE)
    draw.line([(28, 43 + dy), (28, 48 + dy)], fill=SKIN_DARK, width=1)


def draw_head(draw, dy=0, eye_close=0.0):
    """
    Draw Ibrahim's head.
    dy: vertical offset for nod animation
    eye_close: 0.0 = open, 1.0 = fully closed
    """
    # Head shape — slightly wide, isometric slight top-down
    # Main face (front plane)
    face_pts = [
        (22, 30 + dy), (42, 30 + dy),
        (40, 44 + dy), (24, 44 + dy)
    ]
    draw.polygon(face_pts, fill=SKIN_BASE)

    # Right side plane (darker, isometric)
    side_pts = [
        (42, 30 + dy), (46, 33 + dy),
        (44, 46 + dy), (40, 44 + dy)
    ]
    draw.polygon(side_pts, fill=SKIN_DARK)

    # Top of head
    top_pts = [
        (24, 22 + dy), (40, 22 + dy),
        (46, 25 + dy), (42, 30 + dy),
        (22, 30 + dy), (18, 27 + dy)
    ]
    draw.polygon(top_pts, fill=SKIN_LIGHT)

    # Chin definition
    draw.line([(26, 44 + dy), (38, 44 + dy)], fill=SKIN_DARK, width=1)

    # Jaw shadow
    draw.ellipse([24, 42 + dy, 40, 46 + dy], fill=SKIN_DARK, outline=None)
    # Re-draw lower face to clean up
    draw.rectangle([25, 38 + dy, 39, 44 + dy], fill=SKIN_BASE)

    # HAIR — close-cropped, dark
    # Top hair
    hair_top = [
        (24, 22 + dy), (40, 22 + dy),
        (46, 25 + dy), (44, 27 + dy),
        (40, 26 + dy), (32, 25 + dy),
        (22, 26 + dy), (18, 27 + dy)
    ]
    draw.polygon(hair_top, fill=HAIR_DARK)
    # Hairline — front
    draw.line([(22, 29 + dy), (42, 29 + dy)], fill=HAIR_DARK, width=1)
    draw.line([(22, 28 + dy), (42, 28 + dy)], fill=HAIR_MID, width=1)

    # EARS
    draw.ellipse([18, 32 + dy, 23, 38 + dy], fill=SKIN_DARK)
    draw.ellipse([19, 33 + dy, 22, 37 + dy], fill=SKIN_BASE)

    # EYEBROWS — strong, composed
    draw.line([(25, 32 + dy), (31, 31 + dy)], fill=HAIR_DARK, width=2)
    draw.line([(35, 31 + dy), (40, 32 + dy)], fill=HAIR_DARK, width=2)

    # EYES
    eye_height_l = max(1, int(3 * (1.0 - eye_close)))
    eye_height_r = max(1, int(3 * (1.0 - eye_close)))

    if eye_close < 0.95:
        # Eye whites
        draw.ellipse([25, 34 + dy, 32, 34 + dy + eye_height_l], fill=EYE_WHITE)
        draw.ellipse([34, 34 + dy, 40, 34 + dy + eye_height_r], fill=EYE_WHITE)
        # Irises
        iris_h = max(1, eye_height_l - 1)
        draw.ellipse([27, 34 + dy, 30, 34 + dy + iris_h], fill=EYE_IRIS)
        draw.ellipse([35, 34 + dy, 38, 34 + dy + iris_h], fill=EYE_IRIS)
        # Pupils
        if iris_h >= 2:
            draw.point((28, 35 + dy), fill=EYE_DARK)
            draw.point((36, 35 + dy), fill=EYE_DARK)
    # Eyelids (upper)
    draw.line([(25, 34 + dy), (32, 34 + dy)], fill=HAIR_DARK, width=1)
    draw.line([(34, 34 + dy), (40, 34 + dy)], fill=HAIR_DARK, width=1)

    # Closed eyelid line
    if eye_close >= 0.7:
        draw.line([(25, 35 + dy), (32, 35 + dy)], fill=SKIN_BASE, width=2)
        draw.line([(34, 35 + dy), (40, 35 + dy)], fill=SKIN_BASE, width=2)

    # NOSE — subtle
    draw.line([(31, 36 + dy), (30, 40 + dy)], fill=SKIN_DARK, width=1)
    draw.point((30, 40 + dy), fill=SKIN_DARK)
    draw.point((33, 40 + dy), fill=SKIN_DARK)

    # MOUTH — composed, slight set
    draw.line([(28, 42 + dy), (36, 42 + dy)], fill=SKIN_DARK, width=1)
    # Very slight upward curve at corners (neutral-firm expression)
    draw.point((28, 42 + dy), fill=SKIN_BASE)
    draw.point((36, 42 + dy), fill=SKIN_BASE)

    # Cheek highlight
    draw.point((26, 36 + dy), fill=SKIN_HIGHLIGHT)
    draw.point((26, 37 + dy), fill=SKIN_HIGHLIGHT)

    # Face contour shadow (right side)
    for y in range(30 + dy, 44 + dy):
        draw.point((41, y), fill=SKIN_DARK)


def generate_frame(frame_idx, num_frames):
    """Generate a single frame of the animation."""
    img = Image.new("RGBA", (64, 64), BG_CHARCOAL)
    draw = ImageDraw.Draw(img)

    # Animation parameters
    # Blink: frames 4-6 out of 10
    blink_frames = {4: 0.3, 5: 1.0, 6: 0.3}
    eye_close = blink_frames.get(frame_idx, 0.0)

    # Head nod: very subtle, 1 pixel over full cycle
    # Nod down slightly around frame 7-9
    nod_curve = [0, 0, 0, 0, 0, 0, 0, 1, 1, 0]  # 10 frames
    head_dy = nod_curve[frame_idx % len(nod_curve)]

    draw_background(draw, frame_idx, num_frames)
    draw_suit_body(draw, dy=head_dy)
    draw_neck(draw, dy=head_dy)
    draw_head(draw, dy=head_dy, eye_close=eye_close)

    # Convert to RGB palette for GIF
    return img.convert("RGBA")


def main():
    num_frames = 10
    frames = []
    for i in range(num_frames):
        frame = generate_frame(i, num_frames)
        frames.append(frame)

    # Convert to palette mode for animated GIF
    palette_frames = []
    for frame in frames:
        # Composite onto charcoal background (handle transparency)
        bg = Image.new("RGBA", (64, 64), BG_CHARCOAL + (255,))
        bg.paste(frame, mask=frame.split()[3])
        palette_frames.append(bg.convert("P", palette=Image.ADAPTIVE, colors=256))

    output_path = "/mnt/data/hello-world/static/avatars/hiring-manager_a.gif"
    palette_frames[0].save(
        output_path,
        save_all=True,
        append_images=palette_frames[1:],
        duration=120,
        loop=0,
        disposal=2,
        optimize=False,
    )
    print(f"Saved: {output_path}")

    # Verify
    from PIL import Image as PImage
    verify = PImage.open(output_path)
    print(f"Size: {verify.size}")
    print(f"Format: {verify.format}")
    n = 0
    try:
        while True:
            n += 1
            verify.seek(n)
    except EOFError:
        pass
    print(f"Frames: {n + 1}")


if __name__ == "__main__":
    main()
