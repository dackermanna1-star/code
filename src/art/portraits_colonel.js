// The Colonel's portraits (96×120): mostly the small face, the dough of the head around it, a hint of
// collar and epaulette. One rig (colonel_face.js) lit six ways; expressions change lids/gaze/mouth only.
// Exports: initColonelPortraits(), getColonelPortrait(expr, opts) → 96×120 canvas.
import { GBuf, rig, shade, imgToCanvas, outlineImg, M, fbm } from './colonel_gbuf.js';
import { drawHead, FACE_EXPR } from './colonel_face.js';
import { makeCanvas, ctxOf } from './util.js';

const W = 96, H = 120;
export const COLONEL_PORTRAIT_EXPRS = ['serene', 'speaking', 'looking', 'wrong', 'confused', 'dissolving'];
export const COLONEL_LIGHTS = ['normal', 'dark', 'under', 'fluor', 'red', 'dawn'];

// light rigs (portrait space: x right, y down, z toward the viewer)
export const PORTRAIT_RIGS = {
  normal: rig({ amb: 0.16, shadowTint: '#b9bfd6', keyTint: '#fff4e4', exposure: 1.05,
    lights: [{ d: [-0.55, -0.62, 0.58], i: 0.92, sh: 6, shK: 0.5 }, { d: [0.7, 0.1, 0.7], i: 0.12, spec: 0 }], rim: [-0.6, -0.8, 0.12] }),
  dark: rig({ amb: 0.03, shadowTint: '#4c5a86', keyTint: '#ffeacc', exposure: 1.05,
    lights: [{ p: [14, 34, 95], r: 150, i: 1.45, fall: 1.5, sh: 6, shK: 0.4 }], rim: [0.8, -0.4, 0.1] }),
  under: rig({ amb: 0.03, shadowTint: '#5a3c48', keyTint: '#ffe4b8', exposure: 1.05,
    lights: [{ p: [46, 100, 82], r: 125, i: 1.6, fall: 1.25, sh: 4, shK: 0.35 }] }),
  fluor: rig({ amb: 0.3, shadowTint: '#87a08f', keyTint: '#e6fff0', exposure: 0.95, gamma: 0.95,
    lights: [{ d: [0.05, -0.9, 0.42], i: 0.85, sh: 6, shK: 0.5 }] }),
  red: rig({ amb: 0.04, shadowTint: '#3a0d10', keyTint: '#ff9d7c', exposure: 1.1,
    lights: [{ p: [62, 112, 76], r: 150, i: 1.6, fall: 1.15, sh: 4, shK: 0.35 }, { p: [-40, 140, 30], r: 160, i: 0.35, spec: 0 }] }),
  dawn: rig({ amb: 0.36, shadowTint: '#8a7f9e', keyTint: '#efe2ea', exposure: 0.92,
    lights: [{ d: [-0.35, -0.25, 0.9], i: 0.6, sh: 10, shK: 0.6 }] }),
};

const OUTLINE = { normal: '#0a0a0f', dark: '#050508', under: '#060406', fluor: '#0c120e', red: '#120405', dawn: '#141018' };
const gbCache = new Map();
const cache = new Map();

function buildGB(expr) {
  if (gbCache.has(expr)) return gbCache.get(expr);
  const E = FACE_EXPR[expr] || FACE_EXPR.serene;
  const gb = new GBuf(W, H);
  const s = E.zoom || 1;
  drawHead(gb, { ...E, cx: 48, cy: 56 - (s - 1) * 6, s, seed: 1841, chins: 3, collarY: 50 });
  gb.folds(2.2, 0.6, 0.86);
  gb.ssao(3, 0.03, 0.35);
  if (E.dissolve) dissolveGB(gb, 1841);
  gbCache.set(expr, gb);
  return gb;
}

// crumbling into coal dust & wet wool: blotches of the dough hollow out (black crust of coal around
// each hole), the collar goes to sodden wool; the little face holds together longest
function dissolveGB(gb, seed) {
  const { w, h } = gb;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!gb.mat[i]) continue;
    const m = gb.mat[i];
    if (m === M.NAVY || m === M.NAVY_D) { gb.mat[i] = M.WOOL_WET; continue; }
    const n = fbm(x, y, 7, seed) * 0.75 + hn(x >> 1, y >> 1, seed) * 0.25;
    const top = 1 - y / h, side = Math.abs(x - 48) / 48;
    const face = (m === M.FACE || m === M.BLUSH || m === M.EYE || m === M.IRIS || m === M.HAIR || m === M.DARK || m === M.MOUTH || m === M.LIP) && Math.abs(x - 48) < 15 && y > 40 && y < 80;
    const e = n * 0.62 + top * top * 0.55 + side * side * 0.45 - (face ? 0.4 : 0);
    if (e > 0.74) { gb.mat[i] = 0; continue; }
    if (e > 0.64) { gb.mat[i] = M.COAL; continue; }
    if (e > 0.58) { gb.ao[i] *= 0.6; }
  }
}
function hn(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

function focusFn(light, expr) {
  // light gathers on the little face; the head's edges fall into the dark
  const cx = 48, cy = expr === 'wrong' ? 58 : 60;
  const k = light === 'dawn' ? 0.3 : light === 'fluor' ? 0.38 : light === 'normal' ? 0.55 : 0.25;
  return (x, y) => {
    const d = Math.hypot((x - cx) / 62, (y - cy) / 70);
    return 1 - Math.min(1, d * d) * k;
  };
}

export async function initColonelPortraits() {
  // warm the most common ones (cheap); the rest render lazily on first use
  getColonelPortrait('serene', { light: 'fluor' });
}

export function getColonelPortrait(expr = 'serene', opts = {}) {
  if (!FACE_EXPR[expr]) expr = 'serene';
  const light = PORTRAIT_RIGS[opts.light] ? opts.light : 'normal';
  const key = `${expr}|${light}`;
  let c = cache.get(key);
  if (c) return c;
  const gb = buildGB(expr);
  // cleaner bands than the CGs (the cast's portraits are cel-shaded), same 1-px dark silhouette outline
  const img = shade(gb, { ...PORTRAIT_RIGS[light], ditherScale: 0.55 }, { focus: focusFn(light, expr) });
  outlineImg(img, OUTLINE[light] || '#0a0a0f');
  c = imgToCanvas(img);
  if (expr === 'dissolving') c = addMotes(c, light);
  cache.set(key, c);
  return c;
}

// coal dust sifting down out of the holes for the dissolving portrait
function addMotes(c, light) {
  const out = makeCanvas(W, H), x = ctxOf(out);
  x.drawImage(c, 0, 0);
  const a = ctxOf(c).getImageData(0, 0, W, H).data;
  const cols = light === 'red' ? ['#1e0806', '#3a120c', '#5a2014'] : ['#08080c', '#1b1c27', '#383946'];
  for (let k = 0; k < 220; k++) {
    const px = Math.floor(hn(k, 1, 77) * W), py = Math.floor(hn(k, 2, 77) * (H - 10));
    if (a[(py * W + px) * 4 + 3]) continue; // only in the gaps
    const len = 1 + Math.floor(hn(k, 3, 77) * 4);
    for (let j = 0; j < len; j++) if (hn(k, j + 5, 77) > 0.35) { x.fillStyle = cols[(k + j) % cols.length]; x.fillRect(px, py + j * 2, 1, 1); }
  }
  return out;
}
