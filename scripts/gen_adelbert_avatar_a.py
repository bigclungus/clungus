#!/usr/bin/env python3
"""
Adelbert Hominem - Avatar A
"The Contemptuous Duellist"

An isometric top-down view of a suited figure with a pointing finger and a sneer.
The character stands at a desk/podium, pointing accusatorially at the viewer.
Animated: the pointing finger jabs in a 3-frame cycle, eyes narrow occasionally.

64x64 animated GIF, pure Pillow, loop=0, disposal=2.
"""

from PIL import Image, ImageDraw
import os

OUTPUT = "/mnt/data/hello-world/static/avatars/adelbert_a.gif"

# Palette
BG           = (0, 0, 0, 0)          # transparent
SUIT_DARK    = (30, 20, 50)          # deep navy/charcoal suit
SUIT_MID     = (45, 35, 70)          # suit highlight
SUIT_LIGHT   = (70, 58, 100)         # suit edge catch
SKIN         = (220, 175, 130)       # face/hand skin
SKIN_SHADOW  = (180, 135, 90)        # face shadow
HAIR         = (20, 15, 10)          # dark, slicked hair
HAIR_HIGH    = (50, 40, 30)          # hair highlight
EYE_WHITE    = (240, 235, 225)       # eyes
EYE_IRIS     = (60, 40, 20)          # dark brown contemptuous eyes
SHIRT_WHITE  = (230, 228, 220)       # white shirt
TIE_RED      = (180, 30, 30)         # red power tie
TIE_DARK     = (120, 10, 10)         # tie shadow
DESK_TOP     = (100, 70, 40)         # desk surface
DESK_FRONT   = (70, 45, 20)         # desk front face
DESK_SIDE    = (55, 35, 15)          # desk side
FINGER_TIP   = (210, 160, 110)       # pointing finger
SHADOW       = (15, 10, 25, 120)     # drop shadow


