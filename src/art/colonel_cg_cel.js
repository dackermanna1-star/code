// Cel kit for the Colonel's CGs: a small "toon g-buffer" in the style of the portraits (portraits_core):
// surfaces write material + surface id + height + normal per pixel; a light quantizes each pixel onto
// its material's short ramp (5–7 tones) with hard bands and ordered dither ONLY in a narrow zone at
// each band edge; selective 1-px outlines go on silhouettes and occlusion edges (dark on the shadow
// side, lighter on the lit side); painted details are tone overrides (fix) or tone shifts (off).
// The tone buffer is light-independent of colour: a grade (fluorescent, flicker-dim, mine-fire red)
// maps (material, tone) → RGB at the end, so lighting variants stay palette-bound and crisp.
import { hexToRgb, mix } from './palette.js';
import { BAYER4, hash2, makeCanvas, ctxOf } from './util.js';

export const bay = (x, y) => (BAYER4[y & 3][x & 3] + 0.5) / 16;
export const h01 = (x, y, s) => hash2(x | 0, y | 0, s) / 4294967296;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const NT = new Float32Array(65536);
for (let i = 0; i < 65536; i++) NT[i] = hash2(i & 255, i >> 8, 4471) / 4294967296;
/** Value noise, period 256 lattice cells. sc = cell size in px. */
export function vn(x, y, sc, seed = 0) {
  x /= sc; y /= sc;
  const so = Math.imul(seed | 0, 2654435761) >>> 0;
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const ix = (xi + so) & 255, iy = (yi + (so >>> 8)) & 255, ix1 = (ix + 1) & 255, iy1 = ((iy + 1) & 255) << 8, iy0 = iy << 8;
  const a = NT[iy0 + ix], b = NT[iy0 + ix1], c = NT[iy1 + ix], d = NT[iy1 + ix1];
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, y, sc, seed = 0) => vn(x, y, sc, seed) * 0.55 + vn(x, y, sc / 2.1, seed + 7) * 0.3 + vn(x, y, sc / 4.6, seed + 13) * 0.15;

// ---------------------------------------------------------------------------------------- materials
// ramp: dark → light hex (5–7). th: n-1 light-level thresholds. dith: dither half-width around each
// threshold (0 = hard). line: outline tone (null = no outline); lineLit: tone for lit-side edges.
// gap: depth step that makes an inner outline. spec: { at, w, k } a highlight on n·h (waxy sheen).
// jit: [amp, scale, amp2] noise added to the light level before banding (organic band edges).
// fold: a depth step within the same surface that still gets a line (overhanging flesh).
const MATS = [];
export function celMat(id, def) {
  const n = def.ramp.length;
  const th = def.th || Array.from({ length: n - 1 }, (_, k) => (k + 1) / n);
  MATS[id] = { dith: 0, seam: true, line: null, lineLit: null, gap: 3, spec: null, flat: 0, wrap: 0, ...def, th, n, rgb: def.ramp.map(hexToRgb) };
  return id;
}
export const celDef = (id) => MATS[id];
/** Ramp helper: n tones evenly through hex stops. */
export function stops(list, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * (list.length - 1), i = Math.min(list.length - 2, Math.floor(t));
    out.push(mix(list[i], list[i + 1], t - i));
  }
  return out;
}

