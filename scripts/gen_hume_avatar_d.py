#!/usr/bin/env python3
"""
Generate avatar for David Hume — Option D: BAROQUE DISSOLUTION.

Concept: The opposite extreme. A richly painted classical portrait — warm amber,
crimson, gold — baroque excess. But Hume's empiricism is eating the canvas.
Everything outside his cold, steady gaze is dissolving into nothing.
The ornate wig, the coat, the background: all crumbling, erasing, fading to
black at the edges. Only the eyes and the skeptical brow hold solid.
The idea: his own philosophy consumes the painting he's in.

64x64 animated GIF, 12 frames — dissolution pulses and retreats.
"""

from PIL import Image, ImageDraw
import math
import random

# Baroque palette — warm, rich, excessive
BG_VOID       = (5,   3,   2)     # absolute black void
GOLD_RICH     = (180, 140, 30)    # baroque gold
GOLD_BRIGHT   = (220, 185, 60)    # bright gold highlight
AMBER         = (160, 90,  20)    # deep amber
CRIMSON       = (140, 25,  25)    # dark crimson
CRIMSON_MID   = (180, 50,  40)    # mid crimson
VELVET        = (60,  20,  50)    # deep velvet purple-black (coat)
VELVET_HIGH   = (90,  40,  75)    # velvet highlight
SKIN_WARM     = (215, 170, 120)   # warm baroque skin
SKIN_ROSE     = (235, 190, 145)   # highlight — almost pink
SKIN_SHADOW   = (150, 100, 65)    # deep shadow
EYE_IRIS      = (55,  45,  30)    # very dark eye
EYE_WHITE     = (230, 220, 200)   # warm eye white
EYE_COLD      = (80,  105, 120)   # cold grey-blue — the empiricist stare
WIG_CREAM     = (240, 235, 215)   # powdered wig, warm cream
WIG_OCHRE     = (190, 170, 120)   # wig shadow
BROW          = (95,  65,  35)    # eyebrow
LIP           = (165, 100, 80)    # lips
LACE_WHITE    = (250, 248, 240)   # lace cravat
DISSOLVE_ASH  = (30,  25,  20)    # dissolving ash color

W, H = 64, 64


def lerp_color(c1: tuple, c2: tuple, t: float) -> tuple:
    """Linearly interpolate between two RGB colors."""
    t = max(0.0, min(1.0, t))
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def dissolution_factor(x: int, y: int, frame: float) -> float:
    """
    Returns 0.0 (solid) to 1.0 (fully dissolved/void) for a pixel at (x,y).
    The center face holds solid; edges dissolve. Frame modulates the effect.
    """
    cx, cy = 32, 28  # face center
    dist = math.sqrt((x - cx)**2 + (y - cy)**2)

    # Base dissolution: radial, starts beyond r=14 (just outside face)
    if dist < 12:
        base = 0.0
    elif dist < 20:
        base = (dist - 12) / 8 * 0.3
    else:
        base = 0.3 + (dist - 20) / 20 * 0.7
        base = min(base, 1.0)

    # Animate: dissolution breathes in/out
    # frame 0-5: dissolving grows; 6-11: retreats slightly
    pulse = math.sin(frame * math.pi / 6) * 0.15

    # Add some noise — makes edges look like paint crumbling
    r = random.random() * 0.08
    return max(0.0, min(1.0, base + pulse + r))


