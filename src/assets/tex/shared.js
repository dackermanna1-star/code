// Shared texture pack: the generic surfaces every modern original map needs (brick,
// painted concrete, cinder block, asphalt, sidewalk, sheet metal, tiles, lab panels, ceiling
// tiles, siding, dark planks, grass, dirt, gravel, murky water, glass, container ribs,
// chain-link, light panels, roof shingles). Same rules as the cs_dust textures: painted in typed arrays with a
// seeded PRNG (deterministic), tileable, authored at 100 % = sunlit, 256-colour quantised.
//
// Pack format (src/assets/tex/packs.js): PACK.textures[name] = { size, world, gen, ...meta }
//   meta as TEXTURES in textures.js, plus blend: true (alpha-blended world texture: glass)
//   albedo: [r,g,b] 0..1 (override the bounce colour; default: the texture's average) and
//   surface: footsteps / impacts ('metal', 'wood', 'dirt', 'sand', 'tile', 'glass', 'slosh';
//   default 'concrete': surfaces.js).
// containerTex(rgb, seed) and tinted(gen, k) let map packs make their own colour variants.
import { Rng, fbm, voronoi, mod, clamp, smooth, lambert, cavity, makeImg, finish, white, F32 } from './core.js';
import { LIGHT, matchMean, masonry } from './stone.js';
import { stampLine } from './wood.js';

const N_OF = (img) => img.w * img.h;

/** Multiply every pixel by the shade s (amb + (1 - amb) * lambert). */
function shade(img, hgt, strength, amb, light = LIGHT) {
  const sh = lambert(hgt, img.w, img.h, strength, light);
  for (let i = 0, n = N_OF(img); i < n; i++) {
    const s = amb + (1 - amb) * sh[i];
    img.r[i] *= s; img.g[i] *= s; img.b[i] *= s;
  }
}

/** Mix colour c into pixel i by t. */
function mix(img, i, c, t) {
  img.r[i] += (c[0] - img.r[i]) * t;
  img.g[i] += (c[1] - img.g[i]) * t;
  img.b[i] += (c[2] - img.b[i]) * t;
}

/** A colour variant of a generator: channels scaled by k = [r, g, b]. */
export function tinted(gen, k) {
  return () => {
    const img = gen();
    for (let i = 0, n = N_OF(img); i < n; i++) { img.r[i] *= k[0]; img.g[i] *= k[1]; img.b[i] *= k[2]; }
    return img;
  };
}

// ------------------------------------------------------------------ masonry

const MASON = {
  tints: [[1, 1, 1], [1.04, 0.98, 0.96], [0.96, 0.98, 1.0], [1.02, 1.0, 0.98], [0.94, 0.94, 0.94]],
  tone: 0.07, hue: 0.06, joint: 0.45, pits: 60, pitDepth: 0.6, pitDark: 0.3,
  bigAmp: 0.14, midAmp: 0.16, detAmp: 0.2, strata: 0, streak: 0.16, blot: 0.18, blotGrey: 0.3, blotThr: 0.55,
  edgeDirt: 0.12, bottomDirt: 0.08, light: 0.4, amb: 0.5, ao: 0.12, cast: 0.2, grain: 7, sharpen: 0.25, soft: 0.3,
  warp: 0.25, corner: 1, chip: 1.2, bevel: 1.2, depth: 1.1, surf: 0.8,
};

export function brickRed() {
  return masonry(128, 128, {
    ...MASON, seed: 5101, courseMin: 16, courseMax: 16, blockMin: 32, blockMax: 32,
    tints: [[1, 1, 1], [1.08, 0.95, 0.9], [0.9, 0.92, 0.95], [1.05, 1.0, 0.95], [0.82, 0.8, 0.82], [1.12, 1.0, 0.92]],
    tone: 0.11, base: [156, 70, 52], mortar: [150, 142, 128], target: [138, 76, 60],
  });
}

export function cinderBlock() {
  return masonry(128, 128, {
    ...MASON, seed: 5201, courseMin: 32, courseMax: 32, blockMin: 64, blockMax: 64,
    tone: 0.05, pits: 420, pitDepth: 0.9, pitDark: 0.4, detAmp: 0.3,
    base: [158, 156, 148], mortar: [128, 126, 118], target: [150, 148, 140],
  });
}

// ------------------------------------------------------------------ concrete, asphalt

