// Level 67: The Endless Kitchen. A commercial kitchen with no walls: islands of back-to-back
// steel ovens under hanging hoods, in rows that run off into the steam. Quarry-tile floor, cold
// tube light, the orange of oven windows everywhere. Thousands of ovens, all the same. Most
// are simply cold inside; a few open onto somewhere else.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propGlow } from '../props.js';
import { LEVEL_ZONE, defineLevel, hr, env, M, CF, W, cbox } from './kit.js';
import { mulc, pmod, txtC } from './g06_kit.js';

const N = 67;
const G = 64;
const BX = 16, BZ = 8;       // block: one island per block
const CH = 3.7;
const STEEL = [176, 182, 190];

// ------------------------------------------------------------------ textures
defineTexture('lv67_floor', (p) => {
  p.fill([150, 76, 56]);
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) {
    const k = ((x * 3 + y * 5) >> 4) % 4;
    p.rect(x, y, 16, 16, [[154, 80, 58], [146, 72, 52], [160, 86, 62], [140, 70, 50]][k]);
    p.rect(x, y, 16, 1, [96, 80, 72]); p.rect(x, y, 1, 16, [96, 80, 72]);
  }
  p.noise(8, 0.08, 2);
  p.speckle(70, [220, 180, 150], 0.1, 0.35);
  p.stain(34, 40, 10, [70, 50, 44], 0.5);
}, 12);
defineMaterial('lv67_floor', 'lv67_floor', { s: 2, surf: 'tile', stain: 0.1 });
defineTexture('lv67_ceil', (p) => {
  p.fill([206, 212, 214]);
  p.noise(4, 0.05, 2);
  for (let i = 0; i < 64; i += 32) { p.rect(i, 0, 1, 64, [140, 148, 150]); p.rect(0, i, 64, 1, [140, 148, 150]); }
  p.stain(20, 20, 12, [170, 170, 150], 0.4);
}, 8);
defineMaterial('lv67_ceil', 'lv67_ceil', { s: 3, surf: 'drywall' });
defineTexture('lv67_steel', (p) => {
  p.fill(STEEL);
  for (let x = 0; x < 64; x++) p.rect(x, 0, 1, 64, mulc(STEEL, 0.94 + 0.1 * pnoise(x * 5, 0, 32, 3)), 0.9);
  p.noise(4, 0.05, 2);
  p.rect(0, 0, 64, 2, [210, 216, 222]);
}, 10);
defineMaterial('lv67_steel', 'lv67_steel', { s: 1.2, surf: 'metal' });
defineTexture('lv67_steel_dark', (p) => { p.fill([112, 118, 126]); p.noise(4, 0.06, 2); p.rect(0, 0, 64, 3, [150, 156, 164]); }, 8);
defineMaterial('lv67_steel_dark', 'lv67_steel_dark', { s: 1.2, surf: 'metal' });
defineTexture('lv67_tile', (p) => {
  p.fill([226, 230, 228]);
  for (let y = 0; y < 64; y += 8) p.rect(0, y, 64, 1, [160, 168, 166]);
  for (let x = 0; x < 64; x += 8) p.rect(x, 0, 1, 64, [160, 168, 166]);
  p.noise(4, 0.04, 2);
}, 8);
defineMaterial('lv67_tile', 'lv67_tile', { s: 1.6, surf: 'tile' });