// ---------------------------------------------------------------------------------------- buffer
export class Cel {
  /** w×h buffer whose pixel (0,0) sits at frame (ox, oy) — layers may be larger than the frame. */
  constructor(w, h, ox = 0, oy = 0) {
    this.w = w; this.h = h; this.ox = ox; this.oy = oy;
    const n = w * h;
    this.mat = new Uint8Array(n); this.sid = new Uint16Array(n);
    this.z = new Float32Array(n).fill(-1e9);
    this.nx = new Float32Array(n); this.ny = new Float32Array(n); this.nz = new Float32Array(n).fill(1);
    this.ao = new Float32Array(n).fill(1); this.lum = new Float32Array(n);
    this.off = new Int8Array(n); this.fix = new Int8Array(n).fill(-1);
    this.flag = new Uint8Array(n);   // 1 no outline · 2 never in cast shadow · 4 casts no shadow · 8 no spec
  }
  clone() {
    const c = new Cel(this.w, this.h, this.ox, this.oy);
    for (const k of ['mat', 'sid', 'z', 'nx', 'ny', 'nz', 'ao', 'lum', 'off', 'fix', 'flag']) c[k].set(this[k]);
    return c;
  }
  idx(x, y) { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x; }
  has(x, y) { const i = this.idx(x, y); return i >= 0 && this.mat[i] !== 0; }
  matAt(x, y) { const i = this.idx(x, y); return i < 0 ? 0 : this.mat[i]; }
  sidAt(x, y) { const i = this.idx(x, y); return i < 0 ? 0 : this.sid[i]; }
  zAt(x, y) { const i = this.idx(x, y); return i < 0 ? -1e9 : this.z[i]; }
  /** Write a pixel. o: { sid, z, n:[x,y,z], mode: 'z'|'any'|'over'|'on', tol, keepN } */
  put(x, y, mat, o = {}) {
    const i = this.idx(x, y); if (i < 0) return false;
    const m = o.mode || 'any';
    if (m === 'z' && (o.z ?? 0) < this.z[i]) return false;
    if (m === 'over' && !this.mat[i]) return false;
    if (m === 'on' && (!this.mat[i] || (o.sids && !o.sids.includes(this.sid[i])))) return false;
    this.mat[i] = mat;
    if (o.sid !== undefined) this.sid[i] = o.sid;
    if (o.z !== undefined) this.z[i] = m === 'over' || m === 'on' ? Math.max(this.z[i], o.z) : o.z;
    if (o.n) { const l = Math.hypot(o.n[0], o.n[1], o.n[2]) || 1; this.nx[i] = o.n[0] / l; this.ny[i] = o.n[1] / l; this.nz[i] = o.n[2] / l; }
    if (o.fix !== undefined) this.fix[i] = o.fix;
    if (o.off !== undefined) this.off[i] = o.off;
    if (o.flag !== undefined) this.flag[i] |= o.flag;
    return true;
  }
  /** Tone override on an existing pixel (detail painting). mats: only on these materials. */
  tone(x, y, k, mats = null, matSet = null) {
    const i = this.idx(x, y); if (i < 0 || !this.mat[i]) return;
    if (mats && !mats.includes(this.mat[i])) return;
    if (matSet) this.mat[i] = matSet;
    this.fix[i] = k;
  }
  shift(x, y, d, mats = null) {
    const i = this.idx(x, y); if (i < 0 || !this.mat[i]) return;
    if (mats && !mats.includes(this.mat[i])) return;
    this.off[i] = Math.max(-6, Math.min(6, this.off[i] + d));
  }
  /** Fill a polygon (frame coords) with a flat-normal surface. o: put options + nf(x,y)/zf(x,y). */
  poly(pts, mat, o = {}) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.max(0, Math.floor(minY - this.oy)); y <= Math.min(this.h - 1, Math.ceil(maxY - this.oy)); y++) {
      const yc = y + this.oy + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [xa, ya] = pts[i], [xb, yb] = pts[(i + 1) % pts.length];
        if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) xs.push(xa + ((yc - ya) / (yb - ya)) * (xb - xa));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.round(xs[k] - this.ox)); x < Math.min(this.w, Math.round(xs[k + 1] - this.ox)); x++) {
          const fx = x + this.ox, fy = y + this.oy;
          if (o.clip && !o.clip(fx, fy)) continue;
          this.put(fx - this.ox, fy - this.oy, mat, { ...o, n: o.nf ? o.nf(fx, fy) : o.n, z: o.zf ? o.zf(fx, fy) : o.z });
        }
      }
    }
  }
  /** Copy a finalized HField (same size & origin) in; normals from its surface. o: { sid | sidFn, matFn, mode, clip, zoff } */
  fromHF(hf, o = {}) {
    const w = hf.w, h = hf.h, z = hf.z, dx = o.dx || 0, dy = o.dy || 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, zc = z[i]; if (zc < -1e8) continue;
      const cx = x + dx, cy = y + dy; if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) continue;
      const ci = cy * this.w + cx;
      if (o.clip && !o.clip(cx + this.ox, cy + this.oy)) continue;
      const g = (j, ok) => (ok && z[j] > -1e8 ? z[j] : zc);
      const zl = g(i - 1, x > 0), zr = g(i + 1, x < w - 1), zu = g(i - w, y > 0), zd = g(i + w, y < h - 1);
      let gx = (zr - zl) * 0.5, gy = (zd - zu) * 0.5;
      if (x > 0 && z[i - 1] < -1e8) gx = Math.max(gx, 1.5); if (x < w - 1 && z[i + 1] < -1e8) gx = Math.min(gx, -1.5);
      if (y > 0 && z[i - w] < -1e8) gy = Math.max(gy, 1.5); if (y < h - 1 && z[i + w] < -1e8) gy = Math.min(gy, -1.5);
      const mat = o.matFn ? o.matFn(cx + this.ox, cy + this.oy, hf.mat[i]) : hf.mat[i];
      if (!mat) continue;
      const zz = zc + (o.zoff || 0);
      if ((o.mode || 'z') === 'z' && zz < this.z[ci]) continue;
      this.mat[ci] = mat;
      this.sid[ci] = o.sidFn ? o.sidFn(cx + this.ox, cy + this.oy, hf.mat[i]) : (o.sid ?? 1);
      this.z[ci] = zz;
      const l = Math.hypot(gx, gy, 1);
      this.nx[ci] = -gx / l; this.ny[ci] = -gy / l; this.nz[ci] = 1 / l;
      this.fix[ci] = -1; this.off[ci] = 0; this.lum[ci] = 0; this.ao[ci] = 1; this.flag[ci] = o.flag || 0;
    }
  }
  /** Screen-space cavity AO from the height buffer (contact shadows, finger gaps). */
  cavity(r = 4, k = 0.06, cap = 0.5, mats = null) {
    const { w, h, z, mat, ao } = this, out = new Float32Array(w * h).fill(1);
    const offs = [], dist = [];
    for (const rr of [r * 0.5, r]) for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      offs.push([Math.round(ux * rr), Math.round(uy * rr)]); dist.push(rr);
    }
    const n = offs.length, ox = new Int32Array(n), oy = new Int32Array(n), od = new Float32Array(n);
    offs.forEach(([a, b], q) => { ox[q] = a; oy[q] = b; od[q] = dist[q]; });
    const m0 = Math.ceil(r);
    for (let y = m0; y < h - m0; y++) for (let x = m0; x < w - m0; x++) {
      const i = y * w + x; if (!mat[i] || (mats && !mats.includes(mat[i]))) continue;
      const zi = z[i] + 0.5;
      let s = 0;
      for (let q = 0; q < n; q++) {
        const j = i + oy[q] * w + ox[q];
        const dz = z[j] - zi;
        if (dz > 0 && mat[j]) s += (dz < od[q] * 2 ? dz : od[q] * 2) / od[q];
      }
      if (s > 0) out[i] = Math.max(1 - cap, 1 - s * k);
    }
    for (let i = 0; i < w * h; i++) ao[i] *= out[i];
  }
  /** Stroke a polyline/curve through pts calling fn(x, y, t) once per pixel (frame coords). */
  stroke(pts, fn) {
    let lx = null, ly = null, total = 0;
    const segs = [];
    for (let k = 0; k + 1 < pts.length; k++) { const L = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); segs.push(L); total += L; }
    let acc = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1], n = Math.max(1, Math.ceil(segs[k] * 2));
      for (let j = 0; j <= n; j++) {
        const u = j / n, x = Math.round(ax + (bx - ax) * u), y = Math.round(ay + (by - ay) * u);
        if (x === lx && y === ly) continue;
        lx = x; ly = y; fn(x, y, total ? (acc + segs[k] * u) / total : 0);
      }
      acc += segs[k];
    }
  }
}
/** Point-in-polygon (even-odd) and distance to a polygon's edge. */
export function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function polyDist(pts, x, y) {
  let d = 1e9;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ax = pts[j][0], ay = pts[j][1], dx = pts[i][0] - ax, dy = pts[i][1] - ay, L2 = dx * dx + dy * dy || 1e-9;
    let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - dx * t, ey = y - ay - dy * t, q = ex * ex + ey * ey;
    if (q < d) d = q;
  }
  return Math.sqrt(d);
}
/**
 * A soft volume with a clean silhouette: fill a polygon (frame coords) with a dome whose height rises
 * with the distance from its edge (z + hgt·√(d/R)); normals from that surface, plus an optional tilt.
 * o: { R, hgt, z, sid, tilt: [tx, ty], mode ('z' | 'any'), off, clip(x, y), zf(x, y, d) }
 */