def make_base_frame(finger_y_offset=0, eye_squint=False, rgba=True):
    """Draw Adelbert in isometric 3/4 view, pointing finger."""
    mode = "RGBA" if rgba else "RGB"
    img = Image.new(mode, (64, 64), (0, 0, 0, 0) if rgba else (20, 15, 30))
    d = ImageDraw.Draw(img)

    # --- floor shadow (ellipse under desk) ---
    d.ellipse([10, 44, 54, 52], fill=(10, 8, 20, 80) if rgba else (10, 8, 20))

    # --- desk (isometric box, lower center) ---
    # top face
    d.polygon([(16, 40), (48, 40), (52, 44), (20, 44)], fill=DESK_TOP)
    # front face
    d.polygon([(20, 44), (52, 44), (52, 50), (20, 50)], fill=DESK_FRONT)
    # side face
    d.polygon([(16, 40), (20, 44), (20, 50), (16, 46)], fill=DESK_SIDE)
    # desk edge lines
    d.line([(16, 40), (48, 40)], fill=(140, 100, 55), width=1)
    d.line([(48, 40), (52, 44)], fill=(80, 55, 25), width=1)

    # --- body (suit torso, isometric) ---
    # main torso
    d.polygon([(24, 18), (40, 18), (42, 38), (22, 38)], fill=SUIT_DARK)
    # suit left highlight
    d.polygon([(24, 18), (28, 18), (30, 38), (22, 38)], fill=SUIT_MID)
    # suit right shadow
    d.polygon([(36, 18), (40, 18), (42, 38), (38, 38)], fill=(20, 13, 38))

    # --- shirt & tie ---
    # shirt visible strip
    d.polygon([(29, 19), (35, 19), (34, 36), (30, 36)], fill=SHIRT_WHITE)
    # tie
    d.polygon([(31, 20), (33, 20), (34, 33), (31, 33)], fill=TIE_RED)
    d.polygon([(31, 20), (32, 20), (31, 33)], fill=TIE_DARK)
    # tie knot
    d.ellipse([30, 19, 34, 22], fill=TIE_RED)

    # --- shoulders ---
    d.ellipse([19, 15, 28, 22], fill=SUIT_MID)     # left shoulder
    d.ellipse([36, 15, 45, 22], fill=SUIT_DARK)    # right shoulder
    d.line([(19, 18), (26, 18)], fill=SUIT_LIGHT, width=1)

    # --- left arm (relaxed, at side) ---
    d.polygon([(22, 22), (26, 22), (25, 36), (21, 36)], fill=SUIT_DARK)
    # left cuff
    d.rectangle([21, 34, 26, 37], fill=SHIRT_WHITE)
    # left hand resting on desk
    d.ellipse([20, 36, 27, 40], fill=SKIN)

    # --- right arm (raised, POINTING) ---
    # arm base
    arm_y = 22 + finger_y_offset
    d.polygon([(38, arm_y), (42, arm_y), (48, 28 + finger_y_offset),
               (44, 28 + finger_y_offset)], fill=SUIT_DARK)
    # forearm extended
    d.polygon([(44, 28 + finger_y_offset), (48, 28 + finger_y_offset),
               (52, 24 + finger_y_offset), (49, 22 + finger_y_offset)],
              fill=SUIT_MID)
    # cuff
    d.rectangle([48, 24 + finger_y_offset, 53, 27 + finger_y_offset],
                fill=SHIRT_WHITE)
    # hand/fist
    d.ellipse([48, 21 + finger_y_offset, 54, 26 + finger_y_offset], fill=SKIN)
    # pointing finger
    d.rectangle([52, 19 + finger_y_offset, 55, 22 + finger_y_offset],
                fill=SKIN)
    d.ellipse([53, 18 + finger_y_offset, 56, 21 + finger_y_offset],
              fill=FINGER_TIP)

    # --- neck ---
    d.rectangle([29, 12, 35, 19], fill=SKIN)
    d.line([(29, 12), (35, 12)], fill=SKIN_SHADOW, width=1)

    # --- head ---
    # head shape
    d.ellipse([24, 4, 40, 16], fill=SKIN)
    # jaw/chin widening
    d.polygon([(24, 10), (40, 10), (38, 16), (26, 16)], fill=SKIN)
    # cheek shadow
    d.ellipse([24, 9, 29, 15], fill=SKIN_SHADOW)
    d.ellipse([35, 9, 40, 14], fill=SKIN_SHADOW)

    # --- hair (slicked back, sharp) ---
    d.ellipse([24, 3, 40, 11], fill=HAIR)
    d.polygon([(24, 7), (40, 7), (38, 4), (26, 4)], fill=HAIR)
    # hair highlight
    d.line([(27, 4), (37, 4)], fill=HAIR_HIGH, width=1)
    d.line([(26, 5), (36, 5)], fill=HAIR_HIGH, width=1)
    # widow's peak
    d.polygon([(30, 8), (34, 8), (32, 10)], fill=HAIR)

    # --- eyes ---
    # eye sockets
    eye_top = 10
    eye_h = 2 if eye_squint else 3
    # left eye
    d.ellipse([26, eye_top, 30, eye_top + eye_h + 1], fill=EYE_WHITE)
    d.ellipse([27, eye_top, 29, eye_top + eye_h], fill=EYE_IRIS)
    d.point((28, eye_top + 1), fill=(5, 5, 5))  # pupil
    # right eye
    d.ellipse([33, eye_top, 37, eye_top + eye_h + 1], fill=EYE_WHITE)
    d.ellipse([34, eye_top, 36, eye_top + eye_h], fill=EYE_IRIS)
    d.point((35, eye_top + 1), fill=(5, 5, 5))

    if eye_squint:
        # heavy brow (contempt)
        d.line([(25, eye_top - 1), (31, eye_top)], fill=HAIR, width=2)
        d.line([(32, eye_top), (38, eye_top - 1)], fill=HAIR, width=2)
    else:
        d.line([(25, eye_top - 1), (30, eye_top - 1)], fill=HAIR, width=1)
        d.line([(33, eye_top - 1), (38, eye_top - 1)], fill=HAIR, width=1)

    # --- nose ---
    d.line([(31, 11), (31, 13)], fill=SKIN_SHADOW, width=1)
    d.point((30, 13), fill=SKIN_SHADOW)
    d.point((32, 13), fill=SKIN_SHADOW)

    # --- mouth (sneer — asymmetric) ---
    d.line([(28, 14), (31, 14)], fill=(160, 100, 80), width=1)
    d.line([(31, 14), (35, 13)], fill=(160, 100, 80), width=1)  # raised right corner

    # --- lapels ---
    d.polygon([(28, 19), (24, 24), (29, 26)], fill=SUIT_LIGHT)
    d.polygon([(36, 19), (40, 24), (35, 26)], fill=(18, 12, 35))

    return img


def make_frames():
    frames = []
    durations = []

    # Frame 1: neutral, arm at rest+1
    frames.append(make_base_frame(finger_y_offset=0, eye_squint=False))
    durations.append(120)

    # Frame 2: finger jab forward (shift up = toward viewer)
    frames.append(make_base_frame(finger_y_offset=-2, eye_squint=False))
    durations.append(80)

    # Frame 3: finger jab held, eyes squint (contempt peak)
    frames.append(make_base_frame(finger_y_offset=-2, eye_squint=True))
    durations.append(160)

    # Frame 4: retract slightly
    frames.append(make_base_frame(finger_y_offset=-1, eye_squint=True))
    durations.append(80)

    # Frame 5: back to neutral
    frames.append(make_base_frame(finger_y_offset=0, eye_squint=False))
    durations.append(200)

    # Frame 6: eyes narrow pause
    frames.append(make_base_frame(finger_y_offset=0, eye_squint=True))
    durations.append(300)

    return frames, durations


def main():
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    frames, durations = make_frames()

    # Convert all to P mode for GIF
    palette_frames = []
    for f in frames:
        pf = f.convert("RGBA")
        # Composite onto a transparent backing
        out = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        out.paste(pf, (0, 0), pf)
        palette_frames.append(out.convert("P", palette=Image.ADAPTIVE, colors=128))

    palette_frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=palette_frames[1:],
        loop=0,
        duration=durations,
        disposal=2,
        transparency=0,
    )
    print(f"Saved: {OUTPUT}")


if __name__ == "__main__":
    main()
