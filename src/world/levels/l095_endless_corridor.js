// Level 95: The Endless Corridor. One white corridor, three metres wide, running north without
// end: no doors, no windows, nothing on the walls. The light is flat and a little too bright near
// the arrival door, and it fails with distance: every hundred metres you walk the panels are
// dimmer, the air is darker, the far end closer. Far out there is only the dark and, rarely, a
// niche in the wall with a door in it that glows faintly.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, cbox, owns, hr, levelDoor, env, M } from './kit.js';
import { solidAll, carve, clamp, mix3 } from './g09_kit.js';

const N = 95;
const H = 2.8;
const Z0 = 8.5;                         // arrival z; the corridor starts just behind it
const LEN = 760;                        // distance over which the light goes out

// 1 at the arrival door, ~0.02 far out
const bright = (z) => {
  const t = clamp((Z0 - z) / LEN, 0, 1);
  return Math.max(0.02, Math.pow(1 - t, 1.7));
};
const band = (b) => (b > 0.7 ? 0 : b > 0.4 ? 1 : b > 0.2 ? 2 : b > 0.08 ? 3 : 4);

defineTexture('lv95_wall', (p) => {
  p.fill([226, 226, 220]);
  p.noise(5, 0.03, 3);
  p.speckle(30, [208, 208, 202], 0.2, 0.5);
}, 6);
defineTexture('lv95_floor', (p) => {
  p.fill([218, 218, 214]);
  p.noise(6, 0.03, 2);
  p.rect(0, 0, 64, 1, [190, 190, 186]); p.rect(0, 0, 1, 64, [190, 190, 186]);
  p.rect(0, 32, 64, 1, [204, 204, 200]); p.rect(32, 0, 1, 64, [204, 204, 200]);
}, 6);
defineTexture('lv95_ceil', (p) => {
  p.fill([232, 232, 228]);
  p.noise(5, 0.025, 2);
  p.rect(0, 0, 64, 1, [206, 206, 202]); p.rect(0, 0, 1, 64, [206, 206, 202]);
}, 6);
defineTexture('lv95_panel', (p) => {
  p.fill([255, 252, 244]);
  p.frame(0, 0, 64, 64, [214, 212, 204]);
  p.frame(3, 3, 58, 58, [238, 236, 228]);
}, 4);

defineMaterial('lv95_wall', 'lv95_wall', { su: 4, sv: 2.8, surf: 'drywall', stain: 0.03 });
defineMaterial('lv95_floor', 'lv95_floor', { s: 2, surf: 'lino', stain: 0.03 });
defineMaterial('lv95_ceil', 'lv95_ceil', { s: 2, surf: 'drywall' });
defineMaterial('lv95_panel', 'lv95_panel', { s: 1, flags: VF.FULLBRIGHT, glow: 1.05 });
defineMaterial('lv95_panel_dim', 'lv95_panel', { s: 1, flags: VF.FULLBRIGHT, glow: 0.45 });
defineMaterial('lv95_panel_off', 'lv95_ceil', { s: 1 });

// niches with a door: one about every 96 m, on alternating sides
const nicheZ = (k) => -(46 + 96 * k) + Math.round((hr(k, 7, 9501) - 0.5) * 30);
const nicheSide = (k) => (hr(k, 9, 9502) < 0.5 ? -1 : 1);

function gen(zb) {
  solidAll(zb, M.lv95_wall);
  const zb0 = zb.z0, zb1 = zb.z1;
  carve(zb, -1, Math.min(zb0, 10), 2, Math.min(zb1, 10), 0, H, M.lv95_floor, M.lv95_ceil, M.lv95_wall);
  // lights: one panel every 4 m, more of them dead the further out
  for (let z = Math.ceil((zb0 - 2) / 4) * 4 + 2; z < Math.min(zb1, 10); z += 4) {
    if (!owns(zb, 0.5, z)) continue;
    const b = bright(z);
    const dead = hr(Math.round(z), 3, 9503) < 0.32 * (1 - b) && z < 0;
    const mat = dead ? M.lv95_panel_off : b > 0.45 ? M.lv95_panel : M.lv95_panel_dim;
    zb.box(-0.1, H - 0.04, z - 0.5, 1.1, H, z + 0.5, mat, { collide: false });
    if (!dead) zb.light(0.5, H - 0.5, z, { color: [1.0, 0.97, 0.9], rad: 9.5, int: 1.0 * (0.25 + 0.75 * b) });
  }
  // the end wall behind the arrival door
  cbox(zb, -1, 0, 9.45, 2, H, 10, M.lv95_wall);
  // niches
  for (let k = 0; k < 40; k++) {
    const z = nicheZ(k);
    if (z + 2 < zb0 || z - 1 >= zb1) continue;
    const side = nicheSide(k);
    const x0 = side > 0 ? 2 : -3, x1 = side > 0 ? 4 : -1;
    carve(zb, x0, z - 1, x1, z + 2, 0, H, M.lv95_floor, M.lv95_ceil, M.lv95_wall);
    if (owns(zb, side > 0 ? 3 : -2, z)) {
      levelDoor(zb, side > 0 ? 4 - 0.12 : -3 + 0.12, z + 0.5, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      zb.light(side > 0 ? 3 : -2, 2.0, z + 0.5, { color: [1.0, 0.88, 0.66], rad: 4, int: 0.35 });
    }
  }
}

defineZone('lv95_hall', {
  ...LEVEL_ZONE,
  params: (zone) => {
    const b = bright((zone.z0 + zone.z1) / 2);
    const A = 0.46 * b;
    return {
      ambient: [A, A, A * 0.97],
      env: env({
        fog: mix3([0, 0, 0], [0.9, 0.9, 0.87], b),
        fogNear: 8, fogFar: 26 + 54 * b,
        hum: 0.6 * b, hvac: 0, reverb: 'corridor', tone: 'lv95_' + band(b),
      }),
    };
  },
  gen,
});

defineLevel(N, {
  name: 'THE ENDLESS CORRIDOR',
  zoneType: (ctx) => (ctx.z0 < 32 && (ctx.x0 === -32 || ctx.x0 === 0) ? 'lv95_hall' : 'lv_void'),
  zoneSize: 32,
  entry: { x: 0.5, y: 0, z: Z0, yaw: 0 },
  doorDensity: 0,
  viewRadius: 5,
  light: { phoneRadius: 5, phoneIntensity: 0.3 },
  script(ctx) {
    // the further out, the heavier the air: the fog closes in smoothly between the zone steps
    const b = bright(ctx.player.z);
    ctx.game.look = { fogFar: 24 + 56 * b, fogNear: 6 + 2 * b };
  },
});
