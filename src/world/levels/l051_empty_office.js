// Level 51: The Empty Office. An open-plan floor before the working day, dark, endless, with rows
// of identical desks. Every computer is on and shows the same thing: YOU ARE EARLY.
// Layout (absolute coordinates, so every zone draws its own part): benches of back-to-back desks
// run along x every 5 m, 1.6 m per desk; columns every 8 x 10 m stand in the aisles; one solid
// core (elevator block with a level door) per 64 m zone, with a clear plaza around it.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial } from '../materials.js';
import { defineProp, propMat as S, propGlow as glow, propWithXf as withXf } from '../props.js';
import { defineZone } from '../zonetypes.js';
import { xfMul, xfTranslate, xfRotY } from '../../core/math.js';
import { LEVEL_ZONE, defineLevel, env, M, hr, cbox, owns, kRange, levelDoor, ceilingLight } from './kit.js';
import { centerText, pmod, voidCells, floorSlab, ceilSlab } from './g08_kit.js';

const N = 51;
const CH = 2.7;                 // ceiling height
const PX = 1.6, PZ = 5;         // desk pitch along the bench, bench pitch
const Z = 64;                   // zone size = core spacing

// ------------------------------------------------------------------ textures & materials
defineTexture('lv51_carpet', (p) => {
  p.fill([70, 80, 98]);
  p.grain(0.09);
  p.noise(5, 0.06, 2);
  for (let y = 0; y < 64; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 64; x += 4) p.set(x, y, [44, 50, 62], 0.5);
  p.speckle(40, [70, 78, 92], 0.2, 0.4);
}, 8);
defineTexture('lv51_ceil', (p) => {
  p.fill([88, 94, 100]);
  p.grain(0.05);
  p.noise(3, 0.05, 2);
  for (let k = 0; k < 64; k += 32) for (let i = 0; i < 64; i++) { p.set(i, k, [58, 62, 68]); p.set(k, i, [58, 62, 68]); }
  p.speckle(90, [64, 68, 74], 0.3, 0.6);
}, 8);
defineTexture('lv51_wall', (p) => {
  p.fill([108, 118, 112]);
  p.noise(3, 0.05, 2);
  p.grain(0.025);
  // dado rail and darker base (the image's bottom is the floor)
  p.rect(0, 40, 64, 24, [86, 98, 94]);
  p.rect(0, 38, 64, 2, [150, 156, 148]);
  p.rect(0, 40, 64, 1, [60, 70, 68]);
  p.speckle(60, [78, 88, 84], 0.2, 0.5);
}, 8);
defineTexture('lv51_desk', (p) => {
  p.fill([146, 142, 128]);
  p.noise(4, 0.04, 2);
  p.grain(0.03);
  p.rect(0, 0, 64, 2, [96, 94, 84]);
  p.speckle(50, [120, 116, 104], 0.2, 0.5);
}, 8);
defineTexture('lv51_panel', (p) => {
  p.fill([76, 84, 96]);
  p.noise(3, 0.06, 2);
  p.grain(0.06);
}, 8);
defineTexture('lv51_col', (p) => {
  p.fill([128, 128, 120]);
  p.noise(3, 0.06, 2);
  p.grain(0.03);
  p.rect(0, 40, 64, 24, [96, 98, 92]);
  p.speckle(60, [100, 102, 96], 0.2, 0.5);
}, 8);
defineTexture('lv51_chair', (p) => {
  p.fill([42, 52, 78]);
  p.grain(0.1);
  p.noise(4, 0.08, 2);
}, 6);
// the screen: the same sentence on every monitor of the floor
defineTexture('lv51_screen', (p) => {
  p.fill([10, 70, 84]);
  p.rect(0, 0, 64, 4, [18, 96, 104]); p.rect(0, 60, 64, 4, [18, 96, 104]);
  const ink = [214, 255, 242];
  for (const [t, y] of [['YOU ARE', 14], ['EARLY.', 32]]) {
    centerText(p, t, 31, y, 1, 2, ink);
    centerText(p, t, 32, y, 1, 2, ink);        // doubled for weight
  }
  p.rect(46, 51, 8, 3, ink);                      // a cursor
  p.frame(0, 0, 64, 64, [4, 30, 38]);
}, 6);

