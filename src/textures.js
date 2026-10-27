// src/textures.js — procedural PS1-style texture atlas for St. Agatha General Hospital.
//
// Pure Canvas2D: no imports, no external assets, fonts or network.
//
//   import { buildAtlas } from './textures.js';
//   const { canvas, rects } = buildAtlas();   // rects[name] = { x, y, w, h } in canvas pixels, top-left origin
//
// Each texture is painted into its own small float buffer with a per-texture seeded PRNG
// (mulberry32 seeded from the texture name), then quantised to 15-bit colour (v & 0xF8, with a
// light 4x4 ordered dither) and binary alpha (0/255, threshold 128), and shelf-packed into a
// 1024-wide atlas (height 1024 or 2048).
//
// Orientation: row 0 of every texture is the TOP of the surface (engine uploads with flipY).
// Scale: wall/floor/ceiling textures assume 64 px = 1 m.
//
// Signs and graffiti are data-driven: append entries to SIGN_SPECS / GRAFFITI_SPECS below.

// ============================================================================
// DATA TABLES — signs
// ============================================================================
// Sign spec fields:
//   name, w (128), h (32), text, sub (optional second line), col (key of SIGN_COLORS),
//   icon / iconR (left / right pictogram: arrowL arrowR stairs updown trefoil cross man woman redcross),
//   style: 'plate' (default) | 'hazard' | 'number' | 'floor' | 'directory'
export const SIGN_COLORS = {
  green: { bg: [40, 78, 60], fg: [228, 222, 196] },
  navy: { bg: [38, 52, 90], fg: [228, 226, 210] },
  brown: { bg: [92, 62, 40], fg: [232, 216, 180] },
  red: { bg: [164, 34, 28], fg: [240, 234, 224] },
  hazard: { bg: [222, 180, 38], fg: [22, 20, 18] },
  cream: { bg: [216, 208, 184], fg: [40, 52, 72] },
  stencil: { bg: [72, 74, 74], fg: [222, 178, 44] },
  felt: { bg: [34, 32, 32], fg: [226, 224, 216] },
};

export const SIGN_SPECS = [
  { name: 'sign_reception', text: 'RECEPTION', col: 'green' },
  { name: 'sign_stairs', text: 'STAIRS', col: 'green', icon: 'stairs' },
  { name: 'sign_elevator', text: 'ELEVATORS', col: 'green', icon: 'updown' },
  { name: 'sign_ward_a', text: 'WARD A', sub: '101 - 110', col: 'green', icon: 'arrowL' },
  { name: 'sign_ward_b', text: 'WARD B', col: 'green', iconR: 'arrowR' },
  { name: 'sign_surgery', text: 'SURGERY', col: 'navy', iconR: 'arrowR' },
  { name: 'sign_morgue', text: 'MORGUE', col: 'brown' },
  { name: 'sign_boiler', text: 'BOILER ROOM', sub: 'AUTHORIZED PERSONNEL ONLY', col: 'brown' },
  { name: 'sign_records', text: 'MEDICAL RECORDS', col: 'brown' },
  { name: 'sign_pharmacy', text: 'PHARMACY', col: 'green' },
  { name: 'sign_radiology', text: 'RADIOLOGY', col: 'navy', icon: 'trefoil' },
  { name: 'sign_chapel', text: 'CHAPEL', col: 'brown', icon: 'cross' },
  { name: 'sign_admin', text: 'ADMINISTRATION', col: 'brown' },
  { name: 'sign_triage', text: 'EMERGENCY', sub: 'TRIAGE', col: 'navy', icon: 'redcross' },
  { name: 'sign_staff', text: 'STAFF ONLY', col: 'brown' },
  { name: 'sign_dayroom', text: 'DAY ROOM', col: 'green' },
  { name: 'sign_laundry', text: 'LAUNDRY', col: 'brown' },
  { name: 'sign_lab', text: 'PATHOLOGY', col: 'navy' },
  { name: 'sign_storage', text: 'STORAGE', col: 'brown' },
  { name: 'sign_scrub', text: 'SCRUB ROOM', col: 'navy' },
  { name: 'sign_or', text: 'OPERATING THEATRE', col: 'navy' },
  { name: 'sign_recovery', text: 'RECOVERY', col: 'navy' },
  { name: 'sign_nurse', text: 'NURSE STATION', col: 'green' },
  { name: 'sign_isolation', text: 'ISOLATION', col: 'navy' },
  { name: 'sign_workshop', text: 'MAINTENANCE', col: 'brown' },
  { name: 'sign_office', text: 'OFFICE', col: 'brown' },
  { name: 'sign_danger', text: 'DANGER', sub: 'OPEN SHAFT', style: 'hazard', col: 'hazard' },
  { name: 'sign_exit', w: 64, text: 'EXIT', col: 'red' },
  { name: 'sign_restroom', w: 64, text: 'WC', col: 'navy', icon: 'man', iconR: 'woman' },
  { name: 'sign_exam1', w: 64, text: 'EXAM 1', col: 'navy' },
  { name: 'sign_exam2', w: 64, text: 'EXAM 2', col: 'navy' },
  { name: 'sign_floor_b', w: 64, h: 64, style: 'floor', text: 'B', sub: 'BASEMENT', col: 'stencil' },
  { name: 'sign_floor_g', w: 64, h: 64, style: 'floor', text: 'G', sub: 'GROUND', col: 'stencil' },
  { name: 'sign_floor_1', w: 64, h: 64, style: 'floor', text: '1', sub: 'FLOOR', col: 'stencil' },
  {
    name: 'sign_directory', w: 128, h: 128, style: 'directory', col: 'felt',
    header: ['ST. AGATHA', 'GENERAL HOSPITAL'],
    floors: [
      { f: '1', items: ['WARD A', 'WARD B', 'SURGERY'] },
      { f: 'G', items: ['LOBBY', 'RECORDS', 'CHAPEL', 'PHARMACY', 'RADIOLOGY'] },
      { f: 'B', items: ['MORGUE', 'LAUNDRY', 'BOILER RM'] },
    ],
    footer: 'VISITING HOURS 2-8 PM',
    // damaged letters: [floorIndex, itemIndex, charIndex, 'missing' | 'dangle']
    damage: [[1, 3, 3, 'missing'], [2, 0, 3, 'dangle'], [0, 1, 1, 'missing']],
  },
];
for (let n = 101; n <= 112; n++) SIGN_SPECS.push({ name: 'num_' + n, w: 64, h: 32, text: String(n), col: 'brown', style: 'number' });

// ============================================================================
// DATA TABLES — graffiti (all alpha-cutout)
// ============================================================================
// style: 'spray' | 'marker' | 'scratch' | 'chalk' text styles take `lines` (strings or {text, s, dx, dy, slope});
//        'bubble' / 'handstyle' / 'stencil' take `text`; the rest are hand-placed painters.
export const GRAFFITI_SPECS = [
  { name: 'graf_tag1', w: 128, h: 64, style: 'bubble', text: 'KROW', fill: [232, 228, 218], outline: [18, 18, 18], accent: [176, 36, 30], shadow: [96, 20, 18] },
  { name: 'graf_tag2', w: 128, h: 64, style: 'handstyle', text: 'SEKT', color: [18, 18, 20] },
  { name: 'graf_tag3', w: 128, h: 64, style: 'bubble', text: 'VAPR', fill: 'chrome', outline: [14, 14, 16], accent: [210, 220, 236], shadow: [40, 58, 110] },
  { name: 'graf_getout', w: 128, h: 64, style: 'spray', color: [168, 30, 24], lines: [{ text: 'GET OUT', slope: -0.03 }], drips: 0.05, sizeVar: 0.12 },
  { name: 'graf_dontgo', w: 128, h: 64, style: 'spray', color: [22, 22, 22], lines: [{ text: "DON'T GO", s: 2.5 }, { text: 'DOWN', s: 3.3 }], drips: 0.035, gapY: 6 },
  { name: 'graf_lights', w: 128, h: 64, style: 'marker', color: [236, 236, 228], lines: ['WHO KEEPS', 'THE LIGHTS', 'ON?'], s: 2.1, gapY: 5 },
  { name: 'graf_counts', w: 128, h: 64, style: 'scratch', color: [44, 40, 36], lines: ['SHE STILL', 'COUNTS US'], s: 2.3, gapY: 7 },
  { name: 'graf_noone', w: 128, h: 64, style: 'spray', color: [44, 74, 168], lines: [{ text: 'NO ONE', s: 2.8 }, { text: 'LEFT', s: 3.0, dx: 6 }], drips: 0.035, sizeVar: 0.14, bounce: 0.3, gapY: 5 },
  { name: 'graf_crew', w: 128, h: 64, style: 'stencil', text: "URBEX '21", color: [24, 24, 24] },
  { name: 'graf_names', w: 128, h: 64, style: 'names' },
  { name: 'graf_eye', w: 64, h: 64, style: 'eye', color: [20, 20, 20] },
  { name: 'graf_spiral', w: 64, h: 64, style: 'spiral', color: [100, 40, 26] },
  { name: 'graf_tally', w: 64, h: 64, style: 'tally', color: [224, 222, 212], count: 23 },
  { name: 'graf_arrow', w: 64, h: 64, style: 'arrow', color: [226, 112, 36] },
  { name: 'graf_sigil', w: 64, h: 64, style: 'sigil', color: [228, 226, 216] },
  { name: 'graf_108', w: 64, h: 64, style: 'circled', text: '108', color: [176, 28, 22] },
  { name: 'graf_smiley', w: 64, h: 64, style: 'smiley', color: [226, 196, 36] },
];

// ============================================================================
// Core helpers
// ============================================================================
const TAU = Math.PI * 2;
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hx = (s) => { const n = parseInt(s.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const col = (c) => (typeof c === 'string' ? hx(c) : c);
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mulc = (a, f) => [a[0] * f, a[1] * f, a[2] * f];
const addc = (a, v) => [a[0] + v, a[1] + v, a[2] + v];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mkCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

// Float RGB buffer + binary alpha. `tile` makes every coordinate wrap (seamless drawing).
class Tex {
  constructor(w, h, seed, tile) {
    this.w = w; this.h = h; this.tile = !!tile;
    this.c = new Float32Array(w * h * 3);
    this.a = new Uint8Array(w * h);
    this.rand = mulberry32(seed);
  }
  r() { return this.rand(); }
  rf(a, b) { return a + (b - a) * this.rand(); }
  ri(a, b) { return a + Math.floor((b - a + 1) * this.rand()); }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }
  idx(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (this.tile) { const w = this.w, h = this.h; x %= w; if (x < 0) x += w; y %= h; if (y < 0) y += h; }
    else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return y * this.w + x;
  }
  set(x, y, c, a = 255) { const i = this.idx(x, y); if (i < 0) return; const j = i * 3; this.c[j] = c[0]; this.c[j + 1] = c[1]; this.c[j + 2] = c[2]; this.a[i] = a; }
  mix(x, y, c, t) { const i = this.idx(x, y); if (i < 0) return; const j = i * 3, C = this.c; C[j] += (c[0] - C[j]) * t; C[j + 1] += (c[1] - C[j + 1]) * t; C[j + 2] += (c[2] - C[j + 2]) * t; }
  mul(x, y, f) { const i = this.idx(x, y); if (i < 0) return; const j = i * 3; this.c[j] *= f; this.c[j + 1] *= f; this.c[j + 2] *= f; }
  add(x, y, v) { const i = this.idx(x, y); if (i < 0) return; const j = i * 3; this.c[j] += v; this.c[j + 1] += v; this.c[j + 2] += v; }
  get(x, y) { const i = this.idx(x, y); if (i < 0) return [0, 0, 0]; const j = i * 3; return [this.c[j], this.c[j + 1], this.c[j + 2]]; }
  al(x, y) { const i = this.idx(x, y); return i < 0 ? 0 : this.a[i]; }
  fill(c, a = 255) { c = col(c); const n = this.w * this.h; for (let i = 0; i < n; i++) { const j = i * 3; this.c[j] = c[0]; this.c[j + 1] = c[1]; this.c[j + 2] = c[2]; this.a[i] = a; } return this; }
  each(fn) {
    const o = [0, 0, 0], C = this.c, w = this.w;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, j = i * 3; o[0] = C[j]; o[1] = C[j + 1]; o[2] = C[j + 2];
      if (fn(x, y, o, i) === false) continue;
      C[j] = o[0]; C[j + 1] = o[1]; C[j + 2] = o[2];
    }
    return this;
  }
  rect(x, y, w, h, c, a = 255) { c = col(c); for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c, a); }
  mixRect(x, y, w, h, c, t) { c = col(c); for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.mix(xx, yy, c, t); }
  mulRect(x, y, w, h, f) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.mul(xx, yy, f); }
  // bevel: top/left rows multiplied by hi, bottom/right by lo
  bevel(x, y, w, h, hi = 1.2, lo = 0.7, d = 1) {
    for (let k = 0; k < d; k++) {
      for (let xx = x + k; xx < x + w - k; xx++) { this.mul(xx, y + k, hi); this.mul(xx, y + h - 1 - k, lo); }
      for (let yy = y + k + 1; yy < y + h - 1 - k; yy++) { this.mul(x + k, yy, hi); this.mul(x + w - 1 - k, yy, lo); }
    }
  }
  paint(mask, c, a = 255) { c = col(c); for (let i = 0; i < mask.length; i++) if (mask[i]) { const j = i * 3; this.c[j] = c[0]; this.c[j + 1] = c[1]; this.c[j + 2] = c[2]; this.a[i] = a; } }
  paintFn(mask, fn) {
    const o = [0, 0, 0], C = this.c, w = this.w;
    for (let i = 0; i < mask.length; i++) if (mask[i]) {
      const j = i * 3; o[0] = C[j]; o[1] = C[j + 1]; o[2] = C[j + 2];
      fn(i % w, (i / w) | 0, o, i);
      C[j] = o[0]; C[j + 1] = o[1]; C[j + 2] = o[2]; this.a[i] = 255;
    }
  }
  // composite Canvas2D drawing on top of the current content (alpha re-thresholded)
  draw(fn) {
    const cv = texCanvas(this), ctx = ctx2d(cv); ctx.imageSmoothingEnabled = false;
    fn(ctx);
    const d = ctx.getImageData(0, 0, this.w, this.h).data;
    for (let i = 0, n = this.w * this.h; i < n; i++) {
      const k = i * 4;
      if (d[k + 3] >= 128) { const j = i * 3; this.c[j] = d[k]; this.c[j + 1] = d[k + 1]; this.c[j + 2] = d[k + 2]; this.a[i] = 255; }
      else this.a[i] = 0;
    }
  }
}

function texCanvas(t) {
  const cv = mkCanvas(t.w, t.h), ctx = ctx2d(cv), img = ctx.createImageData(t.w, t.h), d = img.data;
  for (let i = 0, n = t.w * t.h; i < n; i++) {
    const j = i * 3, k = i * 4;
    d[k] = clamp(t.c[j], 0, 255); d[k + 1] = clamp(t.c[j + 1], 0, 255); d[k + 2] = clamp(t.c[j + 2], 0, 255); d[k + 3] = t.a[i];
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
function subTex(w, h, seed, paint, tile = false) { const t = new Tex(w, h, seed, tile); paint(t); return texCanvas(t); }

// Final PS1 conversion: 15-bit colour (& 0xF8) with optional 4x4 ordered dither, binary alpha.
// Writes into `dst` (RGBA bytes, row stride `stride` px) at (ox, oy), or into a new ImageData.
function finish(t, o = {}, dst, stride, ox = 0, oy = 0) {
  let img = null;
  if (!dst) { img = new ImageData(t.w, t.h); dst = img.data; stride = t.w; }
  const C = t.c, A = t.a, dith = o.dither !== false, alpha = !!o.alpha;
  for (let y = 0; y < t.h; y++) {
    let k = ((oy + y) * stride + ox) * 4;
    for (let x = 0; x < t.w; x++, k += 4) {
      const i = y * t.w + x, j = i * 3, b = dith ? bayer(x, y) * 8 : 0;
      let r = (C[j] + b) | 0, g = (C[j + 1] + b) | 0, bl = (C[j + 2] + b) | 0;
      dst[k] = (r < 0 ? 0 : r > 255 ? 255 : r) & 0xf8;
      dst[k + 1] = (g < 0 ? 0 : g > 255 ? 255 : g) & 0xf8;
      dst[k + 2] = (bl < 0 ? 0 : bl > 255 ? 255 : bl) & 0xf8;
      dst[k + 3] = alpha ? (A[i] >= 128 ? 255 : 0) : 255;
    }
  }
  return img;
}

// ---------------------------------------------------------------------------
// Noise (all tileable: grid wraps on the texture size)
// ---------------------------------------------------------------------------
// separable bilinear value noise (smoothstep), accumulated into `out` scaled by `amp`
function vnoiseAdd(rand, w, h, cx, cy, out, amp) {
  const g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const x0 = new Int32Array(w), x1 = new Int32Array(w), tx = new Float32Array(w), cv = new Float32Array(cx);
  for (let x = 0; x < w; x++) { const f = (x * cx) / w, i = Math.floor(f), t = f - i; x0[x] = i % cx; x1[x] = (i + 1) % cx; tx[x] = t * t * (3 - 2 * t); }
  for (let y = 0, o = 0; y < h; y++, o += w) {
    const f = (y * cy) / h, i = Math.floor(f); let t = f - i; t = t * t * (3 - 2 * t);
    const r0 = (i % cy) * cx, r1 = ((i + 1) % cy) * cx;
    for (let k = 0; k < cx; k++) { const a = g[r0 + k]; cv[k] = a + (g[r1 + k] - a) * t; }
    for (let x = 0; x < w; x++) { const a = cv[x0[x]]; out[o + x] += (a + (cv[x1[x]] - a) * tx[x]) * amp; }
  }
}
function vnoise(rand, w, h, cx, cy) {
  cx = Math.max(1, Math.round(cx)); cy = Math.max(1, Math.round(cy == null ? (cx * h) / w : cy));
  const out = new Float32Array(w * h);
  vnoiseAdd(rand, w, h, cx, cy, out, 1);
  return out;
}
// fractal sum; octaves finer than 2 px are skipped (per-pixel grain is added by the painters)
function fbm(rand, w, h, cx, oct = 4, pers = 0.5, cy) {
  const out = new Float32Array(w * h);
  let amp = 1, tot = 0, ccx = cx, ccy = cy == null ? (cx * h) / w : cy;
  for (let o = 0; o < oct; o++) {
    if (o > 0 && (ccx > w / 2 || ccy > h / 2)) break;
    vnoiseAdd(rand, w, h, Math.max(1, Math.round(Math.min(ccx, w))), Math.max(1, Math.round(Math.min(ccy, h))), out, amp);
    tot += amp; amp *= pers; ccx *= 2; ccy *= 2;
  }
  const s = 1 / tot;
  for (let i = 0; i < out.length; i++) out[i] *= s;
  return out;
}
function norm(a) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
  const s = hi > lo ? 1 / (hi - lo) : 0;
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) * s;
  return a;
}
function voronoi(rand, w, h, n, tile = true) {
  const px = new Float32Array(n), py = new Float32Array(n);
  for (let k = 0; k < n; k++) { px[k] = rand() * w; py[k] = rand() * h; }
  const id = new Int32Array(w * h), d1 = new Float32Array(w * h), d2 = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let b1 = 1e9, b2 = 1e9, bi = 0;
    for (let k = 0; k < n; k++) {
      let dx = Math.abs(x + 0.5 - px[k]), dy = Math.abs(y + 0.5 - py[k]);
      if (tile) { if (dx > w / 2) dx = w - dx; if (dy > h / 2) dy = h - dy; }
      const d = dx * dx + dy * dy;
      if (d < b1) { b2 = b1; b1 = d; bi = k; } else if (d < b2) b2 = d;
    }
    const i = y * w + x; id[i] = bi; d1[i] = Math.sqrt(b1); d2[i] = Math.sqrt(b2);
  }
  return { id, d1, d2, px, py, n };
}

// ---------------------------------------------------------------------------
// Masks, stamping, lines
// ---------------------------------------------------------------------------
const _scratch = new Map();
function scratchCtx(w, h) {
  const k = w * 4096 + h;
  let ctx = _scratch.get(k);
  if (!ctx) { ctx = ctx2d(mkCanvas(w, h)); _scratch.set(k, ctx); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.imageSmoothingEnabled = false;
  return ctx;
}
function cmask(w, h, draw, thr = 128, wrap = false) {
  const ctx = scratchCtx(w, h);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
  const offs = wrap ? [-1, 0, 1] : [0];
  for (const oy of offs) for (const ox of offs) { ctx.save(); ctx.translate(ox * w, oy * h); draw(ctx); ctx.restore(); }
  const d = ctx.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] >= thr ? 1 : 0;
  return m;
}
function polyPath(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]); ctx.closePath(); }
function polyMask(w, h, pts, wrap = false) { return cmask(w, h, (c) => { polyPath(c, pts); c.fill(); }, 128, wrap); }
function stamp(m, w, h, cx, cy, r, wrap) {
  if (r < 0.75) {
    let x = Math.floor(cx), y = Math.floor(cy);
    if (wrap) { x = ((x % w) + w) % w; y = ((y % h) + h) % h; } else if (x < 0 || y < 0 || x >= w || y >= h) return;
    m[y * w + x] = 1; return;
  }
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r), r2 = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy > r2) continue;
    let xx = x, yy = y;
    if (wrap) { xx = ((x % w) + w) % w; yy = ((y % h) + h) % h; } else if (x < 0 || y < 0 || x >= w || y >= h) continue;
    m[yy * w + xx] = 1;
  }
}
// visit points along polylines every `step` px: fn(x, y, segAngle)
function walkPolys(polys, step, fn) {
  for (const p of polys) {
    if (p.length < 4) { if (p.length === 2) fn(p[0], p[1], 0); continue; }
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k], ay = p[k + 1], bx = p[k + 2], by = p[k + 3];
      const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(len / step)), ang = Math.atan2(by - ay, bx - ax);
      for (let s = k === 0 ? 0 : 1; s <= n; s++) fn(ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n, ang);
    }
  }
}
function stampPolys(m, w, h, polys, r, o = {}) {
  const rand = o.rand, skip = o.skip || 0;
  walkPolys(polys, o.step || Math.max(0.35, r * 0.3), (x, y) => { if (skip && rand() < skip) return; stamp(m, w, h, x, y, r, o.wrap); });
  return m;
}
function line(x0, y0, x1, y1, plot) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function crackWalk(t, m, x, y, len, ang, wander = 0.5, branch = 0) {
  for (let k = 0; k < len; k++) {
    ang += (t.r() - 0.5) * wander; x += Math.cos(ang); y += Math.sin(ang);
    const i = t.idx(x, y); if (i >= 0) m[i] = 1;
    if (branch && t.r() < branch) crackWalk(t, m, x, y, (len * 0.4) | 0, ang + (t.r() < 0.5 ? -1 : 1) * t.rf(0.6, 1.3), wander, 0);
  }
}
// recessed line: dark on the mask, light pixel below-right (light from top-left)
function groove(t, m, dark = 0.65, light = 1.1) {
  const { w, h } = t;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    t.mul(x, y, dark);
    const j = t.idx(x + 1, y + 1);
    if (light !== 1 && j >= 0 && !m[j]) t.mul(x + 1, y + 1, light);
  }
}
// raised line: light on mask, dark shadow below-right
function ridge(t, m, light = 1.2, dark = 0.75) {
  const { w, h } = t;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    t.mul(x, y, light);
    const j = t.idx(x + 1, y + 1);
    if (j >= 0 && !m[j]) t.mul(x + 1, y + 1, dark);
  }
}

// noise-perturbed elliptical field: 1 at centre, 0 at the rim, negative outside (wraps if t.tile)
function blobField(t, cx, cy, rx, ry, noise, amp = 0.35, into) {
  const { w, h } = t, F = into || new Float32Array(w * h).fill(-9);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (t.tile) { dx -= Math.round(dx / w) * w; dy -= Math.round(dy / h) * h; }
    const i = y * w + x, d = Math.sqrt((dx / rx) * (dx / rx) + (dy / ry) * (dy / ry));
    const v = 1 - d + (noise ? (noise[i] - 0.5) * 2 * amp : 0);
    if (v > F[i]) F[i] = v;
  }
  return F;
}
// tide-mark stain: tint inside F>levels[0], 1px rings at each level boundary
function tideStain(t, F, o) {
  const L = o.levels || [0, 0.3, 0.6], tint = col(o.tint), ring = col(o.ring), k = o.k ?? 0.3, rk = o.ringK ?? 0.5;
  const ins = (x, y, lv) => { const i = t.idx(x, y); return i < 0 || F[i] > lv; };
  t.each((x, y, c, i) => {
    const v = F[i]; if (v <= L[0]) return false;
    const kk = k * (0.65 + 0.35 * Math.min(1, v * 2.5)) * (o.mask ? o.mask[i] : 1);
    c[0] += (tint[0] - c[0]) * kk; c[1] += (tint[1] - c[1]) * kk; c[2] += (tint[2] - c[2]) * kk;
    for (let li = 0; li < L.length; li++) {
      const lv = L[li]; if (v <= lv) break;
      if (!ins(x - 1, y, lv) || !ins(x + 1, y, lv) || !ins(x, y - 1, lv) || !ins(x, y + 1, lv)) {
        const rr = rk * (li === 0 ? 1 : 0.65);
        c[0] += (ring[0] - c[0]) * rr; c[1] += (ring[1] - c[1]) * rr; c[2] += (ring[2] - c[2]) * rr;
      }
    }
  });
}
// binary alpha from a soft field via ordered dither (soft edges = dithered pixels)
function ditherAlpha(t, F, lo, hi) {
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const i = y * t.w + x, a = sstep(lo, hi, F[i]);
    t.a[i] = a > bayer(x, y) ? 255 : 0;
  }
}
function grime(t, n, c, amt, bias = 0.5) {
  c = col(c);
  const C = t.c, N = t.w * t.h, r = c[0], g = c[1], b = c[2];
  for (let i = 0, j = 0; i < N; i++, j += 3) {
    let k = (n[i] - bias) * 2; if (k <= 0) continue; if (k > 1) k = 1; k *= amt;
    C[j] += (r - C[j]) * k; C[j + 1] += (g - C[j + 1]) * k; C[j + 2] += (b - C[j + 2]) * k;
  }
}
function speckle(t, p, lo, hi) {
  const C = t.c, N = t.w * t.h, R = t.rand;
  for (let i = 0, j = 0; i < N; i++, j += 3) if (R() < p) { const f = lo + (hi - lo) * R(); C[j] *= f; C[j + 1] *= f; C[j + 2] *= f; }
}
// vertical run-down streak (rust / water) from (x0,y0)
function streak(t, x0, y0, len, c, amt, wid = 1) {
  c = col(c); let x = x0;
  for (let k = 0; k < len; k++) {
    const f = amt * (1 - k / len) * (0.7 + 0.3 * t.r());
    for (let q = 0; q < wid; q++) t.mix(x + q, y0 + k, c, f * (q === 0 || q === wid - 1 ? 0.7 : 1));
    if (t.r() < 0.08) x += t.r() < 0.5 ? -1 : 1;
  }
}
// 2-tone sheet-metal screw head
function screw(t, x, y, base = [160, 160, 156]) {
  t.set(x, y, mulc(base, 1.25)); t.set(x + 1, y, base); t.set(x, y + 1, base); t.set(x + 1, y + 1, mulc(base, 0.55));
  t.mul(x + 2, y + 1, 0.8); t.mul(x + 1, y + 2, 0.8);
}

