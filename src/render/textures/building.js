// Roads, ground surfaces, exterior building materials, roofs, metal, glass, awnings.
import {
  Img, memoImg, pal, hex, mix, shade, desat, fbm, white, vnoise, eq, combine, pick, paint, grain, grime,
  streaks, speckle, crack, walk, leafBit, rnd, makeRng, smooth, clamp01, seedFromString,
} from './core.js';
import { LEAF_LITTER } from './nature.js';

// ---------------------------------------------------------------------------
// asphalt & road markings
const ASPHALT = pal(0x2a2b2d, 0x303133, 0x363739, 0x3c3d3f, 0x434446, 0x4a4b4d);
const ASPHALT_OLD = pal(0x323335, 0x38393b, 0x3f4042, 0x464749, 0x4d4e50, 0x555658);
function asphalt(img, seed, P = ASPHALT) {
  paint(img, P, eq(combine(fbm(seed, 4, 4, 2), 0.35, white(seed + 1), 0.65)), 0.6);
  speckle(img, seed + 2, 0.09, pal(0x58585a, 0x5e5c58, 0x535250));
  speckle(img, seed + 3, 0.025, pal(0x74726e, 0x6a6864));
  speckle(img, seed + 4, 0.05, pal(0x222224, 0x262628));
  grime(img, seed + 5, 0.3, [26, 26, 28], 2, 0.62);
  return img;
}
const ROAD_SEED = seedFromString('asphalt');
const YELLOW = hex(0xb89a30), WHITE_PAINT = hex(0xcac7bb);
/** paint a road marking where mask(x, y) is true; worn paint lets the asphalt grain through */
function marking(img, seed, mask, col, wear = 0.14) {
  const f = fbm(seed + 77, 4, 4, 2);
  img.each((x, y) => {
    if (!mask(x, y)) return;
    const base = img.rgb(x, y);
    const w = rnd(seed, x, y, 31);
    const patch = f[y * 16 + x] > 0.78;
    if (w < wear || (patch && w < 0.6)) { img.set(x, y, mix(base, col, 0.28)); return; }
    const dark = (base[0] + base[1] + base[2]) / 3 < 46;
    img.set(x, y, shade(mix(col, base, dark ? 0.3 : 0.1), (rnd(seed, x, y, 32) - 0.5) * 0.07));
  });
  return img;
}
function roadBase(img) { return img.copy(memoImg('road_base', () => asphalt(new Img(), ROAD_SEED))); }
function tireMarks(img, seed, horizontal) {
  const r = makeRng(seed + 9);
  const k = r.int(2, 13);
  for (let t = 0; t < 16; t++) if (rnd(seed, t, k, 3) < 0.7) {
    if (horizontal) img.mix(t, k, [20, 20, 22], 0.35); else img.mix(k, t, [20, 20, 22], 0.35);
  }
}

function crackedAsphalt(img, seed) {
  asphalt(img, seed, ASPHALT_OLD);
  const r = makeRng(seed + 10);
  const cracks = [];
  for (let k = 0; k < 2; k++) {
    const a = r.range(0, Math.PI * 2);
    walk(r, r.int(0, 15), r.int(0, 15), r.int(12, 18), Math.cos(a), Math.sin(a), 0.8, (x, y) => cracks.push([x, y]));
  }
  // branches
  for (let k = 0; k < 3; k++) {
    const [x, y] = cracks[r.int(0, cracks.length - 1)];
    const a = r.range(0, Math.PI * 2);
    walk(r, x, y, r.int(3, 6), Math.cos(a), Math.sin(a), 1.2, (bx, by) => cracks.push([bx, by]));
  }
  for (const [x, y] of cracks) {
    img.set(x, y, hex(0x1c1d1e));
    img.mul(x, y + 1, 1.1);
  }
  // weeds growing in the cracks
  const W = pal(0x4a5628, 0x56622e, 0x6a6a34, 0x7a6a3a, 0x3e4a22);
  for (const [x, y] of cracks) if (r.chance(0.11)) {
    img.set(x, y, r.pick(W));
    if (r.chance(0.6)) img.set(x + r.pick([-1, 1]), y - 1, r.pick(W));
  }
  // pothole patch with loose gravel
  const px = r.int(2, 12), py = r.int(2, 12);
  img.disc(px + 0.5, py + 0.5, 2.1, (x, y, d) => {
    img.set(x, y, mix(hex(0x1e1f20), hex(0x5a5650), rnd(seed, x, y, 12) < 0.3 ? 0.6 : 0.1));
    if (d > 1.4) img.mul(x, y, 1.25);
  });
  return img;
}