defineMaterial('lv51_carpet', 'lv51_carpet', { s: 1.4, surf: 'carpet', stain: 0.1 });
defineMaterial('lv51_ceil', 'lv51_ceil', { s: 1.2, surf: 'drywall' });
defineMaterial('lv51_wall', 'lv51_wall', { su: 2, sv: CH, surf: 'drywall', stain: 0.1 });
defineMaterial('lv51_desk', 'lv51_desk', { s: 0.8, surf: 'plastic' });
defineMaterial('lv51_panel', 'lv51_panel', { s: 1, surf: 'plastic' });
defineMaterial('lv51_col', 'lv51_col', { su: 1, sv: CH, surf: 'concrete', stain: 0.08 });
defineMaterial('lv51_chair', 'lv51_chair', { s: 0.5, surf: 'carpet' });

// ------------------------------------------------------------------ props
function crt(mb, x, y, zc, dir, screen) {
  // a beige 15" monitor on the desk (one box); its screen faces dir (-1: toward -z, +1: toward +z)
  const body = S('plastic_beige');
  const faces = dir < 0 ? [body, body, body, null, body, screen] : [body, body, body, null, screen, body];
  const uv = ['world', 'world', 'world', 'world', dir > 0 ? [0.07, 0.07, 0.93, 0.93] : 'world', dir < 0 ? [0.07, 0.07, 0.93, 0.93] : 'world'];
  mb.box(x - 0.2, y + 0.03, zc - 0.15, x + 0.2, y + 0.38, zc + 0.15, faces, { uv });
}
function chair(mb, x, z, rot) {
  const fab = S('lv51_chair');
  withXf(mb, xfMul(xfTranslate(x, 0, z), xfRotY(rot)), () => {
    mb.box(-0.22, 0.2, -0.22, 0.22, 0.5, 0.22, fab, { skip: 8 });
    mb.box(-0.21, 0.5, 0.18, 0.21, 0.92, 0.23, fab, { skip: 8 });
  });
}
defineProp('lv51_unit', {
  // one desk, its monitor facing south (+z) toward the chair
  build(mb, p, r) {
    const top = S('lv51_desk'), pan = S('lv51_panel');
    mb.box(-0.8, 0.71, -0.4, 0.8, 0.75, 0.4, top, { skip: 8 });
    mb.box(-0.8, 0.0, -0.4, -0.76, 0.71, 0.4, pan, { skip: 1 | 8 });
    crt(mb, r.range(-0.08, 0.08), 0.75, -0.2, 1, glow('lv51_screen', 1.15, 0));
    if (!p.opts.nochair && r.chance(0.6)) chair(mb, r.range(-0.15, 0.15), r.chance(0.5) ? 0.62 : 0.85, r.range(-0.8, 0.8));
  },
  boxes: [[-0.8, 0, -0.4, 0.8, 0.78, 0.4]],
  light: { y: 1.1, z: 0.3, color: [0.3, 0.85, 0.75], rad: 5.6, int: 0.42, cond: (p) => !!p.opts.lit },
  emitter: { snd: 'lv51_whine', vol: 0.45, rad: 7, y: 0.9, cond: (p) => !!p.opts.whine },
});

// ------------------------------------------------------------------ layout
// the solid elevator core of zone (ci, cj): [x0, z0, x1, z1)
function coreOf(ci, cj) {
  if (ci === 0 && cj === 0) return { x0: 28, z0: 17, x1: 36, z1: 25 };
  const w = 6 + 2 * Math.floor(hr(ci, cj, 3) * 3), d = 6 + 2 * Math.floor(hr(ci, cj, 4) * 3);
  const x0 = ci * Z + 14 + Math.floor(hr(ci, cj, 1) * (Z - 28 - w)), z0 = cj * Z + 14 + Math.floor(hr(ci, cj, 2) * (Z - 28 - d));
  return { x0, z0, x1: x0 + w, z1: z0 + d };
}
const PLAZA = 1;
// the arrival chunk is kept bare (carpet beside the first core): it is the first thing built
const COURT = { x0: 32, z0: 16, x1: 48, z1: 32 };
const inCourt = (x0, z0, x1, z1) => x1 > COURT.x0 && x0 < COURT.x1 && z1 > COURT.z0 && z0 < COURT.z1;