def draw_baroque_portrait(img: Image.Image, frame_idx: int):
    """Draw the full baroque portrait, then apply dissolution."""
    d = ImageDraw.Draw(img)

    # --- Background: deep crimson-to-void gradient ---
    for y in range(H):
        for x in range(W):
            cx, cy = abs(x - 32), abs(y - 30)
            dist = math.sqrt(cx**2 + cy**2)
            t = min(dist / 28.0, 1.0)
            col = lerp_color(CRIMSON, BG_VOID, t * 0.7)
            img.putpixel((x, y), col)

    # --- Baroque background flourish (upper corners) ---
    # Faint gold swirls in corners — painted over background
    for cx_off, cy_off in [(8, 8), (56, 8), (8, 20), (56, 20)]:
        d.ellipse([cx_off-5, cy_off-5, cx_off+5, cy_off+5],
                  outline=AMBER, width=1)
    # Gold arch at top
    d.arc([10, 4, 54, 30], 200, 340, fill=GOLD_RICH, width=1)
    d.arc([14, 7, 50, 26], 200, 340, fill=AMBER, width=1)

    # --- Wig (behind head) ---
    # Left side curl mass
    d.ellipse([8,  14, 22, 34], fill=WIG_OCHRE)
    d.ellipse([9,  12, 21, 30], fill=WIG_CREAM)
    # Right side
    d.ellipse([42, 14, 56, 34], fill=WIG_OCHRE)
    d.ellipse([43, 12, 55, 30], fill=WIG_CREAM)
    # Dome top
    d.ellipse([17, 6, 47, 24], fill=WIG_CREAM)
    d.ellipse([20, 5, 44, 16], fill=LACE_WHITE)
    # Curl detail
    for y_off in range(0, 14, 4):
        d.arc([10, 15 + y_off, 21, 21 + y_off], 0, 180, fill=WIG_OCHRE, width=1)
        d.arc([43, 15 + y_off, 54, 21 + y_off], 0, 180, fill=WIG_OCHRE, width=1)

    # --- Velvet coat (rich, deep purple-black) ---
    d.polygon([(14, 46), (32, 38), (32, 62), (8,  62), (8,  54)],  fill=VELVET)
    d.line([(14, 46), (8, 54)], fill=VELVET_HIGH, width=1)
    d.polygon([(50, 46), (32, 38), (32, 62), (56, 62), (56, 54)],  fill=(40, 12, 35))
    # Coat trim — gold braid
    d.line([(14, 46), (20, 58)], fill=GOLD_RICH, width=1)
    d.line([(50, 46), (44, 58)], fill=AMBER, width=1)
    # Coat lapel buttons
    d.point((22, 50), fill=GOLD_BRIGHT)
    d.point((22, 54), fill=GOLD_BRIGHT)
    d.point((42, 50), fill=AMBER)

    # --- Lace cravat ---
    d.polygon([(27, 37), (32, 35), (37, 37), (35, 50), (29, 50)], fill=LACE_WHITE)
    d.line([(30, 38), (29, 48)], fill=WIG_OCHRE, width=1)
    d.line([(34, 38), (35, 48)], fill=WIG_OCHRE, width=1)
    # Lace detail points
    for lx in range(28, 37, 2):
        d.point((lx, 49), fill=WIG_CREAM)

    # --- Neck ---
    d.rectangle([27, 42, 37, 50], fill=SKIN_SHADOW)
    d.rectangle([28, 42, 36, 49], fill=SKIN_WARM)

    # --- Face — baroque warmth, deep chiaroscuro ---
    # Shadow side
    d.ellipse([24, 15, 48, 43], fill=SKIN_SHADOW)
    # Main face oval
    d.ellipse([21, 14, 45, 42], fill=SKIN_WARM)
    # Light side (left) — warm rose highlight
    d.ellipse([22, 14, 38, 30], fill=SKIN_ROSE)
    # Deep shadow under jaw (right side — 3/4 view)
    d.ellipse([36, 32, 47, 44], fill=SKIN_SHADOW)

    # Wig framing face sides
    d.rectangle([8, 18, 22, 40], fill=WIG_CREAM)
    d.rectangle([45, 18, 57, 40], fill=WIG_OCHRE)

    # --- Eyes — THE ANCHOR. Cold. Empiricist grey-blue iris. Holds solid. ---
    # Right eye (slightly higher, 3/4 view)
    d.ellipse([24, 26, 32, 31], fill=EYE_WHITE)
    d.ellipse([26, 27, 31, 30], fill=EYE_COLD)      # cold iris — not warm
    d.ellipse([27, 27, 30, 30], fill=EYE_IRIS)       # dark pupil
    d.point((27, 28), fill=(200, 210, 220))           # cold catchlight

    # Left eye
    d.ellipse([34, 27, 42, 32], fill=EYE_WHITE)
    d.ellipse([35, 28, 41, 31], fill=EYE_COLD)
    d.ellipse([36, 28, 40, 31], fill=EYE_IRIS)

    # --- Eyebrows — baroque heavy, but skeptically asymmetric ---
    d.line([(24, 23), (28, 22), (32, 21)], fill=BROW, width=2)  # right — arched outer
    d.line([(34, 22), (38, 22), (41, 23)], fill=BROW, width=1)  # left — level

    # --- Nose — baroque prominent ---
    d.line([(32, 29), (33, 33), (35, 35)], fill=SKIN_SHADOW, width=1)
    d.point((35, 35), fill=SKIN_SHADOW)

    # --- Lips — pressed, unimpressed ---
    d.line([(27, 38), (36, 38)], fill=LIP, width=1)
    d.line([(28, 37), (35, 37)], fill=SKIN_SHADOW, width=1)
    d.point((27, 39), fill=SKIN_SHADOW)
    d.point((36, 39), fill=SKIN_SHADOW)

    # --- Gold ornamental frame at edges ---
    d.rectangle([0, 0, W-1, H-1], outline=GOLD_RICH, width=2)
    d.rectangle([1, 1, W-2, H-2], outline=AMBER, width=1)
    # Corner ornaments
    for cx_o, cy_o in [(3, 3), (W-4, 3), (3, H-4), (W-4, H-4)]:
        d.ellipse([cx_o-2, cy_o-2, cx_o+2, cy_o+2], fill=GOLD_BRIGHT)


