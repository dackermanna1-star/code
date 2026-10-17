// Shared pixel-art helpers. Deterministic: use rng()/hashStr(), never Math.random.
// All drawing is crisp (no anti-aliasing): integer coordinates, fillRect-based primitives.

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return c;
}
export const ctxOf = (c) => { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x; };

// ---- deterministic randomness --------------------------------------------------------------
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
/** mulberry32 PRNG → function returning floats in [0,1). */
export function rng(seed) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// ---- primitives ----------------------------------------------------------------------------
export function px(ctx, x, y, color) { ctx.fillStyle = color; ctx.fillRect(x | 0, y | 0, 1, 1); }
export function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
export function hline(ctx, x, y, w, color) { rect(ctx, x, y, w, 1, color); }
export function vline(ctx, x, y, h, color) { rect(ctx, x, y, 1, h, color); }
export function strokeRect(ctx, x, y, w, h, color) {
  hline(ctx, x, y, w, color); hline(ctx, x, y + h - 1, w, color);
  vline(ctx, x, y, h, color); vline(ctx, x + w - 1, y, h, color);
}
/** Bresenham line. */
export function line(ctx, x0, y0, x1, y1, color) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  ctx.fillStyle = color;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
/** Filled ellipse via scanlines (crisp). */
export function ellipse(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1))));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}
export const circle = (ctx, cx, cy, r, color) => ellipse(ctx, cx, cy, r, r, color);
/** Filled polygon via even-odd scanlines (crisp). points: [[x,y], ...] */
export function poly(ctx, points, color) {
  ctx.fillStyle = color;
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of points) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs = [];
    const yc = y + 0.5;
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = Math.round(xs[i]), b = Math.round(xs[i + 1]);
      if (b > a) ctx.fillRect(a, y, b - a, 1);
    }
  }
}

// ---- dithering -----------------------------------------------------------------------------
export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
/** Fill a rect mixing colorB into colorA with ordered dithering. ratio 0..1 = share of B. */
export function dither(ctx, x, y, w, h, colorA, colorB, ratio) {
  if (colorA) rect(ctx, x, y, w, h, colorA);
  ctx.fillStyle = colorB;
  const thr = ratio * 16;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (BAYER4[(y + j) & 3][(x + i) & 3] < thr) ctx.fillRect(x + i, y + j, 1, 1);
  }
}
/** Vertical dithered gradient from colorTop to colorBottom over a set of bands. */
export function ditherGradientV(ctx, x, y, w, h, colorTop, colorBottom) {
  for (let j = 0; j < h; j++) {
    const t = h <= 1 ? 0 : j / (h - 1);
    ctx.fillStyle = colorTop; ctx.fillRect(x, y + j, w, 1);
    ctx.fillStyle = colorBottom;
    for (let i = 0; i < w; i++) if (BAYER4[(y + j) & 3][(x + i) & 3] < t * 16) ctx.fillRect(x + i, y + j, 1, 1);
  }
}
/** Random speckle (grime, noise). density = expected fraction of pixels. */
export function speckle(ctx, x, y, w, h, color, density, r) {
  ctx.fillStyle = color;
  const n = Math.round(w * h * density);
  for (let i = 0; i < n; i++) ctx.fillRect(x + Math.floor(r() * w), y + Math.floor(r() * h), 1, 1);
}

// ---- image ops -----------------------------------------------------------------------------
/** Return a new canvas with a 1-px outline (color) around all non-transparent pixels. */
export function outlined(src, color, { diagonal = false } = {}) {
  const w = src.width + 2, h = src.height + 2;
  const out = makeCanvas(w, h);
  const o = ctxOf(out);
  const sd = ctxOf(src).getImageData(0, 0, src.width, src.height).data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < src.width && y < src.height && sd[(y * src.width + x) * 4 + 3] > 0;
  o.fillStyle = color;
  for (let y = -1; y <= src.height; y++) for (let x = -1; x <= src.width; x++) {
    if (solid(x, y)) continue;
    let n = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
    if (!n && diagonal) n = solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1);
    if (n) o.fillRect(x + 1, y + 1, 1, 1);
  }
  o.drawImage(src, 1, 1);
  return out;
}
/** Map colors exactly (hex → hex) — palette swaps for variants. */
export function recolor(src, map) {
  const out = makeCanvas(src.width, src.height);
  const o = ctxOf(out);
  o.drawImage(src, 0, 0);
  const img = o.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  const lut = new Map();
  for (const [a, b] of Object.entries(map)) {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    lut.set(A, [(B >> 16) & 255, (B >> 8) & 255, B & 255]);
  }
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    const v = lut.get(k);
    if (v) { d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; }
  }
  o.putImageData(img, 0, 0);
  return out;
}
export function flipH(src) {
  const out = makeCanvas(src.width, src.height);
  const o = ctxOf(out);
  o.translate(src.width, 0); o.scale(-1, 1); o.drawImage(src, 0, 0);
  return out;
}
/** Per-pixel transform: fn(r,g,b,a,x,y) → [r,g,b,a] | null (keep). */
export function mapPixels(src, fn) {
  const out = makeCanvas(src.width, src.height);
  const o = ctxOf(out);
  o.drawImage(src, 0, 0);
  const img = o.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const i = (y * src.width + x) * 4;
    const r = fn(d[i], d[i + 1], d[i + 2], d[i + 3], x, y);
    if (r) { d[i] = r[0]; d[i + 1] = r[1]; d[i + 2] = r[2]; d[i + 3] = r[3] ?? d[i + 3]; }
  }
  o.putImageData(img, 0, 0);
  return out;
}

// ---- tiny bitmap text for art (signs, chalk, labels) -----------------------------------------
// 3×5 pixel font (caps, digits, a few symbols). Good for signage inside 16-px art.
const F35 = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', '-': '000000111000000', '.': '000000000000010', ':': '000010000010000', "'": '010010000000000',
  '!': '010010010000010', '?': '110001010000010', '/': '001001010100100', '&': '010101010101011', ',': '000000000010100',
  '#': '101111101111101', '+': '000010111010000', ' ': '000000000000000',
};
/** Draw tiny 3×5 text; returns width in px. */
export function tinyText(ctx, x, y, text, color) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of String(text).toUpperCase()) {
    const g = F35[ch] || F35[' '];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') ctx.fillRect(cx + i, y + j, 1, 1);
    cx += 4;
  }
  return cx - x - 1;
}
export const tinyTextWidth = (text) => String(text).length * 4 - 1;
