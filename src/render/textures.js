// Procedural PBR texture generator. Produces tileable albedo / normal / ORM
// (R = ambient occlusion, G = roughness, B = metalness) data textures so the
// game ships with zero external image assets.
//
// Generators work on whole-texture float fields (fbm, worley, cracks,
// scratches, streaks...) built with tight typed-array loops, so a 512px
// material costs a few tens of milliseconds. Sizes are powers of two (bitmask
// wrapping); feature sizes are authored for 512 px and scale with the size.
import * as THREE from 'three';

let SIZE = 512;
export function setTextureSize(s) { SIZE = s; }

// Generation stats (per session; the level loader / tests read them).
export const texStats = { ms: 0, count: 0, byKind: {} };
if (typeof window !== 'undefined') window.__texStats = texStats;

// Everything inside texFactory() is self-contained (no references to the
// enclosing module) so the same code can run in Web Workers via toString().
function texFactory() {
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
// Local PRNG (mulberry32). Deliberately NOT core/math makeRng: those are
// registered for level-build rewinding and texture generation must not eat
// that registry or perturb level randomness.
function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Integer hash -> [0,1)
function ih(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- noise ----
// Point-sampled tileable value noise (kept for external users: crowd.js).
class Noise {
  constructor(seed) {
    const r = mulberry(seed);
    this.v = new Float32Array(512);
    this.p = new Uint16Array(512);
    const p = [];
    for (let i = 0; i < 256; i++) p.push(i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) {
      this.p[i] = p[i & 255];
      this.v[i] = r();
    }
  }
  lat(x, y) {
    return this.v[this.p[(this.p[x & 255] + y) & 255]];
  }
  value(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = this.lat(x0, y0), b = this.lat(x1, y0), c = this.lat(x0, y1), d = this.lat(x1, y1);
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
  }
  fbm(u, v, freq = 4, oct = 5, gain = 0.5) {
    let sum = 0, amp = 0.5, norm = 0, f = freq;
    for (let o = 0; o < oct; o++) {
      sum += amp * this.value(u * f, v * f, f);
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  }
  ridged(u, v, freq = 4, oct = 4) {
    let sum = 0, amp = 0.5, norm = 0, f = freq;
    for (let o = 0; o < oct; o++) {
      const n = 1 - Math.abs(this.value(u * f, v * f, f) * 2 - 1);
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
}

// Point-sampled tileable worley noise: returns [f1, f2, cellId]
function makeWorley(seed, n) {
  const r = mulberry(seed);
  const pts = new Float32Array(n * n * 2);
  const ids = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) { pts[i * 2] = r(); pts[i * 2 + 1] = r(); ids[i] = r(); }
  const out = [0, 0, 0];
  return (u, v) => {
    const x = u * n, y = v * n;
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox, cy = yi + oy;
      const k = (((cy % n) + n) % n) * n + (((cx % n) + n) % n);
      const dx = cx + pts[k * 2] - x, dy = cy + pts[k * 2 + 1] - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; id = ids[k]; } else if (d < f2) f2 = d;
    }
    out[0] = f1; out[1] = f2; out[2] = id;
    return out;
  };
}

// --------------------------------------------------------------- fields ----
// Tileable fbm field. fx, fy: integer base cell counts across the tile (use
// fx != fy for streaks/grain). Values ~[0,1] (clustered around 0.5; use eq()).
const _X0 = new Int32Array(2048), _X1 = new Int32Array(2048), _FX = new Float32Array(2048);
// Raw tileable fbm on an Rx x Ry grid.
function fbmRaw(Rx, Ry, seed, fx, fy, oct, gain) {
  const f = new Float32Array(Rx * Ry);
  const r = mulberry(seed * 7919 + 17);
  let amp = 1, norm = 0, px = Math.max(1, fx | 0), py = Math.max(1, fy | 0);
  for (let o = 0; o < oct; o++) {
    if (px > Rx || py > Ry) break;
    const lat = new Float32Array(px * py);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    const sx = px / Rx, sy = py / Ry;
    for (let x = 0; x < Rx; x++) {
      const t = (x + 0.5) * sx, xi = t | 0, fr = t - xi;
      _X0[x] = xi % px; _X1[x] = (xi + 1) % px; _FX[x] = fr * fr * (3 - 2 * fr);
    }
    // interpolate every lattice row along x once, then blend rows per pixel row
    const rows = new Float32Array(py * Rx);
    for (let ly = 0; ly < py; ly++) {
      const lr = ly * px, rr = ly * Rx;
      for (let x = 0; x < Rx; x++) { const a = lat[lr + _X0[x]]; rows[rr + x] = a + (lat[lr + _X1[x]] - a) * _FX[x]; }
    }
    for (let y = 0; y < Ry; y++) {
      const t = (y + 0.5) * sy, yi = t | 0, fr = t - yi, uy = fr * fr * (3 - 2 * fr);
      const r0 = (yi % py) * Rx, r1 = ((yi + 1) % py) * Rx, row = y * Rx;
      for (let x = 0; x < Rx; x++) { const a = rows[r0 + x]; f[row + x] += amp * (a + (rows[r1 + x] - a) * uy); }
    }
    norm += amp; amp *= gain; px *= 2; py *= 2;
  }
  const inv = 1 / norm;
  for (let i = 0; i < f.length; i++) f[i] *= inv;
  return f;
}
// Bilinear wrapped upsample Rx x Ry -> S x S (separable).
function upsample(f, Rx, Ry, S) {
  if (Rx === S && Ry === S) return f;
  const tmp = new Float32Array(Ry * S), out = new Float32Array(S * S);
  const X0 = new Int32Array(S), X1 = new Int32Array(S), FX = new Float32Array(S);
  const Y0 = new Int32Array(S), Y1 = new Int32Array(S), FY = new Float32Array(S);
  for (let x = 0; x < S; x++) {
    let t = (x + 0.5) * Rx / S - 0.5, xf = Math.floor(t); X0[x] = (xf + Rx) % Rx; X1[x] = (xf + 1) % Rx; FX[x] = t - xf;
    t = (x + 0.5) * Ry / S - 0.5; xf = Math.floor(t); Y0[x] = ((xf + Ry) % Ry) * S; Y1[x] = ((xf + 1) % Ry) * S; FY[x] = t - xf;
  }
  for (let y = 0; y < Ry; y++) { const ri = y * Rx, ro = y * S; for (let x = 0; x < S; x++) { const a = f[ri + X0[x]]; tmp[ro + x] = a + (f[ri + X1[x]] - a) * FX[x]; } }
  for (let y = 0; y < S; y++) { const r0 = Y0[y], r1 = Y1[y], fy = FY[y], ro = y * S; for (let x = 0; x < S; x++) { const a = tmp[r0 + x]; out[ro + x] = a + (tmp[r1 + x] - a) * fy; } }
  return out;
}
const resFor = (S, f, oct) => {
  let top = f, o = 1;
  while (o < oct && top * 2 <= S) { top *= 2; o++; }
  let R = S;
  while (R > 16 && R / 2 >= top * 2.5) R >>= 1;
  return R;
};
// Tileable fbm field at S x S. fx, fy: integer base cell counts across the
// tile (fx != fy for streaks/grain). Computed at the lowest resolution that
// resolves its top octave, then upsampled. Values ~[0,1] around 0.5 (eq()).
// High-frequency grain fields are generic: they are shared between textures
// (seed folded to 2 variants) through a small LRU. Callers must not modify them.
const grainMemo = new Map();
function fbm(S, seed, fx, fy = fx, oct = 5, gain = 0.5, equalise = false) {
  if (Math.min(fx, fy) >= 16 && !equalise) {
    const key = S + ':' + (seed & 1) + ':' + fx + ':' + fy + ':' + oct + ':' + gain;
    let f = grainMemo.get(key);
    if (f) { grainMemo.delete(key); grainMemo.set(key, f); return f; }
    f = fbmUncached(S, (seed & 1) + 7, fx, fy, oct, gain, false);
    grainMemo.set(key, f);
    if (grainMemo.size > 16) grainMemo.delete(grainMemo.keys().next().value);
    return f;
  }
  return fbmUncached(S, seed, fx, fy, oct, gain, equalise);
}
function fbmUncached(S, seed, fx, fy, oct, gain, equalise) {
  const Rx = resFor(S, fx, oct), Ry = resFor(S, fy, oct);
  const f = fbmRaw(Rx, Ry, seed, fx, fy, oct, gain);
  if (equalise) eq(f);
  return upsample(f, Rx, Ry, S);
}
// Low-frequency mask: fbm -> optional domain warp -> equalise, all at a
// reduced resolution (res, default 128), then upsampled. Thresholding the
// result with ss(1-coverage, ...) gives predictable coverage.
function mask(S, seed, freq, oct = 5, o = {}) {
  const R = Math.min(S, o.res ?? 128);
  let f = fbmRaw(R, R, seed, freq, o.fy ?? freq, oct, o.gain ?? 0.5);
  if (o.warp) {
    const wf = o.wf ?? 5;
    const w1 = fbmRaw(R, R, seed + 101, wf, wf, 3, 0.5), w2 = fbmRaw(R, R, seed + 102, wf, wf, 3, 0.5);
    f = warp(f, R, w1, w2, o.warp * R / 512);
  }
  eq(f);
  return upsample(f, R, R, S);
}
// Histogram-equalise in place -> ~uniform [0,1] so thresholds mean coverage.
function eq(f) {
  const B = 1024, hist = new Uint32Array(B), n = f.length;
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < n; i++) { const v = f[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const sc = (B - 1) / (mx - mn || 1);
  for (let i = 0; i < n; i++) hist[((f[i] - mn) * sc) | 0]++;
  const cdf = new Float32Array(B + 1);
  let acc = 0;
  for (let b = 0; b < B; b++) { acc += hist[b]; cdf[b + 1] = acc / n; }
  for (let i = 0; i < n; i++) {
    const t = (f[i] - mn) * sc, b = t | 0, fr = t - b;
    f[i] = cdf[b] + (cdf[b + 1] - cdf[b]) * fr;
  }
  return f;
}
// Separable wrapped box blur (radius in px), `passes` times (~gaussian).
function blur(src, S, rad, passes = 1) {
  rad = Math.max(1, Math.round(rad));
  const M = S - 1, n = S * S, w = 1 / (rad * 2 + 1);
  let a = Float32Array.from(src);
  const tmp = new Float32Array(n);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < S; y++) {
      const row = y * S;
      let acc = 0;
      for (let k = -rad; k <= rad; k++) acc += a[row + (k & M)];
      for (let x = 0; x < S; x++) {
        tmp[row + x] = acc * w;
        acc += a[row + ((x + rad + 1) & M)] - a[row + ((x - rad) & M)];
      }
    }
    for (let x = 0; x < S; x++) {
      let acc = 0;
      for (let k = -rad; k <= rad; k++) acc += tmp[(k & M) * S + x];
      for (let y = 0; y < S; y++) {
        a[y * S + x] = acc * w;
        acc += tmp[((y + rad + 1) & M) * S + x] - tmp[((y - rad) & M) * S + x];
      }
    }
  }
  return a;
}
// Bilinear wrapped sample (pixel coords).
function samp(f, S, x, y) {
  const M = S - 1;
  x -= 0.5; y -= 0.5;
  const xf = Math.floor(x), yf = Math.floor(y);
  const fx = x - xf, fy = y - yf;
  const x0 = xf & M, x1 = (xf + 1) & M, y0 = (yf & M) * S, y1 = ((yf + 1) & M) * S;
  const a = f[y0 + x0], b = f[y0 + x1], c = f[y1 + x0], d = f[y1 + x1];
  const t = a + (b - a) * fx;
  return t + (c + (d - c) * fx - t) * fy;
}
// Domain warp: new field sampled at p + (du,dv - 0.5) * amt px.
function warp(f, S, du, dv, amt) {
  const out = new Float32Array(S * S), M = S - 1;
  for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
    const sx = x + (du[i] - 0.5) * amt, sy = y + (dv[i] - 0.5) * amt;
    const xf = Math.floor(sx), yf = Math.floor(sy), fx = sx - xf, fy = sy - yf;
    const x0 = xf & M, x1 = (xf + 1) & M, y0 = (yf & M) * S, y1 = ((yf + 1) & M) * S;
    const a = f[y0 + x0], b = f[y0 + x1], c = f[y1 + x0], d = f[y1 + x1];
    const t = a + (b - a) * fx;
    out[i] = t + (c + (d - c) * fx - t) * fy;
  }
  return out;
}
// Tileable worley: {f1, f2, id} with distances in cell units.
function worley(S, seed, n) {
  const r = mulberry(seed * 31 + 7);
  const PX = new Float32Array(n * n), PY = new Float32Array(n * n), ID = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) { PX[i] = r(); PY[i] = r(); ID[i] = r(); }
  const N = S * S, F1 = new Float32Array(N), F2 = new Float32Array(N), IDS = new Float32Array(N);
  const cs = n / S;
  const wrap = new Int32Array(n + 3);
  for (let k = -1; k <= n + 1; k++) wrap[k + 1] = ((k % n) + n) % n;
  const XI = new Int32Array(S), GX = new Float32Array(S);
  for (let x = 0; x < S; x++) { GX[x] = (x + 0.5) * cs; XI[x] = GX[x] | 0; }
  for (let y = 0, i = 0; y < S; y++) {
    const gy = (y + 0.5) * cs, yi = gy | 0;
    const rb0 = wrap[yi] * n, rb1 = wrap[yi + 1] * n, rb2 = wrap[yi + 2] * n;
    const dy0 = yi - 1 - gy, dy1 = yi - gy, dy2 = yi + 1 - gy;
    for (let x = 0; x < S; x++, i++) {
      const gx = GX[x], xi = XI[x];
      const c0 = wrap[xi], c1 = wrap[xi + 1], c2 = wrap[xi + 2];
      const dx0 = xi - 1 - gx, dx1 = xi - gx, dx2 = xi + 1 - gx;
      let f1 = 9, f2 = 9, idv = 0;
      for (let oy = 0; oy < 3; oy++) {
        const rb = oy === 0 ? rb0 : oy === 1 ? rb1 : rb2, ddy = oy === 0 ? dy0 : oy === 1 ? dy1 : dy2;
        let k = rb + c0, ex = dx0 + PX[k], ey = ddy + PY[k], d = ex * ex + ey * ey;
        if (d < f1) { f2 = f1; f1 = d; idv = ID[k]; } else if (d < f2) f2 = d;
        k = rb + c1; ex = dx1 + PX[k]; ey = ddy + PY[k]; d = ex * ex + ey * ey;
        if (d < f1) { f2 = f1; f1 = d; idv = ID[k]; } else if (d < f2) f2 = d;
        k = rb + c2; ex = dx2 + PX[k]; ey = ddy + PY[k]; d = ex * ex + ey * ey;
        if (d < f1) { f2 = f1; f1 = d; idv = ID[k]; } else if (d < f2) f2 = d;
      }
      F1[i] = Math.sqrt(f1); F2[i] = Math.sqrt(f2); IDS[i] = idv;
    }
  }
  return { f1: F1, f2: F2, id: IDS };
}
// Soft anti-aliased disc stamp into a field (max blend), wrapping.
function stamp(f, S, x, y, rad, val = 1) {
  const M = S - 1, r = Math.max(0.35, rad), ri = Math.ceil(r + 1);
  const xi = Math.floor(x), yi = Math.floor(y);
  for (let oy = -ri; oy <= ri; oy++) {
    const dy = yi + oy + 0.5 - y, row = ((yi + oy) & M) * S;
    for (let ox = -ri; ox <= ri; ox++) {
      const dx = xi + ox + 0.5 - x;
      let k = r + 0.5 - Math.sqrt(dx * dx + dy * dy);
      if (k <= 0) continue;
      k = (k > 1 ? 1 : k) * val;
      const i = row + ((xi + ox) & M);
      if (k > f[i]) f[i] = k;
    }
  }
}
function line(f, S, x0, y0, x1, y1, w, val = 1) {
  const len = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.ceil(len * 1.5));
  for (let s = 0; s <= steps; s++) { const t = s / steps; stamp(f, S, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w, val); }
}
// Scattered discs (pores, gum, pebbles...): count per tile, radius range in 512-px units.
function spots(S, seed, count, r0, r1) {
  const f = new Float32Array(S * S), r = mulberry(seed * 19 + 11), P = S / 512;
  for (let k = 0; k < count; k++) { const rad = (r0 + (r1 - r0) * r() * r()) * P; stamp(f, S, r() * S, r() * S, rad, 1); }
  return f;
}
// Wandering branching cracks (mask 0..1).
function crackField(S, seed, count, o = {}) {
  const f = new Float32Array(S * S), r = mulberry(seed * 13 + 5), P = S / 512;
  const wig = o.wiggle ?? 0.45, W = (o.width ?? 0.9) * P;
  const walk = (x, y, ang, len, w, depth) => {
    for (let t = 0; t < len; t++) {
      ang += (r() - 0.5) * wig;
      x += Math.cos(ang) * P; y += Math.sin(ang) * P;
      stamp(f, S, x, y, w * (1 - (t / len) * 0.75), 1);
      if (depth < 2 && r() < 0.014) walk(x, y, ang + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.9), len * (0.25 + r() * 0.35), w * 0.7, depth + 1);
    }
  };
  for (let c = 0; c < count; c++) walk(r() * S, r() * S, r() * Math.PI * 2, (o.len ?? 1) * (70 + r() * 220), W * (0.7 + r() * 0.6), 0);
  return f;
}
// Scratch field: short straight-ish strokes clustered around a few directions.
function scratchField(S, seed, count, o = {}) {
  const f = new Float32Array(S * S), r = mulberry(seed * 17 + 3), P = S / 512;
  const dirs = o.dirs ?? [r() * Math.PI, r() * Math.PI];
  for (let c = 0; c < count; c++) {
    const a = r() < (o.random ?? 0.3) ? r() * Math.PI * 2 : dirs[(r() * dirs.length) | 0] + (r() - 0.5) * 0.3;
    const len = ((o.len ?? 40) * (0.3 + r() * 1.4)) * P;
    const x = r() * S, y = r() * S, bend = (r() - 0.5) * 0.4;
    const w = (o.width ?? 0.5) * P * (0.6 + r() * 0.8), val = 0.35 + r() * 0.65;
    let px = x, py = y, ang = a;
    const n = Math.ceil(len / 2);
    for (let k = 0; k < n; k++) {
      const nx = px + Math.cos(ang) * 2, ny = py + Math.sin(ang) * 2;
      line(f, S, px, py, nx, ny, w * (1 - Math.abs(k / n - 0.5)), val);
      px = nx; py = ny; ang += bend / n;
    }
  }
  return f;
}
// Run a mask "downhill" (world down = decreasing texel row) like rust/water
// runs: streak = max(mask, streak above * decay). colVar varies decay per column.
function bleedDown(m, S, decay, colVar = null) {
  const out = Float32Array.from(m), M = S - 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = S - 1; y >= 0; y--) {
      const row = y * S, up = ((y + 1) & M) * S;
      for (let x = 0; x < S; x++) {
        const d = colVar ? decay + (1 - decay) * 0.9 * (colVar[x] - 0.5) * 2 : decay;
        const v = out[up + x] * Math.min(0.999, d);
        if (v > out[row + x]) out[row + x] = v;
      }
    }
  }
  return out;
}
function colNoise(S, seed, cells = 64) {
  const f = fbm(S, seed, cells, 1, 3);
  const out = new Float32Array(S);
  for (let x = 0; x < S; x++) out[x] = f[x];
  eq(out);
  return out;
}

