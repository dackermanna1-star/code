"""
Zoomed, labelled grid view of a traced reference, for reading part coordinates.
  python3 tools/assets/weapons/zoom.py ref/<id>.json f0 f1 u0 u1 out.png [--px 4] [--src image]
"""
import sys, json, argparse
import numpy as np, cv2
ap = argparse.ArgumentParser()
ap.add_argument('ref'); ap.add_argument('f0', type=float); ap.add_argument('f1', type=float)
ap.add_argument('u0', type=float); ap.add_argument('u1', type=float); ap.add_argument('out')
ap.add_argument('--px', type=float, default=4.0, help='output pixels per mm')
ap.add_argument('--src', default=None)
a = ap.parse_args()
d = json.load(open(a.ref))
raw = cv2.imread(a.src or d['src'], cv2.IMREAD_UNCHANGED)
if raw.ndim == 3 and raw.shape[2] == 4:
    al = raw[:, :, 3]; im = raw[:, :, :3].copy(); im[al < 128] = 255
else:
    im = raw if raw.ndim == 3 else cv2.cvtColor(raw, cv2.COLOR_GRAY2BGR)
if d.get('crop'):
    x0, y0, x1, y1 = map(int, d['crop'].split(',')); im = im[y0:y1, x0:x1]
if d.get('flip'): im = im[:, ::-1].copy()
if abs(d.get('rot', 0)) > 1e-6:
    h, w = im.shape[:2]; M = cv2.getRotationMatrix2D((w / 2, h / 2), d['rot'], 1.0)
    im = cv2.warpAffine(im, M, (w, h), borderValue=(255, 255, 255))
bx, by, bw, bh = d['bbox_px']; mmpp = d['mm_per_px']
# mm -> src px: px = bx + f/mmpp ; py = by + bh - u/mmpp
W = int((a.f1 - a.f0) * a.px); H = int((a.u1 - a.u0) * a.px)
s = a.px * mmpp  # output px per src px
M = np.float32([[s, 0, -(bx + a.f0 / mmpp) * s], [0, s, -(by + bh - a.u1 / mmpp) * s]])
out = cv2.warpAffine(im, M, (W, H), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))
ov = out.copy()
# silhouette
outer = np.array(d['outer']); 
pts = np.stack([(outer[:, 0] - a.f0) * a.px, (a.u1 - outer[:, 1]) * a.px], 1).astype(np.int32)
cv2.polylines(ov, [pts], True, (0, 0, 255), 1)
for f in range(int(a.f0 // 5 * 5), int(a.f1) + 1, 5):
    x = int((f - a.f0) * a.px)
    col = (255, 90, 0) if f % 50 == 0 else ((255, 170, 90) if f % 10 == 0 else (255, 225, 200))
    cv2.line(ov, (x, 0), (x, H), col, 1)
    if f % 10 == 0:
        for yy in range(14, H, 160):
            cv2.putText(ov, str(f), (x + 2, yy), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (180, 0, 0), 1)
for u in range(int(a.u0 // 5 * 5), int(a.u1) + 1, 5):
    y = int((a.u1 - u) * a.px)
    col = (0, 140, 0) if u % 50 == 0 else ((90, 200, 90) if u % 10 == 0 else (200, 240, 200))
    cv2.line(ov, (0, y), (W, y), col, 1)
    if u % 10 == 0:
        for xx in range(2, W, 220):
            cv2.putText(ov, str(u), (xx, y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 110, 0), 1)
cv2.imwrite(a.out, cv2.addWeighted(ov, 0.7, out, 0.3, 0))
print(W, H)
