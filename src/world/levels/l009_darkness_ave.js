// Level 9: 9999 Darkness Ave. A perfectly ordinary suburban avenue at night, lamps burning, and
// every house completely dark: black windows, closed garages, cars sitting in driveways. The
// house numbers count up along the avenue toward 9999; the house with that number stands in
// the same place on every avenue of the level, and has a door on its lawn.
import { pfbm } from '../../gfx/texgen.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, openGround, levelDoor, env } from './kit.js';
import {
  defineTexture, defineMaterial, hr, owns, M,
  paintAsphalt, paintConcrete, paintGrass, paintSiding, paintShingle, paintWindow, paintLeaves, stripe, lamp,
} from './g04_kit.js';
import { placeHouse } from './g04_house.js';

const N = 9;
const G = 64, LOT = 16;
const R0 = 28, R1 = 37;                    // road rows (local z); the centre row is 32
const WALK = 0.14, LAWN = 0.16;
const NUM0 = 4981;                         // house number = 2 * (NUM0 + lot) (+ 1 on the north side)
const SIG_LOT = 18;                        // 9999 = 2 * (4981 + 18) + 1

// ------------------------------------------------------------------ textures and materials
defineTexture('lv9_road', (p) => paintAsphalt(p, [60, 60, 68], { cracks: 2 }), 12);
defineTexture('lv9_road_cl', (p) => { paintAsphalt(p, [60, 60, 68], { cracks: 0 }); stripe(p, 'x', 21, 6, [196, 166, 58]); stripe(p, 'x', 37, 6, [196, 166, 58]); }, 12);
defineTexture('lv9_walk', (p) => paintConcrete(p, [138, 136, 132], { cracks: 1 }), 12);
defineTexture('lv9_drive', (p) => paintConcrete(p, [120, 118, 116], { cracks: 2, joints: false }), 12);
defineTexture('lv9_grass', (p) => paintGrass(p, [52, 74, 44], { dark: 60 }), 12);
defineTexture('lv9_hedge', (p) => paintGrass(p, [34, 58, 34], { noise: 0.3, tufts: 150 }), 8);
const WALLS = [[112, 124, 142], [150, 142, 124], [118, 134, 118], [140, 118, 112], [128, 128, 132]];
WALLS.forEach((c, i) => defineTexture('lv9_siding' + i, (p) => paintSiding(p, c, { stain: 2 }), 10));
defineTexture('lv9_shingle', (p, r) => paintShingle(p, r, [74, 70, 76]), 12);
defineTexture('lv9_win', (p) => paintWindow(p, { glass: [9, 11, 17], frame: [150, 150, 156], gleam: 1.5 }), 8);
defineTexture('lv9_win_b', (p) => { paintWindow(p, { glass: [9, 11, 17], frame: [150, 150, 156], gleam: 1.5, curtain: [60, 54, 62], curtainFull: true }); }, 8);
const DOORS = [[96, 34, 34], [34, 56, 84], [44, 74, 52], [200, 196, 184], [86, 60, 40]];
DOORS.forEach((c, i) => defineTexture('lv9_door' + i, (p) => {
  p.fill(c); p.bevel(8, 6, 20, 24, -0.15, -0.1); p.bevel(36, 6, 20, 24, -0.15, -0.1); p.bevel(8, 36, 20, 22, -0.15, -0.1); p.bevel(36, 36, 20, 22, -0.15, -0.1);
  p.rect(52, 32, 5, 4, [190, 170, 96]); p.grain(0.04);
}, 8));
defineTexture('lv9_garage', (p) => {
  p.fill([176, 174, 168]);
  for (let y = 0; y < 64; y += 16) { p.rect(0, y, 64, 1, [120, 118, 112]); p.rect(0, y + 1, 64, 1, [196, 194, 188]); }
  for (let x = 0; x < 64; x += 16) for (let y = 0; y < 64; y += 16) p.bevel(x + 3, y + 4, 10, 9, -0.06, -0.04);
}, 8);
defineTexture('lv9_leaf', (p) => paintLeaves(p, [34, 58, 36], [60, 88, 52], { blobs: 80 }), 10);
defineTexture('lv9_leaf_b', (p) => paintLeaves(p, [52, 60, 30], [92, 98, 44], { blobs: 80 }), 10);
defineTexture('lv9_clouds', (p) => {
  p.map((x, y) => {
    const n = pfbm(x, y, 4, 4, 11);
    const d = Math.max(0, Math.min(1, (n - 0.4) * 3.0));
    const sh = 0.35 + 0.65 * pfbm(x + 9, y + 4, 6, 3, 5);
    return [d * 255, sh * 255, 0];
  });
}, 0);
defineTexture('lv9_bin', (p) => { p.fill([40, 84, 62]); p.noise(4, 0.12, 2); p.rect(0, 0, 64, 8, [30, 64, 48]); }, 6);
defineTexture('lv9_pole', (p) => { p.fill([74, 58, 44]); p.noise(5, 0.2, 2); for (let x = 0; x < 64; x += 9) p.rect(x, 0, 1, 64, [46, 36, 28], 0.7); }, 6);
defineTexture('lv9_hyd', (p) => { p.fill([170, 40, 34]); p.noise(4, 0.1, 2); }, 6);
for (let i = 0; i < WALLS.length; i++) defineMaterial('lv9_siding' + i, 'lv9_siding' + i, { su: 1.6, sv: 1.2, surf: 'wood', stain: 0.04 });
defineMaterial('lv9_road', 'lv9_road', { s: 3, surf: 'asphalt' });
defineMaterial('lv9_road_cl', 'lv9_road_cl', { su: 3, sv: 1, surf: 'asphalt' });
defineMaterial('lv9_walk', 'lv9_walk', { s: 1.5, surf: 'concrete' });
defineMaterial('lv9_drive', 'lv9_drive', { s: 2, surf: 'concrete' });
defineMaterial('lv9_grass', 'lv9_grass', { s: 2.5, surf: 'grass' });
defineMaterial('lv9_hedge', 'lv9_hedge', { s: 1.2, surf: 'grass' });
defineMaterial('lv9_shingle', 'lv9_shingle', { s: 1.5, surf: 'wood' });
defineMaterial('lv9_bin', 'lv9_bin', { s: 0.8, surf: 'plastic' });
defineMaterial('lv9_pole', 'lv9_pole', { s: 1, surf: 'wood' });
defineMaterial('lv9_hyd', 'lv9_hyd', { s: 1, surf: 'metal' });

