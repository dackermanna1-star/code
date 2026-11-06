// Furniture, appliances and containers. Many of these sit on 'boxes' shapes whose faces only show a sub-rectangle
// of the texture (Minecraft-style UVs) — the visible regions are noted next to each generator.
import {
  Img, pal, hex, mix, shade, ramp, desat, fbm, white, vnoise, eq, combine, pick, paint, grain, grime, streaks,
  speckle, crack, rnd, makeRng, clamp01, seedFromString,
} from './core.js';
import { planks, PLANKS_OAK } from './building.js';

// ---------------------------------------------------------------------------
// shared materials & helpers
const APPL = pal(0xb3afa3, 0xbdb9ad, 0xc7c3b7, 0xd0ccc0, 0xd8d4c8);
const CHROME = pal(0x55595b, 0x7e8284, 0xa6aaac, 0xcacecf);
const BRASS = pal(0x5e4a1c, 0x8a6e2c, 0xb0903e, 0xd8bc68);
const OAK = pal(0x6a4a2c, 0x765333, 0x825c3a, 0x8e6642, 0x99704a);
const DARKWOOD = pal(0x3a281a, 0x43301f, 0x4d3724, 0x573f2a, 0x614730);
const MAHOG = pal(0x3e2018, 0x48261c, 0x522c20, 0x5c3325, 0x663a2a);
const STEEL = pal(0x5c6064, 0x666a6e, 0x707478, 0x7a7e82, 0x84888c);

function material(img, seed, P, k = 0.25, kf = 0.3, x0 = 0, y0 = 0, w = 16, h = 16) {
  const wn = white(seed + 101), f = fbm(seed + 102, 3, 3, 2);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y & 15) * 16 + (x & 15);
    img.set(x, y, pick(P, clamp01(0.5 + (wn[i] - 0.5) * k * 2 + (f[i] - 0.5) * kf * 2), x, y, 0.4));
  }
  return img;
}
function woodGrain(img, seed, P, vertical = true, x0 = 0, y0 = 0, w = 16, h = 16, k = 0) {
  const g = vertical ? vnoise(seed + 201, 16, 2) : vnoise(seed + 201, 2, 16);
  const wn = white(seed + 202);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y & 15) * 16 + (x & 15);
    img.set(x, y, pick(P, clamp01(0.5 + k + (g[i] - 0.5) * 0.6 + (wn[i] - 0.5) * 0.2), x, y, 0.4));
  }
  return img;
}
/** relative bevel: lighten top/left edge, darken bottom/right edge */
function bev(img, x0, y0, w, h, hi = 0.08, lo = -0.1) {
  for (let x = x0; x < x0 + w; x++) { img.tone(x, y0, hi); img.tone(x, y0 + h - 1, lo); }
  for (let y = y0 + 1; y < y0 + h - 1; y++) { img.tone(x0, y, hi); img.tone(x0 + w - 1, y, lo); }
}
/** recessed inset (shadow top/left, light bottom/right) */
function inset(img, x0, y0, w, h, d = 0.1) { bev(img, x0, y0, w, h, -d, d * 0.7); }
function hbar(img, x0, x1, y, C = CHROME) { for (let x = x0; x <= x1; x++) { img.set(x, y, C[2]); img.set(x, y + 1, C[0]); } img.set(x0, y, C[3]); }
function vbar(img, x, y0, y1, C = CHROME) { for (let y = y0; y <= y1; y++) { img.set(x, y, C[2]); img.set(x + 1, y, C[0]); } img.set(x, y0, C[3]); }
function knob(img, x, y, C = BRASS) { img.set(x, y, C[3]); img.set(x + 1, y, C[1]); img.set(x, y + 1, C[1]); img.set(x + 1, y + 1, C[0]); }
const dot = (img, x, y, c) => img.set(x, y, hex(c));

// ---------------------------------------------------------------------------
// appliances
function fridgeFront(img, seed) {
  material(img, seed, APPL, 0.12, 0.15);
  for (let x = 0; x < 16; x++) img.set(x, 5, hex(0x3a3a36));
  bev(img, 0, 0, 16, 5, 0.06, -0.12);
  bev(img, 0, 6, 16, 10, 0.06, -0.12);
  vbar(img, 2, 1, 3); vbar(img, 2, 7, 12);
  // magnets + note
  for (let y = 8; y < 13; y++) for (let x = 8; x < 12; x++) img.set(x, y, hex(y === 8 ? 0xdcd6c0 : 0xd0caB4));
  for (const y of [9, 10, 11]) for (let x = 8; x < 11; x++) if (rnd(seed, x, y, 2) < 0.7) dot(img, x, y, 0x8a8478);
  dot(img, 9, 7, 0xb03028); dot(img, 10, 7, 0x8a2420);
  dot(img, 13, 9, 0x3a5a9a); dot(img, 13, 10, 0x2a4278);
  dot(img, 6, 2, 0xc8a030); dot(img, 7, 2, 0xa07a20);
  // bottom grille
  for (let x = 2; x < 14; x++) { img.set(x, 14, hex(x & 1 ? 0x2c2c2a : 0x5a5852)); }
  grime(img, seed + 3, 0.2, [120, 106, 80], 2, 0.6);
  streaks(img, seed + 4, 2, [120, 74, 40], 3, 0.3);
}
function freezerFront(img, seed) {
  material(img, seed, pal(0xb6b8b2, 0xc0c2bc, 0xcacbc6, 0xd3d4cf, 0xdbdcd7), 0.12, 0.15);
  bev(img, 0, 0, 16, 13, 0.06, -0.12);
  vbar(img, 13, 3, 10);
  for (let x = 6; x < 10; x++) { img.set(x, 1, CHROME[2]); img.set(x, 2, CHROME[1]); }
  for (let y = 13; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, y === 13 ? hex(0x45453f) : hex(x & 1 ? 0x2c2c2a : 0x55554f));
  // frost frosting around the seal, a sticker
  for (let x = 1; x < 15; x++) img.mix(x, 12, [230, 238, 240], 0.3);
  for (let y = 5; y < 8; y++) for (let x = 3; x < 6; x++) img.set(x, y, hex(y === 5 ? 0x3a6a9a : 0xc8c4b0));
  grime(img, seed + 3, 0.2, [120, 106, 80], 2, 0.6);
}
function stoveFront(img, seed) {
  material(img, seed, APPL, 0.12, 0.12);
  // control panel
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) img.set(x, y, shade(hex(0x3a3a38), (rnd(seed, x, y, 1) - 0.5) * 0.05));
  for (const kx of [1, 4, 11, 14]) { img.set(kx, 1, hex(0x18181a)); img.set(kx, 2, hex(0x101012)); img.set(kx - 1, 1, hex(0x262628)); img.set(kx - 1, 2, hex(0x1c1c1e)); img.set(kx, 1, hex(0xc8c4b8)); }
  for (let x = 6; x < 10; x++) { img.set(x, 1, hex(0x1e2a22)); img.set(x, 2, hex(0x16201a)); }
  dot(img, 7, 1, 0x3a5a44);
  for (let x = 0; x < 16; x++) img.set(x, 4, hex(0x55534c));
  // oven door
  bev(img, 0, 5, 16, 8, 0.07, -0.14);
  hbar(img, 2, 13, 6);
  for (let y = 8; y < 12; y++) for (let x = 3; x < 13; x++) {
    let c = mix(hex(0x1a1c1c), hex(0x2c3030), (y - 8) / 4);
    if (x + y === 15 || x + y === 16) c = hex(0x4a5250);
    img.set(x, y, c);
  }
  bev(img, 3, 8, 10, 4, -0.1, 0.06);
  // drawer
  for (let x = 0; x < 16; x++) img.set(x, 13, hex(0x55534c));
  bev(img, 0, 14, 16, 2, 0.05, -0.12);
  hbar(img, 6, 9, 14);
  grime(img, seed + 3, 0.3, [110, 84, 50], 2, 0.6);
}
function stoveTop(img, seed) {
  material(img, seed, APPL, 0.1, 0.12);
  for (let x = 0; x < 16; x++) { img.set(x, 0, hex(0x5a5850)); img.tone(x, 15, -0.08); }
  const burner = (cx, cy, r) => {
    img.disc(cx, cy, r + 0.9, (x, y, d) => img.set(x, y, d > r ? CHROME[2] : CHROME[1]));
    img.disc(cx, cy, r, (x, y, d) => {
      const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
      const coil = Math.sin(d * 3.2 + a) > 0;
      img.set(x, y, hex(coil ? 0x262422 : 0x48443e));
    });
  };
  burner(4.5, 4.5, 2.4); burner(11.5, 4.5, 2.0); burner(4.5, 11.5, 2.0); burner(11.5, 11.5, 2.4);
  grime(img, seed + 3, 0.35, [96, 70, 40], 2, 0.55);
  speckle(img, seed + 4, 0.03, pal(0x5a4022, 0x7a5a32));
}
function washerFront(img, seed) {
  material(img, seed, APPL, 0.12, 0.12);
  for (let x = 0; x < 16; x++) img.set(x, 3, hex(0x6a6860));
  bev(img, 0, 0, 16, 3, 0.06, -0.05);
  img.disc(12.5, 1.5, 1.2, (x, y) => img.set(x, y, CHROME[1])); dot(img, 12, 1, 0xd0d0d0);
  for (const bx of [3, 5, 7]) dot(img, bx, 1, 0x5a5a56);
  dot(img, 9, 1, 0x3a6a3a);
  img.disc(8, 9.5, 5.6, (x, y, d) => {
    if (d > 4.4) img.set(x, y, d > 5.1 ? CHROME[1] : CHROME[2]);
    else {
      let c = mix(hex(0x283234), hex(0x485658), clamp01((9.5 - y) / 8));
      if (Math.abs((x - y) + 3) < 1) c = mix(c, hex(0x8a9a9c), 0.5);
      if (y > 10 && d < 3.5) c = mix(c, hex(0x6a5a7a), 0.25 * rnd(seed, x, y, 3) + 0.15); // laundry still inside
      img.set(x, y, c);
    }
  });
  grime(img, seed + 3, 0.2, [110, 100, 80], 2, 0.6);
}
function tvFront(img, seed) {
  // visible rows ~6-15, cols 1-14
  material(img, seed, pal(0x2e2a26, 0x36312c, 0x3e3832, 0x463f38, 0x4e463e), 0.15, 0.2);
  woodGrain(img, seed, pal(0x4a3220, 0x543a25, 0x5e422a, 0x684a30), false, 0, 5, 16, 11);
  for (let y = 7; y < 15; y++) for (let x = 2; x < 11; x++) {
    const corner = (x === 2 || x === 10) && (y === 7 || y === 14);
    if (corner) continue;
    let c = mix(hex(0x1c2422), hex(0x2a3432), (y - 7) / 8);
    if (x + y === 12 || x + y === 13) c = mix(c, hex(0x6a7a78), 0.55);
    if (x + y === 15 && x > 3) c = mix(c, hex(0x4e5c5a), 0.35);
    img.set(x, y, c);
  }
  bev(img, 1, 6, 11, 10, -0.12, 0.08);
  // controls panel
  for (let y = 7; y < 15; y++) for (let x = 12; x < 15; x++) img.set(x, y, hex(0x2a2826));
  knob(img, 12, 8, CHROME); knob(img, 12, 11, CHROME);
  for (const y of [13, 14]) for (let x = 12; x < 15; x++) if ((x + y) & 1) dot(img, x, y, 0x121212);
  grime(img, seed + 3, 0.15, [80, 70, 56], 2, 0.6);
}
function plasticVents(img, seed, P) {
  material(img, seed, P, 0.1, 0.15);
  for (let y = 1; y < 16; y += 3) for (let x = 1; x < 15; x++) if ((x & 3) !== 0) { img.tone(x, y, -0.12); img.tone(x, y + 1, 0.04); }
  grime(img, seed + 3, 0.15, [60, 54, 46], 2, 0.6);
}

