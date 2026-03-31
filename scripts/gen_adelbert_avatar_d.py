#!/usr/bin/env python3
"""
Adelbert Hominem - Avatar D
"The Baroque Snob"

The exact opposite of C. Maximum ornamentation, maximum color, maximum pomposity.
A 17th-century aristocratic portrait crammed into 64x64: enormous powdered wig,
gold-trimmed collar, velvet coat, lace cravat, rosy cheeks, a monocle, and the
most absurdly self-satisfied expression a face can contain.

The irony: someone who makes only personal attacks, rendered as the pinnacle of
aristocratic self-importance. The style IS the substance.

Animation: monocle pops out (raised brow), an enormous theatrical eye roll,
wig sways slightly on a head shake, then resettles with a satisfied half-smile.

64x64 animated GIF, pure Pillow, loop=0, disposal=2.
"""

from PIL import Image, ImageDraw
import os

OUTPUT = "/mnt/data/hello-world/static/avatars/adelbert_d.gif"

# Lavish, overwrought palette
BG_TOP      = (35, 20, 60)       # deep velvet background, top
BG_BOT      = (55, 35, 85)       # slightly lighter at base
GOLD        = (212, 175, 55)     # gold trim
GOLD_DARK   = (140, 110, 20)     # shadow gold
GOLD_HIGH   = (255, 230, 100)    # gold highlight
WIG_WHITE   = (235, 232, 225)    # powdered wig base
WIG_SHADOW  = (180, 175, 165)    # wig shadow/curl
WIG_HIGH    = (255, 252, 248)    # wig highlight
VELVET      = (80, 20, 50)       # deep crimson velvet coat
VELVET_MID  = (110, 35, 65)      # coat highlight
VELVET_DARK = (45, 10, 30)       # coat shadow
LACE        = (240, 238, 230)    # lace cravat
LACE_SHADOW = (200, 195, 180)    # lace shadow
SKIN        = (225, 185, 150)    # aristocratic face
SKIN_ROSY   = (210, 140, 120)    # rouged cheeks (yes, they did this)
SKIN_SHADOW = (185, 145, 110)    # face shadow
EYE_WHITE   = (245, 242, 235)
EYE_IRIS    = (80, 55, 30)       # haughty brown
EYE_PUPIL   = (15, 10, 10)
BROW        = (90, 65, 40)       # sculpted brow
MONO_FRAME  = (180, 155, 40)     # monocle frame (gold-tinted)
MONO_GLASS  = (200, 225, 240, 120)  # monocle lens tint (semi-transparent)
RIBBON      = (160, 20, 30)      # monocle ribbon
ROUGE_SPOT  = (195, 100, 100)    # heavy rouge


def draw_background(d):
    """Velvet backdrop with a subtle vignette."""
    for y in range(64):
        t = y / 63.0
        r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        d.line([(0, y), (63, y)], fill=(r, g, b))

    # Gold frame border — outermost pixel
    d.rectangle([0, 0, 63, 63], outline=GOLD_DARK)
    d.rectangle([1, 1, 62, 62], outline=GOLD)
    d.rectangle([2, 2, 61, 61], outline=GOLD_DARK)

    # Corner flourishes — small gold diamond dots at corners
    for cx, cy in [(4, 4), (59, 4), (4, 59), (59, 59)]:
        d.point((cx, cy), fill=GOLD_HIGH)
        d.point((cx - 1, cy), fill=GOLD)
        d.point((cx + 1, cy), fill=GOLD)
        d.point((cx, cy - 1), fill=GOLD)
        d.point((cx, cy + 1), fill=GOLD)