def apply_dissolution(img: Image.Image, frame_idx: int) -> Image.Image:
    """
    Apply dissolution effect: pixels far from center get eaten by void.
    The face center stays solid; everything else crumbles to black.
    """
    result = img.copy()
    pixels = result.load()

    cx, cy = 32, 28

    for y in range(H):
        for x in range(W):
            dist = math.sqrt((x - cx)**2 + (y - cy)**2)

            # Face region stays completely solid
            if dist < 11:
                continue

            # Dissolution zone
            if dist < 16:
                d_factor = (dist - 11) / 5 * 0.25
            else:
                d_factor = 0.25 + (dist - 16) / 22 * 0.75
                d_factor = min(d_factor, 1.0)

            # Animate: pulsing dissolution — grows and recedes
            pulse = math.sin(frame_idx * math.pi / 3.0) * 0.12
            d_factor = max(0.0, min(1.0, d_factor + pulse))

            # Add painted-edge texture: patches dissolve unevenly
            # Use deterministic noise based on position
            noise = (math.sin(x * 7.3 + y * 3.1) * 0.5 + 0.5) * 0.15
            # Near face edge: dissolution has "crumble" texture
            if 12 < dist < 22:
                d_factor = max(0.0, d_factor - noise)

            if d_factor <= 0:
                continue

            # What color does the pixel dissolve to?
            # Near edge: ash/char; far edge: pure void
            if dist < 24:
                void_col = DISSOLVE_ASH
            else:
                void_col = BG_VOID

            orig = pixels[x, y]
            new_col = lerp_color(orig[:3] if len(orig) > 3 else orig, void_col, d_factor)
            pixels[x, y] = new_col

    return result


def build_frame(frame_idx: int) -> Image.Image:
    random.seed(frame_idx * 17 + 42)  # deterministic per frame

    img = Image.new("RGB", (W, H), BG_VOID)

    # Draw the full baroque portrait
    draw_baroque_portrait(img, frame_idx)

    # Apply the dissolution effect
    img = apply_dissolution(img, frame_idx)

    return img


def main():
    frames = []
    durations = []

    for i in range(12):
        f = build_frame(i)
        frames.append(f)
        # Slower at peaks of dissolution (frames 3 and 9)
        if i in (3, 9):
            durations.append(220)
        elif i in (0, 6):
            durations.append(180)
        else:
            durations.append(130)

    out_path = "/mnt/data/hello-world/static/avatars/hume_d.gif"

    frames[0].save(
        out_path,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )

    print(f"Saved: {out_path}")
    print(f"Frames: {len(frames)}, size: 64x64")

    verify = Image.open(out_path)
    print(f"Verified: format={verify.format}, n_frames={getattr(verify, 'n_frames', 1)}, "
          f"size={verify.size}, mode={verify.mode}")


if __name__ == "__main__":
    main()
