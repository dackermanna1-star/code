// Props A — shared pixel kit. Every props_a_* module draws through this so proportions, outline
// weight, shading logic and decay read as one language.
//
// Coordinates: a K canvas is addressed in FOOTPRINT space — (0,0) is the top-left of the prop's
// footprint (for wall props: the top-left of the face_low cell; face_high is y -16..-1). The canvas
// itself may start above/left of that (tall art), recorded as ox/oy so getProp returns them directly.
// Light comes from the top-left: top faces lightest, left edges catch a highlight, right/bottom
// edges and undersides go dark. Decay (when !clean) is layered on with seeded speckle/dither.
import { PAL, mix, darken, lighten } from './palette.js';
import { makeCanvas, ctxOf, rng, BAYER4, tinyText } from './util.js';

// Glyph overrides for the shared 3×5 font where the stock shape misreads at prop scale; M, N, W
// get 4-px-wide forms (rows are strings of '0'/'1', width = row length).
export const GLYPH_FIX = {
  "'": ['001', '010', '000', '000', '000'], G: ['111', '100', '101', '101', '111'], Q: ['111', '101', '101', '111', '011'],
  N: ['1001', '1101', '1011', '1001', '1001'], M: ['1001', '1111', '1111', '1001', '1001'], W: ['1001', '1001', '1111', '1111', '1001'],
};
export const glyphW = (ch) => (GLYPH_FIX[ch] ? GLYPH_FIX[ch][0].length : 3);
/** Width in px of 3×5 text drawn with K.T (1-px letter gaps). */
export const textW = (text) => { let w = 0; for (const ch of String(text).toUpperCase()) w += glyphW(ch) + 1; return Math.max(0, w - 1); };
export { PAL, mix, darken, lighten };
export const OUT = '#0d0a0e';        // outline (warm near-black, matches character outlines)
export const OUT_LIT = '#1e1719';    // outline on the lit (top/left) side
export const SHADOW = 'rgba(6,5,10,0.42)';
export const SHADOW_SOFT = 'rgba(6,5,10,0.24)';

const bay = (x, y) => BAYER4[y & 3][x & 3] / 16;
export const lt = (c, t) => lighten(c, t);
export const dk = (c, t) => darken(c, t);

