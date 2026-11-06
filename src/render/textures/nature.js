// Natural textures: terrain, logs, leaves, plants (cross sprites), crops.
import {
  Img, memoImg, pal, hex, mix, shade, fbm, white, worley, eq, combine, pick, paint, grain, grime, speckle,
  crack, leafBit, rnd, makeRng, clamp01, seedFromString, vnoise,
} from './core.js';

// ---------------------------------------------------------------------------
// palettes
export const DIRT = pal(0x45301f, 0x503825, 0x5b402a, 0x664830, 0x715137, 0x7d5a3e);
export const GRASS = pal(0x3a4521, 0x434f25, 0x4d5929, 0x57632e, 0x626d34, 0x6e773a, 0x7b8142);
const GRASS_STRAW = pal(0x86814b, 0x8f8650, 0x7d7a45);
export const DRY = pal(0x6a5a32, 0x776638, 0x84723f, 0x917f47, 0x9e8b50, 0xab985a);
export const LEAF_LITTER = [0x9a5a2a, 0xa86c30, 0x8a3a26, 0x7a4b28, 0xa38a3c, 0x8e6a2e, 0x6a3e22, 0xb08a3c, 0x5e4a2a, 0x74502c];

// ---------------------------------------------------------------------------
// terrain
function dirtBase(img, seed) {
  const f = eq(combine(fbm(seed, 4, 4, 3, 0.55), 0.55, white(seed + 1), 0.45));
  paint(img, DIRT, f, 0.8);
  speckle(img, seed + 2, 0.035, pal(0x392719, 0x3e2b1c));
  const r = makeRng(seed + 3);
  for (let k = 0; k < 5; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    const c = r.pick(pal(0x8a7c6a, 0x7a6e5e, 0x948670, 0x6e604f));
    img.set(x, y, shade(c, 0.04));
    if (r.chance(0.5)) img.set(x + 1, y, shade(c, -0.08));
    img.mul(x, y + 1, 0.85);
  }
  // a couple of root fibres
  for (let k = 0; k < 2; k++) {
    let x = r.int(0, 15), y = r.int(0, 15);
    const c = hex(0x3a2a1b);
    for (let s = 0; s < r.int(3, 5); s++) { img.mix(x, y, c, 0.6); x += r.int(0, 1); y += r.chance(0.6) ? 1 : 0; }
  }
  return img;
}
const DIRT_SEED = seedFromString('dirt');

function grassTop(img, seed, P = GRASS, straw = GRASS_STRAW, dark = 0x2f381b) {
  const f = eq(combine(fbm(seed, 4, 4, 2), 0.35, white(seed + 1), 0.65));
  paint(img, P, f, 0.5);
  speckle(img, seed + 2, 0.06, straw);
  speckle(img, seed + 3, 0.045, [hex(dark)]);
  // tiny blade highlights: a light pixel above a dark one
  const r = makeRng(seed + 4);
  for (let k = 0; k < 14; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    img.set(x, y, shade(P[P.length - 1], 0.03));
    img.set(x, y + 1, P[1]);
  }
  return img;
}

function grassSide(img, seed, P, straw, dark) {
  img.copy(memoImg('dirt_base', () => dirtBase(new Img(), DIRT_SEED)));
  const top = memoImg('grass_top_' + seed, () => grassTop(new Img(), seed, P, straw, dark));
  for (let x = 0; x < 16; x++) {
    const h = rnd(seed, x, 0, 5);
    let depth = 3 + (h < 0.4 ? 1 : 0) + (h < 0.12 ? 1 : 0) - (h > 0.9 ? 1 : 0);
    for (let y = 0; y < depth; y++) {
      let c = top.rgb(x, y);
      if (y === depth - 1) c = shade(c, -0.05);
      img.set(x, y, c);
    }
    img.mul(x, depth, 0.78);
    if (rnd(seed, x, 1, 6) < 0.25) { img.set(x, depth, shade(P[1], -0.03)); img.mul(x, depth + 1, 0.85); }
  }
  return img;
}

function forestTop(img, seed) {
  const H = pal(0x35281c, 0x3d2e20, 0x463524, 0x4f3c29, 0x58432e);
  paint(img, H, eq(combine(fbm(seed, 4, 4, 2), 0.5, white(seed + 1), 0.5)), 0.7);
  const r = makeRng(seed + 2);
  // pine needles
  for (let k = 0; k < 14; k++) {
    const x = r.int(0, 15), y = r.int(0, 15), dx = r.pick([-1, 1]), len = r.int(2, 3);
    const c = hex(r.pick([0x7a6238, 0x6b5430, 0x8a7044, 0x5a4527]));
    const steep = r.chance(0.5);
    for (let s = 0; s < len; s++) img.set(x + s * dx, y + (steep ? s : s >> 1), s === 0 ? shade(c, 0.05) : c);
  }
  // fallen leaves (with a dark shadow pixel under some)
  for (let k = 0; k < 30; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    if (r.chance(0.4)) img.mul(x + 1, y + 2, 0.75);
    leafBit(img, x, y, hex(r.pick(LEAF_LITTER)), r);
  }
  // twig
  const tx = r.int(0, 15), ty = r.int(0, 15);
  for (let s = 0; s < 5; s++) { img.set(tx + s, ty + (s >> 1), hex(0x5e4832)); img.mul(tx + s, ty + (s >> 1) + 1, 0.7); }
  speckle(img, seed + 7, 0.025, pal(0x4d5929, 0x57632e));
  return img;
}

