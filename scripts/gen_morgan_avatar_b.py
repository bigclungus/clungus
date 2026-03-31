#!/usr/bin/env python3
"""
Morgan (they/them) — Avatar Option B
64x64 animated GIF, pure Pillow.

Visual concept: "The AITA Post"
Morgan is a silhouette hunched over a glowing laptop in a dark room,
face bathed in sickly green CRT-style light. The monitor shows
scrolling text: "AITA", "NTA but...", "ESH honestly", "this.",
cycling through Reddit AITA verdicts. A blinking cursor pulses.
The room is pitch dark except for the screen glow.
Color palette: near-black background, harsh green terminal glow,
pale sickly face, the silhouette of someone who has been online since 2019.
Animation: text lines scroll upward on the monitor, cursor blinks.
"""

from PIL import Image, ImageDraw, ImageFont
import math

W, H = 64, 64

# --- Palette ---
BG           = (8, 6, 10, 255)        # void
DESK         = (22, 18, 28, 255)      # dark desk surface
DESK_SHADOW  = (14, 12, 18, 255)      # desk shadow
LAPTOP_LID   = (30, 28, 36, 255)      # laptop lid (dark)
LAPTOP_BEZEL = (20, 20, 26, 255)      # screen bezel
SCREEN_BG    = (8, 18, 10, 255)       # screen dark green bg
SCREEN_GLOW  = (30, 80, 35, 255)      # screen glow color
TEXT_GREEN   = (80, 200, 90, 255)     # terminal text green
CURSOR_COL   = (120, 255, 130, 255)   # cursor bright
BODY_SIL     = (28, 24, 34, 255)      # body silhouette (almost black)
BODY_GLOW    = (18, 50, 22, 255)      # glow-lit side of body
HEAD_SIL     = (32, 28, 38, 255)      # head silhouette
HEAD_GLOW    = (20, 55, 25, 255)      # glow on face (sickly green)
FACE_PALE    = (140, 165, 135, 255)   # face lit by screen
EYE_HOLLOW   = (50, 80, 52, 255)      # sunken eye sockets
HAIR_SIL     = (18, 15, 22, 255)      # hair, darker than head
CHAIR_BACK   = (25, 22, 30, 255)      # chair back
# Screen glow spill on desk
GLOW_SPILL   = (15, 40, 18, 60)


# Lines to scroll on the screen
SCREEN_LINES = [
    "AITA?",
    "NTA but...",
    "ESH honestly",
    "this.",
    "its giving",
    "No because",
    "I hear you AND",
    "r/AITAH",
    "we need to",
    "I just feel",
    "hold space",
    "not in a place",
    "bandwidth",
    "do better",
    "sit with it",
]


