"""Scarlet's textures, recoloured from a Rocketbox avatar's (Female_Adult_07; MIT, see rocketbox.mjs).

The avatar wears a brown jacket over a pink top, jeans and brown knee boots. Scarlet wears a black
leather jacket over a deep red top, sheer black tights (under a leather mini skirt, which the game
builds), black boots and fingerless gloves, and has red hair and red lips. Texels are told apart by
the body part covering them (uvlabels.py) and by their colour.

Outfits (the last argument): leather (her own), denim (a denim jacket, a white tee, black jeans and
white trainers, bare hands), dress (a red satin dress with long sleeves - the game builds its skirt -
sheer tights and black heels), guard (Palewater's night-shift uniform: navy jacket and trousers, a
pale blue shirt, black boots). Only the body's textures change; the head and hair are shared.

Usage: python3 -I tools/models/scarlet_textures.py <avatar Textures dir> <labels.json> <out dir> [outfit]
Writes body.jpg, head.jpg, hair.webp (colour + alpha), body_n.jpg, head_n.jpg (normal maps) and
body_f.png, head_f.png (finish: R = the atlas-alpha finish code - 1 matte, 0.5..1 gloss, 0.25..0.5
sheer, below 0.25 metal - and G = bare skin, where bruises show).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import uvlabels as U  # noqa: E402

P = U.P


def load(path, size=None):
    im = Image.open(path)
    if size:
        im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def rgb2hsv(c):
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    mx = c.max(-1)
    mn = c.min(-1)
    d = mx - mn + 1e-8
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60.0
    s = np.where(mx > 1e-6, (mx - mn) / (mx + 1e-8), 0)
    return h, s, mx


def hsv2rgb(h, s, v):
    h = (h % 360) / 60.0
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def _box(a, r, axis):
    n = a.shape[axis]
    c = np.cumsum(np.pad(a, [(r + 1, r) if k == axis else (0, 0) for k in range(a.ndim)], mode='edge'), axis=axis)
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return (hi - lo) / (2 * r + 1)


def blur(a, r):
    """Gaussian-like blur (three box passes) of a float image (H, W) or (H, W, C)."""
    a = a.astype(np.float32)
    b = max(1, int(round(r * 0.8)))
    for _ in range(3):
        a = _box(_box(a, b, 0), b, 1)
    return a


def soft(mask, r=1.5):
    return np.clip(blur(mask.astype(np.float32), r), 0, 1)


def lum(c):
    return c[..., 0] * 0.299 + c[..., 1] * 0.587 + c[..., 2] * 0.114


def mixin(dst, src, w):
    return dst * (1 - w[..., None]) + src * w[..., None]


def shaded(base, detail, lo=0.25, hi=2.6, gamma=0.85):
    """A flat colour carrying the original's relative shading (seams, folds, grain)."""
    return np.asarray(base, np.float32) * np.clip(detail, lo, hi)[..., None] ** gamma


def finish_code(gloss=None, sheer=None, metal=False):
    if metal:
        return 0.05
    if sheer is not None:
        return 0.5 - sheer * 0.25
    if gloss is not None:
        return 1 - gloss * 0.5
    return 1.0


def save_rgb(a, path, q=88, size=None):
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')
    if size:
        im = im.resize((size, size), Image.LANCZOS)
    im.save(path, quality=q, optimize=True, progressive=True)


