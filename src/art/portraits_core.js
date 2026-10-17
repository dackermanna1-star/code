// Portrait renderer core — a tiny 2.5D pixel painter used by every character rig (portraits_*.js).
//
// Shapes write material / surface id / height into per-pixel buffers in painter's order; details (eyes,
// brows, lines, freckles) write material + tone offsets on top without touching height. Lighting turns the
// height buffer into normals, ambient occlusion and cast shadows, then quantises each pixel into its
// material's 6-step ramp with ordered (Bayer) dithering at band edges. Every light mode is therefore a band
// remap of the SAME drawing — expressions and lights can never drift apart.
//
// Ramp index convention: 0 line/outline · 1 deep shadow · 2 shadow · 3 base · 4 light · 5 highlight.

import { PAL, mix, hexToRgb } from './palette.js';
import { makeCanvas, ctxOf, BAYER4 } from './util.js';

export const PW = 96, PH = 120, PN = PW * PH;
export const bay = (x, y) => (BAYER4[y & 3][x & 3] + 0.5) / 16;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ---- materials ---------------------------------------------------------------------------------
/**
 * ramp: 6 hex colours (index 0..5). tone: lighting levels where the index steps 1→2, 2→3, 3→4, 4→5.
 * line: draw silhouette outline; inner: draw occlusion edges against things behind it.
 * spec: hair-sheen strength (uses the per-pixel `spec` centrality written by lock shapes).
 */
export function material(name, ramp, o = {}) {
  return {
    name, ramp,
    tone: o.tone || [0.2, 0.42, 0.68, 0.95],
    dither: o.dither ?? 0.035,
    ditherT: o.ditherT || null,        // optional per-threshold dither widths (soft terminator, crisp elsewhere)
    line: o.line ?? true, inner: o.inner ?? true,
    lineIdx: o.lineIdx ?? 0,           // index used for outlines in shadow (lit side uses +1)
    spec: o.spec || 0, specAt: o.specAt ?? 0.93, specW: o.specW ?? 0.07,
    flat: o.flat || 0,                 // 0..1: how much the material ignores directional light (glassy, emissive)
    min: o.min ?? 0,                   // lowest index lighting may push it to (before offsets)
    gloss: o.gloss || 0, glossAt: o.glossAt ?? 0.95, glossW: o.glossW ?? 0.05, // satin / plastic / glass sheen
  };
}
/** Build a 6-step ramp from a dark→light list of anchor colours (any length ≥ 2), hue-shift friendly. */
export function rampFrom(anchors) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const t = (i / 5) * (anchors.length - 1);
    const k = Math.min(anchors.length - 2, Math.floor(t));
    out.push(mix(anchors[k], anchors[k + 1], t - k));
  }
  return out;
}

