// Level 43: The Long Drive. A six-lane highway under a low, even cloud, running straight in both
// directions for ever: lane lines, a concrete barrier down the middle, guard rails, green signs on
// gantries, mile markers that count up as you walk, and every few hundred metres a viaduct that
// crosses overhead on tall pillars. Cars stand in the lanes with their doors open. There are no
// junctions. Beyond the ditches the land rolls away under lines of pylons.
//
// Every second 128 m zone row carries a highway (256 m apart); the rows between are open country.
import { pfbm } from '../../gfx/texgen.js';
import { signTex } from '../../gfx/textures.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, fbm, levelDoor, env } from './kit.js';
import {
  defineTexture, defineMaterial, hr, owns, cbox, M, mul, FACE, only,
  paintAsphalt, paintConcrete, paintGrass, paintLeaves, stripe,
} from './g04_kit.js';

const N = 43;
const G = 128, ZC = 64, PERIOD = 256;
const BX = 320;                                          // spacing of the viaducts
const CF_SMOOTH = 512;

// ------------------------------------------------------------------ textures
const ASPH = [98, 100, 104];
defineTexture('lv43_road', (p) => paintAsphalt(p, ASPH, { cracks: 3, speckle: 80, noise: 0.07 }), 12);
defineTexture('lv43_dash', (p) => { paintAsphalt(p, ASPH, { cracks: 0, noise: 0.07 }); stripe(p, 'x', 28, 8, [214, 214, 206], [16, 48]); }, 12);
defineTexture('lv43_solid_w', (p) => { paintAsphalt(p, ASPH, { cracks: 0, noise: 0.07 }); stripe(p, 'x', 28, 8, [214, 214, 206]); }, 12);
defineTexture('lv43_solid_y', (p) => { paintAsphalt(p, ASPH, { cracks: 0, noise: 0.07 }); stripe(p, 'x', 28, 8, [222, 188, 60]); }, 12);
defineTexture('lv43_shoulder', (p) => { paintAsphalt(p, [112, 112, 112], { cracks: 4, speckle: 100, noise: 0.1 }); for (let x = 0; x < 64; x += 8) p.rect(x, 0, 2, 64, [90, 90, 92], 0.6); }, 12);
defineTexture('lv43_median', (p) => paintConcrete(p, [150, 148, 142], { cracks: 2 }), 10);
defineTexture('lv43_barrier', (p) => { paintConcrete(p, [176, 174, 168], { joints: false, cracks: 1, noise: 0.05 }); p.rect(0, 0, 64, 3, [140, 138, 132]); p.rect(0, 22, 64, 2, [150, 148, 142], 0.7); }, 10);
defineTexture('lv43_deck', (p) => { paintConcrete(p, [122, 122, 120], { joints: false, cracks: 3, noise: 0.1 }); for (let x = 0; x < 64; x += 16) p.rect(x, 0, 1, 64, [88, 88, 86], 0.8); p.speckle(60, [70, 80, 60], 0.3, 0.6); }, 12);
defineTexture('lv43_pier', (p) => { paintConcrete(p, [138, 138, 134], { joints: false, cracks: 2, noise: 0.1 }); p.rect(30, 0, 1, 64, [100, 100, 98], 0.7); p.stain(32, 50, 14, [70, 78, 60], 0.35); }, 12);
defineTexture('lv43_rail', (p) => { p.fill([150, 154, 158]); p.rect(0, 14, 64, 3, [110, 114, 118]); p.rect(0, 30, 64, 3, [190, 194, 198]); p.rect(0, 44, 64, 3, [110, 114, 118]); p.noise(5, 0.1, 2); }, 6);
defineTexture('lv43_post', (p) => { p.fill([120, 124, 130]); p.noise(4, 0.12, 2); }, 4);
defineTexture('lv43_grass', (p) => paintGrass(p, [98, 116, 72], { noise: 0.14, tufts: 70, dirt: 30, dirtCol: [124, 108, 74] }), 12);
defineTexture('lv43_dry', (p) => paintGrass(p, [150, 140, 92], { noise: 0.14, tufts: 90, dark: 30 }), 12);
defineTexture('lv43_dirt', (p) => { p.fill([112, 96, 72]); p.noise(5, 0.2, 3); p.speckle(80, [140, 124, 96], 0.3, 0.7); p.speckle(60, [80, 66, 48], 0.3, 0.7); }, 10);
defineTexture('lv43_ditch', (p) => paintGrass(p, [78, 98, 58], { noise: 0.2, dark: 60 }), 10);
defineTexture('lv43_leaf', (p) => paintLeaves(p, [64, 90, 52], [110, 132, 72], { blobs: 70 }), 10);
defineTexture('lv43_leaf_b', (p) => paintLeaves(p, [100, 100, 56], [150, 140, 76], { blobs: 70 }), 10);
defineTexture('lv43_green', (p) => signTex(['NEXT EXIT', '190 MI'], [22, 110, 64], [244, 244, 236], 1)(p), 8);
defineTexture('lv43_green2', (p) => signTex(['NO', 'SERVICES'], [22, 110, 64], [244, 244, 236], 1)(p), 8);
defineTexture('lv43_green3', (p) => signTex(['LEVEL', '43'], [22, 110, 64], [244, 244, 236], 2)(p), 8);
defineTexture('lv43_green4', (p) => signTex(['KEEP', 'GOING'], [22, 110, 64], [244, 244, 236], 1)(p), 8);
defineTexture('lv43_marker', (p) => { p.fill([22, 100, 60]); p.frame(0, 0, 64, 64, [240, 240, 232]); p.text('MILE', 14, 5, [240, 240, 232], 2); }, 6);
for (let d = 0; d < 10; d++) defineTexture('lv43_dg' + d, (p) => { p.fill([22, 100, 60]); p.text(String(d), 14, 7, [244, 244, 236], 7); }, 4);
defineTexture('lv43_metal', (p) => { p.fill([96, 100, 106]); p.noise(5, 0.12, 2); }, 6);
defineTexture('lv43_trailer', (p) => { p.fill([214, 214, 208]); p.noise(4, 0.04, 2); for (let x = 0; x < 64; x += 8) p.rect(x, 0, 1, 64, [170, 170, 164]); p.stain(20, 50, 12, [120, 100, 80], 0.3); }, 8);
defineTexture('lv43_cab', (p) => { p.fill([170, 56, 44]); p.noise(4, 0.05, 2); p.rect(0, 40, 64, 2, [120, 40, 32]); }, 8);
defineTexture('lv43_wheel', (p) => { p.fill([30, 30, 32]); for (let y = 0; y < 64; y += 6) p.rect(0, y, 64, 2, [48, 48, 52]); }, 4);
defineTexture('lv43_clouds', (p) => {
  p.map((x, y) => {
    const n = pfbm(x, y, 3, 4, 17);
    const d = Math.max(0, Math.min(1, (n - 0.28) * 2.2));
    const sh = 0.45 + 0.55 * (1 - pfbm(x + 5, y + 8, 4, 3, 6));
    return [d * 255, sh * 255, 0];
  });
}, 0);
defineTexture('lv43_ridge', (p) => {
  p.clearAlpha(0);
  for (let x = 0; x < 64; x++) {
    const h = 9 + Math.round(5 * Math.sin(x * 0.2) + 3 * Math.sin(x * 0.55 + 1) + 2 * Math.sin(x * 1.3));
    for (let y = 64 - h; y < 64; y++) { p.set(x, y, mul([120, 132, 120], 0.85 + 0.2 * p.rng.next())); p.alpha(x, y, 255); }
  }
  // a pylon on the ridge
  for (const px of [14, 46]) { for (let y = 36; y < 52; y++) { p.set(px, y, [96, 104, 100]); p.alpha(px, y, 255); } for (let x = px - 3; x <= px + 3; x++) { p.set(x, 40, [96, 104, 100]); p.alpha(x, 40, 255); } }
}, 8);
const MATS = { road: 4, dash: 12, solid_w: 3, solid_y: 3, shoulder: 3, median: 2 };
Object.entries(MATS).forEach(([k, s]) => defineMaterial('lv43_' + k, 'lv43_' + k, k === 'dash' ? { su: 12, sv: 1, surf: 'asphalt' } : k.startsWith('solid') ? { su: 3, sv: 1, surf: 'asphalt' } : { s, surf: k === 'median' ? 'concrete' : 'asphalt' }));
defineMaterial('lv43_barrier', 'lv43_barrier', { s: 1.2, surf: 'concrete' });
defineMaterial('lv43_deck', 'lv43_deck', { s: 3, surf: 'concrete' });
defineMaterial('lv43_pier', 'lv43_pier', { s: 3, surf: 'concrete' });
defineMaterial('lv43_rail', 'lv43_rail', { s: 1.2, surf: 'metal' });
defineMaterial('lv43_post', 'lv43_post', { s: 1, surf: 'metal' });
defineMaterial('lv43_grass', 'lv43_grass', { s: 2.5, surf: 'grass' });
defineMaterial('lv43_dry', 'lv43_dry', { s: 2.5, surf: 'grass' });
defineMaterial('lv43_dirt', 'lv43_dirt', { s: 2.5, surf: 'grass' });
defineMaterial('lv43_ditch', 'lv43_ditch', { s: 2.5, surf: 'grass' });
defineMaterial('lv43_metal', 'lv43_metal', { s: 1, surf: 'metal' });
defineMaterial('lv43_trailer', 'lv43_trailer', { s: 2, surf: 'metal' });
defineMaterial('lv43_cab', 'lv43_cab', { s: 2, surf: 'metal' });
defineMaterial('lv43_wheel', 'lv43_wheel', { s: 0.5, surf: 'metal' });
for (let k = 1; k <= 4; k++) defineMaterial('lv43_green' + k, 'lv43_green' + (k === 1 ? '' : k), { s: 1, surf: 'metal' });
defineMaterial('lv43_marker', 'lv43_marker', { s: 1, surf: 'metal' });
defineMaterial('lv43_shadow', 'black', { s: 1 });

