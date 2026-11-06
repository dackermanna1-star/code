/* ==========================================================================
   SPLEEN: SEPSIS — util.js
   Math, seeded RNG, small helpers shared by every other script.
   All game scripts are classic scripts sharing the global scope.
   ========================================================================== */
"use strict";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => (v - a) / (b - a);
const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t;
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
/** frame-rate independent exponential smoothing factor */
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

/* ---------- Seeded RNG (mulberry32) ---------- */
function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; },
    weighted: (items, wfn) => {
      let tot = 0; for (const it of items) tot += Math.max(0, wfn(it));
      if (tot <= 0) return items[0];
      let x = next() * tot;
      for (const it of items) { x -= Math.max(0, wfn(it)); if (x <= 0) return it; }
      return items[items.length - 1];
    },
    get state() { return s; },
  };
  return r;
}
function hashStr(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* Unseeded randomness for cosmetic stuff (particles, jitter) */
const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const rndPick = (arr) => arr[(Math.random() * arr.length) | 0];
const rndSign = () => (Math.random() < 0.5 ? -1 : 1);

/* ---------- Colors ---------- */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function rgbStr(rgb, a = 1) { return `rgba(${(rgb[0] * 255) | 0},${(rgb[1] * 255) | 0},${(rgb[2] * 255) | 0},${a})`; }
function mixRgb(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function scaleRgb(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }

/* ---------- Small value noise for procedural textures ---------- */
function makeNoise2D(seed) {
  const rng = makeRng(seed);
  const P = new Uint8Array(512); const perm = [];
  for (let i = 0; i < 256; i++) perm.push(i);
  rng.shuffle(perm);
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  const G = new Float32Array(256); for (let i = 0; i < 256; i++) G[i] = rng.next();
  const val = (x, y) => G[P[(P[x & 255] + y) & 511]];
  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = smooth(xf), v = smooth(yf);
    const a = val(xi, yi), b = val(xi + 1, yi), c = val(xi, yi + 1), d = val(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}
function fbm(noise, x, y, oct = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

/* ---------- Safe storage ---------- */
const Store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } },
};

/* ---------- Formatting ---------- */
function fmtTime(sec) { sec = Math.max(0, Math.floor(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/* ---------- Event bus (tiny) ---------- */
const Bus = {
  _h: {},
  on(ev, fn) { (this._h[ev] || (this._h[ev] = [])).push(fn); },
  emit(ev, a, b, c) { const l = this._h[ev]; if (l) for (const fn of l) fn(a, b, c); },
};

/* audio shim: the real AUDIO comes from audio.js. Keep the game alive if it fails to load. */
function sfx(name, opts) { try { if (window.AUDIO) AUDIO.sfx(name, opts); } catch (e) { } }
