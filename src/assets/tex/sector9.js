// Sector 9 texture pack (zm_sector9): the research level's own surfaces - lab wall panels
// with a dado, vinyl floor tiles, poured concrete (walls and sealed floors), painted steel,
// hazard stripes, the specimen tank's glowing fluid, lab glass, server rack fronts, supply
// cases, red emergency lenses and a sign atlas (stencilled in a 5x7 pixel font). Same rules
// as the shared pack: seeded, tileable (except the `fit` ones), authored at 100 % = lit,
// quantised to 256 colours. Rows run top-down: on a wall, image row 0 is the top of a tile.
import { Rng, fbm, mod, clamp, smooth, lambert, makeImg, finish, white, F32 } from './core.js';
import { LIGHT, matchMean } from './stone.js';
import { stampLine } from './wood.js';

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
function set(img, i, c, k = 1) { img.r[i] = c[0] * k; img.g[i] = c[1] * k; img.b[i] = c[2] * k; }

// ------------------------------------------------------------------ walls and floors

/**
 * Lab wall, 128 x 256 (one tile = floor to 256 up): a black rubber skirting, a blue-grey
 * painted steel dado to 48 with an aluminium capping rail, then off-white enamel panels
 * (64 wide, a joint at 176) with a teal facility stripe at 104-112 and corner screws.
 */
const SCREW_Z = [58, 170, 182, 250];
export function labWall() {
  const W = 128, H = 256, N = W * H, S = 9001;
  const big = fbm(W, H, { cx: 2, cy: 4, oct: 4, gain: 0.6, seed: S + 1 });
  const det = fbm(W, H, { cx: 24, cy: 48, oct: 2, seed: S + 2 });
  const scuff = fbm(W, H, { cx: 8, cy: 16, oct: 3, seed: S + 3 });
  const streak = fbm(W, H, { cx: 16, cy: 2, oct: 3, seed: S + 4 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, z = H - 1 - y; // z: units above the floor
    const f = 1 + (big[i] - 0.5) * 0.06 + (det[i] - 0.5) * 0.03;
    const jx = Math.min(mod(x, 64), 63 - mod(x, 64));
    if (z < 6) { // skirting
      set(img, i, [44, 46, 48], f);
      hgt[i] = 1.2;
    } else if (z < 48) { // dado
      const seam = smooth(1.3, 0.4, jx);
      set(img, i, [86, 100, 112], f * (1 - smooth(0.62, 0.8, scuff[i]) * 0.14));
      hgt[i] = 0.8 - seam * 1.2 + (z > 44 ? 0.3 : 0);
    } else if (z < 52) { // capping rail
      set(img, i, [176, 180, 182], (z === 51 ? 1.12 : z === 48 ? 0.78 : 1) * f);
      hgt[i] = 1.6;
    } else {
      const jz = Math.abs(z - 176);
      const seam = Math.max(smooth(1.3, 0.4, jx), smooth(1.3, 0.4, jz));
      let v = f * (1 - smooth(0.66, 0.85, scuff[i]) * 0.05) * (1 - smooth(70, 52, z) * 0.06);
      v *= 1 - smooth(0.7, 0.9, streak[i]) * 0.07 * smooth(160, 60, z);
      const stripe = z >= 104 && z < 112;
      set(img, i, stripe ? [56, 132, 138] : [206, 208, 206], v);
      if (z === 103 || z === 112) mix(img, i, [120, 124, 124], 0.5);
      let screw = 0;
      const sx = mod(x, 64), qx = sx < 32 ? 5 : 58;
      if (Math.abs(sx + 0.5 - qx) < 2.5) for (const qz of SCREW_Z) if (Math.abs(z + 0.5 - qz) < 2.5) screw = Math.max(screw, smooth(2.0, 1.0, Math.hypot(sx + 0.5 - qx, z + 0.5 - qz)));
      if (screw > 0) mix(img, i, [132, 134, 136], screw);
      hgt[i] = -seam * 1.4 + screw * 0.6;
    }
  }
  shade(img, hgt, 1.0, 0.6);
  finish(img, { grain: 3, chroma: 1, sharpen: 0.2, seed: S });
  return img;
}

/** Vinyl floor tiles: 32 px speckled tiles in two cool greys (a sparse darker accent), worn and waxed. */
export function vinylFloor() {
  const W = 128, H = 128, N = W * H, S = 9101;
  const rng = new Rng(S);
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const wn = white(W, H, S + 2);
  const scuff = fbm(W, H, { cx: 6, oct: 4, gain: 0.65, seed: S + 3 });
  const tone = Array.from({ length: 16 }, (_, k) => ((k + (k >> 2)) % 2 ? 0.96 : 1.04) + rng.gauss() * 0.015);
  const accent = 5; // one darker blue-grey tile per 4x4
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = (x >> 5) + 4 * (y >> 5);
    const j = Math.min(mod(x, 32), 31 - mod(x, 32), mod(y, 32), 31 - mod(y, 32));
    const joint = smooth(0.9, 0.2, j);
    let base = t === accent ? [104, 116, 128] : [150, 154, 156];
    const chip = wn[i] > 0.93 ? 1.18 : wn[i] < 0.06 ? 0.8 : 1;
    const v = tone[t] * chip * (1 + (big[i] - 0.5) * 0.08) * (1 - smooth(0.6, 0.85, scuff[i]) * 0.18);
    set(img, i, base, v);
    if (joint > 0) mix(img, i, [84, 86, 88], joint * 0.8);
    hgt[i] = -joint * 0.8;
  }
  shade(img, hgt, 0.8, 0.7);
  finish(img, { grain: 4, chroma: 2, sharpen: 0.15, seed: S });
  return img;
}

