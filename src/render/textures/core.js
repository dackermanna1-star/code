// Core helpers for the procedural block textures: an RGBA float image with wrap-around drawing,
// colour utilities (hex palettes, hue-shifted ramps), tileable noise fields (value noise / fbm /
// worley / white) and a few weathering effects. Everything is pure JS and deterministic.
import { hash32, makeRng, seedFromString } from '../../core/rng.js';

export const S = 16;
export { makeRng, seedFromString };

// ---------------------------------------------------------------------------
// colour
// colours are plain [r, g, b] arrays and are never mutated in place, so hex() results can be shared
const HEX = new Map();
export const hex = (h) => {
  let c = HEX.get(h);
  if (!c) { c = [(h >> 16) & 255, (h >> 8) & 255, h & 255]; HEX.set(h, c); }
  return c;
};
export const pal = (...hs) => hs.map(hex);
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const addc = (c, d) => [c[0] + d, c[1] + d, c[2] + d];
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function rgb2hsl(c) {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
const hueToward = (h, target, t) => {
  let d = target - h;
  d = ((d + 540) % 360) - 180;
  return h + d * t;
};

/**
 * Lighten (dl > 0) or darken (dl < 0) a colour pixel-art style: shadows drift toward blue/purple and get a bit
 * more saturated, highlights drift toward warm yellow and desaturate.
 */
const SHADE = new Map();
export function shade(c, dl, hueAmt = 0.35) {
  const key = ((((c[0] + 0.5) | 0) * 65536 + ((c[1] + 0.5) | 0) * 256 + ((c[2] + 0.5) | 0)) * 4096) + ((dl * 1000 + 2048) | 0) + hueAmt * 1e-3;
  let out = SHADE.get(key);
  if (out === undefined) {
    out = shadeRaw(c, dl, hueAmt);
    if (SHADE.size > 60000) SHADE.clear();
    SHADE.set(key, out);
  }
  return out;
}
function shadeRaw(c, dl, hueAmt) {
  const [h, s, l] = rgb2hsl(c);
  const k = Math.min(1, Math.abs(dl) * hueAmt * 2);
  const nh = s < 0.04 ? h : dl < 0 ? hueToward(h, 235, k * 0.35) : hueToward(h, 50, k * 0.3);
  const ns = clamp01(dl < 0 ? s * (1 + Math.abs(dl) * 0.5) : s * (1 - dl * 0.45));
  return hsl2rgb(nh, ns, clamp01(l + dl));
}
/** n tones from dark to light around c (spread = HSL lightness delta at the ends). */
export function ramp(c, n = 5, spread = 0.12, hueAmt = 0.35) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(shade(c, n === 1 ? 0 : -spread + (2 * spread * i) / (n - 1), hueAmt));
  return out;
}
export const desat = (c, t) => {
  const g = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return mix(c, [g, g, g], t);
};