// ------------------------------------------------------------- canvas ----
class TexData {
  constructor(size) {
    this.size = size;
    const n = size * size;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.h = new Float32Array(n);
    this.rough = new Float32Array(n).fill(0.8);
    this.metal = new Float32Array(n);
    this.ao = new Float32Array(n).fill(1);
    this.a = null; // optional alpha
  }
  each(fn) {
    const s = this.size;
    for (let y = 0; y < s; y++) {
      const v = (y + 0.5) / s;
      for (let x = 0; x < s; x++) fn((x + 0.5) / s, v, y * s + x, x, y);
    }
  }
  set(i, r, g, b) { this.r[i] = r; this.g[i] = g; this.b[i] = b; }
  mix(i, c, k) {
    this.r[i] += (c[0] - this.r[i]) * k;
    this.g[i] += (c[1] - this.g[i]) * k;
    this.b[i] += (c[2] - this.b[i]) * k;
  }
  mul(i, k) { this.r[i] *= k; this.g[i] *= k; this.b[i] *= k; }
}

const b8 = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0);

function buildArrays(td, opts = {}) {
  const S = td.size, M = S - 1, n = S * S;
  const alb = new Uint8ClampedArray(n * 4), nor = new Uint8ClampedArray(n * 4), orm = new Uint8ClampedArray(n * 4);
  const strength = (opts.normalStrength ?? 3.0) * (S / 256) * 0.25;
  const aoStrength = opts.aoStrength ?? 1.0;
  const bake = opts.bakeAO ?? 0.45;
  const h = td.h, TR = td.r, TG = td.g, TB = td.b, TA = td.a, RO = td.rough, ME = td.metal, AO = td.ao;
  // cavity AO: height vs its local average (fine radius at full res, wide radius at 1/4 res)
  const b1 = blur(h, S, 3 * S / 512 + 1, 1);
  const Q = S >> 2, low = new Float32Array(Q * Q);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) low[(y >> 2) * Q + (x >> 2)] += h[y * S + x] * 0.0625;
  const b2 = upsample(blur(low, Q, 3, 1), Q, Q, S);
  for (let y = 0; y < S; y++) {
    const y0 = y * S, ym = ((y - 1) & M) * S, yp = ((y + 1) & M) * S;
    for (let x = 0; x < S; x++) {
      const i = y0 + x, xm = (x - 1) & M, xp = (x + 1) & M;
      const tl = h[yp + xm], t = h[yp + x], tr = h[yp + xp], l = h[y0 + xm], r = h[y0 + xp], bl = h[ym + xm], bb = h[ym + x], br = h[ym + xp];
      const dx = (tr + 2 * r + br - tl - 2 * l - bl) * strength;
      const dy = (tl + 2 * t + tr - bl - 2 * bb - br) * strength;
      const il = 127.5 / Math.sqrt(dx * dx + dy * dy + 1);
      const j = i << 2;
      nor[j] = 127.5 - dx * il;
      nor[j + 1] = 127.5 - dy * il;
      nor[j + 2] = 127.5 + il;
      nor[j + 3] = 255;
      let cav = 1 - ((b1[i] - h[i]) * 3 + (b2[i] - h[i]) * 1.5) * aoStrength;
      cav = (cav < 0.2 ? 0.2 : cav > 1 ? 1 : cav) * AO[i];
      const ab = (1 - (1 - cav) * bake) * 255;
      alb[j] = TR[i] * ab;
      alb[j + 1] = TG[i] * ab;
      alb[j + 2] = TB[i] * ab;
      alb[j + 3] = TA ? TA[i] * 255 : 255;
      const ro = RO[i];
      orm[j] = cav * 255;
      orm[j + 1] = (ro < 0.03 ? 0.03 : ro) * 255;
      orm[j + 2] = ME[i] * 255;
      orm[j + 3] = 255;
    }
  }
  return { alb, nor, orm };
}

// ------------------------------------------------------------ helpers ----
const hex = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const scl = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Paint-masked textures: the paintable layer is generated in neutral grey
// (level n0) and its coverage stored in the albedo alpha; the material shader
// multiplies it by the material's paint colour (see materials.js).
function paintBase(td, o, def, n0 = 1) {
  if (!o.paint) return hex(o.color ?? def);
  td.a = new Float32Array(td.size * td.size).fill(1);
  td.paintN0 = n0;
  return [n0, n0, n0];
}

// Blotchy stains (dark, slightly less rough).
function stains(td, seed, amount = 0.35, freq = 3, color = [0.18, 0.15, 0.1]) {
  if (amount <= 0) return;
  const S = td.size, N = S * S;
  const f = mask(S, seed + 90, freq, 5, { warp: 40 });
  for (let i = 0; i < N; i++) {
    const k = ss(0.7, 0.9, f[i]) * amount;
    if (k <= 0) continue;
    td.mix(i, color, k * 0.6);
    if (td.a) td.a[i] *= 1 - k * 0.9;
    td.rough[i] += (0.62 - td.rough[i]) * k * 0.4;
  }
}
function applyCracks(td, cf, dark = 0.55, depth = 0.4, halo = true) {
  const S = td.size, N = S * S;
  const hb = halo ? blur(cf, S, 2 * S / 512 + 1, 1) : null;
  for (let i = 0; i < N; i++) {
    const k = cf[i];
    const hk = hb ? hb[i] * 0.35 : 0;
    if (k <= 0 && hk <= 0.001) continue;
    td.mul(i, 1 - dark * k - hk * 0.4);
    td.h[i] -= depth * k + hk * 0.1;
    td.rough[i] += 0.08 * k;
  }
}
// Vertical grime/water streaks (world-down). Returns mask 0..1.
function streakMask(S, seed, amount, density = 0.5) {
  const st = fbm(S, seed, 40, 3, 3, 0.5, true);
  const reg = mask(S, seed + 1, 3, 3, { fy: 2 });
  const out = new Float32Array(S * S);
  const t0 = 1 - density * 0.5;
  for (let i = 0; i < out.length; i++) out[i] = ss(t0, 1.0, st[i]) * ss(0.35, 0.8, reg[i]) * amount;
  return out;
}

