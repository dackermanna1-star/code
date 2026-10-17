// Tile texture toolkit (tiles agent). A tiny RGBA pixel buffer with WRAP-AROUND drawing, so every
// texture is toroidal and tiles seamlessly at its period; tileable value noise; dithered palette
// shifts (quantised + BAYER4, never smooth blends); shaded chunks and cracks. Pure JS until
// `canvas()` — far faster than per-pixel fillRect and lets decay darken the *underlying* colour.
import { hexToRgb, PAL } from './palette.js';
import { makeCanvas, ctxOf, BAYER4, rng } from './util.js';

const RGB = new Map();
/** Colour → [r,g,b]. Accepts a PAL key, a hex string or an [r,g,b] array. */
export function rgb(c) {
  if (Array.isArray(c)) return c;
  let v = RGB.get(c);
  if (!v) { v = hexToRgb(PAL[c] || c); RGB.set(c, v); }
  return v;
}
export function mixc(a, b, t) {
  a = rgb(a); b = rgb(b);
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}
export const dk = (c, t) => mixc(c, [0, 0, 0], t);
export const lt = (c, t) => mixc(c, [255, 255, 255], t);
/** Ordered-dither threshold in (0,1) for a pixel. */
export const bay = (x, y) => (BAYER4[y & 3][x & 3] + 0.5) / 16;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class PB {
  constructor(w, h, fill) {
    this.w = w; this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
    if (fill) this.rect(0, 0, w, h, fill);
  }
  idx(x, y) {
    const { w, h } = this;
    x %= w; if (x < 0) x += w;
    y %= h; if (y < 0) y += h;
    return (y * w + x) << 2;
  }
  set(x, y, c) {
    c = rgb(c);
    const i = this.idx(Math.round(x), Math.round(y)), d = this.d;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  get(x, y) { const i = this.idx(x, y), d = this.d; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; }
  alpha(x, y) { return this.d[this.idx(x, y) + 3]; }
  clear(x, y) { this.d[this.idx(x, y) + 3] = 0; }
  /** Shift a pixel toward colour c by t (keeps alpha). */
  tint(x, y, c, t) {
    c = rgb(c);
    const i = this.idx(Math.round(x), Math.round(y)), d = this.d;
    d[i] += (c[0] - d[i]) * t; d[i + 1] += (c[1] - d[i + 1]) * t; d[i + 2] += (c[2] - d[i + 2]) * t;
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  hline(x, y, w, c) { this.rect(x, y, w, 1, c); }
  vline(x, y, h, c) { this.rect(x, y, 1, h, c); }
  /** Ordered-dither fill: colour c over `ratio` of the pixels. */
  dith(x, y, w, h, c, ratio) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (bay(x + i, y + j) < ratio) this.set(x + i, y + j, c);
  }
  /** Ordered-dither tint: shift toward c by t over `ratio` of the pixels. */
  dtint(x, y, w, h, c, t, ratio = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (bay(x + i, y + j) < ratio) this.tint(x + i, y + j, c, t);
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Copy a (wrapped) region of src; skips transparent source pixels. */
  blit(src, sx, sy, w, h, dx, dy) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const si = src.idx(sx + i, sy + j), s = src.d;
      if (!s[si + 3]) continue;
      const di = this.idx(dx + i, dy + j), d = this.d;
      d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = s[si + 3];
    }
  }
  /** New buffer holding a (wrapped) region. */
  sub(x, y, w, h) { const o = new PB(w, h); o.blit(this, x, y, w, h, 0, 0); return o; }
  canvas() {
    const cv = makeCanvas(this.w, this.h);
    ctxOf(cv).putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return cv;
  }
  /** Per-pixel visit: fn(x, y, i) with i the byte index. */
  each(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y, (y * this.w + x) << 2); }
}

// ---- tileable value noise --------------------------------------------------------------------
const smooth = (t) => t * t * (3 - 2 * t);
/** Value noise of size w×h that wraps at its edges. cx/cy = lattice cell size in px. */
export function vnoise(w, h, cx, cy, seed) {
  const gx = Math.max(1, Math.round(w / cx)), gy = Math.max(1, Math.round(h / cy));
  const r = rng(seed);
  const lat = new Float32Array(gx * gy);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * gy, y0 = Math.floor(fy), ty = smooth(fy - y0), y1 = (y0 + 1) % gy;
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * gx, x0 = Math.floor(fx), tx = smooth(fx - x0), x1 = (x0 + 1) % gx;
      const a = lat[y0 * gx + x0], b = lat[y0 * gx + x1], c = lat[y1 * gx + x0], d = lat[y1 * gx + x1];
      out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}
