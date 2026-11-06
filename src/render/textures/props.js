// Outdoor props: fences, military defences, street furniture, barrels, camp & fire, vending / gas pumps.
// Many sit on 'boxes' shapes that only show part of the texture (noted per generator).
import {
  Img, pal, hex, mix, shade, ramp, desat, fbm, white, vnoise, worley, eq, combine, pick, paint, grain, grime, streaks,
  speckle, crack, walk, leafBit, rnd, makeRng, smooth, clamp01, seedFromString,
} from './core.js';
import { CONCRETE, concreteBase, planks } from './building.js';
import { material, woodGrain, bev, inset, hbar, vbar, knob, CHROME } from './furniture.js';
import { LEAF_LITTER } from './nature.js';

const dot = (img, x, y, c, a = 255) => img.set(x, y, hex(c), a);
const GALV = pal(0x6a6e70, 0x777b7d, 0x84888a, 0x919597, 0x9ea2a4);
const RUST = pal(0x4e2a16, 0x643620, 0x7a4428, 0x8e5230, 0xa0623a);

// ---------------------------------------------------------------------------
// fences & defences
function picketFence(img, seed) {
  img.fill([0, 0, 0], 0);
  const P = pal(0x9e9a90, 0xaeaaa0, 0xbcb8ae, 0xc8c4ba, 0xd2cec4);
  const rail = pal(0x6e6a62, 0x7c786e);
  for (const ry of [3, 4, 11, 12]) for (let x = 0; x < 16; x++) img.set(x, ry, rail[ry & 1], 255);
  for (let k = 0; k < 4; k++) {
    const x0 = k * 4;
    for (let y = 0; y < 16; y++) for (let c = 0; c < 3; c++) {
      if (y === 0 && c !== 1) continue;
      let v = c === 0 ? 0.85 : c === 1 ? 0.6 : 0.25;
      v += (rnd(seed, x0 + c, y, 1) - 0.5) * 0.12;
      let col = pick(P, clamp01(v), x0 + c, y, 0.3);
      if (rnd(seed, x0 + c, y, 2) < 0.035) col = hex(0x7a7266);
      img.set(x0 + c, y, col, 255);
    }
  }
  for (let y = 12; y < 16; y++) for (let x = 0; x < 16; x++) if (img.alpha(x, y)) img.mix(x, y, [96, 80, 60], (y - 11) * 0.08);
  streaks(img, seed + 3, 3, [110, 100, 86], 6, 0.2);
}
function privacyFence(img, seed) {
  img.fill([0, 0, 0], 0);
  const P = pal(0x625646, 0x6e6150, 0x7a6c5a, 0x867764, 0x92826e, 0x9c8c78);
  const g = vnoise(seed, 16, 2);
  for (const ry of [2, 3, 12, 13]) for (let x = 0; x < 16; x++) img.set(x, ry, hex(ry & 1 ? 0x3e3428 : 0x4e4234), 255);
  for (let k = 0; k < 4; k++) {
    const x0 = k * 4;
    const broken = k === 2;
    const tone = (rnd(seed, k, 0, 3) - 0.5) * 0.3;
    for (let y = 0; y < 16; y++) for (let c = 0; c < 3; c++) {
      if (y === 0 && c !== 1) continue; // dog-ear top
      if (broken && y < 3 + ((c * 2 + 1) % 3)) continue; // snapped board
      const i = y * 16 + x0 + c;
      let v = 0.45 + tone + (g[i] - 0.5) * 0.6 + (c === 0 ? 0.15 : c === 2 ? -0.2 : 0);
      img.set(x0 + c, y, pick(P, clamp01(v), x0 + c, y, 0.4), 255);
    }
    img.set(x0 + 1, 3, hex(0x2a2620), 255); img.set(x0 + 1, 12, hex(0x2a2620), 255);
  }
  grime(img, seed + 2, 0.2, [50, 54, 40], 2, 0.6);
}
function chainlink(img, seed) {
  img.fill([0, 0, 0], 0);
  img.each((x, y) => {
    const a = ((x + y) & 3) === 0, b = ((x - y) & 3) === 0;
    if (!a && !b) return;
    let c = a && b ? GALV[4] : a ? GALV[2] : GALV[0];
    if (rnd(seed, x, y, 1) < 0.05) c = RUST[2];
    img.set(x, y, c, 255);
  });
  // a few leaves / litter caught in the mesh
  const r = makeRng(seed + 3);
  for (let k = 0; k < 2; k++) { const x = r.int(0, 15), y = r.int(9, 15); img.set(x, y, hex(r.pick(LEAF_LITTER)), 255); img.set(x + 1, y, hex(r.pick(LEAF_LITTER)), 255); }
}
function barbedWire(img, seed) {
  img.fill([0, 0, 0], 0);
  const W = pal(0x3a3632, 0x5a5650, 0x7a766e, 0x7a4a2a);
  const put = (x, y, c) => { if (y >= 0 && y < 16) img.set(x, y, c, 255); };
  // three sagging strands with barbs every 4px, plus a loose coil loop
  [[3, 0, 1.2], [8, 2, 1.6], [13, 1, 1.0]].forEach(([y0, off, sag]) => {
    for (let x = 0; x < 16; x++) {
      const y = Math.round(y0 + Math.sin((x / 16) * Math.PI * 2 + off) * sag);
      put(x, y, (x + off) & 1 ? W[1] : W[2]);
      if (((x + off * 2) & 3) === 0) { put(x - 1, y - 1, W[0]); put(x + 1, y + 1, W[3]); put(x + 1, y - 1, W[0]); put(x - 1, y + 1, W[3]); }
    }
  });
  for (let t = 0; t < 40; t++) {
    const a = (t / 40) * Math.PI * 2;
    put(Math.round(9 + Math.cos(a) * 4), Math.round(8 + Math.sin(a) * 5), a > Math.PI ? W[1] : W[2]);
  }
}
function sandbags(img, seed) {
  const P = pal(0x625a40, 0x6e664a, 0x7a7254, 0x867e5e, 0x928a68, 0x9c9472);
  const wn = white(seed + 1);
  img.each((x, y) => {
    const row = y >> 2, by = y & 3;
    const bx = (x + (row & 1) * 4) & 7;
    const id = row * 2 + (((x + (row & 1) * 4) & 15) >> 3);
    const corner = (bx === 0 || bx === 7) && (by === 0 || by === 3);
    if (corner) { img.set(x, y, hex(0x2e2a1e)); return; }
    let v = 0.5 + (rnd(seed, id, 0, 3) - 0.5) * 0.4 + (wn[y * 16 + x] - 0.5) * 0.25 + ((x + y) & 1 ? 0.05 : -0.05);
    if (by === 0) v += 0.25; if (by === 3) v -= 0.35;
    if (bx === 0) v += 0.1; if (bx === 7) v -= 0.25;
    if (bx === 6 && (by === 1 || by === 2)) v -= 0.2; // tied end
    if (rnd(seed, id, 1, 4) < 0.2) v -= 0.25; // wet bag
    img.set(x, y, pick(P, clamp01(v), x, y, 0.4));
  });
  grime(img, seed + 2, 0.2, [60, 50, 34], 2, 0.6);
}
function hescoSide(img, seed) {
  const P = pal(0x7e7258, 0x897d62, 0x94886c, 0x9f9376, 0xa89c80);
  const f = fbm(seed, 2, 2, 2), wn = white(seed + 1);
  img.each((x, y) => {
    const bulge = Math.sin(((x & 3) + 0.5) / 4 * Math.PI) * 0.15 + Math.sin(((y & 3) + 0.5) / 4 * Math.PI) * 0.1;
    img.set(x, y, pick(P, clamp01(0.4 + bulge + (f[y * 16 + x] - 0.5) * 0.4 + (wn[y * 16 + x] - 0.5) * 0.2), x, y, 0.4));
  });
  img.each((x, y) => {
    if ((x & 3) === 0 || (y & 3) === 0) {
      let c = (x & 3) === 0 && (y & 3) === 0 ? GALV[4] : (x & 3) === 0 ? GALV[2] : GALV[3];
      if (rnd(seed, x, y, 2) < 0.08) c = RUST[2];
      img.set(x, y, c);
    }
  });
  for (let y = 0; y < 16; y++) if (y & 1) img.set(0, y, GALV[1]);
  grime(img, seed + 3, 0.2, [80, 70, 50], 2, 0.55);
}
function hescoTop(img, seed) {
  const P = pal(0x6e5c40, 0x7a6748, 0x867250, 0x927d58, 0x9c8862);
  paint(img, P, eq(combine(fbm(seed, 3, 3, 2), 0.5, white(seed + 1), 0.5)), 0.6);
  speckle(img, seed + 2, 0.06, pal(0x8a8478, 0x6a6458, 0x5a4a34));
  for (let t = 0; t < 16; t++) {
    for (const k of [0, 15]) { img.set(t, k, (t & 3) === 0 ? GALV[4] : GALV[2]); img.set(k, t, (t & 3) === 0 ? GALV[4] : GALV[2]); }
    for (const k of [1, 14]) { img.set(t, k, hex(0x9a8e72)); img.set(k, t, hex(0x9a8e72)); }
  }
  const r = makeRng(seed + 3);
  for (let k = 0; k < 3; k++) { const x = r.int(3, 12), y = r.int(3, 12); dot(img, x, y, 0x55602e); dot(img, x + 1, y, 0x4a5528); dot(img, x, y - 1, 0x6a7238); }
}

