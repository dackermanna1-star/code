// Stroke-font parsing and word layout.

import { GLYPH_SRC, SYMBOL_SRC } from './glyphs.js';
import { cubicPts, quadPts, rdp, bboxOf } from '../core/geom.js';

const TOKEN = /[MLQCEZ]|-?\d*\.?\d+(?:e-?\d+)?/g;

/** Parse the path mini-language into flat polylines. */
export function parsePath(str, curveSegs = 10) {
  const toks = str.match(TOKEN) || [];
  const polys = [];
  let cur = null;
  let i = 0;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    const t = toks[i++];
    if (t === 'M') {
      cx = num(); cy = num(); sx = cx; sy = cy;
      cur = [cx, cy];
      polys.push(cur);
    } else if (t === 'L') {
      cx = num(); cy = num();
      cur.push(cx, cy);
    } else if (t === 'Q') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num();
      quadPts(cx, cy, x1, y1, x2, y2, Math.max(4, curveSegs >> 1), cur);
      cx = x2; cy = y2;
    } else if (t === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
      cubicPts(cx, cy, x1, y1, x2, y2, x3, y3, curveSegs, cur);
      cx = x3; cy = y3;
    } else if (t === 'E') {
      const ex = num(), ey = num(), rx = num(), ry = num();
      const n = 28;
      cur = [];
      for (let k = 0; k <= n; k++) {
        const a = -Math.PI / 2 - (k / n) * Math.PI * 2;
        cur.push(ex + Math.cos(a) * rx, ey + Math.sin(a) * ry);
      }
      polys.push(cur);
      cx = cur[0]; cy = cur[1];
    } else if (t === 'Z') {
      cur.push(sx, sy);
      cx = sx; cy = sy;
    }
  }
  return polys.filter((p) => p.length >= 4);
}

const glyphCache = new Map();

function parseEntry(src) {
  return {
    w: src.w,
    strokes: src.s.map((s) => parsePath(s)).flat(),
    cuts: (src.cut || []).map((s) => parsePath(s)).flat(),
    holes: (src.hole || []).map((s) => parsePath(s)).flat(),
  };
}

export function glyphVariantCount(ch) {
  const src = GLYPH_SRC[ch];
  return src ? src.length : 0;
}

export function hasGlyph(ch) { return !!GLYPH_SRC[ch]; }

/** Parsed glyph (shared, do not mutate). */
export function getGlyph(ch, variant = 0) {
  const key = ch + '|' + variant;
  let g = glyphCache.get(key);
  if (g) return g;
  const src = GLYPH_SRC[ch] || GLYPH_SRC[' '];
  const v = Math.max(0, Math.min(src.length - 1, variant));
  g = parseEntry(src[v]);
  g.variant = v;
  glyphCache.set(key, g);
  return g;
}

const symCache = new Map();
export function getSymbol(name) {
  let s = symCache.get(name);
  if (s) return s;
  const src = SYMBOL_SRC[name];
  if (!src) return null;
  s = parseEntry(src);
  symCache.set(name, s);
  return s;
}

/**
 * Transform a symbol into wall space. (x, y) = top-left in meters, size = height.
 */
export function placeSymbol(name, x, y, size, rot = 0, flipX = false) {
  const s = getSymbol(name);
  if (!s) return [];
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const cx = (s.w * size) / 2, cy = size / 2;
  return s.strokes.map((p) => {
    const out = new Array(p.length);
    for (let i = 0; i < p.length; i += 2) {
      let lx = p[i] * size - cx;
      if (flipX) lx = -lx;
      const ly = p[i + 1] * size - cy;
      out[i] = x + cx + lx * cs - ly * sn;
      out[i + 1] = y + cy + lx * sn + ly * cs;
    }
    return out;
  });
}

/**
 * Lay out text. Returns letters with strokes in local word space (meters, y down,
 * baseline at y = 0, caps reach y = -h).
 * opt: {
 *   h, wf=0.7, track=0.12 (fraction of h), slant=0,
 *   variant(ch, i) -> index, scale(i, n) -> factor, rot(i) -> radians, bounce(i) -> meters,
 *   baseCurve(xFrac) -> meters, angular: rdp epsilon in glyph units (0 = off)
 *   overlap: extra negative tracking (fraction of h)
 * }
 */
export function layoutText(text, opt) {
  const h = opt.h;
  const wf = opt.wf ?? 0.7;
  const track = opt.track ?? 0.12;
  const slant = opt.slant ?? 0;
  const letters = [];
  let penX = 0;
  const chars = [...text];
  const n = chars.length;
  for (let i = 0; i < n; i++) {
    const ch = chars[i];
    const vi = opt.variant ? opt.variant(ch, i) : 0;
    const g = getGlyph(ch, vi);
    const s = opt.scale ? opt.scale(i, n) : 1;
    const lh = h * s;
    const lw = g.w * wf * lh;
    const by = (opt.bounce ? opt.bounce(i) : 0) + (opt.baseCurve ? opt.baseCurve(i / Math.max(1, n - 1)) : 0);
    const rot = opt.rot ? opt.rot(i) : 0;
    const pivX = penX + lw * 0.5, pivY = by - lh * 0.5;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const xf = (p) => {
      let src = p;
      if (opt.angular) src = rdp(p, opt.angular);
      const out = new Array(src.length);
      for (let k = 0; k < src.length; k += 2) {
        const gx = src[k], gy = src[k + 1];
        const X = penX + gx * wf * lh + slant * (1 - gy) * lh - pivX;
        const Y = by - (1 - gy) * lh - pivY;
        out[k] = pivX + X * cs - Y * sn;
        out[k + 1] = pivY + X * sn + Y * cs;
      }
      return out;
    };
    const strokes = g.strokes.map(xf);
    const L = {
      ch,
      variant: g.variant,
      strokes,
      cuts: g.cuts.map(xf),
      holes: g.holes.map(xf),
      x: penX,
      w: lw,
      h: lh,
      baseY: by,
      rot,
      box: strokes.length ? bboxOf(strokes) : { x0: penX, y0: by - lh, x1: penX + lw, y1: by },
    };
    letters.push(L);
    penX += lw + (track - (opt.overlap || 0)) * h * (opt.trackJitter ? opt.trackJitter(i) : 1);
  }
  const box = bboxOf(letters.flatMap((l) => (l.strokes.length ? l.strokes : [[l.x, l.baseY - l.h, l.x + l.w, l.baseY]])));
  return { letters, box, width: box.x1 - box.x0, height: box.y1 - box.y0 };
}
