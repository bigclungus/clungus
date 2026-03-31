#!/usr/bin/env python3
"""
Ibrahim the Immovable — Option H: Full Ceremonial Presence
64x64 animated GIF, front-facing bust, pure Pillow, loop=0, disposal=2

Visual:
- Deep cobalt/navy suit with gold lapel pin detail
- Bright warm three-point lighting — fully illuminated, NO dramatic shadows
- Direct symmetrical gaze straight at viewer — not 3/4, dead center
- Expression: absolutely neutral, zero affect — not stern, not kind, just THERE
- Shirt collar and tie visible, everything crisply lit

Animation: a single very slow eyebrow raise (1px) and return.
Maximum gravitas, minimum motion. Long holds. One cycle.
"""

from PIL import Image, ImageDraw
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/hiring-manager_h.gif"
SIZE = (64, 64)

# --- Palette ---
BG_WARM         = (34, 30, 26)       # warm dark background — not void, lit room
BG_FILL         = (42, 38, 34)       # slightly lighter fill
SUIT_COBALT     = (28, 46, 88)       # deep cobalt navy
SUIT_MID        = (36, 58, 108)      # midtone cobalt
SUIT_LIGHT      = (44, 70, 128)      # catch light on suit
GOLD_PIN        = (198, 162, 64)     # gold lapel pin
GOLD_SHINE      = (230, 200, 100)    # pin highlight
SHIRT_WHITE     = (226, 220, 210)    # warm white shirt
SHIRT_SHADOW    = (192, 184, 172)    # shirt in slight shadow
TIE_COBALT      = (22, 36, 72)       # darker cobalt tie
TIE_MID         = (30, 50, 94)       # tie midtone

SKIN_DEEP       = (72, 48, 30)       # deep skin
SKIN_MID        = (108, 74, 48)      # midtone skin
SKIN_LIGHT      = (138, 98, 68)      # fully lit skin
SKIN_BRIGHT     = (154, 112, 80)     # brightest catch light
SKIN_SHADOW     = (82, 54, 34)       # mild shadow (minimal — fully lit)

EYE_WHITE       = (210, 202, 192)    # warm eye white
EYE_IRIS        = (52, 38, 22)       # dark brown iris
EYE_DARK        = (16, 10, 6)        # pupil
EYE_CATCH       = (220, 215, 205)    # catchlight

LID             = (88, 60, 38)       # eyelid skin
BROW_COL        = (54, 36, 20)       # eyebrow
HAIR_DARK       = (26, 20, 14)       # dark hair
HAIR_GRAY       = (98, 90, 82)       # gray at temples

COLLAR_LINE     = (172, 162, 150)    # collar shadow edge


