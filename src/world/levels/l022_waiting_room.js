// Level 22: The Waiting Room. A doctor's waiting room, 8 x 8 m, twelve chairs, a reception window
// with nobody behind it and a locked staff door, repeated endlessly: every room opens through a
// wide doorway into the next. The staff door of each room is the back door of the NEXT room's
// reception booth. Every few minutes a chime sounds and the NOW SERVING display (the same in
// every room) counts up one.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propWithXf as withXf } from '../props.js';
import { defineZone } from '../zonetypes.js';
import { xfRotX } from '../../core/math.js';
import { LEVEL_ZONE, defineLevel, env, M, W, hr, owns, levelDoor, ceilingLight, cbox } from './kit.js';
import { driveFlicker, mix, voidCells, floorSlab, ceilSlab } from './g08_kit.js';

const N = 22;
const R = 8;                 // room pitch (x and z)
const CH = 2.35;             // ceiling height (under 2.4 m a wall is one row of polygons)
const SEG_CH = [5, 6, 7, 8, 9, 10, 11];            // flicker channels of segments a..g
const DIGIT = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];

// ------------------------------------------------------------------ textures & materials
defineTexture('lv22_paper', (p) => {
  // rose wallpaper above a wooden dado (the image's bottom is the floor; 2.5 m per repeat)
  p.fill([188, 150, 152]);
  p.noise(3, 0.04, 2);
  for (let x = 0; x < 64; x += 8) { p.rect(x, 0, 1, 36, [172, 134, 138]); p.rect(x + 4, 0, 1, 36, [196, 160, 160], 0.7); }
  for (let y = 4; y < 34; y += 8) for (let x = 2; x < 64; x += 8) p.set(x + ((y / 8) % 2 ? 4 : 0), y, [160, 120, 126]);
  p.rect(0, 35, 64, 2, [214, 196, 170]);                         // chair rail
  p.rect(0, 37, 64, 27, [104, 70, 54]);                           // wood panelling
  for (let x = 0; x < 64; x += 16) { p.rect(x, 38, 1, 26, [78, 52, 40]); p.rect(x + 2, 40, 12, 20, [114, 78, 58]); p.frame(x + 2, 40, 12, 20, [84, 56, 44]); }
  p.rect(0, 60, 64, 4, [70, 46, 36]);                             // skirting
  p.grain(0.03);
}, 12);
defineTexture('lv22_carpet', (p) => {
  p.fill([38, 78, 82]);
  p.grain(0.07);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const cx = tx * 32 + 16, cy = ty * 32 + 16;
    for (let r = 0; r < 14; r += 1) { const c = r % 4 < 2 ? [58, 104, 106] : [30, 62, 68]; for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; p.set(cx + Math.cos(t) * r * 1.1 * 0.95, cy + Math.sin(t) * r * 1.1 * 0.95, c, 0.0); } }
    p.line(cx - 12, cy, cx, cy - 12, [64, 112, 112]); p.line(cx, cy - 12, cx + 12, cy, [64, 112, 112]);
    p.line(cx + 12, cy, cx, cy + 12, [64, 112, 112]); p.line(cx, cy + 12, cx - 12, cy, [64, 112, 112]);
    p.line(cx - 6, cy, cx, cy - 6, [26, 54, 60]); p.line(cx, cy - 6, cx + 6, cy, [26, 54, 60]);
    p.line(cx + 6, cy, cx, cy + 6, [26, 54, 60]); p.line(cx, cy + 6, cx - 6, cy, [26, 54, 60]);
  }
  p.noise(4, 0.05, 2);
}, 8);
defineTexture('lv22_lino', (p) => {
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) p.rect(tx * 16, ty * 16, 16, 16, (tx + ty) % 2 ? [176, 170, 150] : [150, 150, 134]);
  p.grain(0.04);
}, 6);
defineTexture('lv22_ceil', (p) => {
  p.fill([200, 196, 180]);
  p.grain(0.04);
  p.noise(3, 0.04, 2);
  for (let k = 0; k < 64; k += 32) for (let i = 0; i < 64; i++) { p.set(i, k, [150, 146, 130]); p.set(k, i, [150, 146, 130]); }
  p.speckle(80, [160, 156, 140], 0.3, 0.6);
}, 8);
defineTexture('lv22_cushion', (p) => {
  // three joined vinyl chairs: seams at thirds
  p.fill([140, 84, 108]);
  p.noise(3, 0.06, 2);
  for (let k = 1; k < 3; k++) { p.rect(Math.round(k * 21.33) - 1, 0, 2, 64, [74, 40, 60]); p.rect(Math.round(k * 21.33) + 1, 0, 1, 64, [168, 112, 134], 0.7); }
  p.rect(0, 0, 64, 3, [92, 52, 74]); p.rect(0, 61, 64, 3, [92, 52, 74]);
  p.speckle(40, [160, 104, 128], 0.2, 0.5);
}, 8);
defineTexture('lv22_wood', (p) => {
  p.fill([122, 82, 54]);
  p.map((x, y, c) => { const g = 0.88 + 0.12 * Math.sin(y * 0.9 + Math.sin(x * 0.13) * 3); return [c[0] * g, c[1] * g, c[2] * g]; });
  p.grain(0.04);
}, 8);
defineTexture('lv22_amber', (p) => { p.fill([255, 176, 52]); p.rect(0, 0, 64, 6, [255, 206, 100]); }, 4);
defineTexture('lv22_display', (p) => {
  p.fill([14, 10, 8]);
  p.frame(0, 0, 64, 64, [60, 56, 50]);
  p.text('NOW', 5, 14, [255, 176, 52], 2);
  p.text('SERVING', 5, 36, [255, 176, 52], 1);
  p.rect(46, 8, 1, 48, [60, 40, 20]);
}, 6);
defineTexture('lv22_sign', (p) => {
  p.fill([226, 218, 196]);
  p.frame(0, 0, 64, 64, [120, 100, 80]);
  p.text('PLEASE', 11, 14, [60, 50, 90], 1);
  p.text('SIGN IN', 8, 26, [60, 50, 90], 1);
  p.text('AND WAIT', 5, 42, [120, 40, 40], 1);
}, 6);
defineTexture('lv22_door', (p) => {
  p.fill([122, 84, 58]);
  p.map((x, y, c) => { const g = 0.9 + 0.1 * Math.sin(x * 0.7 + Math.sin(y * 0.1) * 2); return [c[0] * g, c[1] * g, c[2] * g]; });
  p.rect(7, 6, 50, 22, [108, 72, 50]); p.frame(7, 6, 50, 22, [76, 50, 36]);
  p.rect(7, 33, 50, 25, [108, 72, 50]); p.frame(7, 33, 50, 25, [76, 50, 36]);
  p.rect(15, 27, 34, 10, [226, 218, 196]); p.frame(15, 27, 34, 10, [120, 100, 80]); p.text('STAFF', 18, 29, [50, 40, 36], 1);
  p.rect(54, 30, 4, 4, [196, 170, 90]);
}, 8);
defineTexture('lv22_print_a', (p) => {
  p.fill([226, 214, 190]);
  p.rect(6, 6, 52, 52, [150, 188, 200]);
  p.rect(6, 36, 52, 22, [74, 112, 104]);
  p.disc(44, 20, 6, [240, 214, 120]);
  p.line(14, 40, 28, 20, [236, 230, 220]); p.line(28, 20, 40, 40, [236, 230, 220]); p.line(14, 40, 40, 40, [236, 230, 220]);
  p.frame(0, 0, 64, 64, [118, 80, 54]); p.frame(1, 1, 62, 62, [150, 110, 76]);
}, 12);
defineTexture('lv22_print_b', (p) => {
  p.fill([220, 206, 190]);
  p.rect(6, 6, 52, 52, [186, 120, 130]);
  for (let k = 0; k < 6; k++) p.disc(14 + k * 8, 24 + (k % 2) * 14, 7, [226, 190, 120], 0.9);
  p.rect(30, 38, 4, 20, [74, 110, 80]);
  p.frame(0, 0, 64, 64, [118, 80, 54]); p.frame(1, 1, 62, 62, [150, 110, 76]);
}, 12);

