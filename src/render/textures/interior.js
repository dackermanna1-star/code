// Interior surfaces (drywall, wallpaper, tiles, floors, carpet) and doors / bars / barricades / ladders.
import {
  Img, pal, hex, mix, shade, ramp, desat, fbm, white, vnoise, worley, eq, combine, pick, paint, grain, grime, streaks,
  speckle, crack, rnd, makeRng, smooth, clamp01, seedFromString,
} from './core.js';
import { planks, PLANKS_OAK } from './building.js';

// ---------------------------------------------------------------------------
// walls
function drywall(img, seed, base, opts = {}) {
  const R = ramp(base, 5, 0.035, 0.2);
  paint(img, R, eq(combine(fbm(seed, 2, 2, 3), 0.6, white(seed + 1), 0.4)), 0.7);
  const r = makeRng(seed + 2);
  // scuffs
  for (let k = 0; k < 2; k++) {
    const x = r.int(0, 13), y = r.int(4, 14), l = r.int(2, 3);
    for (let s = 0; s < l; s++) img.mix(x + s, y + (s === l - 1 && r.chance(0.5) ? 1 : 0), shade(base, -0.25), 0.35);
  }
  // nail pop
  const nx = r.int(1, 14), ny = r.int(1, 14);
  img.mul(nx, ny, 0.9); img.mul(nx, ny + 1, 1.03);
  // hairline crack
  if (opts.crack !== false) crack(img, r, r.int(0, 15), r.int(0, 6), 4, r.range(-0.5, 0.5), 1, { dark: 0.9, lip: 0, branch: 0 });
  grime(img, seed + 3, opts.grime ?? 0.08, shade(base, -0.35), 2, 0.6);
  return img;
}

function wallpaperFloral(img, seed) {
  const bg = pal(0xb5a682, 0xbcad89, 0xc2b38f, 0xc8ba96);
  paint(img, bg, eq(combine(fbm(seed, 2, 2, 2), 0.5, white(seed + 1), 0.5)), 0.6);
  for (let y = 0; y < 16; y++) for (const x of [0, 4, 8, 12]) img.mul(x, y, 0.975);
  const rose = (cx, cy) => {
    const P = pal(0x6e3434, 0x864242, 0x9c5450, 0xb06a60);
    img.set(cx, cy, P[0]);
    img.set(cx - 1, cy, P[2]); img.set(cx + 1, cy, P[1]); img.set(cx, cy - 1, P[3]); img.set(cx, cy + 1, P[1]);
    img.set(cx - 1, cy - 1, P[2]); img.set(cx + 1, cy + 1, P[0]);
    const G = pal(0x56633e, 0x6a774c);
    img.set(cx - 2, cy + 2, G[1]); img.set(cx - 1, cy + 2, G[0]); img.set(cx + 2, cy + 1, G[1]); img.set(cx + 2, cy + 2, G[0]);
  };
  rose(2, 2); rose(2, 10); rose(10, 6); rose(10, 14);
  const gold = hex(0x9a8656);
  for (const [x, y] of [[6, 1], [6, 9], [14, 5], [14, 13], [6, 5], [14, 9]]) { img.set(x, y, gold); img.mix(x, y + 1, gold, 0.4); }
  grime(img, seed + 2, 0.22, [140, 110, 60], 2, 0.55);
  streaks(img, seed + 3, 2, [110, 86, 50], 9, 0.25);
  // seam with a slightly lifted edge
  for (let y = 0; y < 16; y++) { img.mul(15, y, 0.92); img.mul(0, y, 1.04); }
  return img;
}
function wallpaperStripe(img, seed) {
  const G = hex(0x6a7a62), C = hex(0xbfb493), Pin = hex(0x9a8452);
  const wn = white(seed + 1);
  img.each((x, y) => {
    const k = x & 7;
    const c = k < 3 ? G : k === 5 ? Pin : C;
    img.set(x, y, shade(c, (wn[y * 16 + x] - 0.5) * 0.04 + (k === 0 ? 0.02 : k === 2 ? -0.02 : 0)));
  });
  grime(img, seed + 2, 0.22, [130, 104, 60], 2, 0.55);
  streaks(img, seed + 3, 2, [100, 80, 50], 10, 0.22);
  const r = makeRng(seed + 4);
  for (let k = 0; k < 2; k++) { const x = r.int(0, 15), y = r.int(2, 13); img.mix(x, y, [60, 56, 50], 0.3); img.mix(x + 1, y, [60, 56, 50], 0.2); }
  return img;
}
function wallTile(img, seed) {
  const T = pal(0xb4b7b2, 0xbec1bc, 0xc8cbc6, 0xd1d4cf, 0xdadcd7);
  const grout = pal(0x8a877e, 0x938f86, 0x7e7b72);
  const wn = white(seed + 1);
  const r = makeRng(seed + 2);
  const crackedTile = r.int(0, 15);
  img.each((x, y) => {
    const tx = x & 3, ty = y & 3, id = (y >> 2) * 4 + (x >> 2);
    if (tx === 3 || ty === 3) { img.set(x, y, grout[rnd(seed, x, y, 3) < 0.2 ? 2 : (x + y) & 1]); return; }
    let v = 0.45 + (rnd(seed, id, 0, 4) - 0.5) * 0.35 + (wn[y * 16 + x] - 0.5) * 0.2;
    if (tx === 0 && ty === 0) v = 1;
    else if (tx === 2 && ty === 2) v -= 0.25;
    img.set(x, y, pick(T, clamp01(v), x, y, 0.3));
  });
  // crack across one tile
  const cx = (crackedTile & 3) * 4, cy = (crackedTile >> 2) * 4;
  img.set(cx, cy + 2, hex(0x6e6c66)); img.set(cx + 1, cy + 1, hex(0x6e6c66)); img.set(cx + 2, cy + 1, hex(0x7e7c76));
  grime(img, seed + 3, 0.2, [110, 104, 80], 2, 0.6);
  return img;
}