// ---------------------------------------------------------------------------
// cabinets & wooden furniture
function cabinetFront(img, seed) {
  woodGrain(img, seed, OAK, true);
  // drawer
  inset(img, 1, 1, 14, 4, 0.12);
  bev(img, 2, 2, 12, 2, 0.05, -0.08);
  hbar(img, 7, 8, 2, BRASS);
  // doors
  for (const dx of [1, 9]) {
    inset(img, dx, 6, 6, 8, 0.12);
    bev(img, dx + 1, 7, 4, 6, 0.06, -0.08);
  }
  knob(img, 6, 7, BRASS); knob(img, 9, 7, BRASS);
  for (let x = 0; x < 16; x++) { img.set(x, 14, hex(0x2a1e14)); img.set(x, 15, hex(0x1e1610)); }
  grime(img, seed + 3, 0.25, [50, 36, 24], 2, 0.55);
}
function wardrobeFront(img, seed) {
  woodGrain(img, seed, DARKWOOD, true);
  for (const dx of [0, 8]) {
    bev(img, dx, 1, 8, 14, 0.08, -0.14);
    inset(img, dx + 2, 3, 4, 10, 0.12);
  }
  for (let x = 0; x < 16; x++) { img.set(x, 0, shade(DARKWOOD[0], -0.04)); img.set(x, 15, shade(DARKWOOD[0], -0.08)); }
  knob(img, 6, 8, BRASS); knob(img, 8, 8, BRASS);
  img.set(7, 8, hex(0x1a120c)); img.set(7, 9, hex(0x1a120c));
  for (let y = 1; y < 15; y++) img.set(7, y, shade(DARKWOOD[0], -0.1)), img.set(8, y, shade(DARKWOOD[2], 0.02));
  knob(img, 5, 8, BRASS); knob(img, 9, 8, BRASS);
  grime(img, seed + 3, 0.15, [30, 22, 16], 2, 0.6);
}
function dresserFront(img, seed) {
  // visible rows ~2.4-16
  woodGrain(img, seed, OAK, false);
  for (let x = 0; x < 16; x++) { img.tone(x, 2, 0.1); img.tone(x, 3, -0.08); }
  for (const dy of [4, 8, 12]) {
    bev(img, 0, dy, 16, 4, 0.08, -0.16);
    hbar(img, 3, 4, dy + 1, BRASS); hbar(img, 11, 12, dy + 1, BRASS);
  }
  grime(img, seed + 3, 0.2, [50, 36, 24], 2, 0.6);
}
function bookshelf(img, seed) {
  woodGrain(img, seed, DARKWOOD, false);
  const r = makeRng(seed + 1);
  const COLS = [0x6e2a24, 0x2e3e5a, 0x3a5232, 0x8a6a2a, 0x5a3a24, 0x6a6a64, 0x7a3e4e, 0x2c4a4a, 0xa08850, 0x4a2a3e, 0x8a4a2a, 0x3a3a3a];
  for (const [y0, y1] of [[1, 7], [9, 15]]) {
    for (let y = y0; y < y1; y++) for (let x = 1; x < 15; x++) img.set(x, y, hex(0x1c140e));
    let x = 1;
    while (x < 15) {
      const w = r.chance(0.25) ? 2 : 1;
      if (r.chance(0.12)) { x += r.int(1, 2); continue; } // gap (looted / missing)
      const h = r.int(4, y1 - y0);
      const c = hex(r.pick(COLS));
      const lean = r.chance(0.1) && x < 13;
      for (let s = 0; s < w && x + s < 15; s++) for (let y = y1 - h; y < y1; y++) {
        let cc = shade(c, s === 0 ? 0.04 : -0.06);
        if (y === y1 - h) cc = shade(c, 0.1);
        if (y === y1 - h + 1 || y === y1 - 2) cc = shade(c, (rnd(seed, x, y, 1) < 0.5) ? 0.18 : -0.15);
        img.set(lean ? x + s + ((y - (y1 - h)) < 2 ? 1 : 0) : x + s, y, cc);
      }
      x += w;
    }
    for (let x2 = 1; x2 < 15; x2++) img.mul(x2, y0, 0.7);
  }
  for (let x = 0; x < 16; x++) { img.tone(x, 0, 0.06); img.tone(x, 7, 0.08); img.tone(x, 8, -0.1); img.tone(x, 15, -0.08); }
  speckle(img, seed + 4, 0.03, pal(0x8a8478));
}
function deskFront(img, seed) {
  // visible rows ~2.4-16
  woodGrain(img, seed, DARKWOOD, false);
  for (let x = 0; x < 16; x++) { img.tone(x, 2, 0.12); img.tone(x, 3, -0.06); }
  // kneehole (deep shadow) + modesty panel
  for (let y = 4; y < 16; y++) for (let x = 1; x < 9; x++) img.set(x, y, shade(DARKWOOD[0], -0.08 - (y > 11 ? 0.03 : 0)));
  for (let x = 1; x < 9; x++) img.set(x, 4, shade(DARKWOOD[0], -0.18));
  // drawer pedestal
  for (const dy of [4, 8, 12]) { bev(img, 9, dy, 7, 4, 0.08, -0.16); hbar(img, 11, 13, dy + 1, BRASS); }
  grime(img, seed + 3, 0.15, [24, 18, 12], 2, 0.6);
}
function deskTop(img, seed) {
  woodGrain(img, seed, pal(0x4a3422, 0x553c27, 0x60442c, 0x6b4c31, 0x765436), false);
  for (let x = 0; x < 16; x++) { img.tone(x, 15, 0.08); img.tone(x, 14, -0.04); }
  // papers
  const paper = (x0, y0, w, h, tilt) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = x0 + x + (tilt && y > h / 2 ? 1 : 0);
      img.set(px, y0 + y, hex((y & 1) && x > 0 && x < w - 1 && rnd(seed, px, y0 + y, 3) < 0.7 ? 0xa8a496 : 0xd2cec0));
    }
  };
  paper(2, 2, 5, 6, true);
  paper(9, 5, 4, 5, false);
  // pen, coffee ring
  for (let s = 0; s < 4; s++) dot(img, 4 + s, 11 + (s >> 1), s === 0 ? 0xc8c4b8 : 0x22305a);
  img.disc(12, 12, 1.9, (x, y, d) => { if (d > 1.1) img.mix(x, y, [40, 26, 14], 0.45); });
  grime(img, seed + 3, 0.15, [40, 30, 20], 2, 0.6);
}
function tableTop(img, seed) {
  const P = pal(0x765236, 0x825c3c, 0x8e6643, 0x9a704a, 0xa47a52);
  woodGrain(img, seed, P, false);
  for (const y of [5, 10]) for (let x = 0; x < 16; x++) img.set(x, y, shade(P[0], -0.1));
  bev(img, 0, 0, 16, 16, 0.06, -0.14);
  img.disc(5, 7.5, 2, (x, y, d) => { if (d > 1.2) img.mix(x, y, [50, 32, 18], 0.4); });
  const r = makeRng(seed + 2);
  for (let k = 0; k < 2; k++) { const x = r.int(2, 10), y = r.int(2, 13); for (let s = 0; s < 4; s++) img.mul(x + s, y + (s === 3 ? 1 : 0), 1.14); }
  grime(img, seed + 3, 0.15, [40, 30, 20], 2, 0.6);
}
function counterTop(img, seed, wood) {
  if (wood) {
    woodGrain(img, seed, MAHOG, false);
    for (let k = 0; k < 2; k++) {
      const cx = 3 + k * 8 + (rnd(seed, k, 0, 1) * 3 | 0), cy = 4 + (rnd(seed, k, 0, 2) * 6 | 0);
      img.disc(cx, cy, 1.8, (x, y, d) => { if (d > 1.0) img.mix(x, y, [120, 100, 80], 0.25); });
    }
    speckle(img, seed + 4, 0.03, pal(0x7a4a36));
  } else {
    material(img, seed, pal(0x9c9482, 0xa59d8b, 0xaea694, 0xb7af9d), 0.35, 0.1);
    speckle(img, seed + 4, 0.1, pal(0x7a7466, 0x6a6458, 0xc8c0ae));
    const r = makeRng(seed + 5);
    const cx = r.int(3, 12), cy = r.int(3, 10);
    img.disc(cx, cy, 1.9, (x, y, d) => { if (d > 1.1) img.mix(x, y, [86, 60, 36], 0.35); });
    for (let s = 0; s < 4; s++) img.mul(r.int(1, 14), r.int(1, 12), 0.85);
  }
  for (let x = 0; x < 16; x++) { img.tone(x, 14, 0.1); img.set(x, 15, shade(wood ? MAHOG[0] : hex(0x6e6a60), -0.04)); }
  grime(img, seed + 3, 0.12, [70, 60, 46], 2, 0.6);
}
function sinkTop(img, seed) {
  counterTop(img, seed, false);
  for (let y = 4; y < 14; y++) for (let x = 2; x < 14; x++) {
    const e = x === 2 || x === 13 || y === 4 || y === 13;
    let c = e ? CHROME[3] : mix(hex(0x7e8486), hex(0x9ca2a4), (y - 4) / 9);
    if (!e && (x === 3 || y === 5)) c = hex(0x62686a);
    img.set(x, y, shade(c, (rnd(seed, x, y, 1) - 0.5) * 0.05));
  }
  img.disc(8, 9.5, 1.2, (x, y) => img.set(x, y, hex(0x2a2c2c)));
  img.disc(8, 9.5, 2.4, (x, y, d) => { if (d > 1.2) img.mix(x, y, [120, 80, 44], 0.3); });
  // faucet at the back
  dot(img, 7, 1, 0xcacecf); dot(img, 8, 1, 0xa6aaac); dot(img, 7, 2, 0xa6aaac); dot(img, 8, 2, 0x7e8284); dot(img, 8, 3, 0x7e8284); dot(img, 8, 4, 0x55595b);
  dot(img, 4, 1, 0xcacecf); dot(img, 4, 2, 0x7e8284); dot(img, 11, 1, 0xcacecf); dot(img, 11, 2, 0x7e8284);
}

