#!/usr/bin/env python3
"""
Generate portrait GIF for Kwame the Constructor — Option C: Blueprint Mode.

64x64 animated GIF, 10 frames.
- Deep navy background with faint graph-paper grid (orthogonal lines)
- Kwame in 3/4 profile facing left, looking at something off-screen
- Cool blue-white accent light from the left (screen/drafting-lamp glow)
- Animation: gaze shifts 1px right (tracking imaginary diagram) then back, slow cycle
"""

from PIL import Image, ImageDraw

# ---- Palette ----
BG_NAVY         = (8, 14, 32)
GRID_H          = (16, 28, 58)       # horizontal graph lines
GRID_V          = (12, 22, 48)       # vertical graph lines (slightly dimmer)

# Skin — 3/4 lit face: bright left side, shadowed right
SKIN_LIT        = (215, 155, 95)     # left/front face, screen-lit
SKIN_MID        = (175, 115, 65)     # mid-face
SKIN_SHADOW     = (100, 65, 35)      # far right cheek / jaw shadow
SKIN_DEEP       = (70, 42, 20)       # deepest shadows (ear area)

# Screen-glow rim light (cool blue-white from upper-left)
RIM_BRIGHT      = (180, 220, 255)    # hottest highlight
RIM_MID         = (110, 170, 230)    # rim fill

# Hair — natural dark with faint blue sheen from screen
HAIR_BASE       = (28, 18, 12)
HAIR_SHEEN      = (45, 55, 90)       # screen reflection on top of hair

# Eyes
EYE_WHITE       = (235, 240, 248)
EYE_IRIS        = (55, 38, 20)
EYE_PUPIL       = (15, 10, 8)
EYE_LID         = (85, 52, 28)       # upper lid line

# Mouth / features
MOUTH_LINE      = (95, 55, 28)
NOSE_SHADOW     = (130, 82, 42)

# Shirt — dark, lit on the left shoulder by screen glow
SHIRT_DARK      = (18, 22, 38)
SHIRT_LIT       = (35, 48, 80)       # screen light on left shoulder

# Screen glow patch (bottom-left — the "light source")
GLOW_CORE       = (140, 195, 255)
GLOW_FADE       = (50, 85, 150)

SIZE = 64


def draw_background(draw):
    """Deep navy with orthogonal graph-paper grid lines."""
    draw.rectangle([0, 0, SIZE - 1, SIZE - 1], fill=BG_NAVY)
    # Vertical lines every 6px
    for x in range(0, SIZE, 6):
        draw.line([(x, 0), (x, SIZE - 1)], fill=GRID_V, width=1)
    # Horizontal lines every 6px
    for y in range(0, SIZE, 6):
        draw.line([(0, y), (SIZE - 1, y)], fill=GRID_H, width=1)


def draw_screen_glow(draw, intensity=2):
    """
    Blue-white glow patch in upper-left, simulating a drafting-lamp or monitor.
    intensity: 0,1,2 — subtle flicker across frames to force frame uniqueness.
    """
    fade_levels = [
        (40, 72, 140),
        (50, 85, 150),
        (60, 95, 165),
    ]
    mid_levels = [
        (70, 108, 178),
        (80, 120, 190),
        (90, 132, 205),
    ]
    fade = fade_levels[intensity]
    mid = mid_levels[intensity]
    draw.ellipse([0, 2, 18, 22], fill=fade)
    draw.ellipse([0, 4, 11, 16], fill=mid)
    draw.ellipse([0, 6, 6, 12], fill=GLOW_CORE)


