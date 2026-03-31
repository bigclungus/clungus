#!/usr/bin/env python3
"""
Punished Trump - 256x256 pixel art avatar v2
Higher quality, more detail, better proportions.
"""

from PIL import Image, ImageDraw
import math

W, H = 256, 256

# --- Palette ---
BG           = (14, 16, 22)

# Skin tones
SK_DEEP      = (115, 58, 20)
SK_DARK      = (155, 85, 38)
SK_MID       = (200, 118, 55)
SK_LITE      = (222, 142, 72)
SK_BRIGHT    = (238, 162, 88)
SK_HILITE    = (250, 180, 100)

# Hair — golden/amber
HA_DARK      = (155, 120, 28)
HA_MID       = (192, 158, 48)
HA_LITE      = (218, 185, 65)
HA_BRIGHT    = (238, 208, 82)
HA_HILITE    = (252, 228, 100)

# Eye
EW           = (235, 225, 215)   # eye white
EI           = (72, 52, 32)      # iris
EP           = (18, 12, 8)       # pupil

# Eye patch
PA_BLACK     = (10, 8, 6)
PA_DARK      = (28, 20, 12)
PA_EDGE      = (55, 40, 22)
PA_STRAP     = (40, 28, 14)
PA_SHEEN     = (70, 55, 30)

# Scar
SC_MAIN      = (195, 105, 62)
SC_LITE      = (215, 125, 75)
SC_DARK      = (145, 68, 30)

# Suit
SU_DEEP      = (10, 12, 24)
SU_DARK      = (18, 22, 40)
SU_MID       = (26, 33, 56)
SU_LITE      = (36, 46, 72)
SU_HILITE    = (50, 64, 92)

# Shirt / collar
SH_WHITE     = (238, 238, 244)
SH_SHADOW    = (195, 198, 210)
SH_DEEP      = (160, 162, 178)

# Tie
TI_DEEP      = (120, 12, 12)
TI_DARK      = (155, 18, 18)
TI_MID       = (188, 24, 24)
TI_LITE      = (212, 38, 38)
TI_HILITE    = (232, 58, 58)

# Mouth / lips
LI_DARK      = (148, 72, 52)
LI_MID       = (178, 90, 65)
LI_LITE      = (200, 108, 78)

# Nose
NO_DARK      = (128, 60, 22)
NO_MID       = SK_DARK

BROW         = (138, 105, 28)

img = Image.new("RGB", (W, H), BG)

def px(x, y, c):
    if 0 <= x < W and 0 <= y < H:
        img.putpixel((x, y), c)

def hline(x1, x2, y, c):
    for x in range(x1, x2+1): px(x, y, c)

def rect(x1, y1, x2, y2, c):
    for y in range(y1, y2+1): hline(x1, x2, y, c)

def lerp(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(c1[i] + (c2[i]-c1[i])*t) for i in range(3))

def fill_poly(pts, c):
    if len(pts) < 3: return
    min_y = min(p[1] for p in pts)
    max_y = max(p[1] for p in pts)
    n = len(pts)
    for y in range(min_y, max_y+1):
        xs = []
        for i in range(n):
            x1,y1 = pts[i]; x2,y2 = pts[(i+1)%n]
            if y1==y2: continue
            if min(y1,y2) <= y <= max(y1,y2):
                t = (y-y1)/(y2-y1)
                xs.append(x1+t*(x2-x1))
        xs.sort()
        for i in range(0,len(xs)-1,2):
            hline(int(math.ceil(xs[i])), int(math.floor(xs[i+1])), y, c)

