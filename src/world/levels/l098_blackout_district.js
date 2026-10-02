// Level 98: The Blackout District. A residential area in a permanent power cut, lit by the moon
// alone: long dark roads between sleeping houses and dead trees, traffic signals that show
// nothing, poles with sagging wires. When the light of your phone goes out, windows in the
// houses around you start to glow, one after another, for a while. Raise the phone and they
// go dark again.
//
// Same lattice idea as level 37 (a junction in the middle of every zone, arms that exist or
// not), but 128 m apart, with wide lots and woods between the streets.
import { pfbm } from '../../gfx/texgen.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, openGround, levelDoor, env } from './kit.js';
import {
  defineTexture, defineMaterial, hr, owns, M, mul,
  paintAsphalt, paintConcrete, paintGrass, paintSiding, paintShingle, paintWindow, paintLeaves, stripe, driveChannels, signalPole,
} from './g04_kit.js';
import { placeHouse, houseSlots } from './g04_house.js';

const N = 98;
const G = 128, C = 64;
const RW = 3.5, SH = 2;                          // road half width, gravel shoulder
const FRONT = RW + SH + 8;                       // facade line from the road axis
const LAWN = 0.12, ROAD = 0, GRAV = 0.06;
const MOON = (() => { const l = Math.hypot(0.85, -0.15); return [0.85 / l, -0.15 / l]; })();

// ------------------------------------------------------------------ textures
defineTexture('lv98_road', (p) => paintAsphalt(p, [86, 90, 104], { cracks: 4, speckle: 60 }), 12);
defineTexture('lv98_road_x', (p) => { paintAsphalt(p, [86, 90, 104], { cracks: 0 }); stripe(p, 'x', 30, 4, [170, 160, 100], [20, 28]); }, 12);
defineTexture('lv98_road_z', (p) => { paintAsphalt(p, [86, 90, 104], { cracks: 0 }); stripe(p, 'z', 30, 4, [170, 160, 100], [20, 28]); }, 12);
defineTexture('lv98_gravel', (p) => { p.fill([96, 92, 88]); p.noise(6, 0.25, 2); p.speckle(160, [140, 136, 130], 0.4, 0.8); p.speckle(100, [50, 48, 46], 0.4, 0.8); }, 12);
defineTexture('lv98_grass', (p) => paintGrass(p, [78, 92, 64], { dark: 80, dirt: 40, dirtCol: [72, 64, 50], noise: 0.22 }), 12);
defineTexture('lv98_floor', (p) => paintGrass(p, [58, 68, 52], { dark: 120, dirt: 80, dirtCol: [60, 52, 42], noise: 0.25 }), 12);
defineTexture('lv98_drive', (p) => paintConcrete(p, [120, 118, 116], { cracks: 3, joints: false }), 12);
const WALLS = [[124, 128, 140], [140, 132, 120], [112, 124, 116], [134, 120, 118]];
WALLS.forEach((c, i) => defineTexture('lv98_siding' + i, (p) => paintSiding(p, c, { stain: 3 }), 10));
defineTexture('lv98_roof', (p, r) => paintShingle(p, r, [64, 64, 70], { moss: 30 }), 12);
defineTexture('lv98_win', (p) => paintWindow(p, { glass: [10, 14, 22], frame: [160, 164, 170], gleam: 2.0 }), 8);
defineTexture('lv98_wlit', (p) => paintWindow(p, { frame: [160, 150, 130], lit: [255, 200, 120], curtain: [190, 110, 60], curtainFull: false }), 8);
const DOORS = [[96, 40, 36], [44, 60, 84], [52, 72, 56], [110, 104, 96]];
DOORS.forEach((c, i) => defineTexture('lv98_door' + i, (p) => {
  p.fill(c); p.bevel(8, 6, 20, 24, -0.15, -0.1); p.bevel(36, 6, 20, 24, -0.15, -0.1); p.bevel(8, 36, 20, 22, -0.15, -0.1); p.bevel(36, 36, 20, 22, -0.15, -0.1);
  p.rect(52, 32, 5, 4, [170, 150, 90]); p.grain(0.06);
}, 8));
defineTexture('lv98_garage', (p) => {
  p.fill([150, 150, 146]);
  for (let y = 0; y < 64; y += 16) { p.rect(0, y, 64, 1, [100, 100, 96]); p.rect(0, y + 1, 64, 1, [170, 170, 166]); }
  p.stain(20, 40, 12, [90, 70, 50], 0.4);
}, 8);
defineTexture('lv98_pole', (p) => { p.fill([70, 58, 46]); p.noise(5, 0.2, 2); for (let x = 0; x < 64; x += 9) p.rect(x, 0, 1, 64, [40, 32, 26], 0.7); }, 6);
defineTexture('lv98_wire', (p) => { p.fill([10, 10, 12]); }, 2);
defineTexture('lv98_leaf', (p) => paintLeaves(p, [28, 44, 32], [48, 66, 44], { blobs: 70 }), 8);
defineTexture('lv98_pine', (p) => {
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) { const w = Math.max(1, Math.round((y / 64) * 28)); for (let x = 32 - w; x < 32 + w; x++) { if (p.rng.chance(0.82)) { p.set(x, y, mul([26, 44, 34], 0.8 + p.rng.next() * 0.5)); p.alpha(x, y, 255); } } }
}, 8);
defineTexture('lv98_sky_stars', (p) => { p.fill([0, 0, 0]); }, 2);
defineTexture('lv98_clouds', (p) => {
  p.map((x, y) => {
    const n = pfbm(x, y, 4, 4, 33);
    const d = Math.max(0, Math.min(1, (n - 0.55) * 4));
    const sh = 0.5 + 0.5 * pfbm(x + 3, y + 9, 5, 3, 4);
    return [d * 255, sh * 255, 0];
  });
}, 0);
WALLS.forEach((c, i) => defineMaterial('lv98_siding' + i, 'lv98_siding' + i, { su: 1.6, sv: 1.2, surf: 'wood' }));
defineMaterial('lv98_road', 'lv98_road', { s: 3, surf: 'asphalt' });
defineMaterial('lv98_road_x', 'lv98_road_x', { su: 6, sv: 1, surf: 'asphalt' });
defineMaterial('lv98_road_z', 'lv98_road_z', { su: 1, sv: 6, surf: 'asphalt' });
defineMaterial('lv98_gravel', 'lv98_gravel', { s: 2, surf: 'concrete' });
defineMaterial('lv98_grass', 'lv98_grass', { s: 2.5, surf: 'grass' });
defineMaterial('lv98_floor', 'lv98_floor', { s: 2.5, surf: 'grass' });
defineMaterial('lv98_drive', 'lv98_drive', { s: 2, surf: 'concrete' });
defineMaterial('lv98_roof', 'lv98_roof', { s: 1.5, surf: 'wood' });
defineMaterial('lv98_pole', 'lv98_pole', { s: 1, surf: 'wood' });
defineMaterial('lv98_wire', 'lv98_wire', { s: 1, surf: 'metal' });
defineMaterial('lv98_wall0', 'lv98_siding0', { su: 1.6, sv: 1.2, surf: 'wood' });