export function domePoly(cel, pts, mat, o = {}) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1; x1 = Math.ceil(x1) + 1; y1 = Math.ceil(y1) + 1;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, zb = new Float32Array(w * h).fill(-1e9);
  const R = o.R ?? 8, hgt = o.hgt ?? R, z0 = o.z ?? 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x0 + x + 0.5, fy = y0 + y + 0.5;
    if (!inPoly(pts, fx, fy) || (o.clip && !o.clip(x0 + x, y0 + y))) continue;
    const d = polyDist(pts, fx, fy);
    zb[y * w + x] = o.zf ? o.zf(x0 + x, y0 + y, d) : z0 + hgt * Math.sqrt(Math.min(d, R) / R);
  }
  const [tx, ty] = o.tilt || [0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, z = zb[i]; if (z < -1e8) continue;
    const g = (j, ok) => (ok && zb[j] > -1e8 ? zb[j] : z - hgt * 0.35);
    const gx = (g(i + 1, x < w - 1) - g(i - 1, x > 0)) * 0.5, gy = (g(i + w, y < h - 1) - g(i - w, y > 0)) * 0.5;
    cel.put(x0 + x - cel.ox, y0 + y - cel.oy, mat, { z, n: [-gx + tx, -gy + ty, 1], sid: o.sid ?? 1, fix: -1, off: o.off ?? 0, mode: o.mode || 'z' });
  }
}

