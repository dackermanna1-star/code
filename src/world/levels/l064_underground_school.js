// Level 64: The Underground School. A school stands in a cavern too big to see the roof of: a
// lamp-lit road runs through classroom wings, courtyards and a bell tower, under rock that is
// thirty-six metres up. Nobody teaches. The bell rings every forty-five seconds.
// Layout (zone = 64 m, everything computed from absolute coordinates): a north-south road on the
// zone's west edge, an east-west road at z+32 that runs through the classroom wing's corridor,
// a wing (40 x 13: five classrooms each side of a corridor), a bell tower, boulders, stalagmites and
// rock columns; a slab of ceiling with stalactites and faint crystal specks 36 m up.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, env, M, W, hr, cbox, owns, levelDoor, ceilingLight, poleLamp } from './kit.js';
import { pmod, voidCells, floorSlab, ceilSlab, bigText } from './g08_kit.js';

const N = 64;
const Z = 64;
const CAVE = 36;                       // ceiling height
const WH = 3.4;                        // wing ceiling
const WX0 = 12, WW = 40, WZ0 = 26;     // wing: x 12..52, z 26..39 inside a zone; corridor z 31..34
const ROAD_Z = 31;                     // road / corridor cells z 31..33 (centre 32.5)

// ------------------------------------------------------------------ textures & materials
defineTexture('lv64_rock', (p) => {
  p.fill([62, 55, 50]);
  p.noise(5, 0.16, 3);
  p.noise(11, 0.1, 2, p.seed + 5);
  for (let i = 0; i < 9; i++) { const x = (i * 29 + 7) % 64, y = (i * 17 + 3) % 64; p.line(x, y, x + 12 - (i % 5) * 4, y + 9 - (i % 3) * 6, [34, 30, 28], 0.8); }
  p.speckle(70, [92, 84, 76], 0.3, 0.7);
  p.speckle(40, [38, 34, 32], 0.4, 0.8);
}, 10);
defineTexture('lv64_rockwall', (p) => {
  p.fill([44, 42, 44]);
  p.noise(4, 0.12, 3);
  for (let y = 4; y < 64; y += 9) p.rect(0, y + (y % 3), 64, 2, [60, 56, 58], 0.8);
  p.speckle(60, [70, 66, 68], 0.3, 0.6);
  p.speckle(50, [26, 24, 26], 0.4, 0.8);
}, 8);
defineTexture('lv64_path', (p) => {
  p.fill([98, 98, 92]);
  p.noise(4, 0.07, 2);
  p.grain(0.05);
  p.rect(0, 0, 64, 1, [60, 60, 56]); p.rect(0, 32, 64, 1, [60, 60, 56]);
  p.rect(0, 0, 1, 64, [60, 60, 56]); p.rect(32, 0, 1, 64, [60, 60, 56]);
  p.stain(40, 20, 9, [70, 66, 58], 0.4);
  p.speckle(60, [122, 122, 114], 0.3, 0.6);
}, 8);
defineTexture('lv64_brick', (p) => {
  p.fill([168, 152, 130]);
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? 8 : 0;
    for (let k = -1; k < 5; k++) {
      const x = k * 16 + off, c = 112 + ((row * 7 + k * 13) % 5) * 5;
      p.rect(x + 1, row * 8 + 1, 14, 6, [c + 18, c - 28, c - 50]);
    }
  }
  p.noise(3, 0.06, 2);
  p.grain(0.04);
}, 12);
defineTexture('lv64_plaster', (p) => {
  // pale grey-green above, a dark green dado below (bottom of the image is the floor)
  p.fill([176, 184, 166]);
  p.noise(3, 0.04, 2);
  p.rect(0, 38, 64, 26, [66, 98, 78]);
  p.rect(0, 36, 64, 3, [214, 208, 188]);
  p.grain(0.025);
  p.speckle(40, [150, 158, 142], 0.2, 0.5);
}, 10);
defineTexture('lv64_bronze', (p) => {
  p.fill([150, 106, 48]);
  p.map((x, y, c) => { const k = 0.8 + 0.4 * Math.abs(Math.sin(x * 0.1)); return [c[0] * k, c[1] * k, c[2] * k]; });
  p.rect(0, 0, 64, 6, [196, 156, 84]);
  p.noise(3, 0.08, 2);
}, 8);
defineTexture('lv64_crystal', (p) => { p.fill([110, 214, 255]); p.disc(32, 32, 20, [200, 250, 255]); }, 4);
defineTexture('lv64_lamp', (p) => { p.fill([255, 190, 100]); p.disc(32, 32, 22, [255, 236, 190]); }, 4);
defineTexture('lv64_slate', (p) => { p.fill([52, 58, 66]); p.noise(4, 0.1, 2); for (let y = 6; y < 64; y += 12) p.rect(0, y, 64, 1, [32, 36, 42]); }, 6);