def draw_line(x1,y1,x2,y2,c,thickness=1):
    dx=x2-x1; dy=y2-y1
    steps=max(abs(dx),abs(dy),1)
    for s in range(steps+1):
        t=s/steps
        x=int(round(x1+t*dx)); y=int(round(y1+t*dy))
        for oy in range(-(thickness//2),(thickness//2)+1):
            px(x,y+oy,c)

# =====================================================
# BACKGROUND — dark radial gradient
# =====================================================
cx, cy = 128, 110
for y in range(H):
    for x in range(W):
        dist = math.sqrt((x-cx)**2 + (y-cy)**2)
        t = min(dist / 160, 1.0)
        col = lerp((22, 24, 34), (10, 10, 16), t)
        px(x, y, col)

# =====================================================
# SUIT BODY
# =====================================================
# Main body fill — trapezoidal
for y in range(160, H):
    t = (y-160)/(H-160)
    xl = int(38 - t*5)
    xr = int(218 + t*5)
    for x in range(xl, xr+1):
        # Shading: darker at edges
        edge_dist = min(x-xl, xr-x)
        if edge_dist < 12:
            shade = lerp(SU_DEEP, SU_DARK, edge_dist/12)
        else:
            shade = SU_MID
        px(x, y, shade)

# Upper suit body + shoulders
for y in range(138, 161):
    t = (y-138)/22
    xl = int(58 + (38-58)*(t))
    xr = int(198 + (218-198)*(t))
    for x in range(xl, xr+1):
        edge_dist = min(x-xl, xr-x)
        if edge_dist < 8:
            shade = lerp(SU_DEEP, SU_DARK, edge_dist/8)
        else:
            shade = SU_MID
        px(x, y, shade)

# =====================================================
# LAPELS — angled panels creating the V
# =====================================================
# Left lapel (screen left)
ll = [(58,138),(110,138),(118,162),(105,180),(58,180)]
fill_poly(ll, SU_LITE)
# Edge highlight
draw_line(110,138,118,162,SU_HILITE,1)
draw_line(58,138,110,138,SU_HILITE,1)
# Inner shadow
draw_line(105,180,118,162,SU_DARK,1)

# Right lapel (screen right)
rl = [(146,138),(198,138),(198,180),(151,180),(138,162)]
fill_poly(rl, SU_LITE)
draw_line(146,138,138,162,SU_HILITE,1)
draw_line(146,138,198,138,SU_HILITE,1)
draw_line(151,180,138,162,SU_DARK,1)

# =====================================================
# WHITE SHIRT COLLAR + CHEST
# =====================================================
# Shirt between lapels
shirt_pts = [(110,138),(146,138),(148,155),(128,172),(108,155)]
fill_poly(shirt_pts, SH_WHITE)

# Collar shadow
for y in range(138, 172):
    for x in range(108, 150):
        cur = img.getpixel((x,y))
        if cur == SH_WHITE:
            # Edge shadows
            if x < 112 or x > 146:
                px(x, y, SH_SHADOW)
            elif y > 160:
                px(x, y, SH_SHADOW)

# Collar fold lines
draw_line(118,138,120,160,SH_SHADOW,1)
draw_line(138,138,136,160,SH_SHADOW,1)

# =====================================================
# TIE
# =====================================================
# Knot at top
for y in range(140, 150):
    t = (y-140)/10
    hw = int(7 + t*2)
    for x in range(128-hw, 128+hw+1):
        inner = abs(x-128) < hw-2
        side = abs(x-128) > hw-2
        if inner:
            shade = TI_MID if abs(x-128) > 2 else TI_LITE
        else:
            shade = TI_DARK
        px(x, y, shade)

# Body
for y in range(150, 218):
    t = (y-150)/68
    hw = int(9 + t*16)
    if hw > 28: hw=28
    for x in range(128-hw, 128+hw+1):
        xd = abs(x-128)
        if xd < 2:
            shade = TI_LITE
        elif xd < hw-3:
            shade = TI_MID
        else:
            shade = TI_DARK
        px(x, y, shade)

# Point
for y in range(218, 235):
    t = (y-218)/17
    hw = int(28 - t*28)
    if hw < 0: break
    for x in range(128-hw, 128+hw+1):
        xd = abs(x-128)
        shade = TI_MID if xd < hw-2 else TI_DARK
        px(x, y, shade)

# =====================================================
# NECK
# =====================================================
for y in range(126, 140):
    t = (y-126)/14
    hw = int(20 + t*8)
    for x in range(128-hw, 128+hw+1):
        xd = abs(x-128)
        if xd > hw-5:
            shade = SK_DARK
        else:
            shade = SK_MID
        px(x, y, shade)

# =====================================================
# FACE — carefully shaped
# =====================================================
def face_bounds(y):
    if y < 42: return None
    if y < 55:
        t=(y-42)/13; w=int(28+t*28)
        return (128-w, 128+w)
    if y < 72:
        t=(y-55)/17; w=int(56+t*6)
        return (128-w, 128+w)
    if y < 90:
        # widest — cheek area
        t=(y-72)/18; w=int(62 - t*2)
        return (128-w, 128+w)
    if y < 105:
        t=(y-90)/15; w=int(60 - t*10)
        return (128-w, 128+w)
    if y < 113:
        t=(y-105)/8; w=int(50 - t*8)
        return (128-w, 128+w)
    if y < 120:
        t=(y-113)/7; w=int(42 - t*12)
        return (128-w, 128+w)
    if y < 126:
        t=(y-120)/6; w=int(30 - t*15)
        return (128-w, 128+w)
    return None

for y in range(42, 127):
    b = face_bounds(y)
    if not b: continue
    xl, xr = b
    for x in range(xl, xr+1):
        # Base shading
        t_x = (x-xl)/(xr-xl)  # 0=left, 1=right
        # Dramatic lighting from viewer's right
        if t_x < 0.12:
            shade = lerp(SK_DEEP, SK_DARK, t_x/0.12)
        elif t_x < 0.22:
            shade = lerp(SK_DARK, SK_MID, (t_x-0.12)/0.10)
        elif t_x < 0.55:
            # left-center: darker (shadow side with patch)
            shade = SK_MID
        elif t_x < 0.72:
            # right-center: highlight zone
            shade = SK_LITE
        elif t_x < 0.85:
            shade = SK_MID
        elif t_x < 0.93:
            shade = lerp(SK_MID, SK_DARK, (t_x-0.85)/0.08)
        else:
            shade = lerp(SK_DARK, SK_DEEP, (t_x-0.93)/0.07)
        # Forehead brightening
        if 60 < y < 82 and 115 < x < 148:
            shade = lerp(shade, SK_BRIGHT, 0.35)
        # Cheek highlight (right cheek, viewer's left)
        if 88 < y < 104 and 152 < x < 185:
            dist = math.sqrt((x-166)**2 + (y-96)**2)
            if dist < 12:
                shade = lerp(shade, SK_BRIGHT, (12-dist)/12*0.4)
        px(x, y, shade)

# Face outline
for y in range(42, 127):
    b = face_bounds(y)
    if not b: continue
    xl, xr = b
    # Dark border 1px outside
    px(xl-1, y, lerp(SK_DEEP, BG, 0.6))
    px(xr+1, y, lerp(SK_DEEP, BG, 0.6))
    # Inner dark 1px
    px(xl, y, lerp(SK_DEEP, img.getpixel((xl,y)), 0.5))
    px(xr, y, lerp(SK_DEEP, img.getpixel((xr,y)), 0.5))

# =====================================================
# HAIR — Swept pompadour style
# =====================================================
# Crown/top of head
for y in range(16, 56):
    if y < 28:
        t=(y-16)/12; w=int(8+t*38)
    elif y < 42:
        t=(y-28)/14; w=int(46+t*18)
    else:
        t=(y-42)/14; w=int(64-t*6)
    xl=128-w; xr=128+w
    for x in range(xl, xr+1):
        # Shade: darker on sides, bright streak in middle-upper
        xd = abs(x-128)
        t_x = xd/w if w > 0 else 0
        if t_x > 0.85:
            shade = HA_DARK
        elif t_x > 0.65:
            shade = lerp(HA_DARK, HA_MID, (0.85-t_x)/0.2)
        elif t_x > 0.35:
            shade = HA_MID
        elif t_x > 0.15:
            shade = lerp(HA_MID, HA_LITE, (0.35-t_x)/0.2)
        else:
            shade = HA_LITE
        # Top highlight stripe
        if y < 35 and t_x < 0.4:
            shade = lerp(shade, HA_HILITE, 0.5)
        px(x, y, shade)

# Front hair — the sweep across forehead
# Trump's hair sweeps from right to left across the forehead
for y in range(42, 74):
    b = face_bounds(y)
    if not b: continue
    xl_f, xr_f = b
    # Hair covers the forehead, sweeping
    # Right edge of hair sweeps left as y increases
    hair_edge_r = int(188 - (y-42)*1.8)  # right edge moves left
    hair_edge_l = xl_f  # hair covers full left side always
    if hair_edge_r < xl_f + 8:
        hair_edge_r = xl_f + 8
    for x in range(hair_edge_l, hair_edge_r+1):
        xd = abs(x - (xl_f + (hair_edge_r-xl_f)//2))
        # Shading
        t_pos = (x - hair_edge_l) / max(hair_edge_r - hair_edge_l, 1)
        if t_pos < 0.08:
            shade = HA_DARK
        elif t_pos < 0.2:
            shade = lerp(HA_DARK, HA_MID, (t_pos-0.08)/0.12)
        elif t_pos < 0.55:
            shade = HA_MID
        elif t_pos < 0.75:
            shade = lerp(HA_MID, HA_LITE, (t_pos-0.55)/0.2)
        elif t_pos < 0.88:
            shade = lerp(HA_LITE, HA_BRIGHT, (t_pos-0.75)/0.13)
        else:
            shade = lerp(HA_BRIGHT, HA_DARK, (t_pos-0.88)/0.12)
        # Highlight strip going across mid hair
        if 42 < y < 62 and 0.3 < t_pos < 0.7:
            shade = lerp(shade, HA_BRIGHT, 0.3)
        if y < 52 and 0.45 < t_pos < 0.6:
            shade = lerp(shade, HA_HILITE, 0.3)
        px(x, y, shade)

# Right temple sideburn (viewer's left, screen right)
for y in range(56, 102):
    b = face_bounds(y)
    if not b: continue
    xl_f, xr_f = b
    t = (y-56)/46
    xl = int(xr_f + 0)
    xr = int(xr_f + 10 - t*6)
    if xl > xr: continue
    for x in range(xl, min(xr+1, W)):
        shade = lerp(HA_DARK, HA_MID, (x-xl)/(xr-xl+0.01))
        px(x, y, shade)

# Left temple (screen left, viewer's right)
for y in range(56, 100):
    b = face_bounds(y)
    if not b: continue
    xl_f, xr_f = b
    t = (y-56)/44
    xl = int(xl_f - 10 + t*6)
    xr = int(xl_f)
    if xl > xr: continue
    for x in range(max(0,xl), xr+1):
        shade = lerp(HA_MID, HA_DARK, (x-xl)/(xr-xl+0.01))
        px(x, y, shade)

# =====================================================
# EYEBROWS
# =====================================================
# Right brow (viewer's left, screen right) — angry, furrowed
brow_r_pts = [
    (153,77),(154,76),(155,76),(156,75),(157,75),(158,74),(159,74),
    (160,74),(161,73),(162,73),(163,73),(164,73),(165,74),(166,74),
    (167,74),(168,75),(169,75),(170,76),(171,76),(172,77),
]
for (x,y) in brow_r_pts:
    px(x,y,BROW)
    px(x,y+1,lerp(BROW,SK_MID,0.4))
    px(x,y-1,lerp(BROW,HA_MID,0.3))
    # Thicker in middle
    if 158<x<168:
        px(x,y+2,lerp(BROW,SK_MID,0.6))

# Left brow (screen left — over patch)
brow_l_pts = [
    (84,76),(85,76),(86,75),(87,75),(88,74),(89,74),(90,74),
    (91,73),(92,73),(93,73),(94,73),(95,73),(96,74),(97,74),
    (98,75),(99,75),(100,75),(101,76),(102,76),
]
for (x,y) in brow_l_pts:
    px(x,y,BROW)
    px(x,y+1,lerp(BROW,SK_MID,0.4))
    px(x,y-1,lerp(BROW,HA_MID,0.3))
    if 89<x<99:
        px(x,y+2,lerp(BROW,SK_MID,0.6))

# =====================================================
# RIGHT EYE (screen right, open)
# =====================================================
# Socket shadow
for y in range(80,93):
    for x in range(153,176):
        b = face_bounds(y)
        if b and b[0]<x<b[1]:
            xd=(x-163); yd=(y-86)
            # Eye socket shading
            if abs(xd)<12 and abs(yd)<6:
                px(x,y,lerp(SK_DARK, SK_MID, 0.3))

# Eye white fills
eye_r_white = []
for y in range(83,92):
    if y in(83,91):   xl,xr = 159,172
    elif y in(84,90): xl,xr = 157,174
    else:             xl,xr = 155,175
    for x in range(xl,xr+1):
        eye_r_white.append((x,y))
        px(x,y,EW)

# Upper eyelid (slight skin tone)
for x in range(157,175):
    px(x,83, lerp(SK_DARK, EW, 0.4))
    px(x,84, lerp(SK_MID,  EW, 0.2))

# Lower eyelid crease
for x in range(157,174):
    px(x,91, lerp(SK_MID, EW, 0.3))

# Iris
ic_x, ic_y = 165, 87
for y in range(84,91):
    for x in range(158,173):
        dist = math.sqrt((x-ic_x)**2 + (y-ic_y)**2)
        if dist < 5.5:
            if dist < 2.0:
                shade = EP
            elif dist < 4.0:
                shade = EI
            else:
                shade = lerp(EI, EW, (dist-4.0)/1.5)
            px(x,y,shade)

# Iris ring highlight
for angle in range(0,360,15):
    r=5.2; a=math.radians(angle)
    x=int(ic_x+r*math.cos(a)); y=int(ic_y+r*math.sin(a))
    px(x,y,lerp(EI,EW,0.5))

# Eye highlight
px(169,84,(235,235,245))
px(170,84,(215,215,228))
px(169,85,(215,215,228))

# Eyelid shadow above
for x in range(156,175):
    px(x,82, lerp(SK_DEEP, BG, 0.4))

# Corner of eye
px(155,87, lerp(SK_DARK,(220,180,160),0.5))
px(174,87, lerp(SK_DARK,(220,180,160),0.5))

# =====================================================
# EYE PATCH (screen left)
# =====================================================
pc_x, pc_y = 99, 86
pr_x, pr_y = 22, 14  # radii

# Fill patch oval
for y in range(pc_y-pr_y-3, pc_y+pr_y+3):
    for x in range(pc_x-pr_x-3, pc_x+pr_x+3):
        dx=(x-pc_x)/(pr_x+1.5); dy=(y-pc_y)/(pr_y+1.5)
        dist=math.sqrt(dx**2+dy**2)
        if dist < 1.0:
            if dist < 0.55:
                shade = PA_BLACK
            elif dist < 0.82:
                shade = lerp(PA_BLACK, PA_DARK, (dist-0.55)/0.27)
            else:
                shade = lerp(PA_DARK, PA_EDGE, (dist-0.82)/0.18)
            px(x,y,shade)

# Patch border — crisp pixel edge
for angle in range(0,360,3):
    a=math.radians(angle)
    for r_off in [0, 0.5, 1.0]:
        x=int(pc_x+(pr_x+r_off)*math.cos(a))
        y=int(pc_y+(pr_y+r_off)*math.sin(a))
        px(x,y, PA_EDGE if r_off < 0.8 else lerp(PA_EDGE, SK_DARK, 0.5))

# Leather texture — diagonal line detail
for i in range(-8, 8, 3):
    for j in range(5):
        x = pc_x - 12 + i + j
        y = pc_y - 6 + j
        dx2=(x-pc_x)/(pr_x); dy2=(y-pc_y)/(pr_y)
        if math.sqrt(dx2**2+dy2**2) < 0.85:
            px(x,y, lerp(PA_BLACK, PA_DARK, 0.5))

# Highlight glint top-left of patch
for (x,y) in [(92,79),(93,79),(93,80),(94,79)]:
    dx2=(x-pc_x)/(pr_x+1.5); dy2=(y-pc_y)/(pr_y+1.5)
    if math.sqrt(dx2**2+dy2**2) < 1.0:
        px(x,y, PA_SHEEN)

# =====================================================
# EYE PATCH STRAP
# =====================================================
# Goes from right side of patch, across forehead/temple to right
def draw_thick_line(x1,y1,x2,y2,c_main,c_edge,thickness=3):
    dx=x2-x1; dy=y2-y1
    steps=max(abs(dx),abs(dy),1)
    perp_x=-dy/steps; perp_y=dx/steps
    norm=math.sqrt(perp_x**2+perp_y**2)
    if norm>0: perp_x/=norm; perp_y/=norm
    for s in range(steps+1):
        t=s/steps
        cx=x1+t*dx; cy=y1+t*dy
        for w in range(-(thickness//2),(thickness//2)+1):
            sx=int(round(cx+w*perp_x)); sy=int(round(cy+w*perp_y))
            if abs(w)==thickness//2:
                px(sx,sy,c_edge)
            else:
                px(sx,sy,c_main)

# Strap from right side of patch heading upper-right across forehead
strap_path = [
    (pc_x+pr_x+1, pc_y-3),
    (120, 79),
    (136, 74),
    (150, 70),
    (164, 67),
    (176, 65),
    (186, 64),
    (192, 64),
]
for i in range(len(strap_path)-1):
    x1,y1=strap_path[i]; x2,y2=strap_path[i+1]
    draw_thick_line(x1,y1,x2,y2,PA_STRAP,PA_DARK,3)
    # Highlight top of strap
    dx=x2-x1; dy=y2-y1
    steps=max(abs(dx),abs(dy),1)
    for s in range(steps+1):
        t=s/steps
        sx=int(round(x1+t*dx)); sy=int(round(y1+t*dy))
        px(sx,sy-1, lerp(PA_EDGE, PA_STRAP, 0.5))

# Left side strap — going behind head left edge
strap_left = [
    (pc_x-pr_x-1, pc_y+2),
    (74, 86),
    (66, 87),
    (60, 88),
]
for i in range(len(strap_left)-1):
    x1,y1=strap_left[i]; x2,y2=strap_left[i+1]
    draw_thick_line(x1,y1,x2,y2,PA_STRAP,PA_DARK,3)

# =====================================================
# SCAR — right cheek (screen right), more visible
# =====================================================
# Jagged diagonal scar from under cheekbone down toward jaw
scar = [
    (170,94),(169,96),(171,98),(170,100),(169,102),
    (168,104),(169,106),(167,108),(166,110),(165,112),
    (164,114),(163,116),
]

# First pass: scar groove (darker)
for i,(sx,sy) in enumerate(scar):
    px(sx,sy,SC_DARK)
    # Jagged — alternate which side gets extra pixel
    if i % 2 == 0:
        px(sx+1,sy,lerp(SC_DARK,SK_MID,0.4))
        px(sx-1,sy,lerp(SC_MAIN,SK_MID,0.3))
    else:
        px(sx-1,sy,lerp(SC_DARK,SK_MID,0.4))
        px(sx+1,sy,lerp(SC_MAIN,SK_MID,0.3))

# Second pass: raised scar tissue (lighter on one side)
for (sx,sy) in scar:
    px(sx-1,sy-1, lerp(SC_LITE, SK_LITE, 0.5))

# =====================================================
# NOSE
# =====================================================
nc_x = 128

# Bridge shadow (left side)
for y in range(90,107):
    px(nc_x-3,y, lerp(SK_DARK,SK_MID,0.4))
    px(nc_x-2,y, lerp(SK_MID,SK_LITE,0.3))

# Bridge highlight (right side)
for y in range(90,107):
    px(nc_x+1,y, lerp(SK_LITE,SK_BRIGHT,0.4))
    px(nc_x+2,y, lerp(SK_MID,SK_LITE,0.5))

# Nose tip — bulbous
for y in range(104,114):
    t=(y-104)/10
    hw=int(9+t*1)
    for x in range(nc_x-hw, nc_x+hw+1):
        xd=abs(x-nc_x)
        if xd < hw:
            dist=math.sqrt(xd**2+(y-108)**2)
            if dist < hw+0.5:
                if xd < 2 and y < 112:
                    shade = SK_BRIGHT
                elif xd < hw-2:
                    shade = SK_LITE
                else:
                    shade = SK_MID
                if xd > hw-3:
                    shade = SK_DARK
                px(x,y,shade)

# Nostril shadows
for (x,y) in [(119,108),(120,108),(121,108),(119,109),(120,109),
              (135,108),(136,108),(137,108),(136,109),(137,109)]:
    px(x,y,NO_DARK)

# Nose-to-lip line (philtrum)
for y in range(113,117):
    px(125,y,lerp(SK_DARK,SK_MID,0.5))
    px(126,y,lerp(SK_MID,SK_LITE,0.3))
    px(130,y,lerp(SK_DARK,SK_MID,0.5))
    px(131,y,lerp(SK_MID,SK_LITE,0.3))

# =====================================================
# MOUTH — stern/pursed
# =====================================================
# Upper lip
for y in range(116,122):
    t=(y-116)/6
    hw=int(17-t*3)
    for x in range(128-hw,128+hw+1):
        xd=abs(x-128)
        if xd < hw-3:
            shade = LI_MID if xd > 3 else LI_LITE
        else:
            shade = LI_DARK
        if t > 0.5:
            shade = lerp(shade, SK_MID, 0.2)
        px(x,y,shade)

# Stern mouth line
for x in range(113,145):
    px(x,122, lerp(SK_DEEP, LI_DARK, 0.6))
    if 115 < x < 143:
        px(x,123, lerp(SK_DEEP, LI_DARK, 0.3))

# Lower lip
for y in range(123,129):
    t=(y-123)/6
    hw=int(16-t*5)
    for x in range(128-hw,128+hw+1):
        xd=abs(x-128)
        if xd<3 and t<0.4:
            shade = LI_LITE
        elif xd < hw-3:
            shade = LI_MID
        else:
            shade = LI_DARK
        px(x,y,shade)

# Mouth corner shadow
for (x,y) in [(113,121),(114,121),(113,122),(144,121),(145,121),(144,122)]:
    px(x,y,SK_DEEP)

# =====================================================
# EARS
# =====================================================
# Right ear (screen right, viewer's left)
for y in range(88,112):
    t=(y-88)/24
    if t<0.15 or t>0.85:
        xl,xr = 185,193
    else:
        xl,xr = 184,196
    for x in range(xl,xr+1):
        if x==xl or x==xr:
            shade=SK_DEEP
        elif x==xl+1:
            shade=lerp(SK_DEEP,SK_MID,0.4)
        elif x==xr-1:
            shade=lerp(SK_DEEP,SK_DARK,0.4)
        else:
            shade=SK_MID
        px(x,y,shade)
    # Ear canal hint
    if 8<y-88<18:
        px(190,y, lerp(SK_DARK,SK_DEEP,0.6))
        px(191,y, lerp(SK_DARK,SK_DEEP,0.6))

# Left ear (screen left, viewer's right) — partially covered by strap
for y in range(88,112):
    t=(y-88)/24
    if t<0.15 or t>0.85:
        xl,xr = 60,68
    else:
        xl,xr = 58,70
    for x in range(xl,xr+1):
        if x==xl or x==xr:
            shade=SK_DEEP
        elif x==xl+1:
            shade=lerp(SK_DEEP,SK_MID,0.4)
        elif x==xr-1:
            shade=lerp(SK_DEEP,SK_DARK,0.4)
        else:
            shade=SK_MID
        px(x,y,shade)

# =====================================================
# FINAL FACIAL DETAIL
# =====================================================
# Frown lines between brows
for y in range(80,90):
    px(128,y,lerp(SK_DARK,SK_MID,0.5))
    px(129,y,lerp(SK_DARK,SK_MID,0.6))

# Nasolabial folds (smile lines, stern version)
for y in range(108,122):
    t=(y-108)/14
    # Left fold
    x_l = int(115 - t*2)
    px(x_l,y, lerp(SK_DARK, SK_MID, 0.5))
    # Right fold
    x_r = int(142 + t*2)
    px(x_r,y, lerp(SK_DARK, SK_MID, 0.5))

# Chin cleft
for y in range(120,126):
    px(127,y, lerp(SK_DARK,SK_MID,0.55))
    px(128,y, lerp(SK_DARK,SK_MID,0.5))
    px(129,y, lerp(SK_DARK,SK_MID,0.55))

# =====================================================
# SUIT DETAILS
# =====================================================
# Pocket square hint (left breast pocket area)
for y in range(155,162):
    for x in range(68,80):
        if img.getpixel((x,y))[2] > 30:  # on suit
            px(x,y, SU_HILITE)
# Pocket square white peak
for (x,y) in [(71,155),(72,154),(73,153),(74,154),(75,155)]:
    px(x,y, SH_WHITE)
    px(x,y+1, SH_SHADOW)

# Suit button
for (x,y) in [(128,188),(128,189),(129,188),(129,189)]:
    px(x,y, SU_HILITE)

# =====================================================
# SAVE
# =====================================================
out = "/mnt/data/hello-world/static/avatars/punished-trump.gif"
img.save(out, "GIF")
print(f"Saved: {out}")
print(f"Size: {img.size}")
