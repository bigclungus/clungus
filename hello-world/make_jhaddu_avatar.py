"""
Jhaddu — Enterprise Pattern Evangelist pixel art avatar
64x64 animated GIF

Appearance:
- South Asian man, brown skin, dark hair with neat side part
- Small neat mustache
- Crisp light blue collared shirt
- Slightly smug/confident expression
- Laptop in front of him with faint UML class diagram on screen
- Background: off-white office, subtle grid
- Animation: eyes dart left-right confidently, occasional nod, typing fingers
"""

from PIL import Image, ImageDraw
import os

OUT_PATH = "/mnt/data/hello-world/static/avatars/jhaddu.gif"

# Color palette
C = {
    'bg':         (245, 245, 238),   # off-white background
    'bg_grid':    (232, 232, 224),   # grid lines
    'skin':       (195, 140, 90),    # South Asian brown skin
    'skin_d':     (160, 108, 65),    # darker skin / shadow
    'skin_l':     (215, 165, 115),   # lighter skin highlight
    'hair':       (25, 18, 12),      # very dark brown / near black hair
    'hair_d':     (10, 6, 3),        # hair shadow
    'mustache':   (20, 14, 8),       # mustache - same near black
    'shirt':      (140, 185, 225),   # light blue shirt
    'shirt_d':    (108, 148, 190),   # shirt shadow
    'shirt_l':    (175, 215, 245),   # shirt highlight
    'collar':     (120, 165, 205),   # collar shadow
    'shirt_btn':  (100, 140, 180),   # button placket
    'laptop':     (55, 55, 60),      # laptop body dark
    'laptop_l':   (75, 75, 82),      # laptop lid lighter edge
    'screen':     (30, 35, 55),      # screen dark background
    'screen_glow':(50, 60, 90),      # screen slight glow
    'uml_line':   (80, 160, 200),    # UML diagram lines (cyan-ish)
    'uml_box':    (60, 120, 160),    # UML box outlines
    'uml_txt':    (100, 190, 230),   # UML text / labels
    'key':        (200, 200, 195),   # laptop keys
    'key_d':      (170, 170, 165),   # key shadow
    'eye_w':      (250, 248, 240),   # eye white
    'eye_b':      (25, 18, 12),      # iris/pupil
    'eye_shine':  (220, 230, 245),   # eye highlight
    'eyebrow':    (22, 15, 8),       # dark eyebrow
    'mouth':      (155, 90, 65),     # mouth/lips
    'teeth':      (245, 242, 235),   # teeth
    'white':      (255, 255, 255),
    'black':      (8, 8, 8),
    'shadow':     (170, 125, 80),    # under-chin shadow
}

W, H = 64, 64


def draw_uml_on_screen(d, screen_x, screen_y, sw, sh, variant=0):
    """Draw tiny UML class diagram boxes on the laptop screen."""
    # Background already drawn — add boxes and lines
    # Central box
    cx = screen_x + sw // 2

    if variant == 0:
        # Three boxes arranged in hierarchy
        # Top box
        d.rectangle([(cx-5, screen_y+1), (cx+4, screen_y+4)], outline=C['uml_box'], width=1)
        d.line([(cx-4, screen_y+2), (cx+3, screen_y+2)], fill=C['uml_txt'], width=1)
        # Middle left box
        d.rectangle([(cx-10, screen_y+6), (cx-2, screen_y+9)], outline=C['uml_box'], width=1)
        d.line([(cx-9, screen_y+7), (cx-3, screen_y+7)], fill=C['uml_txt'], width=1)
        # Middle right box
        d.rectangle([(cx+1, screen_y+6), (cx+9, screen_y+9)], outline=C['uml_box'], width=1)
        d.line([(cx+2, screen_y+7), (cx+8, screen_y+7)], fill=C['uml_txt'], width=1)
        # Inheritance arrows
        d.line([(cx-6, screen_y+5), (cx-1, screen_y+5)], fill=C['uml_line'], width=1)
        d.line([(cx+5, screen_y+5), (cx+1, screen_y+5)], fill=C['uml_line'], width=1)
        d.line([(cx-1, screen_y+4), (cx-1, screen_y+6)], fill=C['uml_line'], width=1)
        # Bottom box (bottom of hierarchy — the one that actually does something)
        d.rectangle([(cx-4, screen_y+11), (cx+4, screen_y+14)], outline=C['uml_box'], width=1)
        d.line([(cx-3, screen_y+12), (cx+3, screen_y+12)], fill=C['uml_txt'], width=1)
        d.line([(cx-6, screen_y+9), (cx-6, screen_y+11)], fill=C['uml_line'], width=1)
        d.line([(cx+5, screen_y+9), (cx+5, screen_y+11)], fill=C['uml_line'], width=1)
    else:
        # variant 1 — slightly different layout, same chaotic energy
        d.rectangle([(cx-6, screen_y+1), (cx+5, screen_y+4)], outline=C['uml_box'], width=1)
        d.line([(cx-5, screen_y+2), (cx+4, screen_y+2)], fill=C['uml_txt'], width=1)
        d.line([(cx-1, screen_y+4), (cx-1, screen_y+6)], fill=C['uml_line'], width=1)
        d.rectangle([(cx-8, screen_y+6), (cx+6, screen_y+9)], outline=C['uml_box'], width=1)
        d.line([(cx-7, screen_y+7), (cx+5, screen_y+7)], fill=C['uml_txt'], width=1)
        d.line([(cx-1, screen_y+9), (cx-1, screen_y+11)], fill=C['uml_line'], width=1)
        d.rectangle([(cx-5, screen_y+11), (cx+3, screen_y+14)], outline=C['uml_box'], width=1)
        d.line([(cx-4, screen_y+12), (cx+2, screen_y+12)], fill=C['uml_txt'], width=1)
        # extra arrow going nowhere (for authenticity)
        d.line([(cx+3, screen_y+12), (cx+7, screen_y+10)], fill=C['uml_line'], width=1)


