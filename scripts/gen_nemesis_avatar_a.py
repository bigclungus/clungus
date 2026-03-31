#!/usr/bin/env python3
"""
Nemesis the Spokesman — Avatar Option A
"The Gun on the Table"

Isometric throne room. The throne is empty. Nemesis sits to its side,
still, watchful. A gun rests on the arm of her chair. The room is void-black
with cold silver/white highlights. The only animation: the gun barrel glints
once in a slow pulse, then returns to stillness. Her single visible eye opens,
holds, closes — the only sign she's alive.

Palette: near-void black, cold grey-white, pale bone, hard silver.
No warmth. No threat in her posture — because she doesn't need one.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# --- Palette ---
BG           = (8,  8,  12,  255)   # void black
FLOOR_A      = (18, 18, 26, 255)    # dark stone
FLOOR_B      = (14, 14, 20, 255)    # stone variant
THRONE_DARK  = (22, 20, 30, 255)    # throne body shadow
THRONE_MID   = (35, 32, 48, 255)    # throne face
THRONE_LIGHT = (55, 52, 70, 255)    # throne highlight edge
CHAIR_DARK   = (20, 20, 28, 255)
CHAIR_MID    = (30, 28, 40, 255)
ROBE_DARK    = (16, 15, 22, 255)
ROBE_MID     = (26, 24, 35, 255)
SKIN         = (195, 185, 175, 255) # pale cool skin
SKIN_SHADOW  = (155, 148, 142, 255)
HAIR         = (12, 11, 16, 255)    # near-void hair
EYE_OPEN     = (210, 210, 230, 255) # cold grey-white iris
EYE_PUPIL    = (8, 8, 12, 255)
GUN_BODY     = (80, 82, 90, 255)    # cold dark steel
GUN_GLINT    = (220, 225, 235, 255) # barrel glint
GUN_SHADOW   = (45, 46, 52, 255)
EMPTY_THRONE = (30, 28, 42, 255)    # the throne top (empty, dark)


def draw_iso_box(draw, cx, cy, w, depth, col_top, col_left, col_right):
    top = [
        (cx,        cy),
        (cx + w//2, cy + w//4),
        (cx,        cy + w//2),
        (cx - w//2, cy + w//4),
    ]
    draw.polygon(top, fill=col_top)
    left = [
        (cx - w//2, cy + w//4),
        (cx,        cy + w//2),
        (cx,        cy + w//2 + depth),
        (cx - w//2, cy + w//4 + depth),
    ]
    draw.polygon(left, fill=col_left)
    right = [
        (cx,        cy + w//2),
        (cx + w//2, cy + w//4),
        (cx + w//2, cy + w//4 + depth),
        (cx,        cy + w//2 + depth),
    ]
    draw.polygon(right, fill=col_right)


def make_frame(eye_state, glint_alpha):
    """
    eye_state: 0.0 = fully closed, 1.0 = fully open
    glint_alpha: 0..255 brightness of gun barrel glint
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # --- Floor grid (isometric, muted) ---
    for gx in range(-1, 5):
        for gy in range(0, 5):
            px = 32 + (gx - gy) * 9
            py = 36 + (gx + gy) * 4
            tile = [
                (px,     py),
                (px + 9, py + 4),
                (px,     py + 8),
                (px - 9, py + 4),
            ]
            shade = FLOOR_A if (gx + gy) % 2 == 0 else FLOOR_B
            draw.polygon(tile, fill=shade)

    # --- The Empty Throne (center-back, elevated) ---
    # Throne base block
    draw_iso_box(draw, cx=32, cy=8, w=18, depth=10,
                 col_top=EMPTY_THRONE,
                 col_left=THRONE_DARK,
                 col_right=THRONE_MID)
    # Throne back slab (tall vertical)
    throne_back = [
        (23, 4), (32, 8), (32, 18), (23, 14)
    ]
    draw.polygon(throne_back, fill=THRONE_DARK)
    throne_back_r = [
        (32, 8), (41, 4), (41, 14), (32, 18)
    ]
    draw.polygon(throne_back_r, fill=THRONE_MID)
    # Throne crest top
    draw.polygon([(23, 4), (32, 0), (41, 4), (32, 8)], fill=THRONE_LIGHT)
    # Crown-like notch cut from top
    draw.polygon([(28, 2), (32, 4), (36, 2), (32, 0)], fill=BG)

    # --- Nemesis's Chair (right side of throne) ---
    draw_iso_box(draw, cx=46, cy=22, w=12, depth=6,
                 col_top=CHAIR_MID,
                 col_left=CHAIR_DARK,
                 col_right=CHAIR_DARK)
    # Chair back
    chair_back_l = [(40, 18), (46, 21), (46, 30), (40, 27)]
    draw.polygon(chair_back_l, fill=CHAIR_DARK)
    chair_back_r = [(46, 21), (52, 18), (52, 27), (46, 30)]
    draw.polygon(chair_back_r, fill=CHAIR_MID)
    # Armrest (where gun rests)
    arm_top = [(42, 20), (46, 22), (50, 20), (46, 18)]
    draw.polygon(arm_top, fill=CHAIR_MID)

    # --- Gun on armrest ---
    # Body of gun: small dark polygon on armrest
    gun_poly = [(43, 20), (49, 20), (50, 22), (44, 22)]
    draw.polygon(gun_poly, fill=GUN_BODY)
    # Barrel extending right
    barrel = [(49, 20), (53, 19), (53, 21), (49, 21)]
    draw.polygon(barrel, fill=GUN_SHADOW)
    draw.line([(49, 20), (53, 19)], fill=GUN_BODY, width=1)
    # Grip going down
    draw.polygon([(43, 21), (45, 21), (45, 24), (43, 24)], fill=GUN_SHADOW)
    # Barrel tip glint
    if glint_alpha > 0:
        ga = min(255, glint_alpha)
        draw.ellipse([(52, 18), (55, 21)], fill=(*GUN_GLINT[:3], ga))
        # Thin glint line along barrel top
        draw.line([(49, 19), (53, 18)], fill=(*GUN_GLINT[:3], ga//2), width=1)

    # --- Nemesis body (robed, seated) ---
    # Lower robe (lap, seated)
    robe_lap = [(41, 30), (48, 33), (48, 38), (41, 35)]
    draw.polygon(robe_lap, fill=ROBE_DARK)
    robe_lap_r = [(48, 33), (52, 30), (52, 35), (48, 38)]
    draw.polygon(robe_lap_r, fill=ROBE_MID)
    # Torso
    torso_l = [(41, 22), (46, 25), (46, 32), (41, 29)]
    draw.polygon(torso_l, fill=ROBE_DARK)
    torso_r = [(46, 25), (50, 22), (50, 29), (46, 32)]
    draw.polygon(torso_r, fill=ROBE_MID)

    # --- Head ---
    # Small, slightly turned — we only see one eye clearly
    draw.ellipse([(42, 12), (50, 21)], fill=SKIN)
    # Shadow side of face (left side hidden)
    draw.ellipse([(42, 12), (46, 21)], fill=SKIN_SHADOW)

    # --- Hair ---
    draw.ellipse([(42, 11), (50, 16)], fill=HAIR)
    draw.polygon([(42, 13), (50, 13), (50, 16), (42, 16)], fill=HAIR)

    # --- Eye (right eye — the one that watches) ---
    # Socket
    draw.ellipse([(46, 16), (50, 19)], fill=SKIN_SHADOW)
    eye_open_px = int(eye_state * 2)
    if eye_open_px > 0:
        # Iris
        draw.ellipse([(47, 17), (50, 19)], fill=EYE_OPEN)
        # Pupil
        draw.ellipse([(48, 17), (49, 18)], fill=EYE_PUPIL)
        # Eyelid closes when eye_state < 0.5
        if eye_state < 0.6:
            lid_y = 17 + int((1.0 - eye_state / 0.6) * 2)
            draw.line([(47, lid_y), (50, lid_y)], fill=HAIR, width=1)

    # --- Mouth: not visible / hidden in shadow, just a hint ---
    draw.line([(44, 20), (47, 20)], fill=SKIN_SHADOW, width=1)

    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []
    tick = 0

    def add(eye_state, glint_alpha, dur):
        nonlocal tick
        frames.append(make_frame(eye_state, glint_alpha))
        durations.append(dur)
        tick += 1

    # Long hold: eye open, gun dark — she watches, still
    for _ in range(4):
        add(1.0, 0, 100)

    # Eye blinks slowly closed
    add(0.7, 0, 80)
    add(0.3, 0, 80)
    add(0.0, 0, 100)
    add(0.0, 0, 100)

    # Eye opens again
    add(0.3, 0, 80)
    add(0.7, 0, 80)
    add(1.0, 0, 100)

    # Hold open — then gun glints
    for _ in range(2):
        add(1.0, 0, 100)

    # Glint pulses on barrel
    add(1.0, 80,  60)
    add(1.0, 200, 60)
    add(1.0, 255, 80)
    add(1.0, 180, 60)
    add(1.0, 80,  60)
    add(1.0, 0,   60)

    # Long silence again — nothing moves
    for _ in range(5):
        add(1.0, 0, 100)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/nemesis_a.gif"
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
