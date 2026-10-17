// Props B — shared pixel kit. Mirrors the props-A conventions (same outline colours, shadow
// alphas, footprint-space addressing, top-left light) so both prop groups read as one language,
// and adds what group B needs: blob shading for organic masses (husks, coal, mats, wool, bushes),
// a red under-light pass for the Breaker, crisp dithered glows and pixel tints.
//
// Coordinates: a K canvas is addressed in FOOTPRINT space — (0,0) is the top-left of the prop's
// footprint (wall props: the top-left of the face_low cell, face_high is y -16..-1; 1×2 door props:
// y 0..15 face_high, 16..31 face_low). The canvas may start above/left of that (ox/oy, usually
// negative) and getProp returns those offsets directly.
import { PAL, mix, darken, lighten, hexToRgb } from './palette.js';
import { makeCanvas, ctxOf, rng, BAYER4, tinyText } from './util.js';

export { PAL, mix };
export const OUT = '#0d0a0e';          // outline (warm near-black, same as props A / characters)
export const OUT_LIT = '#1e1719';      // outline on the lit side
export const SHADOW = 'rgba(6,5,10,0.42)';
export const SHADOW_SOFT = 'rgba(6,5,10,0.24)';
export const lt = (c, t) => lighten(c, t);
export const dk = (c, t) => darken(c, t);
export const bay = (x, y) => BAYER4[y & 3][x & 3] / 16;
export const cv = (clean, a, b) => (clean ? a : b);

export function seedOf(...parts) {
  let h = 2166136261 >>> 0;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Ramp of n colours from dark to light through the given stops. */
export function ramp(stops, n = 5) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (stops.length - 1);
    const a = Math.floor(t), b = Math.min(stops.length - 1, a + 1);
    out.push(mix(stops[a], stops[b], t - a));
  }
  return out;
}
const rgbCache = new Map();
export function rgbOf(hex) { let v = rgbCache.get(hex); if (!v) { v = hexToRgb(hex); rgbCache.set(hex, v); } return v; }

