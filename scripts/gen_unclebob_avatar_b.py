#!/usr/bin/env python3
"""
Uncle Bob — Avatar Option B: "The Cathedral"

Uncle Bob as high priest of clean code. He stands at a pulpit before an
arched stained-glass window depicting the Clean Architecture layers (concentric
rings: Entities, Use Cases, Interface Adapters, Frameworks). He holds the tome
"Clean Code" raised like scripture. A golden aura pulses around the book.
One hand points upward — righteous, unyielding.

Palette: deep nave blue/indigo, warm amber stained-glass, ivory/white robes,
gold accents, reverential. Animation: stained-glass rings glow in sequence
(inner to outer), then pulse together; the book aura breathes; a finger
points skyward then lowers.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# --- Palette ---
BG           = (12, 10, 22, 255)     # deep nave blue-black
WALL         = (18, 16, 34, 255)     # cathedral wall
ARCH_STONE   = (28, 26, 45, 255)     # arch stonework
ARCH_MORTAR  = (20, 18, 35, 255)     # mortar lines

# Stained glass rings (concentric Clean Architecture layers)
RING_ENTITY      = (220, 180,  30, 255)  # Entities — gold innermost
RING_USE_CASE    = (180, 100,  20, 255)  # Use Cases — amber
RING_ADAPTER     = ( 30, 120, 180, 255)  # Interface Adapters — blue
RING_FRAMEWORK   = ( 80,  40, 140, 255)  # Frameworks — violet outermost
RING_GLOW        = (255, 220,  80, 180)  # glow overlay

PULPIT_TOP   = (50, 45, 35, 255)     # lectern top face
PULPIT_FRONT = (35, 30, 22, 255)     # lectern front
PULPIT_SIDE  = (28, 24, 17, 255)     # lectern side

ROBE_MAIN    = (230, 228, 218, 255)  # white/ivory robe
ROBE_SHADOW  = (180, 175, 165, 255)  # robe shadow folds
SKIN         = (190, 160, 135, 255)  # aged skin
BEARD        = (215, 212, 205, 255)  # white beard
HAIR         = (100,  95,  90, 255)  # grey hair

BOOK_COVER   = ( 20,  40,  80, 255)  # "Clean Code" — dark blue cover
BOOK_PAGES   = (230, 225, 210, 255)  # cream pages
BOOK_TITLE   = (220, 180,  30, 255)  # gold lettering
BOOK_AURA    = (255, 220,  80, 150)  # book glow

ARM          = (230, 228, 218, 255)  # white robe sleeve
FINGER_SKIN  = (190, 160, 135, 255)  # pointing finger

EYE          = ( 60,  60,  80, 255)  # dark, serious eyes
MOUTH        = (160, 130, 110, 255)  # neutral line

CANDLE_FLAME = (255, 200,  40, 255)  # candle flame yellow
CANDLE_WAX   = (230, 225, 210, 255)  # candle body


def draw_arch_window(draw, cx, cy, radius_outer, glow_ring, aura_alpha):
    """
    Draw concentric stained-glass rings representing Clean Architecture.
    glow_ring: 0=entity, 1=usecase, 2=adapter, 3=framework — which ring is lit brightest
    aura_alpha: 0..255 global pulse intensity
    """
    rings = [
        (RING_FRAMEWORK,  radius_outer),
        (RING_ADAPTER,    int(radius_outer * 0.72)),
        (RING_USE_CASE,   int(radius_outer * 0.48)),
        (RING_ENTITY,     int(radius_outer * 0.26)),
    ]
    ring_names = [3, 2, 1, 0]  # outer to inner
    for i, (col, r) in enumerate(rings):
        ring_idx = ring_names[i]
        # Brighten the currently glowing ring
        if ring_idx == glow_ring:
            bright = min(255, col[0] + 50)
            bright_g = min(255, col[1] + 40)
            bright_b = min(255, col[2] + 30)
            draw_col = (bright, bright_g, bright_b, 255)
        else:
            dim = 0.5
            draw_col = (int(col[0] * dim), int(col[1] * dim), int(col[2] * dim), 255)
        draw.ellipse([(cx - r, cy - r), (cx + r, cy + r)], fill=draw_col)

    # Center cross / dividers (architectural lead lines)
    for ring_col, r in rings[:-1]:
        draw.ellipse([(cx - r + 1, cy - r + 1), (cx + r - 1, cy + r - 1)],
                     outline=ARCH_MORTAR, width=1)

    # Thin radial dividers
    for angle_deg in [0, 45, 90, 135]:
        angle_rad = math.radians(angle_deg)
        x1 = int(cx + radius_outer * math.cos(angle_rad))
        y1 = int(cy + radius_outer * math.sin(angle_rad))
        x2 = int(cx - radius_outer * math.cos(angle_rad))
        y2 = int(cy - radius_outer * math.sin(angle_rad))
        draw.line([(x1, y1), (x2, y2)], fill=ARCH_MORTAR, width=1)

    # Aura overlay when pulsing
    if aura_alpha > 0:
        aura_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        adraw = ImageDraw.Draw(aura_layer)
        r_a = int(radius_outer * 0.26)
        adraw.ellipse([(cx - r_a, cy - r_a), (cx + r_a, cy + r_a)],
                      fill=(*RING_GLOW[:3], aura_alpha))
        return aura_layer
    return None


def make_frame(glow_ring, aura_alpha, finger_raise, book_pulse):
    """
    glow_ring: 0..3 which stained glass ring is lit
    aura_alpha: 0..255 golden aura strength on window entity ring
    finger_raise: 0.0 (hand relaxed) → 1.0 (index finger pointing straight up)
    book_pulse: 0.0..1.0 golden aura around book
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # --- Cathedral wall background ---
    draw.rectangle([(0, 0), (W, H)], fill=WALL)

    # --- Arch stonework (pointed Gothic arch) ---
    # Draw arch as a series of rectangles/polygons suggesting an arched window niche
    draw.polygon([(20, 4), (44, 4), (50, 12), (50, 32), (14, 32), (14, 12)], fill=ARCH_STONE)
    # Arch opening (ellipse top)
    draw.ellipse([(20, 2), (44, 16)], fill=ARCH_STONE)

    # --- Stained glass window inside arch ---
    aura_layer = draw_arch_window(draw, cx=32, cy=18, radius_outer=12,
                                   glow_ring=glow_ring, aura_alpha=aura_alpha)

    # Pulpit / lectern
    # Top face
    draw.polygon([(16, 40), (48, 40), (48, 44), (16, 44)], fill=PULPIT_TOP)
    # Front face
    draw.polygon([(16, 44), (48, 44), (48, 52), (16, 52)], fill=PULPIT_FRONT)
    # Side face (right)
    draw.polygon([(48, 40), (52, 42), (52, 54), (48, 52)], fill=PULPIT_SIDE)

    # Candles on pulpit corners
    for cx_c in [19, 45]:
        draw.rectangle([(cx_c - 1, 36), (cx_c + 1, 40)], fill=CANDLE_WAX)
        draw.ellipse([(cx_c - 2, 33), (cx_c + 2, 37)], fill=CANDLE_FLAME)

    # --- Body / robes ---
    # Wide flowing robe, standing figure
    # Main robe body
    draw.polygon([(18, 52), (46, 52), (42, 34), (22, 34)], fill=ROBE_MAIN)
    # Robe fold shadows
    draw.polygon([(22, 52), (26, 52), (24, 34), (20, 34)], fill=ROBE_SHADOW)
    draw.polygon([(40, 52), (44, 52), (44, 38), (40, 38)], fill=ROBE_SHADOW)
    # Robe shoulder / upper chest
    draw.polygon([(20, 34), (44, 34), (42, 28), (22, 28)], fill=ROBE_MAIN)

    # --- Book held in left hand (center-left of pulpit, raised slightly) ---
    # Book body
    bx, by = 22, 35
    draw.rectangle([(bx, by), (bx + 9, by + 7)], fill=BOOK_COVER)
    # Page edge
    draw.rectangle([(bx + 9, by + 1), (bx + 10, by + 6)], fill=BOOK_PAGES)
    # Gold title bar suggestion
    draw.rectangle([(bx + 1, by + 2), (bx + 8, by + 3)], fill=BOOK_TITLE)
    draw.rectangle([(bx + 1, by + 4), (bx + 6, by + 5)], fill=BOOK_TITLE)

    # Book aura glow
    if book_pulse > 0:
        book_aura = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        badraw = ImageDraw.Draw(book_aura)
        alpha_b = int(book_pulse * 160)
        bxc, byc = bx + 5, by + 4
        for r in [8, 11, 14]:
            a = max(0, alpha_b - r * 8)
            badraw.ellipse([(bxc - r, byc - r), (bxc + r, byc + r)],
                           fill=(*BOOK_AURA[:3], a))
        img = Image.alpha_composite(img, book_aura)
        draw = ImageDraw.Draw(img)

    # --- Head ---
    draw.ellipse([(26, 18), (38, 30)], fill=SKIN)
    # Grey hair
    draw.ellipse([(26, 18), (38, 24)], fill=HAIR)
    draw.rectangle([(27, 18), (37, 22)], fill=HAIR)
    # White beard
    draw.ellipse([(26, 25), (38, 35)], fill=BEARD)
    draw.rectangle([(27, 27), (37, 32)], fill=BEARD)
    # Eyes — solemn, downward cast
    draw.line([(28, 24), (31, 24)], fill=EYE, width=1)
    draw.line([(33, 24), (36, 24)], fill=EYE, width=1)
    # Stern mouth
    draw.line([(29, 28), (35, 28)], fill=MOUTH, width=1)

    # --- Right arm + pointing finger ---
    shoulder_r = (42, 30)
    # finger_raise: 0 = arm at side, 1 = index finger raised to sky
    # elbow around (46, 36), finger tip from (46, 36) sweeps to (46, 20)
    elbow_x = int(46)
    elbow_y = int(36 - finger_raise * 6)
    tip_x = int(46 + finger_raise * 2)
    tip_y = int(36 - finger_raise * 18)

    # Upper arm
    draw.line([shoulder_r, (elbow_x, elbow_y)], fill=ARM, width=4)
    # Forearm
    draw.line([(elbow_x, elbow_y), (tip_x, tip_y)], fill=ARM, width=3)
    # Pointing finger
    draw.line([(tip_x, tip_y), (tip_x, tip_y - 4)], fill=FINGER_SKIN, width=2)

    # Apply stained glass aura overlay
    if aura_layer is not None:
        img = Image.alpha_composite(img, aura_layer)

    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    def add(glow_ring, aura_alpha, finger_raise, book_pulse, dur):
        frames.append(make_frame(glow_ring, aura_alpha, finger_raise, book_pulse))
        durations.append(dur)

    # Phase 1: Entity ring glows (innermost), finger down, book faint pulse (3 frames)
    add(0, 60,  0.0, 0.3, 120)
    add(0, 80,  0.0, 0.5, 120)
    add(0, 100, 0.0, 0.7, 120)

    # Phase 2: Use Case ring glows, book brightens
    add(1, 80,  0.1, 0.8, 100)
    add(1, 100, 0.1, 1.0, 100)

    # Phase 3: Interface Adapter ring glows, finger begins to rise
    add(2, 80,  0.3, 0.9, 100)
    add(2, 100, 0.5, 1.0, 100)

    # Phase 4: Framework ring glows (outer), finger fully raised
    add(3, 60,  0.8, 0.8, 100)
    add(3, 80,  1.0, 1.0, 100)

    # Phase 5: ALL rings dim, finger fully raised — solemn hold (2 frames)
    add(0, 120, 1.0, 1.0, 180)
    add(0, 120, 1.0, 1.0, 180)

    # Phase 6: Golden pulse — all rings brightest, finger still raised (2 frames)
    add(0, 200, 1.0, 1.0, 100)
    add(1, 200, 1.0, 1.0, 100)

    # Phase 7: Finger lowers, aura fades back to Entity glow
    add(0, 160, 0.7, 0.9, 100)
    add(0, 120, 0.4, 0.7, 100)
    add(0, 80,  0.1, 0.5, 100)
    add(0, 60,  0.0, 0.3, 120)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/uncle-bob_b.gif"
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
