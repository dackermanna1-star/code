// Level 99: The Last Hallway. A tall, quiet hall, five metres wide and seventy-five long, with a
// single door at its far end: no handle, LEVEL 100 above it, white light all around it. You
// arrive at the other end and see it from there. The light and the ornament build toward the
// door; behind it all the building is bare concrete.
//
// The way out is sideways: three pairs of doorways open from the hall into a lattice of plain
// service corridors (24 m grid, endless in every direction) with real level doors in it.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { LEVEL_ZONE, defineLevel, cbox, owns, hr, levelDoor, ceilingLight, env, M, FACE } from './kit.js';
import { solidAll, carve, clamp, mix3 } from './g09_kit.js';

const N = 99;
const HX0 = -2, HX1 = 3;                // hall cells in x: [-2, 3), centre line x = 0.5
const HZ0 = 1, HZ1 = 76;                // hall cells in z
const HH = 6;
const XBANDS = [12, 36, 60];            // z of the doorways from the hall into the service lattice

// ---- textures
defineTexture('lv99_wall', (p) => {
  p.fill([226, 214, 188]);
  p.noise(5, 0.05, 3);
  p.rect(0, 50, 64, 14, [104, 74, 50]);              // wainscot
  p.rect(0, 49, 64, 1, [196, 160, 96]);
  p.rect(0, 50, 64, 1, [60, 40, 28]);
  for (let x = 0; x < 64; x += 16) p.rect(x, 52, 1, 12, [78, 54, 36]);
  p.speckle(26, [200, 186, 160], 0.3, 0.6);
  p.speckle(10, [160, 140, 110], 0.2, 0.5);
}, 12);
defineTexture('lv99_floor', (p) => {
  p.fill([228, 222, 208]);
  p.noise(6, 0.06, 3);
  for (let i = 0; i < 5; i++) { const x = (i * 23 + 7) % 64; p.line(x, 0, x + 18, 63, [188, 184, 174], 0.5); }
  p.rect(0, 0, 64, 1, [170, 164, 150]); p.rect(0, 0, 1, 64, [170, 164, 150]);
  p.rect(0, 32, 64, 1, [196, 190, 176]); p.rect(32, 0, 1, 64, [196, 190, 176]);
}, 10);
defineTexture('lv99_inlay', (p) => {
  p.fill([62, 46, 34]);
  p.noise(6, 0.08, 2);
  p.rect(0, 0, 4, 64, [190, 156, 92]); p.rect(60, 0, 4, 64, [190, 156, 92]);
  for (let y = 0; y < 64; y += 16) p.rect(24, y + 4, 16, 8, [120, 92, 54]);
}, 8);
defineTexture('lv99_ceil', (p) => {
  p.fill([46, 36, 30]);
  p.noise(6, 0.1, 2);
  p.rect(0, 0, 64, 2, [26, 20, 16]); p.rect(0, 0, 2, 64, [26, 20, 16]);
}, 6);
defineTexture('lv99_stone', (p) => {
  p.fill([84, 74, 64]);
  p.noise(6, 0.1, 3);
  p.speckle(24, [120, 108, 92], 0.3, 0.6);
}, 8);
defineTexture('lv99_door', (p) => {
  p.fill([238, 234, 222]);
  p.noise(5, 0.03, 2);
  p.bevel(0, 0, 64, 64, 0.14, 0.22);
  p.bevel(8, 6, 48, 24, 0.12, -0.14);
  p.bevel(8, 34, 48, 24, 0.12, -0.14);
}, 8);
defineTexture('lv99_halo', (p) => { p.fill([255, 250, 232]); p.noise(4, 0.04, 2); }, 4);
defineTexture('lv99_sign', (p) => {
  p.fill([255, 251, 236]);
  p.text('LEVEL 100', 5, 4, [60, 44, 30], 1);
  p.rect(0, 15, 64, 1, [200, 170, 110]);
  p.rect(0, 0, 64, 1, [200, 170, 110]);
}, 6);
defineTexture('lv99_sconce', (p) => { p.fill([255, 216, 150]); p.disc(32, 32, 20, [255, 244, 210]); }, 4);
defineTexture('lv99_conc', (p) => {
  p.fill([128, 126, 118]);
  p.noise(5, 0.12, 3);
  p.noise(16, 0.06, 2);
  p.speckle(40, [96, 94, 88], 0.3, 0.7);
  p.speckle(14, [158, 156, 148], 0.2, 0.5);
  for (let i = 0; i < 4; i++) p.stain(10 + i * 16, 10 + (i * 21) % 40, 9, [92, 90, 84], 0.4);
}, 10);
defineTexture('lv99_conc_floor', (p) => {
  p.fill([104, 102, 96]);
  p.noise(6, 0.1, 3);
  p.rect(0, 0, 64, 1, [80, 78, 74]); p.rect(0, 0, 1, 64, [80, 78, 74]);
  p.speckle(40, [130, 128, 120], 0.3, 0.6);
}, 8);
defineTexture('lv99_conc_ceil', (p) => {
  p.fill([112, 110, 104]);
  p.noise(5, 0.1, 3);
  p.stain(30, 30, 18, [86, 84, 80], 0.4);
}, 8);

