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
    items_labels(out, L)


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


def box_atlas(out, L, name, bg, fg, accent, brand, cal, line2, count, stripe=None, bg2=None, font_cal='inter', dark_text=None):
    """printed ammo box atlas (1024 x 1024): front (0..1, 0.55..1), top (0..0.7, 0.1..0.5), side (0.72..1, 0.1..0.5).
    Image v is flipped relative to PIL rows (PIL y=0 is the image top = v 1)."""
    from PIL import ImageDraw
    N = 1024
    im = L.new(N, N, bg); d = ImageDraw.Draw(im)
    def R(u0, v0, u1, v1):
        return [u0 * N, (1 - v1) * N, u1 * N, (1 - v0) * N]
    fr = R(0, 0.55, 1, 1); tp = R(0, 0.1, 0.7, 0.5); sd = R(0.72, 0.1, 1, 0.5)
    for r in (fr, tp, sd):
        if bg2: d.rectangle(r, fill=bg2)
    # front
    x0, y0, x1, y1 = fr
    if stripe:
        d.rectangle([x0, y0 + (y1 - y0) * 0.66, x1, y0 + (y1 - y0) * 0.82], fill=stripe)
    d.text((x0 + 40, y0 + 40), brand, font=L.font('interb', 46), fill=accent, anchor='la')
    d.text(((x0 + x1) / 2, y0 + (y1 - y0) * 0.42), cal, font=L.font(font_cal, 120), fill=fg, anchor='mm')
    d.text(((x0 + x1) / 2, y0 + (y1 - y0) * 0.74), line2, font=L.font('cond', 52), fill=dark_text or fg, anchor='mm')
    d.text((x1 - 40, y0 + 40), count, font=L.font('interb', 46), fill=fg, anchor='ra')
    # top
    x0, y0, x1, y1 = tp
    d.rectangle([x0 + 10, y0 + 10, x1 - 10, y1 - 10], outline=accent, width=6)
    d.text(((x0 + x1) / 2, (y0 + y1) / 2 - 40), cal, font=L.font(font_cal, 92), fill=fg, anchor='mm')
    d.text(((x0 + x1) / 2, (y0 + y1) / 2 + 60), brand, font=L.font('interb', 40), fill=accent, anchor='mm')
    # side
    x0, y0, x1, y1 = sd
    d.text(((x0 + x1) / 2, y0 + 70), count, font=L.font('interb', 40), fill=fg, anchor='mm')
    for i, t in enumerate(('LOT 4471', 'KEEP DRY', 'ADULTS ONLY')):
        d.text(((x0 + x1) / 2, y0 + 160 + i * 60), t, font=L.font('sans', 30), fill=fg, anchor='mm')
    im = paper_noise(im, 16, blotch=0.6, seed=hash(name) % 100)
    im.save(os.path.join(out, name + '.png'))


