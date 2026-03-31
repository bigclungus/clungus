#!/usr/bin/env python3
"""
Punished Trump - 256x256 pixel art avatar v3
More refined pixel art — better proportions, crisper look.
"""
from PIL import Image
import math

W, H = 256, 256

# Palette
BG           = (12, 14, 20)

SK_DEEP      = (105, 50, 15)
SK_DARK      = (148, 80, 32)
SK_MID       = (196, 114, 52)
SK_LITE      = (218, 138, 68)
SK_BRIGHT    = (234, 158, 84)
SK_HILITE    = (248, 176, 98)

HA_DARK      = (148, 115, 25)
HA_MID       = (188, 155, 45)
HA_LITE      = (215, 182, 62)
HA_BRIGHT    = (234, 205, 78)
HA_HILITE    = (250, 225, 96)
HA_SHAD      = (115, 88, 16)

EW           = (238, 228, 218)
EI           = (68, 50, 28)
EP           = (16, 10, 6)
EC           = (180, 140, 100)  # eye corner

PA_BLACK     = (8, 6, 4)
PA_DARK      = (25, 18, 10)
PA_MID       = (40, 30, 16)
PA_EDGE      = (58, 44, 22)
PA_STRAP     = (45, 32, 15)
PA_SHEEN     = (80, 62, 32)

SC_DARK      = (140, 62, 28)
SC_MID       = (188, 102, 58)
SC_LITE      = (212, 125, 72)

SU_DEEP      = (8, 10, 20)
SU_DARK      = (16, 20, 36)
SU_MID       = (24, 30, 52)
SU_LITE      = (34, 44, 68)
SU_HILITE    = (48, 60, 88)

SH_WHITE     = (240, 240, 246)
SH_SHAD      = (198, 200, 212)
SH_DEEP      = (158, 162, 178)

TI_DEEP      = (108, 10, 10)
TI_DARK      = (148, 16, 16)
TI_MID       = (184, 22, 22)
TI_LITE      = (208, 36, 36)
TI_HILITE    = (228, 56, 56)

LI_DARK      = (142, 68, 48)
LI_MID       = (172, 86, 62)
LI_LITE      = (196, 104, 76)

NO_DARK      = (118, 54, 18)

BROW         = (130, 100, 24)

img = Image.new("RGB", (W,H), BG)

def px(x,y,c):
    if 0<=x<W and 0<=y<H:
        img.putpixel((x,y), tuple(max(0,min(255,v)) for v in c))

def hline(x1,x2,y,c):
    for x in range(x1,x2+1): px(x,y,c)

def lerp(c1,c2,t):
    t=max(0.0,min(1.0,t))
    return tuple(int(c1[i]+(c2[i]-c1[i])*t) for i in range(3))

def fill_poly(pts,c):
    if len(pts)<3: return
    min_y=min(p[1] for p in pts); max_y=max(p[1] for p in pts)
    n=len(pts)
    for y in range(min_y,max_y+1):
        xs=[]
        for i in range(n):
            x1,y1=pts[i]; x2,y2=pts[(i+1)%n]
            if y1==y2: continue
            if min(y1,y2)<=y<=max(y1,y2):
                t=(y-y1)/(y2-y1); xs.append(x1+t*(x2-x1))
        xs.sort()
        for i in range(0,len(xs)-1,2):
            hline(int(math.ceil(xs[i])),int(math.floor(xs[i+1])),y,c)

