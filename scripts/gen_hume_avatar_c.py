#!/usr/bin/env python3
"""
Generate avatar for David Hume — Option C: BRUTALIST DATA TERMINAL.

Concept: Hume so empiricist he's abolished his own face.
A CRT terminal screen displaying "WHERE IS THE EVIDENCE?" in phosphor green.
Scanlines flicker. A cursor blinks. The "portrait" is pure data output.
Cold, machine, uncompromising — the logical endpoint of hard empiricism.

64x64 animated GIF, 16 frames.
"""

from PIL import Image, ImageDraw, ImageFont
import math
import random

# Palette — CRT phosphor terminal
BG_BLACK      = (4,   8,   4)     # near-black with green tint
CRT_GREEN     = (0,   255, 70)    # phosphor green
CRT_DIM       = (0,   140, 38)    # dim phosphor
CRT_BRIGHT    = (140, 255, 140)   # bright phosphor highlight
SCANLINE      = (2,   12,  2)     # dark scanline stripe
CURSOR_ON     = (0,   255, 70)    # cursor blink on
BORDER_GREEN  = (0,   80,  20)    # CRT bezel inner glow
BEZEL         = (18,  22,  18)    # dark grey CRT bezel
SCREEN_TINT   = (0,   20,  5)     # screen background (not pure black)

W, H = 64, 64

# Text content — scrolling lines, each frame shifts
LINES = [
    "WHERE IS",
    "THE",
    "EVIDENCE",
    "?",
    "",
    "CLAIM:",
    "UNVERIFIED",
    "",
    "> _",
]

# Pixel font: 3x5 bitmap for capital letters + digits + symbols
# Each char is a list of 5 rows, each row is a 3-bit integer (bit2=left, bit0=right)
FONT = {
    'W': [0b111, 0b101, 0b101, 0b111, 0b010],
    'H': [0b101, 0b101, 0b111, 0b101, 0b101],
    'E': [0b111, 0b100, 0b110, 0b100, 0b111],
    'R': [0b110, 0b101, 0b110, 0b101, 0b101],
    'I': [0b111, 0b010, 0b010, 0b010, 0b111],
    'S': [0b111, 0b100, 0b111, 0b001, 0b111],
    'T': [0b111, 0b010, 0b010, 0b010, 0b010],
    'N': [0b101, 0b111, 0b111, 0b101, 0b101],
    'C': [0b111, 0b100, 0b100, 0b100, 0b111],
    'D': [0b110, 0b101, 0b101, 0b101, 0b110],
    'V': [0b101, 0b101, 0b101, 0b101, 0b010],
    'A': [0b010, 0b101, 0b111, 0b101, 0b101],
    'L': [0b100, 0b100, 0b100, 0b100, 0b111],
    'M': [0b101, 0b111, 0b111, 0b101, 0b101],
    'F': [0b111, 0b100, 0b110, 0b100, 0b100],
    'O': [0b111, 0b101, 0b101, 0b101, 0b111],
    'P': [0b110, 0b101, 0b110, 0b100, 0b100],
    'U': [0b101, 0b101, 0b101, 0b101, 0b111],
    'B': [0b110, 0b101, 0b110, 0b101, 0b110],
    'K': [0b101, 0b101, 0b110, 0b101, 0b101],
    'Y': [0b101, 0b101, 0b010, 0b010, 0b010],
    'G': [0b111, 0b100, 0b101, 0b101, 0b111],
    'X': [0b101, 0b101, 0b010, 0b101, 0b101],
    'Z': [0b111, 0b001, 0b010, 0b100, 0b111],
    'J': [0b111, 0b010, 0b010, 0b110, 0b010],
    'Q': [0b010, 0b101, 0b101, 0b111, 0b001],
    '?': [0b110, 0b001, 0b010, 0b000, 0b010],
    ':': [0b000, 0b010, 0b000, 0b010, 0b000],
    '>': [0b100, 0b010, 0b001, 0b010, 0b100],
    '_': [0b000, 0b000, 0b000, 0b000, 0b111],
    ' ': [0b000, 0b000, 0b000, 0b000, 0b000],
}


def draw_char(d: ImageDraw.ImageDraw, ch: str, x: int, y: int,
              color: tuple, scale: int = 1):
    """Draw a single pixel-font character at (x,y)."""
    bitmap = FONT.get(ch.upper(), FONT.get(' '))
    for row_idx, row_bits in enumerate(bitmap):
        for col in range(3):
            if row_bits & (1 << (2 - col)):
                px = x + col * scale
                py = y + row_idx * scale
                if scale == 1:
                    d.point((px, py), fill=color)
                else:
                    d.rectangle([px, py, px+scale-1, py+scale-1], fill=color)