/** Painted concrete wall: mottled paint, faint form-tie holes, run streaks. */
export function concretePaint() {
  const W = 128, H = 128, N = W * H, S = 5301;
  const big = fbm(W, H, { cx: 3, oct: 5, gain: 0.55, seed: S + 1 });
  const mid = fbm(W, H, { cx: 10, oct: 3, seed: S + 2 });
  const det = fbm(W, H, { cx: 40, oct: 2, seed: S + 3 });
  const streak = fbm(W, H, { cx: 24, cy: 2, oct: 3, seed: S + 4 });
  const chip = fbm(W, H, { cx: 6, oct: 4, gain: 0.6, seed: S + 5 });
  const img = makeImg(W, H), hgt = F32(N);
  const paint = [196, 192, 178], bare = [150, 148, 140];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let f = 1 + (big[i] - 0.5) * 0.14 + (mid[i] - 0.5) * 0.06 + (det[i] - 0.5) * 0.05;
    f *= 1 - Math.max(0, streak[i] - 0.58) * 0.45;
    const ch = smooth(0.74, 0.78, chip[i]);
    img.r[i] = (paint[0] + (bare[0] - paint[0]) * ch) * f;
    img.g[i] = (paint[1] + (bare[1] - paint[1]) * ch) * f;
    img.b[i] = (paint[2] + (bare[2] - paint[2]) * ch) * f;
    // form-tie holes: a 64 x 64 grid of small dark dimples
    const hx = mod(x - 32, 64) - 0.5, hy = mod(y - 32, 64) - 0.5;
    const d = Math.hypot(hx, hy);
    const tie = smooth(2.4, 1.2, d);
    hgt[i] = (det[i] - 0.5) * 0.4 + (mid[i] - 0.5) * 0.3 - ch * 0.6 - tie * 1.5;
    if (tie > 0) mix(img, i, [92, 90, 86], tie * 0.7);
  }
  shade(img, hgt, 1.0, 0.55);
  matchMean(img, [184, 180, 166]);
  finish(img, { grain: 6, chroma: 2, sharpen: 0.2, soft: 0.2, seed: S });
  return img;
}

/** Asphalt: dark aggregate, tar patches, hairline cracks. lane: a worn yellow dashed line along v. */
function asphaltImg(S, lane) {
  const W = 256, H = 256, N = W * H;
  const big = fbm(W, H, { cx: 3, oct: 5, gain: 0.6, seed: S + 1 });
  const mid = fbm(W, H, { cx: 12, oct: 3, seed: S + 2 });
  const wn = white(W, H, S + 3);
  const crk = fbm(W, H, { cx: 5, oct: 3, seed: S + 4, turb: true });
  const crkM = fbm(W, H, { cx: 3, oct: 2, seed: S + 5 });
  const patch = fbm(W, H, { cx: 4, oct: 4, gain: 0.6, seed: S + 6 });
  const wear = fbm(W, H, { cx: 16, oct: 3, seed: S + 7 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const ag = wn[i];
    const stone = ag > 0.82 ? (ag - 0.82) * 3.2 : 0; // light aggregate specks
    let v = 74 + (big[i] - 0.5) * 18 + (mid[i] - 0.5) * 10 + (ag - 0.5) * 16 + stone * 40;
    const tar = smooth(0.7, 0.74, patch[i]);
    v *= 1 - tar * 0.28;
    const cr = smooth(0.025, 0, crk[i]) * smooth(0.45, 0.6, crkM[i]) * (1 - tar);
    v *= 1 - cr * 0.5;
    img.r[i] = v; img.g[i] = v * 1.0; img.b[i] = v * 1.03;
    hgt[i] = (ag - 0.5) * 0.6 + stone * 0.5 - cr * 1.2;
    if (lane) {
      // dashed centre line: 8 px wide at u = 128, dashes 96 on / 32 off along v
      const dx = Math.abs(x + 0.5 - 128);
      const on = smooth(5, 3.5, dx) * smooth(0, 3, mod(y, 128)) * smooth(99, 96, mod(y, 128));
      const keep = on * smooth(0.3, 0.55, wear[i] + (ag - 0.5) * 0.4);
      if (keep > 0) mix(img, i, [206, 168, 52], keep * 0.9);
    }
  }
  shade(img, hgt, 0.7, 0.6);
  finish(img, { grain: 7, chroma: 2, sharpen: 0.25, seed: S });
  return img;
}
export const asphalt = () => asphaltImg(5401, false);
export const asphaltLane = () => asphaltImg(5401, true);

/** Sidewalk: 64-unit concrete slabs with tooled joints, stains and a few cracks. */
export function sidewalk() {
  const W = 128, H = 128, N = W * H, S = 5501;
  const rng = new Rng(S);
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const det = fbm(W, H, { cx: 32, oct: 2, seed: S + 2 });
  const stain = fbm(W, H, { cx: 5, oct: 4, gain: 0.6, seed: S + 3 });
  const crk = fbm(W, H, { cx: 4, oct: 3, seed: S + 4, turb: true });
  const crkM = fbm(W, H, { cx: 2, oct: 2, seed: S + 5 });
  const tone = [rng.gauss() * 0.04, rng.gauss() * 0.04, rng.gauss() * 0.04, rng.gauss() * 0.04];
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const jx = Math.min(mod(x, 64), 63 - mod(x, 64)), jy = Math.min(mod(y, 64), 63 - mod(y, 64));
    const joint = smooth(1.6, 0.4, Math.min(jx, jy));
    const slab = (x >> 6) + 2 * (y >> 6);
    let v = 170 * (1 + tone[slab] + (big[i] - 0.5) * 0.12 + (det[i] - 0.5) * 0.08);
    v *= 1 - smooth(0.62, 0.8, stain[i]) * 0.18;
    const cr = smooth(0.02, 0, crk[i]) * smooth(0.6, 0.7, crkM[i]);
    v *= 1 - joint * 0.4 - cr * 0.4;
    img.r[i] = v; img.g[i] = v * 0.99; img.b[i] = v * 0.95;
    hgt[i] = (det[i] - 0.5) * 0.4 - joint * 1.2 - cr;
  }
  shade(img, hgt, 1.0, 0.55);
  matchMean(img, [162, 160, 152]);
  finish(img, { grain: 7, chroma: 2, sharpen: 0.25, seed: S });
  return img;
}

