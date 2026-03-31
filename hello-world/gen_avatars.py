#!/usr/bin/env python3
"""Generate pixel-art style avatars for Spengler and Otto."""

from PIL import Image, ImageDraw
import math
import random

def draw_spengler(path, size=64):
    """Bald, dark, doomed-looking man. Dark navy/purple palette matching congress theme."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size

    # Background circle — dark navy
    d.ellipse([0, 0, s-1, s-1], fill=(18, 18, 40, 255))

    # Bald head — pale/ashen skin
    head_color = (200, 185, 170, 255)
    # head oval
    d.ellipse([s//5, s//8, s*4//5, s*3//5], fill=head_color)

    # Neck
    d.rectangle([s*3//8, s//2, s*5//8, s*2//3], fill=head_color)

    # Shoulders — dark coat
    coat_color = (35, 30, 55, 255)
    d.ellipse([s//8, s//2, s*7//8, s], fill=coat_color)

    # Eyes — hollow, tired, dark sockets
    eye_y = s*3//10
    socket_color = (80, 60, 70, 255)
    pupil_color = (20, 15, 30, 255)
    # left eye
    d.ellipse([s*3//10 - 4, eye_y - 4, s*3//10 + 4, eye_y + 4], fill=socket_color)
    d.ellipse([s*3//10 - 2, eye_y - 2, s*3//10 + 2, eye_y + 2], fill=pupil_color)
    # right eye
    d.ellipse([s*7//10 - 4, eye_y - 4, s*7//10 + 4, eye_y + 4], fill=socket_color)
    d.ellipse([s*7//10 - 2, eye_y - 2, s*7//10 + 2, eye_y + 2], fill=pupil_color)

    # Furrowed brow lines
    brow_color = (120, 100, 90, 255)
    d.line([s*3//10 - 4, eye_y - 6, s*3//10 + 4, eye_y - 8], fill=brow_color, width=1)
    d.line([s*7//10 - 4, eye_y - 8, s*7//10 + 4, eye_y - 6], fill=brow_color, width=1)

    # Nose — simple line
    d.line([s//2, eye_y + 4, s//2 - 2, eye_y + 10], fill=(160, 140, 130, 255), width=1)
    d.line([s//2 - 2, eye_y + 10, s//2 + 3, eye_y + 10], fill=(160, 140, 130, 255), width=1)

    # Mouth — thin grim line, slightly downturned
    mouth_y = s*9//20
    mouth_color = (100, 80, 85, 255)
    d.line([s*2//5, mouth_y, s*3//5, mouth_y], fill=mouth_color, width=1)
    d.point([s*2//5 - 1, mouth_y + 1], fill=mouth_color)
    d.point([s*3//5 + 1, mouth_y + 1], fill=mouth_color)

    # Light beard stubble — dark grey dots on lower face
    rng = random.Random(42)
    stubble_color = (90, 80, 95, 180)
    for _ in range(30):
        bx = rng.randint(s*3//10, s*7//10)
        by = rng.randint(s*9//20, s*11//20)
        d.point([bx, by], fill=stubble_color)

    # Bald head shine — subtle highlight
    d.ellipse([s*2//5, s//8+2, s*3//5, s//5], fill=(220, 210, 200, 80))

    # Small doomed skull motif hint — just eyebrow shadow / deep-set look overlay
    # Add a faint vignette / dark rim
    for r in range(s//2 - 2, s//2):
        alpha = int(180 * (r - (s//2 - 4)) / 4)
        d.ellipse([s//2 - r, s//2 - r, s//2 + r, s//2 + r],
                  outline=(0, 0, 0, alpha))

    img.save(path)
    print(f"Saved spengler avatar → {path}")


def draw_otto(path, size=64):
    """Wild hair, rocket-themed, colorful chaos energy. Bright warm palette."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size

    # Background circle — electric purple/orange gradient approximation
    # Fill with dark purple base
    d.ellipse([0, 0, s-1, s-1], fill=(40, 20, 60, 255))

    # Add some colorful 'energy' lines radiating from center (hair chaos)
    colors_hair = [
        (255, 80, 0, 200),    # orange
        (255, 200, 0, 200),   # yellow
        (255, 50, 150, 180),  # pink
        (100, 200, 255, 180), # cyan
        (200, 50, 255, 180),  # violet
    ]
    center = s // 2
    # Wild spiky hair — rays from top of head
    hair_angles = [-80, -60, -45, -30, -10, 10, 30, 50, 70, 90, -95, 95]
    for i, angle in enumerate(hair_angles):
        rad = math.radians(angle - 90)
        c = colors_hair[i % len(colors_hair)]
        length = s // 3 + (i % 3) * 4
        # hair strand starts at scalp and shoots outward
        hx = center + int(math.cos(rad) * s // 5)
        hy = int(s * 0.28) + int(math.sin(rad) * s // 5)
        ex = center + int(math.cos(rad) * length)
        ey = int(s * 0.28) + int(math.sin(rad) * length)
        d.line([hx, hy, ex, ey], fill=c, width=2)
        # tip blob
        d.ellipse([ex - 2, ey - 2, ex + 2, ey + 2], fill=c)

    # Head — warm tan skin
    head_color = (230, 190, 150, 255)
    d.ellipse([s//5, s//6, s*4//5, s*3//5], fill=head_color)

    # Neck + shoulders
    d.rectangle([s*3//8, s//2, s*5//8, s*2//3], fill=head_color)
    # Rocket jacket — bright orange
    jacket_color = (255, 100, 20, 255)
    d.ellipse([s//8, s*9//16, s*7//8, s], fill=jacket_color)

    # Eyes — wide open, energetic, white sclera with bright iris
    eye_y = s*5//16
    # left
    d.ellipse([s*3//10 - 5, eye_y - 5, s*3//10 + 5, eye_y + 5], fill=(255, 255, 255, 255))
    d.ellipse([s*3//10 - 3, eye_y - 3, s*3//10 + 3, eye_y + 3], fill=(0, 180, 255, 255))
    d.ellipse([s*3//10 - 1, eye_y - 1, s*3//10 + 1, eye_y + 1], fill=(10, 10, 20, 255))
    # right
    d.ellipse([s*7//10 - 5, eye_y - 5, s*7//10 + 5, eye_y + 5], fill=(255, 255, 255, 255))
    d.ellipse([s*7//10 - 3, eye_y - 3, s*7//10 + 3, eye_y + 3], fill=(0, 180, 255, 255))
    d.ellipse([s*7//10 - 1, eye_y - 1, s*7//10 + 1, eye_y + 1], fill=(10, 10, 20, 255))

    # Eyebrows — raised high, excited
    d.arc([s*3//10 - 5, eye_y - 9, s*3//10 + 5, eye_y - 1], 200, 340, fill=(80, 50, 20, 255), width=2)
    d.arc([s*7//10 - 5, eye_y - 9, s*7//10 + 5, eye_y - 1], 200, 340, fill=(80, 50, 20, 255), width=2)

    # Nose
    d.ellipse([s//2 - 3, s*3//8, s//2 + 3, s*3//8 + 5], fill=(200, 160, 120, 255))

    # Big manic grin
    mouth_y = s*13//24
    d.arc([s//3, mouth_y - 6, s*2//3, mouth_y + 6], 0, 180, fill=(200, 50, 50, 255), width=2)
    # teeth
    d.rectangle([s*5//12, mouth_y - 2, s*7//12, mouth_y + 2], fill=(240, 240, 240, 255))

    # Small rocket icon on jacket — triangle + rectangle
    rx, ry = s//2, s*3//4
    rocket_color = (255, 220, 50, 255)
    flame_color = (255, 100, 0, 255)
    # rocket body
    d.polygon([(rx, ry - 6), (rx - 3, ry + 2), (rx + 3, ry + 2)], fill=rocket_color)
    # exhaust flame
    d.polygon([(rx - 2, ry + 2), (rx + 2, ry + 2), (rx, ry + 6)], fill=flame_color)

    img.save(path)
    print(f"Saved otto avatar → {path}")


if __name__ == '__main__':
    spengler_path = '/home/clungus/work/hello-world/static/avatars/spengler.png'
    otto_path = '/home/clungus/work/hello-world/static/avatars/otto.png'
    draw_spengler(spengler_path, size=64)
    draw_otto(otto_path, size=64)
    print("Done.")