// ---------------------------------------------------------------------------
// Bitmap fonts (5x7 and 3x5) — crisp at any texture size
// ---------------------------------------------------------------------------
const F57_SRC = {
  A: '0E 11 11 11 1F 11 11', B: '1E 11 11 1E 11 11 1E', C: '0E 11 10 10 10 11 0E', D: '1C 12 11 11 11 12 1C',
  E: '1F 10 10 1E 10 10 1F', F: '1F 10 10 1E 10 10 10', G: '0E 11 10 17 11 11 0F', H: '11 11 11 1F 11 11 11',
  I: '0E 04 04 04 04 04 0E', J: '07 02 02 02 02 12 0C', K: '11 12 14 18 14 12 11', L: '10 10 10 10 10 10 1F',
  M: '11 1B 15 15 11 11 11', N: '11 11 19 15 13 11 11', O: '0E 11 11 11 11 11 0E', P: '1E 11 11 1E 10 10 10',
  Q: '0E 11 11 11 15 12 0D', R: '1E 11 11 1E 14 12 11', S: '0F 10 10 0E 01 01 1E', T: '1F 04 04 04 04 04 04',
  U: '11 11 11 11 11 11 0E', V: '11 11 11 11 11 0A 04', W: '11 11 11 15 15 15 0A', X: '11 11 0A 04 0A 11 11',
  Y: '11 11 11 0A 04 04 04', Z: '1F 01 02 04 08 10 1F',
  0: '0E 11 13 15 19 11 0E', 1: '04 0C 04 04 04 04 0E', 2: '0E 11 01 02 04 08 1F', 3: '1F 02 04 02 01 11 0E',
  4: '02 06 0A 12 1F 02 02', 5: '1F 10 1E 01 01 11 0E', 6: '06 08 10 1E 11 11 0E', 7: '1F 01 02 04 08 08 08',
  8: '0E 11 11 0E 11 11 0E', 9: '0E 11 11 0F 01 02 0C',
  ' ': '00 00 00 00 00 00 00', '-': '00 00 00 0E 00 00 00', '—': '00 00 00 1F 00 00 00', '.': '00 00 00 00 00 0C 0C',
  ',': '00 00 00 00 0C 04 08', "'": '0C 04 08 00 00 00 00', '?': '0E 11 01 02 04 00 04', '!': '04 04 04 04 04 00 04',
  ':': '00 0C 0C 00 0C 0C 00', '/': '00 01 02 04 08 10 00', '+': '00 04 04 1F 04 04 00', '&': '0C 12 14 08 15 12 0D',
  '(': '02 04 08 08 08 04 02', ')': '08 04 02 02 02 04 08', '#': '0A 0A 1F 0A 1F 0A 0A', '·': '00 00 00 0C 0C 00 00',
  '←': '00 04 08 1F 08 04 00', '→': '00 04 02 1F 02 04 00', '▲': '04 0E 0E 1F 1F 00 00', '▼': '00 00 1F 1F 0E 0E 04',
  '"': '0A 0A 00 00 00 00 00', '*': '00 04 15 0E 15 04 00', '=': '00 00 1F 00 1F 00 00',
};
const F35_SRC = {
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227',
  J: '11152', K: '55655', L: '44447', M: '57755', N: '57775', O: '25552', P: '65644', Q: '25573', R: '65655',
  S: '34216', T: '72222', U: '55557', V: '55522', W: '55775', X: '55255', Y: '55222', Z: '71247',
  0: '75557', 1: '26227', 2: '61247', 3: '61216', 4: '55711', 5: '74616', 6: '34757', 7: '71222', 8: '75757', 9: '75716',
  ' ': '00000', '-': '00700', '—': '00700', '.': '00002', ',': '00024', "'": '22000', '/': '11244', ':': '02020', '·': '00200',
  '!': '22202', '?': '61202', '+': '02720', '&': '25253', '(': '12221', ')': '42224', '#': '57575', '"': '55000',
};
function mkFont(src, w, h, sep) {
  const g = {};
  for (const k in src) g[k] = (sep ? src[k].split(' ') : src[k].split('')).map((v) => parseInt(v, 16));
  return { w, h, g };
}
const F57 = mkFont(F57_SRC, 5, 7, true);
const F35 = mkFont(F35_SRC, 3, 5, false);
function bmWidth(str, F, o = {}) { const s = o.scale || 1, sp = o.sp ?? 1, b = o.bold ? 1 : 0; return str.length ? (str.length * (F.w + sp + b) - sp) * s : 0; }
// plot(x, y, charIndex) for every lit font pixel
function bmPlot(str, x, y, F, o, plot) {
  const s = o.scale || 1, sp = o.sp ?? 1, b = o.bold ? 1 : 0;
  let px = x;
  for (let ci = 0; ci < str.length; ci++) {
    const rows = F.g[str[ci]] || F.g['?'];
    const jy = o.jit ? o.jit[ci] || 0 : 0;
    for (let ry = 0; ry < F.h; ry++) {
      const bits = rows[ry];
      for (let rx = 0; rx < F.w; rx++) {
        if (!(bits & (1 << (F.w - 1 - rx)))) continue;
        for (let q = 0; q <= b; q++) for (let sy = 0; sy < s; sy++) for (let sx = 0; sx < s; sx++) plot(px + (rx + q) * s + sx, y + (ry + jy) * s + sy, ci);
      }
    }
    px += (F.w + sp + b) * s;
  }
}
function bmText(t, str, x, y, F, c, o = {}) { c = col(c); bmPlot(str, x, y, F, o, (px, py, ci) => { if (o.skip && o.skip.includes(ci)) return; if (o.mix != null) t.mix(px, py, c, o.mix); else t.set(px, py, c); }); }
function bmMask(w, h, str, x, y, F, o = {}) { const m = new Uint8Array(w * h); bmPlot(str, x, y, F, o, (px, py) => { if (px >= 0 && py >= 0 && px < w && py < h) m[py * w + px] = 1; }); return m; }
function bmCenter(t, str, cx, y, F, c, o = {}) { bmText(t, str, Math.round(cx - bmWidth(str, F, o) / 2), y, F, c, o); }

// Canvas text -> binary mask. `top` is the top of the capitals. Returns mask with .info {x0, w, asc}
const FONT_SANS = 'Arial, Helvetica, sans-serif';
const FONT_HEAVY = "'Arial Black', Impact, 'Helvetica Neue', Arial, sans-serif";
function textMask(w, h, str, font, x, top, o = {}) {
  let info = null;
  const m = cmask(w, h, (ctx) => {
    ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const mt = ctx.measureText(str);
    const asc = mt.actualBoundingBoxAscent || parseFloat(font.replace(/^\D+/, '')) * 0.72;
    const tw = mt.width;
    let sx = o.sx || 1;
    if (o.maxW && tw * sx > o.maxW) sx = o.maxW / tw;
    const W = tw * sx;
    let x0 = x; if (o.align === 'center') x0 = x - W / 2; else if (o.align === 'right') x0 = x - W;
    ctx.translate(Math.round(x0), Math.round(top));
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(sx, o.sy || 1);
    if (o.stroke) { ctx.lineWidth = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, 0, asc); }
    ctx.fillText(str, 0, asc);
    info = { x0: Math.round(x0), w: W, asc: asc * (o.sy || 1), top: Math.round(top) };
  }, o.thr ?? 110);
  m.info = info;
  return m;
}
let _mctx = null;
function measure(str, font) { if (!_mctx) _mctx = ctx2d(mkCanvas(8, 8)); _mctx.font = font; const m = _mctx.measureText(str); return { w: m.width, asc: m.actualBoundingBoxAscent || 0 }; }

// ---------------------------------------------------------------------------
// Single-stroke vector font (4x6 unit box, y down, baseline at 6) for hand lettering
// ---------------------------------------------------------------------------
const SF_SRC = {
  A: '0 6 2 0 4 6|0.9 3.9 3.1 3.9', B: '0 6 0 0 3 0 4 0.8 4 2.2 3 3 0 3|3 3 4 3.8 4 5.2 3 6 0 6',
  C: '4 0.9 3 0 1 0 0 1 0 5 1 6 3 6 4 5.1', D: '0 0 0 6 2.4 6 4 4.4 4 1.6 2.4 0 0 0', E: '4 0 0 0 0 6 4 6|0 3 3 3',
  F: '4 0 0 0 0 6|0 3 3 3', G: '4 0.9 3 0 1 0 0 1 0 5 1 6 3 6 4 5 4 3.3 2.2 3.3', H: '0 0 0 6|4 0 4 6|0 3 4 3',
  I: '1:0.5 0 0.5 6', J: '4 0 4 5 3 6 1 6 0 5', K: '0 0 0 6|4 0 0 3.6|1.3 2.6 4 6', L: '0 0 0 6 4 6',
  M: '4.6:0 6 0 0 2.3 3.6 4.6 0 4.6 6', N: '0 6 0 0 4 6 4 0', O: '1 0 3 0 4 1 4 5 3 6 1 6 0 5 0 1 1 0',
  P: '0 6 0 0 3 0 4 1 4 2 3 3 0 3', Q: '1 0 3 0 4 1 4 5 3 6 1 6 0 5 0 1 1 0|2.6 4.6 4.2 6.3',
  R: '0 6 0 0 3 0 4 1 4 2 3 3 0 3|2 3 4 6', S: '4 0.9 3 0 1 0 0 1 0 2 1 3 3 3 4 4 4 5 3 6 1 6 0 5.1',
  T: '0 0 4 0|2 0 2 6', U: '0 0 0 5 1 6 3 6 4 5 4 0', V: '0 0 2 6 4 0', W: '5:0 0 1.2 6 2.5 2.2 3.8 6 5 0',
  X: '0 0 4 6|4 0 0 6', Y: '0 0 2 3 4 0|2 3 2 6', Z: '0 0 4 0 0 6 4 6',
  0: '1 0 3 0 4 1 4 5 3 6 1 6 0 5 0 1 1 0', 1: '2.2:0.2 1.2 1.6 0 1.6 6', 2: '0 1 1 0 3 0 4 1 4 2.2 0 6 4 6',
  3: '0 0.9 1 0 3 0 4 1 4 2 3 3 1.6 3|3 3 4 4 4 5 3 6 1 6 0 5.1', 4: '3 6 3 0 0 4.2 4 4.2',
  5: '4 0 0.4 0 0 3 3 2.7 4 3.7 4 5 3 6 1 6 0 5.1', 6: '3.6 0.4 2.6 0 1 0 0 1.2 0 5 1 6 3 6 4 5 4 3.9 3 3 1 3 0 3.9',
  7: '0 0 4 0 1.6 6', 8: '1 3 0 2 0 1 1 0 3 0 4 1 4 2 3 3 1 3 0 4 0 5 1 6 3 6 4 5 4 4 3 3',
  9: '4 2.1 3 3 1 3 0 2 0 1 1 0 3 0 4 1 4 5 3 6 1 6 0.4 5.4',
  '-': '0.6 3.2 3.4 3.2', '—': '0 3.2 4 3.2', '?': '0 1 1 0 3 0 4 1 4 2 2 3.4 2 4.4|2 5.5 2 6',
  '!': '1:0.5 0 0.5 4.2|0.5 5.5 0.5 6', "'": '1:0.6 0 0.3 1.6', '+': '2 1.5 2 4.5|0.5 3 3.5 3',
  '.': '1:0.5 5.5 0.5 6', ',': '1:0.6 5.4 0 6.8', ' ': '2.4:',
};
const SF = {};
for (const k in SF_SRC) {
  let s = SF_SRC[k], w = 4;
  const m = s.indexOf(':');
  if (m >= 0) { w = parseFloat(s.slice(0, m)); s = s.slice(m + 1); }
  SF[k] = { w, s: s ? s.split('|').map((p) => p.trim().split(/\s+/).map(Number)) : [] };
}
function sfMeasure(text, s, o = {}) {
  const gap = o.gap ?? 1.3, sx = o.sx ?? 1;
  let pen = 0;
  for (const ch of text) pen += (SF[ch] || SF['?']).w * sx + gap;
  return (pen - gap) * s;
}
// returns polylines in px; (x, y) = left / top of a full-height glyph
function sfLayout(text, x, y, s, o = {}) {
  const R = o.rand || Math.random, gap = o.gap ?? 1.3, sx = o.sx ?? 1, slant = o.slant || 0, jit = o.jit || 0;
  const bounce = o.bounce || 0, sv = o.sizeVar || 0, slope = o.slope || 0, lean = o.lean || 0;
  const polys = [];
  let pen = 0;
  for (const ch of text) {
    const g = SF[ch] || SF['?'];
    const sc = 1 + (sv ? (R() * 2 - 1) * sv : 0), by = bounce ? (R() * 2 - 1) * bounce : 0, ln = lean ? (R() * 2 - 1) * lean : 0;
    for (const st of g.s) {
      const pts = [];
      for (let k = 0; k < st.length; k += 2) {
        const gx = st[k] * sx, gy = st[k + 1];
        const jx = jit ? (R() * 2 - 1) * jit : 0, jy = jit ? (R() * 2 - 1) * jit : 0;
        const lx = (pen + (gx + (slant + ln) * (6 - gy)) * sc + jx) * s;
        const ly = (6 - (6 - gy) * sc + by + jy) * s;
        pts.push(x + lx, y + ly + lx * slope);
      }
      polys.push(pts);
    }
    pen += g.w * sx * sc + gap;
  }
  return polys;
}

// ---------------------------------------------------------------------------
// Spray / marker / chalk brushes
// ---------------------------------------------------------------------------
function paintVar(t, m, c, amt = 0.1) {
  c = col(c); const n = t._pv || (t._pv = fbm(t.rand, t.w, t.h, 8, 2));
  t.paintFn(m, (x, y, o, i) => { const f = 1 + (n[i] - 0.5) * 2 * amt + (t.r() - 0.5) * amt * 0.5; o[0] = c[0] * f; o[1] = c[1] * f; o[2] = c[2] * f; });
}
function drip(t, x, y, len, c, wide) {
  x = Math.round(x); y = Math.round(y);
  for (let k = 0; k < len; k++) {
    t.set(x, y + k, c);
    if (wide && k < len * 0.45) t.set(x + 1, y + k, c);
    if (t.r() < 0.05) x += t.r() < 0.5 ? -1 : 1;
  }
  t.set(x, y + len, c); t.set(x + 1, y + len, c); t.set(x, y + len + 1, c);
}
function sprayFx(t, polys, r, c, o = {}) {
  c = col(c);
  const speck = o.speck ?? 0.5, spread = o.spread ?? r * 1.5 + 1.2, dp = o.drip ?? 0.03, dmax = o.dripMax ?? 12, dmin = o.dripMin ?? 3;
  walkPolys(polys, 1, (x, y) => {
    let n = speck;
    while (n > 0) {
      if (t.r() < n) { const a = t.r() * TAU, d = r + 0.3 + Math.pow(t.r(), 1.7) * spread; t.set(x + Math.cos(a) * d, y + Math.sin(a) * d, c); }
      n -= 1;
    }
    if (t.r() < dp) drip(t, x + t.rf(-r * 0.5, r * 0.5), y + r * 0.5, t.ri(dmin, dmax), c, r > 1.6 && t.r() < 0.5);
  });
}
function markerLines(t, polys, r, c, o = {}) {
  const m = stampPolys(new Uint8Array(t.w * t.h), t.w, t.h, polys, r, { rand: t.rand, skip: o.skip || 0, wrap: t.tile });
  paintVar(t, m, c, o.var ?? 0.06);
  return m;
}
function chalkLines(t, polys, r, c, o = {}) {
  c = col(c);
  const m = stampPolys(new Uint8Array(t.w * t.h), t.w, t.h, polys, r, { rand: t.rand, wrap: t.tile });
  const n = t._ch || (t._ch = fbm(t.rand, t.w, t.h, 16, 2));
  t.each((x, y, o2, i) => {
    if (!m[i]) return false;
    if (n[i] * 0.6 + t.r() * 0.6 < (o.gaps ?? 0.38)) return false;
    const f = 0.85 + t.r() * 0.2; o2[0] = c[0] * f; o2[1] = c[1] * f; o2[2] = c[2] * f; t.a[i] = 255;
  });
  // dust
  walkPolys(polys, 1, (x, y) => { if (t.r() < 0.18) t.set(x + t.rf(-2.5, 2.5), y + t.rf(-2.5, 2.5), mulc(c, 0.9)); });
}

// ============================================================================
// Texture registry
// ============================================================================
const TEXTURES = [];
function def(name, w, h, o, paint) { TEXTURES.push({ name, w, h, tile: !!o.tile, alpha: !!o.alpha, dither: o.dither !== false, paint }); }

// ============================================================================
// ARCHITECTURE
// ============================================================================
const CREAM = [214, 205, 178];

function wallPaintBase(t) {
  const { w, h } = t, R = t.rand;
  const big = fbm(R, w, h, 2, 3, 0.6), mid = fbm(R, w, h, 8, 3, 0.5), str = fbm(R, w, h, 16, 2, 0.5, 2);
  const yel = [204, 186, 138], gry = [174, 172, 164];
  t.each((x, y, o, i) => {
    const b = big[i], ty = sstep(0.5, 0.72, b) * 0.6, tg = sstep(0.46, 0.28, b) * 0.45;
    const m = (mid[i] - 0.5) * 14, s = Math.max(0, str[i] - 0.56) * 46, p = (R() - 0.5) * 4;
    for (let c = 0; c < 3; c++) o[c] = lerp(lerp(CREAM[c], yel[c], ty), gry[c], tg) + m - s * (1 + c * 0.12) + p;
  });
  const cm = new Uint8Array(w * h);
  for (let k = 0; k < 2; k++) crackWalk(t, cm, t.rf(0, w), t.rf(0, h), t.ri(14, 30), t.rf(0, TAU), 0.55, 0.06);
  groove(t, cm, 0.72, 1.06);
  speckle(t, 0.02, 0.85, 0.95);
}
def('wall_paint', 64, 64, { tile: true }, (t) => wallPaintBase(t));

def('wall_paint_stain', 64, 64, { tile: true }, (t) => {
  wallPaintBase(t);
  const { w, h } = t, F = new Float32Array(w * h).fill(-1), nz = fbm(t.rand, w, h, 8, 3);
  for (let k = 0; k < 3; k++) {
    const x0 = (k + t.rf(0.1, 0.9)) * (w / 3), len = t.rf(24, 62), wid = t.rf(3, 6), ph = t.rf(0, TAU);
    for (let y = 0; y < Math.min(h, len); y++) {
      const v = y / len, ww = wid * (1.25 - 0.6 * v) * Math.sqrt(1 - v) + 0.5, cx = x0 + Math.sin(y * 0.13 + ph) * 1.8;
      for (let dx = -12; dx <= 12; dx++) {
        const i = t.idx(Math.round(cx + dx), y), f = (1 - Math.abs(dx + (nz[i] - 0.5) * 3) / ww) * (1 - 0.5 * v);
        if (f > F[i]) F[i] = f;
      }
    }
  }
  tideStain(t, F, { tint: [166, 132, 84], ring: [120, 86, 48], k: 0.3, ringK: 0.5, levels: [0, 0.45] });
  // damp band along the top where the leak spreads
  for (let y = 0; y < 5; y++) for (let x = 0; x < w; x++) t.mix(x, y, [150, 118, 76], (0.25 * (5 - y)) / 5 * (0.6 + nz[y * w + x]));
});

def('wall_paint_peel', 64, 64, { tile: true }, (t) => {
  wallPaintBase(t);
  const { w, h } = t, P = norm(fbm(t.rand, w, h, 4, 4, 0.55)), fine = fbm(t.rand, w, h, 16, 2);
  const lay = new Uint8Array(w * h);
  for (let i = 0; i < lay.length; i++) { const v = P[i] + (fine[i] - 0.5) * 0.14; lay[i] = v > 0.76 ? 2 : v > 0.63 ? 1 : 0; }
  const green = [166, 188, 158], plaster = [178, 174, 164];
  t.each((x, y, o, i) => {
    const L = lay[i]; if (!L) return false;
    const b = L === 2 ? plaster : green, p = (t.r() - 0.5) * 7 + (fine[i] - 0.5) * 16;
    o[0] = b[0] + p; o[1] = b[1] + p; o[2] = b[2] + p;
    if (L === 2 && t.r() < 0.06) { o[0] *= 0.85; o[1] *= 0.85; o[2] *= 0.85; }
  });
  const at = (x, y) => lay[t.idx(x, y)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const L = lay[y * w + x];
    if (L > 0) {
      if (at(x - 1, y) < L || at(x, y - 1) < L || at(x - 1, y - 1) < L) t.mul(x, y, 0.6);
      else if (at(x - 2, y - 1) < L || at(x - 1, y - 2) < L) t.mul(x, y, 0.84);
    }
    if (L < 2 && (at(x + 1, y) > L || at(x, y + 1) > L)) t.mix(x, y, [244, 240, 226], 0.45);
  }
  // a few loose curled flakes inside the bald patches
  for (let k = 0; k < 6; k++) {
    const x = t.ri(0, w - 1), y = t.ri(0, h - 1);
    if (lay[t.idx(x, y)] === 0) continue;
    t.set(x, y, [226, 218, 194]); t.set(x + 1, y, [206, 198, 174]); t.mul(x + 1, y + 1, 0.6); t.mul(x + 2, y + 1, 0.7);
  }
});

function wallLowerBase(t) {
  const { w, h } = t, R = t.rand;
  const n1 = fbm(R, w, h, 4, 4), n2 = fbm(R, w, h, 16, 2, 0.5, 4);
  const G = [146, 168, 134], rail = [92, 98, 70], base = [46, 44, 42], dirt = [96, 88, 64];
  const prof = [1.38, 1.16, 1.0, 0.9, 0.62], bb = h - 6;
  t.each((x, y, o, i) => {
    const p = (R() - 0.5) * 4;
    if (y < 5) { const f = prof[y], m = (n1[i] - 0.5) * 12; for (let c = 0; c < 3; c++) o[c] = rail[c] * f + m + p; return; }
    if (y >= bb) {
      const f = y === bb ? 1.55 : y === bb + 1 ? 1.12 : 1 - (y - bb) * 0.04;
      for (let c = 0; c < 3; c++) o[c] = base[c] * f + p + (n2[i] - 0.5) * 8; return;
    }
    const g = clamp(sstep(24, h - 4, y) * 0.36 + (n1[i] - 0.5) * 0.3, 0, 1), m = (n2[i] - 0.5) * 9;
    for (let c = 0; c < 3; c++) o[c] = lerp(G[c], dirt[c], g) + m + p;
    if (y === 5) { o[0] *= 0.74; o[1] *= 0.74; o[2] *= 0.74; } else if (y === 6) { o[0] *= 0.88; o[1] *= 0.88; o[2] *= 0.88; }
    if (y === bb - 1) { o[0] *= 0.84; o[1] *= 0.84; o[2] *= 0.84; }
  });
  // scuffs: trolley rubs and black heel marks
  for (let k = 0; k < 10; k++) {
    const sx = t.rf(0, w), sy = t.ri(28, bb - 3), len = t.ri(3, 12), black = R() < 0.4, d = t.rf(0.55, 0.8);
    let yy = sy;
    for (let j = 0; j < len; j++) { if (R() < 0.15) yy += R() < 0.5 ? -1 : 1; if (black) t.mix(sx + j, yy, [40, 38, 36], 0.55); else t.mul(sx + j, yy, d); }
  }
  // small chips showing older cream coat
  for (let k = 0; k < 5; k++) {
    const cx = t.ri(0, w - 1), cy = t.ri(10, bb - 4);
    t.mix(cx, cy, [196, 190, 166], 0.6); t.mix(cx + 1, cy, [196, 190, 166], 0.45); t.mul(cx + 1, cy + 1, 0.8);
  }
  // rail chips
  for (let k = 0; k < 4; k++) { const x = t.ri(0, w - 1); t.mix(x, 0, [150, 140, 110], 0.7); t.mix(x + 1, 0, [150, 140, 110], 0.5); }
}
def('wall_lower', 64, 64, { tile: true }, (t) => wallLowerBase(t));

def('wall_lower_mold', 64, 64, { tile: true }, (t) => {
  wallLowerBase(t);
  const { w, h } = t, n = norm(fbm(t.rand, w, h, 4, 4, 0.6)), f = fbm(t.rand, w, h, 16, 2), bb = h - 6;
  t.each((x, y, o, i) => {
    const up = (y - (bb - 36)) / 36;
    const d = clamp(up * 0.6 + (n[i] - 0.5) * 0.5, 0, 0.65);
    o[0] = lerp(o[0], 64, d * 0.55); o[1] = lerp(o[1], 76, d * 0.55); o[2] = lerp(o[2], 54, d * 0.55);
    if (y < 5) return;
    const m = n[i] * 0.9 + up * 0.75 - 1.08 + (f[i] - 0.5) * 0.35;
    if (m > 0.1) { const k = 0.8 + t.r() * 0.15; o[0] = lerp(o[0], 22 + f[i] * 20, k); o[1] = lerp(o[1], 32 + f[i] * 26, k); o[2] = lerp(o[2], 22 + f[i] * 12, k); }
    else if (m > -0.08 && t.r() < (m + 0.08) / 0.2) { o[0] = lerp(o[0], 30, 0.8); o[1] = lerp(o[1], 42, 0.8); o[2] = lerp(o[2], 28, 0.8); }
  });
  for (let k = 0; k < 40; k++) { const x = t.ri(0, w - 1), y = t.ri(bb - 30, bb - 1); if (t.r() < 0.5) t.mix(x, y, [26, 34, 24], 0.7); }
});

function wallTileBase(t) {
  const { w, h } = t, R = t.rand, S = 8, cols = w / S;
  const white = [222, 226, 218], teal = [172, 204, 196], grout = [134, 134, 126], n = fbm(R, w, h, 4, 3);
  const tc = [];
  for (let k = 0; k < cols * (h / S); k++) { const tt = 0.22 + R() * 0.38, v = (R() - 0.5) * 12; tc.push(addc(mixc(white, teal, tt), v)); }
  t.each((x, y, o, i) => {
    const lx = x % S, ly = y % S;
    if (lx === S - 1 || ly === S - 1) { const g = (R() - 0.5) * 10 + (n[i] - 0.5) * 34; o[0] = grout[0] + g; o[1] = grout[1] + g; o[2] = grout[2] + g; return; }
    const c = tc[((y / S) | 0) * cols + ((x / S) | 0)];
    let f = 1 + (n[i] - 0.5) * 0.08 + (R() - 0.5) * 0.025;
    if (lx === 0 || ly === 0) f *= 1.07;
    if (lx === S - 2 || ly === S - 2) f *= 0.9;
    if (lx === 1 && ly === 1) f *= 1.08;
    o[0] = c[0] * f; o[1] = c[1] * f; o[2] = c[2] * f;
  });
  for (let k = 0; k < 2; k++) {
    const tx = t.ri(0, cols - 1) * S, ty = t.ri(0, h / S - 1) * S;
    line(tx + t.ri(0, 2), ty, tx + t.ri(3, 6), ty + 6, (x, y) => { t.mul(x, y, 0.55); t.mul(x + 1, y, 1.06); });
  }
}
def('wall_tile', 64, 64, { tile: true }, (t) => wallTileBase(t));

def('wall_tile_dirty', 64, 64, { tile: true }, (t) => {
  wallTileBase(t);
  const { w, h } = t, n = fbm(t.rand, w, h, 4, 4), S = 8;
  t.each((x, y, o, i) => {
    const gr = x % S === S - 1 || y % S === S - 1;
    const k = clamp((n[i] - 0.35) * 1.2, 0, 1) * (gr ? 0.6 : 0.28);
    o[0] = lerp(o[0], 112, k); o[1] = lerp(o[1], 102, k); o[2] = lerp(o[2], 80, k);
  });
  for (let k = 0; k < 4; k++) streak(t, t.ri(0, w - 1), t.ri(0, h - 1), t.ri(14, 40), [146, 84, 40], t.rf(0.35, 0.6), t.ri(1, 3));
  for (let k = 0; k < 3; k++) streak(t, t.ri(0, w - 1), t.ri(0, h - 1), t.ri(10, 30), [96, 88, 70], 0.35, 2);
  // missing tile with combed adhesive
  const mx = 3 * S, my = 2 * S;
  for (let y = my - 1; y < my + S; y++) for (let x = mx - 1; x < mx + S; x++) {
    const rx = x - mx, ry = y - my, v = (x + y) % 3;
    const c = v === 0 ? [168, 164, 152] : v === 1 ? [128, 124, 116] : [148, 144, 134];
    let f = 1;
    if (rx <= 0 || ry <= 0) f = 0.55; else if (rx === 1 || ry === 1) f = 0.8;
    t.set(x, y, mulc(addc(c, (t.r() - 0.5) * 8), f));
  }
  t.mix(mx + S, my + 3, [120, 116, 108], 0.7); t.mix(mx + S, my + 4, [120, 116, 108], 0.7); // chipped neighbour
});