def draw_line_thick(x1,y1,x2,y2,c,t=2):
    dx=x2-x1; dy=y2-y1
    steps=max(abs(dx),abs(dy),1)
    for s in range(steps+1):
        f=s/steps
        cx=int(round(x1+f*dx)); cy=int(round(y1+f*dy))
        for oy in range(-(t//2),(t//2)+1):
            px(cx,cy+oy,c)

# ===================================================
# BACKGROUND — dark gradient with subtle vignette
# ===================================================
for y in range(H):
    for x in range(W):
        dist=math.sqrt((x-128)**2+(y-105)**2)/155
        t=min(dist,1.0)
        col=lerp((20,22,32),(8,8,14),t)
        px(x,y,col)

# ===================================================
# SUIT BODY
# ===================================================
for y in range(168,H):
    t=(y-168)/(H-168)
    xl=int(35-t*4); xr=int(221+t*4)
    for x in range(xl,xr+1):
        ed=min(x-xl,xr-x)
        shade = lerp(SU_DEEP,SU_DARK,min(ed/15,1.0)) if ed<15 else SU_MID
        px(x,y,shade)

for y in range(145,169):
    t=(y-145)/23
    xl=int(55+(35-55)*t); xr=int(201+(221-201)*t)
    for x in range(xl,xr+1):
        ed=min(x-xl,xr-x)
        shade = lerp(SU_DEEP,SU_DARK,min(ed/10,1.0)) if ed<10 else SU_MID
        px(x,y,shade)

# ===================================================
# LAPELS
# ===================================================
# Left lapel
ll=[(55,145),(112,145),(122,170),(108,185),(55,185)]
fill_poly(ll,SU_LITE)
draw_line_thick(55,145,112,145,SU_HILITE,1)
draw_line_thick(112,145,122,170,SU_HILITE,1)
draw_line_thick(122,170,108,185,SU_DARK,1)
draw_line_thick(108,185,55,185,SU_DARK,1)

# Right lapel
rl=[(144,145),(201,145),(201,185),(148,185),(134,170)]
fill_poly(rl,SU_LITE)
draw_line_thick(144,145,201,145,SU_HILITE,1)
draw_line_thick(144,145,134,170,SU_HILITE,1)
draw_line_thick(201,145,201,185,SU_DARK,1)
draw_line_thick(134,170,148,185,SU_DARK,1)

# ===================================================
# SHIRT COLLAR + CHEST
# ===================================================
shirt=[(112,145),(144,145),(148,162),(128,175),(108,162)]
fill_poly(shirt,SH_WHITE)

# Collar shadow
for y in range(145,175):
    for x in range(108,149):
        cur=img.getpixel((x,y))
        if cur==SH_WHITE:
            if x<114 or x>142 or y>168:
                px(x,y,SH_SHAD)
            elif x<118 or x>138:
                px(x,y,lerp(SH_WHITE,SH_SHAD,0.4))

# Collar crease lines
draw_line_thick(118,145,120,164,SH_SHAD,1)
draw_line_thick(138,145,136,164,SH_SHAD,1)

# ===================================================
# TIE
# ===================================================
# Knot
for y in range(148,158):
    t=(y-148)/10; hw=int(7+t*3)
    for x in range(128-hw,128+hw+1):
        xd=abs(x-128)
        if xd<3: shade=TI_LITE
        elif xd<hw-2: shade=TI_MID
        else: shade=TI_DARK
        px(x,y,shade)

# Body
for y in range(158,222):
    t=(y-158)/64; hw=min(int(10+t*18),28)
    for x in range(128-hw,128+hw+1):
        xd=abs(x-128)
        if xd<3: shade=TI_LITE
        elif xd<hw-4: shade=TI_MID
        elif xd<hw-1: shade=TI_DARK
        else: shade=TI_DEEP
        px(x,y,shade)

# Point
for y in range(222,240):
    t=(y-222)/18; hw=max(0,int(28-t*28))
    for x in range(128-hw,128+hw+1):
        xd=abs(x-128)
        shade=TI_MID if xd<hw-2 else TI_DARK
        px(x,y,shade)

# ===================================================
# NECK
# ===================================================
for y in range(128,146):
    t=(y-128)/17; hw=int(18+t*10)
    for x in range(128-hw,128+hw+1):
        xd=abs(x-128)
        if xd>hw-5: shade=SK_DARK
        elif xd>hw-10: shade=lerp(SK_DARK,SK_MID,0.5)
        else: shade=SK_MID
        px(x,y,shade)

# ===================================================
# FACE SHAPE — rounder, better proportions
# ===================================================
def face_b(y):
    if y<44: return None
    if y<58:   t=(y-44)/14; w=int(22+t*34); return (128-w,128+w)
    if y<76:   t=(y-58)/18; w=int(56+t*7);  return (128-w,128+w)
    if y<94:   t=(y-76)/18; w=int(63-t*4);  return (128-w,128+w)
    if y<108:  t=(y-94)/14; w=int(59-t*10); return (128-w,128+w)
    if y<118:  t=(y-108)/10;w=int(49-t*10); return (128-w,128+w)
    if y<126:  t=(y-118)/8; w=int(39-t*14); return (128-w,128+w)
    if y<130:  t=(y-126)/4; w=int(25-t*10); return (128-w,128+w)
    return None

for y in range(44,130):
    b=face_b(y)
    if not b: continue
    xl,xr=b
    W_face=xr-xl
    for x in range(xl,xr+1):
        t=(x-xl)/W_face  # 0=left, 1=right
        # Left side = shadow, right side = lit (dramatic lighting)
        if t<0.10:   shade=lerp(SK_DEEP,SK_DARK,t/0.10)
        elif t<0.22: shade=lerp(SK_DARK,SK_MID,(t-0.10)/0.12)
        elif t<0.50: shade=SK_MID
        elif t<0.68: shade=SK_LITE
        elif t<0.80: shade=lerp(SK_LITE,SK_BRIGHT,(t-0.68)/0.12)
        elif t<0.90: shade=lerp(SK_BRIGHT,SK_MID,(t-0.80)/0.10)
        elif t<0.96: shade=lerp(SK_MID,SK_DARK,(t-0.90)/0.06)
        else:        shade=lerp(SK_DARK,SK_DEEP,(t-0.96)/0.04)
        # Forehead highlight
        if 60<y<80 and 0.38<t<0.62:
            shade=lerp(shade,SK_HILITE,0.25)
        # Right cheekbone highlight
        if 88<y<102 and 0.60<t<0.85:
            dist=math.sqrt(((x-168)/14)**2+((y-94)/8)**2)
            if dist<1.0:
                shade=lerp(shade,SK_HILITE,(1-dist)*0.35)
        px(x,y,shade)

# Face outline
for y in range(44,130):
    b=face_b(y)
    if not b: continue
    xl,xr=b
    px(xl-1,y,lerp(SK_DEEP,BG,0.55))
    px(xr+1,y,lerp(SK_DEEP,BG,0.55))
    px(xl,y,lerp(SK_DEEP,img.getpixel((xl,y)),0.55))
    px(xr,y,lerp(SK_DEEP,img.getpixel((xr,y)),0.55))

# ===================================================
# HAIR
# ===================================================
# Crown — tall, slightly left-leaning pompadour
for y in range(10,58):
    if y<24:   t=(y-10)/14; w=int(10+t*40)
    elif y<44: t=(y-24)/20; w=int(50+t*16)
    else:      t=(y-44)/14; w=int(66-t*8)
    xl=128-w; xr=128+w
    # Slight rightward lean for the hair sweep
    xl+=int((y-10)*0.15); xr+=int((y-10)*0.10)
    for x in range(xl,xr+1):
        xd=abs(x-(xl+xr)//2); maxw=w
        t2=xd/max(maxw,1)
        if t2>0.88:   shade=HA_SHAD
        elif t2>0.72: shade=lerp(HA_SHAD,HA_DARK,(0.88-t2)/0.16)
        elif t2>0.50: shade=lerp(HA_DARK,HA_MID,(0.72-t2)/0.22)
        elif t2>0.28: shade=lerp(HA_MID,HA_LITE,(0.50-t2)/0.22)
        elif t2>0.12: shade=lerp(HA_LITE,HA_BRIGHT,(0.28-t2)/0.16)
        else:         shade=lerp(HA_BRIGHT,HA_HILITE,1-t2/0.12)
        # Crown highlight line
        if y<34 and t2<0.3:
            shade=lerp(shade,HA_HILITE,0.4)
        px(x,y,shade)

# Forehead sweep — covering top of face, Trump's signature swoop left-to-right
for y in range(44,76):
    b=face_b(y)
    if not b: continue
    xl_f,xr_f=b
    # Hair sweeps: full left to right-edge that moves left as y increases
    hair_r=int(186-(y-44)*1.6)
    hair_r=max(hair_r, xl_f+12)
    for x in range(xl_f, hair_r+1):
        t=(x-xl_f)/(hair_r-xl_f+0.01)
        if t<0.08:   shade=HA_SHAD
        elif t<0.20: shade=lerp(HA_SHAD,HA_DARK,(t-0.08)/0.12)
        elif t<0.45: shade=lerp(HA_DARK,HA_MID,(t-0.20)/0.25)
        elif t<0.70: shade=lerp(HA_MID,HA_LITE,(t-0.45)/0.25)
        elif t<0.85: shade=lerp(HA_LITE,HA_BRIGHT,(t-0.70)/0.15)
        elif t<0.95: shade=lerp(HA_BRIGHT,HA_MID,(t-0.85)/0.10)
        else:        shade=lerp(HA_MID,HA_DARK,(t-0.95)/0.05)
        # Mid-sweep highlight
        if y<60 and 0.35<t<0.65:
            shade=lerp(shade,HA_BRIGHT,0.3)
        if y<52 and 0.45<t<0.58:
            shade=lerp(shade,HA_HILITE,0.25)
        px(x,y,shade)

# Right temple sideburn
for y in range(58,104):
    b=face_b(y)
    if not b: continue
    xl_f,xr_f=b
    t=(y-58)/46; sw=int(12-t*4)
    if sw<=0: continue
    for x in range(xr_f,min(xr_f+sw+1,W)):
        t2=(x-xr_f)/sw
        shade=lerp(HA_DARK,HA_SHAD,t2)
        px(x,y,shade)

# Left temple sideburn
for y in range(58,100):
    b=face_b(y)
    if not b: continue
    xl_f,xr_f=b
    t=(y-58)/42; sw=int(12-t*5)
    if sw<=0: continue
    for x in range(max(0,xl_f-sw),xl_f+1):
        t2=(xl_f-x)/sw
        shade=lerp(HA_DARK,HA_SHAD,t2)
        px(x,y,shade)

# ===================================================
# EYEBROWS
# ===================================================
# Right brow — furrowed inward (angry)
brow_r=[
    (155,80),(156,79),(157,78),(158,77),(159,77),(160,76),(161,76),
    (162,75),(163,75),(164,75),(165,75),(166,76),(167,76),(168,77),
    (169,77),(170,78),(171,79),(172,80),
]
for (x,y) in brow_r:
    for oy in range(-1,2):
        alpha=[0.4,1.0,0.5][oy+1]
        px(x,y+oy,lerp(img.getpixel((x,y+oy)),BROW,alpha))

# Left brow (over patch)
brow_l=[
    (84,78),(85,78),(86,77),(87,77),(88,76),(89,76),(90,75),
    (91,75),(92,74),(93,74),(94,74),(95,74),(96,75),(97,75),
    (98,76),(99,76),(100,77),(101,77),(102,78),
]
for (x,y) in brow_l:
    for oy in range(-1,2):
        alpha=[0.4,1.0,0.5][oy+1]
        px(x,y+oy,lerp(img.getpixel((x,y+oy)),BROW,alpha))

# ===================================================
# RIGHT EYE (screen right, open)
# ===================================================
ec_x,ec_y=165,88  # eye center

# Socket shade
for y in range(80,96):
    for x in range(152,180):
        b=face_b(y)
        if b and b[0]<x<b[1] and not(157<x<177 and 83<y<93):
            cur=img.getpixel((x,y))
            if cur!=BG:
                px(x,y,lerp(cur,SK_DARK,0.25))

# Eye white
for y in range(84,93):
    if y in(84,92):   xl2,xr2=160,172
    elif y in(85,91): xl2,xr2=157,175
    else:             xl2,xr2=155,176
    for x in range(xl2,xr2+1):
        px(x,y,EW)

# Eyelid shading
for x in range(157,175):
    px(x,84,lerp(SK_MID,EW,0.4))
    px(x,85,lerp(SK_LITE,EW,0.15))
for x in range(157,174):
    px(x,92,lerp(SK_MID,EW,0.3))
    px(x,91,lerp(EC,EW,0.3))

# Iris + pupil
for y in range(85,92):
    for x in range(158,176):
        dist=math.sqrt((x-ec_x)**2+(y-ec_y)**2)
        if dist<6.0:
            if dist<2.2:   shade=EP
            elif dist<4.5: shade=EI
            elif dist<5.5: shade=lerp(EI,EW,(dist-4.5)/1.0)
            else:          shade=lerp(EI,EW,0.8)
            px(x,y,shade)

# Iris detail ring
for angle in range(0,360,20):
    a=math.radians(angle)
    x=int(ec_x+4.7*math.cos(a)); y=int(ec_y+4.7*math.sin(a))
    px(x,y,lerp(EI,EP,0.4))

# Eye highlights
px(169,85,(242,242,252))
px(170,85,(220,220,235))
px(169,86,(220,220,235))

# Eyelid lines
draw_line_thick(157,84,175,84,lerp(SK_DARK,PA_BLACK,0.3),1)  # upper lid
draw_line_thick(157,92,175,92,lerp(SK_MID,EC,0.5),1)          # lower lid

# ===================================================
# EYE PATCH (screen left)
# ===================================================
pc_x,pc_y=98,87
pr_x,pr_y=21,14

# Fill patch
for y in range(pc_y-pr_y-3,pc_y+pr_y+4):
    for x in range(pc_x-pr_x-3,pc_x+pr_x+4):
        dx=(x-pc_x)/(pr_x+1.5); dy=(y-pc_y)/(pr_y+1.5)
        dist=math.sqrt(dx**2+dy**2)
        if dist<1.0:
            if dist<0.50:   shade=PA_BLACK
            elif dist<0.78: shade=lerp(PA_BLACK,PA_DARK,(dist-0.50)/0.28)
            else:           shade=lerp(PA_DARK,PA_MID,(dist-0.78)/0.22)
            px(x,y,shade)

# Patch edge
for angle in range(0,360,2):
    a=math.radians(angle)
    for r_off in [0,0.5,1.0]:
        x=int(pc_x+(pr_x+r_off)*math.cos(a))
        y=int(pc_y+(pr_y+r_off)*math.sin(a))
        shade=PA_EDGE if r_off<0.8 else lerp(PA_EDGE,SK_DARK,0.4)
        px(x,y,shade)

# Leather cross-stitch detail
for i,dy in enumerate(range(-5,5,3)):
    for dx in range(-10,10,4):
        x=pc_x+dx; y=pc_y+dy
        ddx=(x-pc_x)/(pr_x); ddy=(y-pc_y)/(pr_y)
        if math.sqrt(ddx**2+ddy**2)<0.80:
            px(x,y,lerp(PA_BLACK,PA_DARK,0.6))

# Glint
for (x,y) in [(90,79),(91,79),(91,80),(92,79)]:
    ddx=(x-pc_x)/(pr_x+1.5); ddy=(y-pc_y)/(pr_y+1.5)
    if math.sqrt(ddx**2+ddy**2)<1.0:
        px(x,y,PA_SHEEN)

# ===================================================
# EYE PATCH STRAP
# ===================================================
def draw_strap_segment(x1,y1,x2,y2,main_c,edge_c,w=3):
    dx=x2-x1; dy=y2-y1
    steps=max(abs(dx),abs(dy),1)
    perp_x=-dy/steps; perp_y=dx/steps
    nm=math.sqrt(perp_x**2+perp_y**2)
    if nm>0: perp_x/=nm; perp_y/=nm
    for s in range(steps+1):
        t=s/steps
        cx=x1+t*dx; cy=y1+t*dy
        for ow in range(-(w//2),(w//2)+1):
            sx=int(round(cx+ow*perp_x)); sy=int(round(cy+ow*perp_y))
            if abs(ow)==w//2: px(sx,sy,edge_c)
            elif abs(ow)==w//2-1: px(sx,sy,lerp(main_c,edge_c,0.3))
            else: px(sx,sy,main_c)
        # Top edge highlight
        sx=int(round(cx-(w//2)*perp_x)); sy=int(round(cy-(w//2)*perp_y))-1
        px(sx,sy,lerp(PA_EDGE,PA_STRAP,0.6))

# Right strap — going across forehead/temple
strap_r=[
    (pc_x+pr_x+2, pc_y-4),
    (118,81),(133,76),(147,72),(160,68),(172,65),(182,63),(190,62),
]
for i in range(len(strap_r)-1):
    x1,y1=strap_r[i]; x2,y2=strap_r[i+1]
    draw_strap_segment(x1,y1,x2,y2,PA_STRAP,PA_DARK,3)

# Left strap — going toward left ear edge
strap_l=[
    (pc_x-pr_x-1, pc_y+3),
    (72,88),(64,89),(58,90),
]
for i in range(len(strap_l)-1):
    x1,y1=strap_l[i]; x2,y2=strap_l[i+1]
    draw_strap_segment(x1,y1,x2,y2,PA_STRAP,PA_DARK,3)

# ===================================================
# SCAR — right cheek, jagged and visible
# ===================================================
scar=[
    (170,95),(169,97),(171,99),(170,101),(169,103),
    (168,105),(169,107),(167,109),(166,111),(165,113),
    (164,115),(163,117),
]

for i,(sx,sy) in enumerate(scar):
    # Main groove — darkest
    px(sx,sy,SC_DARK)
    # Width with alternating jagged pattern
    if i%2==0:
        px(sx+1,sy,lerp(SC_DARK,SK_MID,0.35))
        px(sx-1,sy,lerp(SC_MID,SK_LITE,0.45))
        px(sx+1,sy-1,lerp(SC_MID,SK_MID,0.5))
    else:
        px(sx-1,sy,lerp(SC_DARK,SK_MID,0.35))
        px(sx+1,sy,lerp(SC_MID,SK_LITE,0.45))
        px(sx-1,sy-1,lerp(SC_LITE,SK_LITE,0.4))
    # Scar tissue highlight (raised)
    px(sx-1,sy+1,lerp(SC_LITE,SK_BRIGHT,0.5))

# ===================================================
# NOSE
# ===================================================
nc_x=128

# Bridge
for y in range(92,110):
    px(nc_x-3,y,lerp(SK_DARK,SK_MID,0.4))
    px(nc_x-2,y,lerp(SK_MID,SK_LITE,0.3))
    px(nc_x+2,y,lerp(SK_LITE,SK_BRIGHT,0.4))
    px(nc_x+3,y,lerp(SK_MID,SK_LITE,0.5))

# Nose tip
for y in range(107,117):
    t=(y-107)/10; hw=int(10+t*0)
    for x in range(nc_x-hw,nc_x+hw+1):
        xd=abs(x-nc_x)
        dist=math.sqrt(xd**2+(y-111)**2)
        if dist<hw+0.5:
            if xd<2 and y<114: shade=SK_BRIGHT
            elif xd<hw-3: shade=SK_LITE
            elif xd<hw-1: shade=SK_MID
            else: shade=SK_DARK
        else: continue
        # Left shadow on nose
        if x<nc_x-4: shade=lerp(shade,SK_DARK,0.5)
        px(x,y,shade)

# Nostrils
for (x,y) in [(118,110),(119,110),(120,110),(119,111),(120,111),
              (136,110),(137,110),(138,110),(136,111),(137,111)]:
    px(x,y,NO_DARK)

# Nose shadow underneath
for x in range(122,135):
    px(x,116,lerp(SK_DARK,SK_MID,0.5))
    px(x,117,lerp(SK_DARK,SK_MID,0.7))

# Philtrum
for y in range(116,122):
    px(125,y,lerp(SK_DARK,SK_MID,0.5))
    px(126,y,lerp(SK_MID,SK_LITE,0.4))
    px(130,y,lerp(SK_DARK,SK_MID,0.5))
    px(131,y,lerp(SK_MID,SK_LITE,0.4))

# ===================================================
# MOUTH — stern pursed
# ===================================================
for y in range(120,126):
    t=(y-120)/6; hw=int(17-t*3)
    for x in range(128-hw,128+hw+1):
        xd=abs(x-128)
        if xd<3 and t<0.3: shade=LI_LITE
        elif xd<hw-3: shade=LI_MID
        else: shade=LI_DARK
        if t>0.6: shade=lerp(shade,SK_MID,0.3)
        px(x,y,shade)

# Mouth line
for x in range(113,145):
    px(x,126,lerp(SK_DEEP,LI_DARK,0.5))
    if 115<x<143:
        px(x,127,lerp(SK_DEEP,LI_DARK,0.25))

# Lower lip
for y in range(127,133):
    t=(y-127)/6; hw=max(0,int(16-t*6))
    for x in range(128-hw,128+hw+1):
        xd=abs(x-128)
        if xd<3 and t<0.4: shade=LI_LITE
        elif xd<hw-3: shade=LI_MID
        else: shade=LI_DARK
        px(x,y,shade)

# Corner shadows
for (x,y) in [(113,124),(114,124),(113,125),(143,124),(144,124),(143,125)]:
    px(x,y,SK_DEEP)

# ===================================================
# EARS
# ===================================================
# Right ear (screen right)
for y in range(90,115):
    t=(y-90)/25
    if t<0.15 or t>0.85: xl2,xr2=188,196
    else:                 xl2,xr2=186,198
    for x in range(xl2,xr2+1):
        if x==xl2 or x==xr2: shade=SK_DEEP
        elif x==xl2+1:        shade=lerp(SK_DEEP,SK_MID,0.35)
        elif x==xr2-1:        shade=lerp(SK_DEEP,SK_DARK,0.4)
        else:                  shade=SK_MID
        px(x,y,shade)
    if 10<y-90<20:
        px(192,y,lerp(SK_DARK,SK_DEEP,0.65))

# Left ear (screen left)
for y in range(90,115):
    t=(y-90)/25
    if t<0.15 or t>0.85: xl2,xr2=58,66
    else:                 xl2,xr2=56,68
    for x in range(xl2,xr2+1):
        if x==xl2 or x==xr2: shade=SK_DEEP
        elif x==xl2+1:        shade=lerp(SK_DEEP,SK_MID,0.35)
        elif x==xr2-1:        shade=lerp(SK_DEEP,SK_DARK,0.4)
        else:                  shade=SK_MID
        px(x,y,shade)

# ===================================================
# FACIAL DETAILS
# ===================================================
# Frown furrow between brows
for y in range(82,92):
    px(128,y,lerp(SK_DARK,img.getpixel((128,y)),0.55))
    px(129,y,lerp(SK_DARK,img.getpixel((129,y)),0.55))

# Nasolabial folds
for y in range(112,126):
    t=(y-112)/14
    xl2=int(114-t*2); xr2=int(142+t*2)
    px(xl2,y,lerp(SK_DARK,img.getpixel((xl2,y)),0.55))
    px(xr2,y,lerp(SK_DARK,img.getpixel((xr2,y)),0.55))

# Jowl shadows
for y in range(108,128):
    b=face_b(y)
    if not b: continue
    xl2,xr2=b
    for ox in range(8):
        f=ox/8
        px(xl2+ox,y,lerp(SK_DEEP,img.getpixel((xl2+ox,y)),f))
        px(xr2-ox,y,lerp(SK_DEEP,img.getpixel((xr2-ox,y)),f))

# Chin cleft shadow
for y in range(124,130):
    px(127,y,lerp(SK_DARK,img.getpixel((127,y)),0.55))
    px(128,y,lerp(SK_DARK,img.getpixel((128,y)),0.50))

# ===================================================
# SUIT DETAILS
# ===================================================
# Pocket square
for (x,y) in [(70,158),(71,157),(72,156),(73,157),(74,158),(70,159),(74,159),(70,160),(74,160)]:
    b2=face_b(y)
    if 65<x<80 and img.getpixel((x,y))[2]>25:
        px(x,y,SH_WHITE)
for y in range(158,164):
    for x in range(68,78):
        if img.getpixel((x,y))==SH_WHITE:
            if y>158: px(x,y,SH_SHAD)

# Suit button
for (x,y) in [(128,192),(129,192),(128,193),(129,193)]:
    px(x,y,SU_HILITE)

# Tie bar / shadow detail
for x in range(120,136):
    if img.getpixel((x,172)) not in [BG,SH_WHITE,SH_SHAD,SH_DEEP]:
        px(x,172,lerp(TI_DARK,TI_DEEP,0.4))

# ===================================================
# SAVE
# ===================================================
out="/mnt/data/hello-world/static/avatars/punished-trump.gif"
img.save(out,"GIF")
print(f"Saved: {out}")
print(f"Size: {img.size}")
