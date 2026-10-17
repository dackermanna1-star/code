// CG kit — shared pixel-painting tools for the 480×270 illustrations (cg_*.js) and icons.
// Static layers are painted into a Uint32 pixel buffer (Buf) with ordered-dither shading over
// palette ramps, then frozen to canvases once. Animated layers (rain, steam, embers, motes) are
// stateless functions of t over precomputed particle tables: no per-frame allocation.
import { makeCanvas, ctxOf, hash2, BAYER4 } from './util.js';
import { PAL, mix, hexToRgb } from './palette.js';

export { PAL, mix };
export const W = 480, H = 270;

// ---- colors ----------------------------------------------------------------------------------
const ucache = new Map();
/** Hex → packed RGBA (little-endian ImageData order). */
export function U(hex, a = 255) {
  const k = a === 255 ? hex : hex + ':' + a;
  let v = ucache.get(k);
  if (v === undefined) {
    const [r, g, b] = hexToRgb(hex);
    v = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    ucache.set(k, v);
  }
  return v;
}
/** Packed → css rgb string (for ctx fills of animated layers). */
export function css(hex, a = 1) { const [r, g, b] = hexToRgb(hex); return a >= 1 ? hex : `rgba(${r},${g},${b},${a})`; }
/** A ramp of packed colors, dark → light. Accepts hex strings. */
export const ramp = (...hexes) => hexes.flat().map((h) => U(h));
/** n evenly mixed steps through a list of hex stops (dark → light). */
export function rampStops(stops, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1), f = t * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(f));
    out.push(U(mix(stops[k], stops[k + 1], f - k)));
  }
  return out;
}