defineMaterial('lv22_paper', 'lv22_paper', { su: 2, sv: CH, surf: 'drywall', stain: 0.08 });
defineMaterial('lv22_carpet', 'lv22_carpet', { s: 1.6, surf: 'carpet', stain: 0.08 });
defineMaterial('lv22_lino', 'lv22_lino', { s: 1.2, surf: 'lino' });
defineMaterial('lv22_ceil', 'lv22_ceil', { s: 1.2, surf: 'drywall' });
defineMaterial('lv22_wood', 'lv22_wood', { s: 1, surf: 'wood' });
defineMaterial('lv22_amber', 'lv22_amber', { s: 1, flags: VF.FULLBRIGHT, glow: 1.1 });

// ------------------------------------------------------------------ props
defineProp('lv22_chairs', {
  // three joined vinyl chairs; the front (-z) faces the room
  build(mb) {
    const cush = T('lv22_cushion');
    const fit = [0, 0, 1, 1];
    mb.box(-0.85, 0.0, -0.27, 0.85, 0.47, 0.27, cush, { skip: 8, uv: ['world', 'world', fit, 'world', fit, fit] });
    mb.box(-0.85, 0.47, 0.2, 0.85, 0.92, 0.3, cush, { skip: 8, uv: ['world', 'world', fit, 'world', fit, fit] });
  },
  boxes: [[-0.88, 0, -0.28, 0.88, 0.95, 0.3]],
});
defineProp('lv22_counter', {
  build(mb) {
    mb.box(-2.0, 0, -0.2, 2.0, 1.0, 0.2, S('lv22_wood'), { skip: 8 });
    mb.box(-2.05, 1.0, -0.3, 2.05, 1.05, 0.2, S('plastic_beige'), { skip: 8 });
  },
  boxes: [[-2.05, 0, -0.3, 2.05, 1.05, 0.2]],
});
defineProp('lv22_bell', {
  // a service bell on the counter: it rings, nobody comes
  build(mb) { mb.box(-0.05, 0, -0.05, 0.05, 0.07, 0.05, S('chrome'), { skip: 8 }); },
  use: 'level',
});
defineProp('lv22_desk', {
  build(mb) {
    mb.box(-0.7, 0.71, -0.4, 0.7, 0.75, 0.4, S('lv22_wood'), { skip: 8 });
    mb.box(-0.65, 0.0, -0.38, 0.65, 0.71, 0.38, S('wood_dark'), { skip: 8 });
  },
  boxes: [[-0.7, 0, -0.4, 0.7, 0.75, 0.4]],
});
defineProp('lv22_table', {
  build(mb) {
    mb.box(-0.55, 0.38, -0.3, 0.55, 0.43, 0.3, S('lv22_wood'), { skip: 8 });
    mb.box(-0.45, 0.0, -0.2, 0.45, 0.38, 0.2, S('wood_dark'), { skip: 8 });
  },
  boxes: [[-0.55, 0, -0.3, 0.55, 0.43, 0.3]],
});
defineProp('lv22_chair', {
  // the receptionist's swivel chair, pulled out
  build(mb) {
    const f = S('lv22_wood'), c = T('lv22_cushion');
    mb.box(-0.25, 0.42, -0.25, 0.25, 0.5, 0.25, c, { skip: 8 });
    mb.box(-0.23, 0.5, 0.2, 0.23, 0.95, 0.26, c, { skip: 8 });
    mb.box(-0.03, 0.0, -0.03, 0.03, 0.42, 0.03, f, { skip: 12 });
  },
});
defineProp('lv22_door', {
  // the staff door: locked, with a brass plate
  build(mb) {
    const dt = T('lv22_door');
    const wd = S('wood_dark');
    mb.box(-0.5, 0, -0.05, 0.5, 2.1, 0.05, [wd, wd, wd, wd, dt, dt], { uv: ['world', 'world', 'world', 'world', [0, 0, 1, 1], [0, 0, 1, 1]] });
  },
  boxes: [[-0.5, 0, -0.1, 0.5, 2.1, 0.1]],
  use: 'locked',
});
defineProp('lv22_clock', {
  // a plain wall clock; its face is flat on the wall (front toward -z)
  build(mb) {
    withXf(mb, xfRotX(Math.PI / 2), () => mb.cyl(0, 0, 0, 0.19, 0.05, 6, S('plastic_black'), 0));
    mb.card([0.16, -0.16, -0.003, -0.16, -0.16, -0.003, -0.16, 0.16, -0.003, 0.16, 0.16, -0.003], [0, 0, -1], T('clock_c'), [0, 1, 1, 1, 1, 0, 0, 0]);
  },
  emitter: { snd: 'lv22_tick', vol: 0.5, rad: 6, y: 0 },
});
defineProp('lv22_display', {
  // NOW SERVING: a lit label and one seven-segment digit; every segment sits on its own flicker
  // channel, which the level script drives (the digit is the same in every room)
  build(mb) {
    const hs = S('plastic_black');
    const lab = T('lv22_display');
    mb.box(-0.42, 0, -0.06, 0.42, 0.58, 0.06, [hs, hs, hs, hs, hs, lab], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
    // the digit lies on the viewer's right (-x side), 0.14 m wide and 0.34 m high
    const cx = -0.27, cy = 0.29, w = 0.14, h = 0.34, t = 0.03, z0 = -0.075, z1 = -0.062;
    const seg = (ch, x0, y0, x1, y1) => {
      const st = T('lv22_amber', { flags: VF.FULLBRIGHT, lit: false, color: [0, 0, 0], flk: [1.15, 0.95, 0.55], chan: ch });
      mb.box(cx + x0, cy + y0, z0, cx + x1, cy + y1, z1, st, { skip: 31 });
    };
    const hw = w / 2, hh = h / 2;
    // viewer-left is +x in prop space
    seg(SEG_CH[0], -hw + t, hh - t, hw - t, hh);                  // a top
    seg(SEG_CH[1], -hw, 0.0, -hw + t, hh);                          // b top right (viewer)
    seg(SEG_CH[2], -hw, -hh, -hw + t, 0.0);                         // c bottom right
    seg(SEG_CH[3], -hw + t, -hh, hw - t, -hh + t);                  // d bottom
    seg(SEG_CH[4], hw - t, -hh, hw, 0.0);                           // e bottom left
    seg(SEG_CH[5], hw - t, 0.0, hw, hh);                            // f top left
    seg(SEG_CH[6], -hw + t, -t / 2, hw - t, t / 2);                 // g middle
  },
});

// ------------------------------------------------------------------ layout
// the doorway between room (i, j) and its west neighbour: always open; the first room's is shut
const westOpen = () => true;
// rooms (-2..-1, 0..1) are replaced by the entrance corridor (a plain mass of wall with a passage), so
// the arrival chunk stays cheap and the first sight is the corridor of doorways ahead
const blocked = (i, j) => i >= -2 && i <= -1 && j >= 0 && j <= 1;
// the slot on the north wall (x cell 7): 0 wall, 1 doorway, 2 level door
function northSlot(i, j) {
  if (i === 0 && j === 0) return 0;
  const h = hr(i, j, 5);
  return h < 0.4 ? 1 : h < 0.435 ? 2 : 0;
}

function genRoom(zb, i, j) {
  const x0 = i * R, z0 = j * R;
  const pa = M.lv22_paper;
  // outer walls: west (doorway of two cells at z 3-4), north (alcove window inside, slot at x 7)
  for (let z = z0; z < z0 + R; z++) {
    const k = z - z0;
    if (k === 3 || k === 4) {
      if (westOpen(i, j)) zb.setWall(x0, z, 'W', W.DOOR, pa, pa);
      else if (k === 3) zb.setWall(x0, z, 'W', W.DOOR, pa, pa);       // the arrival door's frame
      else zb.setWall(x0, z, 'W', W.WALL, pa, pa);
    } else zb.setWall(x0, z, 'W', W.WALL, pa, pa);
  }
  for (let x = x0; x < x0 + R; x++) {
    const k = x - x0;
    if (k === 7) {
      const s = northSlot(i, j);
      zb.setWall(x, z0, 'N', s === 1 || s === 2 ? W.DOOR : W.WALL, pa, pa);
    } else if (k === 4 && j >= 0) zb.setWall(x, z0, 'N', W.DOOR, pa, pa);   // the staff door seen from the room to the north
    else zb.setWall(x, z0, 'N', W.WALL, pa, pa);
  }
  // the reception booth: x 2..6, z 0..2, walled in, a window toward the room
  for (let z = z0; z < z0 + 2; z++) { zb.setWall(x0 + 2, z, 'W', W.WALL, pa, pa); zb.setWall(x0 + 6, z, 'W', W.WALL, pa, pa); }
  for (let x = x0 + 2; x < x0 + 6; x++) zb.setWall(x, z0 + 2, 'N', W.WINDOW, pa, pa);
}

function gen(zb) {
  zb.noConnectivity = true;
  zb.floor.fill(0);
  zb.ceil.fill(CH);
  zb.fmat.fill(M.lv22_carpet);
  zb.cmat.fill(M.lv22_ceil);
  zb.wmat.fill(M.lv22_paper);
  voidCells(zb);
  floorSlab(zb, zb.x0, zb.z0, zb.x1, zb.z1, M.lv22_carpet);
  ceilSlab(zb, zb.x0, zb.z0, zb.x1, zb.z1, M.lv22_ceil, CH);
  const i0 = Math.floor(zb.x0 / R), i1 = Math.floor((zb.x1 - 1) / R);
  const j0 = Math.floor(zb.z0 / R), j1 = Math.floor((zb.z1 - 1) / R);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (!blocked(i, j)) genRoom(zb, i, j);
  // the entrance: a 2 m wide passage, 4 m long, into the first room, the arrival door at its end
  const solid = { skip: 4 | 8, sub: 4 };
  cbox(zb, -16, 0, 0, 0, CH, 3, M.lv22_paper, solid);
  cbox(zb, -16, 0, 5, 0, CH, 16, M.lv22_paper, solid);
  cbox(zb, -16, 0, 3, -4, CH, 5, M.lv22_paper, solid);
  if (zb.x0 <= -2 && zb.x1 > -2 && zb.z0 <= 4 && zb.z1 > 4) ceilingLight(zb, -2, 4, 'tube', 'on', { color: [1.0, 0.9, 0.72], mul: 0.5, rot: 1 });
  // contents, once per room (owned by the zone holding the anchor)
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (blocked(i, j)) continue;
      const x0 = i * R, z0 = j * R;
      const own = (x, z) => owns(zb, x, z);
      // twelve chairs: two groups of three on each side wall, flanking the doorways
      for (const [gz, ] of [[1.45], [6.55]]) {
        if (own(x0 + 0.45, z0 + gz)) zb.prop('lv22_chairs', x0 + 0.42, 0, z0 + gz, Math.PI / 2 * 1, {});
        if (own(x0 + R - 0.45, z0 + gz)) zb.prop('lv22_chairs', x0 + R - 0.42, 0, z0 + gz, -Math.PI / 2, {});
      }
      // reception: counter and window, bell, NOW SERVING above, the booth's furniture
      if (own(x0 + 4, z0 + 2.25)) {
        zb.prop('lv22_counter', x0 + 4, 0, z0 + 2.4, Math.PI, {});
        zb.prop('lv22_bell', x0 + 5.3, 1.05, z0 + 2.3, 0, { use: 'level', label: 'RING BELL', useY: 1.1, useR: 0.8 });
        zb.prop('lv22_display', x0 + 4, 1.92, z0 + 2.1, Math.PI, {});
        zb.light(x0 + 4, 2.1, z0 + 1.0, { color: [0.85, 0.9, 1.0], rad: 4, int: 0.35 });
        zb.prop('lv22_desk', x0 + 4, 0, z0 + 0.5, Math.PI, {});
        zb.prop('crt', x0 + 3.3, 0.75, z0 + 0.5, Math.PI, { screen: 'crt_blue' });
        zb.prop('lv22_chair', x0 + 3.3, 0, z0 + 1.35, 0.5 + hr(i, j, 31) * 2, {});
      }
      // the staff door: on the south wall, it opens into the next room's booth
      if (own(x0 + 4.5, z0 + R)) zb.prop('lv22_door', x0 + 4.5, 0, z0 + R, 0, { useY: 1.0, useR: 0.9 });
      // the slot on the north wall: a level door in some rooms
      if (northSlot(i, j) === 2 && own(x0 + 7.5, z0)) levelDoor(zb, x0 + 7.5, z0, Math.PI);
      // furniture in the middle
      if (own(x0 + 4, z0 + 5.2)) {
        zb.prop('lv22_table', x0 + 4, 0, z0 + 5.4, 0, {});
      }
      if (own(x0 + 6.9, z0 + 7.1)) zb.prop('plant', x0 + 6.9, 0, z0 + 7.0, 0, { h: 1.2 });
      if (own(x0 + 7.0, z0 + 3.0)) zb.prop('lamp_floor', x0 + 7.2, 0, z0 + (hr(i, j, 36) < 0.5 ? 2.6 : 5.6), 0, {});
      // wall clock beside the booth, two prints
      if (own(x0 + 6.5, z0 + 0.1)) zb.prop('lv22_clock', x0 + 6.5, 1.85, z0 + 0.12, Math.PI, {});
      zb.decal(x0 + 0.12, 1.55, z0 + 1.45, 'px', 0.8, 0.8, hr(i, j, 37) < 0.5 ? 'lv22_print_a' : 'lv22_print_b');
      zb.decal(x0 + R - 0.12, 1.55, z0 + 6.55, 'nx', 0.8, 0.8, hr(i, j, 38) < 0.5 ? 'lv22_print_a' : 'lv22_print_b');
      // ceiling lights
      ceilingLight(zb, x0 + 2.0, z0 + 5.5, 'troffer', 'on', { color: [1.0, 0.92, 0.78], mul: 0.8, rot: 1 });
      ceilingLight(zb, x0 + 6.0, z0 + 5.5, 'troffer', 'on', { color: [1.0, 0.92, 0.78], mul: 0.8, rot: 1 });
      // a warm glow beside each doorway, so the next room shines down the line of doors
      if (own(x0 + 1.2, z0 + 4)) zb.light(x0 + 1.4, 1.9, z0 + 4, { color: [1.0, 0.82, 0.55], rad: 7, int: 0.75 });
      ceilingLight(zb, x0 + 4.0, z0 + 1.0, 'tube', 'on', { color: [0.9, 0.95, 1.0], mul: 0.4, rot: 1 });
    }
  }
}

