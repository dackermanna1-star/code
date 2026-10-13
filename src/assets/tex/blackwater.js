// Blackwater Docks texture pack (zm_blackwater): a cold, wet harbour palette - grey quay
// concrete with joints and oil, a dark algae-streaked sea wall, weathered grey pier planks,
// the harbour's dark water (drifting: meta `scroll`), a rail bed on sleepers, blue-grey
// profiled cladding, safety-yellow steel, dark iron, an oxblood ship's hull, a teal container,
// and bw_atlas: one sheet for every small painted thing (signs and their lettering, crates,
// hazard stripes, life rings, doors, shutters, tyres, vents) so they cost one draw call.
// Deterministic (seeded), DOM-free, tileable; authored for 100 % = sunlit.
import { Rng, fbm, voronoi, mod, smooth, lambert, makeImg, finish, white, F32 } from './core.js';
import { matchMean, masonry } from './stone.js';
import { containerTex } from './shared.js';

const LIGHT = [-0.42, -0.82, 0.62];
const N_OF = (img) => img.w * img.h;

function shade(img, hgt, strength, amb, light = LIGHT) {
  const sh = lambert(hgt, img.w, img.h, strength, light);
  for (let i = 0, n = N_OF(img); i < n; i++) {
    const s = amb + (1 - amb) * sh[i];
    img.r[i] *= s; img.g[i] *= s; img.b[i] *= s;
  }
}
function mix(img, i, c, t) {
  img.r[i] += (c[0] - img.r[i]) * t;
  img.g[i] += (c[1] - img.g[i]) * t;
  img.b[i] += (c[2] - img.b[i]) * t;
}

// ------------------------------------------------------------------ ground

/** Quay concrete: 128-unit cast slabs with sawn joints, aggregate, tyre-dark tracks, oil and wet patches. */
function quayConcrete() {
  const W = 256, H = 256, N = W * H, S = 11101;
  const big = fbm(W, H, { cx: 3, oct: 5, gain: 0.55, seed: S + 1 });
  const mid = fbm(W, H, { cx: 12, oct: 3, seed: S + 2 });
  const wn = white(W, H, S + 3);
  const oil = fbm(W, H, { cx: 5, oct: 4, gain: 0.6, seed: S + 4 });
  const wet = fbm(W, H, { cx: 4, oct: 4, gain: 0.6, seed: S + 5 });
  const crack = fbm(W, H, { cx: 10, oct: 4, seed: S + 6, turb: true });
  const rng = new Rng(S);
  const tone = [0, 1, 2, 3].map(() => rng.gauss() * 0.05);
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const jx = Math.min(mod(x, 128), 127 - mod(x, 128)), jy = Math.min(mod(y, 128), 127 - mod(y, 128));
    const joint = smooth(1.6, 0.3, Math.min(jx, jy));
    const slab = tone[(x >> 7) + 2 * (y >> 7)];
    const f = (1 + slab + (big[i] - 0.5) * 0.22 + (mid[i] - 0.5) * 0.12 + (wn[i] - 0.5) * 0.14) * (1 - joint * 0.45);
    let r = 136 * f, g = 138 * f, b = 136 * f;
    img.r[i] = r; img.g[i] = g; img.b[i] = b;
    const o = smooth(0.72, 0.86, oil[i]) * 0.55;
    if (o > 0) mix(img, i, [52 * f, 50 * f, 48 * f], o);
    const w = smooth(0.58, 0.8, wet[i]) * 0.22;
    img.r[i] *= 1 - w; img.g[i] *= 1 - w * 0.95; img.b[i] *= 1 - w * 0.85;
    const c = smooth(0.035, 0.0, crack[i]) * smooth(0.55, 0.7, big[i]);
    img.r[i] *= 1 - c * 0.35; img.g[i] *= 1 - c * 0.35; img.b[i] *= 1 - c * 0.35;
    hgt[i] = (mid[i] - 0.5) * 0.4 + (wn[i] - 0.5) * 0.35 - joint * 1.4 - c;
  }
  shade(img, hgt, 0.8, 0.55);
  matchMean(img, [122, 124, 123]);
  finish(img, { grain: 6, chroma: 2, sharpen: 0.25, seed: S });
  return img;
}