// ---------------------------------------------------------- generators ----
const GEN = {
  concrete(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 11;
    const base = hex(o.color ?? 0x8a8782);
    const big = mask(S, sd, 2, 5);
    const mid = fbm(S, sd + 1, 8, 8, 4);
    const fine = fbm(S, sd + 2, 64, 64, 3);
    const grain = fbm(S, sd + 3, S >> 1, S >> 1, 1);
    const pores = spots(S, sd + 4, 170, 0.5, 2.6);
    const sk = streakMask(S, sd + 5, o.streaks ?? 0.5, 0.55);
    const stainF = mask(S, sd + 7, 3, 5, { warp: 40 });
    const stainAmt = o.stain ?? 0.35, oilAmt = o.oil ?? 0;
    const sc = hex(o.stainColor ?? 0x3a352d);
    const oilF = oilAmt > 0 ? mask(S, sd + 8, 6, 5, { warp: 40, res: 256 }) : null;
    const oilT = 1 - oilAmt * 0.1;
    for (let i = 0; i < N; i++) {
      const pore = pores[i];
      const g = grain[i];
      let tone = 0.84 + (big[i] - 0.5) * 0.26 + (mid[i] - 0.5) * 0.16 + (fine[i] - 0.5) * 0.12 + (g - 0.5) * 0.12;
      if (g > 0.8) tone *= 1.05; else if (g < 0.18) tone *= 0.92;
      tone *= 1 - pore * 0.4;
      td.set(i, base[0] * tone, base[1] * tone, base[2] * tone);
      const st = ss(0.6, 0.92, stainF[i]) * stainAmt;
      const k = Math.min(1, sk[i] * 0.4 + st * 0.6);
      if (k > 0) td.mix(i, scl(sc, 0.6 + tone * 0.4), k);
      td.h[i] = big[i] * 0.12 + mid[i] * 0.3 + fine[i] * 0.28 + g * 0.14 - pore * 0.55;
      td.rough[i] = 0.9 + (fine[i] - 0.5) * 0.14 - sk[i] * 0.08 + pore * 0.05;
      if (oilF) {
        const ok = ss(oilT, oilT + 0.06, oilF[i]);
        if (ok > 0) { td.mul(i, 1 - ok * 0.38); td.rough[i] += (0.38 - td.rough[i]) * ok; }
      }
    }
    if (o.formwork) formwork(td, sd);
    if (o.cracks !== false) applyCracks(td, crackField(S, sd + 9, o.crackCount ?? 5, { width: 0.8 }), 0.5, 0.45);
  },
  plaster(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 21;
    const base = paintBase(td, o, 0xd8d2c4);
    const under = hex(o.under ?? 0xa9ae9c);
    const bare = [0.64, 0.61, 0.55];
    const mott = mask(S, sd, 3, 5);
    const roller = fbm(S, sd + 1, 128, 128, 2);
    const fine = fbm(S, sd + 2, 32, 32, 3);
    const pm = mask(S, sd + 5, 4, 6, { warp: 70, gain: 0.6 });
    const grimeF = mask(S, sd + 6, 3, 5, { warp: 50 });
    const sk = streakMask(S, sd + 7, 1, 0.45);
    const tide = mask(S, sd + 9, 2, 5, { warp: 60 });
    const grime = o.grime ?? 0.5, stain = o.stain ?? 0.22, peel = o.peel ?? 0.05;
    const t1 = 1 - peel, t2 = 1 - peel * 0.45;
    const rough0 = o.gloss ?? 0.82;
    const gc = [0.34, 0.3, 0.24], dc = [0.42, 0.37, 0.29], ring = [0.44, 0.35, 0.22];
    for (let i = 0; i < N; i++) {
      const p = pm[i] + (fine[i] - 0.5) * 0.02;
      const peel1 = ss(t1, t1 + 0.004, p), peel2 = ss(t2, t2 + 0.004, p);
      const lip = ss(t1 - 0.025, t1, p) * (1 - peel1);
      const tone = 0.93 + (mott[i] - 0.5) * 0.1 + (roller[i] - 0.5) * 0.05 + (fine[i] - 0.5) * 0.04;
      let r = base[0] * tone, g = base[1] * tone, b = base[2] * tone;
      if (peel1 > 0) {
        const ut = 0.85 + fine[i] * 0.25;
        r += (under[0] * ut - r) * peel1; g += (under[1] * ut - g) * peel1; b += (under[2] * ut - b) * peel1;
        const bt = 0.8 + fine[i] * 0.35;
        r += (bare[0] * bt - r) * peel2; g += (bare[1] * bt - g) * peel2; b += (bare[2] * bt - b) * peel2;
        const sh = ss(t1 + 0.01, t1, p) * peel1;
        const k = 1 - 0.25 * sh; r *= k; g *= k; b *= k;
      }
      const lk = 1 + lip * 0.05; r *= lk; g *= lk; b *= lk;
      td.set(i, r, g, b);
      const gk = ss(0.68, 1.0, grimeF[i]) * grime * 0.32;
      if (gk > 0) td.mix(i, gc, gk);
      const dk = sk[i] * grime * 0.4;
      if (dk > 0) td.mix(i, dc, dk);
      const tv = tide[i];
      if (tv > 0.86 && stain > 0) {
        const inside = ss(0.89, 0.91, tv) * stain * 1.1;
        const rg = ss(0.875, 0.895, tv) * ss(0.925, 0.905, tv) * stain * 1.2;
        td.r[i] *= 1 - inside * 0.06; td.g[i] *= 1 - inside * 0.13; td.b[i] *= 1 - inside * 0.3;
        td.mix(i, ring, Math.min(1, rg));
        if (td.a) td.a[i] *= 1 - Math.min(1, rg * 1.4 + inside * 0.3);
      }
      if (td.a) td.a[i] *= (1 - peel1) * (1 - Math.min(1, gk * 1.6 + dk * 1.6));
      td.h[i] = 0.55 + roller[i] * 0.05 + fine[i] * 0.05 + mott[i] * 0.03 + lip * 0.12 - peel1 * 0.07 - peel2 * 0.04 + peel2 * fine[i] * 0.06;
      td.rough[i] = rough0 + (roller[i] - 0.5) * 0.08 + (0.93 - rough0) * peel1 + gk * 0.1;
    }
    if (o.cracks) applyCracks(td, crackField(S, sd + 10, 5, { width: 0.6, wiggle: 0.6 }), 0.5, 0.3);
  },
  wallpaper(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 31;
    const a = hex(o.color ?? 0x8c7a5a), b = hex(o.color2 ?? 0x6e5c40);
    const pattern = o.pattern ?? ['damask', 'floral', 'stripe'][sd % 3];
    const acc = hex(o.accent ?? 0xb8a060), leaf = hex(o.leaf ?? 0x55603c);
    const fibre = fbm(S, sd + 1, 128, 128, 2);
    const mott = mask(S, sd + 2, 3, 5);
    const w1 = fbm(S, sd + 3, 5, 5, 3), w2 = fbm(S, sd + 4, 5, 5, 3);
    const tide = mask(S, sd + 5, 2, 5, { warp: 70 });
    const peelF = mask(S, sd + 6, 6, 5, { warp: 40, fy: 3 });
    const fine = fbm(S, sd + 7, 64, 64, 2);
    const seams = o.seams ?? 4;
    const cx = o.motifs ?? 4, cy = Math.max(1, Math.round(cx * 1.25));
    const stripes = o.stripes ?? 10;
    const seamPeel = []; for (let k = 0; k < seams; k++) seamPeel.push(ih(sd, k, 9) < 0.4 ? 0.012 + ih(sd, k, 3) * 0.022 : 0);
    const cov = [0, 0, 0];
    const pixC = 1.5 / (S / cx);
    const damage = o.damage ?? 0.6;
    for (let y = 0, i = 0; y < S; y++) {
      const v = (y + 0.5) / S;
      for (let x = 0; x < S; x++, i++) {
        const u = (x + 0.5) / S;
        cov[0] = cov[1] = cov[2] = 0;
        // slight print misregistration wobble
        const pu = u + (w1[i] - 0.5) * 0.002, pv = v + (w2[i] - 0.5) * 0.002;
        if (pattern === 'stripe') {
          const su = (pu * stripes) % 1;
          const band = su < 0.42 ? 1 : 0;
          cov[0] = band;
          const pin = Math.min(Math.abs(su - 0.5), Math.abs(su - 0.94));
          cov[1] = ss(0.012, 0.004, pin);
          // tiny motif dots in the ground band
          const mv = (pv * stripes * 2) % 1;
          const dd = Math.hypot((su - 0.7) * 2.2, (mv - 0.5));
          cov[2] = ss(0.16, 0.12, dd);
        } else {
          const col = Math.floor(pu * cx);
          const off = (col & 1) ? 0.5 : 0;
          let lx = pu * cx - col - 0.5;
          let ly = ((pv * cy + off) % 1) - 0.5;
          if (pattern === 'damask') {
            const d = damaskSDF(Math.abs(lx), ly);
            cov[0] = ss(pixC, -pixC, d);
          } else {
            const row = Math.floor(pv * cy + off);
            const rr = ih(col, row, sd);
            const fl = floralSDF(lx, ly, rr);
            cov[0] = ss(pixC, -pixC, fl[0]);
            cov[1] = ss(pixC, -pixC, fl[1]);
            cov[2] = ss(pixC, -pixC, fl[2]);
          }
        }
        const tone = 0.92 + (mott[i] - 0.5) * 0.12 + (fibre[i] - 0.5) * 0.06;
        let r = a[0], g = a[1], bl = a[2];
        if (pattern === 'floral') {
          r += (leaf[0] - r) * cov[1]; g += (leaf[1] - g) * cov[1]; bl += (leaf[2] - bl) * cov[1];
          r += (b[0] - r) * cov[0]; g += (b[1] - g) * cov[0]; bl += (b[2] - bl) * cov[0];
          r += (acc[0] - r) * cov[2]; g += (acc[1] - g) * cov[2]; bl += (acc[2] - bl) * cov[2];
        } else {
          r += (b[0] - r) * cov[0]; g += (b[1] - g) * cov[0]; bl += (b[2] - bl) * cov[0];
          r += (acc[0] - r) * cov[1]; g += (acc[1] - g) * cov[1]; bl += (acc[2] - bl) * cov[1];
          r += (b[0] * 0.85 - r) * cov[2]; g += (b[1] * 0.85 - g) * cov[2]; bl += (b[2] * 0.85 - bl) * cov[2];
        }
        r *= tone; g *= tone; bl *= tone;
        // fading (sun-bleached, desaturated patches)
        const fade = ss(0.35, 0.05, mott[i]) * 0.35;
        const lum = r * 0.3 + g * 0.55 + bl * 0.15;
        r += (lum * 1.08 - r) * fade; g += (lum * 1.06 - g) * fade; bl += (lum - bl) * fade;
        let h = 0.5 + (cov[0] + cov[1]) * 0.06 + fibre[i] * 0.05;
        let rough = 0.78 - cov[0] * 0.12;
        // roll seams + peeling strips near some seams
        const su = u * seams, sk = Math.round(su) % seams, sdist = Math.abs(su - Math.round(su)) / seams; // tile units
        const seamLine = ss(1.2 / S, 0.3 / S, sdist);
        if (seamLine > 0) { r *= 1 - 0.25 * seamLine; g *= 1 - 0.25 * seamLine; bl *= 1 - 0.25 * seamLine; h -= 0.1 * seamLine; }
        const pw = seamPeel[(sk + seams) % seams];
        if (pw > 0 && damage > 0) {
          const lim = pw * (0.3 + peelF[i] * 1.2) * damage;
          const pk = ss(lim, lim - 1.2 / S, sdist) * ss(0.35, 0.55, peelF[i]);
          if (pk > 0) {
            const pl = 0.62 + fine[i] * 0.12;
            r += (pl - r) * pk; g += (pl * 0.96 - g) * pk; bl += (pl * 0.88 - bl) * pk;
            h -= 0.08 * pk; rough += (0.93 - rough) * pk;
          }
          const edge = ss(lim + 3 / S, lim, sdist) * (1 - pk) * ss(0.35, 0.55, peelF[i]);
          if (edge > 0) { h += 0.08 * edge; r *= 1 + 0.08 * edge; g *= 1 + 0.08 * edge; bl *= 1 + 0.08 * edge; }
        }
        // water damage: yellowed patches with brown tide marks + mould specks
        const tv = tide[i];
        if (tv > 0.8 && damage > 0) {
          const inside = ss(0.845, 0.875, tv) * damage;
          const ringK = ss(0.83, 0.85, tv) * ss(0.885, 0.865, tv) * damage;
          r *= 1 - inside * 0.1; g *= 1 - inside * 0.2; bl *= 1 - inside * 0.4;
          r += (0.36 - r) * ringK * 0.8; g += (0.26 - g) * ringK * 0.8; bl += (0.14 - bl) * ringK * 0.8;
          const mould = inside * ss(0.72, 0.9, fine[i]) * ss(0.86, 0.95, tv);
          r += (0.1 - r) * mould; g += (0.11 - g) * mould; bl += (0.08 - bl) * mould;
          rough += 0.08 * inside;
        }
        td.set(i, r, g, bl);
        td.h[i] = h;
        td.rough[i] = rough;
      }
    }
    stains(td, sd, o.stain ?? 0.3, 2, [0.25, 0.2, 0.12]);
  },
  brick(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 41;
    const rows = o.rows ?? 26, cols = o.cols ?? 9;
    const base = paintBase(td, o, 0x7a3a2a, 0.8), mc = hex(o.mortarColor ?? 0x9a948a);
    const bh = S / rows, bw = S / cols;
    const mHalf = (o.mortar ?? 0.0045) * S * 0.5 + 0.35;
    const bevel = 2.2 * P;
    const chipN = fbm(S, sd + 1, 48, 48, 3);
    const chipBig = fbm(S, sd + 2, 24, 24, 3, 0.5, true);
    const mott = fbm(S, sd + 3, 16, 16, 4);
    const fine = fbm(S, sd + 4, S >> 1, S >> 1, 1);
    const sand = fbm(S, sd + 5, 128, 128, 2);
    const soot = streakMask(S, sd + 6, o.soot ?? 0.5, 0.5);
    const eff = mask(S, sd + 7, 4, 5, { fy: 3 });
    const effAmt = o.efflo ?? 0.35;
    const pal = [
      base,
      [base[0] * 1.12, base[1] * 0.96, base[2] * 0.86],
      [base[0] * 0.78, base[1] * 0.74, base[2] * 0.74],
      [base[0] * 1.14, base[1] * 1.1, base[2] * 1.04],
      [base[0] * 0.95, base[1] * 0.85, base[2] * 0.82],
      [base[0] * 0.5, base[1] * 0.46, base[2] * 0.48],
    ];
    const mortarMask = new Float32Array(N);
    for (let y = 0, i = 0; y < S; y++) {
      const fy = (y + 0.5) / bh, row = Math.floor(fy), lv = fy - row;
      const off = (row & 1) ? 0.5 : 0;
      const dy = Math.min(lv, 1 - lv) * bh;
      for (let x = 0; x < S; x++, i++) {
        const cu = (x + 0.5) / bw + off, colR = Math.floor(cu), lu = cu - colR;
        const col = ((colR % cols) + cols) % cols;
        const dx = Math.min(lu, 1 - lu) * bw;
        const rc = 1.4 * P;
        let d = (dx < rc && dy < rc) ? rc - Math.hypot(rc - dx, rc - dy) : Math.min(dx, dy);
        const hb = ih(row % rows, col, sd), hb2 = ih(col, row % rows, sd + 1);
        // irregular / chipped edges
        d -= mHalf + (chipN[i] - 0.5) * 1.6 * P + ss(0.72, 0.95, chipBig[i]) * (1 + hb2 * 2.5) * P * ss(5 * P, 0, d);
        if (d <= 0) {
          const t = 0.78 + sand[i] * 0.35;
          td.set(i, mc[0] * t, mc[1] * t, mc[2] * t);
          td.h[i] = 0.12 + sand[i] * 0.12 + Math.max(-0.1, d * 0.02);
          td.rough[i] = 0.96;
          mortarMask[i] = 1;
          if (td.a) td.a[i] = 0;
        } else {
          const pi = hb < 0.34 ? 0 : hb < 0.55 ? 1 : hb < 0.72 ? 2 : hb < 0.86 ? 3 : hb < 0.97 ? 4 : 5;
          const c = pal[pi];
          let t = 0.9 + (hb2 - 0.5) * 0.18 + (mott[i] - 0.5) * 0.3 + (fine[i] - 0.5) * 0.12;
          if (fine[i] > 0.84) t *= 0.8; // dark specks
          td.set(i, c[0] * t, c[1] * t, c[2] * t);
          const e = ss(0, bevel, d);
          td.h[i] = 0.45 + e * 0.35 + (mott[i] - 0.5) * 0.12 + fine[i] * 0.05 - (fine[i] > 0.86 ? 0.06 : 0);
          td.rough[i] = pi === 5 ? 0.55 : 0.84 + (mott[i] - 0.5) * 0.1;
          mortarMask[i] = 1 - e;
        }
      }
    }
    const near = blur(mortarMask, S, 3 * P + 1, 1);
    const effC = [0.86, 0.85, 0.8], sootC = [0.06, 0.055, 0.05];
    for (let i = 0; i < N; i++) {
      const sk = soot[i];
      if (sk > 0) { td.mix(i, sootC, sk * 0.55); td.rough[i] -= sk * 0.05; if (td.a) td.a[i] *= 1 - sk * 0.55; }
      const ek = ss(0.7, 0.95, eff[i]) * effAmt * (0.35 + near[i] * 0.9) * (0.6 + sand[i] * 0.6);
      if (ek > 0) { td.mix(i, effC, Math.min(0.75, ek)); if (td.a) td.a[i] *= 1 - Math.min(0.75, ek); td.rough[i] = Math.max(td.rough[i], 0.95 * ek + td.rough[i] * (1 - ek)); }
    }
    stains(td, sd, o.stain ?? 0.4, 2, [0.1, 0.09, 0.08]);
  },
  tiles(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 51;
    const cu = o.cols ?? 8, cv = o.rows ?? 8;
    const a = hex(o.color ?? 0xe8e6e0), b2 = hex(o.color2 ?? o.color ?? 0xe8e6e0), g = hex(o.groutColor ?? 0x6a665e);
    const brickOff = o.offset ?? 0;
    const gHalf = Math.max(0.6, (o.grout ?? 0.006) * S * 0.5);
    const tw = S / cu, th = S / cv;
    const cushion = Math.min(tw, th) * (o.cushion ?? 0.12); // edge roll-off (floor tiles: small)
    const tVar = o.tileVar ?? 0.08; // per-tile shade variation (fired-clay batches)
    const glaze = fbm(S, sd + 1, 12, 12, 4);
    const sand = fbm(S, sd + 2, 128, 128, 2);
    const chipN = fbm(S, sd + 3, 32, 32, 3, 0.5, true);
    const craze = fbm(S, sd + 4, 48, 48, 2);
    const gloss = o.gloss ?? 0.25;
    const sub = [0.78, 0.75, 0.68];
    const groutDirt = o.groutDirt ?? 0.6;
    const gdN = mask(S, sd + 13, 8, 4);
    const gdirtAt = (i) => gdN[i];
    const cracksT = new Float32Array(N);
    const r0 = mulberry(sd * 3 + 1);
    const rTiles = [];
    for (let y = 0, i = 0; y < S; y++) {
      const fy = (y + 0.5) / th, row = Math.floor(fy), lv = fy - row;
      const off = (row & 1) * brickOff;
      const dy = Math.min(lv, 1 - lv) * th;
      for (let x = 0; x < S; x++, i++) {
        const fx = (x + 0.5) / tw + off, colR = Math.floor(fx), lu = fx - colR;
        const col = ((colR % cu) + cu) % cu;
        const dx = Math.min(lu, 1 - lu) * tw;
        const rc = 2 * P;
        let d = (dx < rc && dy < rc) ? rc - Math.hypot(rc - dx, rc - dy) : Math.min(dx, dy);
        d -= gHalf;
        const hb = ih(row, col, sd), hb2 = ih(col, row, sd + 7), hb3 = ih(row + 11, col + 5, sd);
        const chk = o.checker ? (((row + col) & 1) === 0 ? a : b2) : a;
        // chipped corners on some tiles
        let chip = 0;
        if (hb2 > 0.84) {
          const cxs = hb2 > 0.92 ? lu : 1 - lu, cys = hb3 > 0.5 ? lv : 1 - lv;
          const cdist = Math.hypot(cxs * tw, cys * th);
          chip = ss((5 + hb3 * 7) * P * (0.7 + chipN[i] * 0.6), (3 + hb3 * 5) * P, cdist);
        }
        const missing = hb3 > 0.992 && o.missing !== false;
        if (d <= 0 || missing) {
          const t = 0.75 + sand[i] * 0.4;
          if (missing && d > 0) {
            const ridge = 0.5 + 0.5 * Math.sin((lu * tw + lv * th * 0.3) * 0.9 / P);
            td.set(i, 0.5 * t, 0.49 * t, 0.46 * t);
            td.h[i] = 0.05 + ridge * 0.08;
            td.rough[i] = 0.95;
          } else {
            const gd = 1 - ss(0.3, 1, gdirtAt(i)) * groutDirt * 0.5;
            td.set(i, g[0] * t * gd, g[1] * t * gd, g[2] * t * gd);
            td.h[i] = 0.3 + sand[i] * 0.06;
            td.rough[i] = 0.95;
          }
        } else {
          const tint = 0.95 + (hb - 0.5) * tVar;
          let t = tint + (glaze[i] - 0.5) * 0.06;
          const e = ss(0, cushion, d);
          // grime creeping in from the grout
          const edgeDirt = Math.exp(-d / (2.5 * P)) * groutDirt * 0.25;
          t *= 1 - edgeDirt;
          const hue = (hb2 - 0.5) * (0.03 + (tVar - 0.08) * 0.25);
          td.set(i, chk[0] * t * (1 + hue), chk[1] * t, chk[2] * t * (1 - hue));
          const tiltX = (hb - 0.5) * 0.2, tiltY = (hb3 - 0.5) * 0.2;
          td.h[i] = 0.55 + e * 0.3 + (lu - 0.5) * tiltX + (lv - 0.5) * tiltY + (glaze[i] - 0.5) * 0.04;
          td.rough[i] = gloss + (glaze[i] - 0.5) * 0.12 + edgeDirt * 0.6;
          if (chip > 0) {
            td.mix(i, scl(sub, 0.8 + sand[i] * 0.3), chip);
            td.h[i] -= 0.4 * chip;
            td.rough[i] += (0.9 - td.rough[i]) * chip;
          }
          // crazing on some tiles
          if (hb > 0.75) {
            const cr = ss(0.012, 0.0, Math.abs(craze[i] - 0.5)) * 0.5 * (hb - 0.75) * 4;
            if (cr > 0) { td.mul(i, 1 - 0.12 * cr); td.h[i] -= 0.03 * cr; }
          }
        }
      }
    }
    // a few cracked tiles
    const nCracks = Math.round(cu * cv * 0.04) + 1;
    for (let k = 0; k < nCracks; k++) {
      const row = (r0() * cv) | 0, col = (r0() * cu) | 0;
      const off = (row & 1) * brickOff;
      const x0 = (col - off + 0.1 + r0() * 0.2) * tw, y0 = (row + 0.1 + r0() * 0.8) * th;
      const x1 = (col - off + 0.7 + r0() * 0.2) * tw, y1 = (row + 0.1 + r0() * 0.8) * th;
      let px = x0, py = y0;
      for (let s = 1; s <= 6; s++) {
        const nx = x0 + (x1 - x0) * s / 6 + (r0() - 0.5) * 4 * P, ny = y0 + (y1 - y0) * s / 6 + (r0() - 0.5) * 4 * P;
        line(cracksT, S, px, py, nx, ny, 0.5 * P, 1);
        px = nx; py = ny;
      }
    }
    applyCracks(td, cracksT, 0.5, 0.3, false);
    // dirt film + grime settled in the grout (varies across the sheet)
    const film = mask(S, sd + 11, 3, 5, { warp: 50 });
    const fa = o.film ?? 0.6;
    for (let i = 0; i < N; i++) {
      const f = ss(0.35, 1, film[i]) * fa;
      td.mix(i, [0.3, 0.27, 0.22], f * 0.22);
      td.rough[i] += (0.75 - td.rough[i]) * f * 0.35;
    }
    stains(td, sd, (o.stain ?? 0.45) * 0.6, 3, [0.5, 0.43, 0.3]);
    const sk = streakMask(S, sd + 9, (o.stain ?? 0.45) * 0.5, 0.35);
    for (let i = 0; i < N; i++) if (sk[i] > 0) { td.mix(i, [0.45, 0.38, 0.26], sk[i] * 0.3); td.rough[i] += sk[i] * 0.2; }
  },
  woodfloor(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 61;
    const planks = o.planks ?? 18, segs = o.segs ?? 2;
    const base = paintBase(td, o, 0x6b4a2e, 0.85);
    const ph = S / planks;
    const g1 = fbm(S, sd + 1, 3, planks * 3, 4);
    const pores = fbm(S, sd + 2, 16, S >> 1, 2);
    const wear = mask(S, sd + 3, 2, 5);
    const fine = fbm(S, sd + 4, 64, 64, 2);
    const scr = scratchField(S, sd + 5, 260, { dirs: [0, Math.PI], random: 0.35, len: 30, width: 0.45 });
    for (let y = 0, i = 0; y < S; y++) {
      const fy = (y + 0.5) / ph, row = Math.floor(fy), lv = fy - row;
      const off = ih(row, 3, sd);
      for (let x = 0; x < S; x++, i++) {
        const fx = ((x + 0.5) / S) * segs + off * segs, seg = Math.floor(fx), lu = fx - seg;
        const segW = ((seg % segs) + segs) % segs;
        const hb = ih(row, segW, sd), hb2 = ih(segW, row, sd + 2);
        const gapV = Math.min(lv, 1 - lv) * ph, gapU = Math.min(lu, 1 - lu) * (S / segs);
        const gap = ss(0.9 * P, 0.2, gapV) + ss(0.8 * P, 0.2, gapU);
        // grain: straight lines with a flat-sawn "cathedral" wobble
        const gr = g1[i] * 6 + lv * (1.5 + hb2 * 2) + hb * 20 + Math.abs(lu - 0.5) * hb2 * 3;
        const ring = Math.abs(((gr % 1) + 1) % 1 - 0.5) * 2;
        const lines = Math.pow(ring, 6);
        // knots
        let knot = 0;
        if (hb2 > 0.6) {
          const kx = (0.2 + hb * 0.6 - lu) * (S / segs), ky = (0.5 - lv + (hb2 - 0.8) * 0.3) * ph;
          const kd = Math.hypot(kx * 0.45, ky);
          knot = ss(3.5 * P, 1.2 * P, kd);
          knot += 0.35 * ss(9 * P, 3 * P, kd) * (0.5 + 0.5 * Math.sin(kd / P * 1.6));
        }
        const pt = 0.72 + hb * 0.45 + (hb2 - 0.5) * 0.1;
        let t = pt * (0.86 + (1 - lines) * 0.14) * (1 - knot * 0.45) * (0.92 + pores[i] * 0.16);
        let r = base[0] * t * (1 + (hb2 - 0.5) * 0.12), g = base[1] * t, b = base[2] * t * (1 - (hb2 - 0.5) * 0.12);
        // worn finish: lighter, greyer, duller
        const wk = ss(0.6, 0.92, wear[i]) * (o.wear ?? 0.45);
        if (wk > 0) { const l = (r + g + b) / 3; r += (l * 1.25 - r) * wk * 0.5; g += (l * 1.18 - g) * wk * 0.5; b += (l * 1.05 - b) * wk * 0.5; }
        const s = scr[i];
        if (s > 0) { r += (r * 1.5 + 0.05 - r) * s * 0.5; g += (g * 1.45 + 0.04 - g) * s * 0.5; b += (b * 1.4 + 0.03 - b) * s * 0.5; }
        const gk = Math.min(1, gap);
        r *= 1 - gk * 0.8; g *= 1 - gk * 0.8; b *= 1 - gk * 0.8;
        // nail holes near board ends
        const nd = Math.min(Math.hypot((lu - 0.03) * (S / segs), (lv - 0.5) * ph), Math.hypot((lu - 0.97) * (S / segs), (lv - 0.5) * ph));
        const nail = ss(1.3 * P, 0.5 * P, nd);
        r *= 1 - nail * 0.7; g *= 1 - nail * 0.7; b *= 1 - nail * 0.7;
        td.set(i, r, g, b);
        if (td.a) td.a[i] = 1 - gk * 0.85 - nail * 0.7;
        td.h[i] = 0.6 - gk * 0.5 - lines * 0.04 + pores[i] * 0.06 - s * 0.05 - nail * 0.3 + fine[i] * 0.03 + (hb - 0.5) * 0.06;
        td.rough[i] = 0.34 + fine[i] * 0.12 + wk * 0.35 + s * 0.25 + gk * 0.5 + knot * 0.1;
      }
    }
    stains(td, sd, o.stain ?? 0.3, 3, [0.13, 0.09, 0.05]);
  },
  wood(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 71;
    const base = paintBase(td, o, 0x8a6a44, 0.85);
    const gw = fbm(S, sd, 2, 6, 4);
    const pores = fbm(S, sd + 1, S >> 1, 16, 2);
    const fine = fbm(S, sd + 2, 32, 32, 3);
    const mott = mask(S, sd + 3, 3, 4);
    const scr = scratchField(S, sd + 4, 90, { dirs: [Math.PI / 2], random: 0.5, len: 25, width: 0.45 });
    const kr = mulberry(sd * 5 + 3), knots = [];
    for (let k = 0; k < 3; k++) knots.push([kr(), kr()]);
    for (let y = 0, i = 0; y < S; y++) {
      const v = (y + 0.5) / S;
      for (let x = 0; x < S; x++, i++) {
        const u = (x + 0.5) / S;
        // knot distortion around worley centres
        let kd = 9;
        for (const [kx, ky] of knots) { let dx = Math.abs(u - kx), dy = Math.abs(v - ky); if (dx > 0.5) dx = 1 - dx; if (dy > 0.5) dy = 1 - dy; const d = Math.hypot(dx * 2.2, dy * 0.8); if (d < kd) kd = d; }
        const kid = 1;
        const kn = ss(0.22, 0.02, kd);
        const gr = u * 18 + gw[i] * 7 + kn * 3 * Math.sin(v * 40);
        const ring = Math.abs(((gr % 1) + 1) % 1 - 0.5) * 2;
        const lines = Math.pow(ring, 5);
        const knot = kid > 0.55 ? ss(0.07, 0.03, kd) : 0;
        const t = (0.78 + (1 - lines) * 0.22) * (0.9 + pores[i] * 0.2) * (0.9 + (mott[i] - 0.5) * 0.2) * (1 - knot * 0.55);
        td.set(i, base[0] * t, base[1] * t, base[2] * t);
        const s = scr[i];
        if (s > 0) td.mix(i, scl(base, 1.3), s * 0.35);
        td.h[i] = (1 - lines) * 0.12 + pores[i] * 0.12 + fine[i] * 0.1 - knot * 0.1 - s * 0.05;
        td.rough[i] = 0.62 + fine[i] * 0.12 + s * 0.1;
      }
    }
    stains(td, sd, o.stain ?? 0.3, 2);
  },
  carpet(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 81;
    const base = paintBase(td, o, 0x5a3b3b, 0.85);
    const fib = fbm(S, sd + 1, S >> 1, S >> 1, 1);
    const fib2 = fbm(S, sd, S >> 2, S >> 2, 1);
    const mott = mask(S, sd + 2, 3, 5);
    const st = mask(S, sd + 5, 4, 5, { warp: 50 });
    const pat = o.pattern ?? (sd % 2 ? 'geo' : 'fleck');
    const flk = fbm(S, sd + 6, 96, 96, 1);
    const acc = hex(o.accent ?? 0x8a7a50);
    const gridN = o.grid ?? 16;
    for (let y = 0, i = 0; y < S; y++) {
      const v = (y + 0.5) / S;
      for (let x = 0; x < S; x++, i++) {
        const u = (x + 0.5) / S;
        const tuft = fib2[i];
        const fid = fib[i];
        let t = 0.72 + tuft * 0.18 + (fid - 0.5) * 0.22 + (fib[i] - 0.5) * 0.1 + (mott[i] - 0.5) * 0.14;
        let r = base[0] * t, g = base[1] * t, b = base[2] * t;
        let pk = 0;
        if (pat === 'geo') {
          const gu = (u * gridN) % 1, gv = (v * gridN) % 1;
          const dd = Math.abs(gu - 0.5) + Math.abs(gv - 0.5);
          pk = ss(0.2, 0.16, Math.abs(dd - 0.32)) * 0.28;
        } else {
          pk = ss(0.82, 0.9, flk[i]) * (fid > 0.5 ? 1 : 0.4);
        }
        if (pk > 0) { r += (acc[0] * t - r) * pk; g += (acc[1] * t - g) * pk; b += (acc[2] * t - b) * pk; }
        const sk = ss(0.82, 0.9, st[i]) * (o.stain ?? 0.5);
        let h = tuft * 0.5 + fib[i] * 0.25;
        if (sk > 0) { r += (0.1 - r) * sk * 0.7; g += (0.065 - g) * sk * 0.7; b += (0.045 - b) * sk * 0.7; h = h * (1 - sk * 0.6) + 0.2 * sk; }
        // matted traffic areas
        const mat = ss(0.65, 0.95, mott[i]) * 0.35;
        h = h * (1 - mat) + 0.25 * mat;
        const l = (r + g + b) / 3;
        r += (l - r) * mat * 0.5; g += (l - g) * mat * 0.5; b += (l - b) * mat * 0.5;
        td.set(i, r * (1 - mat * 0.15), g * (1 - mat * 0.15), b * (1 - mat * 0.15));
        if (td.a) td.a[i] = Math.max(0, 1 - pk - sk * 0.7);
        td.h[i] = h;
        td.rough[i] = 0.97 - sk * 0.15;
      }
    }
  },
  asphalt(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 91;
    const base = hex(o.color ?? 0x3c3c3e);
    const Wa = worley(S, sd, 110);

    const big = mask(S, sd + 2, 2, 5);
    const mid = fbm(S, sd + 3, 12, 12, 4);
    const fine = fbm(S, sd + 4, S >> 1, S >> 1, 1);
    const oil = mask(S, sd + 7, 4, 5, { warp: 50 });
    const allig = mask(S, sd + 8, 3, 4);
    const Wal = worley(S >> 1, sd + 9, 14);
    const alE = new Float32Array((S >> 1) * (S >> 1));
    for (let i = 0; i < alE.length; i++) alE[i] = Wal.f2[i] - Wal.f1[i];
    const alU = upsample(alE, S >> 1, S >> 1, S);
    const damp = mask(S, sd + 10, 3, 5, { warp: 60 });
    const wetAmt = o.wet ?? 0.8;
    // cracks + tar-snake sealant
    const cracks = crackField(S, sd + 11, o.crackCount ?? 7, { width: 1.0, wiggle: 0.35, len: 1.4 });
    const seal = new Float32Array(N);
    {
      const r = mulberry(sd * 5 + 2);
      for (let c = 0; c < 4; c++) {
        let x = r() * S, y = r() * S, ang = r() * Math.PI * 2;
        const len = (150 + r() * 250) * P, w = (2.2 + r() * 1.6) * P;
        for (let t = 0; t < len; t += P) { ang += (r() - 0.5) * 0.25; x += Math.cos(ang) * P; y += Math.sin(ang) * P; stamp(seal, S, x, y, w * (0.8 + 0.4 * Math.sin(t * 0.05)), 1); stamp(cracks, S, x, y, 0.5 * P, 0.8); }
      }
    }
    // rectangular repair patch
    const patch = new Float32Array(N);
    {
      const r = mulberry(sd * 7 + 9);
      for (let k = 0; k < (o.patches ?? 2); k++) {
        const x0 = r() * S, y0 = r() * S, w = (60 + r() * 120) * P, h = (40 + r() * 90) * P;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const ex = Math.min(x, w - x), ey = Math.min(y, h - y);
          const i = (((y0 + y) | 0) & (S - 1)) * S + (((x0 + x) | 0) & (S - 1));
          patch[i] = Math.max(patch[i], ss(0, 1.5 * P, Math.min(ex, ey)) + (Math.min(ex, ey) < 1.2 * P ? 2 : 0));
        }
      }
    }
    for (let i = 0; i < N; i++) {
      const ae = Wa.f2[i] - Wa.f1[i], sid = Wa.id[i];
      const stone = ss(0.0, 0.1 + fine[i] * 0.25, ae) * 0.5 + 0.5 * (1 - Wa.f1[i]);
      const big2 = sid > 0.93 ? stone * 0.6 : 0;
      let t = 0.95 + (big[i] - 0.5) * 0.25 + (mid[i] - 0.5) * 0.18;
      const st = stone * (0.55 + sid * 0.95) + big2 * 0.4;
      t *= 0.6 + (sid - 0.5) * 0.55 * stone + st * 0.25 + (fine[i] - 0.5) * 0.15;
      let r = base[0] * t, g = base[1] * t, b = base[2] * t * 0.98;
      let h = stone * 0.45 + big2 * 0.35 + mid[i] * 0.2 + fine[i] * 0.08;
      let rough = 0.86 + (fine[i] - 0.5) * 0.1;
      // alligator cracking
      const al = ss(0.72, 0.85, allig[i]) * ss(0.05, 0.0, alU[i]);
      if (al > 0) { r *= 1 - al * 0.6; g *= 1 - al * 0.6; b *= 1 - al * 0.6; h -= al * 0.3; }
      // patch: darker, finer, with a seam outline
      const pv = patch[i];
      if (pv > 0) {
        const pk = Math.min(1, pv);
        r += (base[0] * 0.62 * (0.9 + fine[i] * 0.2) - r) * pk * 0.8; g += (base[1] * 0.62 * (0.9 + fine[i] * 0.2) - g) * pk * 0.8; b += (base[2] * 0.64 * (0.9 + fine[i] * 0.2) - b) * pk * 0.8;
        h = h * (1 - pk * 0.6) + 0.3 * pk;
        if (pv > 1.5) { r *= 0.5; g *= 0.5; b *= 0.5; h -= 0.2; }
      }
      // oil drips
      const ok = ss(0.86, 0.93, oil[i]) * (o.oil ?? 0.7);
      if (ok > 0) { r *= 1 - ok * 0.55; g *= 1 - ok * 0.55; b *= 1 - ok * 0.5; rough += (0.35 - rough) * ok; }
      // tar-snake sealant: black, smoother, glossier
      const sk = seal[i];
      if (sk > 0) { r += (0.035 - r) * sk; g += (0.035 - g) * sk; b += (0.038 - b) * sk; h = h * (1 - sk) + 0.42 * sk; rough += (0.4 - rough) * sk; }
      // damp patches (world-space puddles are added in the material shader)
      const dk = ss(0.78, 0.9, damp[i]) * wetAmt;
      if (dk > 0) { r *= 1 - dk * 0.28; g *= 1 - dk * 0.28; b *= 1 - dk * 0.26; rough += (0.45 - rough) * dk; h = h * (1 - dk * 0.4) + 0.3 * dk * 0.4; }
      td.set(i, r, g, b);
      td.h[i] = h;
      td.rough[i] = rough;
    }
    applyCracks(td, cracks, 0.7, 0.5);
  },
  sidewalk(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 101;
    const base = hex(o.color ?? 0x86837c);
    const slabs = o.slabs ?? 2;
    const sp = S / slabs;
    const broomA = fbm(S, sd, 3, S >> 2, 2), broomB = fbm(S, sd + 1, S >> 2, 3, 2);
    const mott = mask(S, sd + 2, 3, 5);
    const mid = fbm(S, sd + 3, 16, 16, 4);
    const fine = fbm(S, sd + 4, S >> 1, S >> 1, 1);
    const gumD = spots(S, sd + 5, 45, 1.2, 3.2), gumL = spots(S, sd + 15, 30, 1.2, 3.0);
    const stn = mask(S, sd + 8, 3, 5, { warp: 50 });
    for (let y = 0, i = 0; y < S; y++) {
      const fy = (y + 0.5) / sp, sr = Math.floor(fy), lv = fy - sr;
      for (let x = 0; x < S; x++, i++) {
        const fx = (x + 0.5) / sp, sc = Math.floor(fx), lu = fx - sc;
        const d = Math.min(Math.min(lu, 1 - lu), Math.min(lv, 1 - lv)) * sp;
        const hb = ih(sr, sc, sd);
        const joint = ss(2.4 * P, 0.8 * P, d);
        const tooled = ss(7 * P, 5.5 * P, d) * (1 - joint);
        const br = ((sr + sc) & 1) ? broomA[i] : broomB[i];
        let t = (0.86 + (hb - 0.5) * 0.14) * (0.9 + (mott[i] - 0.5) * 0.2 + (mid[i] - 0.5) * 0.12 + (fine[i] - 0.5) * 0.1);
        t *= 1 + (br - 0.5) * 0.12 * (1 - tooled);
        t *= 1 + tooled * 0.04;
        let r = base[0] * t, g = base[1] * t, b = base[2] * t;
        let h = 0.55 + br * 0.12 * (1 - tooled) + mid[i] * 0.12 + fine[i] * 0.06 - joint * 0.5;
        let rough = 0.88 - tooled * 0.12 + (fine[i] - 0.5) * 0.08;
        if (joint > 0) {
          const moss = ih(sc, sr, 5) > 0.6 ? ss(0.5, 0.8, mid[i]) : 0;
          r = r * (1 - joint * 0.72) + joint * moss * 0.02; g = g * (1 - joint * 0.72) + joint * moss * 0.05; b = b * (1 - joint * 0.72);
        }
        // chewing gum spots
        const gk = Math.max(gumD[i], gumL[i]);
        if (gk > 0) { const gc = gumD[i] >= gumL[i] ? 0.2 : 0.46; r += (gc - r) * gk; g += (gc - g) * gk; b += (gc * 0.97 - b) * gk; h += gk * 0.12; rough += (0.6 - rough) * gk; }
        const sk = ss(0.7, 0.95, stn[i]) * (o.stain ?? 0.45);
        if (sk > 0) { r += (0.2 - r) * sk * 0.55; g += (0.18 - g) * sk * 0.55; b += (0.15 - b) * sk * 0.55; rough -= sk * 0.12; }
        td.set(i, r, g, b);
        td.h[i] = h;
        td.rough[i] = rough;
      }
    }
    applyCracks(td, crackField(S, sd + 9, o.crackCount ?? 5, { width: 0.8 }), 0.55, 0.4);
  },
  metal(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 111;
    const base = hex(o.color ?? 0x5a6468);
    const mott = mask(S, sd, 3, 5);
    const fine = fbm(S, sd + 1, 48, 48, 3);
    const brush = fbm(S, sd + 2, 2, S >> 1, 1);
    const rm = mask(S, sd + 4, 4, 6, { warp: 50, gain: 0.6 });
    const rustAmt = o.rust ?? 0.6;
    const cover = clamp(rustAmt * 0.28 + Math.max(0, rustAmt - 1) * 1.2, 0, 0.95);
    const thr = 1 - cover;
    const spots = new Float32Array(N);
    for (let i = 0; i < N; i++) spots[i] = ss(thr, thr + 0.05, rm[i]);
    const bleed = bleedDown(spots, S, 0.985, colNoise(S, sd + 5, 96));
    const pit = fbm(S, sd + 6, S >> 1, S >> 1, 1);
    const scr = scratchField(S, sd + 7, Math.round(160 * (o.scratches ?? 1)), { len: 45, width: 0.5 });
    const rough0 = o.rough ?? 0.45, metal0 = o.metal ?? 0.6;
    const rl = [0.55, 0.28, 0.12], rd = [0.22, 0.1, 0.05];
    for (let i = 0; i < N; i++) {
      const t = 0.85 + (mott[i] - 0.5) * 0.2 + (fine[i] - 0.5) * 0.1 + (brush[i] - 0.5) * 0.12;
      let r = base[0] * t, g = base[1] * t, b = base[2] * t;
      let rough = rough0 + (brush[i] - 0.5) * 0.15 + (mott[i] - 0.5) * 0.1, metal = metal0;
      let h = fine[i] * 0.15 + brush[i] * 0.04;
      const s = scr[i];
      if (s > 0) { r += (Math.min(1, r * 1.6 + 0.08) - r) * s * 0.7; g += (Math.min(1, g * 1.6 + 0.08) - g) * s * 0.7; b += (Math.min(1, b * 1.6 + 0.08) - b) * s * 0.7; rough -= s * 0.18; h -= s * 0.06; metal += (1 - metal) * s * 0.5; }
      const bl = bleed[i] * (1 - spots[i]);
      if (bl > 0) { const k = bl * 0.55 * Math.min(1, rustAmt + 0.3); r += (0.42 - r) * k; g += (0.22 - g) * k; b += (0.1 - b) * k; rough += (0.8 - rough) * k * 0.7; metal *= 1 - k * 0.6; }
      const sp = spots[i];
      if (sp > 0) {
        const rc = fine[i] > 0.5 ? rl : rd;
        const vr = 0.75 + pit[i] * 0.5;
        r += (rc[0] * vr - r) * sp; g += (rc[1] * vr - g) * sp; b += (rc[2] * vr - b) * sp;
        rough += (0.9 - rough) * sp; metal *= 1 - sp * 0.92;
        h += sp * (0.1 + pit[i] * 0.2) - (pit[i] > 0.75 ? 0.15 * sp : 0);
      }
      td.set(i, r, g, b);
      td.h[i] = h;
      td.rough[i] = rough;
      td.metal[i] = metal;
    }
  },
  diamond(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 121;
    const base = hex(o.color ?? 0x7a7e80);
    const k = o.count ?? 8;
    const cell = S / k;
    const mott = mask(S, sd, 3, 5);
    const fine = fbm(S, sd + 1, 64, 64, 2);
    const rm = mask(S, sd + 2, 5, 5, { gain: 0.6 });
    const scr = scratchField(S, sd + 3, 120, { len: 40, width: 0.5 });
    const rustAmt = o.rust ?? 0.4;
    const A = Math.SQRT1_2;
    for (let y = 0, i = 0; y < S; y++) {
      for (let x = 0; x < S; x++, i++) {
        // two interleaved lattices of lens bumps in alternating orientation
        let best = 0;
        for (let L = 0; L < 2; L++) {
          const ox = L ? 0.5 : 0, oy = L ? 0.5 : 0;
          const cx = (x + 0.5) / cell - ox, cy = (y + 0.5) / cell - oy;
          const lx = cx - Math.floor(cx) - 0.5, ly = cy - Math.floor(cy) - 0.5;
          const s = L ? -1 : 1;
          const along = (lx + s * ly) * A, across = (lx - s * ly) * A;
          const al = Math.abs(along) / 0.3;
          if (al < 1) {
            const wdt = 0.07 * (1 - al * al);
            const ac = Math.abs(across);
            const v = ss(wdt + 0.012, wdt - 0.012, ac) * Math.sqrt(1 - al * al);
            if (v > best) best = v;
          }
        }
        const t = 0.82 + (mott[i] - 0.5) * 0.2 + (fine[i] - 0.5) * 0.1;
        let r = base[0] * t, g = base[1] * t, b = base[2] * t;
        // bump tops polished, valleys dirty
        const valley = 1 - best;
        r *= 1 - valley * 0.12 * (0.5 + mott[i]); g *= 1 - valley * 0.12 * (0.5 + mott[i]); b *= 1 - valley * 0.12 * (0.5 + mott[i]);
        r *= 1 + best * 0.18; g *= 1 + best * 0.18; b *= 1 + best * 0.18;
        let rough = 0.42 - best * 0.2 + (fine[i] - 0.5) * 0.1, metal = 0.85;
        const s = scr[i];
        if (s > 0) { r *= 1 + s * 0.3; g *= 1 + s * 0.3; b *= 1 + s * 0.3; rough -= s * 0.1; }
        const rk = ss(1 - rustAmt * 0.35, 1 - rustAmt * 0.35 + 0.08, rm[i]) * (0.4 + valley * 0.6);
        if (rk > 0) { r += (0.4 * (0.7 + fine[i] * 0.6) - r) * rk; g += (0.19 * (0.7 + fine[i] * 0.6) - g) * rk; b += (0.08 - b) * rk; rough += (0.88 - rough) * rk; metal *= 1 - rk * 0.85; }
        td.set(i, r, g, b);
        td.h[i] = best * 0.8 + fine[i] * 0.06 + rk * 0.05;
        td.rough[i] = rough;
        td.metal[i] = metal;
      }
    }
  },
  rooftar(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 131;
    const base = hex(o.color ?? 0x3a3936);
    const Wg = worley(S, sd, 80);
    const bareF = mask(S, sd + 3, 3, 5, { warp: 80 });
    const fine = fbm(S, sd + 4, S >> 1, S >> 1, 1);
    const wrink = fbm(S, sd + 5, 24, 96, 3);
    const mid = fbm(S, sd + 6, 16, 16, 3);
    const bare = o.bare ?? 0.15;
    const t0 = 1 - bare;
    const pal = [[0.55, 0.54, 0.52], [0.42, 0.4, 0.37], [0.62, 0.57, 0.5], [0.3, 0.3, 0.31], [0.5, 0.45, 0.4], [0.7, 0.68, 0.64]];
    const tint = [base[0] / 0.23, base[1] / 0.225, base[2] / 0.21];
    for (let y = 0, i = 0; y < S; y++) {
      for (let x = 0; x < S; x++, i++) {
        const e = Wg.f2[i] - Wg.f1[i], id = Wg.id[i];
        const stone = ss(0.03, 0.26, e);
        const c = pal[(id * pal.length) | 0];
        const bk = ss(t0 - 0.04, t0 + 0.1, bareF[i]);
        const scatter = 1 - bk * (id > 0.6 ? 0.3 : 0.95);
        const sv = stone * scatter;
        const st = 0.8 + fine[i] * 0.35;
        let r = c[0] * st * 0.75, g = c[1] * st * 0.75, b = c[2] * st * 0.75;
        const tar = 0.14 + mid[i] * 0.07 + (wrink[i] - 0.5) * 0.05;
        r = r * sv + tar * (1 - sv); g = g * sv + tar * (1 - sv); b = b * sv + tar * 1.02 * (1 - sv);
        r *= tint[0] * 0.25 + 0.75; g *= tint[1] * 0.25 + 0.75; b *= tint[2] * 0.25 + 0.75;
        let h = sv * (0.5 + id * 0.3) + (1 - sv) * (0.1 + (wrink[i] - 0.5) * 0.1 * bk + mid[i] * 0.05);
        let rough = sv > 0.5 ? 0.85 : 0.62 + (1 - bk) * 0.25;
        td.set(i, r, g, b);
        td.h[i] = h;
        td.rough[i] = rough;
      }
    }
    // membrane seams on the bare areas
    const seams = new Float32Array(N);
    for (let k = 1; k <= 3; k++) line(seams, S, 0, (k / 3) * S - 1, S, (k / 3) * S - 1, 1.3 * P, 1);
    for (let i = 0; i < N; i++) {
      const bk = ss(t0, t0 + 0.05, bareF[i]);
      const sk = seams[i] * bk;
      if (sk > 0) { td.h[i] += sk * 0.2; td.mul(i, 1 - sk * 0.35); }
    }
    stains(td, sd, o.stain ?? 0.35, 2, [0.12, 0.12, 0.11]);
  },
  ceiling(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 141;
    const base = hex(o.color ?? 0xcfcac0);
    const k = o.count ?? 4;
    const cell = S / k;
    const fis = mask(S, sd, 96, 2, { warp: 6, wf: 48, res: S });
    const holes = fbm(S, sd + 3, S >> 1, S >> 1, 1);
    const mott = mask(S, sd + 4, 3, 5);
    const water = mask(S, sd + 7, 2, 5, { warp: 70 });
    const barW = 3.2 * P;
    for (let y = 0, i = 0; y < S; y++) {
      const fy = (y + 0.5) / cell, ry = Math.floor(fy), lv = fy - ry;
      for (let x = 0; x < S; x++, i++) {
        const fx = (x + 0.5) / cell, rx = Math.floor(fx), lu = fx - rx;
        const d = Math.min(Math.min(lu, 1 - lu), Math.min(lv, 1 - lv)) * cell;
        const hb = ih(rx, ry, sd);
        if (d < barW) {
          const t = 0.78 + mott[i] * 0.1;
          td.set(i, 0.86 * t, 0.85 * t, 0.82 * t);
          td.h[i] = 0.95 - ss(barW * 0.5, barW, d) * 0.08;
          td.rough[i] = 0.45; td.metal[i] = 0.3;
        } else {
          const fk = ss(0.88, 0.95, fis[i]) * 0.8 + ss(0.06, 0.02, fis[i]) * 0.5;
          const hk = holes[i] > 0.8 ? 1 : 0;
          const edge = ss(barW + 5 * P, barW, d);
          let t = (0.9 + (hb - 0.5) * 0.08 + (mott[i] - 0.5) * 0.08) * (1 - fk * 0.18 - hk * 0.14) * (1 - edge * 0.25);
          // some tiles sagging / yellowed
          const sag = hb > 0.8 ? (hb - 0.8) * 5 : 0;
          td.set(i, base[0] * t, base[1] * t * (1 - sag * 0.05), base[2] * t * (1 - sag * 0.15));
          td.h[i] = 0.5 - fk * 0.12 - hk * 0.15 - edge * 0.25;
          td.rough[i] = 0.96;
        }
        const wv = water[i];
        if (wv > 0.8) {
          const inside = ss(0.86, 0.89, wv) * (o.water ?? 1);
          const ring = ss(0.845, 0.865, wv) * ss(0.895, 0.875, wv) * (o.water ?? 1);
          td.r[i] *= 1 - inside * 0.04; td.g[i] *= 1 - inside * 0.08; td.b[i] *= 1 - inside * 0.17;
          td.mix(i, [0.55, 0.45, 0.3], ring * 0.45);
        }
      }
    }
  },
  linoleum(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 151;
    const base = hex(o.color ?? 0xb8b4a4);
    const k = o.count ?? 10;
    const cell = S / k;
    const chipsA = fbm(S, sd, 24, 96, 2), chipsB = fbm(S, sd + 1, 96, 24, 2);
    const mott = mask(S, sd + 2, 3, 5);
    const wax = mask(S, sd + 3, 4, 5);
    const fine = fbm(S, sd + 4, 64, 64, 2);
    // scuff marks: short dark curved strokes
    const scuff = new Float32Array(N);
    {
      const r = mulberry(sd * 11 + 3);
      for (let c = 0; c < 70; c++) {
        let x = r() * S, y = r() * S, ang = r() * Math.PI * 2;
        const len = (8 + r() * 30) * P, bend = (r() - 0.5) * 0.12, w = (0.6 + r() * 1.2) * P, val = 0.3 + r() * 0.7;
        for (let t = 0; t < len; t += 0.7 * P) { x += Math.cos(ang) * 0.7 * P; y += Math.sin(ang) * 0.7 * P; ang += bend; stamp(scuff, S, x, y, w * Math.sin(Math.PI * t / len), val); }
      }
    }
    const sc2 = scratchField(S, sd + 5, 120, { random: 1, len: 30, width: 0.4 });
    for (let y = 0, i = 0; y < S; y++) {
      const fy = (y + 0.5) / cell, ry = Math.floor(fy), lv = fy - ry;
      for (let x = 0; x < S; x++, i++) {
        const fx = (x + 0.5) / cell, rx = Math.floor(fx), lu = fx - rx;
        const d = Math.min(Math.min(lu, 1 - lu), Math.min(lv, 1 - lv)) * cell;
        const hb = ih(rx, ry, sd);
        const seam = ss(0.9 * P, 0.2 * P, d);
        const chip = ((rx + ry) & 1) ? chipsA[i] : chipsB[i];
        const alt = o.alt ? (((rx + ry) & 1) ? 1 : 0) : 0;
        let t = (0.92 + (hb - 0.5) * 0.08 - alt * 0.12) * (0.95 + (mott[i] - 0.5) * 0.1);
        let r = base[0] * t, g = base[1] * t, b = base[2] * t;
        if (chip > 0.64) { r *= 0.86; g *= 0.87; b *= 0.87; } else if (chip < 0.34) { r *= 1.05; g *= 1.05; b *= 1.06; }
        const sk = scuff[i];
        if (sk > 0) { r *= 1 - sk * 0.55; g *= 1 - sk * 0.55; b *= 1 - sk * 0.55; }
        const dirt = ss(3 * P, 0, d) * 0.18 + seam * 0.35;
        r *= 1 - dirt; g *= 1 - dirt; b *= 1 - dirt;
        td.set(i, r, g, b);
        td.h[i] = 0.5 - seam * 0.4 + fine[i] * 0.03 - sc2[i] * 0.05;
        td.rough[i] = 0.22 + ss(0.3, 0.9, wax[i]) * 0.35 + sk * 0.2 + sc2[i] * 0.2 + dirt * 0.3;
      }
    }
    stains(td, sd, o.stain ?? 0.4, 3, [0.32, 0.28, 0.19]);
  },
  sewer(td, o) {
    const S = td.size, N = S * S, sd = o.seed ?? 161;
    GEN.brick(td, { rows: 20, cols: 6, seed: sd, color: o.color ?? 0x4a3a2c, mortarColor: 0x2e2c26, stain: 0.25, soot: 0.3, efflo: 0.25 });
    const slime = mask(S, sd + 1, 3, 5, { fy: 2 });
    const drip = streakMask(S, sd + 2, 1, 0.7);
    const fine = fbm(S, sd + 3, 64, 64, 2);
    for (let i = 0; i < N; i++) {
      const sl = ss(0.55, 0.85, slime[i]);
      const k = Math.min(1, sl * 0.85 + drip[i] * 0.5);
      if (k > 0) {
        const gcol = [0.1 + fine[i] * 0.05, 0.14 + fine[i] * 0.06, 0.06];
        td.mix(i, gcol, k * 0.8);
        td.rough[i] += (0.15 - td.rough[i]) * k;
        td.h[i] += sl * 0.05 * fine[i];
      }
      td.rough[i] *= 0.8;
    }
  },
  water(td, o) {
    const S = td.size, N = S * S, sd = o.seed ?? 171;
    const f = fbm(S, sd, 6, 6, 5);
    for (let i = 0; i < N; i++) { td.set(i, 0.08, 0.1, 0.07); td.h[i] = f[i]; td.rough[i] = 0.05; }
  },
  dirt(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 181;
    const base = hex(o.color ?? 0x4a3e30);
    const f = mask(S, sd, 5, 6);
    const fine = fbm(S, sd + 1, S >> 1, S >> 1, 1);
    const Wp = worley(S, sd + 2, 40);
    const moist = mask(S, sd + 3, 3, 5);
    for (let i = 0; i < N; i++) {
      const pe = Wp.id[i] > 0.7 ? ss(0.05, 0.22, Wp.f2[i] - Wp.f1[i]) * ss(0.45, 0.2, Wp.f1[i]) : 0;
      let t = 0.65 + f[i] * 0.45 + (fine[i] - 0.5) * 0.2;
      const mk = ss(0.6, 0.9, moist[i]);
      t *= 1 - mk * 0.3;
      td.set(i, base[0] * t, base[1] * t, base[2] * t);
      if (pe > 0) td.mix(i, [0.45 + Wp.id[i] * 0.2, 0.42 + Wp.id[i] * 0.15, 0.38], pe);
      td.h[i] = f[i] * 0.5 + fine[i] * 0.25 + pe * 0.5;
      td.rough[i] = 0.95 - mk * 0.3 - pe * 0.1;
    }
  },
  fabric(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 191;
    const base = paintBase(td, o, 0x6a6a70, 0.85);
    const f = mask(S, sd, 3, 4);
    const fib = fbm(S, sd + 1, S >> 1, S >> 1, 1);
    const st = mask(S, sd + 4, 4, 5, { warp: 40 });
    const period = Math.max(4, Math.round(S / 128)); // threads per ~4px
    for (let y = 0, i = 0; y < S; y++) {
      for (let x = 0; x < S; x++, i++) {
        // 2/1 twill: diagonal ribs + thread crossings
        const tw = ((x + y) % (period * 3)) / (period * 3);
        const rib = 0.5 + 0.5 * Math.sin(tw * Math.PI * 2);
        const th = 0.5 + 0.5 * Math.sin((x / period) * Math.PI) * Math.sin((y / period) * Math.PI);
        const t = 0.78 + rib * 0.1 + th * 0.06 + (fib[i] - 0.5) * 0.1 + (f[i] - 0.5) * 0.18;
        td.set(i, base[0] * t, base[1] * t, base[2] * t);
        const sk = ss(0.82, 0.92, st[i]) * (o.stain ?? 0.4);
        if (sk > 0) { td.mix(i, [0.16, 0.12, 0.08], sk * 0.6); if (td.a) td.a[i] = 1 - sk * 0.6; }
        td.h[i] = rib * 0.25 + th * 0.2 + fib[i] * 0.1;
        td.rough[i] = 0.95;
      }
    }
  },
  marble(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 201;
    const base = hex(o.color ?? 0xd8d4cc);
    const k = o.count ?? 2;
    const cell = S / k;
    const w1 = fbm(S, sd, 3, 3, 6, 0.55), w2 = fbm(S, sd + 1, 3, 3, 6, 0.55);
    const vf = fbm(S, sd + 2, 2, 2, 3);
    const cloud = mask(S, sd + 3, 4, 5);
    const scr = scratchField(S, sd + 4, 140, { random: 1, len: 35, width: 0.4 });
    const dull = mask(S, sd + 5, 3, 4);
    for (let y = 0, i = 0; y < S; y++) {
      const v = (y + 0.5) / S;
      for (let x = 0; x < S; x++, i++) {
        const u = (x + 0.5) / S;
        const q = u * 2 + v * 1.2 + (w1[i] - 0.5) * 2.2 + vf[i];
        const vein = Math.pow(1 - Math.abs(Math.sin(q * Math.PI * 2)), 18);
        const q2 = u * 1.3 - v * 2 + (w2[i] - 0.5) * 3;
        const vein2 = Math.pow(1 - Math.abs(Math.sin(q2 * Math.PI * 3)), 40) * 0.6;
        const lu = ((x + 0.5) / cell) % 1, lv = ((y + 0.5) / cell) % 1;
        const d = Math.min(Math.min(lu, 1 - lu), Math.min(lv, 1 - lv)) * cell;
        const seam = ss(1.0 * P, 0.3 * P, d);
        const t = (0.93 + (cloud[i] - 0.5) * 0.1) * (1 - vein * 0.45 - vein2 * 0.3) * (1 - seam * 0.6);
        td.set(i, base[0] * t, base[1] * t * 0.99, base[2] * t * 0.97);
        td.h[i] = 0.5 - seam * 0.4 - scr[i] * 0.03;
        td.rough[i] = 0.1 + vein * 0.05 + ss(0.55, 0.95, dull[i]) * 0.3 + scr[i] * 0.2 + seam * 0.5;
      }
    }
    stains(td, sd, o.stain ?? 0.25, 3, [0.3, 0.26, 0.2]);
  },
  paintedMetal(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 211;
    const base = paintBase(td, o, 0x8a2a20);
    const mott = mask(S, sd, 3, 5);
    const peelN = fbm(S, sd + 1, 128, 128, 2);
    const chipF = mask(S, sd + 4, 6, 6, { warp: 30, gain: 0.6 });
    const fine = fbm(S, sd + 5, 48, 48, 3);
    const chipAmt = o.chips ?? 0.12;
    const t1 = 1 - chipAmt;
    const chipMask = new Float32Array(N);
    for (let i = 0; i < N; i++) chipMask[i] = ss(t1, t1 + 0.01, chipF[i]);
    const bleed = bleedDown(chipMask, S, 0.982, colNoise(S, sd + 6, 96));
    const scr = scratchField(S, sd + 7, 140, { len: 35, width: 0.5 });
    const sk = streakMask(S, sd + 8, 0.6, 0.45);
    for (let i = 0; i < N; i++) {
      const t = 0.88 + (mott[i] - 0.5) * 0.14 + (peelN[i] - 0.5) * 0.04;
      let r = base[0] * t, g = base[1] * t, b = base[2] * t;
      let rough = 0.42 + (mott[i] - 0.5) * 0.12 + (peelN[i] - 0.5) * 0.06, metal = 0.05;
      let h = 0.5 + peelN[i] * 0.03;
      // primer rim around chips, then bare / rusty metal inside
      const rim = ss(t1 - 0.012, t1, chipF[i]) * (1 - chipMask[i]);
      if (rim > 0) { r += (0.52 - r) * rim * 0.6; g += (0.5 - g) * rim * 0.6; b += (0.46 - b) * rim * 0.6; }
      const c = chipMask[i];
      if (c > 0) {
        const rusty = fine[i] > 0.45;
        const mc = rusty ? [0.36 * (0.7 + fine[i] * 0.5), 0.18 * (0.7 + fine[i] * 0.5), 0.08] : [0.34, 0.34, 0.33];
        r += (mc[0] - r) * c; g += (mc[1] - g) * c; b += (mc[2] - b) * c;
        rough += ((rusty ? 0.9 : 0.5) - rough) * c; metal += ((rusty ? 0.1 : 0.8) - metal) * c; h -= 0.2 * c;
      }
      const bl = bleed[i] * (1 - c);
      if (bl > 0) { r += (0.4 - r) * bl * 0.4; g += (0.2 - g) * bl * 0.4; b += (0.09 - b) * bl * 0.4; rough += 0.1 * bl; }
      const s = scr[i];
      if (s > 0) { r += (0.45 - r) * s * 0.6; g += (0.45 - g) * s * 0.6; b += (0.43 - b) * s * 0.6; h -= s * 0.05; metal += 0.4 * s; }
      if (sk[i] > 0) { const k = sk[i] * 0.35; r += (0.16 - r) * k; g += (0.14 - g) * k; b += (0.11 - b) * k; rough += 0.15 * k; }
      td.set(i, r, g, b);
      if (td.a) td.a[i] = clamp(1 - c - rim * 0.6 - bl * 0.4 - s * 0.6 - sk[i] * 0.35, 0, 1);
      td.h[i] = h;
      td.rough[i] = rough;
      td.metal[i] = metal;
    }
    stains(td, sd, o.stain ?? 0.3, 2, [0.1, 0.08, 0.06]);
  },
  rubber(td, o) {
    const S = td.size, N = S * S, sd = o.seed ?? 221;
    const f = fbm(S, sd, 6, 6, 4), fine = fbm(S, sd + 1, S >> 1, S >> 1, 1), dust = mask(S, sd + 2, 3, 4);
    for (let i = 0; i < N; i++) {
      const t = 0.8 + f[i] * 0.2 + (fine[i] - 0.5) * 0.1;
      td.set(i, 0.07 * t, 0.07 * t, 0.075 * t);
      const dk = ss(0.6, 0.95, dust[i]) * 0.5;
      if (dk > 0) td.mix(i, [0.25, 0.24, 0.22], dk * 0.5);
      td.h[i] = f[i] * 0.2 + fine[i] * 0.15;
      td.rough[i] = 0.75 + dk * 0.2;
    }
  },
  zombieCloth(td, o) {
    // Clothing texture for infected: torn fabric with grime, blood and bite marks.
    const S = td.size, N = S * S, sd = o.seed ?? 231;
    const f = fbm(S, sd, 4, 4, 5), gr = mask(S, sd + 1, 3, 5), tearF = fbm(S, sd + 2, 30, 30, 1);
    const period = Math.max(3, Math.round(S / 160));
    for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
      const weave = 0.5 + 0.5 * Math.sin((x / period) * Math.PI) * Math.sin((y / period) * Math.PI);
      const grime = ss(0.45, 0.85, gr[i]);
      const t = 0.85 + weave * 0.1 + (f[i] - 0.5) * 0.35;
      let r = t, g = t, b = t;
      r = lerp(r, 0.35, grime * 0.6); g = lerp(g, 0.3, grime * 0.6); b = lerp(b, 0.22, grime * 0.6);
      const tear = tearF[i] > 0.8 ? 1 : 0;
      if (tear) { r *= 0.55; g *= 0.5; b *= 0.5; }
      td.set(i, r, g, b);
      td.h[i] = weave * 0.2 + f[i] * 0.3 - tear * 0.3;
      td.rough[i] = 0.9;
    }
  },
  // Window glass grime: albedo = dirt colour, alpha = dirt density; roughness
  // = smudges, fingerprints and wiped arcs.
  glass(td, o) {
    const S = td.size, N = S * S, P = S / 512, sd = o.seed ?? 241;
    const dirt = o.dirt ?? 0.5;
    td.a = new Float32Array(N);
    const film = mask(S, sd + 2, 3, 5, { warp: 60 });
    const sk = streakMask(S, sd + 3, 1, 0.8);
    const fine = fbm(S, sd + 4, 96, 96, 2);
    const prints = new Float32Array(N);
    const r = mulberry(sd * 3 + 1);
    for (let k = 0; k < 26; k++) {
      const cx = r() * S, cy = r() * S, rad = (5 + r() * 5) * P, ang = r() * Math.PI;
      for (let ring = 1; ring < 7; ring++) {
        const rr = rad * ring / 7;
        for (let a = 0; a < Math.PI * 2; a += 0.35 / ring) {
          const ex = Math.cos(a) * rr, ey = Math.sin(a) * rr * 1.35;
          stamp(prints, S, cx + ex * Math.cos(ang) - ey * Math.sin(ang), cy + ex * Math.sin(ang) + ey * Math.cos(ang), 0.45 * P, 0.7);
        }
      }
    }
    // wiped arc (someone cleared a peephole)
    const wipe = new Float32Array(N);
    { const cx = r() * S, cy = r() * S, R = (60 + r() * 60) * P; for (let a = 0; a < Math.PI * 2; a += 0.02) for (let q = 0; q < 1; q += 0.1) stamp(wipe, S, cx + Math.cos(a) * R * q, cy + Math.sin(a) * R * q * 0.8, 3 * P, 1); }
    for (let i = 0; i < N; i++) {
      let d = (0.15 + ss(0.3, 1, film[i]) * 0.6 + sk[i] * 0.35 + (fine[i] - 0.5) * 0.1) * dirt;
      d *= 1 - wipe[i] * 0.8;
      td.set(i, 0.42 + fine[i] * 0.08, 0.4 + fine[i] * 0.07, 0.34);
      td.a[i] = clamp(0.35 + d, 0, 1);
      td.h[i] = 0.5;
      td.rough[i] = clamp(0.05 + d * 0.6 + prints[i] * 0.35, 0.03, 1);
    }
  },
};

