"""
Generate label / stencil / decal PNGs (RGBA) used by the gear/item models, and the scope reticle PNGs.
    python3 tools/assets/gear/labels.py <out_dir> [--reticles <dir>]
Decals are written to <out_dir>/<name>.png. Reticles (if --reticles is given) go to <dir>/<name>.png.
Only fictional brands / generic wording are used.
"""
import os, sys, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONTS = '/usr/share/fonts/truetype'
def font(name, size):
    paths = {
        'bold': f'{FONTS}/dejavu/DejaVuSans-Bold.ttf',
        'cond': f'{FONTS}/dejavu/DejaVuSansCondensed-Bold.ttf',
        'sans': f'{FONTS}/dejavu/DejaVuSans.ttf',
        'lib': f'{FONTS}/liberation/LiberationSans-Bold.ttf',
        'libn': f'{FONTS}/liberation/LiberationSansNarrow-Bold.ttf',
        'mono': f'{FONTS}/dejavu/DejaVuSansMono-Bold.ttf',
        'serif': f'{FONTS}/dejavu/DejaVuSerif-Bold.ttf',
        'inter': '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf',
        'interb': '/usr/share/fonts/opentype/inter/Inter-Bold.otf',
    }
    p = paths[name]
    if not os.path.exists(p):
        p = f'{FONTS}/dejavu/DejaVuSans-Bold.ttf'
    return ImageFont.truetype(p, size)


def text_c(d, xy, s, f, fill, anchor='mm', spacing=0):
    d.text(xy, s, font=f, fill=fill, anchor=anchor)


def stencil(img, xy, s, size, fill, fname='cond', bridges=True, anchor='mm'):
    """stencil lettering: text with thin vertical gaps (bridges) and rough paint edges."""
    lay = Image.new('L', img.size, 0)
    d = ImageDraw.Draw(lay)
    f = font(fname, size)
    d.text(xy, s, font=f, fill=255, anchor=anchor)
    if bridges:
        bb = d.textbbox(xy, s, font=f, anchor=anchor)
        cy = (bb[1] + bb[3]) / 2
        d.rectangle([bb[0], cy - size * 0.035, bb[2], cy + size * 0.035], fill=0)
    lay = lay.filter(ImageFilter.GaussianBlur(0.8))
    col = Image.new('RGBA', img.size, fill)
    img.alpha_composite(Image.composite(col, Image.new('RGBA', img.size, (0, 0, 0, 0)), lay))


def new(w, h, bg=(0, 0, 0, 0)):
    return Image.new('RGBA', (w, h), bg)


