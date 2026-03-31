#!/usr/bin/env python3
"""
GigaClungus — Avatar
"The Overseer"

A severe frontal face — symmetrical, still, watching. No warmth. No
expression except vigilance. Rendered in near-total darkness with only
the barest cold light picking out the planes of the face.

The animation: the eyes pulse once — a slow, deliberate blink from fully
open to a narrow slit and back. Not a normal blink. A decision. Then
nothing moves for a long time. Then the eyes drop briefly to half-closed
before reopening, cold and steady. The message: he sees you. He is
always looking.

A thin horizontal line — the mouth — never moves. No eyebrows visible;
the forehead dissolves into shadow. Only the eyes and the jaw line are
real.

Palette: void black, dark charcoal, cold gunmetal grey, icy near-white
for the iris highlight. Zero warmth. No color.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# Palette — achromatic, cold
BG           = (4,   4,   6,   255)   # void black
FACE_SHADOW  = (22,  22,  28,  255)   # face deep shadow
FACE_MID     = (48,  50,  58,  255)   # face mid-tone
FACE_LIT     = (75,  78,  90,  255)   # face highlight plane
FACE_BRIGHT  = (100, 104, 118, 255)   # forehead / nose bridge highlight
SKULL_EDGE   = (30,  32,  38,  255)   # skull outline
EYE_SOCKET   = (10,  10,  14,  255)   # eye socket darkness
EYE_IRIS     = (130, 138, 160, 255)   # cold grey-silver iris
EYE_PUPIL    = (4,   4,   6,   255)   # pupil (same as BG)
EYE_GLINT    = (210, 218, 235, 255)   # single point glint
EYE_LID      = (38,  40,  48,  255)   # eyelid colour
MOUTH_LINE   = (20,  20,  26,  255)   # closed mouth shadow line
JAW_SHADOW   = (18,  18,  24,  255)   # jaw underside
NECK_DARK    = (16,  16,  20,  255)   # neck / collar darkness


def draw_face(draw, eye_open: float = 1.0):
    """
    Draw the GigaClungus face.
    eye_open: 1.0 = fully open, 0.0 = fully closed (just a line).
    """
    # --- Neck / collar block ---
    # Dark column below jaw
    draw.rectangle([(22, 50), (42, 64)], fill=NECK_DARK)

    # --- Head silhouette: wide, angular, slight taper ---
    # Full head polygon — broad cranium, hard jaw
    head = [
        (18, 10),   # top-left crown
        (46, 10),   # top-right crown
        (50, 22),   # right temple
        (52, 36),   # right cheek
        (46, 50),   # right jaw
        (32, 54),   # chin centre
        (18, 50),   # left jaw
        (12, 36),   # left cheek
        (14, 22),   # left temple
    ]
    draw.polygon(head, fill=FACE_SHADOW)

    # --- Midtone plane — centre of face (forehead to chin) ---
    mid_plane = [
        (24, 10), (40, 10),
        (44, 24), (44, 42),
        (38, 50), (32, 53),
        (26, 50), (20, 42),
        (20, 24),
    ]
    draw.polygon(mid_plane, fill=FACE_MID)

    # --- Lit plane — central strip nose bridge to forehead ---
    lit_plane = [
        (28, 10), (36, 10),
        (38, 20), (36, 42),
        (32, 52), (28, 42),
        (26, 20),
    ]
    draw.polygon(lit_plane, fill=FACE_LIT)

    # --- Nose bridge highlight (narrow strip) ---
    draw.line([(31, 14), (32, 34)], fill=FACE_BRIGHT, width=2)

    # --- Brow ridge (thick, hard, no arch — heavy supraorbital) ---
    # Just a dark band across
    brow_left  = [(16, 22), (28, 20), (28, 23), (16, 25)]
    brow_right = [(36, 20), (48, 22), (48, 25), (36, 23)]
    draw.polygon(brow_left,  fill=SKULL_EDGE)
    draw.polygon(brow_right, fill=SKULL_EDGE)

    # --- Eye sockets ---
    draw.ellipse([(17, 23), (29, 32)], fill=EYE_SOCKET)
    draw.ellipse([(35, 23), (47, 32)], fill=EYE_SOCKET)

    # --- Eyes (parametric on eye_open) ---
    # eye_open 1.0: full circle iris visible
    # eye_open 0.0: just a thin dark slit
    # Left eye
    lx, ly = 23, 27   # eye centre
    # Right eye
    rx, ry = 41, 27

    iris_r  = 4
    pupil_r = 2

    for (ex, ey) in [(lx, ly), (rx, ry)]:
        if eye_open >= 0.05:
            # Iris
            half_h = max(1, int(iris_r * eye_open))
            draw.ellipse(
                [(ex - iris_r, ey - half_h), (ex + iris_r, ey + half_h)],
                fill=EYE_IRIS
            )
            # Pupil
            p_half = max(1, int(pupil_r * eye_open))
            draw.ellipse(
                [(ex - pupil_r, ey - p_half), (ex + pupil_r, ey + p_half)],
                fill=EYE_PUPIL
            )
            # Glint — single pixel, top-right of iris
            if eye_open > 0.4:
                draw.point((ex + 2, ey - max(1, int(2 * eye_open))), fill=EYE_GLINT)
        else:
            # Fully closed — just the lid line
            draw.line([(ex - iris_r, ey), (ex + iris_r, ey)], fill=EYE_LID, width=1)

        # Upper eyelid line — always present
        lid_top_y = ey - int(iris_r * eye_open) - 1
        draw.line(
            [(ex - iris_r - 1, max(ey - iris_r, lid_top_y)),
             (ex + iris_r + 1, max(ey - iris_r, lid_top_y))],
            fill=EYE_LID, width=1
        )

    # --- Nose: minimal — two small shadow dots + a slim ridge line ---
    draw.point((29, 38), fill=FACE_SHADOW)
    draw.point((35, 38), fill=FACE_SHADOW)
    draw.line([(31, 34), (33, 38)], fill=FACE_MID, width=1)

    # --- Mouth: flat, sealed, slightly below nose ---
    draw.line([(25, 44), (39, 44)], fill=MOUTH_LINE, width=1)
    # Upper lip shadow — one pixel above
    draw.line([(26, 43), (38, 43)], fill=FACE_MID, width=1)

    # --- Jaw underside shadow ---
    jaw_under = [(18, 50), (32, 54), (46, 50), (46, 52), (32, 56), (18, 52)]
    draw.polygon(jaw_under, fill=JAW_SHADOW)

    # --- Cheekbone shadow on each side ---
    draw.polygon([(12, 36), (20, 34), (20, 42), (14, 44)], fill=FACE_SHADOW)
    draw.polygon([(44, 34), (52, 36), (50, 44), (44, 42)], fill=FACE_SHADOW)


def make_frame(eye_open: float = 1.0) -> Image.Image:
    img  = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_face(draw, eye_open=eye_open)
    return img


def build_frames():
    frames    = []
    durations = []

    def add(eye_open, dur):
        frames.append(make_frame(eye_open))
        durations.append(dur)

    # ---- Phase 1: Open, watching — long still hold ----
    for _ in range(6):
        add(1.0, 120)

    # ---- Phase 2: Slow deliberate blink ----
    add(0.75, 80)
    add(0.45, 70)
    add(0.15, 70)
    add(0.0,  90)    # closed — the decision moment
    add(0.0,  90)
    add(0.15, 70)
    add(0.45, 70)
    add(0.75, 70)
    add(1.0,  80)

    # ---- Phase 3: Hold again — longer silence ----
    for _ in range(8):
        add(1.0, 120)

    # ---- Phase 4: Eyes drop to half, then reopen ----
    add(0.55, 90)
    add(0.35, 90)
    add(0.55, 80)
    add(1.0,  80)

    # ---- Phase 5: Final long still hold ----
    for _ in range(6):
        add(1.0, 120)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/gigaclungus.gif"
    frames, durations = build_frames()

    palettes = [f.quantize(colors=128, method=Image.Quantize.FASTOCTREE) for f in frames]

    # Force GIF loop by ensuring pixel(63,63) alternates — avoids single-frame static export bug
    bg_idx  = palettes[0].getpixel((0, 0))
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
