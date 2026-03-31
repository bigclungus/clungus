#!/usr/bin/env python3
"""
Adelbert Hominem - Avatar C
"The Interrogation Light"

Extreme minimalist psychological horror. A silhouetted figure in near-total darkness,
lit from above by a single harsh spotlight. Only the eyes burn through the shadow.
The attack comes from the dark — you see contempt before you see the man.

Animation: slow blink of the burning eyes, spotlight flickers cold to white,
head tilts slightly on the cut.

64x64 animated GIF, pure Pillow, loop=0, disposal=2.
"""

from PIL import Image, ImageDraw
import os

OUTPUT = "/mnt/data/hello-world/static/avatars/adelbert_c.gif"


# Extreme palette — almost nothing but black, shadow, and two burning eyes
BG          = (4, 4, 8)           # near-black
SHADOW_BODY = (12, 10, 18)        # dark silhouette, barely visible
SHADOW_MID  = (22, 18, 30)        # silhouette highlight edge
SPOT_COLD   = (200, 210, 255)     # cold spotlight — interrogation fluorescent
SPOT_WARM   = (255, 245, 200)     # spotlight warm pulse
FLOOR_GLOW  = (30, 28, 45)        # faint floor reflection
EYE_BURN    = (220, 60, 30)       # burning contemptuous red-orange eyes
EYE_CORE    = (255, 200, 80)      # eye highlight — a gleam
EYE_SOCKET  = (8, 6, 12)         # deep shadow socket
COLLAR_EDGE = (35, 30, 50)        # barely visible shirt collar
TIE_SHADOW  = (18, 8, 8)         # almost-invisible dark red tie hint


def draw_spotlight(d, cx, radius_x, radius_y, color, alpha_center=180, alpha_edge=0):
    """Draw a radial spotlight glow on the image using concentric ellipses."""
    steps = 12
    for i in range(steps, 0, -1):
        t = i / steps
        rx = int(radius_x * t)
        ry = int(radius_y * t)
        a = int(alpha_center * (1 - t) + alpha_edge * t)
        # Can't easily do per-pixel alpha in P mode, so just draw filled ellipses
        # from dark to light as we shrink toward center
        blend = tuple(int(BG[c] + (color[c] - BG[c]) * (1 - t)) for c in range(3))
        d.ellipse([cx - rx, 0, cx + rx, ry * 2], fill=blend)


