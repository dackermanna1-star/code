// Level 37: Suburban Loop. A bright, peaceful neighbourhood of lawns, sprinklers and quiet
// streets. Every road ends at the same house: a tall yellow one with a turret and a red door.
// It is always the same house, and never quite the same: the car in the drive, the curtains,
// the lights, the wind chime differ from one to the next.
//
// The streets form a lattice with a junction in the middle of every 64 m zone. Each of the four
// arms of a junction exists or not (decided by the edge it shares with the next junction), so
// roads run for a while and then end. A road that ends has the house standing where it would
// have continued.
import { pfbm } from '../../gfx/texgen.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, openGround, levelDoor, env } from './kit.js';
import {
  defineTexture, defineMaterial, hr, owns, M, mul,
  paintAsphalt, paintConcrete, paintGrass, paintSiding, paintShingle, paintWindow, paintLeaves, stripe,
} from './g04_kit.js';
import { placeHouse, houseSlots } from './g04_house.js';
import { placeLoopHouse } from './g04_l37house.js';

const N = 37;
const G = 64, C = 32;                         // zone size, junction centre offset
const RW = 4.5;                               // road half width (9 m wide road)
const WALK = 0.14, LAWN = 0.16;
const FRONT = RW + 2 + 6;                     // distance of the facade line from the road axis
const SUN = (() => { const l = Math.hypot(0.45, -0.35); return [0.45 / l, -0.35 / l]; })();