// ---------------------------------------------------------------------------
// image
export class Img {
  constructor(w = S, h = S) {
    this.w = w;
    this.h = h;
    this.d = new Float32Array(w * h * 4);
  }
  i(x, y) {
    const w = this.w, h = this.h;
    if (x >= 0 && y >= 0 && x < w && y < h && (x | 0) === x && (y | 0) === y) return (y * w + x) * 4;
    x = Math.floor(x); y = Math.floor(y);
    x = ((x % w) + w) % w;
    y = ((y % h) + h) % h;
    return (y * w + x) * 4;
  }
  set(x, y, c, a = 255) {
    const i = this.i(x, y), d = this.d;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a;
  }
  get(x, y) {
    const i = this.i(x, y), d = this.d;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }
  rgb(x, y) {
    const i = this.i(x, y), d = this.d;
    return [d[i], d[i + 1], d[i + 2]];
  }
  alpha(x, y) { return this.d[this.i(x, y) + 3]; }
  setA(x, y, a) { this.d[this.i(x, y) + 3] = a; }
  /** blend colour c over pixel by t (keeps alpha unless opaque given) */
  mix(x, y, c, t, opaque = false) {
    if (t <= 0) return;
    if (t > 1) t = 1;
    const i = this.i(x, y), d = this.d;
    d[i] += (c[0] - d[i]) * t; d[i + 1] += (c[1] - d[i + 1]) * t; d[i + 2] += (c[2] - d[i + 2]) * t;
    if (opaque) d[i + 3] = 255;
  }
  mul(x, y, k) {
    const i = this.i(x, y), d = this.d;
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  add(x, y, v) {
    const i = this.i(x, y), d = this.d;
    d[i] += v; d[i + 1] += v; d[i + 2] += v;
  }
  /** lighten / darken a pixel with hue shift */
  tone(x, y, dl) { const a = this.alpha(x, y); this.set(x, y, shade(this.rgb(x, y), dl), a); }
  fill(c, a = 255) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c, a); return this; }
  rect(x0, y0, w, h, c, a = 255) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a); }
  mixRect(x0, y0, w, h, c, t) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.mix(x, y, c, t); }
  mulRect(x0, y0, w, h, k) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.mul(x, y, k); }
  clearRect(x0, y0, w, h) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.setA(x, y, 0); }
  hline(x0, x1, y, c, a = 255) { for (let x = x0; x <= x1; x++) this.set(x, y, c, a); }
  vline(x, y0, y1, c, a = 255) { for (let y = y0; y <= y1; y++) this.set(x, y, c, a); }
  /** outline rectangle: top/left edge colour hi, bottom/right lo (bevel). */
  bevel(x0, y0, w, h, hi, lo) {
    for (let x = x0; x < x0 + w; x++) { if (hi) this.set(x, y0, hi); if (lo) this.set(x, y0 + h - 1, lo); }
    for (let y = y0; y < y0 + h; y++) { if (hi) this.set(x0, y, hi); if (lo) this.set(x0 + w - 1, y, lo); }
  }
  /** relative bevel: brighten top/left, darken bottom/right by factors */
  bevelK(x0, y0, w, h, kh = 1.15, kl = 0.75) {
    for (let x = x0; x < x0 + w; x++) { this.mul(x, y0, kh); this.mul(x, y0 + h - 1, kl); }
    for (let y = y0 + 1; y < y0 + h - 1; y++) { this.mul(x0, y, kh); this.mul(x0 + w - 1, y, kl); }
  }
  line(x0, y0, x1, y1, c, a = 255) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (typeof c === 'function') c(x0, y0); else this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** call fn(x, y, dist) for pixels whose centre lies within r of (cx, cy) (pixel centres at +0.5) */
  disc(cx, cy, r, fn) {
    const x0 = Math.floor(cx - r - 1), x1 = Math.ceil(cx + r + 1);
    const y0 = Math.floor(cy - r - 1), y1 = Math.ceil(cy + r + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r) {
        if (typeof fn === 'function') fn(x, y, d); else this.set(x, y, fn);
      }
    }
  }
  each(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y); }
  copy(src, sx = 0, sy = 0, dx = 0, dy = 0, w = src.w, h = src.h) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = src.get(sx + x, sy + y);
      this.set(dx + x, dy + y, p, p[3]);
    }
    return this;
  }
  /** draw src over this using src alpha (binary: alpha > 0 overwrites) */
  over(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const p = src.get(x, y);
      if (p[3] > 0) this.set(dx + x, dy + y, p, Math.max(p[3], this.alpha(dx + x, dy + y)));
    }
    return this;
  }
  clone() { const o = new Img(this.w, this.h); o.d.set(this.d); return o; }
  sub(x0, y0, w = S, h = S) { const o = new Img(w, h); return o.copy(this, x0, y0, 0, 0, w, h); }
}

/** cache an expensive shared base image (e.g. the asphalt under every road marking); returns a copy */
const MEMO = new Map();
export function memoImg(key, make) {
  let m = MEMO.get(key);
  if (!m) { m = make(); MEMO.set(key, m); }
  return m.clone();
}

// ---------------------------------------------------------------------------
// tileable noise fields (Float32Array w*h, values 0..1)
const smoothT = (t) => t * t * (3 - 2 * t);

/** periodic value noise: px cells across the width, py cells down the height */
const LAT = new Float32Array(64 * 64);
const SX0 = new Int32Array(64), SX1 = new Int32Array(64), STX = new Float32Array(64);
/** add amp * periodic value noise (px cells across the width, py down the height) into out */
function vnoiseInto(out, amp, seed, px, py, w, h) {
  for (let j = 0; j < py; j++) for (let i = 0; i < px; i++) LAT[j * px + i] = hash32(seed, i, j, 7) / 4294967296;
  if (px === w && py === h) { for (let i = 0; i < w * h; i++) out[i] += LAT[i] * amp; return out; }
  for (let x = 0; x < w; x++) {
    const fx = (x * px) / w, x0 = Math.floor(fx);
    SX0[x] = x0 % px; SX1[x] = (x0 + 1) % px; STX[x] = smoothT(fx - x0);
  }
  for (let y = 0; y < h; y++) {
    const fy = (y * py) / h, y0 = Math.floor(fy), ty = smoothT(fy - y0);
    const j0 = (y0 % py) * px, j1 = ((y0 + 1) % py) * px;
    for (let x = 0; x < w; x++) {
      const i0 = SX0[x], i1 = SX1[x], tx = STX[x];
      const a = LAT[j0 + i0], b = LAT[j0 + i1], c = LAT[j1 + i0], d = LAT[j1 + i1];
      const top = a + (b - a) * tx;
      out[y * w + x] += (top + (c + (d - c) * tx - top) * ty) * amp;
    }
  }
  return out;
}
/** periodic value noise: px cells across the width, py cells down the height (values 0..1) */
export function vnoise(seed, px, py = px, w = S, h = S) {
  return vnoiseInto(new Float32Array(w * h), 1, seed, px, py, w, h);
}