// ---------------------------------------------------------------------------
// soft furniture & beds
function fabric(img, seed, base, opts = {}) {
  const R = ramp(base, 5, 0.07, 0.25);
  const wn = white(seed + 1), f = fbm(seed + 2, 3, 3, 2);
  img.each((x, y) => {
    const i = y * 16 + x;
    let v = 0.5 + (wn[i] - 0.5) * 0.5 + (f[i] - 0.5) * 0.4 + ((x + y) & 1 ? 0.06 : -0.06);
    if (opts.rib && (x & 1)) v -= 0.12;
    img.set(x, y, pick(R, clamp01(v), x, y, 0.5));
  });
  return img;
}
function couch(img, seed, base) {
  fabric(img, seed, base, { rib: true });
  // piping between back cushion and seat, cushion seam
  for (let x = 0; x < 16; x++) { img.tone(x, 8, 0.08); img.tone(x, 9, -0.16); img.tone(x, 7, -0.06); }
  for (let y = 0; y < 16; y++) { img.tone(7, y, -0.12); img.tone(8, y, 0.04); }
  const r = makeRng(seed + 3);
  // tear with foam
  const tx = r.int(2, 12), ty = r.int(10, 13);
  dot(img, tx, ty, 0xc8b070); dot(img, tx + 1, ty, 0xb09a5a); dot(img, tx, ty + 1, 0xa08a4a); img.mul(tx - 1, ty, 0.8);
  grime(img, seed + 4, 0.25, shade(base, -0.3), 2, 0.55);
}
const QUILT = [0x74443e, 0x3e4a5e, 0x8e7c4c, 0xa89e88, 0x62705a, 0x7e5638, 0x5a3e4e];
function quiltPx(seed, x, y) {
  // period 8 rows so head & foot halves join seamlessly
  const px = x >> 2, py = (y >> 2) & 1;
  const c = hex(QUILT[Math.floor(rnd(seed, px, py, 7) * QUILT.length)]);
  const lx = x & 3, ly = y & 3;
  let k = (rnd(seed, x, y & 7, 1) - 0.5) * 0.05;
  if (lx === 0 || ly === 0) k += 0.08; // stitch lines
  if ((lx === 2 && ly === 2)) k -= 0.06;
  return shade(c, k);
}
function bedHeadTop(img, seed) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, quiltPx(seed, x, y));
  // sheet + pillow on the back half
  for (let y = 0; y < 7; y++) for (let x = 0; x < 16; x++) img.set(x, y, shade(hex(0xc4c0b4), (rnd(seed, x, y, 2) - 0.5) * 0.04));
  for (let y = 1; y < 6; y++) for (let x = 2; x < 14; x++) {
    if ((x === 2 || x === 13) && (y === 1 || y === 5)) continue;
    let k = 0.04;
    if (y === 1 || x === 2) k = 0.1; if (y === 5 || x === 13) k = -0.1;
    img.set(x, y, shade(hex(0xd4d0c6), k + (rnd(seed, x, y, 3) - 0.5) * 0.03));
  }
  for (let x = 3; x < 13; x++) img.tone(x, 6, -0.1);
  // folded sheet edge over the blanket
  for (let x = 0; x < 16; x++) { img.set(x, 7, hex(0xd0ccc0)); img.set(x, 8, hex(0xa8a498)); }
  for (let y = 0; y < 16; y++) { img.tone(0, y, -0.08); img.tone(15, y, -0.08); }
  grime(img, seed + 4, 0.18, [110, 96, 70], 2, 0.6);
}
function bedFootTop(img, seed) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, quiltPx(seed, x, y));
  for (let x = 0; x < 16; x++) { img.tone(x, 14, -0.08); img.tone(x, 15, -0.16); }
  for (let y = 0; y < 16; y++) { img.tone(0, y, -0.08); img.tone(15, y, -0.08); }
  grime(img, seed + 4, 0.18, [110, 96, 70], 2, 0.6);
}
function bedSide(img, seed) {
  // visible rows 7-15: blanket overhang, mattress, wooden frame
  for (let y = 0; y < 10; y++) for (let x = 0; x < 16; x++) img.set(x, y, quiltPx(seed, x, y));
  for (let x = 0; x < 16; x++) { img.tone(x, 9, -0.14); }
  for (let y = 10; y < 12; y++) for (let x = 0; x < 16; x++) img.set(x, y, hex((x % 3 === 0) ? 0x9aa0a8 : 0xc4c2b8));
  woodGrain(img, seed, OAK, false, 0, 12, 16, 4);
  for (let x = 0; x < 16; x++) { img.tone(x, 12, -0.14); img.tone(x, 15, -0.1); }
}
function hospitalBedTop(img, seed) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, shade(hex(0xc8ccc8), (rnd(seed, x, y, 1) - 0.5) * 0.04));
  for (let y = 1; y < 5; y++) for (let x = 3; x < 13; x++) img.set(x, y, shade(hex(0xdadcd8), y === 1 ? 0.04 : y === 4 ? -0.08 : 0));
  for (let y = 7; y < 15; y++) for (let x = 1; x < 15; x++) {
    let c = hex(0x8aa0b0);
    if ((x + y * 3) % 7 === 0) c = hex(0x7a90a2);
    img.set(x, y, shade(c, (rnd(seed, x, y, 2) - 0.5) * 0.05));
  }
  for (let x = 1; x < 15; x++) { img.set(x, 7, hex(0xd8dad6)); img.tone(x, 8, -0.06); }
  for (let y = 0; y < 16; y++) { img.set(0, y, CHROME[2]); img.set(15, y, CHROME[1]); }
  for (let x = 0; x < 16; x++) { img.set(x, 0, hex(0x9a9e9c)); img.set(x, 15, hex(0x8a8e8c)); }
  img.disc(9, 11, 1.4, (x, y, d) => img.mix(x, y, [100, 40, 30], 0.3));
}
function hospitalBedSide(img, seed) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, hex(0x8aa0b0));
  for (let x = 0; x < 16; x++) {
    img.set(x, 7, hex(0x9aaebc)); img.set(x, 8, hex(0x6e8292));
    img.set(x, 9, CHROME[3]); img.set(x, 10, CHROME[1]);
    img.set(x, 11, hex(0x8e9290)); img.set(x, 12, hex(0x6e7270));
    for (let y = 13; y < 16; y++) img.set(x, y, hex(0x1e2020));
  }
  for (const x of [3, 8, 13]) { img.set(x, 9, hex(0x4a4e50)); img.set(x, 10, hex(0x3a3e40)); }
  for (const wx of [1, 12]) { img.set(wx, 13, hex(0x6e7270)); img.set(wx + 1, 13, hex(0x6e7270)); img.set(wx, 14, hex(0x0e0e0e)); img.set(wx + 1, 14, hex(0x2a2a2a)); img.set(wx, 15, hex(0x2a2a2a)); img.set(wx + 1, 15, hex(0x0e0e0e)); }
}