// ---------------------------------------------------------------------------
// concrete family
function concreteBase(img, seed, P) {
  paint(img, P, eq(combine(fbm(seed, 3, 3, 3), 0.5, white(seed + 1), 0.5)), 0.6);
  speckle(img, seed + 2, 0.045, [shade(P[0], -0.06)]);
  speckle(img, seed + 3, 0.02, [shade(P[P.length - 1], 0.06)]);
  return img;
}
const CONCRETE = pal(0x777672, 0x7f7e7a, 0x878682, 0x8f8e8a, 0x979692, 0x9f9e9a);
function sidewalk(img, seed) {
  const C = pal(0x82807a, 0x8a8882, 0x92908a, 0x9a9892, 0xa29f99);
  concreteBase(img, seed, C);
  // broom finish
  for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x++) img.mul(x, y, 0.975);
  const r = makeRng(seed + 4);
  // crack from a joint
  crack(img, r, r.int(3, 12), 1, r.int(4, 6), r.range(-0.4, 0.4), 1, { dark: 0.78, lip: 1.04, branch: 0.1 });
  // gum / stains
  for (let k = 0; k < 3; k++) {
    const x = r.int(2, 14), y = r.int(2, 14);
    img.set(x, y, hex(0x5e5c58)); img.mul(x + 1, y, 0.9); img.mul(x, y + 1, 0.92);
  }
  grime(img, seed + 5, 0.22, [70, 62, 50], 2, 0.6);
  // rust stain
  const sx = r.int(2, 12), sy = r.int(3, 12);
  img.disc(sx + 0.5, sy + 0.5, 1.8, (x, y, d) => img.mix(x, y, [104, 90, 74], 0.15 * (1 - d / 1.8)));
  // expansion joints along the north and west edges
  for (let t = 0; t < 16; t++) {
    img.set(t, 0, hex(rnd(seed, t, 0, 7) < 0.5 ? 0x55534e : 0x5e5c57));
    img.set(0, t, hex(rnd(seed, 0, t, 8) < 0.5 ? 0x55534e : 0x5e5c57));
    img.mul(t, 1, 1.05); img.mul(1, t, 1.05);
    img.mul(t, 15, 0.95); img.mul(15, t, 0.95);
  }
  // weeds in the joints, a fallen leaf
  const W = pal(0x4a5628, 0x5a662e, 0x6e6e36);
  for (let t = 0; t < 16; t++) {
    if (rnd(seed, t, 1, 9) < 0.14) { img.set(t, 0, r.pick(W)); if (r.chance(0.5)) img.set(t, 1, r.pick(W)); }
    if (rnd(seed, 1, t, 10) < 0.1) img.set(0, t, r.pick(W));
  }
  leafBit(img, r.int(3, 13), r.int(3, 13), hex(r.pick(LEAF_LITTER)), r);
  return img;
}

// ---------------------------------------------------------------------------
// masonry
function bricks(img, seed, B, M, opts = {}) {
  const wn = white(seed + 1);
  const r = makeRng(seed + 2);
  const chipped = new Set();
  for (let k = 0; k < 3; k++) chipped.add(r.int(0, 7));
  img.each((x, y) => {
    const course = y >> 2, ry = y & 3;
    const bx = (x + (course & 1) * 4) & 15;
    const col = bx & 7, id = course * 2 + (bx >> 3);
    if (ry === 3 || col === 7) {
      const shadow = ry === 3 && col !== 7 ? 0.0 : 0.25;
      img.set(x, y, pick(M, clamp01(0.3 + shadow + (wn[y * 16 + x] - 0.5) * 0.6), x, y, 0.8));
      return;
    }
    const base = rnd(seed, id, 0, 5);
    let v = 0.2 + base * 0.55 + (wn[y * 16 + x] - 0.5) * 0.35 + (ry === 0 ? 0.12 : ry === 2 ? -0.1 : 0) + (col === 0 ? 0.05 : col === 6 ? -0.05 : 0);
    img.set(x, y, pick(B, clamp01(v), x, y, 0.6));
    // chipped corners
    if (chipped.has(id) && ((col === 0 && ry === 0) || (col === 6 && ry === 2))) img.set(x, y, shade(M[1], -0.05));
  });
  if (opts.after) opts.after(img, r);
  return img;
}
const BRICK_RED = pal(0x632b22, 0x703126, 0x7d382b, 0x8a4031, 0x954a38, 0x9f5440);
const BRICK_BROWN = pal(0x4a3125, 0x563a2b, 0x624331, 0x6e4c37, 0x7a563f, 0x856047);
const MORTAR = pal(0x6e6960, 0x7a756b, 0x858077, 0x908b81);