// ---------------------------------------------------------------------------
// street furniture
function jersey(img, seed) {
  concreteBase(img, seed, pal(0x7e7d78, 0x868580, 0x8e8d88, 0x969590, 0x9e9d98));
  for (let x = 0; x < 16; x++) {
    img.tone(x, 1, 0.08); img.tone(x, 2, 0.04);
    img.tone(x, 10, -0.12); img.tone(x, 11, 0.06);
  }
  // amber reflector + faded orange survey paint
  for (let y = 4; y < 6; y++) for (let x = 7; x < 9; x++) dot(img, x, y, y === 4 ? 0xd8902a : 0xa86418);
  for (const [x, y] of [[3, 7], [4, 7], [5, 8], [12, 6], [12, 7], [12, 8]]) img.mix(x, y, [200, 100, 40], 0.45);
  const r = makeRng(seed + 2);
  for (let k = 0; k < 3; k++) { const x = r.int(0, 15), y = r.pick([1, 10, 11]); img.mul(x, y, 0.75); img.mul(x + 1, y, 0.85); }
  crack(img, r, r.int(2, 13), 11, 4, 0.3, 1, { dark: 0.7 });
  for (let y = 13; y < 16; y++) for (let x = 0; x < 16; x++) img.mix(x, y, [70, 60, 46], (y - 12) * 0.08 * (0.5 + rnd(seed, x, y, 5)));
  streaks(img, seed + 3, 3, [60, 56, 50], 6, 0.2);
}
function guardrail(img, seed) {
  material(img, seed, GALV, 0.12, 0.2);
  // W-beam profile on rows 4-10
  const prof = { 4: -0.2, 5: 0.12, 6: 0.04, 7: -0.14, 8: 0.12, 9: 0.03, 10: -0.22 };
  for (let x = 0; x < 16; x++) for (const [y, k] of Object.entries(prof)) img.tone(x, +y, k);
  for (const bx of [3, 12]) { dot(img, bx, 7, 0x3a3e40); dot(img, bx, 6, 0xb4b8ba); }
  // post below the rail
  for (let y = 11; y < 16; y++) for (let x = 6; x < 10; x++) img.set(x, y, pick(GALV, x === 6 ? 0.8 : x === 9 ? 0.1 : 0.45, x, y));
  streaks(img, seed + 2, 4, [112, 64, 34], 5, 0.35);
  grime(img, seed + 3, 0.2, [60, 54, 44], 2, 0.6);
}
function trafficCone(img, seed) {
  const O = pal(0x9a3812, 0xb24416, 0xc8521c, 0xd86426, 0xe07832);
  material(img, seed, O, 0.12, 0.15);
  // cone body cols 6-9: highlight left, shadow right
  for (let y = 0; y < 14; y++) { img.tone(6, y, 0.06); img.tone(9, y, -0.1); }
  for (let x = 6; x < 10; x++) for (const y of [10, 11]) dot(img, x, y, x === 9 ? 0xb0aea4 : y === 10 ? 0xe2e0d6 : 0xcfcdc3);
  // base (rows 14-15 + ring around the cone on the base top)
  for (let y = 14; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, shade(O[0], y === 14 ? 0.02 : -0.1));
  for (let y = 4; y < 12; y++) for (const x of [4, 5, 10, 11]) img.set(x, y, shade(O[1], -0.04));
  grime(img, seed + 2, 0.3, [60, 50, 40], 2, 0.5);
}
function metalPole(img, seed) {
  material(img, seed, GALV, 0.1, 0.15);
  for (let y = 0; y < 16; y++) { img.tone(6, y, -0.1); img.tone(7, y, 0.1); img.tone(8, y, 0.03); img.tone(9, y, -0.12); }
  for (const by of [5, 13]) for (let x = 0; x < 16; x++) { img.tone(x, by, 0.06); img.tone(x, by + 1, -0.1); }
  streaks(img, seed + 2, 3, [112, 64, 34], 5, 0.3);
  // stickers / tape remnants on the pole
  dot(img, 7, 9, 0xd0ccc0); dot(img, 8, 9, 0xc8c4b8); dot(img, 7, 10, 0xb8b4a8);
}
function streetLampBottom(img, seed) {
  material(img, seed, pal(0x2e3430, 0x353b37, 0x3c423e, 0x434945), 0.1, 0.15);
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) {
    const e = x === 4 || x === 11 || y === 4 || y === 11;
    if (e) { dot(img, x, y, 0x5a605c); continue; }
    let c = mix(hex(0xb4b090), hex(0xd0ccb0), rnd(seed, x, y, 2));
    if (x === 5 || y === 5) c = shade(c, 0.05);
    img.set(x, y, c);
  }
  for (const [x, y] of [[7, 7], [9, 8], [6, 9]]) dot(img, x, y, 0x3a3428);
  for (const [x, y] of [[8, 5], [9, 6], [9, 7]]) dot(img, x, y, 0x7a7660);
}
function utilityPole(img, seed) {
  const P = pal(0x2c2018, 0x34261c, 0x3d2d21, 0x463426, 0x503c2c, 0x5a4432);
  woodGrain(img, seed, P, true);
  for (let y = 0; y < 16; y++) { img.tone(5, y, -0.08); img.tone(6, y, 0.05); img.tone(7, y, 0.06); img.tone(10, y, -0.1); }
  // staples, aluminium tag, torn flyer
  for (const [x, y] of [[6, 2], [9, 4], [7, 12], [8, 13], [9, 6]]) { dot(img, x, y, 0x9a9a96); dot(img, x + 1, y, 0x6a6a66); }
  for (let x = 7; x < 10; x++) dot(img, x, 1, x === 7 ? 0xc8cccc : 0xa8acac);
  for (let y = 7; y < 11; y++) for (let x = 6; x < 10; x++) if (!(y === 10 && x === 9)) dot(img, x, y, (y === 8 || y === 10) && x > 6 && x < 9 ? 0x6a665a : y === 7 ? 0xd8c870 : 0xd0cc9a);
}
function trafficLight(img, seed) {
  // visible cols 4.8-11.2
  const H = pal(0x23261f, 0x2a2d25, 0x31342b, 0x383b31);
  material(img, seed, H, 0.1, 0.15);
  for (let y = 0; y < 16; y++) { img.tone(5, y, 0.06); img.tone(10, y, -0.08); }
  const lamps = [[2.6, 0x521a14, 0x8a3226], [7.8, 0x4e3a12, 0x8a6a24], [13, 0x163a2a, 0x2e6a4a]];
  for (const [cy, dark, lite] of lamps) {
    img.disc(8, cy, 2.3, (x, y, d) => {
      let c = mix(hex(dark), hex(lite), clamp01(1 - d / 2.3) * 0.5);
      if (x === 7 && Math.floor(y) === Math.floor(cy - 1)) c = mix(c, hex(0xc8c8b8), 0.4);
      img.set(x, y, c);
    });
    for (let x = 5; x < 11; x++) dot(img, x, Math.floor(cy - 2.6), 0x151712);
  }
  grime(img, seed + 2, 0.15, [70, 66, 50], 2, 0.6);
}
function stopSign(img, seed) {
  // visible: octagon area cols 2.4-13.6 rows 0-8, post cols 7-8 rows 8-16. Back of the sign is grey metal.
  material(img, seed, GALV, 0.1, 0.15);
  for (let y = 8; y < 16; y++) { img.tone(7, y, 0.08); img.tone(8, y, -0.08); }
  const rows = [[5, 10], [4, 11], [3, 12], [3, 12], [3, 12], [3, 12], [4, 11], [5, 10]];
  rows.forEach(([a, b], y) => {
    for (let x = a; x <= b; x++) {
      const edge = x === a || x === b || y === 0 || y === 7;
      img.set(x, y, edge ? shade(hex(0xd8d4c8), (rnd(seed, x, y, 1) - 0.5) * 0.06) : shade(hex(0xa82a22), (rnd(seed, x, y, 2) - 0.5) * 0.1));
    }
  });
  // "STOP": at this size only a broken white word band reads (letters are 1-2px)
  for (let x = 5; x <= 10; x++) for (const y of [3, 4]) dot(img, x, y, 0xe8e4d8);
  for (const [x, y] of [[6, 4], [7, 3], [9, 4], [9, 3]]) dot(img, x, y, 0xb83a30);
  // fade, bullet holes, rust
  grime(img, seed + 3, 0.15, [120, 110, 96], 2, 0.6);
  dot(img, 10, 5, 0x1a1412); dot(img, 11, 5, 0x6a3a20);
  streaks(img, seed + 4, 2, [110, 64, 34], 4, 0.3);
}
function mailbox(img, seed) {
  const B = pal(0x22385a, 0x2a4266, 0x324c72, 0x3a567c, 0x446086);
  material(img, seed, B, 0.1, 0.18);
  // rounded box top shading (visible on the top face cols 4-12)
  for (let y = 0; y < 16; y++) { img.tone(4, y, -0.08); img.tone(5, y, -0.03); img.tone(7, y, 0.06); img.tone(8, y, 0.05); img.tone(11, y, -0.08); }
  // door + latch on the box front (rows 14-15 + 0-3)
  for (let x = 4; x < 12; x++) { dot(img, x, 14, 0x1c2c48); }
  for (const y of [1, 2]) { dot(img, 7, y, 0xb4b8ba); dot(img, 8, y, 0x7e8284); }
  // red flag on the side
  for (let y = 0; y < 3; y++) for (let x = 2; x < 4; x++) dot(img, x, y, y === 0 ? 0xb83228 : 0x8a2420);
  // peeling paint + rust
  speckle(img, seed + 2, 0.04, pal(0x7a7e80, 0x6e4a2e));
  streaks(img, seed + 3, 3, [110, 64, 34], 5, 0.3);
}
function fireHydrant(img, seed) {
  const R = pal(0x6a1610, 0x821e16, 0x98281c, 0xac3224, 0xbc3e2c);
  material(img, seed, R, 0.1, 0.2);
  for (let y = 0; y < 16; y++) { img.tone(5, y, 0.06); img.tone(6, y, 0.08); img.tone(10, y, -0.12); }
  // bonnet + flange bands
  for (let x = 0; x < 16; x++) { img.tone(x, 4, 0.1); img.tone(x, 6, -0.16); img.tone(x, 13, 0.08); img.tone(x, 14, -0.12); }
  // nozzle caps at the ends of the side outlet (cols 3-4 / 11-12, rows 7-9)
  for (let y = 7; y < 10; y++) for (const x of [3, 4, 11, 12]) dot(img, x, y, x === 3 || x === 12 ? 0x8a8e90 : 0xa6aaac);
  dot(img, 7, 8, 0xb4b8ba); dot(img, 8, 8, 0x8a8e90);
  for (const x of [5, 7, 9]) dot(img, x, 14, 0x3a3e40);
  // top nut (seen from above cols 7-8 rows 7-8)
  dot(img, 7, 7, 0xa6aaac); dot(img, 8, 7, 0x8a8e90); dot(img, 7, 8, 0x8a8e90); dot(img, 8, 8, 0x6a6e70);
  speckle(img, seed + 2, 0.05, pal(0x7a7e80, 0xc8c4b8, 0x5a3420));
  streaks(img, seed + 3, 2, [80, 50, 30], 5, 0.3);
}
function trashCan(img, seed) {
  material(img, seed, GALV, 0.12, 0.2);
  for (let y = 0; y < 16; y++) for (let x = 1; x < 15; x++) if ((x & 1) === 0) img.tone(x, y, 0.05); else img.tone(x, y, -0.04);
  for (let x = 0; x < 16; x++) { img.tone(x, 0, 0.1); img.tone(x, 1, -0.16); for (const by of [5, 11]) { img.tone(x, by, 0.12); img.tone(x, by + 1, -0.14); } }
  for (let x = 6; x < 10; x++) dot(img, x, 3, 0x4a4e50);
  const r = makeRng(seed + 2);
  for (let k = 0; k < 2; k++) { const x = r.int(2, 13), y = r.int(6, 14); img.mul(x, y, 0.8); img.mul(x + 1, y + 1, 0.85); img.mul(x - 1, y - 1, 1.1); }
  streaks(img, seed + 3, 3, [100, 60, 32], 6, 0.3);
  for (let y = 13; y < 16; y++) for (let x = 0; x < 16; x++) img.mix(x, y, [60, 50, 36], (y - 12) * 0.08);
}
function trashCanTop(img, seed) {
  material(img, seed, GALV, 0.1, 0.2);
  img.each((x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 5.5) img.tone(x, y, d > 6 ? -0.14 : 0.08);
    else if (Math.round(d) === 4) img.tone(x, y, -0.08);
    else if (Math.round(d) === 3) img.tone(x, y, 0.06);
  });
  for (let x = 6; x < 10; x++) { dot(img, x, 7, 0xb4b8ba); dot(img, x, 8, 0x55595b); }
  streaks(img, seed + 3, 2, [100, 60, 32], 3, 0.3);
  leafBit(img, 4, 10, hex(0x8e5a2c), makeRng(seed));
}
function dumpster(img, seed) {
  const G = pal(0x1e2e22, 0x243628, 0x2a3e2e, 0x304634, 0x364e3a);
  material(img, seed, G, 0.12, 0.2);
  for (let x = 0; x < 16; x++) { img.tone(x, 0, 0.1); img.tone(x, 1, -0.1); for (const by of [3, 12]) { img.tone(x, by, 0.08); img.tone(x, by + 1, -0.12); } }
  for (let y = 0; y < 16; y++) for (const x of [0, 8]) { img.tone(x, y, 0.06); img.tone(x + 1, y, -0.08); }
  // stencil + stickers
  for (const [x, y] of [[3, 7], [4, 7], [5, 7], [3, 8], [5, 8], [3, 9], [4, 9], [5, 9]]) img.mix(x, y, [200, 196, 180], 0.55);
  for (let y = 6; y < 9; y++) for (let x = 10; x < 14; x++) dot(img, x, y, y === 6 ? 0xc8a030 : 0xd0ccc0);
  speckle(img, seed + 2, 0.04, pal(0x5a3420, 0x7a4426));
  streaks(img, seed + 3, 6, [110, 64, 34], 8, 0.4);
  grime(img, seed + 4, 0.3, [40, 36, 26], 2, 0.5);
}
function dumpsterTop(img, seed) {
  const G = pal(0x1a221c, 0x1f2820, 0x242e25, 0x29342a);
  material(img, seed, G, 0.12, 0.15);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((y & 3) === 2) img.tone(x, y, -0.06);
  for (let y = 0; y < 16; y++) { img.set(7, y, hex(0x0e120e)); img.tone(8, y, 0.06); }
  for (let x = 0; x < 16; x++) { img.set(x, 0, hex(0x5a5e5c)); img.set(x, 1, hex(0x3a3e3c)); }
  for (const hx of [2, 12]) { dot(img, hx, 1, 0x8a8e8c); dot(img, hx + 1, 1, 0x6a6e6c); }
  const r = makeRng(seed + 2);
  for (let k = 0; k < 4; k++) leafBit(img, r.int(0, 15), r.int(2, 15), hex(r.pick(LEAF_LITTER)), r);
  grime(img, seed + 3, 0.25, [70, 66, 50], 2, 0.55);
}
function vendingFront(img, seed) {
  const R = pal(0x6a1a16, 0x7a201a, 0x8a261e, 0x982c22, 0xa63428);
  material(img, seed, R, 0.1, 0.15);
  // display window with a faded soda graphic
  for (let y = 1; y < 11; y++) for (let x = 1; x < 10; x++) {
    let c = mix(hex(0x1e2428), hex(0x2c3438), (y - 1) / 10);
    const bottle = x >= 4 && x <= 6 && y >= 3 && (y > 4 || x === 5);
    if (bottle) c = mix(c, hex(y < 5 ? 0x8a8a80 : 0x9a3a30), 0.55);
    if (y === 8 || (y === 7 && (x & 1))) c = mix(c, hex(0xc8c4b8), 0.35);
    if (x + y === 6 || x + y === 7) c = mix(c, hex(0x8a9a9e), 0.3);
    img.set(x, y, c);
  }
  inset(img, 1, 1, 9, 10, 0.1);
  for (const [x, y] of [[7, 3], [8, 4], [7, 5], [8, 6]]) img.mix(x, y, [210, 220, 222], 0.5); // crack
  // selection buttons, coin slot, bill acceptor
  for (let k = 0; k < 6; k++) { const x = 11 + (k & 1) * 2, y = 2 + (k >> 1) * 2; dot(img, x, y, 0xd8d4c8); dot(img, x + 1, y, 0x9a968a); }
  dot(img, 12, 8, 0xb4b8ba); dot(img, 12, 9, 0x2a2a2a); dot(img, 13, 8, 0x7e8284);
  for (let x = 11; x < 14; x++) dot(img, x, 10, 0x1a1a1a);
  // dispensing flap
  for (let y = 12; y < 15; y++) for (let x = 2; x < 10; x++) dot(img, x, y, y === 12 ? 0x3a3a3a : 0x141414);
  for (let x = 0; x < 16; x++) dot(img, x, 15, 0x2a0c0a);
  bev(img, 0, 0, 16, 16, 0.06, -0.12);
  grime(img, seed + 2, 0.2, [50, 40, 34], 2, 0.6);
  streaks(img, seed + 3, 2, [110, 64, 34], 5, 0.3);
}
function vendingSide(img, seed) {
  const R = pal(0x6a1a16, 0x7a201a, 0x8a261e, 0x982c22, 0xa63428);
  material(img, seed, R, 0.1, 0.15);
  for (let x = 0; x < 16; x++) {
    const y = Math.round(8 + Math.sin(x / 16 * Math.PI * 2) * 2.5);
    dot(img, x, y, 0xcfcbbf); dot(img, x, y + 1, 0xbebaae); img.tone(x, y + 2, -0.04);
  }
  speckle(img, seed + 2, 0.03, pal(0x7a7e80, 0x5a3420));
  grime(img, seed + 3, 0.22, [50, 40, 34], 2, 0.6);
  streaks(img, seed + 4, 3, [110, 64, 34], 6, 0.3);
}
function gasPumpFront(img, seed) {
  const W = pal(0xa6a49c, 0xb2b0a8, 0xbebcb4, 0xc8c6be);
  material(img, seed, W, 0.1, 0.15);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 16; x++) img.set(x, y, shade(hex(0x9a2a22), (rnd(seed, x, y, 1) - 0.5) * 0.06 + (y === 0 ? 0.06 : 0)));
  for (let x = 0; x < 16; x++) dot(img, x, 3, 0xd8d4c8);
  // LCD
  for (let y = 4; y < 7; y++) for (let x = 2; x < 13; x++) img.set(x, y, hex(0x1a241c));
  for (const x of [3, 4, 6, 7, 9, 10, 11]) dot(img, x, 5, 0x34503a);
  bev(img, 2, 4, 11, 3, -0.1, 0.06);
  // grade buttons
  for (const [x, c] of [[3, 0xc8a030], [6, 0xc87028], [9, 0xa83228]]) { dot(img, x, 8, c); dot(img, x + 1, 8, c); dot(img, x, 9, 0x2a2a2a); dot(img, x + 1, 9, 0x2a2a2a); }
  // card reader
  for (let y = 10; y < 13; y++) for (let x = 2; x < 6; x++) dot(img, x, y, y === 11 ? 0x0e0e0e : 0x3a3a3a);
  // nozzle holster + hose
  for (let y = 9; y < 14; y++) for (let x = 11; x < 15; x++) dot(img, x, y, 0x3a3a38);
  for (let y = 9; y < 12; y++) dot(img, 12, y, 0x141414);
  dot(img, 13, 9, 0x9a9e9c); dot(img, 13, 10, 0x6a6e6c);
  for (let y = 12; y < 16; y++) dot(img, 13 - (y > 13 ? 1 : 0), y, 0x101010);
  for (let x = 0; x < 16; x++) { dot(img, x, 14, 0x55534e); dot(img, x, 15, 0x3a3834); }
  bev(img, 0, 0, 16, 16, 0.05, -0.12);
  grime(img, seed + 2, 0.25, [60, 50, 38], 2, 0.55);
}
function gasPumpSide(img, seed) {
  const W = pal(0xa6a49c, 0xb2b0a8, 0xbebcb4, 0xc8c6be);
  material(img, seed, W, 0.1, 0.15);
  for (let x = 0; x < 16; x++) { dot(img, x, 1, 0x9a2a22); dot(img, x, 2, 0x8a241e); dot(img, x, 14, 0x55534e); dot(img, x, 15, 0x3a3834); }
  for (let y = 6; y < 10; y++) for (let x = 4; x < 12; x++) dot(img, x, y, y === 6 ? 0xd8b030 : 0xc8a028);
  for (const [x, y] of [[5, 7], [6, 7], [6, 8], [8, 7], [9, 7], [9, 8], [8, 8]]) dot(img, x, y, 0x1a1a1a);
  bev(img, 0, 0, 16, 16, 0.05, -0.12);
  grime(img, seed + 2, 0.25, [60, 50, 38], 2, 0.55);
  streaks(img, seed + 3, 3, [100, 60, 34], 5, 0.25);
}
function waterPump(img, seed) {
  const G = pal(0x1a241c, 0x1f2b21, 0x243226, 0x29392b, 0x2e4030);
  material(img, seed, G, 0.12, 0.2);
  for (let y = 0; y < 16; y++) { img.tone(6, y, 0.04); img.tone(7, y, 0.08); img.tone(9, y, -0.08); }
  for (let x = 0; x < 16; x++) { img.tone(x, 0, 0.1); img.tone(x, 2, -0.12); img.tone(x, 9, 0.1); img.tone(x, 10, -0.12); }
  speckle(img, seed + 2, 0.1, RUST.slice(1, 4));
  streaks(img, seed + 3, 4, [110, 64, 34], 6, 0.4);
}