// ---------------------------------------------------------------------------
// bathroom
function porcelain(img, seed, base = hex(0xcfcfc8)) {
  const R = ramp(base, 5, 0.06, 0.15);
  const f = fbm(seed, 2, 2, 2), wn = white(seed + 1);
  img.each((x, y) => img.set(x, y, pick(R, clamp01(0.55 + (f[y * 16 + x] - 0.5) * 0.5 + (wn[y * 16 + x] - 0.5) * 0.25), x, y, 0.4)));
  for (let y = 0; y < 16; y++) { img.tone(3, y, 0.05); img.tone(4, y, 0.03); }
  grime(img, seed + 2, 0.22, [150, 136, 96], 2, 0.6);
  const r = makeRng(seed + 3);
  crack(img, r, r.int(2, 12), r.int(2, 8), 4, 0.5, 1, { dark: 0.82, lip: 0, branch: 0 });
  return img;
}
function bathtubTop(img, seed) {
  porcelain(img, seed);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
    let c = shade(hex(0xc0c2bc), (rnd(seed, x, y, 4) - 0.5) * 0.04);
    if (y === 2 || x === 2) c = shade(c, -0.12);
    if (y === 3 || x === 3) c = shade(c, -0.05);
    img.set(x, y, c);
  }
  // grime ring + rust streak from the faucet
  for (let x = 3; x < 13; x++) { img.mix(x, 11, [130, 116, 80], 0.35); img.mix(x, 12, [130, 116, 80], 0.2); }
  for (let y = 3; y < 9; y++) img.mix(8, y, [140, 86, 44], 0.5 - (y - 3) * 0.07);
  dot(img, 7, 0, 0xcacecf); dot(img, 8, 0, 0xa6aaac); dot(img, 8, 1, 0xa6aaac); dot(img, 8, 2, 0x55595b);
  img.disc(8, 4.5, 0.8, (x, y) => img.set(x, y, hex(0x3a3a38)));
}
function mirrorCabinet(img, seed) {
  // visible cols/rows 1.6-14.4
  material(img, seed, APPL, 0.1, 0.1);
  bev(img, 1, 1, 14, 14, 0.08, -0.12);
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
    let c = mix(hex(0x8a9ca4), hex(0xbccad0), clamp01((x - y + 8) / 16));
    if (x - y === 2 || x - y === 3) c = mix(c, hex(0xe0e8ea), 0.5);
    if ((x === 3 || x === 12) && (y === 3 || y === 12)) c = hex(0x5a5850);
    img.set(x, y, c);
  }
  // desilvering + crack
  for (const [x, y] of [[3, 11], [4, 12], [3, 12], [12, 4], [11, 3]]) img.mix(x, y, [70, 64, 54], 0.6);
  for (const [x, y] of [[9, 6], [10, 5], [11, 4], [8, 7], [7, 8], [6, 9], [10, 7], [11, 8], [9, 5], [8, 4], [10, 6]]) img.set(x, y, hex(0x4a5658));
  img.set(9, 6, hex(0xe8eef0));
  bev(img, 2, 2, 12, 12, -0.1, 0.08);
}