// ------------------------------------------------------------------ the land
const dHwy = (z) => { const r = (((z - ZC) % PERIOD) + PERIOD) % PERIOD; return Math.min(r, PERIOD - r); };
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function hAt(x, z) {
  const d = dHwy(z);
  if (d < 16.6) return 0;
  if (d < 19) return -0.7 * (d - 16.6) / 2.4;
  if (d < 22) return -0.7 + 0.7 * (d - 19) / 3;
  return (fbm(x, z, 110, 4311, 3) - 0.5) * 11 * smooth((d - 24) / 40);
}
const viaX = (k) => (k === 0 ? 74 : BX * k + 90 + hr(k, 7, 4301) * 140);
const CAR_COLS = [[0.7, 0.72, 0.76], [0.62, 0.2, 0.18], [0.24, 0.3, 0.5], [0.85, 0.85, 0.82], [0.3, 0.42, 0.34], [0.8, 0.7, 0.3], [0.3, 0.3, 0.32]];
const CAR_KINDS = ['sedan', 'sedan', 'wagon', 'van', 'pickup', 'sedan'];

function pylon(zb, x, z, y0) {
  if (!owns(zb, x, z)) return;
  const m = M.lv43_metal;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) zb.box(x + sx * 1.6 - 0.15, y0 - 0.5, z + sz * 1.6 - 0.15, x + sx * 1.6 + 0.15, y0 + 27, z + sz * 1.6 + 0.15, m);
  for (const y of [5, 10, 15, 20, 25]) {
    for (const sx of [-1, 1]) zb.box(x + sx * 1.6 - 0.05, y0 + y, z - 1.6, x + sx * 1.6 + 0.05, y0 + y + 0.1, z + 1.6, m, { collide: false });
    for (const sz of [-1, 1]) zb.box(x - 1.6, y0 + y, z + sz * 1.6 - 0.05, x + 1.6, y0 + y + 0.1, z + sz * 1.6 + 0.05, m, { collide: false });
  }
  for (const y of [22.5, 26]) zb.box(x - 0.1, y0 + y, z - 6, x + 0.1, y0 + y + 0.2, z + 6, m, { collide: false });
}

