// =============================================================================
// Trip-director maths helpers (pure JS: no Three.js, usable from the node
// self-test). Deterministic noise keyed by distance so road features are
// stable between runs and identical after skips.
// =============================================================================

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const smootherstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
/** Frame-rate independent exponential approach. */
export const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
/** Move `cur` towards `target` by at most `step`. */
export const approach = (cur, target, step) => (cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step));
export const wrap360 = (d) => ((d % 360) + 360) % 360;
export const wrap180 = (d) => { let x = ((d + 180) % 360 + 360) % 360 - 180; if (x === -180) x = 180; return x; };
export const wrapPi = (r) => { let x = r % (2 * Math.PI); if (x > Math.PI) x -= 2 * Math.PI; else if (x < -Math.PI) x += 2 * Math.PI; return x; };

/** Piecewise-linear lookup in a flat [x0, y0, x1, y1, ...] table (sorted by x). */
export function curve(tab, x) {
  const n = tab.length;
  if (x <= tab[0]) return tab[1];
  for (let i = 2; i < n; i += 2) {
    if (x <= tab[i]) { const x0 = tab[i - 2], y0 = tab[i - 1]; return y0 + (tab[i + 1] - y0) * (x - x0) / (tab[i] - x0); }
  }
  return tab[n - 1];
}

/** Integer hash -> [0, 1). */
export function hash1(i, seed = 0) {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [-1, 1] (quintic fade), seeded. */
export function vnoise(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash1(i, seed) * 2 - 1, b = hash1(i + 1, seed) * 2 - 1;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return a + (b - a) * u;
}

/** Fractal noise (2-3 octaves) in roughly [-1, 1]. */
export function fbm(x, seed = 0, oct = 3) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += vnoise(x * f, seed + o * 101) * amp; n += amp; amp *= 0.5; f *= 2.07; }
  return s / n;
}

/**
 * Damped spring with base excitation (mass-normalised): x'' = w²(eq - x) + 2ζw(eqRate - x').
 * st = {x, v, a}. Semi-implicit Euler; stable for w·dt < ~1.
 */
export function spring(st, eq, eqRate, dt, w, zeta) {
  const a = w * w * (eq - st.x) + 2 * zeta * w * (eqRate - st.v);
  st.v += a * dt;
  st.x += st.v * dt;
  st.a = a;
  return st;
}

/** Hours (decimal) -> 'HH:MM'. */
export function fmtClock(h) {
  const m = Math.floor((((h % 24) + 24) % 24) * 60 + 1e-6);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
/** Seconds -> 'M:SS' (or 'H:MM:SS'). */
export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
