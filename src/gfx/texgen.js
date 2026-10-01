// Tiny software painter for procedural, tileable 64x64 textures with PS1-style palette reduction.
import { RNG, rand2 } from '../core/rng.js';
import { rasterText } from './font.js';

export const TS = 64;

const sfade = (t) => t * t * (3 - 2 * t);

// periodic value noise over the TS x TS tile; period = lattice cells across the tile
export function pnoise(x, y, period, seed) {
  const fx = (x / TS) * period, fy = (y / TS) * period;
  const xi = Math.floor(fx), yi = Math.floor(fy);
  const u = sfade(fx - xi), v = sfade(fy - yi);
  const w = (i) => ((i % period) + period) % period;
  const a = rand2(w(xi), w(yi), seed), b = rand2(w(xi + 1), w(yi), seed);
  const c = rand2(w(xi), w(yi + 1), seed), d = rand2(w(xi + 1), w(yi + 1), seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function pfbm(x, y, period, oct, seed) {
  let s = 0, a = 0.5, n = 0, p = period;
  for (let i = 0; i < oct; i++) {
    s += pnoise(x, y, p, seed + i * 977) * a;
    n += a; a *= 0.5; p *= 2;
  }
  return s / n;
}

export class Painter {
  constructor(seed = 1) {
    const n = TS * TS;
    this.r = new Float32Array(n); this.g = new Float32Array(n); this.b = new Float32Array(n);
    this.a = new Float32Array(n).fill(255);
    this.rng = new RNG(seed);
    this.seed = seed;
  }
  i(x, y) { x = ((x % TS) + TS) % TS; y = ((y % TS) + TS) % TS; return (y | 0) * TS + (x | 0); }
  set(x, y, c, al = 1) {
    const k = this.i(Math.floor(x), Math.floor(y));
    if (al >= 1) { this.r[k] = c[0]; this.g[k] = c[1]; this.b[k] = c[2]; }
    else if (al > 0) {
      this.r[k] += (c[0] - this.r[k]) * al; this.g[k] += (c[1] - this.g[k]) * al; this.b[k] += (c[2] - this.b[k]) * al;
    }
    return this;
  }
  get(x, y) { const k = this.i(x, y); return [this.r[k], this.g[k], this.b[k]]; }
  alpha(x, y, v) { this.a[this.i(Math.floor(x), Math.floor(y))] = v; }
  fill(c) { this.r.fill(c[0]); this.g.fill(c[1]); this.b.fill(c[2]); return this; }
  clearAlpha(v = 0) { this.a.fill(v); return this; }
  rect(x, y, w, h, c, al = 1) {
    for (let yy = Math.floor(y); yy < Math.floor(y + h); yy++) for (let xx = Math.floor(x); xx < Math.floor(x + w); xx++) this.set(xx, yy, c, al);
    return this;
  }
  rectA(x, y, w, h, av) {
    for (let yy = Math.floor(y); yy < Math.floor(y + h); yy++) for (let xx = Math.floor(x); xx < Math.floor(x + w); xx++) this.alpha(xx, yy, av);
    return this;
  }
  frame(x, y, w, h, c, al = 1) {
    this.rect(x, y, w, 1, c, al); this.rect(x, y + h - 1, w, 1, c, al);
    this.rect(x, y, 1, h, c, al); this.rect(x + w - 1, y, 1, h, c, al);
    return this;
  }
  bevel(x, y, w, h, lightAmt, darkAmt) {
    this.shade(x, y, w, 1, lightAmt); this.shade(x, y, 1, h, lightAmt);
    this.shade(x, y + h - 1, w, 1, -darkAmt); this.shade(x + w - 1, y, 1, h, -darkAmt);
    return this;
  }
  line(x0, y0, x1, y1, c, al = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) this.set(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps), c, al);
    return this;
  }
  disc(cx, cy, r, c, al = 1, soft = 0) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r) {
          const f = soft > 0 ? Math.min(1, (r - d) / soft) : 1;
          this.set(x, y, c, al * f);
        }
      }
    }
    return this;
  }
  ring(cx, cy, r, w, c, al = 1) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r && d >= r - w) this.set(x, y, c, al);
      }
    }
    return this;
  }
  // multiply brightness of a region
  shade(x, y, w, h, amt) {
    const m = 1 + amt;
    for (let yy = Math.floor(y); yy < Math.floor(y + h); yy++) for (let xx = Math.floor(x); xx < Math.floor(x + w); xx++) {
      const k = this.i(xx, yy);
      this.r[k] *= m; this.g[k] *= m; this.b[k] *= m;
    }
    return this;
  }
  map(fn) {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const k = y * TS + x;
      const c = fn(x, y, [this.r[k], this.g[k], this.b[k]]);
      if (c) { this.r[k] = c[0]; this.g[k] = c[1]; this.b[k] = c[2]; }
    }
    return this;
  }
  // multiplicative noise
  noise(period, amp, oct = 2, seed = this.seed) {
    return this.map((x, y, c) => {
      const m = 1 + (pfbm(x, y, period, oct, seed) - 0.5) * 2 * amp;
      return [c[0] * m, c[1] * m, c[2] * m];
    });
  }
  grain(amp) {
    const rng = this.rng;
    return this.map((x, y, c) => {
      const m = 1 + (rng.next() - 0.5) * 2 * amp;
      return [c[0] * m, c[1] * m, c[2] * m];
    });
  }
  // colour-noise between two colours
  blend2(period, ca, cb, oct = 2, seed = this.seed, contrast = 1) {
    return this.map((x, y) => {
      let t = pfbm(x, y, period, oct, seed);
      t = Math.max(0, Math.min(1, (t - 0.5) * contrast + 0.5));
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
    });
  }
  speckle(count, c, alMin = 0.3, alMax = 0.8, size = 1) {
    const rng = this.rng;
    for (let n = 0; n < count; n++) {
      const x = rng.int(0, TS - 1), y = rng.int(0, TS - 1), al = rng.range(alMin, alMax);
      this.rect(x, y, size, size, c, al);
    }
    return this;
  }
  // irregular stain blotch with darker rim
  stain(cx, cy, rad, c, strength = 0.5, seed = this.seed) {
    for (let y = Math.floor(cy - rad * 1.5); y <= cy + rad * 1.5; y++) {
      for (let x = Math.floor(cx - rad * 1.5); x <= cx + rad * 1.5; x++) {
        const n = pnoise(x, y, 8, seed) * 0.6 + pnoise(x, y, 16, seed + 3) * 0.4;
        const d = Math.hypot(x - cx, y - cy) / rad + (n - 0.5) * 0.9;
        if (d < 1) {
          const rim = d > 0.82 ? 1.6 : 1;
          this.set(x, y, c, strength * (1 - d * 0.5) * rim * 0.6);
        }
      }
    }
    return this;
  }
  drip(x, y0, len, c, al = 0.3, w = 1) {
    const rng = this.rng;
    let xx = x;
    for (let y = y0; y < y0 + len; y++) {
      const f = 1 - (y - y0) / len;
      this.rect(xx, y, w, 1, c, al * (0.4 + 0.6 * f));
      if (rng.chance(0.08)) xx += rng.sign();
    }
    return this;
  }
  text(str, x, y, c, scale = 1, al = 1) {
    rasterText(str, x, y, scale, (px, py) => this.set(px, py, c, al));
    return this;
  }
  textA(str, x, y, av, scale = 1) {
    rasterText(str, x, y, scale, (px, py) => this.alpha(px, py, av));
    return this;
  }
  // copy from another painter (with optional offset)
  blit(src, dx = 0, dy = 0) {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const s = src.i(x, y), d = this.i(x + dx, y + dy);
      this.r[d] = src.r[s]; this.g[d] = src.g[s]; this.b[d] = src.b[s]; this.a[d] = src.a[s];
    }
    return this;
  }
  // scale a 32x32 painting up to 64x64 (chunkier pixels)
  pixelate(f = 2) {
    const r = this.r.slice(), g = this.g.slice(), b = this.b.slice(), a = this.a.slice();
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const s = Math.floor(y / f) * f * TS + Math.floor(x / f) * f, d = y * TS + x;
      this.r[d] = r[s]; this.g[d] = g[s]; this.b[d] = b[s]; this.a[d] = a[s];
    }
    return this;
  }
}