def('wall_brick', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 4), nb = fbm(R, w, h, 16, 2);
  const paint = [198, 192, 176], brick = [148, 82, 60], tones = [];
  for (let k = 0; k < 64; k++) tones.push((R() - 0.5) * 2);
  t.each((x, y, o, i) => {
    const row = (y / 8) | 0, ly = y % 8, xs = x + (row % 2) * 8, bx = xs % 16, bi = row * 4 + (((xs / 16) | 0) % 4);
    const joint = ly === 7 || bx === 15;
    let c;
    if (joint) c = mulc(paint, 0.72 + (nb[i] - 0.5) * 0.1);
    else {
      let f = 1 + tones[bi] * 0.045 + (nb[i] - 0.5) * 0.12;
      if (ly === 0) f *= 1.08; if (bx === 0) f *= 1.04; if (ly === 6 || bx === 14) f *= 0.88;
      c = mulc(paint, f);
    }
    // damp: low on the wall (wrapped bump so tiling stays seamless)
    let dy = Math.abs(y - 54); dy = Math.min(dy, h - dy);
    const damp = sstep(0.35, 0.8, n[i] * 0.55 + Math.exp(-(dy / 11) * (dy / 11)) * 0.6);
    c = mixc(c, [118, 116, 96], damp * 0.45);
    if (!joint && damp > 0.7 && nb[i] > 0.66) c = mixc(mixc(brick, [130, 118, 104], 0.45), [96, 80, 66], tones[bi] * 0.2 + 0.2);
    const p = (R() - 0.5) * 5;
    o[0] = c[0] + p; o[1] = c[1] + p; o[2] = c[2] + p;
  });
  grime(t, fbm(R, w, h, 8, 3), [120, 110, 90], 0.3, 0.55);
});

def('wall_concrete', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 4), nf = fbm(R, w, h, 16, 2), paint = [160, 162, 158];
  const tones = []; for (let k = 0; k < 16; k++) tones.push((R() - 0.5) * 0.06);
  t.each((x, y, o, i) => {
    const row = (y / 16) | 0, ly = y % 16, xs = x + (row % 2) * 16, bx = xs % 32, bi = row * 2 + (((xs / 32) | 0) % 2);
    let f = 1 + tones[bi] + (nf[i] - 0.5) * 0.1 + (n[i] - 0.5) * 0.08;
    if (ly === 0 || bx === 0) f *= 0.68;
    else { if (ly === 1) f *= 0.86; if (bx === 1) f *= 0.92; if (ly === 15) f *= 1.06; if (bx === 31) f *= 1.04; }
    if (R() < 0.05) f *= 0.82;
    o[0] = paint[0] * f; o[1] = paint[1] * f; o[2] = paint[2] * f;
  });
  for (let k = 0; k < 5; k++) streak(t, t.ri(0, w - 1), t.ri(0, h - 1), t.ri(12, 36), k < 2 ? [130, 90, 56] : [96, 96, 88], t.rf(0.25, 0.45), t.ri(1, 3));
  grime(t, fbm(R, w, h, 4, 3), [100, 98, 88], 0.35, 0.55);
});

def('floor_lino', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, A = fbm(R, w, h, 16, 2, 0.5, 4), B = fbm(R, w, h, 4, 2, 0.5, 16);
  const wear = fbm(R, w, h, 2, 3), dirt = fbm(R, w, h, 8, 3);
  const c1 = [208, 198, 166], c2 = [158, 148, 126], tv = [];
  for (let k = 0; k < 16; k++) tv.push((R() - 0.5) * 0.07);
  t.each((x, y, o, i) => {
    const tx = (x / 16) | 0, ty = (y / 16) | 0, k = ty * 4 + tx, odd = (tx + ty) & 1, base = odd ? c2 : c1;
    const st = odd ? B[i] : A[i];
    let f = 1 + tv[k] + (st - 0.5) * 0.16 + (R() - 0.5) * 0.03;
    if (x % 16 === 0 || y % 16 === 0) f *= 0.82;
    let c = mulc(base, f);
    c = mixc(c, [176, 170, 156], sstep(0.55, 0.75, wear[i]) * 0.35);
    c = mixc(c, [96, 86, 66], clamp((dirt[i] - 0.48) * 1.6, 0, 1) * 0.45);
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  });
  speckle(t, 0.05, 0.82, 0.92);
  for (let k = 0; k < 7; k++) {
    let x = t.rf(0, w), y = t.rf(0, h), a = t.rf(0, TAU);
    const len = t.ri(3, 8);
    for (let j = 0; j < len; j++) { t.mix(x, y, [44, 40, 36], 0.7); a += t.rf(-0.4, 0.4); x += Math.cos(a); y += Math.sin(a); }
  }
  // chipped tile corner with black adhesive
  t.rect(31, 32, 3, 1, [36, 32, 28]); t.rect(32, 33, 2, 1, [36, 32, 28]); t.set(32, 34, [36, 32, 28]);
});

def('floor_terrazzo', 128, 128, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 4), wear = fbm(R, w, h, 2, 3), matrix = [192, 178, 152];
  const pal = [[234, 230, 218], [234, 230, 218], [150, 148, 140], [96, 92, 86], [158, 100, 64], [138, 150, 124], [46, 44, 40], [206, 190, 160]];
  const q = [(R() - 0.5) * 0.06, (R() - 0.5) * 0.06, (R() - 0.5) * 0.06, (R() - 0.5) * 0.06];
  t.each((x, y, o, i) => {
    const f = 1 + q[(y >= 64 ? 2 : 0) + (x >= 64 ? 1 : 0)] + (n[i] - 0.5) * 0.1 + (R() - 0.5) * 0.05;
    o[0] = matrix[0] * f; o[1] = matrix[1] * f; o[2] = matrix[2] * f;
  });
  for (let k = 0; k < 2000; k++) {
    const x = t.ri(0, w - 1), y = t.ri(0, h - 1), c = addc(t.pick(pal), (R() - 0.5) * 16), s = R();
    t.set(x, y, c);
    if (s > 0.55) t.set(x + 1, y, c);
    if (s > 0.75) t.set(x, y + 1, c);
    if (s > 0.9) t.set(x + 1, y + 1, mulc(c, 0.92));
  }
  // brass divider strips forming a 2x2 grid
  for (let k = 0; k < w; k++) for (const s0 of [0, 64]) {
    const v = 1 + (R() - 0.5) * 0.1;
    t.set(s0, k, mulc([214, 182, 108], v)); t.set(s0 + 1, k, mulc([150, 116, 56], v));
    t.set(k, s0, mulc([214, 182, 108], v)); t.set(k, s0 + 1, mulc([150, 116, 56], v));
  }
  t.each((x, y, o, i) => {
    const g = clamp((n[i] - 0.45) * 1.5, 0, 1) * 0.35, p = sstep(0.6, 0.8, wear[i]) * 0.12;
    for (let c = 0; c < 3; c++) o[c] = lerp(lerp(o[c], [118, 104, 82][c], g), 216, p);
  });
});

def('floor_tile_small', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 4), tv = [];
  for (let k = 0; k < 256; k++) tv.push((R() - 0.5) * 0.08 + (R() < 0.04 ? -0.25 : 0));
  t.each((x, y, o, i) => {
    const lx = x % 4, ly = y % 4, k = ((y >> 2) << 4) + (x >> 2);
    if (lx === 3 || ly === 3) { const g = 112 + (n[i] - 0.5) * 34 + (R() - 0.5) * 8; o[0] = g; o[1] = g - 2; o[2] = g - 6; return; }
    let f = 1 + tv[k] + (R() - 0.5) * 0.03;
    if (lx === 0 && ly === 0) f *= 1.06;
    if (lx === 2 || ly === 2) f *= 0.95;
    const b = mixc([212, 212, 206], [190, 190, 184], (k * 7919) % 3 === 0 ? 1 : 0);
    o[0] = b[0] * f; o[1] = b[1] * f; o[2] = b[2] * f;
  });
  grime(t, n, [110, 102, 86], 0.5, 0.45);
  for (let k = 0; k < 3; k++) { const x = t.ri(0, 15) * 4, y = t.ri(0, 15) * 4; t.rect(x, y, 3, 3, [54, 50, 44]); t.set(x, y, [70, 66, 60]); }
});

def('floor_concrete', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 4), nf = fbm(R, w, h, 16, 2), base = [150, 146, 138];
  t.each((x, y, o, i) => {
    const f = 1 + (n[i] - 0.5) * 0.2 + (nf[i] - 0.5) * 0.1 + (R() - 0.5) * 0.05;
    o[0] = base[0] * f; o[1] = base[1] * f; o[2] = base[2] * f;
    if (R() < 0.04) { o[0] *= 0.8; o[1] *= 0.8; o[2] *= 0.8; } else if (R() < 0.03) { o[0] *= 1.12; o[1] *= 1.12; o[2] *= 1.12; }
  });
  const cm = new Uint8Array(w * h);
  crackWalk(t, cm, t.rf(0, w), t.rf(0, h), 60, t.rf(0, TAU), 0.45, 0.025);
  crackWalk(t, cm, t.rf(0, w), t.rf(0, h), 24, t.rf(0, TAU), 0.6, 0);
  groove(t, cm, 0.62, 1.08);
  const no = fbm(R, w, h, 8, 3);
  const oil = blobField(t, t.rf(0, w), t.rf(0, h), 10, 7, no, 0.4);
  t.each((x, y, o, i) => { if (oil[i] > 0) { const k = 0.35 + Math.min(oil[i], 0.5) * 0.6; o[0] = lerp(o[0], 52, k); o[1] = lerp(o[1], 50, k); o[2] = lerp(o[2], 48, k); } });
  const wat = blobField(t, t.rf(0, w), t.rf(0, h), 13, 10, no, 0.45);
  tideStain(t, wat, { tint: [126, 120, 108], ring: [96, 90, 80], k: 0.25, ringK: 0.5, levels: [0, 0.35] });
});

def('floor_carpet', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 8, 3), nb = fbm(R, w, h, 2, 3), base = [94, 104, 120];
  t.each((x, y, o, i) => {
    let f = 1 + (R() - 0.5) * 0.3 + (n[i] - 0.5) * 0.16;
    if (((x + (y >> 1)) & 1) === 0) f *= 1.05;
    const c = mixc(base, [118, 120, 124], sstep(0.55, 0.75, nb[i]) * 0.5);
    o[0] = c[0] * f; o[1] = c[1] * f; o[2] = c[2] * f;
  });
  const sn = fbm(R, w, h, 8, 2);
  const F = new Float32Array(w * h).fill(-9);
  blobField(t, t.rf(0, w), t.rf(0, h), 11, 7, sn, 0.6, F); blobField(t, t.rf(0, w), t.rf(0, h), 5, 4, sn, 0.5, F);
  t.each((x, y, o, i) => { if (F[i] > 0) { const kk = 0.25 + Math.min(F[i], 0.4) * 0.8 + (t.r() - 0.5) * 0.1; o[0] = lerp(o[0], 58, kk); o[1] = lerp(o[1], 54, kk); o[2] = lerp(o[2], 50, kk); } });
});

def('floor_parquet', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, gH = fbm(R, w, h, 2, 3, 0.5, 32), gV = fbm(R, w, h, 32, 3, 0.5, 2), wear = fbm(R, w, h, 2, 3);
  const sl = [];
  for (let k = 0; k < 64; k++) sl.push([(R() - 0.5) * 0.16, R() * 64]);
  t.each((x, y, o, i) => {
    const bx = x >> 4, by = y >> 4, horiz = ((bx + by) & 1) === 0, lx = x & 15, ly = y & 15;
    const s = horiz ? ly >> 2 : lx >> 2, k = ((by << 2) + bx) * 4 + s, sv = sl[k];
    const along = horiz ? lx : ly, across = horiz ? ly & 3 : lx & 3;
    const g = horiz ? gH[y * w + ((x + (sv[1] | 0)) % w)] : gV[((y + (sv[1] | 0)) % h) * w + x];
    let f = 1 + sv[0] + (g - 0.5) * 0.35 + Math.sin(along * 0.9 + sv[1]) * 0.02;
    if (across === 3 || along === 15) f *= 0.55;
    else if (across === 0) f *= 1.08;
    let c = mulc([142, 102, 68], f);
    c = mixc(c, [146, 128, 104], sstep(0.55, 0.78, wear[i]) * 0.55);
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  });
  grime(t, fbm(R, w, h, 8, 3), [70, 50, 34], 0.35, 0.55);
});

function ceilingTileBase(t) {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 3), base = [210, 206, 192];
  t.each((x, y, o, i) => {
    const lx = x & 31, ly = y & 31;
    if (lx === 0 || ly === 0) { const v = 216 + (R() - 0.5) * 6; o[0] = v; o[1] = v; o[2] = v - 4; return; }
    let f = 1 + (R() - 0.5) * 0.05;
    if (R() < 0.13) f *= 0.86;
    if (lx === 1 || ly === 1) f *= 0.8; else if (lx === 31 || ly === 31) f *= 0.9; else if (lx === 2 || ly === 2) f *= 0.93;
    const c = mixc(base, [204, 188, 140], clamp((n[i] - 0.45) * 1.6, 0, 1) * 0.5);
    o[0] = c[0] * f; o[1] = c[1] * f; o[2] = c[2] * f;
  });
  for (let k = 0; k < 90; k++) {
    let x = t.ri(0, w - 1), y = t.ri(0, h - 1);
    const len = t.ri(1, 3);
    for (let j = 0; j < len; j++) { if ((x & 31) > 1 && (y & 31) > 1) t.mul(x, y, 0.8); if (R() < 0.5) x++; else y += R() < 0.5 ? 1 : -1; }
  }
}
def('ceiling_tile', 64, 64, { tile: true }, (t) => ceilingTileBase(t));

def('ceiling_tile_stain', 64, 64, { tile: true }, (t) => {
  ceilingTileBase(t);
  const { w, h } = t, n = fbm(t.rand, w, h, 8, 3), F = new Float32Array(w * h).fill(-9);
  blobField(t, 14, 17, 12, 10, n, 0.6, F);
  blobField(t, 47, 46, 7, 6, n, 0.5, F);
  const msk = new Float32Array(w * h);
  for (let i = 0; i < msk.length; i++) { const x = i % w, y = (i / w) | 0; msk[i] = (x & 31) === 0 || (y & 31) === 0 ? 0.3 : 1; }
  tideStain(t, F, { tint: [180, 146, 92], ring: [128, 90, 50], k: 0.38, ringK: 0.65, levels: [0, 0.3, 0.62], mask: msk });
});

def('ceiling_hole', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 3);
  t.each((x, y, o, i) => { const v = 16 + n[i] * 12 + (R() - 0.5) * 4; o[0] = v; o[1] = v; o[2] = v + 3; });
  // duct
  for (let y = 8; y < 26; y++) for (let x = 0; x < w; x++) {
    let v = 54 + (y === 8 ? 14 : y === 25 ? -18 : 0) + (x % 16 === 0 ? 10 : x % 16 === 1 ? -8 : 0) + (R() - 0.5) * 4;
    v *= 0.85 + n[y * w + x] * 0.3;
    t.set(x, y, [v, v + 2, v + 5]);
  }
  for (let x = 0; x < w; x++) { t.mul(x, 26, 0.6); t.mul(x, 27, 0.8); }
  // pipes
  for (let x = 0; x < w; x++) {
    t.set(x, 33, [64, 56, 50]); t.set(x, 34, [48, 42, 38]); t.set(x, 35, [32, 28, 26]); t.mul(x, 36, 0.7);
    t.set(x, 44, [52, 52, 54]); t.set(x, 45, [34, 34, 36]);
    if (x % 32 === 12) { t.rect(x, 32, 2, 5, [70, 66, 60]); t.rect(x, 43, 2, 4, [62, 62, 64]); }
  }
  // dangling wires
  const wires = [[[6, 26], [10, 40], [9, 54]], [[40, 27], [43, 38], [48, 50], [47, 60]], [[22, 36], [26, 47], [24, 58]]];
  const wc = [[30, 30, 30], [80, 30, 26], [60, 60, 64]];
  wires.forEach((p, k) => { for (let s = 0; s + 1 < p.length; s++) line(p[s][0], p[s][1], p[s + 1][0], p[s + 1][1], (x, y) => t.set(x, y, wc[k])); });
  // insulation tufts
  for (let k = 0; k < 40; k++) { const x = t.ri(0, w - 1), y = t.ri(46, h - 1); t.set(x, y, [64 + R() * 14, 58 + R() * 10, 40]); }
});

def('ceiling_concrete', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, g = fbm(R, w, h, 2, 3, 0.5, 16), n = fbm(R, w, h, 4, 4), base = [152, 150, 144], bt = [];
  for (let k = 0; k < 4; k++) bt.push((R() - 0.5) * 0.08);
  t.each((x, y, o, i) => {
    const b = y >> 4, ly = y & 15;
    let f = 1 + bt[b] + (g[i] - 0.5) * 0.14 + (n[i] - 0.5) * 0.12 + (R() - 0.5) * 0.04;
    if (ly === 0) f *= 0.82; else if (ly === 1) f *= 1.06;
    o[0] = base[0] * f; o[1] = base[1] * f; o[2] = base[2] * f;
  });
  for (const [x, y] of [[16, 8], [48, 8], [16, 40], [48, 40]]) {
    t.rect(x, y, 2, 2, [70, 68, 64]); t.mul(x + 2, y + 1, 1.1); t.mul(x + 1, y + 2, 1.1);
    if (R() < 0.6) streak(t, x, y + 2, t.ri(5, 14), [136, 90, 54], 0.4, 1);
  }
  const wat = blobField(t, t.rf(0, w), t.rf(0, h), 16, 12, fbm(R, w, h, 8, 3), 0.45);
  tideStain(t, wat, { tint: [150, 132, 104], ring: [110, 92, 66], k: 0.3, ringK: 0.55, levels: [0, 0.3, 0.6] });
  for (let k = 0; k < 30; k++) t.mix(t.ri(0, w - 1), t.ri(0, h - 1), [214, 214, 206], 0.5);
});

def('stair_tread', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 4), base = [152, 148, 140];
  t.each((x, y, o, i) => {
    const cw = 1 - Math.abs(x - 32) / 32;
    if (y < 10) {
      let v = 44;
      if (y === 0) v = 70; else if (y === 9) v = 30; else v += ((y & 1) ? -8 : 8) * (1 - cw * 0.6);
      v += cw * 10 + (R() - 0.5) * 5;
      o[0] = v; o[1] = v; o[2] = v + 2; return;
    }
    let f = 1 + (n[i] - 0.5) * 0.16 + (R() - 0.5) * 0.06;
    if (y === 10) f *= 0.7;
    const back = sstep(30, 63, y) * 0.35, mid = cw * cw * 0.12;
    const c = mixc(mulc(base, f), [104, 96, 82], back);
    o[0] = c[0] + mid * 40; o[1] = c[1] + mid * 40; o[2] = c[2] + mid * 36;
  });
  // torn chunk of nosing showing the steel edge
  for (let x = 40; x < 47; x++) for (let y = 0; y < 3 + ((x * 7) % 3); y++) t.set(x, y, [118, 112, 104]);
  speckle(t, 0.03, 0.8, 0.9);
});

// ============================================================================
// OPENINGS
// ============================================================================
function brushed(t, base, vertical, amt = 10) {
  const { w, h } = t, a = vertical ? vnoise(t.rand, w, h, w, 2) : vnoise(t.rand, w, h, 2, h), b = vertical ? vnoise(t.rand, w, h, w / 4, 1) : vnoise(t.rand, w, h, 1, h / 4);
  base = col(base);
  const C = t.c, N = w * h, R = t.rand;
  for (let i = 0, j = 0; i < N; i++, j += 3) { const f = 1 + ((a[i] - 0.5) * amt + (b[i] - 0.5) * amt * 0.6 + (R() - 0.5) * 3) / 100; C[j] = base[0] * f; C[j + 1] = base[1] * f; C[j + 2] = base[2] * f; }
}
function scratches(t, n, x0, y0, x1, y1, c = [235, 235, 230], k = 0.35, horiz = false) {
  const kk = k * 0.75;
  for (let s = 0; s < n; s++) {
    const x = t.rf(x0, x1), y = t.rf(y0, y1), a = horiz ? t.rf(-0.25, 0.25) : t.rf(-0.6, 0.6) + (t.r() < 0.5 ? 0 : Math.PI / 2), len = t.ri(3, 9);
    line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, (px, py) => t.mix(px, py, c, kk));
  }
}
function kickPlate(t, x, y, w, h) {
  const R = t.rand;
  for (let yy = y; yy < y + h; yy++) { const rv = (R() - 0.5) * 10; for (let xx = x; xx < x + w; xx++) { const v = 156 + rv + (R() - 0.5) * 6; t.set(xx, yy, [v, v + 1, v + 2]); } }
  t.bevel(x, y, w, h, 1.25, 0.6);
  scratches(t, 10, x + 2, y + 2, x + w - 4, y + h - 3, [210, 212, 214], 0.5);
  scratches(t, 4, x + 2, y + 2, x + w - 4, y + h - 3, [80, 80, 80], 0.4);
  for (const [sx, sy] of [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]]) screw(t, sx, sy, [120, 120, 118]);
  for (let yy = y + h - 5; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) t.mix(xx, yy, [86, 78, 64], 0.12 * (yy - y - h + 6));
}
function doorPaint(t, base, grainAmt = 6) {
  const { w, h } = t, R = t.rand, s = vnoise(R, w, h, 32, 4), n = fbm(R, w, h, 4, 4);
  t.each((x, y, o, i) => {
    const f = 1 + ((s[i] - 0.5) * grainAmt + (n[i] - 0.5) * 10 + (R() - 0.5) * 3) / 100;
    o[0] = base[0] * f; o[1] = base[1] * f; o[2] = base[2] * f;
  });
  for (let y = 0; y < h; y++) { t.mul(0, y, 0.7); t.mul(1, y, 1.1); t.mul(w - 1, y, 0.62); t.mul(w - 2, y, 0.9); }
  for (let x = 1; x < w - 1; x++) { t.mul(x, 0, 1.15); t.mul(x, h - 1, 0.6); }
}
function grimeBand(t, y0, y1, c, amt) {
  const n = fbm(t.rand, t.w, t.h, 8, 3);
  t.each((x, y, o, i) => { if (y < y0) return false; const k = amt * sstep(y0, y1, y) * (0.5 + n[i]); o[0] = lerp(o[0], c[0], k); o[1] = lerp(o[1], c[1], k); o[2] = lerp(o[2], c[2], k); });
}
function handGrime(t, cx, cy, r, amt) {
  const n = fbm(t.rand, t.w, t.h, 8, 2);
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    const d = Math.hypot(x - cx, (y - cy) * 0.8) / r; if (d > 1) continue;
    t.mix(x, y, [70, 62, 50], amt * (1 - d) * (0.4 + n[t.idx(x, y)]));
  }
}
function edgeChips(t, n, c) {
  for (let k = 0; k < n; k++) {
    const left = t.r() < 0.5, x = left ? t.ri(0, 2) : t.w - 1 - t.ri(0, 2), y = t.ri(4, t.h - 4), len = t.ri(1, 4);
    for (let j = 0; j < len; j++) { t.set(x, y + j, c); if (t.r() < 0.5) t.set(x + (left ? 1 : -1), y + j, mulc(c, 0.9)); }
  }
}

def('door_wood', 64, 128, {}, (t) => {
  doorPaint(t, [108, 122, 134]);
  // vision panel: wired glass
  const wx = 21, wy = 16, ww = 13, wh = 44;
  for (let y = wy - 2; y < wy + wh + 2; y++) for (let x = wx - 2; x < wx + ww + 2; x++) {
    const v = 150 + (t.r() - 0.5) * 6; t.set(x, y, [v, v, v - 2]);
  }
  t.bevel(wx - 2, wy - 2, ww + 4, wh + 4, 1.25, 0.6);
  t.bevel(wx - 1, wy - 1, ww + 2, wh + 2, 0.7, 1.15);
  for (let y = wy; y < wy + wh; y++) for (let x = wx; x < wx + ww; x++) {
    const g = (y - wy) / wh, wire = (x - wx) % 4 === 1 || (y - wy) % 4 === 1;
    let c = [26 + g * 10, 32 + g * 10, 38 + g * 8];
    if (wire) c = addc(c, 22);
    const d = x - wx + (y - wy) * 0.35;
    if (d > 7 && d < 10.5) c = mixc(c, [92, 104, 112], 0.45);
    t.set(x, y, c);
  }
  // lever handle (right side, mid-height)
  const hx0 = 54, hy0 = 66;
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) { if (x * x + y * y > 10) continue; const v = 168 + (-x - y) * 9; t.set(hx0 + x, hy0 + y, [v, v, v - 4]); }
  for (let x = hx0 - 13; x <= hx0; x++) { t.set(x, hy0 - 1, [222, 222, 216]); t.set(x, hy0, [168, 168, 164]); t.set(x, hy0 + 1, [96, 96, 94]); t.mul(x + 1, hy0 + 2, 0.66); t.mul(x + 1, hy0 + 3, 0.85); }
  t.set(hx0 - 13, hy0 - 1, [190, 190, 186]); t.set(hx0 - 14, hy0, [130, 130, 128]);
  t.rect(hx0 - 1, hy0 + 8, 3, 3, [150, 150, 146]); t.set(hx0, hy0 + 9, [30, 30, 30]); t.bevel(hx0 - 1, hy0 + 8, 3, 3, 1.2, 0.6);
  handGrime(t, hx0 - 4, hy0 + 2, 11, 0.4);
  kickPlate(t, 3, 104, 58, 20);
  // trolley scuffs
  for (let k = 0; k < 9; k++) { const x = t.ri(4, 56), y = t.ri(84, 102), l = t.ri(2, 7); for (let j = 0; j < l; j++) t.mix(x + j, y, [60, 58, 56], 0.3); }
  edgeChips(t, 8, [146, 108, 70]);
  scratches(t, 6, 4, 70, 60, 100, [170, 176, 180], 0.3, true);
  grimeBand(t, 90, 128, [70, 64, 52], 0.25);
});

def('door_double', 64, 128, {}, (t) => {
  doorPaint(t, [152, 174, 150], 3);
  speckle(t, 0.1, 0.94, 1.0);
  // steel edge guard on the meeting edge
  for (let y = 0; y < 128; y++) { t.set(62, y, [176, 178, 178]); t.set(63, y, [110, 112, 112]); }
  // porthole
  const cx = 31.5, cy = 34.5;
  for (let y = 18; y < 52; y++) for (let x = 14; x < 50; x++) {
    const dx = x + 0.5 - cx - 0.5, dy = y + 0.5 - cy - 0.5, d = Math.hypot(dx, dy);
    if (d > 13) continue;
    if (d > 10.2) { const lit = -(dx + dy) / d; const v = 132 + lit * 60 * (d > 11.6 ? 1 : -0.6); t.set(x, y, [v, v + 2, v + 2]); continue; }
    const g = (dy + 10) / 20;
    let c = [24 + g * 12, 30 + g * 12, 36 + g * 10];
    const dd = dx + dy;
    if (dd > -9 && dd < -6.5 && Math.abs(dx - dy) < 7) c = mixc(c, [104, 116, 124], 0.55);
    if (dd > -4.5 && dd < -3.5 && Math.abs(dx - dy) < 4) c = mixc(c, [80, 92, 100], 0.5);
    t.set(x, y, c);
  }
  // push plate
  kickPlate(t, 42, 58, 14, 26);
  handGrime(t, 49, 70, 12, 0.35);
  kickPlate(t, 2, 100, 58, 24);
  // rubber bumper strip at gurney height
  for (let x = 0; x < 62; x++) { t.set(x, 92, [70, 70, 68]); t.set(x, 93, [46, 46, 46]); t.set(x, 94, [34, 34, 34]); t.mul(x, 95, 0.7); }
  for (let k = 0; k < 10; k++) { const x = t.ri(2, 56), y = t.ri(80, 98), l = t.ri(2, 8); for (let j = 0; j < l; j++) t.mix(x + j, y + (j >> 2), [70, 66, 60], 0.35); }
  scratches(t, 7, 4, 60, 40, 98, [196, 210, 196], 0.35, true);
  grimeBand(t, 84, 128, [80, 74, 60], 0.25);
});