/** The sea wall: big dark concrete blocks, a green-black algae band and white salt streaks. */
function seaWall() {
  const img = masonry(128, 128, {
    seed: 11201, courseMin: 32, courseMax: 32, blockMin: 64, blockMax: 64,
    tints: [[1, 1, 1], [0.95, 1.0, 1.0], [1.02, 1.0, 0.97], [0.9, 0.92, 0.94]],
    tone: 0.08, hue: 0.04, joint: 0.5, pits: 140, pitDepth: 0.8, pitDark: 0.35,
    bigAmp: 0.16, midAmp: 0.16, detAmp: 0.22, strata: 0, streak: 0.3, blot: 0.25, blotGrey: 0.4, blotThr: 0.5,
    edgeDirt: 0.2, bottomDirt: 0.15, light: 0.4, amb: 0.5, ao: 0.15, cast: 0.2, grain: 7, sharpen: 0.25, soft: 0.3,
    warp: 0.15, corner: 1, chip: 1.4, bevel: 1.2, depth: 1.2, surf: 0.9,
    base: [104, 108, 106], mortar: [70, 74, 72], target: [92, 96, 94],
  });
  const W = 128, H = 128, S = 11211;
  const alg = fbm(W, H, { cx: 6, oct: 4, gain: 0.6, seed: S + 1 });
  const run = fbm(W, H, { cx: 24, cy: 2, oct: 3, seed: S + 2 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const a = smooth(0.55, 0.75, alg[i]) * 0.55;
    mix(img, i, [44, 58, 44], a);
    const s = smooth(0.7, 0.85, run[i]) * 0.25;
    mix(img, i, [150, 152, 146], s);
  }
  return img;
}

/** Weathered pier planks: silver-grey boards (vertical in the tile) with dark gaps and bolts. */
function pierPlanks() {
  const W = 128, H = 128, N = W * H, S = 11301;
  const rng = new Rng(S);
  const grain = fbm(W, H, { cx: 16, cy: 2, oct: 4, gain: 0.6, seed: S + 1 });
  const fine = fbm(W, H, { cx: 64, cy: 4, oct: 2, seed: S + 2 });
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 3 });
  const moss = fbm(W, H, { cx: 5, oct: 4, gain: 0.6, seed: S + 4 });
  const edges = [0];
  while (edges[edges.length - 1] < W) edges.push(edges[edges.length - 1] + 16);
  const tone = edges.map(() => rng.gauss() * 0.09), off = edges.map(() => rng.int(0, 127)), warm = edges.map(() => rng.range(-0.06, 0.06));
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const b = x >> 4, d = Math.min(x - edges[b], edges[b + 1] - 1 - x);
    const gap = smooth(1.1, 0.1, d);
    const j = mod(y + off[b], H) * W + x;
    const f = (1 + tone[b] + (grain[j] - 0.5) * 0.45 + (fine[j] - 0.5) * 0.2) * (1 + (big[i] - 0.5) * 0.15) * (1 - gap * 0.75);
    img.r[i] = 118 * f * (1 + warm[b]); img.g[i] = 114 * f; img.b[i] = 106 * f * (1 - warm[b]);
    const bolt = smooth(1.5, 0.6, Math.hypot(d - 3.5, mod(y + off[b], 64) - 6)) + smooth(1.5, 0.6, Math.hypot(d - 3.5, mod(y + off[b], 64) - 58));
    if (bolt > 0) mix(img, i, [58, 46, 38], Math.min(1, bolt));
    const mo = smooth(0.62, 0.8, moss[i]) * 0.35 * (0.6 + gap * 0.4);
    mix(img, i, [60, 70, 52], mo);
    hgt[i] = (grain[j] - 0.5) * 0.7 - gap * 1.6;
  }
  shade(img, hgt, 1.0, 0.5);
  matchMean(img, [104, 100, 92]);
  finish(img, { grain: 7, chroma: 3, sharpen: 0.3, seed: S });
  return img;
}

