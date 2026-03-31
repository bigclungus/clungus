#!/usr/bin/env python3
"""
Punished Trump - 256x256 pixel art avatar generator
Battle-scarred, eye-patched Trump in dark dramatic style.
"""

from PIL import Image, ImageDraw
import math

W, H = 256, 256

# --- Color Palette ---
BG_DARK       = (18, 18, 24)
BG_MID        = (28, 28, 36)

SKIN_DARK     = (180, 100, 50)
SKIN_MID      = (210, 130, 70)
SKIN_LIGHT    = (230, 155, 90)
SKIN_HIGHLIGHT= (245, 175, 110)
SKIN_SHADOW   = (150, 80, 35)
SKIN_DEEP     = (120, 60, 25)

HAIR_DARK     = (180, 145, 40)
HAIR_MID      = (210, 175, 60)
HAIR_LIGHT    = (235, 200, 80)
HAIR_HIGHLIGHT= (250, 220, 100)
HAIR_SHADOW   = (140, 110, 25)

EYE_WHITE     = (230, 220, 210)
EYE_IRIS      = (80, 60, 40)
EYE_PUPIL     = (20, 15, 10)
EYE_SHADOW    = (100, 70, 40)

PATCH_BLACK   = (15, 12, 10)
PATCH_DARK    = (30, 22, 15)
PATCH_STRAP   = (45, 32, 20)
PATCH_EDGE    = (60, 45, 28)

SCAR_COLOR    = (190, 110, 70)
SCAR_LIGHT    = (210, 130, 80)

SUIT_DARK     = (20, 25, 45)
SUIT_MID      = (28, 35, 58)
SUIT_LIGHT    = (38, 48, 72)
SUIT_HIGHLIGHT= (50, 62, 88)
SUIT_SHADOW   = (12, 15, 28)

SHIRT_WHITE   = (235, 235, 240)
SHIRT_SHADOW  = (200, 200, 210)

TIE_DARK      = (140, 15, 15)
TIE_MID       = (185, 20, 20)
TIE_LIGHT     = (210, 35, 35)
TIE_HIGHLIGHT = (230, 55, 55)

NECK_MID      = SKIN_MID
NECK_SHADOW   = SKIN_DARK

LIP_DARK      = (160, 80, 60)
LIP_MID       = (185, 95, 70)
LIP_LIGHT     = (205, 110, 80)

NOSTRIL       = (130, 65, 30)
EYEBROW_COLOR = (140, 110, 30)

img = Image.new("RGB", (W, H), BG_DARK)
d = ImageDraw.Draw(img)

def px(x, y, color):
    if 0 <= x < W and 0 <= y < H:
        img.putpixel((x, y), color)

def hline(x1, x2, y, color):
    for x in range(x1, x2+1):
        px(x, y, color)

def vline(x, y1, y2, color):
    for y in range(y1, y2+1):
        px(x, y, color)

def rect(x1, y1, x2, y2, color):
    for y in range(y1, y2+1):
        hline(x1, x2, y, color)

def blend(c1, c2, t):
    """Blend two colors, t=0 -> c1, t=1 -> c2"""
    return tuple(int(c1[i] + (c2[i]-c1[i])*t) for i in range(3))

# ============================================================
# BACKGROUND — dark dramatic gradient
# ============================================================
for y in range(H):
    t = y / H
    col = blend(BG_MID, BG_DARK, t)
    hline(0, W-1, y, col)

# Subtle vignette edges
for y in range(H):
    for x in range(30):
        t = x / 30
        col = blend(BG_DARK, img.getpixel((x, y)), t)
        px(x, y, col)
    for x in range(W-30, W):
        t = (W-1-x) / 30
        col = blend(BG_DARK, img.getpixel((x, y)), t)
        px(x, y, col)

# ============================================================
# SUIT BODY — bottom portion
# ============================================================
# Main suit body - wide trapezoid from bottom
suit_rows = [
    # (y, x_left, x_right)
]

# Suit body: shoulders around y=175, widens toward bottom
for y in range(175, H):
    t = (y - 175) / (H - 175)
    x_left  = int(40 - t * 8)
    x_right = int(216 + t * 8)
    for x in range(x_left, x_right+1):
        shade = SUIT_MID
        if x < x_left + 8:
            shade = SUIT_DARK
        elif x > x_right - 8:
            shade = SUIT_DARK
        elif x < x_left + 20:
            shade = blend(SUIT_DARK, SUIT_MID, (x - x_left - 8)/12)
        elif x > x_right - 20:
            shade = blend(SUIT_DARK, SUIT_MID, (x_right - x - 8)/12)
        px(x, y, shade)