/** fractal value noise, normalised to 0..1. px/py = base cell counts (doubling each octave, capped at w/h). */
export function fbm(seed, px = 2, py = px, oct = 3, gain = 0.5, w = S, h = S) {
  const out = new Float32Array(w * h);
  let amp = 1;
  for (let o = 0; o < oct; o++) {
    vnoiseInto(out, amp, seed + o * 1013, Math.min(w, px << o), Math.min(h, py << o), w, h);
    amp *= gain;
  }
  return norm(out);
}

/** per-pixel white noise 0..1 */
export function white(seed, w = S, h = S) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = hash32(seed, x, y, 3) / 4294967296;
  return out;
}
export const rnd = (seed, x, y, k = 0) => hash32(seed, x & 4095, y & 4095, k) / 4294967296;

/** tileable worley / cellular noise with nx * ny jittered feature points. */
export function worley(seed, nx, ny = nx, jitter = 0.85, w = S, h = S, sy = 1) {
  const cw = w / nx, ch = h / ny;
  const fx = new Float32Array(nx * ny), fy = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    fx[j * nx + i] = (i + 0.5 + (hash32(seed, i, j, 1) / 4294967296 - 0.5) * jitter) * cw;
    fy[j * nx + i] = (j + 0.5 + (hash32(seed, i, j, 2) / 4294967296 - 0.5) * jitter) * ch;
  }
  const d1 = new Float32Array(w * h), d2 = new Float32Array(w * h), id = new Int32Array(w * h);
  const ox = new Float32Array(w * h), oy = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ci = Math.floor((x + 0.5) / cw), cj = Math.floor((y + 0.5) / ch);
    let b1 = 1e9, b2 = 1e9, bid = 0, bx = 0, by = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = (((ci + di) % nx) + nx) % nx, jj = (((cj + dj) % ny) + ny) % ny;
      const k = jj * nx + ii;
      let dx = x + 0.5 - fx[k], dy = y + 0.5 - fy[k];
      dx -= Math.round(dx / w) * w; dy -= Math.round(dy / h) * h;
      const dd = Math.hypot(dx, dy * sy);
      if (dd < b1) { b2 = b1; b1 = dd; bid = k; bx = dx; by = dy; } else if (dd < b2) b2 = dd;
    }
    const o = y * w + x;
    d1[o] = b1; d2[o] = b2; id[o] = bid; ox[o] = bx; oy[o] = by;
  }
  return { d1, d2, id, ox, oy, n: nx * ny };
}

export function norm(f) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < f.length; i++) { if (f[i] < mn) mn = f[i]; if (f[i] > mx) mx = f[i]; }
  const k = mx > mn ? 1 / (mx - mn) : 0;
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - mn) * k;
  return f;
}
/** rank-equalise a field so values are uniformly distributed in 0..1 */
export function eq(f) {
  // pack (quantised value, index) into one number and use the native typed-array sort
  const n = f.length;
  const keys = new Float64Array(n);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < n; i++) { if (f[i] < mn) mn = f[i]; if (f[i] > mx) mx = f[i]; }
  const k = mx > mn ? 1048575 / (mx - mn) : 0;
  for (let i = 0; i < n; i++) keys[i] = Math.floor((f[i] - mn) * k) * 65536 + i;
  keys.sort();
  const out = new Float32Array(n);
  for (let r = 0; r < n; r++) out[keys[r] % 65536] = r / (n - 1);
  return out;
}
/** weighted sum of fields */
export function combine(...pairs) {
  const n = pairs[0].length;
  const out = new Float32Array(n);
  for (let p = 0; p < pairs.length; p += 2) {
    const f = pairs[p], wt = pairs[p + 1];
    for (let i = 0; i < n; i++) out[i] += f[i] * wt;
  }
  return out;
}

