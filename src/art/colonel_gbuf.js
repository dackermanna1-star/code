// Colonel art core: a tiny deferred "G-buffer" rasterizer for pixel art.
// Shapes write material + surface normal + depth per pixel; a shading pass lights them with a few
// directional/point lights and quantizes each pixel onto its material's palette ramp with ordered
// (Bayer 4×4) dithering. One rig → consistent volumes under every lighting variant (portrait lights,
// CG flicker), always crisp and palette-bound. Deterministic (hash noise only).
import { PAL, hexToRgb, mix } from './palette.js';
import { makeCanvas, ctxOf, BAYER4, hash2 } from './util.js';

const BT = BAYER4.map((r) => r.map((v) => (v + 0.5) / 16));

// ---------------------------------------------------------------------------------- noise
const h01 = (x, y, s) => hash2(x, y, s) / 4294967296;
export function vnoise(x, y, sc, seed = 0) {
  const fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = h01(ix, iy, seed), b = h01(ix + 1, iy, seed), c = h01(ix, iy + 1, seed), d = h01(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
export const fbm = (x, y, sc, seed = 0) => vnoise(x, y, sc, seed) * 0.6 + vnoise(x, y, sc / 2.3, seed + 7) * 0.3 + vnoise(x, y, sc / 5.1, seed + 13) * 0.1;
export const hnoise = h01;

// ---------------------------------------------------------------------------------- materials
// ramp: dark → light hex. spec/shin: highlight. bump: [scale, amp, seed] normal perturbation.
// tex(x, y) → luminance offset. dith: dither strength (0 = hard bands, 1 = full Bayer).
// alt: { ramp, f(x, y) → 0..1 share } — dithered blend toward a second ramp (mottling).
const MATS = [];
export function defMat(id, def) {
  MATS[id] = { spec: 0, shin: 10, dith: 1, wrap: 0.15, ...def, rgb: def.ramp.map(hexToRgb), altRgb: def.alt ? def.alt.ramp.map(hexToRgb) : null };
  return id;
}
export const matDef = (id) => MATS[id];

export const M = {
  FLESH: 1, FACE: 2, NAVY: 3, ROT: 4, GOLD: 5, BRASS: 6, SASH: 7, HAIR: 8, BOOT: 9, DARK: 10,
  EYE: 11, IRIS: 12, LIP: 13, RIB_B: 14, RIB_R: 15, PAPER: 16, COAL: 17, WOOL_WET: 18, SILVER: 19, MOUTH: 20,
  FLESH_D: 21, NAVY_D: 22, SASH_D: 23, BLUSH: 24, NAIL: 25, SFLESH: 26, SNAVY: 27,
};

/** Build an n-step ramp by interpolating through palette stops (keeps every material PAL-derived). */
export function rampFrom(stops, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t));
    out.push(mix(stops[i], stops[i + 1], t - i));
  }
  return out;
}
const lt = (c, k) => mix(c, '#ffffff', k), dk = (c, k) => mix(c, '#000000', k);

