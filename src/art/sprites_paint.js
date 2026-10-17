// Sprite painter: an indexed 24×32 buffer of (material, tone) pixels. Parts are drawn into a temp
// mask, auto-shaded per part (light from the top-left), composited with an optional cast-shadow
// separation on whatever they overlap, then the frame gets a 1-px colored outline and becomes a canvas.
// Drawing code is written for a canonical orientation; `flip` mirrors every write so left/right
// views share code while shading is still computed in screen space (light always top-left).
import { makeCanvas, ctxOf } from './util.js';
import { hexToRgb, mix } from './palette.js';

export const FW = 24, FH = 32;
const INK = '#07060a';

/** Normalise a material: { ramp: [hex x5 dark→light], outline?, alpha?, noShade? } (or a bare ramp). */
function normMat(m) {
  const o = Array.isArray(m) ? { ramp: m } : { ...m };
  o.rgb = o.ramp.map(hexToRgb);
  const ol = o.outline === undefined ? mix(o.ramp[0], INK, 0.62) : o.outline;
  o.olRgb = ol ? hexToRgb(ol) : null;
  o.a = Math.round((o.alpha ?? 1) * 255);
  o.olA = Math.round((o.outlineAlpha ?? o.alpha ?? 1) * 255);
  return o;
}

export class Painter {
  constructor(mats, { flip = false, w = FW, h = FH } = {}) {
    this.w = w; this.h = h; this.flip = flip;
    this.mats = []; this.idx = {};
    for (const k of Object.keys(mats)) { this.idx[k] = this.mats.length; this.mats.push(normMat(mats[k])); }
    const n = w * h;
    this.mat = new Int16Array(n).fill(-1);
    this.tone = new Int8Array(n);
    this.pid = new Int16Array(n).fill(-1);
    this.mask = new Int8Array(n).fill(-1);
    this.mmat = new Int16Array(n);
    this.npid = 0;
    this.cur = 0;
    this.drawing = false;
    this.ox = 0; this.oy = 0; // translation applied to canonical coords (weight shifts, slumps)
  }
  m(name) { const i = this.idx[name]; if (i === undefined) throw new Error(`sprite mat '${name}'`); return i; }
  has(name) { return this.idx[name] !== undefined; }
  X(x) { x += this.ox; return this.flip ? this.w - 1 - x : x; }