// ---------------------------------------------------------------------------
// floors
function hardwood(img, seed) {
  const P = pal(0x5e3a20, 0x6c4426, 0x7a4e2c, 0x875833, 0x94633a, 0xa06e42);
  const grainF = vnoise(seed, 2, 16);
  const wn = white(seed + 1);
  const r = makeRng(seed + 2);
  const joints = [0, 1, 2, 3].map((b) => (r.int(0, 5) + b * 7) & 15);
  img.each((x, y) => {
    const b = y >> 2, ry = y & 3, i = y * 16 + x;
    const j = joints[b];
    const seg = x >= j ? 1 : 0;
    let v = 0.25 + rnd(seed, b, seg, 5) * 0.5 + (grainF[i] - 0.5) * 0.45 + (wn[i] - 0.5) * 0.16;
    if (ry === 0) v += 0.05;
    let c = pick(P, clamp01(v), x, y, 0.4);
    if (ry === 3) c = shade(c, -0.1);
    if (x === j) c = shade(c, -0.16);
    img.set(x, y, c);
  });
  // varnish glints and a scratch
  speckle(img, seed + 3, 0.02, pal(0xb48458));
  for (let s = 0; s < 4; s++) img.mul(r.int(0, 15), r.int(0, 15), 1.08);
  const sx = r.int(0, 10), sy = r.int(0, 14);
  for (let s = 0; s < 4; s++) img.mul(sx + s, sy + (s >> 1), 1.15);
  grime(img, seed + 4, 0.16, [50, 38, 28], 2, 0.6);
  return img;
}
function floorTile(img, seed) {
  const T = pal(0x9c927e, 0xa59b87, 0xaea490, 0xb7ad99, 0xc0b6a2);
  const g = pal(0x6e665a, 0x787064);
  const wn = white(seed + 1);
  img.each((x, y) => {
    const tx = x & 7, ty = y & 7, id = (y >> 3) * 2 + (x >> 3);
    if (tx === 7 || ty === 7) { img.set(x, y, g[(x + y) & 1]); return; }
    let v = 0.4 + (rnd(seed, id, 0, 2) - 0.5) * 0.4 + (wn[y * 16 + x] - 0.5) * 0.35;
    if (tx === 0 || ty === 0) v += 0.15;
    if (tx === 6 || ty === 6) v -= 0.12;
    img.set(x, y, pick(T, clamp01(v), x, y, 0.4));
  });
  const r = makeRng(seed + 2);
  crack(img, r, 9, 1, 6, 0.4, 1, { dark: 0.7, lip: 1.05, branch: 0.15 });
  grime(img, seed + 3, 0.25, [70, 60, 46], 2, 0.55);
  return img;
}
function checker(img, seed) {
  const B = pal(0x262628, 0x2c2c2e, 0x323234), W = pal(0xb4b0a5, 0xbdb9ae, 0xc6c2b7, 0xcecabf);
  const wn = white(seed + 1);
  img.each((x, y) => {
    const dark = ((x >> 2) + (y >> 2)) & 1;
    const P = dark ? B : W;
    let v = 0.5 + (wn[y * 16 + x] - 0.5) * 0.6 + (rnd(seed, x >> 2, y >> 2, 3) - 0.5) * 0.3;
    img.set(x, y, pick(P, clamp01(v), x, y, 0.4));
  });
  grime(img, seed + 2, 0.3, [64, 54, 42], 2, 0.5);
  const r = makeRng(seed + 3);
  // chipped tile corner, heel scuffs
  img.set(r.int(0, 3) * 4, r.int(0, 3) * 4 + 3, hex(0x55524c));
  for (let k = 0; k < 2; k++) { const x = r.int(0, 14), y = r.int(0, 15); img.mix(x, y, [20, 20, 20], 0.4); img.mix(x + 1, y, [20, 20, 20], 0.3); }
  return img;
}
function linoleum(img, seed, base, flecks, tile = 8) {
  const R = ramp(base, 4, 0.03, 0.2);
  const wn = white(seed + 1);
  img.each((x, y) => {
    const id = Math.floor(y / tile) * 4 + Math.floor(x / tile);
    const v = 0.5 + (wn[y * 16 + x] - 0.5) * 0.5 + (rnd(seed, id, 0, 2) - 0.5) * 0.5;
    img.set(x, y, pick(R, clamp01(v), x, y, 0.4));
    if (x % tile === 0 || y % tile === 0) img.mul(x, y, 0.95);
  });
  speckle(img, seed + 2, 0.08, flecks);
  grime(img, seed + 3, 0.18, [96, 86, 66], 2, 0.55);
  return img;
}
function carpet(img, seed, base, opts = {}) {
  const R = ramp(base, 6, 0.06, 0.25);
  paint(img, R, eq(combine(white(seed), 0.7, fbm(seed + 1, 4, 4, 2), 0.3)), 0.9);
  speckle(img, seed + 2, 0.06, [shade(base, 0.1), shade(base, -0.12)]);
  // worn traffic patch + a stain
  grime(img, seed + 3, 0.18, desat(shade(base, 0.08), 0.5), 2, 0.6);
  const r = makeRng(seed + 4);
  const sx = r.int(2, 13), sy = r.int(2, 13);
  img.disc(sx + 0.5, sy + 0.5, 2.3, (x, y, d) => img.mix(x, y, shade(base, -0.18), 0.35 * (1 - d / 2.6)));
  if (opts.pattern) opts.pattern(img, r);
  return img;
}