function gen(zb) {
  const ci = Math.floor(zb.x0 / Z), cj = Math.floor(zb.z0 / Z);
  zb.noConnectivity = true;
  zb.floor.fill(0);
  zb.ceil.fill(CH);
  zb.fmat.fill(M.lv51_carpet);
  zb.cmat.fill(M.lv51_ceil);
  zb.wmat.fill(M.lv51_wall);
  const c = coreOf(ci, cj);
  voidCells(zb);
  floorSlab(zb, zb.x0, zb.z0, zb.x1, zb.z1, M.lv51_carpet);
  ceilSlab(zb, zb.x0, zb.z0, zb.x1, zb.z1, M.lv51_ceil, CH);
  cbox(zb, c.x0, 0, c.z0, c.x1, CH, c.z1, M.lv51_wall, { skip: 4 | 8 });

  // the core's doors, exit signs and elevator panels (one door per core, on a hashed face; the
  // arrival core's door is the arrival door, which the engine stands on its north face)
  const faces = [
    { dir: 'N', x: (k) => c.x0 + k, z: c.z0, rot: 0, nx: 0, nz: -1, len: c.x1 - c.x0 },
    { dir: 'S', x: (k) => c.x0 + k, z: c.z1, rot: Math.PI, nx: 0, nz: 1, len: c.x1 - c.x0 },
    { dir: 'W', x: () => c.x0, z: (k) => c.z0 + k, rot: -Math.PI / 2, nx: -1, nz: 0, len: c.z1 - c.z0 },
    { dir: 'E', x: () => c.x1, z: (k) => c.z0 + k, rot: Math.PI / 2, nx: 1, nz: 0, len: c.z1 - c.z0 },
  ];
  const doorFace = ci === 0 && cj === 0 ? 0 : Math.floor(hr(ci, cj, 5) * 4);
  faces.forEach((f, fi) => {
    const alongX = f.dir === 'N' || f.dir === 'S';
    const mid = Math.floor(f.len / 2);
    const k = ci === 0 && cj === 0 && fi === 0 ? 4 : 1 + Math.floor(hr(ci, cj, 6 + fi) * (f.len - 2));
    if (fi === doorFace) {
      const cx = alongX ? f.x(k) + 0.5 : f.x(0) + 0, cz = alongX ? f.z : f.z(k) + 0.5;
      if (!(ci === 0 && cj === 0)) levelDoor(zb, cx, cz, f.rot);
      // exit sign over the door
      if (owns(zb, cx + f.nx * 0.3, cz + f.nz * 0.3)) zb.prop('exit_sign', cx + f.nx * 0.2, 2.52, cz + f.nz * 0.2, f.rot, { green: true });
    } else if (fi % 2 === 1 || hr(ci, cj, 20 + fi) < 0.5) {
      // elevator doors: two metal panels with a call button
      const px = alongX ? f.x(mid) : f.x(0), pz = alongX ? f.z : f.z(mid);
      const face = f.nz < 0 ? 'nz' : f.nz > 0 ? 'pz' : f.nx < 0 ? 'nx' : 'px';
      if (owns(zb, px, pz)) {
        zb.decal(px, 1.1, pz, face, 1.8, 2.2, 'elevator');
        zb.prop('exit_sign', px + f.nx * 0.2, 2.5, pz + f.nz * 0.2, f.rot, { green: true });
      }
    }
  });
  // columns: along the aisle rows, every 8 m
  const RZ = 0.2, [j0, j1] = kRange(RZ, 2.5, zb.z0 - 2, zb.z1 + 2);
  for (let j = j0; j <= j1; j++) {
    if (pmod(j, 6) !== 5) continue;
    const z = RZ + j * 2.5 + 0.3;
    for (let a = Math.ceil((zb.x0 - 0.3 - 4) / 8); a * 8 + 4 < zb.x1 + 0.3; a++) {
      const x = a * 8 + 4;
      if (x > c.x0 - PLAZA && x < c.x1 + PLAZA && z > c.z0 - PLAZA && z < c.z1 + PLAZA) continue;
      cbox(zb, x - 0.3, 0, z - 0.3, x + 0.3, CH, z + 0.3, M.lv51_col);
    }
  }
  // desks: one monitor facing south per desk; rows every 2.5 m, an aisle every sixth row and
  // a gap every ninth desk
  const [i0, i1] = kRange(0.8, PX, zb.x0, zb.x1);
  for (let j = j0; j <= j1; j++) {
    const zc = RZ + j * 2.5;
    if (zc < zb.z0 || zc >= zb.z1 || pmod(j, 6) === 5) continue;
    for (let i = i0; i <= i1; i++) {
      const xc = 0.8 + i * PX;
      if (pmod(i, 9) === 8 || inCourt(xc - 0.9, zc - 0.5, xc + 0.9, zc + 1.2)) continue;
      if (xc + 0.9 > c.x0 - PLAZA && xc - 0.9 < c.x1 + PLAZA && zc + 1.1 > c.z0 - PLAZA && zc - 0.5 < c.z1 + PLAZA) continue;
      if (hr(i, j, 41) < 0.01) continue;   // the odd missing desk
      zb.prop('lv51_unit', xc, 0, zc, 0, { whine: hr(i, j, 42) < 0.08, lit: pmod(i * 5 + j * 2, 9) === 0 });
    }
  }
  // ceiling: troffers on a lattice, nearly all dark; a few lit banks far apart
  for (let a = Math.ceil((zb.x0 - 2.4) / 4.8); a * 4.8 + 2.4 < zb.x1; a++) {
    for (let b = Math.ceil((zb.z0 - 5) / 5); b * 5 < zb.z1; b++) {
      const x = a * 4.8 + 2.4, z = b * 5;
      if (x < zb.x0 || z < zb.z0 || z >= zb.z1) continue;
      if (x > c.x0 - 0.5 && x < c.x1 + 0.5 && z > c.z0 - 0.5 && z < c.z1 + 0.5) continue;
      const on = hr(Math.floor(a / 3), Math.floor(b / 2), 61) < 0.16;
      ceilingLight(zb, x, z, 'troffer', on ? (hr(a, b, 62) < 0.06 ? 'flicker' : 'on') : 'off', { mul: 0.62, color: [0.66, 0.8, 0.96] });
    }
  }
}

defineZone('lv51_floor', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.17, 0.2, 0.235],
    env: env({ fog: [0.035, 0.06, 0.085], fogNear: 10, fogFar: 50, hum: 0.12, hvac: 0.45, reverb: 'hall', tone: 'lv51_night' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THE EMPTY OFFICE',
  zoneType: 'lv51_floor',
  zoneSize: Z,
  entry: { x: 32.5, y: 0, z: 16.25, yaw: 0 },
  doorDensity: 0,
  viewRadius: 4,
  grade: { sat: 0.95, tint: [0.94, 1.0, 1.05] },
  light: { phoneRadius: 3.6, phoneIntensity: 0.2 },
  // every minute or two something mechanical happens far off across the floor: a printer
  // starts, feeds a few sheets and stops
  script(ctx, dt) {
    const s = ctx.state;
    if (s.t === undefined || s.t > 130) s.t = 35 + Math.random() * 40;
    s.t -= dt;
    if (s.t > 0) return;
    s.t = 55 + Math.random() * 70;
    const p = ctx.player, a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 22;
    ctx.game.audioCall('play', 'lv51_printer', p.x + Math.sin(a) * d, p.y + 1.1, p.z - Math.cos(a) * d, { distant: true, vol: 0.9 });
  },
});