function stoneBrick(img, seed) {
  const P = pal(0x5a5b5a, 0x646564, 0x6e6f6e, 0x797a78, 0x838482, 0x8d8e8b);
  const wn = white(seed + 1), f = fbm(seed + 2, 4, 4, 2);
  img.each((x, y) => {
    const course = y >> 3, ry = y & 7;
    const jx = course ? 7 : 15;
    const bx = ((x - jx - 1) % 16 + 16) % 16; // 0..15 within the block, joint at 15
    if (ry === 7 || bx === 15) { img.set(x, y, hex(rnd(seed, x, y, 4) < 0.5 ? 0x3c3c3c : 0x464645)); return; }
    let v = 0.25 + rnd(seed, course, 0, 6) * 0.25 + (f[y * 16 + x] - 0.5) * 0.5 + (wn[y * 16 + x] - 0.5) * 0.3;
    if (ry === 0 || bx === 0) v += 0.22;
    if (ry === 6 || bx === 14) v -= 0.22;
    img.set(x, y, pick(P, clamp01(v), x, y, 0.6));
  });
  const r = makeRng(seed + 3);
  crack(img, r, r.int(2, 12), r.int(1, 5), 5, 0.6, 0.8, { dark: 0.65 });
  for (let t = 0; t < 16; t++) {
    if (rnd(seed, t, 7, 8) < 0.2) img.set(t, 7, hex(0x46522e));
    if (rnd(seed, t, 15, 8) < 0.2) img.set(t, 15, hex(0x4e5a32));
  }
  return img;
}

// ---------------------------------------------------------------------------
// wood cladding
function siding(img, seed, base, opts = {}) {
  const grainF = vnoise(seed, 3, 16);
  const wn = white(seed + 1);
  const peel = fbm(seed + 2, 3, 3, 3);
  const r = makeRng(seed + 3);
  const joints = [0, 1, 2, 3].map(() => r.int(0, 15));
  const WOOD = pal(0x857e72, 0x938c80, 0xa09a8e, 0xaca69a);
  const peelT = opts.peel ?? 0.9;
  img.each((x, y) => {
    const ry = y & 3, board = y >> 2, i = y * 16 + x;
    let c;
    const bare = peel[i] > peelT;
    if (bare) c = mix(pick(WOOD, clamp01(grainF[i] * 0.8 + (wn[i] - 0.5) * 0.4), x, y, 0.5), base, 0.35);
    else c = shade(base, (grainF[i] - 0.5) * 0.06 + (wn[i] - 0.5) * 0.035);
    if (ry === 0) c = shade(c, -0.2);
    else if (ry === 1) c = shade(c, -0.06);
    else if (ry === 3) c = shade(c, 0.035);
    if (!bare && peel[i] > peelT - 0.05) c = shade(c, 0.06); // paint lip
    img.set(x, y, c);
    if (x === joints[board] && ry > 0) { img.set(x, y, shade(c, -0.1)); }
    if (x === ((joints[board] + 1) & 15) && ry > 0) img.mul(x, y, 1.04);
  });
  const lum = (base[0] + base[1] + base[2]) / 765;
  streaks(img, seed + 4, 4, [78, 72, 58], 7, 0.2 * (1.2 - lum));
  grime(img, seed + 5, 0.2, opts.grimeCol || [96, 100, 80], 3, 0.6);
  speckle(img, seed + 6, 0.015, [shade(base, -0.08)]);
  return img;
}

function planks(img, seed, P, gap, opts = {}) {
  const grainF = vnoise(seed, 2, 16);
  const wn = white(seed + 1);
  const r = makeRng(seed + 2);
  const joints = [0, 1, 2, 3].map((b) => (r.int(0, 7) + b * 5) & 15);
  img.each((x, y) => {
    const board = y >> 2, ry = y & 3, i = y * 16 + x;
    if (ry === 3) { img.set(x, y, shade(gap, (wn[i] - 0.5) * 0.06)); return; }
    const seg = x >= joints[board] ? 1 : 0;
    const tone = rnd(seed, board, seg, 3);
    let v = 0.2 + tone * 0.45 + (grainF[i] - 0.5) * 0.55 + (wn[i] - 0.5) * 0.2 + (ry === 0 ? 0.08 : 0);
    img.set(x, y, pick(P, clamp01(v), x, y, 0.4));
    if (x === joints[board]) img.set(x, y, shade(gap, 0.04));
  });
  // nails beside the joints
  for (let b = 0; b < 4; b++) {
    if (rnd(seed, b, 0, 9) < 0.5) continue;
    const jx = joints[b];
    img.set(jx + 2, b * 4 + 1, hex(0x2e2b28)); img.set(jx - 3, b * 4 + 1, hex(0x35312c));
  }
  if (opts.weather) {
    grime(img, seed + 4, opts.weather, [110, 104, 92], 3, 0.55);
  }
  return img;
}
const PLANKS_OAK = pal(0x6a4f32, 0x775a39, 0x846440, 0x906f48, 0x9b7a51, 0xa6855b);

