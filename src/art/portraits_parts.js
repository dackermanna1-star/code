// Reusable portrait parts: hair locks & strands, hair volume, clothing detail helpers, palette transforms.
import { PAL, mix } from './palette.js';
import { spline, PW, PH } from './portraits_core.js';
import { hash2 } from './util.js';

/** Hair volume height function (head space): sphere around the skull plus an offset layer. */
export const hairVol = (cx, cy, R, off) => (hx, hy) => {
  const d2 = R * R - (hx - cx) ** 2 - (hy - cy) ** 2;
  return (d2 > 0 ? Math.sqrt(d2) : 0) + off;
};

/** A hair lock along a cubic Bezier (head space). */
export function L(rig, sids, spine, w0, wMid, w1, o = {}) {
  const zfn = o.z || (() => 0);
  const sid = rig.lock(spine, {
    w0, wMid, w1, depth: o.depth ?? 2.6, mat: o.mat || 'hair', strands: o.strands || 0, strandDepth: o.strandDepth,
    z: (x, y) => zfn(...rig.toH(x, y)), clip: o.clip, poly: o.poly, n: o.n,
  });
  sids?.hair?.add(sid);
  return sid;
}

/**
 * A loose 1-px strand (head space spline). off = tone offset. onSurface=false lets it fly past the
 * silhouette (flyaways): empty pixels get hair height so they shade like hair.
 */
export function strand(rig, ptsH, mat, off = 0, onSurface = true) {
  const pts = spline(ptsH, { seg: 6 });
  const id = rig.m(mat);
  const sid = rig.newSid();
  rig.strokeH(pts, (t, x, y, i) => {
    if (!rig.mat[i]) {
      if (onSurface) return null;
      rig.sid[i] = sid; rig.z[i] = 20; rig.flag[i] = 1; rig.spec[i] = 0;
    }
    return [id, off];
  }, { requireMat: false });
}

/** Smooth value noise in [0,1] (deterministic). */
export function valueNoise(x, y, scale, seed = 0) {
  const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const h = (a, b) => (hash2(a, b, seed) % 1024) / 1023;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * sx, b = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * sx;
  return a + (b - a) * sy;
}

/** Offset a polygon edge chain inward by d (approx. miter), returns new points. */
export function inset(pts, d) {
  const n = pts.length;
  let cx = 0, cy = 0; for (const [x, y] of pts) { cx += x; cy += y; } cx /= n; cy /= n;
  // orientation
  let area = 0; for (let i = 0; i < n; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n]; area += x0 * y1 - x1 * y0; }
  const sgn = area > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const n1 = norm([-(p[1] - a[1]) * sgn, (p[0] - a[0]) * sgn]), n2 = norm([-(b[1] - p[1]) * sgn, (b[0] - p[0]) * sgn]);
    const nn = norm([n1[0] + n2[0], n1[1] + n2[1]]);
    return [p[0] - nn[0] * d, p[1] - nn[1] * d];
  });
}
const norm = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

/** Dotted stitch line along head-space points, only on the given materials. */
export function stitch(rig, pts, on, { mat = 'stitch', every = 2, phase = 0, off = 0 } = {}) {
  rig.strokeH(spline(pts, { seg: 4 }), (t, x, y, i) => (((x + y + phase) % every) === 0 ? [mat, off] : null), { onlyMat: on });
}
/** A worn ridge: lighten pixels along a line. */
export function wear(rig, pts, on, off = 1) {
  rig.strokeH(spline(pts, { seg: 4 }), (t, x, y, i) => [rig.mat[i], off], { onlyMat: on });
}

/** Trucker-jacket details for Tess: topstitching, yoke seams, buttons, pocket flaps, worn collar edges. */
export function denimDetails(rig, { nearCollar, farCollar, s }) {
  const on = ['denim'];
  // collar topstitching (just inside the outer edges)
  const nc = inset(nearCollar, 1.6), fc = inset(farCollar, 1.4);
  stitch(rig, [nc[1], nc[2], nc[3], nc[4], nc[5]], on, { every: 3 });
  stitch(rig, [fc[1], fc[2], fc[3], fc[4]], on, { every: 3 });
  // worn collar fold edges
  wear(rig, [[29, s(85, 0.5)], [23.5, s(89, 0.7)], [18.8, s(93.5, 0.9)]], on, 1);
  wear(rig, [[61, s(85.5, 0.5)], [66, s(88.5, 0.7)], [70.5, s(92, 0.9)]], on, 1);
  // pointed yoke seams with stitching
  const yokeN = [[4, s(103, 0.8)], [14, 105.5], [23, 108.5], [31, 106.5], [37.5, 105]];
  const yokeF = [[62, 104.5], [69, 106.5], [76, 105], [86, 102.5], [96, s(100, 0.8)]];
  rig.strokeH(spline(yokeN, { seg: 4 }), (t, x, y, i) => [rig.mat[i], -1], { onlyMat: on });
  rig.strokeH(spline(yokeF, { seg: 4 }), (t, x, y, i) => [rig.mat[i], -1], { onlyMat: on });
  stitch(rig, yokeN.map(([x, y]) => [x, y + 1.6]), on, { every: 3 });
  stitch(rig, yokeF.map(([x, y]) => [x, y + 1.6]), on, { every: 3 });
  // chest pocket flaps (pointed) — mostly cut off by the frame
  const flapN = [[13, 113], [28, 113], [27, 116], [20.5, 118.5], [14, 116]];
  const flapF = [[66, 112], [78, 112], [77.5, 115], [72, 117], [66.5, 115]];
  for (const f of [flapN, flapF]) rig.strokeH([...f, f[0]], (t, x, y, i) => [rig.mat[i], -1], { onlyMat: on });
  // copper buttons: pocket flaps + placket
  for (const [bx, by] of [[20.5, 115.5], [72, 114.5], [39.2, 114]]) {
    rig.dotH(bx, by, 'button', 0); rig.dotH(bx + 1, by, 'button', -1); rig.dotH(bx, by - 1, 'button', 1); rig.dotH(bx + 1, by - 1, 'button', 0);
    rig.dotH(bx, by + 1, 'denim', -2); rig.dotH(bx + 1, by + 1, 'denim', -2);
  }
}

/** Entranced ("enrolled") skin: pale, grey, a breath of husk amber in the lights. */
export function enrolledSkin(ramp, k = 1) {
  return ramp.map((c, i) => mix(c, mix(mix(c, '#b9b5ae', 0.42), PAL.amber_ll, i >= 3 ? 0.1 : 0.04), k));
}
/** Dark-skin variant: entranced reads as ashen, greyed, a breath of amber. */
export function enrolledDarkSkin(ramp, k = 1) {
  return ramp.map((c, i) => mix(c, mix(mix(c, '#7a726c', 0.38), PAL.amber_l, i >= 3 ? 0.08 : 0.03), k));
}
export { PW, PH };
