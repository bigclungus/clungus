#!/usr/bin/env python3
"""
Generate isometric pixel art avatar for David Hume — Option B: Looksmaxxed Sigma Empiricist
64x64 animated GIF, 8 frames, golden aura pulses
"""

from PIL import Image, ImageDraw
import math
import os

OUTPUT_PATH = "/mnt/data/hello-world/static/avatars/hume_b.gif"
SIZE = 64
NUM_FRAMES = 9
FRAME_DURATION = 130  # ms

# Color palette
BG_COLOR = (8, 6, 10)          # near-black background
DARK_BG = (5, 4, 8)

# Skin tones
SKIN_MID = (198, 155, 110)
SKIN_LIGHT = (220, 178, 130)
SKIN_HIGHLIGHT = (235, 200, 158)
SKIN_SHADOW = (155, 110, 72)
SKIN_DARK = (120, 82, 50)

# Wig colors
WIG_BASE = (230, 225, 218)
WIG_SHADOW = (180, 175, 168)
WIG_DARK = (140, 135, 128)
WIG_HIGHLIGHT = (245, 242, 238)

# Eye colors
EYE_AMBER = (160, 110, 45)
EYE_AMBER_DARK = (120, 78, 22)
EYE_CATCHLIGHT = (255, 235, 180)
EYE_WHITE = (220, 210, 195)
EYE_PUPIL = (30, 20, 10)

# Coat colors
COAT_NAVY = (18, 28, 58)
COAT_NAVY_MID = (25, 38, 75)
COAT_NAVY_LIGHT = (35, 52, 95)
COAT_GOLD_TRIM = (180, 148, 55)
COAT_GOLD_BRIGHT = (210, 175, 80)

# Gold aura
AURA_CORE = (220, 180, 60)
AURA_MID = (180, 140, 40)
AURA_OUTER = (120, 90, 20)
AURA_FAINT = (60, 45, 10)

# Particle gold
PARTICLE_BRIGHT = (230, 195, 80)
PARTICLE_DIM = (100, 78, 18)

def draw_pixel(draw, x, y, color):
    draw.point((x, y), fill=color)

def draw_rect(draw, x, y, w, h, color):
    draw.rectangle([x, y, x+w-1, y+h-1], fill=color)

def blend_color(c1, c2, t):
    """Blend two colors, t in [0,1]"""
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

def alpha_blend(base, color, alpha):
    """Blend color onto base with alpha 0..1"""
    return tuple(int(base[i] * (1 - alpha) + color[i] * alpha) for i in range(len(base)))

def draw_aura_ring(img_array, cx, cy, radius, color, alpha):
    """Draw a soft circular glow ring onto a pixel grid"""
    h, w = len(img_array), len(img_array[0])
    for dy in range(-radius-3, radius+4):
        for dx in range(-radius-3, radius+4):
            dist = math.sqrt(dx*dx + dy*dy)
            px, py = cx + dx, cy + dy
            if 0 <= px < w and 0 <= py < h:
                # Glow falloff: brightest at radius, fade inward and outward
                dist_from_ring = abs(dist - radius)
                if dist_from_ring < 3.5:
                    local_alpha = alpha * max(0, 1 - dist_from_ring / 3.5)
                    # Also add inner fill with lesser alpha
                    if dist < radius:
                        inner_alpha = alpha * 0.15 * (dist / max(radius, 1))
                        local_alpha = max(local_alpha, inner_alpha)
                    img_array[py][px] = alpha_blend(img_array[py][px], color, local_alpha)

def make_particles(seed_offset):
    """Return list of (x, y, brightness) for faint gold particles in background"""
    particles = []
    positions = [
        (5, 8), (58, 12), (3, 45), (60, 50), (10, 55), (55, 6),
        (15, 4), (50, 60), (7, 30), (56, 35), (20, 60), (45, 3),
        (2, 20), (62, 25), (30, 2), (33, 61), (12, 42), (52, 40),
    ]
    for i, (px, py) in enumerate(positions):
        # Twinkle based on frame
        brightness = 0.3 + 0.4 * math.sin((i * 1.3 + seed_offset) * 0.7)
        particles.append((px, py, brightness))
    return particles