// ------------------------------------------------------------------ textures
defineTexture('lv37_road', (p) => paintAsphalt(p, [104, 106, 112], { grain: 0.07, cracks: 1, speckle: 70 }), 12);
defineTexture('lv37_walk', (p) => paintConcrete(p, [206, 204, 196], { grain: 0.04 }), 12);
defineTexture('lv37_drive', (p) => paintConcrete(p, [178, 176, 170], { grain: 0.05, joints: false, cracks: 1 }), 12);
defineTexture('lv37_grass', (p) => paintGrass(p, [92, 154, 64], { dark: 20, noise: 0.12 }), 12);
defineTexture('lv37_road_x', (p) => { paintAsphalt(p, [104, 106, 112], { grain: 0.07, speckle: 70 }); stripe(p, 'x', 29, 6, [236, 204, 70], [32, 32]); }, 12);
defineTexture('lv37_road_z', (p) => { paintAsphalt(p, [104, 106, 112], { grain: 0.07, speckle: 70 }); stripe(p, 'z', 29, 6, [236, 204, 70], [32, 32]); }, 12);
const WALLS = [[238, 226, 196], [186, 222, 200], [244, 200, 170], [176, 204, 236], [214, 196, 232], [244, 244, 238], [226, 150, 130]];
WALLS.forEach((c, i) => defineTexture('lv37_siding' + i, (p) => paintSiding(p, c, { grain: 0.02, noise: 0.03 }), 8));
const ROOFS = [[128, 84, 66], [150, 60, 54], [84, 100, 130], [70, 108, 78]];
ROOFS.forEach((c, i) => defineTexture('lv37_roof' + i, (p, r) => paintShingle(p, r, c, { grain: 0.05 }), 12));
const DOORS = [[176, 36, 32], [40, 92, 160], [56, 130, 72], [244, 240, 232], [220, 170, 40]];
DOORS.forEach((c, i) => defineTexture('lv37_door' + i, (p) => {
  p.fill(c); p.bevel(8, 6, 20, 24, -0.15, -0.1); p.bevel(36, 6, 20, 24, -0.15, -0.1); p.bevel(8, 36, 20, 22, -0.15, -0.1); p.bevel(36, 36, 20, 22, -0.15, -0.1);
  p.rect(52, 32, 5, 4, [230, 200, 100]);
}, 8));
defineTexture('lv37_garage', (p) => {
  p.fill([240, 238, 230]);
  for (let y = 0; y < 64; y += 16) { p.rect(0, y, 64, 1, [176, 174, 166]); p.rect(0, y + 1, 64, 1, [252, 252, 246]); }
  for (let x = 0; x < 64; x += 16) for (let y = 0; y < 64; y += 16) p.bevel(x + 3, y + 4, 10, 9, -0.06, -0.04);
}, 8);
const WINF = [246, 244, 236];
defineTexture('lv37_w', (p) => paintWindow(p, { frame: WINF, glass: [92, 126, 172], gleam: 1.4 }), 8);
defineTexture('lv37_wc', (p) => paintWindow(p, { frame: WINF, glass: [92, 126, 172], gleam: 1.4, curtain: [236, 222, 196] }), 8);
defineTexture('lv37_wcc', (p) => paintWindow(p, { frame: WINF, glass: [92, 126, 172], curtain: [190, 200, 226], curtainFull: true }), 8);
defineTexture('lv37_wlit', (p) => paintWindow(p, { frame: WINF, lit: [255, 226, 140] }), 8);
defineTexture('lv37_leaf', (p) => paintLeaves(p, [52, 124, 52], [112, 176, 80], { blobs: 80 }), 10);
defineTexture('lv37_leaf2', (p) => paintLeaves(p, [92, 150, 52], [170, 196, 84], { blobs: 80 }), 10);
defineTexture('lv37_blossom', (p) => paintLeaves(p, [226, 140, 170], [250, 200, 214], { blobs: 80 }), 10);
defineTexture('lv37_clouds', (p) => {
  p.map((x, y) => {
    const n = pfbm(x, y, 4, 4, 21);
    const d = Math.max(0, Math.min(1, (n - 0.5) * 5));
    const sh = 0.6 + 0.4 * (1 - pfbm(x + 7, y + 11, 5, 3, 8));
    return [d * 255, sh * 255, 0];
  });
}, 0);
defineTexture('lv37_treeline', (p) => {
  p.clearAlpha(0);
  const r = p.rng;
  for (let x = 0; x < 64; x++) {
    const h = 14 + Math.round(8 * Math.sin(x * 0.4) + 5 * Math.sin(x * 1.3 + 2) + r.range(-2, 2));
    for (let y = 64 - h; y < 64; y++) { p.set(x, y, mul([74, 128, 82], 0.8 + 0.35 * r.next())); p.alpha(x, y, 255); }
  }
}, 8);
defineTexture('lv37_hyd', (p) => { p.fill([200, 40, 36]); p.noise(4, 0.1, 2); }, 6);
defineTexture('lv37_stop', (p) => { p.fill([236, 236, 230]); p.disc(32, 32, 30, [196, 28, 28]); p.text('STOP', 10, 26, [246, 246, 240], 2); }, 6);
defineTexture('lv37_metal', (p) => { p.fill([150, 154, 160]); p.noise(5, 0.1, 2); }, 6);
WALLS.forEach((c, i) => defineMaterial('lv37_siding' + i, 'lv37_siding' + i, { su: 1.6, sv: 1.2, surf: 'wood' }));
ROOFS.forEach((c, i) => defineMaterial('lv37_roof' + i, 'lv37_roof' + i, { s: 1.5, surf: 'wood' }));
defineMaterial('lv37_road', 'lv37_road', { s: 3, surf: 'asphalt' });
defineMaterial('lv37_road_x', 'lv37_road_x', { su: 6, sv: 1, surf: 'asphalt' });
defineMaterial('lv37_road_z', 'lv37_road_z', { su: 1, sv: 6, surf: 'asphalt' });
defineMaterial('lv37_walk', 'lv37_walk', { s: 1.5, surf: 'concrete' });
defineMaterial('lv37_drive', 'lv37_drive', { s: 2, surf: 'concrete' });
defineMaterial('lv37_grass', 'lv37_grass', { s: 2.5, surf: 'grass' });
defineMaterial('lv37_hyd', 'lv37_hyd', { s: 1, surf: 'metal' });
defineMaterial('lv37_metal', 'lv37_metal', { s: 1, surf: 'metal' });
defineMaterial('lv37_stop', 'lv37_stop', { s: 1, surf: 'metal' });