// ---------------------------------------------------------------------------
// barrels
function rainBarrel(img, seed) {
  // oak whiskey barrel: visible cols 1.6-14.4
  const P = pal(0x4e3622, 0x5a3f28, 0x66482e, 0x725134, 0x7e5a3a);
  const g = vnoise(seed, 16, 2), wn = white(seed + 1);
  img.each((x, y) => {
    const stave = Math.floor((x + 1) / 3);
    const bulge = Math.sin((y + 0.5) / 16 * Math.PI) * 0.12;
    let v = 0.4 + bulge + (rnd(seed, stave, 0, 2) - 0.5) * 0.3 + (g[y * 16 + x] - 0.5) * 0.35 + (wn[y * 16 + x] - 0.5) * 0.15;
    let c = pick(P, clamp01(v), x, y, 0.4);
    if ((x + 1) % 3 === 0) c = shade(c, -0.15);
    img.set(x, y, c);
  });
  for (const hy of [2, 12]) for (let x = 0; x < 16; x++) { dot(img, x, hy, 0x3a3634); dot(img, x, hy + 1, 0x24201e); if (rnd(seed, x, hy, 3) < 0.3) dot(img, x, hy, 0x6a3a20); }
  for (const x of [3, 9]) { dot(img, x, 2, 0x8a8e90); dot(img, x, 12, 0x8a8e90); }
  for (let y = 13; y < 16; y++) for (let x = 0; x < 16; x++) if (rnd(seed, x, y, 4) < 0.3) img.mix(x, y, [60, 76, 40], 0.5);
  // spigot
  dot(img, 8, 10, 0xa89060); dot(img, 8, 11, 0x6e5a32);
}
function rainBarrelTop(img, seed) {
  const P = pal(0x5a3f28, 0x66482e, 0x725134);
  img.each((x, y) => {
    const e = Math.min(x, y, 15 - x, 15 - y);
    if (e < 3) { img.set(x, y, pick(P, rnd(seed, x, y, 1), x, y)); if (e === 2) img.tone(x, y, -0.15); return; }
    let c = mix(hex(0x1e3434), hex(0x2e4846), rnd(seed, x, y, 2) * 0.5 + (y < 7 ? 0.3 : 0));
    if (x - y === 1 || x - y === 2) c = mix(c, hex(0x7a9a9a), 0.35);
    img.set(x, y, c);
  });
  const r = makeRng(seed + 3);
  leafBit(img, 5, 9, hex(0xa86a30), r); leafBit(img, 9, 5, hex(0x8a3a26), r);
}
function steelDrum(img, seed, paintCol) {
  const wn = white(seed + 1), rust = fbm(seed + 2, 3, 3, 3);
  const P = ramp(paintCol, 5, 0.08, 0.2);
  img.each((x, y) => {
    const i = y * 16 + x;
    const cyl = Math.sin((x + 0.5) / 16 * Math.PI) * 0.2;
    const v = 0.35 + cyl + (wn[i] - 0.5) * 0.25;
    img.set(x, y, rust[i] > 0.55 || (rust[i] > 0.45 && wn[i] < 0.3) ? pick(RUST, clamp01(v + (wn[i] - 0.5) * 0.3), x, y, 0.5) : pick(P, clamp01(v), x, y, 0.4));
  });
  for (let x = 0; x < 16; x++) {
    img.tone(x, 0, 0.08); img.tone(x, 1, -0.12); img.tone(x, 15, -0.14);
    for (const hy of [5, 10]) { img.tone(x, hy, 0.12); img.tone(x, hy + 1, -0.14); }
  }
  streaks(img, seed + 3, 5, [100, 52, 26], 9, 0.4);
}
function drumTop(img, seed, inner) {
  // visible cols/rows 1.6-14.4
  const rust = fbm(seed + 2, 3, 3, 3), wn = white(seed + 1);
  img.each((x, y) => {
    const i = y * 16 + x;
    const v = 0.45 + (wn[i] - 0.5) * 0.3;
    img.set(x, y, rust[i] > 0.5 ? pick(RUST, clamp01(v), x, y, 0.5) : pick(ramp(hex(0x30445a), 5, 0.08), clamp01(v), x, y, 0.4));
    const e = Math.min(x, y, 15 - x, 15 - y);
    if (e <= 2) img.tone(x, y, e === 2 ? -0.16 : 0.08);
  });
  if (inner) { inner(img); return; }
  img.each((x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); if (Math.round(d) === 4) img.tone(x, y, 0.08); });
  img.disc(5, 5, 1.3, (x, y) => img.set(x, y, hex(0x3a3e40))); dot(img, 4, 4, 0x8a8e90);
  dot(img, 11, 11, 0x3a3e40); dot(img, 10, 10, 0x6a6e70);
}