// ------------------------------------------------------------------ metal

/** Corrugated sheet metal: vertical ribs every 16 px, galvanised grey with rust runs. */
export function metalCorrugated() {
  const W = 128, H = 128, N = W * H, S = 5601;
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const fine = fbm(W, H, { cx: 32, oct: 2, seed: S + 2 });
  const run = fbm(W, H, { cx: 16, cy: 2, oct: 3, seed: S + 3 });
  const rust = fbm(W, H, { cx: 4, oct: 4, gain: 0.65, seed: S + 4 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    hgt[i] = Math.sin((x + 0.5) / 16 * Math.PI * 2) * 2.2;
    let r = 150, g = 154, b = 156;
    const f = 1 + (big[i] - 0.5) * 0.16 + (fine[i] - 0.5) * 0.08;
    r *= f; g *= f; b *= f;
    const rs = Math.max(smooth(0.68, 0.82, rust[i]), smooth(0.62, 0.75, run[i]) * 0.8);
    img.r[i] = r + (126 * f - r) * rs; img.g[i] = g + (80 * f - g) * rs; img.b[i] = b + (52 * f - b) * rs;
  }
  shade(img, hgt, 0.8, 0.45, [-0.8, -0.3, 0.5]);
  matchMean(img, [140, 134, 128]);
  finish(img, { grain: 5, chroma: 2, sharpen: 0.2, seed: S });
  return img;
}

/** Rusty steel plate: flaking orange-brown rust over the remains of grey paint, welded seams. */
export function metalRust() {
  const W = 128, H = 128, N = W * H, S = 5701;
  const big = fbm(W, H, { cx: 3, oct: 5, gain: 0.6, seed: S + 1 });
  const mid = fbm(W, H, { cx: 10, oct: 4, gain: 0.55, seed: S + 2 });
  const fine = fbm(W, H, { cx: 40, oct: 2, seed: S + 3 });
  const paint = fbm(W, H, { cx: 5, oct: 4, gain: 0.6, seed: S + 4 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const f = 1 + (big[i] - 0.5) * 0.3 + (mid[i] - 0.5) * 0.18 + (fine[i] - 0.5) * 0.14;
    const pt = smooth(0.58, 0.62, paint[i]);
    const seam = smooth(2, 0.5, Math.min(mod(x, 64), 63 - mod(x, 64))) * 0.9;
    img.r[i] = (128 + (98 - 128) * pt) * f; img.g[i] = (72 + (100 - 72) * pt) * f; img.b[i] = (46 + (98 - 46) * pt) * f;
    hgt[i] = (mid[i] - 0.5) * 0.8 + (fine[i] - 0.5) * 0.5 + pt * 0.5 + seam * 1.2;
  }
  shade(img, hgt, 1.0, 0.5);
  matchMean(img, [118, 82, 62]);
  finish(img, { grain: 8, chroma: 4, sharpen: 0.3, seed: S });
  return img;
}

/** Diamond tread plate: raised lozenges in a herringbone on worn steel. */
export function metalDiamond() {
  const W = 64, H = 64, N = W * H, S = 5801;
  const big = fbm(W, H, { cx: 2, oct: 4, gain: 0.6, seed: S + 1 });
  const fine = fbm(W, H, { cx: 16, oct: 2, seed: S + 2 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    // 16 px cells; lozenges alternate +-45 degrees
    const cx = mod(x, 16) - 8 + 0.5, cy = mod(y, 16) - 8 + 0.5;
    const flip = ((x >> 4) + (y >> 4)) & 1 ? -1 : 1;
    const u = (cx + flip * cy) * 0.7071, v = (cx - flip * cy) * 0.7071;
    const loz = smooth(1.0, 0.0, Math.abs(u) / 5.5 + Math.abs(v) / 1.6 - 0.2);
    const f = 1 + (big[i] - 0.5) * 0.2 + (fine[i] - 0.5) * 0.1;
    const shine = loz * 0.18;
    img.r[i] = 138 * f * (1 + shine); img.g[i] = 140 * f * (1 + shine); img.b[i] = 142 * f * (1 + shine);
    hgt[i] = loz * 1.6 + (fine[i] - 0.5) * 0.2;
  }
  shade(img, hgt, 1.2, 0.45);
  matchMean(img, [132, 134, 136]);
  finish(img, { grain: 5, chroma: 1, sharpen: 0.3, seed: S });
  return img;
}

/**
 * Shipping-container side: trapezoid ribs every 24 px in paint colour rgb, scuffs,
 * rust at the scratches and a darker rail along the top and bottom of the tile.
 */
export function containerTex(rgb, seed = 5901) {
  const W = 128, H = 128, N = W * H, S = seed;
  const rng = new Rng(S);
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const fine = fbm(W, H, { cx: 32, oct: 2, seed: S + 2 });
  const rust = fbm(W, H, { cx: 6, oct: 4, gain: 0.65, seed: S + 3 });
  const drip = fbm(W, H, { cx: 20, cy: 2, oct: 3, seed: S + 4 });
  const scr = F32(N);
  for (let k = 0; k < 26; k++) {
    const x = rng.range(0, W), y = rng.range(0, H), a = rng.range(-0.4, 0.4), l = rng.range(6, 24);
    stampLine(scr, W, H, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0.3, rng.range(0.4, 1));
  }
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const p = mod(x + 0.5, 24) / 24;
    // trapezoid profile: flat outer face, sloped sides, flat inner face
    const prof = p < 0.15 ? 0 : p < 0.3 ? (p - 0.15) / 0.15 : p < 0.65 ? 1 : p < 0.8 ? 1 - (p - 0.65) / 0.15 : 0;
    hgt[i] = prof * 2.4 + (fine[i] - 0.5) * 0.1;
    const f = 1 + (big[i] - 0.5) * 0.14 + (fine[i] - 0.5) * 0.06;
    img.r[i] = rgb[0] * f; img.g[i] = rgb[1] * f; img.b[i] = rgb[2] * f;
    const rs = Math.max(smooth(0.72, 0.84, rust[i]) * 0.8, scr[i] * 0.85, smooth(0.66, 0.8, drip[i]) * 0.5);
    mix(img, i, [112 * f, 70 * f, 44 * f], rs);
  }
  shade(img, hgt, 0.9, 0.5, [-0.8, -0.3, 0.5]);
  finish(img, { grain: 6, chroma: 3, sharpen: 0.25, seed: S });
  return img;
}

// ------------------------------------------------------------------ interiors

/** White ceramic tiles, 32 px with grey grout (dirtier toward the joints). */
export function tileWhite() {
  const W = 128, H = 128, N = W * H, S = 6001;
  const rng = new Rng(S);
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const det = fbm(W, H, { cx: 32, oct: 2, seed: S + 2 });
  const grime = fbm(W, H, { cx: 6, oct: 4, gain: 0.6, seed: S + 3 });
  const tone = Array.from({ length: 16 }, () => rng.gauss() * 0.025);
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const jx = Math.min(mod(x, 32), 31 - mod(x, 32)), jy = Math.min(mod(y, 32), 31 - mod(y, 32));
    const j = Math.min(jx, jy);
    const grout = smooth(1.3, 0.6, j);
    const bevel = smooth(3, 1, j) * (1 - grout);
    const t = tone[(x >> 5) + 4 * (y >> 5)];
    let v = 222 * (1 + t + (big[i] - 0.5) * 0.05 + (det[i] - 0.5) * 0.03);
    v *= 1 - smooth(0.6, 0.85, grime[i]) * 0.12 * (1 + grout);
    img.r[i] = v; img.g[i] = v * 0.995; img.b[i] = v * 0.985;
    if (grout > 0) mix(img, i, [132 * (1 - (grime[i] - 0.5) * 0.4), 130, 124], grout);
    hgt[i] = -grout * 1.2 - bevel * 0.4;
  }
  shade(img, hgt, 1.0, 0.6);
  finish(img, { grain: 3, chroma: 1, sharpen: 0.2, seed: S });
  return img;
}

/** Lab wall panel: pale grey-blue enamel, 64 px wide panels with seams and corner screws. */
export function labPanel() {
  const W = 128, H = 128, N = W * H, S = 6101;
  const big = fbm(W, H, { cx: 2, oct: 4, gain: 0.6, seed: S + 1 });
  const det = fbm(W, H, { cx: 24, oct: 2, seed: S + 2 });
  const scuff = fbm(W, H, { cx: 8, oct: 3, seed: S + 3 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const jx = Math.min(mod(x, 64), 63 - mod(x, 64)), jy = Math.min(mod(y, 128), 127 - mod(y, 128));
    const seam = smooth(1.4, 0.4, Math.min(jx, jy));
    const sx = mod(x, 64), sy = mod(y, 128);
    let screw = 0;
    for (const [qx, qy] of [[5, 5], [58, 5], [5, 122], [58, 122]]) screw = Math.max(screw, smooth(2.2, 1.2, Math.hypot(sx + 0.5 - qx, sy + 0.5 - qy)));
    const kick = y >= 112 ? 0.86 : 1; // a darker kick band at the panel foot
    let v = 1 + (big[i] - 0.5) * 0.06 + (det[i] - 0.5) * 0.03 - smooth(0.7, 0.85, scuff[i]) * 0.06;
    v *= kick;
    img.r[i] = 186 * v; img.g[i] = 194 * v; img.b[i] = 198 * v;
    if (screw > 0) mix(img, i, [120, 122, 124], screw);
    hgt[i] = -seam * 1.4 + screw * 0.6 + (y >= 112 && y < 113 ? 0.6 : 0);
  }
  shade(img, hgt, 1.0, 0.6);
  finish(img, { grain: 3, chroma: 1, sharpen: 0.2, seed: S });
  return img;
}

/** Acoustic ceiling tiles: 64 px off-white tiles with fissures in a metal T-grid. */
export function ceilingTile() {
  const W = 128, H = 128, N = W * H, S = 6201;
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const wn = white(W, H, S + 2);
  const fis = fbm(W, H, { cx: 12, oct: 3, seed: S + 3, turb: true });
  const stain = fbm(W, H, { cx: 4, oct: 4, gain: 0.6, seed: S + 4 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const j = Math.min(Math.min(mod(x, 64), 63 - mod(x, 64)), Math.min(mod(y, 64), 63 - mod(y, 64)));
    const grid = smooth(2.2, 1.6, j);
    let v = 210 * (1 + (big[i] - 0.5) * 0.06 + (wn[i] - 0.5) * 0.06);
    const fi = smooth(0.05, 0.0, fis[i]);
    v *= 1 - fi * 0.25 - smooth(0.72, 0.9, stain[i]) * 0.2;
    img.r[i] = v; img.g[i] = v * 0.98; img.b[i] = v * 0.94;
    if (grid > 0) mix(img, i, [176, 178, 180], grid);
    hgt[i] = -fi * 0.6 + (wn[i] - 0.5) * 0.2 + grid * 0.8 - smooth(3, 2.2, j) * (1 - grid) * 0.5;
  }
  shade(img, hgt, 1.0, 0.6);
  finish(img, { grain: 3, chroma: 1, sharpen: 0.15, seed: S });
  return img;
}

/** Self-lit diffuser panel (stretched to fit the lamp face): bright prismatic grid in a steel frame. */
export function lightPanel() {
  const W = 64, H = 32;
  const img = makeImg(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const e = Math.min(x, W - 1 - x, y, H - 1 - y);
    const frame = e < 2 ? 1 : 0;
    const prism = (mod(x, 4) === 0 || mod(y, 4) === 0) ? 0.94 : 1;
    const glow = 0.9 + 0.1 * smooth(2, 10, e);
    if (frame) { img.r[i] = 150; img.g[i] = 152; img.b[i] = 156; }
    else { img.r[i] = 250 * prism * glow; img.g[i] = 250 * prism * glow; img.b[i] = 244 * prism * glow; }
  }
  return img;
}

// ------------------------------------------------------------------ wood

/** Horizontal lap siding: 16 px boards with a shadow line under each lip, chipped paint. */
export function sidingPaint() {
  const W = 128, H = 128, N = W * H, S = 6301;
  const rng = new Rng(S);
  const grain = fbm(W, H, { cx: 4, cy: 32, oct: 3, seed: S + 1 });
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 2 });
  const chip = fbm(W, H, { cx: 10, oct: 4, gain: 0.6, seed: S + 3 });
  const tone = Array.from({ length: 8 }, () => rng.gauss() * 0.03);
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const b = y >> 4, t = mod(y, 16) / 16; // 0 at the lip (top of the image row = board top)
    const lip = smooth(0.12, 0, t);
    const f = 1 + tone[b] + (big[i] - 0.5) * 0.1 + (grain[i] - 0.5) * 0.06;
    const ch = smooth(0.76, 0.8, chip[i]);
    img.r[i] = (214 + (120 - 214) * ch) * f; img.g[i] = (210 + (110 - 210) * ch) * f; img.b[i] = (196 + (96 - 196) * ch) * f;
    hgt[i] = t * 1.6 - lip * 1.2 - ch * 0.3 + (grain[i] - 0.5) * 0.2;
  }
  shade(img, hgt, 1.1, 0.5, [-0.3, -0.85, 0.45]);
  matchMean(img, [196, 192, 178]);
  finish(img, { grain: 6, chroma: 2, sharpen: 0.25, seed: S });
  return img;
}