// ---- palette reduction (median cut over a 15-bit colour histogram) ----
function medianCut(pixels, n) {
  // pixels: array of [r,g,b]; collapse to unique 15-bit colours with weights first
  const hist = new Map();
  for (const p of pixels) {
    const k = ((p[0] >> 3) << 10) | ((p[1] >> 3) << 5) | (p[2] >> 3);
    const e = hist.get(k);
    if (e) { e[0] += p[0]; e[1] += p[1]; e[2] += p[2]; e[3]++; }
    else hist.set(k, [p[0], p[1], p[2], 1]);
  }
  const cols = [...hist.values()].map((e) => [e[0] / e[3], e[1] / e[3], e[2] / e[3], e[3]]);
  let boxes = [cols];
  while (boxes.length < n) {
    let bi = -1, best = -1, bch = 0;
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i];
      if (bx.length < 2) continue;
      let wsum = 0;
      for (const c of bx) wsum += c[3];
      for (let ch = 0; ch < 3; ch++) {
        let lo = 1e9, hi = -1e9;
        for (const c of bx) { if (c[ch] < lo) lo = c[ch]; if (c[ch] > hi) hi = c[ch]; }
        const range = (hi - lo) * Math.sqrt(wsum);
        if (range > best) { best = range; bi = i; bch = ch; }
      }
    }
    if (bi < 0 || best <= 0) break;
    const bx = boxes[bi];
    bx.sort((p, q) => p[bch] - q[bch]);
    let total = 0;
    for (const c of bx) total += c[3];
    let acc = 0, mid = 1;
    for (let i = 0; i < bx.length - 1; i++) { acc += bx[i][3]; if (acc >= total / 2) { mid = i + 1; break; } mid = i + 1; }
    boxes.splice(bi, 1, bx.slice(0, mid), bx.slice(mid));
  }
  return boxes.filter((b) => b.length).map((bx) => {
    let r = 0, g = 0, b = 0, w = 0;
    for (const c of bx) { r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; w += c[3]; }
    return [r / w, g / w, b / w];
  });
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// stipple partial alpha with an ordered dither (binary transparency, PS1 style)
function alphaAt(p, k) {
  const thr = (BAYER4[((k / TS) & 3) * 4 + (k & 3)] + 0.5) * 16;
  return p.a[k] >= thr ? 255 : 0;
}

