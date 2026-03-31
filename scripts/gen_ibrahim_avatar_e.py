#!/usr/bin/env python3
"""
Ibrahim the Immovable — Option E: The Arbiter at Rest
64x64 animated GIF, isometric 3/4 bust, pure Pillow, loop=0, disposal=2

Visual:
- Deep charcoal suit, no status signaling
- Older face, strong features, calm settled presence
- Gaze directed slightly left-downward (toward off-frame document/table)
- One hand resting flat on a warm dark surface
- Warm dark amber background — polished wood / formal chamber

Animation: slow breath (1px chest movement, 8-frame cycle),
           subtle gaze refocus at frame 12-13
"""

from PIL import Image, ImageDraw
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/hiring-manager_e.gif"
SIZE = (64, 64)

# --- Palette ---
BG_DEEP         = (45, 28, 12)
BG_WARM         = (72, 46, 20)
SUIT_DARK       = (28, 28, 36)
SUIT_MID        = (42, 42, 52)
SUIT_CATCH      = (60, 60, 72)
SHIRT_COL       = (198, 192, 182)
TIE_DARK        = (22, 16, 20)
SKIN_DEEP       = (72, 46, 28)
SKIN_MID        = (108, 74, 50)
SKIN_LIGHT      = (132, 96, 68)
SKIN_SHADOW     = (62, 38, 22)
EYE_WHITE       = (185, 168, 150)
EYE_IRIS        = (52, 38, 26)
EYE_DARK        = (16, 10, 6)
LID             = (76, 50, 32)
BROW_COL        = (48, 36, 22)
HAIR_DARK       = (30, 24, 18)
HAIR_GRAY       = (98, 90, 82)
HAND_MAIN       = (96, 65, 44)
HAND_SHADOW     = (68, 44, 28)
SURFACE         = (38, 22, 10)
SURFACE_EDGE    = (58, 36, 16)
SLEEVE          = (28, 28, 36)


def draw_background(img):
    for y in range(64):
        for x in range(64):
            tx = 1.0 - (x / 63.0) * 0.5
            ty = (y / 63.0) * 0.4
            t = max(0.0, min(1.0, tx * 0.6 + ty * 0.4))
            r = int(BG_DEEP[0] + (BG_WARM[0] - BG_DEEP[0]) * t)
            g = int(BG_DEEP[1] + (BG_WARM[1] - BG_DEEP[1]) * t)
            b = int(BG_DEEP[2] + (BG_WARM[2] - BG_DEEP[2]) * t)
            img.putpixel((x, y), (r, g, b, 255))


