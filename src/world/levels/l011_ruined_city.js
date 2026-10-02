// Level 11: The Ruined City. Broad boulevards between broken towers, in a low, dusty light.
// Nothing moves, nobody is here, and the traffic lights still run: red, amber, green, at every
// intersection, for cars that stand in the lanes with their doors open.
//
// The city is a grid of 128 m zones with a boulevard on each zone border (a 2 m median, two lanes
// each way, pavements) and four lots of 48 m inside. Every lot holds a tower with a collapsed
// corner, a pair of lower blocks, or an empty plaza strewn with rubble.
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, openGround, levelDoor, env } from './kit.js';
import {
  defineTexture, defineMaterial, hr, owns, cbox, M, mul, mix, FACE, only,
  paintAsphalt, paintConcrete, paintSkyline, paintWindow, stripe, lamp, signalPole, driveChannels,
} from './g04_kit.js';
import { pfbm } from '../../gfx/texgen.js';

const N = 11;
const G = 128;
const SW = 0.15;                                           // pavement height
const CYCLE = 28;

// ------------------------------------------------------------------ textures
const ASPH = [86, 84, 82];
defineTexture('lv11_road', (p) => paintAsphalt(p, ASPH, { cracks: 6, speckle: 90, noise: 0.12 }), 12);
defineTexture('lv11_road_b', (p) => { paintAsphalt(p, [92, 88, 82], { cracks: 3, noise: 0.14 }); p.speckle(60, [150, 138, 120], 0.3, 0.6, 2); }, 12);
defineTexture('lv11_dash_x', (p) => { paintAsphalt(p, ASPH, { cracks: 1, noise: 0.1 }); stripe(p, 'x', 28, 8, [196, 192, 178], [16, 48]); }, 12);
defineTexture('lv11_dash_z', (p) => { paintAsphalt(p, ASPH, { cracks: 1, noise: 0.1 }); stripe(p, 'z', 28, 8, [196, 192, 178], [16, 48]); }, 12);
defineTexture('lv11_zebra_x', (p) => { paintAsphalt(p, ASPH, { cracks: 1 }); for (let y = 0; y < 32; y++) p.rect(0, y, 64, 1, [190, 186, 172], 0.9); p.noise(4, 0.2, 2); }, 8);
defineTexture('lv11_zebra_z', (p) => { paintAsphalt(p, ASPH, { cracks: 1 }); for (let x = 0; x < 32; x++) p.rect(x, 0, 1, 64, [190, 186, 172], 0.9); p.noise(4, 0.2, 2); }, 8);
defineTexture('lv11_median', (p) => { paintConcrete(p, [136, 132, 124], { cracks: 3 }); p.rect(0, 0, 64, 4, [196, 170, 60], 0.8); }, 10);
defineTexture('lv11_walk', (p) => { paintConcrete(p, [148, 142, 132], { cracks: 4, noise: 0.1 }); p.speckle(40, [80, 100, 60], 0.4, 0.8, 2); }, 12);
defineTexture('lv11_plaza', (p) => { paintConcrete(p, [124, 120, 112], { cracks: 6, noise: 0.14 }); p.speckle(70, [90, 104, 64], 0.4, 0.8, 2); for (let i = 0; i < 64; i += 16) { p.rect(i, 0, 1, 64, [80, 78, 72], 0.7); p.rect(0, i, 64, 1, [80, 78, 72], 0.7); } }, 12);
defineTexture('lv11_dirt', (p) => { p.fill([108, 92, 72]); p.noise(5, 0.2, 3); p.speckle(90, [140, 124, 100], 0.3, 0.7); p.speckle(60, [70, 80, 50], 0.3, 0.7); }, 10);
// facades: a grid of 4 x 4 windows (8 m by 14.4 m), some broken
function facade(p, base, glass, o = {}) {
  const r = p.rng;
  p.fill(base); p.noise(3, 0.1, 2); p.grain(0.04);
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const x = gx * 16, y = gy * 16, u = r.next();
    if (o.curtain) { p.rect(x, y + 1, 16, 14, glass); p.rect(x + 7, y + 1, 2, 14, mul(base, 0.8)); }
    else { p.rect(x + 3, y + 3, 10, 11, glass); p.rect(x + 2, y + 2, 12, 1, mul(base, 1.2)); p.rect(x + 2, y + 14, 12, 1, mul(base, 0.7)); }
    if (u < 0.3) { for (let k = 0; k < 4; k++) p.line(x + r.int(3, 12), y + r.int(3, 6), x + r.int(3, 12), y + r.int(8, 14), [210, 214, 220], 0.7); }
    else if (u < 0.42) p.rect(x + 3, y + 3, 10, 11, [10, 10, 12]);
    else if (u < 0.5) p.rect(x + 3, y + 3, 10, 5, [14, 14, 16]);
  }
  for (let k = 0; k < 6; k++) p.stain(r.int(0, 63), r.int(0, 40), r.int(6, 12), [40, 38, 34], 0.35);
  if (o.rust) for (let k = 0; k < 5; k++) p.drip(r.int(0, 63), r.int(0, 40), r.int(10, 24), [120, 70, 40], 0.35, 2);
}
defineTexture('lv11_fac0', (p) => facade(p, [150, 146, 138], [48, 56, 64]), 14);
defineTexture('lv11_fac1', (p) => facade(p, [176, 160, 132], [40, 46, 52], { rust: true }), 14);
defineTexture('lv11_fac2', (p) => facade(p, [90, 100, 112], [30, 40, 54], { curtain: true }), 14);
defineTexture('lv11_shop', (p) => {
  p.fill([128, 120, 108]); p.noise(3, 0.1, 2);
  for (let k = 0; k < 2; k++) { const x = 2 + k * 32; p.rect(x, 12, 28, 40, [20, 24, 28]); p.frame(x, 12, 28, 40, [96, 92, 84]); p.line(x + 5, 14, x + 12, 40, [170, 176, 184], 0.5); }
  p.rect(0, 0, 64, 9, [70, 66, 60]); p.stain(20, 30, 14, [40, 36, 30], 0.3);
}, 10);
defineTexture('lv11_roof', (p) => { p.fill([70, 66, 62]); p.noise(4, 0.3, 3); p.speckle(80, [120, 112, 100], 0.3, 0.7); p.stain(30, 30, 18, [40, 36, 30], 0.4); }, 8);
defineTexture('lv11_rubble', (p) => { p.fill([118, 112, 104]); p.noise(5, 0.35, 3); p.speckle(120, [186, 180, 168], 0.3, 0.8); p.speckle(80, [60, 56, 52], 0.3, 0.8); for (let k = 0; k < 5; k++) p.line(p.rng.int(0, 63), p.rng.int(0, 63), p.rng.int(0, 63), p.rng.int(0, 63), [120, 70, 44], 0.7); }, 10);
defineTexture('lv11_smog', (p) => {
  p.map((x, y) => {
    const n = pfbm(x, y, 3, 4, 41);
    const d = Math.max(0, Math.min(1, (n - 0.3) * 2.4));
    const sh = 0.4 + 0.6 * pfbm(x + 7, y + 2, 4, 3, 9);
    return [d * 255, sh * 255, 0];
  });
}, 0);
defineTexture('lv11_skyline', (p) => paintSkyline(p, { lo: 22, hi: 60, col: [94, 82, 70], broken: 0.7, widthMin: 3, widthMax: 8, mast: 0.2 }), 10);
defineMaterial('lv11_road', 'lv11_road', { s: 3, surf: 'asphalt' });
defineMaterial('lv11_road_b', 'lv11_road_b', { s: 3, surf: 'asphalt' });
defineMaterial('lv11_dash_x', 'lv11_dash_x', { su: 12, sv: 1, surf: 'asphalt' });
defineMaterial('lv11_dash_z', 'lv11_dash_z', { su: 1, sv: 12, surf: 'asphalt' });
defineMaterial('lv11_zebra_x', 'lv11_zebra_x', { su: 2, sv: 1, surf: 'asphalt' });
defineMaterial('lv11_zebra_z', 'lv11_zebra_z', { su: 1, sv: 2, surf: 'asphalt' });
defineMaterial('lv11_median', 'lv11_median', { s: 2, surf: 'concrete' });
defineMaterial('lv11_walk', 'lv11_walk', { s: 1.5, surf: 'concrete' });
defineMaterial('lv11_plaza', 'lv11_plaza', { s: 2, surf: 'concrete' });
defineMaterial('lv11_dirt', 'lv11_dirt', { s: 2.5, surf: 'grass' });
defineMaterial('lv11_roof', 'lv11_roof', { s: 3, surf: 'concrete' });
defineMaterial('lv11_rubble', 'lv11_rubble', { s: 1.6, surf: 'concrete' });
// facade materials in four brightness levels for the four wall directions (the sun is low in the west)
const SHADE = { W: [1.2, 1.08, 0.92], S: [0.98, 0.92, 0.84], N: [0.8, 0.78, 0.78], E: [0.72, 0.7, 0.72] };
for (const t of ['fac0', 'fac1', 'fac2']) for (const d of ['W', 'S', 'N', 'E']) defineMaterial(`lv11_${t}${d}`, `lv11_${t}`, { su: 8, sv: 14.4, surf: 'concrete', tint: SHADE[d] });
for (const d of ['W', 'S', 'N', 'E']) defineMaterial(`lv11_shop${d}`, 'lv11_shop', { su: 8, sv: 8, surf: 'concrete', tint: SHADE[d] });
// [+x -x +y -y +z -z]: faces looking east, west, up, down, south, north
const facMats = (t, shop) => {
  const k = (d) => M[(shop ? 'lv11_shop' : `lv11_${t}`) + d];
  return [k('E'), k('W'), M.lv11_roof, M.lv11_roof, k('S'), k('N')];
};