def draw_text_line(d: ImageDraw.ImageDraw, text: str, x: int, y: int,
                   color: tuple, scale: int = 1):
    """Draw a string of pixel-font text."""
    cx = x
    for ch in text:
        draw_char(d, ch, cx, y, color, scale)
        cx += (3 + 1) * scale  # char width + 1px gap


def make_frame(frame_idx: int) -> Image.Image:
    img = Image.new("RGB", (W, H), BG_BLACK)
    d = ImageDraw.Draw(img)

    # CRT bezel
    d.rectangle([0, 0, W-1, H-1], outline=BEZEL, width=2)

    # Screen area (inside bezel)
    d.rectangle([2, 2, W-3, H-3], fill=SCREEN_TINT)

    # Inner CRT glow border
    d.rectangle([2, 2, W-3, H-3], outline=BORDER_GREEN, width=1)

    # Scanlines — every other row slightly darker
    for y in range(2, H-2, 2):
        d.line([(3, y), (W-4, y)], fill=SCANLINE)

    # Scroll offset: every 4 frames scroll up by 1 line
    scroll = frame_idx // 4

    # Draw text lines — scroll through LINES
    line_height = 8  # 5px char + 3px gap
    start_y = 6

    for i, line in enumerate(LINES):
        y = start_y + i * line_height - (scroll % (len(LINES) * line_height))
        if 3 <= y <= H - 10:
            # Vary brightness: top lines dimmer (older output)
            age = (len(LINES) - i + scroll) % len(LINES)
            if age < 2:
                col = CRT_BRIGHT
            elif age < 4:
                col = CRT_GREEN
            else:
                col = CRT_DIM
            draw_text_line(d, line, 5, y, col, scale=1)

    # Wrap-around: also draw lines that scroll back into view from bottom
    for i, line in enumerate(LINES):
        y = start_y + i * line_height - (scroll % (len(LINES) * line_height)) + len(LINES) * line_height
        if 3 <= y <= H - 10:
            draw_text_line(d, line, 5, y, CRT_DIM, scale=1)

    # Cursor blink on ">" prompt line (last line in LINES is "> _")
    # Cursor blinks every 3 frames
    cursor_on = (frame_idx % 6) < 3
    # Find the "> _" line position
    prompt_line_idx = len(LINES) - 1
    prompt_y = start_y + prompt_line_idx * line_height - (scroll % (len(LINES) * line_height))
    if 3 <= prompt_y <= H - 10 and cursor_on:
        # Draw solid cursor block at position after "> "
        cursor_x = 5 + 2 * 4  # after "> "
        d.rectangle([cursor_x, prompt_y, cursor_x + 2, prompt_y + 4], fill=CURSOR_ON)

    # Occasional glitch: random horizontal noise line
    if frame_idx % 7 == 3:
        glitch_y = random.randint(8, H - 12)
        for gx in range(4, W - 4):
            if random.random() < 0.4:
                d.point((gx, glitch_y), fill=CRT_DIM)

    # Phosphor glow effect: a few scattered bright pixels near text areas
    if frame_idx % 3 == 0:
        for _ in range(3):
            gx = random.randint(4, W - 5)
            gy = random.randint(4, H - 5)
            d.point((gx, gy), fill=CRT_DIM)

    # Top status bar — static header
    d.rectangle([2, 2, W-3, 7], fill=(0, 15, 5))
    draw_text_line(d, "HUME v1.0", 4, 3, CRT_DIM, scale=1)

    return img


def main():
    random.seed(42)  # deterministic glitch

    frames = []
    durations = []

    for i in range(16):
        f = make_frame(i)
        frames.append(f)
        # Variable timing: cursor blink frames shorter, scroll pauses longer
        if i % 4 == 0:
            durations.append(200)  # slight pause at scroll step
        else:
            durations.append(120)

    out_path = "/mnt/data/hello-world/static/avatars/hume_c.gif"

    frames[0].save(
        out_path,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )

    print(f"Saved: {out_path}")
    print(f"Frames: {len(frames)}, size: 64x64")

    verify = Image.open(out_path)
    print(f"Verified: format={verify.format}, n_frames={getattr(verify, 'n_frames', 1)}, "
          f"size={verify.size}, mode={verify.mode}")


if __name__ == "__main__":
    main()