  // ---- mask writes (inside part()) or direct writes (outside) --------------------------------
  /** Plot one pixel in canonical coords. tone may be relative to nothing (absolute 0..4). */
  px(x, y, tone = 2, mat = null) {
    x = Math.round(x); y = Math.round(y) + this.oy;
    if (y < 0 || y >= this.h) return;
    const sx = this.X(x);
    if (sx < 0 || sx >= this.w) return;
    const i = y * this.w + sx;
    const mi = mat === null ? this.cur : (typeof mat === 'number' ? mat : this.m(mat));
    if (this.drawing) { this.mask[i] = tone; this.mmat[i] = mi; }
    else { this.mat[i] = mi; this.tone[i] = tone; this.pid[i] = this.npid++; }
  }
  rect(x, y, w, h, tone = 2, mat = null) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, tone, mat);
  }
  hl(x, y, w, tone, mat) { this.rect(x, y, w, 1, tone, mat); }
  vl(x, y, h, tone, mat) { this.rect(x, y, 1, h, tone, mat); }
  /** Thick line with a square brush (bw×bw, anchored so odd widths centre on the line). */
  line(x0, y0, x1, y1, tone = 2, bw = 1, mat = null) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const off = -((bw - 1) >> 1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.rect(x0 + off, y0 + off, bw, bw, tone, mat);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  poly(points, tone = 2, mat = null) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of points) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = []; const yc = y + 0.5;
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const a = Math.round(xs[i]), b = Math.round(xs[i + 1]);
        for (let x = a; x < b; x++) this.px(x, y, tone, mat);
      }
    }
  }
  ellipse(cx, cy, rx, ry, tone = 2, mat = null) {
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1))));
      for (let x = -w; x <= w; x++) this.px(cx + x, cy + y, tone, mat);
    }
  }
  /** Remove pixels (mask while drawing a part, frame otherwise). */
  erase(x, y, w = 1, h = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const yy = y + j + this.oy, sx = this.X(x + i);
      if (yy < 0 || yy >= this.h || sx < 0 || sx >= this.w) continue;
      const k = yy * this.w + sx;
      if (this.drawing) this.mask[k] = -1; else this.mat[k] = -1;
    }
  }
  /** Is a frame pixel (canonical coords) filled? */
  filled(x, y) {
    y += this.oy;
    const sx = this.X(x);
    if (y < 0 || y >= this.h || sx < 0 || sx >= this.w) return false;
    return this.mat[y * this.w + sx] >= 0;
  }
  /** Shift the tone of an existing frame pixel (canonical coords). */
  shade(x, y, d) {
    y += this.oy;
    const sx = this.X(x);
    if (y < 0 || y >= this.h || sx < 0 || sx >= this.w) return;
    const k = y * this.w + sx;
    if (this.mat[k] >= 0) this.tone[k] = Math.max(0, Math.min(4, this.tone[k] + d));
  }
  /** Template: rows of chars; legend char → [mat, tone] ('.' / ' ' skip). Grouped into one part per mat. */
  tpl(rows, legend, x0, y0, partOpts = {}, order = null) {
    const groups = new Map();
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      for (let i = 0; i < r.length; i++) {
        const e = legend[r[i]];
        if (!e) continue;
        const key = e[2] || e[0];
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push([x0 + i, y0 + j, e[1], e[0]]);
      }
    }
    const keys = order ? order.filter((k) => groups.has(k)).concat([...groups.keys()].filter((k) => !order.includes(k))) : [...groups.keys()];
    for (const k of keys) {
      const pts = groups.get(k);
      const o = partOpts[k] || partOpts['*'] || {};
      this.part(pts[0][3], o, () => { for (const [x, y, t, mt] of pts) this.px(x, y, t, mt); });
    }
  }

  /**
   * Draw one part. opts.shade: false | { L, T, R, B, rw, clamp } edge tone offsets (default light top-left);
   * opts.sep: n → darken pixels of other parts just right/below this part by n tones (cast shadow);
   * opts.sepAll: also left/top; opts.under: only fill where the frame is empty (tucked behind).
   */
  part(matName, opts, fn) {
    this.cur = this.m(matName);
    this.mask.fill(-1);
    this.drawing = true;
    fn(this);
    this.drawing = false;
    const { w, h, mask } = this;
    const sh = opts.shade === false ? null : { L: 1, T: 1, R: -1, B: -1, rw: 1, clamp: 1, ...(opts.shade || {}) };
    const tones = new Int8Array(w * h);
    const inM = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] >= 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (mask[k] < 0) continue;
      let t = mask[k];
      if (sh) {
        let d = 0;
        if (!inM(x - 1, y)) d += sh.L;
        if (!inM(x, y - 1)) d += sh.T;
        let rEdge = false;
        for (let r = 1; r <= sh.rw; r++) if (!inM(x + r, y)) { rEdge = true; break; }
        if (rEdge) d += sh.R;
        if (!inM(x, y + 1)) d += sh.B;
        d = Math.max(-sh.clamp, Math.min(sh.clamp, d));
        t += d;
      }
      tones[k] = Math.max(0, Math.min(4, t));
    }
    const pid = this.npid++;
    const sep = opts.sep || 0;
    const darkened = sep ? new Uint8Array(w * h) : null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (mask[k] < 0) continue;
      if (opts.under && this.mat[k] >= 0) continue;
      this.mat[k] = this.mmat[k]; this.tone[k] = tones[k]; this.pid[k] = pid;
    }
    if (sep) {
      const nb = opts.sepAll ? [[1, 0], [0, 1], [-1, 0], [0, -1]] : [[1, 0], [0, 1]];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (mask[k] < 0 || this.pid[k] !== pid) continue;
        for (const [ox, oy] of nb) {
          const xx = x + ox, yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (this.mat[q] < 0 || this.pid[q] === pid || darkened[q] || mask[q] >= 0) continue;
          darkened[q] = 1;
          this.tone[q] = Math.max(0, this.tone[q] - sep);
        }
      }
    }
    return pid;
  }

  /** Render to a canvas with a 1-px outline (4-neighbour) coloured per material. */
  toCanvas({ outline = true } = {}) {
    const { w, h } = this;
    const c = makeCanvas(w, h);
    const x2 = ctxOf(c);
    const img = x2.createImageData(w, h);
    const d = img.data;
    for (let k = 0; k < w * h; k++) {
      const mi = this.mat[k];
      if (mi < 0) continue;
      const M = this.mats[mi];
      const t = Math.max(0, Math.min(M.rgb.length - 1, this.tone[k]));
      const [r, g, b] = M.rgb[t];
      d[k * 4] = r; d[k * 4 + 1] = g; d[k * 4 + 2] = b; d[k * 4 + 3] = M.a;
    }
    if (outline) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (this.mat[k] >= 0) continue;
        // prefer the neighbour below / right (outline reads as the shadowed side of that part)
        let src = -1;
        for (const [ox, oy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
          const xx = x + ox, yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (this.mat[q] >= 0 && this.mats[this.mat[q]].olRgb) { src = this.mat[q]; break; }
        }
        if (src < 0) continue;
        const M = this.mats[src];
        d[k * 4] = M.olRgb[0]; d[k * 4 + 1] = M.olRgb[1]; d[k * 4 + 2] = M.olRgb[2]; d[k * 4 + 3] = M.olA;
      }
    }
    x2.putImageData(img, 0, 0);
    return c;
  }
}

/** Build a 5-step ramp from a base colour (dark → light). */
export function ramp5(dd, d, b, l, ll) { return [dd, d, b, l, ll]; }