// ---------------------------------------------------------------------------
// doors: drawn on a 16x32 canvas (top half = rows 0-15, bottom half = rows 16-31) and split
function panelDoor(seed, P, opts = {}) {
  const img = new Img(16, 32);
  const grainV = vnoise(seed, 16, 2, 16, 32);
  const wn = white(seed + 1, 16, 32);
  const tone = (x, y, k = 0) => pick(P, clamp01(0.5 + (grainV[y * 16 + x] - 0.5) * 0.45 + (wn[y * 16 + x] - 0.5) * 0.2 + k), x, y, 0.4);
  img.each((x, y) => img.set(x, y, tone(x, y)));
  // rails (horizontal grain look: slightly lighter)
  const rails = [[0, 2], [8, 2], [16, 4], [29, 3]];
  for (const [y0, h] of rails) for (let y = y0; y < y0 + h; y++) for (let x = 3; x < 13; x++) img.set(x, y, tone(x, y, 0.06));
  // recessed panels with a raised field
  const panel = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const e = x === x0 || y === y0, f = x === x0 + w - 1 || y === y0 + h - 1;
      let k = 0.04;
      if (e) k = -0.4; else if (f) k = 0.28;
      else if (x === x0 + 1 || y === y0 + 1) k = 0.18;
      else if (x === x0 + w - 2 || y === y0 + h - 2) k = -0.12;
      img.set(x, y, tone(x, y, k));
    }
  };
  for (const px of [3, 9]) {
    panel(px, 2, 4, 6);
    panel(px, 10, 4, 6);
    panel(px, 20, 4, 9);
  }
  // door edge shadow
  for (let y = 0; y < 32; y++) { img.mul(0, y, 0.85); img.mul(15, y, 0.8); }
  if (opts.paint) opts.paint(img);
  // knob on the right stile (bottom half rows 1-3) + key escutcheon
  const K = opts.knob || pal(0x5e4a1c, 0x8a6e2c, 0xb0903e, 0xd8bc68);
  img.set(13, 17, K[2]); img.set(14, 17, K[1]); img.set(12, 17, K[1]);
  img.set(13, 18, K[3]); img.set(14, 18, K[1]); img.set(12, 18, K[2]);
  img.set(13, 19, K[1]); img.set(14, 19, K[0]); img.set(12, 19, K[0]);
  img.set(13, 21, K[1]); img.set(13, 22, hex(0x1a1612));
  return img;
}
const DOOR_WOOD = pal(0x4a3020, 0x553824, 0x60402a, 0x6b4830, 0x765136, 0x815a3d);
const DOOR_WHITE = pal(0xa7a398, 0xb2aea3, 0xbdb9ae, 0xc7c3b8, 0xd0ccc1, 0xd8d4c9);
function whiteDoorPaint(seed) {
  return (img) => {
    const chips = fbm(seed + 5, 3, 6, 3, 0.5, 16, 32);
    img.each((x, y) => {
      const v = chips[y * 16 + x];
      if (v > 0.86) img.set(x, y, mix(hex(0x6e5a44), img.rgb(x, y), 0.25));
    });
    // grubby hand marks around the knob, scuffs at the bottom
    for (let y = 14; y < 22; y++) for (let x = 10; x < 16; x++) img.mix(x, y, [110, 100, 84], 0.18 * (1 - Math.abs(y - 18) / 5));
    for (let y = 26; y < 32; y++) for (let x = 0; x < 16; x++) img.mix(x, y, [96, 88, 76], (y - 25) * 0.04 * rnd(seed, x, y, 4));
    // faint smeared bloody handprint
    for (const [x, y, t] of [[10, 13, 0.45], [11, 13, 0.5], [10, 14, 0.5], [11, 14, 0.55], [12, 14, 0.35], [9, 12, 0.3], [10, 12, 0.35], [11, 12, 0.3], [11, 15, 0.3], [11, 16, 0.25], [12, 17, 0.15]]) img.mix(x, y, [96, 22, 18], t);
  };
}

