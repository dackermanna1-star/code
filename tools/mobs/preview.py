"""Quick software preview of a textured model (point splatting with a z-buffer and simple
directional light), so models and textures can be checked without starting the game."""
import math

import numpy as np
from PIL import Image, ImageDraw

from mobs.paint import rasterize


def render(quads, texture, tex_w, tex_h, size=320, yaw=145.0, pitch=20.0, sub=None, label=None, bg=(150, 190, 230)):
    if sub is None:
        allv = np.array([vt[:3] for q in quads for vt in q['verts']])
        extent = max(1.0, float((allv.max(0) - allv.min(0)).max()))
        sub = max(2, int(math.ceil(size * 0.86 / extent / 1.2)))
    pts, cols = [], []
    light = np.array([-0.45, -0.8, -0.4])
    light /= np.linalg.norm(light)
    for q in quads:
        r = rasterize(q, tex_w, tex_h)
        if r is None:
            continue
        uu, vv, pos, nrm = r
        texel = texture[vv, uu]
        visible = texel[:, 3] > 0
        if not visible.any():
            continue
        # subsample each texel for a dense splat
        verts = q['verts']
        us = [vt[3] for vt in verts]
        vs = [vt[4] for vt in verts]
        u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)

        def corner(cu, cv):
            return np.array(min(verts, key=lambda vt: abs(vt[3] - cu) + abs(vt[4] - cv))[:3])

        p00, p10, p01, p11 = corner(u0, v0), corner(u1, v0), corner(u0, v1), corner(u1, v1)
        for a in range(sub):
            for b in range(sub):
                s = ((uu + (a + 0.5) / sub) - u0) / (u1 - u0)
                t = ((vv + (b + 0.5) / sub) - v0) / (v1 - v0)
                s = s[:, None]
                t = t[:, None]
                p = p00 * (1 - s) * (1 - t) + p10 * s * (1 - t) + p01 * (1 - s) * t + p11 * s * t
                pts.append(p[visible])
                n = nrm[visible]
                lam = 0.62 + 0.38 * np.clip(-(n @ light), -1, 1)
                cols.append(texel[visible, :3] * lam[:, None])
    if not pts:
        return Image.new('RGB', (size, size), bg)
    P = np.concatenate(pts)
    C = np.concatenate(cols)
    # model space: y down; flip to y up for viewing
    P = P * np.array([1, -1, 1])
    cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    cp, sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
    x = P[:, 0] * cy + P[:, 2] * sy
    z = -P[:, 0] * sy + P[:, 2] * cy
    y = P[:, 1]
    y2 = y * cp - z * sp
    z2 = y * sp + z * cp
    lo = np.array([x.min(), y2.min()])
    hi = np.array([x.max(), y2.max()])
    scale = (size * 0.86) / max(hi - lo)
    px = ((x - (lo[0] + hi[0]) / 2) * scale + size / 2).astype(int)
    py = (size / 2 - (y2 - (lo[1] + hi[1]) / 2) * scale).astype(int)
    img = np.zeros((size, size, 3))
    img[:] = bg
    zbuf = np.full((size, size), -1e9)
    order = np.argsort(z2)
    r = max(1, int(math.ceil(scale / sub / 2.0)))
    for dx in range(-r + 1, r + 1):
        for dy in range(-r + 1, r + 1):
            xx = px[order] + dx
            yy = py[order] + dy
            ok = (xx >= 0) & (xx < size) & (yy >= 0) & (yy < size)
            idx = order[ok]
            xx, yy = xx[ok], yy[ok]
            zz = z2[idx]
            closer = zz > zbuf[yy, xx]
            img[yy[closer], xx[closer]] = C[idx[closer]]
            zbuf[yy[closer], xx[closer]] = zz[closer]
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB')
    if label:
        ImageDraw.Draw(im).text((6, 4), label, fill=(20, 20, 20))
    return im


def sheet(images, cols=4):
    w, h = images[0].size
    rows = (len(images) + cols - 1) // cols
    out = Image.new('RGB', (w * cols, h * rows), (40, 40, 40))
    for i, im in enumerate(images):
        out.paste(im, ((i % cols) * w, (i // cols) * h))
    return out
