"""
Chud O'Bikeshedder — Product Manager / Requirements Wrangler pixel art avatar
64x64 animated GIF

Appearance:
- Khaki pants, light blue polo shirt
- Lanyard with badge
- Clipboard with sticky notes (in hand)
- Brown hair, slight receding hairline
- Smug smirk
- Slightly pudgy, corporate posture
- Animation: clipboard tapping, eyes shifting smugly
"""

from PIL import Image, ImageDraw
import os

OUT_PATH = "/mnt/data/hello-world/static/avatars/pm.gif"

# Color palette
C = {
    'bg':         (240, 240, 220),   # off-white background
    'skin':       (255, 210, 170),   # skin tone
    'skin_d':     (220, 175, 130),   # darker skin / shadow
    'hair':       (100, 65, 20),     # brown hair
    'hair_d':     (70, 40, 10),      # dark brown hair shadow
    'polo':       (130, 175, 215),   # light blue polo
    'polo_d':     (100, 140, 185),   # polo shadow/collar
    'polo_l':     (170, 210, 240),   # polo highlight
    'khaki':      (195, 175, 130),   # khaki pants
    'khaki_d':    (165, 148, 105),   # khaki shadow
    'lanyard':    (220, 50, 50),     # red lanyard
    'badge':      (255, 255, 255),   # white badge
    'badge_b':    (50, 50, 180),     # badge text/border
    'clipboard':  (240, 215, 160),   # clipboard tan
    'clipboard_d':(200, 175, 120),   # clipboard shadow
    'clip_metal': (160, 160, 160),   # clipboard metal clip
    'sticky1':    (255, 240, 80),    # yellow sticky
    'sticky2':    (255, 180, 80),    # orange sticky
    'sticky3':    (150, 230, 150),   # green sticky
    'pen':        (30, 30, 30),      # pen/lines
    'white':      (255, 255, 255),
    'black':      (10, 10, 10),
    'shoe':       (50, 35, 20),      # dark shoes
    'belt':       (60, 40, 20),      # brown belt
    'smirk':      (200, 100, 80),    # mouth
    'eye_w':      (255, 255, 255),
    'eye_b':      (30, 30, 30),
    'eyebrow':    (80, 50, 15),
    'cheek':      (255, 185, 150),   # slightly flushed cheek
    'shadow':     (180, 160, 120),   # general shadow
    'trans':      (0, 255, 0),       # transparent color (unused)
}

W, H = 64, 64