// ---------------------------------------------------------------------------
// fire & camp
const EMBER = pal(0x3a0e06, 0x6a1a08, 0xa8320c, 0xd85a14, 0xf08a24, 0xf8c04a, 0xfce690);
function embers(img, seed, x0, y0, w, h, heat = 1) {
  const f = fbm(seed, 4, 4, 2), wn = white(seed + 1);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y & 15) * 16 + (x & 15);
    const v = clamp01((f[i] * 0.7 + wn[i] * 0.3) * heat);
    img.set(x, y, v < 0.35 ? mix(hex(0x1a1614), hex(0x2e2824), v * 2) : pick(EMBER, (v - 0.35) / 0.65, x, y, 0.5));
  }
}
function stoneRing(img, seed) {
  const S = pal(0x4a4a48, 0x5a5a58, 0x6a6a68, 0x7a7a78, 0x8a8a88);
  const r = makeRng(seed + 7);
  img.each((x, y) => {
    const e = Math.min(x, y, 15 - x, 15 - y);
    if (e >= 2 && e <= 4) {
      const ang = Math.atan2(y - 7.5, x - 7.5);
      const sid = Math.floor((ang + Math.PI) / (Math.PI * 2) * 11);
      const local = ((ang + Math.PI) / (Math.PI * 2) * 11) % 1;
      if (local < 0.12 || e === 2 && rnd(seed, x, y, 3) < 0.3) { dot(img, x, y, 0x2a2622); return; }
      img.set(x, y, pick(S, clamp01(0.3 + rnd(seed, sid, 0, 4) * 0.4 + (e === 4 ? -0.15 : e === 2 ? 0.1 : 0.05) + (rnd(seed, x, y, 5) - 0.5) * 0.25), x, y, 0.4));
    }
  });
  void r;
}
function campfireTop(img, seed, lit) {
  // ground
  paint(img, pal(0x3a2c1e, 0x44342a, 0x4e3c2c), eq(white(seed + 9)), 0.5);
  if (lit) embers(img, seed, 4, 4, 8, 8, 1.1);
  else {
    paint(img, pal(0x4a4642, 0x5e5a56, 0x76726c, 0x8e8a84, 0xa8a49c), eq(combine(fbm(seed, 4, 4, 2), 0.6, white(seed + 1), 0.4)), 0.6);
  }
  // crossed logs
  const L = lit ? pal(0x1e1410, 0x3a2416, 0x5a3a22, 0x6e4a2c) : pal(0x141210, 0x221c18, 0x2e2620, 0x3a3028);
  for (let t = 3; t < 13; t++) { img.set(t, t, L[2]); img.set(t + 1, t, L[1]); img.set(15 - t, t, L[3]); img.set(14 - t, t, L[0]); }
  if (lit) { for (const [x, y] of [[7, 7], [8, 8], [8, 7], [7, 8]]) img.set(x, y, EMBER[6]); dot(img, 6, 9, 0xf8c04a); dot(img, 9, 6, 0xf08a24); }
  stoneRing(img, seed);
}
function campfireSide(img, seed) {
  // visible rows 12.8-16: stones on the outside, glowing logs between
  paint(img, pal(0x2a201a, 0x34281e, 0x3e3024), eq(white(seed + 9)), 0.5);
  const S = pal(0x4a4a48, 0x5e5e5c, 0x727270, 0x868684);
  for (let x = 0; x < 16; x++) for (let y = 12; y < 16; y++) {
    const sx = Math.floor(x / 3);
    const top = 12 + (rnd(seed, sx, 0, 1) < 0.5 ? 1 : 0);
    if (y < top) continue;
    let v = 0.5 + (y === top ? 0.3 : 0) + (x % 3 === 2 ? -0.3 : 0) + (rnd(seed, x, y, 2) - 0.5) * 0.3;
    img.set(x, y, pick(S, clamp01(v), x, y, 0.4));
    if (x % 3 === 2 && rnd(seed, x, y, 3) < 0.5) img.set(x, y, pick(EMBER, 0.4 + rnd(seed, x, y, 4) * 0.4, x, y));
  }
  for (let x = 0; x < 16; x++) if (rnd(seed, x, 11, 5) < 0.5) img.set(x, 11, pick(EMBER, 0.2 + rnd(seed, x, 11, 6) * 0.5, x, 11));
}
function fireSprite(img, seed) {
  img.fill([0, 0, 0], 0);
  const f = fbm(seed, 4, 2, 3), wn = white(seed + 1);
  const F = pal(0x7a1a06, 0xb2300a, 0xd8501a, 0xf07a22, 0xf8a836, 0xfcd060, 0xfef0a8);
  for (let x = 0; x < 16; x++) {
    const tongue = 0.55 + 0.45 * Math.sin((x / 16) * Math.PI * 3 + 1.2) * 0.5 + (f[x] - 0.5) * 0.6;
    const h = 6 + tongue * 9 - Math.abs(x - 7.5) * 0.35;
    for (let y = 15; y >= 0; y--) {
      const t = (15 - y) / Math.max(1, h);
      if (t > 1) break;
      const n = f[y * 16 + x] * 0.5 + wn[y * 16 + x] * 0.25;
      const core = 1 - Math.abs(x - 7.5) / 9;
      const v = clamp01(core * 0.8 + (1 - t) * 0.55 + n * 0.35 - 0.35);
      if (t > 0.82 && wn[y * 16 + x] < 0.45) continue;
      img.set(x, y, pick(F, v, x, y, 0.5), 255);
    }
  }
  // detached flicker tips
  const r = makeRng(seed + 3);
  for (let k = 0; k < 4; k++) { const x = r.int(3, 12), y = r.int(1, 5); if (!img.alpha(x, y)) img.set(x, y, F[r.int(2, 4)], 255); }
}
function lanternTex(img, seed) {
  // visible front cols 5.6-10.4 rows 8.8-16, top cols 5.6-10.4 rows 5.6-10.4
  img.fill([0, 0, 0], 0);
  const M = pal(0x1e1e1c, 0x2e2e2a, 0x3e3e3a, 0x5a5a54);
  for (let y = 0; y < 16; y++) for (let x = 3; x < 13; x++) img.set(x, y, M[1], 255);
  // top cap rows 8-9, glass rows 10-14, base row 15
  for (let x = 3; x < 13; x++) { img.set(x, 8, M[3], 255); img.set(x, 9, M[2], 255); img.set(x, 15, M[0], 255); }
  for (let y = 10; y < 15; y++) for (let x = 6; x < 10; x++) {
    const d = Math.abs(x - 7.5) + Math.abs(y - 12.5) * 0.6;
    img.set(x, y, pick(pal(0xa86a20, 0xd8962e, 0xf0be4a, 0xfce08a, 0xfff4c8), clamp01(1.1 - d / 2.6), x, y, 0.3), 255);
  }
  for (let y = 10; y < 15; y++) { img.set(5, y, M[2], 255); img.set(10, y, M[0], 255); }
  // top face: cap with vent + handle ring (rows 6-9)
  for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) img.set(x, y, M[2], 255);
  dot(img, 7, 7, 0x0e0e0e); dot(img, 8, 8, 0x0e0e0e); dot(img, 8, 7, 0x3a2a10); dot(img, 7, 8, 0x3a2a10);
  for (let x = 6; x < 10; x++) { dot(img, x, 6, 0x6a6a64); dot(img, x, 9, 0x6a6a64); }
  speckle(img, seed + 1, 0.05, RUST.slice(1, 3));
}

