#!/usr/bin/env python3
"""
Ibrahim the Immovable — Option F: The Weight of the Gavel
64x64 animated GIF, isometric 3/4 bust, pure Pillow, loop=0, disposal=2

Visual:
- Rich deep burgundy/wine suit — warmer than black, more formal than navy
- Near-black background with single cool overhead light beam catching shoulder
- Upright posture, hands loosely clasped — the gesture of a figure at rest between rulings
- Expression: the faintest nod — not agreement, just recognition that someone has spoken
- Ceremony being performed. The weight is real. The motion is rote.

Animation: slow nod over 10 frames — head descends 1px, holds, returns.
Cycle: 6 still -> 4 descent -> 1 hold -> 5 return -> long pause before loop.
"""

from PIL import Image, ImageDraw
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/hiring-manager_f.gif"
SIZE = (64, 64)

# --- Palette ---
BG_VOID         = (12, 8, 14)
LIGHT_BEAM      = (42, 50, 65)
SUIT_BURG       = (68, 18, 28)
SUIT_DARK       = (44, 10, 18)
SUIT_LIGHT      = (88, 28, 40)
SUIT_CATCH      = (108, 40, 54)
SHIRT_COL       = (192, 186, 178)
TIE_BURG        = (50, 10, 18)
SKIN_DEEP       = (68, 44, 26)
SKIN_MID        = (102, 68, 44)
SKIN_LIGHT      = (126, 90, 62)
SKIN_SHADOW     = (56, 34, 18)
EYE_WHITE       = (178, 162, 144)
EYE_IRIS        = (46, 34, 20)
EYE_DARK        = (12, 8, 4)
LID             = (70, 44, 26)
BROW_COL        = (44, 30, 16)
HAIR_DARK       = (24, 18, 12)
HAIR_GRAY       = (86, 80, 74)
HAND_MAIN       = (90, 60, 40)
HAND_SHADOW     = (62, 38, 22)
SLEEVE          = (44, 10, 18)


def draw_background(img):
    """Near-black void with a cool overhead beam from upper-right, spilling on shoulder."""
    for y in range(64):
        for x in range(64):
            img.putpixel((x, y), (*BG_VOID, 255))

    d = ImageDraw.Draw(img)
    # Overhead light: soft cone from top-right, progressively fades
    layers = [
        (22, 8, (32, 40, 52)),
        (16, 6, (26, 34, 46)),
        (11, 4, (20, 28, 40)),
        (7,  2, (16, 22, 34)),
    ]
    cx = 38   # beam center x (right of center — hits right shoulder)
    for radius, y_start, col in layers:
        d.ellipse(
            [cx - radius * 2, y_start - 2, cx + radius * 2, y_start + radius * 3],
            fill=col,
        )