def draw_wig(d, sway=0):
    """Enormous powdered wig. The centerpiece of baroque excess."""
    cx = 32 + sway

    # Wig main mass — absurdly tall and wide
    # Left curl mass
    d.ellipse([cx - 18, 3, cx - 4, 22], fill=WIG_SHADOW)
    d.ellipse([cx - 16, 4, cx - 6, 20], fill=WIG_WHITE)
    d.ellipse([cx - 15, 5, cx - 8, 16], fill=WIG_HIGH)

    # Right curl mass
    d.ellipse([cx + 4, 3, cx + 18, 22], fill=WIG_SHADOW)
    d.ellipse([cx + 6, 4, cx + 16, 20], fill=WIG_WHITE)
    d.ellipse([cx + 8, 5, cx + 15, 16], fill=WIG_HIGH)

    # Center top mound
    d.ellipse([cx - 8, 2, cx + 8, 14], fill=WIG_WHITE)
    d.ellipse([cx - 6, 3, cx + 6, 11], fill=WIG_HIGH)

    # Wig sides draping down past ears
    d.polygon([(cx - 18, 14), (cx - 14, 14), (cx - 12, 32), (cx - 18, 30)], fill=WIG_WHITE)
    d.polygon([(cx + 14, 14), (cx + 18, 14), (cx + 18, 30), (cx + 12, 32)], fill=WIG_SHADOW)

    # Curl details on wig — horizontal lines suggesting ringlets
    for wy in range(6, 20, 3):
        d.arc([cx - 17, wy, cx - 7, wy + 4], start=0, end=180, fill=WIG_SHADOW, width=1)
        d.arc([cx + 7, wy, cx + 17, wy + 4], start=0, end=180, fill=WIG_SHADOW, width=1)

    # Wig bow/ribbon at nape (bottom of wig)
    d.rectangle([cx - 3, 30, cx + 3, 33], fill=RIBBON)
    d.polygon([(cx - 3, 31), (cx - 6, 29), (cx - 3, 32)], fill=RIBBON)
    d.polygon([(cx + 3, 31), (cx + 6, 29), (cx + 3, 32)], fill=RIBBON)


def draw_body(d):
    """Velvet coat with gold trim and lace cravat."""
    cx = 32

    # Coat body
    d.polygon([(cx - 14, 42), (cx + 14, 42), (cx + 13, 62), (cx - 13, 62)], fill=VELVET)
    # Coat left highlight (light hits from left)
    d.polygon([(cx - 14, 42), (cx - 10, 42), (cx - 9, 62), (cx - 13, 62)], fill=VELVET_MID)
    # Coat right shadow
    d.polygon([(cx + 10, 42), (cx + 14, 42), (cx + 13, 62), (cx + 9, 62)], fill=VELVET_DARK)

    # Gold coat trim — lapel edges
    d.line([(cx - 14, 42), (cx - 8, 55)], fill=GOLD, width=1)
    d.line([(cx + 14, 42), (cx + 8, 55)], fill=GOLD, width=1)
    # Gold button row
    for by in range(46, 62, 4):
        d.ellipse([cx - 1, by - 1, cx + 1, by + 1], fill=GOLD)
        d.point((cx, by), fill=GOLD_HIGH)

    # Shoulders — broad, padded, aristocratic
    d.ellipse([cx - 17, 38, cx - 7, 46], fill=VELVET_MID)
    d.ellipse([cx + 7, 38, cx + 17, 46], fill=VELVET)
    # Gold epaulette hint on left shoulder
    d.line([(cx - 16, 40), (cx - 8, 40)], fill=GOLD, width=1)
    d.line([(cx - 15, 41), (cx - 9, 41)], fill=GOLD_DARK, width=1)

    # Lace cravat — elaborate ruffles at collar
    d.polygon([(cx - 5, 39), (cx + 5, 39), (cx + 4, 45), (cx - 4, 45)], fill=LACE)
    # Ruffle folds
    for lx in range(cx - 4, cx + 4, 2):
        d.line([(lx, 39), (lx, 45)], fill=LACE_SHADOW, width=1)
    d.arc([cx - 4, 43, cx + 4, 47], start=0, end=180, fill=LACE_SHADOW, width=1)
    d.arc([cx - 3, 46, cx + 3, 49], start=0, end=180, fill=LACE, width=1)


