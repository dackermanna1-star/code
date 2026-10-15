#!/usr/bin/env python3
"""Print sun direction (three.js world space) + basic stats for Radiance .hdr equirect files.

three.js equirect convention (equirectUv): u = atan2(z, x)/2π + 0.5, v = asin(y)/π + 0.5, HDRLoader flipY → image top = +Y.
usage: python3 -I tools/assets/textures/hdr_info.py public/assets/hdri/*.hdr [--json out.json]
"""
import json, math, sys
import numpy as np


def read_hdr(path):
    with open(path, 'rb') as f:
        data = f.read()
    i = 0
    while True:  # header until blank line
        j = data.index(b'\n', i)
        line = data[i:j]
        i = j + 1
        if line.strip() == b'':
            break
    j = data.index(b'\n', i)
    dims = data[i:j].split()
    i = j + 1
    H, W = int(dims[1]), int(dims[3])
    img = np.zeros((H, W, 4), np.uint8)
    p = i
    for y in range(H):
        if data[p] == 2 and data[p + 1] == 2 and (data[p + 2] << 8 | data[p + 3]) == W:
            p += 4
            for c in range(4):
                x = 0
                row = img[y, :, c]
                while x < W:
                    n = data[p]; p += 1
                    if n > 128:
                        n -= 128
                        row[x:x + n] = data[p]; p += 1
                    else:
                        row[x:x + n] = np.frombuffer(data, np.uint8, n, p); p += n
                    x += n
        else:  # flat
            img[y] = np.frombuffer(data, np.uint8, W * 4, p).reshape(W, 4); p += W * 4
    e = img[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return img[..., :3].astype(np.float32) * scale[..., None].astype(np.float32)


def info(path):
    rgb = read_hdr(path)
    H, W, _ = rgb.shape
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    y, x = np.unravel_index(np.argmax(lum), lum.shape)
    # refine: centroid of the brightest 0.02% pixels
    thr = np.quantile(lum, 0.9998)
    ys, xs = np.nonzero(lum >= thr)
    w = lum[ys, xs]
    u = (np.average(xs, weights=w) + 0.5) / W
    v = 1 - (np.average(ys, weights=w) + 0.5) / H
    phi = (u - 0.5) * 2 * math.pi
    el = (v - 0.5) * math.pi
    d = [math.cos(phi) * math.cos(el), math.sin(el), math.sin(phi) * math.cos(el)]
    sky = lum[: H // 2].mean()
    ground = lum[H // 2:].mean()
    return dict(file=path.split('/')[-1], size=[W, H], sun_elevation_deg=round(math.degrees(el), 1),
                sun_dir_threejs=[round(c, 3) for c in d], peak_luminance=round(float(lum.max()), 1),
                mean_sky_luminance=round(float(sky), 3), mean_ground_luminance=round(float(ground), 3))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    res = [info(a) for a in args if a.endswith('.hdr')]
    for r in res:
        print(json.dumps(r))
    if '--json' in sys.argv:
        json.dump(res, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1)