# ----------------------------------------------------------------------------------------------
# reticles (black etched lines + red illumination on transparent; image spans the eyepiece field of view)
# ----------------------------------------------------------------------------------------------
def reticles(out):
    os.makedirs(out, exist_ok=True)
    N = 1024; C = N / 2
    RED = (255, 40, 30, 255); BLK = (8, 8, 8, 255)

    def glow_dot(img, r, col=RED, glow=3.0):
        lay = new(N, N); d = ImageDraw.Draw(lay)
        d.ellipse([C - r, C - r, C + r, C + r], fill=col)
        g = lay.filter(ImageFilter.GaussianBlur(r * glow))
        img.alpha_composite(g); img.alpha_composite(lay)

    # red dot: 2 MOA dot (image = 60 MOA wide window)
    im = new(N, N); glow_dot(im, 18, glow=1.2); im.save(os.path.join(out, 'reddot.png'))
    # holo: 68 MOA ring + 1 MOA centre dot + 4 ticks
    im = new(N, N); lay = new(N, N); d = ImageDraw.Draw(lay)
    R = 340
    d.ellipse([C - R, C - R, C + R, C + R], outline=RED, width=14)
    for a in range(4):
        x, y = math.cos(a * math.pi / 2), math.sin(a * math.pi / 2)
        d.line([C + x * (R - 2), C + y * (R - 2), C + x * (R + 45), C + y * (R + 45)], fill=RED, width=14)
    d.ellipse([C - 12, C - 12, C + 12, C + 12], fill=RED)
    im.alpha_composite(lay.filter(ImageFilter.GaussianBlur(6))); im.alpha_composite(lay)
    im.save(os.path.join(out, 'holo.png'))

    def crosshair(img, gap, w, col=BLK, thick_out=None, thick_w=None):
        d = ImageDraw.Draw(img)
        for (x0, y0, x1, y1) in [(0, C, C - gap, C), (C + gap, C, N, C), (C, 0, C, C - gap), (C, C + gap, C, N)]:
            d.line([x0, y0, x1, y1], fill=col, width=w)
        if thick_out:
            for (x0, y0, x1, y1) in [(0, C, C - thick_out, C), (C + thick_out, C, N, C), (C, C + thick_out, C, N), (C, 0, C, C - thick_out)]:
                d.line([x0, y0, x1, y1], fill=col, width=thick_w)

    # 2x: fine crosshair with an illuminated red dot
    im = new(N, N); crosshair(im, 60, 4); glow_dot(im, 10, glow=1.0); im.save(os.path.join(out, 'scope_2x.png'))
    # 3x: circle-dot (illuminated) with fine crosshair stubs
    im = new(N, N); lay = new(N, N); d = ImageDraw.Draw(lay)
    d.ellipse([C - 150, C - 150, C + 150, C + 150], outline=RED, width=8); d.ellipse([C - 9, C - 9, C + 9, C + 9], fill=RED)
    im.alpha_composite(lay.filter(ImageFilter.GaussianBlur(4))); im.alpha_composite(lay)
    crosshair(im, 300, 4); im.save(os.path.join(out, 'scope_3x.png'))
    # 4x: red chevron with BDC stadia below
    im = new(N, N); d = ImageDraw.Draw(im)
    d.line([C, C + 40, C, N], fill=BLK, width=4)
    for i, (y, w) in enumerate([(110, 70), (170, 56), (230, 44), (290, 34), (350, 26), (410, 20)]):
        d.line([C - w / 2, C + y, C + w / 2, C + y], fill=BLK, width=4)
        text_c(d, (C + w / 2 + 22, C + y), str(i + 4), font('sans', 22), BLK)
    lay = new(N, N); dl = ImageDraw.Draw(lay)
    dl.polygon([(C, C - 4), (C - 46, C + 52), (C - 34, C + 58), (C, C + 18), (C + 34, C + 58), (C + 46, C + 52)], fill=RED)
    im.alpha_composite(lay.filter(ImageFilter.GaussianBlur(3))); im.alpha_composite(lay)
    im.save(os.path.join(out, 'scope_4x.png'))
    # 6x: duplex crosshair with mil hash marks + small red centre
    im = new(N, N); crosshair(im, 0, 3, thick_out=230, thick_w=12); d = ImageDraw.Draw(im)
    for k in range(-4, 5):
        if k == 0: continue
        d.line([C + k * 46, C - 10, C + k * 46, C + 10], fill=BLK, width=3)
        d.line([C - 10, C + k * 46, C + 10, C + k * 46], fill=BLK, width=3)
    glow_dot(im, 5, glow=1.5); im.save(os.path.join(out, 'scope_6x.png'))
    # 8x: mil-dot
    im = new(N, N); crosshair(im, 0, 3, thick_out=400, thick_w=12); d = ImageDraw.Draw(im)
    for k in range(-4, 5):
        if k == 0: continue
        r = 7
        d.ellipse([C + k * 80 - r, C - r, C + k * 80 + r, C + r], fill=BLK)
        d.ellipse([C - r, C + k * 80 - r, C + r, C + k * 80 + r], fill=BLK)
    im.save(os.path.join(out, 'scope_8x.png'))


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/gear_build/labels'
    os.makedirs(out, exist_ok=True)
    if '--reticles' in sys.argv:
        reticles(sys.argv[sys.argv.index('--reticles') + 1])
    import labels_items
    labels_items.make_all(out, sys.modules[__name__])
    print('labels ->', out)


if __name__ == '__main__':
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    main()