const dough = (x, y) => (fbm(x, y, 9, 3) - 0.5) * 0.06 + (h01(x, y, 91) < 0.012 ? -0.07 : 0);
// the dough: pale, cool, dead — flesh pushed toward the sick gray-green
const DOUGH = rampFrom([dk(PAL.flesh_dd, 0.62), dk(PAL.flesh_dd, 0.25), mix(PAL.flesh_d, PAL.flesh_sick, 0.3), mix(PAL.flesh, PAL.flesh_sick, 0.28), mix(PAL.flesh_l, PAL.cream_l, 0.2), lt(PAL.flesh_l, 0.32)], 9);
defMat(M.FLESH, {
  ramp: DOUGH, spec: 0.22, shin: 14, bump: [7, 0.2, 11], tex: dough, dith: 0.85,
  alt: { ramp: rampFrom([dk(PAL.flesh_dd, 0.6), mix(PAL.flesh_dd, PAL.green_d, 0.3), mix(PAL.flesh_d, PAL.flesh_sick, 0.75), PAL.flesh_sick, mix(PAL.flesh_l, PAL.flesh_sick, 0.5), lt(PAL.flesh_sick, 0.45)], 9), f: (x, y) => Math.max(0, fbm(x, y, 16, 5) - 0.6) * 2.2 },
});
defMat(M.FLESH_D, { ...MATS[M.FLESH], tex: (x, y) => dough(x, y) - 0.12, alt: { ...MATS[M.FLESH].alt } });
// the face: too smooth, warmer, waxier — a doll's face set into the dough
defMat(M.FACE, {
  ramp: rampFrom([dk(PAL.flesh_dd, 0.55), mix(PAL.flesh_dd, PAL.skin_dd, 0.45), mix(PAL.flesh_d, PAL.skin_d, 0.4), mix(PAL.flesh, PAL.skin, 0.3), mix(PAL.flesh_l, PAL.skin_l, 0.4), lt(PAL.skin_l, 0.55)], 9),
  spec: 0.4, shin: 22, dith: 0.5, wrap: 0.25,
});
defMat(M.BLUSH, { ...MATS[M.FACE], ramp: rampFrom([dk(PAL.flesh_dd, 0.55), PAL.skin_dd, mix(PAL.skin_d, PAL.red_l, 0.12), mix(PAL.skin, PAL.red_l, 0.12), mix(PAL.skin_l, PAL.red_l, 0.1), lt(PAL.skin_l, 0.5)], 9) });
defMat(M.NAVY, {
  ramp: rampFrom([dk(PAL.navy_dd, 0.6), PAL.navy_dd, PAL.navy_d, PAL.navy, PAL.navy_l, mix(PAL.navy_l, PAL.blue_l, 0.4)], 9),
  spec: 0.05, shin: 6, bump: [2, 0.18, 21], tex: (x, y) => (((x + y) & 1) ? 0.02 : -0.02) + (fbm(x, y, 7, 4) - 0.5) * 0.12,
  alt: { ramp: rampFrom([dk(PAL.green_dd, 0.7), PAL.green_dd, mix(PAL.navy_d, PAL.green_d, 0.6), mix(PAL.navy, PAL.green, 0.5), mix(PAL.navy_l, PAL.green_l, 0.4), mix(PAL.green_l, PAL.g5, 0.3)], 9), f: (x, y) => Math.max(0, fbm(x, y, 11, 9) - 0.60) * 3.2 },
});
defMat(M.NAVY_D, { ...MATS[M.NAVY], tex: (x, y) => MATS[M.NAVY].tex(x, y) - 0.15 });
defMat(M.ROT, { ramp: rampFrom([dk(PAL.green_dd, 0.7), PAL.green_dd, PAL.slate, PAL.slate_l, mix(PAL.slate_l, PAL.green_l, 0.5)], 9), bump: [3, 0.3, 31], tex: (x, y) => (fbm(x, y, 5, 8) - 0.5) * 0.2 });
defMat(M.GOLD, { ramp: rampFrom([dk(PAL.brass_d, 0.7), dk(PAL.brass_d, 0.35), PAL.brass_d, PAL.brass, PAL.gold, PAL.gold_l, lt(PAL.gold_l, 0.6)], 10), spec: 0.9, shin: 9, dith: 0.6, bump: [1.5, 0.35, 41] });
defMat(M.BRASS, { ramp: rampFrom([dk(PAL.brass_d, 0.7), dk(PAL.brass_d, 0.3), PAL.brass_d, PAL.brass, PAL.gold, lt(PAL.gold_l, 0.4)], 9), spec: 1.0, shin: 16, dith: 0.5 });
defMat(M.SASH, {
  ramp: rampFrom([dk(PAL.blood_d, 0.5), PAL.blood_d, PAL.velvet_d, PAL.crimson, PAL.crimson_l, mix(PAL.crimson_l, PAL.red_l, 0.5), lt(PAL.red_l, 0.25)], 9),
  spec: 0.45, shin: 7, bump: [2, 0.2, 51], tex: (x, y) => ((y + (x >> 2)) % 3 === 0 ? -0.05 : 0.01),
});
defMat(M.SASH_D, { ...MATS[M.SASH], tex: (x, y) => MATS[M.SASH].tex(x, y) - 0.12 });
defMat(M.HAIR, { ramp: rampFrom([dk(PAL.g1, 0.5), mix(PAL.g1, PAL.brown_dd, 0.4), mix(PAL.g3, PAL.hair_g, 0.4), PAL.hair_g, mix(PAL.hair_g_l, PAL.g6, 0.4), lt(PAL.g6, 0.25)], 9), spec: 0.25, shin: 8, dith: 0.7, tex: (x, y) => ((hash2(x, y >> 1, 61) & 3) === 0 ? -0.07 : 0.02) });
defMat(M.BOOT, { ramp: [dk(PAL.ink, 0.6), PAL.ink, PAL.night, PAL.shadow, PAL.g1, PAL.g2, mix(PAL.g2, PAL.g3, 0.5), PAL.g4], spec: 0.6, shin: 18, dith: 0.5, tex: () => -0.12 });
defMat(M.DARK, { ramp: [dk(PAL.ink, 0.7), dk(PAL.ink, 0.35), PAL.ink, PAL.night, mix(PAL.night, PAL.shadow, 0.5)], dith: 0.3 });
defMat(M.MOUTH, { ramp: [dk(PAL.ink, 0.8), dk(PAL.blood_d, 0.8), dk(PAL.blood_d, 0.65), dk(PAL.blood_d, 0.5), dk(PAL.blood_d, 0.3)], dith: 0.3 });
defMat(M.EYE, { ramp: rampFrom([dk(PAL.g1, 0.4), PAL.g3, mix(PAL.g5, PAL.cream_d, 0.4), mix(PAL.g6, PAL.cream, 0.4), lt(PAL.paper, 0.2)], 8), spec: 0.5, shin: 30, dith: 0.4 });
defMat(M.IRIS, { ramp: rampFrom([dk(PAL.ink, 0.4), PAL.night, PAL.g1, mix(PAL.g2, PAL.blue_d, 0.4), mix(PAL.g4, PAL.blue_l, 0.3)], 7), spec: 1.4, shin: 40, dith: 0.3 });
defMat(M.LIP, { ramp: rampFrom([dk(PAL.skin_dd, 0.65), dk(PAL.skin_dd, 0.3), mix(PAL.skin_dd, PAL.flesh_d, 0.5), mix(PAL.skin_d, PAL.flesh, 0.5)], 8), spec: 0.15, shin: 18, dith: 0.5 });
defMat(M.RIB_B, { ramp: [dk(PAL.blue_dd, 0.5), PAL.blue_dd, PAL.blue_d, PAL.blue, PAL.blue_l, PAL.moon], dith: 0.3 });
defMat(M.RIB_R, { ramp: [dk(PAL.blood_d, 0.5), PAL.blood_d, PAL.red_d, PAL.red, PAL.red_l, lt(PAL.red_l, 0.3)], dith: 0.3 });
defMat(M.PAPER, { ramp: rampFrom([dk(PAL.paper_d, 0.85), dk(PAL.paper_d, 0.6), dk(PAL.paper_d, 0.3), PAL.paper_d, PAL.paper, lt(PAL.paper, 0.4)], 7), dith: 0.5, tex: (x, y) => ((hash2(x, y, 71) & 15) === 0 ? -0.06 : 0) });
defMat(M.COAL, { ramp: [dk(PAL.ink, 0.85), dk(PAL.ink, 0.5), PAL.ink, PAL.night, PAL.shadow, PAL.g1, PAL.g2, PAL.g4], spec: 1.2, shin: 26, dith: 0.8, bump: [1.3, 0.9, 81] });
defMat(M.WOOL_WET, { ramp: rampFrom([dk(PAL.navy_dd, 0.7), PAL.navy_dd, PAL.navy_d, PAL.navy, mix(PAL.navy_l, PAL.blue_l, 0.5)], 8), spec: 0.8, shin: 18, bump: [2, 0.4, 91] });
defMat(M.SILVER, { ramp: rampFrom([dk(PAL.g1, 0.5), PAL.g2, PAL.g4, PAL.g6, PAL.white], 7), spec: 1.0, shin: 18, dith: 0.5 });
defMat(M.NAIL, { ramp: rampFrom([dk(PAL.flesh_dd, 0.5), PAL.flesh_dd, mix(PAL.flesh_d, PAL.cream_d, 0.4), mix(PAL.flesh, PAL.cream_d, 0.4), mix(PAL.flesh_l, PAL.paper_d, 0.5)], 6), spec: 0.35, shin: 24, dith: 0.4 });

