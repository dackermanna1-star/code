"""Bake tileable helper textures with numpy (fast to sample at render time,
unlike multi-octave procedural noise on the CPU).

frost_noise.png : R = large patch noise, G = crystal (cell-edge) pattern, B = fine grain
brushed_steel.png: grey brushed-metal albedo/roughness variation
lens_frost.png  : RGBA frost-on-lens vignette used in compositing
"""
import numpy as np, sys, os
from PIL import Image, ImageFilter
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(3)


def tile_noise(n, cells, octaves=5, persistence=0.55):
    acc = np.zeros((n, n)); amp = 1.0; tot = 0
    for o in range(octaves):
        c = cells * 2 ** o
        g = rng.random((c, c))
        # bicubic-ish upsample with wrap: use FFT-free approach via PIL on tiled grid
        big = np.tile(g, (3, 3))
        im = Image.fromarray((big * 255).astype(np.uint8)).resize((n * 3, n * 3), Image.BICUBIC)
        a = np.asarray(im, dtype=np.float32)[n:2 * n, n:2 * n] / 255.0
        acc += a * amp; tot += amp; amp *= persistence
    acc /= tot
    acc = (acc - acc.min()) / (acc.max() - acc.min())
    return acc


def tile_cells(n, npts):
    pts = rng.random((npts, 2)) * n
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    d1 = np.full((n, n), 1e9, np.float32); d2 = np.full((n, n), 1e9, np.float32)
    for ox in (-n, 0, n):
        for oy in (-n, 0, n):
            for p in pts:
                d = np.hypot(xx - (p[0] + ox), yy - (p[1] + oy))
                m = d < d1
                d2 = np.where(m, d1, np.minimum(d2, d))
                d1 = np.where(m, d, d1)
    e = d2 - d1
    e = np.clip(e / (n / np.sqrt(npts) * 0.35), 0, 1)
    return e


N = 1024
r = tile_noise(N, 4, 6)
g = tile_cells(512, 220)
g = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((N, N), Image.BICUBIC), dtype=np.float32) / 255.0
b = tile_noise(N, 32, 3, 0.6)
Image.fromarray(np.dstack([r, g, b]).clip(0, 1).__mul__(255).astype(np.uint8)).save(f"{OUT}/frost_noise.png")

# brushed steel: long streaks along X
s = rng.random((N, 64))
im = Image.fromarray((s * 255).astype(np.uint8)).resize((N, N), Image.BILINEAR)
st = np.asarray(im, dtype=np.float32) / 255.0
st = np.asarray(Image.fromarray((st * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), dtype=np.float32) / 255
big = tile_noise(N, 3, 4)
alb = 0.55 + 0.12 * st + 0.08 * (big - 0.5)
Image.fromarray((np.dstack([alb, st, big]).clip(0, 1) * 255).astype(np.uint8)).save(f"{OUT}/brushed_steel.png")

# lens frost (1080x1920 RGBA): heavier at the edges, crystalline
W, H = 1080, 1920
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
dx = (xx - W / 2) / (W / 2); dy = (yy - H / 2) / (H / 2)
rad = np.sqrt(dx ** 2 * 1.0 + dy ** 2 * 0.75)
n1 = tile_noise(1024, 6, 6)
n1 = np.asarray(Image.fromarray((n1 * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), dtype=np.float32) / 255
cr = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), dtype=np.float32) / 255
mask = np.clip((rad + 0.45 * (n1 - 0.5) - 0.78) * 4.0, 0, 1)
alpha = np.clip(mask * (0.55 + 0.45 * (1 - cr)), 0, 1) * 0.85
col = np.dstack([0.86 + 0.1 * cr, 0.93 + 0.05 * cr, np.ones_like(cr)])
Image.fromarray((np.dstack([col, alpha]).clip(0, 1) * 255).astype(np.uint8), "RGBA").save(f"{OUT}/lens_frost.png")
print("ok")

# phone lock screen ("No Service" / call failed)
from PIL import ImageDraw, ImageFont
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"; FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
W2, H2 = 540, 1170
im = Image.new("RGB", (W2, H2)); d = ImageDraw.Draw(im)
for y in range(H2):
    c = int(18 + 40 * y / H2); d.line([(0, y), (W2, y)], fill=(c // 2, c // 2 + 6, c + 30))
d.text((34, 22), "No Service", font=ImageFont.truetype(FB, 30), fill=(255, 255, 255))
d.rounded_rectangle((W2 - 100, 28, W2 - 40, 52), radius=6, outline=(255, 255, 255), width=3)
d.rectangle((W2 - 96, 32, W2 - 82, 48), fill=(255, 80, 60))
d.text((W2 / 2, 230), "2:47", font=ImageFont.truetype(FB, 150), fill=(240, 244, 255), anchor="mm")
d.text((W2 / 2, 345), "Tuesday, November 4", font=ImageFont.truetype(FR, 30), fill=(220, 226, 240), anchor="mm")
d.rounded_rectangle((40, 520, W2 - 40, 670), radius=28, fill=(40, 44, 60))
d.text((70, 550), "Call Failed", font=ImageFont.truetype(FB, 36), fill=(255, 255, 255))
d.text((70, 608), "No network connection.", font=ImageFont.truetype(FR, 28), fill=(210, 214, 226))
im.save(f"{OUT}/phone_screen.png")
print("phone ok")
