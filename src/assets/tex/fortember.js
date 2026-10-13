// Fort Ember texture pack (zm_fort_ember): the fort's adobe plaster and sandstone, the red mesa
// rock, red desert ground, courtyard flagstones, weathered timber, the village's mud brick,
// striped awning canvas, burnt vehicle metal, sandbags, the airstrip's hardpan, a painted
// helipad and the warm self-lit glow of fires and lanterns. Painted in typed arrays with
// seeded noise (deterministic, tileable), authored at 100 % = sunlit, quantised to 256 colours.
import { Rng, fbm, voronoi, mod, clamp, smooth, lambert, cavity, makeImg, finish, white, F32 } from './core.js';
import { LIGHT, matchMean, masonry } from './stone.js';

const shadeBy = (img, hgt, strength, amb, light = LIGHT) => {
  const sh = lambert(hgt, img.w, img.h, strength, light);
  for (let i = 0, n = img.w * img.h; i < n; i++) {
    const s = amb + (1 - amb) * sh[i];
    img.r[i] *= s; img.g[i] *= s; img.b[i] *= s;
  }
};
const mixPx = (img, i, c, t) => {
  img.r[i] += (c[0] - img.r[i]) * t;
  img.g[i] += (c[1] - img.g[i]) * t;
  img.b[i] += (c[2] - img.b[i]) * t;
};

/** Adobe plaster over mud brick: warm ochre lime-wash, fallen patches showing the bricks, cracks, rain streaks. */
function adobe() {
  const W = 128, H = 128, N = W * H, S = 7101;
  const big = fbm(W, H, { cx: 3, oct: 5, gain: 0.55, seed: S + 1 });
  const mid = fbm(W, H, { cx: 9, oct: 4, gain: 0.5, seed: S + 2 });
  const det = fbm(W, H, { cx: 32, oct: 2, seed: S + 3 });
  const patch = fbm(W, H, { cx: 2, oct: 4, gain: 0.6, seed: S + 4 });
  const edge = fbm(W, H, { cx: 16, oct: 2, seed: S + 8 });
  const crk = fbm(W, H, { cx: 5, oct: 3, gain: 0.5, seed: S + 5, turb: true });
  const crkM = fbm(W, H, { cx: 3, oct: 3, seed: S + 6 });
  const streak = fbm(W, H, { cx: 22, cy: 2, oct: 3, seed: S + 7 });
  const img = makeImg(W, H), hgt = F32(N);
  const plaster = [206, 150, 104], brick = [150, 96, 64], mortar = [176, 128, 92];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const pt = smooth(0.64, 0.67, patch[i] + (edge[i] - 0.5) * 0.12);
    // the bricks under the plaster: 32 x 16 courses, staggered
    const row = y >> 4, bx = mod(x + (row & 1) * 16, 32), by = y & 15;
    const joint = Math.min(bx, 31 - bx, by, 15 - by) < 1.5 ? 1 : 0;
    let f = 1 + (big[i] - 0.5) * 0.2 + (mid[i] - 0.5) * 0.1 + (det[i] - 0.5) * 0.08;
    f *= 1 - Math.max(0, streak[i] - 0.56) * 0.5;
    const c = smooth(0.03, 0, crk[i]) * smooth(0.5, 0.62, crkM[i]);
    f *= 1 - c * 0.4;
    const under = joint ? mortar : brick;
    const tone = 1 + (mod(row * 7 + ((x + (row & 1) * 16) >> 5) * 3, 5) - 2) * 0.04;
    img.r[i] = (plaster[0] + (under[0] * tone - plaster[0]) * pt) * f;
    img.g[i] = (plaster[1] + (under[1] * tone - plaster[1]) * pt) * f;
    img.b[i] = (plaster[2] + (under[2] * tone - plaster[2]) * pt) * f;
    hgt[i] = (mid[i] - 0.5) * 0.9 + (det[i] - 0.5) * 0.35 - pt * (1.2 + joint * 0.8) - c * 0.6;
  }
  shadeBy(img, hgt, 1.1, 0.5);
  matchMean(img, [196, 142, 100]);
  finish(img, { grain: 6, chroma: 3, sharpen: 0.2, soft: 0.25, seed: S });
  return img;
}