/** Footprint-space canvas. w/h = canvas size; ox/oy = canvas origin relative to footprint. */
export class K {
  constructor(w, h, ox = 0, oy = 0, seed = 1) {
    this.w = w; this.h = h; this.ox = ox; this.oy = oy;
    this.c = makeCanvas(w, h);
    this.x = ctxOf(this.c);
    this.r = rng(seed);
    this.shadows = [];
    this.fw = 0; // when set (= footprint width in px), all x coordinates are mirrored about it
  }
  /** Mirror subsequent drawing horizontally within a footprint of width fw px (0 = off). */
  mirror(fw) { this.fw = fw; return this; }
  // ---- primitives (footprint coords, integer, crisp) ----
  R(x, y, w, h, c) { if (w <= 0 || h <= 0) return; if (this.fw) x = this.fw - x - w; this.x.fillStyle = c; this.x.fillRect((x - this.ox) | 0, (y - this.oy) | 0, w | 0, h | 0); }
  P(x, y, c) { this.R(x, y, 1, 1, c); }
  H(x, y, w, c) { this.R(x, y, w, 1, c); }
  V(x, y, h, c) { this.R(x, y, 1, h, c); }
  frame(x, y, w, h, c) { this.H(x, y, w, c); this.H(x, y + h - 1, w, c); this.V(x, y, h, c); this.V(x + w - 1, y, h, c); }
  L(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { this.P(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  E(cx, cy, rx, ry, c) {
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1))));
      this.R(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1, c);
    }
  }
  /** Even-odd polygon fill. */
  poly(pts, c) {
    if (this.fw) { const fw = this.fw; this.fw = 0; this.poly(pts.map(([x, y]) => [fw - x, y]), c); this.fw = fw; return; }
    let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const xs = [], yc = y + 0.5;
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) { const a = Math.round(xs[i]), b = Math.round(xs[i + 1]); if (b > a) this.R(a, y, b - a, 1, c); }
    }
  }
  /** Ordered-dither colour b over a rect (ratio = share of b). Pattern is anchored to footprint space. */
  D(x, y, w, h, b, ratio) {
    if (ratio <= 0) return;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (bay(x + i, y + j) < ratio) this.P(x + i, y + j, b);
  }
  /** Vertical dither ramp: colour b fades in from ratio r0 (top) to r1 (bottom). */
  DV(x, y, w, h, b, r0, r1) {
    for (let j = 0; j < h; j++) { const t = h <= 1 ? r1 : r0 + (r1 - r0) * (j / (h - 1)); for (let i = 0; i < w; i++) if (bay(x + i, y + j) < t) this.P(x + i, y + j, b); }
  }
  DH(x, y, w, h, b, r0, r1) {
    for (let i = 0; i < w; i++) { const t = w <= 1 ? r1 : r0 + (r1 - r0) * (i / (w - 1)); for (let j = 0; j < h; j++) if (bay(x + i, y + j) < t) this.P(x + i, y + j, b); }
  }
  /** Stepped vertical bands (clean pixel-art gradient): equal bands, a 50% checker row between. */
  bands(x, y, w, h, cols) {
    const n = cols.length, bh = h / n;
    for (let i = 0; i < n; i++) { const y0 = y + Math.round(i * bh), y1 = y + Math.round((i + 1) * bh); this.R(x, y0, w, y1 - y0, cols[i]); }
    for (let i = 1; i < n; i++) { const yy = y + Math.round(i * bh); for (let a = 0; a < w; a++) if ((a + yy) & 1) this.P(x + a, yy, cols[i - 1]); }
  }
  /** Random speckle. */
  S(x, y, w, h, c, density) {
    const n = Math.round(w * h * density);
    for (let i = 0; i < n; i++) this.P(x + Math.floor(this.r() * w), y + Math.floor(this.r() * h), c);
  }
  /** Translucent rect (stains, glass tints, glow). */
  A(x, y, w, h, rgba) { this.R(x, y, w, h, rgba); }
  /** 3×5 caps text at footprint coords; returns width. */
  T(x, y, text, c) {
    let cx = x;
    for (const ch of String(text).toUpperCase()) {
      const g = GLYPH_FIX[ch];
      if (g) { for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '1') this.P(cx + i, y + j, c); }
      else if (this.fw) { /* mirrored text is never wanted */ } else tinyText(this.x, cx - this.ox, y - this.oy, ch, c);
      cx += glyphW(ch) + 1;
    }
    return cx - x - 1;
  }
  /** Digits/caps with a narrow '1' (door plates, locker numbers); returns width. */
  num(x, y, text, c) {
    let cx = x;
    for (const ch of String(text)) {
      if (ch === '1') { this.P(cx + 1, y, c); this.P(cx, y + 1, c); this.P(cx + 1, y + 1, c); this.V(cx + 1, y + 2, 3, c); cx += 3; continue; }
      this.T(cx, y, ch, c); cx += 4;
    }
    return cx - x - 1;
  }
  numWidth(text) { let w = 0; for (const ch of String(text)) w += ch === '1' ? 3 : 4; return Math.max(0, w - 1); }
  /** Shear a region: column i shifts down by fn(i) px; vacated pixels get `fill`. */
  shiftCols(x, y, w, h, fn, fill) {
    const X = x - this.ox, Y = y - this.oy;
    const img = this.x.getImageData(X, Y, w, h), src = new Uint8ClampedArray(img.data);
    for (let i = 0; i < w; i++) {
      const s = fn(i) | 0;
      for (let j = h - 1; j >= 0; j--) {
        const d = (j * w + i) * 4, from = j - s;
        if (from >= 0) { const f = (from * w + i) * 4; for (let k = 0; k < 4; k++) img.data[d + k] = src[f + k]; }
        else for (let k = 0; k < 4; k++) img.data[d + k] = fill[k];
      }
    }
    this.x.putImageData(img, X, Y);
  }
  /** Clear a rect back to transparent. */
  clear(x, y, w, h) { if (this.fw) x = this.fw - x - w; this.x.clearRect(x - this.ox, y - this.oy, w, h); }
  ri(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }
  chance(p) { return this.r() < p; }

  // ---- materials ----
  /** Wood: base + grain streaks along x (or y when vertical). */
  wood(x, y, w, h, base, { dark = dk(base, 0.22), light = lt(base, 0.08), density = 0.5, vertical = false } = {}) {
    this.R(x, y, w, h, base);
    if (!vertical) {
      for (let j = 0; j < h; j++) {
        if (this.r() > density) continue;
        let i = Math.floor(this.r() * w);
        const len = 2 + Math.floor(this.r() * Math.max(2, w * 0.6));
        const c = this.r() < 0.7 ? dark : light;
        for (let k = 0; k < len && i < w; k++, i++) this.P(x + i, y + j, c);
      }
    } else {
      for (let i = 0; i < w; i++) {
        if (this.r() > density) continue;
        let j = Math.floor(this.r() * h);
        const len = 2 + Math.floor(this.r() * Math.max(2, h * 0.6));
        const c = this.r() < 0.7 ? dark : light;
        for (let k = 0; k < len && j < h; k++, j++) this.P(x + i, y + j, c);
      }
    }
  }
  /** Grime: random speckle getting denser toward the bottom, plus a scuffed dithered kick band. */
  grime(x, y, w, h, amt = 1, col = 'rgba(16,10,8,0.32)') {
    this.S(x, y, w, h, col, 0.03 * amt);
    for (let j = 0; j < h; j++) {
      const t = (j / Math.max(1, h - 1)) ** 2 * 0.22 * amt;
      for (let i = 0; i < w; i++) if (this.r() < t) this.P(x + i, y + j, col);
    }
    const kb = Math.min(2, h);
    for (let j = h - kb; j < h; j++) for (let i = 0; i < w; i++) if (bay(x + i, y + j) < 0.35 * amt) this.P(x + i, y + j, col);
  }
  /** Rust bloom: clustered rust/brown pixels. */
  rust(x, y, w, h, n = 3) {
    for (let i = 0; i < n; i++) {
      const cx = x + Math.floor(this.r() * w), cy = y + Math.floor(this.r() * h);
      const s = 1 + Math.floor(this.r() * 2);
      for (let k = 0; k < s * 3; k++) {
        const px = cx + Math.floor(this.r() * (s * 2 + 1)) - s, py = cy + Math.floor(this.r() * (s * 2 + 1)) - s;
        if (px >= x && py >= y && px < x + w && py < y + h) this.P(px, py, this.r() < 0.4 ? mix(PAL.rust, PAL.brown_d, 0.3) : mix(PAL.rust, PAL.brown_dd, 0.55));
      }
    }
  }
  /** Rust streak running down from (x,y). */
  drip(x, y, len, c = 'rgba(135,70,40,0.55)') {
    for (let j = 0; j < len; j++) { this.P(x, y + j, c); if (j < len * 0.4 && this.r() < 0.4) this.P(x + 1, y + j, c); }
  }
  /** A 3/4 box: top face (depth d) over a front face (height h). Shades & lip highlight. */
  box(x, y, w, d, h, { top, front, side = null, lip = null, under = null } = {}) {
    if (d > 0) {
      this.R(x, y, w, d, top);
      this.H(x, y, w, lt(top, 0.1));
    }
    this.R(x, y + d, w, h, front);
    if (lip !== false) this.H(x, y + d, w, lip || lt(front, 0.12));
    if (under !== false && h > 2) this.H(x, y + d + h - 1, w, under || dk(front, 0.3));
    if (side) { this.V(x + w - 1, y + d, h, side); }
    this.V(x, y + d, h, lt(front, 0.06));
  }
  /** Glass that reads as reflective in the dark: deep cold base + diagonal highlight streaks. */
  glass(x, y, w, h, { base = mix(PAL.blue_dd, PAL.navy_d, 0.5), streak = PAL.moon_l, faint = PAL.blue_l, clean = false, seed = 0 } = {}) {
    this.R(x, y, w, h, base);
    this.DV(x, y, w, h, mix(base, PAL.blue_d, 0.7), 0.0, 0.45);
    // two diagonal streaks (bright core + faint companion), top-left light
    const s0 = Math.floor(w * 0.25) + (seed % 3);
    for (let j = 0; j < h; j++) {
      const sx = x + s0 + Math.floor(j * -0.6) + Math.floor(h * 0.5);
      for (let k = 0; k < 2; k++) {
        const xx = sx + k;
        if (xx >= x && xx < x + w) this.P(xx, y + j, k === 0 ? streak : faint);
      }
      const sx2 = sx + 4 + (w > 14 ? 3 : 0);
      if (sx2 >= x && sx2 < x + w && (j & 1) === 0) this.P(sx2, y + j, faint);
    }
    this.H(x, y, w, mix(base, PAL.moon, clean ? 0.55 : 0.4));
  }
  /** Brass/gold glint pixel cluster. */
  glint(x, y, c = PAL.gold_l) { this.P(x, y, c); }

  /** Contact shadow on the floor (drawn under the art at finish). */
  shadow(x, y, w, h, c = SHADOW) { this.shadows.push([this.fw ? this.fw - x - w : x, y, w, h, c]); }

  /** Selective 1-px outline around opaque pixels (lit side slightly lighter). */
  outline(col = OUT, litCol = OUT_LIT) {
    const W = this.w, Hh = this.h;
    const img = this.x.getImageData(0, 0, W, Hh), d = img.data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && d[(y * W + x) * 4 + 3] >= 200;
    const outs = [];
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] >= 200) continue;
      const below = solid(x, y + 1), right = solid(x + 1, y), above = solid(x, y - 1), left = solid(x - 1, y);
      if (below || right || above || left) outs.push([x, y, (below || right) && !(above || left) ? litCol : col]);
    }
    for (const [x, y, c] of outs) { this.x.fillStyle = c; this.x.fillRect(x, y, 1, 1); }
  }
  done({ outline = true } = {}) {
    if (outline) this.outline(typeof outline === 'string' ? outline : OUT);
    if (this.shadows.length) {
      this.x.save();
      this.x.globalCompositeOperation = 'destination-over';
      for (const [x, y, w, h, c] of this.shadows) { this.x.fillStyle = c; this.x.fillRect(x - this.ox, y - this.oy, w, h); }
      this.x.restore();
    }
    return { canvas: this.c, ox: this.ox, oy: this.oy };
  }
}