// ---- dithering & noise -----------------------------------------------------------------------
/** Ordered-dither threshold in (0,1). */
export const bay = (x, y) => (BAYER4[y & 3][x & 3] + 0.5) / 16;
/** Pick a ramp color for brightness v (0..1) with ordered dithering between neighbours. */
export function shade(rp, v, x, y) {
  const n = rp.length - 1;
  const f = v * n;
  if (f <= 0) return rp[0];
  if (f >= n) return rp[n];
  const i = f | 0;
  return (f - i) > bay(x, y) ? rp[i + 1] : rp[i];
}
export const h01 = (x, y, s) => hash2(x | 0, y | 0, s) / 4294967296;
// value noise on a 256×256 lattice table; each seed reads the table at its own offset (fast: no
// hashing per sample — the CG builders call this a few million times)
const NT = new Float32Array(65536);
for (let i = 0; i < 65536; i++) NT[i] = hash2(i & 255, i >> 8, 1923) / 4294967296;
export function vnoise(x, y, seed) {
  const so = Math.imul(seed | 0, 2654435761) >>> 0;
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const ix = (xi + so) & 255, iy = (yi + (so >>> 8)) & 255, ix1 = (ix + 1) & 255, iy1 = ((iy + 1) & 255) << 8, iy0 = iy << 8;
  const a = NT[iy0 + ix], b = NT[iy0 + ix1], c = NT[iy1 + ix], d = NT[iy1 + ix1];
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, seed, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 131); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// ---- pixel buffer ----------------------------------------------------------------------------
/** A paint target backed by ImageData. Colors are packed (U()); 0 = transparent / "skip". */
export class Buf {
  constructor(w = W, h = H) {
    this.w = w; this.h = h;
    this.img = new ImageData(w, h);
    this.d = new Uint32Array(this.img.data.buffer);
  }
  clone() { const b = new Buf(this.w, this.h); b.d.set(this.d); return b; }
  get(x, y) { x |= 0; y |= 0; return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[y * this.w + x]; }
  px(x, y, c) { x |= 0; y |= 0; if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
  /** Dithered coverage: paint c where the Bayer threshold is below a. */
  dpx(x, y, c, a) { if (a >= 1 || (a > 0 && bay(x, y) < a)) this.px(x, y, c); }
  /** c: packed color or fn(x, y) → packed|0. */
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    const fn = typeof c === 'function' ? c : null;
    for (let j = y0; j < y1; j++) {
      const row = j * this.w;
      for (let i = x0; i < x1; i++) { const v = fn ? fn(i, j) : c; if (v) this.d[row + i] = v; }
    }
  }
  drect(x, y, w, h, c, a) { this.rect(x, y, w, h, (i, j) => (bay(i, j) < a ? c : 0)); }
  hline(x, y, w, c) { this.rect(x, y, w, 1, c); }
  vline(x, y, h, c) { this.rect(x, y, 1, h, c); }
  span(y, xa, xb, c, fn) {
    if (y < 0 || y >= this.h) return;
    const x0 = Math.max(0, Math.round(xa)), x1 = Math.min(this.w, Math.round(xb));
    const row = y * this.w;
    for (let i = x0; i < x1; i++) { const v = fn ? fn(i, y) : c; if (v) this.d[row + i] = v; }
  }
  /** Even-odd scanline polygon. */
  poly(pts, c) {
    const fn = typeof c === 'function' ? c : null;
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const xs = [];
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(this.h - 1, Math.ceil(maxY)); y++) {
      xs.length = 0;
      const yc = y + 0.5;
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) this.span(y, xs[i], xs[i + 1], c, fn);
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    const fn = typeof c === 'function' ? c : null;
    for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
      const t = (y + 0.5 - cy) / ry;
      if (t * t > 1) continue;
      const w = rx * Math.sqrt(1 - t * t);
      this.span(y, cx - w, cx + w, c, fn);
    }
  }
  line(x0, y0, x1, y1, c, a = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const fn = typeof c === 'function' ? c : null;
    for (;;) {
      const v = fn ? fn(x0, y0) : c;
      if (a >= 1) this.px(x0, y0, v); else this.dpx(x0, y0, v, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Thick line as a quad polygon (w px). */
  thick(x0, y0, x1, y1, w, c) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * w / 2, ny = (dx / l) * w / 2;
    if (w <= 1.2) { this.line(x0, y0, x1, y1, c); return; }
    this.poly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], c);
  }
  /** Copy another buffer's opaque pixels at (dx, dy). */
  draw(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++) {
      const ty = y + dy; if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < src.w; x++) {
        const v = src.d[y * src.w + x]; if (!v) continue;
        const tx = x + dx; if (tx < 0 || tx >= this.w) continue;
        this.d[ty * this.w + tx] = v;
      }
    }
  }
  /** Replace every opaque pixel through fn(color, x, y) → color. */
  map(fn, x = 0, y = 0, w = this.w, h = this.h) {
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
      const k = j * this.w + i, v = this.d[k];
      if (v) this.d[k] = fn(v, i, j);
    }
  }
  /** 1-px outline around opaque pixels (4-neighbour) in color c. */
  outline(c, diag = false) {
    const src = this.d.slice(), w = this.w, h = this.h;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[y * w + x] !== 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[y * w + x]) continue;
      let n = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
      if (!n && diag) n = solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1);
      if (n) this.d[y * w + x] = c;
    }
  }
  toCanvas() { const c = makeCanvas(this.w, this.h); ctxOf(c).putImageData(this.img, 0, 0); return c; }
}

/** Unpack to [r,g,b]. */
export const rgbOfU = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
/** Mix two packed colors (used sparingly — prefer ramps). */
export function mixU(a, b, t) {
  const ar = a & 255, ag = (a >>> 8) & 255, ab = (a >>> 16) & 255;
  const r = (ar + ((b & 255) - ar) * t + 0.5) | 0, g = (ag + (((b >>> 8) & 255) - ag) * t + 0.5) | 0, bl = (ab + (((b >>> 16) & 255) - ab) * t + 0.5) | 0;
  return ((255 << 24) | (bl << 16) | (g << 8) | r) >>> 0;
}
/** Approximate luminance 0..1 of a packed color. */
export function lumU(v) { const [r, g, b] = rgbOfU(v); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; }

// ---- bitmap fonts ----------------------------------------------------------------------------
// 5×7 caps for chalk, signs and carved letters. '#' rows, 5 wide.
const F57 = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '—': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
/** Width of a 5×7 string (advance 6, the dash 6, space 4). */
export function text57Width(s, track = 1) {
  let w = 0;
  for (const ch of String(s).toUpperCase()) w += (ch === ' ' ? 3 : 5) + track;
  return Math.max(0, w - track);
}
/**
 * Draw 5×7 text into a Buf. paint(x, y, i) → packed|0 lets callers wobble/erode per pixel (chalk).
 * opts: { track, jitter: fn(charIndex) → [dx, dy] }
 */