function gen(zb) {
  const { x0, z0, x1, z1 } = zb;
  const i = Math.floor(x0 / G), j = Math.floor(z0 / G);
  const hwy = (j & 1) === 0;
  zb.noConnectivity = true;
  // ground: heights on a 4 m lattice (global, so zones agree), interpolated per cell
  const NODES = G / 4 + 1, nodeH = new Float32Array(NODES * NODES);
  for (let nz = 0; nz < NODES; nz++) for (let nx = 0; nx < NODES; nx++) nodeH[nz * NODES + nx] = hAt(x0 + nx * 4, z0 + nz * 4);
  zb.fill(x0, z0, x1, z1, (x, z, i) => {
    const fx = (x + 0.5 - x0) / 4, fz = (z + 0.5 - z0) / 4;
    const ix = Math.min(NODES - 2, Math.floor(fx)), iz = Math.min(NODES - 2, Math.floor(fz)), tx = fx - ix, tz = fz - iz;
    const a = nodeH[iz * NODES + ix], b = nodeH[iz * NODES + ix + 1], c = nodeH[(iz + 1) * NODES + ix], d = nodeH[(iz + 1) * NODES + ix + 1];
    const h = (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
    zb.floor[i] = h; zb.ceil[i] = NaN; zb.flags[i] = CF_SMOOTH;
    const n = hr(x >> 3, z >> 3, 4320);
    zb.fmat[i] = h < -0.05 ? M.lv43_ditch : n < 0.22 ? M.lv43_dirt : n < 0.62 ? M.lv43_grass : M.lv43_dry;
  });
  const zc = z0 + ZC;
  if (hwy) {
    // ---- the carriageways, cell by cell
    for (let lz = ZC - 17; lz <= ZC + 17; lz++) {
      const rel = lz - ZC + 0.5;                      // distance of the cell centre from the axis (positive: south)
      const a = Math.abs(rel);
      let mat = null, h = 0;
      if (a < 1) mat = M.lv43_median;
      else if (a < 1.9) mat = M.lv43_solid_y;
      else if (a > 13 && a < 13.9) mat = M.lv43_solid_w;
      else if (Math.abs(a - 5.5) < 0.1 || Math.abs(a - 9.5) < 0.1) mat = M.lv43_dash;
      else if (a < 14) mat = M.lv43_road;
      else if (a < 17) mat = M.lv43_shoulder;
      if (!mat) continue;
      for (let x = x0; x < x1; x++) { const k = zb.i(x, z0 + lz); zb.floor[k] = h; zb.fmat[k] = mat; zb.flags[k] &= ~512; }
    }
    // ---- barrier down the middle, guard rails on both sides (with gaps)
    cbox(zb, x0, 0, zc - 0.36, x1, 0.95, zc + 0.36, M.lv43_barrier, { sub: 4 });
    for (const side of [-1, 1]) {
      const rz = zc + side * 17.4;
      for (let x = x0; x < x1; x += 4) {
        const gap = hr(Math.floor(x / 4) >> 3, side + 5 + j, 4350) < 0.28 && ((Math.floor(x / 4) & 7) < 2);
        if (gap) continue;
        zb.box(x + 0.9, 0, rz - 0.04, x + 1.1, 0.8, rz + 0.04, M.lv43_post, { collide: false });
        cbox(zb, x, 0.45, rz - 0.05, x + 4, 0.75, rz + 0.05, M.lv43_rail, { sub: 4 });
      }
    }
    // ---- mile markers
    for (let s = 0; s < 1; s++) {
      for (let x = Math.ceil(x0 / 160) * 160; x < x1; x += 160) {
        for (const side of [-1, 1]) {
          const mz = zc + side * 18.6, mx = x + 40;
          if (!owns(zb, mx, mz) || mx < x0 || mx >= x1) continue;
          const n = 4300 + Math.floor(x / 160), face = side > 0 ? 'nz' : 'pz';
          zb.box(mx - 0.04, 0, mz - 0.04, mx + 0.04, 1.5, mz + 0.04, M.lv43_post);
          zb.box(mx - 0.3, 0.9, mz - 0.03, mx + 0.3, 1.9, mz + 0.03, M.lv43_marker, { collide: false });
          const str = String(n);
          for (let q = 0; q < str.length; q++) {
            const dx = ((q - (str.length - 1) / 2) * 0.13) * (side > 0 ? -1 : 1);
            zb.decal(mx + dx, 1.12, mz + (side > 0 ? -0.034 : 0.034), face, 0.13, 0.26, 'lv43_dg' + str[q], { lit: true });
          }
        }
      }
    }
    // ---- gantries with green signs, one pair every so often
    for (let g = Math.floor(x0 / 480); g * 480 < x1; g++) {
      const gx = g === 0 && j === 0 ? 50 : g * 480 + 140 + hr(g, j, 4360) * 160;
      if (gx < x0 || gx >= x1 - 1) continue;
      const k = 1 + (Math.abs(g * 7 + j) % 4);
      for (const side of [-1, 1]) {
        const zs0 = side > 0 ? zc + 1.4 : zc - 14, zs1 = side > 0 ? zc + 14 : zc - 1.4;
        zb.box(gx - 0.2, 0, (side > 0 ? zc + 14.4 : zc - 14.9) , gx + 0.2, 7.1, (side > 0 ? zc + 14.9 : zc - 14.4), M.lv43_metal);
        zb.box(gx - 0.2, 0, (side > 0 ? zc + 1.1 : zc - 1.6), gx + 0.2, 7.1, (side > 0 ? zc + 1.6 : zc - 1.1), M.lv43_metal);
        zb.box(gx - 0.15, 6.7, zs0 - 0.2, gx + 0.15, 7.1, zs1 + 0.5, M.lv43_metal, { collide: false });
        // the panel faces the traffic: eastbound traffic (south half) looks toward +x, so the sign faces -x
        const mats = [M.lv43_metal, M.lv43_metal, M.lv43_metal, M.lv43_metal, M.lv43_metal, M.lv43_metal];
        mats[side > 0 ? 1 : 0] = M['lv43_green' + k];
        const sx0 = gx - 0.35, sx1 = gx + 0.35;
        const zm = (zs0 + zs1) / 2;
        zb.box(sx0, 3.7, zm - 2.5, sx1, 6.6, zm + 2.5, mats, { uv: 'fit', collide: false });
      }
    }
    // ---- cars standing in the lanes, doors open
    for (let s = 0; s < 6; s++) {
      const u = hr(i * 6 + s, j, 4400);
      if (u > 0.64) continue;
      const side = hr(i * 6 + s, j, 4401) < 0.5 ? -1 : 1;
      const lane = Math.floor(hr(i * 6 + s, j, 4402) * 3.2);
      const rel = side * (lane > 2 ? 15.2 : 3.5 + lane * 4);
      const cx = x0 + 8 + s * 21 + hr(i * 6 + s, j, 4403) * 9, cz = zc + rel + 0.5 * (hr(i, s, 4404) - 0.5);
      if (!owns(zb, cx, cz)) continue;
      if (i === 0 && j === 0 && cx < 70 && Math.abs(cz - (zc + 7.5)) < 5) continue;
      const kind = CAR_KINDS[Math.floor(hr(i * 6 + s, j, 4405) * CAR_KINDS.length)];
      zb.prop('g04_car', cx, 0, cz, (side > 0 ? Math.PI / 2 : -Math.PI / 2) + (hr(i * 6 + s, j, 4406) - 0.5) * 0.14, {
        kind, col: CAR_COLS[Math.floor(hr(i * 6 + s, j, 4407) * CAR_COLS.length)], dust: true,
        door: hr(i * 6 + s, j, 4408) < 0.3 ? (side > 0 ? 1 : 2) : 0, flat: hr(i * 6 + s, j, 4409) < 0.15, hood: hr(i * 6 + s, j, 4410) < 0.1,
      });
    }
    // ---- one lorry now and then: a long trailer, a red cab
    if (hr(i, j, 4420) < 0.4) {
      const tx = x0 + 30 + hr(i, j, 4421) * 60, side = hr(i, j, 4422) < 0.5 ? -1 : 1, tz = zc + side * 7.5;
      if (owns(zb, tx, tz)) {
        const fwd = side > 0 ? 1 : -1;                // the cab is ahead along the direction of travel
        const bx0 = Math.min(tx, tx + fwd * -12.5), bx1 = Math.max(tx, tx + fwd * -12.5);
        zb.box(bx0, 0.95, tz - 1.3, bx1, 4.2, tz + 1.3, M.lv43_trailer, { sub: 3 });
        zb.box(bx0 + 1, 0.3, tz - 0.9, bx1 - 1, 0.95, tz + 0.9, M.lv43_wheel);
        const cx0 = fwd > 0 ? tx + 0.4 : tx - 3.0, cx1 = fwd > 0 ? tx + 3.0 : tx - 0.4;
        zb.box(cx0, 0.5, tz - 1.2, cx1, 3.3, tz + 1.2, M.lv43_cab, { sub: 3 });
        for (const wx of [bx0 + 1.4, bx0 + 2.8, bx1 - 1.4, bx1 - 2.8, (cx0 + cx1) / 2]) for (const sz of [-1, 1]) zb.box(wx - 0.5, 0, tz + sz * 1.2 - 0.12, wx + 0.5, 1.0, tz + sz * 1.2 + 0.12, M.lv43_wheel, { collide: false });
      }
    }
    // ---- a door in a lane or on the shoulder
    if (hr(i, j, 4430) < 0.85) {
      const dx = x0 + 12 + hr(i, j, 4431) * 100, side = hr(i, j, 4432) < 0.5 ? -1 : 1;
      const onShoulder = hr(i, j, 4433) < 0.5;
      const dz = zc + side * (onShoulder ? 15.4 : 5.5 + (hr(i, j, 4434) < 0.5 ? 0 : 4));
      if (owns(zb, dx, dz) && !zb.props.some((p) => Math.abs(p.x - dx) < 5 && Math.abs(p.z - dz) < 3)) levelDoor(zb, dx, dz, onShoulder ? (side > 0 ? -Math.PI : 0) : Math.PI / 2 * (side > 0 ? 1 : -1) + Math.PI, { y: 0 });
    }
  } else {
    // ---- open country: pylons marching along the middle, trees, a door
    const pz = zc;
    for (let m = Math.floor((x0 - 8) / 96); m * 96 < x1 + 8; m++) {
      const px = m * 96 + 20;
      if (px >= x0 && px < x1) pylon(zb, px, pz, hAt(px, pz));
      // three wires to the next pylon, drooping
      const sp = [[0, 0.3, 24.8], [0.3, 0.7, 23.2], [0.7, 1, 24.8]];
      for (const off of [-5.2, 0, 5.2]) for (const [f0, f1, y] of sp) {
        const ax = px + 96 * f0, bx = px + 96 * f1;
        cbox(zb, ax, hAt(px, pz) + y, pz + off - 0.03, bx, hAt(px, pz) + y + 0.06, pz + off + 0.03, M.lv43_post, { collide: false });
      }
    }
    for (let k = 0; k < 9; k++) {
      const tx = x0 + 6 + hr(i, j, 4500 + k) * (G - 12), tz = z0 + 6 + hr(i, j, 4520 + k) * (G - 12);
      if (Math.abs(tz - pz) < 5) continue;
      const u = hr(i, j, 4540 + k);
      zb.prop('g04_tree', tx, hAt(tx, tz), tz, u * 6, u < 0.2 ? { h: 6 + u * 10, kind: 'bare', barkTint: [0.7, 0.7, 0.72] } : { h: 6 + u * 5, kind: u < 0.7 ? 'round' : 'tall', tex: u < 0.5 ? 'lv43_leaf' : 'lv43_leaf_b', tint: [0.95, 0.95, 0.95] });
    }
    if (hr(i, j, 4560) < 0.85) {
      const dx = x0 + 14 + hr(i, j, 4561) * 100, dz = z0 + 14 + hr(i, j, 4562) * 100;
      if (Math.abs(dz - pz) > 8 && owns(zb, dx, dz)) levelDoor(zb, dx, dz, hr(i, j, 4563) * 6.28, { y: hAt(dx, dz) });
    }
  }
  // ---- the viaducts: a deck on pillars crossing every highway, running straight over the fields
  for (let k = Math.floor((x0 - 20) / BX); k <= Math.floor(x1 / BX); k++) {
    const xk = viaX(k);
    if (xk + 8 < x0 || xk - 8 >= x1) continue;
    cbox(zb, xk - 6, 6.1, z0, xk + 6, 7.4, z1, M.lv43_deck, { sub: 6 });
    for (const sx of [-1, 1]) cbox(zb, xk + sx * 5.7 - 0.2, 7.4, z0, xk + sx * 5.7 + 0.2, 8.4, z1, M.lv43_pier, { sub: 6 });
    const pil = [];
    if (hwy) { pil.push(zc, zc - 18.6, zc + 18.6); for (let zz = z0 + 11; zz < z1; zz += 22) if (Math.abs(zz - zc) > 24) pil.push(zz); }
    else for (let zz = z0 + 11; zz < z1; zz += 22) pil.push(zz);
    for (const zp of pil) {
      const yb = hAt(xk, zp) - 0.6;
      for (const sx of [-1, 1]) zb.box(xk + sx * 3.2 - 0.9, yb, zp - 0.9, xk + sx * 3.2 + 0.9, 6.2, zp + 0.9, M.lv43_pier, { sub: 4 });
      zb.box(xk - 5.6, 5.3, zp - 1.1, xk + 5.6, 6.2, zp + 1.1, M.lv43_pier, { sub: 4 });
    }
    // the shade under the deck
    if (hwy) zb.box(xk - 8, 0.13, z0, xk + 8, 0.15, z1, M.lv43_shadow, { alpha: 0.36, collide: false, sub: 8, skip: only(FACE.PY) });
    if (hwy) zb.emitter(xk, 4, zc, 'lv43_whistle', { vol: 0.5, rad: 40 });
  }
}

defineZone('lv43_highway', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.66, 0.68, 0.7],
    env: env({ fog: [0.69, 0.72, 0.74], fogNear: 20, fogFar: 92, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'lv43_wind' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THE LONG DRIVE',
  zoneType: 'lv43_highway',
  zoneSize: G,
  entry: { x: 24.5, y: 0, z: 64.5 + 7.5, yaw: Math.PI / 2 },
  doorDensity: 0.3,
  viewRadius: 5,
  sky: {
    top: [0.42, 0.47, 0.52], horizon: [0.69, 0.72, 0.74], ground: [0.5, 0.52, 0.5], curve: 0.5,
    sun: { dir: [0.4, 0.28, -0.85], color: [0.95, 0.94, 0.88], size: 0.002, halo: 0.3 },
    clouds: { layer: 'lv43_clouds', color: [0.8, 0.82, 0.84], amount: 0.95, speed: 0.004, scale: 0.3 },
    band: { layer: 'lv43_ridge', color: [0.8, 0.85, 0.85], repeat: 6, top: 0.05, bottom: -0.03, fog: 0.62 },
  },
  grade: { sat: 0.84, tint: [1, 1, 0.99] },
  light: { phoneRadius: 3.2, phoneIntensity: 0.12 },
  // far off, loose steel moves in the wind
  script(ctx, dt) {
    const s = ctx.state;
    s.t = (s.t ?? 40) - dt;
    if (s.t > 0) return;
    s.t = 60 + Math.random() * 80;
    const p = ctx.player, a = Math.random() * Math.PI * 2;
    ctx.game.audioCall('play', 'lv43_clank', p.x + Math.sin(a) * 40, p.y + 3, p.z - Math.cos(a) * 40, { distant: true, vol: 0.9 });
  },
});