/** Dark wood planks: vertical boards 16-24 px wide, deep grain, nail heads. */
export function woodDark() {
  const W = 128, H = 128, N = W * H, S = 6401;
  const rng = new Rng(S);
  const grain = fbm(W, H, { cx: 24, cy: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const fine = fbm(W, H, { cx: 64, cy: 4, oct: 2, seed: S + 2 });
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 3 });
  const edges = [0];
  while (edges[edges.length - 1] < W) edges.push(edges[edges.length - 1] + rng.int(16, 24));
  edges[edges.length - 1] = W;
  const tone = edges.map(() => rng.gauss() * 0.08), off = edges.map(() => rng.int(0, 127));
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let b = 0;
    while (x >= edges[b + 1]) b++;
    const d = Math.min(x - edges[b], edges[b + 1] - 1 - x);
    const gap = smooth(1.2, 0.2, d);
    const j = mod(y + off[b], H) * W + x;
    const f = (1 + tone[b] + (grain[j] - 0.5) * 0.4 + (fine[j] - 0.5) * 0.15) * (1 + (big[i] - 0.5) * 0.12) * (1 - gap * 0.6);
    img.r[i] = 92 * f; img.g[i] = 66 * f; img.b[i] = 46 * f;
    const nail = smooth(1.6, 0.8, Math.hypot(x + 0.5 - (edges[b] + edges[b + 1]) / 2, mod(y + off[b], 64) + 0.5 - 8));
    if (nail > 0) mix(img, i, [60, 58, 56], nail);
    hgt[i] = (grain[j] - 0.5) * 0.6 - gap * 1.5;
  }
  shade(img, hgt, 1.0, 0.5);
  matchMean(img, [88, 64, 46]);
  finish(img, { grain: 6, chroma: 3, sharpen: 0.3, seed: S });
  return img;
}