function metalDoor(seed) {
  const img = new Img(16, 32);
  const P = pal(0x46504a, 0x4e5852, 0x56605a, 0x5e6862, 0x66706a, 0x6e7872);
  const wn = white(seed + 1, 16, 32), f = fbm(seed + 2, 2, 4, 3, 0.5, 16, 32);
  img.each((x, y) => img.set(x, y, pick(P, clamp01(0.55 + (wn[y * 16 + x] - 0.5) * 0.25 + (f[y * 16 + x] - 0.5) * 0.3), x, y, 0.4)));
  // frame bevel
  for (let y = 0; y < 32; y++) { img.tone(0, y, 0.08); img.tone(1, y, 0.03); img.tone(15, y, -0.12); img.tone(14, y, -0.04); }
  for (let x = 0; x < 16; x++) { img.tone(x, 0, 0.08); img.tone(x, 31, -0.1); }
  // wired glass vision panel
  for (let y = 3; y < 12; y++) for (let x = 4; x < 12; x++) {
    const edge = x === 4 || y === 3 || x === 11 || y === 11;
    if (edge) { img.set(x, y, x === 11 || y === 11 ? hex(0x7e8882) : hex(0x2a302c)); continue; }
    let c = mix(hex(0x26323a), hex(0x4a5a62), (12 - y) / 10 * 0.5);
    if ((x + y) % 3 === 0 || (x - y + 30) % 3 === 0) c = mix(c, hex(0x808a8a), 0.45);
    if (x + y === 12 || x + y === 13) c = mix(c, hex(0x9aa8ac), 0.35);
    img.set(x, y, c);
  }
  // deadbolt + lever handle
  const C = pal(0x5a5e60, 0x8a8e90, 0xb4b8ba, 0xd4d8da);
  img.set(12, 13, C[2]); img.set(13, 13, C[1]); img.set(12, 14, C[1]); img.set(13, 14, C[0]);
  img.set(13, 17, C[1]); img.set(13, 18, C[2]); img.set(13, 19, C[0]);
  for (let x = 9; x <= 13; x++) { img.set(x, 18, x === 13 ? C[3] : C[2]); img.set(x, 19, C[0]); }
  img.set(9, 17, C[1]);
  // kick plate
  for (let y = 27; y < 31; y++) for (let x = 1; x < 15; x++) img.set(x, y, shade(mix(hex(0x8c9090), hex(0x7a7e7e), rnd(seed, x, y, 7)), y === 27 ? 0.06 : 0));
  // rivets, claw scratches, rust
  for (const [x, y] of [[2, 2], [13, 2], [2, 29], [13, 29], [2, 15], [13, 15]]) { img.set(x, y, hex(0x7a847e)); img.set(x + 1, y + 1, hex(0x323a36)); }
  for (const [x0, y0] of [[5, 20], [6, 20], [7, 21]]) for (let s = 0; s < 4; s++) img.set(x0 + (s >> 1), y0 + s, hex(0x9aa29c));
  streaks(img, seed + 3, 5, [112, 62, 32], 10, 0.4);
  grime(img, seed + 4, 0.2, [50, 40, 30], 2, 0.6);
  return img;
}
function glassDoor(seed) {
  const img = new Img(16, 32);
  const A = pal(0x6e7276, 0x7e8286, 0x8e9296, 0x9ea2a6, 0xb0b4b8);
  const wn = white(seed + 1, 16, 32);
  img.each((x, y) => {
    const frame = x < 3 || x > 12 || y < 3 || y > 25;
    if (frame) {
      let v = 0.5 + (wn[y * 16 + x] - 0.5) * 0.2;
      if (x === 0 || y === 0) v += 0.3; if (x === 15 || y === 31) v -= 0.3;
      if (x === 2 || y === 2) v -= 0.25; if ((x === 13 && y > 2 && y < 26) || y === 26) v += 0.25;
      img.set(x, y, pick(A, clamp01(v), x, y, 0.3));
      return;
    }
    // glass: dark interior with sky reflections (opaque)
    let c = mix(hex(0x3a4a50), hex(0x24302f), (y - 3) / 23);
    const d = (x + y) % 14;
    if (d === 3 || d === 4) c = mix(c, hex(0x8ea2a8), 0.55);
    if (d === 9) c = mix(c, hex(0x7a8e94), 0.35);
    c = shade(c, (wn[y * 16 + x] - 0.5) * 0.04);
    img.set(x, y, c);
  });
  // push bar
  for (let x = 2; x <= 13; x++) { img.set(x, 17, hex(0xc4c8cc)); img.set(x, 18, hex(0x8e9296)); img.set(x, 19, hex(0x1e2426)); }
  // store hours sticker, crack in the glass
  for (let y = 7; y < 11; y++) for (let x = 5; x < 10; x++) img.set(x, y, hex(y === 7 ? 0xb03228 : 0xd6d2c6));
  img.set(6, 9, hex(0x6a6660)); img.set(7, 9, hex(0x6a6660)); img.set(8, 9, hex(0x6a6660)); img.set(6, 8, hex(0x8a8680));
  for (const [x, y] of [[12, 11], [11, 12], [11, 13], [10, 14], [12, 14], [9, 15]]) img.mix(x, y, hex(0xc8d4d6), 0.7);
  grime(img, seed + 2, 0.2, [70, 64, 56], 2, 0.6);
  return img;
}