def items_labels(out, L):
    from PIL import ImageDraw, ImageFilter
    box_atlas(out, L, 'ammo_556', (64, 74, 48, 255), (232, 226, 200, 255), (220, 196, 90, 255), 'FIELDLINE', '5.56x45',
              'BALL  M855  62 GR', '30 RDS', stripe=(36, 42, 28, 255))
    box_atlas(out, L, 'ammo_9mm', (236, 232, 222, 255), (30, 30, 34, 255), (180, 28, 24, 255), 'TARGETLINE', '9mm LUGER',
              '115 GR  FULL METAL JACKET', '50 RDS', stripe=(180, 28, 24, 255), dark_text=(240, 240, 236, 255))
    box_atlas(out, L, 'ammo_45acp', (28, 46, 92, 255), (240, 236, 226, 255), (232, 176, 40, 255), 'TARGETLINE', '.45 AUTO',
              '230 GR  FMJ  ROUND NOSE', '50 RDS', stripe=(232, 176, 40, 255), dark_text=(20, 24, 40, 255))
    box_atlas(out, L, 'ammo_12g', (168, 30, 26, 255), (248, 240, 220, 255), (250, 200, 40, 255), 'FIELDLINE', '12 GAUGE',
              '2-3/4"  00 BUCK  9 PELLETS', '25 SHELLS', stripe=(250, 200, 40, 255), dark_text=(60, 10, 8, 255))
    box_atlas(out, L, 'ammo_300mag', (22, 22, 24, 255), (230, 196, 110, 255), (230, 196, 110, 255), 'PRECISION', '.300 WIN MAG',
              '190 GR  BOAT TAIL HP', '20 RDS', stripe=(70, 62, 40, 255))
    N = 1024
    # energy drink can wrap (u = around the can, v = height): fictional 'VOLTAGE'
    im = L.new(N, 512, (18, 20, 22, 255)); d = ImageDraw.Draw(im)
    for i in range(0, N, 6):
        d.line([i, 0, i - 200, 512], fill=(26, 30, 32, 255), width=2)
    for k, x in enumerate((256, 768)):
        bolt = [(x + 10, 70), (x - 60, 250), (x - 5, 250), (x - 40, 440), (x + 70, 210), (x + 12, 210), (x + 50, 70)]
        lay = L.new(N, 512); dl = ImageDraw.Draw(lay); dl.polygon(bolt, fill=(150, 240, 40, 255))
        im.alpha_composite(lay.filter(ImageFilter.GaussianBlur(14))); im.alpha_composite(lay)
    d = ImageDraw.Draw(im)
    for x in (256 - 150, 768 - 150):
        pass
    d.text((512, 250), 'VOLTAGE', font=L.font('inter', 120), fill=(240, 244, 236, 255), anchor='mm')
    d.text((512, 340), 'ENERGY DRINK', font=L.font('interb', 44), fill=(150, 240, 40, 255), anchor='mm')
    d.text((512, 455), '500 ml', font=L.font('interb', 30), fill=(200, 200, 200, 255), anchor='mm')
    d.text((60, 470), 'CAFFEINE 160 mg', font=L.font('sans', 22), fill=(180, 180, 180, 255), anchor='lm')
    im.save(os.path.join(out, 'energy_can.png'))
    # painkiller bottle label (u around, v height)
    im = L.new(N, 300, (246, 244, 238, 255)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, N, 60], fill=(30, 90, 170, 255))
    d.text((512, 30), 'PAIN RELIEF', font=L.font('interb', 40), fill=(255, 255, 255, 255), anchor='mm')
    d.text((512, 130), 'IBUPROFEN 400 mg', font=L.font('inter', 64), fill=(30, 40, 60, 255), anchor='mm')
    d.text((512, 205), '100 COATED TABLETS', font=L.font('interb', 36), fill=(30, 90, 170, 255), anchor='mm')
    d.text((512, 262), 'Read the enclosed leaflet before use', font=L.font('sans', 24), fill=(80, 80, 90, 255), anchor='mm')
    im = paper_noise(im, 8, seed=21); im.save(os.path.join(out, 'painkiller.png'))
    # syringe barrel label with graduations (u around, v along the barrel)
    im = L.new(N, 256); d = ImageDraw.Draw(im)
    for i in range(0, 21):
        y = 230 - i * 10
        w = 60 if i % 5 == 0 else 30
        d.line([30, y, 30 + w, y], fill=(20, 20, 20, 255), width=3)
        if i % 5 == 0: d.text((100, y), str(i), font=L.font('sans', 18), fill=(20, 20, 20, 255), anchor='lm')
    d.rectangle([420, 40, 980, 220], fill=(250, 214, 40, 235))
    d.text((700, 100), 'EPINEPHRINE', font=L.font('inter', 56), fill=(20, 20, 20, 255), anchor='mm')
    d.text((700, 165), '1 mg/ml  INJECTION', font=L.font('interb', 30), fill=(20, 20, 20, 255), anchor='mm')
    im.save(os.path.join(out, 'syringe.png'))
    # crosses: white cross on red (medkit patch), red cross on white (first aid lid)
    for name, bg, fg in (('cross_white_on_red', (176, 22, 20, 255), (245, 245, 240, 255)), ('cross_red_on_white', (236, 234, 228, 255), (190, 24, 22, 255))):
        im = L.new(512, 512, bg); d = ImageDraw.Draw(im)
        d.rectangle([196, 76, 316, 436], fill=fg); d.rectangle([76, 196, 436, 316], fill=fg)
        im = paper_noise(im, 6, seed=3); im.save(os.path.join(out, name + '.png'))
    # bandage wrapper band
    im = L.new(N, 256, (236, 233, 222, 255)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, N, 40], fill=(30, 110, 170, 255)); d.rectangle([0, 216, N, 256], fill=(30, 110, 170, 255))
    for x in (256, 768):
        d.text((x, 105), 'STERILE', font=L.font('inter', 48), fill=(30, 110, 170, 255), anchor='mm')
        d.text((x, 165), 'GAUZE BANDAGE 10cm x 4m', font=L.font('interb', 26), fill=(40, 40, 50, 255), anchor='mm')
    im = paper_noise(im, 10, seed=5); im.save(os.path.join(out, 'bandage.png'))
    # airdrop stencils (white paint on transparent)
    im = L.new(N, 512)
    col = (236, 234, 226, 255)
    L.stencil(im, (512, 150), 'SUPPLY DROP', 118, col, fname='cond')
    L.stencil(im, (512, 300), 'HANDLE WITH CARE', 70, col, fname='cond')
    L.stencil(im, (512, 410), 'GROSS WT 410 KG    CUBE 1.6 M3', 46, col, fname='cond', bridges=False)
    im.save(os.path.join(out, 'airdrop_side.png'))
    im = L.new(512, 512); d = ImageDraw.Draw(im)
    arrow = [(256, 40), (420, 220), (320, 220), (320, 470), (192, 470), (192, 220), (92, 220)]
    lay = L.new(512, 512); dl = ImageDraw.Draw(lay); dl.polygon(arrow, fill=col)
    im.alpha_composite(lay)
    im.save(os.path.join(out, 'airdrop_arrow.png'))