# Suit body mid section y=130 to 175
for y in range(130, 176):
    t = (y - 130) / 45
    x_left  = int(52 + t * (40-52))
    x_right = int(204 - t * (204-216))
    for x in range(x_left, x_right+1):
        shade = SUIT_MID
        if x < x_left + 6:
            shade = SUIT_DARK
        elif x > x_right - 6:
            shade = SUIT_DARK
        px(x, y, shade)

# ============================================================
# LAPELS
# ============================================================
# Left lapel (viewer's right): from ~x=128 down-left
# Right lapel (viewer's left): from ~x=128 down-right
# We draw them as angled shapes

def fill_poly(points, color):
    """Scan-line fill a polygon defined by (x,y) tuples."""
    if len(points) < 3:
        return
    min_y = min(p[1] for p in points)
    max_y = max(p[1] for p in points)
    for y in range(min_y, max_y+1):
        intersections = []
        n = len(points)
        for i in range(n):
            x1, y1 = points[i]
            x2, y2 = points[(i+1) % n]
            if y1 == y2:
                continue
            if min(y1,y2) <= y <= max(y1,y2):
                t = (y - y1) / (y2 - y1)
                xi = x1 + t*(x2 - x1)
                intersections.append(xi)
        intersections.sort()
        for i in range(0, len(intersections)-1, 2):
            x_s = int(math.ceil(intersections[i]))
            x_e = int(math.floor(intersections[i+1]))
            hline(x_s, x_e, y, color)

# Left lapel (screen left side, viewer's right)
left_lapel = [
    (54, 130),
    (100, 130),
    (115, 155),
    (105, 175),
    (54, 175),
]
fill_poly(left_lapel, SUIT_LIGHT)

# Left lapel edge highlight
for i in range(len(left_lapel)-1):
    x1,y1 = left_lapel[i]
    x2,y2 = left_lapel[i+1]
    steps = max(abs(x2-x1), abs(y2-y1))
    if steps == 0: continue
    for s in range(steps+1):
        t = s/steps
        px(int(x1+t*(x2-x1)), int(y1+t*(y2-y1)), SUIT_HIGHLIGHT)

# Right lapel (screen right, viewer's left)
right_lapel = [
    (156, 130),
    (202, 130),
    (202, 175),
    (151, 175),
    (141, 155),
]
fill_poly(right_lapel, SUIT_LIGHT)

for i in range(len(right_lapel)-1):
    x1,y1 = right_lapel[i]
    x2,y2 = right_lapel[i+1]
    steps = max(abs(x2-x1), abs(y2-y1))
    if steps == 0: continue
    for s in range(steps+1):
        t = s/steps
        px(int(x1+t*(x2-x1)), int(y1+t*(y2-y1)), SUIT_HIGHLIGHT)

# ============================================================
# WHITE SHIRT COLLAR / CHEST
# ============================================================
# V-shape shirt visible between lapels
shirt_region = [
    (100, 130),
    (128, 130),
    (156, 130),
    (143, 158),
    (128, 170),
    (113, 158),
]
fill_poly(shirt_region, SHIRT_WHITE)

# Collar points
# Left collar point
collar_left = [
    (100, 130),
    (113, 130),
    (116, 143),
    (108, 148),
]
fill_poly(collar_left, SHIRT_WHITE)

# Right collar point
collar_right = [
    (143, 130),
    (156, 130),
    (148, 148),
    (140, 143),
]
fill_poly(collar_right, SHIRT_WHITE)

# Shirt shadow at edges
for y in range(130, 170):
    px(113, y, SHIRT_SHADOW)
    px(143, y, SHIRT_SHADOW)

# ============================================================
# TIE
# ============================================================
# Tie knot at top, widening downward
for y in range(133, 145):
    t = (y - 133) / 12
    w = int(6 + t * 4)
    x_c = 128
    for x in range(x_c - w, x_c + w + 1):
        shade = TIE_MID
        if abs(x - x_c) < 2:
            shade = TIE_HIGHLIGHT
        elif abs(x - x_c) > w - 2:
            shade = TIE_DARK
        px(x, y, shade)