// ---- geometry helpers --------------------------------------------------------------------------
/** Catmull-Rom spline through pts (open or closed) → dense polyline. */
export function spline(pts, { closed = false, seg = 6 } = {}) {
  const n = pts.length, out = [];
  const P = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(pts[n - 1].slice());
  return out;
}
/** Cubic Bezier → polyline. */
export function bezier(p0, p1, p2, p3, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}
function bboxOf(pts, pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [Math.floor(x0 - pad), Math.floor(y0 - pad), Math.ceil(x1 + pad), Math.ceil(y1 + pad)];
}
function polyTest(pts) {
  const n = pts.length;
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}
/** Distance from (x,y) to a polyline + param t (0..1 along length) + side sign. */
function polyNearest(pl, cum, total, x, y) {
  let best = Infinity, bt = 0, side = 1;
  for (let i = 0; i < pl.length - 1; i++) {
    const ax = pl[i][0], ay = pl[i][1], bx = pl[i + 1][0], by = pl[i + 1][1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
    let t = ((x - ax) * dx + (y - ay) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t - x, py = ay + dy * t - y, d2 = px * px + py * py;
    if (d2 < best) { best = d2; bt = (cum[i] + t * Math.sqrt(L2)) / total; side = dx * (y - ay) - dy * (x - ax) >= 0 ? 1 : -1; }
  }
  return [Math.sqrt(best), bt, side];
}
function cumLen(pl) {
  const cum = [0];
  for (let i = 1; i < pl.length; i++) cum.push(cum[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
  return cum;
}
// neighbour offsets sorted by distance (for rim distance search)
const OFFS = [];
for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
  const d = Math.hypot(dx, dy); if (d > 0 && d <= 12.5) OFFS.push([dx, dy, d]);
}
OFFS.sort((a, b) => a[2] - b[2]);
const pill = (t) => { t = clamp(t, 0, 1); return Math.sqrt(1 - (1 - t) * (1 - t)); };

// ---- the rig buffer ------------------------------------------------------------------------------
export class Rig {
  constructor(mats) {
    this.mats = [null]; this.mid = Object.create(null);
    for (const m of mats) this.addMat(m);
    this.mat = new Uint8Array(PN); this.sid = new Uint16Array(PN); this.z = new Float32Array(PN);
    this.off = new Int8Array(PN); this.fix = new Int8Array(PN).fill(-1); this.spec = new Float32Array(PN);
    this.flag = new Uint8Array(PN); // 1 = no outline, 2 = no cast-shadow receive, 4 = emissive-ish
    this.nsid = 1;
    this.pose(0, 0, 0);
  }
  addMat(m) { if (this.mid[m.name]) { this.mats[this.mid[m.name]] = m; return; } this.mid[m.name] = this.mats.length; this.mats.push(m); }
  m(name) { const id = this.mid[name]; if (!id) throw new Error('portrait: unknown material ' + name); return id; }
  newSid() { return this.nsid++; }

  /** Head pose: rotate by tilt (rad, + = clockwise) about pivot, then translate. */
  pose(tilt = 0, dx = 0, dy = 0, px = 48, py = 96) { this.T = { c: Math.cos(tilt), s: Math.sin(tilt), px, py, dx, dy }; }
  ident() { const t = this.T; this.pose(0, 0, 0); return t; }
  restore(t) { this.T = t; }
  toC(hx, hy) { const { c, s, px, py, dx, dy } = this.T; const x = hx - px, y = hy - py; return [px + c * x - s * y + dx, py + s * x + c * y + dy]; }
  toH(cx, cy) { const { c, s, px, py, dx, dy } = this.T; const x = cx - px - dx, y = cy - py - dy; return [px + c * x + s * y, py - s * x + c * y]; }
  ptsC(pts) { return pts.map(([x, y]) => this.toC(x, y)); }

  /**
   * Rasterise a shape in canvas space. inside(x,y) and zf(x,y) take canvas pixel centres.
   * o: { mat, sid?, rim, rimDepth, spec, off, flag, clip(i)→bool, zAdd }
   */
  fillC(bb, inside, zf, o) {
    const R = o.rim || 0, pad = Math.ceil(R) + 1;
    const x0 = bb[0] - pad, y0 = bb[1] - pad, x1 = bb[2] + pad, y1 = bb[3] + pad;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x0 + x + 0.5, y0 + y + 0.5)) mask[y * w + x] = 1;
    const mat = typeof o.mat === 'number' ? o.mat : this.m(o.mat);
    const sid = o.sid || this.newSid();
    const edgeOpen = o.edgeOpen || 0; // treat canvas-outside as inside (no rim at frame cuts)
    for (let y = 0; y < h; y++) {
      const cy = y0 + y; if (cy < 0 || cy >= PH) continue;
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        const cx = x0 + x; if (cx < 0 || cx >= PW) continue;
        const i = cy * PW + cx;
        if (o.clip && !o.clip(i, cx, cy)) continue;
        let d = R;
        if (R) {
          for (const [ox, oy, od] of OFFS) {
            if (od >= R) break;
            const xx = x + ox, yy = y + oy;
            const gx = cx + ox, gy = cy + oy;
            let out;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) out = true; else out = !mask[yy * w + xx];
            if (out && edgeOpen && (gx < 0 || gx >= PW || gy >= PH)) out = false;
            if (out) { d = od - 0.5; break; }
          }
        }
        let z = zf(cx + 0.5, cy + 0.5);
        if (R) z += (o.rimDepth ?? R) * (pill(d / R) - 1);
        this.mat[i] = mat; this.sid[i] = sid; this.z[i] = z + (o.zAdd || 0);
        this.off[i] = o.off || 0; this.fix[i] = -1; this.spec[i] = o.spec ? o.spec(cx, cy) : 0; this.flag[i] = o.flag || 0;
      }
    }
    return sid;
  }
  /** Polygon (head-space points, smoothed if o.smooth) with pillow rim. zf in canvas space or a number. */
  poly(ptsH, o) {
    let pts = o.smooth ? spline(ptsH, { closed: true, seg: o.seg || 5 }) : ptsH;
    pts = this.ptsC(pts);
    const test = polyTest(pts);
    const zf = typeof o.z === 'function' ? o.z : () => o.z || 0;
    return this.fillC(bboxOf(pts, 1), test, zf, o);
  }
  /** Ellipse in head space (axis aligned in head space). */
  ellipse(cx, cy, rx, ry, o) {
    const pts = [];
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return this.poly(pts, o);
  }
  /**
   * Hair lock / tapered tube along a head-space spine.
   * o: { w0, w1, wMid, depth, z (fn canvas → base height) , mat, strands, rough }
   */
  lock(spineH, o) {
    const pl = this.ptsC(spineH.length === 4 && !o.poly ? bezier(...spineH, o.n || 14) : spineH);
    const cum = cumLen(pl), total = cum[cum.length - 1] || 1;
    const w0 = o.w0, w1 = o.w1 ?? 0.6, wm = o.wMid ?? (w0 + w1) / 2;
    const wAt = (t) => (t < 0.5 ? lerp(w0, wm, t * 2) : lerp(wm, w1, (t - 0.5) * 2));
    const maxW = Math.max(w0, w1, wm) / 2;
    const depth = o.depth ?? 2.5;
    const zf = typeof o.z === 'function' ? o.z : () => o.z || 0;
    const strands = o.strands || 0;
    let cache = null;
    const nearest = (x, y) => { if (!cache || cache.x !== x || cache.y !== y) cache = { x, y, r: polyNearest(pl, cum, total, x, y) }; return cache.r; };
    const inside = (x, y) => { const [d, t] = nearest(x, y); return d <= wAt(t) / 2; };
    const z = (x, y) => {
      const [d, t, side] = nearest(x, y); const hw = Math.max(0.5, wAt(t) / 2); const u = clamp(d / hw, 0, 1);
      let zz = zf(x, y, t) + depth * Math.sqrt(1 - u * u);
      if (strands) zz -= (o.strandDepth ?? 0.4) * Math.abs(Math.sin(((side * u + 1) / 2) * Math.PI * strands)) * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.5 + 0.4));
      return zz;
    };
    const spec = (x, y) => { const [d, t] = nearest(x, y); const hw = Math.max(0.5, wAt(t) / 2); return 1 - clamp(d / hw, 0, 1); };
    return this.fillC(bboxOf(pl, maxW + 1), inside, z, { ...o, spec, rim: 0 });
  }

  // ---- detail painting (keeps height/surface; changes material/tone only) ----
  /** Paint over a head-space bbox: fn(hx, hy, cx, cy, i) → null | [mat, off?, fix?]. */
  paint(hb, fn, { onlyMat = null, onlySid = null } = {}) {
    const corners = this.ptsC([[hb[0], hb[1]], [hb[2], hb[1]], [hb[0], hb[3]], [hb[2], hb[3]]]);
    const [x0, y0, x1, y1] = bboxOf(corners, 1);
    const only = onlyMat ? new Set(onlyMat.map((n) => this.m(n))) : null;
    for (let y = Math.max(0, y0); y <= Math.min(PH - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(PW - 1, x1); x++) {
      const i = y * PW + x;
      if (only && !only.has(this.mat[i])) continue;
      if (onlySid && !onlySid.has(this.sid[i])) continue;
      const [hx, hy] = this.toH(x + 0.5, y + 0.5);
      const r = fn(hx, hy, x, y, i);
      if (r) this.setPix(i, r[0], r[1] || 0, r[2] ?? -1);
    }
  }
  setPix(i, mat, off = 0, fix = -1) {
    this.mat[i] = typeof mat === 'number' ? mat : this.m(mat); this.off[i] = off; this.fix[i] = fix;
  }
  /** Set a canvas pixel by head-space coordinate (rounded). */
  dotH(hx, hy, mat, off = 0, fix = -1, { onlyMat = null } = {}) {
    const [cx, cy] = this.toC(hx, hy);
    this.dotC(Math.floor(cx), Math.floor(cy), mat, off, fix, onlyMat);
  }
  dotC(x, y, mat, off = 0, fix = -1, onlyMat = null) {
    if (x < 0 || y < 0 || x >= PW || y >= PH) return;
    const i = y * PW + x;
    if (onlyMat && !onlyMat.includes(this.mats[this.mat[i]]?.name)) return;
    if (!this.mat[i] && !(fix >= 0 || mat)) return;
    this.setPix(i, mat, off, fix);
  }
  /** Pixel-perfect 1-px polyline in canvas space from head-space points. fn(t)→[mat,off,fix] or a fixed spec. */
  strokeH(ptsH, spec, { onlyMat = null, skipEnds = 0, requireMat = true } = {}) {
    const pts = this.ptsC(ptsH);
    const pix = [];
    for (let k = 0; k < pts.length - 1; k++) {
      let x0 = Math.floor(pts[k][0]), y0 = Math.floor(pts[k][1]);
      const x1 = Math.floor(pts[k + 1][0]), y1 = Math.floor(pts[k + 1][1]);
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        const l = pix[pix.length - 1];
        if (!l || l[0] !== x0 || l[1] !== y0) pix.push([x0, y0]);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    // pixel-perfect: drop L-corner pixels
    const pp = [];
    for (let i = 0; i < pix.length; i++) {
      if (i > 0 && i < pix.length - 1 && pp.length) {
        const a = pp[pp.length - 1], c = pix[i + 1], b = pix[i];
        if ((a[0] === b[0] || a[1] === b[1]) && (c[0] === b[0] || c[1] === b[1]) && a[0] !== c[0] && a[1] !== c[1]) continue;
      }
      pp.push(pix[i]);
    }
    const n = pp.length;
    for (let i = skipEnds; i < n - skipEnds; i++) {
      const [x, y] = pp[i];
      if (x < 0 || y < 0 || x >= PW || y >= PH) continue;
      const idx = y * PW + x;
      if (requireMat && !this.mat[idx]) continue;
      if (onlyMat && !onlyMat.includes(this.mats[this.mat[idx]]?.name)) continue;
      const s = typeof spec === 'function' ? spec(n > 1 ? i / (n - 1) : 0, x, y, idx) : spec;
      if (s) this.setPix(idx, s[0], s[1] || 0, s[2] ?? -1);
    }
    return pp;
  }
  /** Thick line by distance (head space): w(t) width. */
  thickH(ptsH, wfn, spec, { onlyMat = null } = {}) {
    const pl = this.ptsC(ptsH); const cum = cumLen(pl), total = cum[cum.length - 1] || 1;
    const maxW = 4;
    const [x0, y0, x1, y1] = bboxOf(pl, maxW);
    for (let y = Math.max(0, y0); y <= Math.min(PH - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(PW - 1, x1); x++) {
      const i = y * PW + x;
      if (!this.mat[i]) continue;
      if (onlyMat && !onlyMat.includes(this.mats[this.mat[i]]?.name)) continue;
      const [d, t] = polyNearest(pl, cum, total, x + 0.5, y + 0.5);
      const w = typeof wfn === 'function' ? wfn(t) : wfn;
      if (d <= w / 2) { const s = typeof spec === 'function' ? spec(t, d / Math.max(0.01, w / 2), x, y, i) : spec; if (s) this.setPix(i, s[0], s[1] || 0, s[2] ?? -1); }
    }
  }
  /** Add a height bump to every pixel of the given surface ids: fn(hx, hy) → dz. */
  bump(sids, fn) {
    const set = sids instanceof Set ? sids : new Set([].concat(sids));
    for (let i = 0; i < PN; i++) {
      if (!this.mat[i] || !set.has(this.sid[i])) continue;
      const [hx, hy] = this.toH((i % PW) + 0.5, Math.floor(i / PW) + 0.5);
      this.z[i] += fn(hx, hy);
    }
  }
}

// ---- 3/4 head model ------------------------------------------------------------------------------
/**
 * Head as a stack of horizontal elliptic slices (half-width a, half-depth b, forward offset zc) turned by
 * `yaw` (+ = toward the viewer's right). Gives a consistent height field, silhouette and feature projection.
 */
export class Face3D {
  constructor({ cx, yaw, rows, z0 = 0 }) {
    this.cx = cx; this.yaw = yaw; this.rows = rows; this.z0 = z0;
    this.c = Math.cos(yaw); this.s = Math.sin(yaw);
    this.y0 = rows[0][0]; this.y1 = rows[rows.length - 1][0];
  }
  slice(y) {
    const r = this.rows; const n = r.length;
    if (y <= r[0][0]) return r[0].slice(1);
    if (y >= r[n - 1][0]) return r[n - 1].slice(1);
    let k = 0; while (k < n - 2 && y > r[k + 1][0]) k++;
    const t = (y - r[k][0]) / (r[k + 1][0] - r[k][0]);
    const P = (i) => r[clamp(i, 0, n - 1)];
    const out = [];
    for (let j = 1; j <= 3; j++) {
      const p0 = P(k - 1)[j], p1 = P(k)[j], p2 = P(k + 1)[j], p3 = P(k + 2)[j];
      const t2 = t * t, t3 = t2 * t;
      out.push(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
    }
    return out;
  }
  /** Visible front depth at head-space (x,y), or null when outside the silhouette. */
  frontZ(hx, hy) {
    if (hy < this.y0 || hy > this.y1) return null;
    const [a, b, zc] = this.slice(hy);
    if (a <= 0.2 || b <= 0.2) return null;
    const c = this.c, s = this.s, x = hx - this.cx;
    const A = (s * s) / (a * a) + (c * c) / (b * b);
    const B = 2 * ((-x * c * s) / (a * a) + (c * (x * s - zc)) / (b * b));
    const C = (x * x * c * c) / (a * a) + ((x * s - zc) * (x * s - zc)) / (b * b) - 1;
    const D = B * B - 4 * A * C;
    if (D < 0) return null;
    return (-B + Math.sqrt(D)) / (2 * A) + this.z0;
  }
  /** Surface coords of a head-space point: u in [-1,1] across the slice (- = near/viewer-left side). */
  local(hx, hy) {
    const z = this.frontZ(hx, hy); if (z === null) return null;
    const [a] = this.slice(hy);
    const xl = (hx - this.cx) * this.c - (z - this.z0) * this.s;
    return { u: xl / a, z };
  }
  /** Project surface point (u, y) with extra protrusion e → [hx, hy, z]. */
  proj(u, y, e = 0) {
    const [a, b, zc] = this.slice(y);
    u = clamp(u, -1, 1);
    const xl = a * u, zl = zc + b * Math.sqrt(1 - u * u) + e;
    return [this.cx + xl * this.c + zl * this.s, y, -xl * this.s + zl * this.c + this.z0];
  }
  /** Horizontal foreshortening factor at (u, y): screen px per unit of surface arc. */
  scaleAt(u, y) {
    const a = this.proj(u - 0.02, y)[0], b = this.proj(u + 0.02, y)[0];
    const [sa] = this.slice(y);
    return (b - a) / (0.04 * sa);
  }
}

// ---- lighting ------------------------------------------------------------------------------------
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/**
 * Light presets. L = direction TO the light (x right, y down, z toward viewer). amb/key = levels;
 * shadow = cast-shadow strength; falloff(x,y) optional key multiplier; grade = colour treatment.
 */
export const LIGHTS = {
  normal: { L: norm3([-0.44, -0.56, 0.7]), amb: 0.34, key: 0.74, shadow: 0.75, spec: 1, grade: null },
  dark: {
    // the default at night: a flashlight held low and to the left — the face sits in the beam's pool,
    // hair, shoulders and the far edge fall away into darkness
    L: norm3([-0.55, 0.08, 0.83]), amb: 0.06, key: 0.96, shadow: 0.85, spec: 1.1,
    falloff: (x, y) => { const dx = (x - 44) / 50, dy = (y - 56) / 44; return clamp(1.2 - Math.sqrt(dx * dx + dy * dy) * 0.95, 0.06, 1.06); },
    grade: { lit: '#fff1d6', litGain: 1.06, dark: '#0d1220', darkGain: 0.55, desat: 0.15, crush: 0.5, abyss: '#07080d' },
  },
  under: {
    L: norm3([-0.12, 0.86, 0.5]), amb: 0.04, key: 1.08, shadow: 0.9, spec: 0.5,
    falloff: (x, y) => clamp(0.22 + y / 92, 0.12, 1.25),
    grade: { lit: '#ffe9c8', litGain: 1.02, dark: '#10121c', darkGain: 0.55, desat: 0.2, crush: 0.45, abyss: '#07080d' },
  },
  fluor: {
    L: norm3([-0.1, -0.82, 0.56]), amb: 0.3, key: 0.82, shadow: 0.8, spec: 0.8,
    grade: { lit: '#e2f5d8', litGain: 1.04, dark: '#3a5a48', darkGain: 0.82, desat: 0.38, crush: 0.15, abyss: '#0f1a14' },
  },
  red: {
    L: norm3([0.28, 0.78, 0.56]), amb: 0.07, key: 1.05, shadow: 0.85, spec: 0.6,
    falloff: (x, y) => clamp(0.3 + y / 100, 0.15, 1.2),
    grade: { lit: '#ff8a4a', litGain: 1.15, dark: '#4a0c08', darkGain: 0.8, desat: 0.65, crush: 0.4, abyss: '#140303' },
  },
  dawn: {
    L: norm3([-0.32, -0.42, 0.85]), amb: 0.48, key: 0.5, shadow: 0.4, spec: 0.5,
    grade: { lit: '#e2d4e2', litGain: 1.0, dark: '#5a5270', darkGain: 0.95, desat: 0.35, crush: 0.0, abyss: '#2a2638' },
  },
};

/** Normals (finite differences within a surface), ambient occlusion — light independent. */
export function prepare(rig) {
  const { mat, sid, z } = rig;
  const nx = new Float32Array(PN), ny = new Float32Array(PN), nz = new Float32Array(PN), ao = new Float32Array(PN);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const i = y * PW + x; if (!mat[i]) continue;
    const s = sid[i], zi = z[i];
    const L = x > 0 && mat[i - 1] && sid[i - 1] === s, R = x < PW - 1 && mat[i + 1] && sid[i + 1] === s;
    const U = y > 0 && mat[i - PW] && sid[i - PW] === s, D = y < PH - 1 && mat[i + PW] && sid[i + PW] === s;
    let gx = L && R ? (z[i + 1] - z[i - 1]) / 2 : R ? z[i + 1] - zi : L ? zi - z[i - 1] : 0;
    let gy = U && D ? (z[i + PW] - z[i - PW]) / 2 : D ? z[i + PW] - zi : U ? zi - z[i - PW] : 0;
    const l = Math.hypot(gx, gy, 1);
    nx[i] = -gx / l; ny[i] = -gy / l; nz[i] = 1 / l;
    // AO: higher neighbours nearby darken (contact shadows in every light)
    let occ = 0;
    for (const r of [1.5, 3, 5]) {
      for (let k = 0; k < 8; k++) {
        const ax = Math.round(x + AO_DIR[k][0] * r), ay = Math.round(y + AO_DIR[k][1] * r);
        if (ax < 0 || ay < 0 || ax >= PW || ay >= PH) continue;
        const j = ay * PW + ax; if (!mat[j]) continue;
        const dz = z[j] - zi - 0.6;
        if (dz > 0) occ += Math.min(1, dz / (r * 2)) * (r < 2 ? 1 : r < 4 ? 0.8 : 0.5);
      }
    }
    ao[i] = 1 - clamp(occ / 10, 0, 0.45);
  }
  rig.nx = nx; rig.ny = ny; rig.nz = nz; rig.ao = ao;
}
const AO_DIR = [[1, 0], [0.71, 0.71], [0, 1], [-0.71, 0.71], [-1, 0], [-0.71, -0.71], [0, -1], [0.71, -0.71]];

function shadowAt(rig, x, y, L, steps = 14) {
  const lxy = Math.hypot(L[0], L[1]); if (lxy < 0.12) return 0;
  const sx = L[0] / lxy, sy = L[1] / lxy, dz = L[2] / lxy;
  const i0 = y * PW + x, z0 = rig.z[i0], s0 = rig.sid[i0];
  let sh = 0;
  for (let k = 1; k <= steps; k++) {
    const ax = Math.round(x + sx * k), ay = Math.round(y + sy * k);
    if (ax < 0 || ay < 0 || ax >= PW || ay >= PH) break;
    const j = ay * PW + ax; if (!rig.mat[j]) continue;
    const bias = rig.sid[j] === s0 ? 1.4 : 0.6;
    const over = rig.z[j] - (z0 + dz * k) - bias;
    if (over > 0) { sh = Math.max(sh, clamp(over / 1.8, 0, 1) * (1 - k / (steps + 4))); if (sh > 0.95) break; }
  }
  return sh;
}

function gradeColor(hex, idx, g) {
  if (!g) return hexToRgb(hex);
  let [r, gg, b] = hexToRgb(hex);
  const lum = 0.3 * r + 0.59 * gg + 0.11 * b;
  r = lum + (r - lum) * (1 - g.desat); gg = lum + (gg - lum) * (1 - g.desat); b = lum + (b - lum) * (1 - g.desat);
  const w = smooth(idx / 5);
  const L = hexToRgb(g.lit), D = hexToRgb(g.dark);
  const tr = lerp((D[0] / 255) * g.darkGain * 2, (L[0] / 255) * g.litGain, w);
  const tg = lerp((D[1] / 255) * g.darkGain * 2, (L[1] / 255) * g.litGain, w);
  const tb = lerp((D[2] / 255) * g.darkGain * 2, (L[2] / 255) * g.litGain, w);
  r *= tr; gg *= tg; b *= tb;
  if (g.crush && idx <= 1) { const A = hexToRgb(g.abyss); const k = g.crush * (idx === 0 ? 1 : 0.55); r = lerp(r, A[0], k); gg = lerp(gg, A[1], k); b = lerp(b, A[2], k); }
  return [clamp(r, 0, 255), clamp(gg, 0, 255), clamp(b, 0, 255)];
}

/**
 * Shade a prepared rig under a light → { canvas, idx (Int8Array) }.
 * post: optional fn(rgba, rig, idx, light) for character-specific passes (glass, amber edges...).
 */
export function shade(rig, lightName = 'normal', post = null) {
  const light = LIGHTS[lightName] || LIGHTS.normal;
  const { mat, nx, ny, nz, ao, off, fix, spec, flag } = rig;
  const L = light.L;
  const H = norm3([L[0], L[1], L[2] + 1]);
  const idx = new Int8Array(PN).fill(-1);
  const lev = new Float32Array(PN);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const i = y * PW + x; const m = mat[i]; if (!m) continue;
    const M = rig.mats[m];
    let ndl = nx[i] * L[0] + ny[i] * L[1] + nz[i] * L[2];
    if (M.flat) ndl = lerp(ndl, 0.75, M.flat);
    let key = light.key * Math.max(0, ndl);
    if (light.falloff) key *= light.falloff(x, y);
    const sh = flag[i] & 2 ? 0 : shadowAt(rig, x, y, L);
    key *= 1 - light.shadow * sh;
    let l = light.amb * ao[i] + key * (0.55 + 0.45 * ao[i]);
    if (M.spec && spec[i] > 0) {
      const nh = nx[i] * H[0] + ny[i] * H[1] + nz[i] * H[2];
      const band = clamp(1 - Math.abs(nh - M.specAt) / M.specW, 0, 1);
      l += M.spec * light.spec * band * spec[i] * spec[i] * (1 - sh) * (light.falloff ? light.falloff(x, y) : 1);
    }
    if (M.gloss) {
      const nh = nx[i] * H[0] + ny[i] * H[1] + nz[i] * H[2];
      l += M.gloss * light.spec * clamp(1 - Math.abs(nh - M.glossAt) / M.glossW, 0, 1) * (1 - sh) * (light.falloff ? light.falloff(x, y) : 1);
    }
    lev[i] = l;
    let k;
    if (fix[i] >= 0) k = fix[i];
    else {
      const th = M.tone; const b = (bay(x, y) - 0.5) * 2;
      if (M.ditherT) { k = 1; while (k < 5 && l + b * M.ditherT[k - 1] >= th[k - 1]) k++; }
      else { const v = l + b * M.dither; k = 1; while (k < 5 && v >= th[k - 1]) k++; }
      k = Math.max(M.min, k);
      k = clamp(k + off[i], 0, 5);
    }
    idx[i] = k;
  }
  // outlines: silhouette + occlusion edges (selective: lit edges one step lighter)
  const outIdx = idx.slice();
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const i = y * PW + x; const m = mat[i]; if (!m || fix[i] >= 0 || (flag[i] & 1)) continue;
    const M = rig.mats[m];
    let sil = false, inner = false;
    const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [ax, ay] of nb) {
      if (ax < 0 || ax >= PW || ay < 0 || ay >= PH) continue; // frame cut: no line
      const j = ay * PW + ax;
      if (!mat[j]) { sil = true; continue; }
      if (rig.sid[j] !== rig.sid[i] && rig.z[j] < rig.z[i] - (M.innerGap || 2.2) && M.inner && rig.mats[mat[j]].line) inner = true;
    }
    if (sil && M.line) {
      const lit = lev[i] > 0.62;
      outIdx[i] = Math.min(idx[i], M.lineIdx + (lit ? 1 : 0));
    } else if (inner) {
      const lit = lev[i] > 0.7;
      outIdx[i] = Math.min(idx[i], M.lineIdx + (lit ? 2 : 1));
    }
  }
  // line cleanup: a silhouette pixel that only forms the inner corner of a stair step is redundant —
  // demote it to an intermediate tone so curves read as thin 8-connected lines with soft (AA) steps
  const isLine = (i) => outIdx[i] >= 0 && outIdx[i] < idx[i];
  const corner = new Uint8Array(PN);
  for (let y = 1; y < PH - 1; y++) for (let x = 1; x < PW - 1; x++) {
    const i = y * PW + x; if (!isLine(i)) continue;
    for (const [hx, vy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const h = i + hx, v = i + vy * PW, dgn = i + hx + vy * PW;
      if (isLine(h) && isLine(v) && !mat[dgn]) { corner[i] = 1; break; }
    }
  }
  for (let i = 0; i < PN; i++) if (corner[i]) outIdx[i] = Math.min(idx[i], outIdx[i] + 1);
  // colour LUT per material for this light
  const lut = rig.mats.map((M) => (M ? M.ramp.map((hex, k) => gradeColor(hex, k, light.grade)) : null));
  const c = makeCanvas(PW, PH); const ctx = ctxOf(c);
  const img = ctx.createImageData(PW, PH); const d = img.data;
  for (let i = 0; i < PN; i++) {
    const m = mat[i]; if (!m) continue;
    const col = lut[m][outIdx[i]];
    d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
  }
  if (post) post(d, rig, outIdx, light, lightName);
  ctx.putImageData(img, 0, 0);
  return { canvas: c, idx: outIdx };
}