def('door_metal', 64, 128, {}, (t) => {
  const { w, h } = t, R = t.rand;
  doorPaint(t, [124, 128, 130], 4);
  // embossed panel
  for (let x = 6; x < 58; x++) { t.mul(x, 6, 1.2); t.mul(x, 121, 0.7); t.mul(x, 7, 0.85); t.mul(x, 120, 1.1); }
  for (let y = 6; y < 122; y++) { t.mul(6, y, 1.2); t.mul(57, y, 0.7); t.mul(7, y, 0.85); t.mul(56, y, 1.1); }
  // dents (concave: upper-left dark, lower-right light)
  for (let k = 0; k < 5; k++) {
    const cx = t.rf(10, 54), cy = t.rf(20, 116), r = t.rf(3, 7);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy); if (d > r) continue;
      t.mul(x, y, 1 + ((dx + dy) / r) * (1 - d / r) * 0.35);
    }
  }
  // push bar
  for (const bx of [6, 51]) { for (let y = 58; y < 72; y++) for (let x = bx; x < bx + 7; x++) t.set(x, y, [62, 64, 66]); t.bevel(bx, 58, 7, 14, 1.35, 0.6); }
  for (let x = 13; x < 51; x++) { t.set(x, 62, [196, 196, 192]); t.set(x, 63, [168, 168, 164]); t.set(x, 64, [140, 140, 136]); t.set(x, 65, [98, 98, 96]); t.mul(x, 66, 0.6); t.mul(x, 67, 0.82); }
  handGrime(t, 32, 64, 14, 0.3);
  // rust: from hinges (left edge), top, bar ends and bottom
  for (const y of [16, 62, 106]) { t.rect(0, y, 2, 6, [92, 70, 52]); streak(t, 1, y + 6, t.ri(10, 26), [140, 74, 34], 0.55, 2); }
  for (let k = 0; k < 6; k++) streak(t, t.ri(4, 58), t.ri(0, 4), t.ri(10, 50), [146, 80, 38], t.rf(0.25, 0.5), t.ri(1, 3));
  streak(t, 8, 72, 18, [146, 80, 38], 0.4, 2); streak(t, 54, 72, 24, [146, 80, 38], 0.45, 2);
  const rn = fbm(R, w, h, 8, 3);
  t.each((x, y, o, i) => { const k = sstep(104, 128, y) * clamp((rn[i] - 0.35) * 2, 0, 1) * 0.75; o[0] = lerp(o[0], 128, k); o[1] = lerp(o[1], 70, k); o[2] = lerp(o[2], 36, k); });
  scratches(t, 9, 6, 10, 58, 118, [190, 190, 186], 0.4);
  // stencilled number
  bmText(t, 'B-07', 18, 12, F57, [220, 216, 200], { mix: 0.65 });
});

def('elevator_door', 64, 128, {}, (t) => {
  const { w, h } = t;
  brushed(t, [178, 180, 184], true, 12);
  t.each((x, y, o) => { const f = 1 + Math.sin((y / h) * Math.PI * 1.6 + 0.4) * 0.07 - sstep(70, 110, y) * 0.12; o[0] *= f; o[1] *= f; o[2] *= f; });
  for (let y = 0; y < h; y++) { t.set(62, y, [40, 40, 40]); t.set(63, y, [28, 28, 28]); t.mul(0, y, 0.7); t.mul(61, y, 0.85); }
  for (let x = 0; x < w; x++) { t.mul(x, 0, 0.6); t.mul(x, 1, 1.15); t.mul(x, h - 1, 0.5); }
  scratches(t, 14, 2, 10, 60, 120, [236, 238, 240], 0.4);
  scratches(t, 6, 2, 10, 60, 120, [96, 98, 102], 0.35);
  // keyed scratch-tag
  const p = sfLayout('KR', 14, 50, 1.6, { rand: t.rand, jit: 0.25, slant: 0.2 });
  walkPolys(p, 0.5, (x, y) => t.mix(x, y, [230, 232, 234], 0.6));
  handGrime(t, 56, 64, 12, 0.35);
  grimeBand(t, 96, 128, [92, 84, 70], 0.55);
});

function windowFrame(t) {
  const fr = (x, y, w, h) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const v = 58 + (t.r() - 0.5) * 8; t.set(xx, yy, [v, v + 2, v + 2]); }
  };
  fr(0, 0, 64, 4); fr(0, 60, 64, 4); fr(0, 0, 4, 64); fr(60, 0, 4, 64); fr(30, 0, 4, 64); fr(0, 30, 64, 4);
  for (const [x, y, w, h] of [[0, 0, 64, 64], [4, 4, 26, 26], [34, 4, 26, 26], [4, 34, 26, 26], [34, 34, 26, 26]]) {
    if (w === 64) t.bevel(x, y, w, h, 1.5, 0.6);
    else { // inner rebate: top/left edges of the opening are shadowed by frame, bottom/right lit
      for (let xx = x - 1; xx <= x + w; xx++) { t.mul(xx, y - 1, 0.65); t.mul(xx, y + h, 1.45); }
      for (let yy = y; yy < y + h; yy++) { t.mul(x - 1, yy, 0.65); t.mul(x + w, yy, 1.45); }
    }
  }
  // rust and flaking paint on the frame
  for (let k = 0; k < 26; k++) {
    const x = t.ri(0, 63), y = t.ri(0, 63);
    if (t.a[t.idx(x, y)] === 0) continue;
    t.mix(x, y, [134, 72, 38], 0.6);
    if (t.r() < 0.4) t.mix(x, y + 1, [120, 66, 36], 0.4);
  }
}
const PANES = [[4, 4], [34, 4], [4, 34], [34, 34]];
function glassCol(t, x, y) { const v = (t.r() - 0.5) * 10; return [168 + v + y * 0.3, 184 + v, 192 + v]; }

def('window_broken', 64, 64, { alpha: true }, (t) => {
  windowFrame(t);
  const W = 26;
  // shards along frame edges of 3 panes
  for (let p = 0; p < 4; p++) {
    const [px, py] = PANES[p];
    if (p === 1) { // cracked-but-intact pane: 50% checker + opaque crack lines
      const ix = px + 9, iy = py + 15;
      for (let y = py; y < py + W; y++) for (let x = px; x < px + W; x++) if (((x + y) & 1) === 0) t.set(x, y, glassCol(t, x - px, y - py));
      const cm = new Uint8Array(64 * 64);
      for (let k = 0; k < 7; k++) {
        let a = (k / 7) * TAU + t.rf(-0.3, 0.3), x = ix, y = iy;
        for (let s = 0; s < 22; s++) { a += t.rf(-0.25, 0.25); x += Math.cos(a); y += Math.sin(a); if (x < px || y < py || x >= px + W || y >= py + W) break; cm[Math.floor(y) * 64 + Math.floor(x)] = 1; }
      }
      for (const rr of [3, 6.5]) for (let a = 0; a < TAU; a += 0.08) { if (Math.sin(a * 3 + rr) > 0.3) continue; const x = ix + Math.cos(a) * rr, y = iy + Math.sin(a) * rr; if (x >= px && y >= py && x < px + W && y < py + W) cm[Math.floor(y) * 64 + Math.floor(x)] = 1; }
      t.paint(cm, [226, 236, 238]);
      continue;
    }
    if (p === 3) { // nearly empty pane: a few small teeth
      for (let k = 0; k < 3; k++) { const x = px + t.ri(2, 20); const m = polyMask(64, 64, [x, py, x + 4, py, x + 2, py + t.ri(3, 5)]); t.paintFn(m, (x2, y2, o) => { const c = glassCol(t, 0, 0); o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; }); }
      continue;
    }
    const pts = [];
    const edge = (x0, y0, dx, dy, nx, ny) => { // walk along an edge emitting jagged teeth
      let s = 0;
      while (s < W) {
        const len = t.ri(3, 9), dep = t.r() < 0.25 ? t.ri(8, 14) : t.ri(2, 6), mid = s + t.rf(0.2, 0.8) * len;
        pts.push([x0 + dx * s, y0 + dy * s, x0 + dx * mid + nx * dep, y0 + dy * mid + ny * dep, x0 + dx * Math.min(W, s + len), y0 + dy * Math.min(W, s + len)]);
        s += len + (t.r() < 0.35 ? t.ri(2, 6) : 0);
      }
    };
    edge(px, py, 1, 0, 0, 1); edge(px, py, 0, 1, 1, 0);
    if (p === 0) edge(px, py + W, 1, 0, 0, -1); else edge(px + W, py, 0, 1, -1, 0);
    for (const tri of pts) {
      const m = polyMask(64, 64, tri);
      t.paintFn(m, (x, y, o) => { const c = glassCol(t, x - px, y - py); o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; });
      line(tri[2], tri[3], tri[4], tri[5], (x, y) => { if (t.al(x, y)) t.mix(x, y, [80, 92, 98], 0.6); });
      line(tri[0], tri[1], tri[2], tri[3], (x, y) => { if (t.al(x, y)) t.mix(x, y, [236, 244, 246], 0.6); });
    }
  }
  windowFrame(t); // frame drawn on top again so shard bases tuck under it
});

def('window_dirty', 64, 64, { alpha: true }, (t) => {
  const n = fbm(t.rand, 64, 64, 8, 3), st = vnoise(t.rand, 64, 64, 16, 2);
  for (const [px, py] of PANES) for (let y = py; y < py + 26; y++) for (let x = px; x < px + 26; x++) {
    const ly = y - py, lx = x - px, corner = Math.min(lx, 25 - lx);
    const dirt = clamp((n[y * 64 + x] - 0.4) * 1.4 + sstep(16, 25, ly) * 0.6 + (corner < 3 ? 0.3 : 0) + (st[y * 64 + x] - 0.5) * 0.5, 0, 1);
    const solid = ly > 21 && (n[y * 64 + x] + (corner < 4 ? 0.3 : 0)) > 0.62;
    if (!solid && ((x + y) & 1)) continue;
    const c = mixc(glassCol(t, lx, ly), [112, 104, 86], dirt * 0.75);
    t.set(x, y, c);
  }
  windowFrame(t);
});

def('sky_night', 128, 64, {}, (t) => {
  const { w, h } = t, R = t.rand;
  t.each((x, y, o) => { const g = y / h; o[0] = lerp(8, 30, g * g); o[1] = lerp(10, 38, g * g); o[2] = lerp(24, 64, g); });
  for (let k = 0; k < 34; k++) { const x = t.ri(0, w - 1), y = t.ri(0, 34), v = t.rf(120, 220); t.set(x, y, [v, v, v + 10]); if (R() < 0.12) { t.mix(x + 1, y, [v, v, v], 0.4); t.mix(x, y + 1, [v, v, v], 0.4); } }
  // moon + dithered halo
  const mx = 96, my = 14;
  for (let y = 0; y < 34; y++) for (let x = 70; x < 122; x++) {
    const d = Math.hypot(x + 0.5 - mx, y + 0.5 - my);
    if (d < 6) { const sh = (x - mx + y - my) * 3; t.set(x, y, [214 - sh, 216 - sh, 200 - sh]); if (R() < 0.12) t.mul(x, y, 0.9); }
    else if (d < 15) { const a = (1 - (d - 6) / 9) * 0.7; if (a > bayer(x, y)) t.mix(x, y, [60, 70, 100], 0.6); }
  }
  // silhouettes
  const sil = [6, 6, 8], ground = cmask(w, h, (c) => {
    c.beginPath(); c.moveTo(0, 56); for (let x = 0; x <= w; x += 8) c.lineTo(x, 55 + Math.sin(x * 0.07) * 2); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
    // fence: posts and rails
    c.fillRect(0, 47, w, 1); c.fillRect(0, 52, w, 1);
    for (let x = 2; x < w; x += 7) c.fillRect(x, 45, 1, 12);
    // lamppost
    c.fillRect(80, 30, 2, 27); c.fillRect(80, 30, 7, 2); c.fillRect(85, 31, 3, 3);
  });
  t.paint(ground, sil);
  const tm = new Uint8Array(w * h);
  const branch = (x, y, a, len, wdt, d) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    stampPolys(tm, w, h, [[x, y, x2, y2]], wdt);
    if (d <= 0) return;
    const n = d > 2 ? 2 : t.ri(2, 3);
    for (let k = 0; k < n; k++) branch(x2, y2, a + t.rf(-0.7, 0.7), len * t.rf(0.55, 0.8), Math.max(0.4, wdt * 0.65), d - 1);
  };
  branch(18, 60, -Math.PI / 2 - 0.08, 15, 1.6, 5);
  branch(44, 60, -Math.PI / 2 + 0.12, 11, 1.2, 4);
  branch(116, 60, -Math.PI / 2 - 0.2, 13, 1.4, 5);
  t.paint(tm, sil);
  t.set(86, 34, [120, 110, 70]); // a dead lamp head glint
});

def('boards', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, g = fbm(R, w, h, 2, 4, 0.5, 32), n = fbm(R, w, h, 4, 3);
  const edges = [0, 15, 31, 46, 64], tone = [], joint = [];
  for (let k = 0; k < 4; k++) { tone.push((R() - 0.5) * 0.18); joint.push(t.ri(4, 60)); }
  t.each((x, y, o, i) => {
    let p = 0; while (y >= edges[p + 1]) p++;
    const ly = y - edges[p], ph = edges[p + 1] - edges[p];
    let f = 1 + tone[p] + (g[(y * w + ((x + p * 17) % w))] - 0.5) * 0.4 + (R() - 0.5) * 0.04;
    if (ly === 0) f *= 1.15; else if (ly === ph - 1) f *= 0.42; else if (ly === ph - 2) f *= 0.8;
    const jx = joint[p];
    if (x === jx) f *= 0.45; else if (x === jx + 1) f *= 1.12;
    let c = mixc([132, 114, 92], [128, 126, 118], clamp((n[i] - 0.3) * 1.5, 0, 1) * 0.6);
    c = mulc(c, f);
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  });
  for (let p = 0; p < 4; p++) {
    const jx = joint[p], y0 = edges[p] + 4, y1 = edges[p + 1] - 5;
    for (const nx of [jx - 3, jx + 4]) for (const ny of [y0, y1]) { t.set(nx, ny, [96, 92, 88]); t.set(nx + 1, ny, [70, 66, 62]); t.set(nx, ny + 1, [54, 50, 46]); t.set(nx + 1, ny + 1, [40, 38, 36]); streak(t, nx, ny + 2, t.ri(3, 9), [110, 66, 36], 0.45); }
    // knots / splits
    const kx = t.ri(0, 63), ky = edges[p] + t.ri(4, 10);
    t.mix(kx, ky, [70, 52, 36], 0.7); t.mix(kx + 1, ky, [86, 64, 44], 0.6);
    for (let j = 0; j < t.ri(4, 12); j++) t.mul(kx + 3 + j, ky + 1, 0.7);
  }
});

// ============================================================================
// LIGHT FIXTURES
// ============================================================================
function troffer(t, lit) {
  const { w, h } = t, R = t.rand;
  t.each((x, y, o) => {
    if (x < 3 || y < 3 || x > w - 4 || y > h - 4) {
      const v = lit ? 196 : 172;
      const f = x === 0 || y === 0 ? 1.12 : x === w - 1 || y === h - 1 ? 0.7 : (x === 2 || y === 2 || x === w - 3 || y === h - 3) ? 0.62 : 1;
      o[0] = v * f; o[1] = v * f; o[2] = (v - 4) * f; return;
    }
    const pr = ((x >> 1) + (y >> 1)) & 1 ? 1 : -1;
    if (lit) {
      let v = 212 + pr * 7;
      const tb = Math.min(Math.abs(y - 10.5), Math.abs(y - 20.5));
      v += Math.max(0, 3.5 - tb) * 12;
      if (x < 6 || x > w - 7) v -= 14;
      o[0] = v; o[1] = v + 3; o[2] = v - 1;
    } else {
      let v = 148 + pr * 6 + (R() - 0.5) * 4;
      const tb = Math.min(Math.abs(y - 10.5), Math.abs(y - 20.5));
      if (tb < 2) { v -= 14; if (x < 10 || x > w - 11) v -= Math.max(0, 40 - Math.min(x - 3, w - 4 - x) * 6); }
      o[0] = v; o[1] = v; o[2] = v - 6;
    }
  });
  // centre seam of the lens
  for (let y = 3; y < h - 3; y++) t.mul(32, y, lit ? 0.96 : 0.86);
}
def('fluoro_on', 64, 32, {}, (t) => troffer(t, true));
def('fluoro_off', 64, 32, {}, (t) => {
  troffer(t, false);
  const n = fbm(t.rand, 64, 32, 4, 3);
  t.each((x, y, o, i) => { if (x < 3 || y < 3 || x > 60 || y > 28) return false; const k = clamp((n[i] - 0.4) * 1.2, 0, 1) * 0.35; o[0] = lerp(o[0], 150, k); o[1] = lerp(o[1], 136, k); o[2] = lerp(o[2], 96, k); });
  line(36, 3, 48, 28, (x, y) => { t.mul(x, y, 0.5); t.mul(x + 1, y, 1.15); });
  line(42, 15, 56, 11, (x, y) => t.mul(x, y, 0.6));
  for (let k = 0; k < 22; k++) { const x = t.ri(4, 26), y = t.ri(22, 27); t.set(x, y, [36, 32, 28]); if (t.r() < 0.4) t.set(x + 1, y, [52, 46, 40]); }
});

// ============================================================================
// PROP SURFACES
// ============================================================================
def('metal_steel', 64, 64, { tile: true }, (t) => {
  brushed(t, [168, 170, 174], false, 12);
  const n = fbm(t.rand, 64, 64, 4, 3);
  t.each((x, y, o, i) => { const k = clamp((n[i] - 0.55) * 2, 0, 1) * 0.2; o[0] = lerp(o[0], 120, k); o[1] = lerp(o[1], 118, k); o[2] = lerp(o[2], 112, k); });
  scratches(t, 10, 0, 0, 64, 64, [228, 230, 232], 0.45, true);
  scratches(t, 4, 0, 0, 64, 64, [100, 100, 104], 0.35, true);
});

def('metal_painted', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 3), base = [214, 208, 188];
  t.each((x, y, o, i) => { const f = 1 + (n[i] - 0.5) * 0.08 + (R() - 0.5) * 0.03; o[0] = base[0] * f; o[1] = base[1] * f; o[2] = base[2] * f; });
  grime(t, fbm(R, w, h, 8, 3), [140, 128, 100], 0.4, 0.5);
  const cn = fbm(R, w, h, 16, 2);
  for (let k = 0; k < 12; k++) {
    const F = blobField(t, t.rf(0, w), t.rf(0, h), t.rf(1.2, 4), t.rf(1, 3), cn, 0.5);
    t.each((x, y, o, i) => {
      const v = F[i]; if (v < -0.25) return false;
      if (v > 0.15) { o[0] = 66; o[1] = 62; o[2] = 60; if (R() < 0.3) { o[0] = 120; o[1] = 66; o[2] = 36; } }
      else if (v > 0) { o[0] = 138; o[1] = 76; o[2] = 40; }
      else { o[0] *= 1.06; o[1] *= 1.06; o[2] *= 1.06; }
    });
  }
  for (let k = 0; k < 5; k++) { const x = t.ri(0, w - 1), y = t.ri(0, h - 1); t.set(x, y, [130, 70, 36]); streak(t, x, y + 1, t.ri(4, 12), [150, 90, 50], 0.4); }
});

function rustBase(t, coverage = 1) {
  const { w, h } = t, R = t.rand, n = norm(fbm(R, w, h, 4, 5, 0.6)), v = voronoi(R, w, h, 34);
  const ramp = [[58, 36, 26], [100, 52, 28], [146, 78, 38], [176, 108, 58]];
  const ct = []; for (let k = 0; k < v.n; k++) ct.push((R() - 0.5) * 0.25);
  t.each((x, y, o, i) => {
    let s = clamp(n[i] * 1.1 + ct[v.id[i]] + (R() - 0.5) * 0.12, 0, 0.999) * 3;
    const a = Math.floor(s), f = s - a, c = mixc(ramp[a], ramp[Math.min(3, a + 1)], f);
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    if (v.d2[i] - v.d1[i] < 0.7 && n[i] > 0.4) { o[0] *= 0.78; o[1] *= 0.78; o[2] *= 0.78; }
    if (coverage < 1 && n[i] < 1 - coverage) { const g = 96 + (R() - 0.5) * 10; o[0] = g; o[1] = g - 2; o[2] = g - 4; }
  });
  for (let k = 0; k < 70; k++) { const x = t.ri(0, w - 1), y = t.ri(0, h - 1); t.mul(x, y, 0.45); t.mul(x + 1, y + 1, 1.25); }
}
def('metal_rust', 64, 64, { tile: true }, (t) => rustBase(t, 0.88));

def('metal_green', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 4), base = [58, 86, 62];
  t.each((x, y, o, i) => { const f = 1 + (n[i] - 0.5) * 0.2 + (R() - 0.5) * 0.05; o[0] = base[0] * f; o[1] = base[1] * f; o[2] = base[2] * f; });
  for (let x = 0; x < w; x++) { t.mul(x, 0, 0.55); t.mul(x, 1, 1.25); }
  for (let y = 0; y < h; y++) { t.mul(0, y, 0.55); t.mul(1, y, 1.2); }
  for (let x = 5; x < w; x += 8) for (const y of [5, 59]) {
    t.set(x, y, [108, 136, 110]); t.set(x + 1, y, [80, 110, 84]); t.set(x, y + 1, [64, 92, 68]); t.set(x + 1, y + 1, [38, 54, 40]); t.mul(x + 2, y + 2, 0.7);
    if (R() < 0.55) streak(t, x, y + 2, t.ri(4, 14), [136, 78, 40], t.rf(0.35, 0.6), t.r() < 0.5 ? 1 : 2);
  }
  for (let k = 0; k < 10; k++) { const x = t.ri(0, w - 1), y = t.ri(0, h - 1), r = t.ri(1, 2); for (let yy = 0; yy < r; yy++) for (let xx = 0; xx < r + 1; xx++) t.set(x + xx, y + yy, t.r() < 0.5 ? [44, 42, 40] : [130, 72, 38]); }
  grime(t, fbm(R, w, h, 8, 3), [40, 40, 30], 0.4, 0.5);
});

def('pipe_lagging', 64, 64, { tile: true }, (t) => {
  // bands run vertically (rings around a pipe whose length runs along u)
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 3), base = [214, 208, 192];
  t.each((x, y, o, i) => {
    let f = 1 + (((x + y) & 1) ? 0.03 : -0.03) + (n[i] - 0.5) * 0.1 + (R() - 0.5) * 0.04;
    const b = x & 15;
    if (b === 0) f *= 0.62; else if (b === 1) f *= 0.85; else if (b === 2) f *= 1.06; else if (b === 15) f *= 0.82;
    o[0] = base[0] * f; o[1] = base[1] * f; o[2] = base[2] * f;
  });
  grime(t, fbm(R, w, h, 4, 4), [140, 120, 86], 0.55, 0.45);
  const F = blobField(t, t.rf(0, w), t.rf(0, h), 10, 14, fbm(R, w, h, 8, 3), 0.4);
  tideStain(t, F, { tint: [178, 150, 104], ring: [130, 100, 62], k: 0.3, ringK: 0.5, levels: [0, 0.35] });
});

def('mattress', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 3);
  const blue = [116, 132, 154], white = [210, 208, 196];
  t.each((x, y, o, i) => {
    const s = x & 7, isB = s < 2 || s === 5;
    let c = isB ? blue : white;
    let f = 1 + ((x + y) % 3 === 0 ? -0.04 : 0.01) + (n[i] - 0.5) * 0.1;
    c = mixc(c, [190, 184, 166], 0.2);
    o[0] = c[0] * f; o[1] = c[1] * f; o[2] = c[2] * f;
  });
  for (const [bx, by] of [[16, 16], [48, 48], [48, 16], [16, 48]]) {
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) { const d = Math.hypot(x, y); if (d > 4) continue; t.mul(bx + x, by + y, 1 + ((x + y) / 4) * (1 - d / 4) * 0.25); }
    t.set(bx, by, [70, 70, 76]); t.set(bx - 1, by - 1, [96, 96, 100]);
  }
  const sn = fbm(R, w, h, 8, 3), F = new Float32Array(w * h).fill(-9);
  blobField(t, t.rf(0, w), t.rf(0, h), 14, 11, sn, 0.4, F);
  blobField(t, t.rf(0, w), t.rf(0, h), 8, 9, sn, 0.4, F);
  blobField(t, t.rf(0, w), t.rf(0, h), 5, 4, sn, 0.3, F);
  tideStain(t, F, { tint: [184, 150, 84], ring: [128, 92, 46], k: 0.5, ringK: 0.6, levels: [0, 0.25, 0.5] });
  grime(t, fbm(R, w, h, 4, 3), [120, 110, 90], 0.3, 0.5);
});

function heightShade(t, H, k, base) {
  t.each((x, y, o, i) => {
    const dx = H[t.idx(x + 1, y)] - H[t.idx(x - 1, y)], dy = H[t.idx(x, y + 1)] - H[t.idx(x, y - 1)];
    const f = 1 + (dx + dy) * -k + (H[i] - 0.5) * 0.15;
    o[0] = base[0] * f; o[1] = base[1] * f; o[2] = base[2] * f;
  });
}
def('sheet', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, a = fbm(R, w, h, 2, 3, 0.5), b = fbm(R, w, h, 4, 2);
  const H = new Float32Array(w * h);
  for (let i = 0; i < H.length; i++) H[i] = a[i] * 0.7 + Math.abs(b[i] - 0.5) * 0.9;
  heightShade(t, H, 1.9, [206, 202, 190]);
  const n = fbm(R, w, h, 8, 3);
  grime(t, n, [176, 160, 120], 0.45, 0.5);
  speckle(t, 0.04, 0.9, 0.96);
  const F = blobField(t, t.rf(0, w), t.rf(0, h), 7, 5, n, 0.35);
  tideStain(t, F, { tint: [190, 168, 120], ring: [150, 120, 80], k: 0.35, ringK: 0.4, levels: [0, 0.4] });
});

def('curtain', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 3), p1 = R() * TAU, p2 = R() * TAU, base = [150, 184, 170];
  t.each((x, y, o, i) => {
    const u = (x / w) * TAU, fold = Math.sin(u * 3 + p1) * 0.55 + Math.sin(u * 5 + p2) * 0.3 + Math.sin(u * 8) * 0.15;
    let f = 1 + fold * 0.13 + (n[i] - 0.5) * 0.06 + (R() - 0.5) * 0.03;
    const px = x & 7, py = y & 7;
    if ((px === 3 && (py === 2 || py === 4)) || (py === 3 && (px === 2 || px === 4))) f *= 1.08;
    if ((x + y) & 1) f *= 1.015;
    o[0] = base[0] * f; o[1] = base[1] * f; o[2] = base[2] * f;
  });
  grime(t, fbm(R, w, h, 4, 3), [118, 128, 108], 0.35, 0.55);
});

function woodGrain(t, base, o = {}) {
  const { w, h } = t, R = t.rand, warp = fbm(R, w, h, 2, 3, 0.5, 4), st = fbm(R, w, h, 2, 3, 0.5, 32), n = fbm(R, w, h, 4, 3);
  const k = o.rings || 5, con = o.contrast ?? 1;
  base = col(base);
  t.each((x, y, c, i) => {
    const ring = Math.sin(((y + warp[i] * 22) / h) * TAU * k);
    let f = 1 + (st[i] - 0.5) * 0.22 * con + (ring > 0.82 ? -0.13 * con : ring * 0.03) + (n[i] - 0.5) * 0.08 + (R() - 0.5) * 0.03;
    c[0] = base[0] * f; c[1] = base[1] * f; c[2] = base[2] * f;
  });
}
def('wood_desk', 64, 64, { tile: true }, (t) => {
  woodGrain(t, [194, 158, 110], { rings: 6 });
  const wear = fbm(t.rand, 64, 64, 2, 3);
  t.each((x, y, o, i) => { const k = sstep(0.55, 0.8, wear[i]) * 0.35; o[0] = lerp(o[0], 186, k); o[1] = lerp(o[1], 172, k); o[2] = lerp(o[2], 148, k); });
  scratches(t, 8, 0, 0, 64, 64, [226, 206, 170], 0.45, true);
  scratches(t, 4, 0, 0, 64, 64, [90, 66, 44], 0.4, true);
});
def('wood_dark', 64, 64, { tile: true }, (t) => {
  woodGrain(t, [90, 58, 38], { rings: 7, contrast: 1.4 });
  const s = vnoise(t.rand, 64, 64, 2, 16);
  t.each((x, y, o, i) => { const k = sstep(0.62, 0.8, s[i]) * 0.18; o[0] = lerp(o[0], 150, k); o[1] = lerp(o[1], 120, k); o[2] = lerp(o[2], 96, k); });
  scratches(t, 8, 0, 0, 64, 64, [150, 116, 84], 0.5, true);
});