// Formwork seams and tie holes for cast-in-place concrete walls.
function formwork(td, sd) {
  const S = td.size, N = S * S, P = S / 512;
  const holes = new Float32Array(N), fins = new Float32Array(N);
  const panelsX = 2;
  for (let k = 0; k < panelsX; k++) line(fins, S, (k / panelsX) * S, 0, (k / panelsX) * S, S, 0.9 * P, 1);
  line(fins, S, 0, 0.5, S, 0.5, 0.9 * P, 1);
  for (let k = 0; k < panelsX; k++) for (const hu of [0.22, 0.78]) for (const hv of [0.17, 0.5, 0.83]) {
    stamp(holes, S, ((k + hu) / panelsX) * S, hv * S, 2.6 * P, 1);
  }
  const rustRun = bleedDown(holes, S, 0.975, colNoise(S, sd + 33, 128));
  for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
    const panel = Math.floor((x / S) * panelsX);
    const pt = 1 + (ih(panel, 0, sd) - 0.5) * 0.08;
    td.mul(i, pt);
    const f = fins[i];
    if (f > 0) { td.h[i] += 0.25 * f; td.mul(i, 1 + 0.06 * f); }
    const h = holes[i];
    if (h > 0) { td.h[i] -= 0.8 * h; td.mul(i, 1 - 0.65 * h); td.rough[i] = Math.min(1, td.rough[i] + 0.05 * h); }
    const rr = rustRun[i] * (1 - h);
    if (rr > 0) td.mix(i, [0.3, 0.2, 0.13], rr * 0.3);
  }
}