// ---- shared palettes (clean 1979 vs decayed 1996) --------------------------------------------
export function woodSet(clean, tone = 'oak') {
  const base = {
    oak: [PAL.maple, PAL.wood_l, PAL.wood, PAL.wood_d],
    dark: [PAL.wood_l, PAL.wood, PAL.wood_d, PAL.brown_dd],
    maple: [PAL.maple_l, PAL.maple, PAL.wood_l, PAL.wood],
    walnut: [mix(PAL.wood, PAL.brown, 0.4), PAL.wood_d, PAL.brown_d, PAL.brown_dd],
  }[tone];
  const f = clean ? (c) => c : (c) => mix(c, PAL.g2, 0.18);
  return { hi: f(base[0]), lt: f(base[1]), md: f(base[2]), dk: f(base[3]), dd: f(dk(base[3], 0.35)) };
}
export function steelSet(clean, hue = 'green') {
  const s = {
    green: [mix(PAL.mint, PAL.g5, 0.5), mix(PAL.green_l, PAL.g4, 0.45), mix(PAL.green, PAL.g3, 0.45), mix(PAL.green_d, PAL.g2, 0.45)],
    olive: [PAL.mint, PAL.green_l, PAL.green, PAL.green_d],
    gray: [PAL.g5, PAL.g4, PAL.g3, PAL.g2],
    tan: [mix(PAL.cream_l, PAL.g5, 0.3), mix(PAL.cream, PAL.g4, 0.35), mix(PAL.cream_d, PAL.g3, 0.4), mix(PAL.brown_d, PAL.g2, 0.4)],
    mustard: [PAL.yellow, PAL.mustard, PAL.mustard_d, mix(PAL.mustard_d, PAL.brown_dd, 0.5)],
  }[hue];
  const f = clean ? (c) => lt(c, 0.04) : (c) => mix(c, PAL.g2, 0.15);
  return { hi: f(s[0]), lt: f(s[1]), md: f(s[2]), dk: f(s[3]), dd: f(dk(s[3], 0.4)) };
}
export const CHROME = { hi: PAL.white, lt: PAL.g6, md: PAL.g4, dk: PAL.g3, dd: PAL.g2 };
export const BRASS = { hi: PAL.gold_l, lt: PAL.gold, md: PAL.brass, dk: PAL.brass_d, dd: dk(PAL.brass_d, 0.4) };
export function porcelain(clean) {
  return clean
    ? { hi: PAL.white, lt: lt(PAL.paper, 0.2), md: PAL.g6, dk: PAL.g5, dd: PAL.g4 }
    : { hi: mix(PAL.paper, PAL.white, 0.4), lt: PAL.paper, md: mix(PAL.paper_d, PAL.g5, 0.4), dk: mix(PAL.g5, PAL.cream_d, 0.4), dd: PAL.g4 };
}