/** The harbour water: dark green-grey, wind ripples and a dull sky glint (drifts: meta scroll). */
function harbourWater() {
  const W = 128, H = 128, N = W * H, S = 11401;
  const big = fbm(W, H, { cx: 2, oct: 4, gain: 0.6, seed: S + 1 });
  const rip = fbm(W, H, { cx: 8, cy: 5, oct: 4, gain: 0.55, seed: S + 2, turb: true });
  const rip2 = fbm(W, H, { cx: 14, cy: 9, oct: 3, seed: S + 3, turb: true });
  const oil = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 4 });
  const img = makeImg(W, H);
  for (let i = 0; i < N; i++) {
    const f = 1 + (big[i] - 0.5) * 0.3;
    const crest = smooth(0.06, 0.0, rip[i]) * 0.6 + smooth(0.05, 0.0, rip2[i]) * 0.35;
    const trough = smooth(0.3, 0.6, rip[i]) * 0.18;
    img.r[i] = (34 + crest * 64) * f * (1 - trough); img.g[i] = (46 + crest * 70) * f * (1 - trough); img.b[i] = (50 + crest * 74) * f * (1 - trough);
    const sh = smooth(0.75, 0.9, oil[i]) * 0.3;
    mix(img, i, [img.r[i] * 1.2 + 6, img.g[i] * 1.05, img.b[i] * 1.3 + 10], sh);
  }
  finish(img, { grain: 3, chroma: 2, soft: 0.25, seed: S });
  return img;
}

/** The rail bed: grey ballast with timber sleepers across it every 32 units (rails along x). */
function railBed() {
  const W = 128, H = 128, N = W * H, S = 11501;
  const v1 = voronoi(W, H, 32, 32, S + 1, 1);
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 2 });
  const grain = fbm(W, H, { cx: 4, cy: 32, oct: 3, seed: S + 3 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const t = ((v1.id[i] * 2654435761) >>> 0) / 4294967296;
    const stone = smooth(0, 1.6, v1.edge[i]);
    const f = (0.72 + 0.4 * t) * (1 + (big[i] - 0.5) * 0.2);
    img.r[i] = 112 * f; img.g[i] = 110 * f; img.b[i] = 104 * f;
    hgt[i] = stone * 1.4;
    // sleepers: 12 wide every 32 along x, the full tile tall
    const sx = mod(x, 32);
    if (sx >= 10 && sx < 22) {
      const e = Math.min(sx - 10, 21 - sx);
      const g = 1 + (grain[i] - 0.5) * 0.35;
      img.r[i] = 70 * g; img.g[i] = 56 * g; img.b[i] = 44 * g;
      hgt[i] = 2 + Math.min(1, e / 2) * 0.5 + (grain[i] - 0.5) * 0.3;
    }
  }
  shade(img, hgt, 1.0, 0.45);
  matchMean(img, [96, 90, 82]);
  finish(img, { grain: 6, chroma: 2, sharpen: 0.25, seed: S });
  return img;
}

// ------------------------------------------------------------------ metal

