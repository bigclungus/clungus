#!/usr/bin/env python3
"""
Priya the Pitiless — Avatar Option C: "The Red Pen"

White/cream background, clinical and stark.
Priya viewed from slightly above, looking DOWN at something she's marking.
A bold red slash dominates the composition.
Animation: red pen makes a short decisive slash (3 frames motion, long hold).
"""

from PIL import Image, ImageDraw
import math

W, H = 64, 64

# --- Palette ---
BG           = (248, 246, 240, 255)   # off-white / cream
SHADOW       = (220, 218, 210, 255)   # soft shadow on floor
BODY         = (34, 34, 40, 255)      # near-black jacket (stark contrast)
BODY_COLLAR  = (255, 255, 255, 255)   # white collar flash
SHOULDER_L   = (28, 28, 34, 255)      # body shadow left
HEAD         = (205, 178, 162, 255)   # skin
HAIR         = (20, 18, 22, 255)      # black hair, severe
HAIR_SHEEN   = (40, 36, 44, 255)      # hair highlight
EYE_IRIS     = (55, 45, 45, 255)      # dark eyes, looking down
EYE_SHADOW   = (140, 100, 90, 255)    # under-eye shadow (tired contempt)
NOSE         = (175, 148, 135, 255)   # nose shadow
MOUTH        = (140, 95, 85, 255)     # tight, pressed lips
DESK_TOP     = (230, 228, 220, 255)   # white paper/desk surface
DESK_EDGE    = (180, 178, 170, 255)   # desk edge shadow
PEN_BODY     = (245, 245, 248, 255)   # white pen barrel
PEN_CLIP     = (190, 190, 200, 255)   # pen clip (metal)
PEN_TIP      = (200, 30, 30, 255)     # red pen tip/ink
SLASH_RED    = (210, 20, 20, 255)     # vivid red slash mark
SLASH_DRY    = (180, 15, 15, 255)     # slightly dried red at tail
ARM          = (34, 34, 40, 255)      # sleeve