def create_frame(frame_idx):
    """Create a single frame of the avatar."""
    t = frame_idx / NUM_FRAMES  # 0..1 animation progress

    # Aura pulse: radius oscillates between 14 and 16
    aura_radius = 14 + 2 * math.sin(t * 2 * math.pi)
    aura_alpha = 0.55 + 0.20 * math.sin(t * 2 * math.pi)

    # Initialize pixel array
    img_array = [[list(BG_COLOR) for _ in range(SIZE)] for _ in range(SIZE)]

    # --- Background gradient (very subtle) ---
    for y in range(SIZE):
        for x in range(SIZE):
            # Very faint radial gradient toward center
            dx = x - 32
            dy = y - 32
            dist = math.sqrt(dx*dx + dy*dy)
            fade = max(0, 1 - dist / 45)
            img_array[y][x] = list(alpha_blend(BG_COLOR, (15, 12, 20), fade * 0.3))

    # --- Gold particles in background ---
    for (px, py, brightness) in make_particles(frame_idx * 0.5):
        if 0 <= px < SIZE and 0 <= py < SIZE:
            col = alpha_blend(img_array[py][px], PARTICLE_BRIGHT, brightness * 0.6)
            img_array[py][px] = list(col)
        # Small 2px particles
        for ddx, ddy in [(1,0),(0,1)]:
            nx, ny = px+ddx, py+ddy
            if 0 <= nx < SIZE and 0 <= ny < SIZE:
                col = alpha_blend(img_array[ny][nx], PARTICLE_BRIGHT, brightness * 0.25)
                img_array[ny][nx] = list(col)

    # --- Golden aura glow ---
    cx, cy = 32, 26  # center of head/aura
    draw_aura_ring(img_array, cx, cy, int(aura_radius), AURA_CORE, aura_alpha * 0.9)
    draw_aura_ring(img_array, cx, cy, int(aura_radius) + 2, AURA_MID, aura_alpha * 0.5)
    draw_aura_ring(img_array, cx, cy, int(aura_radius) + 4, AURA_OUTER, aura_alpha * 0.25)
    draw_aura_ring(img_array, cx, cy, int(aura_radius) + 6, AURA_FAINT, aura_alpha * 0.12)

    # Also inner soft fill
    for dy2 in range(-12, 13):
        for dx2 in range(-12, 13):
            dist2 = math.sqrt(dx2*dx2 + dy2*dy2)
            if dist2 <= 12:
                px2, py2 = cx + dx2, cy + dy2
                if 0 <= px2 < SIZE and 0 <= py2 < SIZE:
                    inner_a = aura_alpha * 0.08 * (1 - dist2/12)
                    img_array[py2][px2] = list(alpha_blend(img_array[py2][px2], AURA_CORE, inner_a))

    # Convert to image for drawing
    img = Image.new("RGB", (SIZE, SIZE))
    for y in range(SIZE):
        for x in range(SIZE):
            img.putpixel((x, y), tuple(img_array[y][x]))

    draw = ImageDraw.Draw(img)

    # =====================
    # COAT / SHOULDERS
    # =====================
    # Isometric bust: shoulders start around y=46, coat fills lower portion
    # Left shoulder (viewer's right) — isometric slight top-down

    # Main coat body (trapezoid)
    for y in range(46, 64):
        # Coat width widens toward bottom
        progress = (y - 46) / 18.0
        half_w = int(10 + progress * 10)
        for x in range(32 - half_w, 32 + half_w + 1):
            if 0 <= x < 64:
                # Isometric shading: left side lighter, right side darker
                rel = (x - 32) / max(half_w, 1)
                if rel < -0.3:
                    col = COAT_NAVY_LIGHT
                elif rel > 0.3:
                    col = COAT_NAVY
                else:
                    col = COAT_NAVY_MID
                img.putpixel((x, y), col)

    # Coat collar / neck area — gold trim
    # Collar left
    for x in range(24, 30):
        for y in range(44, 50):
            img.putpixel((x, y), COAT_NAVY_MID)
    # Collar right
    for x in range(34, 40):
        for y in range(44, 50):
            img.putpixel((x, y), COAT_NAVY)

    # Gold trim at collar edges
    for y in range(44, 50):
        for x in [23, 24]:
            img.putpixel((x, y), COAT_GOLD_TRIM)
        for x in [39, 40]:
            img.putpixel((x, y), COAT_GOLD_TRIM)
    # Gold trim at top of coat / lapel line
    for x in range(25, 39):
        if x in range(29, 35):
            # Center gap (neck)
            pass
        else:
            img.putpixel((x, 44), COAT_GOLD_TRIM)
            img.putpixel((x, 43), COAT_GOLD_BRIGHT)

    # Neck
    for y in range(41, 46):
        for x in range(29, 35):
            shade_t = (x - 29) / 6.0
            col = blend_color(SKIN_SHADOW, SKIN_MID, shade_t)
            img.putpixel((x, y), col)

    # =====================
    # WIG
    # =====================
    # Powdered wig — styled sharply, wide at sides
    # Top crown of wig
    for y in range(10, 22):
        progress = (y - 10) / 12.0
        # Wig is wider than head, narrows toward top
        half_w = int(3 + progress * 9)
        for x in range(32 - half_w, 32 + half_w + 1):
            if 0 <= x < 64:
                rel = abs(x - 32) / max(half_w, 1)
                if y < 13:
                    col = WIG_HIGHLIGHT if rel < 0.4 else WIG_BASE
                else:
                    col = WIG_BASE if rel < 0.5 else WIG_SHADOW
                img.putpixel((x, y), col)

    # Wig side curls / bulk (left side of face)
    for y in range(18, 38):
        progress = (y - 18) / 20.0
        # Left wig bulk
        for x in range(14, 22):
            rel_y = progress
            rel_x = (x - 14) / 8.0
            if rel_x + rel_y * 0.3 < 0.85:
                if x < 16:
                    col = WIG_DARK
                elif x < 18:
                    col = WIG_SHADOW
                else:
                    col = WIG_BASE
                img.putpixel((x, y), col)
        # Right wig bulk
        for x in range(42, 50):
            rel_x = (x - 42) / 8.0
            if rel_x * 0.7 + progress * 0.3 < 0.8:
                if x > 48:
                    col = WIG_DARK
                elif x > 46:
                    col = WIG_SHADOW
                else:
                    col = WIG_BASE if x < 45 else WIG_SHADOW
                img.putpixel((x, y), col)

    # Sharp wig top ridge highlight
    for x in range(28, 36):
        img.putpixel((x, 10), WIG_HIGHLIGHT)
        img.putpixel((x, 11), WIG_HIGHLIGHT)

    # =====================
    # HEAD / FACE
    # =====================
    # Isometric head: roughly elliptical, slight top-down tilt
    # Head spans x: 20-44, y: 18-42

    for y in range(18, 43):
        progress = (y - 18) / 25.0
        # Head shape: wider in middle, narrower at top and bottom
        if progress < 0.15:
            half_w = int(5 + progress / 0.15 * 6)
        elif progress < 0.8:
            half_w = int(11 - abs(progress - 0.5) * 4)
        else:
            half_w = int(8 - (progress - 0.8) / 0.2 * 5)

        for x in range(32 - half_w, 32 + half_w + 1):
            if 0 <= x < 64:
                rel = (x - 32) / max(half_w, 1)
                # Isometric shading: left lighter (light source upper-left)
                if rel < -0.5:
                    col = SKIN_HIGHLIGHT
                elif rel < -0.1:
                    col = SKIN_LIGHT
                elif rel < 0.3:
                    col = SKIN_MID
                elif rel < 0.6:
                    col = SKIN_SHADOW
                else:
                    col = SKIN_DARK
                img.putpixel((x, y), col)

    # =====================
    # CHISELED JAW
    # =====================
    # Strong jaw with highlight and shadow — angular lower face
    # Jaw highlight (left side)
    for y in range(35, 42):
        img.putpixel((21, y), SKIN_HIGHLIGHT)
        img.putpixel((22, y), SKIN_LIGHT)
    # Jaw shadow (right side)
    for y in range(35, 42):
        img.putpixel((41, y), SKIN_DARK)
        img.putpixel((42, y), SKIN_SHADOW)
    # Chin highlight
    for x in range(29, 35):
        img.putpixel((x, 41), SKIN_HIGHLIGHT)
    # Strong jawline edge pixels
    for y in range(36, 41):
        img.putpixel((20, y), SKIN_SHADOW)  # shadow under jaw
        img.putpixel((43, y), SKIN_DARK)

    # =====================
    # EYES — Sigma deadlock stare
    # =====================
    # Left eye (x~24-28, y~26-29)
    # Right eye (x~35-39, y~26-29)

    def draw_eye(draw_img, ex, ey, is_left):
        # Eye white
        for dx in range(-2, 3):
            for dy in range(-1, 2):
                px2, py2 = ex + dx, ey + dy
                if 0 <= px2 < 64 and 0 <= py2 < 64:
                    draw_img.putpixel((px2, py2), EYE_WHITE)
        # Iris — amber
        for dx in range(-1, 2):
            for dy in range(-1, 2):
                draw_img.putpixel((ex + dx, ey + dy), EYE_AMBER)
        # Pupil center
        draw_img.putpixel((ex, ey), EYE_PUPIL)
        draw_img.putpixel((ex, ey-1), EYE_PUPIL)
        # Iris dark ring
        for dx, dy in [(-1,-1),(1,-1),(-1,1),(1,1)]:
            if 0 <= ex+dx < 64 and 0 <= ey+dy < 64:
                draw_img.putpixel((ex+dx, ey+dy), EYE_AMBER_DARK)
        # Catchlight (upper-left of iris)
        draw_img.putpixel((ex-1, ey-1), EYE_CATCHLIGHT)
        # Upper eyelid (strong brow line for intense look)
        for dx in range(-3, 4):
            px2 = ex + dx
            if 0 <= px2 < 64:
                draw_img.putpixel((px2, ey-2), (40, 25, 10))  # dark brow
                if abs(dx) <= 2:
                    draw_img.putpixel((px2, ey-3), (55, 38, 18))  # brow base
        # Lower lid shadow
        for dx in range(-2, 3):
            draw_img.putpixel((ex+dx, ey+2), (170, 130, 90))

    draw_eye(img, 26, 28, True)   # left eye
    draw_eye(img, 38, 28, False)  # right eye

    # Brow ridge highlight
    for x in range(23, 30):
        img.putpixel((x, 24), SKIN_HIGHLIGHT)
    for x in range(34, 42):
        img.putpixel((x, 24), SKIN_HIGHLIGHT)

    # =====================
    # NOSE
    # =====================
    # Straight, defined nose bridge
    for y in range(29, 36):
        img.putpixel((32, y), SKIN_MID)
        img.putpixel((31, y), SKIN_LIGHT)
        img.putpixel((33, y), SKIN_SHADOW)
    # Nose tip
    for x in range(30, 35):
        img.putpixel((x, 35), SKIN_HIGHLIGHT if x == 31 else SKIN_MID)
    # Nostril shadows
    img.putpixel((30, 36), SKIN_DARK)
    img.putpixel((34, 36), SKIN_DARK)

    # =====================
    # MOUTH — stern set, tight
    # =====================
    # Thin, determined mouth line
    for x in range(28, 37):
        img.putpixel((x, 38), (120, 82, 55))  # lip line
    # Upper lip shadow
    for x in range(29, 36):
        img.putpixel((x, 37), SKIN_SHADOW)
    # Lower lip slight highlight
    for x in range(29, 36):
        img.putpixel((x, 39), SKIN_LIGHT)
    # Corner of mouth — slight downward set (cold expression)
    img.putpixel((27, 38), SKIN_SHADOW)
    img.putpixel((27, 39), SKIN_DARK)
    img.putpixel((36, 38), SKIN_SHADOW)
    img.putpixel((36, 39), SKIN_DARK)

    # =====================
    # CHEEKBONES — sigma chiseled
    # =====================
    # Left cheekbone highlight
    for y in range(30, 34):
        img.putpixel((22, y), SKIN_HIGHLIGHT)
        img.putpixel((23, y), SKIN_LIGHT)
    # Right cheekbone shadow (isometric)
    for y in range(30, 34):
        img.putpixel((40, y), SKIN_DARK)
        img.putpixel((41, y), SKIN_SHADOW)
    # Hollow cheek shadow (gaunt, defined)
    for y in range(33, 38):
        img.putpixel((24, y), SKIN_SHADOW)
        img.putpixel((40, y), SKIN_DARK)

    # =====================
    # FOREHEAD
    # =====================
    for x in range(26, 38):
        img.putpixel((x, 19), SKIN_LIGHT)
        img.putpixel((x, 20), SKIN_HIGHLIGHT if x in range(28, 36) else SKIN_LIGHT)

    # =====================
    # Clean up any stray wig pixels over face edges
    # =====================
    # Re-assert the face boundary over wig sides
    for y in range(20, 40):
        for x in range(20, 22):
            progress = (y - 18) / 25.0
            if progress < 0.15:
                hw = int(5 + progress / 0.15 * 6)
            elif progress < 0.8:
                hw = int(11 - abs(progress - 0.5) * 4)
            else:
                hw = int(8 - (progress - 0.8) / 0.2 * 5)
            face_left = 32 - hw
            if x < face_left:
                # Keep as wig
                pass

    return img


def main():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    frames = []
    for i in range(NUM_FRAMES):
        frame = create_frame(i)
        frames.append(frame)

    # Save animated GIF
    frames[0].save(
        OUTPUT_PATH,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION,
        loop=0,
        disposal=2,
        optimize=False,
    )

    print(f"Saved animated GIF: {OUTPUT_PATH}")

    # Verify
    with Image.open(OUTPUT_PATH) as verify:
        n_frames = getattr(verify, 'n_frames', 1)
        print(f"Verified: {verify.size}, mode={verify.mode}, frames={n_frames}")
        assert verify.size == (SIZE, SIZE), f"Wrong size: {verify.size}"
        assert n_frames == NUM_FRAMES, f"Wrong frame count: {n_frames}"

    print("All checks passed.")


if __name__ == "__main__":
    main()
