// Level 44: The Basement Stairs. An ordinary house hall with a staircase going down: green
// wallpaper, a stopped carpet, a bare bulb on every landing. At the bottom is the same hall with
// the same stairs. Every floor is almost identical, the sign on the wall always says FLOOR 3, and
// the number of floors never gets smaller. Halls are joined by plain corridors, so it goes on
// sideways as well as down.
import { defineZone } from '../zonetypes.js';
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { LEVEL_ZONE, defineLevel, env, M, W, hr, levelDoor } from './kit.js';
import { Loc, face } from './g01_kit.js';

const N = 44;
const G = 32, HC = 2.8, SH = 6;                 // zone, house ceiling, storey height
const HALL = [9, 9, 23, 23];
const R = [11, 11, 18, 18];                     // the stairwell (7 x 7)
const WARM = [1.0, 0.8, 0.5];
const T = defineTexture;

// ------------------------------------------------------------------ textures
T('lv44_wall', (p) => {
  // faded green stripe paper above a varnished dado (the image is one house storey tall)
  p.fill([112, 128, 92]);
  p.noise(4, 0.07, 2);
  for (let x = 0; x < 64; x += 8) { p.rect(x, 0, 2, 38, [96, 114, 78], 0.8); p.rect(x + 4, 0, 1, 38, [150, 156, 112], 0.6); }
  for (let y = 4; y < 36; y += 8) for (let x = 2; x < 64; x += 8) p.rect(x, y, 2, 2, [150, 140, 96], 0.7);
  p.rect(0, 38, 64, 2, [70, 48, 30]);
  p.rect(0, 40, 64, 24, [96, 62, 36]);
  for (let x = 0; x < 64; x += 16) { p.rect(x + 1, 43, 14, 18, [82, 52, 30]); p.bevel(x + 1, 43, 14, 18, -0.2, 0.25); }
  p.drip(20, 0, 30, [70, 80, 56], 0.4, 2); p.drip(48, 0, 22, [70, 80, 56], 0.35, 1);
  p.grain(0.05);
}, 14);
T('lv44_ceil', (p) => { p.fill([180, 170, 146]); p.noise(5, 0.08, 3); p.stain(20, 30, 16, [140, 122, 90], 0.45); p.stain(50, 48, 12, [128, 112, 80], 0.4); p.grain(0.05); }, 8);
T('lv44_carpet', (p) => {
  p.fill([120, 84, 44]);
  p.noise(8, 0.1, 2);
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) { p.rect(x + 2, y + 2, 12, 12, [140, 100, 54]); p.rect(x + 5, y + 5, 6, 6, [96, 66, 36]); }
  p.grain(0.07);
}, 10);
T('lv44_wood', (p) => {
  p.fill([112, 74, 42]); p.noise(6, 0.12, 3);
  for (let y = 0; y < 64; y += 10) { p.rect(0, y, 64, 1, [70, 44, 24]); p.rect((y * 7) % 64, y + 1, 1, 9, [80, 52, 30]); }
  p.grain(0.05);
}, 10);
T('lv44_step', (p) => {
  p.fill([150, 108, 60]); p.noise(6, 0.1, 2);
  p.rect(0, 0, 64, 5, [214, 176, 112]); p.rect(0, 5, 64, 2, [70, 48, 28]);
  p.rect(6, 14, 52, 50, [110, 76, 40]); p.grain(0.07);
}, 8);
T('lv44_sky', (p) => {
  p.fill([170, 190, 214]);
  p.rect(0, 30, 64, 4, [60, 54, 48]); p.rect(30, 0, 4, 64, [60, 54, 48]); p.frame(0, 0, 64, 64, [60, 54, 48]); p.frame(1, 1, 62, 62, [60, 54, 48]);
  p.speckle(40, [220, 232, 246], 0.5, 1);
}, 8);
T('lv44_sign', (p) => {
  p.fill([176, 138, 60]); p.noise(5, 0.1, 2);
  p.frame(0, 0, 64, 64, [96, 70, 28]); p.frame(2, 2, 60, 60, [220, 186, 100]);
  p.text('FLOOR', 5, 8, [48, 30, 12], 2);
  p.text('3', 22, 28, [48, 30, 12], 5);
}, 8);
defineMaterial('lv44_wall', 'lv44_wall', { su: 2, sv: 2.8, surf: 'drywall', stain: 0.1 });
defineMaterial('lv44_ceil', 'lv44_ceil', { s: 2, surf: 'drywall', stain: 0.1 });
defineMaterial('lv44_carpet', 'lv44_carpet', { s: 2, surf: 'carpet', stain: 0.08 });
defineMaterial('lv44_wood', 'lv44_wood', { s: 2, surf: 'wood' });
defineMaterial('lv44_step', 'lv44_step', { s: 1.2, surf: 'carpet' });
defineMaterial('lv44_sky', 'lv44_sky', { s: 6, flags: VF.FULLBRIGHT, glow: 0.7, surf: 'drywall' });