const CAR_COLS = [[0.62, 0.6, 0.58], [0.58, 0.22, 0.18], [0.3, 0.34, 0.46], [0.74, 0.72, 0.66], [0.4, 0.46, 0.38], [0.7, 0.58, 0.3]];
const CAR_KINDS = ['sedan', 'sedan', 'wagon', 'van', 'pickup'];

// ------------------------------------------------------------------ one block
function rubbleHeap(zb, x, z, r, h, seed) {
  const n = 4 + Math.floor(hr(seed, 1, 11500) * 4);
  for (let k = 0; k < n; k++) {
    const rx = x + (hr(seed, k, 11510) - 0.5) * r * 1.6, rz = z + (hr(seed, k, 11520) - 0.5) * r * 1.6;
    if (!owns(zb, rx, rz)) continue;
    const s = 0.8 + hr(seed, k, 11530) * 2.2 * (r / 4), hh = 0.4 + hr(seed, k, 11540) * h * (1 - 0.7 * Math.hypot(rx - x, rz - z) / (r * 1.4));
    const gy = zb.getFloor(Math.floor(rx), Math.floor(rz));
    zb.box(rx - s, (Number.isFinite(gy) ? gy : 0) - 0.1, rz - s * 0.8, rx + s, (Number.isFinite(gy) ? gy : 0) + Math.max(0.5, hh), rz + s * 0.8, M.lv11_rubble, { sub: 4 });
  }
}

