// Level 7: Thalassophobia. A black, waist-deep sea under a night sky that never ends. Narrow
// concrete piers on pillars run across it in long straight lines, lit by sodium lamps; where
// they cross there are bare platforms. Buoys blink far out. You can step off a pier and wade.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, openGround, water, poleLamp, cbox, owns, hr, levelDoor, env, M } from './kit.js';

const N = 7;
const G = 64;            // pier grid (one crossing per zone)
const DECK = 0.35, SEA_FLOOR = -0.9, SEA = -0.15;

defineTexture('lv7_water', (p) => {
  p.fill([18, 28, 34]);
  p.map((x, y, c) => {
    const n = pnoise(x, y * 2, 32, 3) * 0.6 + pnoise(x * 2, y * 4, 16, 9) * 0.4;
    const k = 0.75 + n * 0.5;
    return [c[0] * k + n * 4, c[1] * k + n * 10, c[2] * k + n * 14];
  });
  for (let i = 0; i < 40; i++) { const x = (i * 37) % 64, y = (i * 23 + 7) % 64; p.rect(x, y, 3 + (i % 4), 1, [34, 48, 54], 0.6); }
}, 8);
defineTexture('lv7_silt', (p) => {
  p.fill([28, 26, 22]);
  p.noise(8, 0.12, 3);
  p.speckle(60, [44, 40, 32], 0.3, 0.7);
}, 8);
defineTexture('lv7_pier', (p) => {
  p.fill([104, 104, 98]);
  p.noise(6, 0.08, 3);
  p.map((x, y, c) => { const g = Math.max(0, (y - 40) / 24) * (0.6 + 0.4 * pnoise(x, y, 8, 5)); return [c[0] * (1 - g * 0.5), c[1] * (1 - g * 0.3), c[2] * (1 - g * 0.55)]; });
  p.rect(0, 0, 64, 2, [126, 124, 116]);
  for (let i = 0; i < 6; i++) p.stain(8 + i * 10, 12 + (i % 3) * 14, 6, [70, 76, 60], 0.35);
}, 12);
defineTexture('lv7_buoy', (p) => {
  for (let y = 0; y < 64; y += 16) { p.rect(0, y, 64, 8, [168, 36, 30]); p.rect(0, y + 8, 64, 8, [200, 196, 186]); }
  p.noise(4, 0.08, 2);
}, 8);
defineTexture('lv7_beacon', (p) => { p.fill([255, 60, 40]); p.disc(32, 32, 20, [255, 170, 140]); }, 4);

defineMaterial('lv7_water', 'lv7_water', { s: 3, surf: 'water', flags: VF.WOBBLE | VF.SCROLL });
defineMaterial('lv7_silt', 'lv7_silt', { s: 2, surf: 'water' });
defineMaterial('lv7_pier', 'lv7_pier', { s: 1.4, surf: 'concrete' });
defineMaterial('lv7_buoy', 'lv7_buoy', { s: 1, surf: 'metal' });
defineMaterial('lv7_beacon', 'lv7_beacon', { s: 1, flags: VF.FULLBRIGHT, glow: 1.2, chan: 14 });

// which pier segments exist: east from crossing (i, j), and south from it
const eastOf = (i, j) => (i === 0 && j === 0) || (i === -1 && j === 0) || hr(i, j, 1) < 0.72;
const southOf = (i, j) => (i === 0 && j === 0) || (i === 0 && j === -1) || hr(i, j, 2) < 0.72;

function deck(zb, x0, z0, x1, z1) {
  cbox(zb, x0, DECK - 0.15, z0, x1, DECK, z1, M.lv7_pier);
}

function pillarsAlong(zb, ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 4);
  for (let k = 0; k <= n; k++) {
    const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
    if (owns(zb, x, z)) zb.box(x - 0.22, SEA_FLOOR, z - 0.22, x + 0.22, DECK - 0.15, z + 0.22, M.lv7_pier);
  }
}

function segment(zb, i, j, dir) {
  // from crossing (i, j) to the next one east or south: deck, pillars, lamps
  const cx = i * G + 32, cz = j * G + 32;
  if (dir === 'E') {
    deck(zb, cx + 4, cz - 0.6, cx + G - 4, cz + 0.6);
    pillarsAlong(zb, cx + 4, cz, cx + G - 4, cz);
    for (let k = 1; k < 5; k++) {
      const x = cx + 4 + k * 11.2;
      if (owns(zb, x, cz + 0.45)) poleLamp(zb, x, cz + 0.45, 4.2, { y: DECK, on: hr(i * 7 + k, j, 3) > 0.22, armX: -0.8, color: [1.0, 0.66, 0.32], rad: 9, int: 0.75, ch: hr(i, j * 5 + k, 4) < 0.15 ? 2 : 0 });
    }
  } else {
    deck(zb, cx - 0.6, cz + 4, cx + 0.6, cz + G - 4);
    pillarsAlong(zb, cx, cz + 4, cx, cz + G - 4);
    for (let k = 1; k < 5; k++) {
      const z = cz + 4 + k * 11.2;
      if (owns(zb, cx + 0.45, z)) poleLamp(zb, cx + 0.45, z, 4.2, { y: DECK, on: hr(i, j * 7 + k, 5) > 0.22, armX: -0.8, color: [1.0, 0.66, 0.32], rad: 9, int: 0.75, ch: hr(i * 5 + k, j, 6) < 0.15 ? 2 : 0 });
    }
  }
}