/** Asphalt roof shingles: rows of 32 x 16 tabs, offset, dark grey with granules. */
export function roofShingle() {
  const W = 128, H = 128, N = W * H, S = 6501;
  const rng = new Rng(S);
  const wn = white(W, H, S + 1);
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 2 });
  const tone = Array.from({ length: 64 }, () => rng.gauss() * 0.07);
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const row = y >> 4, t = mod(y, 16) / 16;
    const xs = mod(x + (row & 1) * 16, 128), tab = xs >> 5;
    const gap = smooth(1.2, 0.3, Math.min(mod(xs, 32), 31 - mod(xs, 32))) * smooth(0.3, 0.5, t);
    const f = (1 + tone[(row * 4 + tab) & 63] + (wn[i] - 0.5) * 0.3 + (big[i] - 0.5) * 0.1) * (1 - gap * 0.5) * (0.82 + 0.18 * t);
    img.r[i] = 92 * f; img.g[i] = 88 * f; img.b[i] = 86 * f;
    hgt[i] = t * 1.2 - gap * 1.2 + (wn[i] - 0.5) * 0.3;
  }
  shade(img, hgt, 1.0, 0.5, [-0.3, -0.85, 0.45]);
  finish(img, { grain: 6, chroma: 2, sharpen: 0.25, seed: S });
  return img;
}