def('cardboard', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 3), base = [178, 142, 98];
  t.each((x, y, o, i) => {
    let f = 1 + (n[i] - 0.5) * 0.1 + (R() - 0.5) * 0.05;
    if ((x & 3) === 0) f *= 0.96; else if ((x & 3) === 2) f *= 1.03;
    o[0] = base[0] * f; o[1] = base[1] * f; o[2] = base[2] * f;
  });
  // faded print
  bmText(t, 'FRAGILE', 10, 8, F57, [100, 58, 40], { mix: 0.38 });
  for (const ax of [40, 50]) { const m = polyMask(w, h, [ax, 42, ax + 4, 47, ax + 2, 47, ax + 2, 54, ax - 2, 54, ax - 2, 47, ax - 4, 47]); t.each((x, y, o, i) => { if (!m[i]) return false; o[0] = lerp(o[0], 100, 0.35); o[1] = lerp(o[1], 60, 0.35); o[2] = lerp(o[2], 42, 0.35); }); }
  bmText(t, 'THIS SIDE UP', 6, 57, F35, [100, 58, 40], { mix: 0.32 });
  // tape strip
  for (let y = 24; y < 36; y++) for (let x = 0; x < w; x++) {
    let f = y === 24 ? 0.85 : y === 35 ? 0.75 : 1.0;
    f *= 1 + (Math.sin(x * 0.7 + y * 0.2) > 0.85 ? 0.08 : 0) + (R() - 0.5) * 0.03;
    const c = t.get(x, y);
    t.set(x, y, mulc(mixc(c, [214, 182, 128], 0.45), f));
  }
  grime(t, fbm(R, w, h, 8, 3), [120, 92, 60], 0.35, 0.55);
  const F = blobField(t, t.rf(0, w), 58, 14, 8, n, 0.4);
  tideStain(t, F, { tint: [150, 112, 70], ring: [110, 76, 46], k: 0.3, ringK: 0.5, levels: [0, 0.35] });
});

function vinyl(t, base, back) {
  const { w, h } = t, R = t.rand, v = voronoi(R, w, h, 46), sh = fbm(R, w, h, 4, 3), cn = fbm(R, w, h, 8, 2), ct = [];
  for (let k = 0; k < v.n; k++) ct.push([(R() - 0.5) * 0.12, R() * TAU]);
  t.each((x, y, o, i) => {
    const c = ct[v.id[i]];
    let dx = x + 0.5 - v.px[v.id[i]], dy = y + 0.5 - v.py[v.id[i]];
    dx -= Math.round(dx / w) * w; dy -= Math.round(dy / h) * h;
    let f = 1 + c[0] + (sh[i] - 0.5) * 0.3 - (dx + dy) * 0.006 + (R() - 0.5) * 0.03;
    const e = v.d2[i] - v.d1[i];
    const cracked = cn[i] > 0.42;
    if (e < 0.55 && cracked) { o[0] = back[0]; o[1] = back[1]; o[2] = back[2]; return; }
    if (e < 0.9) f *= cracked ? 0.7 : 0.88;
    else if (e < 1.8 && cracked) f *= 1.1;
    o[0] = base[0] * f; o[1] = base[1] * f; o[2] = base[2] * f;
  });
  // sheen
  const s = fbm(R, w, h, 2, 2);
  t.each((x, y, o, i) => { const k = sstep(0.6, 0.75, s[i]) * 0.15; o[0] = lerp(o[0], 220, k); o[1] = lerp(o[1], 220, k); o[2] = lerp(o[2], 220, k); });
}
def('vinyl_teal', 64, 64, { tile: true }, (t) => vinyl(t, [58, 118, 114], [176, 164, 136]));
def('vinyl_black', 64, 64, { tile: true }, (t) => vinyl(t, [44, 44, 46], [116, 110, 98]));

def('rubber', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 3);
  t.each((x, y, o, i) => {
    let v = 40 + (n[i] - 0.5) * 10 + (R() - 0.5) * 5;
    const a = (x + y) & 7, b = (x - y + 64) & 7;
    if (a === 0 || b === 0) v += 14; else if (a === 1 || b === 1) v -= 6;
    o[0] = v; o[1] = v; o[2] = v + 1;
  });
  grime(t, fbm(R, w, h, 8, 3), [110, 104, 92], 0.35, 0.55);
});

def('chrome', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, s = vnoise(R, w, h, 2, 64);
  const prof = (y) => {
    const g1 = Math.exp(-Math.pow(Math.min(Math.abs(y - 18), h - Math.abs(y - 18)) / 3.2, 2));
    const g2 = Math.exp(-Math.pow(Math.min(Math.abs(y - 46), h - Math.abs(y - 46)) / 5, 2));
    const dark = Math.exp(-Math.pow(Math.min(Math.abs(y - 32), h - Math.abs(y - 32)) / 6, 2));
    return 128 + g1 * 120 + g2 * 46 - dark * 46;
  };
  t.each((x, y, o, i) => { const v = prof(y) + (s[i] - 0.5) * 14 + (R() - 0.5) * 4; o[0] = v; o[1] = v + 2; o[2] = v + 6; });
  for (let k = 0; k < 18; k++) { const x = t.ri(0, w - 1), y = t.ri(0, h - 1); t.mix(x, y, [110, 78, 52], 0.5); }
  grime(t, fbm(R, w, h, 4, 3), [100, 96, 88], 0.25, 0.55);
});

def('plastic_white', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 3), base = [216, 210, 188];
  t.each((x, y, o, i) => { const f = 1 + (R() - 0.5) * 0.04 + (n[i] - 0.5) * 0.05; const c = mixc(base, [206, 190, 140], clamp((n[i] - 0.4) * 1.5, 0, 1) * 0.6); o[0] = c[0] * f; o[1] = c[1] * f; o[2] = c[2] * f; });
  scratches(t, 8, 0, 0, 64, 64, [140, 136, 124], 0.3);
  grime(t, fbm(R, w, h, 8, 3), [150, 140, 116], 0.3, 0.55);
});

// typed page used by paper / paper_scatter / corkboard
function typedPage(t, x0, y0, w, h, o = {}) {
  const R = t.rand, base = o.base || [228, 224, 208];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const e = Math.min(x - x0, y - y0, x0 + w - 1 - x, y0 + h - 1 - y);
    const c = mixc(base, [206, 190, 146], clamp(1 - e / 6, 0, 1) * 0.5);
    t.set(x, y, addc(c, (R() - 0.5) * 6));
  }
  const ink = o.ink || [92, 92, 96], m = Math.max(2, Math.round(w * 0.1));
  let y = y0 + m;
  if (o.header !== false) {
    t.rect(x0 + m, y, 4, 4, mixc(ink, [140, 60, 50], 0.5));
    for (let x = x0 + m + 6; x < x0 + w - m - 4; x++) { t.set(x, y, ink); t.set(x, y + 1, ink); }
    y += 4;
    for (let x = x0 + m; x < x0 + w - m; x++) t.mix(x, y + 1, ink, 0.6);
    y += 4;
  }
  const ls = o.lineStep || 3;
  while (y < y0 + h - m - (o.sign ? 6 : 1)) {
    let x = x0 + m + (R() < 0.15 ? 3 : 0);
    const end = x0 + w - m - (R() < 0.25 ? t.ri(4, Math.max(5, w / 2)) : 0);
    while (x < end) { const wl = t.ri(2, 6); for (let k = 0; k < wl && x < end; k++, x++) t.mix(x, y, ink, 0.75); x += 1; }
    y += ls; if (R() < 0.15) y += ls;
  }
  if (o.sign) { let a = 0; for (let x = x0 + w - m - 14; x < x0 + w - m - 2; x++) { a += 0.9; t.set(x, y0 + h - m - 3 + Math.round(Math.sin(a) * 1.5), [36, 40, 90]); } }
}
def('paper', 64, 64, {}, (t) => {
  typedPage(t, 0, 0, 64, 64, { sign: true });
  for (let x = 0; x < 64; x++) { t.mul(x, 31, 0.9); t.mul(x, 32, 1.04); }
  const n = fbm(t.rand, 64, 64, 4, 3);
  grime(t, n, [190, 170, 120], 0.35, 0.5);
  const F = blobField(t, 46, 44, 9, 9, null, 0);
  t.each((x, y, o, i) => { if (F[i] > 0 && F[i] < 0.16 && (x + y * 3) % 7) { o[0] = lerp(o[0], 150, 0.4); o[1] = lerp(o[1], 112, 0.4); o[2] = lerp(o[2], 70, 0.4); } });
});

function manila(t, x0, y0, w, h) {
  const R = t.rand;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const v = (R() - 0.5) * 6; t.set(x, y, [214 + v, 188 + v, 128 + v]); }
}
def('paper_scatter', 64, 64, { alpha: true }, (t) => {
  const seed = hashStr('paper_scatter');
  const folder = subTex(30, 22, seed + 1, (s) => { manila(s, 0, 0, 30, 22); s.rect(0, 0, 30, 1, [180, 154, 98]); s.rect(20, 0, 8, 1, [214, 188, 128]); s.bevel(0, 0, 30, 22, 1.08, 0.75); for (let x = 3; x < 14; x++) s.set(x, 6 + Math.round(Math.sin(x) * 0.6), [40, 46, 110]); });
  const sheets = [0, 1, 2, 3].map((k) => subTex(20, 26, seed + 10 + k, (s) => typedPage(s, 0, 0, 20, 26, { header: k !== 2, lineStep: 3 })));
  const shadow = subTex(20, 26, 1, (s) => s.fill([60, 56, 50]));
  const place = [[38, 20, 0.5, folder, true], [20, 22, -0.35, sheets[0]], [44, 44, 0.9, sheets[1]], [24, 46, 0.2, sheets[2]], [34, 30, -1.1, sheets[3]]];
  t.draw((ctx) => {
    for (const [x, y, a, cv, isF] of place) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      if (!isF) ctx.drawImage(shadow, -9, -12);
      ctx.drawImage(cv, -cv.width / 2, -cv.height / 2);
      ctx.restore();
    }
  });
});

def('folder', 64, 64, {}, (t) => {
  const R = t.rand;
  manila(t, 0, 0, 64, 64);
  for (let x = 0; x < 64; x++) { const tab = x >= 34 && x < 60; for (let y = 0; y < 6; y++) if (!tab) t.mul(x, y, 0.82); t.mul(x, 6, tab ? 1 : 0.6); t.mul(x, 7, tab ? 1 : 1.08); }
  for (let y = 0; y < 6; y++) { t.mul(34, y, 1.15); t.mul(59, y, 0.7); }
  t.rect(37, 1, 20, 5, [236, 232, 220]); t.bevel(37, 1, 20, 5, 1.04, 0.85);
  bmText(t, 'PIKE', 40, 1, F35, [50, 50, 60]);
  const n = fbm(R, 64, 64, 4, 3);
  grime(t, n, [160, 130, 80], 0.35, 0.5);
  // handwritten name + stamp
  const p = sfLayout('PIKE, R.', 8, 18, 1.9, { rand: R, jit: 0.15, slant: 0.15, gap: 1.1 });
  markerLines(t, p, 0.5, [40, 50, 120]);
  const sm = new Uint8Array(64 * 64);
  for (let x = 8; x < 58; x++) { sm[36 * 64 + x] = 1; sm[46 * 64 + x] = 1; }
  for (let y = 36; y <= 46; y++) { sm[y * 64 + 8] = 1; sm[y * 64 + 57] = 1; }
  const tm = bmMask(64, 64, 'CONFIDENTIAL', 10, 39, F35, { sp: 1 });
  t.each((x, y, o, i) => { if (!(sm[i] || tm[i]) || t.r() < 0.12) return false; o[0] = lerp(o[0], 160, 0.7); o[1] = lerp(o[1], 40, 0.7); o[2] = lerp(o[2], 36, 0.7); });
  // coffee ring + dog-eared corner
  const F = blobField(t, 48, 54, 7, 6, null, 0);
  t.each((x, y, o, i) => { if (F[i] > 0 && F[i] < 0.18) { o[0] = lerp(o[0], 140, 0.45); o[1] = lerp(o[1], 100, 0.45); o[2] = lerp(o[2], 60, 0.45); } });
  for (let y = 58; y < 64; y++) for (let x = 64 - (y - 57); x < 64; x++) t.mul(x, y, 0.7);
  for (let x = 0; x < 64; x++) { t.mul(x, 63, 0.75); } for (let y = 6; y < 64; y++) { t.mul(0, y, 1.08); t.mul(63, y, 0.75); }
});

def('trash', 64, 64, { alpha: true }, (t) => {
  const R = t.rand, n = fbm(R, 64, 64, 4, 3);
  const F = new Float32Array(64 * 64).fill(-9);
  blobField(t, 32, 33, 24, 20, n, 0.35, F); blobField(t, 22, 26, 12, 10, n, 0.3, F); blobField(t, 44, 40, 13, 11, n, 0.3, F);
  t.each((x, y, o, i) => { if (F[i] <= 0) return false; const v = 60 + (R() - 0.5) * 30 + n[i] * 30; o[0] = v + 6; o[1] = v; o[2] = v - 8; t.a[i] = 255; });
  const inside = (x, y) => F[t.idx(x, y)] > 0.12;
  const items = [];
  for (let k = 0; k < 64; k++) { const x = t.rf(6, 58), y = t.rf(6, 58); if (inside(x, y) || (k % 4 === 0 && F[t.idx(x, y)] > -0.15)) items.push([x, y, R()]); }
  t.draw((ctx) => {
    for (const [x, y, r] of items) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(r * TAU);
      if (r < 0.26) { // crumpled paper
        const s = 3 + (r * 10) % 3; ctx.fillStyle = r < 0.1 ? '#d8d4c4' : r < 0.2 ? '#c4c0b0' : '#e6e2d4';
        ctx.beginPath(); ctx.moveTo(-s, -s * 0.6); ctx.lineTo(0, -s); ctx.lineTo(s, -s * 0.4); ctx.lineTo(s * 0.8, s * 0.7); ctx.lineTo(-s * 0.3, s); ctx.lineTo(-s, s * 0.3); ctx.fill();
        ctx.fillStyle = '#a8a496'; ctx.fillRect(-s * 0.6, 0, s * 1.2, 1); ctx.fillStyle = '#f2efe4'; ctx.fillRect(-s * 0.5, -s * 0.5, 2, 1);
      } else if (r < 0.44) { // can
        ctx.fillStyle = ['#8c3a30', '#a8a8a4', '#46684a', '#3c5480'][Math.floor(r * 100) % 4]; ctx.fillRect(-4, -2, 8, 4);
        ctx.fillStyle = '#d8d8d4'; ctx.fillRect(-4, -2, 1, 4); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(-3, -1, 6, 1);
      } else if (r < 0.56) { // chip bag
        ctx.fillStyle = ['#b89c3c', '#3c6494', '#9c3c30', '#b8743c'][Math.floor(r * 100) % 4]; ctx.fillRect(-5, -3, 10, 6);
        ctx.fillStyle = '#f0f0e8'; ctx.fillRect(-2, -1, 4, 2); ctx.fillStyle = '#504c48'; ctx.fillRect(-5, -3, 10, 1);
      } else if (r < 0.66) { // cigarette butt
        ctx.fillStyle = '#e8e4d8'; ctx.fillRect(-1, 0, 2, 1); ctx.fillStyle = '#c88838'; ctx.fillRect(1, 0, 2, 1);
      } else { // dead leaf
        ctx.fillStyle = ['#6c4c2c', '#8a6034', '#5c4a30', '#9c7040'][Math.floor(r * 100) % 4];
        ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 2, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#3c2c1c'; ctx.fillRect(-3, 0, 6, 1);
      }
      ctx.restore();
    }
  });
  // ground shade at the rim
  t.each((x, y, o, i) => { if (!t.a[i]) return false; if (F[i] < 0.08) { o[0] *= 0.8; o[1] *= 0.8; o[2] *= 0.8; } });
});

def('rubble', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, v = voronoi(R, w, h, 42), n = fbm(R, w, h, 8, 2);
  const kinds = [];
  for (let k = 0; k < v.n; k++) { const r = R(); kinds.push(r < 0.22 ? 0 : r < 0.55 ? 1 : r < 0.8 ? 2 : 3); }
  const cc = [[118, 112, 102], [146, 144, 138], [206, 200, 188], [212, 208, 194]];
  t.each((x, y, o, i) => {
    const k = kinds[v.id[i]], e = v.d2[i] - v.d1[i];
    if (k === 0 || e < 0.9) { const g = 104 + (R() - 0.5) * 22 + n[i] * 16; o[0] = g + 4; o[1] = g; o[2] = g - 6; return; }
    let f = 1 + (R() - 0.5) * 0.08 + (n[i] - 0.5) * 0.12;
    if (k === 3 && R() < 0.15) f *= 0.82;
    o[0] = cc[k][0] * f; o[1] = cc[k][1] * f; o[2] = cc[k][2] * f;
  });
  const at = (x, y) => { const i = t.idx(x, y); return kinds[v.id[i]] && v.d2[i] - v.d1[i] >= 0.9 ? v.id[i] : -1; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const id = at(x, y);
    if (id < 0) { if (at(x - 1, y - 1) >= 0 || at(x - 2, y - 1) >= 0) t.mul(x, y, 0.62); continue; }
    if (at(x - 1, y) !== id || at(x, y - 1) !== id) t.mul(x, y, 1.18);
    else if (at(x + 1, y) !== id || at(x, y + 1) !== id) t.mul(x, y, 0.72);
  }
  t.each((x, y, o, i) => { const k = clamp((n[i] - 0.45) * 1.5, 0, 1) * 0.3; o[0] = lerp(o[0], 196, k); o[1] = lerp(o[1], 190, k); o[2] = lerp(o[2], 178, k); });
});

def('glass_shards', 64, 64, { alpha: true }, (t) => {
  const R = t.rand;
  for (let k = 0; k < 14; k++) {
    const cx = t.rf(7, 57), cy = t.rf(7, 57), s = k < 5 ? t.rf(6, 11) : t.rf(3, 6), a = t.rf(0, TAU), nv = R() < 0.5 ? 3 : 4, pts = [];
    for (let j = 0; j < nv; j++) { const aa = a + (j / nv) * TAU + t.rf(-0.4, 0.4), rr = s * t.rf(0.5, 1.2); pts.push(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr * 0.7); }
    const m = polyMask(64, 64, pts);
    const ins = (x, y) => x >= 0 && y >= 0 && x < 64 && y < 64 && m[y * 64 + x];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      if (!m[y * 64 + x]) continue;
      if (!ins(x - 1, y) || !ins(x, y - 1)) t.set(x, y, [236, 248, 250]);
      else if (!ins(x + 1, y) || !ins(x, y + 1)) t.set(x, y, [64, 80, 86]);
      else if ((x + y) & 1) t.set(x, y, [176 + R() * 20, 208 + R() * 16, 214 + R() * 12]);
    }
  }
  for (let k = 0; k < 40; k++) t.set(t.ri(2, 61), t.ri(2, 61), R() < 0.5 ? [220, 236, 240] : [120, 150, 158]);
});

function decalField(t, parts, cells = 4, amp = 0.35) {
  const n = fbm(t.rand, t.w, t.h, cells, 4), F = new Float32Array(t.w * t.h).fill(-9);
  for (const [x, y, rx, ry] of parts) blobField(t, x, y, rx, ry, n, amp, F);
  return { F, n };
}
def('puddle', 64, 64, { alpha: true }, (t) => {
  const { F, n } = decalField(t, [[30, 32, 24, 15], [42, 38, 14, 12], [20, 26, 12, 9]], 4, 0.3);
  const s = vnoise(t.rand, 64, 64, 4, 16);
  t.each((x, y, o, i) => {
    let v = 34 + (n[i] - 0.5) * 10;
    const refl = sstep(0.58, 0.72, s[i]) * 26;
    o[0] = v + refl * 0.9; o[1] = v + 4 + refl; o[2] = v + 8 + refl * 1.1;
    if (F[i] < 0.12) { o[0] *= 0.8; o[1] *= 0.8; o[2] *= 0.8; }
  });
  for (let k = 0; k < 8; k++) { const x = t.ri(14, 50), y = t.ri(22, 44); if (F[y * 64 + x] > 0.25) { t.set(x, y, [120, 130, 140]); t.set(x + 1, y, [80, 90, 100]); } }
  ditherAlpha(t, F, 0, 0.16);
});

def('water_stain', 64, 64, { alpha: true }, (t) => {
  const { F, n } = decalField(t, [[32, 32, 26, 22], [22, 40, 12, 12]], 4, 0.3);
  t.each((x, y, o, i) => { const v = (n[i] - 0.5) * 16; o[0] = 170 + v; o[1] = 138 + v; o[2] = 92 + v; });
  tideStain(t, F, { tint: [158, 122, 76], ring: [104, 70, 38], k: 0.0, ringK: 0.75, levels: [0.1, 0.32, 0.55, 0.78] });
  t.each((x, y, o, i) => { const k = clamp(F[i] * 0.6, 0, 0.35); o[0] = lerp(o[0], 126, k); o[1] = lerp(o[1], 94, k); o[2] = lerp(o[2], 56, k); });
  ditherAlpha(t, F, 0, 0.16);
});

def('mold', 64, 64, { alpha: true }, (t) => {
  const { F } = decalField(t, [[32, 34, 20, 18], [20, 22, 10, 9], [46, 46, 11, 10], [44, 20, 8, 7]], 8, 0.45);
  const f = fbm(t.rand, 64, 64, 16, 2);
  t.each((x, y, o, i) => {
    const v = F[i];
    if (v > 0.12) { const c = mixc([20, 28, 20], [52, 72, 40], f[i]); o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; t.a[i] = 255; if (t.r() < 0.05) { o[0] = 96; o[1] = 112; o[2] = 80; } }
    else if (v > -0.2 && t.r() < Math.pow((v + 0.2) / 0.32, 1.6)) { o[0] = 32; o[1] = 44; o[2] = 30; t.a[i] = 255; }
  });
  for (let k = 0; k < 30; k++) { const a = t.rf(0, TAU), d = t.rf(20, 30); t.set(32 + Math.cos(a) * d, 33 + Math.sin(a) * d * 0.9, [28, 38, 26]); }
});

def('scorch', 64, 64, { alpha: true }, (t) => {
  const ang = vnoise(t.rand, 64, 64, 16, 1), n = fbm(t.rand, 64, 64, 8, 3), F = new Float32Array(64 * 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = x + 0.5 - 32, dy = y + 0.5 - 34, r = Math.hypot(dx, dy), a = (Math.atan2(dy, dx) / TAU + 1) % 1;
    const rr = 22 * (0.65 + ang[Math.floor(a * 63)] * 0.6) * (dy < 0 ? 1.15 : 0.9);
    F[y * 64 + x] = 1 - r / rr + (n[y * 64 + x] - 0.5) * 0.4;
  }
  t.each((x, y, o, i) => { const v = clamp(F[i], 0, 1), c = mixc([84, 74, 64], [14, 12, 11], sstep(0, 0.6, v)); o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; });
  ditherAlpha(t, F, -0.05, 0.3);
});

def('stain_dark', 64, 64, { alpha: true }, (t) => {
  const { F, n } = decalField(t, [[30, 30, 18, 13], [40, 38, 10, 8], [22, 38, 6, 5]], 4, 0.35);
  for (let k = 0; k < 5; k++) blobField(t, t.rf(8, 56), t.rf(8, 56), t.rf(1, 2.5), t.rf(1, 2.5), null, 0, F);
  t.each((x, y, o, i) => {
    const v = F[i];
    let c = mixc([66, 40, 30], [84, 56, 40], clamp((n[i] - 0.4) * 2, 0, 1));
    if (v < 0.1) c = [48, 30, 22];
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  });
  ditherAlpha(t, F, -0.02, 0.1);
});

def('ceiling_debris', 64, 64, { alpha: true }, (t) => {
  const R = t.rand, n = fbm(R, 64, 64, 4, 3);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - 32, (y - 32) * 1.2) / 30, p = (1 - d) * 0.55 + (n[y * 64 + x] - 0.5) * 0.7;
    if (p > 0.1 && R() < (p - 0.1) * 1.1) t.set(x, y, [178 + R() * 18, 174 + R() * 16, 164 + R() * 14]);
  }
  for (let k = 0; k < 12; k++) {
    const cx = t.rf(9, 55), cy = t.rf(9, 55), s = t.rf(3, k < 4 ? 11 : 6), a = t.rf(0, TAU), pts = [];
    for (let j = 0; j < 4; j++) { const aa = a + (j / 4) * TAU + t.rf(-0.3, 0.3), rr = s * t.rf(0.7, 1.1); pts.push(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr * 0.8); }
    const side = polyMask(64, 64, pts.map((v, j) => v + (j & 1 ? 2 : 0))), top = polyMask(64, 64, pts);
    t.paint(side, [150, 144, 128]);
    t.paintFn(top, (x, y, o) => { let v = 210 + (R() - 0.5) * 10; if (R() < 0.15) v *= 0.84; o[0] = v; o[1] = v - 4; o[2] = v - 16; });
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (top[y * 64 + x] && !(x > 0 && top[y * 64 + x - 1]) ) t.mul(x, y, 1.06);
  }
});

def('sleeping_bag', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 3), base = [178, 84, 54];
  t.each((x, y, o, i) => {
    const v = (y & 15) / 16, puff = Math.sin(v * Math.PI);
    let f = 0.72 + puff * 0.36 + (n[i] - 0.5) * 0.12 + (R() - 0.5) * 0.03;
    if ((y & 15) === 0) f = x % 3 === 0 ? 0.75 : 0.55;
    if (v > 0.2 && v < 0.35) f *= 1.06;
    const c = mixc(base, [168, 128, 116], clamp((n[i] - 0.4) * 1.4, 0, 1) * 0.5);
    o[0] = c[0] * f; o[1] = c[1] * f; o[2] = c[2] * f;
  });
  grime(t, fbm(R, w, h, 8, 3), [90, 70, 56], 0.4, 0.55);
});

def('tarp', 64, 64, { tile: true }, (t) => {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 3), base = [46, 96, 164];
  t.each((x, y, o, i) => {
    let f = 1 + (n[i] - 0.5) * 0.14 + ((x & 3) === 0 || (y & 3) === 0 ? 0.04 : 0) + (R() - 0.5) * 0.03;
    o[0] = base[0] * f; o[1] = base[1] * f; o[2] = base[2] * f;
  });
  for (let k = 0; k < 7; k++) {
    let x = t.rf(0, w), y = t.rf(0, h), a = t.rf(0, TAU);
    const len = t.ri(20, 56), m = new Uint8Array(w * h);
    for (let j = 0; j < len; j++) { a += t.rf(-0.04, 0.04); x += Math.cos(a); y += Math.sin(a); m[t.idx(x, y)] = 1; }
    ridge(t, m, 1.18, 0.8);
  }
  grime(t, fbm(R, w, h, 8, 3), [96, 90, 70], 0.4, 0.55);
});

def('can_label', 32, 32, {}, (t) => {
  const R = t.rand;
  t.each((x, y, o) => {
    let c;
    if (y < 3 || y > 28) { const v = 168 + ((y === 1 || y === 30) ? 26 : 0) + (R() - 0.5) * 8; c = [v, v, v - 4]; }
    else if (y >= 11 && y <= 21) c = [222, 208, 170];
    else c = [168, 48, 38];
    if (y === 4 || y === 27) c = [210, 180, 80];
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  });
  bmCenter(t, 'BEANS', 16, 13, F57, [150, 40, 30]);
  bmCenter(t, 'NET 15OZ', 16, 6, F35, [236, 220, 190]);
  t.rect(4, 23, 24, 1, [236, 220, 190]);
  const n = fbm(R, 32, 32, 4, 3);
  t.each((x, y, o, i) => { const k = 0.18 + n[i] * 0.2; o[0] = lerp(o[0], 180, k); o[1] = lerp(o[1], 166, k); o[2] = lerp(o[2], 140, k); });
  for (let k = 0; k < 12; k++) { const x = t.ri(0, 31), y = t.pick([0, 1, 2, 29, 30, 31]); t.set(x, y, [130, 74, 40]); }
});