// ---------------------------------------------------------------------------
// misc
function gravestone(img, seed) {
  const G = pal(0x5e5e5c, 0x686866, 0x727270, 0x7c7c7a, 0x868684, 0x90908e);
  paint(img, G, eq(combine(fbm(seed, 3, 3, 2), 0.5, white(seed + 1), 0.5)), 0.6);
  speckle(img, seed + 2, 0.05, pal(0x4a4a4a, 0xa8a8a4));
  // engraved cross + text lines (dark with a light lower lip)
  const eng = (x, y) => { img.set(x, y, hex(0x2e2e2e)); img.tone(x + 1, y + 1, 0.1); };
  for (let y = 3; y < 10; y++) eng(7, y), eng(8, y);
  for (let x = 5; x < 11; x++) eng(x, 5);
  for (const [y, a, b] of [[11, 5, 10], [13, 6, 9]]) for (let x = a; x <= b; x++) if (rnd(seed, x, y, 4) < 0.8) eng(x, y);
  // lichen & moss
  for (let k = 0; k < 3; k++) {
    const r = makeRng(seed + 10 + k);
    const x = r.int(3, 12), y = r.int(2, 15), c = hex(r.pick([0x9a9a62, 0xa8823a, 0x6e7a4a]));
    img.mix(x, y, c, 0.7); img.mix(x + 1, y, c, 0.5); img.mix(x, y + 1, c, 0.4);
  }
  for (let y = 13; y < 16; y++) for (let x = 0; x < 16; x++) if (rnd(seed, x, y, 6) < (y - 12) * 0.2) img.mix(x, y, [70, 84, 48], 0.6);
  for (let x = 3; x < 13; x++) img.tone(x, 2, 0.1);
}
function tent(img, seed, base) {
  const R = ramp(base, 5, 0.06, 0.25);
  const f = fbm(seed, 2, 3, 3), wn = white(seed + 1);
  img.each((x, y) => {
    const i = y * 16 + x;
    const v = 0.5 + (f[i] - 0.5) * 0.6 + (wn[i] - 0.5) * 0.2 + ((x + y) & 1 ? 0.04 : -0.04);
    img.set(x, y, pick(R, clamp01(v), x, y, 0.4));
  });
  // seam with stitching
  for (let y = 0; y < 16; y++) { img.tone(0, y, -0.12); img.tone(1, y, 0.04); if (y & 1) img.tone(2, y, -0.06); }
  // patch
  const r = makeRng(seed + 2);
  const px = r.int(5, 10), py = r.int(4, 10);
  for (let y = py; y < py + 3; y++) for (let x = px; x < px + 4; x++) img.set(x, y, shade(base, (y === py ? 0.02 : -0.04) - 0.06));
  for (let x = px; x < px + 4; x++) if (x & 1) img.tone(x, py, 0.1);
  grime(img, seed + 3, 0.25, [60, 54, 40], 2, 0.55);
  streaks(img, seed + 4, 3, [70, 64, 50], 6, 0.2);
}
function camoNet(img, seed) {
  img.fill([0, 0, 0], 0);
  const C = pal(0x2e3424, 0x3e4a2c, 0x55603a, 0x6b6a44, 0x4a3e2c, 0x5e5038);
  const w = worley(seed, 4, 4, 0.9);
  img.each((x, y) => {
    const i = y * 16 + x;
    const net = ((x + y) & 3) === 0 || ((x - y) & 3) === 0;
    const garnish = w.d1[i] < 2.2 + rnd(seed, w.id[i], 0, 3) * 0.8 && rnd(seed, x, y, 4) > 0.18;
    if (garnish) img.set(x, y, C[Math.floor(rnd(seed, w.id[i], 1, 5) * C.length)], 255);
    else if (net) img.set(x, y, hex(0x2a2a22), 255);
  });
  grain(img, seed + 2, 0.08);
}
function rubble(img, seed) {
  const w = worley(seed, 5, 5, 0.95);
  const wn = white(seed + 1);
  img.each((x, y) => {
    const i = y * 16 + x;
    const e = w.d2[i] - w.d1[i];
    if (e < 0.7) { dot(img, x, y, rnd(seed, x, y, 2) < 0.5 ? 0x2a2826 : 0x3a3632); return; }
    const kind = rnd(seed, w.id[i], 0, 3);
    const P = kind < 0.6 ? CONCRETE : kind < 0.85 ? pal(0x6a2c22, 0x7a3428, 0x8a3e30, 0x984838) : pal(0x8a8274, 0x9a9282, 0xaaa290);
    const v = 0.2 + rnd(seed, w.id[i], 1, 4) * 0.5 + (-w.ox[i] - w.oy[i]) * 0.08 + (wn[i] - 0.5) * 0.3;
    img.set(x, y, pick(P, clamp01(v), x, y, 0.5));
  });
  // rebar
  const r = makeRng(seed + 2);
  for (let k = 0; k < 2; k++) {
    const x = r.int(0, 12), y = r.int(0, 15), dy = r.pick([-1, 0, 1]);
    for (let s = 0; s < 5; s++) { img.set(x + s, y + ((s * dy) >> 1), hex(0x6a3a20)); img.mul(x + s, y + ((s * dy) >> 1) + 1, 0.7); }
  }
  speckle(img, seed + 3, 0.06, pal(0xb4b0a6, 0x9a968c));
}
function trashBags(img, seed) {
  const w = worley(seed, 3, 3, 0.9);
  const wn = white(seed + 1);
  const P = pal(0x121314, 0x18191b, 0x1f2023, 0x27282b, 0x313236, 0x45474c);
  img.each((x, y) => {
    const i = y * 16 + x;
    const e = w.d2[i] - w.d1[i];
    if (e < 0.6) { dot(img, x, y, 0x0a0a0a); return; }
    const hl = clamp01(1 - Math.hypot(w.ox[i] + 1.2, w.oy[i] + 1.4) / 2.2);
    let v = 0.25 + hl * 0.7 + (wn[i] - 0.5) * 0.15 - (e < 1.2 ? 0.15 : 0);
    if (rnd(seed, w.id[i], 0, 2) < 0.2) { img.set(x, y, pick(pal(0x2a3a2a, 0x334433, 0x3e503e, 0x56685a), clamp01(v), x, y, 0.4)); return; }
    img.set(x, y, pick(P, clamp01(v), x, y, 0.4));
  });
  // knot + tear with trash spilling out
  const r = makeRng(seed + 2);
  const kx = r.int(2, 12), ky = r.int(2, 12);
  dot(img, kx, ky, 0x3a3c40); dot(img, kx + 1, ky, 0x24262a); dot(img, kx, ky - 1, 0x4a4c50);
  const tx = r.int(2, 12), ty = r.int(2, 12);
  for (const [dx, dy, c] of [[0, 0, 0xd0ccc0], [1, 0, 0xc8a030], [0, 1, 0xa83228], [1, 1, 0x8a8478], [2, 1, 0xd8d4c8]]) dot(img, tx + dx, ty + dy, c);
}
function pallet(img, seed) {
  const P = pal(0x7a6448, 0x86704f, 0x927b58, 0x9d8662, 0xa8916c);
  const g = vnoise(seed, 3, 16), wn = white(seed + 1);
  img.each((x, y) => {
    const b = Math.floor(y / 4), ry = y % 4;
    if (ry === 3) {
      const stringer = x <= 1 || x === 7 || x === 8 || x >= 14;
      dot(img, x, y, stringer ? 0x4a3a28 : 0x1e1812);
      return;
    }
    let v = 0.4 + (rnd(seed, b, 0, 2) - 0.5) * 0.35 + (g[y * 16 + x] - 0.5) * 0.5 + (wn[y * 16 + x] - 0.5) * 0.2 + (ry === 0 ? 0.12 : ry === 2 ? -0.1 : 0);
    img.set(x, y, pick(P, clamp01(v), x, y, 0.4));
  });
  for (let b = 0; b < 4; b++) for (const nx of [1, 7, 14]) dot(img, nx, b * 4 + 1, 0x3a3632);
  grime(img, seed + 2, 0.25, [80, 74, 62], 2, 0.55);
}