/** Sandstone ashlar: buff-pink dressed blocks with dark mortar. */
const stone = () => masonry(128, 128, {
  seed: 7201, courseMin: 16, courseMax: 28, blockMin: 28, blockMax: 64,
  tints: [[1, 1, 1], [1.05, 0.97, 0.92], [0.95, 0.95, 0.97], [1.06, 1.0, 0.94], [0.92, 0.9, 0.9], [1.03, 0.96, 0.9]],
  tone: 0.08, hue: 0.08, joint: 0.45, pits: 120, pitDepth: 0.8, pitDark: 0.35,
  bigAmp: 0.16, midAmp: 0.2, detAmp: 0.2, strata: 0.12, streak: 0.2, blot: 0.2, blotGrey: 0.2, blotThr: 0.5,
  edgeDirt: 0.12, bottomDirt: 0.12, light: 0.42, amb: 0.45, ao: 0.12, cast: 0.25, grain: 8, sharpen: 0.25, soft: 0.35,
  warp: 0.6, corner: 2, chip: 2.0, bevel: 1.6, depth: 1.3, surf: 1.1,
  base: [204, 150, 112], mortar: [112, 82, 62], target: [184, 136, 102],
});

/** Red mesa sandstone: horizontal strata in rust, salmon and pale bands, fractures, varnish streaks. */
function mesaRock() {
  const W = 256, H = 256, N = W * H, S = 7301;
  const rng = new Rng(S);
  const bands = [];
  for (let y = 0; y < H;) { const h = rng.int(10, 40); bands.push({ y0: y, h, c: rng.pick([[176, 96, 66], [196, 120, 82], [150, 80, 58], [210, 150, 110], [168, 104, 76], [190, 110, 72]]), prot: rng.gauss() }); y += h; }
  bands[bands.length - 1].h = H - bands[bands.length - 1].y0;
  const rowB = new Int16Array(H);
  bands.forEach((b, k) => { for (let y = b.y0; y < Math.min(H, b.y0 + b.h); y++) rowB[y] = k; });
  const warp = fbm(W, H, { cx: 3, oct: 3, seed: S + 1 });
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 2 });
  const mid = fbm(W, H, { cx: 10, oct: 3, gain: 0.55, seed: S + 3 });
  const det = fbm(W, H, { cx: 48, oct: 2, seed: S + 4 });
  const frac = fbm(W, H, { cx: 6, cy: 2, oct: 3, seed: S + 5, turb: true });
  const varn = fbm(W, H, { cx: 9, cy: 3, oct: 4, gain: 0.6, seed: S + 6 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const Y = mod(y + (warp[i] - 0.5) * 22, H);
    const b = bands[rowB[Math.min(H - 1, Math.floor(Y))]];
    const v = (Y - b.y0) / b.h;
    const ledge = smooth(0, 0.18, v) * (1 - 0.6 * v);
    const fr = smooth(0.035, 0, frac[i]);
    hgt[i] = b.prot * 1.4 + ledge * 3 + (mid[i] - 0.5) * 3 + (det[i] - 0.5) * 1.2 - fr * 2.5;
    let f = 1 + (big[i] - 0.5) * 0.26 + (mid[i] - 0.5) * 0.18 + (det[i] - 0.5) * 0.16;
    f *= 1 - fr * 0.35;
    f *= 1 - smooth(0.62, 0.85, varn[i]) * 0.18; // desert varnish runs
    img.r[i] = b.c[0] * f; img.g[i] = b.c[1] * f; img.b[i] = b.c[2] * f;
  }
  const sh = lambert(hgt, W, H, 0.5, [-0.35, -0.85, 0.5]);
  const cav = cavity(hgt, W, H, 3);
  for (let i = 0; i < N; i++) {
    const s = (0.42 + 0.58 * sh[i]) * (1 - clamp(cav[i] * 0.08, 0, 0.3));
    img.r[i] *= s; img.g[i] *= s; img.b[i] *= s * 1.02;
  }
  matchMean(img, [170, 104, 74]);
  finish(img, { grain: 8, chroma: 4, sharpen: 0.3, soft: 0.35, seed: S });
  return img;
}