# Tie body widening
for y in range(145, 210):
    t = (y - 145) / 65
    w = int(10 + t * 14)
    x_c = 128
    for x in range(x_c - w, x_c + w + 1):
        shade = TIE_MID
        if abs(x - x_c) < 3:
            shade = TIE_HIGHLIGHT
        elif x - x_c > w - 3:
            shade = TIE_DARK
        elif x_c - x > w - 3:
            shade = TIE_DARK
        px(x, y, shade)

# Tie point at bottom
for y in range(210, 230):
    t = (y - 210) / 20
    w = int(24 - t * 24)
    if w < 0: break
    x_c = 128
    for x in range(x_c - w, x_c + w + 1):
        shade = TIE_MID
        if abs(x - x_c) < 2:
            shade = TIE_HIGHLIGHT
        px(x, y, shade)

# ============================================================
# NECK
# ============================================================
for y in range(116, 132):
    t = (y - 116) / 16
    neck_w = int(22 + t * 4)
    x_c = 128
    for x in range(x_c - neck_w, x_c + neck_w + 1):
        shade = NECK_MID
        if abs(x - x_c) > neck_w - 4:
            shade = NECK_SHADOW
        px(x, y, shade)

# ============================================================
# FACE SHAPE
# ============================================================
# Face center: 128, face top ~45, chin ~120
# Build face as filled region row by row

face_rows = {}

def face_width_at(y):
    """Returns (x_left, x_right) for face at given y."""
    if y < 45:
        return None
    elif y < 60:
        # Top of head, narrows
        t = (y - 45) / 15
        w = int(35 + t * 20)
        return (128 - w, 128 + w)
    elif y < 85:
        # Forehead, widest
        t = (y - 60) / 25
        w = int(55 + t * 5)
        return (128 - w, 128 + w)
    elif y < 100:
        # Cheekbones (widest)
        t = (y - 85) / 15
        w = int(60 - t * 3)
        return (128 - w, 128 + w)
    elif y < 110:
        # Below cheekbones, slight narrowing
        t = (y - 100) / 10
        w = int(57 - t * 8)
        return (128 - w, 128 + w)
    elif y < 118:
        # Jaw
        t = (y - 110) / 8
        w = int(49 - t * 10)
        return (128 - w, 128 + w)
    elif y < 122:
        # Chin narrowing
        t = (y - 118) / 4
        w = int(39 - t * 15)
        return (128 - w, 128 + w)
    else:
        return None

for y in range(45, 125):
    bounds = face_width_at(y)
    if bounds is None:
        continue
    xl, xr = bounds
    for x in range(xl, xr+1):
        # Base skin tone with shading
        shade = SKIN_MID
        # Left edge shadow
        if x - xl < 6:
            t = (x - xl) / 6
            shade = blend(SKIN_SHADOW, SKIN_MID, t)
        # Right edge shadow
        elif xr - x < 6:
            t = (xr - x) / 6
            shade = blend(SKIN_SHADOW, SKIN_MID, t)
        # Center highlight (slightly off-center, left side brighter)
        elif 105 < x < 135 and 55 < y < 105:
            shade = SKIN_LIGHT
        px(x, y, shade)
    face_rows[y] = (xl, xr)

# Forehead highlight (center top)
for y in range(55, 78):
    for x in range(118, 142):
        bounds = face_width_at(y)
        if bounds and bounds[0] < x < bounds[1]:
            t = 1 - abs(x-128)/14
            t2 = 1 - abs(y-65)/13
            if t > 0 and t2 > 0:
                shade = blend(SKIN_LIGHT, SKIN_HIGHLIGHT, t*t2*0.5)
                px(x, y, shade)

# ============================================================
# HAIR
# ============================================================
# Trump's swept-back hair: tall pompadour, sweeps right
# Hair starts above forehead ~y=45, comes down sides

# Main hair mass — top/back
hair_top_rows = {
    # y: (xl, xr)
    30: (82, 178),
    31: (78, 180),
    32: (74, 182),
    33: (72, 183),
    34: (70, 184),
    35: (68, 185),
    36: (67, 186),
    37: (66, 186),
    38: (65, 187),
    39: (64, 187),
    40: (64, 188),
    41: (63, 188),
    42: (63, 189),
    43: (63, 188),
    44: (63, 188),
    45: (64, 187),
}