// ---------------------------------------------------------------------------
// roofs
function shingles(img, seed, P, opts = {}) {
  // dimensional asphalt shingles: 4px courses of irregular tabs, granular surface, shadow under each course
  const wn = white(seed + 1);
  const r = makeRng(seed + 2);
  const courses = [];
  for (let c = 0; c < 4; c++) {
    const cuts = [];
    let x = r.int(0, 4);
    while (cuts.length < 4) { cuts.push(x & 15); x += r.int(3, 5); }
    const tone = cuts.map(() => r.range(-0.12, 0.12));
    courses.push({ cuts, tone, shadowTab: r.int(0, 3) });
  }
  const missing = r.chance(0.7) ? [r.int(0, 3), r.int(0, 3)] : null;
  img.each((x, y) => {
    const c = y >> 2, ry = y & 3, i = y * 16 + x;
    const C = courses[c];
    // which tab is x in
    let t = -1;
    for (let k = 0; k < 4; k++) {
      const a = C.cuts[k], b = C.cuts[(k + 1) & 3];
      const inside = a < b ? x >= a && x < b : x >= a || x < b;
      if (inside) { t = k; break; }
    }
    if (t < 0) t = 0;
    if (missing && missing[0] === c && missing[1] === t && ry > 0) {
      img.set(x, y, hex(rnd(seed, x, y, 4) < 0.15 ? 0x3a3530 : 0x1d1c1b)); return;
    }
    let v = 0.58 + C.tone[t] * 1.3 + (wn[i] - 0.5) * 0.5;
    if (ry === 0) v += 0.1;
    if (C.shadowTab === t && ry === 2) v -= 0.2;
    let col = pick(P, clamp01(v), x, y, 0.45);
    if (ry === 3) col = shade(P[0], -0.05 + (wn[i] - 0.5) * 0.04); // shadow line under each course
    else if (x === C.cuts[t] && ry > 0) col = shade(P[0], -0.02); // slot between tabs
    img.set(x, y, col);
  });
  for (let k = 0; k < 3; k++) {
    const x = r.int(0, 15), y = (r.int(0, 3) << 2) + 2;
    img.mix(x, y, hex(0x6e7656), 0.6); img.mix(x + 1, y, hex(0x5e6648), 0.45);
  }
  if (opts.leaves !== false) for (let k = 0; k < 2; k++) img.set(r.int(0, 15), r.int(0, 15), hex(r.pick([0x8a5a2a, 0x7a4b28, 0x9a6a2c])));
  streaks(img, seed + 5, 3, [20, 20, 20], 6, 0.15);
  return img;
}

function corrugated(img, seed) {
  const G = pal(0x5f6365, 0x6c7072, 0x797d7f, 0x868a8c, 0x93979a, 0xa0a4a6);
  const R = pal(0x5a321c, 0x6e3e22, 0x834c2a, 0x965a32, 0xa86a3c);
  const prof = [0.85, 0.55, 0.15, 0.45];
  const rust = fbm(seed, 3, 3, 3);
  const wn = white(seed + 1);
  img.each((x, y) => {
    const i = y * 16 + x;
    const p = prof[x & 3];
    if (rust[i] > 0.74 || (rust[i] > 0.66 && wn[i] < 0.35)) img.set(x, y, pick(R, clamp01(p * 0.8 + (wn[i] - 0.5) * 0.5), x, y, 0.5));
    else img.set(x, y, pick(G, clamp01(p + (wn[i] - 0.5) * 0.3), x, y, 0.4));
  });
  streaks(img, seed + 2, 6, [110, 64, 34], 10, 0.4);
  return img;
}