const CAR_COLS = [[0.5, 0.52, 0.56], [0.7, 0.2, 0.2], [0.24, 0.3, 0.5], [0.8, 0.8, 0.78], [0.2, 0.34, 0.28], [0.3, 0.3, 0.32]];
const CAR_KINDS = ['sedan', 'sedan', 'wagon', 'van', 'pickup'];

// ------------------------------------------------------------------ the avenue
const fillCells = (zb, x0, z0, x1, z1, floor, mat) => zb.fill(x0, z0, x1, z1, (x, z, i) => { zb.floor[i] = floor; zb.fmat[i] = mat; });

// one lot: side 0 = north of the avenue (odd numbers, facade faces +z), side 1 = south
function lot(zb, k, j, side, lx0, z0) {
  const h = (s) => hr(k * 2 + side, j, s);
  const sig = side === 0 && k === SIG_LOT;
  const empty = !sig && h(1) < 0.09;
  const rot = side === 0 ? Math.PI : 0;
  const dirZ = side === 0 ? 1 : -1;                          // the way the facade looks
  const faceLz = side === 0 ? 19 : 46;
  const fz = z0 + faceLz;
  let tree = 0.6;
  if (!empty) {
    const w = [8.4, 9.6, 10.8][Math.floor(h(2) * 3)];
    const d = 7.5 + Math.floor(h(3) * 3) * 0.5;
    const fl = h(4) < 0.62 ? 2 : 1;
    const garage = h(5) < 0.62 ? 1 : 0;
    const gsW = h(6) < 0.5 ? 1 : -1;                         // garage on the east or west side
    const gsL = gsW * (side === 0 ? -1 : 1);                 // in the house's own coordinates
    const gw = 3.2;
    const tw = w + (garage ? gw : 0);
    const bx0 = lx0 + (LOT - tw) * (0.25 + 0.5 * h(7)) + (garage && gsW < 0 ? gw : 0);
    const cx = bx0 + w / 2;
    const num = side === 0 ? 2 * (NUM0 + k) + 1 : 2 * (NUM0 + k);
    const wallI = Math.floor(h(8) * WALLS.length);
    const doorAt = garage ? 0.3 * gsL : (h(9) - 0.5) * 0.6;
    const info = placeHouse(zb, cx, fz, rot, {
      w, d, fl, kind: fl === 2 ? (h(10) < 0.5 ? 'gable' : 'hip') : (h(10) < 0.5 ? 'low' : 'gable'), pitch: fl === 2 ? 0.5 : 0.42,
      wall: 'lv9_siding' + wallI, roof: 'lv9_shingle', trim: 'plastic_white', door: 'lv9_door' + Math.floor(h(11) * DOORS.length),
      winDark: h(12) < 0.4 ? 'lv9_win_b' : 'lv9_win', garage: garage ? gsL : 0, gw, gdoor: 'lv9_garage', doorAt, porch: h(13) < 0.5 ? 2 : 1,
      num, chimney: h(14) < 0.55, baseY: LAWN, tint: [0.78, 0.8, 0.9], shellRoof: M.lv9_shingle,
    });
    // front path and driveway
    const dx = info.door[0];
    if (side === 0) fillCells(zb, Math.floor(dx - 0.6), Math.floor(fz + 1.5), Math.ceil(dx + 0.6), z0 + 26, WALK + 0.01, M.lv9_walk);
    else fillCells(zb, Math.floor(dx - 0.6), z0 + 39, Math.ceil(dx + 0.6), Math.floor(fz - 1.5), WALK + 0.01, M.lv9_walk);
    let carX = null;
    if (garage) {
      const gr = info.garageRect;
      const gcx = (gr[0] + gr[2]) / 2;
      const a = Math.floor(gcx - 1.5), b = Math.ceil(gcx + 1.5);
      if (side === 0) fillCells(zb, a, Math.floor(fz + 0.5), b, z0 + R0, WALK + 0.01, M.lv9_drive);
      else fillCells(zb, a, z0 + R1, b, Math.ceil(fz - 0.5), WALK + 0.01, M.lv9_drive);
      carX = gcx;
      // a car in the driveway, nose toward the garage
      if (h(15) < 0.5) {
        const cz = side === 0 ? fz + 0.5 + 2.7 : fz - 0.5 - 2.7;
        if (owns(zb, carX, cz)) zb.prop('g04_car', carX, WALK + 0.01, cz, side === 0 ? 0 : Math.PI, { kind: CAR_KINDS[Math.floor(h(16) * CAR_KINDS.length)], col: CAR_COLS[Math.floor(h(17) * CAR_COLS.length)], dust: true });
      }
    }
    // a compressor humming at the side of the house
    if (h(18) < 0.3) zb.emitter(info.fp[0] - 0.5, 0.6, (info.fp[1] + info.fp[3]) / 2, 'lv9_ac', { vol: 0.5, rad: 11 });
    // the door that leads out of here: on the lawn in front of the house
    const wantDoor = sig || (h(19) < 0.3 && !(k === SIG_LOT - 1 && side === 0));
    if (wantDoor) {
      tree = -1;
      const px = info.door[0] + info.front[0] * 3.3, pz = info.door[1] + info.front[1] * 3.3;
      levelDoor(zb, px, pz, Math.atan2(info.front[0], -info.front[1]), { y: LAWN });
    }
    // trash bins at the kerb
    if (h(20) < 0.35) {
      const bx = lx0 + (LOT - 1.6) * h(21) + 0.4, bz = side === 0 ? z0 + 25.4 : z0 + 39.6;
      if (!(carX !== null && Math.abs(bx - carX) < 2.4)) {
        zb.box(bx - 0.3, LAWN, bz - 0.3, bx + 0.3, 1.0, bz + 0.3, M.lv9_bin);
        zb.box(bx - 0.34, 1.0, bz - 0.34, bx + 0.34, 1.08, bz + 0.34, M.lv9_bin);
      }
    }
    // front lawn tree, kept clear of the driveway and the door
    if (tree > 0 && h(22) < tree) {
      let tx = lx0 + 2 + h(23) * 12;
      const bad = (carX !== null && Math.abs(tx - carX) < 3.4) || Math.abs(tx - dx) < 2.6;
      if (!bad) zb.prop('g04_tree', tx, LAWN, side === 0 ? z0 + 22.6 + h(24) * 1.5 : z0 + 41.4 - h(24) * 1.5, h(25) * 6, { h: 5.5 + h(26) * 2.5, kind: 'round', tex: h(27) < 0.5 ? 'lv9_leaf' : 'lv9_leaf_b', tint: [0.7, 0.75, 0.85] });
    }
    // mailbox on the verge
    if (h(28) < 0.7) {
      const mx = dx + 2.2 * (h(29) < 0.5 ? 1 : -1), mz = side === 0 ? z0 + 25.6 : z0 + 39.4;
      if (owns(zb, mx, mz) && !(carX !== null && Math.abs(mx - carX) < 2)) zb.prop('mailbox', mx, LAWN, mz, side === 0 ? Math.PI : 0, {});
    }
  } else if (h(2) < 0.7) {
    // an empty lot: overgrown, with a bare tree
    zb.prop('g04_tree', lx0 + 4 + h(3) * 8, LAWN, side === 0 ? z0 + 14 : z0 + 50, h(4) * 6, { h: 6 + h(5) * 2, kind: 'bare', barkTint: [0.7, 0.7, 0.75] });
  }
  // a back yard tree now and then
  if (h(30) < 0.45) {
    zb.prop('g04_tree', lx0 + 2 + h(31) * 12, LAWN, side === 0 ? z0 + 4 + h(32) * 3 : z0 + 56 - h(32) * 3, h(33) * 6, { h: 6 + h(34) * 3, kind: h(35) < 0.7 ? 'round' : 'tall', tex: h(36) < 0.5 ? 'lv9_leaf' : 'lv9_leaf_b', tint: [0.7, 0.75, 0.85] });
  }
}