def draw_frame(brow_lift: int) -> Image.Image:
    """
    brow_lift: 0 = neutral, 1 = raised 1px (maximum motion)
    Draws Ibrahim fully lit, front-facing, ceremonial presence.
    """
    img = Image.new("RGBA", SIZE, (0, 0, 0, 255))
    d = ImageDraw.Draw(img)

    # Warm background — gradient suggestion
    for y in range(64):
        t = y / 63.0
        r = int(BG_WARM[0] + t * 8)
        g = int(BG_WARM[1] + t * 6)
        b = int(BG_WARM[2] + t * 4)
        d.line([(0, y), (63, y)], fill=(r, g, b))

    # Figure — dead center, fully frontal
    ox = 32    # exact center
    oy = 28    # head center y
    ty = 44    # torso top

    # --- Torso: cobalt suit, fully lit ---
    # Right side of suit (viewer's left)
    d.polygon([
        (ox, ty), (ox + 16, ty - 1),
        (ox + 18, 64), (ox, 64),
    ], fill=SUIT_COBALT)
    # Left side of suit
    d.polygon([
        (ox, ty), (ox - 16, ty - 1),
        (ox - 18, 64), (ox, 64),
    ], fill=SUIT_MID)

    # Three-point lighting catches: bright fill on both shoulders (no harsh shadows)
    d.polygon([
        (ox + 10, ty - 1), (ox + 18, ty),
        (ox + 18, ty + 6), (ox + 10, ty + 4),
    ], fill=SUIT_LIGHT)
    d.polygon([
        (ox - 10, ty - 1), (ox - 18, ty),
        (ox - 18, ty + 6), (ox - 10, ty + 4),
    ], fill=SUIT_LIGHT)

    # Lapels — symmetrical
    d.polygon([
        (ox, ty), (ox + 6, ty - 3),
        (ox + 5, ty + 8), (ox, ty + 6),
    ], fill=SUIT_LIGHT)
    d.polygon([
        (ox, ty), (ox - 6, ty - 3),
        (ox - 5, ty + 8), (ox, ty + 6),
    ], fill=SUIT_COBALT)

    # Shirt --- centered visible strip
    d.polygon([
        (ox - 4, ty - 2), (ox + 4, ty - 2),
        (ox + 3, ty + 8), (ox - 3, ty + 8),
    ], fill=SHIRT_WHITE)
    d.line([(ox - 3, ty - 2), (ox - 3, ty + 8)], fill=SHIRT_SHADOW)

    # Tie — slim, centered, darker cobalt
    d.polygon([
        (ox - 2, ty - 2), (ox + 2, ty - 2),
        (ox + 1, ty + 12), (ox, ty + 14),
        (ox - 1, ty + 12),
    ], fill=TIE_COBALT)
    d.line([(ox, ty), (ox, ty + 10)], fill=TIE_MID)

    # --- Gold lapel pin — right lapel ---
    px, py = ox + 5, ty + 4
    d.ellipse([px - 2, py - 2, px + 2, py + 2], fill=GOLD_PIN)
    d.point((px, py - 1), fill=GOLD_SHINE)
    # Small crossbar — suggests medal/order pin
    d.line([(px - 2, py), (px + 2, py)], fill=GOLD_SHINE)
    d.line([(px, py - 2), (px, py + 2)], fill=GOLD_SHINE)

    # --- Neck ---
    d.rectangle([ox - 4, oy + 13, ox + 4, ty + 1], fill=SKIN_MID)
    # Collar
    d.line([(ox - 4, oy + 13), (ox - 8, ty)], fill=SHIRT_WHITE)
    d.line([(ox + 4, oy + 13), (ox + 8, ty)], fill=SHIRT_WHITE)
    d.line([(ox - 4, oy + 13), (ox, oy + 13)], fill=COLLAR_LINE)

    # --- Head: fully illuminated, symmetrical ---
    hw, hh = 14, 16
    # Head base — warm lit skin
    d.rounded_rectangle(
        [ox - hw, oy - hh, ox + hw, oy + hh],
        radius=5, fill=SKIN_MID,
    )
    # Three-point lighting: fill from both sides, key from front-top
    # Left fill light
    d.polygon([
        (ox - hw, oy - 4), (ox - hw + 4, oy - 4),
        (ox - hw + 4, oy + 8), (ox - hw, oy + 8),
    ], fill=SKIN_LIGHT)
    # Right fill light
    d.polygon([
        (ox + hw - 4, oy - 4), (ox + hw, oy - 4),
        (ox + hw, oy + 8), (ox + hw - 4, oy + 8),
    ], fill=SKIN_LIGHT)
    # Key light from front-top: forehead, cheekbones
    d.ellipse([ox - 8, oy - hh + 2, ox + 8, oy - 4], fill=SKIN_BRIGHT)
    d.ellipse([ox - 10, oy - 2, ox - 4, oy + 4], fill=SKIN_LIGHT)
    d.ellipse([ox + 4, oy - 2, ox + 10, oy + 4], fill=SKIN_LIGHT)

    # Jaw — softened by fill light
    d.polygon([
        (ox - 7, oy + hh - 3), (ox + 7, oy + hh - 3),
        (ox + 3, oy + hh + 1), (ox - 3, oy + hh + 1),
    ], fill=SKIN_SHADOW)
    # Chin highlight
    d.point((ox, oy + hh), fill=SKIN_MID)

    # --- Hair ---
    d.rounded_rectangle(
        [ox - hw + 1, oy - hh - 2, ox + hw - 1, oy - hh + 5],
        radius=3, fill=HAIR_DARK,
    )
    # Hair top catch-light from key
    d.ellipse([ox - 6, oy - hh - 2, ox + 6, oy - hh + 3], fill=(38, 30, 22))
    # Gray temples — symmetrical
    d.ellipse([ox - hw + 1, oy - 4, ox - hw + 5, oy + 5], fill=HAIR_GRAY)
    d.ellipse([ox + hw - 5, oy - 4, ox + hw - 1, oy + 5], fill=HAIR_GRAY)
    # Sideburns
    d.rectangle([ox - hw + 1, oy + 5, ox - hw + 3, oy + 10], fill=HAIR_GRAY)
    d.rectangle([ox + hw - 3, oy + 5, ox + hw - 1, oy + 10], fill=HAIR_GRAY)

    # Ears — symmetrical, lit
    d.ellipse([ox - hw - 2, oy, ox - hw + 2, oy + 8], fill=SKIN_DEEP)
    d.ellipse([ox + hw - 2, oy, ox + hw + 2, oy + 8], fill=SKIN_DEEP)
    # Ear highlight
    d.point((ox - hw, oy + 3), fill=SKIN_MID)
    d.point((ox + hw, oy + 3), fill=SKIN_MID)

    # --- Eyebrows — symmetrical, with optional 1px raise ---
    by = oy - 6 - brow_lift
    # Left brow
    d.line([(ox - 9, by + 1), (ox - 3, by)], fill=BROW_COL, width=1)
    d.line([(ox - 9, by + 2), (ox - 3, by + 1)], fill=BROW_COL, width=1)
    # Right brow (mirror)
    d.line([(ox + 3, by), (ox + 9, by + 1)], fill=BROW_COL, width=1)
    d.line([(ox + 3, by + 1), (ox + 9, by + 2)], fill=BROW_COL, width=1)

    # --- Eyes: front-facing, symmetrical, direct gaze ---
    eye_y = oy + 1
    lex = ox - 6    # left eye center x
    rex = ox + 6    # right eye center x (mirror)

    # Eye whites
    d.ellipse([lex - 4, eye_y - 2, lex + 4, eye_y + 2], fill=EYE_WHITE)
    d.ellipse([rex - 4, eye_y - 2, rex + 4, eye_y + 2], fill=EYE_WHITE)

    # Irises — centered, looking straight out
    d.ellipse([lex - 2, eye_y - 2, lex + 2, eye_y + 2], fill=EYE_IRIS)
    d.ellipse([rex - 2, eye_y - 2, rex + 2, eye_y + 2], fill=EYE_IRIS)

    # Pupils
    d.point((lex, eye_y), fill=EYE_DARK)
    d.point((rex, eye_y), fill=EYE_DARK)

    # Catchlights — three-point lighting, small bright dot upper-left each eye
    d.point((lex - 1, eye_y - 1), fill=EYE_CATCH)
    d.point((rex - 1, eye_y - 1), fill=EYE_CATCH)

    # Eyelid line top — crisp, clean
    d.line([(lex - 4, eye_y - 2), (lex + 4, eye_y - 2)], fill=LID)
    d.line([(rex - 4, eye_y - 2), (rex + 4, eye_y - 2)], fill=LID)
    # Lower lid — thinner
    d.line([(lex - 3, eye_y + 2), (lex + 3, eye_y + 2)], fill=SKIN_SHADOW)
    d.line([(rex - 3, eye_y + 2), (rex + 3, eye_y + 2)], fill=SKIN_SHADOW)

    # --- Nose: straight, symmetrical, front-facing ---
    ny = oy + 5
    # Bridge line — vertical
    d.line([(ox, oy + 3), (ox, ny + 1)], fill=SKIN_SHADOW)
    # Nostrils — symmetric, faint
    d.ellipse([ox - 4, ny, ox - 1, ny + 2], fill=SKIN_SHADOW)
    d.ellipse([ox + 1, ny, ox + 4, ny + 2], fill=SKIN_SHADOW)
    # Tip highlight
    d.point((ox, ny), fill=SKIN_LIGHT)

    # --- Mouth: closed, perfectly neutral, symmetrical ---
    my = oy + 10
    # Lip line — absolutely flat, no micro-expression
    d.line([(ox - 5, my), (ox + 5, my)], fill=SKIN_SHADOW)
    # Very subtle lip definition
    d.line([(ox - 4, my + 1), (ox + 4, my + 1)], fill=SKIN_MID)
    d.line([(ox - 4, my - 1), (ox + 4, my - 1)], fill=SKIN_LIGHT)

    return img


