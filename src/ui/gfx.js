// UI drawing primitives. Everything snaps to a 2-px grid ("art pixels" are 2 UI px) so panels,
// paper and glyphs read as the same pixel art as the 480×270 world.
import { BAYER4, rng, hashStr } from '../art/util.js';
import { C } from './theme.js';

export const AP = 2; // one art pixel in UI px

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return c;
}
export const ctx2d = (c) => { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x; };

export function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
/** Outline rectangle of thickness t, drawn with fillRect (crisp). */
export function frame(ctx, x, y, w, h, color, t = AP) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, t); ctx.fillRect(x, y + h - t, w, t);
  ctx.fillRect(x, y + t, t, h - 2 * t); ctx.fillRect(x + w - t, y + t, t, h - 2 * t);
}

// ---- ordered dithering via cached patterns ---------------------------------------------------
const patCache = new Map();
/** Fill a rect with `color` at Bayer coverage `ratio` (0..1), in cells of `cell` px. */
export function dither(ctx, x, y, w, h, color, ratio, cell = AP) {
  const lvl = Math.max(0, Math.min(16, Math.round(ratio * 16)));
  if (!lvl) return;
  if (lvl === 16) { rect(ctx, x, y, w, h, color); return; }
  const key = `${color}|${lvl}|${cell}`;
  let pat = patCache.get(key);
  if (!pat) {
    const c = canvas(4 * cell, 4 * cell); const x2 = ctx2d(c);
    x2.fillStyle = color;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (BAYER4[j][i] < lvl) x2.fillRect(i * cell, j * cell, cell, cell);
    pat = ctx.createPattern(c, 'repeat');
    patCache.set(key, pat);
  }
  ctx.fillStyle = pat;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Dim the whole buffer (menus over the world). */
export function dimScreen(ctx, alpha = 0.6, w = 960, h = 540) {
  ctx.fillStyle = `rgba(4,5,8,${alpha})`;
  ctx.fillRect(0, 0, w, h);
}

// ---- worn steel panel ------------------------------------------------------------------------
/**
 * Institutional steel panel: translucent dark fill, 2-px bevel, darker scuffs along the frame,
 * brighter corner guards and optional rivets. Deterministic per (w, h, seed).
 */
export function steelPanel(ctx, x, y, w, h, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const fill = o.fill ?? C.panel;
  if (fill) rect(ctx, x, y, w, h, fill);
  // outer dark line, then bevel
  frame(ctx, x - AP, y - AP, w + 2 * AP, h + 2 * AP, 'rgba(0,0,0,0.55)');
  rect(ctx, x, y, w, AP, o.hi ?? C.panelHi);
  rect(ctx, x, y + AP, AP, h - AP, o.mid ?? C.panelMid);
  rect(ctx, x + w - AP, y + AP, AP, h - AP, C.panelLo);
  rect(ctx, x + AP, y + h - AP, w - 2 * AP, AP, C.panelLo);
  // wear: deterministic scuffs on the top bevel / chipped paint on the sides
  const r = rng(hashStr(`${w}x${h}|${o.seed || 0}`));
  const n = Math.round((w + h) / 70);
  for (let i = 0; i < n; i++) {
    const sx = x + AP * 4 + Math.floor(r() * ((w - AP * 10) / AP)) * AP;
    const len = (2 + Math.floor(r() * 6)) * AP;
    rect(ctx, sx, y, Math.min(len, x + w - AP * 3 - sx), AP, r() < 0.6 ? C.panelMid : C.scuff);
  }
  for (let i = 0; i < n / 2; i++) {
    const sy = y + AP * 4 + Math.floor(r() * ((h - AP * 10) / AP)) * AP;
    rect(ctx, r() < 0.5 ? x : x + w - AP, sy, AP, (1 + Math.floor(r() * 4)) * AP, C.scuff);
  }
  if (o.corners !== false) {
    const cc = o.cornerColor ?? C.panelHi;
    const k = 5 * AP;
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      rect(ctx, sx > 0 ? cx : cx - k, sy > 0 ? cy : cy - AP, k, AP, cc);
      rect(ctx, sx > 0 ? cx : cx - AP, sy > 0 ? cy : cy - k, AP, k, cc);
    }
  }
  if (o.rivets) {
    const inset = 5 * AP;
    for (const [rx, ry] of [[x + inset, y + inset], [x + w - inset - 2 * AP, y + inset], [x + inset, y + h - inset - 2 * AP], [x + w - inset - 2 * AP, y + h - inset - 2 * AP]]) rivet(ctx, rx, ry);
  }
}

export function rivet(ctx, x, y) {
  rect(ctx, x, y, 2 * AP, 2 * AP, C.rivet);
  rect(ctx, x, y, AP, AP, C.rivetHi);
  rect(ctx, x + AP, y + AP, AP, AP, C.panelLo);
}