// ---- small helpers ----------------------------------------------------------------------------
/** Pick the clean or decayed value. */
export const cv = (clean, a, b) => (clean ? a : b);
/** Seed from parts. */
export function seedOf(...parts) {
  let h = 2166136261 >>> 0;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Paper sheet with optional curl at a corner and faint text lines. */
export function paper(k, x, y, w, h, { col = PAL.paper, lines = PAL.g4, curl = 0, clean = false, tape = false, pin = null, lineGap = 2, x0 = 1 } = {}) {
  const c = clean ? col : mix(col, PAL.cream_d, 0.35);
  k.R(x, y, w, h, c);
  k.V(x + w - 1, y + 1, h - 1, dk(c, 0.12));
  k.H(x + 1, y + h - 1, w - 1, dk(c, 0.15));
  if (lines) for (let j = y + 2; j < y + h - 1; j += lineGap) {
    const lw = Math.max(1, w - 2 - x0 - Math.floor(k.r() * 3));
    k.H(x + x0, j, lw, mix(c, lines, 0.55));
  }
  if (curl === 1) { k.clear(x + w - 1, y + h - 1, 1, 1); k.P(x + w - 2, y + h - 2, lt(c, 0.15)); k.P(x + w - 2, y + h - 1, dk(c, 0.3)); k.P(x + w - 1, y + h - 2, dk(c, 0.3)); }
  if (curl === 2) { k.clear(x + w - 1, y, 1, 1); k.P(x + w - 2, y + 1, dk(c, 0.25)); }
  if (!clean) k.S(x, y, w, h, mix(c, PAL.brown, 0.3), 0.04);
  if (tape) { k.P(x + 1, y, 'rgba(230,220,180,0.6)'); k.P(x + w - 2, y, 'rgba(230,220,180,0.6)'); }
  if (pin) k.P(x + (w >> 1), y, pin);
}