/** Red desert ground: packed ochre earth, wind-sorted grit, pebbles, the odd dry crack. */
function desertSand() {
  const W = 256, H = 256, N = W * H, S = 7401;
  const rng = new Rng(S);
  const big = fbm(W, H, { cx: 3, oct: 5, gain: 0.6, seed: S + 1 });
  const mid = fbm(W, H, { cx: 10, oct: 3, gain: 0.55, seed: S + 2 });
  const det = fbm(W, H, { cx: 64, oct: 2, seed: S + 3 });
  const crk = fbm(W, H, { cx: 6, oct: 3, seed: S + 4, turb: true });
  const crkM = fbm(W, H, { cx: 3, oct: 2, seed: S + 5 });
  const wn = white(W, H, S + 6);
  const img = makeImg(W, H), hgt = F32(N);
  const base = [186, 124, 82];
  for (let i = 0; i < N; i++) {
    const c = smooth(0.03, 0, crk[i]) * smooth(0.6, 0.7, crkM[i]);
    let f = 1 + (big[i] - 0.5) * 0.22 + (mid[i] - 0.5) * 0.1 + (det[i] - 0.5) * 0.08 + (wn[i] - 0.5) * 0.08;
    f *= 1 - c * 0.35;
    const pale = smooth(0.62, 0.8, big[i]) * 0.12; // sun-bleached patches
    img.r[i] = base[0] * f * (1 + pale * 0.6);
    img.g[i] = base[1] * f * (1 + pale);
    img.b[i] = base[2] * f * (1 + pale * 1.2);
    hgt[i] = (mid[i] - 0.5) * 1.2 + (det[i] - 0.5) * 0.6 + (wn[i] - 0.5) * 0.4 - c;
  }
  // pebbles
  for (let p = 0; p < 140; p++) {
    const cx = rng.range(0, W), cy = rng.range(0, H), r = rng.range(0.7, 2.2);
    const col = rng.pick([[150, 96, 70], [200, 150, 112], [120, 82, 64], [176, 120, 90]]);
    const R = Math.ceil(r + 1);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx + 0.5 - (cx % 1), dy + 0.5 - (cy % 1)) / r;
      if (d >= 1) continue;
      const i = mod(Math.floor(cy) + dy, H) * W + mod(Math.floor(cx) + dx, W);
      mixPx(img, i, col, smooth(1, 0.6, d));
      hgt[i] = Math.max(hgt[i], Math.sqrt(1 - d * d) * r * 0.5);
    }
  }
  shadeBy(img, hgt, 0.8, 0.5);
  matchMean(img, [180, 122, 84]);
  finish(img, { grain: 8, chroma: 4, sharpen: 0.2, seed: S });
  return img;
}

/** Courtyard flagstones: irregular buff and rose slabs, sandy joints. */
function flagstone() {
  const W = 128, H = 128, N = W * H, S = 7501;
  const v = voronoi(W, H, 5, 5, S + 1, 0.8);
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.55, seed: S + 2 });
  const mid = fbm(W, H, { cx: 12, oct: 3, seed: S + 3 });
  const det = fbm(W, H, { cx: 40, oct: 2, seed: S + 4 });
  const rng = new Rng(S + 5);
  const tones = [];
  for (let k = 0; k < v.n; k++) tones.push({ f: 1 + rng.gauss() * 0.07, c: rng.pick([[198, 160, 124], [190, 146, 116], [206, 170, 132], [184, 150, 122], [196, 152, 112]]) });
  const img = makeImg(W, H), hgt = F32(N);
  for (let i = 0; i < N; i++) {
    const t = tones[v.id[i]];
    const e = smooth(0.8, 2.6, v.edge[i]);
    let f = t.f * (1 + (big[i] - 0.5) * 0.14 + (mid[i] - 0.5) * 0.1 + (det[i] - 0.5) * 0.1);
    f *= 1 - (1 - smooth(2, 5, v.edge[i])) * 0.1;
    const j = [150, 112, 84];
    img.r[i] = (j[0] + (t.c[0] - j[0]) * e) * f;
    img.g[i] = (j[1] + (t.c[1] - j[1]) * e) * f;
    img.b[i] = (j[2] + (t.c[2] - j[2]) * e) * f;
    hgt[i] = e * 1.4 + (mid[i] - 0.5) * 0.5 + (det[i] - 0.5) * 0.3;
  }
  shadeBy(img, hgt, 1.0, 0.5);
  matchMean(img, [182, 142, 110]);
  finish(img, { grain: 6, chroma: 3, sharpen: 0.25, soft: 0.2, seed: S });
  return img;
}

/** Weathered timber: grey-brown planks 32 wide, vertical grain, splits, iron nail heads. */
function timber() {
  const W = 128, H = 128, N = W * H, S = 7601;
  const rng = new Rng(S);
  const grain = fbm(W, H, { cx: 16, cy: 2, oct: 4, gain: 0.55, seed: S + 1 });
  const fine = fbm(W, H, { cx: 64, cy: 4, oct: 2, seed: S + 2 });
  const big = fbm(W, H, { cx: 2, oct: 4, seed: S + 3 });
  const split = fbm(W, H, { cx: 24, cy: 3, oct: 2, seed: S + 4, turb: true });
  const planks = [];
  for (let k = 0; k < 4; k++) planks.push({ f: 1 + rng.gauss() * 0.08, c: rng.pick([[132, 104, 82], [122, 96, 76], [140, 112, 86], [116, 92, 76]]) });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const k = x >> 5, u = x & 31;
    const p = planks[k];
    const gap = u < 1.5 || u > 30.5 ? 1 : 0;
    const g = (grain[i] - 0.5) * 0.4 + (fine[i] - 0.5) * 0.25;
    const sp = smooth(0.03, 0, split[i]) * 0.8;
    let f = p.f * (1 + g + (big[i] - 0.5) * 0.15);
    f *= 1 - sp * 0.4 - gap * 0.55;
    img.r[i] = p.c[0] * f; img.g[i] = p.c[1] * f; img.b[i] = p.c[2] * f;
    hgt[i] = g * 2 - gap * 2 - sp - Math.abs(u - 15.5) * 0.02;
    // nail heads near the plank ends
    for (const ny of [10, 74]) {
      const d = Math.hypot(u - 15.5, y - ny);
      if (d < 2.2) { mixPx(img, i, [70, 58, 52], 0.85); hgt[i] += 1; }
    }
  }
  shadeBy(img, hgt, 0.9, 0.5);
  matchMean(img, [124, 98, 78]);
  finish(img, { grain: 6, chroma: 3, sharpen: 0.3, seed: S });
  return img;
}