def draw_frame(eye_look='center', clipboard_y_offset=0, blink=False, eyebrow_raise=False):
    img = Image.new('RGB', (W, H), C['bg'])
    d = ImageDraw.Draw(img)

    # --- Background: subtle office grid lines ---
    for x in range(0, W, 8):
        d.line([(x, 0), (x, H)], fill=(230, 230, 210), width=1)
    for y in range(0, H, 8):
        d.line([(0, y), (W, y)], fill=(230, 230, 210), width=1)

    # === BODY ===

    # Legs / khaki pants
    # Left leg
    d.rectangle([(22, 42), (30, 58)], fill=C['khaki'])
    d.rectangle([(22, 42), (23, 58)], fill=C['khaki_d'])
    d.rectangle([(29, 42), (30, 56)], fill=C['khaki_d'])
    # Right leg
    d.rectangle([(33, 42), (41, 58)], fill=C['khaki'])
    d.rectangle([(40, 42), (41, 58)], fill=C['khaki_d'])

    # Belt
    d.rectangle([(21, 40), (42, 43)], fill=C['belt'])
    d.rectangle([(30, 40), (33, 43)], fill=C['clip_metal'])  # buckle

    # Shoes
    d.rectangle([(20, 57), (31, 61)], fill=C['shoe'])
    d.rectangle([(32, 57), (43, 61)], fill=C['shoe'])
    d.rectangle([(20, 60), (33, 62)], fill=C['black'])  # toe
    d.rectangle([(31, 60), (44, 62)], fill=C['black'])

    # Torso - polo shirt (slightly pudgy, wider in middle)
    d.polygon([(19, 22), (44, 22), (46, 40), (17, 40)], fill=C['polo'])
    # Polo shading
    d.rectangle([(19, 22), (21, 40)], fill=C['polo_d'])
    d.rectangle([(42, 22), (44, 40)], fill=C['polo_d'])
    d.rectangle([(22, 35), (41, 40)], fill=C['polo_d'])  # shirt hem shadow
    # Polo highlight
    d.rectangle([(25, 23), (38, 28)], fill=C['polo_l'])

    # Polo collar - V-neck
    d.polygon([(27, 22), (37, 22), (32, 29)], fill=C['polo_d'])
    d.line([(27, 22), (32, 29)], fill=C['polo_d'], width=1)
    d.line([(37, 22), (32, 29)], fill=C['polo_d'], width=1)

    # Polo shirt logo (tiny chest pocket / logo detail)
    d.rectangle([(35, 26), (39, 30)], fill=C['polo_d'])

    # === LANYARD & BADGE ===
    # Lanyard goes around neck, down to badge
    d.line([(29, 24), (26, 35)], fill=C['lanyard'], width=2)
    d.line([(35, 24), (37, 35)], fill=C['lanyard'], width=2)
    # Badge
    d.rectangle([(25, 33), (38, 41)], fill=C['badge'])
    d.rectangle([(25, 33), (38, 41)], outline=C['badge_b'], width=1)
    # Badge text lines (tiny)
    d.rectangle([(27, 35), (36, 36)], fill=C['badge_b'])  # name line
    d.rectangle([(27, 38), (33, 39)], fill=C['badge_b'])  # title line

    # === ARMS ===
    # Left arm (outstretched, holding clipboard)
    d.rectangle([(11, 23), (20, 30)], fill=C['polo'])
    d.rectangle([(11, 23), (12, 30)], fill=C['polo_d'])
    # Left hand
    d.ellipse([(9, 27), (14, 33)], fill=C['skin'])

    # Right arm (slightly raised, smug gesture)
    d.rectangle([(44, 23), (52, 30)], fill=C['polo'])
    d.rectangle([(51, 23), (53, 30)], fill=C['polo_d'])
    # Right hand - pointing finger
    d.ellipse([(49, 27), (54, 32)], fill=C['skin'])
    d.rectangle([(51, 22), (54, 28)], fill=C['skin'])  # pointing finger

    # === CLIPBOARD (left side) ===
    cy = 25 + clipboard_y_offset
    # Clipboard board
    d.rectangle([(2, cy), (15, cy+18)], fill=C['clipboard'])
    d.rectangle([(2, cy), (15, cy+18)], outline=C['clipboard_d'], width=1)
    # Metal clip at top
    d.rectangle([(5, cy-2), (12, cy+2)], fill=C['clip_metal'])
    d.rectangle([(7, cy-3), (10, cy+1)], fill=C['clip_metal'])
    # Paper on clipboard
    d.rectangle([(3, cy+2), (14, cy+17)], fill=C['white'])
    # Sticky notes on clipboard
    d.rectangle([(4, cy+3), (9, cy+8)], fill=C['sticky1'])
    d.rectangle([(8, cy+3), (13, cy+7)], fill=C['sticky2'])
    d.rectangle([(4, cy+8), (10, cy+13)], fill=C['sticky3'])
    # Lines on paper (requirements!)
    d.line([(4, cy+14), (13, cy+14)], fill=C['pen'], width=1)
    d.line([(4, cy+16), (11, cy+16)], fill=C['pen'], width=1)

    # === HEAD ===
    # Head shape (slightly round, a little chubby)
    d.ellipse([(22, 6), (42, 26)], fill=C['skin'])

    # Hair - receding, swept back
    d.rectangle([(22, 6), (42, 13)], fill=C['hair'])
    d.ellipse([(22, 6), (42, 18)], fill=C['hair'])
    # Receding hairline bald spot
    d.ellipse([(28, 7), (36, 14)], fill=C['skin'])
    # Hair detail
    d.line([(22, 10), (28, 8)], fill=C['hair_d'], width=1)
    d.line([(42, 10), (36, 8)], fill=C['hair_d'], width=1)

    # Ear
    d.ellipse([(20, 15), (25, 21)], fill=C['skin'])
    d.ellipse([(39, 15), (44, 21)], fill=C['skin'])
    d.ellipse([(21, 16), (24, 20)], fill=C['skin_d'])
    d.ellipse([(40, 16), (43, 20)], fill=C['skin_d'])

    # Neck
    d.rectangle([(28, 23), (36, 28)], fill=C['skin'])
    d.rectangle([(28, 23), (29, 28)], fill=C['skin_d'])
    d.rectangle([(35, 23), (36, 28)], fill=C['skin_d'])

    # Cheeks (slightly flushed / smug)
    d.ellipse([(23, 18), (27, 22)], fill=C['cheek'])
    d.ellipse([(37, 18), (41, 22)], fill=C['cheek'])

    # === FACE ===

    # Eyebrows
    brow_y = 12 if not eyebrow_raise else 11
    # Left eyebrow (arched smugly)
    d.line([(25, brow_y+1), (29, brow_y)], fill=C['eyebrow'], width=2)
    # Right eyebrow (one raised = classic smug)
    rb_y = brow_y - 1 if eyebrow_raise else brow_y
    d.line([(34, rb_y+1), (38, rb_y+2)], fill=C['eyebrow'], width=2)

    # Eyes
    if not blink:
        # Left eye
        d.ellipse([(25, 14), (30, 19)], fill=C['eye_w'])
        d.ellipse([(25, 14), (30, 19)], outline=C['black'], width=1)
        # Pupil/iris - looking direction
        if eye_look == 'center':
            d.ellipse([(27, 15), (29, 18)], fill=C['eye_b'])
        elif eye_look == 'right':
            d.ellipse([(28, 15), (30, 18)], fill=C['eye_b'])
        elif eye_look == 'left':
            d.ellipse([(25, 15), (27, 18)], fill=C['eye_b'])
        # Right eye
        d.ellipse([(34, 14), (39, 19)], fill=C['eye_w'])
        d.ellipse([(34, 14), (39, 19)], outline=C['black'], width=1)
        if eye_look == 'center':
            d.ellipse([(35, 15), (37, 18)], fill=C['eye_b'])
        elif eye_look == 'right':
            d.ellipse([(37, 15), (39, 18)], fill=C['eye_b'])
        elif eye_look == 'left':
            d.ellipse([(34, 15), (36, 18)], fill=C['eye_b'])
        # Eyelid crease (half-lidded smug look)
        d.line([(25, 15), (30, 15)], fill=C['skin_d'], width=1)
        d.line([(34, 15), (39, 15)], fill=C['skin_d'], width=1)
    else:
        # Blink - just lines
        d.line([(25, 16), (30, 16)], fill=C['eyebrow'], width=2)
        d.line([(34, 16), (39, 16)], fill=C['eyebrow'], width=2)

    # Nose - simple
    d.rectangle([(30, 18), (31, 21)], fill=C['skin_d'])
    d.ellipse([(29, 20), (33, 23)], fill=C['skin'])
    d.ellipse([(28, 21), (30, 23)], fill=C['skin_d'])  # left nostril
    d.ellipse([(32, 21), (34, 23)], fill=C['skin_d'])  # right nostril

    # Mouth - smug smirk (asymmetric)
    # Base smile
    d.arc([(27, 21), (37, 27)], start=10, end=170, fill=C['smirk'], width=2)
    # Smirk - right side pulled up more
    d.line([(35, 22), (37, 21)], fill=C['smirk'], width=2)
    # Teeth hint
    d.arc([(28, 22), (36, 27)], start=15, end=165, fill=C['white'], width=1)

    # Small chin dimple
    d.ellipse([(30, 24), (33, 26)], fill=C['skin_d'])

    return img