/** Profiled steel cladding: blue-grey paint on trapezoid ribs every 32, rust runs and grime low down. */
function cladding() {
  const W = 128, H = 128, N = W * H, S = 11601;
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const fine = fbm(W, H, { cx: 32, oct: 2, seed: S + 2 });
  const run = fbm(W, H, { cx: 20, cy: 2, oct: 3, seed: S + 3 });
  const rust = fbm(W, H, { cx: 5, oct: 4, gain: 0.65, seed: S + 4 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const p = mod(x + 0.5, 32) / 32;
    const prof = p < 0.2 ? 1 : p < 0.3 ? 1 - (p - 0.2) / 0.1 : p < 0.9 ? 0 : (p - 0.9) / 0.1;
    hgt[i] = prof * 2.6 + (fine[i] - 0.5) * 0.1;
    const f = 1 + (big[i] - 0.5) * 0.16 + (fine[i] - 0.5) * 0.06;
    img.r[i] = 92 * f; img.g[i] = 108 * f; img.b[i] = 118 * f;
    const r = Math.max(smooth(0.72, 0.85, rust[i]) * 0.7, smooth(0.66, 0.8, run[i]) * 0.45);
    mix(img, i, [112 * f, 72 * f, 50 * f], r);
    const streak = smooth(0.55, 0.7, run[i]) * 0.12;
    img.r[i] *= 1 - streak; img.g[i] *= 1 - streak; img.b[i] *= 1 - streak;
  }
  shade(img, hgt, 0.9, 0.5, [-0.8, -0.3, 0.5]);
  matchMean(img, [94, 104, 110]);
  finish(img, { grain: 5, chroma: 2, sharpen: 0.2, seed: S });
  return img;
}

/** Painted plate steel in colour rgb: chipped to bare metal at the edges of 64-unit panels, grime. */
function paintedSteel(rgb, S, target) {
  const W = 64, H = 64, N = W * H;
  const big = fbm(W, H, { cx: 2, oct: 4, gain: 0.6, seed: S + 1 });
  const chip = fbm(W, H, { cx: 8, oct: 4, gain: 0.6, seed: S + 2 });
  const fine = fbm(W, H, { cx: 32, oct: 2, seed: S + 3 });
  const dirt = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 4 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const seam = smooth(1.2, 0.2, Math.min(x, W - 1 - x, y, H - 1 - y));
    const f = 1 + (big[i] - 0.5) * 0.14 + (fine[i] - 0.5) * 0.08;
    img.r[i] = rgb[0] * f; img.g[i] = rgb[1] * f; img.b[i] = rgb[2] * f;
    const c = smooth(0.7, 0.76, chip[i] + seam * 0.25);
    mix(img, i, [96 * f, 74 * f, 58 * f], c * 0.85);
    const d = smooth(0.5, 0.85, dirt[i]) * 0.3 + seam * 0.4;
    img.r[i] *= 1 - d * 0.5; img.g[i] *= 1 - d * 0.5; img.b[i] *= 1 - d * 0.5;
    hgt[i] = -seam * 1.2 - c * 0.4 + (fine[i] - 0.5) * 0.2;
  }
  shade(img, hgt, 0.9, 0.55);
  matchMean(img, target);
  finish(img, { grain: 5, chroma: 3, sharpen: 0.25, seed: S });
  return img;
}

