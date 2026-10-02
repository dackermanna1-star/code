// Level 27: The Red Corridor. A narrow hallway lit only by red emergency lamps, dead straight for
// a hundred metres at a time. Every 100 m it meets a crossing. The corridors toward the north
// get shorter (lower ceiling, narrower walls, fewer lamps) with every crossing; the corridors
// toward the east get quieter (the room tone fades to nothing). Neither is safer than the
// other, and the south and west lead back to where it is still ordinary.
//
// Layout (absolute coordinates): nodes at (100 i, 100 j), each a 7 x 7 m hazard-striped room;
// corridors of three cells run between them. Style depends only on position, so every zone
// agrees about its neighbours: s(z) = steps to the north, q(x) = steps to the east.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, cbox, owns, hr, levelDoor, env, M, FACE } from './kit.js';
import { solidAll, carve, clamp } from './g09_kit.js';

const N = 27;
const G = 100;

// ---- textures
defineTexture('lv27_wall', (p) => {
  p.fill([150, 40, 38]);
  p.noise(6, 0.1, 3);
  // darker dado with a black line, a paler band under the ceiling
  p.rect(0, 40, 64, 24, [84, 20, 22]);
  p.rect(0, 39, 64, 1, [30, 8, 8]);
  p.rect(0, 0, 64, 5, [132, 36, 34]);
  for (let i = 0; i < 9; i++) p.drip(4 + i * 7, 6 + (i * 5) % 9, 10 + (i * 11) % 24, [80, 20, 20], 0.35, 1);
  p.speckle(40, [48, 12, 12], 0.4, 0.8);
  p.speckle(18, [170, 60, 52], 0.2, 0.5);
}, 10);
defineTexture('lv27_floor', (p) => {
  p.fill([62, 30, 28]);
  p.noise(8, 0.12, 3);
  p.rect(0, 0, 64, 1, [40, 18, 18]); p.rect(0, 0, 1, 64, [40, 18, 18]);
  p.rect(32, 0, 1, 64, [46, 22, 22]); p.rect(0, 32, 64, 1, [46, 22, 22]);
  p.speckle(60, [92, 48, 44], 0.3, 0.7);
  p.stain(20, 40, 12, [34, 16, 16], 0.5);
}, 8);
defineTexture('lv27_ceil', (p) => {
  p.fill([54, 20, 20]);
  p.noise(8, 0.12, 2);
  p.rect(0, 0, 64, 2, [30, 10, 10]); p.rect(0, 0, 2, 64, [30, 10, 10]);
  p.speckle(30, [86, 34, 32], 0.3, 0.6);
}, 8);
defineTexture('lv27_pipe', (p) => {
  p.fill([96, 40, 36]);
  p.map((x, y, c) => { const k = 0.65 + 0.5 * Math.sin((y / 64) * Math.PI); return [c[0] * k, c[1] * k, c[2] * k]; });
  for (let x = 0; x < 64; x += 24) p.rect(x, 0, 3, 64, [44, 18, 16]);
}, 8);
defineTexture('lv27_lamp', (p) => {
  p.fill([255, 80, 56]);
  p.rect(0, 0, 64, 6, [150, 30, 22]); p.rect(0, 58, 64, 6, [150, 30, 22]);
  for (let x = 8; x < 64; x += 14) p.rect(x, 0, 3, 64, [200, 50, 36]);
  p.disc(32, 32, 10, [255, 190, 160]);
}, 8);
defineTexture('lv27_arrow', (p) => {
  p.clearAlpha(0);
  p.rect(26, 8, 12, 30, [200, 40, 34]);
  for (let k = 0; k < 18; k++) p.rect(32 - k, 36 + k, 2 * k + 2, 1, [200, 40, 34]);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = p.i(x, y);
    p.a[i] = (p.r[i] > 150 && p.g[i] < 80) ? 255 : 0;
  }
}, 4);

defineMaterial('lv27_wall', 'lv27_wall', { su: 3.2, sv: 3.0, surf: 'concrete', stain: 0.12 });
defineMaterial('lv27_floor', 'lv27_floor', { s: 2, surf: 'lino', stain: 0.1 });
defineMaterial('lv27_ceil', 'lv27_ceil', { s: 2, surf: 'concrete' });
defineMaterial('lv27_pipe', 'lv27_pipe', { s: 1, surf: 'metal' });
defineMaterial('lv27_lamp', 'lv27_lamp', { s: 1, flags: VF.FULLBRIGHT, glow: 1.15 });
defineMaterial('lv27_beacon', 'lv27_lamp', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 1.25 });