function tower(zb, X0, Z0, X1, Z1, h, seed) {
  const tex = ['fac0', 'fac1', 'fac2'][Math.floor(h(2) * 3)];
  const Hb = 10 + h(3) * 16, H = Hb + 12 + h(4) * 46;
  const xm = (X0 + X1) / 2 + (h(6) - 0.5) * 8, zm = (Z0 + Z1) / 2 + (h(7) - 0.5) * 8;
  const shop = facMats(tex, true), fac = facMats(tex, false);
  // shop front band and the body up to the collapse line
  cbox(zb, X0, 0, Z0, X1, 4.4, Z1, shop, { sub: 8 });
  cbox(zb, X0, 4.4, Z0, X1, Hb, Z1, fac, { sub: 12 });
  // four upper blocks at different heights; at least one has fallen
  const hs = [0, 1, 2, 3].map((k) => { const u = h(10 + k); return u < 0.28 ? Hb : Hb + (H - Hb) * (u < 0.55 ? 0.4 : u < 0.8 ? 0.7 : 1); });
  hs[Math.floor(h(15) * 4)] = Hb;
  hs[(Math.floor(h(15) * 4) + 2) % 4] = H;
  const quads = [[X0, Z0, xm, zm], [xm, Z0, X1, zm], [X0, zm, xm, Z1], [xm, zm, X1, Z1]];
  quads.forEach(([ax, az, bx, bz], k) => {
    if (hs[k] <= Hb + 0.1) return;
    const kx = k & 1, kz = k >> 1;
    // faces toward the neighbouring quadrants: skipped when that neighbour is at least as tall
    let skip = 0;
    const nx = hs[k ^ 1], nz = hs[k ^ 2];
    if (nx >= hs[k]) skip |= kx ? FACE.NX : FACE.PX;
    if (nz >= hs[k]) skip |= kz ? FACE.NZ : FACE.PZ;
    cbox(zb, ax, Hb, az, bx, hs[k], bz, fac, { sub: 12, skip });
  });
  // exposed floor plates and bent steel at the break
  for (let k = 0; k < 4; k++) {
    if (hs[k] > Hb + 0.1) continue;
    const [ax, az, bx, bz] = quads[k];
    const fl = Hb + 2 + Math.floor(h(20 + k) * 3) * 0;
    void fl;
    cbox(zb, ax + 0.5, Hb, az + 0.5, bx - 0.5, Hb + 0.4, bz - 0.5, M.lv11_rubble, { sub: 6 });
  }
  // heaps of fallen masonry around the base
  const nh = 2 + Math.floor(h(30) * 4);
  for (let k = 0; k < nh; k++) {
    const side = Math.floor(hr(seed, k, 11600) * 4), t = hr(seed, k, 11610);
    const hx = side === 0 ? X0 - 3 - hr(seed, k, 11620) * 3 : side === 1 ? X1 + 3 + hr(seed, k, 11620) * 3 : X0 + t * (X1 - X0);
    const hz = side === 2 ? Z0 - 3 - hr(seed, k, 11620) * 3 : side === 3 ? Z1 + 3 + hr(seed, k, 11620) * 3 : Z0 + t * (Z1 - Z0);
    rubbleHeap(zb, hx, hz, 3.5 + hr(seed, k, 11630) * 3, 2.4, seed * 17 + k);
  }
}