// ---------------------------------------------------------------------------
// logs
function ringsTop(img, seed, wood, bark, opts = {}) {
  const n = fbm(seed, 4, 4, 2);
  const wn = white(seed + 1);
  const r = makeRng(seed + 2);
  img.each((x, y) => {
    const dx = x - 7.5, dy = y - 7.5;
    const d = Math.max(Math.abs(dx), Math.abs(dy)) * 0.55 + Math.hypot(dx, dy) * 0.45 + (n[y * 16 + x] - 0.5) * 1.1;
    const ring = Math.floor(d * 0.95);
    let v = (ring & 1 ? 0.3 : 0.7) + (wn[y * 16 + x] - 0.5) * 0.35 - d * 0.02;
    img.set(x, y, pick(wood, clamp01(v), x, y, 0.5));
  });
  // pith
  img.set(7, 7, shade(wood[0], -0.06)); img.set(8, 8, wood[0]); img.set(8, 7, wood[1]);
  // radial check crack
  const ang = r.range(0, Math.PI * 2);
  for (let s = 1; s < 7; s++) img.mul(Math.round(7.5 + Math.cos(ang) * s), Math.round(7.5 + Math.sin(ang) * s), 0.7);
  // bark ring
  img.each((x, y) => {
    const e = Math.min(x, y, 15 - x, 15 - y);
    if (e === 0) img.set(x, y, pick(bark, rnd(seed, x, y, 9), x, y));
    else if (e === 1 && rnd(seed, x, y, 8) < 0.35) img.set(x, y, pick(bark, 0.6 + rnd(seed, x, y, 7) * 0.4, x, y));
    else if (e === 1) img.mul(x, y, 0.88);
  });
  if (opts.after) opts.after(img, r);
  return img;
}

function oakBark(img, seed) {
  const B = pal(0x2a1f15, 0x33261a, 0x3d2e1f, 0x473624, 0x523f2a, 0x5d4830);
  const f = eq(combine(fbm(seed, 8, 2, 3), 0.55, white(seed + 1), 0.45));
  paint(img, B, f, 0.6);
  const r = makeRng(seed + 2);
  // meandering vertical furrows
  for (let k = 0; k < 5; k++) {
    let x = r.int(0, 15);
    const y0 = r.int(0, 15), len = r.int(8, 16);
    for (let s = 0; s < len; s++) {
      img.set(x, y0 + s, hex(0x1f1610));
      img.mul(x + 1, y0 + s, 1.12);
      if (r.chance(0.18)) x += r.pick([-1, 1]);
    }
  }
  // lichen
  for (let k = 0; k < 2; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    img.mix(x, y, hex(0x737a62), 0.7); img.mix(x + 1, y, hex(0x646b55), 0.6); img.mix(x, y + 1, hex(0x5d634e), 0.5);
  }
  return img;
}
function birchBark(img, seed) {
  const W = pal(0xaaa496, 0xb9b3a5, 0xc7c2b4, 0xd3cec1, 0xdcd8cc, 0xe5e1d6);
  paint(img, W, eq(combine(fbm(seed, 2, 8, 2), 0.6, white(seed + 1), 0.4)), 0.5);
  const r = makeRng(seed + 2);
  for (let k = 0; k < 7; k++) {
    const x = r.int(0, 15), y = r.int(0, 15), len = r.int(3, 6);
    for (let s = 0; s < len; s++) {
      const end = s === 0 || s === len - 1;
      img.set(x + s, y, hex(end ? 0x4a453e : 0x221e1a));
      if (!end && len > 3 && r.chance(0.55)) img.set(x + s, y - 1, hex(0x3a352f));
      img.mix(x + s, y + 1, hex(0x7d786c), 0.5);
    }
  }
  // tiny dark lenticels
  for (let k = 0; k < 6; k++) { const x = r.int(0, 15), y = r.int(0, 15); img.set(x, y, hex(0x5a554c)); img.set(x + 1, y, hex(0x6e695e)); }
  for (let k = 0; k < 2; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    img.set(x, y, hex(0xb08c62)); img.set(x + 1, y, hex(0x9c7a52)); img.set(x, y + 1, hex(0xa38158));
  }
  grain(img, seed + 4, 0.03);
  return img;
}
function pineBark(img, seed) {
  // vertical strips of scaly plates with irregular breaks; furrows between strips meander by a pixel
  const P = pal(0x45291c, 0x523220, 0x5e3a26, 0x6a432c, 0x764c33, 0x80553a);
  const G = pal(0x4a3a30, 0x56463a, 0x625244, 0x6e5e4e);
  const r = makeRng(seed);
  const wn = white(seed + 1);
  const edges = [0, 4, 9, 12].map((b) => b + r.int(0, 1));
  const breaks = edges.map(() => { const n = r.int(2, 3), off = r.int(0, 15), out = []; for (let k = 0; k < n; k++) out.push((off + Math.floor((k * 16) / n) + r.int(-1, 1)) & 15); return out; });
  img.each((x, y) => {
    const i = y * 16 + x;
    const wob = rnd(seed, Math.floor(y / 3), 0, 3) < 0.45 ? 1 : 0;
    let band = 3;
    for (let k = 0; k < 4; k++) { const e0 = edges[k] + wob, e1 = (k < 3 ? edges[k + 1] : edges[0] + 16) + wob; if ((x >= e0 && x < e1) || (x + 16 >= e0 && x + 16 < e1)) { band = k; break; } }
    const e0 = edges[band] + wob;
    const lx = (x - e0 + 16) & 15;
    if (lx === 0) { img.set(x, y, hex(rnd(seed, x, y, 4) < 0.5 ? 0x221510 : 0x2c1c14)); return; }
    const br = breaks[band];
    let plate = 0, ly = 99;
    for (let k = 0; k < br.length; k++) { const d = (y - br[k] + 16) & 15; if (d < ly) { ly = d; plate = k; } }
    if (ly === 0) { img.set(x, y, hex(0x2a1a12)); return; }
    let v = 0.3 + rnd(seed, band, plate, 5) * 0.4 + (wn[i] - 0.5) * 0.3;
    if (ly === 1) v += 0.22; // lit top edge of the plate
    if (lx === 1) v += 0.12; else if (lx >= 3) v -= 0.12;
    const grey = rnd(seed, band, plate, 6) < 0.3;
    img.set(x, y, pick(grey ? G : P, clamp01(v), x, y, 0.6));
  });
  speckle(img, seed + 5, 0.03, pal(0x9a7650, 0x2a1a12));
  return img;
}