def draw_face(d, eye_roll=0, mono_popped=False, smile_full=False):
    """
    Aristocratic face: full cheeks, rosy rouge, sculpted brows, monocle, sneer.
    eye_roll: 0=normal, 1=rolling up, 2=full roll (showing mostly white)
    mono_popped: monocle dropped (brow raised dramatically)
    smile_full: broader self-satisfied smirk
    """
    cx = 32

    # Face shape — rounded, well-fed aristocrat
    d.ellipse([cx - 9, 20, cx + 9, 36], fill=SKIN)
    d.polygon([(cx - 9, 26), (cx + 9, 26), (cx + 8, 36), (cx - 8, 36)], fill=SKIN)

    # Cheek fullness
    d.ellipse([cx - 9, 27, cx - 4, 34], fill=SKIN)
    d.ellipse([cx + 4, 27, cx + 9, 34], fill=SKIN)

    # Face shadow (left side in shadow)
    d.polygon([(cx - 9, 23), (cx - 7, 23), (cx - 5, 36), (cx - 9, 35)], fill=SKIN_SHADOW)

    # Rouge patches — heavily applied (period-accurate!)
    d.ellipse([cx - 8, 28, cx - 3, 33], fill=ROUGE_SPOT)
    d.ellipse([cx + 3, 28, cx + 8, 33], fill=ROUGE_SPOT)
    # Blend rouge slightly
    d.ellipse([cx - 7, 29, cx - 4, 32], fill=SKIN_ROSY)
    d.ellipse([cx + 4, 29, cx + 7, 32], fill=SKIN_ROSY)

    # Hair visible at temples where wig meets face
    d.line([(cx - 9, 23), (cx - 9, 27)], fill=WIG_SHADOW, width=2)
    d.line([(cx + 9, 23), (cx + 9, 27)], fill=WIG_SHADOW, width=2)

    # Sculpted eyebrows — carefully groomed, aristocratic
    if mono_popped:
        # Right brow raised dramatically (monocle fell out)
        d.arc([cx + 1, 22, cx + 8, 27], start=200, end=340, fill=BROW, width=2)
        d.line([(cx - 8, 25), (cx - 2, 25)], fill=BROW, width=2)  # left normal
    else:
        d.line([(cx - 8, 25), (cx - 2, 25)], fill=BROW, width=2)  # left
        d.line([(cx + 2, 25), (cx + 8, 25)], fill=BROW, width=2)  # right

    # Eyes
    if eye_roll == 0:
        # Normal — haughty downward gaze
        # Left eye
        d.ellipse([cx - 8, 26, cx - 3, 30], fill=EYE_WHITE)
        d.ellipse([cx - 7, 27, cx - 4, 29], fill=EYE_IRIS)
        d.point((cx - 6, 28), fill=EYE_PUPIL)
        d.point((cx - 6, 27), fill=(200, 200, 200))  # highlight
        # Right eye (possibly with monocle)
        d.ellipse([cx + 3, 26, cx + 8, 30], fill=EYE_WHITE)
        d.ellipse([cx + 4, 27, cx + 7, 29], fill=EYE_IRIS)
        d.point((cx + 5, 28), fill=EYE_PUPIL)
        d.point((cx + 5, 27), fill=(200, 200, 200))

    elif eye_roll == 1:
        # Mid-roll — iris moving upward
        d.ellipse([cx - 8, 26, cx - 3, 30], fill=EYE_WHITE)
        d.ellipse([cx - 7, 26, cx - 4, 28], fill=EYE_IRIS)  # iris up
        d.ellipse([cx + 3, 26, cx + 8, 30], fill=EYE_WHITE)
        d.ellipse([cx + 4, 26, cx + 7, 28], fill=EYE_IRIS)

    elif eye_roll == 2:
        # Full roll — mostly whites showing, iris at top edge
        d.ellipse([cx - 8, 26, cx - 3, 30], fill=EYE_WHITE)
        d.ellipse([cx - 7, 26, cx - 4, 27], fill=EYE_IRIS)  # barely visible at top
        d.ellipse([cx + 3, 26, cx + 8, 30], fill=EYE_WHITE)
        d.ellipse([cx + 4, 26, cx + 7, 27], fill=EYE_IRIS)

    # Monocle on right eye
    if not mono_popped:
        # Monocle frame around right eye
        d.arc([cx + 2, 25, cx + 9, 31], start=0, end=360, fill=MONO_FRAME, width=1)
        # Monocle ribbon hanging down
        d.line([(cx + 9, 28), (cx + 11, 35)], fill=RIBBON, width=1)
    else:
        # Monocle dropped — dangling lower
        d.arc([cx + 3, 34, cx + 10, 40], start=0, end=360, fill=MONO_FRAME, width=1)
        d.line([(cx + 9, 28), (cx + 10, 34)], fill=RIBBON, width=1)

    # Nose — aristocratic, slightly upturned
    d.line([(cx, 29), (cx, 31)], fill=SKIN_SHADOW, width=1)
    d.line([(cx - 1, 31), (cx + 1, 31)], fill=SKIN_SHADOW, width=1)
    # Slightly upturned — the nostrils
    d.point((cx - 2, 31), fill=SKIN_SHADOW)
    d.point((cx + 2, 31), fill=SKIN_SHADOW)

    # Mouth — self-satisfied smirk
    if smile_full:
        # Broad theatrical smirk — pleased with a particularly devastating remark
        d.line([(cx - 4, 33), (cx, 34)], fill=(150, 90, 80), width=1)
        d.line([(cx, 34), (cx + 5, 32)], fill=(150, 90, 80), width=1)
        d.point((cx + 5, 32), fill=SKIN_ROSY)
    else:
        # Resting smirk — permanent mild contempt
        d.line([(cx - 3, 33), (cx, 33)], fill=(150, 90, 80), width=1)
        d.line([(cx, 33), (cx + 4, 32)], fill=(150, 90, 80), width=1)

    # Chin — well-defined
    d.ellipse([cx - 3, 34, cx + 3, 37], fill=SKIN)
    d.line([(cx - 2, 36), (cx + 2, 36)], fill=SKIN_SHADOW, width=1)