defineMaterial('lv99_wall', 'lv99_wall', { su: 3, sv: 6, surf: 'tile', stain: 0.05 });
defineMaterial('lv99_floor', 'lv99_floor', { s: 2.5, surf: 'tile', stain: 0.04 });
defineMaterial('lv99_inlay', 'lv99_inlay', { su: 1, sv: 4, surf: 'tile' });
defineMaterial('lv99_ceil', 'lv99_ceil', { s: 2, surf: 'tile' });
defineMaterial('lv99_stone', 'lv99_stone', { s: 1.5, surf: 'tile' });
defineMaterial('lv99_door', 'lv99_door', { s: 1, surf: 'wood' });
defineMaterial('lv99_halo', 'lv99_halo', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 1.25 });
defineMaterial('lv99_sign', 'lv99_sign', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 1.15 });
defineMaterial('lv99_sconce', 'lv99_sconce', { s: 1, flags: VF.FULLBRIGHT, glow: 1.1 });
defineMaterial('lv99_conc', 'lv99_conc', { su: 3, sv: 2.4, surf: 'concrete', stain: 0.14 });
defineMaterial('lv99_conc_floor', 'lv99_conc_floor', { s: 2, surf: 'concrete', stain: 0.1 });
defineMaterial('lv99_conc_ceil', 'lv99_conc_ceil', { s: 2, surf: 'concrete' });

// ---- the last door: a smooth slab in a frame, no handle on either side
defineProp('lv99_door', {
  build(mb) {
    const d = S('lv99_door'), st = S('lv99_stone'), h = S('lv99_halo');
    mb.box(-0.72, 0, -0.16, -0.54, 2.7, 0.04, st);
    mb.box(0.54, 0, -0.16, 0.72, 2.7, 0.04, st);
    mb.box(-0.72, 2.52, -0.16, 0.72, 2.7, 0.04, st);
    mb.box(-0.54, 0.02, -0.07, 0.54, 2.52, -0.02, [d, d, d, d, d, d], { uv: ['world', 'world', 'world', 'world', [1, 0, 0, 1], [0, 0, 1, 1]] });
    // light round the edges of the slab
    mb.box(-0.54, 0, -0.045, 0.54, 0.02, -0.03, h);
    // the glowing wall behind it and the sign over it (the wall is 0.12 behind the prop's origin)
    mb.box(-1.1, 0, 0.09, 1.1, 3.1, 0.12, h);
    const sg = S('lv99_sign');
    mb.box(-1.4, 3.2, 0.06, 1.4, 3.78, 0.12, [sg, sg, sg, sg, sg, sg], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 0.25]] });
    void T;
  },
  boxes: [[-0.72, 0, -0.16, 0.72, 2.7, 0.06]],
  use: 'leveldoor',
  emitter: { snd: 'lv99_final', y: 1.4, vol: 1, rad: 70 },
});

// ---- the service lattice (24 m grid, three cells wide)
const inBand = (v) => { const m = ((v % 24) + 24) % 24; return m >= 11 && m <= 13; };
const SERV_H = 2.4;