// ---------------------------------------------------------------------------
// workshop
function workbenchTop(img, seed) {
  const P = pal(0x7a5a38, 0x86643f, 0x926e47, 0x9d784f, 0xa88358);
  const wn = white(seed + 1), g = vnoise(seed, 2, 16);
  img.each((x, y) => {
    const strip = y >> 1;
    img.set(x, y, pick(P, clamp01(0.3 + rnd(seed, strip, 0, 2) * 0.4 + (g[y * 16 + x] - 0.5) * 0.4 + (wn[y * 16 + x] - 0.5) * 0.2 - ((y & 1) ? 0.08 : 0)), x, y, 0.4));
  });
  // hammer
  for (let s = 0; s < 6; s++) dot(img, 3 + s, 9 - (s >> 1) + 0, 0x8a5e34);
  dot(img, 9, 6, 0x4a4c4e); dot(img, 9, 7, 0x6a6e70); dot(img, 10, 6, 0x6a6e70); dot(img, 8, 6, 0x4a4c4e); dot(img, 10, 7, 0x3a3c3e);
  // wrench
  for (let s = 0; s < 5; s++) dot(img, 4 + s, 13, s === 0 ? 0xa6aaac : 0x8a8e90);
  dot(img, 3, 12, 0x8a8e90); dot(img, 3, 14, 0x8a8e90); dot(img, 9, 13, 0xa6aaac);
  // nails, screws, sawdust, oil stain
  for (const [x, y] of [[12, 3], [13, 4], [11, 5], [13, 2]]) dot(img, x, y, 0x9a9a96);
  speckle(img, seed + 3, 0.05, pal(0xc8aa78, 0xd4b888));
  img.disc(12.5, 11.5, 2, (x, y, d) => img.mix(x, y, [30, 24, 18], 0.4 * (1 - d / 2.2)));
  // vise
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) img.set(x, y, hex(y === 0 ? 0x5a6a5e : 0x3e4a42));
  dot(img, 4, 1, 0x8a8e90); dot(img, 5, 1, 0x8a8e90);
}
function workbenchSide(img, seed) {
  woodGrain(img, seed, pal(0x6a4e30, 0x765736, 0x82603d, 0x8e6a44), false);
  for (let x = 0; x < 16; x++) { img.tone(x, 0, 0.1); img.tone(x, 2, -0.14); }
  // dark open space under the bench top with a shelf
  for (let y = 3; y < 16; y++) for (let x = 2; x < 14; x++) img.set(x, y, hex(y < 11 ? 0x1e1812 : 0x161210));
  for (let x = 2; x < 14; x++) { img.set(x, 11, hex(0x8a6a44)); img.set(x, 12, hex(0x5a4228)); }
  // paint cans and a jug on the shelf
  for (const [x0, c] of [[3, 0x8a2a22], [6, 0x2a4a7a], [11, 0xc8c4b8]]) {
    for (let y = 8; y < 11; y++) for (let x = x0; x < x0 + 2; x++) img.set(x, y, shade(hex(c), x === x0 ? 0.04 : -0.08));
    img.set(x0, 8, hex(0xa6aaac)); img.set(x0 + 1, 8, hex(0x7e8284));
  }
  // hanging saw on the back + drawer
  for (let x = 3; x < 10; x++) { img.set(x, 5, hex(0x8a8e90)); if (x & 1) img.set(x, 6, hex(0x6a6e70)); }
  img.set(10, 5, hex(0x6a3e22)); img.set(11, 5, hex(0x6a3e22)); img.set(10, 4, hex(0x6a3e22));
  for (let y = 3; y < 16; y++) for (const x of [0, 1, 14, 15]) img.set(x, y, pick(pal(0x5a4228, 0x6a4e30, 0x7a5a38), x === 0 || x === 14 ? 0.8 : 0.2, x, y));
  grime(img, seed + 3, 0.2, [30, 24, 18], 2, 0.6);
}
function metalShelfFront(img, seed, items = true) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, hex(0x24221f));
  const U = pal(0x6a3e26, 0x8a4e2e, 0xa45e36);
  const r = makeRng(seed);
  if (items) {
    // top level: paint cans + box
    const can = (x0, y1, c) => { for (let y = y1 - 3; y < y1; y++) for (let x = x0; x < x0 + 3; x++) img.set(x, y, shade(hex(c), x === x0 ? 0.06 : x === x0 + 2 ? -0.1 : 0)); for (let x = x0; x < x0 + 3; x++) img.set(x, y1 - 3, hex(0x9a9e9c)); img.set(x0 + 1, y1 - 2, hex(0xd8d4c8)); };
    const box = (x0, y1, w, h, c) => { for (let y = y1 - h; y < y1; y++) for (let x = x0; x < x0 + w; x++) img.set(x, y, shade(hex(c), y === y1 - h ? 0.08 : (rnd(seed, x, y, 1) - 0.5) * 0.06)); };
    can(2, 4, 0x8a2a22); box(6, 4, 4, 3, 0xa07a4e); can(11, 4, 0x2a4a7a);
    box(2, 10, 5, 4, 0xa07a4e); dot(img, 3, 8, 0xc8c4b8);
    for (let y = 6; y < 10; y++) for (let x = 8; x < 11; x++) img.set(x, y, hex(y === 6 ? 0x2e2e2e : 0xb84a24));
    can(11, 10, 0x4a6a3a);
    for (let y = 12; y < 15; y++) for (let x = 2; x < 13; x++) if (r.chance(0.85)) img.set(x, y, hex((x - 2) % 5 < 4 ? 0x2a2a2a : 0x1a1a1a));
    for (let x = 2; x < 13; x++) if ((x - 2) % 5 === 1) img.set(x, 12, hex(0x4a4a4a));
  }
  for (const sy of [4, 10, 15]) for (let x = 0; x < 16; x++) { img.set(x, sy, hex(0x8e9294)); if (sy < 15) img.set(x, sy + 1, hex(0x5a5e60)); }
  for (let y = 0; y < 16; y++) for (const [x, k] of [[0, 0.9], [1, 0.3], [14, 0.9], [15, 0.3]]) img.set(x, y, (y & 1) && (x === 1 || x === 14) ? hex(0x1a1a1a) : pick(U, k, x, y));
  streaks(img, seed + 2, 3, [100, 60, 30], 5, 0.3);
}
function metalShelfSide(img, seed) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, hex(0x24221f));
  const U = pal(0x6a3e26, 0x8a4e2e, 0xa45e36);
  for (let t = 0; t < 16; t++) { img.set(t, t, U[1]); img.set(t, 15 - t, U[0]); }
  for (const sy of [4, 10, 15]) for (let x = 0; x < 16; x++) { img.set(x, sy, hex(0x8e9294)); if (sy < 15) img.set(x, sy + 1, hex(0x5a5e60)); }
  for (let y = 0; y < 16; y++) for (const [x, k] of [[0, 0.9], [1, 0.3], [14, 0.9], [15, 0.3]]) img.set(x, y, (y & 1) && (x === 1 || x === 14) ? hex(0x1a1a1a) : pick(U, k, x, y));
}
function toolboxSide(img, seed) {
  // visible rows ~10.4-16
  const R = pal(0x6e1c16, 0x82241c, 0x962c22, 0xa83628, 0xb84230);
  material(img, seed, R, 0.15, 0.15);
  for (let x = 0; x < 16; x++) { img.tone(x, 10, 0.1); img.set(x, 12, hex(0x3a0e0a)); img.tone(x, 13, 0.06); img.tone(x, 15, -0.14); }
  for (const lx of [5, 10]) { img.set(lx, 12, CHROME[3]); img.set(lx, 13, CHROME[1]); img.set(lx + 1, 12, CHROME[2]); img.set(lx + 1, 13, CHROME[0]); }
  speckle(img, seed + 3, 0.04, pal(0x9a9a96, 0x6a6a66));
  grime(img, seed + 4, 0.25, [40, 30, 24], 2, 0.6);
}
function toolboxTop(img, seed) {
  // visible cols 3-12, rows 5-11
  const R = pal(0x6e1c16, 0x82241c, 0x962c22, 0xa83628, 0xb84230);
  material(img, seed, R, 0.15, 0.15);
  for (let x = 3; x < 13; x++) { img.tone(x, 5, 0.1); img.tone(x, 10, -0.14); }
  for (let x = 5; x < 11; x++) { img.set(x, 7, hex(0x2a2a2a)); img.set(x, 8, hex(0x141414)); }
  img.set(4, 7, CHROME[2]); img.set(4, 8, CHROME[0]); img.set(11, 7, CHROME[2]); img.set(11, 8, CHROME[0]);
  speckle(img, seed + 3, 0.04, pal(0x9a9a96, 0x6a6a66));
}

// ---------------------------------------------------------------------------
// store fixtures
function shelfFrame(img, seed) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, shade(hex(0x2e2c2a), (rnd(seed, x, y, 1) - 0.5) * 0.05));
  for (const sy of [5, 10, 15]) for (let x = 0; x < 16; x++) {
    img.set(x, sy, hex(0xb0aea6));
    if ((x % 5) === 2) img.set(x, sy, hex(0xe0dcc8));
    if ((x % 5) === 3) img.set(x, sy, hex(0xd8c470));
  }
  for (let y = 0; y < 16; y++) { img.set(0, y, hex(0x8e8c86)); img.set(15, y, hex(0x6e6c66)); }
}
function shelfItems(img, seed, kinds, density = 1) {
  const r = makeRng(seed);
  for (const y1 of [5, 10, 15]) {
    let x = 1;
    while (x < 15) {
      if (!r.chance(density)) { x += r.int(1, 3); continue; }
      const k = r.pick(kinds);
      const w = Math.min(k.w, 15 - x);
      k.draw(img, x, y1, w, r);
      x += w;
    }
  }
}
const CAN = { w: 2, draw(img, x, y1, w, r) { const c = hex(r.pick([0xa83228, 0x3a6a3a, 0xc89a30, 0x2e4e8a, 0x8a4a2a])); for (let y = y1 - 3; y < y1; y++) for (let s = 0; s < w; s++) img.set(x + s, y, y === y1 - 3 ? hex(s ? 0x8a8e90 : 0xb4b8ba) : y === y1 - 2 ? hex(0xd0ccc0) : shade(c, s ? -0.1 : 0.04)); } };
const BOX = { w: 3, draw(img, x, y1, w, r) { const c = hex(r.pick([0xc8a030, 0xa83a2a, 0x3a5a8a, 0x5a8a3a, 0xd0ccc0, 0x8a3a6a])); const h = r.int(3, 4); for (let y = y1 - h; y < y1; y++) for (let s = 0; s < w; s++) img.set(x + s, y, shade(c, y === y1 - h ? 0.1 : s === w - 1 ? -0.12 : 0)); img.set(x + 1, y1 - h + 1, shade(c, 0.25)); } };
const JAR = { w: 2, draw(img, x, y1, w, r) { const c = hex(r.pick([0x8a3a1e, 0x6a7a2a, 0xa86a2a])); for (let y = y1 - 3; y < y1; y++) for (let s = 0; s < w; s++) img.set(x + s, y, y === y1 - 3 ? hex(0xc8a040) : shade(c, s ? -0.1 : 0.06)); } };
const BOTTLE = { w: 3, draw(img, x, y1, w, r) { const c = hex(r.pick([0x2e5a9a, 0xd06a24, 0x3a8a5a, 0xc8c4b8, 0xb83a5a])); for (let y = y1 - 4; y < y1; y++) for (let s = 0; s < w; s++) { if (y === y1 - 4 && s !== 1) continue; img.set(x + s, y, y === y1 - 4 ? hex(0xe0dcd0) : shade(c, s === 0 ? 0.08 : s === w - 1 ? -0.1 : 0)); } img.set(x + 1, y1 - 2, hex(0xe8e4d8)); } };
const ROLL = { w: 3, draw(img, x, y1, w, r) { for (let y = y1 - 4; y < y1; y++) for (let s = 0; s < w; s++) img.set(x + s, y, shade(hex(0xd8d4ca), s === 0 ? 0.04 : s === w - 1 ? -0.1 : (y & 1) ? -0.03 : 0.02)); img.set(x + 1, y1 - 3, hex(0x7a9ac0)); } };
const PILLS = { w: 2, draw(img, x, y1, w, r) { for (let y = y1 - 3; y < y1; y++) for (let s = 0; s < w; s++) img.set(x + s, y, y === y1 - 3 ? hex(0xe4e0d8) : shade(hex(0xc8701e), s ? -0.1 : 0.05)); img.set(x, y1 - 1, hex(0xe4e0d8)); } };
const MEDBOX = { w: 3, draw(img, x, y1, w, r) { const c = hex(r.pick([0x2e5a9a, 0xb03028, 0x3a8a5a, 0x6a3a8a, 0xc89a30])); const h = r.int(2, 3); for (let y = y1 - h; y < y1; y++) for (let s = 0; s < w; s++) img.set(x + s, y, s === w - 1 ? hex(0xb0aca2) : y === y1 - h ? hex(0xe8e4dc) : hex(0xd4d0c6)); for (let s = 0; s < w - 1; s++) img.set(x + s, y1 - 1, c); } };

