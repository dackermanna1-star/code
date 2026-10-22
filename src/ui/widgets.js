// Shared bits for menu screens: header tabs, key hints, vertical option lists, canvas-bag texture.
import { C, F, W, H } from './theme.js';
import { rect, frame, dither, keycap, keycapWidth, triangle, plate, AP, snap, canvas, ctx2d } from './gfx.js';
import { rng, hashStr } from '../art/util.js';

/** Letter-spaced caps for small labels. */
export const spaced = (s) => String(s).toUpperCase().split('').join(' ').replace(/ {3}/g, '   ');

/** A screen title tab (enamel plate) at (x, y). Returns its width. */
export function headerTab(ctx, x, y, label, o = {}) {
  const f = F.small;
  const s = spaced(label);
  const w = snap(f.width(s) + 32), h = 28;
  plate(ctx, x, y, w, h, o.fill ?? '#2b2c33', o.edge ?? '#77767a');
  f.draw(ctx, s, x + 16, y + 4, o.color ?? '#d8d0b8');
  return w;
}

/** Right-aligned key hints along the bottom: [[label, key], ...]. */
export function hints(ctx, list, y = H - 30, right = W - 24, color = C.textMute) {
  const f = F.small;
  let x = right;
  for (const [label, key] of list) {
    const lw = f.width(label);
    f.draw(ctx, label, x - lw, y, color);
    x -= lw + 8;
    const kw = keycapWidth(key, f);
    keycap(ctx, x - kw, y, key, f);
    x -= kw + 22;
  }
  return x + 22; // left edge of the row
}
/** Width of a hints() row (to put a backing plate behind it). */
export function hintsWidth(list) {
  const f = F.small;
  return list.reduce((w, [label, key]) => w + f.width(label) + 8 + keycapWidth(key, f) + 22, -22);
}

/**
 * Vertical option list. items: [{ label, disabled, note, value }]. Draws a red cursor + highlight.
 * Returns the row rects for hit-testing/positioning.
 */
export function optionList(ctx, items, sel, x, y, o = {}) {
  const f = o.font || F.body;
  const rowH = o.rowH || 44, w = o.width || 260;
  const t = o.t || 0;
  items.forEach((it, i) => {
    const ry = y + i * rowH;
    const on = i === sel;
    if (on) {
      rect(ctx, x, ry, w, rowH - AP * 2, 'rgba(232,224,200,0.07)');
      rect(ctx, x, ry, AP, rowH - AP * 2, C.red);
      triangle(ctx, x + 12 + (Math.floor(t * 3) % 2 ? AP : 0), ry + (rowH - AP * 2) / 2 - 6, 6, C.red, 'right');
    }
    const col = it.disabled ? '#4a4850' : on ? C.textHi : C.textDim;
    f.draw(ctx, it.label, x + 40, ry + Math.round((rowH - AP * 2 - f.lineHeight) / 2), col);
    if (it.value !== undefined) f.draw(ctx, String(it.value), x + w - 16, ry + Math.round((rowH - AP * 2 - f.lineHeight) / 2), on ? C.text : C.textMute, { align: 'right' });
  });
}

const canvasCache = new Map();
/** Olive canvas (Tess's shoulder bag) with a stitched border. Cached by size. */
export function bagCanvas(w, h) {
  const key = `${w}x${h}`;
  if (canvasCache.has(key)) return canvasCache.get(key);
  const c = canvas(w, h); const x = ctx2d(c);
  const r = rng(hashStr('bag' + key));
  rect(x, 0, 0, w, h, '#3c4128');
  // weave: alternating 2-px threads
  for (let j = 0; j < h; j += AP) for (let i = (j / AP) % 2 ? 0 : AP; i < w; i += AP * 2) rect(x, i, j, AP, AP, '#434a2e');
  for (let k = 0; k < (w * h) / 900; k++) rect(x, snap(r() * w), snap(r() * h), AP * (1 + Math.floor(r() * 3)), AP, r() < 0.5 ? '#353a23' : '#4b5233');
  // worn patches and an old ink stain
  for (let k = 0; k < 5; k++) dither(x, snap(r() * w), snap(r() * h), snap(40 + r() * 90), snap(20 + r() * 50), '#4f5637', 0.3);
  dither(x, snap(w * 0.7), snap(h * 0.75), 40, 22, '#262a33', 0.35);
  // seam + stitches
  frame(x, 10, 10, w - 20, h - 20, '#2a2e1a');
  for (let i = 16; i < w - 16; i += 10) { rect(x, i, 14, 6, AP, '#8f8a64'); rect(x, i, h - 16, 6, AP, '#8f8a64'); }
  for (let j = 16; j < h - 16; j += 10) { rect(x, 14, j, AP, 6, '#8f8a64'); rect(x, w - 16, j, AP, 6, '#8f8a64'); }
  frame(x, 0, 0, w, h, '#1e2113');
  canvasCache.set(key, c);
  return c;
}