def draw_frame(eye_look='center', blink=False, head_nod=0, fingers_down=False, uml_variant=0):
    img = Image.new('RGB', (W, H), C['bg'])
    d = ImageDraw.Draw(img)

    # --- Background grid ---
    for x in range(0, W, 8):
        d.line([(x, 0), (x, H)], fill=C['bg_grid'], width=1)
    for y in range(0, H, 8):
        d.line([(0, y), (W, y)], fill=C['bg_grid'], width=1)

    # Head nod offset
    hn = head_nod  # 0 or 1 pixel down

    # === LAPTOP (behind/below the figure lower body) ===
    # Laptop base on desk
    lx1, ly1, lx2, ly2 = 12, 46, 52, 54
    d.rectangle([(lx1, ly1), (lx2, ly2)], fill=C['laptop'])
    d.rectangle([(lx1, ly1), (lx2, ly1+1)], fill=C['laptop_l'])
    d.rectangle([(lx1, ly1), (lx1+1, ly2)], fill=C['laptop_l'])
    # Keys row (simplified)
    for kx in range(lx1+3, lx2-2, 4):
        d.rectangle([(kx, ly1+3), (kx+2, ly1+5)], fill=C['key'])
    for kx in range(lx1+3, lx2-2, 4):
        d.rectangle([(kx, ly1+6), (kx+2, ly1+8)], fill=C['key'])

    # Laptop screen (lid open, behind body — screen sits above keyboard base)
    sx1, sy1, sx2, sy2 = 14, 24, 50, 45
    sw = sx2 - sx1
    sh = sy2 - sy1
    # Lid frame
    d.rectangle([(sx1, sy1), (sx2, sy2)], fill=C['laptop'])
    d.rectangle([(sx1, sy1), (sx2, sy1+1)], fill=C['laptop_l'])
    d.rectangle([(sx1, sy1), (sx1+1, sy2)], fill=C['laptop_l'])
    # Screen surface
    d.rectangle([(sx1+2, sy1+2), (sx2-2, sy2-2)], fill=C['screen'])
    # Screen glow (top-left)
    d.rectangle([(sx1+2, sy1+2), (sx1+8, sy1+5)], fill=C['screen_glow'])
    # UML diagram on screen
    draw_uml_on_screen(d, sx1+2, sy1+2, sw-4, sh-4, variant=uml_variant)

    # Fingers typing (hands in front of laptop, at bottom of screen zone)
    finger_y = 42 if not fingers_down else 43
    # Left hand fingers
    for fx in [17, 20, 23, 26]:
        d.rectangle([(fx, finger_y), (fx+1, finger_y+3)], fill=C['skin'])
    # Right hand fingers
    for fx in [36, 39, 42, 45]:
        d.rectangle([(fx, finger_y), (fx+1, finger_y+3)], fill=C['skin'])

    # === BODY (shirt) ===
    # Torso — narrow since behind laptop screen mostly visible
    bx1, by1, bx2, by2 = 20, 28+hn, 44, 44+hn
    d.polygon([(bx1, by1), (bx2, by1), (bx2+1, by2), (bx1-1, by2)], fill=C['shirt'])
    # Shirt shading
    d.rectangle([(bx1, by1), (bx1+2, by2)], fill=C['shirt_d'])
    d.rectangle([(bx2-2, by1), (bx2, by2)], fill=C['shirt_d'])
    d.rectangle([(bx1+3, by1), (bx2-3, by1+4)], fill=C['shirt_l'])
    # Collar
    d.polygon([(28, by1), (36, by1), (32, by1+5)], fill=C['collar'])
    d.line([(28, by1), (32, by1+5)], fill=C['shirt_d'], width=1)
    d.line([(36, by1), (32, by1+5)], fill=C['shirt_d'], width=1)
    # Button placket
    d.line([(32, by1+5), (32, by2-1)], fill=C['shirt_btn'], width=1)
    # Shirt buttons
    for by in range(by1+7, by2-2, 4):
        d.point((32, by), fill=C['shirt_btn'])

    # === NECK ===
    neck_y = 22+hn
    d.rectangle([(29, neck_y), (35, 28+hn)], fill=C['skin'])
    d.rectangle([(29, neck_y), (30, 28+hn)], fill=C['skin_d'])
    d.rectangle([(34, neck_y), (35, 28+hn)], fill=C['skin_d'])

    # === HEAD ===
    hx1, hy1, hx2, hy2 = 21, 5+hn, 43, 24+hn
    # Head shape
    d.ellipse([(hx1, hy1), (hx2, hy2)], fill=C['skin'])

    # Ears
    d.ellipse([(hx1-3, hy1+8), (hx1+2, hy1+15)], fill=C['skin'])
    d.ellipse([(hx2-2, hy1+8), (hx2+3, hy1+15)], fill=C['skin'])
    d.ellipse([(hx1-2, hy1+9), (hx1+1, hy1+14)], fill=C['skin_d'])
    d.ellipse([(hx2-1, hy1+9), (hx2+2, hy1+14)], fill=C['skin_d'])

    # Hair — neat side part, dark
    # Main hair mass
    d.ellipse([(hx1, hy1), (hx2, hy1+12)], fill=C['hair'])
    d.rectangle([(hx1, hy1), (hx2, hy1+8)], fill=C['hair'])
    # Side part line (left of center)
    d.line([(29, hy1), (27, hy1+7)], fill=C['hair_d'], width=1)
    # Hair sweeps right from part
    d.line([(29, hy1+1), (38, hy1+2)], fill=C['hair_d'], width=1)
    d.line([(27, hy1+4), (36, hy1+5)], fill=C['hair_d'], width=1)
    # Left side of part (smaller section)
    d.polygon([(hx1, hy1), (29, hy1), (27, hy1+7), (hx1, hy1+8)], fill=C['hair'])

    # Forehead visible below hair
    d.rectangle([(hx1+1, hy1+8), (hx2-1, hy1+11)], fill=C['skin'])

    # Eyebrows — dark, slightly thick
    brow_y = hy1 + 10
    # Left eyebrow
    d.line([(hx1+4, brow_y+1), (hx1+9, brow_y)], fill=C['eyebrow'], width=2)
    # Right eyebrow
    d.line([(hx2-9, brow_y), (hx2-4, brow_y+1)], fill=C['eyebrow'], width=2)

    # Eyes
    eye_y = hy1 + 12
    lx_e, rx_e = hx1+4, hx2-9  # left/right eye x anchor

    if not blink:
        # Left eye
        d.ellipse([(lx_e, eye_y), (lx_e+5, eye_y+4)], fill=C['eye_w'])
        d.ellipse([(lx_e, eye_y), (lx_e+5, eye_y+4)], outline=C['black'], width=1)
        # Right eye
        d.ellipse([(rx_e, eye_y), (rx_e+5, eye_y+4)], fill=C['eye_w'])
        d.ellipse([(rx_e, eye_y), (rx_e+5, eye_y+4)], outline=C['black'], width=1)

        # Pupils — gaze direction
        if eye_look == 'center':
            d.ellipse([(lx_e+1, eye_y+1), (lx_e+3, eye_y+3)], fill=C['eye_b'])
            d.ellipse([(rx_e+2, eye_y+1), (rx_e+4, eye_y+3)], fill=C['eye_b'])
        elif eye_look == 'right':
            d.ellipse([(lx_e+3, eye_y+1), (lx_e+5, eye_y+3)], fill=C['eye_b'])
            d.ellipse([(rx_e+3, eye_y+1), (rx_e+5, eye_y+3)], fill=C['eye_b'])
        elif eye_look == 'left':
            d.ellipse([(lx_e, eye_y+1), (lx_e+2, eye_y+3)], fill=C['eye_b'])
            d.ellipse([(rx_e, eye_y+1), (rx_e+2, eye_y+3)], fill=C['eye_b'])

        # Eye shine
        d.point((lx_e+4, eye_y+1), fill=C['eye_shine'])
        d.point((rx_e+4, eye_y+1), fill=C['eye_shine'])

        # Slight half-lid (confident/smug)
        d.line([(lx_e, eye_y+1), (lx_e+5, eye_y+1)], fill=C['skin_d'], width=1)
        d.line([(rx_e, eye_y+1), (rx_e+5, eye_y+1)], fill=C['skin_d'], width=1)
    else:
        # Blink
        d.line([(lx_e, eye_y+2), (lx_e+5, eye_y+2)], fill=C['eyebrow'], width=2)
        d.line([(rx_e, eye_y+2), (rx_e+5, eye_y+2)], fill=C['eyebrow'], width=2)

    # Nose
    nose_y = hy1 + 16
    nose_cx = (hx1 + hx2) // 2
    d.rectangle([(nose_cx-1, nose_y), (nose_cx, nose_y+3)], fill=C['skin_d'])
    d.ellipse([(nose_cx-3, nose_y+2), (nose_cx+2, nose_y+5)], fill=C['skin'])
    d.ellipse([(nose_cx-4, nose_y+3), (nose_cx-2, nose_y+5)], fill=C['skin_d'])
    d.ellipse([(nose_cx+1, nose_y+3), (nose_cx+3, nose_y+5)], fill=C['skin_d'])

    # Mustache — small, neat
    mustache_y = hy1 + 18
    d.ellipse([(nose_cx-5, mustache_y), (nose_cx-1, mustache_y+2)], fill=C['mustache'])
    d.ellipse([(nose_cx, mustache_y), (nose_cx+4, mustache_y+2)], fill=C['mustache'])

    # Mouth — slight confident upward smirk
    mouth_y = hy1 + 20
    d.arc([(nose_cx-4, mouth_y), (nose_cx+4, mouth_y+4)], start=15, end=165, fill=C['mouth'], width=2)
    # Smirk pull on right
    d.line([(nose_cx+3, mouth_y+1), (nose_cx+5, mouth_y)], fill=C['mouth'], width=1)

    # Chin shadow
    d.ellipse([(hx1+7, hy2-4), (hx2-7, hy2)], fill=C['skin_d'])

    return img