defineMaterial('lv64_rock', 'lv64_rock', { s: 3, surf: 'concrete', stain: 0.05 });
defineMaterial('lv64_rockwall', 'lv64_rockwall', { s: 4, surf: 'concrete' });
defineMaterial('lv64_path', 'lv64_path', { s: 2, surf: 'concrete' });
defineMaterial('lv64_brick', 'lv64_brick', { su: 2, sv: 1, surf: 'concrete', stain: 0.08 });
defineMaterial('lv64_plaster', 'lv64_plaster', { su: 2, sv: WH, surf: 'drywall', stain: 0.06 });
defineMaterial('lv64_bronze', 'lv64_bronze', { s: 1, surf: 'metal' });
defineMaterial('lv64_crystal', 'lv64_crystal', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 1.0, chan: 10 });
defineMaterial('lv64_bulb', 'lv64_lamp', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 1.3 });
defineTexture('lv64_sign', (p) => {
  p.fill([26, 66, 48]);
  p.frame(0, 0, 64, 64, [214, 206, 170]); p.frame(2, 2, 60, 60, [120, 150, 110]);
  bigText(p, 'SCHOOL', 11, 17, 1, 4, [236, 228, 190]);
}, 6);
defineMaterial('lv64_slate', 'lv64_slate', { s: 1.5, surf: 'concrete' });