export function text57(buf, x, y, s, paint, { track = 1, jitter = null } = {}) {
  let cx = x, k = 0;
  for (const ch of String(s).toUpperCase()) {
    const g = F57[ch] || F57[' '];
    const [jx, jy] = jitter ? jitter(k) : [0, 0];
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) {
      if (g[j][i] === '#') { const v = typeof paint === 'function' ? paint(cx + i + jx, y + j + jy, k) : paint; if (v) buf.px(cx + i + jx, y + j + jy, v); }
    }
    cx += (ch === ' ' ? 3 : 5) + track; k++;
  }
  return cx - x - track;
}
// 3×5 caps (same glyphs as util.tinyText) for tiny labels inside Bufs.
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
  '#': '101111101111101', '+': '000010111010000', ' ': '000000000000000', '—': '000000111000000',
};
export function text35(buf, x, y, s, paint, track = 1) {
  let cx = x, k = 0;
  for (const ch of String(s).toUpperCase()) {
    const g = F35[ch] || F35[' '];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') {
      const v = typeof paint === 'function' ? paint(cx + i, y + j, k) : paint;
      if (v) buf.px(cx + i, y + j, v);
    }
    cx += 3 + track; k++;
  }
  return cx - x - track;
}
export const text35Width = (s, track = 1) => String(s).length * (3 + track) - track;

// ---- animated particles ----------------------------------------------------------------------
/** Precompute n particle seeds: [u0, u1, u2, u3] uniform floats from (seed, i). */
export function seeds(n, seed) {
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) out[i] = h01(i, i >> 2, seed);
  return out;
}
/**
 * Rain streaks over a rect. layers: [{ n, len, speed, slant, color, alpha }]. Stateless in t.
 * Drawn with fillRect so they stay crisp; slant = px of x drift per px of fall.
 */
export function makeRain(layers, seed, area = { x: 0, y: 0, w: W, h: H }) {
  const L = layers.map((l, k) => ({ ...l, s: seeds(l.n, seed + k * 977) }));
  return function draw(ctx, t, { boost = 0, clip = null } = {}) {
    for (const l of L) {
      ctx.fillStyle = boost > 0 ? l.flash || l.color : l.color;
      const span = area.h + l.len;
      for (let i = 0; i < l.n; i++) {
        const u0 = l.s[i * 4], u1 = l.s[i * 4 + 1], u2 = l.s[i * 4 + 2];
        const sp = l.speed * (0.8 + 0.4 * u2);
        const fall = (u1 * span + t * sp) % span;
        const y0 = area.y + fall - l.len;
        const x0 = area.x + ((u0 * (area.w + 60) + (fall * l.slant)) % (area.w + 60)) - 30;
        if (clip && !clip(x0, y0)) continue;
        // a streak: len px tall, stepping 1px right every 1/slant px
        if (l.slant === 0) { ctx.fillRect(x0 | 0, y0 | 0, 1, l.len); continue; }
        const step = Math.max(1, Math.round(1 / l.slant));
        for (let d = 0; d < l.len; d += step) ctx.fillRect((x0 + d * l.slant) | 0, (y0 + d) | 0, 1, Math.min(step, l.len - d));
      }
    }
  };
}

/**
 * Pre-rendered dithered puffs for steam/smoke/dust: puff(r, a) → small canvas.
 * Edges thin out with distance (density falloff), so puffs read as vapor, never as solid discs.
 */
export function makePuffs(color, rMax = 14, levels = 6, seed = 7, edge = color) {
  const cache = [];
  const cu = U(color), eu = U(edge);
  for (let r = 1; r <= rMax; r++) {
    const row = [];
    for (let a = 1; a <= levels; a++) {
      const alpha = a / levels;
      const s = r * 2 + 1;
      const b = new Buf(s, s);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const dx = (x - r) / (r + 0.5), dy = (y - r) / (r + 0.5);
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const n = vnoise(x * 0.45, y * 0.45, seed + r * 13);
        const dens = (1 - d) * (0.65 + 0.7 * n) * alpha;
        if (dens > bay(x, y)) b.px(x, y, d > 0.55 ? eu : cu);
      }
      row.push(b.toCanvas());
    }
    cache.push(row);
  }
  return function puff(ctx, x, y, r, a) {
    const ri = Math.max(1, Math.min(rMax, Math.round(r)));
    const ai = Math.max(0, Math.min(levels - 1, Math.round(a * levels) - 1));
    if (a <= 0.5 / levels) return;
    ctx.drawImage(cache[ri - 1][ai], Math.round(x) - ri, Math.round(y) - ri);
  };
}