// sprite-scale variants: no bump (at 64 px the dough texture reads as curls), quieter dither
defMat(M.SFLESH, { ramp: rampFrom([dk(PAL.flesh_dd, 0.65), dk(PAL.flesh_dd, 0.3), mix(PAL.flesh_d, PAL.flesh_sick, 0.35), mix(PAL.flesh, PAL.flesh_sick, 0.35), mix(PAL.flesh_l, PAL.flesh_sick, 0.2), lt(PAL.flesh_l, 0.12)], 8), spec: 0.3, shin: 12, dith: 0.55, wrap: 0.1, tex: (x, y) => (h01(x, y, 93) < 0.04 ? -0.05 : 0) });
defMat(M.SNAVY, { ...MATS[M.NAVY], bump: null, dith: 0.6, tex: (x, y) => (((x + y) & 1) ? 0.015 : -0.015) - 0.06, alt: { ...MATS[M.NAVY].alt, f: (x, y) => Math.max(0, fbm(x, y, 9, 9) - 0.66) * 2.5 } });

// ---------------------------------------------------------------------------------- G-buffer
export class GBuf {
  constructor(w, h) {
    this.w = w; this.h = h; const n = w * h;
    this.mat = new Uint8Array(n);
    this.nx = new Float32Array(n); this.ny = new Float32Array(n); this.nz = new Float32Array(n);
    this.z = new Float32Array(n).fill(-1e9);
    this.ao = new Float32Array(n).fill(1);
    this.lum = new Float32Array(n);   // painted luminance bias (highlights, stains)
    this.tox = 0; this.toy = 0;       // texture origin (lets textures ride with a moving body)
  }
  clone() {
    const o = new GBuf(this.w, this.h);
    o.mat.set(this.mat); o.nx.set(this.nx); o.ny.set(this.ny); o.nz.set(this.nz); o.z.set(this.z); o.ao.set(this.ao); o.lum.set(this.lum);
    o.tox = this.tox; o.toy = this.toy;
    return o;
  }
  clear() { this.mat.fill(0); this.z.fill(-1e9); this.ao.fill(1); this.lum.fill(0); }