function gen(zb) {
  openGround(zb, M.lv9_grass, LAWN);
  zb.noConnectivity = true;
  const { x0, z0, x1 } = zb;
  const i = Math.floor(x0 / G), j = Math.floor(z0 / G);
  // the avenue: asphalt with a double yellow line, kerbs and pavements
  for (let x = x0; x < x1; x++) {
    for (let lz = R0; lz < R1; lz++) fillCells(zb, x, z0 + lz, x + 1, z0 + lz + 1, 0, lz === 32 ? M.lv9_road_cl : M.lv9_road);
    for (const lz of [26, 27, 37, 38]) fillCells(zb, x, z0 + lz, x + 1, z0 + lz + 1, WALK, M.lv9_walk);
  }
  // lots
  for (let m = 0; m < G / LOT; m++) {
    const k = i * (G / LOT) + m, lx0 = x0 + m * LOT;
    lot(zb, k, j, 0, lx0, z0);
    lot(zb, k, j, 1, lx0, z0);
  }
  // street lamps: one every lot boundary, alternating sides; a few dead, a few flickering
  for (let m = 0; m < G / LOT; m++) {
    const k = i * (G / LOT) + m, x = x0 + m * LOT + 0.5;
    const north = ((k + j) & 1) === 0;
    const u = hr(k, j, 40);
    const dead = u < 0.07, ch = !dead && u < 0.16 ? 1 + (k & 3) : 0;
    if (north) lamp(zb, x, z0 + 27.5, 'S', { h: 6.2, arm: 2.6, y: WALK, color: [1.0, 0.72, 0.4], rad: 12, int: 3.8, ch, dead, lens: ch ? M['g04_lens_y' + ch] : M.g04_lens_y });
    else lamp(zb, x, z0 + 37.5, 'N', { h: 6.2, arm: 2.6, y: WALK, color: [1.0, 0.72, 0.4], rad: 12, int: 3.8, ch, dead, lens: ch ? M['g04_lens_y' + ch] : M.g04_lens_y });
    // a hydrant by some of them
    if (hr(k, j, 41) < 0.4) {
      const hx = x + 3.2, hz = north ? z0 + 25.7 : z0 + 39.3;
      zb.box(hx - 0.16, LAWN, hz - 0.16, hx + 0.16, 0.7, hz + 0.16, M.lv9_hyd);
      zb.box(hx - 0.2, 0.7, hz - 0.2, hx + 0.2, 0.8, hz + 0.2, M.lv9_hyd);
    }
    // cars parked at the kerb
    if (hr(k, j, 42) < 0.16) {
      const cz = north ? z0 + 29.5 : z0 + 35.5;
      zb.prop('g04_car', x + 8, 0, cz, north ? Math.PI / 2 : -Math.PI / 2, { kind: CAR_KINDS[Math.floor(hr(k, j, 43) * 5)], col: CAR_COLS[Math.floor(hr(k, j, 44) * CAR_COLS.length)], dust: true });
    }
  }
  // the transformer on a pole in the back lots
  if (hr(i, j, 45) < 0.5) {
    const px = x0 + 8 + hr(i, j, 46) * 48, pz = z0 + 6.5;
    zb.box(px - 0.14, LAWN, pz - 0.14, px + 0.14, 9, pz + 0.14, M.lv9_pole);
    zb.box(px - 1.0, 8.2, pz - 0.06, px + 1.0, 8.4, pz + 0.06, M.lv9_pole);
    zb.box(px + 0.2, 6.6, pz - 0.2, px + 0.6, 7.6, pz + 0.2, M.metal_dark);
    zb.emitter(px, 7, pz, 'transformer', { vol: 0.3, rad: 22 });
  }
}

