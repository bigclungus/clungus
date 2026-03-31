#!/usr/bin/env python3
"""
Galactus — Avatar Option B: "The Circuit Verdict"

Visual concept: Galactus rendered as pure overwhelming geometry — not a
humanoid figure but the raw mathematical fact of him. A massive blazing
core polygon at center, surrounded by 3 concentric rings of orbiting
planetary bodies. Each ring spins at a different rate. Planets appear at
the outer ring, drift inward through the rings, and vanish when absorbed
by the core — which flares white on each absorption.

Colors: pure black void, electric blue rings, the core is white-hot that
cycles through gold and blinding white. Planets are dim colored dots,
grey-dead after passing the first ring.

The aesthetic: a circuit board that ate a solar system.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# Palette
BG           = (0,   0,   0,   255)   # pure void black
RING_BASE    = (20,  60,  140, 255)   # electric blue ring base
RING_MID     = (40,  100, 200, 255)   # mid ring
RING_BRIGHT  = (80,  160, 255, 255)   # bright ring
CORE_COLD    = (100, 180, 255, 255)   # core cold state
CORE_HOT     = (255, 240, 120, 255)   # core hot (absorption flash)
CORE_WHITE   = (255, 255, 255, 255)   # core peak white
PLANET_ALIVE = [(100, 160, 255, 255), # blue
                (180, 100, 255, 255), # purple
                (60,  200, 140, 255), # teal
                (255, 140,  60, 255)] # orange
PLANET_DEAD  = (40,  40,   45, 255)   # dead grey
RING_TICK    = (0,   200, 255, 255)   # ring tick mark / node
GLYPH_COL    = (30,  80,  160, 255)   # background circuit glyph


def draw_circuit_bg(draw):
    """Faint circuit-board grid pattern in background."""
    # Horizontal rails
    for y in [16, 32, 48]:
        draw.line([(0, y), (W, y)], fill=(*GLYPH_COL[:3], 30), width=1)
    # Vertical rails
    for x in [16, 32, 48]:
        draw.line([(x, 0), (x, H)], fill=(*GLYPH_COL[:3], 30), width=1)
    # Nodes at intersections
    for x in [16, 32, 48]:
        for y in [16, 32, 48]:
            draw.ellipse([(x - 1, y - 1), (x + 1, y + 1)],
                         fill=(*GLYPH_COL[:3], 50))


def draw_ring(draw, cx, cy, radius, alpha, tick_angle_deg):
    """Draw a single orbital ring with a moving tick mark."""
    # Ring as a series of points
    pts = 60
    for i in range(pts):
        a = 2 * math.pi * i / pts
        x = cx + radius * math.cos(a)
        y = cy + radius * math.sin(a)
        draw.point((int(x), int(y)), fill=(*RING_BASE[:3], alpha))

    # Thicker arcs at cardinal points
    for base_a in [0, math.pi / 2, math.pi, 3 * math.pi / 2]:
        for da in [-0.08, 0, 0.08]:
            a = base_a + da
            x = cx + radius * math.cos(a)
            y = cy + radius * math.sin(a)
            draw.point((int(x), int(y)), fill=(*RING_BRIGHT[:3], alpha))

    # Moving tick mark (brighter dot)
    tick_rad = math.radians(tick_angle_deg)
    tx = cx + radius * math.cos(tick_rad)
    ty = cy + radius * math.sin(tick_rad)
    draw.ellipse([(int(tx) - 1, int(ty) - 1), (int(tx) + 1, int(ty) + 1)],
                 fill=(*RING_TICK[:3], min(255, alpha + 80)))


def draw_core(draw, cx, cy, heat_t):
    """
    Draw the central consuming core polygon.
    heat_t: 0 = cold blue, 1 = white-hot (absorption event)
    """
    # Hexagonal core shape
    r_outer = 6
    r_inner = 3

    # Interpolate color
    if heat_t < 0.5:
        t = heat_t * 2
        r = int(CORE_COLD[0] + (CORE_HOT[0] - CORE_COLD[0]) * t)
        g = int(CORE_COLD[1] + (CORE_HOT[1] - CORE_COLD[1]) * t)
        b = int(CORE_COLD[2] + (CORE_HOT[2] - CORE_COLD[2]) * t)
    else:
        t = (heat_t - 0.5) * 2
        r = int(CORE_HOT[0] + (CORE_WHITE[0] - CORE_HOT[0]) * t)
        g = int(CORE_HOT[1] + (CORE_WHITE[1] - CORE_HOT[1]) * t)
        b = int(CORE_HOT[2] + (CORE_WHITE[2] - CORE_HOT[2]) * t)
    core_col = (r, g, b, 255)

    # Outer hexagon
    hex_pts = []
    for i in range(6):
        a = math.pi / 6 + i * math.pi / 3
        hex_pts.append((int(cx + r_outer * math.cos(a)),
                        int(cy + r_outer * math.sin(a))))
    draw.polygon(hex_pts, fill=core_col)

    # Inner bright core
    inner_r = int(r_inner + heat_t * 2)
    draw.ellipse([(cx - inner_r, cy - inner_r), (cx + inner_r, cy + inner_r)],
                 fill=CORE_WHITE)

    # Outer glow
    glow_r = r_outer + 2 + int(heat_t * 4)
    glow_alpha = int(80 + heat_t * 120)
    draw.ellipse([(cx - glow_r, cy - glow_r), (cx + glow_r, cy + glow_r)],
                 outline=(*core_col[:3], glow_alpha), width=1)

    # Spike lines radiating out at peak
    if heat_t > 0.6:
        spike_alpha = int((heat_t - 0.6) / 0.4 * 200)
        spike_len = int(4 + heat_t * 6)
        for i in range(8):
            sa = i * math.pi / 4
            sx = int(cx + spike_len * math.cos(sa))
            sy = int(cy + spike_len * math.sin(sa))
            draw.line([(cx, cy), (sx, sy)], fill=(*CORE_WHITE[:3], spike_alpha), width=1)


def place_planets(frame_idx, total_frames):
    """
    Return a list of planet specs: (x, y, radius, color, is_dead).
    Planets orbit at outer ring (r=24), drift inward over time,
    and disappear when they reach the core (r<8).
    4 planets per ring, 3 rings, staggered in phase.
    """
    planets = []
    cx, cy = 32, 32
    # Outer ring: 4 planets, full color
    for i in range(4):
        phase = (frame_idx / total_frames + i / 4) % 1.0
        a = phase * 2 * math.pi
        x = cx + 24 * math.cos(a)
        y = cy + 24 * math.sin(a)
        col = PLANET_ALIVE[i % len(PLANET_ALIVE)]
        planets.append((int(x), int(y), 2, col, False))

    # Mid ring: 4 planets, slightly dead
    for i in range(4):
        phase = (frame_idx / total_frames * 1.4 + i / 4 + 0.125) % 1.0
        a = phase * 2 * math.pi
        x = cx + 15 * math.cos(a)
        y = cy + 15 * math.sin(a)
        # Halfway to dead
        alive_col = PLANET_ALIVE[i % len(PLANET_ALIVE)]
        col = (
            int(alive_col[0] * 0.5 + PLANET_DEAD[0] * 0.5),
            int(alive_col[1] * 0.5 + PLANET_DEAD[1] * 0.5),
            int(alive_col[2] * 0.5 + PLANET_DEAD[2] * 0.5),
            255
        )
        planets.append((int(x), int(y), 1, col, True))

    # Inner ring: 3 planets, fully dead/grey
    for i in range(3):
        phase = (frame_idx / total_frames * 2.1 + i / 3 + 0.25) % 1.0
        a = phase * 2 * math.pi
        x = cx + 10 * math.cos(a)
        y = cy + 10 * math.sin(a)
        planets.append((int(x), int(y), 1, PLANET_DEAD, True))

    return planets


def make_frame(frame_idx, total_frames, heat_t):
    """
    frame_idx: 0..total_frames-1
    heat_t: core heat level this frame (0..1)
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    cx, cy = 32, 32
    t = frame_idx / total_frames

    # Background circuit grid
    draw_circuit_bg(draw)

    # Faint star field
    import random
    rng = random.Random(99)
    for _ in range(12):
        sx = rng.randint(0, W - 1)
        sy = rng.randint(0, H - 1)
        # Skip center area
        if abs(sx - cx) < 28 and abs(sy - cy) < 28:
            continue
        sa = rng.randint(40, 120)
        draw.point((sx, sy), fill=(sa, sa, sa + 30, 255))

    # Three orbital rings, different speeds
    tick_a_outer = (t * 360 * 0.8) % 360
    tick_a_mid   = (t * 360 * 1.3 + 45) % 360
    tick_a_inner = (t * 360 * 2.2 + 90) % 360

    draw_ring(draw, cx, cy, 24, 100, tick_a_outer)  # outer
    draw_ring(draw, cx, cy, 15, 130, tick_a_mid)    # mid
    draw_ring(draw, cx, cy, 10, 160, tick_a_inner)  # inner

    # Planets
    planets = place_planets(frame_idx, total_frames)
    for (px, py, pr, col, is_dead) in planets:
        draw.ellipse([(px - pr, py - pr), (px + pr, py + pr)], fill=col)

    # Core (drawn last so it's on top)
    draw_core(draw, cx, cy, heat_t)

    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    total = 20
    # Heat pulses: spike every 5 frames (absorption events)
    heat_schedule = []
    for i in range(total):
        # Pulse at i=5, 10, 15 — different intensities
        dist_to_pulse = min(
            abs(i - 5), abs(i - 10), abs(i - 15),
            abs(i - 5 - total), abs(i - 10 - total),
        )
        heat = max(0.0, 1.0 - dist_to_pulse * 0.5)
        heat_schedule.append(heat)

    for i in range(total):
        frame = make_frame(i, total, heat_schedule[i])
        frames.append(frame)
        # Slightly slower on flash frames
        dur = 90 if heat_schedule[i] > 0.7 else 70
        durations.append(dur)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/galactus_b.gif"
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