export class K {
  constructor(w, h, ox = 0, oy = 0, seed = 1) {
    this.w = w; this.h = h; this.ox = ox; this.oy = oy;
    this.c = makeCanvas(w, h);
    this.x = ctxOf(this.c);
    this.r = rng(seed);
    this.shadows = [];
  }
  // ---- primitives (footprint coords, integer, crisp) ----
  R(x, y, w, h, c) { if (w <= 0 || h <= 0) return; this.x.fillStyle = c; this.x.fillRect(Math.round(x - this.ox), Math.round(y - this.oy), w | 0, h | 0); }
  P(x, y, c) { this.R(x, y, 1, 1, c); }
  H(x, y, w, c) { this.R(x, y, w, 1, c); }
  V(x, y, h, c) { this.R(x, y, 1, h, c); }
  clear(x, y, w = 1, h = 1) { this.x.clearRect(Math.round(x - this.ox), Math.round(y - this.oy), w, h); }
  frame(x, y, w, h, c) { this.H(x, y, w, c); this.H(x, y + h - 1, w, c); this.V(x, y, h, c); this.V(x + w - 1, y, h, c); }
  L(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { this.P(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  /** Thick line (square brush). */
  LT(x0, y0, x1, y1, t, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n; this.R(Math.round(x - t / 2 + 0.01), Math.round(y - t / 2 + 0.01), t, t, c); }
  }
  E(cx, cy, rx, ry, c) {
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1))));
      this.R(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1, c);
    }
  }
  /** Ellipse outline (ring), crisp. */
  ring(cx, cy, rx, ry, c, step = 0.04) {
    const seen = new Set();
    for (let a = 0; a < Math.PI * 2; a += step) {
      const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
      const k = x * 4096 + y; if (seen.has(k)) continue; seen.add(k); this.P(x, y, c);
    }
  }
  poly(pts, c) {
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
  /** Ordered-dither colour over a rect (ratio = share). Anchored to footprint space. */
  D(x, y, w, h, c, ratio) {
    if (ratio <= 0) return;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (bay(x + i, y + j) < ratio) this.P(x + i, y + j, c);
  }
  DV(x, y, w, h, c, r0, r1) {
    for (let j = 0; j < h; j++) { const t = h <= 1 ? r1 : r0 + (r1 - r0) * (j / (h - 1)); for (let i = 0; i < w; i++) if (bay(x + i, y + j) < t) this.P(x + i, y + j, c); }
  }
  DH(x, y, w, h, c, r0, r1) {
    for (let i = 0; i < w; i++) { const t = w <= 1 ? r1 : r0 + (r1 - r0) * (i / (w - 1)); for (let j = 0; j < h; j++) if (bay(x + i, y + j) < t) this.P(x + i, y + j, c); }
  }
  /** Dithered disc (falloff to the rim). */
  DE(cx, cy, rx, ry, c, r0 = 1, r1 = 0) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const d = Math.sqrt((x * x) / (rx * rx || 1) + (y * y) / (ry * ry || 1));
      if (d > 1) continue;
      if (bay(cx + x, cy + y) < r0 + (r1 - r0) * d) this.P(cx + x, cy + y, c);
    }
  }
  S(x, y, w, h, c, density) {
    const n = Math.round(w * h * density);
    for (let i = 0; i < n; i++) this.P(x + Math.floor(this.r() * w), y + Math.floor(this.r() * h), c);
  }
  A(x, y, w, h, rgba) { this.R(x, y, w, h, rgba); }
  ri(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }
  chance(p) { return this.r() < p; }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  text(x, y, s, c) { return tinyText(this.x, Math.round(x - this.ox), Math.round(y - this.oy), s, c); }
  /** Draw another canvas (or K) at footprint coords. */
  blit(src, x, y, alpha = 1) {
    const cnv = src.c || src;
    this.x.save(); this.x.globalAlpha = alpha;
    this.x.drawImage(cnv, Math.round(x - this.ox), Math.round(y - this.oy));
    this.x.restore();
  }
  /** Same-size scratch layer in the same footprint space (for translucent parts). */
  layer() { const l = new K(this.w, this.h, this.ox, this.oy, (this.r() * 1e9) | 0); return l; }

  // ---- materials ----
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
  grime(x, y, w, h, amt = 1, col = 'rgba(16,10,8,0.32)') {
    this.S(x, y, w, h, col, 0.05 * amt);
    for (let j = 0; j < h; j++) { const t = (j / Math.max(1, h - 1)) * 0.35 * amt; for (let i = 0; i < w; i++) if (bay(x + i, y + j) < t * 0.6) this.P(x + i, y + j, col); }
  }
  rust(x, y, w, h, n = 3) {
    for (let i = 0; i < n; i++) {
      const cx = x + Math.floor(this.r() * w), cy = y + Math.floor(this.r() * h);
      const s = 1 + Math.floor(this.r() * 2);
      for (let k = 0; k < s * 3; k++) {
        const px = cx + Math.floor(this.r() * (s * 2 + 1)) - s, py = cy + Math.floor(this.r() * (s * 2 + 1)) - s;
        if (px >= x && py >= y && px < x + w && py < y + h) this.P(px, py, this.r() < 0.5 ? PAL.rust : mix(PAL.rust, PAL.brown_d, 0.5));
      }
    }
  }
  drip(x, y, len, c = 'rgba(135,70,40,0.55)') {
    for (let j = 0; j < len; j++) { this.P(x, y + j, c); if (j < len * 0.4 && this.r() < 0.4) this.P(x + 1, y + j, c); }
  }
  /** 3/4 box: top face (depth d) over a front face (height h). */
  box(x, y, w, d, h, { top, front, side = null, lip = null, under = null, left = true } = {}) {
    if (d > 0) { this.R(x, y, w, d, top); this.H(x, y, w, lt(top, 0.1)); }
    this.R(x, y + d, w, h, front);
    if (lip !== false) this.H(x, y + d, w, lip || lt(front, 0.12));
    if (under !== false && h > 2) this.H(x, y + d + h - 1, w, under || dk(front, 0.3));
    if (side) this.V(x + w - 1, y + d, h, side);
    if (left) this.V(x, y + d, h, lt(front, 0.06));
  }
  /** Reflective dark glass: cold base + diagonal highlight streaks. */
  glass(x, y, w, h, { base = mix(PAL.blue_dd, PAL.navy_d, 0.5), streak = PAL.moon_l, faint = PAL.blue_l, clean = false, seed = 0 } = {}) {
    this.R(x, y, w, h, base);
    this.DV(x, y, w, h, mix(base, PAL.blue_d, 0.7), 0.0, 0.45);
    const s0 = Math.floor(w * 0.25) + (seed % 3);
    for (let j = 0; j < h; j++) {
      const sx = x + s0 + Math.floor(j * -0.6) + Math.floor(h * 0.5);
      for (let k = 0; k < 2; k++) { const xx = sx + k; if (xx >= x && xx < x + w) this.P(xx, y + j, k === 0 ? streak : faint); }
      const sx2 = sx + 4 + (w > 14 ? 3 : 0);
      if (sx2 >= x && sx2 < x + w && (j & 1) === 0) this.P(sx2, y + j, faint);
    }
    this.H(x, y, w, mix(base, PAL.moon, clean ? 0.55 : 0.4));
  }
  shadow(x, y, w, h, c = SHADOW) { this.shadows.push([x, y, w, h, c]); }
  /** Soft elliptical contact shadow (dithered, two densities). */
  shadowE(cx, cy, rx, ry, c = SHADOW) { this.shadows.push(['e', cx, cy, rx, ry, c]); }

  // ---- pixel passes ----
  /** Run fn(r,g,b,a,x,y) → [r,g,b,a]|null over pixels in a footprint rect (default: all). */
  pixels(fn, x0 = this.ox, y0 = this.oy, w = this.w, h = this.h) {
    const cx = Math.max(0, x0 - this.ox), cy = Math.max(0, y0 - this.oy);
    const cw = Math.min(this.w - cx, w), ch = Math.min(this.h - cy, h);
    if (cw <= 0 || ch <= 0) return;
    const img = this.x.getImageData(cx, cy, cw, ch), d = img.data;
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const k = (j * cw + i) * 4;
      if (!d[k + 3]) continue;
      const o = fn(d[k], d[k + 1], d[k + 2], d[k + 3], cx + i + this.ox, cy + j + this.oy);
      if (o) { d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; if (o[3] !== undefined) d[k + 3] = o[3]; }
    }
    this.x.putImageData(img, cx, cy);
  }
  /** Crisp dithered tint toward colour within a radius (warm light on a surface, fire glow). */
  tint(cx, cy, rx, ry, color, strength = 0.6, levels = 3) {
    const [tr, tg, tb] = rgbOf(color);
    this.pixels((r, g, b, a, x, y) => {
      const d = Math.sqrt(((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry));
      if (d >= 1) return null;
      let s = (1 - d) * strength * levels;
      const base = Math.floor(s); s = base + (bay(x, y) < s - base ? 1 : 0);
      const t = Math.min(1, s / levels) * strength;
      return [r + (tr - r) * t, g + (tg - g) * t, b + (tb - b) * t];
    }, cx - rx, cy - ry, rx * 2 + 1, ry * 2 + 1);
  }
  /**
   * Under-light (the Breaker: a black wooden structure lit red from below). Pixels close to the
   * lowest opaque pixel of their column, and downward-facing edges, are tinted toward `color`;
   * upper parts sink toward near-black. reach = px of falloff above the column bottom.
   */
  underlight(color = PAL.fire, { reach = 18, strength = 0.75, rim = PAL.fire_l, darkenTop = 0.35, floorY = null } = {}) {
    const W = this.w, Hh = this.h;
    const img = this.x.getImageData(0, 0, W, Hh), d = img.data;
    const [tr, tg, tb] = rgbOf(color), [rr, rg, rb] = rgbOf(rim);
    const op = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && d[(y * W + x) * 4 + 3] > 120;
    const bottom = new Int32Array(W).fill(-1);
    for (let x = 0; x < W; x++) for (let y = Hh - 1; y >= 0; y--) if (op(x, y)) { bottom[x] = y; break; }
    const fy = floorY == null ? null : floorY - this.oy;
    for (let x = 0; x < W; x++) {
      if (bottom[x] < 0) continue;
      const by = fy == null ? bottom[x] : Math.max(bottom[x], fy);
      for (let y = 0; y <= bottom[x]; y++) {
        const k = (y * W + x) * 4;
        if (d[k + 3] < 120) continue;
        const dist = by - y;
        let t = Math.max(0, 1 - dist / reach);
        t = Math.pow(t, 1.6) * strength;
        const q = Math.floor(t * 4), f = t * 4 - q;
        t = (q + (bay(x, y) < f ? 1 : 0)) / 4;
        let r = d[k], g = d[k + 1], b = d[k + 2];
        const dt = darkenTop * (1 - t);
        r *= 1 - dt; g *= 1 - dt; b *= 1 - dt;
        r += (tr - r) * t; g += (tg - g) * t; b += (tb - b) * t;
        if (!op(x, y + 1) && dist < reach * 1.6) { const s = 0.55 * Math.max(0.35, 1 - dist / (reach * 1.6)); r += (rr - r) * s; g += (rg - g) * s; b += (rb - b) * s; }
        d[k] = r; d[k + 1] = g; d[k + 2] = b;
      }
    }
    this.x.putImageData(img, 0, 0);
  }
  /** Selective 1-px outline around opaque pixels (lit side slightly lighter). */
  outline(col = OUT, litCol = OUT_LIT, minA = 200) {
    const W = this.w, Hh = this.h;
    const img = this.x.getImageData(0, 0, W, Hh), d = img.data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && d[(y * W + x) * 4 + 3] >= minA;
    const outs = [];
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] >= 40) continue; // only fill empty pixels (never paint over glass/husks)
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
      for (const s of this.shadows) {
        if (s[0] === 'e') {
          const [, cx, cy, rx, ry, c] = s;
          this.x.fillStyle = c;
          for (let y = -ry; y <= ry; y++) {
            const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1))));
            this.x.fillRect(Math.round(cx - w - this.ox), Math.round(cy + y - this.oy), w * 2 + 1, 1);
          }
        } else { const [x, y, w, h, c] = s; this.x.fillStyle = c; this.x.fillRect(x - this.ox, y - this.oy, w, h); }
      }
      this.x.restore();
    }
    return { canvas: this.c, ox: this.ox, oy: this.oy };
  }
}