for y, (xl, xr) in hair_top_rows.items():
    for x in range(xl, xr+1):
        shade = HAIR_MID
        # Left side shadow
        if x - xl < 8:
            t = (x - xl) / 8
            shade = blend(HAIR_SHADOW, HAIR_MID, t)
        # Right side shadow
        elif xr - x < 8:
            t = (xr - x) / 8
            shade = blend(HAIR_SHADOW, HAIR_MID, t)
        # Top highlight stripe (the "swept" highlight)
        elif 110 < x < 165 and 32 < y < 44:
            t = 1 - abs(x - 138) / 27
            shade = blend(HAIR_MID, HAIR_HIGHLIGHT, t * 0.7)
        px(x, y, shade)

# Hair flowing over forehead (the signature swoosh)
# Goes across forehead from right to left, a thick wave
for y in range(45, 68):
    # The hair covers the top of the forehead
    xl_face = face_width_at(y)
    if xl_face is None:
        continue
    xl_f, xr_f = xl_face
    # Hair covers left side down to about y=67
    hair_right_edge = int(180 - (y-45) * 2.2)  # sweeps leftward as it goes down
    hair_left_edge  = xl_f
    if hair_right_edge < hair_left_edge + 4:
        break
    for x in range(hair_left_edge, hair_right_edge+1):
        shade = HAIR_MID
        if x - hair_left_edge < 6:
            t = (x - hair_left_edge) / 6
            shade = blend(HAIR_SHADOW, HAIR_MID, t)
        elif hair_right_edge - x < 5:
            t = (hair_right_edge - x) / 5
            shade = blend(HAIR_DARK, HAIR_MID, t)
        elif 120 < x < 160:
            t = 1 - abs(x-140)/20
            shade = blend(HAIR_MID, HAIR_LIGHT, t * 0.6)
        px(x, y, shade)

# Hair sides — down the temples
# Right temple (viewer's left)
for y in range(62, 95):
    t = (y - 62) / 33
    xl = int(64 - t * 8)
    xr = int(80 - t * 5)
    if xl > xr:
        continue
    for x in range(xl, xr+1):
        shade = HAIR_DARK
        if xr - x < 4:
            t2 = (xr - x) / 4
            shade = blend(SKIN_SHADOW, HAIR_DARK, t2)
        px(x, y, shade)

# Left temple (viewer's right) — sideburn area
for y in range(62, 100):
    t = (y - 62) / 38
    xl = int(174 + t * 6)
    xr = int(190 + t * 2)
    if xl >= xr:
        continue
    # clamp to face
    bounds = face_width_at(y)
    if bounds:
        xr = min(xr, bounds[1] + 2)
    for x in range(xl, xr+1):
        shade = HAIR_DARK
        if x - xl < 3:
            t2 = (x - xl) / 3
            shade = blend(SKIN_SHADOW, HAIR_DARK, t2)
        px(x, y, shade)

# ============================================================
# EYEBROWS
# ============================================================
# Left eyebrow (screen left, over the eye patch)
for i, (x, y) in enumerate([
    (82,79),(83,79),(84,78),(85,78),(86,77),(87,77),(88,76),(89,76),
    (90,76),(91,75),(92,75),(93,75),(94,75),(95,76),(96,76),(97,76),
    (82,80),(83,80),(84,79),(85,79),(86,78),(87,78),(88,77),(89,77),
    (90,77),(91,76),(92,76),(93,76),(94,76),(95,77),(96,77),
]):
    px(x, y, EYEBROW_COLOR)
    px(x, y-1, blend(EYEBROW_COLOR, SKIN_MID, 0.4))

# Right eyebrow (screen right)
for (x, y) in [
    (158,76),(159,76),(160,76),(161,76),(162,76),(163,77),(164,77),(165,77),
    (166,78),(167,78),(168,78),(169,79),(170,79),(171,79),(172,80),
    (158,77),(159,77),(160,77),(161,77),(162,77),(163,78),(164,78),(165,78),
    (166,79),(167,79),(168,79),(169,80),(170,80),(171,80),
]:
    px(x, y, EYEBROW_COLOR)
    px(x, y-1, blend(EYEBROW_COLOR, SKIN_MID, 0.4))