def make_gif():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    frames = []
    durations = []

    # Eyebrow raise schedule: (brow_lift, duration_ms)
    # Long neutral hold, then 1px raise, hold at raised, slow return, long hold
    schedule = [
        # Neutral hold
        (0, 150), (0, 150), (0, 150), (0, 150), (0, 150),
        (0, 150), (0, 150), (0, 150),
        # Begin raise — 1px, slow
        (0, 200),
        (1, 200),
        # Hold at raised — this is the moment
        (1, 300), (1, 300), (1, 300), (1, 300),
        # Slow return
        (1, 200),
        (0, 200),
        # Long neutral hold after — the moment has passed, nothing changes
        (0, 150), (0, 150), (0, 150), (0, 150), (0, 150),
        (0, 150), (0, 150), (0, 150),
        (0, 500),   # pause before loop
    ]

    for brow_lift, dur in schedule:
        frame = draw_frame(brow_lift=brow_lift)
        frames.append(frame.convert("RGB").quantize(colors=64))
        durations.append(dur)

    frames[0].save(
        OUTPUT_PATH,
        save_all=True,
        append_images=frames[1:],
        loop=0,
        duration=durations,
        disposal=2,
        optimize=False,
    )
    print(f"Saved: {OUTPUT_PATH} ({len(frames)} frames)")


if __name__ == "__main__":
    make_gif()