  // core writer: mode 'z' (depth test), 'over' (paint on existing pixels only), 'any' (paint anyway),
  // 'under' (only empty pixels)
  _put(i, mat, nx, ny, nz, z, o) {
    const m = o.mode || 'z';
    if (m === 'z') { if (z < this.z[i]) return; }
    else if (m === 'over') { if (!this.mat[i]) return; }
    else if (m === 'under') { if (this.mat[i]) return; }
    else if (m === 'on') { if (!this.mat[i] || this.z[i] > z + (o.tol ?? 3)) return; }
    this.mat[i] = mat;
    const l = Math.hypot(nx, ny, nz) || 1;
    this.nx[i] = nx / l; this.ny[i] = ny / l; this.nz[i] = nz / l;
    this.z[i] = m === 'over' ? Math.max(this.z[i], z) : z;
    this.ao[i] = o.ao ?? 1;
    this.lum[i] = o.lum ?? 0;
  }

  /** Ellipsoid. o: { mat, z (center depth), rz (depth radius), tilt:[tx,ty], mode, clip(x,y), ao, lum } */
  ell(cx, cy, rx, ry, o) {
    if (rx <= 0 || ry <= 0) return;
    const rz = o.rz ?? Math.min(rx, ry), cz = o.z ?? 0, tx = o.tilt ? o.tilt[0] : 0, ty = o.tilt ? o.tilt[1] : 0;
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(this.w - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, d = u * u + v * v;
      if (d >= 1) continue;
      if (o.clip && !o.clip(x, y)) continue;
      const w = Math.sqrt(1 - d);
      this._put(y * this.w + x, o.mat, u / rx + tx * w / rz, v / ry + ty * w / rz, w / rz, cz + rz * w, o);
    }
  }
  /** Tapered capsule (sphere-swept segment). o: { mat, z0, z1, rzk (depth scale), mode, clip, ao, lum } */
  cap(ax, ay, r0, bx, by, r1, o) {
    const pad = Math.max(r0, r1) + 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - pad)), x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax, bx) + pad));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - pad)), y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay, by) + pad));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
    const za = o.z0 ?? o.z ?? 0, zb = o.z1 ?? o.z ?? 0, k = o.rzk ?? 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + dx * t, cy = ay + dy * t, r = r0 + (r1 - r0) * t;
      const ex = px - cx, ey = py - cy, d2 = (ex * ex + ey * ey) / (r * r);
      if (d2 >= 1) continue;
      if (o.clip && !o.clip(x, y)) continue;
      const w = Math.sqrt(1 - d2);
      this._put(y * this.w + x, o.mat, ex / r, ey / r, w / k, za + (zb - za) * t + r * w * k, o);
    }
  }
  /** Polygon with a fixed (or functional) normal. o: { mat, n:[x,y,z] | nf(x,y)→[x,y,z], z | zf(x,y), mode, ao, lum } */
  poly(pts, o) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const n = o.n || [0, 0, 1];
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(this.h - 1, Math.ceil(maxY)); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [xa, ya] = pts[i], [xb, yb] = pts[(i + 1) % pts.length];
        if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) xs.push(xa + ((yc - ya) / (yb - ya)) * (xb - xa));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(this.w, Math.round(xs[k + 1])); x++) {
          if (o.clip && !o.clip(x, y)) continue;
          const nn = o.nf ? o.nf(x, y) : n;
          this._put(y * this.w + x, o.mat, nn[0], nn[1], nn[2], o.zf ? o.zf(x, y) : (o.z ?? 0), o);
        }
      }
    }
  }
  /** Single pixel. */
  pix(x, y, mat, o = {}) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    const n = o.n || (this.mat[i] ? [this.nx[i], this.ny[i], this.nz[i]] : [0, 0, 1]);
    this._put(i, mat, n[0], n[1], n[2], o.z ?? (this.mat[i] ? this.z[i] + 0.1 : 0), { mode: 'any', ...o, ao: o.ao ?? this.ao[i], lum: o.lum ?? this.lum[i] });
  }
  /** Bresenham stroke of pixels. */
  line(x0, y0, x1, y1, mat, o = {}) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (mat) this.pix(x0, y0, mat, o); else this.dim(x0, y0, o.k ?? 0.6, o.lumAdd ?? 0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Multiply AO / add luminance at a pixel (creases, stains, highlights). */
  dim(x, y, k = 0.6, lumAdd = 0) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (!this.mat[i]) return;
    this.ao[i] *= k; this.lum[i] += lumAdd;
  }
  /** Curve stroke (quadratic bezier) that dims (crease) or paints. */
  curve(ax, ay, cx, cy, bx, by, fn) {
    const n = Math.ceil(Math.hypot(cx - ax, cy - ay) + Math.hypot(bx - cx, by - cy)) * 2 + 2;
    let lx = null, ly = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = Math.round(u * u * ax + 2 * u * t * cx + t * t * bx), y = Math.round(u * u * ay + 2 * u * t * cy + t * t * by);
      if (x === lx && y === ly) continue;
      lx = x; ly = y; fn(x, y, t);
    }
  }
  crease(ax, ay, cx, cy, bx, by, k = 0.55, lip = 0.0) {
    this.curve(ax, ay, cx, cy, bx, by, (x, y) => { this.dim(x, y, k); if (lip) this.dim(x, y + 1, 1, lip); });
  }
  /** Depth-discontinuity occlusion: pixels sitting just below a nearer neighbour darken (fold lines). */
  folds(thr = 1.5, k = 0.62, k2 = 0.85) {
    const { w, h, z, mat, ao } = this;
    const occ = new Float32Array(w * h).fill(1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!mat[i]) continue;
      let best = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (!mat[j]) continue;
        const dz = z[j] - z[i]; if (dz <= thr) continue;
        const near = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
        best = Math.max(best, near ? 2 : 1);
      }
      if (best === 2) occ[i] = k; else if (best === 1) occ[i] = k2;
    }
    for (let i = 0; i < w * h; i++) ao[i] *= occ[i];
  }
  /** Blocky screen-space AO: darken pixels in cavities relative to a radius. */
  ssao(r = 3, strength = 0.035, cap = 0.5) {
    const { w, h, z, mat, ao } = this;
    const out = new Float32Array(w * h).fill(1);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!mat[i]) continue;
      let s = 0;
      for (const [ux, uy] of dirs) {
        const xx = Math.round(x + ux * r), yy = Math.round(y + uy * r);
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (!mat[j]) continue;
        const dz = z[j] - z[i]; if (dz > 0) s += Math.min(dz, r * 2);
      }
      out[i] = Math.max(1 - cap, 1 - s * strength / r);
    }
    for (let i = 0; i < w * h; i++) ao[i] *= out[i];
  }
  /** Mask helper: true if pixel is filled. */
  has(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.mat[y * this.w + x] !== 0; }
  matAt(x, y) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.mat[y * this.w + x] : 0; }
}