// ---------------------------------------------------------------------------
// leaves (cube cutout)
function leaves(img, seed, families, opts = {}) {
  const { holes = 0.2, clump = 4, edge = 0.4 } = opts;
  const w = worley(seed, clump, clump, 0.95);
  const wn = white(seed + 1), wh = white(seed + 2);
  const famOf = (id) => {
    const h = rnd(seed, id, 0, 6);
    let acc = 0;
    for (const [f, wt] of families) { acc += wt; if (h < acc) return f; }
    return families[0][0];
  };
  img.each((x, y) => {
    const i = y * 16 + x;
    const e = w.d2[i] - w.d1[i];
    const isHole = (e < edge && wh[i] < 0.62) || wh[i] < holes * 0.4 || (w.d1[i] > 3 && wh[i] < 0.55);
    if (isHole) { img.set(x, y, [0, 0, 0], 0); return; }
    const P = famOf(w.id[i]);
    let v = 0.52 + (-w.ox[i] - w.oy[i]) * 0.13 + (wn[i] - 0.5) * 0.4 - (e < 1.0 ? 0.22 : 0) + (rnd(seed, w.id[i], 1, 7) - 0.5) * 0.3;
    img.set(x, y, pick(P, clamp01(v), x, y, 0.5), 255);
  });
  if (opts.after) opts.after(img, makeRng(seed + 9));
  return img;
}
const L_GREEN = pal(0x26301a, 0x2f3b1e, 0x394622, 0x435126, 0x4e5b2b, 0x5a6531);
const L_YGREEN = pal(0x3f421c, 0x4c4e20, 0x5a5b25, 0x69672a, 0x787330, 0x878037);
const L_BROWN = pal(0x3e2a17, 0x4b331b, 0x583c20, 0x664626, 0x72502c, 0x7e5a33);
const L_ORANGE = pal(0x6a2c10, 0x823814, 0x9a4618, 0xb2561c, 0xc46a22, 0xd2822c);
const L_YELLOW = pal(0x7a5a16, 0x8f6a1a, 0xa47c20, 0xb88f28, 0xc8a032, 0xd4b040);
const L_RED = pal(0x3c100d, 0x4e1610, 0x621c13, 0x762317, 0x8a2c1c, 0x9c3822);
const L_CRIMSON = pal(0x4a1a12, 0x5c2016, 0x6e281a, 0x80321e, 0x903c24, 0xa0482a);
const L_PINE = pal(0x15231d, 0x1b2b23, 0x213329, 0x283c30, 0x2f4537, 0x384f3f);
const L_BIRCH = pal(0x5a5520, 0x6b6424, 0x7f7429, 0x938530, 0xa69637, 0xb8a640);

function pineNeedles(img, seed) {
  img.fill([0, 0, 0], 0);
  const r = makeRng(seed);
  // dense diagonal needle strokes
  for (let k = 0; k < 95; k++) {
    const x = r.int(0, 15), y = r.int(0, 15), dir = r.chance(0.5) ? 1 : -1, len = r.int(2, 4);
    const base = r.range(0.2, 0.95);
    for (let s = 0; s < len; s++) {
      const v = clamp01(base - s * 0.08 + (r.next() - 0.5) * 0.2);
      img.set(x + s * dir, y + s, pick(L_PINE, v, x + s, y + s, 0.4), 255);
    }
  }
  // twig shadows
  for (let k = 0; k < 3; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    for (let s = 0; s < 4; s++) img.set(x + s, y + (s >> 1), hex(0x2a2018), 255);
  }
  // ensure a reasonable amount of see-through
  img.each((x, y) => { if (rnd(seed, x, y, 4) < 0.08) img.setA(x, y, 0); });
  return img;
}

