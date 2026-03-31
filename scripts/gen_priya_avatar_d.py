#!/usr/bin/env python3
"""
Priya the Pitiless — Avatar Option D: "The Void Stare"

Deep midnight blue/black background.
Extreme close-up — face fills almost the entire 64x64 frame.
Priya staring directly forward, completely unreadable.
Animation: single extremely slow blink — 20+ frames, very deliberate.
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# --- Palette ---
BG           = (6, 8, 18, 255)         # near-black midnight blue
BG_VIGNETTE  = (4, 5, 12, 255)         # darker edges
SKIN         = (198, 168, 150, 255)    # warm skin, lit from slightly below
SKIN_SHADOW  = (155, 120, 100, 255)    # shadow areas of face
SKIN_MID     = (178, 145, 125, 255)    # midtone transitions
FOREHEAD     = (205, 175, 158, 255)    # slightly lighter forehead
HAIR         = (14, 12, 16, 255)       # near-black hair
HAIR_EDGE    = (25, 20, 30, 255)       # hair edge (slightly lighter than bg)
BROW         = (30, 22, 20, 255)       # dark brows, heavy
BROW_ARCH    = (22, 16, 14, 255)       # inner brow, darker
# Eyes
SCLERA       = (230, 225, 220, 255)    # whites — slightly warm, not pure white
IRIS         = (62, 45, 35, 255)       # deep brown iris
IRIS_RING    = (45, 32, 24, 255)       # iris outer ring (limbal ring)
PUPIL        = (8, 6, 8, 255)          # pupil
EYE_REFLECT  = (220, 215, 210, 180)    # tiny catchlight
UPPER_LID    = (30, 22, 20, 255)       # upper eyelid (same as brow area)
LOWER_LID    = (175, 140, 120, 255)    # lower lid skin
LASH_LINE    = (18, 14, 16, 255)       # lash line
# Nose
NOSE_BRIDGE  = (178, 145, 125, 255)    # nose bridge highlight side
NOSE_SHADOW  = (140, 100, 82, 255)     # nose underside shadow
NOSTRIL      = (120, 85, 68, 255)      # nostrils
# Mouth
LIP_TOP      = (165, 108, 92, 255)     # upper lip (darker)
LIP_BOT      = (185, 128, 110, 255)    # lower lip (slightly fuller)
LIP_LINE     = (120, 72, 58, 255)      # lip line / cupid's bow crease
MOUTH_CORNER = (140, 92, 76, 255)      # mouth corners


def lerp(a, b, t):
    return a + (b - a) * t


def draw_face(left_open: float, right_open: float) -> Image.Image:
    """
    left_open, right_open: 0.0 = fully closed, 1.0 = fully open
    The two eyes can be driven independently for a natural asymmetric blink.
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Vignette corners (dark gradient suggestion — just darken corners)
    for corner in [(0, 0), (W-8, 0), (0, H-8), (W-8, H-8)]:
        draw.rectangle([corner, (corner[0]+8, corner[1]+8)], fill=BG_VIGNETTE)

    # ---------------------------------------------------------------
    # FACE SHAPE — fills almost the entire frame
    # Face is a rounded rectangle / oval, very close up
    # Chin at bottom (~y=62), hairline at top (~y=2), width ~56px
    # ---------------------------------------------------------------

    # Base face oval
    draw.ellipse([(4, 2), (60, 64)], fill=SKIN)

    # Subtle highlight on forehead (upper center)
    draw.ellipse([(20, 2), (44, 16)], fill=FOREHEAD)

    # Cheekbone highlights (catch light from below)
    draw.ellipse([(6, 28), (22, 38)], fill=SKIN_MID)    # left cheek
    draw.ellipse([(42, 28), (58, 38)], fill=SKIN_MID)   # right cheek

    # Jaw/chin shadow (lower face gets darker)
    draw.ellipse([(12, 50), (52, 66)], fill=SKIN_SHADOW)

    # ---------------------------------------------------------------
    # HAIR — comes in from top and sides, hard edge
    # ---------------------------------------------------------------
    # Top hairline (straight across, slightly arched)
    hair_top = [
        (4, 2), (16, 2), (20, 6), (32, 4), (44, 6), (48, 2), (60, 2),
        (60, 0), (4, 0)
    ]
    draw.polygon(hair_top, fill=HAIR)

    # Side hair left — comes down from top
    hair_left = [
        (4, 2), (4, 28), (8, 28), (10, 14), (16, 2)
    ]
    draw.polygon(hair_left, fill=HAIR)

    # Side hair right
    hair_right = [
        (60, 2), (60, 28), (56, 28), (54, 14), (48, 2)
    ]
    draw.polygon(hair_right, fill=HAIR)

    # Hair edges (slightly lighter than background so they read)
    draw.line([(4, 28), (4, 2), (60, 2), (60, 28)], fill=HAIR_EDGE, width=1)

    # ---------------------------------------------------------------
    # BROWS — heavy, low, close together (critical expression)
    # ---------------------------------------------------------------
    # Left brow: inner end lower, arches slightly, then drops
    left_brow = [
        (10, 22), (12, 20), (20, 18), (26, 19), (28, 21), (26, 22),
        (20, 20), (12, 22)
    ]
    draw.polygon(left_brow, fill=BROW)
    # Inner corner darker/heavier
    draw.line([(10, 22), (14, 20)], fill=BROW_ARCH, width=2)

    # Right brow
    right_brow = [
        (36, 19), (38, 18), (44, 18), (52, 20), (54, 22), (52, 22),
        (44, 20), (38, 20)
    ]
    draw.polygon(right_brow, fill=BROW)
    draw.line([(50, 22), (54, 20)], fill=BROW_ARCH, width=2)

    # ---------------------------------------------------------------
    # EYES
    # Eye sockets: left eye centered ~(18, 28), right eye ~(46, 28)
    # ---------------------------------------------------------------

    def draw_eye(draw, cx, cy, openness, flip=False):
        """
        cx, cy: center of eye
        openness: 0.0 = closed, 1.0 = fully open
        """
        eye_w = 14   # total eye width
        eye_h_open = 8  # height when fully open

        # Eye opening height at current openness
        h = max(1, int(eye_h_open * openness))

        # Sclera (whites) — only visible when open
        if openness > 0.05:
            sclera_rect = [
                (cx - eye_w//2, cy - h//2),
                (cx + eye_w//2, cy + h//2)
            ]
            draw.ellipse(sclera_rect, fill=SCLERA)

            # Iris — slightly smaller than eye opening
            iris_h = max(1, int(6 * openness))
            iris_rect = [
                (cx - 4, cy - iris_h//2),
                (cx + 4, cy + iris_h//2)
            ]
            draw.ellipse(iris_rect, fill=IRIS_RING)

            # Inner iris
            inner_h = max(1, int(5 * openness))
            inner_rect = [
                (cx - 3, cy - inner_h//2),
                (cx + 3, cy + inner_h//2)
            ]
            draw.ellipse(inner_rect, fill=IRIS)

            # Pupil (larger than you'd expect — she's in low light)
            pupil_h = max(1, int(4 * openness))
            pupil_rect = [
                (cx - 2, cy - pupil_h//2),
                (cx + 2, cy + pupil_h//2)
            ]
            draw.ellipse(pupil_rect, fill=PUPIL)

            # Catchlight — small bright spec at 10 o'clock position
            if openness > 0.4:
                draw.point((cx - 1, cy - max(1, iris_h//2 - 1)), fill=EYE_REFLECT)

        # Upper eyelid — always present, covers top portion
        lid_drop = int(eye_h_open * (1.0 - openness))
        upper_lid_poly = [
            (cx - eye_w//2, cy - eye_h_open//2 - 2),
            (cx + eye_w//2, cy - eye_h_open//2 - 2),
            (cx + eye_w//2, cy - eye_h_open//2 + lid_drop + 2),
            (cx, cy - eye_h_open//2 + lid_drop + 4),   # lid has natural arch
            (cx - eye_w//2, cy - eye_h_open//2 + lid_drop + 2),
        ]
        draw.polygon(upper_lid_poly, fill=UPPER_LID)

        # Lash line on upper lid edge
        lash_y = cy - eye_h_open//2 + lid_drop + 2
        draw.line([
            (cx - eye_w//2, lash_y),
            (cx, lash_y + 2),
            (cx + eye_w//2, lash_y)
        ], fill=LASH_LINE, width=1)

        # Lower lid
        lower_lid_y = cy + h//2 + 1
        draw.line([
            (cx - eye_w//2 + 1, lower_lid_y),
            (cx + eye_w//2 - 1, lower_lid_y)
        ], fill=LOWER_LID, width=1)

    # Draw both eyes
    draw_eye(draw, cx=19, cy=28, openness=left_open)
    draw_eye(draw, cx=45, cy=28, openness=right_open)

    # ---------------------------------------------------------------
    # NOSE — close-up so nose is prominent, center of frame
    # ---------------------------------------------------------------
    # Bridge (subtle highlight line down center)
    draw.line([(30, 22), (30, 38)], fill=NOSE_BRIDGE, width=1)
    draw.line([(34, 22), (34, 38)], fill=NOSE_BRIDGE, width=1)

    # Nose tip (slightly rounded)
    draw.ellipse([(27, 34), (37, 42)], fill=SKIN_MID)

    # Nostrils
    draw.ellipse([(24, 38), (29, 43)], fill=NOSTRIL)
    draw.ellipse([(35, 38), (40, 43)], fill=NOSTRIL)

    # Under-nose shadow
    draw.line([(26, 43), (38, 43)], fill=NOSE_SHADOW, width=1)

    # ---------------------------------------------------------------
    # MOUTH — pressed thin, lower third of frame
    # No smile. No frown. Just assessment.
    # ---------------------------------------------------------------
    # Upper lip
    # Cupid's bow
    lip_top_pts = [
        (18, 50), (22, 48), (27, 47), (32, 48), (37, 47), (42, 48), (46, 50)
    ]
    for i in range(len(lip_top_pts) - 1):
        draw.line([lip_top_pts[i], lip_top_pts[i+1]], fill=LIP_TOP, width=2)

    # Lower lip (fuller)
    lip_bot_pts = [
        (19, 50), (24, 54), (32, 56), (40, 54), (45, 50)
    ]
    for i in range(len(lip_bot_pts) - 1):
        draw.line([lip_bot_pts[i], lip_bot_pts[i+1]], fill=LIP_BOT, width=2)

    # Lip line (the actual seam)
    draw.line([(19, 50), (45, 50)], fill=LIP_LINE, width=1)

    # Mouth corners (subtle downward press — not a frown, just tension)
    draw.point((18, 51), fill=MOUTH_CORNER)
    draw.point((46, 51), fill=MOUTH_CORNER)

    # ---------------------------------------------------------------
    # CHIN shadow (lower face fades into dark)
    # ---------------------------------------------------------------
    # Chin highlight
    draw.ellipse([(26, 56), (38, 63)], fill=SKIN_MID)

    return img.convert("RGBA")


def build_frames():
    """
    The blink:
    - Long open hold (eyes fully open, staring)
    - Very slow upper lid descent (10 frames to close)
    - Brief closed hold (2 frames)
    - Slow reopening (10 frames)
    - Long hold again

    Total: ~25 frames. Each frame ~60-80ms for the blink motion,
    long holds at 150ms each.
    """
    frames = []
    durations = []

    def add(left_open, right_open, dur):
        frames.append(draw_face(left_open, right_open))
        durations.append(dur)

    # Long open stare — 7 frames at 150ms each = 1.05s of staring
    for _ in range(7):
        add(1.0, 1.0, 150)

    # Closing — 10 frames, easing in (starts slow, speeds up slightly)
    # Slight natural asymmetry: right eye leads by 1 frame
    close_curve = [1.0, 0.9, 0.75, 0.58, 0.42, 0.28, 0.16, 0.08, 0.03, 0.0]
    for i, v in enumerate(close_curve):
        # Right eye leads (closes slightly faster at the start)
        r = close_curve[max(0, i - 1)] if i > 0 else 1.0
        r_v = min(1.0, v * 0.95 + (close_curve[i-1] if i > 0 else 1.0) * 0.05)
        add(v, r_v, 60)

    # Fully closed hold — 2 frames
    add(0.0, 0.0, 80)
    add(0.0, 0.0, 80)

    # Opening — 10 frames, easing out (starts fast, slows at end)
    open_curve = [0.0, 0.05, 0.12, 0.24, 0.40, 0.56, 0.70, 0.82, 0.92, 1.0]
    for i, v in enumerate(open_curve):
        # Left eye leads on opening (opposite of closing)
        l_v = min(1.0, v * 1.05)
        l_v = min(1.0, l_v)
        add(l_v, v, 60)

    # Post-blink hold — eyes fully open again
    # Slight pause right after opening (eyes stay slightly more open momentarily)
    add(1.0, 1.0, 120)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/critic_d.gif"
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