// ---- position-only style
const sAtZ = (z) => clamp(-Math.floor((z + 3) / G), 0, 5);          // steps toward the north
const qAtX = (x) => {                                                // steps toward the east
  const u = x + 3, i = Math.floor(u / G);
  return clamp(i + (u - i * G >= 7 ? 1 : 0), 0, 5);
};
const widthOf = (s) => 2.4 - 0.24 * s;
const heightOf = (s) => 3.0 - 0.22 * s;

const LAMP = [1.0, 0.1, 0.05];

function lampOn(zb, x, z, y, nx, nz, big) {
  // a caged lamp on the wall at (x, z) (the wall's inner face), facing along (nx, nz)
  if (!owns(zb, x, z)) return;
  const d = 0.13;
  const bx0 = Math.min(x, x + nx * d) - (nx ? 0 : 0.26), bx1 = Math.max(x, x + nx * d) + (nx ? 0 : 0.26);
  const bz0 = Math.min(z, z + nz * d) - (nz ? 0 : 0.26), bz1 = Math.max(z, z + nz * d) + (nz ? 0 : 0.26);
  zb.box(bx0, y - 0.13, bz0, bx1, y + 0.13, bz1, M.lv27_lamp, { collide: false });
  zb.light(x + nx * 0.45, y - 0.05, z + nz * 0.45, { color: LAMP, rad: big ? 9 : 7.4, int: big ? 1.3 : 1.35 });
}

// one straight corridor between two node rooms. axis 'x' runs east-west along row j.
function corridor(zb, axis, i, j) {
  const s = axis === 'x' ? sAtZ(G * j) : sAtZ(G * j + 4);
  const H = heightOf(s), Wf = widthOf(s), t = (3 - Wf) / 2;
  const sp = 9 + 1.6 * s;
  if (axis === 'x') {
    let xa = G * i + 4;
    const xb = G * (i + 1) - 3, zc = G * j;
    if (i === -1 && j === 0) xa = -71;                                  // the dead end behind the arrival door
    if (xb <= zb.x0 || xa >= zb.x1 || zc + 2 <= zb.z0 || zc - 1 >= zb.z1) return;
    carve(zb, xa, zc - 1, xb, zc + 2, 0, H, M.lv27_floor, M.lv27_ceil, M.lv27_wall);
    const zN = zc + 0.5 - Wf / 2, zS = zc + 0.5 + Wf / 2;
    cbox(zb, xa, 0, zc - 1, xb, H, zN, M.lv27_wall, { sub: 1, skip: FACE.PY | FACE.NY });
    cbox(zb, xa, 0, zS, xb, H, zc + 2, M.lv27_wall, { sub: 1, skip: FACE.PY | FACE.NY });
    if (i === -1 && j === 0) cbox(zb, -71, 0, zc - 1, -70.42, H, zc + 2, M.lv27_wall, { sub: 1 });
    // a pipe run along the north wall under the ceiling, lamps alternating sides
    cbox(zb, xa, H - 0.34, zN, xb, H - 0.18, zN + 0.16, M.lv27_pipe, { collide: false });
    cbox(zb, xa, H - 0.62, zN, xb, H - 0.5, zN + 0.1, M.lv27_pipe, { collide: false });
    for (let k = 0, x = xa + 6; x < xb - 3; k++, x += sp) {
      const north = k % 2 === 0;
      lampOn(zb, x, north ? zN : zS, H - 0.7, 0, north ? 1 : -1, false);
    }
    if (hr(i, j, 271) < 0.8) {
      const dx = xa + 20 + hr(i, j, 272) * 56 | 0, north = hr(i, j, 273) < 0.5;
      if (owns(zb, dx + 0.5, zc)) levelDoor(zb, dx + 0.5, north ? zN + 0.12 : zS - 0.12, north ? Math.PI : 0);
    }
  } else {
    const za = G * j + 4, zb1 = G * (j + 1) - 3, xc = G * i;
    if (zb1 <= zb.z0 || za >= zb.z1 || xc + 2 <= zb.x0 || xc - 1 >= zb.x1) return;
    carve(zb, xc - 1, za, xc + 2, zb1, 0, H, M.lv27_floor, M.lv27_ceil, M.lv27_wall);
    const xW = xc + 0.5 - Wf / 2, xE = xc + 0.5 + Wf / 2;
    cbox(zb, xc - 1, 0, za, xW, H, zb1, M.lv27_wall, { sub: 1, skip: FACE.PY | FACE.NY });
    cbox(zb, xE, 0, za, xc + 2, H, zb1, M.lv27_wall, { sub: 1, skip: FACE.PY | FACE.NY });
    cbox(zb, xW, H - 0.34, za, xW + 0.16, H - 0.18, zb1, M.lv27_pipe, { collide: false });
    cbox(zb, xW, H - 0.62, za, xW + 0.1, H - 0.5, zb1, M.lv27_pipe, { collide: false });
    for (let k = 0, z = za + 6; z < zb1 - 3; k++, z += sp) {
      const west = k % 2 === 0;
      lampOn(zb, west ? xW : xE, z, H - 0.7, west ? 1 : -1, 0, false);
    }
    if (hr(i, j, 281) < 0.8) {
      const dz = za + 20 + hr(i, j, 282) * 56 | 0, west = hr(i, j, 283) < 0.5;
      if (owns(zb, xc, dz + 0.5)) levelDoor(zb, west ? xW + 0.12 : xE - 0.12, dz + 0.5, west ? Math.PI / 2 : -Math.PI / 2);
    }
  }
}