// ---------------------------------------------------------------------------
// glass
function frameEdges(img, light, dark, mid) {
  for (let t = 0; t < 16; t++) {
    img.set(t, 0, light); img.set(0, t, light);
    img.set(t, 15, dark); img.set(15, t, dark);
  }
  img.set(0, 15, mid); img.set(15, 0, mid);
}
function glass(img, seed) {
  const f = fbm(seed, 3, 3, 2);
  img.each((x, y) => {
    const d = (x + y) % 16;
    let c = hex(0x9db1b8), a = 82;
    if (d === 4 || d === 5 || d === 11) { c = hex(0xd6e2e5); a = 118; }
    if (d === 6 && x > 6) { c = hex(0xc4d2d6); a = 100; }
    // dirt along the bottom of the pane and in the corners
    const dirt = smooth(11, 15, y) * 0.45 + (f[y * 16 + x] > 0.72 ? 0.2 : 0);
    if (dirt > 0.05) { c = mix(c, hex(0x8a8474), dirt); a = Math.min(140, a + dirt * 80); }
    img.set(x, y, c, a);
  });
  // frame (painted wood) with inner shadow
  frameEdges(img, hex(0xcfcbc1), hex(0x8e8a80), hex(0xaaa69c));
  for (let t = 1; t < 15; t++) { img.set(t, 1, hex(0x6e7472), 130); img.set(1, t, hex(0x7a807e), 120); }
  // flaking paint on the frame
  for (let t = 0; t < 16; t++) if (rnd(seed, t, 0, 5) < 0.15) img.set(t, 15, hex(0x7a6a56));
  // small cobweb in a corner
  img.set(14, 1, hex(0xd8d8d0), 150); img.set(13, 1, hex(0xc8c8c0), 110); img.set(14, 2, hex(0xc8c8c0), 110); img.set(12, 2, hex(0xc0c0b8), 80);
  return img;
}
function glassShop(img, seed) {
  const f = fbm(seed, 2, 2, 3);
  img.each((x, y) => {
    const d = (x + 2 * y) % 32;
    let c = hex(0x8aa1a9), a = 76;
    if (d >= 6 && d <= 8) { c = hex(0xc8d6da); a = 104; }
    if (d === 12) { c = hex(0xb4c4c9); a = 92; }
    const sm = f[y * 16 + x];
    if (sm > 0.74) { c = mix(c, hex(0x9a978c), 0.4); a += 18; }
    img.set(x, y, c, a);
  });
  // slim dark-bronze aluminium mullion on the west edge
  for (let t = 0; t < 16; t++) img.set(0, t, hex(0x5a544a));
  return img;
}
function glassBroken(img, seed) {
  img.fill([0, 0, 0], 0);
  const r = makeRng(seed);
  // jagged shards still stuck in the frame: solid triangles with a bright edge
  const shard = (edge, at, wdt, depth, tilt) => {
    const base = hex(r.pick([0x8fa3aa, 0x9cb0b6, 0xa8bbc0]));
    for (let j = 0; j < depth; j++) {
      const t = j / depth;
      const a = Math.round(at + tilt * t * wdt), b = Math.round(at + wdt - (1 - tilt) * t * wdt);
      for (let u = a; u <= b; u++) {
        const v = 1 + j;
        const [x, y] = edge === 0 ? [u, v] : edge === 1 ? [u, 15 - v] : edge === 2 ? [v, u] : [15 - v, u];
        let c = base;
        if (u === a) c = hex(0xdce6e8); else if (u === b) c = shade(base, -0.12);
        else if (j === 0) c = shade(base, -0.06);
        img.set(x, y, c, 255);
      }
    }
  };
  shard(0, 1, 4, 5, 0.8); shard(0, 9, 3, 2, 0.2);
  shard(1, 2, 5, 3, 0.3); shard(1, 10, 3, 5, 0.6);
  shard(2, 5, 3, 3, 0.5); shard(2, 11, 2, 2, 0.5);
  shard(3, 2, 3, 2, 0.4); shard(3, 8, 4, 4, 0.7);
  frameEdges(img, hex(0xcfcbc1), hex(0x8e8a80), hex(0xaaa69c));
  for (let t = 0; t < 16; t++) if (rnd(seed, t, 0, 5) < 0.2) img.set(t, 15, hex(0x7a6a56));
  return img;
}

// ---------------------------------------------------------------------------
function awning(img, seed, col) {
  const cream = hex(0xc4bba2);
  const wn = white(seed + 1);
  const f = fbm(seed + 2, 2, 2, 2);
  img.each((x, y) => {
    const stripe = ((x >> 2) & 1) === 0;
    let c = stripe ? col : cream;
    c = shade(c, (wn[y * 16 + x] - 0.5) * 0.05 + ((x + y) & 1 ? 0.01 : -0.01) - (f[y * 16 + x] - 0.5) * 0.08);
    img.set(x, y, c);
  });
  streaks(img, seed + 3, 5, [70, 64, 52], 8, 0.25);
  grime(img, seed + 4, 0.25, [70, 64, 52], 2, 0.6);
  // tear
  const r = makeRng(seed + 5);
  const tx = r.int(3, 12), ty = r.int(4, 11);
  img.set(tx, ty, hex(0x2a2622)); img.set(tx + 1, ty + 1, hex(0x2a2622)); img.set(tx + 1, ty, hex(0x403a34));
  return img;
}