// ---------------------------------------------------------------------------
function ironBars(img, seed) {
  img.fill([0, 0, 0], 0);
  const P = pal(0x2a2a2c, 0x38383a, 0x48484a, 0x5a5a5c, 0x6c6c6e);
  const R = pal(0x5a301a, 0x744022, 0x8a502c);
  const bar = (x, y) => {
    const k = x & 3;
    const v = k === 1 ? 0.8 : 0.35;
    let c = pick(P, clamp01(v + (rnd(seed, x, y, 1) - 0.5) * 0.3), x, y, 0.4);
    if (rnd(seed, x, y, 2) < 0.14) c = R[Math.floor(rnd(seed, x, y, 3) * 3)];
    img.set(x, y, c, 255);
  };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x & 3) === 1 || (x & 3) === 2) bar(x, y);
  for (let x = 0; x < 16; x++) {
    img.set(x, 7, pick(P, 0.85, x, 7), 255);
    img.set(x, 8, pick(P, 0.25, x, 8), 255);
  }
  streaks(img, seed + 4, 4, [112, 62, 32], 5, 0.4);
  return img;
}
function barricade(img, seed) {
  img.fill([0, 0, 0], 0);
  const P = pal(0x5e4a32, 0x6a543a, 0x765e42, 0x82684a, 0x8d7252, 0x987c5a);
  const g = vnoise(seed, 3, 16), wn = white(seed + 1);
  const boards = [[1, 0, 0.1], [6, 2, -0.08], [11, -1, 0.0]];
  boards.forEach(([y0, tilt, tone], b) => {
    for (let x = 0; x < 16; x++) {
      const dy = Math.round((x / 15 - 0.5) * tilt);
      for (let j = 0; j < 4; j++) {
        const yy = y0 + dy + j, i = (yy & 15) * 16 + x;
        let v = 0.45 + tone + (g[i] - 0.5) * 0.55 + (wn[i] - 0.5) * 0.2 + (rnd(seed, b, 0, 4) - 0.5) * 0.3;
        if (j === 0) v += 0.2;
        if (j === 3) v -= 0.3;
        img.set(x, yy, pick(P, clamp01(v), x, yy, 0.4), 255);
      }
    }
    // nails + split end
    for (const nx of [1, 14]) {
      const dy = Math.round((nx / 15 - 0.5) * tilt);
      img.set(nx, y0 + dy + 1, hex(0xa09e98), 255); img.set(nx, y0 + dy + 2, hex(0x34322e), 255);
    }
    const sx = 4 + b * 3;
    img.set(sx, y0 + Math.round((sx / 15 - 0.5) * tilt) + 2, hex(0x3a2c1e), 255);
    img.set(sx + 1, y0 + Math.round(((sx + 1) / 15 - 0.5) * tilt) + 2, hex(0x3a2c1e), 255);
  });
  grime(img, seed + 3, 0.2, [60, 56, 50], 2, 0.6);
  return img;
}
function ladder(img, seed) {
  img.fill([0, 0, 0], 0);
  const P = pal(0x4e3a26, 0x5c452d, 0x6a5034, 0x785b3c, 0x846645);
  const g = vnoise(seed, 2, 16);
  for (let y = 0; y < 16; y++) {
    for (const [x, k] of [[1, 0.75], [2, 0.3], [13, 0.75], [14, 0.3]]) img.set(x, y, pick(P, clamp01(k + (g[y * 16 + x] - 0.5) * 0.4), x, y, 0.4), 255);
  }
  for (const ry of [2, 6, 10, 14]) for (let x = 3; x <= 12; x++) {
    img.set(x, ry, pick(P, clamp01(0.85 + (rnd(seed, x, ry, 2) - 0.5) * 0.3), x, ry, 0.4), 255);
    img.set(x, ry + 1, pick(P, clamp01(0.2 + (rnd(seed, x, ry, 3) - 0.5) * 0.3), x, ry, 0.4), 255);
  }
  for (const ry of [2, 6, 10, 14]) { img.set(2, ry, hex(0x2a2622), 255); img.set(13, ry, hex(0x2a2622), 255); }
  return img;
}