// Wallpaper motifs (signed distance; x mirrored for symmetric damask).
function sdEl(x, y, a, b) { return (Math.hypot(x / a, y / b) - 1) * Math.min(a, b); }
function rot(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }
function damaskSDF(x, y) {
  let d = sdEl(x, y - 0.02, 0.1, 0.27);
  d = Math.max(d, -sdEl(x, y - 0.02, 0.045, 0.17));
  d = Math.min(d, sdEl(x, y + 0.02, 0.018, 0.12));
  d = Math.min(d, sdEl(x, y - 0.35, 0.04, 0.08));
  let p = rot(x - 0.2, y + 0.1, 0.75); d = Math.min(d, sdEl(p[0], p[1], 0.17, 0.05));
  p = rot(x - 0.17, y - 0.17, -0.65); d = Math.min(d, sdEl(p[0], p[1], 0.14, 0.04));
  d = Math.min(d, Math.abs(Math.hypot(x - 0.3, y + 0.33) - 0.08) - 0.018);
  d = Math.min(d, Math.abs(Math.hypot(x - 0.32, y - 0.3) - 0.06) - 0.015);
  d = Math.min(d, (x + Math.abs(y + 0.42)) * 0.7 - 0.045);
  d = Math.min(d, Math.hypot(0.5 - x, 0.5 - Math.abs(y)) - 0.06);
  d = Math.min(d, Math.max(Math.abs(y) - 0.5, Math.abs(x - 0.5) - 0.008));
  return d;
}
const _fl = [0, 0, 0];
function floralSDF(x, y, rr) {
  // [petals, leaves/stems, centres]
  const a0 = rr * 6.283;
  const ang = Math.atan2(y, x) + a0, rad = Math.hypot(x, y);
  let petals = rad - (0.1 + 0.055 * Math.cos(5 * ang));
  const bx = x - 0.3, by = y + 0.28;
  const ang2 = Math.atan2(by, bx) - a0, rad2 = Math.hypot(bx, by);
  petals = Math.min(petals, rad2 - (0.055 + 0.03 * Math.cos(5 * ang2)));
  let p = rot(x + 0.16, y + 0.12, 0.6 + rr); let leaves = sdEl(p[0], p[1], 0.12, 0.04);
  p = rot(x - 0.14, y - 0.17, -0.5 - rr); leaves = Math.min(leaves, sdEl(p[0], p[1], 0.11, 0.035));
  leaves = Math.min(leaves, Math.abs(Math.hypot(x - 0.18, y + 0.02) - 0.22) - 0.008 + Math.max(0, -(y + 0.02)) * 2);
  p = rot(x + 0.33, y - 0.3, 1.2); leaves = Math.min(leaves, sdEl(p[0], p[1], 0.07, 0.025));
  const centre = Math.min(rad - 0.03, rad2 - 0.018);
  _fl[0] = petals; _fl[1] = leaves; _fl[2] = centre;
  return _fl;
}


