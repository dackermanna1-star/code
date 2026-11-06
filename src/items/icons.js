// Pixel-art item icons (16×16). Every item def carries `icon: {shape, color, color2, color3, metal, wood, dark,
// pattern, decal}`; `shape` names an ASCII template in iconArt.js, the colour fields recolour its ramps.
//
//   renderIconPixels(def) -> Uint8ClampedArray(16*16*4)   pure, no DOM (usable in Node)
//   getItemIcon(idOrDef)  -> HTMLCanvasElement 16×16 (cached)
//   getItemIconURL(idOrDef) -> data URL (cached)
//
// Template letters (see iconArt.js header): ramps of 4 shades (highlight, base, shadow, deep)
//   a b c d  primary (icon.color)      e f g h  secondary (icon.color2)   i j k l  tertiary (icon.color3)
//   m n o p  metal (icon.metal)        u v w x  wood (icon.wood)          q r s t  dark polymer (icon.dark)
// fixed colours: W white, L light grey, P paper, Y gold, R red, G green, B blue, K black, F orange, S skin,
//   T cardboard, V/X brass light/dark, Q/U/N glass light/mid/dark, O explicit outline, M blood, H sparkle,
//   Z mid grey, y pale flame, z dark brown; digits 1-9 are template-local colours (template.pal).
// A dark 1px outline is generated automatically around the filled shape (tinted by the neighbouring colour).

import { getItemDef } from './items.js';
import { TEMPLATES, DECALS } from './iconArt.js';

const S = 16;

const FIXED = {
  W: '#f4f3ee', L: '#c6c4bb', P: '#e8dfc4', Y: '#ecc440', R: '#c8352c', G: '#4c9a3c', B: '#3c6cc8', K: '#1a191d',
  F: '#f5a030', S: '#e3b08a', T: '#c39760', V: '#e6c25a', X: '#a47a28', Q: '#e8f6fb', U: '#9ccbe0', N: '#5f93b0',
  O: '#231e22', M: '#7a2020', H: '#ffffff', Z: '#6a6a6e', y: '#fff3a8', z: '#6b4423',
};

const RAMPS = {
  a: ['color', 0], b: ['color', 1], c: ['color', 2], d: ['color', 3],
  e: ['color2', 0], f: ['color2', 1], g: ['color2', 2], h: ['color2', 3],
  i: ['color3', 0], j: ['color3', 1], k: ['color3', 2], l: ['color3', 3],
  m: ['metal', 0], n: ['metal', 1], o: ['metal', 2], p: ['metal', 3],
  u: ['wood', 0], v: ['wood', 1], w: ['wood', 2], x: ['wood', 3],
  q: ['dark', 0], r: ['dark', 1], s: ['dark', 2], t: ['dark', 3],
};
const PRIMARY = new Set(['a', 'b', 'c', 'd']);

const DEFAULT_COLORS = {
  color: '#9a9a9a', color2: '#5a5a5a', color3: '#d8d8d8', metal: '#a3abb3', wood: '#9b6a3a', dark: '#404349',
};

function hex(h) {
  if (Array.isArray(h)) return h;
  let s = String(h).replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** 4-shade ramp with gentle hue shifting (warm highlights, cool shadows) */
function ramp(base) {
  const c = hex(base);
  const lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
  const hl = mix(c, [255, 250, 225], 0.26 + (1 - lum) * 0.1);
  const sh = mix([c[0] * 0.74, c[1] * 0.72, c[2] * 0.76], [30, 24, 60], 0.08);
  const dp = mix([c[0] * 0.52, c[1] * 0.5, c[2] * 0.56], [24, 16, 48], 0.14);
  return [hl, c, sh, dp].map((x) => x.map(clamp255));
}

// deterministic camo mask (blobs) for pattern 'camo'
const CAMO = (() => {
  const m = new Uint8Array(S * S);
  const seeds = [[2, 3, 1], [9, 2, 2], [13, 7, 1], [5, 9, 2], [11, 12, 1], [2, 13, 3], [7, 5, 3], [14, 1, 3], [8, 14, 2], [0, 7, 1], [12, 4, 3], [4, 0, 2]];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let best = 99, v = 0;
      for (const [sx, sy, k] of seeds) {
        const dx = (x - sx) * 1.0, dy = (y - sy) * 1.35;
        const d = dx * dx + dy * dy + ((x * 7 + y * 13) % 5) * 0.6;
        if (d < best) { best = d; v = k; }
      }
      m[y * S + x] = best < 7.5 ? v : 0;
    }
  }
  return m;
})();