/** Fractal sum: octaves = [[cellX, cellY, amp], ...]; normalised to 0..1 (roughly centred .5). */
export function fbm(w, h, octaves, seed) {
  const out = new Float32Array(w * h);
  let tot = 0;
  octaves.forEach(([cx, cy, amp], k) => {
    const n = vnoise(w, h, cx, cy, (seed * 31 + k * 977) >>> 0);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    tot += amp;
  });
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

/**
 * Quantised, dithered shift of every pixel toward `color` driven by a field (0..1).
 * a = (f - lo) / (hi - lo); level = floor(a * steps + bayer) → pixel mixes by level * step.
 */
export function shadeField(pb, field, { lo = 0.5, hi = 1, color, steps = 3, step = 0.16, where }) {
  const c = rgb(color), d = pb.d, w = pb.w;
  for (let y = 0; y < pb.h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    let a = (field[k] - lo) / (hi - lo);
    if (a <= 0) continue;
    if (where && !where(x, y)) continue;
    if (a > 1) a = 1;
    const lvl = Math.floor(a * steps + bay(x, y));
    if (lvl <= 0) continue;
    const t = Math.min(1, lvl * step), i = k << 2;
    d[i] += (c[0] - d[i]) * t; d[i + 1] += (c[1] - d[i + 1]) * t; d[i + 2] += (c[2] - d[i + 2]) * t;
  }
}

/** Sparse single-pixel speckle with wrap. */
export function speck(pb, r, color, density, x = 0, y = 0, w = pb.w, h = pb.h, t = 1) {
  const n = Math.round(w * h * density);
  for (let i = 0; i < n; i++) {
    const px = x + Math.floor(r() * w), py = y + Math.floor(r() * h);
    if (t >= 1) pb.set(px, py, color); else pb.tint(px, py, color, t);
  }
}

/**
 * Wandering crack: dark core, optional light lip on the lower-right (light from the top-left),
 * occasional branches. Returns the end point.
 */
export function crack(pb, r, x, y, len, ang, dark, { light = null, branch = 0.05, wobble = 0.55, depth = 0 } = {}) {
  let fx = x, fy = y;
  for (let i = 0; i < len; i++) {
    ang += (r() - 0.5) * wobble;
    fx += Math.cos(ang); fy += Math.sin(ang);
    const ix = Math.round(fx), iy = Math.round(fy);
    pb.set(ix, iy, dark);
    if (light && r() < 0.45) {
      // lip on the side away from the light: below a flat crack, right of a steep one
      if (Math.abs(Math.sin(ang)) < 0.7) pb.tint(ix, iy + 1, light, 0.45); else pb.tint(ix + 1, iy, light, 0.45);
    }
    if (depth < 2 && r() < branch) {
      crack(pb, r, ix, iy, Math.floor(len * (0.25 + r() * 0.3)), ang + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.6), dark,
        { light, branch: branch * 0.5, wobble, depth: depth + 1 });
    }
  }
  return [Math.round(fx), Math.round(fy)];
}

/**
 * Irregular shaded lump (coal, gravel, rubble, plaster chunks). ramp = [outline, dark, mid, light, hi?].
 * Lit from the top-left; bottom-right rim takes the outline colour.
 */
export function lump(pb, r, cx, cy, rx, ry, ramp, { outline = true, facets = true } = {}) {
  const k1 = r() * 6.283, k2 = r() * 6.283, a1 = 0.12 + r() * 0.18, a2 = r() * 0.14;
  const lx = -0.62, ly = -0.78; // light direction (from top-left)
  const R = Math.ceil(Math.max(rx, ry)) + 1;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const ang = Math.atan2(dy, dx);
    const rad = 1 + a1 * Math.sin(3 * ang + k1) + a2 * Math.sin(5 * ang + k2);
    const nx = dx / (rx + 0.35), ny = dy / (ry + 0.35);
    const d = Math.sqrt(nx * nx + ny * ny) / rad;
    if (d > 1) continue;
    const X = cx + dx, Y = cy + dy;
    // faceted normal: quantise the angle so the lump reads as chipped planes, not a ball
    let qa = ang;
    if (facets) qa = Math.round((ang + k1) / 1.0472) * 1.0472 - k1;
    const lit = d < 0.35 ? 0.35 : -(Math.cos(qa) * lx + Math.sin(qa) * ly) * Math.min(1, d * 1.3);
    let tone;
    if (outline && d > 0.78 && (dx + dy) >= 0) tone = 0;
    else {
      const v = lit * 1.6 + 1.5 + (bay(X, Y) - 0.5) * 0.9; // 0..3
      tone = Math.max(1, Math.min(ramp.length - 1, Math.round(v)));
    }
    pb.set(X, Y, ramp[tone]);
  }
}

/** Seeded RNG shorthand (string seeds hashed by util.rng). */
export const R = (seed) => rng(seed);