// ---- blob shading -------------------------------------------------------------------------------
/**
 * Blob: paint material/part ids with simple shapes, then render() shades every part as a soft
 * volume lit from the top-left (cushions, wool folds, husk shells, coal lumps, leaves).
 * Ramps are arrays of colours dark→light. Parts shade independently (a head vs the shoulders).
 */
export class Blob {
  constructor(w, h, ox = 0, oy = 0) {
    this.w = w; this.h = h; this.ox = ox; this.oy = oy;
    this.mat = new Int16Array(w * h).fill(-1);
    this.part = new Int16Array(w * h);
    this.bias = new Float32Array(w * h);
  }
  _i(x, y) { x = Math.round(x - this.ox); y = Math.round(y - this.oy); return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x; }
  set(x, y, m, p = 0, b = 0) { const i = this._i(x, y); if (i >= 0) { this.mat[i] = m; this.part[i] = p; this.bias[i] = b; } }
  get(x, y) { const i = this._i(x, y); return i < 0 ? -1 : this.mat[i]; }
  getPart(x, y) { const i = this._i(x, y); return i < 0 ? -1 : this.part[i]; }
  erase(x, y) { const i = this._i(x, y); if (i >= 0) this.mat[i] = -1; }
  R(x, y, w, h, m, p = 0, b = 0) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, m, p, b); }
  E(cx, cy, rx, ry, m, p = 0, b = 0) {
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1))));
      for (let x = -w; x <= w; x++) this.set(cx + x, cy + y, m, p, b);
    }
  }
  poly(pts, m, p = 0, b = 0) {
    let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const xs = [], yc = y + 0.5;
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) { const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1]); for (let x = xa; x < xb; x++) this.set(x, y, m, p, b); }
    }
  }
  /** Thick stroke. */
  LT(x0, y0, x1, y1, t, m, p = 0, b = 0) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n; this.R(Math.round(x - t / 2 + 0.01), Math.round(y - t / 2 + 0.01), t, t, m, p, b); }
  }
  /**
   * Shade into K (same footprint space). ramps[mat] = colours dark→light.
   * opts.reach: px considered for the volume; opts.vw: weight of the vertical term;
   * opts.edge: extra highlight on the top/left rim; opts.alpha: draw via a layer at that alpha.
   */
  render(k, ramps, { reach = 6, vw = 0.6, edge = 0.5, rim = 0.4, alpha = 1, outline = null, outlineAlpha = 1, flat = null, dither = true } = {}) {
    const W = this.w, H = this.h, M = this.mat, P = this.part;
    const target = alpha < 1 ? k.layer() : k;
    const same = (i, j, x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return false; const q = y * W + x; return M[q] >= 0 && P[q] === P[i]; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, m = M[i];
      if (m < 0) continue;
      const rp = ramps[m]; if (!rp) continue;
      if (flat && flat[m]) { target.P(x + this.ox, y + this.oy, rp[flat[m]]); continue; }
      let aU = 1; while (aU <= reach && same(i, 0, x, y - aU)) aU++;
      let bD = 1; while (bD <= reach && same(i, 0, x, y + bD)) bD++;
      let aL = 1; while (aL <= reach && same(i, 0, x - aL, y)) aL++;
      let bR = 1; while (bR <= reach && same(i, 0, x + bR, y)) bR++;
      let t = vw * (bD / (aU + bD)) + (1 - vw) * (bR / (aL + bR));
      if (aU === 1) t += edge * 0.5;
      if (aL === 1) t += edge * 0.3;
      if (bD === 1) t -= rim * 0.5;
      if (bR === 1) t -= rim * 0.25;
      t += this.bias[i];
      t = Math.max(0, Math.min(0.999, t));
      const n = rp.length, lv = t * (n - 1), lo = Math.floor(lv);
      const idx = dither ? Math.min(n - 1, lo + (bay(x + this.ox, y + this.oy) < lv - lo ? 1 : 0)) : Math.min(n - 1, Math.round(lv));
      target.P(x + this.ox, y + this.oy, rp[idx]);
    }
    if (outline) {
      const outs = [];
      for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
        const inb = (xx, yy) => xx >= 0 && yy >= 0 && xx < W && yy < H && M[yy * W + xx] >= 0;
        if (inb(x, y)) continue;
        if (inb(x - 1, y) || inb(x + 1, y) || inb(x, y - 1) || inb(x, y + 1)) outs.push([x, y]);
      }
      const ol = outlineAlpha < 1 ? target.layer() : target;
      for (const [x, y] of outs) ol.P(x + this.ox, y + this.oy, outline);
      if (ol !== target) target.blit(ol, target.ox, target.oy, outlineAlpha);
    }
    if (target !== k) k.blit(target, k.ox, k.oy, alpha);
    return target;
  }
}

