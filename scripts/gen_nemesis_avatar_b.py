#!/usr/bin/env python3
"""
Nemesis the Spokesman — Avatar Option B
"Signal Interrupt"

Aggressive broadcast-corruption aesthetic. A face built from scan-lines,
interrupted mid-frame by signal static. The word MANDATE burns through the noise
in harsh red for one beat. Then back to static. Then back to the face.
The cycle repeats: face -> corruption -> MANDATE -> face.

This is what it looks like when the throne breaks into your broadcast and
reminds you what the room is for.

Palette: cold blue-grey for face/scan-lines, pure black void, aggressive red for
MANDATE text and glitch artifacts. White noise blocks in grey-white.
"""

from PIL import Image, ImageDraw, ImageFont
import random
import math

W, H = 64, 64

# Seeded for reproducibility
rng = random.Random(0x4E454D45)

BG        = (4,   4,   8,   255)   # void black
SCANLINE  = (30,  35,  50,  255)   # base scan-line dark
FACE_BASE = (140, 145, 160, 255)   # cold grey-blue face
FACE_DARK = (80,  85,  100, 255)   # shadow
FACE_HIGH = (190, 195, 210, 255)   # highlight
NOISE_LO  = (20,  22,  30,  255)   # noise block dark
NOISE_HI  = (120, 125, 140, 255)   # noise block light
GLITCH_R  = (220, 20,  20,  255)   # glitch red artifact
MANDATE_R = (240, 15,  15,  255)   # MANDATE text red
MANDATE_G = (255, 60,  60,  255)   # MANDATE glow
EYE_C     = (200, 210, 230, 255)   # cold eyes
EYE_P     = (4,   4,   8,   255)   # pupil


def draw_face_frame(draw, corruption=0.0):
    """
    Draw the base face with scan-line texture.
    corruption 0.0 = clean, 1.0 = fully corrupted
    """
    # Scan-line background
    for y in range(0, H, 2):
        draw.line([(0, y), (W, y)], fill=SCANLINE, width=1)

    # Head oval
    draw.ellipse([(14, 6), (50, 52)], fill=FACE_BASE)

    # Shadow side (left half darker — she faces slightly right)
    for y in range(6, 52):
        for x in range(14, 32):
            # rasterize shadow with slight gradient
            blend = (32 - x) / 18.0
            r = int(FACE_BASE[0] * (1 - blend * 0.4))
            g = int(FACE_BASE[1] * (1 - blend * 0.4))
            b = int(FACE_BASE[2] * (1 - blend * 0.35))
            if x*x + y*y > 0 and 14<=x<=50 and 6<=y<=52:
                pass  # skip per-pixel, use polygon instead

    # Shadow polygon on left side of face
    shadow_poly = [
        (14, 10), (32, 6), (32, 52), (14, 48)
    ]
    draw.polygon(shadow_poly, fill=FACE_DARK)

    # Subtle jaw/chin shape — cut bottom oval narrower
    draw.ellipse([(20, 40), (44, 58)], fill=BG)  # chin crop
    draw.ellipse([(18, 38), (46, 56)], fill=FACE_DARK)  # soft chin

    # Hair — severe, flat-topped, near-black
    draw.ellipse([(14, 4), (50, 18)], fill=(10, 9, 14, 255))
    draw.rectangle([(14, 4), (50, 12)], fill=(10, 9, 14, 255))
    # Hard hairline
    draw.line([(14, 12), (50, 12)], fill=FACE_BASE, width=1)

    # Eyes — both visible, cold and steady
    # Right eye (our left — lit side)
    draw.ellipse([(34, 20), (44, 26)], fill=(20, 20, 28, 255))  # socket
    draw.ellipse([(35, 21), (43, 25)], fill=EYE_C)
    draw.ellipse([(38, 22), (41, 24)], fill=EYE_P)
    # Left eye (our right — shadow side, dimmer)
    draw.ellipse([(20, 20), (30, 26)], fill=(15, 15, 22, 255))
    draw.ellipse([(21, 21), (29, 25)], fill=(120, 128, 145, 255))
    draw.ellipse([(24, 22), (27, 24)], fill=EYE_P)

    # Nose — minimal line
    draw.line([(31, 28), (30, 34)], fill=FACE_DARK, width=1)

    # Mouth — flat, closed, thin line
    draw.line([(26, 38), (38, 38)], fill=(100, 95, 105, 255), width=1)

    # Scan-line overlay on face (every other row slightly darker)
    for y in range(6, 52, 2):
        # Semi-transparent darkening stripe
        stripe_col = (0, 0, 0, 40)
        overlay_strip = Image.new("RGBA", (W, 1), (0, 0, 0, 0))
        sd = ImageDraw.Draw(overlay_strip)
        sd.rectangle([(0, 0), (W, 0)], fill=stripe_col)

    # Corruption artifacts
    if corruption > 0.0:
        num_blocks = int(corruption * 12)
        for _ in range(num_blocks):
            bx = rng.randint(0, W - 8)
            by = rng.randint(4, H - 4)
            bw = rng.randint(4, 20)
            bh = rng.randint(1, 3)
            col = NOISE_HI if rng.random() > 0.5 else NOISE_LO
            draw.rectangle([(bx, by), (bx + bw, by + bh)], fill=col)
        # Horizontal shift glitch lines
        num_lines = int(corruption * 6)
        for _ in range(num_lines):
            ly = rng.randint(10, H - 10)
            shift = rng.randint(-6, 6)
            col = GLITCH_R if rng.random() > 0.6 else NOISE_HI
            draw.line([(max(0, shift), ly), (min(W, W + shift), ly)],
                      fill=col, width=1)