# Build animation frames
# Frame sequence:
# 1. Normal, looking center, clipboard neutral
# 2. Eyes shift right (scheming)
# 3. Eyes right, clipboard tap down
# 4. Eyes center, eyebrow raise
# 5. Blink
# 6. Normal, clipboard tap back up
# 7. Looking left (checking who's watching)
# 8. Back to smug center

frames_spec = [
    # (eye_look, clipboard_y_offset, blink, eyebrow_raise, duration_ms)
    ('center', 0,  False, False, 400),
    ('right',  0,  False, False, 300),
    ('right',  1,  False, False, 200),
    ('center', 0,  False, True,  400),
    ('center', 0,  True,  False, 120),
    ('center', 0,  False, False, 200),
    ('left',   1,  False, False, 300),
    ('center', 0,  False, True,  400),
]

frames = []
durations = []

for eye_look, cb_off, blink, eyebrow_raise, dur in frames_spec:
    frame = draw_frame(
        eye_look=eye_look,
        clipboard_y_offset=cb_off,
        blink=blink,
        eyebrow_raise=eyebrow_raise
    )
    frames.append(frame.convert('P', palette=Image.ADAPTIVE, colors=48))
    durations.append(dur)

# Save as animated GIF
frames[0].save(
    OUT_PATH,
    save_all=True,
    append_images=frames[1:],
    loop=0,
    duration=durations,
    optimize=False,
)

print(f"Saved {OUT_PATH}")
size = os.path.getsize(OUT_PATH)
print(f"File size: {size} bytes")

# Verify
check = Image.open(OUT_PATH)
print(f"Verified: size={check.size}, frames={check.n_frames}")