def('cabinet_front', 64, 64, {}, (t) => {
  const R = t.rand, base = [192, 182, 156];
  brushed(t, base, false, 4);
  t.bevel(0, 0, 64, 64, 1.12, 0.6, 2);
  for (let d = 0; d < 4; d++) {
    const y0 = 3 + d * 15, dh = 14;
    t.bevel(3, y0, 58, dh, 1.12, 0.7);
    t.mulRect(3, y0 + dh, 58, 1, 0.35);
    if (d === 2) { t.mulRect(3, y0 - 1, 58, 2, 0.3); }
    t.rect(25, y0 + 2, 14, 5, [210, 208, 200]); t.bevel(25, y0 + 2, 14, 5, 0.7, 1.2);
    t.rect(26, y0 + 3, 12, 3, [234, 230, 214]);
    if (R() < 0.8) for (let x = 27; x < 27 + t.ri(4, 10); x++) t.set(x, y0 + 4, [90, 90, 96]);
    t.rect(23, y0 + 8, 18, 4, [52, 50, 48]);
    for (let x = 24; x < 40; x++) { t.set(x, y0 + 8, [200, 200, 196]); t.set(x, y0 + 9, [150, 150, 146]); }
  }
  const n = fbm(R, 64, 64, 8, 3);
  grime(t, n, [110, 100, 80], 0.35, 0.5);
  grimeBand(t, 50, 64, [90, 80, 60], 0.35);
  for (let k = 0; k < 8; k++) { const x = t.ri(2, 61), y = t.ri(2, 61); t.set(x, y, [124, 70, 40]); if (R() < 0.6) streak(t, x, y + 1, t.ri(2, 8), [130, 80, 44], 0.4); }
  scratches(t, 8, 2, 2, 62, 62, [220, 214, 196], 0.4);
});

def('shelf_meds', 64, 64, { tile: true }, (t) => {
  const R = t.rand;
  t.each((x, y, o) => { const v = 34 + (y & 15) * 0.6 + (R() - 0.5) * 6; o[0] = v; o[1] = v - 3; o[2] = v - 6; });
  for (let row = 0; row < 4; row++) {
    const by = row * 16 + 14;
    let x = t.ri(0, 4);
    while (x < 62) {
      const r = R();
      if (r < 0.22) { x += t.ri(5, 12); continue; } // ransacked gap
      if (r < 0.62) { // pill bottle
        const bw = t.ri(4, 5), bh = t.ri(7, 10), amber = R() < 0.7, wc = amber ? [146, 82, 30] : [214, 214, 206];
        for (let yy = by - bh; yy < by; yy++) for (let xx = 0; xx < bw; xx++) {
          const u = xx / (bw - 1), f = 0.6 + Math.sin(u * Math.PI) * 0.45 + (xx === 1 ? 0.25 : 0);
          let c = yy < by - bh + 2 ? [222, 220, 210] : wc;
          if (yy > by - bh + 3 && yy < by - 2 && amber) c = [220, 214, 196];
          t.set(x + xx, yy, mulc(c, f));
        }
        x += bw + t.ri(0, 1);
      } else if (r < 0.9) { // box
        const bw = t.ri(6, 10), bh = t.ri(6, 11), c = t.pick([[214, 210, 200], [190, 206, 220], [220, 196, 196], [214, 214, 180]]);
        t.rect(x, by - bh, bw, bh, c); t.bevel(x, by - bh, bw, bh, 1.08, 0.7);
        t.rect(x + 1, by - bh + 2, bw - 2, 1, t.pick([[170, 50, 40], [40, 80, 150], [40, 120, 70]]));
        for (let xx = x + 1; xx < x + bw - 2; xx += 2) t.mul(xx, by - bh + 4, 0.75);
        x += bw + t.ri(0, 1);
      } else { // fallen bottle lying on its side
        for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 9; xx++) t.set(x + xx, by - 4 + yy, mulc(xx > 6 ? [222, 220, 210] : [146, 82, 30], 0.7 + Math.sin(((yy + 0.5) / 4) * Math.PI) * 0.45));
        x += 10;
      }
    }
    for (let xx = 0; xx < 64; xx++) { t.set(xx, by, [150, 140, 124]); t.set(xx, by + 1, [104, 96, 84]); if (R() < 0.08) t.set(xx, by - 1, [220, 220, 214]); }
  }
});

def('shelf_files', 64, 64, { tile: true }, (t) => {
  const R = t.rand, codes = [[176, 44, 36], [44, 76, 160], [48, 128, 70], [214, 180, 40], [200, 110, 40], [110, 60, 130], [230, 230, 224]];
  t.each((x, y, o) => { const v = 30 + (R() - 0.5) * 6; o[0] = v; o[1] = v - 2; o[2] = v - 4; });
  for (let row = 0; row < 2; row++) {
    const by = row * 32 + 30, top = row * 32 + 4;
    let x = 0;
    while (x < 64) {
      if (R() < 0.1 && x < 56) { // gap with a leaning folder
        const gw = t.ri(5, 9);
        const m = polyMask(64, 64, [x, by, x + 3, by, x + gw + 1, top + 6, x + gw - 2, top + 5]);
        t.paintFn(m, (xx, yy, o) => { const v = (R() - 0.5) * 8; o[0] = 196 + v; o[1] = 170 + v; o[2] = 114 + v; });
        x += gw; continue;
      }
      const sw = t.ri(2, 4), ht = t.ri(0, 3), mc = mixc([206, 180, 124], [230, 220, 196], R() * 0.3);
      for (let xx = 0; xx < sw && x + xx < 64; xx++) for (let yy = top + ht; yy < by; yy++) {
        const f = xx === 0 ? 1.1 : xx === sw - 1 ? 0.7 : 1;
        t.set(x + xx, yy, mulc(addc(mc, (R() - 0.5) * 6), f));
      }
      const c1 = t.pick(codes), c2 = t.pick(codes);
      t.rect(x, by - 9, sw - 1, 3, c1); t.rect(x, by - 5, sw - 1, 3, c2);
      t.rect(x, top + ht + 2, sw - 1, 4, [236, 234, 226]);
      x += sw;
    }
    for (let xx = 0; xx < 64; xx++) { t.set(xx, by, [130, 132, 130]); t.set(xx, by + 1, [84, 86, 86]); }
  }
  grime(t, fbm(R, 64, 64, 8, 3), [90, 80, 60], 0.25, 0.5);
});

def('drawer_front', 64, 64, {}, (t) => {
  brushed(t, [172, 174, 176], false, 9);
  t.bevel(0, 0, 64, 64, 1.25, 0.55, 2);
  t.bevel(4, 4, 56, 56, 0.7, 1.2);
  t.bevel(5, 5, 54, 54, 1.12, 0.8);
  // hinges
  for (const y of [10, 44]) { for (let yy = y; yy < y + 11; yy++) for (let xx = 1; xx < 6; xx++) t.set(xx, yy, [150, 150, 148]); t.bevel(1, y, 5, 11, 1.3, 0.55); t.rect(3, y + 1, 1, 9, [110, 110, 110]); streak(t, 3, y + 11, t.ri(4, 10), [130, 80, 44], 0.45); }
  // latch: block + heavy lever
  t.rect(46, 24, 10, 16, [138, 140, 142]); t.bevel(46, 24, 10, 16, 1.3, 0.55);
  for (let y = 18; y < 46; y++) { t.set(49, y, [222, 224, 226]); t.set(50, y, [186, 188, 190]); t.set(51, y, [140, 142, 144]); t.set(52, y, [96, 98, 100]); t.mul(53, y + 1, 0.65); }
  for (let x = 49; x < 53; x++) { t.mul(x, 18, 1.1); t.mul(x, 45, 0.7); }
  t.rect(48, 30, 6, 4, [80, 80, 84]); t.bevel(48, 30, 6, 4, 1.4, 0.6);
  // name-card holder
  t.rect(20, 10, 22, 11, [150, 152, 154]); t.bevel(20, 10, 22, 11, 1.3, 0.6);
  t.rect(22, 12, 18, 7, [222, 216, 196]);
  for (let x = 23; x < 23 + t.ri(9, 15); x++) t.mix(x, 14, [70, 70, 80], 0.7);
  for (let x = 23; x < 23 + t.ri(5, 9); x++) t.mix(x, 16, [70, 70, 80], 0.5);
  bmText(t, '4', 9, 8, F57, [60, 62, 66], { mix: 0.8 });
  scratches(t, 16, 6, 6, 58, 58, [226, 228, 230], 0.45);
  handGrime(t, 48, 32, 12, 0.3);
  grimeBand(t, 46, 64, [96, 90, 76], 0.4);
});

def('boiler_gauge', 32, 32, { alpha: true }, (t) => {
  const cx = 16, cy = 16;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > 15.6) continue;
    if (d > 12.4) { const l = -(dx + dy) / d; const v = 34 + Math.max(0, l) * (d > 14.2 ? 70 : 20) - (d < 13.2 ? 12 : 0); t.set(x, y, [v, v, v]); continue; }
    t.set(x, y, [226 - d * 0.8, 222 - d * 0.8, 206 - d]);
  }
  const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    let a = Math.atan2(dy, dx); if (a < A0 - 0.01) a += TAU;
    if (d > 9.6 && d < 12 && a > A0 + (A1 - A0) * 0.78 && a < A1) t.set(x, y, [184, 34, 28]);
  }
  for (let k = 0; k <= 10; k++) {
    const a = A0 + ((A1 - A0) * k) / 10, r0 = k % 5 === 0 ? 8 : 9.6;
    line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * 11.2, cy + Math.sin(a) * 11.2, (x, y) => t.set(x, y, [30, 30, 30]));
  }
  bmCenter(t, 'PSI', 16, 22, F35, [60, 60, 60]);
  const na = A0 + (A1 - A0) * 0.58;
  t.paint(stampPolys(new Uint8Array(1024), 32, 32, [[cx - Math.cos(na) * 2.5, cy - Math.sin(na) * 2.5, cx + Math.cos(na) * 10, cy + Math.sin(na) * 10]], 0.5), [24, 24, 24]);
  t.rect(15, 15, 2, 2, [60, 60, 60]); t.set(15, 15, [150, 150, 150]);
  for (let a = 3.6; a < 4.4; a += 0.06) { t.mix(cx + Math.cos(a) * 9.5, cy + Math.sin(a) * 9.5, [255, 255, 255], 0.7); }
  const n = fbm(t.rand, 32, 32, 4, 2);
  t.each((x, y, o, i) => { if (!t.a[i]) return false; const k = clamp((n[i] - 0.4) * 0.8, 0, 0.3); o[0] = lerp(o[0], 170, k); o[1] = lerp(o[1], 150, k); o[2] = lerp(o[2], 100, k); });
});

function hazardStripes(t, x0, y0, w, h, period = 8, dark = [24, 22, 20], light = [222, 180, 38]) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) t.set(x, y, (((x + y) % period) + period) % period < period / 2 ? dark : light);
}
function dial(t, cx, cy, r, val) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y); if (d > r + 0.3) continue;
    if (d > r - 1.5) t.set(cx + x, cy + y, d > r - 0.6 && x + y < 0 ? [110, 110, 110] : [30, 30, 30]);
    else t.set(cx + x, cy + y, [220, 216, 200]);
  }
  const a = Math.PI * (0.8 + val * 1.4);
  line(cx, cy, cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), (x, y) => t.set(x, y, [170, 30, 26]));
  t.set(cx, cy, [30, 30, 30]);
}
def('generator_panel', 64, 64, {}, (t) => {
  const R = t.rand;
  brushed(t, [106, 120, 102], false, 5);
  t.bevel(0, 0, 64, 64, 1.2, 0.55, 2);
  for (let y = 5; y < 17; y += 3) for (let x = 6; x < 58; x++) { t.set(x, y, [30, 32, 30]); t.mul(x, y + 1, 1.25); }
  dial(t, 15, 28, 7, 0.55); dial(t, 34, 28, 7, 0.1);
  t.rect(6, 37, 18, 7, [214, 210, 196]); t.rect(25, 37, 18, 7, [214, 210, 196]);
  bmText(t, 'VOLT', 8, 38, F35, [40, 40, 40]); bmText(t, 'AMPS', 27, 38, F35, [40, 40, 40]);
  // indicator lamps: amber lit
  t.rect(49, 21, 6, 6, [40, 40, 38]);
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) { const d = Math.hypot(x, y); if (d < 2) t.set(52 + x, 24 + y, d < 1 ? [255, 236, 150] : [255, 182, 44]); else if (d < 3.3 && ((x + y) & 1)) t.mix(52 + x, 24 + y, [230, 150, 50], 0.6); }
  t.rect(50, 30, 4, 4, [70, 24, 20]); t.set(50, 30, [110, 40, 36]);
  t.rect(50, 36, 4, 4, [24, 54, 30]); t.set(50, 36, [40, 80, 46]);
  for (let k = 0; k < 4; k++) {
    const x = 9 + k * 11; t.rect(x, 46, 5, 6, [176, 176, 172]); t.bevel(x, 46, 5, 6, 1.2, 0.6);
    const up = R() < 0.5; t.rect(x + 2, up ? 45 : 49, 1, 3, [40, 40, 40]); t.set(x + 2, up ? 45 : 51, [200, 200, 196]);
  }
  hazardStripes(t, 3, 54, 58, 7);
  t.bevel(3, 54, 58, 7, 1.1, 0.7);
  for (const [x, y] of [[3, 3], [59, 3], [3, 59], [59, 59]]) screw(t, x, y);
  grime(t, fbm(R, 64, 64, 8, 3), [60, 56, 40], 0.4, 0.5);
  for (let k = 0; k < 4; k++) streak(t, t.ri(4, 60), t.ri(2, 30), t.ri(6, 18), [130, 80, 44], 0.4);
});

def('breaker_panel', 64, 64, {}, (t) => {
  const R = t.rand;
  brushed(t, [150, 152, 148], false, 5);
  t.bevel(0, 0, 64, 64, 1.2, 0.55, 2);
  t.rect(5, 12, 54, 48, [88, 90, 88]); t.bevel(5, 12, 54, 48, 0.6, 1.2);
  t.rect(30, 13, 4, 46, [130, 112, 80]); t.bevel(30, 13, 4, 46, 1.2, 0.7);
  for (let r = 0; r < 9; r++) for (const x0 of [8, 35]) {
    const y = 14 + r * 5;
    if (R() < 0.08) { t.rect(x0, y, 21, 4, [40, 40, 40]); continue; }
    t.rect(x0, y, 21, 4, [44, 44, 46]); t.bevel(x0, y, 21, 4, 1.4, 0.7);
    const on = R() < 0.75, tx = x0 + (on ? 12 : 6);
    t.rect(tx, y + 1, 3, 2, [196, 194, 186]); t.set(tx, y + 1, [230, 230, 224]);
    t.rect(x0 + 1, y + 1, 3, 2, [214, 210, 196]);
  }
  t.rect(10, 3, 44, 7, [226, 188, 40]); t.bevel(10, 3, 44, 7, 1.1, 0.7);
  bmCenter(t, 'DANGER 480V', 32, 4, F35, [24, 22, 20]);
  for (const [x, y] of [[2, 2], [60, 2], [2, 60], [60, 60]]) screw(t, x, y);
  grime(t, fbm(R, 64, 64, 8, 3), [80, 72, 56], 0.35, 0.5);
  for (let k = 0; k < 4; k++) streak(t, t.ri(2, 62), t.ri(2, 10), t.ri(6, 20), [130, 80, 44], 0.35);
});

def('ladder', 32, 128, { alpha: true, tile: true }, (t) => {
  const R = t.rand, n = fbm(R, 32, 128, 4, 4);
  const rust = (x, y, c) => { const k = clamp((n[y * 32 + x] - 0.35) * 1.6, 0, 0.85); return mixc(c, [128, 70, 36], k); };
  for (let y = 0; y < 128; y++) for (const x0 of [1, 27]) {
    const prof = [1.35, 1.1, 0.9, 0.6];
    for (let k = 0; k < 4; k++) t.set(x0 + k, y, rust(x0 + k, y, mulc([124, 124, 120], prof[k] * (1 + (R() - 0.5) * 0.06))));
  }
  for (let r = 0; r < 8; r++) {
    const y = r * 16 + 6;
    for (let x = 5; x < 27; x++) { t.set(x, y, rust(x, y, [176, 176, 170])); t.set(x, y + 1, rust(x, y + 1, [122, 122, 118])); t.set(x, y + 2, rust(x, y + 2, [72, 72, 70])); }
    t.set(5, y + 1, [150, 150, 144]); t.set(26, y + 1, [150, 150, 144]);
    for (const x of [2, 28]) streak(t, x, y + 3, t.ri(3, 10), [140, 76, 36], 0.5);
  }
});

def('caution_tape', 64, 16, {}, (t) => {
  const R = t.rand, Y = [224, 186, 40], K = [22, 22, 20];
  t.each((x, y, o) => {
    let c = Y;
    const seg = x < 10 || x >= 54;
    if (seg && ((x + y) & 7) < 4) c = K;
    if (y === 0 || y === 15) c = mulc(c, 0.75);
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  });
  bmText(t, 'CAUTION', 12, 4, F57, K, { sp: 1 });
  t.each((x, y, o) => { const f = 1 + Math.sin(x * 0.5) * 0.04 + (R() - 0.5) * 0.04; o[0] *= f; o[1] *= f; o[2] *= f; });
  grime(t, fbm(R, 64, 16, 8, 2, 0.5, 2), [120, 104, 60], 0.35, 0.55);
});

def('elevator_panel', 32, 64, {}, (t) => {
  brushed(t, [174, 176, 180], true, 10);
  t.bevel(0, 0, 32, 64, 1.25, 0.55);
  t.rect(8, 5, 16, 9, [22, 20, 20]); t.bevel(8, 5, 16, 9, 0.6, 1.3);
  bmText(t, 'G', 14, 6, F57, [70, 24, 18]);
  const btn = (cy, label, face) => {
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const d = Math.hypot(x, y); if (d > 4.3) continue;
      if (d > 3.2) t.set(21 + x, cy + y, mulc([120, 120, 122], 1 + (-x - y) * 0.06));
      else t.set(21 + x, cy + y, mulc(face, 1 + (-x - y) * 0.05));
    }
    if (label) bmText(t, label, 5, cy - 3, F57, [30, 30, 32]);
  };
  btn(22, '1', [196, 196, 192]); btn(33, 'G', [196, 196, 192]); btn(44, 'B', [196, 196, 192]); btn(56, null, [206, 168, 40]);
  // bell pictogram
  const bell = ['001100', '011110', '011110', '011110', '111111', '001100'];
  bell.forEach((r, y) => [...r].forEach((b, x) => { if (b === '1') t.set(4 + x, 53 + y, [30, 30, 32]); }));
  for (const [x, y] of [[2, 2], [28, 2], [2, 60], [28, 60]]) screw(t, x, y);
  handGrime(t, 21, 36, 12, 0.3);
  scratches(t, 8, 2, 2, 30, 62, [226, 228, 232], 0.4);
});

def('elevator_wall', 64, 64, { tile: true }, (t) => {
  const R = t.rand, warp = fbm(R, 64, 64, 4, 3, 0.5, 2), st = fbm(R, 64, 64, 32, 2, 0.5, 2), base = [152, 112, 76];
  t.each((x, y, o, i) => {
    const ring = Math.sin(((x + warp[i] * 18) / 64) * TAU * 5);
    const f = 1 + (st[i] - 0.5) * 0.22 + (ring > 0.85 ? -0.1 : 0) + (R() - 0.5) * 0.03;
    o[0] = base[0] * f; o[1] = base[1] * f; o[2] = base[2] * f;
  });
  for (let y = 0; y < 64; y++) { t.set(0, y, [176, 178, 180]); t.set(1, y, [96, 98, 100]); t.mul(2, y, 0.8); }
  for (let x = 0; x < 64; x++) {
    const prof = [130, 200, 236, 196, 160, 126, 92, 70];
    for (let k = 0; k < 8; k++) t.set(x, 30 + k, [prof[k], prof[k] + 2, prof[k] + 4]);
    t.mul(x, 38, 0.55); t.mul(x, 39, 0.75);
    for (let y = 58; y < 64; y++) t.set(x, y, mulc([160, 162, 166], y === 58 ? 1.3 : 1 + (R() - 0.5) * 0.05));
  }
  for (let y = 29; y < 40; y++) for (let x = 30; x < 34; x++) t.set(x, y, mulc([150, 152, 156], x === 30 ? 1.25 : x === 33 ? 0.7 : 1));
  grimeBand(t, 40, 58, [80, 64, 48], 0.3);
  scratches(t, 10, 0, 0, 64, 58, [200, 170, 130], 0.4);
});

def('or_lamp', 64, 64, { alpha: true }, (t) => {
  const cx = 32, cy = 32;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > 31) continue;
    if (d > 26.5) { const l = -(dx + dy) / d; const v = 196 + l * (d > 28.8 ? 34 : -24); t.set(x, y, [v, v - 2, v - 10]); continue; }
    if (d > 25.5) { t.set(x, y, [70, 70, 70]); continue; }
    const v = 120 + (t.r() - 0.5) * 6; t.set(x, y, [v, v + 2, v + 4]);
  }
  const cups = [];
  for (let gy = -4; gy <= 4; gy++) for (let gx = -4; gx <= 4; gx++) {
    const x = cx + (gx + (gy & 1) * 0.5) * 6.6, y = cy + gy * 5.7, d = Math.hypot(x - cx, y - cy);
    if (d < 23 && d > 7.5) cups.push([x, y]);
  }
  for (const [ux, uy] of cups) for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
    const d = Math.hypot(x, y); if (d > 3.2) continue;
    const X = Math.round(ux) + x, Y = Math.round(uy) + y;
    if (d > 2.4) t.set(X, Y, [70, 72, 76]);
    else if (d < 0.9) t.set(X, Y, [244, 238, 210]);
    else { const v = 150 + (x + y) * 18; t.set(X, Y, [v, v + 4, v + 8]); }
  }
  for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
    const d = Math.hypot(x, y); if (d > 6.5) continue;
    const v = d > 5.5 ? 40 : 84 - (x + y) * 6; t.set(cx + x, cy + y, [v, v + 2, v + 4]);
  }
  const n = fbm(t.rand, 64, 64, 4, 2);
  t.each((x, y, o, i) => { if (!t.a[i]) return false; const k = clamp((n[i] - 0.4), 0, 0.3); o[0] = lerp(o[0], 120, k); o[1] = lerp(o[1], 110, k); o[2] = lerp(o[2], 90, k); });
});

def('xray_viewer', 64, 64, {}, (t) => {
  const R = t.rand;
  t.fill([190, 190, 184]);
  t.bevel(0, 0, 64, 64, 1.2, 0.6, 2);
  t.rect(4, 4, 56, 56, [214, 222, 224]); t.bevel(4, 4, 56, 56, 0.7, 1.1);
  const fx = 8, fy = 9, fw = 48, fh = 50;
  t.draw((ctx) => {
    ctx.fillStyle = '#1c2230'; ctx.fillRect(fx, fy, fw, fh);
    ctx.save(); ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
    ctx.fillStyle = '#3a4656'; ctx.beginPath(); ctx.ellipse(32, 40, 23, 26, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#18202c'; ctx.beginPath(); ctx.ellipse(23, 37, 8, 15, 0.08, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(41, 37, 8, 15, -0.08, 0, TAU); ctx.fill();
    ctx.fillStyle = '#56647a'; ctx.beginPath(); ctx.ellipse(36, 43, 7, 9, -0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#66748a'; ctx.fillRect(fx, 52, fw, 8); ctx.beginPath(); ctx.ellipse(23, 53, 9, 4, 0, Math.PI, TAU); ctx.ellipse(41, 54, 9, 4, 0, Math.PI, TAU); ctx.fill();
    ctx.strokeStyle = '#a8b8c8'; ctx.lineWidth = 1.1;
    for (let k = 0; k < 7; k++) {
      const y = 22 + k * 4.4;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(32 + s * 2, y); ctx.quadraticCurveTo(32 + s * 18, y - 3, 32 + s * 17, y + 6); ctx.stroke(); }
    }
    ctx.strokeStyle = '#c8d4e0'; ctx.lineWidth = 1.4;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(32 + s * 2, 19); ctx.quadraticCurveTo(32 + s * 10, 16, 32 + s * 19, 18); ctx.stroke(); }
    ctx.fillStyle = '#b4c2d2'; ctx.fillRect(31, 12, 3, 46);
    ctx.restore();
  });
  for (let y = fy; y < fy + fh; y++) if ((y & 3) === 0) { t.mul(32, y, 0.75); t.mul(33, y, 0.75); }
  bmText(t, 'L', fx + 2, fy + 2, F35, [220, 228, 236]);
  t.rect(26, 5, 12, 6, [168, 168, 162]); t.bevel(26, 5, 12, 6, 1.3, 0.55);
  grime(t, fbm(R, 64, 64, 8, 3), [100, 96, 84], 0.25, 0.55);
});

def('crt_screen', 32, 32, {}, (t) => {
  t.each((x, y, o) => {
    const dx = (x + 0.5 - 16) / 16, dy = (y + 0.5 - 16) / 16, r = dx * dx + dy * dy;
    let v = 1 - r * 0.45;
    if (Math.abs(dx) > 0.92 && Math.abs(dy) > 0.92) v = 0.3;
    const refl = Math.max(0, 1 - Math.hypot(dx + 0.45, dy + 0.5) * 2.2) * 30;
    o[0] = 34 * v + refl; o[1] = 44 * v + refl; o[2] = 40 * v + refl * 0.9;
    if (y & 1) { o[0] *= 0.95; o[1] *= 0.95; o[2] *= 0.95; }
  });
  t.mixRect(20, 6, 4, 6, [110, 120, 116], 0.25); t.mixRect(25, 6, 3, 6, [110, 120, 116], 0.2);
  for (let k = 0; k < 18; k++) t.mix(t.ri(2, 29), t.ri(2, 29), [140, 140, 130], 0.3);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if ((x < 1 || x > 30 || y < 1 || y > 30)) t.set(x, y, [18, 18, 18]);
});

def('corkboard', 64, 64, {}, (t) => {
  const R = t.rand, seed = hashStr('corkboard');
  t.each((x, y, o) => { let f = 1 + (R() - 0.5) * 0.28; if (R() < 0.1) f *= 0.7; o[0] = 170 * f; o[1] = 128 * f; o[2] = 82 * f; });
  const sched = subTex(26, 30, seed + 1, (s) => {
    s.fill([226, 222, 206]);
    s.rect(1, 1, 24, 3, [60, 70, 110]);
    for (let y = 6; y < 29; y += 3) for (let x = 1; x < 25; x++) s.set(x, y, [150, 150, 150]);
    for (const x of [1, 7, 13, 19, 24]) for (let y = 6; y < 29; y++) s.set(x, y, [150, 150, 150]);
    for (let k = 0; k < 14; k++) { const x = 2 + s.ri(0, 3) * 6 + s.ri(0, 2), y = 7 + s.ri(0, 7) * 3; s.rect(x, y, s.ri(2, 4), 1, [80, 80, 90]); }
  });
  const memo = (c, k) => subTex(14, 16, seed + 10 + k, (s) => { s.fill(c); for (let y = 3; y < 14; y += 2) for (let x = 2; x < 2 + s.ri(5, 10); x++) s.set(x, y, [90, 90, 100]); s.bevel(0, 0, 14, 16, 1.05, 0.85); });
  const memos = [[226, 222, 210], [230, 218, 140], [224, 184, 182], [190, 210, 226]].map(memo);
  const place = [[18, 21, -0.05, sched], [45, 15, 0.12, memos[0]], [44, 40, -0.18, memos[1]], [19, 48, 0.2, memos[2]], [52, 52, 0.06, memos[3]]];
  t.draw((ctx) => { for (const [x, y, a, cv] of place) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.drawImage(cv, -cv.width / 2, -cv.height / 2); ctx.restore(); } });
  // fade the paper
  const n = fbm(R, 64, 64, 4, 3);
  t.each((x, y, o, i) => { const k = 0.15 + n[i] * 0.2; o[0] = lerp(o[0], 200, k * (o[0] > 190 ? 1 : 0)); });
  for (const [x, y, c] of [[18, 7, [190, 40, 34]], [45, 8, [40, 70, 170]], [44, 33, [40, 140, 60]], [19, 41, [220, 190, 40]], [52, 45, [190, 40, 34]], [9, 30, [40, 70, 170]]]) {
    t.set(x, y, mulc(c, 1.3)); t.set(x + 1, y, c); t.set(x, y + 1, c); t.set(x + 1, y + 1, mulc(c, 0.7)); t.mul(x + 2, y + 2, 0.6);
  }
  for (let k = 0; k < 12; k++) t.set(t.ri(4, 59), t.ri(4, 59), [40, 28, 18]);
  // wooden frame
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const e = Math.min(x, y, 63 - x, 63 - y);
    if (e < 3) { const f = e === 0 ? (x === 63 || y === 63 ? 0.6 : 1.2) : e === 2 ? (x <= 2 || y <= 2 ? 0.7 : 1.1) : 1; t.set(x, y, mulc([132, 96, 60], f * (1 + (R() - 0.5) * 0.08))); }
  }
});