def make_face_frame(corruption=0.0):
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_face_frame(draw, corruption=corruption)
    return img


def make_static_frame(intensity=1.0):
    """Full static / noise frame."""
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    for y in range(0, H, 2):
        draw.line([(0, y), (W, y)], fill=SCANLINE, width=1)

    n = int(intensity * 80)
    for _ in range(n):
        bx = rng.randint(0, W - 1)
        by = rng.randint(0, H - 1)
        bw = rng.randint(1, 16)
        bh = rng.randint(1, 3)
        v = rng.randint(20, 180)
        tint_r = min(255, v + rng.randint(0, 30))
        col = (tint_r, v, v, 255) if rng.random() > 0.8 else (v, v, v+15, 255)
        draw.rectangle([(bx, by), (min(W-1, bx+bw), min(H-1, by+bh))], fill=col)

    # A few horizontal tear lines
    for _ in range(rng.randint(2, 5)):
        ly = rng.randint(0, H - 1)
        draw.line([(0, ly), (W, ly)],
                  fill=(rng.randint(60, 200), rng.randint(20, 60), rng.randint(20, 60), 255),
                  width=1)

    return img


def make_mandate_frame(burn_in=1.0, static_mix=0.0):
    """
    MANDATE text burns red across the frame.
    burn_in: 0.0 = just appearing, 1.0 = full bright
    static_mix: 0..1 layering static on top
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Scan-line BG
    for y in range(0, H, 2):
        draw.line([(0, y), (W, y)], fill=(12, 8, 8, 255), width=1)

    # Glow aura around text area
    glow_alpha = int(burn_in * 60)
    for dy in range(-3, 4):
        for dx in range(-2, 3):
            draw.rectangle(
                [(2 + dx, 24 + dy), (62 + dx, 40 + dy)],
                fill=(*MANDATE_G[:3], glow_alpha // 3)
            )

    # Block-letter "MANDATE" drawn manually (pixel font style, 5px tall)
    # Each letter is a 4-wide, 5-tall bitmap
    letters = {
        'M': [
            "X   X",
            "XX XX",
            "X X X",
            "X   X",
            "X   X",
        ],
        'A': [
            " XXX ",
            "X   X",
            "XXXXX",
            "X   X",
            "X   X",
        ],
        'N': [
            "X   X",
            "XX  X",
            "X X X",
            "X  XX",
            "X   X",
        ],
        'D': [
            "XXXX ",
            "X   X",
            "X   X",
            "X   X",
            "XXXX ",
        ],
        'T': [
            "XXXXX",
            "  X  ",
            "  X  ",
            "  X  ",
            "  X  ",
        ],
        'E': [
            "XXXXX",
            "X    ",
            "XXXX ",
            "X    ",
            "XXXXX",
        ],
    }
    word = "MANDATE"
    letter_w = 5
    gap = 1
    total_w = len(word) * (letter_w + gap) - gap
    start_x = (W - total_w) // 2
    start_y = 26

    alpha = int(burn_in * 255)
    glow_col = (*MANDATE_G[:3], min(255, alpha))
    main_col = (*MANDATE_R[:3], alpha)

    for ci, ch in enumerate(word):
        if ch not in letters:
            continue
        lx = start_x + ci * (letter_w + gap)
        bitmap = letters[ch]
        for row, line in enumerate(bitmap):
            for col, px in enumerate(line):
                if px == 'X':
                    px_x = lx + col
                    px_y = start_y + row
                    # Glow halo
                    for odx in (-1, 0, 1):
                        for ody in (-1, 0, 1):
                            draw.point((px_x + odx, px_y + ody), fill=glow_col)
                    draw.point((px_x, px_y), fill=main_col)

    # Mix in static if requested
    if static_mix > 0.0:
        n = int(static_mix * 40)
        for _ in range(n):
            bx = rng.randint(0, W - 1)
            by = rng.randint(0, H - 1)
            bw = rng.randint(1, 12)
            v = rng.randint(30, 150)
            draw.rectangle([(bx, by), (min(W-1, bx+bw), by)],
                           fill=(v, v//4, v//4, 200))

    return img


def build_frames():
    frames = []
    durations = []

    def add(img, dur):
        frames.append(img)
        durations.append(dur)

    # Phase 1: Clean face — holds steady, watches
    add(make_face_frame(0.0), 150)
    add(make_face_frame(0.0), 150)
    add(make_face_frame(0.0), 150)
    add(make_face_frame(0.0), 150)

    # Phase 2: Corruption creeps in
    add(make_face_frame(0.15), 80)
    add(make_face_frame(0.35), 70)
    add(make_face_frame(0.6),  60)
    add(make_face_frame(0.9),  60)

    # Phase 3: Full static
    add(make_static_frame(1.0), 60)
    add(make_static_frame(1.0), 60)
    add(make_static_frame(0.8), 50)

    # Phase 4: MANDATE burns in
    add(make_mandate_frame(0.3, 0.4), 60)
    add(make_mandate_frame(0.7, 0.2), 60)
    add(make_mandate_frame(1.0, 0.0), 100)
    add(make_mandate_frame(1.0, 0.0), 100)
    add(make_mandate_frame(1.0, 0.0), 120)

    # Phase 5: MANDATE with static flicker
    add(make_mandate_frame(0.85, 0.3), 50)
    add(make_mandate_frame(1.0,  0.0), 50)
    add(make_mandate_frame(0.6,  0.5), 50)
    add(make_mandate_frame(1.0,  0.0), 80)

    # Phase 6: Back to static
    add(make_static_frame(0.9), 50)
    add(make_static_frame(1.0), 50)
    add(make_static_frame(0.7), 50)

    # Phase 7: Face reassembles — still, watching again
    add(make_face_frame(0.8),  70)
    add(make_face_frame(0.5),  70)
    add(make_face_frame(0.25), 80)
    add(make_face_frame(0.0),  100)
    add(make_face_frame(0.0),  150)
    add(make_face_frame(0.0),  150)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/nemesis_b.gif"
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
