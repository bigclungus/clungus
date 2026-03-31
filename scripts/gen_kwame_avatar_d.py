#!/usr/bin/env python3
"""
Generate portrait GIF for Kwame the Constructor — Option D: The Load-Bearing Presence.

64x64 animated GIF, 16 frames.
- Pure black background
- Kwame fully facing viewer, symmetric composition
- Monumental — wide shoulders fill the frame, immovable
- Expression: completely composed, zero affect
- Animation: single slow inhale/exhale — 1-2px chest expansion, very slow cycle (~3s)
"""

from PIL import Image, ImageDraw
import math

# ---- Palette ----
BG_BLACK        = (0, 0, 0)

# Skin — frontal, even top light, slight warm center
SKIN_CENTER     = (195, 138, 82)     # forehead / center face
SKIN_MID        = (170, 115, 65)     # mid face
SKIN_EDGE       = (115, 72, 38)      # edges / sides of face
SKIN_DEEP       = (72, 42, 18)       # deepest shadows (under chin, jaw corners)

# Hair — very dark, tight to skull
HAIR_DARK       = (22, 14, 8)
HAIR_EDGE       = (35, 22, 12)

# Eyes — frontal, dead-center stare
EYE_WHITE       = (228, 232, 238)
EYE_IRIS        = (50, 34, 16)
EYE_PUPIL       = (8, 5, 3)
EYE_SCLERA_SHD  = (180, 185, 195)   # shadow on inner/outer sclera
EYE_LID         = (80, 48, 22)
EYE_LOWER       = (140, 90, 50)

# Mouth — closed, flat, no expression
MOUTH_DARK      = (82, 48, 22)
LIP_UPPER       = (145, 88, 50)
LIP_LOWER       = (160, 100, 58)

# Nose
NOSE_BRIDGE     = (150, 98, 55)
NOSE_SHADOW     = (95, 58, 28)
NOSE_TIP        = (175, 120, 68)
NOSTRIL         = (65, 36, 14)

# Shoulders / shirt — very dark, fills frame edge-to-edge
SHIRT_BASE      = (14, 16, 20)
SHIRT_TOP_EDGE  = (28, 32, 40)      # faint top-light on shoulder cap
SHIRT_DEEPEST   = (5, 6, 8)

# Neck
NECK_LIT        = (180, 122, 70)
NECK_SHADOW     = (100, 62, 30)

# Very faint top-light specular (single light source directly above)
SPEC_BRIGHT     = (235, 200, 155)   # forehead specular
SPEC_FADE       = (215, 165, 105)

SIZE = 64


def draw_background(draw):
    draw.rectangle([0, 0, SIZE - 1, SIZE - 1], fill=BG_BLACK)


def draw_torso(draw, chest_phase):
    """
    Draw wide torso filling bottom of frame.
    chest_phase: float 0.0..1.0 — breath phase (0=exhale/resting, 1=full inhale).
    Encodes breath across multiple coordinates so frames differ visually.
    Shoulders are wide, monumental — nearly touch frame edges.
    """
    # chest_y shifts up by up to 2px on full inhale (chest rises)
    chest_y = round(43 - chest_phase * 2)
    # Shoulder width widens very slightly on inhale
    sw = round(chest_phase * 1)   # 0 or 1 extra px outward

    # Main torso block — very wide
    torso_pts = [
        (0, 64),              # bottom-left
        (64, 64),             # bottom-right
        (62 + sw, chest_y),   # right shoulder top
        (2 - sw, chest_y),    # left shoulder top
    ]
    draw.polygon(torso_pts, fill=SHIRT_BASE)

    # Very faint top-light catch on shoulder caps (shifts with chest_y)
    left_cap = [
        (2 - sw, chest_y),
        (18, chest_y),
        (18, chest_y + 2),
        (2 - sw, chest_y + 2),
    ]
    draw.polygon(left_cap, fill=SHIRT_TOP_EDGE)
    right_cap = [
        (46, chest_y),
        (62 + sw, chest_y),
        (62 + sw, chest_y + 2),
        (46, chest_y + 2),
    ]
    draw.polygon(right_cap, fill=SHIRT_TOP_EDGE)

    # Deepen bottom corners (falls into black)
    draw.rectangle([0, 58, 10, 64], fill=SHIRT_DEEPEST)
    draw.rectangle([54, 58, 64, 64], fill=SHIRT_DEEPEST)

    # Shirt collar — dark, just peeking above chest line
    collar_y = chest_y - 1
    collar_pts = [
        (26, collar_y),
        (38, collar_y),
        (36, chest_y - 3),
        (28, chest_y - 3),
    ]
    draw.polygon(collar_pts, fill=SHIRT_TOP_EDGE)