// ---------------------------------------------------------------------------
export const BUILDING = {
  asphalt(img, { seed }) { asphalt(img, seed); },
  asphalt_cracked(img, { seed }) { crackedAsphalt(img, seed); },
  road_yellow_x(img, { seed }) {
    roadBase(img);
    marking(img, seed, (x, y) => y === 5 || y === 6 || y === 9 || y === 10, YELLOW);
    tireMarks(img, seed, true);
  },
  road_yellow_z(img, { seed }) {
    roadBase(img);
    marking(img, seed, (x) => x === 5 || x === 6 || x === 9 || x === 10, YELLOW);
    tireMarks(img, seed, false);
  },
  road_white_x(img, { seed }) {
    roadBase(img);
    marking(img, seed, (x, y) => (y === 7 || y === 8) && x <= 9, WHITE_PAINT);
  },
  road_white_z(img, { seed }) {
    roadBase(img);
    marking(img, seed, (x, y) => (x === 7 || x === 8) && y <= 9, WHITE_PAINT);
  },
  crosswalk_x(img, { seed }) {
    roadBase(img);
    marking(img, seed, (x, y) => ((y + 7) & 7) < 4, WHITE_PAINT, 0.18);
  },
  crosswalk_z(img, { seed }) {
    roadBase(img);
    marking(img, seed, (x) => ((x + 7) & 7) < 4, WHITE_PAINT, 0.18);
  },
  parking_line_x(img, { seed }) {
    roadBase(img);
    marking(img, seed, (x, y) => y <= 1, WHITE_PAINT, 0.2);
  },
  parking_line_z(img, { seed }) {
    roadBase(img);
    marking(img, seed, (x) => x <= 1, WHITE_PAINT, 0.2);
  },
  manhole(img, { seed }) {
    roadBase(img);
    const I = pal(0x2e2b28, 0x38342f, 0x433e38, 0x4e4841, 0x5a534b);
    img.disc(8, 8, 7.2, (x, y, d) => {
      if (d > 6.3) { img.set(x, y, I[0]); return; }
      if (d > 5.5) { img.set(x, y, (x + y) & 1 ? I[3] : I[2]); return; }
      // raised waffle grid
      const g = ((x & 1) === 0 && (y & 1) === 0) ? 0.85 : ((x + y) & 1 ? 0.45 : 0.3);
      img.set(x, y, pick(I, clamp01(g + (rnd(seed, x, y, 2) - 0.5) * 0.3 - (x + y - 16) * 0.015), x, y, 0.3));
    });
    // pick holes + rust bloom
    img.set(5, 8, hex(0x141210)); img.set(10, 7, hex(0x141210));
    img.disc(10, 10, 2.5, (x, y, d) => img.mix(x, y, [108, 62, 34], 0.45 * (1 - d / 2.5)));
    img.disc(5, 5, 1.8, (x, y, d) => img.mix(x, y, [96, 58, 34], 0.35 * (1 - d / 1.8)));
  },
  sidewalk(img, { seed }) { sidewalk(img, seed); },
  concrete(img, { seed }) {
    concreteBase(img, seed, CONCRETE);
    grime(img, seed + 4, 0.18, [70, 66, 58], 2, 0.6);
    const r = makeRng(seed + 5);
    crack(img, r, r.int(0, 15), r.int(0, 15), 5, r.range(-1, 1), 1, { dark: 0.75, lip: 1.04 });
  },
  concrete_dark(img, { seed }) {
    concreteBase(img, seed, pal(0x4d4d4b, 0x555553, 0x5d5d5a, 0x656562, 0x6d6d69, 0x75756f));
    streaks(img, seed + 4, 8, [34, 34, 32], 11, 0.35);
    grime(img, seed + 5, 0.3, [40, 44, 34], 2, 0.55);
    speckle(img, seed + 6, 0.02, pal(0x4a5530, 0x55603a));
  },
  concrete_white(img, { seed }) {
    concreteBase(img, seed, pal(0xb3b1aa, 0xbbb9b2, 0xc3c1ba, 0xcbc9c2, 0xd2d0c9));
    const r = makeRng(seed + 4);
    for (let k = 0; k < 4; k++) {
      const x = r.int(0, 15), y = r.int(0, 15);
      const cells = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]].slice(0, r.int(2, 5));
      for (const [dx, dy] of cells) img.set(x + dx, y + dy, pick(CONCRETE, rnd(seed, x + dx, y + dy, 1), x, y));
      img.mul(x - 1, y, 0.9);
    }
    streaks(img, seed + 5, 4, [110, 100, 84], 8, 0.2);
    grime(img, seed + 6, 0.18, [96, 90, 78], 2, 0.6);
  },
  dirt_path_top(img, { seed }) {
    const P = pal(0x5c472f, 0x685136, 0x745b3d, 0x806545, 0x8b6f4d, 0x957956);
    paint(img, P, eq(combine(fbm(seed, 4, 2, 3), 0.55, white(seed + 1), 0.45)), 0.7);
    const r = makeRng(seed + 2);
    for (let k = 0; k < 7; k++) {
      const x = r.int(0, 15), y = r.int(0, 15);
      img.set(x, y, hex(r.pick([0x8c8272, 0x7a7062, 0x9a907e]))); img.mul(x, y + 1, 0.8);
    }
    for (let k = 0; k < 2; k++) {
      const x = r.int(0, 15), y = r.int(0, 15);
      img.set(x, y, hex(0x55602e)); img.set(x + 1, y, hex(0x4a5528)); img.set(x, y - 1, hex(0x66703a));
    }
    leafBit(img, r.int(0, 15), r.int(0, 15), hex(r.pick(LEAF_LITTER)), r);
  },
  brick_red(img, { seed }) {
    bricks(img, seed, BRICK_RED, MORTAR);
    grime(img, seed + 7, 0.28, [40, 34, 30], 3, 0.6);
    speckle(img, seed + 8, 0.015, pal(0xb8b0a0));
  },
  brick_brown(img, { seed }) {
    bricks(img, seed, BRICK_BROWN, MORTAR);
    grime(img, seed + 7, 0.25, [34, 28, 24], 3, 0.6);
  },
  brick_white(img, { seed }) {
    const W = pal(0xa9a59b, 0xb4b0a6, 0xbebab0, 0xc8c4ba, 0xd1cdc3, 0xd9d6cc);
    bricks(img, seed, W, pal(0x8a867c, 0x96928a, 0xa29e96, 0xaeaaa2));
    // peeling paint showing red brick beneath
    const peel = fbm(seed + 3, 3, 3, 3);
    const red = bricks(new Img(), seed, BRICK_RED, MORTAR);
    img.each((x, y) => { const v = peel[y * 16 + x]; if (v > 0.9) img.set(x, y, shade(desat(red.rgb(x, y), 0.55), 0.02)); else if (v > 0.85) img.mul(x, y, 1.04); });
    grime(img, seed + 7, 0.22, [80, 74, 64], 3, 0.55);
    streaks(img, seed + 8, 3, [90, 84, 72], 7, 0.2);
  },
  stone_brick(img, { seed }) { stoneBrick(img, seed); },
  siding_white(img, { seed }) { siding(img, seed, hex(0xc8c4b8)); },
  siding_blue(img, { seed }) { siding(img, seed, hex(0x7890a0)); },
  siding_yellow(img, { seed }) { siding(img, seed, hex(0xbaab7c)); },
  siding_grey(img, { seed }) { siding(img, seed, hex(0x8a8c8b)); },
  siding_green(img, { seed }) { siding(img, seed, hex(0x83947a)); },
  siding_red(img, { seed }) { siding(img, seed, hex(0x88402f), { grimeCol: [60, 50, 42] }); },
  planks_oak(img, { seed }) { planks(img, seed, PLANKS_OAK, hex(0x3f2e1e), { weather: 0.12 }); },
  planks_dark(img, { seed }) { planks(img, seed, pal(0x372619, 0x412d1d, 0x4b3422, 0x553c27, 0x5f432c, 0x694b32), hex(0x1f150d)); },
  planks_light(img, { seed }) { planks(img, seed, pal(0x96805d, 0xa28b67, 0xad9671, 0xb8a17c, 0xc2ab86, 0xccb591), hex(0x65553c), { weather: 0.1 }); },
  planks_white(img, { seed }) {
    planks(img, seed, PLANKS_OAK, hex(0x3f2e1e));
    const wood = img.clone();
    planks(img, seed, pal(0xaeaaa0, 0xb8b4aa, 0xc1bdb3, 0xcac6bc, 0xd2cec4, 0xd8d4ca), hex(0x6a665e));
    const peel = fbm(seed + 3, 4, 3, 3);
    img.each((x, y) => {
      const v = peel[y * 16 + x];
      if ((y & 3) === 3) return;
      if (v > 0.74) img.set(x, y, desat(wood.rgb(x, y), 0.35));
      else if (v > 0.7) img.mul(x, y, 0.92);
    });
    grime(img, seed + 5, 0.2, [90, 86, 74], 3, 0.6);
  },
  barn_red(img, { seed }) {
    const grainF = vnoise(seed, 16, 2);
    const wn = white(seed + 1);
    const peel = fbm(seed + 2, 3, 3, 3);
    const R = pal(0x5e2019, 0x6c261e, 0x7a2d23, 0x873428, 0x923c2e, 0x9c4535);
    const WOOD = pal(0x6a645a, 0x787166, 0x857e72);
    img.each((x, y) => {
      const bx = x & 3, i = y * 16 + x;
      let v = 0.3 + (grainF[i] - 0.5) * 0.6 + (wn[i] - 0.5) * 0.25 + rnd(seed, x >> 2, 0, 3) * 0.3;
      let c = peel[i] > 0.78 ? pick(WOOD, clamp01(v), x, y, 0.4) : pick(R, clamp01(v), x, y, 0.4);
      if (bx === 0) c = shade(c, -0.18);
      else if (bx === 1) c = shade(c, 0.04);
      img.set(x, y, c);
    });
    streaks(img, seed + 3, 5, [50, 40, 34], 9, 0.25);
    const r = makeRng(seed + 4);
    for (let k = 0; k < 2; k++) img.set((r.int(0, 3) << 2) + 2, r.int(0, 15), hex(0x2a2420));
  },
  roof_dark(img, { seed }) { shingles(img, seed, pal(0x2c2d31, 0x35363a, 0x3e3f43, 0x47484c, 0x515256, 0x5b5c60)); },
  roof_red(img, { seed }) { shingles(img, seed, pal(0x542822, 0x622f28, 0x70362e, 0x7d3f35, 0x89483d, 0x945246)); },
  roof_brown(img, { seed }) { shingles(img, seed, pal(0x3c2f25, 0x46372b, 0x504031, 0x5b4938, 0x65523f, 0x705c47)); },
  roof_tar(img, { seed }) {
    paint(img, pal(0x262627, 0x2c2c2d, 0x323233, 0x38383a, 0x3f3f41), eq(combine(fbm(seed, 3, 3, 2), 0.4, white(seed + 1), 0.6)), 0.6);
    speckle(img, seed + 2, 0.2, pal(0x5e5a54, 0x6e6860, 0x4e4a44, 0x7c766c));
    grime(img, seed + 3, 0.35, [22, 22, 24], 2, 0.6);
    const r = makeRng(seed + 4);
    const sy = r.int(2, 13);
    for (let x = 0; x < 16; x++) { img.mul(x, sy, 0.7); img.mul(x, sy + 1, 1.1); }
    img.set(r.int(0, 15), r.int(0, 15), hex(0x5a4a34));
  },
  roof_metal(img, { seed }) {
    const G = pal(0x62676a, 0x6d7275, 0x787d80, 0x83888b, 0x8e9396);
    const R = pal(0x5e341e, 0x734026, 0x884e2e, 0x9a5c36);
    const rust = fbm(seed, 3, 3, 3), wn = white(seed + 1), st = vnoise(seed + 2, 16, 2);
    img.each((x, y) => {
      const i = y * 16 + x, cx = x & 7;
      let v = 0.45 + (st[i] - 0.5) * 0.35 + (wn[i] - 0.5) * 0.2;
      let c = rust[i] > 0.84 || (rust[i] > 0.76 && wn[i] < 0.3) ? pick(R, clamp01(v), x, y, 0.5) : pick(G, clamp01(v), x, y, 0.5);
      if (cx === 0) c = shade(c, 0.12);
      else if (cx === 1) c = shade(c, -0.14);
      else if (cx === 7) c = shade(c, -0.04);
      img.set(x, y, c);
    });
    // rust bleeding along the seams instead of big drip streaks
    for (let y = 0; y < 16; y++) for (const sx of [1, 9]) if (rnd(seed, sx, y, 21) < 0.35) img.mix(sx, y, [120, 66, 36], 0.5);
  },
  metal_wall(img, { seed }) {
    const P = pal(0x515b62, 0x5a646b, 0x636d74, 0x6c767d, 0x758086, 0x7e898f);
    const wn = white(seed + 1), f = fbm(seed + 2, 2, 4, 2);
    const prof = [0.95, 0.7, 0.05, 0.42, 0.45, 0.45, 0.42, 0.3];
    img.each((x, y) => {
      const i = y * 16 + x;
      img.set(x, y, pick(P, clamp01(prof[x & 7] + (wn[i] - 0.5) * 0.2 + (f[i] - 0.5) * 0.25), x, y, 0.4));
    });
    for (const sy of [2, 10]) for (const sx of [5, 13]) { img.set(sx, sy, hex(0x3a3e40)); img.set(sx, sy - 1, hex(0x8e989c)); }
    streaks(img, seed + 3, 5, [112, 66, 36], 9, 0.35);
    grime(img, seed + 4, 0.18, [50, 46, 40], 2, 0.6);
  },
  corrugated_metal(img, { seed }) { corrugated(img, seed); },
  garage_door(img, { seed }) {
    const W = pal(0x9e9b93, 0xaaa79f, 0xb5b2aa, 0xbfbcb4, 0xc8c5bd);
    const wn = white(seed + 1);
    img.each((x, y) => {
      const ry = y & 3;
      let v = 0.55 + (wn[y * 16 + x] - 0.5) * 0.25;
      if (ry === 0) v = 0.0; else if (ry === 1) v = 0.85;
      // embossed rectangles
      const px = x & 7;
      if (ry >= 1 && ry <= 3 && (px === 1 || px === 6)) v += px === 1 ? 0.2 : -0.25;
      img.set(x, y, pick(W, clamp01(v), x, y, 0.4));
    });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((y & 3) === 0) img.set(x, y, hex(0x55534e));
    const r = makeRng(seed + 2);
    // dents
    for (let k = 0; k < 2; k++) { const x = r.int(1, 14), y = r.int(1, 14); img.mul(x, y, 0.82); img.mul(x + 1, y, 0.9); img.mul(x, y - 1, 1.06); }
    streaks(img, seed + 3, 4, [110, 70, 40], 6, 0.3);
    grime(img, seed + 4, 0.25, [80, 74, 64], 2, 0.55);
  },
  glass(img, { seed }) { glass(img, seed); },
  glass_shop(img, { seed }) { glassShop(img, seed); },
  glass_broken(img, { seed }) { glassBroken(img, seed); },
  awning_red(img, { seed }) { awning(img, seed, hex(0x8a2b25)); },
  awning_green(img, { seed }) { awning(img, seed, hex(0x2d5638)); },
  awning_blue(img, { seed }) { awning(img, seed, hex(0x2c4868)); },
};

export { asphalt, concreteBase, bricks, siding, planks, shingles, corrugated, CONCRETE, PLANKS_OAK, BRICK_RED, MORTAR };