// ---------------------------------------------------------------------------------- sculpting
/**
 * Height field for soft, organic masses: blobs are merged with a smooth max (log-sum-exp), then the
 * surface can be carved (pits, grooves, overhanging folds) and written into a GBuf with normals taken
 * from the finished surface. Each pixel remembers the material of its dominant blob.
 */
export class HField {
  constructor(w, h, k = 0.3) {
    this.w = w; this.h = h; this.k = k;
    const n = w * h;
    this.m = new Float32Array(n).fill(-1e9); this.s = new Float32Array(n);
    this.best = new Float32Array(n).fill(-1e9); this.mat = new Uint8Array(n);
    this.z = null;
  }
  _add(i, zz, mat) {
    if (this.z) { if (zz > this.z[i]) { this.z[i] = zz; this.mat[i] = mat; } return; }
    const k = this.k, m = this.m[i];
    if (zz > m) { this.s[i] = (m > -1e8 ? this.s[i] * Math.exp(k * (m - zz)) : 0) + 1; this.m[i] = zz; }
    else this.s[i] += Math.exp(k * (zz - m));
    if (zz > this.best[i]) { this.best[i] = zz; this.mat[i] = mat; }
  }
  /** Dome blob: z = base + hgt·(1-d²)^p inside the ellipse. o: { base, p, mat, clip } */
  blob(cx, cy, rx, ry, hgt, o = {}) {
    const base = o.base ?? 0, p = o.p ?? 0.5, mat = o.mat ?? M.FLESH;
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(this.w - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, d = u * u + v * v;
      if (d >= 1) continue;
      if (o.clip && !o.clip(x, y)) continue;
      this._add(y * this.w + x, base + hgt * Math.pow(1 - d, p), mat);
    }
  }
  /** Tapered tube (sausage) from a to b; z = zbase(t) + r(t)·k·√(1-(d/r)²). o: { z0, z1, k, mat, clip, p } */
  tube(ax, ay, r0, bx, by, r1, o = {}) {
    const pad = Math.max(r0, r1) + 1, mat = o.mat ?? M.FLESH, kk = o.k ?? 1, p = o.p ?? 0.5;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - pad)), x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax, bx) + pad));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - pad)), y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay, by) + pad));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6, za = o.z0 ?? o.z ?? 0, zb = o.z1 ?? o.z ?? 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const r = r0 + (r1 - r0) * t, ex = px - ax - dx * t, ey = py - ay - dy * t, d2 = (ex * ex + ey * ey) / (r * r);
      if (d2 >= 1) continue;
      if (o.clip && !o.clip(x, y)) continue;
      this._add(y * this.w + x, za + (zb - za) * t + r * kk * Math.pow(1 - d2, p), mat);
    }
  }
  /** Continuous lip/torus around an ellipse; thick(a), hgt(a) give thickness & peak height per angle. */
  ring(cx, cy, rx, ry, thick, hgt, o = {}) {
    const mat = o.mat ?? M.FLESH, p = o.p ?? 0.6, tmax = o.tmax ?? 12;
    const x0 = Math.max(0, Math.floor(cx - rx - tmax)), x1 = Math.min(this.w - 1, Math.ceil(cx + rx + tmax));
    const y0 = Math.max(0, Math.floor(cy - ry - tmax)), y1 = Math.min(this.h - 1, Math.ceil(cy + ry + tmax));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, rho = Math.sqrt(u * u + v * v) || 1e-6;
      const a = Math.atan2(v, u);
      const R = Math.hypot(rx * Math.cos(a), ry * Math.sin(a));
      const d = (rho - 1) * R, t = thick(a);
      if (Math.abs(d) >= t) continue;
      this._add(y * this.w + x, (o.base ?? 0) + hgt(a) * Math.pow(1 - (d / t) ** 2, p), mat);
    }
  }
  finalize() {
    const n = this.w * this.h, z = new Float32Array(n).fill(-1e9);
    for (let i = 0; i < n; i++) if (this.m[i] > -1e8) z[i] = this.m[i] + Math.log(this.s[i]) / this.k;
    this.z = z;
    return this;
  }
  /** Apply fn(x, y, z) → new z (or undefined) over a rect of defined pixels. */
  each(x0, y0, x1, y1, fn) {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(this.w - 1, Math.ceil(x1)); y1 = Math.min(this.h - 1, Math.ceil(y1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * this.w + x; if (this.z[i] < -1e8) continue;
      const r = fn(x, y, this.z[i], i); if (r !== undefined) this.z[i] = r;
    }
  }
  /** Lower the surface inside an ellipse (a pit the face is pressed into). */
  pit(cx, cy, rx, ry, depth, soft = 0.35) {
    this.each(cx - rx, cy - ry, cx + rx, cy + ry, (x, y, z) => {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, d = Math.sqrt(u * u + v * v);
      if (d >= 1) return;
      const t = d < 1 - soft ? 1 : (1 - d) / soft;
      return z - depth * t * t * (3 - 2 * t);
    });
  }
  /** Distance-based carving along a polyline. kind 'groove' (V/U groove) or 'fold' (step down on the right side of travel). */
  _polyOp(pts, r, depth, kind) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    const pad = kind === 'fold' ? r * 3 : r + 1;
    // precompute segments once (this runs for every pixel in the box)
    const n = pts.length - 1, seg = new Float64Array(n * 6);
    let total = 0;
    for (let k = 0; k < n; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
      seg.set([ax, ay, dx, dy, L2, total], k * 6); total += Math.sqrt(L2);
    }
    total = total || 1;
    const reach = kind === 'fold' ? r * 3 : r, reach2 = reach * reach;
    this.each(minX - pad, minY - pad, maxX + pad, maxY + pad, (x, y, z) => {
      const px = x + 0.5, py = y + 0.5;
      let best2 = 1e18, side = 0, tAlong = 0;
      for (let k = 0; k < n; k++) {
        const o = k * 6, ax = seg[o], ay = seg[o + 1], dx = seg[o + 2], dy = seg[o + 3], L2 = seg[o + 4];
        let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - ax - dx * t, ey = py - ay - dy * t, d2 = ex * ex + ey * ey;
        if (d2 < best2) { best2 = d2; side = (dx * ey - dy * ex) >= 0 ? 1 : -1; tAlong = (seg[o + 5] + t * Math.sqrt(L2)) / total; }
      }
      if (best2 >= reach2) return;
      const best = Math.sqrt(best2);
      const taper = Math.min(1, Math.min(tAlong, 1 - tAlong) * 5 + 0.05);
      if (kind === 'groove') {
        const q = 1 - best / r;
        return z - depth * q * q * taper;
      }
      // fold: the surface on the + side (right of travel; "below" for a left→right stroke) drops by
      // depth and recovers over 2r; a small lip bulges on the - side — an overhanging roll of flesh.
      const sd = side * best;
      const t = Math.max(0, Math.min(1, (sd + r * 0.3) / (r * 1.3)));
      let drop = depth * t * t * (3 - 2 * t);
      if (sd > r) drop *= Math.max(0, 1 - (sd - r) / (r * 2));
      const lip = sd < 0 && sd > -r ? depth * 0.35 * (1 + sd / r) : 0;
      return z - (drop - lip) * taper;
    });
  }
  groove(pts, r, depth) { this._polyOp(pts, r, depth, 'groove'); }
  fold(pts, r, depth) { this._polyOp(pts, r, depth, 'fold'); }
  /** Composite another finalized field: visible = max. */
  maxWith(o) { for (let i = 0; i < this.z.length; i++) if (o.z[i] > this.z[i]) { this.z[i] = o.z[i]; this.mat[i] = o.mat[i]; } }
  /** Write into a GBuf (normals from the surface). o: { mode, matFn(x,y,mat)→mat, zoff, clip } */
  toGB(gb, o = {}) {
    const { w, h, z } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, zc = z[i]; if (zc < -1e8) continue;
      if (o.clip && !o.clip(x, y)) continue;
      const zl = x > 0 && z[i - 1] > -1e8 ? z[i - 1] : zc, zr = x < w - 1 && z[i + 1] > -1e8 ? z[i + 1] : zc;
      const zu = y > 0 && z[i - w] > -1e8 ? z[i - w] : zc, zd = y < h - 1 && z[i + w] > -1e8 ? z[i + w] : zc;
      let gx = (zr - zl) * 0.5, gy = (zd - zu) * 0.5;
      // silhouette edge: steepen toward the outside
      if (zl === zc && x > 0 && z[i - 1] < -1e8) gx = Math.max(gx, 2); if (zr === zc && x < w - 1 && z[i + 1] < -1e8) gx = Math.min(gx, -2);
      if (zu === zc && y > 0 && z[i - w] < -1e8) gy = Math.max(gy, 2); if (zd === zc && y < h - 1 && z[i + w] < -1e8) gy = Math.min(gy, -2);
      const mat = o.matFn ? o.matFn(x, y, this.mat[i]) : this.mat[i];
      if (!mat) continue;
      gb._put(i, mat, -gx, -gy, 1, zc + (o.zoff || 0), { mode: o.mode || 'z', ao: 1, lum: 0 });
    }
  }
}