// ---------------------------------------------------------------------------
// cross plants (transparent background)
function blade(img, x0, h, lean, P, r, opts = {}) {
  const { y0 = 15, width = 1 } = opts;
  let lastX = x0;
  for (let s = 0; s <= h; s++) {
    const t = s / h;
    const x = Math.round(x0 + lean * t * t);
    const y = y0 - s;
    const v = clamp01(0.15 + t * 0.75 + (r.next() - 0.5) * 0.2);
    const c = pick(P, v, x, y, 0.3);
    img.set(x, y, c);
    if (width > 1 && s < h * 0.6) img.set(x + 1, y, shade(c, -0.05));
    if (Math.abs(x - lastX) > 1) img.set((x + lastX) >> 1, y + 1, c);
    lastX = x;
  }
}
function tallGrass(img, seed) {
  const r = makeRng(seed);
  const G = pal(0x2f3a1c, 0x3c4822, 0x4a5629, 0x586431, 0x667139, 0x777d42);
  const T = pal(0x5e5530, 0x706438, 0x847542, 0x97874d, 0xa89858);
  const xs = [1, 3, 4, 6, 7, 8, 10, 11, 13, 14, 5, 9, 12, 2];
  xs.forEach((x0, k) => blade(img, x0, r.int(5, 13), r.range(-3.5, 3.5), k % 4 === 3 ? T : G, r));
  return img;
}
function fern(img, seed) {
  const r = makeRng(seed);
  const G = pal(0x2c3a1a, 0x364820, 0x425827, 0x4f672e, 0x5d7535, 0x6b823e);
  const B = pal(0x5a3418, 0x6e421e, 0x845226, 0x96622e, 0xa47238, 0xb2823e);
  const fronds = [[-2.05, 12], [-1.1, 12], [-1.82, 14], [-1.32, 14], [-1.57, 15]];
  fronds.forEach(([a0, len], k) => {
    const P = k === 0 ? B : G;
    const bend = (Math.cos(a0) < -0.05 ? -1 : Math.cos(a0) > 0.05 ? 1 : 0) * 0.06;
    let x = 7.5 + (k - 2) * 0.4, y = 15.5, ang = a0;
    for (let s = 0; s < len; s++) {
      const ix = Math.floor(x), iy = Math.floor(y);
      const t = s / len;
      img.set(ix, iy, pick(P, clamp01(0.25 + t * 0.4), ix, iy, 0));
      if (s >= 2) {
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        const L = Math.max(1, Math.round((1 - t) * 3.2));
        for (let q = 1; q <= L; q++) {
          const fx = Math.cos(ang) * q * 0.45;
          const fy = Math.sin(ang) * q * 0.45;
          img.set(Math.floor(x + nx * q + fx), Math.floor(y + ny * q + fy), pick(P, clamp01(0.45 + t * 0.45 - q * 0.05), ix, iy, 0));
          img.set(Math.floor(x - nx * q + fx), Math.floor(y - ny * q + fy), pick(P, clamp01(0.6 + t * 0.4 - q * 0.05), ix, iy, 0));
        }
      }
      ang += bend * (1 + t);
      x += Math.cos(ang) * 0.9; y += Math.sin(ang) * 0.9;
    }
  });
  return img;
}
function stem(img, x0, top, curve, r, c = hex(0x48582a), c2 = hex(0x3a4722)) {
  for (let y = 15; y >= top; y--) {
    const t = (15 - y) / (15 - top);
    img.set(Math.round(x0 + curve * t * t), y, y > 11 ? c2 : c);
  }
}
function leafPair(img, x, y, dir, c) {
  img.set(x + dir, y, c); img.set(x + 2 * dir, y - 1, shade(c, 0.05)); img.set(x + dir, y - 1, shade(c, -0.04));
}
function flowerRed(img, seed) {
  const r = makeRng(seed);
  stem(img, 7, 5, 0.6, r);
  stem(img, 11, 9, 1, r);
  const G = hex(0x4f622d);
  leafPair(img, 7, 12, -1, G); leafPair(img, 7, 10, 1, G); leafPair(img, 11, 13, 1, G);
  const P = pal(0x5e1410, 0x7e1c16, 0x9e261c, 0xb83224, 0xcc4430);
  const bloom = (cx, cy, s) => {
    const shape = s ? ['.##.', '####', '#@##', '.##.'] : ['.#.', '#@#', '.#.'];
    shape.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.') return;
      const x = cx + i, y = cy + j;
      if (ch === '@') { img.set(x, y, hex(0x1e1410)); return; }
      const v = clamp01(0.85 - (i + j) * 0.14 + (r.next() - 0.5) * 0.2);
      img.set(x, y, pick(P, v, x, y, 0.3));
    }));
  };
  bloom(6, 2, 1);
  bloom(11, 6, 0);
  return img;
}
function flowerYellow(img, seed) {
  // goldenrod: stems topped with fluffy conical yellow plumes
  const r = makeRng(seed);
  const Y = pal(0x7a5c10, 0x9a7616, 0xb88e1e, 0xd0a62a, 0xe2bc40, 0xeed060);
  const stems = [[4, 2, 0.5], [9, 1, -0.5], [12, 6, 0.6]];
  for (const [x0, top, lean] of stems) {
    stem(img, x0, top + 4, lean, r, hex(0x55602e), hex(0x434d25));
    leafPair(img, x0, 12, lean > 0 ? -1 : 1, hex(0x56632f));
    leafPair(img, x0, 9, lean > 0 ? 1 : -1, hex(0x4f5c2b));
    const cx = x0 + Math.round(lean);
    for (let j = 0; j < 6; j++) {
      const half = j < 1 ? 0 : j < 3 ? 1 : 2;
      for (let dx = -half; dx <= half; dx++) {
        if (Math.abs(dx) === half && half > 0 && r.chance(0.35)) continue;
        const v = clamp01(0.95 - j * 0.1 - Math.abs(dx) * 0.12 + (r.next() - 0.5) * 0.35);
        img.set(cx + dx, top + j, pick(Y, v, cx + dx, top + j, 0.5));
      }
    }
  }
  return img;
}
function flowerWhite(img, seed) {
  // asters / daisies
  const r = makeRng(seed);
  const W = pal(0xa8a69a, 0xc4c2b6, 0xdcdacd, 0xece9dc);
  stem(img, 6, 5, -0.8, r);
  stem(img, 10, 8, 0.8, r);
  leafPair(img, 6, 12, 1, hex(0x4f622d)); leafPair(img, 10, 13, -1, hex(0x4f622d)); leafPair(img, 6, 9, -1, hex(0x4a5c2a));
  const daisy = (cx, cy) => {
    const pts = [[0, -1], [1, -1], [-1, 0], [2, 0], [-1, 1], [2, 1], [0, 2], [1, 2], [-1, -1], [2, 2]];
    pts.forEach(([dx, dy], k) => img.set(cx + dx, cy + dy, W[k < 8 ? 3 - ((dx + dy) > 1 ? 1 : 0) : 1]));
    img.set(cx, cy, hex(0xd0a030)); img.set(cx + 1, cy, hex(0xc08c24)); img.set(cx, cy + 1, hex(0xb07a1e)); img.set(cx + 1, cy + 1, hex(0x9a6a1a));
  };
  daisy(4, 3);
  daisy(10, 6);
  img.set(13, 10, W[2]); img.set(14, 10, W[1]); img.set(13, 9, W[3]);
  return img;
}
function deadBush(img, seed) {
  const r = makeRng(seed);
  const C = pal(0x4a3524, 0x5a4129, 0x6e5233, 0x7d6040, 0x8c6e4a);
  const branch = (x, y, ang, len, depth) => {
    let fx = x, fy = y;
    for (let s = 0; s < len; s++) {
      const ix = Math.round(fx), iy = Math.round(fy);
      img.set(ix, iy, C[Math.min(4, depth + (s > len / 2 ? 1 : 0))]);
      if (depth < 3 && s > 1 && r.chance(0.22)) branch(fx, fy, ang + r.pick([-0.7, 0.7]), Math.max(2, len - s - 1), depth + 1);
      ang += (r.next() - 0.5) * 0.4;
      fx += Math.cos(ang); fy += Math.sin(ang);
    }
  };
  branch(7.5, 15, -Math.PI / 2 - 0.6, 10, 0);
  branch(8, 15, -Math.PI / 2 + 0.55, 10, 0);
  branch(7.5, 15, -Math.PI / 2, 8, 1);
  return img;
}
function reeds(img, seed) {
  const r = makeRng(seed);
  const L = pal(0x4a5228, 0x5a6230, 0x6c7238, 0x7e8242, 0x8e8c4a);
  // leaves
  for (let k = 0; k < 6; k++) blade(img, r.int(1, 14), r.int(7, 12), r.range(-4, 4), L, r);
  // cattail stalks with heads
  const stalks = [3, 7, 10, 13];
  stalks.forEach((x0) => {
    const top = r.int(1, 4);
    for (let y = 15; y >= top; y--) img.set(x0, y, hex(y > 10 ? 0x55602f : 0x6e7038));
    const hy = top + 2, hl = r.int(3, 4);
    for (let j = 0; j < hl; j++) {
      img.set(x0, hy + j, hex(j === 0 ? 0x6e4a2a : 0x5a3a20));
      img.set(x0 + 1, hy + j, hex(j === hl - 1 ? 0x3a2414 : 0x4a2e1a));
    }
    img.set(x0, top, hex(0x8a8450));
  });
  return img;
}
function wheat(img, seed) {
  const r = makeRng(seed);
  const St = pal(0x6e6230, 0x847436, 0x9a863e, 0xae9848);
  const E = pal(0x8e7230, 0xa8883a, 0xc0a048, 0xd2b45a);
  const xs = [1, 3, 5, 7, 9, 11, 13, 14];
  xs.forEach((x0) => {
    const top = r.int(2, 5);
    const lean = r.pick([-1, 0, 0, 1]);
    for (let y = 15; y >= top + 4; y--) img.set(x0 + (y < top + 7 ? lean : 0), y, pick(St, (15 - y) / 12, x0, y, 0.5));
    // ear: 2px wide with alternating grains
    for (let j = 0; j < 5; j++) {
      const y = top + j;
      img.set(x0 + lean, y, E[(j & 1) ? 1 : 3]);
      if (j < 4) img.set(x0 + lean + 1, y, E[(j & 1) ? 2 : 0]);
    }
    img.set(x0 + lean, top - 1, E[2]);
    if (r.chance(0.6)) img.set(x0 + lean - 1, top - 2, E[1]);
  });
  // a couple of drooping leaves
  for (let k = 0; k < 4; k++) blade(img, r.int(1, 14), r.int(4, 7), r.range(-3, 3), St, r);
  return img;
}
const CORN_STALK = pal(0x5e5e30, 0x6e6e38, 0x807e40, 0x908c48);
const CORN_LEAF = pal(0x6a6436, 0x7f7a42, 0x948e4e, 0xa6a05a, 0x8a7444, 0x9c8450);
function cornLeaf(img, x, y, dir, len, r, droop = 0.32) {
  // broad strap leaf: rises from the stalk node, arches over and droops; 2px wide for most of its length
  let fx = x + 0.5, fy = y + 0.5, ang = -Math.PI / 2 + dir * 0.45;
  for (let s = 0; s < len; s++) {
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const t = s / len;
    const c = pick(CORN_LEAF, clamp01(0.35 + t * 0.5 + (r.next() - 0.5) * 0.15), ix, iy, 0.3);
    img.set(ix, iy, c);
    if (t < 0.7) img.set(ix, iy + 1, shade(c, -0.08));
    if (t > 0.2 && t < 0.55) img.set(ix + dir, iy + 1, shade(c, -0.12));
    ang += dir * droop;
    fx += Math.cos(ang); fy += Math.sin(ang);
  }
}
function cornStalks(img, r, top, leafRows) {
  // two main stalks + a thinner one behind; leaves alternate sides at the nodes and arch over
  const stalks = [[4, 2], [11, 2], [8, 1]];
  stalks.forEach(([x0, w], si) => {
    for (let y = top + si; y < 16; y++) for (let s = 0; s < w; s++) img.set(x0 + s, y, CORN_STALK[s ? 0 : si === 2 ? 1 : 2]);
    leafRows.forEach((ly, k) => {
      if (si === 2 && k % 2) return;
      const dir = (k + si) & 1 ? 1 : -1;
      cornLeaf(img, x0 + (dir > 0 ? w - 1 : 0), ly + si, dir, r.int(6, 8), r);
    });
  });
}
function cornBottom(img, seed) {
  const r = makeRng(seed);
  cornStalks(img, r, 0, [2, 7, 12]);
  for (let j = 0; j < 4; j++) { img.set(6, 6 + j, hex(j === 0 ? 0xb4a466 : 0xa09252)); img.set(7, 7 + j, hex(0x8c7e44)); }
  img.set(6, 5, hex(0x7a4a2a)); img.set(7, 6, hex(0x6a3e22));
  return img;
}
function cornTop(img, seed) {
  const r = makeRng(seed);
  cornStalks(img, r, 4, [7, 12]);
  const T = pal(0x9a8448, 0xb09a5a, 0xc4ae6a);
  for (const x0 of [4, 11]) {
    for (let y = 0; y < 4; y++) img.set(x0, y, T[1]);
    img.set(x0 - 1, 2, T[2]); img.set(x0 - 2, 3, T[0]); img.set(x0 + 1, 1, T[2]); img.set(x0 + 2, 2, T[0]); img.set(x0 + 2, 3, T[0]);
  }
  for (let j = 0; j < 4; j++) { img.set(6, 9 + j, hex(j === 0 ? 0xb4a466 : 0xa09252)); img.set(7, 10 + j, hex(0x8c7e44)); }
  img.set(6, 8, hex(0x7a4a2a));
  return img;
}
function bushTex(img, seed, berries) {
  leaves(img, seed, [[L_GREEN, 0.55], [L_YGREEN, 0.2], [L_CRIMSON, 0.12], [L_BROWN, 0.13]], { holes: 0.1, clump: 4, edge: 0.38 });
  const r = makeRng(seed + 5);
  // woody twigs visible inside
  for (let k = 0; k < 3; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    for (let s = 0; s < 3; s++) if (img.alpha(x + s, y + s) > 0) img.set(x + s, y + s, hex(0x3a2a1c));
  }
  if (berries) {
    const spots = [];
    for (let k = 0; k < 40 && spots.length < 7; k++) {
      const x = r.int(1, 14), y = r.int(1, 14);
      if (spots.some(([a, b]) => Math.abs(a - x) < 3 && Math.abs(b - y) < 3)) continue;
      spots.push([x, y]);
      img.set(x, y, hex(0xd0545a)); img.set(x + 1, y, hex(0x9a2028)); img.set(x, y + 1, hex(0x861a22)); img.set(x + 1, y + 1, hex(0x5e1218));
    }
  }
  return img;
}