// ------------------------------------------------------------------ the zone: one house storey
function gen(zb) {
  zb.noConnectivity = true;
  const Z = new Loc(zb);
  const story = zb.zone.level;
  const top = story === 0;
  const zi = Math.floor(zb.x0 / G), zj = Math.floor(zb.z0 / G);
  const rr = (k) => hr(zi * 31 + story * 7 + k, zj * 17 + k * 3, 4400 + k);
  Z.each(0, 0, G, G, (u, v, i) => { zb.solid[i] = M.lv44_wall; zb.floor[i] = 0; zb.ceil[i] = HC; zb.wmat[i] = M.lv44_wall; });
  const house = { floor: 0, ceil: HC, fmat: M.lv44_carpet, cmat: M.lv44_ceil, wmat: M.lv44_wall };
  Z.carve(HALL[0], HALL[1], HALL[2], HALL[3], house);
  Z.carve(15, 0, 17, G, { ...house, fmat: M.lv44_wood });
  Z.carve(0, 15, G, 17, { ...house, fmat: M.lv44_wood });
  // the well: no floor, and no ceiling either (a skylight at the very top)
  Z.each(R[0], R[1], R[2], R[3], (u, v, i) => { zb.floor[i] = NaN; zb.ceil[i] = top ? SH : NaN; if (top) zb.cmat[i] = M.lv44_sky; });
  rails(Z);
  if (!top) stairs(Z, story);          // the top storey has no flights of its own: only the way down, in the storey below
  // light: a bare bulb hanging in the well and one over the hall's far end
  zb.fixture(Z.x(14.5), Z.z(14.5), 'bulb', true, { y: SH, hang: 1.3, ch: rr(1) < 0.18 ? 6 : 0 });
  Z.light(14.5, SH - 1.8, 14.5, { color: WARM, rad: 10, int: 1.2, ch: rr(1) < 0.18 ? 6 : 0 });
  Z.light(14.5, 2.2, 14.5, { color: WARM, rad: 8, int: 0.7 });
  Z.light(14.5, 1.2, 20.5, { color: WARM, rad: 7, int: 0.55 });
  ceilingLights(Z, rr);
  // the sign that never changes, beside the top of the stairs
  Z.decal(9, 1.6, 12.5, 'px', 0.9, 0.9, 'lv44_sign');
  furnish(Z, rr, story);
}

// open edges around the well get rails, except where the flights start and end
function rails(Z) {
  const [x0, z0, x1, z1] = R;
  const t = W.RAIL;
  for (let z = z0; z < z1; z++) { Z.wall(x0, z, 'W', t, M.lv44_wood, M.lv44_wood); Z.wall(x1, z, 'W', t, M.lv44_wood, M.lv44_wood); }
  for (let x = x0; x < x1; x++) Z.wall(x, z1, 'N', t, M.lv44_wood, M.lv44_wood);
  Z.wall(14, z0, 'N', t, M.lv44_wood, M.lv44_wood);
}

// two flights of fifteen steps and the landing between them, as solid blocks
function stairs(Z, story) {
  const steps = [M.lv44_wood, M.lv44_wood, M.lv44_step, M.lv44_wood, M.lv44_wood, M.lv44_wood];
  const side = M.lv44_wood;
  for (let k = 0; k < 15; k++) {
    const topA = SH - 0.2 * (k + 1), zA = 11 + 0.3 * k;
    Z.box(11, topA - 1.0, zA, 14, topA, zA + 0.3, steps);
    const topB = 3.0 - 0.2 * (k + 1), zB = 15.5 - 0.3 * (k + 1);
    Z.box(15, topB - 1.0, zB, 18, topB, zB + 0.3, steps);
    if (k % 3 === 0) {
      // a stretch of banister wall beside three steps, stepped with them
      const hiA = topA + 1.0, hiB = topB + 1.0, lenA = 0.9;
      for (const [x0, x1] of [[11, 11.12], [13.88, 14]]) Z.box(x0, topA - 0.6 - 0.6, zA, x1, hiA, zA + lenA, side);
      for (const [x0, x1] of [[15, 15.12], [17.88, 18]]) Z.box(x0, topB - 0.6 - 0.6, zB - 0.6, x1, hiB, zB + 0.3, side);
    }
  }
  // landing
  Z.box(11, 2.4, 15.5, 18, 3.0, 18, [M.lv44_wood, M.lv44_wood, M.lv44_step, M.lv44_wood, M.lv44_wood, M.lv44_wood]);
  Z.box(11, 3.0, 17.88, 18, 4.0, 18, M.lv44_wood);
  Z.box(11, 3.0, 15.5, 11.12, 4.0, 18, M.lv44_wood);
  Z.box(17.88, 3.0, 15.5, 18, 4.0, 18, M.lv44_wood);
  void story;
}