# ============================================================
# RIGHT EYE (screen right, viewer's left — the open eye)
# ============================================================
# Eye socket shadow
for (x, y) in [
    (158,83),(159,82),(160,81),(161,81),(162,81),(163,81),(164,81),(165,81),
    (166,81),(167,81),(168,81),(169,81),(170,82),(171,83),(172,84),
    (157,84),(172,85),(157,85),(172,86),(158,87),(171,86),
]:
    px(x, y, SKIN_SHADOW)

# Eye white
for y in range(83, 90):
    if y == 83 or y == 89:
        xl, xr = 162, 170
    elif y == 84 or y == 88:
        xl, xr = 160, 172
    else:
        xl, xr = 158, 172
    for x in range(xl, xr+1):
        px(x, y, EYE_WHITE)

# Iris
for y in range(84, 90):
    if y in (84, 89):
        xl, xr = 163, 169
    else:
        xl, xr = 162, 170
    for x in range(xl, xr+1):
        dist = math.sqrt((x-166)**2 + (y-87)**2)
        if dist < 4.5:
            shade = EYE_IRIS if dist > 1.5 else EYE_PUPIL
            px(x, y, shade)

# Eye highlight
px(168, 85, (220, 220, 230))
px(169, 85, (200, 200, 215))

# Eyelid lines
hline(160, 172, 83, SKIN_SHADOW)
hline(160, 171, 89, EYE_SHADOW)

# Upper eyelid crease
for x in range(159, 173):
    px(x, 82, blend(SKIN_SHADOW, SKIN_MID, 0.5))

# ============================================================
# LEFT EYE PATCH (screen left — battle-scarred eye)
# ============================================================
# Eye patch: oval-ish dark shape over left eye
# Centered around x=100, y=85

patch_cx, patch_cy = 100, 86
patch_rx, patch_ry = 20, 13

# Fill patch
for y in range(patch_cy - patch_ry - 2, patch_cy + patch_ry + 2):
    for x in range(patch_cx - patch_rx - 2, patch_cx + patch_rx + 2):
        dx = (x - patch_cx) / (patch_rx + 1)
        dy = (y - patch_cy) / (patch_ry + 1)
        dist = math.sqrt(dx**2 + dy**2)
        if dist < 1.0:
            # Inside patch
            if dist < 0.7:
                shade = PATCH_BLACK
            else:
                shade = PATCH_DARK
            px(x, y, shade)

# Patch edge/border
for angle_deg in range(0, 360, 2):
    angle = math.radians(angle_deg)
    x = int(patch_cx + (patch_rx + 1) * math.cos(angle))
    y = int(patch_cy + (patch_ry + 1) * math.sin(angle))
    px(x, y, PATCH_EDGE)
    x2 = int(patch_cx + (patch_rx + 0) * math.cos(angle))
    y2 = int(patch_cy + (patch_ry + 0) * math.sin(angle))
    px(x2, y2, PATCH_EDGE)

# Patch sheen (slight highlight top-left of patch)
for (x, y) in [(94,80),(95,80),(96,80),(94,81),(95,81),(93,82),(94,82)]:
    px(x, y, blend(PATCH_DARK, (60,50,40), 0.5))

# Eye patch STRAP — goes over the head to the right (and wraps behind)
# Strap from right side of patch, angling up toward right temple, then across forehead
# Strap: dark leather band

strap_start = (patch_cx + patch_rx + 1, patch_cy - 2)

# Strap from patch rightward and up
strap_points = [
    (121, 80),
    (134, 75),
    (148, 72),
    (160, 70),
    (170, 69),
    (178, 68),
    (187, 68),
]
prev = strap_start
for pt in strap_points:
    # Draw thick strap line between prev and pt
    dx = pt[0] - prev[0]
    dy = pt[1] - prev[1]
    steps = max(abs(dx), abs(dy))
    if steps == 0:
        steps = 1
    for s in range(steps+1):
        t = s / steps
        sx = int(prev[0] + t*dx)
        sy = int(prev[1] + t*dy)
        # 3-pixel wide strap
        for oy in range(-1, 2):
            shade = PATCH_STRAP if oy == 0 else PATCH_DARK
            px(sx, sy+oy, shade)
            # Edge highlight on top
        px(sx, sy-1, blend(PATCH_EDGE, PATCH_STRAP, 0.5))
    prev = pt