// ---------------------------------------------------------------------------
// palette quantisation
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
/** pick a palette entry for v in 0..1, ordered-dithered */
export function pick(p, v, x = 0, y = 0, dith = 0.6) {
  const n = p.length;
  let t = v * n + (bayer(x, y) - 0.5) * dith;
  t = t < 0 ? 0 : t >= n ? n - 1 : t;
  return p[Math.floor(t)];
}
/** fill the image from a field through a palette */
export function paint(img, p, f, dith = 0.6, a = 255) {
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) img.set(x, y, pick(p, f[y * img.w + x], x, y, dith), a);
  return img;
}

// ---------------------------------------------------------------------------
// weathering effects
/** multiplicative per-pixel brightness jitter */
export function grain(img, seed, amt = 0.06, onlyOpaque = true) {
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (onlyOpaque && img.alpha(x, y) === 0) continue;
    img.mul(x, y, 1 + (rnd(seed, x, y, 11) - 0.5) * 2 * amt);
  }
  return img;
}
/** blotchy dirt overlay (fbm thresholded) */
export function grime(img, seed, amt = 0.35, col = [62, 52, 40], px = 3, lo = 0.45) {
  const f = fbm(seed, px, px, 2, 0.55, img.w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const t = smooth(lo, 1, f[y * img.w + x]) * amt;
    img.mix(x, y, col, t);
  }
  return img;
}
/** vertical drip streaks (rust / water stains). Wraps vertically so it tiles. */
export function streaks(img, seed, n, col, len = 8, amt = 0.45, width = 1) {
  const r = makeRng(seed);
  for (let k = 0; k < n; k++) {
    const x = r.int(0, img.w - 1), y = r.int(0, img.h - 1), l = r.int(Math.max(2, len >> 1), len);
    const a = amt * r.range(0.6, 1);
    for (let j = 0; j < l; j++) {
      const t = a * (1 - j / l);
      for (let wx = 0; wx < width; wx++) img.mix(x + wx, y + j, col, t * (wx ? 0.6 : 1));
    }
  }
  return img;
}
/** scatter single pixels from palette p with probability density */
export function speckle(img, seed, density, p, t = 1) {
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (rnd(seed, x, y, 21) < density) {
      const c = p[Math.floor(rnd(seed, x, y, 22) * p.length)];
      img.mix(x, y, c, t);
    }
  }
  return img;
}
/** random-walk crack. calls draw(x, y, step) for each pixel */
export function walk(r, x, y, len, dx, dy, wobble, draw) {
  let fx = x + 0.5, fy = y + 0.5;
  let ang = Math.atan2(dy, dx);
  let px = null, py = null;
  for (let s = 0; s < len; s++) {
    const ix = Math.floor(fx), iy = Math.floor(fy);
    if (ix !== px || iy !== py) { draw(ix, iy, s); px = ix; py = iy; }
    ang += (r.next() - 0.5) * wobble;
    fx += Math.cos(ang) * 0.9; fy += Math.sin(ang) * 0.9;
  }
  return [Math.floor(fx), Math.floor(fy)];
}
/** darken a crack line with a lighter lip below/right (reads as an engraved fissure) */
export function crack(img, r, x, y, len, dx, dy, opts = {}) {
  const { dark = 0.55, lip = 1.12, wobble = 0.9, branch = 0.08, depth = 0 } = opts;
  walk(r, x, y, len, dx, dy, wobble, (ix, iy, s) => {
    img.mul(ix, iy, dark);
    if (lip) img.mul(ix + 1, iy + 1, lip);
    if (depth < 2 && r.next() < branch) {
      const a = Math.atan2(dy, dx) + (r.next() < 0.5 ? -1 : 1) * r.range(0.6, 1.2);
      crack(img, r, ix, iy, Math.max(2, Math.floor(len * 0.35)), Math.cos(a), Math.sin(a), { ...opts, depth: depth + 1, dark: Math.min(0.85, dark + 0.15) });
    }
  });
}

/** small leaf / plant scatter used by several ground textures */
export function leafBit(img, x, y, c, r) {
  const shapes = [
    [[0, 0], [1, 0], [0, 1]],
    [[0, 0], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0]],
    [[0, 0], [0, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 1]],
  ];
  const sh = shapes[r.int(0, shapes.length - 1)];
  sh.forEach(([dx, dy], k) => img.set(x + dx, y + dy, k === 0 ? shade(c, 0.06) : k === sh.length - 1 ? shade(c, -0.06) : c));
}