// ---------------------------------------------------------------------------
const cache = new Map();
function half(key, make, top) {
  let full = cache.get(key);
  if (!full) { full = make(); cache.set(key, full); }
  return full.sub(0, top ? 0 : 16);
}
// cache is per call of generateTextures; small and deterministic, so keeping it is harmless
export const INTERIOR = {
  wall_white(img, { seed }) { drywall(img, seed, hex(0xc9c6bd)); },
  wall_beige(img, { seed }) { drywall(img, seed, hex(0xbcae90)); },
  wall_green(img, { seed }) { drywall(img, seed, hex(0x98ad98), { grime: 0.12 }); },
  wall_blue(img, { seed }) { drywall(img, seed, hex(0x8a9daf)); },
  wallpaper_floral(img, { seed }) { wallpaperFloral(img, seed); },
  wallpaper_stripe(img, { seed }) { wallpaperStripe(img, seed); },
  wall_tile(img, { seed }) { wallTile(img, seed); },
  wall_wood_panel(img, { seed }) {
    const P = pal(0x45301f, 0x4f3723, 0x5a3f28, 0x65472e, 0x704f34, 0x7a573a);
    const g = vnoise(seed, 16, 2), wn = white(seed + 1);
    img.each((x, y) => {
      const i = y * 16 + x;
      let c = pick(P, clamp01(0.4 + (g[i] - 0.5) * 0.7 + (wn[i] - 0.5) * 0.2 + (rnd(seed, x < 5 ? 0 : x < 10 ? 1 : 2, 0, 3) - 0.5) * 0.3), x, y, 0.4);
      if (x === 0 || x === 5 || x === 10) c = hex(0x24170e);
      if (x === 1 || x === 6 || x === 11) c = shade(c, 0.08);
      img.set(x, y, c);
    });
    grime(img, seed + 2, 0.12, [30, 22, 16], 2, 0.6);
  },
  floor_wood(img, { seed }) { hardwood(img, seed); },
  floor_tile(img, { seed }) { floorTile(img, seed); },
  floor_checker(img, { seed }) { checker(img, seed); },
  floor_linoleum(img, { seed }) { linoleum(img, seed, hex(0xb8b09a), pal(0x7a7468, 0x8e7e62, 0x6a6a66, 0xd0c8b2)); },
  floor_hospital(img, { seed }) {
    linoleum(img, seed, hex(0xa6b0a8), pal(0x7e8a82, 0x8c968e, 0xc0c8c0), 16);
    const r = makeRng(seed + 7);
    for (let k = 0; k < 2; k++) { const x = r.int(1, 12), y = r.int(1, 14); for (let s = 0; s < 3; s++) img.mix(x + s, y, [30, 30, 30], 0.45 - s * 0.1); }
    img.disc(r.int(4, 11) + 0.5, r.int(4, 11) + 0.5, 1.6, (x, y, d) => img.mix(x, y, [92, 50, 36], 0.3 * (1 - d / 1.8)));
  },
  carpet_red(img, { seed }) { carpet(img, seed, hex(0x74302b)); },
  carpet_blue(img, { seed }) { carpet(img, seed, hex(0x3d4c68)); },
  carpet_beige(img, { seed }) { carpet(img, seed, hex(0xa29276)); },
  carpet_grey(img, { seed }) { carpet(img, seed, hex(0x6a6a68)); },
  door_wood(img) { return half('door_wood', () => panelDoor(seedFromString('door_wood'), DOOR_WOOD), false); },
  door_wood_top(img) { return half('door_wood', () => panelDoor(seedFromString('door_wood'), DOOR_WOOD), true); },
  door_white(img) {
    const s = seedFromString('door_white');
    return half('door_white', () => panelDoor(s, DOOR_WHITE, { paint: whiteDoorPaint(s), knob: pal(0x5a5c5e, 0x8a8c8e, 0xb0b2b4, 0xd8dadc) }), false);
  },
  door_white_top(img) {
    const s = seedFromString('door_white');
    return half('door_white', () => panelDoor(s, DOOR_WHITE, { paint: whiteDoorPaint(s), knob: pal(0x5a5c5e, 0x8a8c8e, 0xb0b2b4, 0xd8dadc) }), true);
  },
  door_metal(img) { return half('door_metal', () => metalDoor(seedFromString('door_metal')), false); },
  door_metal_top(img) { return half('door_metal', () => metalDoor(seedFromString('door_metal')), true); },
  door_glass(img) { return half('door_glass', () => glassDoor(seedFromString('door_glass')), false); },
  door_glass_top(img) { return half('door_glass', () => glassDoor(seedFromString('door_glass')), true); },
  iron_bars(img, { seed }) { ironBars(img, seed); },
  barricade(img, { seed }) { barricade(img, seed); },
  ladder(img, { seed }) { ladder(img, seed); },
};
export { drywall, carpet };
