#!/usr/bin/env python3
"""
Ibrahim the Immovable — Option G: Stark Void
64x64 animated GIF, pure Pillow, loop=0, disposal=2

Visual:
- Pure black background, near-total darkness
- Ibrahim as near-silhouette — only the barest outline visible
- Two eyes as dim amber/gold ember-points in the dark
- The emptiness IS the statement — immovability as absence

Animation: very slow, almost imperceptible eye blink over ~20 frames
with long pauses between blinks. Mostly darkness. Eyes occasionally
dim further, then return — ember breathing.
"""

from PIL import Image, ImageDraw
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/hiring-manager_g.gif"
SIZE = (64, 64)

# --- Palette ---
BG_VOID         = (2, 2, 3)          # near-total black
OUTLINE_FAINT   = (18, 14, 12)       # barely-there silhouette edge
OUTLINE_MID     = (24, 18, 14)       # slightly more visible outline
SUIT_GHOST      = (10, 8, 9)         # suit as dark mass
FACE_GHOST      = (14, 10, 8)        # face as dim shadow

# Ember eyes — amber/gold, very dim
EYE_EMBER_BRIGHT = (110, 72, 18)     # brightest ember state
EYE_EMBER_MID    = (78, 50, 12)      # dimmer
EYE_EMBER_DIM    = (44, 28, 6)       # nearly extinguished
EYE_EMBER_SHUT   = (16, 10, 2)       # blink closed — almost nothing


def draw_frame(eye_brightness: float) -> Image.Image:
    """
    eye_brightness: 0.0 = eyes shut (blink), 1.0 = full ember glow
    Draws Ibrahim as a near-silhouette, eyes as dim amber points.
    """
    img = Image.new("RGBA", SIZE, (0, 0, 0, 255))
    d = ImageDraw.Draw(img)

    # Fill with near-black
    d.rectangle([0, 0, 63, 63], fill=BG_VOID)

    # Figure position — centered, slightly up
    ox = 32   # center x
    oy = 30   # head center y
    ty = 45   # torso top

    # --- Torso as dark mass ---
    # Just barely distinguishable from background
    d.polygon([
        (ox - 14, ty), (ox + 14, ty),
        (ox + 14, 64), (ox - 14, 64),
    ], fill=SUIT_GHOST)

    # Shoulder outlines — faint
    d.line([(ox - 14, ty), (ox - 18, ty - 2)], fill=OUTLINE_FAINT)
    d.line([(ox + 14, ty), (ox + 18, ty - 2)], fill=OUTLINE_FAINT)

    # Neck — ghost
    d.rectangle([ox - 3, oy + 14, ox + 3, ty + 1], fill=FACE_GHOST)

    # --- Head silhouette ---
    hw, hh = 13, 15
    # Main head mass — barely above void
    d.rounded_rectangle(
        [ox - hw, oy - hh, ox + hw, oy + hh],
        radius=5, fill=FACE_GHOST,
    )

    # Hair — pure darkness (indistinguishable from bg, just outline)
    d.rounded_rectangle(
        [ox - hw + 1, oy - hh - 3, ox + hw - 1, oy - hh + 4],
        radius=3, fill=SUIT_GHOST,
    )

    # Head outline — faint trace only at edges
    d.arc([ox - hw, oy - hh, ox + hw, oy + hh], start=200, end=340, fill=OUTLINE_FAINT)
    # Jaw line faint
    d.line([(ox - 6, oy + hh - 1), (ox + 6, oy + hh - 1)], fill=OUTLINE_FAINT)

    # Shoulder outline hints
    d.line([(ox - 16, ty - 1), (ox - 8, oy + hh - 2)], fill=OUTLINE_FAINT)
    d.line([(ox + 16, ty - 1), (ox + 8, oy + hh - 2)], fill=OUTLINE_FAINT)

    # --- Eyes: amber embers ---
    # Eye positions (symmetric, forward-facing)
    eye_y = oy + 1
    lex = ox - 5   # left eye x
    rex = ox + 5   # right eye x

    # Interpolate ember color based on brightness
    def ember_col(t):
        # t = 0.0 (shut) to 1.0 (bright)
        r = int(EYE_EMBER_SHUT[0] + t * (EYE_EMBER_BRIGHT[0] - EYE_EMBER_SHUT[0]))
        g = int(EYE_EMBER_SHUT[1] + t * (EYE_EMBER_BRIGHT[1] - EYE_EMBER_SHUT[1]))
        b = int(EYE_EMBER_SHUT[2] + t * (EYE_EMBER_BRIGHT[2] - EYE_EMBER_SHUT[2]))
        return (r, g, b)

    ec = ember_col(eye_brightness)
    ec_inner = ember_col(min(1.0, eye_brightness * 1.2))  # slightly brighter core

    # Each eye: 1-pixel core, surrounded by faint glow if bright enough
    if eye_brightness > 0.05:
        # Outer glow — very faint, 1px halo
        glow_col = (max(0, ec[0] - 40), max(0, ec[1] - 28), max(0, ec[2] - 6))
        if glow_col != (0, 0, 0):
            d.ellipse([lex - 2, eye_y - 1, lex + 2, eye_y + 1], fill=glow_col)
            d.ellipse([rex - 2, eye_y - 1, rex + 2, eye_y + 1], fill=glow_col)

    # Core ember point
    d.point((lex, eye_y), fill=ec_inner)
    d.point((rex, eye_y), fill=ec_inner)

    # Secondary pixels for slightly larger ember
    if eye_brightness > 0.3:
        d.point((lex - 1, eye_y), fill=ec)
        d.point((lex + 1, eye_y), fill=ec)
        d.point((lex, eye_y - 1), fill=ec)
        d.point((rex - 1, eye_y), fill=ec)
        d.point((rex + 1, eye_y), fill=ec)
        d.point((rex, eye_y - 1), fill=ec)

    return img


def make_gif():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    frames = []
    durations = []

    # Blink schedule: (eye_brightness, duration_ms)
    # Long periods of stillness punctuated by a slow blink
    # One full cycle: hold open → slow dim → blink shut → slow reopen → long hold
    schedule = [
        # Long hold — eyes as dim embers, nearly still
        (1.0, 200), (1.0, 200), (1.0, 200), (1.0, 200), (1.0, 200),
        (1.0, 200), (1.0, 200), (1.0, 200), (1.0, 200), (1.0, 200),
        (1.0, 200), (1.0, 200),
        # Begin very slow dim / blink descent
        (0.85, 150),
        (0.65, 150),
        (0.42, 130),
        (0.22, 120),
        (0.08, 100),
        # Blink closed — hold in darkness
        (0.0, 120), (0.0, 120), (0.0, 150),
        # Reopen slowly
        (0.08, 100),
        (0.25, 120),
        (0.50, 130),
        (0.75, 140),
        (0.92, 150),
        (1.0, 150),
        # Hold again — long pause before loop
        (1.0, 200), (1.0, 200), (1.0, 200), (1.0, 200),
        (1.0, 500),
    ]

    for brightness, dur in schedule:
        frame = draw_frame(eye_brightness=brightness)
        frames.append(frame.convert("RGB").quantize(colors=32))
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