/**
 * Poured concrete (walls): formwork panels 128 x 64 with faint joints, tie holes at the
 * panel corners, pitting, water streaks running down and a grimy foot.
 */
export function pouredConcrete() {
  const W = 128, H = 128, N = W * H, S = 9201;
  const big = fbm(W, H, { cx: 3, oct: 5, gain: 0.6, seed: S + 1 });
  const mid = fbm(W, H, { cx: 10, oct: 3, seed: S + 2 });
  const wn = white(W, H, S + 3);
  const streak = fbm(W, H, { cx: 14, cy: 2, oct: 3, gain: 0.55, seed: S + 4 });
  const blot = fbm(W, H, { cx: 4, oct: 4, gain: 0.65, seed: S + 5 });
  const tone = [1, 0.95, 1.03, 0.97];
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const jy = Math.min(mod(y, 64), 63 - mod(y, 64)), jx = Math.min(x, 127 - x);
    const joint = Math.max(smooth(1.0, 0.2, jy), smooth(1.0, 0.2, jx));
    let tie = 0;
    for (const [qx, qy] of [[16, 16], [112, 16], [16, 48], [112, 48]]) tie = Math.max(tie, smooth(2.6, 1.4, Math.hypot(x + 0.5 - qx, mod(y, 64) + 0.5 - qy)));
    const pit = wn[i] > 0.993 ? 1 : 0;
    let v = tone[(y >> 6) * 2 + (x >> 6) % 2] * (1 + (big[i] - 0.5) * 0.2 + (mid[i] - 0.5) * 0.1);
    v *= 1 - smooth(0.62, 0.86, streak[i]) * 0.16 - smooth(0.68, 0.9, blot[i]) * 0.1;
    set(img, i, [124, 126, 126], v);
    if (joint > 0) mix(img, i, [92, 94, 94], joint * 0.6);
    if (tie > 0) mix(img, i, [58, 60, 62], tie);
    if (pit) mix(img, i, [76, 78, 78], 0.7);
    hgt[i] = (mid[i] - 0.5) * 0.5 - joint * 0.7 - tie * 1.2 - pit * 0.8;
  }
  shade(img, hgt, 1.0, 0.55);
  matchMean(img, [116, 118, 118]);
  finish(img, { grain: 6, chroma: 2, sharpen: 0.25, seed: S });
  return img;
}