def make_frame(eye_open=True, spot_warm=False, head_tilt=0):
    img = Image.new("RGBA", (64, 64), BG + (255,))
    d = ImageDraw.Draw(img)

    # Background gradient — subtle floor lighter than ceiling
    for y in range(64):
        t = y / 63.0
        r = int(BG[0] + 8 * t)
        g = int(BG[1] + 6 * t)
        b = int(BG[2] + 12 * t)
        d.line([(0, y), (63, y)], fill=(r, g, b, 255))

    # Spotlight cone from top center — harsh narrow beam
    spot_color = SPOT_WARM if spot_warm else SPOT_COLD
    cx = 32 + head_tilt
    # cone: top narrow, widens downward, hits face area
    for y in range(0, 36):
        t = y / 35.0
        cone_w = int(2 + 10 * t)  # narrow at top, 12px wide at face
        r = int(BG[0] + (spot_color[0] - BG[0]) * (0.7 - t * 0.4))
        g = int(BG[1] + (spot_color[1] - BG[1]) * (0.7 - t * 0.4))
        b = int(BG[2] + (spot_color[2] - BG[2]) * (0.7 - t * 0.4))
        d.line([(cx - cone_w, y), (cx + cone_w, y)], fill=(r, g, b, 255))

    # Soft floor reflection puddle under figure
    for ry in range(8):
        t = ry / 7.0
        w = int(14 - 6 * t)
        lum = int(FLOOR_GLOW[0] + 8 * (1 - t))
        d.line([(32 - w, 56 + ry), (32 + w, 56 + ry)], fill=(lum, lum - 2, lum + 8, 255))

    # Body silhouette — a suit shape, mostly dark, barely distinguished from BG
    hx = 32 + head_tilt

    # Torso shadow — wide at shoulders, narrows at waist
    d.polygon([
        (hx - 12, 30), (hx + 12, 30),
        (hx + 10, 50), (hx - 10, 50)
    ], fill=SHADOW_BODY)
    # Suit edge highlight — a thin rim of slightly lighter shadow
    d.polygon([
        (hx - 12, 30), (hx - 9, 30),
        (hx - 7, 50), (hx - 10, 50)
    ], fill=SHADOW_MID)

    # Shoulders
    d.ellipse([hx - 14, 26, hx - 6, 33], fill=SHADOW_MID)
    d.ellipse([hx + 6, 26, hx + 14, 33], fill=SHADOW_BODY)

    # Neck
    d.rectangle([hx - 3, 22, hx + 3, 30], fill=SHADOW_MID)

    # Collar hint — white shirt barely visible in darkness
    d.polygon([(hx - 3, 28), (hx, 32), (hx + 3, 28)], fill=COLLAR_EDGE)

    # Tie shadow — deep red, barely there
    d.polygon([(hx - 1, 29), (hx + 1, 29), (hx + 2, 40), (hx - 2, 40)], fill=TIE_SHADOW)

    # Head — a dark mass in the spotlight, not a face, a PRESENCE
    # Head shape
    d.ellipse([hx - 8, 12, hx + 8, 26], fill=SHADOW_MID)
    d.polygon([(hx - 8, 18), (hx + 8, 18), (hx + 6, 26), (hx - 6, 26)], fill=SHADOW_MID)

    # Hair — darker mass on top
    d.ellipse([hx - 8, 11, hx + 8, 19], fill=SHADOW_BODY)

    # The spotlight hits the forehead, leaving lower face in shadow
    # Forehead catch light
    for sy in range(12, 17):
        t = (sy - 12) / 4.0
        w = int(6 - 2 * t)
        lum = int(40 + 25 * (1 - t))
        if spot_warm:
            fc = (lum + 10, lum + 5, lum - 10)
        else:
            fc = (lum - 5, lum - 3, lum + 15)
        d.line([(hx - w, sy), (hx + w, sy)], fill=fc)

    # Eyes — the ONLY thing fully visible. Burning contempt.
    ey = 19  # eye y position, in shadow but somehow they GLOW
    eye_offsets = [-3, 3]

    for ex_off in eye_offsets:
        ex = hx + ex_off
        # Deep socket shadow
        d.ellipse([ex - 2, ey - 1, ex + 2, ey + 2], fill=EYE_SOCKET)

        if eye_open:
            # Burning iris
            d.ellipse([ex - 2, ey, ex + 2, ey + 2], fill=EYE_BURN)
            # Core gleam
            d.point((ex, ey), fill=EYE_CORE)
            d.point((ex + 1, ey), fill=EYE_CORE)
        else:
            # Squinted — just a slit of fire
            d.line([(ex - 2, ey + 1), (ex + 2, ey + 1)], fill=EYE_BURN, width=1)

        # Brow — heavy, furrowed, contemptuous
        brow_y = ey - 2
        if ex_off < 0:
            # left brow — angles down toward center (scowl)
            d.line([(ex - 2, brow_y - 1), (ex + 2, brow_y)], fill=SHADOW_BODY, width=2)
        else:
            # right brow — mirrors
            d.line([(ex - 2, brow_y), (ex + 2, brow_y - 1)], fill=SHADOW_BODY, width=2)

    # Mouth — barely visible thin line in the dark, slightly curled up right
    my = 23
    d.line([(hx - 3, my), (hx, my)], fill=(25, 18, 20, 255), width=1)
    d.line([(hx, my), (hx + 3, my - 1)], fill=(25, 18, 20, 255), width=1)  # the sneer

    return img


def make_frames():
    frames = []
    durations = []

    # Frame 1: eyes open, cold light — static menace
    frames.append(make_frame(eye_open=True, spot_warm=False, head_tilt=0))
    durations.append(600)

    # Frame 2: eyes half-close — the slow contemptuous blink
    frames.append(make_frame(eye_open=False, spot_warm=False, head_tilt=0))
    durations.append(120)

    # Frame 3: eyes closed, light flickers warm
    frames.append(make_frame(eye_open=False, spot_warm=True, head_tilt=0))
    durations.append(80)

    # Frame 4: eyes open again — light still warm, head slight tilt
    frames.append(make_frame(eye_open=True, spot_warm=True, head_tilt=1))
    durations.append(100)

    # Frame 5: back to cold, head straight — back to watchful stillness
    frames.append(make_frame(eye_open=True, spot_warm=False, head_tilt=0))
    durations.append(800)

    # Frame 6: eyes narrow without fully closing — sustained squint
    frames.append(make_frame(eye_open=False, spot_warm=False, head_tilt=0))
    durations.append(400)

    # Frame 7: open again
    frames.append(make_frame(eye_open=True, spot_warm=False, head_tilt=0))
    durations.append(200)

    return frames, durations


def main():
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    frames, durations = make_frames()

    palette_frames = []
    for f in frames:
        pf = f.convert("RGBA")
        out = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        out.paste(pf, (0, 0), pf)
        palette_frames.append(out.convert("P", palette=Image.ADAPTIVE, colors=128))

    palette_frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=palette_frames[1:],
        loop=0,
        duration=durations,
        disposal=2,
        transparency=0,
    )
    print(f"Saved: {OUTPUT}")


if __name__ == "__main__":
    main()