/** Village mud brick: big sun-dried bricks, thick mud mortar, crumbled edges. */
const mudBrick = () => masonry(128, 128, {
  seed: 7701, courseMin: 16, courseMax: 16, blockMin: 32, blockMax: 40,
  tints: [[1, 1, 1], [1.04, 0.98, 0.94], [0.95, 0.95, 0.96], [1.06, 1.0, 0.92], [0.9, 0.88, 0.88]],
  tone: 0.1, hue: 0.06, joint: 1.2, pits: 260, pitDepth: 0.9, pitDark: 0.4,
  bigAmp: 0.18, midAmp: 0.22, detAmp: 0.26, strata: 0.06, streak: 0.24, blot: 0.24, blotGrey: 0.15, blotThr: 0.5,
  edgeDirt: 0.15, bottomDirt: 0.1, light: 0.45, amb: 0.45, ao: 0.15, cast: 0.25, grain: 9, sharpen: 0.25, soft: 0.3,
  warp: 1.4, corner: 3, chip: 3.2, bevel: 2.2, depth: 1.4, surf: 1.4,
  base: [172, 116, 78], mortar: [150, 108, 78], target: [162, 112, 78],
});

/** Awning canvas: faded madder-red and cream stripes, weave, sun-bleach and stains. */
function canvas() {
  const W = 128, H = 128, N = W * H, S = 7801;
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const stain = fbm(W, H, { cx: 5, oct: 4, gain: 0.6, seed: S + 2 });
  const wv = white(W, H, S + 3);
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const band = Math.floor(x / 16) & 1;
    const c = band ? [168, 64, 46] : [214, 192, 156];
    const weave = ((x & 1) ^ (y & 1)) * 0.05 + (wv[i] - 0.5) * 0.06;
    let f = 1 + (big[i] - 0.5) * 0.2 + weave;
    f *= 1 - smooth(0.62, 0.82, stain[i]) * 0.25;
    const bleach = smooth(0.55, 0.85, big[i]) * 0.25;
    img.r[i] = (c[0] + (220 - c[0]) * bleach) * f;
    img.g[i] = (c[1] + (196 - c[1]) * bleach) * f;
    img.b[i] = (c[2] + (160 - c[2]) * bleach) * f;
    hgt[i] = Math.sin((y / H) * Math.PI * 8) * 0.6 + weave * 3;
  }
  shadeBy(img, hgt, 0.7, 0.6);
  finish(img, { grain: 5, chroma: 2, sharpen: 0.15, seed: S });
  return img;
}

/** Burnt vehicle metal: char black and rust over the last of the olive paint, seams and rivets. */
function wreck() {
  const W = 128, H = 128, N = W * H, S = 7901;
  const big = fbm(W, H, { cx: 3, oct: 5, gain: 0.6, seed: S + 1 });
  const mid = fbm(W, H, { cx: 10, oct: 4, gain: 0.55, seed: S + 2 });
  const det = fbm(W, H, { cx: 40, oct: 2, seed: S + 3 });
  const paint = fbm(W, H, { cx: 4, oct: 4, gain: 0.6, seed: S + 4 });
  const flake = fbm(W, H, { cx: 20, oct: 2, seed: S + 5 });
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const char = smooth(0.35, 0.65, big[i] + (mid[i] - 0.5) * 0.3);
    const keep = smooth(0.62, 0.7, paint[i] + (flake[i] - 0.5) * 0.15) * (1 - char * 0.8);
    const rust = [132, 70, 40], soot = [44, 36, 32], olive = [92, 96, 64];
    let c = [rust[0] + (soot[0] - rust[0]) * char, rust[1] + (soot[1] - rust[1]) * char, rust[2] + (soot[2] - rust[2]) * char];
    c = [c[0] + (olive[0] - c[0]) * keep, c[1] + (olive[1] - c[1]) * keep, c[2] + (olive[2] - c[2]) * keep];
    const seam = (x & 63) < 1.5 || (y & 63) < 1.5 ? 1 : 0;
    const rv = (mod(x, 64) > 4 && mod(x, 64) < 60 && Math.hypot(mod(x, 8) - 4, mod(y, 64) - 4) < 1.3) ? 1 : 0;
    const f = 1 + (mid[i] - 0.5) * 0.3 + (det[i] - 0.5) * 0.25;
    img.r[i] = c[0] * f * (1 - seam * 0.4); img.g[i] = c[1] * f * (1 - seam * 0.4); img.b[i] = c[2] * f * (1 - seam * 0.4);
    hgt[i] = (mid[i] - 0.5) * 1.2 + (det[i] - 0.5) * 0.8 + keep * 0.6 - seam + rv * 1.2;
  }
  shadeBy(img, hgt, 1.0, 0.5);
  matchMean(img, [96, 64, 48]);
  finish(img, { grain: 7, chroma: 4, sharpen: 0.25, seed: S });
  return img;
}