defineZone('lv9_avenue', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.11, 0.115, 0.18],
    env: env({ fog: [0.06, 0.055, 0.09], fogNear: 6, fogFar: 74, hum: 0.35, hvac: 0, reverb: 'outdoor', tone: 'lv9_night' }),
  }),
  gen,
});

defineLevel(N, {
  name: '9999 DARKNESS AVE.',
  zoneType: 'lv9_avenue',
  zoneSize: G,
  entry: { x: 13.5, y: 0, z: 32.5, yaw: Math.PI / 2 },
  doorDensity: 0.25,
  viewRadius: 5,
  sky: {
    top: [0.012, 0.014, 0.03], horizon: [0.07, 0.056, 0.075], ground: [0.02, 0.02, 0.03], curve: 0.5,
    clouds: { layer: 'lv9_clouds', color: [0.2, 0.13, 0.1], amount: 0.85, speed: 0.002, scale: 0.4 },
  },
  light: { phoneRadius: 4.2, phoneIntensity: 0.26 },
  // now and then the grid draws harder somewhere down the street: a swell of mains hum, far off
  script(ctx, dt) {
    const s = ctx.state;
    s.t = (s.t ?? 40) - dt;
    if (s.t > 0) return;
    s.t = 55 + Math.random() * 70;
    const p = ctx.player, a = Math.random() * Math.PI * 2;
    ctx.game.audioCall('play', 'lv9_surge', p.x + Math.sin(a) * 35, p.y + 6, p.z - Math.cos(a) * 35, { distant: true, vol: 0.8 });
  },
});