function patternLetter(pattern, letter, x, y) {
  // returns replacement ramp letter for primary-ramp pixels
  const lvl = 'abcd'.indexOf(letter);
  if (lvl < 0 || !pattern) return letter;
  const sec = 'efgh', ter = 'ijkl', pri = 'abcd';
  switch (pattern) {
    case 'camo': {
      const v = CAMO[y * S + x];
      if (v === 1) return sec[lvl];
      if (v === 2) return ter[lvl];
      if (v === 3) return pri[Math.min(3, lvl + 1)];
      return letter;
    }
    case 'plaid': {
      const vx = x % 4 === 1, vy = y % 4 === 2;
      if (vx && vy) return sec[Math.min(3, lvl + 1)];
      if (vx || vy) return sec[lvl];
      return letter;
    }
    case 'dots':
      return (x + (y % 4 === 0 ? 0 : 2)) % 4 === 0 && y % 2 === 0 ? sec[lvl] : letter;
    case 'waffle':
      return (x + y) % 2 === 0 ? pri[Math.max(0, lvl - 1)] : letter;
    case 'stripes':
      return y % 3 === 0 ? sec[lvl] : letter;
    default:
      return letter;
  }
}

function buildPalette(icon, tpl) {
  const colors = { ...DEFAULT_COLORS, ...(tpl.colors || {}) };
  for (const k of Object.keys(DEFAULT_COLORS)) if (icon[k]) colors[k] = icon[k];
  const ramps = {};
  for (const k of Object.keys(DEFAULT_COLORS)) ramps[k] = ramp(colors[k]);
  const pal = {};
  for (const [ch, [k, i]] of Object.entries(RAMPS)) pal[ch] = ramps[k][i];
  for (const [ch, h] of Object.entries(FIXED)) pal[ch] = hex(h);
  if (tpl.pal) for (const [ch, h] of Object.entries(tpl.pal)) pal[ch] = resolveColorRef(h, ramps);
  if (icon.pal) for (const [ch, h] of Object.entries(icon.pal)) pal[ch] = resolveColorRef(h, ramps);
  return pal;
}
// palette values may be '#hex' or 'color:2' (ramp reference)
function resolveColorRef(v, ramps) {
  if (typeof v === 'string' && v.includes(':')) {
    const [k, i] = v.split(':');
    return ramps[k][+i];
  }
  return hex(v);
}

/** Render an item def (or {icon}) to RGBA pixels (16*16*4). Pure function. */
export function renderIconPixels(def) {
  const icon = (def && def.icon) || { shape: 'unknown' };
  const tpl = TEMPLATES[icon.shape] || TEMPLATES.unknown;
  const pal = buildPalette(icon, tpl);
  const letters = new Array(S * S).fill('.');
  const rows = tpl.rows;
  for (let y = 0; y < S; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < S; x++) {
      const ch = row[x] || '.';
      if (ch === '.' || ch === ' ') continue;
      letters[y * S + x] = PRIMARY.has(ch) ? patternLetter(icon.pattern, ch, x, y) : ch;
    }
  }
  // decals: drawn over filled pixels (by default only over primary-ramp pixels of the base)
  const decals = icon.decal ? (Array.isArray(icon.decal) ? icon.decal : [icon.decal]) : [];
  for (const name of decals) {
    const dc = DECALS[name];
    if (!dc) continue;
    for (let y = 0; y < S; y++) {
      const row = dc.rows[y] || '';
      for (let x = 0; x < S; x++) {
        const ch = row[x] || '.';
        if (ch === '.' || ch === ' ') continue;
        const base = rows[y]?.[x] || '.';
        if (base === '.' || base === ' ') { if (!dc.any) continue; }
        else if (!dc.any && !PRIMARY.has(base)) continue;
        letters[y * S + x] = ch;
      }
    }
    if (dc.pal) for (const [ch, h] of Object.entries(dc.pal)) pal[ch] = hex(h);
  }
  const out = new Uint8ClampedArray(S * S * 4);
  const filled = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const ch = letters[i];
    if (ch === '.') continue;
    const c = pal[ch];
    if (!c) continue;
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
    filled[i] = ch === 'O' ? 2 : 1;
  }
  // automatic outline: transparent pixels touching the shape (4-neighbourhood)
  if (tpl.outline !== false) {
    const add = [];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        if (filled[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const [nx, ny] of nb) {
          if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
          const j = ny * S + nx;
          if (filled[j] !== 1) continue;
          r += out[j * 4]; g += out[j * 4 + 1]; b += out[j * 4 + 2]; n++;
        }
        if (!n) continue;
        r /= n; g /= n; b /= n;
        add.push([i, clamp255(r * 0.27 + 14), clamp255(g * 0.25 + 11), clamp255(b * 0.28 + 16)]);
      }
    }
    for (const [i, r, g, b] of add) { out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255; }
  }
  return out;
}

const resolveDef = (idOrDef) => (typeof idOrDef === 'string' ? getItemDef(idOrDef) : idOrDef || getItemDef('unknown'));
const iconKey = (def) => def.id + '|' + JSON.stringify(def.icon || {});

const cache = new Map();
/** 16×16 canvas icon for an item id (or def). Cached. */
export function getItemIcon(idOrDef) {
  const def = resolveDef(idOrDef);
  const key = iconKey(def);
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  img.data.set(renderIconPixels(def));
  g.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}

const urlCache = new Map();
/** data URL of the icon (for <img> / CSS). Cached. */
export function getItemIconURL(idOrDef) {
  const def = resolveDef(idOrDef);
  const key = iconKey(def);
  let u = urlCache.get(key);
  if (!u) { u = getItemIcon(def).toDataURL(); urlCache.set(key, u); }
  return u;
}
