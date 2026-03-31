#!/usr/bin/env python3
"""
Chaz the Destroyer — pixel art skater dude avatar.
Santa Monica anarchist: shaggy hair, baggy pants, skate shoes, board.
Chill idle animation — slight bob, kick-push cycle.
Color vibe: sun-bleached, faded denim, warm asphalt.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# Palette — sun-bleached Santa Monica vibes
BG          = (28, 26, 24, 255)    # warm near-black asphalt
SKIN        = (210, 170, 130, 255) # sun-tanned skin
HAIR        = (60, 45, 25, 255)    # dark shaggy hair
HAIR_LIGHT  = (90, 68, 38, 255)    # hair highlight
SHIRT       = (180, 60, 40, 255)   # faded red tee (RHCP energy)
SHIRT_DARK  = (130, 40, 25, 255)   # shirt shadow
PANTS       = (100, 115, 145, 255) # faded denim baggy pants
PANTS_DARK  = (70, 82, 105, 255)   # pants shadow
SHOE        = (220, 210, 195, 255) # beat-up skate shoe (off-white)
SHOE_SOLE   = (50, 45, 40, 255)    # dark rubber sole
BOARD_TOP   = (190, 155, 90, 255)  # maple deck
BOARD_GRIP  = (40, 40, 40, 255)    # grip tape (near-black)
BOARD_WHEEL = (240, 230, 210, 255) # urethane wheels
GROUND      = (55, 52, 48, 255)    # warm asphalt line
GROUND_DIM  = (42, 40, 37, 255)    # faint ground
SHADOW      = (20, 18, 16, 180)    # drop shadow


def draw_board(draw, bx, by, tilt=0):
    """Draw skateboard. bx/by = center bottom of board. tilt = y-offset for nose."""
    # Board deck (tapered rectangle, slightly tilted)
    nose_lift = tilt
    tail_drop = -tilt // 2

    # Deck top (grip tape side)
    pts = [
        (bx - 18, by + tail_drop),
        (bx + 18, by + nose_lift),
        (bx + 18, by + nose_lift + 3),
        (bx - 18, by + tail_drop + 3),
    ]
    draw.polygon(pts, fill=BOARD_GRIP)

    # Maple edge (thin strip below grip)
    pts2 = [
        (bx - 18, by + tail_drop + 3),
        (bx + 18, by + nose_lift + 3),
        (bx + 16, by + nose_lift + 5),
        (bx - 16, by + tail_drop + 5),
    ]
    draw.polygon(pts2, fill=BOARD_TOP)

    # Wheels (4 dots)
    for wx, wy_off in [(-12, tail_drop), (12, nose_lift)]:
        cx = bx + wx
        cy = by + wy_off + 5
        draw.ellipse([(cx - 3, cy - 2), (cx + 3, cy + 2)], fill=BOARD_WHEEL)
        draw.ellipse([(cx - 2, cy - 1), (cx + 2, cy + 1)], fill=(200, 190, 175, 255))


def draw_skater(draw, cx, cy, bob=0, kick=0):
    """
    Draw Chaz.
    cx/cy = feet position (bottom center of figure).
    bob = vertical offset for idle bounce (0-2 pixels up).
    kick = 0-1 push-off phase (back leg extends).
    """
    # All positions relative to feet
    y = cy - bob

    # === SHOES ===
    # Left shoe
    draw.rectangle([(cx - 10, y - 5), (cx - 4, y)], fill=SHOE)
    draw.rectangle([(cx - 10, y - 2), (cx - 4, y + 1)], fill=SHOE_SOLE)
    # Right shoe
    shoe_rx = cx + int(3 + kick * 4)
    draw.rectangle([(shoe_rx, y - 5), (shoe_rx + 6, y)], fill=SHOE)
    draw.rectangle([(shoe_rx, y - 2), (shoe_rx + 6, y + 1)], fill=SHOE_SOLE)

    # === BAGGY PANTS ===
    # Left leg — wider at bottom (baggy)
    draw.polygon([
        (cx - 11, y - 5),
        (cx - 3, y - 5),
        (cx - 2, y - 18),
        (cx - 9, y - 18),
    ], fill=PANTS)
    draw.line([(cx - 9, y - 18), (cx - 2, y - 18)], fill=PANTS_DARK, width=1)

    # Right leg
    rl_x = cx + int(2 + kick * 4)
    draw.polygon([
        (rl_x, y - 5),
        (rl_x + 7, y - 5),
        (rl_x + 6 + int(kick * 2), y - 18),
        (rl_x + 1, y - 18),
    ], fill=PANTS)
    draw.line([(rl_x + 1, y - 18), (rl_x + 6 + int(kick * 2), y - 18)], fill=PANTS_DARK, width=1)

    # Waistband
    draw.rectangle([(cx - 9, y - 20), (cx + 9 + int(kick), y - 18)], fill=PANTS_DARK)

    # === SHIRT (oversized tee) ===
    # Body
    draw.rectangle([(cx - 8, y - 32), (cx + 8, y - 20)], fill=SHIRT)
    draw.rectangle([(cx - 8, y - 32), (cx - 6, y - 20)], fill=SHIRT_DARK)  # left shadow

    # Left arm (relaxed, slightly out)
    draw.line([(cx - 8, y - 30), (cx - 12, y - 22)], fill=SHIRT, width=4)
    # Right arm (relaxed or slightly raised)
    arm_angle = int(kick * 3)
    draw.line([(cx + 8, y - 30), (cx + 12, y - 24 + arm_angle)], fill=SHIRT, width=4)

    # Forearms / hands (skin)
    draw.line([(cx - 12, y - 22), (cx - 13, y - 16)], fill=SKIN, width=3)
    draw.line([(cx + 12, y - 24 + arm_angle), (cx + 13, y - 18 + arm_angle)], fill=SKIN, width=3)

    # === NECK ===
    draw.rectangle([(cx - 2, y - 35), (cx + 2, y - 32)], fill=SKIN)

    # === HEAD ===
    # Head shape
    draw.ellipse([(cx - 6, y - 45), (cx + 6, y - 35)], fill=SKIN)

    # Eyes (small dots)
    draw.point([(cx - 3, y - 41)], fill=(40, 30, 20, 255))
    draw.point([(cx + 2, y - 41)], fill=(40, 30, 20, 255))

    # Mouth — slight smirk
    draw.line([(cx - 1, y - 37), (cx + 2, y - 38)], fill=(160, 100, 80, 255), width=1)

    # === SHAGGY HAIR ===
    # Main hair mass (dark)
    draw.ellipse([(cx - 7, y - 47), (cx + 7, y - 38)], fill=HAIR)
    # Shaggy bits — irregular spikes/chunks
    draw.polygon([
        (cx - 7, y - 43),
        (cx - 10, y - 46),
        (cx - 6, y - 44),
    ], fill=HAIR)
    draw.polygon([
        (cx + 5, y - 43),
        (cx + 10, y - 46),
        (cx + 7, y - 44),
    ], fill=HAIR)
    draw.polygon([
        (cx - 2, y - 47),
        (cx + 1, y - 50),
        (cx + 3, y - 47),
    ], fill=HAIR)
    draw.polygon([
        (cx - 5, y - 46),
        (cx - 3, y - 50),
        (cx - 1, y - 46),
    ], fill=HAIR_LIGHT)
    # Hair hanging over forehead
    draw.polygon([
        (cx - 5, y - 41),
        (cx - 8, y - 44),
        (cx - 4, y - 42),
    ], fill=HAIR)
    draw.line([(cx - 1, y - 46), (cx + 3, y - 44)], fill=HAIR_LIGHT, width=1)


def draw_shadow(draw, cx, ground_y, width=16):
    """Elliptical drop shadow on the ground."""
    draw.ellipse([
        (cx - width, ground_y - 2),
        (cx + width, ground_y + 2),
    ], fill=SHADOW)


def draw_ground(draw):
    """Warm asphalt ground line with subtle texture."""
    gy = 52
    draw.line([(0, gy), (W - 1, gy)], fill=GROUND, width=2)
    for x in range(0, W, 6):
        draw.point([(x, gy + 1)], fill=GROUND_DIM)
    for x in range(3, W, 8):
        draw.point([(x, gy - 1)], fill=GROUND_DIM)


def make_frame(phase):
    """
    phase: 0.0..1.0 — full idle cycle.
    Slight bob up/down, occasional kick push.
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    draw_ground(draw)

    # Idle bob — gentle sine
    bob = int(1.5 * math.sin(phase * 2 * math.pi) + 1.5)
    # Kick push — happens once per cycle around phase 0.6-0.8
    kick_raw = max(0.0, math.sin(max(0, (phase - 0.6) / 0.2) * math.pi)) if phase > 0.6 else 0.0
    kick = kick_raw if phase < 0.8 else 0.0

    # Ground y for feet
    ground_y = 51
    cx = 32

    # Board sits on ground, tilts slightly during kick
    board_tilt = int(kick * 2)
    draw_board(draw, cx, ground_y - 1, tilt=board_tilt)

    # Shadow
    draw_shadow(draw, cx, ground_y + 1, width=int(14 - bob))

    # Skater stands on board
    draw_skater(draw, cx, ground_y - 5, bob=bob, kick=kick)

    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    # 16 frames for a smooth idle cycle
    n = 16
    for i in range(n):
        t = i / n
        frames.append(make_frame(t))
        # Slow, chill timing — 80ms base, linger at top of bob
        if 0.2 <= t <= 0.35:
            durations.append(100)  # linger at top
        else:
            durations.append(80)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/chaz.gif"
    frames, durations = build_frames()

    palettes = [f.quantize(colors=128, method=Image.Quantize.FASTOCTREE) for f in frames]

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