function lattice(zb) {
  // open every cell on a lattice line, except in the hall's footprint (it keeps its own walls)
  zb.fill(zb.x0, zb.z0, zb.x1, zb.z1, (x, z, i) => {
    const foot = x >= -4 && x < 5 && z >= 0 && z < 77;
    const cross = foot && XBANDS.some((c) => z >= c - 1 && z <= c + 1);
    if (!((inBand(x) || inBand(z)) && (!foot || cross))) return;
    zb.solid[i] = 0; zb.floor[i] = 0; zb.ceil[i] = SERV_H;
    zb.fmat[i] = M.lv99_conc_floor; zb.cmat[i] = M.lv99_conc_ceil; zb.wmat[i] = M.lv99_conc;
  });
  // bare cage bulbs at the crossings and mid-way along every segment
  const gx0 = Math.floor(zb.x0 / 24) - 1, gx1 = Math.floor(zb.x1 / 24) + 1, gz0 = Math.floor(zb.z0 / 24) - 1, gz1 = Math.floor(zb.z1 / 24) + 1;
  for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
    const cx = gx * 24 + 12.5, cz = gz * 24 + 12.5;
    const spots = [[cx, cz], [cx + 12, cz], [cx, cz + 12]];
    for (const [x, z] of spots) {
      if (!owns(zb, x, z)) continue;
      if (x >= -4 && x < 5 && z >= 0 && z < 77) continue;
      const u = hr(Math.floor(x), Math.floor(z), 9901);
      ceilingLight(zb, x, z, 'cage', u < 0.1 ? 'off' : u < 0.2 ? 'flicker' : 'on', { rad: 8.5, int: 0.85, color: [1.0, 0.82, 0.55] });
    }
    // a level door on the wall of about every third segment (always near the hall's doorways)
    const forced = gz === 1 && (gx === 0 || gx === -2);
    const horiz = forced || hr(gx, gz, 9902) < 0.12, vert = hr(gx, gz, 9903) < 0.12;
    const inFoot = (x, z) => x >= -4 && x < 5 && z >= 0 && z < 77;
    if (horiz) {
      const x = cx + 4 + Math.floor(hr(gx, gz, 9904) * 6) + 0.5, north = hr(gx, gz, 9905) < 0.5;
      const dz = north ? cz - 1.5 + 0.12 : cz + 1.5 - 0.12;
      if (owns(zb, x, dz) && !inFoot(x, dz)) levelDoor(zb, x, dz, north ? Math.PI : 0);
    }
    if (vert) {
      const z = cz + 4 + Math.floor(hr(gx, gz, 9906) * 6) + 0.5, west = hr(gx, gz, 9907) < 0.5;
      const dx = west ? cx - 1.5 + 0.12 : cx + 1.5 - 0.12;
      if (owns(zb, dx, z) && !inFoot(dx, z)) levelDoor(zb, dx, z, west ? Math.PI / 2 : -Math.PI / 2);
    }
  }
}