const q5 = (v) => {
  const c = Math.max(0, Math.min(255, Math.round(v))) >> 3;
  return (c << 3) | (c >> 2);
};

// Produce RGBA8 data. colors: palette size (CLUT), 0 = no reduction (15-bit direct).
export function finalize(p, colors = 16) {
  const n = TS * TS;
  const out = new Uint8Array(n * 4);
  let pal = null;
  if (colors > 0) {
    const px = [];
    for (let k = 0; k < n; k++) if (p.a[k] >= 8) px.push([Math.max(0, Math.min(255, p.r[k])), Math.max(0, Math.min(255, p.g[k])), Math.max(0, Math.min(255, p.b[k]))]);
    if (px.length) pal = medianCut(px, colors);
  }
  const memo = new Map();
  for (let k = 0; k < n; k++) {
    let r = p.r[k], g = p.g[k], b = p.b[k];
    if (pal) {
      const key = ((Math.max(0, Math.min(255, r)) >> 2) << 12) | ((Math.max(0, Math.min(255, g)) >> 2) << 6) | (Math.max(0, Math.min(255, b)) >> 2);
      const hit = memo.get(key);
      if (hit) { out[k * 4] = hit[0]; out[k * 4 + 1] = hit[1]; out[k * 4 + 2] = hit[2]; out[k * 4 + 3] = alphaAt(p, k); continue; }
      let bd = 1e18, bc = pal[0];
      for (const c of pal) {
        const d = (c[0] - r) * (c[0] - r) * 0.3 + (c[1] - g) * (c[1] - g) * 0.59 + (c[2] - b) * (c[2] - b) * 0.11;
        if (d < bd) { bd = d; bc = c; }
      }
      r = bc[0]; g = bc[1]; b = bc[2];
      memo.set(key, [q5(r), q5(g), q5(b)]);
    }
    out[k * 4] = q5(r); out[k * 4 + 1] = q5(g); out[k * 4 + 2] = q5(b);
    out[k * 4 + 3] = alphaAt(p, k);
  }
  return out;
}