// ---------------------------------------------------------------------------------- lighting
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** Lighting rig. lights: { d:[x,y,z] } directional (toward light) | { p:[x,y,z], r } point. */
export function rig(def) {
  return {
    amb: 0.2, exposure: 1, gamma: 1, ditherScale: 1,
    shadowTint: '#ffffff', keyTint: '#ffffff', ...def,
    lights: (def.lights || []).map((l) => ({ i: 1, wrap: null, spec: 1, ...l, d: l.d ? norm3(l.d) : null })),
  };
}
const tintCache = new Map();
function tintedRamp(matId, alt, lr) {
  const key = `${matId}|${alt ? 1 : 0}|${lr.shadowTint}|${lr.keyTint}|${lr.tintMix ?? 1}`;
  let r = tintCache.get(key);
  if (r) return r;
  const md = MATS[matId], base = alt ? md.altRgb : md.rgb;
  const st = hexToRgb(lr.shadowTint), kt = hexToRgb(lr.keyTint);
  r = base.map((c, k) => {
    const t = base.length > 1 ? k / (base.length - 1) : 1;
    const tr = st[0] + (kt[0] - st[0]) * t, tg = st[1] + (kt[1] - st[1]) * t, tb = st[2] + (kt[2] - st[2]) * t;
    return [c[0] * tr / 255, c[1] * tg / 255, c[2] * tb / 255];
  });
  tintCache.set(key, r);
  return r;
}