function ceilingLights(Z, rr) {
  for (const [u, v] of [[16, 4], [16, 27], [4, 16], [27, 16], [20, 12], [12, 21]]) {
    const r = rr(Math.floor(u * 3 + v));
    Z.fixture(u, v, 'bulb', r > 0.1, { ch: r < 0.14 ? 7 : 0, hang: 0.3 });
    if (r > 0.1) Z.light(u, HC - 0.8, v, { color: WARM, rad: 6.5, int: 0.65, ch: r < 0.14 ? 7 : 0 });
  }
}

// the rest of an ordinary hall: coats, a plant, a table with a lamp and a photograph, closed doors
function furnish(Z, rr, story) {
  const P = (type, u, v, rot, o) => Z.prop(type, u, 0, v, rot, o || {});
  P('coat_rack', 21.8, 10.2, 0, { coat: rr(2) < 0.6 });
  P('plant', 21.8, 21.8, 0, {});
  P('table', 14.5, 21.7, 0, { len: 1.4, depth: 0.5, top: 'wood_dark' });
  Z.prop('lamp_desk', 14.0, 0.75, 21.7, 0, { on: rr(3) > 0.15 });
  Z.prop('photo_frame', 15.2, 0.75, 21.7, 0.4, {});
  P('bench', 11.6, 9.55, face(0, 1), { len: 1.2 });
  if (rr(4) < 0.6) P('umbrella', 22.2, 12.5, 0, {});
  // doors on the east and south walls (they do not open)
  for (const [u, v, r] of [[22.95, 11.5, face(-1, 0)], [22.95, 19.5, face(-1, 0)], [12.0, 22.95, face(0, -1)], [19.5, 22.95, face(0, -1)]]) {
    if (rr(Math.floor(u + v)) < 0.82) Z.prop('door', u, 0, v, r, { tex: 'door_wood' });
  }
  // one of the doors is ajar: a different thing each floor
  if (rr(5) < 0.25) Z.decal(9, 1.1, 18.5, 'px', 0.9, 1.3, 'frame_empty');
  // pictures down the corridors
  for (const [u, v, f] of [[15, 5, 'px'], [17, 27, 'nx'], [5, 15, 'pz'], [27, 17, 'nz']]) if (rr(Math.floor(u * 2 + v)) < 0.7) Z.decal(u, 1.6, v, f, 0.7, 0.9, 'painting_land');
  void story;
}

defineZone('lv44_house', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.22, 0.17, 0.12],
    env: env({ fog: [0.07, 0.052, 0.036], fogNear: 4, fogFar: 34, hum: 0, hvac: 0.1, reverb: 'stairwell', tone: 'lv44_house' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THE BASEMENT STAIRS',
  zoneType: (ctx) => (ctx.story > 0 ? 'lv_void' : 'lv44_house'),
  zoneSize: G,
  bands: 'all',
  entry: { x: 12.5, y: 0, z: 10.5, yaw: Math.PI, pitch: -0.12 },
  doorDensity: 0.5,
  viewRadius: 3,
  light: { phoneRadius: 3.4, phoneIntensity: 0.22 },
  script(ctx, dt) {
    const s = ctx.state, g = ctx.game, p = ctx.player;
    const floors = Math.max(0, Math.round(-p.y / SH));
    if (floors >= (s.next ?? 10)) {
      s.next = floors + 10;
      g.ui.say(`${floors} FLOORS DOWN. THE SIGN STILL SAYS 3.`, 4);
    }
    s.settle = (s.settle ?? 20) - dt;
    if (s.settle < 0) {
      s.settle = 30 + Math.random() * 60;
      const a = Math.random() * 6.28;
      g.audioCall('play', 'lv44_creak', p.x + Math.sin(a) * 9, p.y + 1, p.z - Math.cos(a) * 9, { vol: 0.8 });
    }
  },
});
void pnoise;