/** Sandbags: staggered rows of plump burlap bags (32 x 16), dusty tan. */
function sandbag() {
  const W = 128, H = 128, N = W * H, S = 8001;
  const rng = new Rng(S);
  const big = fbm(W, H, { cx: 3, oct: 4, seed: S + 1 });
  const wv = white(W, H, S + 2);
  const tones = [];
  for (let k = 0; k < 64; k++) tones.push(1 + rng.gauss() * 0.07);
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const row = y >> 4, u = mod(x + (row & 1) * 16, 32) - 15.5, v = (y & 15) - 7.5;
    const e = Math.max(0, 1 - Math.pow(Math.abs(u) / 15.5, 4) - Math.pow(Math.abs(v) / 7.6, 3));
    const bulge = Math.sqrt(e);
    const t = tones[(row * 4 + (mod(x + (row & 1) * 16, 128) >> 5)) & 63];
    const weave = ((x & 1) ^ ((y >> 1) & 1)) * 0.06 + (wv[i] - 0.5) * 0.08;
    const f = t * (0.42 + 0.58 * bulge) * (1 + (big[i] - 0.5) * 0.15 + weave);
    img.r[i] = 178 * f; img.g[i] = 152 * f; img.b[i] = 112 * f;
    hgt[i] = bulge * 3 + weave;
  }
  shadeBy(img, hgt, 0.9, 0.55);
  matchMean(img, [156, 132, 98]);
  finish(img, { grain: 6, chroma: 3, sharpen: 0.2, seed: S });
  return img;
}

/** Fire glow (self-lit): white-hot core streaks over orange and deep red, for coals, flames and lanterns. */
function glow() {
  const W = 64, H = 64, S = 8101;
  const a = fbm(W, H, { cx: 4, oct: 4, gain: 0.6, seed: S + 1 });
  const b = fbm(W, H, { cx: 8, cy: 2, oct: 3, seed: S + 2 });
  const img = makeImg(W, H);
  for (let i = 0; i < W * H; i++) {
    const t = clamp(a[i] * 0.7 + b[i] * 0.5 - 0.1, 0, 1);
    img.r[i] = 220 + 35 * t;
    img.g[i] = 96 + 130 * t * t;
    img.b[i] = 30 + 120 * t * t * t;
  }
  return img;
}

/** Hardpan: the airstrip and road surface - compacted pale grit, tyre polish, oil stains. */
function hardpan() {
  const W = 256, H = 256, N = W * H, S = 8201;
  const big = fbm(W, H, { cx: 3, oct: 5, gain: 0.6, seed: S + 1 });
  const mid = fbm(W, H, { cx: 12, oct: 3, seed: S + 2 });
  const det = fbm(W, H, { cx: 64, oct: 2, seed: S + 3 });
  const oil = fbm(W, H, { cx: 4, oct: 4, gain: 0.65, seed: S + 4 });
  const rut = fbm(W, H, { cx: 2, cy: 16, oct: 3, seed: S + 5 });
  const wn = white(W, H, S + 6);
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let f = 1 + (big[i] - 0.5) * 0.18 + (mid[i] - 0.5) * 0.1 + (det[i] - 0.5) * 0.1 + (wn[i] - 0.5) * 0.12;
    // two worn wheel tracks along v
    const tr = Math.max(smooth(18, 6, Math.abs(x - 72 + (rut[i] - 0.5) * 20)), smooth(18, 6, Math.abs(x - 184 + (rut[i] - 0.5) * 20)));
    f *= 1 + tr * 0.08;
    f *= 1 - smooth(0.68, 0.8, oil[i]) * 0.3;
    img.r[i] = 190 * f; img.g[i] = 146 * f; img.b[i] = 110 * f;
    hgt[i] = (mid[i] - 0.5) * 0.8 + (det[i] - 0.5) * 0.6 + (wn[i] - 0.5) * 0.5 - tr * 0.4;
  }
  shadeBy(img, hgt, 0.7, 0.55);
  matchMean(img, [184, 140, 106]);
  finish(img, { grain: 8, chroma: 3, sharpen: 0.2, seed: S });
  return img;
}

