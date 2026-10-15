"""
Trace a firearm side-view photo (light, uniform background) into a millimetre silhouette.

  python3 tools/assets/weapons/trace.py <image> <out.json> --len <overall_mm> [--flip] [--thr 225]
        [--crop x0,y0,x1,y1] [--eps 0.5] [--grid out_grid.png] [--rot deg]

Output JSON: {"len_mm", "mm_per_px", "outer": [[f,u],...], "holes": [[[f,u],...],...]}
f = 0 at the rear-most point, increasing toward the muzzle; u = 0 at the lowest point, up positive.
--flip mirrors the image horizontally (use when the muzzle points left).
A grid PNG (10 mm minor / 50 mm major lines, labelled) is written for reading coordinates when splitting parts.
"""
import sys, json, argparse
import numpy as np, cv2

ap = argparse.ArgumentParser()
ap.add_argument('img'); ap.add_argument('out')
ap.add_argument('--len', type=float, required=True)
ap.add_argument('--flip', action='store_true')
ap.add_argument('--thr', type=int, default=225)
ap.add_argument('--crop', default=None)
ap.add_argument('--eps', type=float, default=0.45)
ap.add_argument('--grid', default=None)
ap.add_argument('--rot', type=float, default=0.0)
ap.add_argument('--close', type=int, default=3)
ap.add_argument('--sat', type=int, default=0, help='also treat saturated pixels (non-gray background) as foreground if >0')
ap.add_argument('--bgdark', action='store_true', help='background is black (foreground = brighter than --thr)')
ap.add_argument('--both', action='store_true', help='with alpha images: foreground = alpha AND darker than --thr')
a = ap.parse_args()

raw = cv2.imread(a.img, cv2.IMREAD_UNCHANGED)
alpha = None
if raw.ndim == 3 and raw.shape[2] == 4:
    alpha = raw[:, :, 3].copy(); im = raw[:, :, :3].copy()
    im[alpha < 128] = 255
elif raw.ndim == 2:
    im = cv2.cvtColor(raw, cv2.COLOR_GRAY2BGR)
else:
    im = raw
if a.crop:
    x0, y0, x1, y1 = map(int, a.crop.split(','))
    im = im[y0:y1, x0:x1]
    if alpha is not None: alpha = alpha[y0:y1, x0:x1]
if a.flip:
    im = im[:, ::-1].copy()
    if alpha is not None: alpha = alpha[:, ::-1].copy()
if abs(a.rot) > 1e-6:
    h, w = im.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), a.rot, 1.0)
    im = cv2.warpAffine(im, M, (w, h), borderValue=(255, 255, 255))
    if alpha is not None: alpha = cv2.warpAffine(alpha, M, (w, h), borderValue=0)
gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
if alpha is not None and a.both:
    mask = ((alpha > 128) & (gray < a.thr)).astype(np.uint8) * 255
elif alpha is not None:
    mask = (alpha > 128).astype(np.uint8) * 255
elif a.bgdark:
    mask = (gray > a.thr).astype(np.uint8) * 255
else:
    mask = (gray < a.thr).astype(np.uint8) * 255
if a.sat:
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    mask |= ((hsv[:, :, 1] > a.sat) & (hsv[:, :, 2] < 250)).astype(np.uint8) * 255
k = np.ones((a.close, a.close), np.uint8)
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=2)
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k, iterations=1)
cnts, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
hier = hier[0]
outer_i = max([i for i in range(len(cnts)) if hier[i][3] < 0], key=lambda i: cv2.contourArea(cnts[i]))
outer = cnts[outer_i]
x, y, w, h = cv2.boundingRect(outer)
mmpp = a.len / w


def conv(c):
    eps = a.eps / mmpp
    c2 = cv2.approxPolyDP(c, eps, True)[:, 0, :].astype(float)
    pts = [[round((px - x) * mmpp, 2), round((y + h - py) * mmpp, 2)] for px, py in c2]
    return pts


holes = []
for i in range(len(cnts)):
    if hier[i][3] == outer_i and cv2.contourArea(cnts[i]) * mmpp * mmpp > 30.0:
        holes.append(conv(cnts[i]))
res = {'len_mm': a.len, 'mm_per_px': mmpp, 'height_mm': round(h * mmpp, 1), 'outer': conv(outer), 'holes': holes,
       'src': a.img, 'flip': a.flip, 'crop': a.crop, 'rot': a.rot, 'bbox_px': [int(x), int(y), int(w), int(h)]}
json.dump(res, open(a.out, 'w'))
print('outer pts', len(res['outer']), 'holes', len(holes), 'height_mm', res['height_mm'], 'mm/px', round(mmpp, 4))

if a.grid:
    pad = 40
    g = cv2.copyMakeBorder(im[y:y + h, x:x + w], pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    ov = g.copy()
    cv2.drawContours(ov, [outer - [x - pad, y - pad]], -1, (0, 0, 255), 1)
    H, W = g.shape[:2]
    for fmm in range(0, int(a.len) + 1, 10):
        px = int(pad + fmm / mmpp)
        major = fmm % 50 == 0
        cv2.line(ov, (px, 0), (px, H), (255, 120, 0) if major else (255, 210, 160), 1)
        if major:
            cv2.putText(ov, str(fmm), (px + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (200, 0, 0), 1)
    for umm in range(0, int(h * mmpp) + 1, 10):
        py = int(pad + h - umm / mmpp)
        major = umm % 50 == 0
        cv2.line(ov, (0, py), (W, py), (0, 160, 0) if major else (170, 230, 170), 1)
        if major:
            cv2.putText(ov, str(umm), (2, py - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 120, 0), 1)
    out = cv2.addWeighted(ov, 0.75, g, 0.25, 0)
    cv2.imwrite(a.grid, out)
