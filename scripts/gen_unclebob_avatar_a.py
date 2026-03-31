#!/usr/bin/env python3
"""
Uncle Bob — Avatar Option A: "The Refactor"

A grizzled craftsman at a terminal, bathed in green phosphor light.
Bad code scrolls across the screen. He raises a chisel and strikes —
red X violations flash, the screen glitches, code transforms to clean.

Palette: near-black background, terminal green, sharp red violation markers,
aged ivory skin, white beard. Animation: code scrolls, hand raises chisel,
strikes — red flash, code clears to clean green lines, holds, loops.
"""

from PIL import Image, ImageDraw
import math
import random

W, H = 64, 64

# --- Palette ---
BG           = (8,  10,  8,  255)    # near-black terminal room
FLOOR        = (14, 18, 14, 255)     # dark floor
SCREEN_BG    = (6,  20,  6,  255)    # monitor face, dark green-black
SCREEN_GLOW  = (0,  180, 0,  255)    # bright terminal green
SCREEN_DIM   = (0,  80,  0,  255)    # dim code lines
SCREEN_DIRTY = (0,  120, 0,  255)    # messy code lines (slightly brighter)
VIOLATION_R  = (220, 30, 20, 255)    # red violation marker
VIOLATION_DIM= (120, 15, 10, 255)    # dim red
MONITOR_BODY = (30, 35, 30, 255)     # monitor casing
MONITOR_SIDE = (18, 22, 18, 255)     # monitor side/shadow
DESK_TOP     = (40, 38, 32, 255)     # wooden desk top
DESK_SIDE    = (25, 23, 18, 255)     # desk side
BODY         = (55, 52, 60, 255)     # dark jacket
BODY_SHADOW  = (35, 33, 40, 255)     # jacket shadow
SKIN         = (195, 165, 140, 255)  # aged skin tone
BEARD        = (220, 218, 210, 255)  # white beard
HAIR         = (90,  85,  82, 255)   # grey hair
EYE          = (200, 200, 210, 255)  # light eyes, focused
CHISEL_METAL = (180, 180, 190, 255)  # chisel blade
CHISEL_WOOD  = (120, 90,  60, 255)   # chisel handle
ARM          = (55, 52, 60, 255)     # sleeve

# Pseudo-random but deterministic code line lengths per frame seed
_CODE_SEED = [
    [8, 14, 6, 11, 9, 13, 5, 10],
    [10, 7, 15, 8, 12, 6, 11, 9],
    [12, 9, 5, 14, 7, 13, 8, 11],
    [6, 13, 10, 7, 14, 9, 5, 12],
    [9, 11, 13, 6, 8, 14, 10, 7],
    [11, 6, 8, 13, 9, 7, 14, 5],
    [7, 14, 9, 11, 6, 12, 8, 13],
    [13, 8, 6, 9, 14, 11, 7, 10],
]