/**
 * Steam vents: plumes rising from points. vents: [{ x, y, rate, spread, rise, life, r0, r1 }].
 * Each plume has K puffs on staggered lifecycles; wind drifts them sideways.
 */
export function makeSteam(vents, puff, seed, { wind = 6, k = 10 } = {}) {
  const S = vents.map((v, i) => ({ ...v, s: seeds(k, seed + i * 31) }));
  return function draw(ctx, t, { alpha = 1 } = {}) {
    for (const v of S) {
      const life = v.life || 6;
      for (let i = 0; i < k; i++) {
        const u0 = v.s[i * 4], u1 = v.s[i * 4 + 1], u2 = v.s[i * 4 + 2];
        const age = ((t + u0 * life + i * (life / k)) % life) / life;   // 0..1
        const rise = (v.rise || 40) * age;
        const sway = Math.sin(t * 0.7 + u1 * 6.28 + age * 3) * (v.spread || 3) * age;
        const x = v.x + (u2 - 0.5) * (v.w || 4) + sway + (v.wind ?? wind) * age * age * life * 0.5;
        const y = v.y - rise;
        const r = (v.r0 || 2) + ((v.r1 || 8) - (v.r0 || 2)) * Math.sqrt(age);
        const a = (v.a || 0.6) * alpha * Math.min(1, age * 6) * (1 - age) * (1 - age * 0.3);
        puff(ctx, x, y, r, a);
      }
    }
  };
}

/**
 * Screen-space vapor: puffs are splatted into a half-res density field each frame, then the field is
 * ordered-dithered over a color ramp (cols[0] = thinnest wisps … last = densest core) in screen space,
 * so overlapping puffs merge into one coherent, crisp veil instead of noisy sprites.
 */
export function makeVapor(x0, y0, w, h, hexes) {
  const cw = Math.ceil(w / 2) + 1, ch = Math.ceil(h / 2) + 1;
  const dens = new Float32Array(cw * ch);
  const buf = new Buf(w, h);
  const cnv = makeCanvas(w, h), cx = ctxOf(cnv);
  const cols = hexes.map((c) => U(c));
  const n = cols.length;
  let minX, maxX, minY, maxY;
  return {
    clear() { dens.fill(0); minX = cw; maxX = -1; minY = ch; maxY = -1; },
    /** world-space puff: centre, radius px, strength (≈ peak density). */
    splat(x, y, r, a) {
      if (a <= 0) return;
      const gx = (x - x0) / 2, gy = (y - y0) / 2, gr = Math.max(0.8, r / 2), ir = 1 / (gr * gr);
      const j0 = Math.max(0, Math.floor(gy - gr)), j1 = Math.min(ch - 1, Math.ceil(gy + gr));
      const i0 = Math.max(0, Math.floor(gx - gr)), i1 = Math.min(cw - 1, Math.ceil(gx + gr));
      if (i0 > i1 || j0 > j1) return;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d = ((i - gx) ** 2 + (j - gy) ** 2) * ir;
        if (d < 1) dens[j * cw + i] += a * (1 - d) * (1 - d);
      }
      if (i0 < minX) minX = i0; if (i1 > maxX) maxX = i1; if (j0 < minY) minY = j0; if (j1 > maxY) maxY = j1;
    },
    render(ctx, gain = 1) {
      if (maxX < 0) return;
      const d = buf.d;
      d.fill(0);
      const px0 = minX * 2, px1 = Math.min(w, maxX * 2 + 2), py0 = minY * 2, py1 = Math.min(h, maxY * 2 + 2);
      // walk the half-res cells; skip empty ones whole, fill each live cell's 2×2 pixels bilinearly
      for (let j = minY; j <= maxY; j++) {
        const j1 = Math.min(ch - 1, j + 1);
        for (let i = minX; i <= maxX; i++) {
          const i1 = Math.min(cw - 1, i + 1);
          const a = dens[j * cw + i], b = dens[j * cw + i1], c = dens[j1 * cw + i], e = dens[j1 * cw + i1];
          if (a <= 0.01 && b <= 0.01 && c <= 0.01 && e <= 0.01) continue;
          for (let sy = 0; sy < 2; sy++) {
            const y = j * 2 + sy; if (y >= h) break;
            const ty = sy * 0.5;
            for (let sx = 0; sx < 2; sx++) {
              const x = i * 2 + sx; if (x >= w) break;
              const tx = sx * 0.5;
              const v = (a + (b - a) * tx + (c - a) * ty + (a - b - c + e) * tx * ty) * gain;
              if (v <= 0.01) continue;
              const lv = Math.floor(Math.min(1, v) * n + bay(x + x0, y + y0));
              if (lv > 0) d[y * w + x] = cols[Math.min(n - 1, lv - 1)];
            }
          }
        }
      }
      cx.putImageData(buf.img, 0, 0, px0, py0, px1 - px0, py1 - py0);
      ctx.drawImage(cnv, x0, y0);
    },
  };
}
/** Vapor plumes: vents [{ x, y, rise, life, r0, r1, a, w, wind }] splatted into a makeVapor field. */
export function makePlumes(vents, seed, k = 12) {
  const S = vents.map((v, i) => ({ ...v, s: seeds(k, seed + i * 31) }));
  return function splatAll(field, t, gain = 1) {
    for (const v of S) {
      const life = v.life || 6;
      for (let i = 0; i < k; i++) {
        const u0 = v.s[i * 4], u1 = v.s[i * 4 + 1], u2 = v.s[i * 4 + 2];
        const age = ((t / life + u0 * 0.37 + i / k) % 1);
        const rise = (v.rise || 40) * age;
        const sway = Math.sin(t * 0.6 + u1 * 6.28 + age * 4) * (v.spread || 3) * age;
        const x = v.x + (u2 - 0.5) * (v.w || 4) + sway + (v.wind ?? 6) * age * age;
        const y = v.y - rise;
        const r = (v.r0 || 2) + ((v.r1 || 10) - (v.r0 || 2)) * Math.sqrt(age);
        const a = (v.a || 0.5) * gain * Math.min(1, age * 5) * (1 - age) ** 1.4;
        field.splat(x, y, r, a);
      }
    }
  };
}