/** Quadratic bezier → points. */
export function quad(a, b, c, n = 12) {
  const o = [];
  for (let i = 0; i <= n; i++) { const t = i / n, q = 1 - t; o.push([q * q * a[0] + 2 * q * t * b[0] + t * t * c[0], q * q * a[1] + 2 * q * t * b[1] + t * t * c[1]]); }
  return o;
}

// ---------------------------------------------------------------------------------------- lighting
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** Light: { L (toward light), amb, key, shadow 0..1, steps, falloff(fx, fy), spec, rim:[x,y,k] } */
export function light(def) { return { amb: 0.2, key: 0.8, shadow: 0.8, steps: 48, spec: 1, ...def, L: norm3(def.L) }; }

/**
 * Light → level buffer (Float32) for every surface pixel. Shadow marching is screen-space over z
 * (frame px up = +z). opts: { noCast, steps, rect: [x0, y0, x1, y1] (buffer px, limits the work) }.
 */
export function lightCel(cel, lt, opts = {}) {
  const { w, h, mat, nx, ny, nz, z, ao, flag, lum } = cel;
  const lev = new Float32Array(w * h);
  const L = lt.L, H = norm3([L[0], L[1], L[2] + 1]);
  const lxy = Math.hypot(L[0], L[1]), sx = L[0] / (lxy || 1), sy = L[1] / (lxy || 1), sz = L[2] / (lxy || 1);
  const steps = opts.noCast ? 0 : (opts.steps ?? lt.steps);
  const [rx0, ry0, rx1, ry1] = opts.rect || [0, 0, w, h];
  // the march only matters where a ray can reach something raised: bound the casters once
  let zmax = -1e9, bx0 = w, by0 = h, bx1 = -1, by1 = -1;
  if (steps) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mat[i] || (flag[i] & 4)) continue;
    const zi = z[i]; if (zi > zmax) zmax = zi;
    if (zi > (opts.casterZ ?? 1.5)) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  }
  const reach = (x, y) => {
    const ex = x + sx * steps, ey = y + sy * steps;
    return !(Math.max(x, ex) < bx0 || Math.min(x, ex) > bx1 || Math.max(y, ey) < by0 || Math.min(y, ey) > by1);
  };
  for (let y = Math.max(0, ry0); y < Math.min(h, ry1); y++) for (let x = Math.max(0, rx0); x < Math.min(w, rx1); x++) {
    const i = y * w + x, m = mat[i]; if (!m) continue;
    const M = MATS[m];
    let ndl = nx[i] * L[0] + ny[i] * L[1] + nz[i] * L[2];
    if (M.flat) ndl = lerp(ndl, 0.8, M.flat);
    ndl = (ndl + M.wrap) / (1 + M.wrap);
    let key = lt.key * Math.max(0, ndl);
    const fx = x + cel.ox, fy = y + cel.oy;
    const fo = lt.falloff ? lt.falloff(fx, fy) : 1;
    // cast shadow (hard, with a 1–2 px soft edge)
    let sh = 0;
    if (steps && !(flag[i] & 2) && lxy > 0.05 && bx1 >= 0 && reach(x, y)) {
      const z0 = z[i];
      for (let k = 2; k <= steps; k += k < 10 ? 1 : 2) {
        if (z0 + sz * k > zmax + 1) break;
        const ax = Math.round(x + sx * k), ay = Math.round(y + sy * k);
        if (ax < 0 || ay < 0 || ax >= w || ay >= h) break;
        const j = ay * w + ax;
        if (!mat[j] || (flag[j] & 4)) continue;
        const over = z[j] - (z0 + sz * k) - 1.2;
        if (over > 0) { sh = Math.max(sh, clamp(over / 2.5)); if (sh >= 1) break; }
      }
    }
    key *= 1 - lt.shadow * sh;
    let l = lt.amb * ao[i] + key * (0.4 + 0.6 * ao[i]);
    if (M.spec && !(flag[i] & 8)) {
      const nh = nx[i] * H[0] + ny[i] * H[1] + nz[i] * H[2];
      l += M.spec.k * lt.spec * clamp((nh - M.spec.at) / M.spec.w) * (1 - sh) * ao[i];
    }
    if (lt.rim) { const e = Math.max(0, nx[i] * lt.rim[0] + ny[i] * lt.rim[1]) * (1 - nz[i]); l += e * lt.rim[2]; }
    lev[i] = l * fo + lum[i];
  }
  return lev;
}