const CAR_COLS = [[0.45, 0.48, 0.54], [0.6, 0.2, 0.2], [0.24, 0.3, 0.46], [0.7, 0.7, 0.68], [0.22, 0.34, 0.28]];
const CAR_KINDS = ['sedan', 'sedan', 'wagon', 'van', 'pickup'];

// ------------------------------------------------------------------ the lattice
const raw = (a, b, s) => hr(a, b, s + 9800) < 0.58;
const dead = (a, b) => !raw(a, b, 1) && !raw(a - 1, b, 1) && !raw(a, b, 2) && !raw(a, b - 1, 2);
function edge(a, b, dir) {
  if (dir === 0) {
    if (a === 0 && b === 0) return true;
    if (a === -1 && b === 0) return true;
    return raw(a, b, 1) || dead(a, b) || dead(a + 1, b);
  }
  if (a === 0 && b === 0) return true;
  if (a === 0 && b === -1) return true;
  return raw(a, b, 2) || dead(a, b) || dead(a, b + 1);
}
const arms = (a, b) => [edge(a, b, 0), edge(a, b, 1), edge(a - 1, b, 0), edge(a, b - 1, 1)];
const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const PERP = DIR.map(([dx, dz]) => [-dz, dx]);
const FACE = ['E', 'S', 'W', 'N'];
const cellSet = (zb, x, z, floor, mat) => { if (zb.in(x, z)) { const i = zb.i(x, z); zb.floor[i] = floor; zb.fmat[i] = mat; } };
const rot2f = (fx, fz) => Math.atan2(fx, -fz);