// ---- post helpers ----------------------------------------------------------------------------------
/** Distance (px, capped at max) from each opaque pixel to the nearest transparent pixel (frame cuts don't count). */
export function edgeDistance(rig, max = 6) {
  // two-pass 8-neighbour chamfer transform (1, √2)
  const D = new Float32Array(PN);
  for (let i = 0; i < PN; i++) D[i] = rig.mat[i] ? 1e6 : 0;
  const S2 = Math.SQRT2;
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const i = y * PW + x; let v = D[i]; if (!v) continue;
    if (x > 0) v = Math.min(v, D[i - 1] + 1);
    if (y > 0) { v = Math.min(v, D[i - PW] + 1); if (x > 0) v = Math.min(v, D[i - PW - 1] + S2); if (x < PW - 1) v = Math.min(v, D[i - PW + 1] + S2); }
    D[i] = v;
  }
  for (let y = PH - 1; y >= 0; y--) for (let x = PW - 1; x >= 0; x--) {
    const i = y * PW + x; let v = D[i]; if (!v) continue;
    if (x < PW - 1) v = Math.min(v, D[i + 1] + 1);
    if (y < PH - 1) { v = Math.min(v, D[i + PW] + 1); if (x < PW - 1) v = Math.min(v, D[i + PW + 1] + S2); if (x > 0) v = Math.min(v, D[i + PW - 1] + S2); }
    D[i] = v;
  }
  for (let i = 0; i < PN; i++) if (D[i] > max) D[i] = max;
  return D;
}
/** Cool reflected rim on the far (viewer-right) silhouette of the given materials. */
export function rimLight(d, rig, mats, hex, k = 0.28, minX = 0) {
  const ids = new Set(mats.map((n) => rig.mid[n]).filter(Boolean));
  const C = hexToRgb(hex);
  for (let y = 0; y < PH; y++) for (let x = minX; x < PW; x++) {
    const i = y * PW + x; if (!ids.has(rig.mat[i])) continue;
    if (rig.nx[i] < 0.35) continue; // only surfaces turning away to the right
    const e = rig.edge[i];
    if (e <= 1.2) mixInto(d, i, C, k);
  }
}
export function mixInto(d, i, rgb, t) {
  d[i * 4] = lerp(d[i * 4], rgb[0], t); d[i * 4 + 1] = lerp(d[i * 4 + 1], rgb[1], t); d[i * 4 + 2] = lerp(d[i * 4 + 2], rgb[2], t);
}
export { clamp, hexToRgb, PAL, mix };