/**
 * Levels → tones: hard bands per material (th), painted overrides (fix) and shifts (off), and the
 * 1-px seam dither where a band meets the next darker one. opts.levFn(i, x, y, l) remaps a level
 * (cheap relighting, e.g. a dimmer flashlight); opts.rect limits the work.
 */
export function quantize(cel, lev, opts = {}) {
  const { w, h, mat, sid, off, fix } = cel;
  const tone = new Int8Array(w * h).fill(-1), base = new Int8Array(w * h).fill(-1);
  const [rx0, ry0, rx1, ry1] = opts.rect || [0, 0, w, h];
  let L2 = lev;
  if (opts.levFn) { L2 = new Float32Array(w * h); for (let y = Math.max(0, ry0); y < Math.min(h, ry1); y++) for (let x = Math.max(0, rx0); x < Math.min(w, rx1); x++) { const i = y * w + x; if (mat[i]) L2[i] = opts.levFn(i, x, y, lev[i]); } }
  // materials with `smooth: r` get their light level averaged over their own surface first (clean,
  // straight band edges instead of staircases from small normal wobbles)
  const LS = smoothLev(cel, L2, [rx0, ry0, rx1, ry1]);
  for (let y = Math.max(0, ry0); y < Math.min(h, ry1); y++) for (let x = Math.max(0, rx0); x < Math.min(w, rx1); x++) {
    const i = y * w + x, m = mat[i]; if (!m) continue;
    const M = MATS[m];
    let l = LS[i];
    if (M.jit) l += (vn(x + cel.ox, y + cel.oy, M.jit[1], m) - 0.5) * M.jit[0] + (M.jit[2] ? (vn(x + cel.ox, y + cel.oy, M.jit[1] * 0.37, m + 9) - 0.5) * M.jit[2] : 0);
    if (M.grain) { const gx = x + cel.ox, gy = y + cel.oy; l += ((vn(gx * 0.08, gy * 1.1, 1, 61) - 0.5) * 0.7 + (vn(gx * 0.25, gy * 2.2, 1, 67) - 0.5) * 0.3) * M.grain * 2 * l; }   // streaks along the grain
    if (fix[i] >= 0) continue;
    const th = M.th, d = M.dith ? (bay(x + cel.ox, y + cel.oy) - 0.5) * 2 * M.dith : 0;
    let k = 0; while (k < th.length && l + d >= th[k]) k++;
    base[i] = k;
  }
  // `clean` materials: a lone pixel whose band disagrees with 3+ of its 4 neighbours joins them
  for (let pass = 0; pass < 2; pass++) for (let y = Math.max(1, ry0); y < Math.min(h - 1, ry1); y++) for (let x = Math.max(1, rx0); x < Math.min(w - 1, rx1); x++) {
    const i = y * w + x, m = mat[i]; if (!m || base[i] < 0 || !MATS[m].clean) continue;
    let t0 = -9, c0 = 0, t1 = -9, c1 = 0;
    for (const j of [i - 1, i + 1, i - w, i + w]) {
      if (mat[j] !== m || sid[j] !== sid[i] || base[j] < 0) continue;
      const b = base[j];
      if (b === t0) c0++; else if (b === t1) c1++; else if (t0 === -9) { t0 = b; c0 = 1; } else if (t1 === -9) { t1 = b; c1 = 1; }
    }
    if (c0 >= 3 && t0 !== base[i]) base[i] = t0; else if (c1 >= 3 && t1 !== base[i]) base[i] = t1;
  }
  for (let y = Math.max(0, ry0); y < Math.min(h, ry1); y++) for (let x = Math.max(0, rx0); x < Math.min(w, rx1); x++) {
    const i = y * w + x, m = mat[i]; if (!m) continue;
    const M = MATS[m];
    const k = fix[i] >= 0 ? fix[i] : base[i] + off[i];
    tone[i] = k < 0 ? 0 : k >= M.n ? M.n - 1 : k;
  }
  if (!opts.noSeam) {
    for (let y = Math.max(1, ry0); y < Math.min(h - 1, ry1); y++) for (let x = Math.max(1, rx0); x < Math.min(w - 1, rx1); x++) {
      const i = y * w + x, m = mat[i]; if (!m || fix[i] >= 0 || !MATS[m].seam) continue;
      if (((x + cel.ox + y + cel.oy) & 1) === 0) continue;
      const k = base[i];
      for (const j of [i + 1, i + w, i - 1, i - w]) {
        if (base[j] < 0 || mat[j] !== m || sid[j] !== sid[i]) continue;
        if (base[j] === k - 1) { tone[i] = Math.max(0, tone[i] - 1); break; }
      }
    }
  }
  return { tone, lev: L2 };
}