/** The helipad (fit to the pad): weathered concrete, a yellow ring and a white H. */
function helipad() {
  const W = 128, H = 128, S = 8301;
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const det = fbm(W, H, { cx: 32, oct: 2, seed: S + 2 });
  const wear = fbm(W, H, { cx: 10, oct: 3, seed: S + 3 });
  const img = makeImg(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const f = 1 + (big[i] - 0.5) * 0.18 + (det[i] - 0.5) * 0.12;
    img.r[i] = 150 * f; img.g[i] = 132 * f; img.b[i] = 116 * f;
    const r = Math.hypot(x + 0.5 - 64, y + 0.5 - 64);
    const ring = smooth(4, 2.5, Math.abs(r - 52));
    const hx = Math.abs(x + 0.5 - 64), hy = Math.abs(y + 0.5 - 64);
    const hH = (hy < 26 && hx > 14 && hx < 22) || (hx < 22 && hy < 4) ? 1 : 0;
    const keep = smooth(0.25, 0.45, wear[i]);
    if (ring > 0) mixPx(img, i, [214, 172, 54], ring * 0.85 * keep);
    if (hH) mixPx(img, i, [222, 214, 196], 0.9 * keep);
  }
  finish(img, { grain: 6, chroma: 2, sharpen: 0.2, seed: S });
  return img;
}

// ------------------------------------------------------------------ signs and paint (an alpha atlas)
// A 5x7 pixel font: the letters the fort's signs and the survivors' graffiti use.
const FONT = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01111 10000 10000 10000 10000 10000 01111', D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01111 10000 10000 10011 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '11111 00100 00100 00100 00100 00100 11111', K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111', M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 11001 10101 10011 10001 10001 10001', O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 01010 01010 00100',
  W: '10001 10001 10001 10101 10101 11011 10001', Y: '10001 10001 01010 00100 00100 00100 00100',
  0: '01110 10011 10101 10101 10101 11001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  9: '01110 10001 10001 01111 00001 00001 01110', '!': '00100 00100 00100 00100 00100 00000 00100',
  '>': '00000 00100 00010 11111 00010 00100 00000', '<': '00000 00100 01000 11111 01000 00100 00000',
  '-': '00000 00000 00000 01110 00000 00000 00000', ' ': '00000 00000 00000 00000 00000 00000 00000',
};

/**
 * The cells of fe_sign (pixels, row 0 at the top): [text, x0, y0, x1, y1, bg, ink, px, style].
 * bg: 'board' weathered planks, 'olive' army paint, 'tin' rusty sheet, null transparent (graffiti
 * on a wall); style: 'paint' (brushy, drips when on a wall) or 'stencil' (crisp, bridged).
 */
export const SIGNS = {
  fort: ['FORT EMBER', 0, 0, 256, 40, 'board', [226, 214, 186], 3, 'paint'],
  ammo: ['AMMO', 0, 40, 80, 72, 'olive', [222, 214, 180], 3, 'stencil'],
  fuel: ['FUEL', 80, 40, 160, 72, 'tin', [178, 40, 30], 3, 'stencil'],
  x: ['X', 160, 40, 200, 72, null, [170, 30, 24], 0, 'cross'],
  evac: ['EVAC >', 0, 72, 128, 104, null, [232, 226, 212], 3, 'paint'],
  help: ['HELP', 128, 72, 256, 104, null, [236, 232, 220], 4, 'paint'],
  keepout: ['KEEP OUT', 0, 104, 128, 136, 'board', [196, 36, 28], 2, 'paint'],
  nofire: ['NO FIRE', 128, 104, 256, 136, 'tin', [236, 228, 206], 2, 'stencil'],
  dontgo: ['DONT GO DOWN', 0, 136, 176, 168, null, [168, 26, 22], 2, 'paint'],
  tally: ['', 176, 136, 256, 168, null, [40, 32, 30], 0, 'tally'],
  sealed: ['SEALED', 0, 168, 96, 200, 'board', [196, 36, 28], 2, 'paint'],
  water: ['WATER', 96, 168, 176, 200, 'board', [222, 214, 186], 2, 'paint'],
  day: ['DAY 9', 176, 168, 256, 200, null, [40, 32, 30], 2, 'paint'],
  airstrip: ['AIRSTRIP >', 0, 200, 128, 232, 'board', [226, 214, 186], 2, 'paint'],
  village: ['< VILLAGE', 128, 200, 256, 232, 'board', [226, 214, 186], 2, 'paint'],
  hazard: ['', 0, 232, 128, 256, 'hazard', null, 0, 'none'],
};
/** Flat paint cells (16 x 24, under the hazard strip's right): where to sample a solid colour. */
export const PAINT = { white: [136, 244], black: [152, 244], yellow: [168, 244], red: [184, 244], soot: [200, 244], glass: [216, 244], rubber: [232, 244], olive: [248, 244] };
const PAINT_RGB = { white: [226, 220, 204], black: [26, 24, 24], yellow: [212, 168, 48], red: [158, 36, 28], soot: [44, 38, 36], glass: [30, 36, 40], rubber: [34, 32, 32], olive: [86, 92, 62] };