def draw_screen_code(draw, sx, sy, sw, sh, seed_idx, dirty=True, red_flash=0):
    """Draw code lines on the monitor face."""
    lines = _CODE_SEED[seed_idx % len(_CODE_SEED)]
    line_h = 2
    gap = 1
    x0 = sx + 2
    for i, length in enumerate(lines):
        y = sy + 2 + i * (line_h + gap)
        if y + line_h > sy + sh - 2:
            break
        clamp_len = min(length, sw - 4)
        if dirty:
            # Messy: irregular line lengths, some brighter, some indent
            indent = (i * 3) % 5
            col = SCREEN_DIRTY if i % 3 != 0 else SCREEN_DIM
            draw.rectangle([x0 + indent, y, x0 + indent + clamp_len, y + line_h - 1], fill=col)
            # "Mess" pixel junk at end
            junk_x = x0 + indent + clamp_len + 1
            if junk_x < sx + sw - 2:
                draw.rectangle([junk_x, y, junk_x + 2, y], fill=SCREEN_DIM)
        else:
            # Clean: uniform, structured indentation
            indent = 0 if i % 4 < 2 else 3
            draw.rectangle([x0 + indent, y, x0 + indent + clamp_len, y + line_h - 1], fill=SCREEN_GLOW)

    # Red violation marker (X mark or underline) on flash
    if red_flash > 0:
        alpha_r = int(red_flash * 255)
        r_col = (*VIOLATION_R[:3], alpha_r) if red_flash < 1.0 else VIOLATION_R
        # Underline row 3 and row 5
        for vrow in [2, 4]:
            y = sy + 2 + vrow * (line_h + gap)
            draw.line([x0, y + line_h, x0 + sw - 4, y + line_h], fill=r_col, width=1)
        # Big X across screen center
        if red_flash > 0.6:
            draw.line([sx + 3, sy + 3, sx + sw - 3, sy + sh - 3], fill=r_col, width=2)
            draw.line([sx + sw - 3, sy + 3, sx + 3, sy + sh - 3], fill=r_col, width=2)