def make_frame(eye_roll=0, mono_popped=False, wig_sway=0, smile_full=False):
    img = Image.new("RGBA", (64, 64), BG_TOP + (255,))
    d = ImageDraw.Draw(img)

    draw_background(d)
    draw_wig(d, sway=wig_sway)
    draw_body(d)
    draw_face(d, eye_roll=eye_roll, mono_popped=mono_popped, smile_full=smile_full)

    return img


def make_frames():
    frames = []
    durations = []

    # Frame 1: resting state — monocle in, mild smirk, composed
    frames.append(make_frame(eye_roll=0, mono_popped=False, wig_sway=0, smile_full=False))
    durations.append(700)

    # Frame 2: something said offends the aesthetic — brow raises, monocle pops
    frames.append(make_frame(eye_roll=0, mono_popped=True, wig_sway=0, smile_full=False))
    durations.append(120)

    # Frame 3: eyes begin to roll
    frames.append(make_frame(eye_roll=1, mono_popped=True, wig_sway=0, smile_full=False))
    durations.append(100)

    # Frame 4: full theatrical eye roll — peak contempt
    frames.append(make_frame(eye_roll=2, mono_popped=True, wig_sway=1, smile_full=False))
    durations.append(200)

    # Frame 5: eyes return, wig settling from the head shake
    frames.append(make_frame(eye_roll=1, mono_popped=True, wig_sway=-1, smile_full=False))
    durations.append(100)

    # Frame 6: monocle re-secured, broad satisfied smirk — devastation achieved
    frames.append(make_frame(eye_roll=0, mono_popped=False, wig_sway=0, smile_full=True))
    durations.append(500)

    # Frame 7: settle back to neutral smirk
    frames.append(make_frame(eye_roll=0, mono_popped=False, wig_sway=0, smile_full=False))
    durations.append(400)

    return frames, durations


def main():
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    frames, durations = make_frames()

    palette_frames = []
    for f in frames:
        pf = f.convert("RGBA")
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
