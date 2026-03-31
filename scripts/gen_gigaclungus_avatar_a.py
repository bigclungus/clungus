#!/usr/bin/env python3
"""
GigaClungus — Avatar Option A
"The Immovable Mass"

BigChungus but Giga. The same absurdly wide, rotund rabbit body from the
Looney Tunes intro freeze-frame — but darker, weightier, more dominant.
He fills the frame completely. His silhouette crowds out the sky.
He stares forward with half-lidded, knowing eyes.

Animation: slow, contemptuous chew. One carrot held loosely. An eye
narrows slightly at intervals — not a blink, a look. The kind of look
that has ended careers.

Palette: deep warm brown body, near-black outlines, bloodshot off-white
eyes with heavy-lidded shadow, dull orange carrot, dark burgundy bg.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# --- Palette ---
BG           = (20, 10, 15, 255)      # near-void dark burgundy
BODY_DARK    = (90, 55, 30, 255)      # deep warm brown
BODY_MID     = (130, 82, 45, 255)     # main body
BODY_LIGHT   = (165, 110, 65, 255)    # highlight
BODY_CREAM   = (210, 185, 150, 255)   # belly / face cream
OUTLINE      = (15, 8, 5, 255)        # near-black
EYE_WHITE    = (235, 225, 210, 255)   # off-white, slightly jaundiced
EYE_IRIS     = (45, 90, 45, 255)      # dull green iris
EYE_PUPIL    = (10, 8, 8, 255)        # black pupil
EYE_LID      = (110, 70, 40, 255)     # heavy eyelid
EYE_VEIN     = (180, 60, 60, 255)     # bloodshot hint
NOSE         = (200, 100, 100, 255)   # ruddy pink nose
MOUTH        = (60, 30, 15, 255)      # dark mouth shadow
CARROT       = (230, 120, 20, 255)    # dull orange carrot
CARROT_TIP   = (200, 90, 10, 255)
CARROT_GREEN = (60, 120, 40, 255)
EAR_INNER    = (180, 90, 90, 255)     # inner ear pink
TEETH        = (230, 225, 210, 255)   # buck teeth


def draw_body(draw):
    """Enormous rotund body filling the lower 2/3 of the frame."""
    # Main torso oval — massive, spills to edges
    draw.ellipse([(2, 30), (62, 68)], fill=BODY_MID)
    # Chest bulge forward
    draw.ellipse([(8, 28), (56, 65)], fill=BODY_MID)
    # Belly cream patch
    draw.ellipse([(16, 35), (48, 64)], fill=BODY_CREAM)
    # Body highlight (top-left)
    draw.ellipse([(6, 28), (30, 45)], fill=BODY_LIGHT)
    draw.ellipse([(8, 30), (28, 43)], fill=BODY_MID)  # carve back out
    # Tiny arms (vestigial, hanging at sides)
    # Left arm
    draw.ellipse([(1, 36), (12, 50)], fill=BODY_DARK)
    draw.ellipse([(2, 37), (11, 49)], fill=BODY_MID)
    # Right arm (holding carrot)
    draw.ellipse([(52, 36), (63, 50)], fill=BODY_DARK)
    draw.ellipse([(53, 37), (62, 49)], fill=BODY_MID)
    # Outline shadow at base (he sits heavily)
    draw.ellipse([(4, 57), (60, 70)], fill=OUTLINE)
    draw.ellipse([(4, 55), (60, 68)], fill=BODY_DARK)


def draw_head(draw, eye_squint):
    """
    Huge head, round, taking up top half.
    eye_squint: 0.0 = normal, 1.0 = fully squinted (contempt)
    """
    # Head base
    draw.ellipse([(5, 4), (59, 42)], fill=BODY_MID)
    # Face cream overlay
    draw.ellipse([(10, 10), (54, 40)], fill=BODY_CREAM)
    # Cheek pouches — the defining BigChungus feature, massive jowls
    draw.ellipse([(2, 18), (24, 38)], fill=BODY_MID)    # left cheek
    draw.ellipse([(40, 18), (62, 38)], fill=BODY_MID)   # right cheek
    # Cheek cream
    draw.ellipse([(4, 20), (22, 36)], fill=BODY_CREAM)
    draw.ellipse([(42, 20), (60, 36)], fill=BODY_CREAM)

    # Ears — tall and wide, pressed against top of frame
    # Left ear
    left_ear = [(10, 0), (20, 0), (20, 14), (10, 14)]
    draw.ellipse([(9, 0), (21, 18)], fill=BODY_MID)
    draw.ellipse([(11, 1), (19, 15)], fill=EAR_INNER)
    # Right ear
    draw.ellipse([(43, 0), (55, 18)], fill=BODY_MID)
    draw.ellipse([(45, 1), (53, 15)], fill=EAR_INNER)

    # Eyes — large, heavy-lidded, slightly bloodshot
    eye_l_y = 16
    eye_r_y = 16
    # Left eye whites
    draw.ellipse([(13, eye_l_y), (27, eye_l_y + 10)], fill=EYE_WHITE)
    # Right eye whites
    draw.ellipse([(37, eye_r_y), (51, eye_r_y + 10)], fill=EYE_WHITE)
    # Bloodshot veins (subtle)
    draw.line([(14, eye_l_y + 7), (18, eye_l_y + 5)], fill=EYE_VEIN, width=1)
    draw.line([(48, eye_r_y + 7), (44, eye_r_y + 5)], fill=EYE_VEIN, width=1)
    # Irises
    draw.ellipse([(17, eye_l_y + 2), (24, eye_l_y + 8)], fill=EYE_IRIS)
    draw.ellipse([(40, eye_r_y + 2), (47, eye_r_y + 8)], fill=EYE_IRIS)
    # Pupils
    draw.ellipse([(19, eye_l_y + 3), (22, eye_l_y + 7)], fill=EYE_PUPIL)
    draw.ellipse([(42, eye_r_y + 3), (45, eye_r_y + 7)], fill=EYE_PUPIL)
    # Heavy eyelids — the contempt squint
    lid_drop = int(eye_squint * 5)
    # Left upper lid
    draw.ellipse([(13, eye_l_y), (27, eye_l_y + 5 + lid_drop)], fill=EYE_LID)
    # Right upper lid (slightly more open — asymmetric contempt)
    lid_drop_r = int(eye_squint * 3)
    draw.ellipse([(37, eye_r_y), (51, eye_r_y + 5 + lid_drop_r)], fill=EYE_LID)
    # Re-draw lower iris/pupil peeking under lid
    peek_l = max(0, 5 - lid_drop)
    peek_r = max(0, 5 - lid_drop_r)
    if peek_l > 1:
        draw.ellipse([(17, eye_l_y + 2), (24, eye_l_y + 2 + peek_l + 3)], fill=EYE_IRIS)
        draw.ellipse([(19, eye_l_y + 3), (22, eye_l_y + 3 + peek_l)], fill=EYE_PUPIL)
    if peek_r > 1:
        draw.ellipse([(40, eye_r_y + 2), (47, eye_r_y + 2 + peek_r + 3)], fill=EYE_IRIS)
        draw.ellipse([(42, eye_r_y + 3), (45, eye_r_y + 3 + peek_r)], fill=EYE_PUPIL)
    # Eye glints (a single pixel of cold light)
    draw.point((21, eye_l_y + 3), fill=(255, 255, 255, 255))
    draw.point((44, eye_r_y + 3), fill=(255, 255, 255, 255))

    # Nose — large, rubbery, pink
    draw.ellipse([(26, 26), (38, 33)], fill=NOSE)
    draw.ellipse([(27, 27), (31, 32)], fill=OUTLINE)   # left nostril
    draw.ellipse([(33, 27), (37, 32)], fill=OUTLINE)   # right nostril

    # Mouth — slightly open, contemptuous
    draw.arc([(24, 28), (40, 38)], start=10, end=170, fill=MOUTH, width=2)
    # Buck teeth peeking out
    draw.rectangle([(29, 30), (32, 35)], fill=TEETH)
    draw.rectangle([(33, 30), (36, 35)], fill=TEETH)
    draw.line([(32, 30), (32, 35)], fill=MOUTH, width=1)


def draw_carrot(draw, chew_offset):
    """
    Carrot held in right hand, extends from right side.
    chew_offset: 0..3 pixels of carrot shift for chewing animation.
    """
    cx = 55 + chew_offset
    # Carrot body
    draw.polygon([
        (cx - 1, 30),
        (cx + 8, 33),
        (cx + 7, 37),
        (cx - 2, 34),
    ], fill=CARROT)
    draw.polygon([
        (cx + 8, 33),
        (cx + 13, 35),
        (cx + 12, 38),
        (cx + 7, 37),
    ], fill=CARROT_TIP)
    # Carrot greens
    draw.line([(cx + 12, 35), (cx + 14, 28)], fill=CARROT_GREEN, width=1)
    draw.line([(cx + 12, 35), (cx + 16, 30)], fill=CARROT_GREEN, width=1)
    draw.line([(cx + 11, 34), (cx + 13, 27)], fill=CARROT_GREEN, width=1)


def make_frame(eye_squint, chew_offset):
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Subtle vignette bg gradient — just fill, he swallows the frame
    draw_body(draw)
    draw_head(draw, eye_squint)
    draw_carrot(draw, chew_offset)

    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    def add(eye_squint, chew, dur):
        frames.append(make_frame(eye_squint, chew))
        durations.append(dur)

    # He just... stares. Barely moves. A slow chew cycle.

    # Rest position — eyes half-lidded (eye_squint=0.4 baseline contempt)
    for _ in range(6):
        add(0.4, 0, 120)

    # Chew cycle 1 — carrot shifts slightly
    add(0.4, 0, 80)
    add(0.45, 1, 70)
    add(0.5, 2, 70)
    add(0.45, 1, 70)
    add(0.4, 0, 80)

    # Hold stare
    for _ in range(4):
        add(0.4, 0, 120)

    # The Look — left eye squints harder, right stays (asymmetric dominance)
    # We simulate by ramping full squint
    add(0.5, 0, 100)
    add(0.65, 0, 100)
    add(0.8, 0, 120)  # peak contempt
    add(0.8, 0, 150)
    add(0.65, 0, 100)
    add(0.5, 0, 100)
    add(0.4, 0, 100)

    # Another chew — he doesn't care
    add(0.4, 0, 80)
    add(0.4, 1, 70)
    add(0.45, 2, 70)
    add(0.4, 1, 70)
    add(0.4, 0, 80)

    # Long hold before loop
    for _ in range(5):
        add(0.4, 0, 120)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/gigaclungus_a.gif"
    frames, durations = build_frames()

    palettes = [f.quantize(colors=128, method=Image.Quantize.FASTOCTREE) for f in frames]

    # Force loop stability by touching corner pixel
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