/** Sealed concrete floor: smooth trowelled slab, saw-cut joints every 128, oil stains, worn sheen. */
export function concreteFloor() {
  const W = 128, H = 128, N = W * H, S = 9301;
  const big = fbm(W, H, { cx: 2, oct: 5, gain: 0.6, seed: S + 1 });
  const trowel = fbm(W, H, { cx: 6, oct: 3, gain: 0.5, seed: S + 2, turb: true });
  const oil = fbm(W, H, { cx: 3, oct: 4, gain: 0.7, seed: S + 3 });
  const wn = white(W, H, S + 4);
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const j = Math.min(x, 127 - x, y, 127 - y);
    const joint = smooth(1.1, 0.3, j);
    let v = 1 + (big[i] - 0.5) * 0.18 + (trowel[i] - 0.3) * 0.08 + (wn[i] - 0.5) * 0.04;
    v *= 1 - smooth(0.7, 0.92, oil[i]) * 0.3;
    set(img, i, [126, 126, 122], v);
    if (joint > 0) mix(img, i, [70, 70, 68], joint * 0.85);
    hgt[i] = -joint * 0.9 + (trowel[i] - 0.5) * 0.2;
  }
  shade(img, hgt, 0.8, 0.7);
  finish(img, { grain: 4, chroma: 2, sharpen: 0.15, seed: S });
  return img;
}

// ------------------------------------------------------------------ metal

/** Painted steel (railings, frames, pipes, machinery): grey-green enamel, scratches, a few rust spots. */
export function paintedSteel() {
  const W = 64, H = 64, N = W * H, S = 9401;
  const rng = new Rng(S);
  const big = fbm(W, H, { cx: 2, oct: 4, gain: 0.6, seed: S + 1 });
  const brush = fbm(W, H, { cx: 2, cy: 32, oct: 2, seed: S + 2 });
  const rust = fbm(W, H, { cx: 4, oct: 4, gain: 0.65, seed: S + 3 });
  const scr = F32(N);
  for (let k = 0; k < 14; k++) {
    const x = rng.range(0, W), y = rng.range(0, H), a = rng.range(-0.6, 0.6) + (rng.chance(0.5) ? Math.PI / 2 : 0), l = rng.range(4, 14);
    stampLine(scr, W, H, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0.3, rng.range(0.4, 1));
  }
  const img = makeImg(W, H), hgt = F32(N);
  for (let i = 0; i < N; i++) {
    const v = 1 + (big[i] - 0.5) * 0.12 + (brush[i] - 0.5) * 0.06;
    set(img, i, [98, 110, 104], v);
    const rs = smooth(0.8, 0.92, rust[i]);
    if (rs > 0) mix(img, i, [110, 74, 50], rs * 0.6);
    if (scr[i] > 0) mix(img, i, [150, 154, 152], scr[i] * 0.8);
    hgt[i] = -scr[i] * 0.5 + rs * 0.4;
  }
  shade(img, hgt, 0.8, 0.7);
  finish(img, { grain: 4, chroma: 2, sharpen: 0.2, seed: S });
  return img;
}

/** Hazard stripes: yellow / black at 45 degrees (16 px bands), chipped to bare steel, grimy. */
export function hazardStripes() {
  const W = 64, H = 64, N = W * H, S = 9501;
  const chip = fbm(W, H, { cx: 8, oct: 4, gain: 0.6, seed: S + 1 });
  const dirt = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 2 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const d = mod(x + y, 32);
    const yel = d < 16;
    const edge = smooth(0.0, 1.2, Math.min(d, 16 - d, Math.abs(d - 16), 32 - d));
    set(img, i, yel ? [214, 170, 36] : [30, 30, 32], 1 + (dirt[i] - 0.5) * 0.16);
    const c = smooth(0.74, 0.84, chip[i]);
    if (c > 0) mix(img, i, [120, 122, 118], c);
    mix(img, i, [70, 62, 40], smooth(0.55, 0.9, dirt[i]) * 0.35);
    hgt[i] = (1 - c) * 0.6 + edge * 0.1;
  }
  shade(img, hgt, 0.8, 0.7);
  finish(img, { grain: 4, chroma: 3, sharpen: 0.2, seed: S });
  return img;
}

// ------------------------------------------------------------------ self-lit and glass