// ---- shared material sets (clean 1979 vs decayed 1996) -----------------------------------------
export function woodSet(clean, tone = 'oak') {
  const base = {
    oak: [PAL.maple, PAL.wood_l, PAL.wood, PAL.wood_d],
    dark: [PAL.wood_l, PAL.wood, PAL.wood_d, PAL.brown_dd],
    maple: [PAL.maple_l, PAL.maple, PAL.wood_l, PAL.wood],
    walnut: [mix(PAL.wood, PAL.brown, 0.4), PAL.wood_d, PAL.brown_d, PAL.brown_dd],
    tar: [mix(PAL.g2, PAL.brown_d, 0.5), mix(PAL.g1, PAL.brown_dd, 0.5), mix(PAL.shadow, PAL.brown_dd, 0.4), PAL.ink],
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
    black: [PAL.g3, PAL.g2, PAL.g1, PAL.shadow],
    blue: [mix(PAL.blue_l, PAL.g5, 0.4), mix(PAL.blue, PAL.g4, 0.4), mix(PAL.blue_d, PAL.g3, 0.4), mix(PAL.blue_dd, PAL.g2, 0.4)],
  }[hue];
  const f = clean ? (c) => lt(c, 0.04) : (c) => mix(c, PAL.g2, 0.15);
  return { hi: f(s[0]), lt: f(s[1]), md: f(s[2]), dk: f(s[3]), dd: f(dk(s[3], 0.4)) };
}
export const CHROME = { hi: PAL.white, lt: PAL.g6, md: PAL.g4, dk: PAL.g3, dd: PAL.g2 };
export const BRASS = { hi: PAL.gold_l, lt: PAL.gold, md: PAL.brass, dk: PAL.brass_d, dd: dk(PAL.brass_d, 0.4) };
export const IRON = { hi: PAL.g4, lt: PAL.g3, md: PAL.g2, dk: PAL.g1, dd: PAL.shadow };
export function stainless(clean) {
  return clean
    ? { hi: PAL.white, lt: PAL.g6, md: mix(PAL.g5, PAL.g6, 0.4), dk: PAL.g4, dd: PAL.g3 }
    : { hi: mix(PAL.g6, PAL.cream_l, 0.3), lt: mix(PAL.g5, PAL.g6, 0.3), md: mix(PAL.g4, PAL.cream_d, 0.2), dk: mix(PAL.g3, PAL.brown_d, 0.15), dd: PAL.g2 };
}
/** Coal (anthracite): glossy black with cold blue-gray glints. */
export const COAL = [PAL.ink, PAL.night, PAL.shadow, mix(PAL.g1, PAL.blue_d, 0.3), mix(PAL.g3, PAL.blue_l, 0.25), mix(PAL.g5, PAL.moon, 0.4)];
export const AMBER = ['#2a1a08', PAL.amber_dd, PAL.amber_d, '#8a5e24', PAL.amber, '#c08a3e', PAL.amber_l, PAL.amber_ll];
export const VELVET = [PAL.blood_d, PAL.velvet_d, PAL.velvet, mix(PAL.velvet, PAL.crimson, 0.5), mix(PAL.crimson, PAL.red_l, 0.25)];
export const NAVY = [PAL.navy_dd, PAL.navy_d, PAL.navy, mix(PAL.navy, PAL.navy_l, 0.5), PAL.navy_l];