// ---------------------------------------------------------------------------
export const PROPS = {
  fence_picket(img, { seed }) { picketFence(img, seed); },
  fence_wood(img, { seed }) { privacyFence(img, seed); },
  fence_chainlink(img, { seed }) { chainlink(img, seed); },
  barbed_wire(img, { seed }) { barbedWire(img, seed); },
  sandbags(img, { seed }) { sandbags(img, seed); },
  hesco_side(img, { seed }) { hescoSide(img, seed); },
  hesco_top(img, { seed }) { hescoTop(img, seed); },
  jersey_barrier(img, { seed }) { jersey(img, seed); },
  guardrail(img, { seed }) { guardrail(img, seed); },
  traffic_cone(img, { seed }) { trafficCone(img, seed); },
  metal_pole(img, { seed }) { metalPole(img, seed); },
  street_lamp_bottom(img, { seed }) { streetLampBottom(img, seed); },
  utility_pole(img, { seed }) { utilityPole(img, seed); },
  traffic_light(img, { seed }) { trafficLight(img, seed); },
  traffic_light_back(img, { seed }) {
    material(img, seed, pal(0x23261f, 0x2a2d25, 0x31342b, 0x383b31), 0.1, 0.15);
    for (let y = 0; y < 16; y++) for (const x of [6, 9]) { img.tone(x, y, 0.06); img.tone(x + 1, y, -0.06); }
    for (const y of [1, 14]) for (const x of [6, 9]) dot(img, x, y, 0x5a5e54);
  },
  stop_sign(img, { seed }) { stopSign(img, seed); },
  mailbox(img, { seed }) { mailbox(img, seed); },
  fire_hydrant(img, { seed }) { fireHydrant(img, seed); },
  trash_can(img, { seed }) { trashCan(img, seed); },
  trash_can_top(img, { seed }) { trashCanTop(img, seed); },
  dumpster(img, { seed }) { dumpster(img, seed); },
  dumpster_top(img, { seed }) { dumpsterTop(img, seed); },
  vending_front(img, { seed }) { vendingFront(img, seed); },
  vending_side(img, { seed }) { vendingSide(img, seed); },
  gas_pump_front(img, { seed }) { gasPumpFront(img, seed); },
  gas_pump_side(img, { seed }) { gasPumpSide(img, seed); },
  water_pump(img, { seed }) { waterPump(img, seed); },
  rain_barrel(img, { seed }) { rainBarrel(img, seed); },
  rain_barrel_top(img, { seed }) { rainBarrelTop(img, seed); },
  barrel_rust(img, { seed }) { steelDrum(img, seed, hex(0x30445a)); },
  barrel_rust_top(img, { seed }) { drumTop(img, seed); },
  barrel_fire_top(img, { seed }) {
    drumTop(img, seed, (im) => {
      embers(im, seed + 5, 3, 3, 10, 10, 1.15);
      for (let t = 4; t < 12; t++) { im.set(t, t, hex(0x2a1a10)); im.set(15 - t, t, hex(0x3a2416)); }
      for (const [x, y] of [[7, 7], [8, 8], [7, 8], [8, 7], [6, 6], [9, 9]]) im.set(x, y, EMBER[6]);
    });
  },
  campfire_top(img, { seed }) { campfireTop(img, seed, true); },
  campfire_out(img, { seed }) { campfireTop(img, seed, false); },
  campfire_side(img, { seed }) { campfireSide(img, seed); },
  fire(img, { seed }) { fireSprite(img, seed); },
  lantern(img, { seed }) { lanternTex(img, seed); },
  gravestone(img, { seed }) { gravestone(img, seed); },
  tent_green(img, { seed }) { tent(img, seed, hex(0x4a5a3a)); },
  tent_orange(img, { seed }) { tent(img, seed, hex(0xb0602a)); },
  tent_white(img, { seed }) { tent(img, seed, hex(0xc0beb2)); },
  camo_net(img, { seed }) { camoNet(img, seed); },
  rubble(img, { seed }) { rubble(img, seed); },
  trash_bags(img, { seed }) { trashBags(img, seed); },
  pallet(img, { seed }) { pallet(img, seed); },
};