// ---------------------------------------------------------------------------
// crops / bales
function pumpkinSide(img, seed) {
  const P = pal(0x6a2e0e, 0x833a10, 0x9c4814, 0xb25718, 0xc4661e, 0xd27826, 0xdc8a32);
  const f = fbm(seed, 2, 4, 2), wn = white(seed + 1);
  const rib = [0.05, 0.5, 0.85, 0.62];
  img.each((x, y) => {
    const i = y * 16 + x;
    const edge = y < 1 || y > 14 ? -0.2 : y < 2 || y > 13 ? -0.08 : 0;
    const v = rib[(x + 1) & 3] + (f[i] - 0.5) * 0.3 + (wn[i] - 0.5) * 0.2 + edge;
    img.set(x, y, pick(P, clamp01(v), x, y, 0.5));
  });
  const r = makeRng(seed + 2);
  for (let k = 0; k < 2; k++) {
    const x = r.int(1, 14), y = r.int(4, 12);
    img.set(x, y, hex(0x4a2a12)); img.mix(x + 1, y, hex(0x5a3416), 0.7); img.mix(x, y + 1, hex(0x5a3416), 0.5);
  }
  speckle(img, seed + 3, 0.03, pal(0x8a7a3a));
  return img;
}
function pumpkinTop(img, seed) {
  const P = pal(0x6a2e0e, 0x833a10, 0x9c4814, 0xb25718, 0xc4661e, 0xd27826);
  const wn = white(seed + 1);
  img.each((x, y) => {
    const dx = x - 7.5, dy = y - 7.5;
    const th = Math.atan2(dy, dx), rr = Math.hypot(dx, dy);
    const rib = Math.cos(th * 8);
    const v = 0.5 + rib * 0.3 * Math.min(1, rr / 3) - (rr < 3 ? 0.25 : 0) - (rr > 9 ? 0.15 : 0) + (wn[y * 16 + x] - 0.5) * 0.2;
    img.set(x, y, pick(P, clamp01(v), x, y, 0.5));
  });
  const S = pal(0x3a3a1c, 0x4a4a22, 0x5c5a2c, 0x6e6a36);
  img.set(7, 7, S[2]); img.set(8, 7, S[1]); img.set(7, 8, S[1]); img.set(8, 8, S[0]);
  img.set(8, 6, S[3]); img.set(9, 6, S[2]); img.set(9, 5, S[1]);
  return img;
}
const HAY = pal(0x7a6530, 0x8b7536, 0x9d863e, 0xae9748, 0xbea754, 0xccb662);
function hayBands(img, seed, vertical) {
  const T = pal(0x5a2e1c, 0x6e3a24, 0x84482c);
  for (const bx of [2, 12]) for (let y = 0; y < 16; y++) {
    img.set(bx, y, T[1 + ((y + bx) & 1)]);
    img.set(bx + 1, y, T[0]);
    if (vertical) img.mul(bx + 2, y, 0.85);
  }
}
function haySide(img, seed) {
  const r = makeRng(seed);
  for (let y = 0; y < 16; y++) {
    let x = r.int(0, 3) - 3;
    while (x < 16) {
      const len = r.int(2, 6), v = r.range(0.15, 1);
      for (let s = 0; s < len; s++) img.set(x + s, y, pick(HAY, clamp01(v - s * 0.05), x + s, y, 0.4));
      x += len;
      if (r.chance(0.35)) { img.set(x, y, hex(0x5e4c24)); x++; }
    }
  }
  speckle(img, seed + 1, 0.05, pal(0x8a8466, 0x7d7658));
  hayBands(img, seed, true);
  return img;
}
function hayTop(img, seed) {
  const r = makeRng(seed);
  img.fill(hex(0x6e5a2a));
  for (let k = 0; k < 120; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    const d = r.pick([[1, 0], [0, 1], [1, 1], [1, -1]]);
    const v = r.range(0.1, 1);
    const len = r.int(1, 3);
    for (let s = 0; s < len; s++) img.set(x + d[0] * s, y + d[1] * s, pick(HAY, clamp01(v - s * 0.1), x, y, 0.4));
  }
  speckle(img, seed + 1, 0.06, pal(0x4e3e1c));
  hayBands(img, seed, false);
  return img;
}