def draw_neck(draw):
    """Short, thick neck — frontal."""
    neck_pts = [
        (27, 42),
        (37, 42),
        (36, 35),
        (28, 35),
    ]
    draw.polygon(neck_pts, fill=NECK_LIT)
    # Shadow on sides
    draw.line([(27, 42), (28, 35)], fill=NECK_SHADOW, width=1)
    draw.line([(37, 42), (36, 35)], fill=NECK_SHADOW, width=1)


def draw_head(draw):
    """
    Frontal face, symmetric. Head fills x=[16..48], y=[6..35].
    Single top-light source.
    """
    # Head base
    head_pts = [
        (17, 35),   # jaw-left
        (47, 35),   # jaw-right
        (46, 11),   # temple-right
        (18, 11),   # temple-left
    ]
    draw.polygon(head_pts, fill=SKIN_MID)

    # Center forehead / cheek — lit from above
    draw.rectangle([22, 11, 42, 22], fill=SKIN_CENTER)
    draw.rectangle([22, 22, 42, 35], fill=SKIN_MID)

    # Edge shadows — both sides symmetric
    left_edge = [(17, 35), (17, 11), (22, 11), (22, 35)]
    right_edge = [(42, 11), (47, 11), (47, 35), (42, 35)]
    draw.polygon(left_edge, fill=SKIN_EDGE)
    draw.polygon(right_edge, fill=SKIN_EDGE)

    # Jaw shadow — bottom edge
    draw.line([(17, 35), (47, 35)], fill=SKIN_DEEP, width=1)
    draw.line([(18, 34), (46, 34)], fill=SKIN_EDGE, width=1)

    # Forehead specular — top-center hotspot
    draw.ellipse([26, 11, 38, 17], fill=SPEC_FADE)
    draw.ellipse([29, 11, 35, 15], fill=SPEC_BRIGHT)

    # --- Hair --- tight, dark, slightly wider than head
    hair_top = [
        (18, 11),
        (46, 11),
        (44, 5),
        (20, 5),
    ]
    draw.polygon(hair_top, fill=HAIR_DARK)
    # Hairline slight edge
    draw.line([(20, 11), (44, 11)], fill=HAIR_EDGE, width=1)
    # Temple hair
    draw.rectangle([14, 11, 18, 20], fill=HAIR_DARK)
    draw.rectangle([46, 11, 50, 20], fill=HAIR_DARK)
    # Hair top slight sheen
    draw.line([(25, 5), (39, 5)], fill=HAIR_EDGE, width=1)