// per-kind normal strength / albedo cavity baking defaults
const NSTR = { brick: 4.5, sewer: 4.5, tiles: 3.5, concrete: 2.6, plaster: 2.2, wallpaper: 1.6, woodfloor: 2.5, wood: 2.0, carpet: 3.0, asphalt: 2.4, sidewalk: 2.8, metal: 1.6, diamond: 5.0, rooftar: 4.0, ceiling: 2.5, linoleum: 1.6, dirt: 3.0, fabric: 2.0, marble: 1.5, paintedMetal: 2.0, rubber: 1.5, zombieCloth: 3.0, glass: 0.5 };
const BAKE = { brick: 0.6, sewer: 0.6, rooftar: 0.6, asphalt: 0.5, tiles: 0.3, carpet: 0.35, ceiling: 0.5, glass: 0 };

function generate(kind, opts, size) {
  const gen = GEN[kind];
  if (!gen) throw new Error('Unknown texture ' + kind);
  const td = new TexData(size);
  gen(td, opts);
  const out = buildArrays(td, { normalStrength: NSTR[kind], bakeAO: BAKE[kind], ...opts });
  out.paintGain = td.paintN0 ? 1 / Math.pow(td.paintN0, 2.2) : 1;
  return out;
}
return { generate, Noise, makeWorley, mulberry, fbm, eq, b8, GEN };
}
const TF = texFactory();
const { Noise, makeWorley, mulberry } = TF;