/** Small enamel label plate (name plates, tabs). Returns { w, h }. */
export function plate(ctx, x, y, w, h, fill, edge) {
  rect(ctx, x - AP, y - AP, w + 2 * AP, h + 2 * AP, 'rgba(0,0,0,0.6)');
  rect(ctx, x, y, w, h, fill);
  rect(ctx, x, y, w, AP, edge);
  rect(ctx, x, y + AP, AP, h - AP, edge);
  rect(ctx, x + w - AP, y + AP, AP, h - AP, 'rgba(0,0,0,0.35)');
  rect(ctx, x + AP, y + h - AP, w - 2 * AP, AP, 'rgba(0,0,0,0.35)');
  return { w, h };
}

// ---- pixel glyphs ----------------------------------------------------------------------------
/** Solid pixel triangle pointing `dir` ('right' | 'down' | 'left' | 'up'); size in art px. */
export function triangle(ctx, x, y, size, color, dir = 'right') {
  ctx.fillStyle = color;
  for (let i = 0; i < size; i++) {
    const len = (size - i) * 2 - 1;
    if (dir === 'right') ctx.fillRect(x + i * AP, y + i * AP, AP, len * AP);
    else if (dir === 'left') ctx.fillRect(x + (size - 1 - i) * AP, y + i * AP, AP, len * AP);
    else if (dir === 'down') ctx.fillRect(x + i * AP, y + i * AP, len * AP, AP);
    else ctx.fillRect(x + i * AP, y + (size - 1 - i) * AP, len * AP, AP);
  }
}

/** Keycap glyph with a label (e.g. 'Z', 'ESC'). Returns its width. */
export function keycap(ctx, x, y, label, f, o = {}) {
  const tw = f.width(label);
  const w = Math.max(f.lineHeight, tw + 4 * AP), h = f.lineHeight;
  x = Math.round(x); y = Math.round(y);
  rect(ctx, x, y + AP, w, h, o.shadow ?? '#0b0b0f');
  rect(ctx, x, y, w, h - AP, o.face ?? '#c9c0a8');
  rect(ctx, x, y, w, AP, o.hi ?? '#ece4cc');
  rect(ctx, x, y + h - 2 * AP, w, AP, o.lo ?? '#8f8670');
  f.draw(ctx, label, x + w / 2, y - AP, o.color ?? '#1d1c22', { align: 'center' });
  return w;
}

// ---- paper -------------------------------------------------------------------------------------
const paperCache = new Map();
/**
 * A cached sheet of paper (UI px). o: { tone, edge, ruled: { top, gap, color }, margin, holes,
 *   torn: 'top'|'bottom'|'all', seed, stains, fold, grid }
 */
export function paperSheet(w, h, o = {}) {
  const key = JSON.stringify([w, h, o]);
  let c = paperCache.get(key);
  if (c) return c;
  c = canvas(w, h);
  const x = ctx2d(c);
  const r = rng(hashStr(`${o.seed || 'p'}|${w}|${h}`));
  const tone = o.tone || C.paper;
  rect(x, 0, 0, w, h, tone);
  // fibre speckle in 2-px cells
  const spk = (col, dens) => {
    x.fillStyle = col;
    const n = Math.round((w * h) / (AP * AP) * dens);
    for (let i = 0; i < n; i++) x.fillRect(Math.floor(r() * w / AP) * AP, Math.floor(r() * h / AP) * AP, AP, AP);
  };
  spk(o.hi || C.paperHi, 0.018);
  spk(o.lo || C.paperLo, 0.022);
  if (o.grid) {
    for (let gx = o.grid; gx < w; gx += o.grid) dither(x, gx, 0, AP / 2 + 0.5, h, o.gridColor || 'rgba(110,140,170,0.35)', 1, 1);
    for (let gy = o.grid; gy < h; gy += o.grid) rect(x, 0, gy, w, 1, o.gridColor || 'rgba(110,140,170,0.35)');
  }
  if (o.ruled) {
    const { top = 48, gap = 30, color = C.rule } = o.ruled;
    for (let ry = top; ry < h - 8; ry += gap) {
      // faded, slightly broken rule lines
      for (let rx = 0; rx < w; rx += AP * 6) if (r() > 0.04) rect(x, rx, ry, AP * 6, AP / 2 + 0.5, color);
    }
  }
  if (o.margin) rect(x, o.margin, 0, AP, h, C.margin);
  // stains: soft blotches (coffee, water, nicotine) — two faint dithered ellipses each
  const stains = o.stains ?? 2;
  for (let i = 0; i < stains; i++) {
    const sx = Math.floor(r() * w), sy = Math.floor(r() * h), sr = 18 + Math.floor(r() * 40);
    for (let k = 0; k < 2; k++) {
      const rr = sr * (1 - k * 0.45);
      for (let yy = -rr; yy < rr; yy += AP) {
        const hw = Math.sqrt(Math.max(0, 1 - (yy / rr) ** 2)) * rr * 1.3;
        dither(x, snap(sx - hw), snap(sy + yy * 0.8), snap(hw * 2), AP, 'rgba(130,100,50,0.22)', 0.19 + k * 0.12);
      }
    }
  }
  // edge darkening (age)
  const edge = o.edge || C.paperEdge;
  for (let i = 0; i < 2; i++) {
    const a = 0.45 - i * 0.25;
    dither(x, i * AP, 0, AP, h, edge, a); dither(x, w - (i + 1) * AP, 0, AP, h, edge, a);
    dither(x, 0, i * AP, w, AP, edge, a); dither(x, 0, h - (i + 1) * AP, w, AP, edge, a);
  }
  if (o.holes) {
    // three-hole punch: round holes (transparent) with a darker torn rim below
    for (const hy of [Math.round(h * 0.16), Math.round(h * 0.5), Math.round(h * 0.84)]) {
      for (let j = -6; j < 6; j += AP) {
        const hw = Math.round(Math.sqrt(36 - (j + 1) ** 2) / AP) * AP;
        x.clearRect(22 - hw, snap(hy) + j, hw * 2, AP);
      }
      rect(x, 18, snap(hy) + 6, 8, AP, 'rgba(0,0,0,0.18)');
    }
  }
  if (o.fold) {
    const fy = Math.round(h * o.fold / AP) * AP;
    rect(x, 0, fy, w, AP, 'rgba(0,0,0,0.12)'); rect(x, 0, fy + AP, w, AP, 'rgba(255,255,255,0.12)');
  }
  if (o.torn) tear(x, w, h, r, o.torn);
  if (o.dogear) {
    // folded top-right corner: remove the corner beyond the diagonal, draw the flap inside it
    const d = o.dogear;
    for (let i = 0; i < d; i += AP) {
      x.clearRect(w - d + i, i, d - i, AP);
      rect(x, w - d, i, i, AP, C.paperLo);
      rect(x, w - d + i - AP, i, AP, AP, C.paperEdge);
    }
  }
  if (paperCache.size > 64) paperCache.delete(paperCache.keys().next().value);
  paperCache.set(key, c);
  return c;
}