const CAR_COLS = [[0.95, 0.3, 0.25], [0.3, 0.5, 0.95], [0.96, 0.96, 0.92], [0.4, 0.75, 0.45], [0.96, 0.82, 0.3], [0.7, 0.7, 0.76]];
const CAR_KINDS = ['sedan', 'sedan', 'wagon', 'van', 'pickup'];

// ------------------------------------------------------------------ the lattice of streets
const raw = (a, b, s) => hr(a, b, s + 3700) < 0.62;
const dead = (a, b) => !raw(a, b, 1) && !raw(a - 1, b, 1) && !raw(a, b, 2) && !raw(a, b - 1, 2);
// does the road between junction (a, b) and the one to its east (dir 0) / south (dir 1) exist?
function edge(a, b, dir) {
  if (dir === 0) {
    if (a === 0 && b === 0) return false;           // the road the player arrives on ends at the house
    if (a === -1 && b === 0) return true;
    return raw(a, b, 1) || dead(a, b) || dead(a + 1, b);
  }
  if (a === 0 && b === 0) return true;
  if (a === 0 && b === -1) return true;
  return raw(a, b, 2) || dead(a, b) || dead(a, b + 1);
}
// arms of junction (a, b): 0 east, 1 south, 2 west, 3 north
const arms = (a, b) => [edge(a, b, 0), edge(a, b, 1), edge(a - 1, b, 0), edge(a, b - 1, 1)];
const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const PERP = DIR.map(([dx, dz]) => [-dz, dx]);

const cellSet = (zb, x, z, floor, mat) => { if (zb.in(x, z)) { const i = zb.i(x, z); zb.floor[i] = floor; zb.fmat[i] = mat; } };
const rot2f = (fx, fz) => Math.atan2(fx, -fz);