// ------------------------------------------------------------------ API ----
const clampO = (v, a, b) => (v < a ? a : v > b ? b : v);
function makeTex(data, S, srgb, aniso) {
  const t = new THREE.DataTexture(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
function refill(t, data, S) {
  t.dispose(); // new size -> reallocate GPU storage on next use
  t.image = { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: S, height: S };
  t.needsUpdate = true;
}

// Worker pool: full-resolution maps are generated off the main thread; the
// level gets an immediate low-res placeholder of the same material.
let pool = null;
function getPool() {
  if (pool !== null) return pool;
  pool = false;
  try {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof document === 'undefined') return pool;
    const src = `const TF = (${texFactory.toString()})();\n` +
      'self.onmessage = (e) => { const d = e.data; const t0 = performance.now(); try { const r = TF.generate(d.kind, d.opts, d.size); self.postMessage({ id: d.id, ms: performance.now() - t0, alb: r.alb, nor: r.nor, orm: r.orm }, [r.alb.buffer, r.nor.buffer, r.orm.buffer]); } catch (err) { self.postMessage({ id: d.id, error: String(err) }); } };';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
    const P = { workers: [], queue: [], jobs: new Map(), id: 1 };
    for (let i = 0; i < n; i++) {
      const w = new Worker(url);
      w.job = null;
      w.onmessage = (e) => onDone(P, w, e.data);
      w.onerror = (e) => { e.preventDefault?.(); failWorker(P, w); };
      P.workers.push(w);
    }
    pool = P;
  } catch (e) {
    pool = false;
  }
  return pool;
}
function pump(P) {
  for (const w of P.workers) {
    if (w.job || !P.queue.length) continue;
    const job = P.queue.shift();
    w.job = job;
    w.postMessage({ id: job.id, kind: job.kind, opts: job.opts, size: job.size });
  }
}
function finish(job, r, ms) {
  refill(job.t.map, r.alb, job.size);
  refill(job.t.normalMap, r.nor, job.size);
  refill(job.t.ormMap, r.orm, job.size);
  job.t.ready = true;
  texStats.pending--;
  texStats.workerMs += ms;
  texStats.byKind[job.kind] = (texStats.byKind[job.kind] || 0) + ms;
}
function onDone(P, w, d) {
  const job = w.job;
  w.job = null;
  if (job) {
    if (d.error) { const t0 = performance.now(); const r = TF.generate(job.kind, job.opts, job.size); finish(job, r, 0); texStats.ms += performance.now() - t0; }
    else finish(job, d, d.ms);
  }
  pump(P);
}
function failWorker(P, w) {
  // worker unusable (e.g. blocked by a CSP): finish its job and the queue synchronously
  P.workers = P.workers.filter((x) => x !== w);
  const jobs = [w.job, ...(P.workers.length ? [] : P.queue.splice(0))].filter(Boolean);
  w.job = null;
  for (const job of jobs) { const t0 = performance.now(); finish(job, TF.generate(job.kind, job.opts, job.size), 0); texStats.ms += performance.now() - t0; }
  pump(P);
}

// Generation stats: ms = main-thread time, workerMs = background time.
texStats.workerMs = 0;
texStats.pending = 0;
const cache = new Map();
const PLACEHOLDER = 32;
export function getTexture(kind, opts = {}) {
  const key = kind + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  let size = opts.size ?? SIZE;
  size = 1 << Math.round(Math.log2(Math.max(64, size)));
  const aniso = opts.anisotropy ?? 8;
  const P = size > PLACEHOLDER && opts.sync !== true ? getPool() : false;
  const t0 = performance.now();
  const r = TF.generate(kind, opts, P ? PLACEHOLDER : size);
  const S0 = P ? PLACEHOLDER : size;
  const t = { map: makeTex(r.alb, S0, true, aniso), normalMap: makeTex(r.nor, S0, false, aniso), ormMap: makeTex(r.orm, S0, false, aniso), paintGain: r.paintGain, ready: !P };
  const ms = performance.now() - t0;
  texStats.ms += ms;
  texStats.count++;
  if (P) {
    texStats.pending++;
    P.queue.push({ id: P.id++, kind, opts, size, t });
    pump(P);
  } else texStats.byKind[kind] = (texStats.byKind[kind] || 0) + ms;
  cache.set(key, t);
  return t;
}
// True once every requested texture has its full-resolution maps.
export function texturesReady() { return texStats.pending === 0; }

// Shared micro-detail texture for the level-material shader (RG = normal
// perturbation, B = albedo grain, A = roughness grain). Linear, tileable.
let detailTex = null;
export function getDetailTexture() {
  if (detailTex) return detailTex;
  const S = 256, N = S * S;
  const h = Float32Array.from(TF.fbm(S, 4242, 32, 32, 4, 0.6));
  const g = TF.fbm(S, 4243, 128, 128, 1);
  const r2 = TF.fbm(S, 4244, 16, 16, 3);
  for (let i = 0; i < N; i++) h[i] = h[i] * 0.7 + g[i] * 0.3;
  const data = new Uint8Array(N * 4), M = S - 1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const dx = (h[y * S + ((x + 1) & M)] - h[y * S + ((x - 1) & M)]) * 6;
    const dy = (h[((y + 1) & M) * S + x] - h[((y - 1) & M) * S + x]) * 6;
    data[i * 4] = TF.b8(0.5 - dx * 0.5);
    data[i * 4 + 1] = TF.b8(0.5 - dy * 0.5);
    data[i * 4 + 2] = TF.b8(h[i]);
    data[i * 4 + 3] = TF.b8(r2[i]);
  }
  detailTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping;
  detailTex.magFilter = THREE.LinearFilter;
  detailTex.minFilter = THREE.LinearMipmapLinearFilter;
  detailTex.generateMipmaps = true;
  detailTex.anisotropy = 4;
  detailTex.needsUpdate = true;
  return detailTex;
}

// Blood mask texture (R channel) used for per-instance blood on infected.
let bloodMask = null;
export function getBloodMask() {
  if (bloodMask) return bloodMask;
  const s = 256;
  const n = new Noise(999);
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = x / s, v = y / s;
    const f = n.fbm(u, v, 4, 5);
    const drip = n.fbm(u * 1.0, v * 0.2, 6, 3);
    const m = clampO(f * 0.8 + drip * 0.4, 0, 1);
    const i = (y * s + x) * 4;
    data[i] = m * 255; data[i + 1] = m * 255; data[i + 2] = m * 255; data[i + 3] = 255;
  }
  bloodMask = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
  bloodMask.wrapS = bloodMask.wrapT = THREE.RepeatWrapping;
  bloodMask.generateMipmaps = true;
  bloodMask.minFilter = THREE.LinearMipmapLinearFilter;
  bloodMask.magFilter = THREE.LinearFilter;
  bloodMask.needsUpdate = true;
  return bloodMask;
}

export { Noise, makeWorley, mulberry };
export const fbmField = TF.fbm, equalize = TF.eq;
