// =============================================================================
// Weather definition shared by the shaders (shaders.js) and the CPU
// (densityAt / coverage). Keep cloudRegion() in sync with the GLSL version.
// =============================================================================
import { WEATHER_TILE, MACRO_SCALE, NOISE_PERIOD, sampleWeather } from './noise.js';

/** Layer altitudes (m MSL). */
export const LAYERS = {
  cuBase: 1400,          // fair-weather cumulus base (tops 2200-3500 m, towers up to ~8 km)
  cuTop: 3800,           // top of the cumulus shell without towers
  towerTop: 8800,        // top of the cumulus shell when towers exist
  deckBase: 4600,        // stratocumulus / altocumulus deck
  deckTop: 6500,
  cirrusAlt: 11800,      // 2D cirrus / cirrostratus sheet (above the cruise level)
};

/** Regional distances (km) for the 'auto' route weather. */
export const REGION = {
  depInner: 28, depOuter: 85,      // departure: scattered cumulus, deck starts beyond
  arrInner: 70, arrOuter: 140,     // arrival region: deck clears
  arrClear: 22,                    // fully clear sky this close to the arrival airport
};

/** Presets: [cumulus coverage, deck coverage, towers, cirrus] (used when weather != 'auto'). */
export const PRESETS = {
  clear: [0.07, 0.0, 0.0, 0.25],
  scattered: [0.44, 0.28, 0.0, 0.5],
  overcast: [0.72, 0.96, 0.0, 0.9],
  auto: [0.44, 0.5, 0.0, 0.5],
};

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const pmod = (a, n) => ((a % n) + n) % n;

/**
 * CPU version of cloudRegion(). rel = world xz relative to the camera; ctx holds the same values as the uniforms.
 * out = [cu, deck, towers, cirrus]
 */
export function cloudRegion(relX, relZ, mac, ctx, out) {
  const dDep = Math.hypot(relX - ctx.depRel[0], relZ - ctx.depRel[1]) * 0.001;
  const dA = Math.hypot(relX - ctx.arrRelA[0], relZ - ctx.arrRelA[1]);
  const dB = Math.hypot(relX - ctx.arrRelB[0], relZ - ctx.arrRelB[1]);
  const dArr = mix(dA, dB, ctx.arrMix) * 0.001;
  const depF = 1 - sstep(REGION.depInner, REGION.depOuter, dDep);
  const arrF = 1 - sstep(REGION.arrInner, REGION.arrOuter, dArr);
  const en = [0.24 + 0.2 * mac, sstep(0.30, 0.52, mac) * 0.97, sstep(0.66, 0.80, mac), 0.35 + 0.5 * mac];
  const dep = [0.46, sstep(0.42, 0.62, mac) * 0.5 * sstep(REGION.depInner * 0.7, REGION.depOuter, dDep), 0, 0.4];
  const arr = [0.36 * sstep(REGION.arrClear, REGION.arrClear * 2.2, dArr), 0, 0, 0.35];
  const pre = ctx.preset;
  for (let k = 0; k < 4; k++) {
    let c = mix(en[k], dep[k], depF);
    c = mix(c, arr[k], arrF);
    let p = pre[k];
    if (k === 1 && p <= 0.6) p *= sstep(0.2, 0.45, mac);
    out[k] = mix(p, c, ctx.auto);
  }
  return out;
}

const _w = [0, 0, 0, 0], _m = [0, 0, 0, 0], _r = [0, 0, 0, 0];

/**
 * Approximate cloud density (0..1) at a world position (no 3D noise: the expected
 * shape from the coverage map and the layer profiles).
 *   wx, wy, wz: world position; ctx: { wm, camX, camZ, windX, windZ, ... } see index.js
 */
export function densityAtCPU(wx, wy, wz, ctx) {
  const h = wy;
  if (h < LAYERS.cuBase - 250 || h > Math.max(ctx.cuTop, LAYERS.deckTop + 400)) return 0;
  const nx = pmod(wx - ctx.windX, NOISE_PERIOD), nz = pmod(wz - ctx.windZ, NOISE_PERIOD);
  const W = sampleWeather(ctx.wm, nx / WEATHER_TILE, nz / WEATHER_TILE, _w);
  const M = sampleWeather(ctx.wm, nx / (WEATHER_TILE * MACRO_SCALE) + 0.37, nz / (WEATHER_TILE * MACRO_SCALE) + 0.61, _m);
  const reg = cloudRegion(wx - ctx.camX, wz - ctx.camZ, M[3], ctx, _r);
  const hB = LAYERS.cuBase + 160 * (W[2] - 0.5);
  const hT = hB + mix(650, 2100, W[2] * W[2]) + reg[2] * sstep(0.45, 0.85, W[2]) * 4800;
  const hf = (h - hB) / (hT - hB);
  const cellCov = sat((W[0] - (1 - reg[0])) / Math.max(reg[0], 1e-4));
  let cu = 0;
  if (hf > 0 && hf < 1 && cellCov > 0) {
    const sh = sstep(0.4, 1, hf), shrink = sh * sh * 0.95;
    cu = Math.sqrt(sat((cellCov - shrink) / Math.max(1 - shrink, 0.05)) * sstep(0, 0.035, hf));
  }
  const dB = LAYERS.deckBase + 260 * (W[0] - 0.5);
  const dT = LAYERS.deckTop - 700 + 900 * W[1];
  const df = (h - dB) / (dT - dB);
  let deck = 0;
  if (df > 0 && df < 1 && reg[1] > 0) {
    const dc = sat((W[1] - (1 - reg[1])) / Math.max(reg[1], 1e-4));
    deck = dc * sstep(0, 0.18, df) * sstep(1, 0.55, df) * 0.75;
  }
  // expected value of the base-noise remap ≈ shape^1.6
  const s = Math.max(cu, deck);
  return Math.pow(s, 1.6);
}

/** Fraction of the sky covered around (wx, wz) within radius (m): [cumulus, deck] estimates. */
export function coverageAround(wx, wz, radius, ctx, out = [0, 0]) {
  let cu = 0, dk = 0, n = 0;
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    const x = wx + (i / 3) * radius, z = wz + (j / 3) * radius;
    const nx = pmod(x - ctx.windX, NOISE_PERIOD), nz = pmod(z - ctx.windZ, NOISE_PERIOD);
    const W = sampleWeather(ctx.wm, nx / WEATHER_TILE, nz / WEATHER_TILE, _w);
    const M = sampleWeather(ctx.wm, nx / (WEATHER_TILE * MACRO_SCALE) + 0.37, nz / (WEATHER_TILE * MACRO_SCALE) + 0.61, _m);
    const reg = cloudRegion(x - ctx.camX, z - ctx.camZ, M[3], ctx, _r);
    cu += W[0] > 1 - reg[0] + 0.04 ? 1 : 0;
    dk += reg[1] > 0 && W[1] > 1 - reg[1] + 0.04 ? 1 : 0;
    n++;
  }
  out[0] = cu / n; out[1] = dk / n;
  return out;
}