# Left side strap (goes behind head — just visible at left temple edge)
strap_left = [(79, 84), (72, 84), (67, 85), (64, 86)]
prev = (patch_cx - patch_rx - 1, patch_cy)
for pt in strap_left:
    dx = pt[0] - prev[0]
    dy = pt[1] - prev[1]
    steps = max(abs(dx), abs(dy))
    if steps == 0: steps = 1
    for s in range(steps+1):
        t = s/steps
        sx = int(prev[0]+t*dx)
        sy = int(prev[1]+t*dy)
        px(sx, sy, PATCH_STRAP)
        px(sx, sy+1, PATCH_DARK)
    prev = pt

# ============================================================
# SCAR on RIGHT cheek (screen right)
# ============================================================
# Diagonal jagged scar from ~(168,92) down to (155,112)
scar_points = [
    (168, 92), (167, 94), (169, 96), (167, 98), (166, 100),
    (165, 102), (164, 104), (165, 106), (163, 108), (162, 110),
    (161, 112), (160, 114),
]
for i, (sx, sy) in enumerate(scar_points):
    # Main scar line
    px(sx, sy, SCAR_COLOR)
    # Adjacent pixels for width
    px(sx+1, sy, blend(SCAR_COLOR, SKIN_MID, 0.5))
    px(sx-1, sy, blend(SCAR_LIGHT, SKIN_MID, 0.4))
    # Occasional jagged offset
    if i % 3 == 1:
        px(sx+1, sy+1, SCAR_COLOR)
    elif i % 3 == 2:
        px(sx-1, sy+1, SCAR_LIGHT)

# ============================================================
# NOSE
# ============================================================
# Nose bridge
for y in range(88, 104):
    px(126, y, blend(SKIN_SHADOW, SKIN_MID, 0.4))
    px(127, y, SKIN_MID)
    px(128, y, SKIN_LIGHT)
    px(129, y, SKIN_MID)

# Nose tip (bulbous)
for y in range(102, 110):
    t = (y - 102) / 8
    hw = int(7 + t * 3)
    x_c = 128
    for x in range(x_c - hw, x_c + hw + 1):
        dist = math.sqrt((x-x_c)**2 + (y-106)**2)
        if dist < hw + 0.5:
            shade = SKIN_LIGHT if dist < hw - 2 else SKIN_MID
            if x_c - x > hw - 3:
                shade = SKIN_SHADOW
            px(x, y, shade)

# Nostrils
nostril_pixels = [
    (120,107),(121,107),(122,107),(120,108),(121,108),(122,108),
    (134,107),(135,107),(136,107),(134,108),(135,108),(136,108),
]
for (x,y) in nostril_pixels:
    px(x, y, NOSTRIL)

# Nose shadow cast below
for x in range(122, 135):
    px(x, 110, blend(SKIN_SHADOW, SKIN_MID, 0.6))

# ============================================================
# MOUTH
# ============================================================
# Stern, slightly pursed expression
# Upper lip
for y in range(112, 116):
    t = (y - 112) / 4
    hw = int(16 - t * 2)
    for x in range(128-hw, 128+hw+1):
        shade = LIP_MID
        if abs(x-128) > hw - 3:
            shade = LIP_DARK
        elif t < 0.3 and abs(x-128) < 5:
            shade = LIP_LIGHT
        px(x, y, shade)

# Mouth line — thin, stern
for x in range(112, 145):
    px(x, 116, blend(LIP_DARK, SKIN_SHADOW, 0.7))
    if x in range(114, 143):
        px(x, 117, blend(LIP_DARK, SKIN_SHADOW, 0.4))

# Lower lip (thicker)
for y in range(117, 122):
    t = (y - 117) / 5
    hw = int(15 - t * 4)
    for x in range(128-hw, 128+hw+1):
        shade = LIP_MID
        if abs(x-128) < 4 and t < 0.5:
            shade = LIP_LIGHT
        elif abs(x-128) > hw - 3:
            shade = LIP_DARK
        px(x, y, shade)

# Mouth corner shadows
px(112, 115, SKIN_SHADOW)
px(113, 115, SKIN_SHADOW)
px(144, 115, SKIN_SHADOW)
px(145, 115, SKIN_SHADOW)

# ============================================================
# EARS
# ============================================================
# Left ear (viewer's right)
for y in range(85, 108):
    t = (y - 85) / 23
    if t < 0.2 or t > 0.8:
        xl, xr = 185, 192
    else:
        xl, xr = 184, 194
    for x in range(xl, xr+1):
        shade = SKIN_MID
        if x == xl or x == xr:
            shade = SKIN_SHADOW
        elif x == xl+1 or x == xr-1:
            shade = SKIN_DARK
        px(x, y, shade)