function signAtlas() {
  const W = 256, H = 256, S = 8401;
  const rng = new Rng(S);
  const img = makeImg(W, H, true);
  const grain = fbm(W, H, { cx: 32, cy: 3, oct: 3, seed: S + 1 });
  const blot = fbm(W, H, { cx: 6, oct: 4, gain: 0.6, seed: S + 2 });
  const wear = fbm(W, H, { cx: 16, oct: 3, seed: S + 3 });
  const set = (x, y, c, a = 1) => { const i = y * W + x; img.r[i] = c[0]; img.g[i] = c[1]; img.b[i] = c[2]; img.a[i] = a; };
  // transparent, mid-grey under it (mip filtering at the letter edges stays neutral)
  for (let i = 0; i < W * H; i++) { img.r[i] = img.g[i] = img.b[i] = 110; img.a[i] = 0; }
  for (const [, x0, y0, x1, y1, bg] of Object.values(SIGNS)) {
    if (!bg) continue;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x, u = x - x0, v = y - y0, h = y1 - y0;
      let c;
      if (bg === 'hazard') {
        c = mod(x + y, 32) < 16 ? [204, 160, 44] : [34, 30, 28];
        c = c.map((k) => k * (1 - smooth(0.6, 0.8, blot[i]) * 0.35));
      } else if (bg === 'tin') {
        const rust = smooth(0.5, 0.75, blot[i] + (wear[i] - 0.5) * 0.4);
        c = [176 + (130 - 176) * rust, 168 + (72 - 168) * rust, 152 + (44 - 152) * rust];
        if (u < 3 || u > x1 - x0 - 4 || v < 3 || v > h - 4) c = c.map((k) => k * 0.72);
        if ((u === 5 || u === x1 - x0 - 6) && (v === 5 || v === h - 6)) c = [60, 50, 44];
      } else {
        // planks along u, 10-12 px high; olive: the same planks painted army green
        const rows = Math.max(2, Math.round(h / 11)), pr = Math.floor(v / (h / rows)), pv = v - pr * (h / rows);
        const f = 1 + (grain[i] - 0.5) * 0.45 + ((pr * 37) % 5 - 2) * 0.04;
        c = bg === 'olive' ? [92, 96, 64] : [138, 112, 86];
        if (bg === 'olive') { const chip = smooth(0.66, 0.72, wear[i]); c = [c[0] + (130 - c[0]) * chip, c[1] + (104 - c[1]) * chip, c[2] + (80 - c[2]) * chip]; }
        c = c.map((k) => k * f * (pv < 1 ? 0.55 : 1));
        if ((u === 4 || u === x1 - x0 - 5) && Math.abs(pv - h / rows / 2) < 1) c = [56, 48, 44]; // nails
        if (u === 0 || u === x1 - x0 - 1 || v === 0 || v === h - 1) c = c.map((k) => k * 0.6);
      }
      set(x, y, c);
    }
  }
  // the flat paint cells
  for (const [k, [cx, cy]] of Object.entries(PAINT)) for (let y = cy - 12; y < cy + 12; y++) for (let x = cx - 8; x < cx + 8; x++) if (x < W && y < H) set(x, y, PAINT_RGB[k]);
  // the lettering
  for (const [text, x0, y0, x1, y1, bg, ink, px, style] of Object.values(SIGNS)) {
    if (style === 'none') continue;
    const onWall = !bg;
    const dab = (x, y, a) => {
      if (x < x0 || x >= x1 || y < y0 || y >= y1) return;
      const i = y * W + x;
      // paint thins where it's worn (boards) and has ragged edges (graffiti)
      const k = a * (style === 'stencil' ? 1 - smooth(0.7, 0.78, wear[i]) * 0.8 : 1 - smooth(0.72, 0.8, wear[i]) * 0.6);
      if (k <= 0.05) return;
      img.r[i] += (ink[0] - img.r[i]) * k; img.g[i] += (ink[1] - img.g[i]) * k; img.b[i] += (ink[2] - img.b[i]) * k;
      if (onWall) img.a[i] = Math.max(img.a[i], k > 0.45 ? 1 : 0);
    };
    if (style === 'cross') { // a big daubed X: two thick strokes and drips
      const w = x1 - x0, h = y1 - y0;
      for (let t = 0; t <= 1; t += 0.01) for (const s of [0, 1]) {
        const x = x0 + 6 + (w - 12) * t, y = y0 + 4 + (h - 10) * (s ? 1 - t : t);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5 + rng.next() * 2) dab(Math.round(x + dx), Math.round(y + dy), 1);
      }
      for (const dx of [8, w - 9, w / 2]) { const L = rng.int(3, 6); for (let d = 0; d < L; d++) dab(Math.round(x0 + dx), y1 - 6 + d, 1); }
      continue;
    }
    if (style === 'tally') { // survivors' day count: four strokes and a bar, twice, and a fifth stroke
      for (let gI = 0; gI < 3; gI++) {
        const bx = x0 + 6 + gI * 26, n = gI === 2 ? 2 : 4;
        for (let s = 0; s < n; s++) for (let y = y0 + 6; y < y1 - 6; y++) dab(bx + s * 5 + Math.round((y - y0) * 0.06), y, 1);
        if (gI < 2) for (let t = 0; t < 24; t++) dab(bx - 2 + t, Math.round(y1 - 9 - t * 0.6), 1);
      }
      continue;
    }
    const n = text.length, cw = 6 * px, tw = n * cw - px, th = 7 * px;
    if (tw > x1 - x0 - 4) throw new Error(`fe_sign: "${text}" is ${tw} px, its cell ${x1 - x0}`);
    const ox = Math.round(x0 + (x1 - x0 - tw) / 2), oy = Math.round(y0 + (y1 - y0 - th) / 2);
    for (let c = 0; c < n; c++) {
      const rows = (FONT[text[c]] || FONT[' ']).split(' ');
      const jy = style === 'paint' ? rng.int(-1, 1) : 0;
      for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) {
        if (rows[r][q] !== '1') continue;
        const gx = ox + c * cw + q * px, gy = oy + r * px + jy;
        for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
          // stencil bridges: a gap through the middle of each stroke column
          if (style === 'stencil' && px >= 3 && r === 3 && x === 1 && rows[2][q] === '1' && rows[4][q] === '1') continue;
          const edge = style === 'paint' && (x === 0 || y === 0 || x === px - 1 || y === px - 1) && rng.next() < 0.18 ? 0.5 : 0;
          dab(gx + x, gy + y, 1 - edge);
        }
        // runs of wet paint under the bottom strokes of graffiti
        if (onWall && (r === 6 || rows[r + 1][q] !== '1') && rng.next() < 0.35) {
          const L = rng.int(2, 7), dx = gx + rng.int(0, px - 1);
          for (let d = 0; d < L; d++) dab(dx, gy + px + d, 1);
        }
      }
    }
  }
  return img;
}