/** Average the light level over each `smooth` material's own surface (same sid, same smoothing group). */
export function smoothLev(cel, lev, rect = null) {
  const { w, h, mat, sid } = cel;
  const [rx0, ry0, rx1, ry1] = rect || [0, 0, w, h];
  let any = false;
  for (let m = 1; m < MATS.length; m++) if (MATS[m]?.smooth) { any = true; break; }
  if (!any) return lev;
  const out = Float32Array.from(lev);
  for (let y = Math.max(0, ry0); y < Math.min(h, ry1); y++) for (let x = Math.max(0, rx0); x < Math.min(w, rx1); x++) {
    const i = y * w + x, m = mat[i]; if (!m) continue;
    const M = MATS[m], r = M.smooth | 0; if (!r) continue;
    const g = M.sgroup ?? m, si = sid[i];
    let s = 0, n = 0;
    for (let dy = -r; dy <= r; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= w) continue;
        const j = yy * w + xx, mj = mat[j];
        if (!mj || sid[j] !== si) continue;
        const Mj = MATS[mj]; if ((Mj.sgroup ?? mj) !== g) continue;
        const wt = (r + 1 - Math.abs(dx)) * (r + 1 - Math.abs(dy));
        s += lev[j] * wt; n += wt;
      }
    }
    out[i] = n ? s / n : lev[i];
  }
  return out;
}

