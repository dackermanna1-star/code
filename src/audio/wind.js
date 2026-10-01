// Deterministic gust function shared by audio and visuals.
// windAt(t) -> 0..1. Slow random gusts (3-12 s), occasional strong ones, quiet lulls,
// a little turbulence. Pure function of (seed, t): random access, no state.
import { hash32 } from './lib/rng.js';

const SLOT = 6.5; // seconds per gust slot

export function createWind(seed = 1) {
  const S = hash32(seed ^ 0x51ed270b);
  const h = (i, salt) => hash32((Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(salt, 0x165667b1) ^ S) | 0) / 4294967296;
  const vnoise = (t, salt) => {
    const i = Math.floor(t);
    const f = t - i;
    const a = h(i, salt);
    const b = h(i + 1, salt);
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
  const ss = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  function gustContribution(k, t) {
    if (h(k, 11) > 0.64) return 0; // ~64% of slots carry a gust
    const t0 = (k + h(k, 23)) * SLOT;
    const dur = 3 + 9 * Math.pow(h(k, 37), 1.25);
    const x = (t - t0) / dur;
    if (x <= 0 || x >= 1) return 0;
    const r = h(k, 51);
    const q = h(k, 61);
    const peak = r < 0.08 ? 0.82 + 0.18 * q : r < 0.32 ? 0.52 + 0.26 * q : 0.22 + 0.3 * q;
    const rise = 0.25 + 0.2 * h(k, 71);
    const env = x < rise ? ss(x / rise) : Math.pow(1 - ss((x - rise) / (1 - rise)), 1.3);
    return peak * env;
  }

  return function windAt(t) {
    if (!Number.isFinite(t)) return 0;
    const base = 0.05 + 0.16 * vnoise(t / 21 + 3.7, 3);
    const k0 = Math.floor(t / SLOT);
    let prod = 1 - base;
    for (let k = k0 - 2; k <= k0; k++) {
      const g = gustContribution(k, t);
      if (g > 0) prod *= 1 - g;
    }
    let w = 1 - prod;
    // turbulence, proportional to level
    const turb = (vnoise(t * 1.3, 5) - 0.5) * 0.55 + (vnoise(t * 3.7, 9) - 0.5) * 0.3;
    w *= 1 + turb * 0.35;
    // occasional quiet lulls (slow)
    const lull = 1 - 0.8 * ss((vnoise(t / 33 + 11.1, 7) - 0.66) / 0.16);
    w *= lull;
    return w < 0 ? 0 : w > 1 ? 1 : w;
  };
}