// ------------------------------------------------------------------ ground

/** Grass: dense olive-green blades with darker clumps and a little dirt showing through. */
export function grass() {
  const W = 128, H = 128, N = W * H, S = 6601;
  const big = fbm(W, H, { cx: 3, oct: 5, gain: 0.6, seed: S + 1 });
  const clump = fbm(W, H, { cx: 10, oct: 3, seed: S + 2 });
  const blade = fbm(W, H, { cx: 64, cy: 32, oct: 2, seed: S + 3 });
  const wn = white(W, H, S + 4);
  const dirt = fbm(W, H, { cx: 5, oct: 4, gain: 0.6, seed: S + 5 });
  const hue = fbm(W, H, { cx: 4, oct: 3, seed: S + 6 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let i = 0; i < N; i++) {
    const f = 1 + (big[i] - 0.5) * 0.3 + (clump[i] - 0.5) * 0.3 + (blade[i] - 0.5) * 0.25 + (wn[i] - 0.5) * 0.3;
    const h = (hue[i] - 0.5) * 0.3;
    let r = 86 * f * (1 + h), g = 108 * f, b = 52 * f * (1 - h);
    const d = smooth(0.7, 0.8, dirt[i]) * (0.6 + 0.4 * wn[i]);
    r += (104 * f - r) * d; g += (86 * f - g) * d; b += (60 * f - b) * d;
    img.r[i] = r; img.g[i] = g; img.b[i] = b;
    hgt[i] = (clump[i] - 0.5) * 1.2 + (wn[i] - 0.5) * 0.8 - d * 0.5;
  }
  shade(img, hgt, 0.9, 0.55);
  matchMean(img, [88, 100, 56]);
  finish(img, { grain: 9, chroma: 4, sharpen: 0.3, seed: S });
  return img;
}

/** Dark temperate dirt (paths, creek banks): brown-grey earth, clods, roots and pebbles. */
export function dirtDark() {
  const W = 128, H = 128, N = W * H, S = 6701;
  const big = fbm(W, H, { cx: 3, oct: 5, gain: 0.6, seed: S + 1 });
  const mid = fbm(W, H, { cx: 9, oct: 4, gain: 0.55, seed: S + 2 });
  const clod = voronoi(W, H, 16, 16, S + 3, 1);
  const wn = white(W, H, S + 4);
  const wet = fbm(W, H, { cx: 4, oct: 4, gain: 0.6, seed: S + 5 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let i = 0; i < N; i++) {
    const cl = smooth(0, 2.5, clod.edge[i]);
    const f = (1 + (big[i] - 0.5) * 0.26 + (mid[i] - 0.5) * 0.16 + (wn[i] - 0.5) * 0.16) * (0.9 + 0.1 * cl);
    const w = smooth(0.6, 0.8, wet[i]) * 0.25;
    img.r[i] = 104 * f * (1 - w); img.g[i] = 86 * f * (1 - w); img.b[i] = 66 * f * (1 - w * 0.8);
    hgt[i] = cl * 0.8 + (mid[i] - 0.5) * 1.4 + (wn[i] - 0.5) * 0.4;
  }
  shade(img, hgt, 0.9, 0.45);
  matchMean(img, [98, 80, 62]);
  finish(img, { grain: 9, chroma: 3, sharpen: 0.25, seed: S });
  return img;
}

/** Gravel: packed grey stones of mixed size. */
export function gravel() {
  const W = 128, H = 128, N = W * H, S = 6801;
  const v1 = voronoi(W, H, 24, 24, S + 1, 1);
  const v2 = voronoi(W, H, 48, 48, S + 2, 1);
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 3 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let i = 0; i < N; i++) {
    const id = v1.id[i];
    const t = ((id * 2654435761) >>> 0) / 4294967296, t2 = ((v2.id[i] * 2246822519) >>> 0) / 4294967296;
    const e1 = smooth(0, 1.8, v1.edge[i]), e2 = smooth(0, 1.2, v2.edge[i]);
    const stone = e1 * (0.6 + 0.4 * e2);
    const f = (0.75 + 0.45 * t + (t2 - 0.5) * 0.2) * (1 + (big[i] - 0.5) * 0.15);
    const warm = (t2 - 0.5) * 12;
    img.r[i] = (128 + warm) * f; img.g[i] = (126 + warm * 0.6) * f; img.b[i] = 120 * f;
    hgt[i] = stone * 1.8;
  }
  const cav = cavity(hgt, W, H, 2);
  shade(img, hgt, 1.1, 0.45);
  for (let i = 0; i < N; i++) { const k = 1 - clamp(cav[i] * 0.35, 0, 0.45); img.r[i] *= k; img.g[i] *= k; img.b[i] *= k; }
  matchMean(img, [122, 120, 114]);
  finish(img, { grain: 6, chroma: 2, sharpen: 0.3, seed: S });
  return img;
}

/** Murky water (opaque; a static surface): dark green-brown with ripple glints and scum. */
export function waterMurky() {
  const W = 128, H = 128, N = W * H, S = 6851;
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const rip = fbm(W, H, { cx: 12, cy: 6, oct: 3, seed: S + 2, turb: true });
  const scum = fbm(W, H, { cx: 5, oct: 4, gain: 0.6, seed: S + 3 });
  const img = makeImg(W, H);
  for (let i = 0; i < N; i++) {
    const f = 1 + (big[i] - 0.5) * 0.25;
    const glint = smooth(0.05, 0.0, rip[i]) * 0.5;
    const sc = smooth(0.72, 0.85, scum[i]) * 0.5;
    img.r[i] = (40 + glint * 70) * f; img.g[i] = (50 + glint * 72) * f; img.b[i] = (44 + glint * 68) * f;
    mix(img, i, [78 * f, 74 * f, 52 * f], sc);
  }
  finish(img, { grain: 4, chroma: 2, soft: 0.3, seed: S });
  return img;
}

// ------------------------------------------------------------------ alpha

/** Dark tinted glass (alpha-blended): smoky blue-grey with faint diagonal reflections and grime. */
export function glassDark() {
  const W = 64, H = 64, S = 6901;
  const big = fbm(W, H, { cx: 2, oct: 4, gain: 0.6, seed: S + 1 });
  const grime = fbm(W, H, { cx: 6, oct: 4, gain: 0.6, seed: S + 2 });
  const img = makeImg(W, H, true);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const refl = smooth(0.9, 1, Math.sin((x + y) / W * Math.PI * 2) * 0.5 + 0.5) * 0.25;
    const f = 1 + (big[i] - 0.5) * 0.15 + refl;
    const g = smooth(0.6, 0.85, grime[i]);
    img.r[i] = (52 + g * 30) * f; img.g[i] = (62 + g * 26) * f; img.b[i] = (72 + g * 16) * f;
    img.a[i] = clamp(0.58 + refl * 0.4 + g * 0.2, 0, 1);
  }
  return img;
}