def draw_face_features(draw):
    """Eyes, nose, mouth — frontal, symmetric, zero affect."""

    # --- Eyebrows — straight, level, no raise or furrow ---
    draw.line([(20, 19), (29, 19)], fill=HAIR_DARK, width=2)
    draw.line([(35, 19), (44, 19)], fill=HAIR_DARK, width=2)
    # Slight taper at outer ends
    draw.point((20, 19), fill=SKIN_MID)
    draw.point((44, 19), fill=SKIN_MID)

    # --- Left eye ---
    # Socket
    draw.rectangle([19, 22, 29, 27], fill=SKIN_MID)
    # White
    draw.rectangle([20, 22, 28, 26], fill=EYE_WHITE)
    # Shadow on sclera sides
    draw.line([(20, 22), (20, 26)], fill=EYE_SCLERA_SHD, width=1)
    draw.line([(28, 22), (28, 26)], fill=EYE_SCLERA_SHD, width=1)
    # Iris — center of eye
    draw.rectangle([22, 22, 27, 26], fill=EYE_IRIS)
    # Pupil
    draw.rectangle([23, 23, 26, 26], fill=EYE_PUPIL)
    # Iris highlight (top-center)
    draw.point((24, 22), fill=(200, 220, 255))
    # Upper lid
    draw.line([(20, 22), (28, 22)], fill=EYE_LID, width=1)
    # Lower lid
    draw.line([(20, 26), (28, 26)], fill=EYE_LOWER, width=1)

    # --- Right eye (symmetric) ---
    draw.rectangle([35, 22, 45, 27], fill=SKIN_MID)
    draw.rectangle([36, 22, 44, 26], fill=EYE_WHITE)
    draw.line([(36, 22), (36, 26)], fill=EYE_SCLERA_SHD, width=1)
    draw.line([(44, 22), (44, 26)], fill=EYE_SCLERA_SHD, width=1)
    draw.rectangle([37, 22, 42, 26], fill=EYE_IRIS)
    draw.rectangle([38, 23, 41, 26], fill=EYE_PUPIL)
    draw.point((39, 22), fill=(200, 220, 255))
    draw.line([(36, 22), (44, 22)], fill=EYE_LID, width=1)
    draw.line([(36, 26), (44, 26)], fill=EYE_LOWER, width=1)

    # --- Nose (frontal) ---
    # Bridge — vertical shadow line down center-left and center-right
    draw.line([(30, 20), (30, 28)], fill=NOSE_SHADOW, width=1)
    draw.line([(34, 20), (34, 28)], fill=NOSE_SHADOW, width=1)
    # Tip
    draw.ellipse([28, 27, 36, 31], fill=NOSE_TIP)
    # Nostrils
    draw.ellipse([26, 29, 30, 32], fill=NOSTRIL)
    draw.ellipse([34, 29, 38, 32], fill=NOSTRIL)
    # Nose highlight
    draw.point((32, 27), fill=SPEC_FADE)

    # --- Mouth — flat line, completely composed ---
    # Upper lip shape
    upper_lip_pts = [
        (24, 33),
        (40, 33),
        (39, 32),
        (33, 31),   # cupid's bow center-right
        (32, 30),   # center dip
        (31, 31),   # cupid's bow center-left
        (25, 32),
    ]
    draw.polygon(upper_lip_pts, fill=LIP_UPPER)
    # Lower lip (slightly fuller)
    lower_lip_pts = [
        (24, 33),
        (40, 33),
        (39, 35),
        (32, 36),
        (25, 35),
    ]
    draw.polygon(lower_lip_pts, fill=LIP_LOWER)
    # Mouth line
    draw.line([(24, 33), (40, 33)], fill=MOUTH_DARK, width=1)
    # Corner shadows
    draw.point((24, 33), fill=SKIN_DEEP)
    draw.point((40, 33), fill=SKIN_DEEP)


# --- Animation: slow chest expansion over 20 frames ---
# Each frame is a slightly different chest_phase float — enough that Pillow
# won't collapse them all into identical palette entries.
# One full breath cycle at 160ms/frame = ~3.2s.

N_FRAMES = 20

# Per-frame breath phase (0.0=exhale, 1.0=inhale peak)
# Use a smooth sine: rise from 0 to 1 over first half, fall back over second half.
# Quantize to steps small enough to produce distinct pixel positions.
def breath_phase(idx):
    t = idx / N_FRAMES
    # sine wave, 0 at start and end, 1 at midpoint
    return (1 - math.cos(2 * math.pi * t)) / 2  # 0..1 smooth

frames = []

for frame_idx in range(N_FRAMES):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    phase = breath_phase(frame_idx)

    draw_background(draw)
    draw_torso(draw, chest_phase=phase)
    draw_neck(draw)
    draw_head(draw)
    draw_face_features(draw)

    frames.append(img.convert("RGB"))

out_path = "/mnt/data/hello-world/static/avatars/architect_d.gif"

palette_frames = [f.convert("P", palette=Image.ADAPTIVE, colors=256) for f in frames]

palette_frames[0].save(
    out_path,
    save_all=True,
    append_images=palette_frames[1:],
    duration=160,
    loop=0,
    disposal=2,
    optimize=False,
)

print(f"Saved: {out_path}")

from PIL import Image as PILImage
verify = PILImage.open(out_path)
print(f"Format: {verify.format}, Size: {verify.size}, Frames: {getattr(verify, 'n_frames', 1)}")