function lot(zb, qx, qz, a, b) {
  const { x0, z0 } = zb;
  const h = (s) => hr(a * 2 + qx, b * 2 + qz, 11000 + s);
  const lx0 = qx ? 66 : 14, lx1 = qx ? 114 : 62, lz0 = qz ? 66 : 14, lz1 = qz ? 114 : 62;
  const seed = (a * 7 + qx) * 31 + b * 13 + qz;
  const type = h(1);
  const m = 1 + h(5) * 3;
  const X0 = x0 + lx0 + m, X1 = x0 + lx1 - m, Z0 = z0 + lz0 + m, Z1 = z0 + lz1 - m;
  if (type < 0.58) tower(zb, X0, Z0, X1, Z1, h, seed);
  else if (type < 0.8) {
    // two lower blocks side by side, one of them half gone
    const split = (qx + qz) & 1 ? 'x' : 'z';
    const mid = split === 'x' ? (X0 + X1) / 2 + (h(6) - 0.5) * 10 : (Z0 + Z1) / 2 + (h(6) - 0.5) * 10;
    const parts = split === 'x' ? [[X0, Z0, mid - 1, Z1], [mid + 1, Z0, X1, Z1]] : [[X0, Z0, X1, mid - 1], [X0, mid + 1, X1, Z1]];
    parts.forEach(([ax, az, bx, bz], k) => {
      const tex = ['fac0', 'fac1', 'fac2'][Math.floor(h(2 + k) * 3)], hh = 10 + h(8 + k) * 22;
      cbox(zb, ax, 0, az, bx, 4.4, bz, facMats(tex, true), { sub: 8 });
      cbox(zb, ax, 4.4, az, bx, hh, bz, facMats(tex, false), { sub: 10 });
      if (h(12 + k) < 0.5) rubbleHeap(zb, (ax + bx) / 2 + (h(14 + k) - 0.5) * 10, split === 'x' ? az - 4 : bz + 4, 5, 3, seed * 3 + k);
    });
  } else {
    // a plaza gone to seed: cracked paving, dirt, a bare tree, rubble and a few cars
    for (let z = z0 + lz0 + 1; z < z0 + lz1 - 1; z++) for (let x = x0 + lx0 + 1; x < x0 + lx1 - 1; x++) {
      const i = zb.i(x, z), u = hr(x >> 2, z >> 2, 11700 + seed);
      zb.floor[i] = SW; zb.fmat[i] = u < 0.3 ? M.lv11_dirt : M.lv11_plaza;
    }
    for (let k = 0; k < 4; k++) {
      const tx = X0 + 4 + hr(seed, k, 11710) * (X1 - X0 - 8), tz = Z0 + 4 + hr(seed, k, 11720) * (Z1 - Z0 - 8);
      zb.prop('g04_tree', tx, SW, tz, k * 1.7, { h: 6 + hr(seed, k, 11730) * 3, kind: 'bare', barkTint: [0.7, 0.66, 0.6] });
    }
    for (let k = 0; k < 3; k++) rubbleHeap(zb, X0 + 5 + hr(seed, k, 11740) * (X1 - X0 - 10), Z0 + 5 + hr(seed, k, 11750) * (Z1 - Z0 - 10), 4.5, 2.2, seed * 5 + k);
    for (let k = 0; k < 4; k++) {
      const cx = X0 + 5 + hr(seed, k, 11760) * (X1 - X0 - 10), cz = Z0 + 5 + hr(seed, k, 11770) * (Z1 - Z0 - 10);
      if (owns(zb, cx, cz)) zb.prop('g04_car', cx, SW, cz, hr(seed, k, 11780) * 6.28, { kind: CAR_KINDS[Math.floor(hr(seed, k, 11790) * 5)], col: CAR_COLS[Math.floor(hr(seed, k, 11800) * 6)], dust: true, flat: hr(seed, k, 11810) < 0.4 });
    }
  }
  return { X0, Z0, X1, Z1 };
}

