// Small math helpers shared by all modules.
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));
export const remap = (v, a0, a1, b0, b1) => lerp(b0, b1, invLerp(a0, a1, v));
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const smootherstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
/** Frame-rate independent exponential smoothing: approach `target` with time constant `lambda` (1/s). */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export const wrapDeg = (d) => ((d % 360) + 360) % 360;
export const deltaDeg = (a, b) => { let d = b - a; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
export const headingToYaw = (headingDeg) => -headingDeg * Math.PI / 180;
export const yawToHeading = (yaw) => wrapDeg(-yaw * 180 / Math.PI);

/** Deterministic PRNG (mulberry32). Use for procedural content so it is stable between reloads. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a0, b0) => a0 + (b0 - a0) * f();
  f.int = (a0, b0) => Math.floor(a0 + (b0 - a0 + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}

/** Smooth 1D value noise in [-1, 1] — handy for vibration / turbulence. */
const _perm = (() => { const r = rng(1337); const p = new Float32Array(512); for (let i = 0; i < 512; i++) p[i] = r() * 2 - 1; return p; })();
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const a = _perm[i & 511], b = _perm[(i + 1) & 511];
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
/** Fractal 1D noise in roughly [-1, 1]. */
export function fbm1(x, octaves = 4) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let o = 0; o < octaves; o++) { s += noise1(x * f + o * 17.17) * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}
