"""Procedural textures drawn with PIL: tanker blueprints, clock face, smoke sprites, paper, lantern paper."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import math, random, os
OUT = "/home/user/code/production/textures"
os.makedirs(OUT, exist_ok=True)
F = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def blueprint(seed, name, W=2048, H=1448, paper=(234, 228, 210), ink=(40, 46, 70)):
    rnd = random.Random(seed)
    im = Image.new("RGB", (W, H), paper)
    d = ImageDraw.Draw(im)
    # grid
    for x in range(0, W, 64):
        d.line([(x, 0), (x, H)], fill=(paper[0]-14, paper[1]-12, paper[2]-10), width=1)
    for y in range(0, H, 64):
        d.line([(0, y), (W, y)], fill=(paper[0]-14, paper[1]-12, paper[2]-10), width=1)
    # border and title block
    d.rectangle([40, 40, W-40, H-40], outline=ink, width=5)
    d.rectangle([W-560, H-260, W-40, H-40], outline=ink, width=3)
    for k in range(1, 4):
        d.line([(W-560, H-260+k*55), (W-40, H-260+k*55)], fill=ink, width=2)
    # tanker profile (side elevation)
    x0, x1, yd, yk = 160, W-200, 380, 640
    bow = [(x1, yd-40), (x1+40, yd-70), (x1+10, yk-20), (x1-60, yk)]
    d.line([(x0, yd), (x1, yd-40)], fill=ink, width=4)
    d.line(bow, fill=ink, width=4)
    d.line([(x0+40, yk), (x1-60, yk)], fill=ink, width=4)
    d.line([(x0, yd), (x0-30, yd+80), (x0+10, yk-60), (x0+40, yk)], fill=ink, width=4)
    # bridge / poop / funnel
    d.rectangle([x0+40, yd-150, x0+300, yd], outline=ink, width=3)
    d.rectangle([x0+120, yd-260, x0+200, yd-150], outline=ink, width=3)
    mid = (x0+x1)//2
    d.rectangle([mid-110, yd-160, mid+110, yd-20], outline=ink, width=3)
    # tank bulkheads
    for i in range(1, 13):
        x = x0 + 320 + i*(x1-x0-500)//13
        d.line([(x, yd-25), (x, yk)], fill=ink, width=2)
    # waterline + frames
    d.line([(x0, yk-110), (x1+20, yk-110)], fill=(150, 40, 40), width=2)
    for i in range(0, 60):
        x = x0 + i*(x1-x0)//60
        d.line([(x, yk+10), (x, yk+25)], fill=ink, width=1)
    # body plan (half sections) lower-left
    cx, cy = 420, 1080
    for k in range(9):
        r = 60 + k*24
        pts = [(cx + r*math.sin(t/20*math.pi/2)*(1.0+0.15*k/9), cy - r*math.cos(t/20*math.pi/2)*0.9) for t in range(21)]
        d.line(pts, fill=ink, width=2)
        pts2 = [(cx - (p[0]-cx), p[1]) for p in pts]
        d.line(pts2, fill=ink, width=2)
    d.line([(cx, cy-320), (cx, cy+40)], fill=ink, width=2)
    d.line([(cx-330, cy), (cx+330, cy)], fill=ink, width=2)
    # deck plan lower-middle
    d.line([(900, 1000), (1650, 980), (1720, 1060), (1650, 1140), (900, 1120), (880, 1060), (900, 1000)], fill=ink, width=3)
    for i in range(1, 10):
        x = 900 + i*75
        d.line([(x, 1000), (x, 1120)], fill=ink, width=1)
    # dimension lines with ticks
    d.line([(x0, 760), (x1, 760)], fill=ink, width=1)
    for x in (x0, x1):
        d.line([(x, 740), (x, 780)], fill=ink, width=1)
    try:
        f = ImageFont.truetype(F, 30)
        pass
    except Exception:
        pass
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    # aging
    noise = Image.effect_noise((W, H), 18).convert("L")
    im = Image.composite(im, Image.new("RGB", (W, H), (paper[0]-25, paper[1]-25, paper[2]-30)), noise.point(lambda v: 255 if v > 30 else 200))
    im.save(f"{OUT}/{name}.png")

def clock(name, hh=11, mm=2, S=1024):
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S // 2
    d.ellipse([20, 20, S-20, S-20], fill=(236, 230, 212, 255), outline=(40, 30, 20, 255), width=14)
    f = ImageFont.truetype(F, 92)
    for h in range(1, 13):
        a = math.radians(h * 30 - 90)
        x, y = c + 380*math.cos(a), c + 380*math.sin(a)
        d.text((x, y), str(h), fill=(30, 25, 20, 255), font=f, anchor="mm")
    for m in range(60):
        a = math.radians(m * 6 - 90)
        r0 = 455 if m % 5 else 430
        d.line([(c + r0*math.cos(a), c + r0*math.sin(a)), (c + 470*math.cos(a), c + 470*math.sin(a))], fill=(30, 25, 20, 255), width=6 if m % 5 == 0 else 3)
    im.save(f"{OUT}/{name}.png")

def smoke(name, seed, S=512, col=(1, 1, 1)):
    rnd = random.Random(seed)
    base = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(base)
    for i in range(70):
        r = rnd.uniform(0.06, 0.2) * S
        a = rnd.uniform(0, 2*math.pi); dist = rnd.uniform(0, 0.28) * S
        x, y = S/2 + dist*math.cos(a), S/2 + dist*math.sin(a)
        d.ellipse([x-r, y-r, x+r, y+r], fill=int(rnd.uniform(40, 110)))
    base = base.filter(ImageFilter.GaussianBlur(S/28))
    n = Image.effect_noise((S//8, S//8), 60).resize((S, S), Image.BICUBIC).filter(ImageFilter.GaussianBlur(4))
    alpha = Image.eval(Image.blend(base, Image.composite(base, Image.new("L", (S, S), 0), n), 0.5), lambda v: min(255, int(v*2.0)))
    # radial falloff
    m = Image.new("L", (S, S), 0); dm = ImageDraw.Draw(m)
    for k in range(40):
        rr = S/2 * (1 - k/40)
        dm.ellipse([S/2-rr, S/2-rr, S/2+rr, S/2+rr], fill=int(255*min(1, (k/40)*2.2)))
    m = m.filter(ImageFilter.GaussianBlur(S/20))
    alpha = Image.composite(alpha, Image.new("L", (S, S), 0), m)
    rgb = Image.new("RGB", (S, S), tuple(int(255*c) for c in col))
    shade = n.point(lambda v: int(180 + v*0.3))
    rgb = Image.merge("RGB", [Image.composite(ch, Image.new("L", (S, S), 140), shade) for ch in rgb.split()])
    rgb.putalpha(alpha)
    rgb.save(f"{OUT}/{name}.png")

def washi(name, S=1024, col=(236, 222, 190)):
    im = Image.new("RGB", (S, S), col)
    n = Image.effect_noise((S, S), 25).convert("L").filter(ImageFilter.GaussianBlur(1.2))
    fib = Image.new("L", (S, S), 0); d = ImageDraw.Draw(fib); rnd = random.Random(5)
    for i in range(500):
        x, y = rnd.uniform(0, S), rnd.uniform(0, S); a = rnd.uniform(0, 6.3); l = rnd.uniform(10, 50)
        d.line([(x, y), (x + l*math.cos(a), y + l*math.sin(a))], fill=rnd.randint(20, 60), width=1)
    im = Image.composite(Image.new("RGB", (S, S), (col[0]-30, col[1]-30, col[2]-30)), im, Image.blend(n, fib, 0.5).point(lambda v: v//3))
    im.save(f"{OUT}/{name}.png")

for i in range(4):
    blueprint(i+1, f"blueprint_{i+1}")
blueprint(9, "blueprint_white", paper=(242, 240, 232), ink=(30, 30, 40))
clock("clock_face")
for i in range(6):
    smoke(f"smoke_{i}", 10+i)
washi("washi")
print("ok")