function gen(zb) {
  openGround(zb, M.lv98_floor, LAWN);
  zb.noConnectivity = true;
  const { x0, z0 } = zb;
  const a = Math.floor(x0 / G), b = Math.floor(z0 / G);
  const arm = arms(a, b);
  const cx = x0 + C + 0.5, cz = z0 + C + 0.5;
  const any = arm.some(Boolean);
  const LO = C - 3, HI = C + 4;                                   // road cells [61, 68)
  const road = new Uint8Array(G * G), shoulder = new Uint8Array(G * G), lawn = new Uint8Array(G * G);
  for (let lz = 0; lz < G; lz++) for (let lx = 0; lx < G; lx++) {
    const inX = lx >= LO && lx < HI, inZ = lz >= LO && lz < HI;
    let r = 0;
    if (any && inX && inZ) r = 1;
    else if (inZ && lx < LO && arm[2]) r = 1;
    else if (inZ && lx >= HI && arm[0]) r = 1;
    else if (inX && lz < LO && arm[3]) r = 1;
    else if (inX && lz >= HI && arm[1]) r = 1;
    road[lz * G + lx] = r;
  }
  const at = (m, lx, lz) => (lx < 0 || lz < 0 || lx >= G || lz >= G ? 0 : m[lz * G + lx]);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? road : shoulder, add = [];
    for (let lz = 0; lz < G; lz++) for (let lx = 0; lx < G; lx++) {
      if (road[lz * G + lx] || shoulder[lz * G + lx]) continue;
      if (at(src, lx - 1, lz) || at(src, lx + 1, lz) || at(src, lx, lz - 1) || at(src, lx, lz + 1)) add.push(lz * G + lx);
    }
    for (const k of add) shoulder[k] = 1;
  }
  for (let lz = 0; lz < G; lz++) for (let lx = 0; lx < G; lx++) {
    const k = lz * G + lx, x = x0 + lx, z = z0 + lz;
    if (road[k]) {
      const inX = lx >= LO && lx < HI, inZ = lz >= LO && lz < HI;
      let mat = M.lv98_road;
      if (lz === C && !inX) mat = M.lv98_road_x;
      else if (lx === C && !inZ) mat = M.lv98_road_z;
      cellSet(zb, x, z, ROAD, mat);
    } else if (shoulder[k]) cellSet(zb, x, z, GRAV, M.lv98_gravel);
    else if (hr(lx >> 3, lz >> 3, a * 31 + b * 17 + 7) < 0.5) cellSet(zb, x, z, LAWN, M.lv98_grass);
  }
  const wp = (u, v, e) => [cx + DIR[e][0] * u + PERP[e][0] * v, cz + DIR[e][1] * u + PERP[e][1] * v];
  const pad = (e, u0, u1, v0, v1, mat, step = 0.5) => {
    for (let u = u0; u <= u1; u += step) for (let v = v0; v <= v1; v += step) { const [px, pz] = wp(u, v, e); cellSet(zb, Math.floor(px), Math.floor(pz), GRAV + 0.01, mat); }
  };
  const occ = [], lawnDoors = [];
  // ---- lots
  for (let e = 0; e < 4; e++) {
    if (!arm[e]) continue;
    for (const side of [-1, 1]) for (let slot = 0; slot < 3; slot++) {
      if (side > 0 && slot === 0) continue;
      const h = (s) => hr(a * 9 + e * 2 + (side > 0 ? 1 : 0), b * 3 + slot, 1500 + s);
      const u = 24 + slot * 16 + (h(1) - 0.5) * 1.5;
      const front = [-side * PERP[e][0], -side * PERP[e][1]];
      const rot = rot2f(front[0], front[1]);
      const sn = Math.round(Math.sin(rot)), cs = Math.round(Math.cos(rot));
      if (h(2) < 0.38) continue;                                  // empty lot: woods
      const garage = h(4) < 0.6 ? 1 : 0, gs = h(12) < 0.5 ? 1 : -1;
      const fl = h(6) < 0.7 ? 1 : 2;
      const w = fl === 1 ? 9.6 + h(5) * 1.2 : 8.4, d = fl === 1 ? 7.4 : 7.6, gw = 3.2;
      const o = {
        w, d, fl, kind: fl === 1 ? 'low' : 'gable', pitch: 0.5, sun: MOON,
        wall: 'lv98_siding' + Math.floor(h(8) * WALLS.length), roof: 'lv98_roof', trim: 'plastic_gray', door: 'lv98_door' + Math.floor(h(10) * DOORS.length),
        winDark: 'lv98_win', winLit: 'lv98_wlit', garage: garage ? gs : 0, gw, gdoor: 'lv98_garage', doorAt: garage ? -0.3 * gs : (h(13) - 0.5) * 0.5, porch: h(14) < 0.3 ? 2 : 1,
        chimney: h(15) < 0.6, baseY: LAWN, tint: [0.62, 0.7, 0.9], shellRoof: M.lv98_roof, ov: 0.7, sov: 0.5,
      };
      const slots = houseSlots(o);
      o.wm = new Array(slots).fill(-1);
      const used = [];
      for (let i = 0; i < slots; i++) if (h(20 + (i % 9)) < 0.5 && (i * 5 + slot) % 3 !== 1) { o.wm[i] = 1 + Math.floor(hr(a * 31 + e, b * 17 + slot * 5 + side, 2000 + i) * 12); used.push(o.wm[i]); }
      const shift = garage ? gs * gw / 2 : 0;
      const [bx, bz] = wp(u, side * FRONT, e);
      const ax = bx - cs * shift, az = bz - sn * shift;
      const info = placeHouse(zb, ax, az, rot, o);
      occ.push(info.fp); if (info.garageRect) occ.push(info.garageRect);
      // the windows' glow spills onto the ground in front: one light per channel in use
      [...new Set(used)].forEach((ch, k) => {
        const lxp = info.door[0] + (info.front[0] * 1.5) + PERP[e][0] * ((k - 1) * 3), lzp = info.door[1] + info.front[1] * 1.5 + PERP[e][1] * ((k - 1) * 3);
        if (owns(zb, lxp, lzp)) zb.light(lxp, 1.7, lzp, { color: [1.0, 0.74, 0.42], rad: 7.5, int: 1.1, ch });
      });
      // a dirt track from the door to the road
      const [dx, dz] = info.door;
      for (let t = 1.6; t <= FRONT - RW - SH + 0.5; t += 0.5) cellSet(zb, Math.floor(dx + info.front[0] * t), Math.floor(dz + info.front[1] * t), LAWN, M.lv98_gravel);
      let carAt = null;
      if (garage) {
        const gr = info.garageRect, gcx = (gr[0] + gr[2]) / 2, gcz = (gr[1] + gr[3]) / 2;
        const ug = (gcx - cx) * DIR[e][0] + (gcz - cz) * DIR[e][1];
        pad(e, ug - 1.3, ug + 1.3, side * (RW + 0.2), side * (FRONT - 0.5), M.lv98_drive, 0.4);
        const [px, pz] = wp(ug, side * (FRONT - 3.4), e);
        carAt = [px, pz];
        if (h(30) < 0.4 && owns(zb, px, pz)) zb.prop('g04_car', px, GRAV + 0.01, pz, rot2f(side * PERP[e][0], side * PERP[e][1]), { kind: CAR_KINDS[Math.floor(h(31) * 5)], col: CAR_COLS[Math.floor(h(32) * CAR_COLS.length)], dust: true, door: h(33) < 0.2 ? 1 : 0, flat: h(34) < 0.2 });
      }
      // dead trees and pines around the lot
      for (let k = 0; k < 3; k++) {
        const [tx, tz] = wp(u + (hr(a, b * 5 + slot, 3000 + k + e * 7) - 0.5) * 14, side * (RW + 5.5 + hr(a, b * 5 + slot, 3100 + k + e * 7) * 5), e);
        const ok = (!carAt || Math.hypot(tx - carAt[0], tz - carAt[1]) > 4) && Math.hypot(tx - dx - info.front[0] * 3, tz - dz - info.front[1] * 3) > 3;
        if (owns(zb, tx, tz) && ok) zb.prop('g04_tree', tx, LAWN, tz, k * 2 + h(35) * 3, h(36 + k) < 0.5 ? { h: 6 + h(40) * 3, kind: 'bare', barkTint: [0.5, 0.5, 0.56] } : { h: 7 + h(41) * 3, kind: 'round', tex: 'lv98_leaf', tint: [0.6, 0.68, 0.85] });
      }
      // a rusting mailbox on the verge
      if (h(42) < 0.6) { const [mx, mz] = wp(u + 3.2, side * (RW + SH + 0.8), e); if (owns(zb, mx, mz)) zb.prop('mailbox', mx, GRAV, mz, rot, { tint: [0.6, 0.55, 0.5] }); }
      if (h(43) < 0.2) lawnDoors.push({ x: dx + info.front[0] * 4.4, z: dz + info.front[1] * 4.4, rot });
    }
    // utility poles with sagging wire along the right of each arm
    for (let u = 20; u < 64; u += 22) {
      const [px, pz] = wp(u + (e & 1) * 3, RW + SH + 2.2, e);
      if (!owns(zb, px, pz)) continue;
      zb.box(px - 0.14, LAWN, pz - 0.14, px + 0.14, 9.2, pz + 0.14, M.lv98_pole);
      const along = DIR[e][0] !== 0;
      if (along) zb.box(px - 0.06, 8.3, pz - 1.0, px + 0.06, 8.45, pz + 1.0, M.lv98_pole, { collide: false });
      else zb.box(px - 1.0, 8.3, pz - 0.06, px + 1.0, 8.45, pz + 0.06, M.lv98_pole, { collide: false });
      // wires to the next pole (22 m on): two strands, drooping in the middle
      for (const off of [-0.8, 0.8]) {
        for (const [f0, f1, y] of [[0, 0.25, 8.35], [0.25, 0.75, 7.7], [0.75, 1, 8.35]]) {
          const wx0 = along ? px + DIR[e][0] * 22 * f0 : px + off, wz0 = along ? pz + off : pz + DIR[e][1] * 22 * f0;
          const wx1 = along ? px + DIR[e][0] * 22 * f1 : px + off, wz1 = along ? pz + off : pz + DIR[e][1] * 22 * f1;
          zb.box(Math.min(wx0, wx1) - 0.015, y - 0.015, Math.min(wz0, wz1) - 0.015, Math.max(wx0, wx1) + 0.015, y + 0.015, Math.max(wz0, wz1) + 0.015, M.lv98_wire, { collide: false });
        }
      }
    }
  }
  // ---- woods between the streets
  for (let k = 0; k < 60; k++) {
    const lx = 3 + hr(a, b, 4000 + k) * (G - 6), lz = 3 + hr(a, b, 4100 + k) * (G - 6);
    const ix = Math.floor(lx), iz = Math.floor(lz);
    let ok = true;
    for (let dz = -6; dz <= 6 && ok; dz += 3) for (let dx = -6; dx <= 6; dx += 3) if (at(road, ix + dx, iz + dz) || at(shoulder, ix + dx, iz + dz)) { ok = false; break; }
    if (!ok) continue;
    const wx = x0 + lx, wz = z0 + lz;
    if (occ.some((r) => wx > r[0] - 3 && wx < r[2] + 3 && wz > r[1] - 3 && wz < r[3] + 3)) continue;
    const u = hr(a, b, 4200 + k);
    zb.prop('g04_tree', wx, LAWN, wz, u * 6, u < 0.4 ? { h: 6 + hr(a, b, 4300 + k) * 4, kind: 'bare', barkTint: [0.5, 0.5, 0.56] } : u < 0.75 ? { h: 7 + hr(a, b, 4300 + k) * 4, kind: 'conifer', tex: 'lv98_pine', tint: [0.6, 0.7, 0.85] } : { h: 7 + hr(a, b, 4300 + k) * 3, kind: 'round', tex: 'lv98_leaf', tint: [0.6, 0.68, 0.85] });
  }
  // ---- dead traffic signals at the junction, a car or two left standing at the stop line
  const nArm = arm.filter(Boolean).length;
  if (nArm >= 3) {
    const R = RW + 1.2;
    const sig = (sx, sz, f1, f2) => signalPole(zb, cx + sx * R, cz + sz * R, [{ face: f1, chans: null }, { face: f2, chans: null }], { y: GRAV });
    sig(1, -1, 'N', 'E'); sig(-1, 1, 'S', 'W'); sig(-1, -1, 'N', 'W'); sig(1, 1, 'S', 'E');
  }
  if (nArm >= 2) {
    for (let e = 0; e < 4; e++) {
      if (!arm[e] || hr(a * 7 + e, b, 5000) > 0.4) continue;
      const [px, pz] = wp(RW + 8 + hr(a, b * 5 + e, 5001) * 14, 1.7, e);
      if (owns(zb, px, pz)) zb.prop('g04_car', px, ROAD, pz, rot2f(-DIR[e][0], -DIR[e][1]), { kind: CAR_KINDS[Math.floor(hr(a, b + e, 5002) * 5)], col: CAR_COLS[Math.floor(hr(a, b + e, 5003) * 5)], dust: true, door: hr(a, b, 5004 + e) < 0.3 ? 1 : 0 });
    }
  }
  // ---- doors on lawns and at the verge
  if (!zb.doors.some((d) => !d.arrival)) {
    if (lawnDoors.length && hr(a, b, 77) < 0.8) { const dd = lawnDoors[Math.floor(hr(a, b, 78) * lawnDoors.length)]; if (owns(zb, dd.x, dd.z)) levelDoor(zb, dd.x, dd.z, dd.rot, { y: LAWN }); }
    else {
      const e = Math.floor(hr(a, b, 80) * 4);
      const [px, pz] = wp(20 + hr(a, b, 81) * 30, (hr(a, b, 82) < 0.5 ? -1 : 1) * (RW + SH + 2.5), e);
      if (owns(zb, px, pz)) levelDoor(zb, px, pz, rot2f(-DIR[e][0], -DIR[e][1]), { y: GRAV });
    }
  }
}