// ------------------------------------------------------------------ props
defineProp('lv64_tower', {
  // a brick bell tower: shaft, an open belfry with a bronze bell, a slate roof (front toward -z)
  build(mb) {
    const br = S('lv64_brick'), sl = S('lv64_slate'), bz = S('lv64_bronze'), dk = S('metal_dark');
    mb.box(-1.8, 0, -1.8, 1.8, 10.0, 1.8, br, { skip: 8 });
    mb.box(-2.0, 10.0, -2.0, 2.0, 10.3, 2.0, S('lv64_path'), { skip: 8 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 1.7 - 0.2, 10.3, sz * 1.7 - 0.2, sx * 1.7 + 0.2, 13.0, sz * 1.7 + 0.2, br, { skip: 8 });
    mb.box(-1.8, 12.5, -1.8, 1.8, 13.0, 1.8, br, { skip: 8 });
    // the bell
    mb.box(-0.06, 12.0, -0.06, 0.06, 12.5, 0.06, dk, { skip: 12 });
    mb.cyl(0, 11.0, 0, 0.5, 0.5, 6, bz, 1);
    mb.cyl(0, 11.5, 0, 0.36, 0.5, 6, bz, 1);
    mb.cyl(0, 12.0, 0, 0.22, 0.2, 6, bz, 1);
    // roof
    mb.box(-2.3, 13.0, -2.3, 2.3, 13.4, 2.3, sl, { skip: 8 });
    mb.box(-1.7, 13.4, -1.7, 1.7, 14.2, 1.7, sl, { skip: 8 });
    mb.box(-0.9, 14.2, -0.9, 0.9, 15.0, 0.9, sl, { skip: 8 });
    mb.box(-0.05, 15.0, -0.05, 0.05, 16.2, 0.05, dk, { skip: 12 });
  },
  boxes: [[-2.0, 0, -2.0, 2.0, 10.3, 2.0]],
});
defineProp('lv64_desks', {
  // a row of four school desks with their chairs (front -z)
  build(mb) {
    const w = S('wood_light'), m = S('metal_dark');
    mb.box(-1.6, 0.68, -0.3, 1.6, 0.72, 0.3, w, { skip: 8 });
    mb.box(-1.6, 0.3, 0.26, 1.6, 0.68, 0.3, m, { skip: 8 });
    for (const s of [-1, 1]) mb.box(s * 1.58 - 0.02, 0, -0.26, s * 1.58 + 0.02, 0.68, 0.26, m, { skip: 8 });
    for (let k = 0; k < 4; k++) {
      const x = -1.2 + k * 0.8;
      mb.box(x - 0.2, 0.4, 0.38, x + 0.2, 0.44, 0.78, w, { skip: 8 });
      mb.box(x - 0.2, 0.44, 0.74, x + 0.2, 0.86, 0.78, w, { skip: 8 });
    }
  },
  boxes: [[-1.62, 0, -0.3, 1.62, 0.74, 0.32]],
});
defineProp('lv64_swing', {
  build(mb) {
    const m = S('metal_green'), w = S('wood_dark');
    for (const sx of [-1, 1]) { mb.box(sx * 1.4 - 0.05, 0, -0.5, sx * 1.4 + 0.05, 2.4, -0.4, m, { skip: 8 }); mb.box(sx * 1.4 - 0.05, 0, 0.4, sx * 1.4 + 0.05, 2.4, 0.5, m, { skip: 8 }); }
    mb.box(-1.45, 2.4, -0.05, 1.45, 2.5, 0.05, m, { skip: 8 });
    for (const sx of [-0.5, 0.5]) { mb.box(sx - 0.01, 0.5, -0.01, sx + 0.01, 2.4, 0.01, m, { skip: 12 }); mb.box(sx - 0.2, 0.46, -0.1, sx + 0.2, 0.5, 0.1, w, { skip: 8 }); }
  },
  boxes: [[-1.5, 0, -0.5, 1.5, 0.6, 0.5]],
});

// ------------------------------------------------------------------ layout helpers
const towerAt = (ci, cj) => (ci === 0 && cj === 0) || hr(ci, cj, 3) < 0.35;
const zoneType = (ci, cj) => { if (ci === 0 && cj === 0) return 0; const h = hr(ci, cj, 1); return h < 0.62 ? 0 : h < 0.82 ? 1 : 2; };   // 0 wing, 1 courtyard, 2 open cave
const GATE = { x: -8.2, z0: 29, z1: 36 };       // the arrival: a wall standing in the road with a door in it

// the wing's cells: kind -1 outside, 0 corridor, 1..5 north rooms, 11..15 south rooms
function wingKind(ox, oz, x, z) {
  const rx = x - (ox + WX0), rz = z - (oz + WZ0);
  if (rx < 0 || rx >= WW || rz < 0 || rz >= 13) return -1;
  const room = 1 + Math.floor(rx / 8);
  if (rz < 5) return room;
  if (rz < 8) return 0;
  return 10 + room;
}

function genWing(zb, ox, oz, ci, cj) {
  const pb = M.lv64_brick, pl = M.lv64_plaster;
  const kd = (x, z) => wingKind(ox, oz, x, z);
  const wx0 = ox + WX0, wz0 = oz + WZ0;
  // floor plinth and ceiling
  zb.fill(wx0, wz0, wx0 + WW, wz0 + 13, (x, z, i) => { zb.floor[i] = 0.12; zb.ceil[i] = WH; });
  floorSlab(zb, wx0, wz0, wx0 + WW, wz0 + 13, M.lino_green, 0.12, 4);
  ceilSlab(zb, wx0, wz0, wx0 + WW, wz0 + 13, M.plaster, WH, 4);
  for (let z = wz0 - 1; z <= wz0 + 13; z++) {
    for (let x = wx0 - 1; x <= wx0 + WW; x++) {
      if (!zb.in(x, z)) continue;
      // west edge of (x, z): between (x - 1, z) and (x, z)
      let a = kd(x - 1, z), b = kd(x, z);
      if (a !== b) {
        const out = a < 0 || b < 0;
        const inner = a < 0 ? b : a;
        let type = W.WALL;
        if (out && inner === 0) type = W.DOOR;                       // the corridor's open ends
        
        zb.setWall(x, z, 'W', type, a < 0 ? pb : pl, b < 0 ? pb : pl);
      }
      // north edge of (x, z): between (x, z - 1) and (x, z)
      a = kd(x, z - 1); b = kd(x, z);
      if (a !== b) {
        const out = a < 0 || b < 0;
        const inner = a < 0 ? b : a;
        const off = pmod(x - wx0, 8);
        let type = W.WALL;
        if (out) type = off >= 2 && off <= 5 ? W.WINDOW : (off === 7 && hr(ci * 31 + Math.floor((x - wx0) / 8), cj * 7 + (a < 0 ? 0 : 1), 9) < 0.18 ? W.DOOR : W.WALL);
        else if (a === 0 || b === 0) type = off === 1 ? W.DOOR : W.WALL;     // classroom doorways
        zb.setWall(x, z, 'N', type, a < 0 ? pb : pl, b < 0 ? pb : pl);
        if (type === W.DOOR && out && inner > 0) levelDoor(zb, x + 0.5, z, a < 0 ? 0 : Math.PI);
      }
    }
  }
  if (owns(zb, wx0, wz0 + 6)) {
    zb.decal(wx0 - 0.1, 2.85, wz0 + 6.5, 'nx', 2.4, 0.6, 'lv64_sign', { lit: false, glow: 0.9, flags: VF.NOFOG });
    zb.decal(wx0 + WW + 0.1, 2.85, wz0 + 6.5, 'px', 2.4, 0.6, 'lv64_sign', { lit: false, glow: 0.9, flags: VF.NOFOG });
    // the end rooms' windows, lit from within
    for (const zz of [wz0 + 2.5, wz0 + 10.5]) {
      zb.decal(wx0 - 0.1, 1.7, zz, 'nx', 2.6, 1.3, 'window_lit', { lit: false, glow: 1.0, flags: VF.NOFOG });
      zb.decal(wx0 + WW + 0.1, 1.7, zz, 'px', 2.6, 1.3, 'window_lit', { lit: false, glow: 1.0, flags: VF.NOFOG });
    }
  }
  // rooms: desks, a board, a lamp; corridor: lockers and lamps
  for (let k = 0; k < 10; k++) {
    const north = k < 5, rx = wx0 + (k % 5) * 8, rz = north ? wz0 : wz0 + 8;
    if (!owns(zb, rx + 4, rz + 2.5)) continue;
    for (let row = 0; row < 3; row++) zb.prop('lv64_desks', rx + 2.9 + row * 1.7, 0.12, rz + 2.5, -Math.PI / 2, {});
    zb.decal(rx + 0.1, 1.5, rz + 2.5, 'px', 2.4, 1.1, 'chalkboard');
    ceilingLight(zb, rx + 4, rz + 2.5, 'cage', hr(ci * 17 + k, cj, 51) < 0.07 ? 'dying' : hr(ci * 17 + k, cj, 52) < 0.06 ? 'off' : 'on', { color: [1.0, 0.86, 0.6], mul: 1.15, rad: 7 });
  }
  for (let x = wx0 + 2; x < wx0 + WW; x += 5) {
    if (!owns(zb, x, wz0 + 6.5)) continue;
    ceilingLight(zb, x, wz0 + 6.5, 'cage', hr(x, oz, 53) < 0.1 ? 'flicker' : 'on', { color: [1.0, 0.86, 0.6], mul: 0.85, rad: 7 });
  }
  for (let k = 0; k < 5; k++) {
    const lx = wx0 + k * 8 + 6;
    if (!owns(zb, lx, wz0 + 6.5)) continue;
    zb.prop('locker', lx, 0.12, wz0 + 5.35, Math.PI, { n: 3 });
    zb.prop('locker', lx, 0.12, wz0 + 7.65, 0, { n: 3 });
  }
}

function lampRow(zb, ox, oz, wing) {
  const col = [1.0, 0.72, 0.4];
  // the north-south road (x cells ox..ox+3): a lamp every 10 m on alternating sides
  for (let k = 0; k < 7; k++) {
    const z = oz + 4 + k * 10;
    if (z > oz + 28 && z < oz + 38) continue;
    const west = k % 2 === 0;
    poleLamp(zb, west ? ox - 0.5 : ox + 3.5, z, 3.8, { y: 0.03, armX: west ? 0.9 : -0.9, lampMat: M.lv64_bulb, color: col, rad: 9, int: 0.9, on: hr(ox + k, oz, 61) > 0.07, ch: hr(ox, oz + k, 62) < 0.12 ? 2 : 0 });
  }
  // the east-west road through the gaps between wings
  const spans = wing ? [[ox + 4, ox + WX0 - 1], [ox + WX0 + WW + 1, ox + Z - 1]] : [[ox + 4, ox + Z - 1]];
  for (const [a, b] of spans) for (let x = a; x < b; x += 9) {
    poleLamp(zb, x + 0.5, oz + ROAD_Z - 0.6, 3.6, { y: 0.03, arm: false, lampMat: M.lv64_bulb, color: col, rad: 9, int: 0.85, on: hr(x, oz, 63) > 0.06 });
    poleLamp(zb, x + 5, oz + ROAD_Z + 3.6, 3.6, { y: 0.03, arm: false, lampMat: M.lv64_bulb, color: col, rad: 9, int: 0.85, on: hr(x, oz, 64) > 0.06 });
  }
}

function genRocks(zb, ox, oz, ci, cj, wing, type) {
  // keep boulders off the roads, the wing and the tower
  const ok = (x, z, r) => {
    if (x > ox - 3 - r && x < ox + 6 + r) return false;                         // north-south road
    if (z > oz + 28 - r && z < oz + 37 + r) return false;                       // east-west road
    if (wing && x > ox + WX0 - 4 - r && x < ox + WX0 + WW + 4 + r && z > oz + WZ0 - 4 - r && z < oz + WZ0 + 17 + r) return false;
    if (towerAt(ci, cj) && x > ox + 32 - 6 - r && x < ox + 32 + 6 + r && z > oz + 19 - 6 - r && z < oz + 19 + 6 + r) return false;
    if ((ci === 0 || ci === -1) && cj === 0 && x > -14 - r && x < 14 + r) return false;     // the arrival plaza stays clear
    return true;
  };
  for (let k = 0; k < 14; k++) {
    const x = ox + 2 + hr(ci * 5 + k, cj, 71) * 60, z = oz + 2 + hr(ci, cj * 5 + k, 72) * 60;
    const r = 0.6 + hr(ci + k, cj, 73) * 1.4;
    if (!ok(x, z, r + 1.5)) continue;
    cbox(zb, x - r, 0, z - r * 0.8, x + r, r * 0.9, z + r * 0.8, M.lv64_rock);
    if (r > 1.2) cbox(zb, x - r * 0.6, r * 0.9, z - r * 0.5, x + r * 0.5, r * 1.6, z + r * 0.5, M.lv64_rock);
    if (k % 5 === 0) zb.emitter(x, 1, z, 'drip', { vol: 0.5, rad: 12 });
  }
  // one great column per zone, thick as a house, reaching the ceiling
  for (let c = 0; c < 2; c++) {
    let cx = ox + 6 + hr(ci, cj, 81 + c * 10) * 50, cz = oz + 4 + (hr(ci, cj, 82 + c * 10) < 0.5 ? hr(ci, cj, 83 + c * 10) * 18 : 44 + hr(ci, cj, 83 + c * 10) * 16);
    if (ci === 0 && cj === 0) { cx = c ? 52 : 6; cz = c ? 8 : 52; }
    if (!ok(cx, cz, 5) && !(ci === 0 && cj === 0)) continue;
    cbox(zb, cx - 3.4, 0, cz - 3, cx + 3.4, 7, cz + 3, M.lv64_rockwall);
    cbox(zb, cx - 2.6, 7, cz - 2.4, cx + 2.8, 20, cz + 2.4, M.lv64_rockwall);
    cbox(zb, cx - 3.2, 20, cz - 2.8, cx + 3.4, CAVE, cz + 2.8, M.lv64_rockwall);
  }
  // stalagmites
  for (let k = 0; k < 6; k++) {
    const x = ox + 3 + hr(ci * 7 + k, cj, 91) * 58, z = oz + 3 + hr(ci, cj * 7 + k, 92) * 58;
    if (!ok(x, z, 2.5)) continue;
    cbox(zb, x - 0.7, 0, z - 0.7, x + 0.7, 1.2, z + 0.7, M.lv64_rockwall);
    cbox(zb, x - 0.45, 1.2, z - 0.45, x + 0.45, 2.4, z + 0.45, M.lv64_rockwall);
    cbox(zb, x - 0.2, 2.4, z - 0.2, x + 0.2, 3.4, z + 0.2, M.lv64_rockwall);
  }
  // stalactites and crystal specks in the ceiling, thirty-six metres up
  for (let k = 0; k < 8; k++) {
    const x = ox + 2 + hr(ci * 9 + k, cj, 101) * 60, z = oz + 2 + hr(ci, cj * 9 + k, 102) * 60;
    cbox(zb, x - 1.0, CAVE - 3, z - 1.0, x + 1.0, CAVE, z + 1.0, M.lv64_rockwall, { collide: false });
    cbox(zb, x - 0.6, CAVE - 7, z - 0.6, x + 0.6, CAVE - 3, z + 0.6, M.lv64_rockwall, { collide: false });
    cbox(zb, x - 0.25, CAVE - 11, z - 0.25, x + 0.25, CAVE - 7, z + 0.25, M.lv64_rockwall, { collide: false });
  }
  for (let k = 0; k < 28; k++) {
    const x = ox + hr(ci * 11 + k, cj, 111) * 64, z = oz + hr(ci, cj * 11 + k, 112) * 64;
    cbox(zb, x - 0.6, CAVE - 0.9, z - 0.6, x + 0.6, CAVE, z + 0.6, M.lv64_crystal, { collide: false });
  }
  void type;
}

function gen(zb) {
  const ci = Math.floor(zb.x0 / Z), cj = Math.floor(zb.z0 / Z), ox = ci * Z, oz = cj * Z;
  const type = zoneType(ci, cj);
  const wing = type === 0;
  zb.noConnectivity = true;
  zb.floor.fill(0);
  zb.ceil.fill(NaN);
  zb.fmat.fill(M.lv64_rock);
  zb.wmat.fill(M.lv64_brick);
  voidCells(zb);
  floorSlab(zb, zb.x0, zb.z0, zb.x1, zb.z1, M.lv64_rock, 0, 4);
  ceilSlab(zb, zb.x0, zb.z0, zb.x1, zb.z1, M.lv64_rockwall, CAVE, 8);
  // roads
  const pv = M.lv64_path;
  floorSlab(zb, ox, oz, ox + 3, oz + ROAD_Z, pv, 0.03, 4);
  floorSlab(zb, ox, oz + ROAD_Z + 3, ox + 3, oz + Z, pv, 0.03, 4);
  if (wing) {
    floorSlab(zb, ox, oz + ROAD_Z, ox + WX0, oz + ROAD_Z + 3, pv, 0.03, 4);
    floorSlab(zb, ox + WX0 + WW, oz + ROAD_Z, ox + Z, oz + ROAD_Z + 3, pv, 0.03, 4);
  } else floorSlab(zb, ox, oz + ROAD_Z, ox + Z, oz + ROAD_Z + 3, pv, 0.03, 4);
  lampRow(zb, ox, oz, wing);
  if (wing) genWing(zb, ox, oz, ci, cj);
  // the courtyard: a paved square with benches, swings and a ball
  if (type === 1) {
    floorSlab(zb, ox + 14, oz + 12, ox + 50, oz + 28, pv, 0.03, 4);
    floorSlab(zb, ox + 14, oz + 37, ox + 50, oz + 52, pv, 0.03, 4);
    zb.prop('lv64_swing', ox + 24, 0.03, oz + 44, 0, {});
    zb.prop('lv64_swing', ox + 40, 0.03, oz + 44, 0, {});
    zb.prop('bench', ox + 32, 0.03, oz + 15, Math.PI, { len: 2 });
    zb.prop('bench', ox + 20, 0.03, oz + 15, Math.PI, { len: 2 });
    zb.prop('ball', ox + 30, 0.13, oz + 47, 0, {});
    poleLamp(zb, ox + 16, oz + 27, 3.8, { y: 0.03, arm: false, lampMat: M.lv64_bulb, color: [1.0, 0.72, 0.4], rad: 9, int: 0.9 });
    poleLamp(zb, ox + 48, oz + 38, 3.8, { y: 0.03, arm: false, lampMat: M.lv64_bulb, color: [1.0, 0.72, 0.4], rad: 9, int: 0.9 });
  }
  // the bell tower, with a lit clock face
  if (towerAt(ci, cj)) {
    const tx = ox + 32, tz = oz + 19;
    if (owns(zb, tx, tz)) {
      zb.prop('lv64_tower', tx, 0, tz, 0, {});
      zb.decal(tx, 8.2, tz + 1.82, 'pz', 2.0, 2.0, 'clock_b', { lit: false, glow: 0.8 });
      zb.decal(tx, 8.2, tz - 1.82, 'nz', 2.0, 2.0, 'clock_b', { lit: false, glow: 0.8 });
      zb.light(tx, 11.5, tz, { color: [1.0, 0.82, 0.5], rad: 8, int: 0.7 });
      levelDoor(zb, tx + 1.8, tz + 0.2, Math.PI / 2);
      zb.light(tx + 3.0, 1.6, tz, { color: [1.0, 0.8, 0.5], rad: 6, int: 0.5 });
    }
  }
  genRocks(zb, ox, oz, ci, cj, wing, type);
  // the arrival gate: a short brick wall standing in the road, with the door in it
  if (ci === -1 && cj === 0) {
    cbox(zb, GATE.x - 0.2, 0, GATE.z0, GATE.x + 0.2, 3.4, GATE.z1, M.lv64_brick, { skip: 4 | 8 });
    cbox(zb, GATE.x - 0.3, 3.4, GATE.z0 - 0.1, GATE.x + 0.3, 3.6, GATE.z1 + 0.1, M.lv64_slate, { skip: 8 });
  }
  // a gate with a door beside the road in zones that have no door of their own
  if (hr(ci, cj, 121) < 0.45 && !(ci === -1 && cj === 0)) {
    const gz = oz + 44 + Math.floor(hr(ci, cj, 122) * 12), gx = ox + 20;
    cbox(zb, gx - 0.2, 0, gz, gx + 0.2, 3.4, gz + 3.5, M.lv64_brick, { skip: 4 | 8 });
    cbox(zb, gx - 0.3, 3.4, gz - 0.1, gx + 0.3, 3.6, gz + 3.6, M.lv64_slate, { skip: 8 });
    levelDoor(zb, gx + 0.2, gz + 1.75, Math.PI / 2);
    poleLamp(zb, gx + 2.5, gz + 1.0, 3.6, { y: 0, arm: false, lampMat: M.lv64_bulb, color: [1.0, 0.72, 0.4], rad: 9, int: 0.9 });
  }
}

defineZone('lv64_cave', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.09, 0.09, 0.115],
    env: env({ fog: [0.02, 0.022, 0.034], fogNear: 14, fogFar: 84, hum: 0.25, hvac: 0.15, reverb: 'auditorium', tone: 'lv64_cave' }),
  }),
  gen,
});