/** Shade a GBuf to ImageData. opts: { ox, oy (bayer offset), bg: hex|null, focus: fn(x,y)→mult } */
export function shade(gb, lr, opts = {}) {
  const { w, h } = gb;
  const img = new ImageData(w, h);
  const d = img.data;
  const lights = lr.lights;
  const bo = opts.bayerX || 0, boy = opts.bayerY || 0;
  const bg = opts.bg ? hexToRgb(opts.bg) : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, m = gb.mat[i], o = i * 4;
    if (!m) { if (bg) { d[o] = bg[0]; d[o + 1] = bg[1]; d[o + 2] = bg[2]; d[o + 3] = 255; } continue; }
    const md = MATS[m];
    let nx = gb.nx[i], ny = gb.ny[i], nz = gb.nz[i];
    const tx = x + gb.tox, ty = y + gb.toy;
    if (md.bump) {
      const [sc, amp, sd] = md.bump;
      const hx = vnoise(tx + 1, ty, sc, sd) - vnoise(tx - 1, ty, sc, sd), hy = vnoise(tx, ty + 1, sc, sd) - vnoise(tx, ty - 1, sc, sd);
      nx -= hx * amp; ny -= hy * amp;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    }
    const px3 = x + 0.5, py3 = y + 0.5, pz3 = gb.z[i];
    let v = lr.amb, s = 0;
    for (const L of lights) {
      let lx, ly, lz, att = L.i;
      if (L.d) { lx = L.d[0]; ly = L.d[1]; lz = L.d[2]; }
      else {
        lx = L.p[0] - px3; ly = L.p[1] - py3; lz = L.p[2] - pz3;
        const dist = Math.hypot(lx, ly, lz) || 1; lx /= dist; ly /= dist; lz /= dist;
        const q = dist / L.r; att = L.i * Math.max(0, 1 - q * q) ** (L.fall ?? 1);
        if (L.cone) { // spot: angle from axis
          const c = -(lx * L.cone[0] + ly * L.cone[1] + lz * L.cone[2]);
          att *= Math.max(0, Math.min(1, (c - L.cone[3]) / (L.cone[4] || 0.1)));
        }
      }
      if (att <= 0) continue;
      if (L.sh) { // screen-space height-field shadow: march toward the light over the depth buffer
        const st = L.shStep || 1, l2 = (Math.hypot(lx, ly) || 1e-6) / st, sx = lx / l2, sy = ly / l2, sz = lz / l2;
        let cx = px3, cy = py3, cz = pz3 + (L.bias ?? 0.5);
        for (let k = 0; k < L.sh; k++) {
          cx += sx; cy += sy; cz += sz;
          const xi = cx | 0, yi = cy | 0;
          if (xi < 0 || yi < 0 || xi >= w || yi >= h) break;
          const j = yi * w + xi;
          if (gb.mat[j] && gb.z[j] > cz) { att *= L.shK ?? 0.3; break; }
        }
      }
      const wrap = L.wrap ?? md.wrap;
      const nd = nx * lx + ny * ly + nz * lz;
      const lam = Math.max(0, (nd + wrap) / (1 + wrap));
      v += lam * att;
      if (md.spec && L.spec) {
        const hx = lx, hy = ly, hz = lz + 1, hl = Math.hypot(hx, hy, hz) || 1;
        const nh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl);
        s += Math.pow(nh, md.shin) * md.spec * att * L.spec;
      }
    }
    if (lr.rim) { // silhouette rim (helps the mass read against darkness)
      const [rx, ry, ri] = lr.rim; const e = Math.max(0, nx * rx + ny * ry) * Math.pow(1 - Math.max(0, nz), 2);
      v += e * ri;
    }
    v = v * gb.ao[i];
    if (opts.focus) v *= opts.focus(x, y);
    v = v * lr.exposure + s * gb.ao[i] + gb.lum[i] + (md.tex ? md.tex(tx, ty) : 0);
    if (lr.gamma !== 1) v = v > 0 ? Math.pow(v, lr.gamma) : v;
    // ramp choice (alt mottling)
    let alt = false;
    if (md.alt) { const f = md.alt.f(tx, ty); if (f > 0 && BT[(ty + boy) & 3][(tx + bo) & 3] < f) alt = true; }
    const ramp = tintedRamp(m, alt, lr);
    const n = ramp.length;
    const damt = md.dith * lr.ditherScale;
    let k = Math.floor(v * (n - 1) + 0.5 + (BT[(y + boy) & 3][(x + bo) & 3] - 0.5) * damt);
    k = k < 0 ? 0 : k >= n ? n - 1 : k;
    const c = ramp[k];
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  return img;
}

/** Outline: transparent pixels touching opaque ones get `color`. inPlace on ImageData. */
export function outlineImg(img, color, { diagonal = false, alphaThr = 0 } = {}) {
  const { width: w, height: h, data: d } = img;
  const [r, g, b] = hexToRgb(color);
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > alphaThr ? 1 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (solid[i]) continue;
    let n = (x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w]);
    if (!n && diagonal) n = (x > 0 && y > 0 && solid[i - w - 1]) || (x < w - 1 && y > 0 && solid[i - w + 1]) || (x > 0 && y < h - 1 && solid[i + w - 1]) || (x < w - 1 && y < h - 1 && solid[i + w + 1]);
    if (n) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  }
  return img;
}

export function imgToCanvas(img) {
  const c = makeCanvas(img.width, img.height);
  ctxOf(c).putImageData(img, 0, 0);
  return c;
}
export { mix };