/** A red emergency lamp lens (fit, fullbright): a hot core fading to deep red behind a wire cage. */
export function redLamp() {
  const W = 64, H = 32;
  const img = makeImg(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const e = Math.min(x, W - 1 - x, y, H - 1 - y);
    const r = Math.hypot((x + 0.5 - W / 2) / (W / 2), (y + 0.5 - H / 2) / (H / 2));
    const hot = smooth(1.0, 0.0, r);
    set(img, i, [150 + 105 * hot, 18 + 90 * hot * hot, 12 + 60 * hot * hot * hot]);
    if (e < 2) set(img, i, [70, 70, 72]);
    else if (mod(x, 12) === 0) mix(img, i, [60, 40, 38], 0.75);
  }
  return img;
}

/** The specimen tank's fluid (fit over each face of the tank, fullbright): green-cyan glow, brighter low down, with bubbles and caustic streaks. */
export function tankFluid() {
  const W = 64, H = 256, S = 9601;
  const rng = new Rng(S);
  const swirl = fbm(W, H, { cx: 2, cy: 8, oct: 4, gain: 0.6, seed: S + 1 });
  const caus = fbm(W, H, { cx: 6, cy: 3, oct: 3, gain: 0.5, seed: S + 2, turb: true });
  const img = makeImg(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = y / (H - 1); // 0 top, 1 bottom
    const k = 0.55 + 0.45 * t + (swirl[i] - 0.5) * 0.3;
    const c = smooth(0.12, 0.0, caus[i]) * 0.35;
    const side = smooth(0, 10, Math.min(x, W - 1 - x)); // darker towards the face's edges
    set(img, i, [60 * k + 120 * c, 220 * k + 30 * c, 150 * k + 60 * c], 0.8 + 0.2 * side);
  }
  for (let k = 0; k < 70; k++) {
    const bx = rng.range(4, W - 4), by = rng.range(4, H - 4), br = rng.range(0.8, 2.4);
    for (let y = Math.floor(by - br - 1); y <= by + br + 1; y++) for (let x = Math.floor(bx - br - 1); x <= bx + br + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
      const ring = smooth(br + 0.8, br, d) * (0.5 + 0.5 * smooth(br * 0.3, br, d));
      if (ring > 0) mix(img, y * W + x, [210, 255, 230], ring * 0.8);
    }
  }
  return img;
}

/** Lab glass (alpha-blended): a clear blue-green tint with faint diagonal reflections. */
export function labGlass() {
  const W = 64, H = 64, S = 9701;
  const big = fbm(W, H, { cx: 2, oct: 4, gain: 0.6, seed: S + 1 });
  const smudge = fbm(W, H, { cx: 5, oct: 4, gain: 0.6, seed: S + 2 });
  const img = makeImg(W, H, true);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const refl = smooth(0.86, 1, Math.sin((x + y * 0.6) / W * Math.PI * 2) * 0.5 + 0.5) * 0.3;
    const f = 1 + (big[i] - 0.5) * 0.1 + refl;
    const s = smooth(0.62, 0.86, smudge[i]);
    set(img, i, [118 + 40 * s, 160 + 20 * s, 164], f);
    img.a[i] = clamp(0.26 + refl * 0.5 + s * 0.14, 0, 1);
  }
  return img;
}

/** A server rack's front (fit over the door; drawn fullbright, so it stays dark): 1U slots, vents, LEDs. */
export function rackFront() {
  const W = 64, H = 128, S = 9801;
  const rng = new Rng(S);
  const img = makeImg(W, H);
  for (let i = 0; i < W * H; i++) set(img, i, [26, 28, 31]);
  const box = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(img, y * W + x, c); };
  box(0, 0, W, 4, [52, 56, 60]); box(0, H - 4, W, H, [52, 56, 60]); box(0, 0, 4, H, [46, 50, 54]); box(W - 4, 0, W, H, [46, 50, 54]);
  let y = 6;
  while (y < H - 10) {
    const u = rng.pick([1, 1, 2, 2, 3, 4]), h = u * 5 + 1;
    if (y + h > H - 6) break;
    const kind = rng.next();
    box(5, y, W - 5, y + h - 1, kind < 0.2 ? [20, 22, 24] : [44, 47, 52]);
    if (kind >= 0.2) {
      for (let x = 8; x < W - 20; x += 2) for (let yy = y + 1; yy < y + h - 2; yy += 2) set(img, yy * W + x, [30, 32, 36]); // vent holes
      const leds = rng.int(1, 4);
      for (let k = 0; k < leds; k++) {
        const c = rng.pick([[90, 255, 120], [90, 255, 120], [255, 190, 50], [80, 170, 255], [255, 60, 50]]);
        const lx = W - 16 + k * 3, ly = y + 1 + rng.int(0, Math.max(0, h - 3));
        set(img, ly * W + lx, c);
        if (lx + 1 < W) mix(img, ly * W + lx + 1, c, 0.4);
      }
      box(W - 8, y + 1, W - 6, y + h - 2, [96, 100, 104]); // handle
    }
    y += h;
  }
  finish(img, { grain: 2, chroma: 1, seed: S });
  return img;
}

