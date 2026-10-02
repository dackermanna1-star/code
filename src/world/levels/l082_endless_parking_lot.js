// Level 82: The Endless Parking Lot. A flat lot under an orange sky with a low sun that never
// sets. Double rows of bays and wide aisles run to the horizon; every parked car is the same
// white sedan, nose to the median, and light poles stand along the medians as far as the haze
// lets you see. Now and then a pole chimes, as if a store were closing somewhere.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, openGround, cbox, owns, hr, levelDoor, env, M } from './kit.js';

const N = 82;
const MZ = 20;                 // module: bays 6 | bays 6 | aisle 8
const BWID = 2.5;              // bay width
const POLE_DX = 20;            // poles along each median
const SUN = [1, 0.085, -0.12];

// ------------------------------------------------------------------ textures
function asphalt(p, seed, bay) {
  p.fill([86, 76, 70]);
  p.noise(3, 0.1, 3);
  p.noise(9, 0.08, 2, seed + 1);
  p.grain(0.07);
  const r = p.rng;
  for (let i = 0; i < 3; i++) p.stain(r.int(0, 63), r.int(0, 63), r.range(5, 11), [40, 36, 36], 0.5);
  p.speckle(60, [118, 104, 96], 0.25, 0.6);
  if (bay) { for (const lx of [0, 32]) { p.rect(lx, 0, 1, 64, [214, 206, 188]); p.rect(lx + 1, 0, 1, 64, [214, 206, 188], 0.4); } }
  else {
    for (let k = 0; k < 4; k++) { let x = r.int(0, 63), y = r.int(0, 63); for (let n = 0; n < 24; n++) { p.set(x, y, [30, 28, 28], 0.9); x += r.int(-1, 1) + 1; y += r.int(-1, 1); } }
  }
}
defineTexture('lv82_asphalt_a', (p) => asphalt(p, 5, false), 10);
defineTexture('lv82_asphalt_b', (p) => asphalt(p, 15, false), 10);
defineTexture('lv82_bay', (p) => asphalt(p, 25, true), 10);
defineTexture('lv82_booth', (p) => {
  p.fill([208, 196, 170]);
  p.noise(4, 0.06, 2);
  for (let y = 0; y < 64; y += 8) { p.rect(0, y, 64, 1, [160, 148, 126], 0.8); p.rect(0, y + 1, 64, 1, [228, 216, 190], 0.5); }
  p.rect(0, 0, 64, 4, [170, 70, 40]);
  p.grain(0.04);
}, 10);
defineTexture('lv82_horizon', (p) => {
  p.clearAlpha(0);
  const c = [255, 255, 255];
  const put = (x, y, w, h) => { p.rect(x, y, w, h, c); p.rectA(x, y, w, h, 255); };
  // a far row of lamp poles with their arms, and the low backs of cars between them
  for (let k = 0; k < 8; k++) {
    const x = k * 8 + 3, h = 20 + ((k * 5) % 3) * 6;
    put(x, 64 - h, 2, h);
    put(x - 3, 64 - h, 8, 2);
    put(x - 3, 66 - h, 2, 1); put(x + 3, 66 - h, 2, 1);
  }
  for (let x = 0; x < 64; x += 5) put(x, 59 + ((x * 7) % 3), 4, 5);
  put(0, 62, 64, 2);
}, 4);

defineMaterial('lv82_asphalt_a', 'lv82_asphalt_a', { s: 4, surf: 'asphalt' });
defineMaterial('lv82_asphalt_b', 'lv82_asphalt_b', { s: 4, surf: 'asphalt' });
defineMaterial('lv82_bay', 'lv82_bay', { su: 5, sv: 6, surf: 'asphalt' });
defineMaterial('lv82_booth', 'lv82_booth', { su: 2, sv: 2.4, surf: 'metal' });

// ------------------------------------------------------------------ layout
// the arrival: a pay booth stands in the aisle, its door on the east face
const ENTRY = { x: 30.5, z: 15.5 };
const BOOTH_FACE = ENTRY.x - 0.75 - 0.13;           // wall plane behind the arrival door

function booth(zb, x1, zc, rot, entry) {
  // a 3 x 3 booth whose door-side wall plane is x1 (door side east when rot = PI/2)
  const w = 3, hgt = 2.8;
  const dir = Math.round(Math.sin(rot));
  const bx0 = dir > 0 ? x1 - w : x1, bx1 = dir > 0 ? x1 : x1 + w;
  cbox(zb, bx0, 0, zc - 1.5, bx1, hgt, zc + 1.5, M.lv82_booth);
  cbox(zb, bx0 - 0.3, hgt, zc - 1.8, bx1 + 0.3, hgt + 0.2, zc + 1.8, M.metal_dark);
  const dx = dir > 0 ? x1 : x1;
  if (owns(zb, x1, zc)) {
    // lit windows on the sides, a sign
    for (const side of [-1, 1]) zb.decal((bx0 + bx1) / 2, 1.75, zc + side * 1.5 + (side > 0 ? 0.0 : 0.0), side > 0 ? 'pz' : 'nz', 1.5, 0.9, 'window_lit', { lit: false, glow: 1.0 });
    zb.decal(dir > 0 ? bx0 : bx1, 1.75, zc, dir > 0 ? 'nx' : 'px', 1.5, 0.9, 'window_lit', { lit: false, glow: 1.0 });
    if (!entry) levelDoor(zb, dx + dir * 0.13, zc, rot, {});
  }
}