// ------------------------------------------------------------------ the level
defineLevel(N, {
  name: 'THE UNDERGROUND SCHOOL',
  zoneType: 'lv64_cave',
  zoneSize: Z,
  entry: { x: -7.25, y: 0.03, z: 32.5, yaw: Math.PI / 2 },
  doorDensity: 0,
  viewRadius: 5,
  grade: { sat: 0.9, tint: [1.02, 0.99, 0.96] },
  light: { phoneRadius: 4, phoneIntensity: 0.2 },
  // the bell: every forty-five seconds of play, from the nearest bell tower (far off when none is close)
  script(ctx, dt) {
    const s = ctx.state;
    if (!s.warm) { s.warm = 1; ctx.game.audioCall('play', 'lv64_bell', undefined, undefined, undefined, { vol: 0 }); }
    if (s.t === undefined || s.t > 60) s.t = 22;
    s.t -= dt;
    if (s.t > 0) return;
    s.t = 45;
    const p = ctx.player, pi = Math.floor(p.x / Z), pj = Math.floor(p.z / Z);
    let best = null, bd = 1e9;
    for (let j = pj - 2; j <= pj + 2; j++) for (let i = pi - 2; i <= pi + 2; i++) {
      if (!towerAt(i, j)) continue;
      const x = i * Z + 32, z = j * Z + 19, d = Math.hypot(x - p.x, z - p.z);
      if (d < bd) { bd = d; best = [x, z]; }
    }
    if (best) ctx.game.audioCall('play', 'lv64_bell', best[0], 11.5, best[1], { distant: bd > 40, vol: 1 });
    else ctx.game.audioCall('play', 'lv64_bell', p.x + 90, 11.5, p.z, { distant: true, vol: 1 });
  },
});