function buoy(zb, x, z, k) {
  if (!owns(zb, x, z)) return;
  zb.box(x - 0.35, SEA_FLOOR, z - 0.35, x + 0.35, SEA + 0.35, z + 0.35, M.lv7_buoy);
  zb.box(x - 0.04, SEA + 0.35, z - 0.04, x + 0.04, SEA + 1.9, z + 0.04, M.metal_dark);
  zb.box(x - 0.1, SEA + 1.9, z - 0.1, x + 0.1, SEA + 2.1, z + 0.1, M.lv7_beacon);
  void k;
}

function gen(zb) {
  openGround(zb, M.lv7_silt, SEA_FLOOR);
  zb.noConnectivity = true;
  water(zb, zb.x0, zb.z0, zb.x1, zb.z1, SEA, M.lv7_water, 0.72);
  const i = Math.floor(zb.x0 / G), j = Math.floor(zb.z0 / G);
  const cx = i * G + 32, cz = j * G + 32;
  // the crossing: a bare platform, sometimes with a shelter and a bench
  if (eastOf(i, j) || eastOf(i - 1, j) || southOf(i, j) || southOf(i, j - 1)) {
    deck(zb, cx - 4, cz - 4, cx + 4, cz + 4);
    for (const [px, pz] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6], [0, -3.6], [0, 3.6], [-3.6, 0], [3.6, 0]]) zb.box(cx + px - 0.3, SEA_FLOOR, cz + pz - 0.3, cx + px + 0.3, DECK - 0.15, cz + pz + 0.3, M.lv7_pier);
    // two lamps on opposite corners (one of them dead now and then)
    poleLamp(zb, cx - 3.3, cz + 3.3, 4.6, { y: DECK, armX: 0.9, color: [1.0, 0.66, 0.32], rad: 10, int: 0.85 });
    poleLamp(zb, cx + 3.3, cz - 3.3, 4.6, { y: DECK, armX: -0.9, on: hr(i, j, 21) > 0.3 || (i === 0 && j === 0), color: [1.0, 0.66, 0.32], rad: 10, int: 0.85, ch: hr(i, j, 22) < 0.2 ? 3 : 0 });
    if (hr(i, j, 9) < 0.45 && !(i === 0 && j === 0)) {
      for (const [px, pz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) zb.box(cx + px - 0.06, DECK, cz + pz - 0.06, cx + px + 0.06, DECK + 2.6, cz + pz + 0.06, M.metal_dark);
      zb.box(cx - 2.6, DECK + 2.6, cz - 2.6, cx + 2.6, DECK + 2.72, cz + 2.6, M.metal_dark);
      zb.prop('bench', cx, DECK, cz + 1.4, Math.PI);
      zb.light(cx, DECK + 2.3, cz, { color: [0.85, 0.95, 1.0], rad: 5, int: 0.45, ch: 6 });
    }
    // a door on some platforms
    if (hr(i, j, 7) < 0.4 && !(i === 0 && j === 0)) levelDoor(zb, cx + 2.5, cz - 2.5, Math.PI / 4 * 5, { y: DECK });
  }
  if (eastOf(i, j)) segment(zb, i, j, 'E');
  if (eastOf(i - 1, j)) segment(zb, i - 1, j, 'E');
  if (southOf(i, j)) segment(zb, i, j, 'S');
  if (southOf(i, j - 1)) segment(zb, i, j - 1, 'S');
  // buoys far out in the water
  for (let k = 0; k < 2; k++) if (hr(i * 3 + k, j, 11) < 0.5) buoy(zb, zb.x0 + 6 + hr(i, j * 3 + k, 12) * 52, zb.z0 + 6 + hr(i + k, j, 13) * 52, k);
  // water lapping at the pillars of the crossing
  zb.emitter(cx, DECK, cz, 'lapping', { vol: 0.8, rad: 14 });
}

defineZone('lv7_sea', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.1, 0.11, 0.14],
    env: env({ fog: [0.085, 0.105, 0.13], fogNear: 4, fogFar: 62, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'ocean' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THALASSOPHOBIA',
  zoneType: 'lv7_sea',
  zoneSize: G,
  entry: { x: 32.5, y: DECK, z: 35.2, yaw: 0 },
  doorDensity: 0.5,
  viewRadius: 4,
  sky: {
    top: [0.012, 0.018, 0.04], horizon: [0.085, 0.105, 0.13], ground: [0.03, 0.036, 0.042], curve: 0.4,
    stars: 0.9,
    sun: { dir: [0.35, 0.1, -1], color: [0.78, 0.8, 0.82], size: 0.02, halo: 0.12 },
  },
  light: { phoneRadius: 4.5, phoneIntensity: 0.28 },
  // now and then something groans far below: steel under pressure, a long way off
  script(ctx, dt) {
    const s = ctx.state;
    s.t = (s.t ?? 50) - dt;
    if (s.t > 0) return;
    s.t = 45 + Math.random() * 90;
    const p = ctx.player, a = Math.random() * Math.PI * 2;
    ctx.game.audioCall('play', 'deep_groan', p.x + Math.sin(a) * 30, p.y - 4, p.z - Math.cos(a) * 30, { distant: true, vol: 1 });
  },
});