function pole(zb, x, z, k) {
  if (!owns(zb, x, z)) return;
  const H = 9.2;
  cbox(zb, x - 0.45, 0, z - 0.45, x + 0.45, 0.5, z + 0.45, M.concrete);
  zb.box(x - 0.08, 0.5, z - 0.08, x + 0.08, H, z + 0.08, M.metal_dark);
  zb.box(x - 0.06, H - 0.1, z - 1.7, x + 0.06, H, z + 1.7, M.metal_dark, { collide: false });
  for (const s of [-1, 1]) zb.box(x - 0.2, H - 0.3, z + s * 1.7 - 0.3, x + 0.2, H - 0.1, z + s * 1.7 + 0.3, M.glow_bulb, { collide: false });
  if (k % 3 === 0) zb.emitter(x, H - 0.5, z, 'g05_pole', { vol: 0.3, rad: 16 });
}

function gen(zb) {
  zb.noConnectivity = true;
  openGround(zb, M.lv82_asphalt_a, 0);
  const { x0, z0, x1, z1 } = zb;
  zb.fill(x0, z0, x1, z1, (x, z, i) => {
    const zi = ((z % MZ) + MZ) % MZ;
    if (zi < 12) zb.fmat[i] = M.lv82_bay;
    else zb.fmat[i] = hr(Math.floor(x / 4), Math.floor(z / 4), 8201) < 0.5 ? M.lv82_asphalt_a : M.lv82_asphalt_b;
  });
  const jA = Math.floor(z0 / MZ), jB = Math.floor((z1 - 1) / MZ);
  const bA = Math.floor(x0 / BWID) - 1, bB = Math.floor(x1 / BWID) + 1;
  for (let j = jA; j <= jB; j++) {
    const base = j * MZ, med = base + 6;
    // poles along the median
    for (let k = Math.floor(x0 / POLE_DX) - 1; k <= Math.floor(x1 / POLE_DX); k++) pole(zb, k * POLE_DX + 10, med, k + j);
    // cars, nose to the median
    for (let row = 0; row < 2; row++) for (let b = bA; b <= bB; b++) {
      const cx = b * BWID + BWID / 2, cz = base + (row === 0 ? 3 : 9);
      if (!owns(zb, cx, cz)) continue;
      if (hr(b, j * 2 + row, 8210) > 0.62) continue;
      const nearPole = Math.abs(((cx - 10) % POLE_DX + POLE_DX) % POLE_DX - POLE_DX / 2) > POLE_DX / 2 - 1.5;
      if (nearPole) continue;
      if (Math.abs(cx - ENTRY.x) < 6 && Math.abs(cz - ENTRY.z) < 3) continue;
      // row 0 has its nose to the south (rot PI), row 1 to the north; the sun is in the east
      zb.prop('g05_car', cx, 0, cz, row === 0 ? Math.PI : 0, { kind: 'sedan', tint: [1, 1, 1], sun: row === 0 ? -1 : 1 });
    }
    // arrows and a stop bar in the aisle
    for (let k = Math.floor(x0 / 24) - 1; k <= Math.floor(x1 / 24); k++) {
      const ax = k * 24 + 12;
      if (!zb.in(Math.floor(ax), base + 16)) continue;
      zb.decal(ax, 0, base + 13.8, 'up', 2.6, 2.6, 'g05_arrow', { rot: 0 });
      zb.decal(ax + 12, 0, base + 18.2, 'up', 2.6, 2.6, 'g05_arrow', { rot: Math.PI });
    }
    // pay booths in the aisles
    const sx = Math.floor(x0 / 64);
    for (let k = 0; k < 1; k++) {
      if (hr(sx, j, 8220) < 0.45 || (sx === 0 && j === 0)) continue;
      const bx = x0 + 10 + hr(sx, j, 8221) * 40, rot = hr(sx, j, 8222) < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      if (zb.in(Math.floor(bx), base + 16)) booth(zb, Math.floor(bx), base + 16, rot, false);
    }
  }
  if (zb.in(Math.floor(BOOTH_FACE), Math.floor(ENTRY.z))) booth(zb, BOOTH_FACE, ENTRY.z, Math.PI / 2, true);
}

defineZone('lv82_lot', {
  ...LEVEL_ZONE,
  doors: true,
  params: () => ({
    ambient: [1.0, 0.76, 0.56],
    env: env({ fog: [0.9, 0.55, 0.3], fogNear: 8, fogFar: 62, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'g05_lot' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THE ENDLESS PARKING LOT',
  zoneType: 'lv82_lot',
  zoneSize: 64,
  bands: [0],
  entry: { x: ENTRY.x, y: 0, z: ENTRY.z, yaw: Math.PI / 2, pitch: 0.02 },
  doorDensity: 0.7,
  viewRadius: 4,
  sky: {
    top: [0.42, 0.24, 0.34], horizon: [0.9, 0.55, 0.3], ground: [0.55, 0.32, 0.2], curve: 0.55,
    sun: { dir: SUN, color: [1.0, 0.82, 0.5], size: 0.055, halo: 0.55 },
    clouds: { layer: 'g05_clouds', color: [1.0, 0.62, 0.42], amount: 0.5, speed: 0.0015, scale: 0.3 },
    band: { layer: 'lv82_horizon', color: [0.34, 0.18, 0.14], repeat: 10, top: 0.14, bottom: -0.03, fog: 0.35 },
  },
  grade: { sat: 1.08, tint: [1.04, 0.98, 0.92] },
  light: { phoneRadius: 3.0, phoneIntensity: 0.12 },
  // a store closing, announced by a pole: a falling chime from somewhere in the rows
  script(ctx, dt) {
    const s = ctx.state;
    s.t = (s.t ?? 28) - dt;
    if (s.t > 0) return;
    s.t = 55 + Math.random() * 80;
    const p = ctx.player, a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 30;
    ctx.game.audioCall('play', 'g05_pa', p.x + Math.sin(a) * d, 8, p.z - Math.cos(a) * d, { distant: true, vol: 0.9 });
  },
});