/** A hard-shell supply case (fit on each face): blue-grey ribbed shell, steel corners, latches, a yellow label. */
export function supplyCase() {
  const W = 64, H = 64, N = W * H, S = 9901;
  const big = fbm(W, H, { cx: 2, oct: 4, gain: 0.6, seed: S + 1 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const e = Math.min(x, W - 1 - x, y, H - 1 - y);
    const corner = Math.min(x, W - 1 - x) < 9 && Math.min(y, H - 1 - y) < 9;
    const rib = e >= 5 && mod(y, 10) < 2;
    let c = [74, 84, 96];
    if (e < 4) c = [58, 64, 72];
    if (corner) c = [150, 152, 154];
    set(img, i, c, 1 + (big[i] - 0.5) * 0.1);
    if (!corner && x > 18 && x < 46 && y > 20 && y < 34) set(img, i, [206, 172, 46]); // label
    if (!corner && x > 21 && x < 43 && y > 24 && y < 30 && mod(x, 3) === 0) set(img, i, [40, 36, 30]); // its print
    if (!corner && (Math.abs(x - 14) < 3 || Math.abs(x - 50) < 3) && y > 3 && y < 9) set(img, i, [170, 172, 174]); // latches
    hgt[i] = (e < 4 ? 0.6 : 0) + (rib ? 0.5 : 0) + (corner ? 0.8 : 0);
  }
  shade(img, hgt, 0.9, 0.6);
  finish(img, { grain: 3, chroma: 2, sharpen: 0.2, seed: S });
  return img;
}

// ------------------------------------------------------------------ signs

// 5x7 pixel font (the glyphs the signs use)
const G = (...rows) => rows.join('');
const FONT = {
  A: G('.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'), B: G('####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'),
  C: G('.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'), D: G('####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'),
  E: G('#####', '#....', '#....', '####.', '#....', '#....', '#####'), F: G('#####', '#....', '#....', '####.', '#....', '#....', '#....'),
  G: G('.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'), H: G('#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'),
  I: G('.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'), K: G('#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'),
  L: G('#....', '#....', '#....', '#....', '#....', '#....', '#####'), M: G('#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'),
  N: G('#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'), O: G('.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'),
  P: G('####.', '#...#', '#...#', '####.', '#....', '#....', '#....'), R: G('####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'),
  S: G('.####', '#....', '#....', '.###.', '....#', '....#', '####.'), T: G('#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'),
  U: G('#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'), V: G('#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'),
  W: G('#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'), Y: G('#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'),
  0: G('.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'), 1: G('..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'),
  2: G('.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'), 9: G('.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'),
  '-': G('.....', '.....', '.....', '#####', '.....', '.....', '.....'), ' ': G('.....', '.....', '.....', '.....', '.....', '.....', '.....'),
};
/** The sign atlas: 8 rows of 32 px; [text, x0, x1, bg, fg, style] per sign (style: 'haz' striped ends, 'band' a teal bar). */
export const SIGNS = [
  ['SECTOR 9', 0, 256, [26, 64, 70], [236, 238, 232], 'band'],
  ['CONTAINMENT', 0, 256, [214, 172, 38], [24, 22, 20], 'haz'],
  ['DECONTAMINATION', 0, 256, [30, 64, 128], [236, 238, 240]],
  ['SERVER ROOM', 0, 256, [40, 44, 50], [220, 226, 230], 'band'],
  ['SECURITY', 0, 128, [120, 28, 26], [240, 236, 230]], ['CAFETERIA', 128, 256, [36, 96, 60], [236, 238, 232]],
  ['LOADING DOCK', 0, 256, [214, 120, 30], [24, 22, 20], 'haz'],
  ['LAB A', 0, 128, [226, 228, 224], [30, 40, 46], 'band'], ['LAB B', 128, 256, [226, 228, 224], [30, 40, 46], 'band'],
  ['ELEVATOR', 0, 128, [64, 68, 72], [236, 238, 232]], ['LOWER LABS', 128, 256, [64, 68, 72], [236, 238, 232]],
];
const SIGN_ROW = [0, 1, 2, 3, 4, 4, 5, 6, 6, 7, 7];
/** Where sign k sits in the atlas: { x0, x1, y0, y1 } in pixels (row 0 at the top). */
export function signRect(k) { const s = SIGNS[k]; return { x0: s[1], x1: s[2], y0: SIGN_ROW[k] * 32, y1: SIGN_ROW[k] * 32 + 32 }; }

export function signAtlas() {
  const W = 256, H = 256, S = 9951;
  const grime = fbm(W, H, { cx: 8, oct: 4, gain: 0.6, seed: S + 1 });
  const img = makeImg(W, H);
  SIGNS.forEach((s, k) => {
    const [text, x0, x1, bg, fg, style] = s;
    const { y0, y1 } = signRect(k);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      const e = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y);
      let c = bg;
      if (style === 'haz' && (x - x0 < 26 || x1 - 1 - x < 26)) c = mod(x + y, 12) < 6 ? [24, 22, 20] : [214, 172, 38];
      if (style === 'band' && y - y0 >= 24 && y - y0 < 27) c = [70, 160, 168];
      set(img, i, c, 1 - smooth(0.6, 0.9, grime[i]) * 0.2);
      if (e < 2) set(img, i, [150, 152, 150]); // frame
      if (e === 2) mix(img, i, [0, 0, 0], 0.3);
    }
    const sc = 2, cw = 6 * sc, tw = text.length * cw - sc;
    const tx = Math.round((x0 + x1 - tw) / 2), ty = y0 + (style === 'band' ? 6 : 9);
    for (let c = 0; c < text.length; c++) {
      const g = FONT[text[c]] || FONT[' '];
      for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
        if (g[gy * 5 + gx] !== '#') continue;
        for (let sy = 0; sy < sc; sy++) for (let sx = 0; sx < sc; sx++) set(img, (ty + gy * sc + sy) * W + tx + c * cw + gx * sc + sx, fg);
      }
    }
  });
  finish(img, { grain: 3, chroma: 1, seed: S });
  return img;
}