/** Light → { tone, lev } (lightCel + quantize). */
export function shadeCel(cel, lt, opts = {}) {
  return quantize(cel, lightCel(cel, lt, opts), opts);
}

/** Copy a colonel_gbuf GBuf into a Cel. map[gbMat] = { mat, sid }; lum becomes tone shifts. */
export function celFromGB(gb, map, o = {}) {
  const cel = o.into || new Cel(gb.w, gb.h);
  for (let i = 0; i < gb.w * gb.h; i++) {
    const m = gb.mat[i]; if (!m) continue;
    const c = map[m]; if (!c) continue;
    cel.mat[i] = c.mat; cel.sid[i] = c.sid ?? 1; cel.z[i] = gb.z[i];
    cel.nx[i] = gb.nx[i]; cel.ny[i] = gb.ny[i]; cel.nz[i] = gb.nz[i]; cel.ao[i] = gb.ao[i];
    const l = gb.lum[i];
    cel.off[i] = l > 0.6 ? 2 : l > 0.2 ? 1 : l < -0.3 ? -2 : l < -0.08 ? -1 : 0;
    cel.fix[i] = -1; cel.lum[i] = 0;
  }
  return cel;
}

/** Selective outlines in place: silhouettes (empty or lower-by-gap neighbours of another surface). */
export function outline(cel, sh, opts = {}) {
  const { w, h, mat, sid, z, flag } = cel, { tone, lev } = sh;
  const out = tone.slice();
  const litT = opts.lit ?? 0.62;
  const [rx0, ry0, rx1, ry1] = opts.rect || [0, 0, w, h];
  for (let y = Math.max(0, ry0); y < Math.min(h, ry1); y++) for (let x = Math.max(0, rx0); x < Math.min(w, rx1); x++) {
    const i = y * w + x, m = mat[i]; if (!m || (flag[i] & 1)) continue;
    const M = MATS[m]; if (M.line == null) continue;
    let edge = false;
    for (const [ax, ay] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
      const j = ay * w + ax;
      if (!mat[j]) { if (opts.empty !== false) edge = true; continue; }
      if ((sid[j] !== sid[i] && z[j] < z[i] - M.gap) || (M.fold && z[j] < z[i] - M.fold)) edge = true;
    }
    if (!edge) continue;
    const lit = lev[i] > litT;
    out[i] = Math.min(tone[i], lit && M.lineLit != null ? M.lineLit : M.line);
  }
  // stair-step cleanup: a line pixel that only fills the inner corner of a diagonal step goes one lighter
  const isL = (i) => out[i] < tone[i];
  for (let y = Math.max(1, ry0); y < Math.min(h - 1, ry1); y++) for (let x = Math.max(1, rx0); x < Math.min(w - 1, rx1); x++) {
    const i = y * w + x; if (!isL(i)) continue;
    for (const [hx, vy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const a = i + hx, b = i + vy * w, c = i + hx + vy * w;
      if (isL(a) && isL(b) && sid[c] !== sid[i]) { out[i] = Math.min(tone[i], out[i] + 1); break; }
    }
  }
  sh.tone = out;
  return sh;
}

// ---------------------------------------------------------------------------------------- colour
/**
 * A grade turns (material, tone) into RGB. g: { lit, dark (hex tints), litGain, darkGain, desat, crush,
 * abyss, shift (tone shift, e.g. -1 for a flicker dip) }. null → raw ramps.
 */
export function gradeLUT(g, maxId = 255) {
  const lut = [];
  for (let id = 1; id <= maxId; id++) {
    const M = MATS[id]; if (!M) continue;
    lut[id] = new Uint32Array(M.n);
    for (let k = 0; k < M.n; k++) {
      const kk = clamp(k + (g?.shift || 0), 0, M.n - 1);
      let [r, gg, b] = M.rgb[kk];
      if (g) {
        const lum = 0.3 * r + 0.59 * gg + 0.11 * b, ds = g.desat || 0;
        r = lum + (r - lum) * (1 - ds); gg = lum + (gg - lum) * (1 - ds); b = lum + (b - lum) * (1 - ds);
        const t = M.n > 1 ? kk / (M.n - 1) : 1, w = t * t * (3 - 2 * t);
        const Lc = hexToRgb(g.lit || '#ffffff'), Dc = hexToRgb(g.dark || '#ffffff');
        const lg = g.litGain ?? 1, dg = g.darkGain ?? 1;
        r *= lerp(Dc[0] / 255 * dg, Lc[0] / 255 * lg, w); gg *= lerp(Dc[1] / 255 * dg, Lc[1] / 255 * lg, w); b *= lerp(Dc[2] / 255 * dg, Lc[2] / 255 * lg, w);
        if (g.crush && kk <= 1) { const A = hexToRgb(g.abyss || '#000000'), q = g.crush * (kk === 0 ? 1 : 0.5); r = lerp(r, A[0], q); gg = lerp(gg, A[1], q); b = lerp(b, A[2], q); }
      }
      r = clamp(Math.round(r), 0, 255); gg = clamp(Math.round(gg), 0, 255); b = clamp(Math.round(b), 0, 255);
      lut[id][k] = ((255 << 24) | (b << 16) | (gg << 8) | r) >>> 0;
    }
  }
  return lut;
}
/** Pack (mat, tone) per pixel: (mat << 8) | tone, 0 = empty. */
export function packTones(cel, tone) {
  const n = cel.w * cel.h, p = new Uint16Array(n);
  for (let i = 0; i < n; i++) if (cel.mat[i] && tone[i] >= 0) p[i] = (cel.mat[i] << 8) | tone[i];
  return p;
}
/** Packed tones → canvas through a LUT. */
export function packedToCanvas(p, w, h, lut, into = null) {
  const c = into || makeCanvas(w, h), x = ctxOf(c);
  const img = x.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  for (let i = 0; i < w * h; i++) { const v = p[i]; if (v) d[i] = lut[v >> 8][v & 255]; }
  x.putImageData(img, 0, 0);
  return c;
}
export { mix };