# Right ear (viewer's left)
for y in range(85, 108):
    t = (y - 85) / 23
    if t < 0.2 or t > 0.8:
        xl, xr = 64, 71
    else:
        xl, xr = 62, 72
    for x in range(xl, xr+1):
        shade = SKIN_MID
        if x == xl or x == xr:
            shade = SKIN_SHADOW
        elif x == xl+1 or x == xr-1:
            shade = SKIN_DARK
        px(x, y, shade)

# ============================================================
# FACE DETAIL — cheek/jaw shading
# ============================================================
# Cheekbone highlight (right side, under open eye)
for y in range(90, 103):
    for x in range(156, 180):
        bounds = face_width_at(y)
        if bounds and bounds[0] < x < bounds[1] - 5:
            if not (158 < x < 174 and 83 < y < 91):  # skip eye area
                t = 1 - abs(x-168)/12
                t2 = 1 - abs(y-96)/7
                if t > 0 and t2 > 0 and t*t2 > 0.2:
                    cur = img.getpixel((x,y))
                    if cur[0] > 150:  # only on skin
                        new_shade = blend(cur, SKIN_LIGHT, t*t2*0.3)
                        px(x, y, new_shade)

# Jaw shadow underside
for y in range(116, 123):
    bounds = face_width_at(y)
    if not bounds:
        continue
    xl, xr = bounds
    for x in range(xl, xr+1):
        t_l = (x - xl) / max(xr-xl, 1)
        if t_l < 0.15 or t_l > 0.85:
            px(x, y, blend(SKIN_SHADOW, img.getpixel((x,y)), 0.6))

# Jowl shadows
for y in range(105, 120):
    bounds = face_width_at(y)
    if not bounds: continue
    xl, xr = bounds
    for ox in range(6):
        t = ox / 6
        px(xl+ox, y, blend(SKIN_DEEP, img.getpixel((xl+ox,y)), 1-t*0.5))
        px(xr-ox, y, blend(SKIN_DEEP, img.getpixel((xr-ox,y)), 1-t*0.5))

# ============================================================
# FINAL TOUCHES — outline the face with a very subtle dark edge
# ============================================================
for y in range(45, 125):
    bounds = face_width_at(y)
    if not bounds: continue
    xl, xr = bounds
    # One-pixel dark outline
    px(xl-1, y, blend(SKIN_DEEP, BG_DARK, 0.7))
    px(xr+1, y, blend(SKIN_DEEP, BG_DARK, 0.7))

# Neck outline
for y in range(116, 132):
    t = (y - 116) / 16
    neck_w = int(22 + t * 4)
    x_c = 128
    px(x_c - neck_w - 1, y, blend(SKIN_DEEP, BG_DARK, 0.7))
    px(x_c + neck_w + 1, y, blend(SKIN_DEEP, BG_DARK, 0.7))

# ============================================================
# DRAMATIC LIGHTING — subtle side-light from screen-right
# ============================================================
for y in range(55, 120):
    bounds = face_width_at(y)
    if not bounds: continue
    xl, xr = bounds
    # Left side (shadow side, screen left)
    for ox in range(12):
        t = ox / 12
        x = xl + ox
        if 0 <= x < W:
            cur = img.getpixel((x, y))
            if cur[0] > 120:  # skin pixel
                new_col = blend(cur, SKIN_DEEP, (1-t)*0.25)
                px(x, y, new_col)

# ============================================================
# SUBTLE BACKGROUND LIGHTING — rim light behind figure
# ============================================================
# Faint blue-grey rim light on left side of figure
for y in range(35, 200):
    for x in range(max(0, 55-y//20), 70):
        cur = img.getpixel((x, y))
        if cur == BG_DARK or cur == BG_MID or (cur[0] < 40 and cur[1] < 40 and cur[2] < 60):
            t = (x - (55-y//20)) / 15
            rim = (30, 35, 55)
            new_col = blend(rim, cur, t)
            px(x, y, new_col)

# Save as GIF
out_path = "/mnt/data/hello-world/static/avatars/punished-trump.gif"
img.save(out_path, "GIF")
print(f"Saved to {out_path}")
print(f"Size: {img.size}")