defineZone('lv98_district', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.15, 0.18, 0.3],
    env: env({ fog: [0.05, 0.07, 0.125], fogNear: 4, fogFar: 64, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'lv98_moon' }),
  }),
  gen,
});

// ------------------------------------------------------------------ the windows answer the dark
const DELAY = [0, 3, 7, 4.5, 11, 6, 15, 9, 20, 13, 5, 17, 25];
const DUR = [0, 46, 52, 40, 60, 44, 70, 38, 50, 64, 42, 56, 48];
const CYCLE = 110;

defineLevel(N, {
  name: 'THE BLACKOUT DISTRICT',
  zoneType: 'lv98_district',
  zoneSize: G,
  entry: { x: 24.5, y: 0, z: 64.5, yaw: Math.PI / 2 },
  doorDensity: 0.4,
  viewRadius: 4,
  sky: {
    top: [0.012, 0.022, 0.06], horizon: [0.05, 0.07, 0.125], ground: [0.01, 0.015, 0.03], curve: 0.45,
    stars: 0.5,
    sun: { dir: [0.85, 0.33, -0.15], color: [0.86, 0.92, 1.0], size: 0.05, halo: 0.35 },
    clouds: { layer: 'lv98_clouds', color: [0.08, 0.1, 0.17], amount: 0.5, speed: 0.0015, scale: 0.35 },
  },
  light: { phoneRadius: 5, phoneIntensity: 0.3, phoneColor: [0.8, 0.95, 1.0] },
  script(ctx, dt) {
    const g = ctx.game, s = ctx.state;
    if (!s.cur) { s.cur = new Float32Array(13); s.dark = 0; }
    const lit = g.phone.up || g.phone.k > 0.08;      // the phone is out and shining
    if (lit) s.dark = 0; else s.dark += dt;
    const ph = s.dark % CYCLE;
    for (let c = 1; c <= 12; c++) {
      const want = !lit && s.dark > DELAY[c] && ph >= DELAY[c] % CYCLE && ph < DELAY[c] + DUR[c] ? 1 : 0;
      s.cur[c] += (want - s.cur[c]) * Math.min(1, dt * (want ? 4.5 : 8));
    }
    driveChannels(g, ctx.time, (v, t) => {
      for (let c = 1; c <= 12; c++) {
        const k = s.cur[c];
        v[c] = k < 0.03 ? 0 : k * (0.8 + 0.2 * Math.sin(t * (2.7 + c * 0.37) + c) * Math.sin(t * 1.1 + c * 2.1));
      }
    });
    // now and then the wind moves something in the dark
    s.t = (s.t ?? 30) - dt;
    if (s.t <= 0) {
      s.t = 40 + Math.random() * 60;
      const p = ctx.player, a = Math.random() * Math.PI * 2, d = 18 + Math.random() * 14;
      g.audioCall('play', 'lv98_creak', p.x + Math.sin(a) * d, p.y + 1.5, p.z - Math.cos(a) * d, { distant: true, vol: 0.9 });
    }
  },
});