export const PACK = {
  name: 'fortember',
  textures: {
    fe_adobe: { size: [128, 128], world: [128, 128], gen: adobe },
    fe_stone: { size: [128, 128], world: [128, 128], gen: stone },
    fe_rock: { size: [256, 256], world: [384, 384], gen: mesaRock },
    fe_sand: { size: [256, 256], world: [256, 256], surface: 'sand', gen: desertSand },
    fe_flagstone: { size: [128, 128], world: [128, 128], gen: flagstone },
    fe_timber: { size: [128, 128], world: [128, 128], surface: 'wood', gen: timber },
    fe_mudbrick: { size: [128, 128], world: [128, 128], gen: mudBrick },
    fe_canvas: { size: [128, 128], world: [128, 128], gen: canvas },
    fe_wreck: { size: [128, 128], world: [128, 128], surface: 'metal', gen: wreck },
    fe_sandbag: { size: [128, 128], world: [128, 128], surface: 'dirt', gen: sandbag },
    fe_glow: { size: [64, 64], world: [32, 32], gen: glow },
    fe_hardpan: { size: [256, 256], world: [256, 256], surface: 'dirt', gen: hardpan },
    fe_helipad: { size: [128, 128], world: [128, 128], fit: true, gen: helipad },
    fe_sign: { size: [256, 256], world: [256, 256], alpha: true, albedo: [150, 120, 96], surface: 'wood', gen: signAtlas },
  },
};
