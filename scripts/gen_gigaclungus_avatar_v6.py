#!/usr/bin/env python3
"""
GigaClungus — Avatar V6
"The Void Rabbit"

Near-total darkness. GigaClungus rendered almost entirely as a silhouette
against a deep space void. Only two things are visible: the glowing red
eyes and the faint outline of his enormous form pressing against the
frame edges. He does not chew. He does not blink. He simply radiates.

The ears are just faint shapes. The jowls are barely suggested. The body
is a dark mass that consumes light. But the eyes — twin points of cold
red — pulse with slow, menacing regularity.

A single frame of ominous red aura light bleeds out from the eyes at peak
intensity, briefly catching the ridge of the nose and cheekbones.

Palette: deep space black, near-invisible dark indigo silhouette,
crimson-to-deep-red glowing eyes, faint violet edge-light.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# --- Palette ---
BG            = (5, 3, 8, 255)          # deep space black
SILHOUETTE    = (18, 12, 22, 255)       # near-invisible dark indigo body
SILHOUETTE_EDGE = (30, 20, 38, 255)     # slightly lighter edge
SHADOW_DEEP   = (12, 8, 16, 255)        # deep body shadow
EAR_HINT      = (25, 16, 30, 255)       # barely visible ear
JOWL_HINT     = (22, 14, 28, 255)       # barely visible jowl edge
EYE_SOCKET    = (8, 4, 8, 255)          # absolute dark socket
EYE_GLOW_DIM  = (100, 10, 10, 255)      # dimmed red eye
EYE_GLOW_MID  = (180, 20, 20, 255)      # mid-glow red
EYE_GLOW_HOT  = (230, 40, 20, 255)      # peak-glow hot orange-red
EYE_GLOW_CORE = (255, 200, 180, 255)    # bright core at peak
EYE_AURA_DIM  = (40, 5, 5, 255)         # dim eye aura
EYE_AURA_HOT  = (80, 12, 8, 255)        # peak eye aura bleed
FACE_LIT_PEAK = (50, 20, 18, 255)       # face barely lit at peak glow
NOSE_HINT     = (35, 14, 14, 255)       # faint nose suggestion at peak
OUTLINE_FAINT = (28, 18, 35, 255)       # faint violet body outline


def draw_silhouette(draw):
    """
    GigaClungus as a dark mass. Almost invisible. Barely there.
    Just enough to know something enormous is watching.
    """
    # Massive body — barely visible dark shape
    draw.ellipse([(0, 30), (64, 70)], fill=SHADOW_DEEP)
    draw.ellipse([(1, 31), (63, 68)], fill=SILHOUETTE)

    # Body edge highlight (extremely subtle violet)
    draw.arc([(0, 30), (64, 70)], start=200, end=340, fill=OUTLINE_FAINT, width=1)

    # Arms (dark blobs)
    draw.ellipse([(0, 39), (12, 53)], fill=SHADOW_DEEP)
    draw.ellipse([(52, 39), (64, 53)], fill=SHADOW_DEEP)

    # Head — a dark dome
    draw.ellipse([(3, 6), (61, 44)], fill=SHADOW_DEEP)
    draw.ellipse([(4, 7), (60, 43)], fill=SILHOUETTE)
    # Very faint head edge
    draw.arc([(3, 6), (61, 44)], start=180, end=360, fill=OUTLINE_FAINT, width=1)

    # Left jowl — dark mass suggestion
    draw.ellipse([(0, 20), (22, 43)], fill=SHADOW_DEEP)
    draw.ellipse([(1, 21), (20, 42)], fill=SILHOUETTE)
    draw.arc([(0, 20), (22, 43)], start=200, end=340, fill=JOWL_HINT, width=1)

    # Right jowl
    draw.ellipse([(42, 20), (64, 43)], fill=SHADOW_DEEP)
    draw.ellipse([(44, 21), (63, 42)], fill=SILHOUETTE)
    draw.arc([(42, 20), (64, 43)], start=200, end=340, fill=JOWL_HINT, width=1)

    # Left ear — barely visible smudge
    draw.ellipse([(8, 0), (20, 14)], fill=SHADOW_DEEP)
    draw.ellipse([(9, 0), (19, 12)], fill=SILHOUETTE_EDGE)

    # Right ear
    draw.ellipse([(44, 0), (56, 14)], fill=SHADOW_DEEP)
    draw.ellipse([(45, 0), (55, 12)], fill=SILHOUETTE_EDGE)

    # Base shadow — he presses down
    draw.ellipse([(8, 60), (56, 72)], fill=SHADOW_DEEP)


def draw_eyes(draw, glow_t):
    """
    The only real light source. Twin glowing red eyes.
    glow_t: 0.0 = dim, 1.0 = peak
    """
    def lerp_color(c1, c2, t):
        return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)

    # Eye centers
    lx, ly = 20, 22
    rx, ry = 44, 22

    # Glow aura (outer halo — bleeds into surrounding face)
    if glow_t > 0.0:
        aura_color = lerp_color(EYE_AURA_DIM, EYE_AURA_HOT, glow_t)
        aura_r = int(3 + glow_t * 5)
        # Left aura
        draw.ellipse([(lx - aura_r, ly - aura_r), (lx + aura_r, ly + aura_r)],
                     fill=aura_color)
        # Right aura
        draw.ellipse([(rx - aura_r, ry - aura_r), (rx + aura_r, ry + aura_r)],
                     fill=aura_color)

        # At peak glow, faintly light the nose ridge and cheekbones
        if glow_t > 0.75:
            face_t = (glow_t - 0.75) / 0.25
            face_lit = lerp_color((5, 3, 8, 255), FACE_LIT_PEAK, face_t)
            # Central face strip
            draw.rectangle([(28, 26), (36, 38)], fill=face_lit)
            # Nose hint
            draw.ellipse([(27, 30), (37, 36)], fill=lerp_color((5, 3, 8, 255), NOSE_HINT, face_t))

    # Eye socket darkness (over the aura, center stays dark before iris)
    draw.ellipse([(lx - 5, ly - 4), (lx + 5, ly + 4)], fill=EYE_SOCKET)
    draw.ellipse([(rx - 5, ry - 4), (rx + 5, ry + 4)], fill=EYE_SOCKET)

    # Iris glow — interpolate through dim -> mid -> hot
    if glow_t < 0.5:
        iris_color = lerp_color(EYE_GLOW_DIM, EYE_GLOW_MID, glow_t * 2)
    else:
        iris_color = lerp_color(EYE_GLOW_MID, EYE_GLOW_HOT, (glow_t - 0.5) * 2)

    # Iris
    iris_h = int(2 + glow_t * 3)
    iris_w = int(3 + glow_t * 2)
    draw.ellipse([(lx - iris_w, ly - iris_h), (lx + iris_w, ly + iris_h)], fill=iris_color)
    draw.ellipse([(rx - iris_w, ry - iris_h), (rx + iris_w, ry + iris_h)], fill=iris_color)

    # Core (bright center at peak)
    if glow_t > 0.6:
        core_t = (glow_t - 0.6) / 0.4
        core_r = max(1, int(core_t * 2))
        core_col = lerp_color(EYE_GLOW_HOT, EYE_GLOW_CORE, core_t)
        draw.ellipse([(lx - core_r, ly - core_r), (lx + core_r, ly + core_r)], fill=core_col)
        draw.ellipse([(rx - core_r, ry - core_r), (rx + core_r, ry + core_r)], fill=core_col)

    # Heavy eyelid shadow over top half of each eye (always there)
    eyelid_color = lerp_color(SILHOUETTE, (25, 15, 30, 255), 0.5)
    draw.rectangle([(lx - iris_w - 1, ly - iris_h - 2), (lx + iris_w + 1, ly)], fill=eyelid_color)
    draw.rectangle([(rx - iris_w - 1, ry - iris_h - 2), (rx + iris_w + 1, ry)], fill=eyelid_color)


def make_frame(glow_t):
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_silhouette(draw)
    draw_eyes(draw, glow_t)
    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    def add(glow_t, dur):
        frames.append(make_frame(glow_t))
        durations.append(dur)

    # Slow pulse — like a heartbeat but wrong
    # Phase 1: very dim hold (darkness)
    for _ in range(6):
        add(0.05, 150)

    # Phase 2: slow rise
    for t in [0.1, 0.2, 0.32, 0.46, 0.60, 0.74, 0.86, 0.95, 1.0]:
        add(t, 80)

    # Phase 3: peak hold
    for _ in range(3):
        add(1.0, 120)

    # Phase 4: slow fall
    for t in [0.95, 0.86, 0.74, 0.60, 0.46, 0.32, 0.2, 0.1, 0.05]:
        add(t, 80)

    # Phase 5: dark hold (longer — the silence between pulses)
    for _ in range(8):
        add(0.05, 150)

    # Phase 6: second pulse — slightly faster, more intense
    for t in [0.15, 0.35, 0.6, 0.85, 1.0]:
        add(t, 60)
    add(1.0, 100)
    add(1.0, 100)
    for t in [0.85, 0.6, 0.35, 0.15, 0.05]:
        add(t, 60)

    # Phase 7: long dark before loop
    for _ in range(7):
        add(0.05, 150)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/gigaclungus_v6.gif"
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