// ============================================================================
// WALL MEDIA
// ============================================================================
def('whiteboard', 128, 64, {}, (t) => {
  const { w, h } = t, R = t.rand;
  t.each((x, y, o) => { const v = (R() - 0.5) * 3; o[0] = 224 + v; o[1] = 228 + v; o[2] = 228 + v; });
  // ghosting of old writing and wipe streaks
  const ghost = sfLayout('MEDS 0800 1400', 22, 44, 1.3, { rand: R, jit: 0.2 }).concat(sfLayout('NPO', 90, 20, 1.6, { rand: R }));
  walkPolys(ghost, 0.5, (x, y) => t.mix(x, y, [190, 196, 200], 0.3));
  const sv = vnoise(R, w, h, 2, 16);
  t.each((x, y, o, i) => { const k = sstep(0.6, 0.8, sv[i]) * 0.08; o[0] = lerp(o[0], 170, k); o[1] = lerp(o[1], 176, k); o[2] = lerp(o[2], 180, k); });
  // printed grid
  const gc = [150, 168, 186];
  for (let r = 0; r <= 5; r++) for (let x = 2; x < 126; x++) t.set(x, 16 + r * 9, gc);
  for (let y = 16; y < 61; y++) for (const x of [17, 64, 81]) t.set(x, y, gc);
  const ink = { k: [30, 30, 38], b: [36, 56, 140], g: [30, 104, 60], r: [190, 32, 30] };
  const hw = sfMeasure('WARD A', 1.8, { gap: 1.2 });
  const head = sfLayout('WARD A', 64 - hw / 2, 3, 1.8, { rand: R, jit: 0.1, gap: 1.2, slant: 0.06 });
  markerLines(t, head, 0.8, ink.b);
  markerLines(t, [[64 - hw / 2 - 2, 14.5, 64 + hw / 2 + 3, 14]], 0.5, ink.b);
  const rows = [['101', 'HALLORAN', 'k'], ['102', '—', 'k'], ['103', 'OKAFOR', 'b'], ['104', '—', 'k'], ['105', 'PIKE', 'k'],
    ['106', 'DUVAL', 'b'], ['107', '—', 'k'], ['108', '? ? ?', 'k'], ['109', 'MARSH', 'g'], ['110', '—', 'k']];
  rows.forEach(([num, name, c], k) => {
    const col2 = k >= 5, r = k % 5, x0 = col2 ? 66 : 2, y0 = 16 + r * 9;
    bmText(t, num, x0 + 2, y0 + 2, F35, [60, 64, 74]);
    if (name === '—') { markerLines(t, [[x0 + 20, y0 + 5, x0 + 30, y0 + 4.6]], 0.5, ink[c]); return; }
    const p = sfLayout(name, x0 + 18, y0 + 1.6, 1.04, { rand: R, jit: 0.12, gap: 1.15, bounce: 0.15, slant: 0.05 });
    markerLines(t, p, 0.5, ink[c]);
  });
  // smear across DUVAL
  for (let y = 17; y < 25; y++) for (let x = 82; x < 124; x++) {
    const c = t.get(x, y);
    if (c[0] < 120 && R() < 0.55) { t.set(x, y, [150, 158, 170]); for (let k = 1; k < t.ri(2, 6); k++) t.mix(x + k, y, [120, 130, 156], 0.35); }
  }
  for (let y = 18; y < 24; y++) for (let x = 84; x < 122; x++) if (R() < 0.12) t.mix(x, y, [170, 176, 186], 0.5);
  // red loop around the 108 row
  const loop = [];
  for (let a = -0.4; a <= TAU + 0.5; a += 0.08) loop.push(95 + Math.cos(a) * (31 + Math.sin(a * 3) * 0.6), 38.5 + Math.sin(a) * 6.2 + (a > TAU ? 1.2 : 0));
  markerLines(t, [loop], 0.75, ink.r);
  // aluminium frame + tray
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = Math.min(x, y, w - 1 - x);
    if (y >= 61) { const v = y === 61 ? 210 : y === 62 ? 160 : 110; t.set(x, y, [v, v + 2, v + 4]); continue; }
    if (e < 2) { const v = (e === 0 ? (x === w - 1 ? 120 : 196) : 168) + (R() - 0.5) * 6; t.set(x, y, [v, v + 2, v + 4]); }
  }
  for (const [x, c] of [[96, ink.b], [106, ink.k]]) { t.rect(x, 61, 8, 1, c); t.rect(x, 62, 8, 1, mulc(c, 0.7)); }
  grime(t, fbm(R, w, h, 8, 3), [150, 150, 140], 0.25, 0.55);
});

function agePoster(t, o = {}) {
  const { w, h } = t, R = t.rand, n = fbm(R, w, h, 4, 3), g = fbm(R, w, h, 8, 3), paper = o.paper || [222, 214, 190];
  t.each((x, y, c, i) => {
    const f = (o.fade ?? 0.14) + n[i] * 0.2;
    for (let k = 0; k < 3; k++) c[k] = lerp(c[k], paper[k], f);
    const gk = clamp((g[i] - 0.5) * 1.5 + (y / h) * 0.25, 0, 1) * 0.3;
    c[0] = lerp(c[0], 128, gk); c[1] = lerp(c[1], 110, gk); c[2] = lerp(c[2], 80, gk);
  });
  for (let k = 0; k < 16; k++) { const x = t.ri(1, w - 2), y = t.ri(1, h - 2); t.mix(x, y, [150, 110, 64], 0.5); }
  for (let x = 0; x < w; x++) { t.mul(x, h >> 1, 0.9); t.mul(x, (h >> 1) + 1, 1.05); }
  for (let y = 0; y < h; y++) { t.mul(w >> 1, y, 0.93); t.mul((w >> 1) + 1, y, 1.03); }
  // tape on the top corners
  t.mixRect(1, 0, 7, 4, [236, 228, 180], 0.45); t.mixRect(w - 8, 0, 7, 4, [236, 228, 180], 0.45);
  // torn corner shows the wall
  const tc = o.torn ?? 7;
  for (let y = h - tc; y < h; y++) for (let x = w - tc; x < w; x++) {
    const d = (x - (w - tc)) + (y - (h - tc)) - tc + ((x * 7 + y * 3) % 3);
    if (d > 0) t.set(x, y, [204, 196, 172]); else if (d > -2) t.mix(x, y, [246, 242, 230], 0.6);
  }
  const F = blobField(t, 8, h - 12, 10, 9, fbm(R, w, h, 8, 3), 0.4);
  tideStain(t, F, { tint: [180, 150, 100], ring: [140, 104, 60], k: 0.3, ringK: 0.5, levels: [0, 0.35] });
  // outer edge shadow
  for (let x = 0; x < w; x++) t.mul(x, h - 1, 0.85); for (let y = 0; y < h; y++) t.mul(w - 1, y, 0.85);
}

def('poster_wash', 64, 96, {}, (t) => {
  t.fill([226, 222, 204]);
  const band = [58, 122, 142], dk = [40, 92, 112];
  t.rect(2, 2, 60, 30, band);
  t.paint(textMask(64, 96, 'WASH', `bold 17px ${FONT_SANS}`, 32, 5, { align: 'center', maxW: 56 }), [240, 240, 232]);
  bmCenter(t, 'YOUR HANDS', 32, 22, F57, [240, 240, 232]);
  t.draw((c) => {
    c.fillStyle = '#8c9294'; c.fillRect(16, 35, 26, 4); c.fillRect(36, 35, 6, 9); c.fillRect(22, 33, 6, 2);
    c.fillStyle = '#3a8aa4';
    for (const [x, y] of [[39, 49], [35, 53], [42, 55]]) { c.beginPath(); c.moveTo(x, y - 4); c.quadraticCurveTo(x + 2.6, y, x, y + 2); c.quadraticCurveTo(x - 2.6, y, x, y - 4); c.fill(); }
    const hand = (x, y, a, s) => {
      c.save(); c.translate(x, y); c.rotate(a); c.scale(s, 1); c.fillStyle = '#285c70';
      c.beginPath(); c.ellipse(0, 4, 7, 7.5, 0, 0, TAU); c.fill();
      for (let k = 0; k < 4; k++) { c.fillRect(-6 + k * 3.3, -9 + Math.abs(k - 1.5) * 1.6, 2.6, 12); c.beginPath(); c.arc(-4.7 + k * 3.3, -9 + Math.abs(k - 1.5) * 1.6, 1.3, 0, TAU); c.fill(); }
      c.save(); c.translate(6, 4); c.rotate(-0.8); c.fillRect(0, -1.5, 8, 3); c.restore();
      c.restore();
    };
    hand(25, 68, -0.35, 1); hand(40, 68, 0.35, -1);
    c.strokeStyle = '#3a8aa4'; c.lineWidth = 1;
    for (const [x, y, r] of [[16, 56, 2], [50, 60, 2.5], [47, 50, 1.5], [14, 66, 1.5]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
  });
  bmCenter(t, 'SOAP + WATER', 32, 79, F35, dk);
  bmCenter(t, '20 SECONDS', 32, 85, F35, dk);
  t.rect(10, 91, 44, 1, dk);
  agePoster(t, { paper: [222, 216, 196] });
});

def('poster_quiet', 64, 96, {}, (t) => {
  const navy = [38, 48, 82], red = [184, 62, 44];
  t.fill([230, 216, 176]);
  for (let y = 0; y < 96; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 38);
    if (d < 19) t.set(x, y, red); else if (d < 24 && (d - 19) / 5 < bayer(x, y) * ((x + y) & 1 ? 1 : 0.5)) t.set(x, y, red);
  }
  t.draw((c) => {
    c.fillStyle = 'rgb(38,48,82)';
    c.beginPath(); c.ellipse(32, 66, 22, 12, 0, Math.PI, TAU); c.fill(); c.fillRect(10, 64, 44, 3);
    c.fillRect(26, 46, 9, 16);
    c.beginPath(); c.arc(30, 38, 10.5, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(39, 34); c.lineTo(43.5, 40); c.lineTo(40, 41); c.lineTo(41, 46); c.lineTo(36, 49); c.fill();
    c.beginPath(); c.ellipse(24, 36, 7, 10, 0.3, 0, TAU); c.fill();
    c.fillStyle = 'rgb(238,234,222)';
    c.beginPath(); c.moveTo(19, 30); c.lineTo(37, 28); c.lineTo(36, 21); c.lineTo(21, 22); c.closePath(); c.fill();
    c.fillStyle = 'rgb(184,62,44)'; c.fillRect(27, 23, 4, 2); c.fillRect(28, 22, 2, 4);
    c.fillStyle = 'rgb(226,190,160)'; c.fillRect(42, 33, 2.5, 11); c.beginPath(); c.ellipse(42.5, 47, 3.5, 4, 0, 0, TAU); c.fill();
  });
  t.paint(textMask(64, 96, 'QUIET', `bold 19px ${FONT_SANS}`, 32, 70, { align: 'center', maxW: 56 }), navy);
  const pm = bmMask(64, 96, 'PLEASE', Math.round(32 - bmWidth('PLEASE', F57, { bold: true }) / 2), 86, F57, { bold: true });
  t.paint(pm, red);
  for (let x = 2; x < 62; x++) { t.set(x, 2, navy); t.set(x, 93, navy); } for (let y = 2; y < 94; y++) { t.set(2, y, navy); t.set(61, y, navy); }
  agePoster(t, { paper: [226, 212, 176], fade: 0.18, torn: 0 });
});

def('poster_missing', 64, 96, {}, (t) => {
  const R = t.rand;
  t.each((x, y, o) => { const e = Math.min(x, 63 - x) / 32; const v = 222 + e * 14 + (R() - 0.5) * 8; o[0] = v; o[1] = v; o[2] = v - 4; if (R() < 0.03) { o[0] = o[1] = o[2] = 120; } });
  t.paint(textMask(64, 96, 'MISSING', `900 16px ${FONT_HEAVY}`, 32, 3, { align: 'center', maxW: 60, thr: 120 }), [16, 16, 16]);
  // grainy photocopied portrait
  const px = 13, py = 18, pw = 38, ph = 37;
  const pc = subTex(pw, ph, 77, (s) => {
    s.fill([128, 128, 128]);
    s.draw((c) => {
      c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, pw, ph);
      c.fillStyle = '#2a2a2a'; c.beginPath(); c.ellipse(19, 40, 17, 12, 0, 0, TAU); c.fill();
      c.fillStyle = '#c8c8c8'; c.beginPath(); c.ellipse(19, 18, 8, 10.5, 0, 0, TAU); c.fill(); c.fillRect(16, 26, 6, 6);
      c.fillStyle = '#222'; c.beginPath(); c.ellipse(19, 10, 9.5, 5.5, 0, Math.PI, TAU); c.fill(); c.fillRect(10, 9, 3, 9); c.fillRect(25, 9, 3, 7);
      c.fillStyle = '#3a3a3a'; c.fillRect(15, 16, 3, 2); c.fillRect(21, 16, 3, 2); c.fillRect(17, 24, 5, 1); c.fillRect(19, 18, 1, 4);
      c.fillStyle = '#6a6a6a'; c.fillRect(13, 15, 12, 1);
    });
  });
  t.draw((c) => c.drawImage(pc, px, py));
  for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) {
    const v = t.get(x, y)[0] + (R() - 0.5) * 70, q = v / 255, b = bayer(x, y);
    const o = q > 0.62 + b * 0.25 ? 214 : q > 0.3 + b * 0.25 ? 120 : 34;
    t.set(x, y, [o, o, o]);
  }
  for (let x = px - 1; x <= px + pw; x++) { t.set(x, py - 1, [20, 20, 20]); t.set(x, py + ph, [20, 20, 20]); }
  for (let y = py - 1; y <= py + ph; y++) { t.set(px - 1, y, [20, 20, 20]); t.set(px + pw, y, [20, 20, 20]); }
  bmCenter(t, 'KYLE R.', 32, 58, F57, [18, 18, 18], { bold: true });
  bmCenter(t, 'LAST SEEN', 32, 67, F57, [30, 30, 30]);
  bmCenter(t, 'OCT 2021', 32, 75, F57, [30, 30, 30]);
  // tear-off tabs
  for (let x = 0; x < 64; x++) t.set(x, 84, (x & 1) ? [70, 70, 70] : [200, 200, 196]);
  for (let k = 0; k < 8; k++) {
    const x0 = k * 8;
    if (k === 2 || k === 5) { // torn off
      for (let y = 85; y < 96; y++) for (let x = x0; x < x0 + 8; x++) t.set(x, y, [204, 196, 172]);
      for (let x = x0; x < x0 + 8; x++) { t.set(x, 85 + ((x * 5) % 3 === 0 ? 1 : 0), [236, 236, 232]); t.mul(x, 87, 0.85); }
      continue;
    }
    for (let y = 85; y < 96; y++) { t.set(x0, y, [150, 150, 148]); if (y > 86 && y < 95 && (y & 1)) t.set(x0 + 4, y, [40, 40, 40]); if (y > 87 && y < 94 && !(y & 1)) t.set(x0 + 3, y, [70, 70, 70]); }
  }
  for (let y = 0; y < 84; y++) { t.mul(0, y, 0.8); t.mul(63, y, 0.8); }
  const n = fbm(R, 64, 96, 8, 3);
  grime(t, n, [140, 132, 110], 0.3, 0.55);
  t.mixRect(1, 0, 7, 4, [236, 228, 180], 0.45); t.mixRect(56, 0, 7, 4, [236, 228, 180], 0.45);
});

def('calendar', 32, 48, {}, (t) => {
  const R = t.rand;
  t.each((x, y, o) => { const v = (R() - 0.5) * 5; o[0] = 228 + v; o[1] = 226 + v; o[2] = 214 + v; });
  t.rect(1, 2, 30, 18, [168, 42, 34]);
  bmCenter(t, 'MARCH', 16, 4, F57, [240, 232, 220]);
  bmCenter(t, '1998', 16, 12, F57, [240, 232, 220]);
  t.rect(15, 0, 2, 1, [60, 54, 46]);
  bmText(t, 'SMTWTFS', 2, 21, F35, [70, 70, 76], { sp: 1 });
  for (let r = 0; r <= 5; r++) for (let x = 1; x < 30; x++) t.set(x, 27 + r * 4, [178, 176, 168]);
  for (let c = 0; c <= 7; c++) for (let y = 27; y < 48; y++) t.set(1 + c * 4, y, [178, 176, 168]);
  for (let d = 1; d <= 31; d++) {
    const c = (d - 1) % 7, r = ((d - 1) / 7) | 0, x = 2 + c * 4, y = 28 + r * 4;
    t.set(x, y, [90, 90, 96]); if (d >= 10) t.set(x + 1, y, [90, 90, 96]);
    if (d <= 13) { const k = d === 13 ? [190, 30, 26] : [36, 36, 44]; t.set(x, y, k); t.set(x + 2, y, k); t.set(x + 1, y + 1, k); t.set(x, y + 2, k); t.set(x + 2, y + 2, k); }
  }
  const n = fbm(R, 32, 48, 4, 3);
  grime(t, n, [180, 160, 110], 0.4, 0.45);
  for (let x = 0; x < 32; x++) { t.mul(x, 47, 0.8); } for (let y = 0; y < 48; y++) { t.mul(31, y, 0.85); t.mul(0, y, 0.9); }
});

def('clock', 32, 32, { alpha: true }, (t) => {
  const cx = 16, cy = 16;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > 15.6) continue;
    if (d > 13.4) { const l = -(dx + dy) / d; const v = 44 + Math.max(0, l) * 56 * (d > 14.6 ? 1 : 0.3); t.set(x, y, [v, v, v + 2]); continue; }
    t.set(x, y, [232, 230, 220]);
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU, r0 = k % 3 === 0 ? 9.6 : 11.2;
    line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * 12.4, cy + Math.sin(a) * 12.4, (x, y) => t.set(x, y, [26, 26, 28]));
  }
  const hand = (frac, len, r, c) => { const a = frac * TAU - Math.PI / 2; const m = stampPolys(new Uint8Array(1024), 32, 32, [[cx - Math.cos(a) * 1.5, cy - Math.sin(a) * 1.5, cx + Math.cos(a) * len, cy + Math.sin(a) * len]], r); t.paint(m, c); };
  hand((3 + 7 / 60) / 12, 6.8, 1.05, [24, 24, 26]);
  hand(7 / 60, 10.6, 0.7, [24, 24, 26]);
  hand(41 / 60, 11.2, 0.5, [190, 30, 26]);
  t.rect(15, 15, 2, 2, [30, 30, 30]);
  for (let a = 3.5; a < 4.5; a += 0.05) t.mix(cx + Math.cos(a) * 11.4, cy + Math.sin(a) * 11.4, [255, 255, 255], 0.55);
  const n = fbm(t.rand, 32, 32, 4, 2);
  t.each((x, y, o, i) => { if (!t.a[i]) return false; const k = clamp((n[i] - 0.4) * 0.9, 0, 0.3); o[0] = lerp(o[0], 176, k); o[1] = lerp(o[1], 160, k); o[2] = lerp(o[2], 112, k); });
});

def('cross', 32, 64, { alpha: true }, (t) => {
  const R = t.rand, gv = fbm(R, 32, 64, 16, 2, 0.5, 2), gh = fbm(R, 32, 64, 2, 2, 0.5, 16);
  const beam = (x0, y0, w, h, g) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const f = 1 + (g[y * 32 + x] - 0.5) * 0.4 + (R() - 0.5) * 0.04;
      t.set(x, y, mulc([128, 86, 52], f));
    }
    t.bevel(x0, y0, w, h, 1.3, 0.6);
  };
  beam(12, 2, 8, 60, gv);
  beam(3, 14, 26, 7, gh);
  for (let x = 12; x < 20; x++) { t.mul(x, 21, 0.6); t.mul(x, 22, 0.8); }
});

def('paint_red', 32, 32, { tile: true }, (t) => {
  const R = t.rand, n = fbm(R, 32, 32, 2, 3), base = [170, 34, 28];
  t.each((x, y, o, i) => { const f = 1 + (n[i] - 0.5) * 0.25 + (R() - 0.5) * 0.04; o[0] = base[0] * f; o[1] = base[1] * f; o[2] = base[2] * f; });
  for (let k = 0; k < 4; k++) { const x = t.ri(0, 31), y = t.ri(0, 31); t.set(x, y, [60, 56, 54]); t.set(x + 1, y, [120, 60, 40]); }
  grime(t, fbm(R, 32, 32, 8, 2), [90, 50, 40], 0.3, 0.55);
});
def('dark', 16, 16, { dither: false }, (t) => t.fill([12, 12, 14]));
def('white', 16, 16, { dither: false }, (t) => t.fill([255, 255, 255]));