// ---------------------------------------------------------------------------
function water(img, seed) {
  const P = pal(0x1c3a39, 0x214140, 0x264847, 0x2c4f4d, 0x325654, 0x3a5f5c);
  const f = fbm(seed, 2, 2, 3);
  const wn = white(seed + 1);
  img.each((x, y) => {
    const i = y * 16 + x;
    const w1 = Math.sin(((x * 1 + y * 2) / 16) * Math.PI * 2 + f[i] * 4);
    const w2 = Math.sin(((x * 3 - y * 1) / 16) * Math.PI * 2 + f[i] * 3);
    const v = 0.5 + w1 * 0.22 + w2 * 0.14 + (f[i] - 0.5) * 0.4 + (wn[i] - 0.5) * 0.12;
    if (v > 0.86) img.set(x, y, hex(0x55797a), 200);
    else img.set(x, y, pick(P, clamp01(v), x, y, 0.4), 182 + Math.round((wn[i] - 0.5) * 8));
  });
  return img;
}

function mud(img, seed) {
  const P = pal(0x2b2018, 0x33261b, 0x3b2c1f, 0x443323, 0x4d3a28, 0x56422e);
  paint(img, P, eq(combine(fbm(seed, 3, 3, 3), 0.7, white(seed + 1), 0.3)), 0.7);
  const f = fbm(seed + 2, 2, 2, 2);
  img.each((x, y) => {
    const v = f[y * 16 + x];
    if (v > 0.84) {
      img.set(x, y, mix(hex(0x2e2620), hex(0x3a322a), rnd(seed, x, y, 4)));
      if (f[((y - 1) & 15) * 16 + x] <= 0.84) img.set(x, y, hex(0x6a6052));
    }
  });
  speckle(img, seed + 3, 0.035, pal(0x6e5c48, 0x625040));
  // boot print
  const r = makeRng(seed + 4);
  const bx = r.int(2, 11), by = r.int(2, 9);
  for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2], [1, 3], [0, 5], [1, 5], [2, 5], [1, 6]]) img.mul(bx + dx, by + dy, 0.7);
  return img;
}