def draw_bust_profile(draw, gaze_offset):
    """
    Draw Kwame in 3/4 left-facing profile.
    gaze_offset: 0 or 1 — shifts iris position to simulate tracking.

    Head occupies roughly x=[20..56], y=[6..34]
    Torso below that, wider.
    """

    # --- Torso (shirt) — 3/4 view, left shoulder forward ---
    # Left shoulder (lit) is lower and wider; right shoulder recedes
    torso_pts = [
        (10, 64),   # bottom-left
        (56, 64),   # bottom-right
        (50, 42),   # right shoulder
        (38, 36),   # right collarbone
        (26, 36),   # left collarbone
        (12, 44),   # left shoulder
    ]
    draw.polygon(torso_pts, fill=SHIRT_DARK)
    # Left shoulder lit by screen glow
    left_shoulder = [
        (10, 64),
        (12, 44),
        (20, 44),
        (18, 64),
    ]
    draw.polygon(left_shoulder, fill=SHIRT_LIT)

    # --- Neck ---
    neck_pts = [
        (28, 36),
        (36, 36),
        (35, 29),
        (29, 29),
    ]
    draw.polygon(neck_pts, fill=SKIN_MID)
    # Neck rim light on left side
    draw.line([(28, 36), (29, 29)], fill=RIM_MID, width=1)

    # --- Head base (3/4 left-facing — left side of face is lit, right recedes) ---
    # Slightly asymmetric: left cheek protrudes more toward viewer
    head_pts = [
        (20, 29),   # jaw-left (near side)
        (44, 29),   # jaw-right
        (43, 13),   # temple-right
        (22, 12),   # temple-left
    ]
    draw.polygon(head_pts, fill=SKIN_MID)

    # Right side of face — shadow (far side in 3/4)
    right_face = [
        (44, 29),
        (43, 13),
        (47, 14),
        (48, 30),
    ]
    draw.polygon(right_face, fill=SKIN_SHADOW)

    # Left side lit by screen glow — rim strip
    draw.line([(20, 29), (22, 12)], fill=RIM_BRIGHT, width=2)

    # Forehead — lit on left half
    draw.rectangle([22, 12, 34, 19], fill=SKIN_LIT)
    draw.rectangle([34, 12, 43, 19], fill=SKIN_MID)

    # Lower face / cheeks
    draw.rectangle([22, 19, 34, 29], fill=SKIN_LIT)
    draw.rectangle([34, 19, 44, 29], fill=SKIN_SHADOW)

    # Jaw slight shadow
    draw.line([(21, 29), (44, 29)], fill=SKIN_DEEP, width=1)

    # --- Ear (left-side, visible in 3/4) ---
    draw.ellipse([18, 21, 23, 27], fill=SKIN_MID)
    draw.ellipse([19, 22, 22, 26], fill=SKIN_DEEP)
    draw.line([(18, 24), (20, 21)], fill=RIM_MID, width=1)

    # --- Hair ---
    # Top of head — dark with faint blue sheen on lit side
    hair_top = [
        (22, 12),
        (43, 13),
        (41, 7),
        (24, 6),
    ]
    draw.polygon(hair_top, fill=HAIR_BASE)
    # Blue sheen on left hair (screen reflection)
    draw.line([(24, 6), (22, 12)], fill=HAIR_SHEEN, width=2)
    # Hair close-cropped sides
    draw.rectangle([20, 12, 22, 20], fill=HAIR_BASE)
    draw.rectangle([43, 13, 46, 20], fill=HAIR_BASE)

    # --- Nose (visible in 3/4, shifted left) ---
    # Nose bridge
    draw.line([(30, 19), (29, 25)], fill=NOSE_SHADOW, width=1)
    # Nose tip
    draw.ellipse([27, 24, 32, 27], fill=SKIN_LIT)
    # Nostril shadow
    draw.point((28, 26), fill=SKIN_DEEP)

    # --- Eye — looking left (3/4 profile, near eye only) ---
    # Eye socket
    draw.rectangle([24, 21, 32, 25], fill=SKIN_MID)
    # White
    draw.rectangle([24, 21, 32, 24], fill=EYE_WHITE)
    # Iris — position shifts with gaze_offset (0=gazing left, 1=tracking right)
    iris_x = 24 + gaze_offset
    draw.rectangle([iris_x, 21, iris_x + 5, 24], fill=EYE_IRIS)
    # Pupil
    draw.rectangle([iris_x + 1, 22, iris_x + 4, 24], fill=EYE_PUPIL)
    # Highlight on iris
    draw.point((iris_x + 1, 21), fill=RIM_BRIGHT)
    # Upper lid
    draw.line([(24, 21), (32, 21)], fill=EYE_LID, width=1)
    # Lower lid
    draw.line([(24, 24), (32, 24)], fill=SKIN_SHADOW, width=1)

    # Slight second eye hint (far eye, partially visible)
    draw.rectangle([35, 22, 40, 24], fill=SKIN_SHADOW)
    draw.rectangle([36, 22, 39, 24], fill=EYE_IRIS)

    # --- Mouth — closed, concentrated, not performing ---
    # Slightly asymmetric — 3/4 view compresses right side
    draw.line([(26, 27), (36, 27)], fill=MOUTH_LINE, width=1)
    # Upper lip shadow line (subtle)
    draw.line([(27, 26), (35, 26)], fill=SKIN_SHADOW, width=1)


N_FRAMES = 12

# Gaze pattern: hold left (0), shift right (1), hold, shift back.
# Slow, deliberate tracking — he's following something on the diagram.
# 0=gaze left (looking at diagram), 1=gaze shifts 1px right (refocusing)
GAZE_PATTERN = [0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0]

# Screen glow flicker (very subtle): cycles 0,1,2 to keep frames unique
GLOW_PATTERN = [1, 1, 2, 2, 1, 0, 0, 1, 2, 1, 0, 1]

frames = []

for frame_idx in range(N_FRAMES):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    draw_background(draw)
    draw_screen_glow(draw, intensity=GLOW_PATTERN[frame_idx])
    draw_bust_profile(draw, gaze_offset=GAZE_PATTERN[frame_idx])

    frames.append(img.convert("RGB"))

out_path = "/mnt/data/hello-world/static/avatars/architect_c.gif"

palette_frames = [f.convert("P", palette=Image.ADAPTIVE, colors=256) for f in frames]

palette_frames[0].save(
    out_path,
    save_all=True,
    append_images=palette_frames[1:],
    duration=140,
    loop=0,
    disposal=2,
    optimize=False,
)

print(f"Saved: {out_path}")

from PIL import Image as PILImage
verify = PILImage.open(out_path)
print(f"Format: {verify.format}, Size: {verify.size}, Frames: {getattr(verify, 'n_frames', 1)}")