// ---- the hall
function hall(zb) {
  if (zb.x1 <= -4 || zb.x0 >= 5 || zb.z1 <= 0 || zb.z0 >= 77) return;
  carve(zb, HX0, HZ0, HX1, HZ1, 0, HH, M.lv99_floor, M.lv99_ceil, M.lv99_wall);
  // the doorways through the wall mass (2.4 m high, ivory inside the hall's walls)
  for (const c of XBANDS) {
    carve(zb, -4, c - 1, HX0, c + 2, 0, SERV_H, M.lv99_floor, M.lv99_ceil, M.lv99_wall);
    carve(zb, HX1, c - 1, 5, c + 2, 0, SERV_H, M.lv99_floor, M.lv99_ceil, M.lv99_wall);
  }
  // the inlay down the middle
  zb.fill(0, HZ0, 1, HZ1, (x, z, i) => { if (zb.ceil[i] === HH) zb.fmat[i] = M.lv99_inlay; });
  // the wall behind the arrival door
  cbox(zb, HX0, 0, 75.3, HX1, HH, 76, M.lv99_wall);
  // pilasters every 8 m (not across the doorways), sconces between them, brighter toward the door
  for (let z = 4; z < 76; z += 8) {
    for (const side of [-1, 1]) {
      const wallX = side < 0 ? HX0 : HX1;
      const nearBand = XBANDS.some((c) => Math.abs(z - c - 0.5) < 2.4);
      if (!nearBand) {
        const a = side < 0 ? wallX : wallX - 0.42, b = side < 0 ? wallX + 0.42 : wallX;
        cbox(zb, a, 0, z - 0.4, b, HH - 0.5, z + 0.4, M.lv99_wall, { sub: 1 });
        cbox(zb, a - (side < 0 ? 0 : 0.08), 0, z - 0.5, b + (side < 0 ? 0.08 : 0), 0.5, z + 0.5, M.lv99_stone, { sub: 1 });
        cbox(zb, a - (side < 0 ? 0 : 0.08), HH - 0.5, z - 0.5, b + (side < 0 ? 0.08 : 0), HH, z + 0.5, M.lv99_stone, { sub: 1 });
      }
      const sz = z + 4;
      if (sz < 74 && !XBANDS.some((c) => Math.abs(sz - c - 0.5) < 2.2) && owns(zb, wallX, sz)) {
        const k = 1 - sz / 76;
        const sx = side < 0 ? wallX : wallX - 0.14;
        zb.box(sx, 2.3, sz - 0.12, sx + 0.14, 2.8, sz + 0.12, M.lv99_sconce, { collide: false });
        zb.light(side < 0 ? wallX + 0.7 : wallX - 0.7, 2.5, sz, { color: [1.0, 0.86 + 0.1 * k, 0.62 + 0.28 * k], rad: 8.5, int: 0.45 + 0.95 * k });
      }
    }
  }
  // the door at the far end, with its light and its sign
  if (owns(zb, 0.5, 1.2)) {
    const d = levelDoor(zb, 0.5, 1.12, Math.PI, { propOpts: { message: 'It has no handle.' } });
    zb.props[zb.props.length - 1].type = 'lv99_door';
    void d;
    zb.light(0.5, 1.8, 3.2, { color: [1.0, 0.97, 0.88], rad: 10, int: 1.5 });
    zb.light(0.5, 3.4, 2.5, { color: [1.0, 0.95, 0.85], rad: 8, int: 0.9 });
  }
}

function gen(zb) {
  solidAll(zb, M.lv99_conc);
  lattice(zb);
  hall(zb);
}

defineZone('lv99_zone', {
  ...LEVEL_ZONE,
  params: (zone) => {
    const inHall = zone.x0 >= -32 && zone.x0 < 32 && zone.z0 >= 0 && zone.z0 < 96;
    if (inHall) {
      const k = clamp(1 - ((zone.z0 + zone.z1) / 2) / 80, 0, 1);
      const A = 0.05 + 0.085 * k;
      return {
        ambient: [A * 1.1, A * 0.98, A * 0.8],
        env: env({ fog: mix3([0.035, 0.028, 0.022], [0.16, 0.14, 0.11], k), fogNear: 4, fogFar: 96, hum: 0, hvac: 0.1, reverb: 'hall', tone: 'lv99' }),
      };
    }
    return {
      ambient: [0.1, 0.092, 0.08],
      env: env({ fog: [0.04, 0.038, 0.034], fogNear: 3, fogFar: 44, hum: 0.12, hvac: 0.3, reverb: 'corridor', tone: 'lv99b' }),
    };
  },
  gen,
});

defineLevel(N, {
  name: 'THE LAST HALLWAY',
  zoneType: 'lv99_zone',
  zoneSize: 32,
  entry: { x: 0.5, y: 0, z: 74.2, yaw: 0 },
  doorDensity: 0,
  viewRadius: 5,
  light: { phoneRadius: 4.5, phoneIntensity: 0.26, phoneColor: [1.0, 0.92, 0.75] },
  script(ctx) {
    // the nearer the door, the stiller the air: fog opens up toward the last door
    const p = ctx.player;
    if (p.x > -4 && p.x < 5 && p.z > 0 && p.z < 77) ctx.game.look = { fogFar: 96, fogNear: 4 + 6 * clamp(1 - p.z / 76, 0, 1) };
    else ctx.game.look = null;
  },
});
void FACE;