function gen(zb) {
  openGround(zb, M.lv11_dirt, SW);
  zb.noConnectivity = true;
  const { x0, z0, x1, z1 } = zb;
  const a = Math.floor(x0 / G), b = Math.floor(z0 / G);
  // ---- boulevards: median, lanes, lane lines, zebra crossings, pavements
  for (let lz = 0; lz < G; lz++) {
    const tz = Math.min(lz, G - 1 - lz);
    for (let lx = 0; lx < G; lx++) {
      const tx = Math.min(lx, G - 1 - lx);
      const i = lz * G + lx;
      if (tz >= 13 && tx >= 13) continue;
      let h = 0, mat = null;
      const roadX = tz < 9, roadZ = tx < 9;                      // inside an east-west / north-south carriageway
      if (roadX || roadZ) {
        const inter = roadX && roadZ;
        if (!inter && ((roadX && tz < 2) || (roadZ && tx < 2))) { h = SW; mat = M.lv11_median; }
        else {
          mat = hr(lx >> 2, lz >> 2, 11900 + a * 5 + b) < 0.2 ? M.lv11_road_b : M.lv11_road;
          if (!inter) {
            if (roadX && tz === 5) mat = M.lv11_dash_x;
            else if (roadZ && tx === 5) mat = M.lv11_dash_z;
          }
          if (roadX && !roadZ && (tx === 10 || tx === 11) && tz > 1) mat = M.lv11_zebra_x;
          if (roadZ && !roadX && (tz === 10 || tz === 11) && tx > 1) mat = M.lv11_zebra_z;
        }
      } else { h = SW; mat = hr(lx >> 2, lz >> 2, 11910 + a * 3 + b) < 0.15 ? M.lv11_plaza : M.lv11_walk; }
      zb.floor[zb.i(x0 + lx, z0 + lz)] = h;
      zb.fmat[zb.i(x0 + lx, z0 + lz)] = mat;
      void i;
    }
  }
  // ---- the four lots
  const lots = [];
  for (let qz = 0; qz < 2; qz++) for (let qx = 0; qx < 2; qx++) lots.push(lot(zb, qx, qz, a, b));
  // ---- signals: this zone draws the pole in each of its four corners, for the intersection there
  const corners = [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]];
  for (const [ix, iz, sx, sz] of corners) {
    const ia = a + ix, ib = b + iz, grp = (ia + ib) & 1, c0 = 1 + grp * 6;
    const px = (ix ? x1 : x0) + sx * 10.5, pz = (iz ? z1 : z0) + sz * 10.5;
    const fx = sx > 0 ? 'W' : 'E', fz = sz > 0 ? 'N' : 'S';
    signalPole(zb, px, pz, [{ face: fz, chans: [c0, c0 + 1, c0 + 2] }, { face: fx, chans: [c0 + 3, c0 + 4, c0 + 5] }], { y: SW });
    if (ix === 1 && iz === 1 && owns(zb, px, pz)) zb.emitter(px, 4, pz, 'lv11_buzz', { vol: 0.45, rad: 16 });
  }
  // ---- dead street lamps along the pavements, cars standing in the lanes
  for (const [edge, along] of [[0, 'z'], [1, 'z'], [0, 'x'], [1, 'x']]) {
    for (let k = 0; k < 5; k++) {
      const s = 14 + k * 22 + hr(a * 4 + k, b * 4 + edge, 12000) * 6;
      const e = edge ? G - 11.5 : 11.5;
      const lx = along === 'z' ? e : s, lz = along === 'z' ? s : e;
      const nearEnd = s < 16 || s > G - 16;
      if (hr(a + k, b * 3 + edge + (along === 'x' ? 7 : 0), 12010) < 0.7 && !nearEnd) {
        const dir = along === 'z' ? (edge ? 'E' : 'W') : (edge ? 'S' : 'N');
        lamp(zb, x0 + lx, z0 + lz, dir, { y: SW, h: 8.5, arm: 2.4, dead: true });
      }
      // a car in a lane (not too close to the intersections)
      if (!nearEnd && hr(a + k * 3, b * 3 + edge + (along === 'x' ? 5 : 0), 12020) < 0.3) {
        const lane = 1.8 + hr(a + k, b + edge, 12030) * 4.6;           // metres from the median edge
        const east = hr(a, b + k, 12040) < 0.5;
        const dist = 2 + lane + 0.2;                                  // from the zone edge
        const cx = along === 'z' ? (edge ? x1 - dist : x0 + dist) : x0 + s, cz = along === 'z' ? z0 + s : (edge ? z1 - dist : z0 + dist);
        if (owns(zb, cx, cz)) {
          const rot = along === 'z' ? (edge ? Math.PI : 0) : (edge ? -Math.PI / 2 : Math.PI / 2);
          zb.prop('g04_car', cx, 0, cz, rot + (hr(a + k, b + edge, 12050) - 0.5) * 0.1, {
            kind: CAR_KINDS[Math.floor(hr(a + k, b + edge, 12060) * 5)], col: CAR_COLS[Math.floor(hr(a + k, b + edge, 12070) * 6)], dust: true,
            door: hr(a + k, b + edge, 12080) < 0.3 ? 1 : 0, flat: hr(a + k, b + edge, 12090) < 0.25, hood: hr(a + k, b + edge, 12100) < 0.1,
          });
        }
        void east;
      }
    }
  }
  // ---- a door on the pavement in front of a lot
  if (hr(a, b, 12200) < 0.9) {
    const q = Math.floor(hr(a, b, 12210) * 4), qx = q & 1, qz = q >> 1;
    const s = 20 + hr(a, b, 12220) * 40;
    const frontZ = qz ? G - 11.5 : 11.5;
    const px = x0 + (qx ? G - s : s), pz = z0 + frontZ;
    if (owns(zb, px, pz)) levelDoor(zb, px, pz, qz ? Math.PI : 0, { y: SW });
  }
  void lots;
}