/** The ship's hull: oxblood plating in 64 x 32 strakes, weld seams, rust weeping from the rivet lines. */
function hull() {
  const W = 128, H = 128, N = W * H, S = 11801;
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const fine = fbm(W, H, { cx: 32, oct: 2, seed: S + 2 });
  const run = fbm(W, H, { cx: 32, cy: 3, oct: 3, seed: S + 3 });
  const blot = fbm(W, H, { cx: 6, oct: 4, gain: 0.6, seed: S + 4 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    // long strakes 64 tall; butt seams once a tile, staggered by half a tile
    const row = y >> 6, xs = mod(x + (row & 1) * 64, 128);
    const seam = Math.max(smooth(1.0, 0.2, Math.min(mod(y, 64), 63 - mod(y, 64))), smooth(1.0, 0.2, Math.min(xs, 127 - xs)) * 0.8);
    const rivet = (mod(y, 64) === 3 || mod(y, 64) === 60) && mod(x, 8) === 4 ? 1 : 0;
    const f = 1 + (big[i] - 0.5) * 0.18 + (fine[i] - 0.5) * 0.08;
    img.r[i] = 104 * f; img.g[i] = 42 * f; img.b[i] = 36 * f;
    const r = smooth(0.6, 0.78, run[i]) * smooth(0.2, 0.7, 1 - mod(y, 64) / 64) * 0.7 + smooth(0.75, 0.88, blot[i]) * 0.5;
    mix(img, i, [120 * f, 70 * f, 40 * f], Math.min(1, r));
    hgt[i] = -seam * 1.0 + rivet * 1.2 + (fine[i] - 0.5) * 0.2;
  }
  shade(img, hgt, 1.0, 0.5);
  matchMean(img, [96, 46, 38]);
  finish(img, { grain: 6, chroma: 3, sharpen: 0.25, seed: S });
  return img;
}

// ------------------------------------------------------------------ the atlas

// 5 x 7 capitals and figures for the signs
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [30, 1, 1, 14, 1, 1, 30],
  4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 9: [14, 17, 17, 15, 1, 2, 12],
  '-': [0, 0, 0, 14, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], '!': [4, 4, 4, 4, 4, 0, 4], ' ': [0, 0, 0, 0, 0, 0, 0],
};

/** Regions of the 256 x 256 atlas: [x0, y0, x1, y1] in pixels (y down). */
export const BW_ATLAS = {
  size: 256,
  regions: {
    crate: [0, 0, 64, 64], crateB: [64, 0, 128, 64],
    stripes: [128, 0, 256, 16], ring: [128, 16, 176, 80], vent: [176, 16, 224, 64], box: [224, 16, 256, 64],
    door: [0, 64, 48, 160], shutter: [48, 64, 144, 160], tyre: [144, 64, 208, 128], plate: [208, 64, 256, 128],
    window: [144, 128, 208, 160], light: [208, 128, 256, 160],
    // signs (128 x 16 each unless noted)
    harbour: [0, 160, 128, 176], market: [128, 160, 256, 176], wh1: [0, 176, 128, 192], wh2: [128, 176, 256, 192],
    customs: [0, 192, 128, 208], fuel: [128, 192, 256, 208], deep: [0, 208, 128, 224], keep: [128, 208, 256, 224],
    pier1: [0, 224, 64, 240], pier2: [64, 224, 128, 240], berth: [128, 224, 192, 240], noentry: [192, 224, 256, 240],
    name: [0, 240, 128, 256], gate: [128, 240, 256, 256],
  },
};
const SIGNS = {
  harbour: ['HARBOUR MASTER', [236, 236, 228], [32, 58, 96]], market: ['FISH MARKET', [240, 236, 220], [24, 86, 92]],
  wh1: ['WAREHOUSE 1', [24, 24, 22], [214, 178, 52]], wh2: ['WAREHOUSE 2', [24, 24, 22], [214, 178, 52]],
  customs: ['CUSTOMS', [236, 236, 228], [36, 44, 54]], fuel: ['FUEL - NO SMOKING', [236, 236, 228], [150, 36, 30]],
  deep: ['DANGER DEEP WATER', [236, 236, 228], [150, 36, 30]], keep: ['KEEP CLEAR', [24, 24, 22], [214, 178, 52]],
  pier1: ['PIER 1', [236, 236, 228], [32, 58, 96]], pier2: ['PIER 2', [236, 236, 228], [32, 58, 96]],
  berth: ['BERTH 4', [236, 236, 228], [32, 58, 96]], noentry: ['NO ENTRY', [236, 236, 228], [150, 36, 30]],
  name: ['BLACKWATER', [230, 228, 214], [28, 30, 34]], gate: ['GATE 3 - TRUCKS', [24, 24, 22], [214, 178, 52]],
};

