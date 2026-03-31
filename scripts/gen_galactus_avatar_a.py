#!/usr/bin/env python3
"""
Galactus — Avatar Option A: "The Consumption Event"

Visual concept: Galactus as a towering cosmic silhouette viewed from below,
dwarfing a small planet he is actively consuming. His distinctive helmet wings
frame the top of the frame. Energy conduit lines pulse downward from his hands
into the shrinking planet below. The planet dims and contracts with each cycle.

Colors: void black background, deep purple nebula glow, blinding gold/white
energy drain, the planet is a pale blue marble.

Animation: planet pulses and shrinks each cycle, energy conduit lines blaze
brighter, helmet glows with galactic purple, eyes of pure white flare.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# Palette
BG          = (4,  2,  12, 255)    # void black-purple
NEBULA_1    = (20, 8,  40, 255)    # deep purple nebula
NEBULA_2    = (35, 12, 65, 255)    # lighter nebula
BODY        = (18, 10, 35, 255)    # galactus body (near black)
BODY_MID    = (30, 18, 55, 255)    # body midtone
HELMET      = (40, 20, 80, 255)    # helmet body
HELMET_GLOW = (110, 50, 200, 255)  # helmet luminous purple
WING_BASE   = (55, 25, 110, 255)   # wing base
WING_TIP    = (140, 60, 255, 255)  # wing tip bright
EYE_COL     = (255, 255, 230, 255) # blinding white eyes
CONDUIT     = (255, 200, 40, 255)  # energy conduit gold
CONDUIT_BRIGHT = (255, 240, 120, 255)  # bright conduit flash
PLANET_BASE = (60, 120, 180, 255)  # planet blue
PLANET_DARK = (30, 70, 110, 255)   # planet shadow
PLANET_GLOW = (180, 230, 255, 255) # planet bright side
DRAIN_CORE  = (255, 240, 100, 255) # drain point on planet


def draw_nebula(draw, intensity):
    """Draw background nebula glow — intensity 0..1."""
    for r in range(32, 1, -2):
        alpha = int(intensity * 60 * (1 - r / 32))
        col = (
            int(NEBULA_2[0] * r / 32 + NEBULA_1[0] * (1 - r / 32)),
            int(NEBULA_2[1] * r / 32 + NEBULA_1[1] * (1 - r / 32)),
            int(NEBULA_2[2] * r / 32 + NEBULA_1[2] * (1 - r / 32)),
            alpha
        )
        draw.ellipse([(32 - r, 10 - r), (32 + r, 10 + r)], fill=col)


def draw_helmet_wing(draw, side, glow_t):
    """Draw one helmet wing. side: -1 = left, 1 = right."""
    cx = 32
    # Wing is a swept triangle from helmet crown outward
    base_x = cx + side * 6
    base_y = 7
    tip_x  = cx + side * 30
    tip_y  = 3
    mid_x  = cx + side * 18
    mid_y  = 14
    wing = [(base_x, base_y), (tip_x, tip_y), (mid_x, mid_y)]
    # Base wing shape
    r = int(WING_BASE[0] + (WING_TIP[0] - WING_BASE[0]) * glow_t)
    g = int(WING_BASE[1] + (WING_TIP[1] - WING_BASE[1]) * glow_t)
    b = int(WING_BASE[2] + (WING_TIP[2] - WING_BASE[2]) * glow_t)
    draw.polygon(wing, fill=(r, g, b, 255))
    # Wing outline / edge glow
    draw.line([(base_x, base_y), (tip_x, tip_y)], fill=(*WING_TIP[:3], int(180 * glow_t + 60)), width=1)
    # Inner notch
    inner_x = cx + side * 14
    inner_y = 10
    draw.line([(base_x, base_y), (inner_x, inner_y)], fill=(*HELMET_GLOW[:3], int(120 * glow_t + 40)), width=1)


def draw_galactus_body(draw, glow_t):
    """Draw Galactus figure — massive, fills upper 3/4 of frame."""
    cx = 32

    # --- Helmet crown / dome ---
    helm_top = [(cx - 8, 8), (cx + 8, 8), (cx + 9, 14), (cx - 9, 14)]
    draw.polygon(helm_top, fill=HELMET)
    # Helmet front plate
    helm_face = [(cx - 7, 14), (cx + 7, 14), (cx + 6, 22), (cx - 6, 22)]
    draw.polygon(helm_face, fill=BODY_MID)
    # Helmet glow edge
    r = int(HELMET[0] + (HELMET_GLOW[0] - HELMET[0]) * glow_t)
    g_c = int(HELMET[1] + (HELMET_GLOW[1] - HELMET[1]) * glow_t)
    b = int(HELMET[2] + (HELMET_GLOW[2] - HELMET[2]) * glow_t)
    draw.rectangle([(cx - 8, 8), (cx + 8, 14)], outline=(r, g_c, b, 200))

    # --- Eyes ---
    eye_alpha = int(180 + 75 * glow_t)
    draw.ellipse([(cx - 5, 16), (cx - 2, 19)], fill=(*EYE_COL[:3], eye_alpha))
    draw.ellipse([(cx + 2, 16), (cx + 5, 19)], fill=(*EYE_COL[:3], eye_alpha))
    # Eye flare at peak
    if glow_t > 0.7:
        flare_alpha = int((glow_t - 0.7) / 0.3 * 200)
        draw.ellipse([(cx - 6, 15), (cx - 1, 20)], fill=(*EYE_COL[:3], flare_alpha))
        draw.ellipse([(cx + 1, 15), (cx + 6, 20)], fill=(*EYE_COL[:3], flare_alpha))

    # --- Chest / torso (massive, tapering) ---
    torso = [
        (cx - 9, 22), (cx + 9, 22),
        (cx + 11, 36), (cx - 11, 36),
    ]
    draw.polygon(torso, fill=BODY)
    # Chest plate
    chest_plate = [
        (cx - 5, 23), (cx + 5, 23),
        (cx + 6, 31), (cx - 6, 31),
    ]
    draw.polygon(chest_plate, fill=BODY_MID)
    # Chest glow line
    draw.line([(cx, 23), (cx, 31)], fill=(*CONDUIT[:3], int(120 * glow_t + 40)), width=1)

    # --- Shoulders (jutting wide) ---
    # Left shoulder
    draw.polygon([(cx - 9, 22), (cx - 16, 24), (cx - 14, 30), (cx - 9, 28)], fill=BODY_MID)
    # Right shoulder
    draw.polygon([(cx + 9, 22), (cx + 16, 24), (cx + 14, 30), (cx + 9, 28)], fill=BODY_MID)

    # --- Arms reaching downward (toward planet) ---
    # Left arm
    draw.polygon([
        (cx - 14, 30), (cx - 11, 30),
        (cx - 9, 44), (cx - 12, 44),
    ], fill=BODY)
    # Right arm
    draw.polygon([
        (cx + 11, 30), (cx + 14, 30),
        (cx + 12, 44), (cx + 9, 44),
    ], fill=BODY)

    # --- Lower body / waist ---
    draw.polygon([
        (cx - 11, 36), (cx + 11, 36),
        (cx + 8, 46), (cx - 8, 46),
    ], fill=BODY)


def draw_conduits(draw, glow_t):
    """Energy conduit lines from hands down to planet."""
    cx = 32
    # Left conduit
    bright = int(CONDUIT[0] + (CONDUIT_BRIGHT[0] - CONDUIT[0]) * glow_t)
    alpha = int(160 + 95 * glow_t)
    # Left hand to planet
    lx1, ly1 = cx - 10, 44
    lx2, ly2 = cx - 4, 54
    draw.line([(lx1, ly1), (lx2, ly2)], fill=(bright, bright // 2, 40, alpha), width=2)
    # Right conduit
    rx1, ry1 = cx + 10, 44
    rx2, ry2 = cx + 4, 54
    draw.line([(rx1, ry1), (rx2, ry2)], fill=(bright, bright // 2, 40, alpha), width=2)
    # Center conduit from chest
    if glow_t > 0.3:
        c_alpha = int((glow_t - 0.3) / 0.7 * 180)
        draw.line([(cx, 36), (cx, 53)], fill=(*CONDUIT[:3], c_alpha), width=1)


def draw_planet(draw, shrink_t, glow_t):
    """
    Draw the planet being consumed.
    shrink_t: 0 = full size, 1 = fully consumed
    """
    cx = 32
    cy = 55
    base_r = 7
    r = int(base_r * (1.0 - shrink_t * 0.35))

    if r < 1:
        return

    # Planet body
    draw.ellipse([(cx - r, cy - r), (cx + r, cy + r)], fill=PLANET_BASE)
    # Dark side
    draw.ellipse([(cx, cy - r), (cx + r, cy + r)], fill=PLANET_DARK)
    # Atmosphere rim
    atm_alpha = int(180 * (1.0 - shrink_t))
    draw.ellipse([(cx - r - 1, cy - r - 1), (cx + r + 1, cy + r + 1)],
                 outline=(*PLANET_GLOW[:3], atm_alpha), width=1)

    # Drain point glow (where conduit hits)
    drain_alpha = int(200 * glow_t)
    draw.ellipse([(cx - 2, cy - 3), (cx + 2, cy + 1)],
                 fill=(*DRAIN_CORE[:3], drain_alpha))


def make_frame(phase_t, shrink_t):
    """
    phase_t: 0..1 glow/pulse cycle
    shrink_t: 0..1 planet shrink across whole animation
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Nebula
    draw_nebula(draw, phase_t * 0.6 + 0.4)

    # Starfield
    import random
    rng = random.Random(42)
    for _ in range(20):
        sx = rng.randint(0, W - 1)
        sy = rng.randint(0, H - 1)
        sa = rng.randint(80, 200)
        draw.point((sx, sy), fill=(sa, sa, sa + 20, 255))

    # Helmet wings
    draw_helmet_wing(draw, -1, phase_t)
    draw_helmet_wing(draw,  1, phase_t)

    # Galactus body
    draw_galactus_body(draw, phase_t)

    # Conduit lines
    draw_conduits(draw, phase_t)

    # Planet
    draw_planet(draw, shrink_t, phase_t)

    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    # Full animation: 16 frames cycling through consumption
    # Planet slowly shrinks over whole sequence, glow pulses each cycle
    N = 16
    for i in range(N):
        t = i / N
        # Glow pulse: 2 cycles over the animation
        phase_t = (math.sin(t * 2 * math.pi * 2 - math.pi / 2) + 1) / 2
        # Planet shrinks from full to 80% over the animation
        shrink_t = t * 0.55
        frames.append(make_frame(phase_t, shrink_t))
        # Hold on peak glow frames slightly longer
        dur = 80 if phase_t > 0.8 else 60
        durations.append(dur)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/galactus_a.gif"
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