// the front of a stack of two ovens: control strip, window frame, handle, knobs
defineTexture('lv67_oven_front', (p) => {
  p.fill(STEEL);
  p.noise(4, 0.05, 2);
  for (let half = 0; half < 2; half++) {
    const y0 = half * 32;
    p.rect(2, y0 + 1, 60, 6, [110, 116, 124]);
    for (let k = 0; k < 4; k++) { p.disc(9 + k * 7, y0 + 4, 2.2, [40, 40, 44]); p.rect(9 + k * 7, y0 + 2, 1, 2, [240, 240, 240]); }
    p.rect(46, y0 + 3, 12, 2, [30, 30, 34]); p.rect(48, y0 + 3, 3, 2, [255, 120, 60]);
    p.rect(2, y0 + 8, 60, 22, [120, 126, 134]);
    p.rect(10, y0 + 10, 44, 18, [30, 24, 20]);             // window (a glow quad covers it)
    p.frame(10, y0 + 10, 44, 18, [200, 206, 214]);
    p.rect(14, y0 + 30, 36, 1, [60, 64, 70]);
    p.bevel(2, y0 + 8, 60, 22, 0.2, 0.3);
  }
  p.rect(0, 31, 64, 2, [70, 74, 80]);
  p.rect(0, 0, 3, 64, [140, 146, 154]); p.rect(61, 0, 3, 64, [92, 98, 106]);
}, 12);
defineMaterial('lv67_oven_front', 'lv67_oven_front', { s: 1, surf: 'metal' });
defineTexture('lv67_oven_glow', (p) => {
  for (let y = 0; y < 64; y++) { const t = y / 63; p.rect(0, y, 64, 1, [255 - 30 * (1 - t), 150 + 80 * t, 40 + 50 * t]); }
  for (let y = 12; y < 64; y += 16) p.rect(0, y, 64, 3, [90, 40, 20]);
  p.rect(0, 0, 64, 6, [170, 70, 30]);
  p.noise(4, 0.04, 2);
}, 8);
defineMaterial('lv67_oven_glow', 'lv67_oven_glow', { s: 1, surf: 'metal', flags: VF.FULLBRIGHT, glow: 0.95 });
defineTexture('lv67_hood_glow', (p) => { p.fill([255, 244, 216]); p.rect(0, 0, 64, 4, [190, 190, 170]); p.rect(0, 60, 64, 4, [190, 190, 170]); }, 4);
defineMaterial('lv67_hood_glow', 'lv67_hood_glow', { s: 1, surf: 'metal', flags: VF.FULLBRIGHT, glow: 1.0 });
defineTexture('lv67_tube', (p) => { p.fill([234, 246, 255]); p.rect(0, 0, 64, 5, [150, 170, 180]); p.rect(0, 59, 64, 5, [150, 170, 180]); }, 4);
defineMaterial('lv67_tube', 'lv67_tube', { s: 1, surf: 'metal', flags: VF.FULLBRIGHT, glow: 1.0 });
defineMaterial('lv67_tube_f', 'lv67_tube', { s: 1, surf: 'metal', flags: VF.FULLBRIGHT, glow: 1.0, chan: 2 });
defineTexture('lv67_pot', (p) => { p.fill([150, 156, 164]); p.noise(4, 0.06, 2); p.rect(0, 20, 64, 3, [100, 104, 112]); }, 6);
defineMaterial('lv67_pot', 'lv67_pot', { s: 1, surf: 'metal' });