function gen(zb) {
  openGround(zb, M.lv37_grass, LAWN);
  zb.noConnectivity = true;
  const { x0, z0 } = zb;
  const a = Math.floor(x0 / G), b = Math.floor(z0 / G);
  const arm = arms(a, b);
  const cx = x0 + C + 0.5, cz = z0 + C + 0.5;                      // junction centre (the middle of the centre cell)
  const any = arm.some(Boolean);
  // ---- road mask, then pavements two cells wide around it
  const road = new Uint8Array(G * G), walk = new Uint8Array(G * G);
  for (let lz = 0; lz < G; lz++) for (let lx = 0; lx < G; lx++) {
    const inX = lx >= 28 && lx < 37, inZ = lz >= 28 && lz < 37;
    let r = 0;
    if (any && inX && inZ) r = 1;
    else if (inZ && lx < 28 && arm[2]) r = 1;
    else if (inZ && lx >= 37 && arm[0]) r = 1;
    else if (inX && lz < 28 && arm[3]) r = 1;
    else if (inX && lz >= 37 && arm[1]) r = 1;
    road[lz * G + lx] = r;
  }
  const at = (m, lx, lz) => (lx < 0 || lz < 0 || lx >= G || lz >= G ? 0 : m[lz * G + lx]);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? road : walk, add = [];
    for (let lz = 0; lz < G; lz++) for (let lx = 0; lx < G; lx++) {
      if (road[lz * G + lx] || walk[lz * G + lx]) continue;
      if (at(src, lx - 1, lz) || at(src, lx + 1, lz) || at(src, lx, lz - 1) || at(src, lx, lz + 1) || (pass === 0 && (at(road, lx - 1, lz - 1) || at(road, lx + 1, lz - 1) || at(road, lx - 1, lz + 1) || at(road, lx + 1, lz + 1)))) add.push(lz * G + lx);
    }
    for (const k of add) walk[k] = 1;
  }
  for (let lz = 0; lz < G; lz++) for (let lx = 0; lx < G; lx++) {
    const k = lz * G + lx, x = x0 + lx, z = z0 + lz;
    if (road[k]) {
      const inX = lx >= 28 && lx < 37, inZ = lz >= 28 && lz < 37;
      let mat = M.lv37_road;
      if (lz === 32 && !inX) mat = M.lv37_road_x;
      else if (lx === 32 && !inZ) mat = M.lv37_road_z;
      cellSet(zb, x, z, 0, mat);
    }
    else if (walk[k]) cellSet(zb, x, z, WALK, M.lv37_walk);
  }
  const wp = (u, v, e) => [cx + DIR[e][0] * u + PERP[e][0] * v, cz + DIR[e][1] * u + PERP[e][1] * v];
  const pad = (e, u0, u1, v0, v1, mat, step = 0.5) => {
    for (let u = u0; u <= u1; u += step) for (let v = v0; v <= v1; v += step) { const [px, pz] = wp(u, v, e); cellSet(zb, Math.floor(px), Math.floor(pz), WALK + 0.01, mat); }
  };
  const lawnDoors = [], occ = [];
  // ---- lots along the arms: the left side (v < 0) has two lots, the right side only the far one
  for (let e = 0; e < 4; e++) {
    if (!arm[e]) continue;
    for (const side of [-1, 1]) for (let slot = 0; slot < 2; slot++) {
      if (side > 0 && slot === 0) continue;
      const h = (s) => hr(a * 9 + e * 2 + (side > 0 ? 1 : 0), b * 2 + slot, 500 + s);
      const u = 17 + slot * 10 + (h(1) - 0.5) * 0.6;
      const front = [-side * PERP[e][0], -side * PERP[e][1]];
      const rot = rot2f(front[0], front[1]);
      const sn = Math.round(Math.sin(rot)), cs = Math.round(Math.cos(rot));
      if (h(2) < 0.07) {
        // an empty lot with a tree
        const [tx, tz] = wp(u, side * 14, e);
        if (owns(zb, tx, tz)) zb.prop('g04_tree', tx, LAWN, tz, h(3) * 6, { h: 6.5, kind: 'round', tex: 'lv37_leaf', tint: [0.9, 0.95, 0.9] });
        continue;
      }
      const garage = h(4) < 0.55 ? 1 : 0;
      const gs = h(12) < 0.5 ? 1 : -1;
      const w = garage ? 5.8 : 7.8, d = 7.6 + Math.floor(h(5) * 3) * 0.4, gw = 2.8;
      const o = {
        w, d, fl: h(6) < 0.6 ? 2 : 1, kind: h(7) < 0.45 ? 'gableZ' : h(7) < 0.8 ? 'gable' : 'hip', pitch: 0.55, sun: SUN,
        wall: 'lv37_siding' + Math.floor(h(8) * WALLS.length), roof: 'lv37_roof' + Math.floor(h(9) * ROOFS.length), trim: 'plastic_white',
        door: 'lv37_door' + Math.floor(h(10) * DOORS.length), winDark: ['lv37_w', 'lv37_wc', 'lv37_wcc'][Math.floor(h(11) * 3)], winLit: 'lv37_wlit',
        garage: garage ? gs : 0, gw, gdoor: 'lv37_garage', doorAt: garage ? -0.3 * gs : (h(13) - 0.5) * 0.5, porch: h(14) < 0.5 ? 2 : 1,
        chimney: h(15) < 0.5, baseY: LAWN, tint: [1, 1, 1], shutters: h(16) < 0.3 ? 'lv37_siding5' : null,
      };
      o.shellRoof = M['lv37_' + o.roof.slice(5)];
      const slots = houseSlots(o);
      o.wm = new Array(slots).fill(-1);
      for (let i = 0; i < slots; i++) if (h(20 + (i % 9)) < 0.12 && (i * 7 + slot) % 5 === 0) o.wm[i] = 0;
      // centre the whole block (house and garage) on the lot: shift the anchor along the facade
      const shift = garage ? gs * gw / 2 : 0;
      const [bx, bz] = wp(u, side * FRONT, e);
      const ax = bx - cs * shift, az = bz - sn * shift;
      const info = placeHouse(zb, ax, az, rot, o);
      occ.push(info.fp);
      if (info.garageRect) occ.push(info.garageRect);
      // front path to the pavement
      const [dx, dz] = info.door;
      for (let t = 1.6; t <= FRONT - RW - 1.6; t += 0.5) {
        for (const q of [-0.5, 0.5]) cellSet(zb, Math.floor(dx + info.front[0] * t + PERP[e][0] * q), Math.floor(dz + info.front[1] * t + PERP[e][1] * q), WALK + 0.01, M.lv37_walk);
      }
      let carAt = null;
      if (garage) {
        const gr = info.garageRect, gcx = (gr[0] + gr[2]) / 2, gcz = (gr[1] + gr[3]) / 2;
        const ug = (gcx - cx) * DIR[e][0] + (gcz - cz) * DIR[e][1];
        pad(e, ug - 1.2, ug + 1.2, side * (RW + 0.1), side * (FRONT - 0.5), M.lv37_drive, 0.4);
        const [px, pz] = wp(ug, side * (FRONT - 3.4), e);
        carAt = [px, pz];
        if (h(30) < 0.5 && owns(zb, px, pz)) zb.prop('g04_car', px, WALK + 0.01, pz, rot2f(side * PERP[e][0], side * PERP[e][1]), { kind: CAR_KINDS[Math.floor(h(31) * 5)], col: CAR_COLS[Math.floor(h(32) * CAR_COLS.length)] });
      }
      // a tree on the verge, away from the drive and the path
      if (h(33) < 0.6) {
        const [tx, tz] = wp(u + (h(34) < 0.5 ? -4.0 : 4.0), side * (RW + 3.6), e);
        const far = (p, q, r) => Math.hypot(p[0] - q[0], p[1] - q[1]) > r;
        if (owns(zb, tx, tz) && (!carAt || far([tx, tz], carAt, 3.4)) && far([tx, tz], [dx + info.front[0] * 3, dz + info.front[1] * 3], 3)) {
          zb.prop('g04_tree', tx, LAWN, tz, h(35) * 6, { h: 6 + h(36) * 2, kind: h(37) < 0.8 ? 'round' : 'tall', tex: h(38) < 0.15 ? 'lv37_blossom' : h(38) < 0.5 ? 'lv37_leaf' : 'lv37_leaf2', tint: [0.95, 0.98, 0.95] });
        }
      }
      // mailbox at the kerb
      if (h(39) < 0.7) {
        const [mx, mz] = wp(u + 3.2, side * (RW + 2.5), e);
        if (owns(zb, mx, mz) && !(carAt && Math.hypot(mx - carAt[0], mz - carAt[1]) < 2.2)) zb.prop('mailbox', mx, LAWN, mz, rot, {});
      }
      // a sprinkler on some lawns
      if (h(40) < 0.3) {
        const [sx2, sz2] = wp(u + (h(41) - 0.5) * 3, side * (RW + 4.8), e);
        if (owns(zb, sx2, sz2)) { zb.box(sx2 - 0.06, LAWN, sz2 - 0.06, sx2 + 0.06, 0.24, sz2 + 0.06, M.lv37_metal, { collide: false }); zb.emitter(sx2, 0.4, sz2, 'lv37_sprinkler', { vol: 0.7, rad: 14 }); }
      }
      if (h(42) < 0.25 && owns(zb, info.door[0], info.door[1])) zb.emitter(info.door[0], 2.0, info.door[1], 'lv37_chime', { vol: 0.6, rad: 12 });
      if (h(43) < 0.3) lawnDoors.push({ x: dx + info.front[0] * 4.4, z: dz + info.front[1] * 4.4, rot });
    }
  }
  // ---- the house at the end of each road that ends: it stands where the missing arm would be
  let houses = 0;
  for (let e = 0; e < 4; e++) {
    if (arm[e] || !arm[(e + 2) % 4]) continue;
    const h = (s) => hr(a * 5 + e, b * 3 + 1, 800 + s);
    const [ax, az] = wp(FRONT, 0, e);
    const rot = rot2f(-DIR[e][0], -DIR[e][1]);
    const ws = [];
    for (let i = 0; i < 18; i++) { const u = hr(a * 5 + e, b * 3 + 1, 900 + i); ws.push(u < 0.2 ? 3 : u < 0.5 ? 1 : u < 0.68 ? 2 : 0); }
    placeLoopHouse(zb, ax, az, rot, { ws, sun: SUN, baseY: LAWN, awn: h(1) < 0.5 });
    houses++;
    occ.push([ax - 14, az - 14, ax + 14, az + 14]);
    const sn = Math.round(Math.sin(rot)), cs = Math.round(Math.cos(rot));
    const loc = (lx, lz) => [ax + cs * lx - sn * lz, az + sn * lx + cs * lz];
    const padL = (lx0, lx1, lz0, lz1, mat) => { for (let lz = lz0; lz <= lz1; lz += 0.4) for (let lx = lx0; lx <= lx1; lx += 0.4) { const [px, pz] = loc(lx, lz); cellSet(zb, Math.floor(px), Math.floor(pz), WALK + 0.01, mat); } };
    padL(6.4, 8.8, -(FRONT - RW - 0.2), 4.5, M.lv37_drive);          // the drive beside the house
    padL(0.5, 1.7, -(FRONT - RW - 0.2), -2.6, M.lv37_walk);          // the path to the steps
    if (h(2) < 0.55) {
      const [px, pz] = loc(7.6, -1.5);
      if (owns(zb, px, pz)) zb.prop('g04_car', px, WALK + 0.01, pz, rot + Math.PI, { kind: CAR_KINDS[Math.floor(h(3) * 5)], col: CAR_COLS[Math.floor(h(4) * CAR_COLS.length)] });
    }
    const [mx, mz] = loc(5.4, -(FRONT - RW - 2.0));
    if (owns(zb, mx, mz)) zb.prop('mailbox', mx, LAWN, mz, rot, {});
    if (h(5) < 0.5) { const [sx2, sz2] = loc(-3, -7); if (owns(zb, sx2, sz2)) { zb.box(sx2 - 0.06, LAWN, sz2 - 0.06, sx2 + 0.06, 0.24, sz2 + 0.06, M.lv37_metal, { collide: false }); zb.emitter(sx2, 0.4, sz2, 'lv37_sprinkler', { vol: 0.8, rad: 16 }); } }
    if (h(6) < 0.5) { const [px, pz] = loc(-1.5, -1.8); if (owns(zb, px, pz)) zb.emitter(px, 2.3, pz, 'lv37_chime', { vol: 0.7, rad: 14 }); }
    for (const [lx, lz, k] of [[-9, -6, 0], [10.5, -5, 1], [-8, 8, 2]]) {
      const [tx, tz] = loc(lx, lz);
      if (owns(zb, tx, tz) && h(10 + k) < 0.85) zb.prop('g04_tree', tx, LAWN, tz, h(14 + k) * 6, { h: 7 + h(17 + k), kind: 'round', tex: k === 1 && h(20) < 0.4 ? 'lv37_blossom' : 'lv37_leaf', tint: [0.95, 0.98, 0.95] });
    }
    // the way out: a door on the lawn in front of the porch, in some of them
    if (h(7) < 0.5) { const [px, pz] = loc(-1.9, -7.2); levelDoor(zb, px, pz, rot, { y: LAWN }); lawnDoors.length = 0; }
  }
  // ---- trees on the open lawns between the streets
  for (let k = 0; k < 7; k++) {
    const lx = 3 + hr(a, b, 600 + k) * 58, lz = 3 + hr(a, b, 620 + k) * 58;
    const ix = Math.floor(lx), iz = Math.floor(lz);
    let ok = true;
    for (let dz = -7; dz <= 7 && ok; dz += 2) for (let dx = -7; dx <= 7; dx += 2) if (at(road, ix + dx, iz + dz) || at(walk, ix + dx, iz + dz)) { ok = false; break; }
    if (!ok) continue;
    if (occ.some((r) => lx + x0 > r[0] - 3 && lx + x0 < r[2] + 3 && lz + z0 > r[1] - 3 && lz + z0 < r[3] + 3)) continue;
    zb.prop('g04_tree', x0 + lx, LAWN, z0 + lz, hr(a, b, 640 + k) * 6, { h: 6 + hr(a, b, 650 + k) * 3, kind: hr(a, b, 660 + k) < 0.75 ? 'round' : 'tall', tex: hr(a, b, 670 + k) < 0.3 ? 'lv37_leaf2' : 'lv37_leaf', tint: [0.95, 0.98, 0.95] });
  }
  // ---- another door somewhere on a lawn, if this zone has none yet
  if (!zb.doors.some((d) => !d.arrival)) {
    if (lawnDoors.length && hr(a, b, 77) < 0.7) { const dd = lawnDoors[Math.floor(hr(a, b, 78) * lawnDoors.length)]; if (owns(zb, dd.x, dd.z)) levelDoor(zb, dd.x, dd.z, dd.rot, { y: LAWN }); }
    else if (hr(a, b, 79) < 0.5) {
      const e = Math.floor(hr(a, b, 80) * 4);
      const [px, pz] = wp(RW + 6.5, (hr(a, b, 81) < 0.5 ? -1 : 1) * (RW + 5), e);
      if (owns(zb, px, pz)) levelDoor(zb, px, pz, rot2f(-DIR[e][0], -DIR[e][1]), { y: LAWN });
    }
  }
  // ---- stop signs at the corners of junctions
  if (arm.filter(Boolean).length >= 3) {
    for (const [sx, sz] of [[-1, -1], [1, 1]]) {
      const x = cx + sx * (RW + 1.2), z = cz + sz * (RW + 1.2);
      if (!owns(zb, x, z)) continue;
      zb.box(x - 0.04, WALK, z - 0.04, x + 0.04, 2.3, z + 0.04, M.lv37_metal);
      zb.box(x - 0.3, 1.7, z - 0.03, x + 0.3, 2.3, z + 0.03, M.lv37_stop, { collide: false });
    }
  }
}

defineZone('lv37_loop', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.78, 0.8, 0.84],
    env: env({ fog: [0.74, 0.85, 0.96], fogNear: 26, fogFar: 88, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'lv37_day' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'SUBURBAN LOOP',
  zoneType: 'lv37_loop',
  zoneSize: G,
  entry: { x: -14.5, y: 0, z: 32.5, yaw: Math.PI / 2 },
  doorDensity: 0.3,
  viewRadius: 5,
  sky: {
    top: [0.22, 0.46, 0.9], horizon: [0.74, 0.85, 0.96], ground: [0.5, 0.62, 0.4], curve: 0.6,
    sun: { dir: [0.45, 0.8, -0.35], color: [1.0, 0.97, 0.82], size: 0.045, halo: 0.45 },
    clouds: { layer: 'lv37_clouds', color: [1, 1, 1], amount: 0.8, speed: 0.003, scale: 0.4 },
    band: { layer: 'lv37_treeline', color: [0.8, 0.95, 0.85], repeat: 7, top: 0.045, bottom: -0.03, fog: 0.55 },
  },
  light: { phoneRadius: 3, phoneIntensity: 0.12 },
});