defineZone('lv22_rooms', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.2, 0.16, 0.15],
    env: env({ fog: [0.2, 0.14, 0.125], fogNear: 6, fogFar: 40, hum: 0.5, hvac: 0.3, reverb: 'room', tone: 'lv22_room' }),
  }),
  gen,
});

// ------------------------------------------------------------------ the level
defineLevel(N, {
  name: 'THE WAITING ROOM',
  zoneType: 'lv22_rooms',
  zoneSize: 64,
  entry: { x: -3.25, y: 0, z: 4.0, yaw: Math.PI / 2 },
  doorDensity: 0,
  viewRadius: 3,
  light: { phoneRadius: 3.2, phoneIntensity: 0.2 },
  // every few minutes a chime sounds, and a second later the number on every display counts up
  script(ctx, dt) {
    const s = ctx.state;
    if (s.n === undefined || s.n < 0 || s.n > 9) s.n = 1;
    if (!s.warm) { s.warm = 1; for (const nm of ['lv22_chime', 'lv22_bell']) ctx.game.audioCall('play', nm, undefined, undefined, undefined, { vol: 0 }); }
    if (s.t === undefined) s.t = 50 + Math.random() * 40;
    s.t -= dt;
    if (s.t <= 0) {
      s.t = 150 + Math.random() * 120;
      ctx.game.audioCall('play', 'lv22_chime', undefined, undefined, undefined, { vol: 0.95 });
      s.change = 1.1;
    }
    if (s.change > 0) {
      s.change -= dt;
      if (s.change <= 0) s.n = s.n % 9 + 1;
    }
    if (!s.hooked) {
      s.hooked = true;
      driveFlicker(ctx.game, N, (f) => {
        const on = DIGIT[s.n] || '';
        for (let k = 0; k < 7; k++) f.v[SEG_CH[k]] = on.includes('abcdefg'[k]) ? 1 : 0;
      });
    }
  },
  onUse(ctx, item) {
    const o = item && item.prop && item.prop.opts;
    if (o && o.label === 'RING BELL') {
      ctx.game.audioCall('play', 'lv22_bell', item.x, item.y, item.z, {});
      ctx.game.ui.say('Nobody comes.', 3);
    }
  },
});
void mix;
