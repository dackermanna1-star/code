"""Label / stencil decal images for items and gear (called by labels.py). All brands are fictional."""
import os, math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

R = random.Random(7)


def paper_noise(img, amt=18, blotch=0.0, seed=1):
    """multiply a paper-like noise / stain layer into an RGBA image (alpha untouched)."""
    rnd = random.Random(seed)
    w, h = img.size
    n = Image.effect_noise((w // 4, h // 4), 40).resize((w, h), Image.BICUBIC).convert('L')
    n = n.point(lambda v: 255 - int((255 - v) * amt / 100))
    rgb = img.convert('RGB')
    rgb = ImageChops.multiply(rgb, Image.merge('RGB', (n, n, n)))
    if blotch > 0:
        st = Image.new('L', (w, h), 255); d = ImageDraw.Draw(st)
        for _ in range(int(6 * blotch)):
            x, y, r = rnd.randint(0, w), rnd.randint(0, h), rnd.randint(w // 20, w // 6)
            d.ellipse([x - r, y - r, x + r, y + r], fill=255 - rnd.randint(20, 60))
        st = st.filter(ImageFilter.GaussianBlur(w // 40))
        rgb = ImageChops.multiply(rgb, Image.merge('RGB', (st, st, st)))
    out = rgb.convert('RGBA'); out.putalpha(img.getchannel('A'))
    return out


def make_all(out, L):
    def save(im, name):
        im.save(os.path.join(out, name + '.png'))

    # ---------------- smoke grenade stencil ----------------
    im = L.new(1024, 512)
    col = (226, 214, 150, 255)
    L.stencil(im, (512, 120), 'GRENADE, HAND', 70, col, fname='cond', bridges=False)
    L.stencil(im, (512, 240), 'SMOKE  WHITE', 110, col, fname='cond', bridges=False)
    L.stencil(im, (512, 370), 'M18', 90, col, fname='cond', bridges=False)
    L.stencil(im, (512, 455), 'LOT TA-14-112', 44, col, fname='cond', bridges=False)
    save(im, 'smoke_label')

    # ---------------- molotov: old printed wine-style label ----------------
    im = L.new(1024, 600, (232, 222, 196, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([24, 24, 1000, 576], outline=(120, 30, 30, 255), width=6)
    d.rectangle([40, 40, 984, 560], outline=(120, 30, 30, 255), width=2)
    L.text_c(d, (512, 150), 'CHATEAU', L.font('serif', 90), (40, 30, 26, 255))
    L.text_c(d, (512, 260), 'DE LA VIGNE', L.font('serif', 70), (40, 30, 26, 255))
    L.text_c(d, (512, 360), 'VIN ROUGE', L.font('serif', 54), (120, 30, 30, 255))
    L.text_c(d, (512, 470), '75 cl    12,5% vol', L.font('sans', 40), (40, 30, 26, 255))
    im = paper_noise(im, 30, blotch=1.5, seed=3)
    save(im, 'molotov_label')
    police_patches(out, L)


def police_patches(out, L):
    """'POLICE' patches: white embroidered-look letters on navy / black, opaque."""
    from PIL import Image, ImageDraw, ImageFilter
    for name, bg, fg in (('police_navy', (27, 34, 48, 255), (232, 232, 228, 255)), ('police_blk', (24, 25, 27, 255), (236, 236, 232, 255))):
        im = L.new(1024, 256, bg); d = ImageDraw.Draw(im)
        d.rounded_rectangle([6, 6, 1018, 250], radius=18, outline=(int(bg[0] * 0.6), int(bg[1] * 0.6), int(bg[2] * 0.6), 255), width=8)
        lay = L.new(1024, 256); dl = ImageDraw.Draw(lay)
        dl.text((512, 132), 'POLICE', font=L.font('bold', 190), fill=fg, anchor='mm')
        sh = lay.filter(ImageFilter.GaussianBlur(3))
        dark = L.new(1024, 256, (0, 0, 0, 0)); dark.paste((0, 0, 0, 150), mask=sh.getchannel('A'))
        im.alpha_composite(dark, (3, 4)); im.alpha_composite(lay)
        im = paper_noise(im, 14, seed=11)
        im.save(os.path.join(out, name + '.png'))