def twill(S, seed):
    """Denim's diagonal weave (a light, a dark thread)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    w = 0.5 + 0.5 * np.sin((xx + yy) * 1.9)
    return 0.93 + 0.1 * w + (rng.random((S, S)).astype(np.float32) - 0.5) * 0.08


def main(texdir, labels_json, outdir, outfit='leather', prefix='f007'):
    S = 2048
    os.makedirs(outdir, exist_ok=True)
    lab = U.labels(labels_json, S)
    T = lambda n: os.path.join(texdir, f'{prefix}_{n}.tga')

    # ------------------------------------------------------------------ the body
    body = load(T('body_color'))[..., :3]
    L, H, Z = lab['body']
    h, s, v = rgb2hsv(body)
    reg = lambda *ns: np.isin(L, [P[n] for n in ns])
    cloth = reg('torso', 'arm', 'thigh', 'calf', 'foot')
    hand, finger = reg('hand'), reg('finger')
    skin = (((h < 38) | (h > 345)) & (s > 0.12) & (s < 0.62) & (v > 0.42)) | finger
    skin &= ~reg('foot')
    denim = cloth & ~reg('foot') & (h > 165) & (h < 260) & (s < 0.42) & (v > 0.08)
    # (faded denim goes grey: low saturation below the jacket's hem, on the legs)
    denim |= reg('thigh', 'calf') & (s < 0.14) & (v > 0.18)
    denim = np.asarray(Image.fromarray(denim.astype(np.uint8) * 255).filter(ImageFilter.MedianFilter(5))) > 127
    pink = reg('torso') & ~skin & ~denim & (((h > 290) | (h < 6)) & (s > 0.28) & (v > 0.22))
    metal = reg('torso') & ~skin & ~denim & ~pink & (h > 24) & (h < 62) & (s > 0.2) & (v > 0.42)
    leather = (cloth | hand) & ~denim & ~pink & ~metal & ~(skin & ~hand)
    boots = leather & reg('calf', 'foot')

    out = body.copy()
    fin = np.ones((S, S), np.float32)
    skinmask = np.zeros((S, S), np.float32)
    lm = lum(body)
    if outfit != 'leather':
        out, fin, skinmask, flat = other_outfit(outfit, body, out, fin, lm, reg, skin, denim, pink, metal, leather, boots, hand, finger, S)
        save_rgb(out, os.path.join(outdir, 'body.jpg'), 86)
        bn = load(T('body_normal'), 1024)[..., :3]
        if flat is not None:
            fl = np.asarray(Image.fromarray(flat.astype(np.float32), 'F').resize((1024, 1024), Image.BILINEAR))
            bn = mixin(bn, np.array([0.5, 0.5, 1.0], np.float32) * np.ones_like(bn), np.clip(fl * 0.9, 0, 1))
        save_rgb(bn, os.path.join(outdir, 'body_n.jpg'), 90)
        save_finish(fin, skinmask, os.path.join(outdir, 'body_f.png'))
        print('written to', outdir, '(body only)')
        return

    # leather: the jacket, the belt and the boots go black, keeping their seams, folds and grain
    lm = lum(body)
    ref = np.median(lm[leather & ~hand]) + 1e-4
    jacket_col = shaded([0.072, 0.064, 0.07], lm / ref)
    boot_col = shaded([0.05, 0.045, 0.05], lm / ref, gamma=0.95)
    w_leather = soft(leather)
    out = mixin(out, jacket_col, w_leather)
    out = mixin(out, boot_col, soft(boots) * w_leather)
    fin = np.where(leather, finish_code(gloss=0.55), fin)
    fin = np.where(boots, finish_code(gloss=0.75), fin)

    # fingerless gloves: the palm and the back of the hand (the skin's creases become the leather's)
    gl = hand & ~finger
    sref = np.median(lm[finger]) + 1e-4
    glove_col = shaded([0.06, 0.055, 0.058], lm / sref, 0.4, 1.8)
    # the glove's rolled hem across the knuckles
    edge = soft(gl, 3.0) * soft(finger, 3.0) * 4
    glove_col = glove_col + np.clip(edge, 0, 1)[..., None] * 0.05
    out = mixin(out, glove_col, soft(gl, 1.0))
    fin = np.where(gl, finish_code(gloss=0.45), fin)

    # the top: deep red, keeping its shading
    pref = np.median(v[pink]) + 1e-4 if pink.any() else 1
    out = mixin(out, shaded([0.42, 0.045, 0.085], v / pref, 0.3, 1.8), soft(pink))
    fin = np.where(pink, finish_code(gloss=0.12), fin)

    # sheer black tights over the legs: the skin's tone under black nylon, the denim's seams and
    # pockets gone (only its broad shading stays), a faint knit
    skin_tone = np.median(body[finger], axis=0)
    tights = np.asarray(skin_tone) * 0.24 + np.asarray([0.012, 0.01, 0.012])
    broad = blur(lm, 24) / (np.median(lm[denim]) + 1e-4)
    knit = 1 + (np.random.default_rng(7).random((S, S)).astype(np.float32) - 0.5) * 0.06
    tcol = shaded(tights, np.clip(broad, 0.7, 1.25) * knit, 0.5, 1.6, 1.0)
    w_den = soft(denim, 2.0)
    out = mixin(out, tcol, w_den)
    fin = np.where(denim, finish_code(sheer=0.85), fin)

    fin = np.where(metal, finish_code(metal=True), fin)
    skinmask = np.where((skin & ~gl & ~leather) | finger, 1.0, 0.0).astype(np.float32)
    fin = np.where(skinmask > 0.5, 1.0, fin)

    save_rgb(out, os.path.join(outdir, 'body.jpg'), 86)
    bn = load(T('body_normal'), 1024)[..., :3]
    flat = np.asarray(Image.fromarray(w_den.astype(np.float32), 'F').resize((1024, 1024), Image.BILINEAR))
    bn = mixin(bn, np.array([0.5, 0.5, 1.0], np.float32) * np.ones_like(bn), np.clip(flat * 0.9, 0, 1))
    save_rgb(bn, os.path.join(outdir, 'body_n.jpg'), 90)
    save_finish(fin, skinmask, os.path.join(outdir, 'body_f.png'))

    # ------------------------------------------------------------------ the head
    head = load(T('head_color'))[..., :3]
    L, H, Z = lab['head']
    h, s, v = rgb2hsv(head)
    reg = lambda *ns: np.isin(L, [P[n] for n in ns])
    # the face's front (no hair there, but the brows), from the eyes' joints
    face = (Z > -0.012) & (H < 1.655) & (H > 1.5)
    brows = face & (H > 1.618) & (H < 1.655)
    dark = sstep(0.5, 0.28, v) * sstep(0.12, 0.3, s) * ((h < 48) | (h > 340))
    hairw = dark * (reg('head') & ~face)
    hairw = np.maximum(hairw, dark * brows * 0.55)
    red = red_hair(h, s, v)
    out = mixin(head, red, np.clip(soft(hairw > 0.02, 0.8) * hairw * 1.15, 0, 1))
    hair_fin = hairw > 0.4
    # red lips: the lips' own reds (not the chin's skin), on the face's front
    lips = reg('mouth', 'head') & (Z > 0.0) & (H > 1.525) & (H < 1.56) & ((h < 12) | (h > 335)) & (s > 0.28) & (v > 0.3)
    lips = np.asarray(Image.fromarray(lips.astype(np.uint8) * 255).filter(ImageFilter.MedianFilter(5))) > 127
    lref = np.median(v[lips]) + 1e-4 if lips.any() else 1
    # (a deep red that keeps the lips' own light and creases)
    out = mixin(out, shaded([0.5, 0.075, 0.1], v / lref, 0.45, 1.6, 1.1), soft(lips, 1.6) * 0.72)
    fin = np.ones((S, S), np.float32)
    fin = np.where(hair_fin, finish_code(gloss=0.3), fin)
    fin = np.where(lips, finish_code(gloss=0.45), fin)
    fin = np.where(reg('eye'), finish_code(gloss=0.9), fin)
    skinmask = np.where(reg('head', 'torso', 'arm', 'mouth') & ~hair_fin, 1.0, 0.0).astype(np.float32)
    save_rgb(out, os.path.join(outdir, 'head.jpg'), 88)
    save_rgb(load(T('head_normal'), 1024)[..., :3], os.path.join(outdir, 'head_n.jpg'), 90)
    save_finish(fin, skinmask, os.path.join(outdir, 'head_f.png'))

    # ------------------------------------------------------------------ the hair cards and lashes
    op = load(T('opacity_color'), 1024)
    L, H, Z = U.labels(labels_json, 1024)['hair']
    rgb, a = op[..., :3], op[..., 3]
    h, s, v = rgb2hsv(rgb)
    lash = np.isin(L, [P['lash']])
    rgb = np.where(lash[..., None], rgb * 0.6, red_hair(h, s, v))
    im = np.concatenate([np.clip(rgb, 0, 1), a[..., None]], -1)
    Image.fromarray((im * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(outdir, 'hair.webp'), quality=88, method=6)
    print('written to', outdir)


def other_outfit(outfit, body, out, fin, lm, reg, skin, denim, pink, metal, leather, boots, hand, finger, S):
    """Her other clothes, painted over the same body (see the module's docstring)."""
    foot = reg('foot')
    shaft = boots & ~foot
    jacket = leather & ~boots & ~(hand)
    ref = np.median(lm[leather & ~hand]) + 1e-4
    dref = np.median(lm[denim]) + 1e-4
    pref = np.median(rgb2hsv(body)[2][pink]) + 1e-4 if pink.any() else 1
    v = rgb2hsv(body)[2]
    skinmask = np.where((skin & ~leather) | finger | hand, 1.0, 0.0).astype(np.float32)
    flat = None
    tw = twill(S, 11)
    if outfit == 'denim':
        # a mid-blue denim jacket (the leather's seams and folds, a twill weave)
        out = mixin(out, shaded([0.2, 0.3, 0.46], (lm / ref) * tw, 0.35, 2.2), soft(jacket))
        fin = np.where(jacket, finish_code(), fin)
        # a white tee
        out = mixin(out, shaded([0.8, 0.78, 0.74], v / pref, 0.45, 1.4), soft(pink))
        fin = np.where(pink, finish_code(), fin)
        # black jeans (the avatar's own seams and pockets kept), down over the boots' shafts
        legs = denim | shaft
        out = mixin(out, shaded([0.06, 0.06, 0.075], (lm / dref) * tw, 0.4, 2.2), soft(legs, 1.5))
        fin = np.where(legs, finish_code(), fin)
        # white trainers: a pale upper, a grey sole along the bottom (the foot's lowest texels darker)
        tref = np.median(lm[foot]) + 1e-4 if foot.any() else 1
        out = mixin(out, shaded([0.84, 0.83, 0.8], lm / tref, 0.5, 1.4), soft(foot & leather, 1.0))
        fin = np.where(foot, finish_code(gloss=0.15), fin)
    elif outfit == 'dress':
        # deep red satin from the shoulders down (the jacket's sleeves become the dress's), glossy
        sat = [0.42, 0.03, 0.06]
        top = jacket | pink
        out = mixin(out, shaded(sat, (lm / ref) ** 0.7, 0.35, 2.4), soft(top))
        fin = np.where(top, finish_code(gloss=0.75), fin)
        # sheer black tights, over the legs and the boots' shafts
        skin_tone = np.median(body[finger], axis=0)
        tights = np.asarray(skin_tone) * 0.26 + np.asarray([0.012, 0.01, 0.012])
        legs = denim | shaft
        broad = blur(lm, 24) / dref
        out = mixin(out, shaded(tights, np.clip(broad, 0.7, 1.25), 0.5, 1.6, 1.0), soft(legs, 2.0))
        fin = np.where(legs, finish_code(sheer=0.85), fin)
        flat = soft(legs, 2.0)
        # black patent heels
        out = mixin(out, shaded([0.03, 0.028, 0.032], lm / ref, 0.4, 2.4), soft(foot & leather, 1.0))
        fin = np.where(foot, finish_code(gloss=0.9), fin)
    elif outfit == 'guard':
        # Palewater security: a navy jacket, a pale blue shirt, navy trousers, black boots
        out = mixin(out, shaded([0.07, 0.09, 0.15], lm / ref, 0.35, 2.2), soft(jacket))
        fin = np.where(jacket, finish_code(gloss=0.1), fin)
        out = mixin(out, shaded([0.5, 0.58, 0.68], v / pref, 0.45, 1.4), soft(pink))
        fin = np.where(pink, finish_code(), fin)
        out = mixin(out, shaded([0.06, 0.075, 0.11], lm / dref, 0.4, 2.2), soft(denim, 1.5))
        fin = np.where(denim, finish_code(), fin)
        out = mixin(out, shaded([0.035, 0.032, 0.035], lm / ref, 0.4, 2.2), soft(boots))
        fin = np.where(boots, finish_code(gloss=0.6), fin)
    fin = np.where(metal, finish_code(metal=True), fin)
    fin = np.where(skinmask > 0.5, 1.0, fin)
    return out, fin, skinmask, flat


def red_hair(h, s, v):
    """Brown hair to a deep copper red: lighter, saturated, the strands' light and dark kept."""
    nv = np.clip(v * 1.7 + 0.03, 0, 0.82)
    ns = np.clip(0.72 + (0.55 - v) * 0.4, 0.6, 0.9)
    nh = 9 + v * 12
    return hsv2rgb(nh, ns, nv)


def save_finish(fin, skin, path, size=1024):
    im = np.stack([fin, skin, np.zeros_like(fin)], -1)
    Image.fromarray((np.clip(im, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').resize((size, size), Image.BILINEAR).save(path, optimize=True)


if __name__ == '__main__':
    main(*sys.argv[1:5])