def draw_tiny_text(draw, x, y, text, color, max_w=None):
    """Draw 1-pixel-per-character text manually (extremely tiny)."""
    # Each character is 3px wide, 5px tall with 1px gap
    char_w = 4
    char_h = 5
    # Simple 3x5 pixel font for a handful of characters
    GLYPHS = {
        'A': [(0,2),(1,0),(2,2),(0,3),(1,3),(2,3),(0,4),(2,4)],
        'I': [(0,0),(1,0),(2,0),(1,1),(1,2),(1,3),(0,4),(1,4),(2,4)],
        'T': [(0,0),(1,0),(2,0),(1,1),(1,2),(1,3),(1,4)],
        'E': [(0,0),(1,0),(2,0),(0,1),(0,2),(1,2),(0,3),(0,4),(1,4),(2,4)],
        'S': [(1,0),(2,0),(0,1),(0,2),(1,2),(2,3),(0,4),(1,4)],
        'H': [(0,0),(2,0),(0,1),(2,1),(0,2),(1,2),(2,2),(0,3),(2,3),(0,4),(2,4)],
        'N': [(0,0),(2,0),(0,1),(1,1),(2,1),(0,2),(2,2),(0,3),(2,3),(0,4),(2,4)],
        'b': [(0,0),(0,1),(0,2),(1,2),(2,2),(0,3),(2,3),(0,4),(1,4),(2,4)],
        'u': [(0,0),(2,0),(0,1),(2,1),(0,2),(2,2),(0,3),(2,3),(1,4),(2,4)],
        't': [(0,0),(1,0),(2,0),(1,1),(1,2),(1,3),(0,4),(1,4)],
        '.': [(1,3),(1,4)],
        '?': [(0,0),(1,0),(2,0),(2,1),(1,2),(1,3),(1,4)],
        'o': [(1,0),(0,1),(2,1),(0,2),(2,2),(0,3),(2,3),(1,4)],
        'n': [(0,0),(0,1),(0,2),(1,0),(2,1),(2,2),(0,3),(2,3),(0,4),(2,4)],
        'e': [(0,1),(1,0),(2,1),(0,2),(1,2),(2,2),(0,3),(1,4),(2,3)],
        's': [(1,0),(2,0),(0,1),(0,2),(1,2),(2,3),(1,4),(0,4)],
        't': [(0,0),(1,0),(2,0),(1,1),(1,2),(1,3),(0,4),(1,4)],
        'l': [(0,0),(1,0),(1,1),(1,2),(1,3),(0,4),(1,4),(2,4)],
        'y': [(0,0),(2,0),(0,1),(2,1),(1,2),(1,3),(1,4)],
        'h': [(0,0),(0,1),(0,2),(1,2),(2,2),(0,3),(2,3),(0,4),(2,4)],
        'i': [(1,0),(1,2),(1,3),(1,4)],
        'g': [(1,0),(2,0),(0,1),(0,2),(1,2),(2,2),(2,3),(1,4),(0,4)],
        'v': [(0,0),(2,0),(0,1),(2,1),(0,2),(2,2),(1,3),(1,4)],
        'r': [(0,0),(0,1),(0,2),(1,2),(2,1),(0,3),(0,4)],
        '/': [(2,0),(1,1),(1,2),(0,3),(0,4)],
        'w': [(0,0),(2,0),(0,1),(2,1),(0,2),(1,2),(2,2),(0,3),(2,3),(1,4)],
        'd': [(1,0),(2,1),(0,2),(2,2),(0,3),(2,3),(1,4),(2,4)],
        'k': [(0,0),(2,0),(0,1),(1,1),(0,2),(1,2),(0,3),(2,3),(0,4),(2,4)],
        'a': [(1,0),(2,0),(2,1),(0,2),(1,2),(2,2),(0,3),(2,3),(1,4),(2,4)],
        'c': [(1,0),(2,0),(0,1),(0,2),(0,3),(1,4),(2,4)],
        'p': [(0,0),(1,0),(2,0),(0,1),(2,1),(0,2),(1,2),(2,2),(0,3),(0,4)],
        'f': [(1,0),(2,0),(0,1),(0,2),(1,2),(0,3),(0,4)],
        'j': [(2,0),(2,1),(2,2),(2,3),(0,4),(1,4)],
        ' ': [],
    }
    cx = x
    for ch in text.lower():
        if max_w and (cx - x) > max_w:
            break
        glyph = GLYPHS.get(ch, GLYPHS.get(' ', []))
        for (gx, gy) in glyph:
            px, py = cx + gx, y + gy
            if 0 <= px < W and 0 <= py < H:
                draw.point((px, py), fill=color)
        cx += char_w
    return cx