// ============================================================================
// GRAFFITI painters (driven by GRAFFITI_SPECS)
// ============================================================================
function layoutLines(t, sp, o) {
  const lines = sp.lines.map((l) => (typeof l === 'string' ? { text: l } : { ...l }));
  const gap = o.gap ?? 1.3, gapY = sp.gapY ?? o.gapY ?? 5;
  for (const l of lines) if (!l.s) l.s = sp.s || Math.min(o.maxS ?? 4.2, (t.w * (o.fill ?? 0.86)) / sfMeasure(l.text, 1, { gap }));
  const tot = lines.reduce((a, l) => a + 6 * l.s, 0) + gapY * (lines.length - 1);
  let y = (t.h - tot) / 2 - (o.lift ?? 0);
  for (const l of lines) { l.x = (t.w - sfMeasure(l.text, l.s, { gap })) / 2 + (l.dx || 0); l.y = y + (l.dy || 0); y += 6 * l.s + gapY; }
  return { lines, gap };
}
function loopPts(cx, cy, rx, ry, a0, a1, R, wob = 0.5, step = 0.12) {
  const p = [];
  for (let a = a0; a <= a1; a += step) { const j = (R() - 0.5) * wob; p.push(cx + Math.cos(a) * (rx + j), cy + Math.sin(a) * (ry + j)); }
  return p;
}
const GRAF = {
  spray(t, sp) {
    const c = col(sp.color), { lines, gap } = layoutLines(t, sp, { fill: 0.9, lift: 5, maxS: 4.2 });
    for (const l of lines) {
      const polys = sfLayout(l.text, l.x, l.y, l.s, { rand: t.rand, gap, jit: 0.13, bounce: sp.bounce ?? 0.2, sizeVar: sp.sizeVar ?? 0.06, slope: l.slope || 0, lean: 0.08 });
      const r = sp.r ?? Math.max(1.1, l.s * 0.46);
      markerLines(t, polys, r, c, { var: 0.08 });
      sprayFx(t, polys, r, c, { speck: 0.6, drip: sp.drips ?? 0.03, dripMax: Math.round(l.s * 3.4) });
    }
  },
  marker(t, sp) {
    const c = col(sp.color), { lines, gap } = layoutLines(t, sp, { fill: 0.9, gap: 1.2 });
    for (const l of lines) markerLines(t, sfLayout(l.text, l.x, l.y, l.s, { rand: t.rand, gap, jit: 0.1, bounce: 0.12, slant: 0.1, sizeVar: 0.05, slope: -0.012 }), sp.r ?? 0.8, c, { var: 0.04 });
  },
  scratch(t, sp) {
    const c = col(sp.color), { lines, gap } = layoutLines(t, sp, { fill: 0.86, gap: 1.6 });
    for (const l of lines) {
      const polys = sfLayout(l.text, l.x, l.y, l.s, { rand: t.rand, gap, jit: 0.22, bounce: 0.3, sizeVar: 0.15, lean: 0.12 });
      for (let pass = 0; pass < 2; pass++) markerLines(t, polys.map((p) => p.map((v) => v + (t.r() - 0.5) * 0.9)), 0.5, c, { skip: 0.1, var: 0.15 });
    }
  },
  chalk(t, sp) {
    const { lines, gap } = layoutLines(t, sp, { fill: 0.88 });
    for (const l of lines) chalkLines(t, sfLayout(l.text, l.x, l.y, l.s, { rand: t.rand, gap, jit: 0.15, bounce: 0.2 }), 0.9, sp.color);
  },
  bubble(t, sp) {
    const { w, h } = t, gap = 1.25, rf = sp.rf ?? 3.6, ro = rf + 2.2, sh = 3;
    let s = (w - 2 * ro - sh - 12) / (sfMeasure(sp.text, 1, { gap }) + 0.6);
    s = Math.min(s, (h - 2 * ro - sh - 8) / 6);
    const x = (w - sfMeasure(sp.text, s, { gap }) - sh) / 2, y = (h - 6 * s - sh) / 2 - 1;
    const polys = sfLayout(sp.text, x, y, s, { rand: t.rand, gap, bounce: 0.28, jit: 0.05, lean: 0.07 });
    const O = stampPolys(new Uint8Array(w * h), w, h, polys, ro), F = stampPolys(new Uint8Array(w * h), w, h, polys, rf);
    const S = stampPolys(new Uint8Array(w * h), w, h, polys.map((p) => p.map((v) => v + sh)), ro);
    const outline = col(sp.outline), fill = sp.fill, accent = col(sp.accent), shadow = col(sp.shadow);
    sprayFx(t, polys, ro, outline, { speck: 0.3, spread: 3, drip: 0.006, dripMax: 9 });
    t.paint(S, shadow); t.paint(O, outline);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = yy * w + xx; if (!S[i] || O[i]) continue;
      const nb = (a, b) => { const j = t.idx(a, b); return j >= 0 && (S[j] || O[j]); };
      if (!nb(xx + 1, yy) || !nb(xx, yy + 1) || !nb(xx - 1, yy) || !nb(xx, yy - 1)) t.set(xx, yy, outline);
    }
    const y0 = y + 1, y1 = y + 6 * s;
    t.paintFn(F, (px, py, o) => {
      const v = (py - y0) / (y1 - y0) + (bayer(px, py) - 0.5) * 0.14;
      let c;
      if (fill === 'chrome') c = v < 0.46 ? mixc([238, 242, 250], [140, 152, 176], v / 0.46) : v < 0.53 ? [58, 62, 80] : mixc([184, 156, 120], [236, 224, 200], (v - 0.53) / 0.47);
      else c = v > 0.62 ? accent : col(fill);
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
    // shine on the upper-left inside edge of the fill
    for (let yy = 1; yy < h; yy++) for (let xx = 1; xx < w; xx++) {
      const i = yy * w + xx;
      if (F[i] && !F[i - w - 1] && F[i + 1] && F[i + w] && t.r() < 0.55) t.set(xx + 1, yy + 1, fill === 'chrome' ? [255, 255, 255] : mixc(col(fill), [255, 255, 255], 0.6));
    }
    if (fill === 'chrome') for (const [sx, sy] of [[x + s * 3, y + s], [x + s * 15, y + s * 2.5]]) { const X = Math.round(sx), Y = Math.round(sy); for (let k = -2; k <= 2; k++) { t.set(X + k, Y, [255, 255, 255]); t.set(X, Y + k, [255, 255, 255]); } }
    else for (const [sx, sy] of [[x + s * 2, y + s * 0.8]]) { const X = Math.round(sx), Y = Math.round(sy); t.set(X, Y, [255, 255, 255]); t.set(X + 1, Y, [255, 255, 255]); t.set(X, Y + 1, [255, 255, 255]); }
  },
  handstyle(t, sp) {
    const c = col(sp.color), s = 6.1, gap = 0.55, sx = 0.75, slant = 0.3;
    const tw = sfMeasure(sp.text, s, { gap, sx }) + slant * 6 * s, x0 = (t.w - tw) / 2 + 2, y0 = 11;
    const polys = sfLayout(sp.text, x0, y0, s, { rand: t.rand, slant, sx, gap, jit: 0.1, bounce: 0.22, sizeVar: 0.1 });
    markerLines(t, polys, 1.3, c);
    const sw = [];
    for (let k = 0; k <= 40; k++) { const u = k / 40; sw.push(lerp(x0 - 4, x0 + tw + 6, u), y0 + 6 * s + 5 - Math.sin(u * Math.PI) * 3 - (u > 0.82 ? (u - 0.82) * 50 : 0)); }
    markerLines(t, [sw], 0.95, c);
    const cx = x0 + slant * 6 * s + 6, cy = y0 - 2;
    const crown = [cx - 6, cy, cx - 7, cy - 7, cx - 3, cy - 3, cx, cy - 9, cx + 3, cy - 3, cx + 7, cy - 7, cx + 6, cy, cx - 6, cy];
    markerLines(t, [crown], 0.6, c);
    for (const [dx, dy] of [[-7, -8], [0, -10], [7, -8]]) t.paint(stampPolys(new Uint8Array(t.w * t.h), t.w, t.h, [[cx + dx, cy + dy]], 1.2), c);
    sprayFx(t, polys, 1.3, c, { speck: 0.22, spread: 2.2, drip: 0.012, dripMax: 10 });
  },
  stencil(t, sp) {
    const { w, h } = t, c = col(sp.color), font = `900 25px ${FONT_HEAVY}`;
    const m = textMask(w, h, sp.text, font, w / 2, 9, { align: 'center', maxW: 116, thr: 128 });
    stencilize(m, w, h, 2);
    // arrows row
    const am = new Uint8Array(w * h);
    for (const ax of [14, 50, 86]) { const pm = polyMask(w, h, [ax, 44, ax + 14, 44, ax + 14, 40, ax + 24, 47, ax + 14, 54, ax + 14, 50, ax, 50]); for (let i = 0; i < pm.length; i++) if (pm[i]) am[i] = 1; }
    const n = fbm(t.rand, w, h, 16, 2);
    t.paintFn(m, (x, y, o, i) => { const f = 0.9 + n[i] * 0.2; o[0] = c[0] * f; o[1] = c[1] * f; o[2] = c[2] * f; });
    t.paintFn(am, (x, y, o, i) => { const f = 0.9 + n[i] * 0.2; o[0] = c[0] * f; o[1] = c[1] * f; o[2] = c[2] * f; });
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; if (!(m[i] || am[i])) continue;
      const edge = !(m[i - 1] || am[i - 1]) || !(m[i + 1] || am[i + 1]) || !(m[i - w] || am[i - w]) || !(m[i + w] || am[i + w]);
      if (edge && t.r() < 0.22) { const a = t.r() * TAU, d = 1 + t.r() * 2.5; t.set(x + Math.cos(a) * d, y + Math.sin(a) * d, c); }
      if (n[i] > 0.78 && t.r() < 0.35) t.a[i] = 0;
    }
  },
  names(t) {
    const R = t.rand, red = [196, 36, 40], blk = [26, 26, 30], blu = [40, 70, 170];
    const heart = [];
    for (let a = 0; a <= TAU + 0.15; a += 0.08) { const x = 16 * Math.pow(Math.sin(a), 3), y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); heart.push(64 + x * 1.55 + (R() - 0.5) * 0.5, 19 + y * 1.25 + (R() - 0.5) * 0.5); }
    markerLines(t, [heart], 0.85, red);
    const s1 = 1.75, w1 = sfMeasure('J + M', s1, { gap: 1.2 });
    markerLines(t, sfLayout('J + M', 64 - w1 / 2, 8, s1, { rand: R, gap: 1.2, jit: 0.1, slant: 0.08 }), 0.6, blk);
    const s2 = 1.25, w2 = sfMeasure('2019', s2, { gap: 1.2 });
    markerLines(t, sfLayout('2019', 64 - w2 / 2, 21, s2, { rand: R, gap: 1.2, jit: 0.1 }), 0.5, blk);
    const s3 = 1.75, w3 = sfMeasure('KYLE WAS HERE', s3, { gap: 1.15 });
    markerLines(t, sfLayout('KYLE WAS HERE', 64 - w3 / 2, 44, s3, { rand: R, gap: 1.15, jit: 0.12, bounce: 0.15, slant: 0.1, slope: -0.025 }), 0.75, blu);
  },
  eye(t, sp) {
    const c = col(sp.color), R = t.rand;
    const tri = [32, 7, 57, 50, 7, 50, 32, 7];
    const inTri = (x, y) => { const s = (a, b, cc, d, e, f) => (a - e) * (d - f) - (cc - e) * (b - f); const d1 = s(x, y, 32, 7, 57, 50), d2 = s(x, y, 57, 50, 7, 50), d3 = s(x, y, 7, 50, 32, 7); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
    const rays = [];
    for (let k = 0; k < 11; k++) {
      const a = -Math.PI / 2 + ((k - 5) / 5) * 2.3;
      let r = 4; while (r < 40 && inTri(32 + Math.cos(a) * r, 35 + Math.sin(a) * r)) r += 0.5;
      rays.push([32 + Math.cos(a) * (r + 3), 35 + Math.sin(a) * (r + 3), 32 + Math.cos(a) * (r + 8 + R() * 2), 35 + Math.sin(a) * (r + 8 + R() * 2)]);
    }
    const up = [], lo = [];
    for (let k = 0; k <= 16; k++) { const u = k / 16, x = 17 + u * 30, b = Math.sin(u * Math.PI); up.push(x, 36 - b * 8); lo.push(x, 36 + b * 7); }
    const all = [tri, up, lo];
    markerLines(t, [tri], 1.5, c); markerLines(t, [up, lo], 1.1, c); markerLines(t, rays, 0.9, c);
    const iris = stampPolys(new Uint8Array(4096), 64, 64, [[32, 36.5]], 4.6);
    t.paint(iris, c);
    t.set(30, 34, [210, 210, 206]); t.set(31, 34, [210, 210, 206]); t.set(30, 35, [210, 210, 206]);
    sprayFx(t, all.concat(rays), 1.4, c, { speck: 0.5, drip: 0.03, dripMax: 10 });
  },
  spiral(t, sp) {
    const c = col(sp.color), R = t.rand, p = [];
    for (let a = 0; a < 5.2 * Math.PI; a += 0.1) { const r = 1.5 + a * 1.42 + Math.sin(a * 7) * 0.35; p.push(32 + Math.cos(a) * r, 31 + Math.sin(a) * r); }
    markerLines(t, [p], 1.15, c, { var: 0.12 });
    for (let k = 0; k < 11; k++) { const a = (k / 11) * TAU + R() * 0.2, r = 28.5 + R(); t.paint(stampPolys(new Uint8Array(4096), 64, 64, [[32 + Math.cos(a) * r, 31 + Math.sin(a) * r]], 1.3 + R() * 0.5), c); }
    sprayFx(t, [p], 1.15, c, { speck: 0.06, spread: 1.5, drip: 0.012, dripMax: 8 });
  },
  tally(t, sp) {
    const R = t.rand, n = sp.count || 23, polys = [];
    let k = 0;
    for (let row = 0; row < 3 && k < n; row++) {
      let x = 4 + R() * 2;
      const y = 7 + row * 20 + R() * 2;
      while (k < n && x < 48) {
        const g = Math.min(5, n - k), gx = x;
        for (let j = 0; j < Math.min(4, g); j++, k++) { const tilt = (R() - 0.5) * 2; polys.push([x + tilt * 0.4, y + R() * 2, x - tilt * 0.6, y + 15 + R() * 2]); x += 3.2 + R() * 0.6; }
        if (g === 5) { polys.push([gx - 2, y + 12 + R() * 2, x + 0.5, y + 3 + R() * 2]); k++; }
        x += 5 + R() * 2;
      }
    }
    chalkLines(t, polys, 0.95, sp.color, { gaps: 0.22 });
  },
  arrow(t, sp) {
    const c = col(sp.color), R = t.rand;
    const shaft = [5, 28, 18, 26.5, 32, 27.5, 47, 28.5], head = [37, 17, 51, 28.5, 38, 40];
    markerLines(t, [shaft, head], 2.0, c, { var: 0.1 });
    sprayFx(t, [shaft, head], 2.0, c, { speck: 0.7, drip: 0.04, dripMax: 9 });
    const s = 1.25, tw = sfMeasure('THIS WAY', s, { gap: 1.2 });
    markerLines(t, sfLayout('THIS WAY', 30 - tw / 2, 45, s, { rand: R, gap: 1.2, jit: 0.1 }), 0.6, c);
  },
  sigil(t, sp) {
    const R = t.rand, circ = loopPts(32, 25, 14, 14, -Math.PI / 2, Math.PI * 1.55, R, 0.6, 0.15);
    chalkLines(t, [circ, [31.5, 5, 32.5, 46]], 1.25, sp.color, { gaps: 0.2 });
    for (const x of [23, 32, 41]) chalkLines(t, [[x, 54]], 1.8, sp.color, { gaps: 0.1 });
  },
  circled(t, sp) {
    const c = col(sp.color), R = t.rand, s = 3.4, tw = sfMeasure(sp.text, s);
    const polys = sfLayout(sp.text, 32 - tw / 2, 32 - 3 * s, s, { rand: R, jit: 0.12, bounce: 0.15 });
    markerLines(t, polys, 1.35, c); sprayFx(t, polys, 1.35, c, { speck: 0.4, drip: 0.03, dripMax: 8 });
    const loop = loopPts(32, 32, 27, 19, -2.6, -2.6 + TAU + 0.5, R, 0.6);
    const x1 = [9, 12, 55, 53], x2 = [55, 10, 10, 53];
    markerLines(t, [loop], 1.0, c); markerLines(t, [x1, x2], 1.3, c);
    sprayFx(t, [loop, x1, x2], 1.1, c, { speck: 0.35, drip: 0.02, dripMax: 7 });
  },
  smiley(t, sp) {
    const c = col(sp.color), R = t.rand;
    const ring = loopPts(32, 28, 21, 20, -1.2, -1.2 + TAU + 0.3, R, 0.7);
    const smile = loopPts(32, 26, 12, 12, 0.35, Math.PI - 0.35, R, 0.6);
    const eyes = [[21, 17, 27, 23], [27, 17, 21, 23], [37, 17, 43, 23], [43, 17, 37, 23]];
    markerLines(t, [ring, smile], 1.6, c); markerLines(t, eyes, 1.2, c);
    sprayFx(t, [ring, smile].concat(eyes), 1.5, c, { speck: 0.45, drip: 0.06, dripMax: 15, dripMin: 4 });
  },
};

// ============================================================================
// SIGN painters (driven by SIGN_SPECS)
// ============================================================================
const ICON_W = { arrowL: 14, arrowR: 14, stairs: 16, updown: 10, trefoil: 15, cross: 9, man: 9, woman: 11, redcross: 13 };
const ICONS = {
  arrowL(t, x, cy, fg) { t.paint(polyMask(t.w, t.h, [x, cy, x + 7, cy - 7, x + 7, cy - 3, x + 14, cy - 3, x + 14, cy + 3, x + 7, cy + 3, x + 7, cy + 7]), fg); },
  arrowR(t, x, cy, fg) { t.paint(polyMask(t.w, t.h, [x + 14, cy, x + 7, cy - 7, x + 7, cy - 3, x, cy - 3, x, cy + 3, x + 7, cy + 3, x + 7, cy + 7]), fg); },
  stairs(t, x, cy, fg) { const y = cy - 7; t.paint(polyMask(t.w, t.h, [x, y + 14, x, y + 11, x + 4, y + 11, x + 4, y + 7, x + 8, y + 7, x + 8, y + 3, x + 12, y + 3, x + 12, y, x + 16, y, x + 16, y + 14]), fg); },
  updown(t, x, cy, fg) { t.paint(polyMask(t.w, t.h, [x + 5, cy - 8, x + 10, cy - 2, x, cy - 2]), fg); t.paint(polyMask(t.w, t.h, [x, cy + 2, x + 10, cy + 2, x + 5, cy + 8]), fg); },
  trefoil(t, x, cy) {
    const ox = x + 7.5;
    for (let y = Math.floor(cy - 8); y <= cy + 8; y++) for (let xx = x; xx <= x + 15; xx++) {
      const dx = xx + 0.5 - ox, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d > 7.6) continue;
      let c = [222, 184, 40];
      const a = Math.atan2(dy, dx);
      const near = (b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < Math.PI / 6;
      if (d < 1.7 || (d > 2.6 && d < 6.4 && (near(Math.PI / 2) || near((-5 * Math.PI) / 6) || near(-Math.PI / 6)))) c = [24, 22, 20];
      t.set(xx, y, c);
    }
  },
  cross(t, x, cy, fg) { t.rect(x + 3, Math.round(cy - 8), 3, 16, fg); t.rect(x, Math.round(cy - 4), 9, 3, fg); },
  man(t, x, cy, fg) { t.paint(stampPolys(new Uint8Array(t.w * t.h), t.w, t.h, [[x + 4.5, cy - 7.5]], 1.9), fg); t.rect(x + 2, Math.round(cy - 5), 5, 7, fg); t.rect(x + 2, Math.round(cy + 2), 2, 7, fg); t.rect(x + 5, Math.round(cy + 2), 2, 7, fg); t.rect(x + 1, Math.round(cy - 5), 1, 5, fg); t.rect(x + 7, Math.round(cy - 5), 1, 5, fg); },
  woman(t, x, cy, fg) { t.paint(stampPolys(new Uint8Array(t.w * t.h), t.w, t.h, [[x + 5.5, cy - 7.5]], 1.9), fg); t.paint(polyMask(t.w, t.h, [x + 3.5, cy - 5, x + 7.5, cy - 5, x + 10.5, cy + 4, x + 0.5, cy + 4]), fg); t.rect(x + 3, Math.round(cy + 4), 2, 5, fg); t.rect(x + 6, Math.round(cy + 4), 2, 5, fg); },
  redcross(t, x, cy) { const y = Math.round(cy - 6.5); t.rect(x, y, 13, 13, [232, 228, 216]); t.rect(x + 5, y + 2, 3, 9, [184, 34, 30]); t.rect(x + 2, y + 5, 9, 3, [184, 34, 30]); },
};

function ageSign(t, m, pal, o = {}) {
  const { w, h } = t, R = t.rand, n = o.n || fbm(R, w, h, 4, 2), g = fbm(R, w, h, 8, 2);
  t.each((x, y, c, i) => {
    const fk = (o.fade ?? 0.08) + n[i] * 0.16;
    c[0] = lerp(c[0], 196, fk); c[1] = lerp(c[1], 192, fk); c[2] = lerp(c[2], 180, fk);
    const gk = clamp((g[i] - 0.45) * 1.4 + (y / h) * 0.3, 0, 1) * 0.3;
    c[0] = lerp(c[0], 70, gk); c[1] = lerp(c[1], 60, gk); c[2] = lerp(c[2], 44, gk);
    if (m && m[i] && g[i] > 0.66 && R() < 0.5) { c[0] = lerp(c[0], pal.bg[0], 0.55); c[1] = lerp(c[1], pal.bg[1], 0.55); c[2] = lerp(c[2], pal.bg[2], 0.55); }
  });
  scratches(t, Math.round(w / 32) + 1, 2, 2, w - 2, h - 2, [214, 214, 206], 0.3);
  const corners = [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]];
  const nc = 1 + (R() < 0.5 ? 1 : 0);
  for (let k = 0; k < nc; k++) {
    const [cx, cy, sx, sy] = corners[t.ri(0, 3)], s = t.ri(2, 4);
    for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s - yy; xx++) t.set(cx + sx * xx, cy + sy * yy, xx + yy === s - 1 ? [96, 96, 92] : [172, 172, 166]);
  }
  if (R() < 0.75) {
    const x = R() < 0.5 ? t.ri(2, 8) : t.ri(w - 9, w - 3), y = t.ri(2, h - 6);
    t.set(x, y, [96, 52, 30]); t.set(x + 1, y, [140, 76, 38]); t.set(x, y + 1, [150, 84, 40]);
    streak(t, x, y + 2, t.ri(3, 9), [150, 86, 44], 0.55);
  }
}

function plateSign(t, sp) {
  const { w, h } = t, R = t.rand, pal = SIGN_COLORS[sp.col] || SIGN_COLORS.green, bg = pal.bg, fg = pal.fg;
  const hazard = sp.style === 'hazard', num = sp.style === 'number';
  const n = fbm(R, w, h, 4, 2);
  t.each((x, y, o, i) => { const f = 1 + (n[i] - 0.5) * 0.1 + (R() - 0.5) * 0.03; o[0] = bg[0] * f; o[1] = bg[1] * f; o[2] = bg[2] * f; });
  let ax0, ax1;
  if (hazard) {
    hazardStripes(t, 0, 0, 14, h, 8, fg, bg); hazardStripes(t, w - 14, 0, 14, h, 8, fg, bg);
    for (let y = 0; y < h; y++) { t.set(14, y, fg); t.set(w - 15, y, fg); }
    ax0 = 17; ax1 = w - 17;
  } else {
    const ins = 2;
    for (let x = ins + 1; x < w - ins - 1; x++) { t.set(x, ins, fg); t.set(x, h - ins - 1, fg); }
    for (let y = ins + 1; y < h - ins - 1; y++) { t.set(ins, y, fg); t.set(w - ins - 1, y, fg); }
    ax0 = ins + 3; ax1 = w - ins - 3;
  }
  t.bevel(0, 0, w, h, 1.22, 0.55);
  if (w >= 96 && !hazard) { screw(t, ax0, (h >> 1) - 1); screw(t, ax1 - 2, (h >> 1) - 1); ax0 += 5; ax1 -= 5; }
  const cy = h / 2;
  if (sp.icon) { ICONS[sp.icon](t, ax0 + 1, cy, fg); ax0 += ICON_W[sp.icon] + 4; }
  if (sp.iconR) { ICONS[sp.iconR](t, ax1 - 1 - ICON_W[sp.iconR], cy, fg); ax1 -= ICON_W[sp.iconR] + 4; }
  const avail = ax1 - ax0, cx = (ax0 + ax1) / 2;
  const size = sp.size || (num ? 22 : sp.sub ? 14 : 17), font = `bold ${size}px ${FONT_SANS}`;
  const cap = Math.round(measure(sp.text, font).asc || size * 0.72);
  let subF = null, subH = 0;
  if (sp.sub) { subF = bmWidth(sp.sub, F57) <= avail ? F57 : F35; subH = subF.h + 3; }
  const top = Math.round((h - cap - subH) / 2);
  const m = textMask(w, h, sp.text, font, cx, top, { align: 'center', maxW: avail, thr: 110 });
  t.paint(m, fg);
  if (sp.sub) {
    const sm = bmMask(w, h, sp.sub, Math.round(cx - bmWidth(sp.sub, subF) / 2), top + cap + 3, subF);
    t.paint(sm, fg);
    for (let i = 0; i < m.length; i++) if (sm[i]) m[i] = 1;
  }
  ageSign(t, m, pal, { fade: hazard ? 0.04 : 0.08, n });
}

function floorSign(t, sp) {
  const { w, h } = t, R = t.rand, pal = SIGN_COLORS[sp.col] || SIGN_COLORS.stencil, bg = pal.bg, fg = pal.fg;
  const n = fbm(R, w, h, 4, 3), b = vnoise(R, w, h, 2, 32);
  t.each((x, y, o, i) => { const f = 1 + (n[i] - 0.5) * 0.14 + (b[i] - 0.5) * 0.08 + (R() - 0.5) * 0.04; o[0] = bg[0] * f; o[1] = bg[1] * f; o[2] = bg[2] * f; });
  const seam = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) { seam[20 * w + x] = 1; seam[52 * w + x] = 1; }
  for (let y = 0; y < h; y++) seam[y * w + (y >= 21 && y < 52 ? 44 : 12)] = 1;
  groove(t, seam, 0.78, 1.06);
  const font = `900 46px ${FONT_HEAVY}`;
  const m = textMask(w, h, sp.text, font, w / 2, 6, { align: 'center', maxW: 54, thr: 120 });
  stencilize(m, w, h, 2);
  const sm = bmMask(w, h, sp.sub, Math.round(w / 2 - bmWidth(sp.sub, F57, { bold: true }) / 2), 48, F57, { bold: true });
  for (let i = 0; i < m.length; i++) if (sm[i]) m[i] = 1;
  const g = fbm(R, w, h, 16, 2);
  t.paintFn(m, (x, y, o, i) => { const f = 0.88 + g[i] * 0.22; o[0] = fg[0] * f; o[1] = fg[1] * f; o[2] = fg[2] * f; if (g[i] > 0.74 && R() < 0.6) { o[0] = lerp(o[0], bg[0], 0.7); o[1] = lerp(o[1], bg[1], 0.7); o[2] = lerp(o[2], bg[2], 0.7); } });
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!m[i] || (m[i - 1] && m[i + 1] && m[i - w] && m[i + w])) continue;
    if (R() < 0.3) { const a = R() * TAU, d = 1 + R() * 2; t.mix(x + Math.cos(a) * d, y + Math.sin(a) * d, fg, 0.8); }
  }
  grime(t, fbm(R, w, h, 8, 3), [50, 46, 40], 0.35, 0.5);
}

// stencil bridges: cut a 1-2 px vertical gap above and below every enclosed counter of a text mask
function stencilize(m, w, h, wide = 1) {
  const out = new Uint8Array(w * h), st = [];
  for (let x = 0; x < w; x++) { st.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { st.push(y * w, y * w + w - 1); }
  while (st.length) { const i = st.pop(); if (out[i] || m[i]) continue; out[i] = 1; const x = i % w; if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (i >= w) st.push(i - w); if (i < w * (h - 1)) st.push(i + w); }
  const seen = new Uint8Array(w * h);
  for (let i0 = 0; i0 < w * h; i0++) {
    if (m[i0] || out[i0] || seen[i0]) continue;
    const q = [i0], px = []; seen[i0] = 1;
    while (q.length) { const i = q.pop(); px.push(i); const x = i % w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < w * h && !m[j] && !out[j] && !seen[j]) { seen[j] = 1; q.push(j); } }
    if (px.length < 3) continue;
    let sx = 0, y0 = h, y1 = 0; for (const i of px) { sx += i % w; y0 = Math.min(y0, (i / w) | 0); y1 = Math.max(y1, (i / w) | 0); }
    const cx = Math.round(sx / px.length);
    for (let c = cx; c < cx + wide; c++) {
      for (let y = y0 - 1; y >= 0 && m[y * w + c]; y--) m[y * w + c] = 0;
      for (let y = y1 + 1; y < h && m[y * w + c]; y++) m[y * w + c] = 0;
    }
  }
  return m;
}

function directorySign(t, sp) {
  const { w, h } = t, R = t.rand, felt = SIGN_COLORS.felt, white = felt.fg;
  t.each((x, y, o) => { const v = felt.bg[0] + (R() - 0.5) * 6 - (y % 3 === 0 ? 10 : 0); o[0] = v; o[1] = v - 2; o[2] = v - 2; });
  // header plate
  for (let y = 3; y < 25; y++) for (let x = 3; x < w - 3; x++) { const v = 184 + (R() - 0.5) * 8 + Math.sin(y * 2.1) * 3; t.set(x, y, [v, v + 2, v + 4]); }
  t.bevel(3, 3, w - 6, 22, 1.2, 0.6);
  const ink = [36, 46, 74];
  t.paint(textMask(w, h, sp.header[0], `bold 13px ${FONT_SANS}`, w / 2, 5, { align: 'center', maxW: w - 12 }), ink);
  bmCenter(t, sp.header[1], w / 2, 16, F57, ink);
  // plastic letters with drop shadow
  const letter = (str, x, y, scale, skip, dangle) => {
    const sh = [12, 10, 10];
    bmPlot(str, x, y, F57, { scale }, (px, py, ci) => { if (skip.includes(ci) || dangle.includes(ci)) return; t.set(px + 1, py + 1, sh); });
    bmPlot(str, x, y, F57, { scale }, (px, py, ci) => { if (skip.includes(ci) || dangle.includes(ci)) return; t.set(px, py, white); });
    for (const ci of dangle) {
      const rows = F57.g[str[ci]], ox = x + ci * 6 * scale, oy = y, a = 0.55;
      for (let ry = 0; ry < 7; ry++) for (let rx = 0; rx < 5; rx++) if (rows[ry] & (1 << (4 - rx))) {
        const X = ox + Math.round(rx * Math.cos(a) - ry * Math.sin(a)) + 3, Y = oy + Math.round(rx * Math.sin(a) + ry * Math.cos(a)) + 2;
        t.set(X + 1, Y + 1, sh); t.set(X, Y, white);
      }
    }
  };
  let y = 30;
  sp.floors.forEach((fl, fi) => {
    letter(fl.f, 7, y, 2, [], []);
    const lines = [];
    for (let k = 0; k < fl.items.length; k++) {
      const a = fl.items[k], b = fl.items[k + 1];
      if (b && 24 + bmWidth(a, F57) <= 66 && 74 + bmWidth(b, F57) <= w - 4) { lines.push([[a, k], [b, k + 1]]); k++; } else lines.push([[a, k]]);
    }
    for (const ln of lines) {
      ln.forEach(([str, k], ci) => {
        const dmg = (sp.damage || []).filter((d) => d[0] === fi && d[1] === k);
        letter(str, ci ? 74 : 24, y, 1, dmg.filter((d) => d[3] === 'missing').map((d) => d[2]), dmg.filter((d) => d[3] === 'dangle').map((d) => d[2]));
      });
      y += 10;
    }
    if (fi < sp.floors.length - 1) { for (let x = 8; x < w - 8; x += 2) t.set(x, y, [120, 118, 112]); y += 5; }
  });
  if (sp.footer) bmCenter(t, sp.footer, w / 2, h - 11, F35, [190, 188, 180]);
  // aluminium frame
  for (let yy = 0; yy < h; yy++) for (let x = 0; x < w; x++) {
    const e = Math.min(x, yy, w - 1 - x, h - 1 - yy); if (e > 2) continue;
    const v = (e === 0 ? (x === w - 1 || yy === h - 1 ? 110 : 206) : e === 1 ? 172 : (x === 2 || yy === 2 ? 96 : 190)) + (R() - 0.5) * 6;
    t.set(x, yy, [v, v + 2, v + 4]);
  }
  grime(t, fbm(R, w, h, 8, 3), [90, 80, 60], 0.3, 0.55);
  for (let k = 0; k < 3; k++) streak(t, t.ri(4, w - 4), 3, t.ri(4, 10), [120, 90, 60], 0.4);
}

function signPaint(t, sp) {
  if (sp.style === 'floor') return floorSign(t, sp);
  if (sp.style === 'directory') return directorySign(t, sp);
  return plateSign(t, sp);
}

// Paint a sign spec into any 2D context at (0,0). Same output as the atlas entry for that spec.
export function paintSign(ctx, w, h, spec) {
  const t = new Tex(w, h, hashStr(spec.name || spec.text || 'sign'), false);
  signPaint(t, { ...spec, w, h });
  ctx.putImageData(finish(t, {}), 0, 0);
}

// ============================================================================
// ATLAS
// ============================================================================
function allDefs() {
  const defs = TEXTURES.slice();
  for (const sp of SIGN_SPECS) defs.push({ name: sp.name, w: sp.w || 128, h: sp.h || 32, alpha: false, dither: true, tile: false, paint: (t) => signPaint(t, sp) });
  for (const sp of GRAFFITI_SPECS) defs.push({ name: sp.name, w: sp.w || 128, h: sp.h || 64, alpha: true, dither: true, tile: false, paint: (t) => GRAF[sp.style](t, sp) });
  return defs;
}

export function buildAtlas() {
  const defs = allDefs();
  // first-fit decreasing-height shelf packing, 1024 wide (sizes are known before painting)
  const W = 1024, shelves = [], rects = {};
  const order = defs.slice().sort((a, b) => b.h - a.h || b.w - a.w || (a.name < b.name ? -1 : 1));
  let top = 0;
  for (const it of order) {
    let s = shelves.find((q) => q.h >= it.h && W - q.x >= it.w);
    if (!s) { s = { y: top, h: it.h, x: 0 }; shelves.push(s); top += it.h; }
    rects[it.name] = { x: s.x, y: s.y, w: it.w, h: it.h };
    s.x += it.w;
  }
  const H = top <= 1024 ? 1024 : 2048;
  const img = new ImageData(W, H);
  for (const d of defs) {
    const t = new Tex(d.w, d.h, hashStr(d.name), d.tile);
    d.paint(t, d);
    finish(t, d, img.data, W, rects[d.name].x, rects[d.name].y);
  }
  const canvas = mkCanvas(W, H);
  canvas.getContext('2d').putImageData(img, 0, 0);
  return { canvas, rects };
}