function atlas() {
  const A = 256, N = A * A, S = 11901;
  const img = makeImg(A, A), hgt = F32(N);
  const grime = fbm(A, A, { cx: 8, oct: 4, gain: 0.6, seed: S + 1 });
  const fine = fbm(A, A, { cx: 64, oct: 2, seed: S + 2 });
  const grain = fbm(A, A, { cx: 8, cy: 64, oct: 3, seed: S + 3 });
  const set = (x, y, c, h = 0) => { const i = y * A + x; img.r[i] = c[0]; img.g[i] = c[1]; img.b[i] = c[2]; hgt[i] = h; };
  const R = BW_ATLAS.regions;
  const fill = (r, fn) => { for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) fn(x - r[0], y - r[1], x, y, r[2] - r[0], r[3] - r[1]); };
  // crates: planks in a frame with a stencil band
  for (const [k, base] of [['crate', [150, 118, 78]], ['crateB', [88, 104, 76]]]) {
    fill(R[k], (u, v, x, y, w, h) => {
      const fr = Math.min(u, v, w - 1 - u, h - 1 - v);
      const frame = fr < 6, diag = Math.abs((u - v) * 0.707) < 3.5 && !frame;
      const plank = smooth(0.8, 0.2, mod(v, 12) < 1 ? 0 : 1) * 0.0 + (mod(v, 12) < 1 ? 1 : 0);
      const g = 1 + (grain[y * A + x] - 0.5) * 0.4;
      const t = frame || diag ? 1.08 : 1 - plank * 0.4;
      set(x, y, [base[0] * g * t, base[1] * g * t, base[2] * g * t], frame || diag ? 1.5 : -plank);
      if (!frame && !diag && v > 26 && v < 38 && u > 14 && u < 50 && mod(u, 6) < 4) set(x, y, [40, 36, 30], 0);
    });
  }
  // hazard stripes: yellow and black at 45 degrees, 16 wide
  fill(R.stripes, (u, v, x, y) => { const s = mod(u + v, 32) < 16; set(x, y, s ? [214, 176, 40] : [30, 30, 28], 0); });
  // the life ring on its board
  fill(R.ring, (u, v, x, y) => {
    const d = Math.hypot(u - 23.5, v - 31.5), a = Math.atan2(v - 31.5, u - 23.5);
    let c = [62, 70, 80];
    if (d > 10 && d < 20) c = mod(Math.floor((a + Math.PI) / (Math.PI / 4)), 2) ? [230, 226, 214] : [214, 90, 34];
    set(x, y, c, d > 10 && d < 20 ? 1.5 : 0);
  });
  // vent grille, junction box
  fill(R.vent, (u, v, x, y) => { const s = mod(v, 6) < 3 && u > 3 && u < 44 && v > 3 && v < 44; set(x, y, s ? [40, 42, 44] : [120, 124, 126], s ? -1 : 0.5); });
  fill(R.box, (u, v, x, y) => { const e = Math.min(u, v, 31 - u, 47 - v) < 2; set(x, y, e ? [70, 74, 72] : [128, 136, 130], e ? -1 : 0); });
  // a steel door (48 x 96): panel, kick plate, handle
  fill(R.door, (u, v, x, y) => {
    const e = Math.min(u, v, 47 - u, 95 - v) < 3, kick = v > 80, handle = u > 38 && u < 43 && v > 46 && v < 52;
    set(x, y, handle ? [190, 186, 170] : e ? [46, 54, 60] : kick ? [96, 98, 96] : [70, 86, 96], e ? 1 : handle ? 1.5 : 0);
  });
  // a roller shutter (96 x 96): horizontal slats, a dark bottom rail
  fill(R.shutter, (u, v, x, y) => {
    const s = mod(v, 6), g = 1 + (fine[y * A + x] - 0.5) * 0.1;
    const c = v > 90 ? [50, 50, 50] : [128 * g * (s < 1 ? 0.7 : 1), 132 * g * (s < 1 ? 0.7 : 1), 132 * g * (s < 1 ? 0.7 : 1)];
    set(x, y, c, s < 1 ? -1 : s < 3 ? 0.4 : 0);
  });
  // a tyre (side on), a riveted plate, a lit window, a lamp lens
  fill(R.tyre, (u, v, x, y) => { const d = Math.hypot(u - 31.5, v - 31.5); set(x, y, d < 14 ? [120, 120, 116] : d < 30 ? [34, 34, 34] : [24, 24, 24], d < 14 ? 1 : 0); });
  fill(R.plate, (u, v, x, y) => { const r = (mod(u, 16) === 8 && mod(v, 16) === 8); set(x, y, r ? [150, 150, 146] : [96, 98, 98], r ? 1.5 : 0); });
  fill(R.window, (u, v, x, y) => { const f = u < 3 || v < 3 || u > 60 || v > 28 || Math.abs(u - 32) < 2; set(x, y, f ? [60, 62, 60] : [214, 190, 130], f ? 1 : 0); });
  fill(R.light, (u, v, x, y) => { const d = Math.min(u, v, 47 - u, 31 - v); set(x, y, d < 3 ? [90, 90, 90] : [255, 236, 190], 0); });
  // signs: lettering centred on a painted board
  for (const [k, [txt, fg, bg]] of Object.entries(SIGNS)) {
    const r = R[k], w = r[2] - r[0], h = r[3] - r[1];
    fill(r, (u, v, x, y) => { const e = Math.min(u, v, w - 1 - u, h - 1 - v) < 1; set(x, y, e ? [bg[0] * 0.6, bg[1] * 0.6, bg[2] * 0.6] : bg, e ? 0.5 : 0); });
    const sc = 1, tw = txt.length * 6 - 1, tx = r[0] + Math.floor((w - tw * sc) / 2), ty = r[1] + Math.floor((h - 7) / 2);
    [...txt].forEach((ch, ci) => {
      const gl = FONT[ch] || FONT[' '];
      for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) if (gl[gy] & (16 >> gx)) set(tx + ci * 6 + gx, ty + gy, fg, 0.3);
    });
  }
  // weathering over everything
  for (let i = 0; i < N; i++) {
    const g = smooth(0.55, 0.85, grime[i]) * 0.25 + (fine[i] - 0.5) * 0.08;
    img.r[i] *= 1 - g; img.g[i] *= 1 - g; img.b[i] *= 1 - g;
  }
  shade(img, hgt, 0.6, 0.7);
  finish(img, { grain: 4, chroma: 2, seed: S });
  return img;
}