// ---------------------------------------------------------------------------
export const NATURE = {
  bedrock(img, { seed }) {
    const w = worley(seed, 4, 4, 1);
    const P = pal(0x151515, 0x222222, 0x303030, 0x3e3e3e, 0x4e4e4e, 0x606060);
    const wn = white(seed + 1);
    img.each((x, y) => {
      const i = y * 16 + x;
      const v = rnd(seed, w.id[i], 0, 2) * 0.7 + (wn[i] - 0.5) * 0.5 + (w.d2[i] - w.d1[i] < 1 ? -0.4 : 0);
      img.set(x, y, pick(P, clamp01(v), x, y, 0.8));
    });
  },
  stone(img, { seed }) {
    const P = pal(0x55575a, 0x5f6164, 0x696b6e, 0x737578, 0x7d7f82, 0x88898b);
    paint(img, P, eq(combine(fbm(seed, 4, 3, 3, 0.6), 0.6, white(seed + 1), 0.4)), 0.8);
    const r = makeRng(seed + 2);
    for (let k = 0; k < 3; k++) crack(img, r, r.int(0, 15), r.int(0, 15), r.int(3, 6), r.range(-1, 1), r.range(-0.5, 0.5), { dark: 0.78, lip: 1.06, branch: 0.1 });
    speckle(img, seed + 3, 0.02, pal(0x9a9b9b));
  },
  cobblestone(img, { seed }) {
    const w = worley(seed, 4, 4, 0.9);
    const wn = white(seed + 1);
    const P = pal(0x55565a, 0x606165, 0x6b6c6f, 0x77787a, 0x828385, 0x8e8f90, 0x9a9b9b);
    img.each((x, y) => {
      const i = y * 16 + x;
      const e = w.d2[i] - w.d1[i];
      if (e < 0.95) {
        const moss = rnd(seed, x, y, 5) < 0.28;
        img.set(x, y, moss ? hex(rnd(seed, x, y, 6) < 0.5 ? 0x3f4a2a : 0x4a5530) : hex(rnd(seed, x, y, 2) < 0.5 ? 0x2e2e30 : 0x38383a));
        return;
      }
      const base = rnd(seed, w.id[i], 0, 3);
      const v = 0.2 + base * 0.5 + (-w.ox[i] - w.oy[i]) * 0.06 + (wn[i] - 0.5) * 0.3 - (e < 1.6 ? 0.12 : 0);
      img.set(x, y, pick(P, clamp01(v), x, y, 0.6));
    });
  },
  dirt(img, { seed }) { dirtBase(img, seed); },
  grass_top(img, { seed }) {
    grassTop(img, seed);
    const r = makeRng(seed + 9);
    for (let k = 0; k < 2; k++) img.set(r.int(0, 15), r.int(0, 15), hex(r.pick([0x8c5a2e, 0x7d5530])));
  },
  grass_side(img, { seed }) { grassSide(img, seedFromString('grass_top'), GRASS, GRASS_STRAW, 0x2f381b); },
  dry_grass_top(img, { seed }) {
    grassTop(img, seed, DRY, pal(0xb8a468, 0x6f6a3a), 0x5a4a28);
    speckle(img, seed + 7, 0.03, pal(0x5e6232, 0x67693a));
  },
  dry_grass_side(img) { grassSide(img, seedFromString('dry_grass_top'), DRY, pal(0xb8a468, 0x6f6a3a), 0x5a4a28); },
  forest_floor_top(img, { seed }) { forestTop(img, seed); },
  forest_floor_side(img, { seed }) {
    img.copy(memoImg('dirt_base', () => dirtBase(new Img(), DIRT_SEED)));
    const top = memoImg('forest_top', () => forestTop(new Img(), seedFromString('forest_floor_top')));
    for (let x = 0; x < 16; x++) {
      const depth = 3 + (rnd(seed, x, 0, 1) < 0.5 ? 1 : 0) + (rnd(seed, x, 0, 2) < 0.2 ? 1 : 0);
      for (let y = 0; y < depth; y++) img.set(x, y, top.rgb(x, y + 5));
      img.mul(x, depth, 0.7);
      for (let y = depth; y < depth + 3; y++) img.mul(x, y, 0.88); // humus darkens the upper soil
    }
    speckle(img, seed + 3, 0.02, LEAF_LITTER.slice(0, 4).map(hex));
  },
  sand(img, { seed }) {
    const P = pal(0x9a8c68, 0xa49672, 0xad9f7b, 0xb6a884, 0xbeb18d, 0xc7ba97);
    paint(img, P, eq(combine(fbm(seed, 4, 4, 2), 0.3, white(seed + 1), 0.7)), 0.5);
    speckle(img, seed + 2, 0.05, pal(0x847654, 0x7a6e50));
    speckle(img, seed + 3, 0.03, pal(0xd4c8a6));
    grime(img, seed + 4, 0.15, [110, 100, 80], 2, 0.6);
  },
  gravel(img, { seed }) {
    const w = worley(seed, 5, 5, 0.95);
    const wn = white(seed + 1);
    const G = pal(0x55514c, 0x625e57, 0x6f6a62, 0x7c766d, 0x898379, 0x979086);
    const Bn = pal(0x5a4e42, 0x67594b, 0x756555, 0x83715f, 0x907e6a);
    img.each((x, y) => {
      const i = y * 16 + x;
      const e = w.d2[i] - w.d1[i];
      if (e < 0.85) { img.set(x, y, hex(rnd(seed, x, y, 2) < 0.5 ? 0x3a3632 : 0x45413c)); return; }
      const P = rnd(seed, w.id[i], 0, 4) < 0.3 ? Bn : G;
      const v = 0.15 + rnd(seed, w.id[i], 0, 3) * 0.6 + (-w.ox[i] - w.oy[i]) * 0.08 + (wn[i] - 0.5) * 0.25;
      img.set(x, y, pick(P, clamp01(v), x, y, 0.5));
    });
  },
  mud(img, { seed }) { mud(img, seed); },
  water(img, { seed }) { water(img, seed); },
  log_oak(img, { seed }) { oakBark(img, seed); },
  log_oak_top(img, { seed }) {
    ringsTop(img, seed, pal(0x7e5e38, 0x8a6840, 0x987449, 0xa58153, 0xb08c5c), pal(0x2a1f15, 0x3d2e1f, 0x4f3c28, 0x5d4830));
  },
  log_birch(img, { seed }) { birchBark(img, seed); },
  log_birch_top(img, { seed }) {
    ringsTop(img, seed, pal(0xb09a72, 0xbca67d, 0xc8b38a, 0xd2be96, 0xdac8a2), pal(0x2a2622, 0xb8b2a3, 0xd0cbbd, 0xdad5c8, 0xc6c0b2, 0xd6d1c4, 0x5a554c, 0xdad5c8));
  },
  log_pine(img, { seed }) { pineBark(img, seed); },
  log_pine_top(img, { seed }) {
    ringsTop(img, seed, pal(0x96703e, 0xa47c48, 0xb28a54, 0xbe9660, 0xc8a26c), pal(0x2c1c14, 0x45291b, 0x5d3824, 0x744a30), {
      after(im, r) { for (let k = 0; k < 2; k++) im.set(r.int(4, 11), r.int(4, 11), hex(0xd8b868)); },
    });
  },
  leaves_oak(img, { seed }) { leaves(img, seed, [[L_GREEN, 0.6], [L_YGREEN, 0.25], [L_BROWN, 0.15]]); },
  leaves_birch(img, { seed }) { leaves(img, seed, [[L_BIRCH, 0.6], [L_YELLOW, 0.3], [L_YGREEN, 0.1]], { holes: 0.26 }); },
  leaves_pine(img, { seed }) { pineNeedles(img, seed); },
  leaves_autumn(img, { seed }) { leaves(img, seed, [[L_ORANGE, 0.55], [L_YELLOW, 0.3], [L_BROWN, 0.08], [L_YGREEN, 0.07]]); },
  leaves_autumn_red(img, { seed }) { leaves(img, seed, [[L_RED, 0.62], [L_CRIMSON, 0.25], [L_ORANGE, 0.08], [L_BROWN, 0.05]]); },
  tall_grass(img, { seed }) { tallGrass(img, seed); },
  fern(img, { seed }) { fern(img, seed); },
  flower_red(img, { seed }) { flowerRed(img, seed); },
  flower_yellow(img, { seed }) { flowerYellow(img, seed); },
  flower_white(img, { seed }) { flowerWhite(img, seed); },
  dead_bush(img, { seed }) { deadBush(img, seed); },
  reeds(img, { seed }) { reeds(img, seed); },
  wheat(img, { seed }) { wheat(img, seed); },
  corn_bottom(img, { seed }) { cornBottom(img, seed); },
  corn_top(img, { seed }) { cornTop(img, seed); },
  bush(img, { seed }) { bushTex(img, seed, false); },
  berry_bush(img, { seed }) { bushTex(img, seedFromString('bush'), true); },
  pumpkin_side(img, { seed }) { pumpkinSide(img, seed); },
  pumpkin_top(img, { seed }) { pumpkinTop(img, seed); },
  hay_side(img, { seed }) { haySide(img, seed); },
  hay_top(img, { seed }) { hayTop(img, seed); },
};

export { dirtBase, grassTop, leaves, vnoise };
