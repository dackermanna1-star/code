"""Game textures for a converted Rocketbox avatar (MIT; see rocketbox.mjs), kept as they are dressed.

Writes, into the out dir:
  body.jpg     the body's colour (1024 square; with extra materials - a helmet, equipment, tools -
               2048 x 1024: the body on the left half, the extras in 512 cells on the right, the
               way rocketbox.mjs moved their uvs)
  body_n.jpg   its normal map, at half the size
  body_f.png   finish, at a quarter: R = the character atlas alpha's finish code (1 matte, 0.5..1
               gloss, below 0.25 metal; from the avatar's specular map), G = bare skin (bruises
               show there), B = the clothes' region for the game's per-fighter tints (1 the top,
               0.5 the trousers, 0 neither)
  head.jpg     the head's colour (512, or as asked), head_f.png its finish (G = skin)
  hair.webp    hair cards and lashes, colour + alpha (512), when the avatar has them

Usage: python3 -I tools/models/avatar_textures.py <Textures dir> <labels.json> <out dir> [options json]
options: {"head": 512, "body": 1024, "blood": 0..1 (a butcher's apron), "seed": 1}
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import uvlabels as U  # noqa: E402
from scarlet_textures import blur, rgb2hsv, soft  # noqa: E402

P = U.P


def find(texdir, slot, kind):
    """The avatar's <id>_<slot>_<kind>[_variant].tga."""
    hits = sorted(glob.glob(os.path.join(texdir, f'*_{slot}_{kind}*.tga')))
    return hits[0] if hits else None