# Frame spec: (eye_look, blink, head_nod, fingers_down, uml_variant, duration_ms)
frames_spec = [
    ('center', False, 0, False, 0, 400),   # confident center gaze
    ('right',  False, 0, False, 0, 250),   # dart right
    ('right',  False, 0, True,  0, 200),   # dart right + type
    ('center', False, 0, True,  0, 200),   # back center, typing
    ('center', True,  0, False, 0, 100),   # blink
    ('center', False, 0, False, 0, 300),   # back to normal
    ('left',   False, 0, False, 1, 250),   # dart left (checking who's impressed)
    ('center', False, 1, False, 1, 300),   # nod down (sagely)
    ('center', False, 0, False, 1, 200),   # nod back up
    ('center', False, 0, True,  1, 250),   # type confidently
    ('right',  False, 0, True,  0, 200),   # dart right while typing
    ('center', True,  0, False, 0, 100),   # blink again
]

frames = []
durations = []

for eye_look, blink, head_nod, fingers_down, uml_variant, dur in frames_spec:
    frame = draw_frame(
        eye_look=eye_look,
        blink=blink,
        head_nod=head_nod,
        fingers_down=fingers_down,
        uml_variant=uml_variant,
    )
    frames.append(frame.convert('P', palette=Image.ADAPTIVE, colors=48))
    durations.append(dur)

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

from PIL import Image as PILImage
check = PILImage.open(OUT_PATH)
print(f"Verified: size={check.size}, frames={check.n_frames}")
