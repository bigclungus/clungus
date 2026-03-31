#!/usr/bin/env python3
"""
The Kid — Avatar Option B: FREEZE FRAME / IMPACT
The opposite extreme. Not blur — hyper-crisp stopped-clock moment.
Deep electric blue/cyan on black. A figure caught at maximum velocity
in a single frozen instant, like a high-speed camera catching a bullet.
Shockwave rings ripple out from the impact point. Everything is perfectly
still except the shockwaves slowly expanding and fading — the silence
after the explosion. The Kid was here, and the universe is still catching up.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# Palette
BG           = (4, 6, 16, 255)       # deep near-black blue
BODY_CORE    = (0, 220, 255, 255)    # electric cyan body
BODY_MID     = (0, 160, 220, 255)    # mid cyan
BODY_DARK    = (0, 80, 140, 255)     # shadow side
IMPACT_WHITE = (200, 240, 255, 255)  # impact point bright white-blue
SHOCK_BRIGHT = (0, 200, 255, 220)    # shockwave ring bright
SHOCK_MID    = (0, 120, 200, 140)    # shockwave mid
SHOCK_FAINT  = (0, 60, 140, 60)      # shockwave outer
CRACK_COL    = (0, 240, 255, 180)    # impact crack lines
SHADOW       = (0, 20, 60, 255)      # figure shadow/contact
GROUND_COL   = (0, 30, 80, 255)      # ground plane
GHOST        = (0, 80, 160, 40)      # faint ghost silhouette (shadow of prior position)


def draw_figure_frozen(draw, cx, cy):
    """
    The Kid frozen mid-stride at maximum velocity.
    Front foot planted hard (impact), body leaned forward aggressively,
    trailing leg kicked back. Arms pumping. Head forward.
    Drawn with crisp isometric-ish lines — no blur, hyper-detail.
    """
    # Shadow/ghost of prior position (slightly left, very faint)
    ghost_offset = -7
    # Ghost head
    draw.ellipse([(cx + ghost_offset - 3, cy - 15),
                  (cx + ghost_offset + 3, cy - 10)],
                 fill=GHOST)
    # Ghost torso
    draw.line([(cx + ghost_offset, cy - 10),
               (cx + ghost_offset, cy - 3)],
              fill=GHOST, width=2)

    # Impact shatter mark on ground where front foot hit
    impact_x = cx + 5
    impact_y = cy + 4
    # Small starburst
    for angle in range(0, 360, 45):
        rad = math.radians(angle)
        ex = int(impact_x + 4 * math.cos(rad))
        ey = int(impact_y + 2 * math.sin(rad) * 0.5)  # flattened to ground
        draw.line([(impact_x, impact_y), (ex, ey)],
                  fill=(*CRACK_COL[:3], 160), width=1)

    # Ground contact shadow (ellipse under foot)
    draw.ellipse([(impact_x - 4, impact_y - 1),
                  (impact_x + 4, impact_y + 2)],
                 fill=(*SHADOW[:3], 100))

    # === Figure ===
    # Head — crisp, slightly forward-tilted
    draw.ellipse([(cx - 3, cy - 15), (cx + 3, cy - 10)], fill=BODY_CORE)
    # Head highlight
    draw.ellipse([(cx - 1, cy - 14), (cx + 1, cy - 12)], fill=IMPACT_WHITE)

    # Neck
    draw.line([(cx, cy - 10), (cx, cy - 9)], fill=BODY_MID, width=2)

    # Torso — leaning forward (angled)
    draw.line([(cx, cy - 9), (cx + 2, cy - 3)], fill=BODY_CORE, width=3)
    # Torso side shadow
    draw.line([(cx + 1, cy - 9), (cx + 3, cy - 3)], fill=BODY_DARK, width=1)

    # Front arm — pumped forward and up (right arm)
    draw.line([(cx + 1, cy - 7), (cx + 7, cy - 11)], fill=BODY_CORE, width=2)
    draw.line([(cx + 7, cy - 11), (cx + 9, cy - 8)], fill=BODY_MID, width=2)

    # Back arm — driven back (left arm)
    draw.line([(cx + 1, cy - 7), (cx - 5, cy - 4)], fill=BODY_MID, width=2)
    draw.line([(cx - 5, cy - 4), (cx - 7, cy - 7)], fill=BODY_DARK, width=2)

    # Front leg — planted forward, bent knee, foot impact
    draw.line([(cx + 2, cy - 3), (cx + 4, cy + 1)], fill=BODY_CORE, width=3)
    draw.line([(cx + 4, cy + 1), (cx + 5, cy + 4)], fill=BODY_CORE, width=2)
    # Front foot
    draw.line([(cx + 3, cy + 4), (cx + 8, cy + 4)], fill=BODY_CORE, width=2)

    # Back leg — kicked back high
    draw.line([(cx + 2, cy - 3), (cx - 3, cy + 0)], fill=BODY_MID, width=3)
    draw.line([(cx - 3, cy + 0), (cx - 6, cy - 4)], fill=BODY_MID, width=2)
    # Back foot
    draw.line([(cx - 8, cy - 4), (cx - 5, cy - 4)], fill=BODY_DARK, width=2)

    # Tiny speed number "1" on chest (like a race bib) — optional detail
    draw.point([(cx + 2, cy - 6)], fill=IMPACT_WHITE)


def draw_shockwave_ring(draw, cx, cy, radius, alpha_frac):
    """Draw one shockwave ring at given radius, alpha_frac 0..1."""
    if radius <= 0:
        return
    # Flatten vertically (ground-plane perspective)
    ry = max(1, int(radius * 0.45))
    rx = radius

    # Draw ring as series of points on ellipse perimeter
    circumference = 2 * math.pi * ((rx + ry) / 2)
    steps = max(32, int(circumference * 2))

    alpha_bright = int(SHOCK_BRIGHT[3] * alpha_frac)
    alpha_mid = int(SHOCK_MID[3] * alpha_frac)
    alpha_faint = int(SHOCK_FAINT[3] * alpha_frac)

    for i in range(steps):
        angle = 2 * math.pi * i / steps
        px = int(cx + rx * math.cos(angle))
        py = int(cy + ry * math.sin(angle))
        if 0 <= px < W and 0 <= py < H:
            # Inner edge bright, outer edge fades
            draw.point([(px, py)], fill=(*SHOCK_BRIGHT[:3], alpha_bright))

    # Slightly larger ring for mid fade
    if rx > 2:
        for i in range(steps):
            angle = 2 * math.pi * i / steps
            px = int(cx + (rx + 1) * math.cos(angle))
            py = int(cy + (ry + 1) * math.sin(angle))
            if 0 <= px < W and 0 <= py < H:
                draw.point([(px, py)], fill=(*SHOCK_MID[:3], alpha_mid))


def make_frame(shock_phase):
    """
    shock_phase: 0.0..1.0 — shockwave expansion progress
    0 = rings tight around impact, 1 = rings fully expanded and gone
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Ground plane — faint horizontal gradient lines
    for gy in range(44, 56):
        fade = max(0, 1.0 - (gy - 44) / 12)
        alpha = int(60 * fade)
        draw.line([(0, gy), (W - 1, gy)],
                  fill=(*GROUND_COL[:3], alpha), width=1)

    # Impact center (front foot contact point)
    impact_cx = 35
    impact_cy = 44

    # Draw shockwave rings (3 rings, offset in phase)
    ring_offsets = [0.0, 0.2, 0.4]
    for offset in ring_offsets:
        ring_phase = max(0, min(1, shock_phase - offset))
        if ring_phase <= 0:
            continue
        # Radius expands from 2 to 28
        radius = int(2 + ring_phase * 26)
        # Alpha: fades out as ring expands
        alpha_frac = max(0, 1.0 - ring_phase ** 0.8)
        draw_shockwave_ring(draw, impact_cx, impact_cy, radius, alpha_frac)

    # Impact point — bright core (always visible, dims slightly at end)
    core_alpha = int(255 * max(0.3, 1.0 - shock_phase * 0.5))
    draw.ellipse([(impact_cx - 2, impact_cy - 1),
                  (impact_cx + 2, impact_cy + 1)],
                 fill=(*IMPACT_WHITE[:3], core_alpha))

    # The figure — always crisp, frozen, no animation
    # Centered in frame, figure impact point at (35, 44)
    fig_cx = 30
    fig_cy = 40
    draw_figure_frozen(draw, fig_cx, fig_cy)

    # Speed text "1" bib remnant — small bright pixel cluster on torso
    # (already drawn in figure)

    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    # Phase 1: impact moment — rings tight, expanding fast — 4 frames
    for i in range(4):
        t = (i / 3) * 0.35  # shock_phase 0..0.35
        frames.append(make_frame(t))
        durations.append(50)

    # Phase 2: rings mid-expand — 4 frames
    for i in range(4):
        t = 0.35 + (i / 3) * 0.4  # 0.35..0.75
        frames.append(make_frame(t))
        durations.append(70)

    # Phase 3: rings fading out — 3 frames
    for i in range(3):
        t = 0.75 + (i / 2) * 0.25  # 0.75..1.0
        frames.append(make_frame(t))
        durations.append(90)

    # Phase 4: hold still — figure frozen, rings gone — 4 frames (long pause)
    for i in range(4):
        frames.append(make_frame(1.0))
        durations.append(200)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/the-kid_b.gif"
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
