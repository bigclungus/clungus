#!/usr/bin/env python3
"""
GigaClungus — Avatar V5
"The Colossus"

Same grotesque BigChungus silhouette — stupendously wide, spilling out of
the frame — but now he wears the crown. A blocky pixel crown sits atop his
enormous head, rendered in tarnished gold and black. His eyes are a cold
molten amber. The background is dark slate, not void — like a throne room
with the lights mostly off.

He is not amused. He is not angry. He simply IS, and that is enough.

Animation: eyes glow brighter and dim in a slow pulse — the heartbeat of
an entity too large to have a heartbeat in any normal sense. The crown
catches a glint at peak glow. No chew. He is above chewing on camera.

Palette: near-black bg, dark slate body, tarnished gold crown,
amber-to-orange glowing eyes, deep burgundy shadows.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# --- Palette ---
BG            = (10, 9, 14, 255)        # near-void dark slate
BODY_OUTLINE  = (8, 5, 4, 255)          # near-black outline
BODY_SHADOW   = (42, 22, 10, 255)       # deep shadow
BODY_MID      = (80, 45, 18, 255)       # main body brown
BODY_LIGHT    = (115, 68, 28, 255)      # highlight
BODY_CREAM    = (170, 142, 100, 255)    # belly/face — muted, regal
JOWL_SHADE    = (58, 30, 12, 255)       # jowl underside shadow
EAR_INNER     = (120, 50, 50, 255)      # dark inner ear
CROWN_BASE    = (80, 62, 10, 255)       # tarnished dark gold
CROWN_MID     = (140, 108, 20, 255)     # crown midtone
CROWN_BRIGHT  = (200, 160, 30, 255)     # crown highlight
CROWN_JEWEL   = (160, 30, 30, 255)      # dark ruby gem
CROWN_GLINT   = (240, 220, 100, 255)    # crown glint pixel
EYE_SOCKET    = (20, 12, 6, 255)        # dark socket
EYE_WHITE     = (190, 170, 130, 255)    # amber-tinted sclera
EYE_IRIS_DIM  = (140, 80, 10, 255)      # amber iris dim state
EYE_IRIS_GLOW = (220, 140, 20, 255)     # amber iris glow state
EYE_PUPIL     = (6, 4, 3, 255)          # void pupil
EYE_VEIN      = (120, 30, 30, 255)      # bloodshot hint
NOSE          = (140, 60, 60, 255)      # dark ruddy nose
MOUTH         = (38, 16, 6, 255)        # shadow mouth
TEETH         = (205, 195, 170, 255)    # ivory teeth
TOOTH_SHADOW  = (130, 120, 100, 255)    # tooth gap


def draw_body(draw):
    """Enormous mass. Fills lower 2/3."""
    # Outer shadow
    draw.ellipse([(0, 30), (64, 70)], fill=BODY_OUTLINE)
    # Main torso
    draw.ellipse([(1, 31), (63, 68)], fill=BODY_MID)
    # Belly cream patch
    draw.ellipse([(12, 36), (52, 66)], fill=BODY_CREAM)
    # Heavy gravity shadow at bottom
    draw.ellipse([(10, 54), (54, 70)], fill=BODY_SHADOW)
    draw.ellipse([(13, 52), (51, 66)], fill=BODY_CREAM)
    # Side shadows (he is thick)
    draw.ellipse([(0, 36), (16, 58)], fill=BODY_SHADOW)
    draw.ellipse([(48, 36), (64, 58)], fill=BODY_SHADOW)
    # Tiny arms hanging at sides
    draw.ellipse([(0, 40), (12, 54)], fill=BODY_SHADOW)
    draw.ellipse([(1, 41), (10, 53)], fill=BODY_MID)
    draw.ellipse([(52, 40), (64, 54)], fill=BODY_SHADOW)
    draw.ellipse([(54, 41), (63, 53)], fill=BODY_MID)
    # Base press shadow
    draw.ellipse([(8, 60), (56, 72)], fill=BODY_OUTLINE)


def draw_crown(draw, glint_visible):
    """
    Blocky pixel crown sitting atop the head.
    Three points: two short outer turrets, one tall centre spike.
    glint_visible: bool — adds a catch-light on centre spike at peak glow.
    """
    # Crown band base
    draw.rectangle([(18, 3), (46, 10)], fill=CROWN_BASE)
    draw.rectangle([(19, 3), (45, 9)], fill=CROWN_MID)

    # Left turret
    draw.rectangle([(18, 0), (24, 6)], fill=CROWN_BASE)
    draw.rectangle([(19, 0), (23, 5)], fill=CROWN_MID)

    # Right turret
    draw.rectangle([(40, 0), (46, 6)], fill=CROWN_BASE)
    draw.rectangle([(41, 0), (45, 5)], fill=CROWN_MID)

    # Centre spike — taller
    draw.rectangle([(29, 0), (35, 8)], fill=CROWN_BASE)
    draw.rectangle([(30, 0), (34, 7)], fill=CROWN_BRIGHT)

    # Centre jewel (dark ruby)
    draw.ellipse([(30, 4), (34, 7)], fill=CROWN_JEWEL)

    # Crown glint at peak glow
    if glint_visible:
        draw.point((31, 1), fill=CROWN_GLINT)
        draw.point((32, 0), fill=CROWN_GLINT)


def draw_head(draw, iris_color):
    """
    Massive head with enormous jowls. Crown drawn separately above.
    iris_color: the current amber glow level for the eyes.
    """
    # Head outline
    draw.ellipse([(3, 5), (61, 44)], fill=BODY_OUTLINE)
    # Head base
    draw.ellipse([(4, 6), (60, 43)], fill=BODY_MID)
    # Face cream
    draw.ellipse([(12, 13), (52, 42)], fill=BODY_CREAM)

    # Left jowl
    draw.ellipse([(0, 20), (22, 42)], fill=BODY_OUTLINE)
    draw.ellipse([(1, 21), (21, 41)], fill=BODY_MID)
    draw.ellipse([(2, 22), (19, 40)], fill=BODY_CREAM)
    draw.ellipse([(1, 34), (19, 44)], fill=JOWL_SHADE)
    draw.ellipse([(2, 33), (18, 42)], fill=BODY_CREAM)

    # Right jowl
    draw.ellipse([(42, 20), (64, 42)], fill=BODY_OUTLINE)
    draw.ellipse([(43, 21), (63, 41)], fill=BODY_MID)
    draw.ellipse([(45, 22), (62, 40)], fill=BODY_CREAM)
    draw.ellipse([(45, 34), (63, 44)], fill=JOWL_SHADE)
    draw.ellipse([(46, 33), (62, 42)], fill=BODY_CREAM)

    # Ears (short — crown sits on top, ears peek out sides)
    draw.ellipse([(7, 5), (18, 18)], fill=BODY_OUTLINE)
    draw.ellipse([(8, 6), (17, 17)], fill=BODY_MID)
    draw.ellipse([(9, 7), (16, 15)], fill=EAR_INNER)

    draw.ellipse([(46, 5), (57, 18)], fill=BODY_OUTLINE)
    draw.ellipse([(47, 6), (56, 17)], fill=BODY_MID)
    draw.ellipse([(48, 7), (55, 15)], fill=EAR_INNER)

    # Eye sockets
    ey = 18
    draw.ellipse([(13, ey - 1), (27, ey + 12)], fill=EYE_SOCKET)
    draw.ellipse([(37, ey - 1), (51, ey + 12)], fill=EYE_SOCKET)

    # Eye whites
    draw.ellipse([(14, ey), (26, ey + 11)], fill=EYE_WHITE)
    draw.ellipse([(38, ey), (50, ey + 11)], fill=EYE_WHITE)

    # Bloodshot veins
    draw.line([(15, ey + 8), (19, ey + 6)], fill=EYE_VEIN, width=1)
    draw.line([(48, ey + 8), (44, ey + 6)], fill=EYE_VEIN, width=1)

    # Irises — amber, varying brightness
    draw.ellipse([(17, ey + 2), (24, ey + 9)], fill=iris_color)
    draw.ellipse([(41, ey + 2), (48, ey + 9)], fill=iris_color)

    # Pupils — void
    draw.ellipse([(19, ey + 3), (22, ey + 8)], fill=EYE_PUPIL)
    draw.ellipse([(43, ey + 3), (46, ey + 8)], fill=EYE_PUPIL)

    # Eye glints
    draw.point((19, ey + 3), fill=(255, 230, 130, 255))
    draw.point((43, ey + 3), fill=(255, 230, 130, 255))

    # Heavy flat eyelids (baseline squint — he is always squinting)
    SQUINT = 0.55
    lid_drop = int(SQUINT * 6)
    draw.ellipse([(13, ey - 1), (27, ey + 4 + lid_drop)], fill=BODY_MID)
    draw.ellipse([(37, ey - 1), (51, ey + 3 + lid_drop)], fill=BODY_MID)
    # Re-expose iris peek
    peek = max(0, 7 - lid_drop)
    if peek > 1:
        draw.ellipse([(17, ey + 2), (24, ey + 2 + peek)], fill=iris_color)
        draw.ellipse([(19, ey + 3), (22, ey + 3 + max(0, peek - 2))], fill=EYE_PUPIL)
        draw.ellipse([(41, ey + 2), (48, ey + 2 + peek)], fill=iris_color)
        draw.ellipse([(43, ey + 3), (46, ey + 3 + max(0, peek - 2))], fill=EYE_PUPIL)

    # Nose
    draw.ellipse([(26, 29), (38, 36)], fill=BODY_OUTLINE)
    draw.ellipse([(27, 29), (37, 35)], fill=NOSE)
    draw.ellipse([(27, 30), (30, 34)], fill=BODY_OUTLINE)
    draw.ellipse([(34, 30), (37, 34)], fill=BODY_OUTLINE)

    # Mouth — sealed flat, contemptuous
    draw.arc([(23, 31), (41, 42)], start=15, end=165, fill=MOUTH, width=2)
    # Buck teeth
    draw.rectangle([(28, 33), (31, 38)], fill=TEETH)
    draw.rectangle([(33, 33), (36, 38)], fill=TEETH)
    draw.line([(32, 33), (32, 38)], fill=TOOTH_SHADOW, width=1)
    draw.line([(28, 33), (36, 33)], fill=MOUTH, width=1)


def lerp_color(c1, c2, t):
    """Linear interpolate between two RGB colors."""
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)


def make_frame(glow_t):
    """
    glow_t: 0.0 = dim, 1.0 = full glow
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    iris_color = lerp_color(EYE_IRIS_DIM, EYE_IRIS_GLOW, glow_t)
    glint_visible = glow_t > 0.7

    draw_body(draw)
    draw_head(draw, iris_color)
    draw_crown(draw, glint_visible)

    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    def add(glow_t, dur):
        frames.append(make_frame(glow_t))
        durations.append(dur)

    # Pulse cycle — eyes glow up and fade back down, slowly
    # Phase 1: dim hold
    for _ in range(5):
        add(0.1, 140)

    # Phase 2: slow glow up
    steps_up = [0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92, 1.0]
    for t in steps_up:
        add(t, 90)

    # Phase 3: hold at peak glow
    for _ in range(4):
        add(1.0, 130)

    # Phase 4: slow dim back
    steps_down = [0.92, 0.8, 0.65, 0.5, 0.35, 0.2, 0.1]
    for t in steps_down:
        add(t, 90)

    # Phase 5: dim hold (longer, before loop)
    for _ in range(6):
        add(0.1, 140)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/gigaclungus_v5.gif"
    frames, durations = build_frames()

    palettes = [f.quantize(colors=128, method=Image.Quantize.FASTOCTREE) for f in frames]

    bg_idx = palettes[0].getpixel((0, 0))
    alt_idx = (bg_idx + 1) % 128
    for i, p in enumerate(palettes):
        p.putpixel((63, 63), alt_idx if i % 2 == 0 else bg_idx)

    palettes[0].save(
        out_path,
        save_all=True,
        append_images=palettes[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )
    print(f"Saved {len(frames)} frames -> {out_path}")