export const PACK = {
  name: 'sector9',
  textures: {
    s9_wall: { size: [128, 256], world: [128, 256], surface: 'metal', gen: labWall },
    s9_floor: { size: [128, 128], world: [128, 128], surface: 'tile', gen: vinylFloor },
    s9_concrete: { size: [128, 128], world: [128, 128], gen: pouredConcrete },
    s9_floorc: { size: [128, 128], world: [128, 128], gen: concreteFloor },
    s9_metal: { size: [64, 64], world: [64, 64], surface: 'metal', gen: paintedSteel },
    s9_hazard: { size: [64, 64], world: [64, 64], surface: 'metal', gen: hazardStripes },
    s9_lamp_red: { size: [64, 32], world: [32, 16], surface: 'glass', fit: true, gen: redLamp },
    s9_tank: { size: [64, 256], world: [64, 256], surface: 'glass', fit: true, albedo: [0.25, 0.85, 0.55], gen: tankFluid },
    s9_glass: { size: [64, 64], world: [64, 64], surface: 'glass', alpha: true, blend: true, albedo: [0.1, 0.13, 0.13], gen: labGlass },
    s9_server: { size: [64, 128], world: [64, 128], surface: 'metal', fit: true, gen: rackFront },
    s9_crate: { size: [64, 64], world: [64, 64], surface: 'metal', fit: true, gen: supplyCase },
    s9_sign: { size: [256, 256], world: [256, 256], surface: 'metal', gen: signAtlas },
  },
};