function tear(x, w, h, r, where) {
  const jag = (yEdge, down) => {
    let d = 0;
    for (let i = 0; i < w; i += AP) {
      d = Math.max(0, Math.min(5, d + (r() < 0.5 ? -1 : 1)));
      const hh = (d + 1) * AP;
      if (down) x.clearRect(i, 0, AP, hh); else x.clearRect(i, h - hh, AP, hh);
    }
  };
  if (where === 'top' || where === 'all') jag(0, true);
  if (where === 'bottom' || where === 'all') jag(h, false);
}

/** Paper drop shadow, offset down-right, dithered. */
export function dropShadow(ctx, x, y, w, h, off = 8) {
  dither(ctx, x + off, y + off, w, h, 'rgba(0,0,0,0.9)', 0.5);
}

// ---- vignette & noise --------------------------------------------------------------------------
const vigCache = new Map();
/** Dithered radial darkness: clear inside `radius` (fraction of the half-diagonal), ramping to
 *  `strength` over the next 0.45. Cached per quantised (strength, radius, colour). */
export function vignette(ctx, strength = 0.6, radius = 0.75, color = '#000', w = 960, h = 540) {
  const lvl = Math.round(strength * 10), rl = Math.round(radius * 20);
  const key = `${lvl}|${rl}|${color}|${w}|${h}`;
  let c = vigCache.get(key);
  if (!c) {
    // build at art resolution then scale ×2 for chunky dither
    const aw = w / AP, ah = h / AP;
    const small = canvas(aw, ah); const x = ctx2d(small);
    x.fillStyle = color;
    const cx = aw / 2, cy = ah / 2, maxd = Math.hypot(cx, cy), r0 = rl / 20;
    for (let j = 0; j < ah; j++) for (let i = 0; i < aw; i++) {
      const d = Math.hypot((i - cx), (j - cy) * 1.25) / maxd;
      const t = Math.max(0, Math.min(1, (d - r0) / 0.45)) * (lvl / 10);
      if (t > 0 && BAYER4[j & 3][i & 3] < t * 16) x.fillRect(i, j, 1, 1);
    }
    c = canvas(w, h); const x2 = ctx2d(c); x2.drawImage(small, 0, 0, w, h);
    if (vigCache.size > 24) vigCache.delete(vigCache.keys().next().value);
    vigCache.set(key, c);
  }
  ctx.drawImage(c, 0, 0);
}

const noiseFrames = [];
/** One of 6 cached static frames (art-pixel noise) for TV snow / VHS / intercom static. */
export function noiseFrame(i, w = 480, h = 270) {
  if (!noiseFrames.length) {
    for (let k = 0; k < 6; k++) {
      const c = canvas(w, h); const x = c.getContext('2d');
      const img = x.createImageData(w, h); const d = img.data; const r = rng(9001 + k);
      for (let p = 0; p < d.length; p += 4) { const v = r() * 255; d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255; }
      x.putImageData(img, 0, 0);
      noiseFrames.push(c);
    }
  }
  return noiseFrames[((i % 6) + 6) % 6];
}

export const ease = {
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const approach = (v, target, rate) => (v < target ? Math.min(target, v + rate) : Math.max(target, v - rate));
/** Snap to the 2-px art grid. */
export const snap = (v) => Math.round(v / AP) * AP;