def draw_frame(slash_progress: float, pen_x: int, pen_y: int) -> Image.Image:
    """
    slash_progress: 0.0 = no slash visible, 1.0 = full slash drawn
    pen_x, pen_y: tip position of the pen
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Subtle drop shadow under figure (top-down view = shadow directly below)
    draw.ellipse([(18, 44), (46, 54)], fill=SHADOW)

    # --- Desk/paper surface (top-down foreshortened) ---
    # Slightly tilted rectangle representing paper on desk below her
    paper_poly = [
        (10, 38), (54, 36), (56, 60), (8, 62)
    ]
    draw.polygon(paper_poly, fill=DESK_TOP)
    # Desk edge
    draw.line([(10, 38), (54, 36)], fill=DESK_EDGE, width=1)

    # Red slash on paper — grows as slash_progress increases
    if slash_progress > 0:
        # Slash goes from upper-left to lower-right of paper
        sx0, sy0 = 15, 40
        sx1_full, sy1_full = 50, 56
        sx1 = int(sx0 + (sx1_full - sx0) * slash_progress)
        sy1 = int(sy0 + (sy1_full - sy0) * slash_progress)

        # Main slash stroke — thick and decisive
        draw.line([(sx0, sy0), (sx1, sy1)], fill=SLASH_RED, width=4)
        # Slight taper at tail (overlap with slightly narrower dry line)
        if slash_progress > 0.3:
            mid_x = int(sx0 + (sx1 - sx0) * 0.4)
            mid_y = int(sy0 + (sy1 - sy0) * 0.4)
            draw.line([(mid_x, mid_y), (sx1, sy1)], fill=SLASH_DRY, width=3)

        # Small perpendicular tick at start (like a rejection strike)
        if slash_progress > 0.15:
            draw.line([(sx0 - 2, sy0 - 2), (sx0 + 2, sy0 + 2)], fill=SLASH_RED, width=2)

    # --- Body (top-down — mostly shoulders + top of head) ---
    # Wide shoulder shape, compressed vertically (top-down perspective)
    shoulder_poly = [
        (10, 30), (54, 30), (52, 46), (12, 46)
    ]
    draw.polygon(shoulder_poly, fill=BODY)
    # Left shoulder darker
    draw.polygon([(10, 30), (22, 30), (20, 46), (12, 46)], fill=SHOULDER_L)

    # White collar/shirt at neck center
    draw.polygon([(28, 30), (36, 30), (35, 36), (29, 36)], fill=BODY_COLLAR)

    # --- Head (top-down, slightly oval) ---
    # Face foreshortened — wider than tall since we're looking down at her
    draw.ellipse([(20, 10), (44, 32)], fill=HEAD)

    # --- Hair (severe, pulled back, dark) ---
    # Top of hair — parted center, pulled flat back
    draw.ellipse([(20, 10), (44, 22)], fill=HAIR)
    draw.rectangle([(21, 10), (43, 18)], fill=HAIR)
    # Hair sheen line
    draw.line([(30, 11), (34, 11)], fill=HAIR_SHEEN, width=1)

    # Small visible ear tips at sides
    draw.ellipse([(18, 19), (22, 23)], fill=HEAD)
    draw.ellipse([(42, 19), (46, 23)], fill=HEAD)

    # --- Face features (top-down = features compressed toward bottom of head oval) ---
    # Brow ridge (visible from above) — flat, stern
    draw.line([(24, 19), (30, 18)], fill=HAIR, width=2)   # left brow
    draw.line([(34, 18), (40, 19)], fill=HAIR, width=2)   # right brow

    # Eyes — looking DOWN, so irises at BOTTOM of eye socket, lids heavy
    # Left eye
    draw.ellipse([(23, 20), (30, 25)], fill=(240, 235, 230, 255))  # white
    draw.ellipse([(25, 22), (29, 25)], fill=EYE_IRIS)              # iris, shifted down
    draw.line([(23, 20), (30, 20)], fill=EYE_SHADOW, width=2)      # heavy upper lid
    # Right eye
    draw.ellipse([(34, 20), (41, 25)], fill=(240, 235, 230, 255))
    draw.ellipse([(36, 22), (40, 25)], fill=EYE_IRIS)
    draw.line([(34, 20), (41, 20)], fill=EYE_SHADOW, width=2)

    # Nose (just a subtle shadow bridge from above)
    draw.line([(31, 23), (31, 27)], fill=NOSE, width=1)
    draw.line([(33, 23), (33, 27)], fill=NOSE, width=1)

    # Mouth — tight line, slight downward press
    draw.line([(28, 28), (36, 28)], fill=MOUTH, width=2)
    # Slight downward corners
    draw.point((28, 29), fill=MOUTH)
    draw.point((36, 29), fill=MOUTH)

    # --- Arm holding pen (right arm, extending down toward paper) ---
    # Sleeve comes from right shoulder area, foreshortened
    arm_poly = [
        (42, 32), (52, 34), (pen_x + 4, pen_y - 4), (pen_x, pen_y - 8)
    ]
    draw.polygon(arm_poly, fill=ARM)

    # --- Pen ---
    # Pen body — elongated, mostly vertical in this view
    pen_base_x = pen_x
    pen_base_y = pen_y - 10
    draw.line([(pen_base_x, pen_base_y), (pen_x, pen_y)], fill=PEN_BODY, width=3)
    # Pen clip (side detail)
    draw.line([(pen_base_x + 1, pen_base_y + 2), (pen_x + 1, pen_y - 2)],
              fill=PEN_CLIP, width=1)
    # Pen tip (red nib)
    draw.ellipse([(pen_x - 2, pen_y - 2), (pen_x + 2, pen_y + 2)], fill=PEN_TIP)

    # If pen is actively drawing (slash in progress), red ink smear at tip
    if 0.05 < slash_progress < 0.98:
        draw.ellipse([(pen_x - 3, pen_y - 1), (pen_x + 3, pen_y + 3)],
                     fill=(*SLASH_RED[:3], 180))

    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    # Pen travels from raised position (upper right of paper) → down along slash path
    # Start pos: pen tip at (48, 37) — just before slash start
    # Strike pos: pen tip tracks along slash, ending at ~(50, 55)

    def add(slash_prog, px, py, dur):
        frames.append(draw_frame(slash_prog, px, py))
        durations.append(dur)

    # Phase 1: Pen poised above paper, no slash — long hold (she's deciding)
    for _ in range(4):
        add(0.0, 48, 36, 100)

    # Phase 2: Decisive slash — 3 frames of motion
    # Frame 1: pen starts moving, slash begins (15%)
    add(0.15, 44, 40, 60)
    # Frame 2: mid-slash (55%)
    add(0.55, 36, 47, 60)
    # Frame 3: slash completes (100%)
    add(1.0, 30, 54, 60)

    # Phase 3: Pen lifts slightly, slash remains — long hold (contempt, satisfied)
    for _ in range(5):
        add(1.0, 30, 52, 120)

    # Phase 4: Pen retracts back to start — 2 frames
    add(1.0, 38, 44, 70)
    add(1.0, 46, 37, 70)

    # Phase 5: Hold at start again with slash visible — loop back
    for _ in range(2):
        add(1.0, 48, 36, 100)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/critic_c.gif"
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