def load(path, size, mode='RGB'):
    im = Image.open(path).convert(mode)
    if im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def compose(texdir, kind, extras, W, H, mode='RGB'):
    """The body (and the extras' cells beside it, as rocketbox.mjs packed their uvs)."""
    ch = 4 if mode == 'RGBA' else 3
    out = np.zeros((H, W, ch), np.float32)
    if kind == 'normal':
        out[...] = (0.5, 0.5, 1.0)[:ch] if ch == 3 else (0.5, 0.5, 1.0, 1.0)
    wide = len(extras) > 0
    bw = W // 2 if wide else W
    f = find(texdir, 'body', kind)
    if f:
        out[:, :bw] = load(f, (bw, H), mode)
    cell = W // 4
    for i, ex in enumerate(extras):
        f = find(texdir, ex, kind)
        if not f:
            continue
        cx, cy = i % 2, 1 - i // 2
        # (image rows run down: the cell with v in [cy/2, cy/2 + 1/2] sits at the top for cy = 1)
        y0 = (1 - cy) * (H // 2)
        x0 = bw + cx * cell
        out[y0:y0 + H // 2, x0:x0 + cell] = load(f, (cell, H // 2), mode)
    return out


def save_jpg(a, path, q):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').save(path, quality=q, optimize=True, progressive=True)


def save_finish(fin, skin, region, path, size):
    im = np.stack([fin, skin, region], -1)
    Image.fromarray((np.clip(im, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').resize(size, Image.BILINEAR).save(path, optimize=True)


def main(texdir, labels_json, outdir, opts=None):
    opts = opts or {}
    os.makedirs(outdir, exist_ok=True)
    meta = json.load(open(labels_json))
    extras = meta.get('extras', [])
    wide = bool(meta.get('wide'))
    BS = int(opts.get('body', 1024))
    HS = int(opts.get('head', 512))
    BW, BH = (BS * 2, BS) if wide else (BS, BS)
    lab = U.labels(labels_json, BS, {'body': (BW, BH), 'head': (HS, HS), 'hair': (512, 512)})
    rng = np.random.default_rng(int(opts.get('seed', 1)))

    # ------------------------------------------------------------------ body
    col = compose(texdir, 'color', extras, BW, BH)
    spec = compose(texdir, 'specular', extras, BW, BH)
    L, H, Z = lab['body']
    h, s, v = rgb2hsv(col)
    reg = lambda *ns: np.isin(L, [P[n] for n in ns])
    on_body = L > 0
    if wide:
        # (the extras' cells carry no body labels: they're gear)
        gear = np.zeros(L.shape, bool)
        gear[:, BW // 2:] = True
        on_body &= ~gear
    else:
        gear = np.zeros(L.shape, bool)
    # skin: the avatar's own skin tone (from its fingers), not any warm colour - khaki trousers and
    # tan leather are no skin
    hues = ((h < 45) | (h > 335)) & (s > 0.1) & (v > 0.18)
    fing = reg('finger') & hues
    tone = np.median(col[fing], axis=0) if fing.sum() > 50 else np.array([0.75, 0.55, 0.45], np.float32)
    near_tone = np.linalg.norm((col - tone) / np.maximum(tone, 0.12), axis=-1) < 0.42
    skin = hues & near_tone & on_body & ~reg('foot')
    skin |= reg('finger') & hues
    skin = np.asarray(Image.fromarray(skin.astype(np.uint8) * 255).filter(ImageFilter.MedianFilter(5))) > 127
    cloth = on_body & ~skin
    top = cloth & reg('torso', 'arm')
    bottom = cloth & reg('thigh', 'calf')
    # the trousers reach up the hips (they're the pelvis's there): what in the torso's lower part
    # looks like the trousers is trousers
    if bottom.any():
        pants = np.median(col[bottom], axis=0)
        hip_y = float(np.percentile(H[reg('thigh')], 95)) if reg('thigh').any() else 0.9
        near = np.linalg.norm(col - pants, axis=-1) < 0.09
        low = (H < hip_y + 0.08) & (H > 0)
        moved = top & near & low
        top &= ~moved
        bottom |= moved
    region = np.where(top, 1.0, np.where(bottom, 0.5, 0.0)).astype(np.float32)
    region = np.where(soft(top, 1.0) > 0.5, 1.0, np.where(soft(bottom, 1.0) > 0.5, 0.5, region))
    # finish: the avatar's specular map says what shines (shoes, belts, buckles, visors)
    sl = spec.mean(-1)
    gloss = np.clip((sl - 0.18) / 0.5, 0, 1) * 0.85
    fin = 1 - gloss * 0.5
    metal = (sl > 0.62) & (s < 0.25) & cloth
    fin = np.where(metal, 0.05, fin)
    fin = np.where(skin, 1.0, fin)

    blood = float(opts.get('blood', 0))
    if blood > 0:
        # a butcher's day: old blood soaked into the front of his coat and down its sleeves -
        # irregular clots, runs from them down the cloth (down the body: each texel's downhill,
        # from the height of the triangles over it - the texture's islands lie every which way),
        # a fine spatter about; dark and brown where it has dried, redder where it's fresher
        Wt, Ht = L.shape[1], L.shape[0]
        w = np.zeros(L.shape, np.float32)
        Hs = blur(np.where(H > 0, H, np.nan_to_num(H)), 3)
        gy, gx = np.gradient(Hs)
        sc = BS / 1024
        ys, xs = np.nonzero(cloth & reg('torso', 'arm', 'thigh') & (Z > -0.02))
        yy, xx = np.ogrid[:Ht, :Wt]

        def disk(cy, cx, r, a):
            y0, y1 = int(max(0, cy - r - 1)), int(min(Ht, cy + r + 2))
            x0, x1 = int(max(0, cx - r - 1)), int(min(Wt, cx + r + 2))
            if y1 <= y0 or x1 <= x0:
                return
            sub = ((yy[y0:y1] - cy) ** 2 + (xx[:, x0:x1] - cx) ** 2) < r * r
            w[y0:y1, x0:x1] = np.maximum(w[y0:y1, x0:x1], sub * a)

        for _ in range(int(55 * blood)):
            k = rng.integers(len(ys))
            cy, cx = float(ys[k]), float(xs[k])
            r0 = rng.uniform(3, 11) * sc
            for _j in range(rng.integers(3, 8)):
                disk(cy + rng.normal(0, r0 * 0.7), cx + rng.normal(0, r0 * 0.7), r0 * rng.uniform(0.4, 1.0), rng.uniform(0.65, 1.0))
            if rng.random() < 0.7:
                # the run: downhill on the body, thinning as it goes
                py, px = cy, cx
                n = int(rng.uniform(12, 60) * sc)
                wd = rng.uniform(1.0, 2.6) * sc
                for st in range(n):
                    iy, ix = int(min(Ht - 1, max(0, py))), int(min(Wt - 1, max(0, px)))
                    dy, dx = -gy[iy, ix], -gx[iy, ix]
                    ln = np.hypot(dy, dx)
                    if ln < 1e-7 or not cloth[iy, ix]:
                        break
                    py += dy / ln
                    px += dx / ln
                    disk(py, px, wd * (1 - 0.5 * st / n), 0.8)
                disk(py, px, wd * 1.4, 0.85)
        for _ in range(int(420 * blood)):
            k = rng.integers(len(ys))
            disk(ys[k] + rng.normal(0, 30 * sc), xs[k] + rng.normal(0, 30 * sc), rng.uniform(0.5, 1.8) * sc, rng.uniform(0.4, 0.85))
        noise = blur(rng.random(L.shape).astype(np.float32), 1.5)
        w = np.clip(blur(w, 0.8) * (0.8 + 0.4 * noise), 0, 1) * cloth
        age = blur(rng.random(L.shape).astype(np.float32), 18)
        age = np.clip((age - age.min()) / max(1e-4, age.max() - age.min()), 0, 1)
        dried = np.array([0.085, 0.022, 0.016], np.float32)
        fresh = np.array([0.2, 0.022, 0.016], np.float32)
        stain = dried[None, None] * age[..., None] + fresh[None, None] * (1 - age[..., None])
        col = col * (1 - w[..., None]) + (np.minimum(col, 0.85) * stain * 2.4) * w[..., None]
    save_jpg(col, os.path.join(outdir, 'body.jpg'), 84)
    nrm = compose(texdir, 'normal', extras, BW // 2, BH // 2)
    save_jpg(nrm, os.path.join(outdir, 'body_n.jpg'), 88)
    save_finish(fin, skin.astype(np.float32), region, os.path.join(outdir, 'body_f.png'), (BW // 4, BH // 4))

    # ------------------------------------------------------------------ head
    hc = load(find(texdir, 'head', 'color'), (HS, HS))
    hs = find(texdir, 'head', 'specular')
    L, H, Z = lab['head']
    h, s, v = rgb2hsv(hc)
    hskin = (L > 0) & (v > 0.32) & (s < 0.7) & ((h < 45) | (h > 330))
    hfin = np.ones((HS, HS), np.float32)
    if hs:
        hsl = load(hs, (HS, HS)).mean(-1)
        hfin = 1 - np.clip((hsl - 0.25) / 0.5, 0, 1) * 0.35
    hfin = np.where(np.isin(L, [P['eye']]), 0.55, hfin)
    save_jpg(hc, os.path.join(outdir, 'head.jpg'), 86)
    save_finish(hfin, hskin.astype(np.float32), np.zeros((HS, HS), np.float32), os.path.join(outdir, 'head_f.png'), (HS // 2, HS // 2))

    # ------------------------------------------------------------------ hair cards
    op = find(texdir, 'opacity', 'color')
    if op:
        im = Image.open(op).convert('RGBA').resize((512, 512), Image.LANCZOS)
        im.save(os.path.join(outdir, 'hair.webp'), quality=86, method=6)
    print('written', outdir, 'wide' if wide else '', extras)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4]) if len(sys.argv) > 4 else None)