/** Chain-link fence (alpha-tested): diagonal galvanised wire on a transparent background. */
export function chainLink() {
  const W = 64, H = 64, N = W * H, S = 7001;
  const SS = 4, w = W * SS, h = H * SS;
  const img = makeImg(W, H, true);
  const cov = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / SS, v = (y + 0.5) / SS;
    const a = mod(u + v, 16), b = mod(u - v, 16);
    const wire = Math.min(a, 16 - a) < 0.9 || Math.min(b, 16 - b) < 0.9 ? 1 : 0;
    cov[(y / SS | 0) * W + (x / SS | 0)] += wire / (SS * SS);
  }
  const rng = new Rng(S);
  for (let i = 0; i < N; i++) {
    const t = 0.9 + rng.next() * 0.2;
    img.r[i] = 150 * t; img.g[i] = 152 * t; img.b[i] = 150 * t;
    img.a[i] = cov[i] > 0.3 ? 1 : 0;
  }
  return img;
}

// ------------------------------------------------------------------ the pack

export const PACK = {
  name: 'shared',
  textures: {
    brick_red: { size: [128, 128], world: [128, 128], gen: brickRed },
    concrete_paint: { size: [128, 128], world: [128, 128], gen: concretePaint },
    cinder_block: { size: [128, 128], world: [128, 128], gen: cinderBlock },
    asphalt: { size: [256, 256], world: [256, 256], gen: asphalt },
    asphalt_lane: { size: [256, 256], world: [256, 256], gen: asphaltLane },
    sidewalk: { size: [128, 128], world: [128, 128], gen: sidewalk },
    metal_corrugated: { size: [128, 128], world: [128, 128], surface: 'metal', gen: metalCorrugated },
    metal_rust: { size: [128, 128], world: [128, 128], surface: 'metal', gen: metalRust },
    metal_diamond: { size: [64, 64], world: [64, 64], surface: 'metal', gen: metalDiamond },
    tile_white: { size: [128, 128], world: [128, 128], surface: 'tile', gen: tileWhite },
    lab_panel: { size: [128, 128], world: [128, 128], surface: 'metal', gen: labPanel },
    ceiling_tile: { size: [128, 128], world: [128, 128], gen: ceilingTile },
    siding_paint: { size: [128, 128], world: [128, 128], surface: 'wood', gen: sidingPaint },
    wood_dark: { size: [128, 128], world: [128, 128], surface: 'wood', gen: woodDark },
    roof_shingle: { size: [128, 128], world: [128, 128], gen: roofShingle },
    grass: { size: [128, 128], world: [128, 128], surface: 'dirt', gen: grass },
    dirt_dark: { size: [128, 128], world: [128, 128], surface: 'dirt', gen: dirtDark },
    gravel: { size: [128, 128], world: [128, 128], surface: 'dirt', gen: gravel },
    water_murky: { size: [128, 128], world: [256, 256], surface: 'slosh', gen: waterMurky },
    glass_dark: { size: [64, 64], world: [64, 64], surface: 'glass', alpha: true, blend: true, albedo: [0.08, 0.09, 0.1], gen: glassDark },
    chainlink: { size: [64, 64], world: [64, 64], surface: 'metal', alpha: true, gen: chainLink },
    container_ribs: { size: [128, 128], world: [128, 128], surface: 'metal', gen: () => containerTex([150, 150, 148], 5901) },
    container_red: { size: [128, 128], world: [128, 128], surface: 'metal', gen: () => containerTex([150, 58, 42], 5911) },
    container_blue: { size: [128, 128], world: [128, 128], surface: 'metal', gen: () => containerTex([52, 84, 128], 5921) },
    container_green: { size: [128, 128], world: [128, 128], surface: 'metal', gen: () => containerTex([64, 112, 74], 5931) },
    container_orange: { size: [128, 128], world: [128, 128], surface: 'metal', gen: () => containerTex([196, 110, 40], 5941) },
    light_panel: { size: [64, 32], world: [32, 16], surface: 'glass', fit: true, gen: lightPanel },
  },
};