// ---- lazy layer cache + idle prebuild -----------------------------------------------------------
const jobs = [];
let pumping = false;
/** Queue fn to run in a later macrotask (one job per tick) so boot stays snappy. */
export function idle(fn) {
  jobs.push(fn);
  if (!pumping) { pumping = true; setTimeout(pump, 60); }
}
function pump() {
  const fn = jobs.shift();
  if (!fn) { pumping = false; return; }
  try { fn(); } catch (e) { console.error('[cg] idle build failed', e); }
  setTimeout(pump, 30);
}
/** once(fn) → memoized thunk. */
export function once(fn) { let v, done = false; return () => { if (!done) { v = fn(); done = true; } return v; }; }
/**
 * lazyGen(function* build() { …; yield; …; return layers; }) → thunk that returns the built layers.
 * Calling it finishes the build synchronously (a CG asked to draw before its background build is
 * done); .step() advances one slice (one paint pass) for background prebuilding; .done() reports.
 */
export function lazyGen(genFn) {
  let it = null, done = false, value;
  const f = () => {
    if (!done) {
      if (!it) it = genFn();
      let r;
      do { r = it.next(); } while (!r.done);
      value = r.value; done = true; it = null;
    }
    return value;
  };
  f.step = () => {
    if (done) return true;
    if (!it) it = genFn();
    const r = it.next();
    if (r.done) { value = r.value; done = true; it = null; }
    return done;
  };
  f.done = () => done;
  return f;
}
/** Step a list of lazyGen builds one slice per idle period, starting after `delay` ms. */
export function background(list, { delay = 1500 } = {}) {
  const q = list.filter(Boolean);
  const ric = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 400 }) : (fn) => setTimeout(fn, 40);
  const tick = () => {
    while (q.length && q[0].done()) q.shift();
    if (!q.length) return;
    try { q[0].step(); } catch (e) { console.error('[cg] background build failed', e); q.shift(); }
    ric(tick);
  };
  setTimeout(() => ric(tick), delay);
}

/** Blit with globalAlpha (lightning, crossfades) — callers quantize a to avoid shimmer. */
export function blitA(ctx, c, a, x = 0, y = 0) {
  if (a <= 0) return;
  const g = ctx.globalAlpha;
  ctx.globalAlpha = g * Math.min(1, a);
  ctx.drawImage(c, x, y);
  ctx.globalAlpha = g;
}
/** Quantize to n steps (keeps flashes/fades from producing endless intermediate tones). */
export const quant = (v, n = 8) => Math.round(clamp01(v) * n) / n;