def draw_frame(head_dy: int) -> Image.Image:
    """
    head_dy: 0 = upright, 1 = nodded (1px down).
    Only the head/neck shift; torso stays fixed.
    """
    img = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    draw_background(img)
    d = ImageDraw.Draw(img)

    # Figure: slightly right of center, 3/4 facing left
    ox = 32
    oy = 27 + head_dy   # head center shifts with nod
    ty = 43             # torso top — fixed

    # --- Torso ---
    d.polygon([
        (ox - 15, ty + 2), (ox - 2, ty - 1),
        (ox - 2, ty + 22), (ox - 15, ty + 24),
    ], fill=SUIT_DARK)
    d.polygon([
        (ox - 2, ty - 1), (ox + 13, ty + 2),
        (ox + 11, ty + 22), (ox - 2, ty + 22),
    ], fill=SUIT_BURG)
    d.polygon([
        (ox - 19, ty - 1), (ox - 10, ty - 4),
        (ox - 2, ty - 1), (ox - 8, ty + 3),
    ], fill=SUIT_DARK)
    # Right shoulder catches overhead beam
    d.polygon([
        (ox - 2, ty - 1), (ox + 9, ty - 4),
        (ox + 16, ty - 1), (ox + 8, ty + 3),
    ], fill=SUIT_CATCH)
    d.polygon([
        (ox - 7, ty + 1), (ox - 2, ty - 1),
        (ox - 2, ty + 7), (ox - 6, ty + 9),
    ], fill=SUIT_BURG)
    d.polygon([
        (ox - 2, ty - 1), (ox + 4, ty + 1),
        (ox + 3, ty + 9), (ox - 2, ty + 7),
    ], fill=SUIT_LIGHT)
    d.polygon([
        (ox - 3, ty - 1), (ox + 3, ty - 1),
        (ox + 2, ty + 4), (ox - 2, ty + 4),
    ], fill=SHIRT_COL)
    d.polygon([
        (ox - 1, ty + 1), (ox + 1, ty + 1),
        (ox + 1, ty + 11), (ox, ty + 13),
        (ox - 1, ty + 11),
    ], fill=TIE_BURG)

    # --- Hands clasped at lower torso ---
    lhx, lhy = ox - 5, ty + 16
    rhx, rhy = ox + 2, ty + 17

    # Right hand (behind, darker)
    d.ellipse([rhx - 3, rhy - 2, rhx + 7, rhy + 3], fill=HAND_SHADOW)
    # Left hand (front)
    d.ellipse([lhx - 4, lhy - 3, lhx + 7, lhy + 3], fill=HAND_MAIN)
    # Knuckle line on left
    d.line([(lhx - 3, lhy - 1), (lhx + 5, lhy - 1)], fill=HAND_SHADOW)
    # Finger separations
    for fx in [lhx - 1, lhx + 2, lhx + 4]:
        d.point((fx, lhy - 3), fill=HAND_SHADOW)
    # Cuffs
    d.rectangle([lhx - 5, lhy + 2, lhx + 7, lhy + 4], fill=SHIRT_COL)
    d.rectangle([rhx - 4, rhy + 2, rhx + 8, rhy + 4], fill=SHIRT_COL)

    # --- Neck (moves with nod) ---
    d.polygon([
        (ox - 4, oy + 12), (ox + 3, oy + 12),
        (ox + 2, oy + 16), (ox - 3, oy + 16),
    ], fill=SKIN_MID)
    d.line([(ox - 4, oy + 12), (ox - 3, oy + 16)], fill=SKIN_SHADOW)

    # --- Head ---
    hw, hh = 15, 17
    d.rounded_rectangle(
        [ox - hw, oy - hh, ox + hw, oy + hh],
        radius=5, fill=SKIN_MID,
    )
    # Shadow plane left
    d.polygon([
        (ox - hw, oy - hh + 5), (ox - hw + 3, oy - hh + 2),
        (ox - hw + 3, oy + hh - 2), (ox - hw, oy + hh - 5),
    ], fill=SKIN_SHADOW)
    # Overhead beam catches top-right of head
    d.ellipse([ox, oy - hh, ox + hw - 2, oy - hh + 6], fill=SKIN_LIGHT)
    d.ellipse([ox + 2, oy - 2, ox + 8, oy + 3], fill=SKIN_LIGHT)
    # Jaw
    d.polygon([
        (ox - 5, oy + hh - 2), (ox + 5, oy + hh - 2),
        (ox + 2, oy + hh + 1), (ox - 2, oy + hh + 1),
    ], fill=SKIN_SHADOW)

    # Brow
    by = oy - 5
    d.line([(ox - 7, by - 1), (ox - 1, by - 2)], fill=BROW_COL)
    d.line([(ox, by - 2), (ox + 4, by - 1)], fill=BROW_COL)

    # Eyes — neutral, the "I have heard" gaze
    eye_y = oy
    ley_x = ox - 6
    rey_x = ox + 2

    d.ellipse([ley_x - 3, eye_y - 2, ley_x + 3, eye_y + 2], fill=EYE_WHITE)
    d.ellipse([ley_x - 2, eye_y - 1, ley_x + 2, eye_y + 1], fill=EYE_IRIS)
    d.point((ley_x, eye_y), fill=EYE_DARK)
    d.line([(ley_x - 3, eye_y - 2), (ley_x + 3, eye_y - 2)], fill=LID)

    d.ellipse([rey_x - 2, eye_y - 2, rey_x + 3, eye_y + 2], fill=EYE_WHITE)
    d.ellipse([rey_x - 1, eye_y - 1, rey_x + 2, eye_y + 1], fill=EYE_IRIS)
    d.point((rey_x, eye_y), fill=EYE_DARK)
    d.line([(rey_x - 2, eye_y - 2), (rey_x + 3, eye_y - 2)], fill=LID)

    # Nose
    ny = oy + 4
    d.line([(ox - 1, ny - 2), (ox - 2, ny + 1)], fill=SKIN_SHADOW)
    d.ellipse([ox - 4, ny, ox - 1, ny + 2], fill=SKIN_SHADOW)
    d.point((ox + 1, ny + 1), fill=SKIN_SHADOW)

    # Mouth — closed, the faintest acknowledgment at corners
    my = oy + 8
    d.line([(ox - 4, my), (ox + 3, my)], fill=SKIN_SHADOW)
    # Corner uptick — 1px each, barely perceptible
    d.point((ox - 4, my - 1), fill=SKIN_SHADOW)
    d.point((ox + 3, my - 1), fill=SKIN_SHADOW)
    d.arc([ox - 3, my, ox + 2, my + 2], start=0, end=180, fill=SKIN_MID)

    # Hair
    d.rounded_rectangle(
        [ox - hw + 1, oy - hh - 2, ox + hw - 1, oy - hh + 5],
        radius=3, fill=HAIR_DARK,
    )
    # Beam catch on hair crown
    d.ellipse([ox - 2, oy - hh - 2, ox + 7, oy - hh + 3], fill=(46, 40, 34))
    d.ellipse([ox - hw + 1, oy - 4, ox - hw + 5, oy + 4], fill=HAIR_GRAY)
    d.ellipse([ox + hw - 5, oy - 4, ox + hw - 1, oy + 4], fill=HAIR_GRAY)
    d.rectangle([ox - hw + 1, oy + 4, ox - hw + 3, oy + 9], fill=HAIR_GRAY)

    # Ear
    d.ellipse([ox - hw - 1, oy + 1, ox - hw + 3, oy + 7], fill=SKIN_DEEP)

    return img


def make_gif():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    frames = []
    durations = []

    # Nod schedule: (head_dy, duration_ms)
    nod_schedule = [
        (0, 120), (0, 120), (0, 120),  # 0-2: still
        (0, 120), (0, 120), (0, 150),  # 3-5: still, slight hold before nod
        (0, 100), (0, 100),            # 6-7: beginning of descent
        (1, 100), (1, 100),            # 8-9: arrived at nod
        (1, 200),                      # 10: hold at bottom
        (1, 100), (0, 100),            # 11-12: returning
        (0, 100), (0, 150),            # 13-14: returned
        (0, 500),                      # 15: long pause before loop
    ]

    for head_dy, dur in nod_schedule:
        frame = draw_frame(head_dy=head_dy)
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