function cooler(img, seed) {
  const A = pal(0x6e7276, 0x8a8e92, 0xa6aaae);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, hex(0x1e2428));
  const r = makeRng(seed);
  for (const y1 of [6, 11, 15]) {
    for (let x = 2; x < 14; x++) img.set(x, y1, hex(0x5a5e60));
    let x = 2;
    while (x < 13) {
      if (r.chance(0.22)) { x++; continue; }
      const c = hex(r.pick([0x2a6a3a, 0x6a3a1e, 0xa8b4b0, 0xb83028, 0x2e4e8a, 0xc8a030]));
      const tall = r.chance(0.6);
      for (let y = y1 - (tall ? 4 : 3); y < y1; y++) img.set(x, y, y === y1 - (tall ? 4 : 3) ? hex(0x9a9e9c) : shade(c, y === y1 - 2 ? 0.2 : 0));
      x += 1 + (r.chance(0.3) ? 1 : 0);
    }
  }
  // glass reflection
  for (let y = 1; y < 15; y++) for (let x = 2; x < 14; x++) { const d = (x + y) % 12; if (d === 2 || d === 3) img.mix(x, y, [150, 170, 176], 0.35); }
  // frame, handle, header and grille
  for (let y = 0; y < 16; y++) for (const [x, k] of [[0, 2], [1, 0], [14, 1], [15, 0]]) img.set(x, y, A[k]);
  for (let x = 0; x < 16; x++) { img.set(x, 0, A[1]); img.set(x, 15, hex(0x2c2e30)); }
  vbar(img, 12, 5, 10);
  grime(img, seed + 3, 0.18, [70, 64, 56], 2, 0.6);
}
function checkoutFront(img, seed) {
  material(img, seed, pal(0x8e8a80, 0x989489, 0xa29e93, 0xaca89d), 0.15, 0.15);
  for (let x = 0; x < 16; x++) { img.set(x, 0, hex(0x6e6a62)); img.set(x, 3, hex(0x9a2a22)); img.set(x, 4, hex(0x7a201a)); }
  for (let y = 13; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, hex(y === 13 ? 0x3a3834 : 0x262420));
  for (let y = 0; y < 13; y++) { img.tone(0, y, 0.05); img.tone(15, y, -0.08); }
  const r = makeRng(seed + 2);
  for (let k = 0; k < 3; k++) { const x = r.int(1, 13), y = r.int(6, 12); img.mul(x, y, 0.85); img.mul(x + 1, y, 0.9); }
  grime(img, seed + 3, 0.22, [60, 54, 44], 2, 0.55);
}
function registerFront(img, seed) {
  // visible cols 3-12, rows 10-15 (the cash drawer)
  material(img, seed, pal(0x7a766a, 0x848074, 0x8e8a7e, 0x989488), 0.12, 0.1);
  for (let x = 3; x < 13; x++) { img.set(x, 10, hex(0x4e4a42)); img.tone(x, 11, 0.08); img.set(x, 15, hex(0x3a3832)); }
  dot(img, 7, 12, 0xb0b4b6); dot(img, 8, 12, 0x6a6e70);
  for (let x = 5; x < 11; x++) img.set(x, 13, hex(0x2a2824));
}
function registerTop(img, seed) {
  // visible cols 3-12, rows 4-11
  material(img, seed, pal(0x7a766a, 0x848074, 0x8e8a7e, 0x989488), 0.12, 0.1);
  for (let x = 4; x < 12; x++) { img.set(x, 4, hex(0x1a2a1e)); img.set(x, 5, hex(0x142018)); }
  for (const x of [5, 7, 8]) dot(img, x, 4, 0x3a5a40);
  for (let y = 7; y < 12; y++) for (let x = 4; x < 12; x++) {
    if ((x & 1) && (y & 1)) img.set(x, y, hex(x === 11 && y === 11 ? 0x3a7a3a : x === 11 && y === 9 ? 0xa83228 : 0xd0ccc0));
    else img.set(x, y, hex(0x4e4a42));
  }
}
function radioFront(img, seed) {
  // visible cols 3-12, rows 10-15
  woodGrain(img, seed, pal(0x4a2e1c, 0x553620, 0x603e26, 0x6a462c), false);
  bev(img, 3, 10, 10, 6, 0.1, -0.14);
  for (let y = 11; y < 15; y++) for (let x = 4; x < 8; x++) img.set(x, y, hex((y & 1) ? 0x2a2018 : 0x8a7a5a));
  for (let x = 8; x < 12; x++) { img.set(x, 11, hex(0xc8b88a)); img.set(x, 12, hex(0xb0a074)); }
  dot(img, 10, 11, 0xa02a20); dot(img, 10, 12, 0x8a2218);
  knob(img, 8, 13, pal(0x101010, 0x1e1e1e, 0x2e2e2e, 0x5a5a5a)); knob(img, 10, 13, pal(0x101010, 0x1e1e1e, 0x2e2e2e, 0x5a5a5a));
}
function clothingRack(img, seed) {
  img.fill([0, 0, 0], 0);
  const r = makeRng(seed);
  for (let y = 1; y < 16; y++) { img.set(0, y, CHROME[2], 255); img.set(15, y, CHROME[1], 255); }
  for (let x = 0; x < 16; x++) { img.set(x, 1, CHROME[3], 255); img.set(x, 2, CHROME[0], 255); }
  for (let x = 0; x < 4; x++) { img.set(x, 15, CHROME[1], 255); img.set(15 - x, 15, CHROME[1], 255); }
  const garments = [0x8a2a24, 0x3a5a8a, 0x5a6a3a, 0x7a7a76, 0x2a2a2e, 0xa08a4a];
  let x = 1;
  while (x < 14) {
    const w = r.int(2, 4);
    const c = hex(r.pick(garments));
    const len = r.int(7, 11);
    const plaid = r.chance(0.3);
    for (let s = 0; s < w && x + s < 15; s++) for (let y = 3; y < 3 + len; y++) {
      let cc = shade(c, s === 0 ? 0.06 : s === w - 1 ? -0.1 : 0);
      if (plaid && ((x + s) % 3 === 0 || y % 3 === 0)) cc = shade(cc, -0.15);
      if (y === 3) cc = shade(cc, 0.1);
      img.set(x + s, y, cc, 255);
    }
    img.set(x + (w >> 1), 2, hex(0x5a5e60), 255);
    x += w;
  }
}
function crateWood(img, seed) {
  const src = planks(new Img(), seed, pal(0x7a6040, 0x866a47, 0x92744e, 0x9e7e56, 0xa8885e), hex(0x4a3a26), { weather: 0.15 });
  img.copy(src);
  const F = pal(0x4e3a24, 0x5a442a, 0x664e32);
  const frame = (x, y) => img.set(x, y, pick(F, rnd(seed, x, y, 3), x, y));
  for (let t = 0; t < 16; t++) for (const k of [0, 1, 14, 15]) { frame(t, k); frame(k, t); }
  for (let t = 2; t < 14; t++) { frame(t, t); frame(t + 1, t); }
  bev(img, 0, 0, 16, 16, 0.1, -0.14);
  for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) dot(img, x, y, 0x2a2622);
  grime(img, seed + 4, 0.2, [50, 40, 28], 2, 0.6);
}
function crateMilitary(img, seed, top) {
  const O = pal(0x3a3f26, 0x43482b, 0x4c5130, 0x555a35, 0x5e633a);
  woodGrain(img, seed, O, !top ? false : true);
  for (const k of [5, 10]) for (let t = 0; t < 16; t++) { if (top) img.tone(k, t, -0.1); else img.tone(t, k, -0.1); }
  for (let t = 0; t < 16; t++) for (const k of [0, 15]) { img.tone(t, k, k ? -0.14 : 0.08); img.tone(k, t, k ? -0.14 : 0.08); }
  // corner brackets
  for (const [cx, cy] of [[0, 0], [13, 0], [0, 13], [13, 13]]) for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) img.set(cx + x, cy + y, hex(x + y === 0 ? 0x5a5c58 : 0x3a3c3a));
  // stencil
  const ST = hex(0xc8c2a0);
  const stencil = top
    ? ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.']
    : ['#.#.###.', '#.#.#...', '#.#.###.', '#.#...#.', '###.###.'];
  stencil.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#' && rnd(seed, i, j, 9) < 0.88) img.mix((top ? 5 : 4) + i, (top ? 4 : 5) + j, ST, 0.85); }));
  if (!top) for (let x = 3; x < 13; x++) if (rnd(seed, x, 12, 8) < 0.8) img.mix(x, 11, ST, 0.7);
  if (top) { img.set(7, 14, hex(0x1e1e1e)); img.set(8, 14, hex(0x2e2e2e)); img.set(7, 13, hex(0x5a5c58)); img.set(8, 13, hex(0x5a5c58)); }
  grime(img, seed + 4, 0.25, [40, 36, 24], 2, 0.55);
}
function cardboard(img, seed, top) {
  const C = pal(0x8a6a44, 0x96754c, 0xa28054, 0xad8b5d, 0xb69566);
  const wn = white(seed + 1);
  img.each((x, y) => img.set(x, y, pick(C, clamp01(0.5 + (wn[y * 16 + x] - 0.5) * 0.3 + ((x & 1) ? 0.05 : -0.05)), x, y, 0.4)));
  const tape = (x, y) => img.set(x, y, shade(hex(0xc2a46e), (y & 1) ? 0.04 : -0.02));
  if (top) {
    for (let y = 2; y < 14; y++) { tape(7, y); tape(8, y); img.tone(6, y, -0.08); }
    for (let x = 2; x < 14; x++) { img.tone(x, 2, -0.1); img.tone(x, 13, -0.1); }
    for (let y = 2; y < 14; y++) { img.tone(2, y, -0.08); img.tone(13, y, -0.12); }
  } else {
    // visible cols 2.4-13.6, rows 4.8-16
    for (let y = 5; y < 8; y++) { tape(7, y); tape(8, y); }
    for (let x = 2; x < 14; x++) { img.tone(x, 5, 0.08); img.tone(x, 15, -0.12); }
    for (let y = 5; y < 16; y++) { img.tone(2, y, 0.05); img.tone(13, y, -0.1); }
    // this-side-up arrows + label
    for (const ax of [4, 8]) { dot(img, ax, 8, 0x3a2818); dot(img, ax - 1, 9, 0x3a2818); dot(img, ax + 1, 9, 0x3a2818); dot(img, ax, 9, 0x3a2818); dot(img, ax, 10, 0x3a2818); dot(img, ax, 11, 0x3a2818); }
    for (let y = 11; y < 14; y++) for (let x = 10; x < 13; x++) img.set(x, y, hex(y === 11 ? 0xd8d4c8 : (x & 1) ? 0x8a8680 : 0xd0ccc0));
  }
  grime(img, seed + 4, 0.25, [70, 54, 36], 2, 0.55);
  img.disc(4, 13, 1.5, (x, y, d) => img.mix(x, y, [70, 50, 30], 0.3 * (1 - d / 1.7)));
}
function gunCabinet(img, seed) {
  woodGrain(img, seed, DARKWOOD, true);
  bev(img, 0, 0, 16, 16, 0.08, -0.14);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) img.set(x, y, hex(0x1c2620));
  const rifle = (x) => {
    for (let y = 2; y < 9; y++) img.set(x, y, hex(0x2a2c2e));
    img.set(x, 2, hex(0x4a4c4e));
    for (let y = 6; y < 9; y++) img.set(x + 1, y, hex(0x3a3c3e));
    for (let y = 9; y < 13; y++) { img.set(x, y, hex(0x6a4224)); img.set(x + 1, y, hex(0x5a361c)); }
    img.set(x + 1, 12, hex(0x4a2c16)); img.set(x, 13, hex(0x2a1a0e)); img.set(x + 1, 13, hex(0x2a1a0e));
  };
  rifle(4); rifle(7); rifle(10);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) { const d = (x + y) % 11; if (d === 1 || d === 2) img.mix(x, y, [150, 166, 170], 0.3); }
  bev(img, 2, 2, 12, 12, -0.15, 0.08);
  dot(img, 13, 7, 0xb0903e); dot(img, 13, 8, 0x5e4a1c);
}
function safeFront(img, seed) {
  const P = pal(0x26282a, 0x2c2e30, 0x323436, 0x383a3c, 0x3e4042);
  material(img, seed, P, 0.15, 0.15);
  bev(img, 0, 0, 16, 16, 0.12, -0.12);
  bev(img, 1, 1, 14, 14, -0.1, 0.08);
  // dial
  img.disc(6, 6.5, 3, (x, y, d) => img.set(x, y, d > 2.2 ? CHROME[1] : d > 1.2 ? hex(0x1a1a1c) : CHROME[2]));
  for (const [x, y] of [[6, 3], [9, 6], [3, 6], [6, 9]]) img.set(x, y, CHROME[3]);
  dot(img, 5, 5, 0xe0e4e6);
  // handle
  for (let x = 9; x < 14; x++) img.set(x, 10, CHROME[2]);
  img.set(11, 9, CHROME[3]); img.set(11, 11, CHROME[0]); img.set(11, 10, CHROME[1]);
  for (const y of [3, 12]) { img.set(1, y, CHROME[1]); img.set(1, y + 1, CHROME[0]); }
  for (let x = 4; x < 9; x++) { img.set(x, 12, BRASS[2]); img.set(x, 13, BRASS[1]); }
  dot(img, 5, 12, 0x5e4a1c); dot(img, 7, 12, 0x5e4a1c);
  for (let s = 0; s < 4; s++) img.mul(9 + s, 3 + s, 1.6);
}
function filingCabinet(img, seed) {
  material(img, seed, STEEL, 0.12, 0.15);
  for (const dy of [0, 4, 8, 12]) {
    bev(img, 0, dy, 16, 4, 0.1, -0.2);
    for (let x = 6; x < 10; x++) img.set(x, dy + 1, hex(0xd4d0c4));
    hbar(img, 6, 9, dy + 2);
  }
  const r = makeRng(seed + 2);
  img.mul(r.int(2, 13), r.int(5, 14), 0.8);
  streaks(img, seed + 3, 2, [110, 64, 34], 4, 0.3);
  grime(img, seed + 4, 0.18, [50, 46, 40], 2, 0.6);
}
function lockerFront(img, seed) {
  const P = pal(0x3e5660, 0x46606a, 0x4e6a74, 0x56747e, 0x5e7e88);
  material(img, seed, P, 0.12, 0.15);
  for (const lx of [0, 8]) {
    bev(img, lx, 0, 8, 16, 0.1, -0.2);
    for (const vy of [1, 3, 12, 14]) for (let x = lx + 2; x < lx + 6; x++) { img.set(x, vy, hex(0x1a2428)); img.tone(x, vy + 1, 0.06); }
    for (let x = lx + 2; x < lx + 5; x++) img.set(x, 6, hex(0xb4b8b0));
    dot(img, lx + 3, 6, 0x3a3a38);
    vbar(img, lx + 5, 8, 10);
  }
  const r = makeRng(seed + 2);
  for (let k = 0; k < 2; k++) { const x = r.int(1, 14), y = r.int(4, 14); img.mul(x, y, 0.8); img.mul(x, y + 1, 0.88); img.mul(x + 1, y, 1.08); }
  streaks(img, seed + 3, 2, [100, 60, 30], 4, 0.3);
}
function medicalCabinet(img, seed) {
  material(img, seed, APPL, 0.1, 0.12);
  bev(img, 0, 0, 16, 16, 0.08, -0.14);
  // glass upper doors with supplies
  for (let y = 1; y < 9; y++) for (let x = 1; x < 15; x++) img.set(x, y, hex(0x3a4448));
  for (let x = 1; x < 15; x++) img.set(x, 5, hex(0xa8a8a0));
  const r = makeRng(seed + 1);
  for (const y1 of [5, 9]) for (let x = 2; x < 14; x++) if (r.chance(0.7)) {
    const c = hex(r.pick([0xe0dcd2, 0x6a3a1e, 0x2e5a9a, 0xd0ccc0, 0xb03028]));
    const h = r.int(2, 3);
    for (let y = y1 - h; y < y1; y++) img.set(x, y, shade(c, y === y1 - h ? 0.1 : 0));
  }
  for (let y = 1; y < 9; y++) { img.set(7, y, hex(0xc0beb6)); img.set(8, y, hex(0x8e8c86)); }
  for (let y = 1; y < 9; y++) for (let x = 1; x < 15; x++) { const d = (x + y) % 9; if (d === 1) img.mix(x, y, [180, 196, 200], 0.3); }
  // lower doors
  for (let x = 0; x < 16; x++) img.set(x, 9, hex(0x8a8880));
  bev(img, 1, 10, 7, 5, 0.06, -0.12); bev(img, 8, 10, 7, 5, 0.06, -0.12);
  hbar(img, 6, 6, 11); hbar(img, 9, 9, 11);
  for (const [x, y] of [[3, 11], [2, 12], [3, 12], [4, 12], [3, 13]]) dot(img, x, y, 0xb83028);
  grime(img, seed + 3, 0.15, [110, 100, 80], 2, 0.6);
}
function barFront(img, seed) {
  woodGrain(img, seed, MAHOG, true);
  for (const px of [1, 9]) { inset(img, px, 1, 6, 9, 0.12); bev(img, px + 1, 2, 4, 7, 0.08, -0.1); }
  for (let x = 0; x < 16; x++) {
    img.set(x, 12, BRASS[3]); img.set(x, 13, BRASS[1]);
    img.set(x, 14, hex(0x1e100c)); img.set(x, 15, hex(0x160c08));
  }
  for (const bx of [3, 12]) { img.set(bx, 11, BRASS[2]); }
  grime(img, seed + 3, 0.15, [24, 16, 10], 2, 0.6);
}
function chalkboard(img, seed) {
  const G = pal(0x26332c, 0x2c3a32, 0x324038, 0x38463e);
  material(img, seed, G, 0.12, 0.3);
  const W = hex(0xc8ccc0);
  // tally of days survived
  for (let k = 0; k < 4; k++) for (let y = 2; y < 7; y++) if (rnd(seed, k, y, 1) < 0.92) img.mix(2 + k * 2, y, W, 0.8);
  for (let s = 0; s < 8; s++) img.mix(1 + s, 6 - Math.floor(s * 0.6), W, 0.7);
  for (const k of [11, 13]) for (let y = 2; y < 7; y++) if (rnd(seed, k, y, 2) < 0.92) img.mix(k, y, W, 0.8);
  // scribbled note lines
  for (const [y, x0, x1] of [[9, 2, 12], [11, 2, 9], [12, 10, 13]]) for (let x = x0; x <= x1; x++) if (rnd(seed, x, y, 4) < 0.7) img.mix(x, y + ((x & 3) === 1 ? -1 : 0), W, 0.55);
  // smudges
  grime(img, seed + 5, 0.15, [120, 128, 120], 3, 0.55);
  // frame & tray
  const F = pal(0x5a4028, 0x6a4c30, 0x7a5838);
  for (let t = 0; t < 16; t++) { img.set(t, 0, F[2]); img.set(0, t, F[1]); img.set(15, t, F[0]); img.set(t, 15, F[0]); img.set(t, 14, F[1]); }
  dot(img, 4, 13, 0xe0e0d8); dot(img, 5, 13, 0xd0d0c8); dot(img, 11, 13, 0xc8c4b8);
}