export const PACK = {
  name: 'blackwater',
  textures: {
    bw_concrete: { size: [256, 256], world: [256, 256], gen: quayConcrete },
    bw_seawall: { size: [128, 128], world: [128, 128], gen: seaWall },
    bw_planks: { size: [128, 128], world: [128, 128], surface: 'wood', gen: pierPlanks },
    bw_water: { size: [128, 128], world: [320, 320], surface: 'slosh', scroll: [0.012, 0.02], albedo: [0.16, 0.2, 0.22], gen: harbourWater },
    bw_railbed: { size: [128, 128], world: [128, 128], surface: 'dirt', gen: railBed },
    bw_cladding: { size: [128, 128], world: [128, 128], surface: 'metal', gen: cladding },
    bw_steel: { size: [64, 64], world: [64, 64], surface: 'metal', gen: () => paintedSteel([196, 160, 66], 11701, [156, 128, 62]) },
    bw_iron: { size: [64, 64], world: [64, 64], surface: 'metal', gen: () => paintedSteel([60, 64, 66], 11751, [62, 62, 62]) },
    bw_hull: { size: [128, 128], world: [128, 128], surface: 'metal', gen: hull },
    bw_container_teal: { size: [128, 128], world: [128, 128], surface: 'metal', gen: () => containerTex([46, 108, 106], 7101) },
    bw_atlas: { size: [256, 256], world: [256, 256], surface: 'wood', albedo: [0.4, 0.37, 0.32], gen: atlas },
  },
};
