#!/usr/bin/env python3
"""Generate Galactus pixel art avatar GIF - 64x64, 12 frames, pulsing blue eyes."""

from PIL import Image, ImageDraw
import math

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/galactus.gif"
SIZE = 64
FRAMES = 12

# Color palette
BLACK       = (0, 0, 0, 255)
TRANSPARENT = (0, 0, 0, 0)
DEEP_SPACE  = (5, 3, 15, 255)      # Almost-black deep purple background
SPACE_MID   = (10, 6, 28, 255)     # Slightly lighter space
HELMET_DARK = (60, 20, 80, 255)    # Dark purple helmet base
HELMET_MID  = (100, 35, 130, 255)  # Mid purple
HELMET_LITE = (145, 55, 175, 255)  # Lighter purple highlight
HELMET_HIGH = (190, 80, 210, 255)  # Bright magenta highlight
ARMOR_DARK  = (70, 25, 90, 255)    # Darker armor
ARMOR_MID   = (120, 45, 150, 255)  # Mid armor
FIN_DARK    = (80, 30, 100, 255)   # Fin color dark
FIN_LITE    = (130, 50, 160, 255)  # Fin color light
EYE_DIM     = (30, 80, 160, 255)   # Dim blue eye
EYE_MID     = (60, 140, 220, 255)  # Medium blue eye
EYE_BRIGHT  = (100, 190, 255, 255) # Bright blue eye
EYE_GLOW    = (140, 210, 255, 255) # Eye glow (very bright)
STAR_DIM    = (150, 150, 180, 255) # Dim star
STAR_BRIGHT = (230, 230, 255, 255) # Bright star
FACE_DARK   = (30, 12, 40, 255)    # Face shadow
CHIN_COLOR  = (85, 30, 110, 255)   # Chin/jaw area

# Star positions (fixed for all frames)
import random
random.seed(42)
stars = [(random.randint(0, 63), random.randint(0, 63)) for _ in range(30)]
# Filter out stars that will be covered by the figure
def is_in_figure(x, y):
    # Rough bounding box of the figure
    return (x >= 8 and x <= 55 and y >= 4 and y <= 63)

stars = [(x, y) for x, y in stars if not is_in_figure(x, y)]