def make_frame(t, cursor_on):
    """
    t: 0.0..1.0 animation cycle
    cursor_on: bool — blinking cursor state
    """
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # --- Desk surface ---
    draw.rectangle([(0, 44), (64, 64)], fill=DESK)
    draw.rectangle([(0, 44), (64, 46)], fill=DESK_SHADOW)

    # --- Glow spill on desk from screen ---
    glow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow_layer)
    glow_alpha = int(40 + 20 * math.sin(t * 2 * math.pi * 0.3))
    gdraw.ellipse([(10, 40), (54, 58)], fill=(*GLOW_SPILL[:3], glow_alpha))
    img = Image.alpha_composite(img, glow_layer)
    draw = ImageDraw.Draw(img)

    # --- Chair back (behind body) ---
    draw.rectangle([(18, 28), (46, 44)], fill=CHAIR_BACK)
    draw.rectangle([(20, 27), (44, 29)], fill=(30, 27, 36, 255))

    # --- Body silhouette (hunched forward) ---
    # Slouch: body leans toward screen
    body_pts = [
        (20, 44),   # bottom left
        (16, 32),   # left shoulder (hunched forward/down)
        (22, 26),   # left neck
        (30, 24),   # chest top
        (38, 26),   # right neck
        (46, 30),   # right shoulder
        (44, 44),   # bottom right
    ]
    draw.polygon(body_pts, fill=BODY_SIL)
    # Screen glow hits left side of body
    glow_body = [
        (16, 32), (22, 26), (30, 24), (27, 32), (20, 36)
    ]
    draw.polygon(glow_body, fill=BODY_GLOW)

    # --- Head (tilted down toward screen, hunched) ---
    hx, hy = 30, 22
    draw.ellipse([(hx - 6, hy - 7), (hx + 6, hy + 5)], fill=HEAD_SIL)
    # Glow on face from screen (left/front side)
    draw.ellipse([(hx - 6, hy - 5), (hx + 2, hy + 4)], fill=HEAD_GLOW)
    draw.ellipse([(hx - 5, hy - 4), (hx + 1, hy + 3)], fill=FACE_PALE)

    # Eyes: hollow sunken looking at screen (downward gaze)
    draw.line([(hx - 4, hy - 1), (hx - 1, hy - 1)], fill=EYE_HOLLOW, width=1)
    draw.line([(hx + 1, hy - 1), (hx + 4, hy - 1)], fill=EYE_HOLLOW, width=1)

    # --- Hair ---
    draw.ellipse([(hx - 6, hy - 7), (hx + 6, hy - 2)], fill=HAIR_SIL)

    # --- Hands on keyboard area ---
    draw.ellipse([(16, 42), (22, 47)], fill=HEAD_GLOW)   # left hand
    draw.ellipse([(36, 42), (42, 47)], fill=BODY_SIL)    # right hand (in shadow)

    # --- Laptop body (on desk) ---
    # Keyboard base
    draw.rectangle([(14, 44), (50, 50)], fill=(25, 22, 32, 255))
    draw.rectangle([(15, 45), (49, 49)], fill=(30, 27, 38, 255))
    # Small keys suggestion
    for kx in range(17, 48, 4):
        draw.rectangle([(kx, 46), (kx + 2, 48)], fill=(20, 18, 26, 255))

    # --- Laptop lid/screen ---
    # Lid angled slightly back — appears as rectangle above keyboard
    screen_x1, screen_y1 = 13, 14
    screen_x2, screen_y2 = 51, 44
    draw.rectangle([(screen_x1, screen_y1), (screen_x2, screen_y2)], fill=LAPTOP_LID)
    # Bezel
    draw.rectangle([(screen_x1 + 2, screen_y1 + 2), (screen_x2 - 2, screen_y2 - 2)], fill=LAPTOP_BEZEL)
    # Screen area
    sx1, sy1, sx2, sy2 = screen_x1 + 3, screen_y1 + 3, screen_x2 - 3, screen_y2 - 3
    draw.rectangle([(sx1, sy1), (sx2, sy2)], fill=SCREEN_BG)

    # Screen glow pulse
    glow_int = int(15 + 8 * math.sin(t * 2 * math.pi * 0.5))
    screen_glow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sgl_draw = ImageDraw.Draw(screen_glow_layer)
    sgl_draw.rectangle([(sx1, sy1), (sx2, sy2)], fill=(*SCREEN_GLOW[:3], glow_int))
    img = Image.alpha_composite(img, screen_glow_layer)
    draw = ImageDraw.Draw(img)

    # --- Scrolling text on screen ---
    # Visible area: sx1..sx2, sy1..sy2 (~30x26 px)
    # Show 4 lines, scroll by t
    screen_h = sy2 - sy1
    line_h = 7  # pixels per line
    n_visible = screen_h // line_h

    # Which lines are visible — scroll index based on t
    total_lines = len(SCREEN_LINES)
    # scroll_offset: how many pixels we've scrolled
    scroll_px = (t * total_lines * line_h) % (total_lines * line_h)
    start_line_idx = int(scroll_px // line_h)
    sub_px = int(scroll_px % line_h)

    for row in range(n_visible + 1):
        line_idx = (start_line_idx + row) % total_lines
        line_text = SCREEN_LINES[line_idx]
        line_y = sy1 + row * line_h - sub_px
        if line_y > sy2:
            break
        if line_y + line_h < sy1:
            continue
        # Brightness: top line fading in, bottom fading out
        brightness_t = 1.0
        if row == 0:
            brightness_t = sub_px / line_h
        elif row == n_visible:
            brightness_t = 1.0 - (sub_px / line_h)
        r = int(TEXT_GREEN[0] * brightness_t)
        g = int(TEXT_GREEN[1] * brightness_t)
        b = int(TEXT_GREEN[2] * brightness_t)
        draw_tiny_text(draw, sx1 + 1, line_y, line_text, (r, g, b, 220),
                       max_w=(sx2 - sx1 - 2))

    # --- Blinking cursor on last visible line ---
    if cursor_on:
        cur_line = n_visible - 1
        cur_y = sy1 + cur_line * line_h - sub_px
        if sy1 <= cur_y <= sy2 - 2:
            draw.rectangle([(sx1 + 1, cur_y + 4), (sx1 + 3, cur_y + 6)], fill=CURSOR_COL)

    return img.convert("RGBA")


def build_frames():
    frames = []
    durations = []

    # 24 frames, ~3s loop
    n_frames = 24
    for i in range(n_frames):
        t = i / n_frames
        # Cursor blinks at ~4hz (every 6 frames at 24fps equivalent ~250ms)
        cursor_on = (i // 3) % 2 == 0
        frames.append(make_frame(t, cursor_on))
        durations.append(125)

    return frames, durations


if __name__ == "__main__":
    out_path = "/mnt/data/hello-world/static/avatars/morgan_b.gif"
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