def make_frame(phase, seed_idx, chisel_raise, red_flash, clean_screen):
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # --- Floor strip ---
    draw.rectangle([(0, 54), (W, H)], fill=FLOOR)

    # --- Desk ---
    # Top face
    draw.polygon([(10, 44), (54, 44), (54, 50), (10, 50)], fill=DESK_TOP)
    # Front face
    draw.polygon([(10, 50), (54, 50), (54, 56), (10, 56)], fill=DESK_SIDE)

    # --- Monitor body (isometric-ish box sitting on desk) ---
    # Monitor back/side slab
    draw.polygon([(18, 16), (46, 16), (46, 44), (18, 44)], fill=MONITOR_BODY)
    # Monitor right shadow side
    draw.polygon([(46, 16), (50, 20), (50, 48), (46, 44)], fill=MONITOR_SIDE)
    # Monitor screen face
    screen_x, screen_y, screen_w, screen_h = 20, 18, 24, 24
    draw.rectangle([screen_x, screen_y, screen_x + screen_w, screen_y + screen_h], fill=SCREEN_BG)

    # Draw code on screen
    draw_screen_code(draw, screen_x, screen_y, screen_w, screen_h,
                     seed_idx=seed_idx, dirty=(not clean_screen), red_flash=red_flash)

    # Screen glow ambient — subtle green wash on figure
    if not clean_screen:
        for gx in range(8, 22):
            for gy in range(18, 45):
                px = img.getpixel((gx, gy))
                blend = 0.08
                img.putpixel((gx, gy), (
                    int(px[0] * (1 - blend) + 0 * blend),
                    int(px[1] * (1 - blend) + 120 * blend),
                    int(px[2] * (1 - blend) + 0 * blend),
                    px[3]
                ))

    # --- Body / torso ---
    # Seated, upper body visible above desk
    draw.polygon([(14, 38), (24, 34), (24, 44), (14, 44)], fill=BODY_SHADOW)  # left side
    draw.polygon([(14, 26), (26, 22), (26, 44), (14, 44)], fill=BODY)          # main torso

    # --- Head ---
    # Slightly forward-leaning, looking at screen
    # Face oval
    draw.ellipse([(12, 12), (26, 26)], fill=SKIN)
    # Grey hair on top
    draw.ellipse([(12, 12), (26, 18)], fill=HAIR)
    draw.rectangle([(12, 12), (26, 16)], fill=HAIR)
    # White beard (lower 40% of face)
    draw.ellipse([(12, 20), (26, 30)], fill=BEARD)
    draw.rectangle([(13, 22), (25, 27)], fill=BEARD)
    # Eyes — narrowed, focused
    draw.line([(15, 18), (18, 18)], fill=EYE, width=1)
    draw.line([(20, 18), (23, 18)], fill=EYE, width=1)
    # Brow furrow lines
    draw.line([(15, 17), (18, 16)], fill=BODY_SHADOW, width=1)
    draw.line([(20, 16), (23, 17)], fill=BODY_SHADOW, width=1)

    # --- Right arm + chisel ---
    # Arm root from shoulder ~(26, 30)
    shoulder = (26, 30)
    # chisel_raise: 0.0 = chisel flat on desk, 1.0 = raised high
    # raised: tip at (40, 14), resting: tip at (38, 44)
    tip_x = int(36 + 4 * chisel_raise)
    tip_y = int(44 - 30 * chisel_raise)

    # Forearm
    draw.line([shoulder, (tip_x, tip_y)], fill=ARM, width=4)

    # Chisel handle (wood colored, thick)
    handle_len = 8
    dx = tip_x - shoulder[0]
    dy = tip_y - shoulder[1]
    dist = math.sqrt(dx*dx + dy*dy) or 1
    nx, ny = dx/dist, dy/dist
    handle_base = (int(tip_x - nx * handle_len), int(tip_y - ny * handle_len))
    draw.line([handle_base, (tip_x, tip_y)], fill=CHISEL_WOOD, width=3)

    # Chisel blade (metal, narrower, at tip)
    blade_len = 5
    blade_base = (int(tip_x - nx * blade_len), int(tip_y - ny * blade_len))
    draw.line([blade_base, (tip_x, tip_y)], fill=CHISEL_METAL, width=2)

    # Chisel tip glint
    draw.ellipse([(tip_x - 2, tip_y - 2), (tip_x + 2, tip_y + 2)], fill=CHISEL_METAL)

    # Red impact flash when chisel strikes
    if red_flash > 0.5:
        flash_img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        fdraw = ImageDraw.Draw(flash_img)
        intensity = int((red_flash - 0.5) * 2 * 120)
        fdraw.ellipse([(tip_x - 6, tip_y - 6), (tip_x + 6, tip_y + 6)],
                      fill=(220, 30, 20, intensity))
        img = Image.alpha_composite(img, flash_img)

    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    def add(phase, seed, raise_t, red_flash, clean, dur):
        frames.append(make_frame(phase, seed, raise_t, red_flash, clean))
        durations.append(dur)

    # Phase 1: idle — code scrolling on dirty screen, chisel on desk (3 frames)
    add("idle", 0, 0.0, 0.0, False, 140)
    add("idle", 1, 0.0, 0.0, False, 140)
    add("idle", 2, 0.0, 0.0, False, 140)

    # Phase 2: chisel raises (4 frames)
    for i in range(4):
        t = (i + 1) / 4
        add("raise", 3 + i % 2, t, 0.0, False, 70)

    # Phase 3: hold raised — 1 frame
    add("hold", 5, 1.0, 0.0, False, 120)

    # Phase 4: strike DOWN — 2 frames fast
    add("strike1", 6, 0.6, 0.4, False, 40)
    add("strike2", 7, 0.1, 1.0, False, 40)

    # Phase 5: IMPACT — red flash, screen shows violation Xs (2 frames hold)
    add("impact", 0, 0.0, 1.0, False, 180)
    add("impact", 0, 0.0, 0.85, False, 100)

    # Phase 6: screen transforms to clean code, flash fades (3 frames)
    add("clean1", 1, 0.0, 0.5, True, 80)
    add("clean2", 2, 0.0, 0.2, True, 80)
    add("clean3", 3, 0.0, 0.0, True, 80)

    # Phase 7: hold clean screen (2 frames)
    add("hold_clean", 4, 0.0, 0.0, True, 160)
    add("hold_clean", 5, 0.0, 0.0, True, 160)

    # Phase 8: screen reverts to dirty — loop (2 frames)
    add("revert1", 6, 0.0, 0.0, False, 100)
    add("revert2", 7, 0.0, 0.0, False, 100)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/uncle-bob_a.gif"
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