def draw_frame(chest_offset: int, gaze_down: bool) -> Image.Image:
    img = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    draw_background(img)
    d = ImageDraw.Draw(img)

    # Surface / desk
    d.rectangle([0, 51, 63, 63], fill=SURFACE)
    d.line([(0, 51), (63, 51)], fill=SURFACE_EDGE)

    # Figure anchor
    ox = 33
    oy = 26

    # --- Torso ---
    ty = oy + 16 + chest_offset

    d.polygon([
        (ox - 15, ty + 2), (ox - 2, ty - 1),
        (ox - 2, ty + 22), (ox - 15, ty + 24),
    ], fill=SUIT_DARK)
    d.polygon([
        (ox - 2, ty - 1), (ox + 13, ty + 2),
        (ox + 11, ty + 22), (ox - 2, ty + 22),
    ], fill=SUIT_MID)
    d.polygon([
        (ox - 19, ty - 1), (ox - 10, ty - 4),
        (ox - 2, ty - 1), (ox - 8, ty + 3),
    ], fill=SUIT_DARK)
    d.polygon([
        (ox - 2, ty - 1), (ox + 9, ty - 4),
        (ox + 16, ty - 1), (ox + 8, ty + 3),
    ], fill=SUIT_CATCH)
    d.polygon([
        (ox - 7, ty + 1), (ox - 2, ty - 1),
        (ox - 2, ty + 7), (ox - 6, ty + 9),
    ], fill=SUIT_MID)
    d.polygon([
        (ox - 2, ty - 1), (ox + 4, ty + 1),
        (ox + 3, ty + 9), (ox - 2, ty + 7),
    ], fill=SUIT_CATCH)
    d.polygon([
        (ox - 3, ty - 1), (ox + 3, ty - 1),
        (ox + 2, ty + 4), (ox - 2, ty + 4),
    ], fill=SHIRT_COL)
    d.polygon([
        (ox - 1, ty + 1), (ox + 1, ty + 1),
        (ox + 1, ty + 11), (ox, ty + 13),
        (ox - 1, ty + 11),
    ], fill=TIE_DARK)

    # --- Hand resting on surface ---
    hx = ox + 6
    hy = 53
    d.polygon([
        (hx - 4, ty + 18 + chest_offset),
        (hx + 4, ty + 16 + chest_offset),
        (hx + 9, hy - 2), (hx + 1, hy),
    ], fill=SLEEVE)
    d.ellipse([hx - 3, hy - 3, hx + 12, hy + 2], fill=HAND_MAIN)
    d.line([(hx, hy - 2), (hx + 10, hy - 2)], fill=HAND_SHADOW)
    for fx in [hx + 3, hx + 6, hx + 9]:
        d.point((fx, hy - 1), fill=HAND_SHADOW)
    d.ellipse([hx - 4, hy - 4, hx, hy - 1], fill=HAND_MAIN)

    # --- Neck ---
    d.polygon([
        (ox - 4, oy + 12), (ox + 3, oy + 12),
        (ox + 2, oy + 17), (ox - 3, oy + 17),
    ], fill=SKIN_MID)
    d.line([(ox - 4, oy + 12), (ox - 3, oy + 17)], fill=SKIN_SHADOW)

    # --- Head ---
    hw, hh = 15, 17
    d.rounded_rectangle(
        [ox - hw, oy - hh, ox + hw, oy + hh],
        radius=5, fill=SKIN_MID,
    )
    d.polygon([
        (ox - hw, oy - hh + 5), (ox - hw + 3, oy - hh + 2),
        (ox - hw + 3, oy + hh - 2), (ox - hw, oy + hh - 5),
    ], fill=SKIN_SHADOW)
    d.ellipse([ox + 2, oy - 2, ox + 8, oy + 4], fill=SKIN_LIGHT)
    d.polygon([
        (ox - 5, oy + hh - 2), (ox + 5, oy + hh - 2),
        (ox + 2, oy + hh + 1), (ox - 2, oy + hh + 1),
    ], fill=SKIN_SHADOW)

    # Brow
    by = oy - 5
    d.line([(ox - 7, by - 1), (ox - 1, by - 2)], fill=SKIN_SHADOW)
    d.line([(ox - 1, by - 2), (ox + 4, by - 1)], fill=SKIN_SHADOW)
    d.line([(ox - 6, by - 1), (ox - 2, by - 2)], fill=BROW_COL)
    d.line([(ox, by - 2), (ox + 4, by - 1)], fill=BROW_COL)

    # Eyes
    eye_y = oy
    ley_x = ox - 6
    rey_x = ox + 2
    pupil_dy = 1 if gaze_down else 0

    d.ellipse([ley_x - 3, eye_y - 2, ley_x + 3, eye_y + 2], fill=EYE_WHITE)
    d.ellipse([ley_x - 2, eye_y - 1 + pupil_dy, ley_x + 2, eye_y + 1 + pupil_dy], fill=EYE_IRIS)
    d.point((ley_x, eye_y + pupil_dy), fill=EYE_DARK)
    d.line([(ley_x - 3, eye_y - 2), (ley_x + 3, eye_y - 2)], fill=LID)
    d.line([(ley_x - 2, eye_y + 2), (ley_x + 2, eye_y + 2)], fill=SKIN_SHADOW)

    d.ellipse([rey_x - 2, eye_y - 2, rey_x + 3, eye_y + 2], fill=EYE_WHITE)
    d.ellipse([rey_x - 1, eye_y - 1 + pupil_dy, rey_x + 2, eye_y + 1 + pupil_dy], fill=EYE_IRIS)
    d.point((rey_x, eye_y + pupil_dy), fill=EYE_DARK)
    d.line([(rey_x - 2, eye_y - 2), (rey_x + 3, eye_y - 2)], fill=LID)

    # Nose
    ny = oy + 4
    d.line([(ox - 1, ny - 2), (ox - 2, ny + 1)], fill=SKIN_SHADOW)
    d.ellipse([ox - 4, ny, ox - 1, ny + 2], fill=SKIN_SHADOW)
    d.point((ox + 1, ny + 1), fill=SKIN_SHADOW)

    # Mouth — closed, neutral
    my = oy + 8
    d.line([(ox - 4, my), (ox + 3, my)], fill=SKIN_SHADOW)
    d.arc([ox - 4, my, ox + 3, my + 2], start=0, end=180, fill=SKIN_MID)
    d.point((ox - 4, my), fill=SKIN_SHADOW)
    d.point((ox + 3, my), fill=SKIN_SHADOW)

    # Hair
    d.rounded_rectangle(
        [ox - hw + 1, oy - hh - 2, ox + hw - 1, oy - hh + 5],
        radius=3, fill=HAIR_DARK,
    )
    d.ellipse([ox - 5, oy - hh - 2, ox + 4, oy - hh + 3], fill=HAIR_GRAY)
    d.ellipse([ox - hw + 1, oy - 4, ox - hw + 5, oy + 4], fill=HAIR_GRAY)
    d.ellipse([ox + hw - 5, oy - 4, ox + hw - 1, oy + 4], fill=HAIR_GRAY)
    d.rectangle([ox - hw + 1, oy + 4, ox - hw + 3, oy + 9], fill=HAIR_GRAY)

    # Ear
    d.ellipse([ox - hw - 1, oy + 1, ox - hw + 3, oy + 7], fill=SKIN_DEEP)
    d.point((ox - hw + 1, oy + 4), fill=SKIN_SHADOW)

    return img


def make_gif():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    frames = []
    durations = []

    # 16 frames: two breath cycles, gaze refocus at frames 12-13
    breath_pattern = [0, 0, 1, 1, 1, 1, 0, 0,
                      0, 0, 1, 1, 1, 1, 0, 0]

    for i in range(16):
        chest = breath_pattern[i]
        gaze = (i in (12, 13))
        frame = draw_frame(chest_offset=chest, gaze_down=gaze)
        frames.append(frame.convert("RGB").quantize(colors=64))
        durations.append(140 if not gaze else 180)

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