/** Paper sheet with faint text lines and an optional curl. */
export function paper(k, x, y, w, h, { col = PAL.paper, lines = PAL.g4, curl = 0, clean = false, lineGap = 2, x0 = 1 } = {}) {
  const c = clean ? col : mix(col, PAL.cream_d, 0.35);
  k.R(x, y, w, h, c);
  k.V(x + w - 1, y + 1, h - 1, dk(c, 0.12));
  k.H(x + 1, y + h - 1, w - 1, dk(c, 0.15));
  if (lines) for (let j = y + 2; j < y + h - 1; j += lineGap) {
    const lw = Math.max(1, w - 2 - x0 - Math.floor(k.r() * 3));
    k.H(x + x0, j, lw, mix(c, lines, 0.55));
  }
  if (curl === 1) { k.clear(x + w - 1, y + h - 1); k.P(x + w - 2, y + h - 2, lt(c, 0.15)); k.P(x + w - 2, y + h - 1, dk(c, 0.3)); k.P(x + w - 1, y + h - 2, dk(c, 0.3)); }
  if (curl === 2) { k.clear(x + w - 1, y); k.P(x + w - 2, y + 1, dk(c, 0.25)); }
  if (!clean) k.S(x, y, w, h, mix(c, PAL.brown, 0.3), 0.04);
}
/** Crisp glow sprite: concentric dithered rings of colours (for lamp lenses, flames, embers). */
export function glowDot(k, cx, cy, r, cols) {
  for (let i = 0; i < cols.length; i++) {
    const rr = r * (1 - i / cols.length);
    k.DE(cx, cy, Math.max(0, Math.round(rr)), Math.max(0, Math.round(rr)), cols[i], 1, i === 0 ? 0.25 : 0.7);
  }
}
/** Rivet row (top-left lit dome). */
export function rivets(k, x, y, n, step, { hi, md, dd }, vertical = false) {
  for (let i = 0; i < n; i++) {
    const px = vertical ? x : x + i * step, py = vertical ? y + i * step : y;
    k.P(px, py, hi); k.P(px + 1, py + 1, dd);
    if (md) k.P(px + 1, py, md);
  }
}