// ------------------------------------------------------------------ props
// One stack of two ovens, 1 m wide. Whether it is a door is only in its options.
defineProp('lv67_oven', {
  build(mb, p) {
    const steel = S('lv67_steel'), front = S('lv67_oven_front');
    mb.box(-0.5, 0, -0.45, 0.5, 2.0, 0.45, [steel, steel, steel, steel, steel, front], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
    const g = propGlow('lv67_oven_glow', 0.95, 0);
    // window glow, a hair in front of the window (rows 10..28 and 42..60 of the texture)
    for (const [ya, yb] of [[1.12, 1.69], [0.12, 0.69]]) mb.box(-0.34, ya, -0.455, 0.34, yb, -0.45, g, { skip: 31, uv: 'fit' });
    // handles
    for (const y of [1.0, 0.0 + 0.04]) mb.box(-0.3, y + 0.0, -0.49, 0.3, y + 0.03, -0.46, S('chrome'));
  },
  boxes: [[-0.5, 0, -0.45, 0.5, 2.0, 0.45]],
  use: (p) => (p.opts.door ? 'leveldoor' : 'level'),
});
defineProp('lv67_pot', {
  build(mb, p) {
    const m = S('lv67_pot');
    const r = p.opts.r || 0.28, h = p.opts.h || 0.36;
    mb.cyl(0, 0, 0, r, h, 8, m, 3);
    for (const s of [-1, 1]) mb.box(s * (r + 0.07) - 0.05, h * 0.7, -0.03, s * (r + 0.07) + 0.05, h * 0.7 + 0.04, 0.03, S('metal_dark'));
  },
  boxes: (p) => { const r = p.opts.r || 0.28; return [[-r, 0, -r, r, p.opts.h || 0.36, r]]; },
});

// ------------------------------------------------------------------ the kitchen
function island(zb, bx, bz) {
  const x0 = bx * BX, z0 = bz * BZ;
  const seed = bx * 977 + bz * 131;
  const steel = M.lv67_steel, dark = M.lv67_steel_dark;
  // the island: 12 stacks a side, back to back, with a steel top
  const door = new Set();
  const nd = hr(bx, bz, 670) < 0.12 ? 1 : 0;       // roughly one island in eight has an oven that is a door
  if (nd) door.add(Math.floor(hr(bx, bz, 671) * 24));
  for (let k = 0; k < 12; k++) {
    for (const side of [-1, 1]) {
      const idx = k + (side > 0 ? 12 : 0);
      const x = x0 + 2.5 + k, z = z0 + 4 + side * 0.45;
      const rot = side < 0 ? 0 : Math.PI;
      const isDoor = door.has(idx);
      if (!zb.in(Math.floor(x), Math.floor(z))) continue;
      zb.prop('lv67_oven', x, 0, z, rot, { door: isDoor, use: isDoor ? 'leveldoor' : 'level', label: 'OPEN OVEN', useY: 1.0, useR: 0.9 });
      if (isDoor) {
        zb.doors.push({ x, y: 0, z: z + side * 0.6, rot: rot, arrival: false });
        zb.emitter(x, 1.1, z + side * 0.5, 'door_hum', { vol: 0.7, rad: 12 });
      }
    }
  }
  cbox(zb, x0 + 2, 2.0, z0 + 3.1, x0 + 14, 2.06, z0 + 4.9, dark, { sub: 99 });
  // hood above, ducts to the ceiling, a strip of light underneath
  cbox(zb, x0 + 1.4, 2.5, z0 + 2.3, x0 + 14.6, 3.05, z0 + 5.7, steel, { sub: 99 });
  cbox(zb, x0 + 2.2, 2.46, z0 + 3.0, x0 + 13.8, 2.5, z0 + 5.0, M.lv67_hood_glow, { collide: false, skip: 55, sub: 99 });
  for (const dx of [4.4, 10.4]) cbox(zb, x0 + dx, 3.05, z0 + 3.4, x0 + dx + 1.2, CH, z0 + 4.6, dark);
  // light: cool under the hood, orange from the windows
  zb.light(x0 + 8, 2.3, z0 + 4, { color: [1.0, 0.96, 0.88], rad: 7, int: 0.5 });
  for (const sx of [0.3, 0.7]) for (const side of [-1, 1]) zb.light(x0 + 16 * sx, 1.0, z0 + 4 + side * 1.6, { color: [1.0, 0.55, 0.26], rad: 5, int: 0.34 });
  zb.emitter(x0 + 8, 1.4, z0 + 4, 'lv67_ovens', { vol: 0.8, rad: 13 });
  zb.emitter(x0 + 8, 2.6, z0 + 4, 'lv67_hood', { vol: 0.65, rad: 12 });
  void seed;
}

function street(zb, bx, bz) {
  const x0 = bx * BX, z0 = bz * BZ;
  // tube lights in the street (z0 + 8 is the street's centre line: this block's far edge)
  const lz = z0 + BZ;
  for (let k = 0; k < 2; k++) {
    const lx = x0 + 4 + k * 8;
    if (!zb.in(Math.floor(lx), Math.floor(lz))) continue;
    const u = hr(bx * 2 + k, bz, 672);
    const mat = u < 0.1 ? M.lv67_tube_f : M.lv67_tube;
    zb.box(lx - 0.7, CH - 0.08, lz - 0.16, lx + 0.7, CH, lz + 0.16, mat, { collide: false, skip: 55 });
    zb.light(lx, CH - 0.6, lz, { color: [0.86, 0.95, 1.0], rad: 8, int: 0.62, ch: u < 0.1 ? 2 : 0 });
  }
  // a prep table down the middle of some streets, with pots, and a trolley or a bucket
  const u = hr(bx, bz, 673);
  if (!(bx === 2 && bz === 4) && u < 0.4) {
    zb.prop('table', x0 + 6, 0, lz, 0, { len: 3.6, depth: 0.9, top: 'lv67_steel' });
    for (let k = 0; k < 3; k++) zb.prop('lv67_pot', x0 + 4.9 + k * 1.1, 0.75, lz + (k % 2 ? 0.1 : -0.1), 0, { r: 0.22 + 0.04 * (k % 2), h: 0.3 + 0.08 * k });
  } else if (u < 0.55) {
    zb.prop('cart_cleaning', x0 + 9, 0, lz + 0.6, hr(bx, bz, 674) * 6.28, {});
  } else if (u < 0.68) {
    zb.prop('bucket', x0 + 7, 0, lz - 0.5, 0, {});
    zb.prop('wet_sign', x0 + 7.8, 0, lz - 0.2, hr(bx, bz, 675) * 6.28, {});
  } else if (u < 0.74) {
    zb.prop('sink', x0 + 12, 0, lz - 0.1, Math.PI / 2, {});
    zb.emitter(x0 + 12, 1.0, lz, 'drip', { vol: 0.6, rad: 8 });
  }
  // a tiled pillar where streets cross
  if (hr(bx, bz, 676) < 0.5) {
    const px = x0 + 15.7, pz = lz;
    cbox(zb, px - 0.35, 0, pz - 0.35, px + 0.35, CH, pz + 0.35, M.lv67_tile);
  }
}

function gen(zb) {
  zb.floor.fill(0);
  zb.ceil.fill(CH);
  zb.fmat.fill(M.lv67_floor);
  zb.cmat.fill(M.lv67_ceil);
  zb.wmat.fill(M.lv67_tile);
  zb.flags.fill(0);
  for (let bz = Math.floor(zb.z0 / BZ); bz < zb.z1 / BZ; bz++) {
    for (let bx = Math.floor(zb.x0 / BX); bx < zb.x1 / BX; bx++) {
      island(zb, bx, bz);
      street(zb, bx, bz);
    }
  }
}

defineZone('lv67_kitchen', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.26, 0.3, 0.33],
    env: env({ fog: [0.34, 0.4, 0.44], fogNear: 6, fogFar: 54, hum: 0.35, hvac: 0.7, reverb: 'tile', tone: 'lv67_kitchen' }),
  }),
  gen,
});

const COLD = ['It is cold inside.', 'It is cold inside.', 'It is cold inside.', 'It is cold. Spotless.', 'Cold, and quite empty.'];
defineLevel(N, {
  name: 'THE ENDLESS KITCHEN',
  zoneType: 'lv67_kitchen',
  zoneSize: G,
  entry: { x: 38.0, y: 0, z: 40.0, yaw: Math.PI / 2 },
  doorDensity: 0,
  viewRadius: 3,
  grade: { sat: 1.0, tint: [0.98, 1.0, 1.04] },
  light: { phoneRadius: 3.6, phoneIntensity: 0.22 },
  // opening an oven that is not a door: a click, a breath of cold air
  onUse(ctx, item) {
    const g = ctx.game, st = ctx.state;
    st.n = (st.n || 0) + 1;
    g.audioCall('play', 'door_latch', item.x, item.y, item.z, {});
    g.ui.say(COLD[(st.n + Math.floor(item.x + item.z)) % COLD.length], 2.5);
  },
});
void pmod; void txtC; void CF; void W;