defineZone('lv11_city', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.62, 0.58, 0.54],
    env: env({ fog: [0.72, 0.62, 0.5], fogNear: 14, fogFar: 88, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'lv11_ruin' }),
  }),
  gen,
});

// ------------------------------------------------------------------ the lights keep time
// channels 1-6 and 7-12: two groups, half a cycle apart; each group is [NS red, amber, green, EW red, amber, green]
function lamps(t, off) {
  const u = (((t + off) % CYCLE) + CYCLE) % CYCLE;
  if (u < 10) return [0, 0, 1, 1, 0, 0];
  if (u < 13) return [0, 1, 0, 1, 0, 0];
  if (u < 14) return [1, 0, 0, 1, 0, 0];
  if (u < 24) return [1, 0, 0, 0, 0, 1];
  if (u < 27) return [1, 0, 0, 0, 1, 0];
  return [1, 0, 0, 1, 0, 0];
}
const stage = (t, off) => { const u = (((t + off) % CYCLE) + CYCLE) % CYCLE; return u < 10 ? 0 : u < 13 ? 1 : u < 14 ? 2 : u < 24 ? 3 : u < 27 ? 4 : 5; };

defineLevel(N, {
  name: 'THE RUINED CITY',
  zoneType: 'lv11_city',
  zoneSize: G,
  entry: { x: 56.5, y: 0, z: 5.5, yaw: Math.PI / 2 },
  doorDensity: 0.3,
  viewRadius: 5,
  sky: {
    top: [0.34, 0.37, 0.42], horizon: [0.76, 0.66, 0.52], ground: [0.4, 0.36, 0.3], curve: 0.5,
    sun: { dir: [0.55, 0.16, -0.7], color: [1.0, 0.8, 0.5], size: 0.06, halo: 0.45 },
    clouds: { layer: 'lv11_smog', color: [0.6, 0.54, 0.48], amount: 0.75, speed: 0.003, scale: 0.35 },
    band: { layer: 'lv11_skyline', color: [0.9, 0.82, 0.74], repeat: 5, top: 0.17, bottom: -0.03, fog: 0.55 },
  },
  weather: { kind: 'dust', amount: 0.4, color: [0.9, 0.82, 0.68, 0.45], wind: [0.7, 0.3], size: 0.02 },
  grade: { sat: 0.86, tint: [1.0, 0.97, 0.93] },
  light: { phoneRadius: 3.2, phoneIntensity: 0.12 },
  script(ctx, dt) {
    const g = ctx.game, s = ctx.state, t = ctx.time, p = ctx.player;
    driveChannels(g, t, (v, tt) => {
      for (let grp = 0; grp < 2; grp++) {
        const l = lamps(tt, grp * 14);
        for (let k = 0; k < 6; k++) v[1 + grp * 6 + k] = l[k] ? 1 : 0.05;
      }
    });
    // a relay clacks at the nearest intersection whenever its lights change
    const ia = Math.round(p.x / G), ib = Math.round(p.z / G), grp = (ia + ib) & 1;
    const st = stage(t, grp * 14);
    if (s.last !== undefined && s.key === ia + ',' + ib && st !== s.last) {
      const d = Math.hypot(p.x - ia * G, p.z - ib * G);
      if (d < 70) g.audioCall('play', 'relay', ia * G + 9, 3, ib * G + 9, { vol: 0.7 });
    }
    s.last = st; s.key = ia + ',' + ib;
    // far off, something gives way
    s.t = (s.t ?? 45) - dt;
    if (s.t <= 0) {
      s.t = 50 + Math.random() * 80;
      const a = Math.random() * Math.PI * 2, d = 45 + Math.random() * 30;
      g.audioCall('play', 'lv11_collapse', p.x + Math.sin(a) * d, p.y + 5, p.z - Math.cos(a) * d, { distant: true, vol: 1 });
    }
  },
});