def draw_frame(eye_brightness: float) -> Image.Image:
    """Draw one frame. eye_brightness 0.0=dim, 1.0=full bright."""
    img = Image.new("RGBA", (SIZE, SIZE), DEEP_SPACE)
    d = ImageDraw.Draw(img)

    # Background gradient — slightly lighter in center
    for y in range(SIZE):
        for x in range(SIZE):
            if not is_in_figure(x, y):
                # Subtle radial variation
                pass

    # Stars
    for (sx, sy) in stars:
        twinkle = (sx * 7 + sy * 13) % 3
        color = STAR_BRIGHT if twinkle == 0 else STAR_DIM
        img.putpixel((sx, sy), color)

    # === HELMET FINS (left and right) ===
    # Left fin — tall narrow trapezoid sticking up-left
    left_fin = [
        (8, 4), (13, 4), (14, 8), (13, 20), (10, 24), (8, 20), (8, 4)
    ]
    d.polygon(left_fin, fill=FIN_DARK)
    # Left fin highlight edge
    d.line([(13, 4), (14, 8), (13, 20)], fill=FIN_LITE, width=1)

    # Right fin — mirror
    right_fin = [
        (55, 4), (50, 4), (49, 8), (50, 20), (53, 24), (55, 20), (55, 4)
    ]
    d.polygon(right_fin, fill=FIN_DARK)
    # Right fin highlight edge
    d.line([(50, 4), (49, 8), (50, 20)], fill=FIN_LITE, width=1)

    # === MAIN HELMET DOME ===
    # Large rounded helmet head
    d.ellipse([14, 6, 49, 42], fill=HELMET_MID)
    # Helmet shadow left
    d.ellipse([14, 6, 35, 42], fill=HELMET_DARK)
    # Helmet highlight right-top
    d.ellipse([28, 6, 49, 28], fill=HELMET_LITE)
    # Specular highlight
    d.ellipse([33, 8, 44, 18], fill=HELMET_HIGH)
    # Small specular dot
    d.ellipse([36, 9, 41, 14], fill=(220, 130, 240, 255))

    # === HELMET TOP RIDGE ===
    d.rectangle([26, 5, 37, 9], fill=HELMET_HIGH)
    d.rectangle([28, 4, 35, 7], fill=(210, 120, 235, 255))

    # === FACE AREA (visor opening) ===
    # Dark visor/face recess
    d.ellipse([18, 22, 45, 44], fill=FACE_DARK)
    # Inner face even darker
    d.ellipse([20, 24, 43, 43], fill=(15, 5, 22, 255))

    # === BROW RIDGE ===
    d.ellipse([17, 21, 46, 33], fill=ARMOR_MID)
    d.ellipse([19, 23, 44, 32], fill=FACE_DARK)  # recess behind brow

    # === EYES ===
    # Interpolate eye color based on brightness
    def lerp_color(c1, c2, t):
        return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(4))

    if eye_brightness < 0.5:
        t = eye_brightness * 2
        eye_color = lerp_color(EYE_DIM, EYE_MID, t)
    else:
        t = (eye_brightness - 0.5) * 2
        eye_color = lerp_color(EYE_MID, EYE_BRIGHT, t)

    glow_alpha = int(eye_brightness * 200)
    glow_color = (EYE_GLOW[0], EYE_GLOW[1], EYE_GLOW[2], glow_alpha)

    # Left eye
    # Glow halo (only at higher brightness)
    if eye_brightness > 0.3:
        glow_r = int(eye_brightness * 4)
        d.ellipse([22 - glow_r, 27 - glow_r, 28 + glow_r, 32 + glow_r],
                  fill=(EYE_GLOW[0], EYE_GLOW[1], EYE_GLOW[2], int(eye_brightness * 80)))
    # Eye socket
    d.ellipse([21, 27, 29, 33], fill=(8, 3, 15, 255))
    # Eye iris
    d.ellipse([22, 28, 28, 32], fill=eye_color)
    # Eye pupil/shine
    d.ellipse([24, 29, 27, 31], fill=EYE_GLOW if eye_brightness > 0.6 else EYE_MID)
    # Tiny specular
    if eye_brightness > 0.4:
        d.ellipse([25, 29, 27, 30], fill=(200, 230, 255, 255))

    # Right eye
    if eye_brightness > 0.3:
        glow_r = int(eye_brightness * 4)
        d.ellipse([35 - glow_r, 27 - glow_r, 41 + glow_r, 32 + glow_r],
                  fill=(EYE_GLOW[0], EYE_GLOW[1], EYE_GLOW[2], int(eye_brightness * 80)))
    d.ellipse([34, 27, 42, 33], fill=(8, 3, 15, 255))
    d.ellipse([35, 28, 41, 32], fill=eye_color)
    d.ellipse([37, 29, 40, 31], fill=EYE_GLOW if eye_brightness > 0.6 else EYE_MID)
    if eye_brightness > 0.4:
        d.ellipse([38, 29, 40, 30], fill=(200, 230, 255, 255))

    # === NOSE RIDGE ===
    d.rectangle([30, 33, 33, 40], fill=(20, 8, 30, 255))

    # === CHIN/JAW ===
    d.ellipse([20, 36, 43, 52], fill=CHIN_COLOR)
    d.ellipse([22, 38, 41, 51], fill=ARMOR_DARK)
    # Chin plate detail
    d.rectangle([27, 40, 36, 48], fill=HELMET_DARK)
    d.line([(31, 40), (31, 48)], fill=HELMET_MID, width=1)

    # === SHOULDER PAULDRONS ===
    # Left shoulder — large, imposing
    left_shoulder = [(0, 44), (16, 40), (20, 48), (18, 58), (8, 63), (0, 63)]
    d.polygon(left_shoulder, fill=ARMOR_DARK)
    d.polygon([(2, 46), (14, 42), (17, 49), (12, 56), (4, 60)], fill=HELMET_DARK)
    # Shoulder highlight
    d.line([(2, 46), (14, 42), (17, 49)], fill=ARMOR_MID, width=1)

    # Right shoulder — mirror
    right_shoulder = [(63, 44), (47, 40), (43, 48), (45, 58), (55, 63), (63, 63)]
    d.polygon(right_shoulder, fill=ARMOR_DARK)
    d.polygon([(61, 46), (49, 42), (46, 49), (51, 56), (59, 60)], fill=HELMET_DARK)
    d.line([(61, 46), (49, 42), (46, 49)], fill=ARMOR_MID, width=1)

    # === CHEST/NECK ===
    d.rectangle([22, 48, 41, 63], fill=ARMOR_DARK)
    d.rectangle([25, 50, 38, 63], fill=HELMET_DARK)
    # Chest center detail
    d.rectangle([29, 52, 34, 60], fill=ARMOR_MID)
    d.ellipse([30, 53, 33, 56], fill=HELMET_HIGH)

    # === COLLAR/NECK GUARD ===
    d.ellipse([20, 43, 43, 55], fill=HELMET_MID)
    d.ellipse([22, 45, 41, 54], fill=ARMOR_DARK)

    # === COSMIC ENERGY AURA (faint, only at peak brightness) ===
    if eye_brightness > 0.75:
        aura_strength = int((eye_brightness - 0.75) * 4 * 30)
        # Top of helmet glow
        for r in range(3):
            d.ellipse([14 - r, 6 - r, 49 + r, 10 + r],
                      fill=(140, 80, 200, max(0, aura_strength - r * 8)))

    return img


def make_galactus_gif():
    frames = []
    durations = []

    for i in range(FRAMES):
        # Eye pulse: smooth sine wave
        t = i / FRAMES
        # Two-beat pulse (faster flash, slower fade)
        brightness = (math.sin(t * 2 * math.pi) + 1) / 2
        # Add a secondary pulse for more life
        brightness = brightness * 0.7 + ((math.sin(t * 4 * math.pi) + 1) / 2) * 0.3

        frame = draw_frame(brightness)
        # Convert to P mode for GIF with optimized palette
        frame_rgb = frame.convert("RGB")
        frame_p = frame_rgb.quantize(colors=64, method=Image.Quantize.MEDIANCUT)
        frames.append(frame_p)
        durations.append(80)  # 80ms per frame = ~12fps

    frames[0].save(
        OUTPUT_PATH,
        save_all=True,
        append_images=frames[1:],
        loop=0,
        duration=durations,
        optimize=False,
    )
    print(f"Saved {FRAMES}-frame GIF to {OUTPUT_PATH}")
    # Print file size
    import os
    size = os.path.getsize(OUTPUT_PATH)
    print(f"File size: {size} bytes ({size // 1024} KB)")


if __name__ == "__main__":
    make_galactus_gif()