// a crossing: a 7 x 7 room with a striped floor patch and one big lamp
function node(zb, i, j) {
  const cx = G * i, cz = G * j;
  if (cx + 4 <= zb.x0 || cx - 3 >= zb.x1 || cz + 4 <= zb.z0 || cz - 3 >= zb.z1) return;
  const s = sAtZ(cz), H = heightOf(s) + 0.25;
  carve(zb, cx - 3, cz - 3, cx + 4, cz + 4, 0, H, M.lv27_floor, M.lv27_ceil, M.lv27_wall);
  carve(zb, cx - 1, cz - 1, cx + 2, cz + 2, 0, H, M.hazard);
  if (owns(zb, cx + 0.5, cz + 0.5)) {
    zb.box(cx - 0.5, H - 0.3, cz - 0.5, cx + 1.5, H - 0.02, cz + 1.5, M.lv27_beacon, { collide: false });
    zb.light(cx + 0.5, H - 0.6, cz + 0.5, { color: LAMP, rad: 9, int: 1.2 });
  }
  // lamps in the four corners keep the room from going black at the edges
  for (const [ox, oz] of [[-2.7, -2.7], [3.7, -2.7], [-2.7, 3.7], [3.7, 3.7]]) {
    const x = cx + ox, z = cz + oz;
    if (owns(zb, x, z)) zb.light(x, H - 0.6, z, { color: LAMP, rad: 5, int: 0.5 });
  }
}

function gen(zb) {
  solidAll(zb, M.lv27_wall);
  const i0 = Math.floor((zb.x0 - 8) / G), i1 = Math.floor((zb.x1 + 8) / G);
  const j0 = Math.floor((zb.z0 - 8) / G), j1 = Math.floor((zb.z1 + 8) / G);
  for (let j = j0; j <= j1 + 1; j++) for (let i = i0; i <= i1 + 1; i++) {
    node(zb, i, j);
    corridor(zb, 'x', i, j);
    corridor(zb, 'z', i, j);
  }
}

defineZone('lv27_red', {
  ...LEVEL_ZONE,
  params: (zone) => {
    const cx = (zone.x0 + zone.x1) / 2, cz = (zone.z0 + zone.z1) / 2;
    const q = qAtX(cx), s = sAtZ(cz);
    return {
      ambient: [0.115, 0.008, 0.008],
      env: env({ fog: [0.2, 0.012, 0.01], fogNear: 2, fogFar: 80 - 6 * s, hum: 0, hvac: 0, reverb: s > 2 ? 'tiny' : 'corridor', tone: 'lv27_' + q }),
    };
  },
  gen,
});

defineLevel(N, {
  name: 'THE RED CORRIDOR',
  zoneType: 'lv27_red',
  zoneSize: 32,
  entry: { x: -69.5, y: 0, z: 0.5, yaw: Math.PI / 2 },
  doorDensity: 0,
  viewRadius: 5,
  light: { phoneRadius: 4.2, phoneIntensity: 0.26, phoneColor: [1.0, 0.55, 0.45] },
  script(ctx, dt) {
    const p = ctx.player, st = ctx.state;
    const q = qAtX(p.x);
    // the further east, the less the building says: no stray noises from far off
    if (q >= 2 && ctx.game.events) ctx.game.events.timer = Math.max(ctx.game.events.timer, 30);
    // now and then a relay ticks somewhere along the walls (only while it is still audible)
    st.t = (st.t ?? 25) - dt;
    if (st.t > 0) return;
    st.t = 30 + Math.random() * 50;
    if (q < 3) {
      const a = Math.random() < 0.5 ? 0 : Math.PI, d = 14 + Math.random() * 22;
      ctx.game.audioCall('play', 'relay', p.x + Math.cos(a) * d, p.y + 1.5, p.z + Math.sin(a) * d, { distant: true, vol: 0.9 - 0.2 * q });
    }
  },
});