// ---------------------------------------------------------------------------
export const FURNITURE = {
  fridge_front(img, { seed }) { fridgeFront(img, seed); },
  freezer_front(img, { seed }) { freezerFront(img, seed); },
  metal_white(img, { seed }) {
    material(img, seed, APPL, 0.12, 0.2);
    const r = makeRng(seed + 2);
    for (let s = 0; s < 4; s++) img.mul(r.int(1, 14), r.int(1, 14), 0.92);
    streaks(img, seed + 3, 2, [130, 90, 50], 4, 0.2);
    grime(img, seed + 4, 0.15, [120, 106, 80], 2, 0.6);
  },
  metal_grey(img, { seed }) {
    material(img, seed, STEEL, 0.12, 0.2);
    const r = makeRng(seed + 2);
    for (let k = 0; k < 2; k++) { const x = r.int(0, 12), y = r.int(0, 15); for (let s = 0; s < 4; s++) img.mul(x + s, y + (s >> 1), 1.18); }
    streaks(img, seed + 3, 3, [110, 64, 34], 5, 0.28);
    grime(img, seed + 4, 0.15, [50, 46, 40], 2, 0.6);
  },
  stove_front(img, { seed }) { stoveFront(img, seed); },
  stove_top(img, { seed }) { stoveTop(img, seed); },
  washer_front(img, { seed }) { washerFront(img, seed); },
  washer_top(img, { seed }) {
    material(img, seed, APPL, 0.1, 0.15);
    bev(img, 1, 1, 14, 9, -0.06, 0.05);
    for (let x = 3; x < 7; x++) { img.set(x, 12, hex(0x9a968a)); img.set(x, 13, hex(0x8a867a)); }
    img.disc(11, 12.5, 1.6, (x, y, d) => img.mix(x, y, [96, 110, 150], 0.25));
    grime(img, seed + 3, 0.15, [110, 100, 80], 2, 0.6);
  },
  cabinet_front(img, { seed }) { cabinetFront(img, seed); },
  cabinet_side(img, { seed }) {
    woodGrain(img, seed, OAK, true);
    for (let x = 0; x < 16; x++) img.tone(x, 15, -0.14);
    grime(img, seed + 3, 0.15, [50, 36, 24], 2, 0.6);
  },
  counter_top(img, { seed }) { counterTop(img, seed, false); },
  counter_wood_top(img, { seed }) { counterTop(img, seed, true); },
  sink_top(img, { seed }) { sinkTop(img, seed); },
  table_top(img, { seed }) { tableTop(img, seed); },
  couch(img, { seed }) { couch(img, seed, hex(0x6e5236)); },
  couch_blue(img, { seed }) { couch(img, seed, hex(0x3e5070)); },
  bed_head_top(img) { bedHeadTop(img, seedFromString('bed_quilt')); },
  bed_foot_top(img) { bedFootTop(img, seedFromString('bed_quilt')); },
  bed_side(img) { bedSide(img, seedFromString('bed_quilt')); },
  hospital_bed_top(img, { seed }) { hospitalBedTop(img, seed); },
  hospital_bed_side(img, { seed }) { hospitalBedSide(img, seed); },
  wardrobe_front(img, { seed }) { wardrobeFront(img, seed); },
  dresser_front(img, { seed }) { dresserFront(img, seed); },
  bookshelf_front(img, { seed }) { bookshelf(img, seed); },
  desk_front(img, { seed }) { deskFront(img, seed); },
  desk_top(img, { seed }) { deskTop(img, seed); },
  tv_front(img, { seed }) { tvFront(img, seed); },
  tv_side(img, { seed }) { plasticVents(img, seed, pal(0x2a2826, 0x302e2b, 0x363430, 0x3c3a36)); },
  toilet(img, { seed }) { porcelain(img, seed); },
  ceramic(img, { seed }) { porcelain(img, seed, hex(0xd2d2cb)); },
  bathtub_top(img, { seed }) { bathtubTop(img, seed); },
  medicine_cabinet_front(img, { seed }) { mirrorCabinet(img, seed); },
  workbench_top(img, { seed }) { workbenchTop(img, seed); },
  workbench_side(img, { seed }) { workbenchSide(img, seed); },
  metal_shelf(img, { seed }) { metalShelfFront(img, seed); },
  metal_shelf_side(img, { seed }) { metalShelfSide(img, seed); },
  toolbox(img, { seed }) { toolboxSide(img, seed); },
  toolbox_top(img, { seed }) { toolboxTop(img, seed); },
  gun_cabinet_front(img, { seed }) { gunCabinet(img, seed); },
  safe_front(img, { seed }) { safeFront(img, seed); },
  safe_side(img, { seed }) {
    material(img, seed, pal(0x26282a, 0x2c2e30, 0x323436, 0x383a3c, 0x3e4042), 0.15, 0.15);
    bev(img, 0, 0, 16, 16, 0.12, -0.12);
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) { img.set(x, y, hex(0x5a5c5e)); img.set(x + 1, y + 1, hex(0x18181a)); }
  },
  store_shelf_food(img, { seed }) { shelfFrame(img, seed); shelfItems(img, seed, [CAN, CAN, BOX, JAR, BOX], 0.92); grime(img, seed + 3, 0.12, [50, 44, 36], 2, 0.6); },
  store_shelf_misc(img, { seed }) { shelfFrame(img, seed); shelfItems(img, seed, [BOTTLE, ROLL, BOX, BOTTLE], 0.9); grime(img, seed + 3, 0.12, [50, 44, 36], 2, 0.6); },
  store_shelf_meds(img, { seed }) { shelfFrame(img, seed); shelfItems(img, seed, [PILLS, MEDBOX, MEDBOX, PILLS, MEDBOX], 0.9); grime(img, seed + 3, 0.12, [50, 44, 36], 2, 0.6); },
  store_shelf_empty(img, { seed }) {
    shelfFrame(img, seed);
    shelfItems(img, seed, [CAN, BOX], 0.12);
    const r = makeRng(seed + 2);
    // toppled can, torn cardboard, debris on the shelf lips
    for (const y1 of [5, 10, 15]) for (let x = 1; x < 15; x++) if (r.chance(0.16)) img.set(x, y1 - 1, hex(r.pick([0x8a6a44, 0xd0ccc0, 0x6a6660, 0xa83228])));
    for (let x = 4; x < 7; x++) img.set(x, 9, hex(0xa83228)); img.set(4, 8, hex(0xb4b8ba));
    for (let x = 9; x < 13; x++) img.set(x, 14, hex(x & 1 ? 0x96754c : 0x8a6a44)); img.set(10, 13, hex(0xa28054));
    grime(img, seed + 3, 0.25, [60, 52, 40], 2, 0.5);
  },
  cooler_front(img, { seed }) { cooler(img, seed); },
  checkout_front(img, { seed }) { checkoutFront(img, seed); },
  cash_register(img, { seed }) { registerFront(img, seed); },
  cash_register_top(img, { seed }) { registerTop(img, seed); },
  radio_front(img, { seed }) { radioFront(img, seed); },
  clothing_rack(img, { seed }) { clothingRack(img, seed); },
  filing_cabinet(img, { seed }) { filingCabinet(img, seed); },
  locker_front(img, { seed }) { lockerFront(img, seed); },
  medical_cabinet_front(img, { seed }) { medicalCabinet(img, seed); },
  crate_wood(img, { seed }) { crateWood(img, seed); },
  crate_military(img, { seed }) { crateMilitary(img, seed, false); },
  crate_military_top(img, { seed }) { crateMilitary(img, seed, true); },
  cardboard_box(img, { seed }) { cardboard(img, seed, false); },
  cardboard_top(img, { seed }) { cardboard(img, seed, true); },
  bar_counter_front(img, { seed }) { barFront(img, seed); },
  chalkboard(img, { seed }) { chalkboard(img, seed); },
};
export { material, woodGrain, bev, inset, hbar, vbar, knob, CHROME, BRASS, APPL, STEEL };
