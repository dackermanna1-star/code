// Level 32: Hallway 32. A green hallway with a brass number over every door, 1 to 32, all of them
// locked but two. Door 32 is at the far end and puts you back at the beginning. Door 1 is near
// the start and makes the hallway longer: you come out at the start of a hallway whose doors are
// further apart, and so on, each one a little longer than the last. Somewhere in each hallway
// there is one plain grey door that is not numbered.
//
// Layout: hallway c (c = 0, 1, 2, ...) runs east along z = 160 c + 24 (the rows are far enough
// apart that the phone never sees another hallway's door). Door spacing is 6 + 0.8 c metres.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propTex as T, PROP_FIT as FIT } from '../props.js';
import { LEVEL_ZONE, defineLevel, cbox, owns, hr, levelDoor, env, M } from './kit.js';
import { solidAll, carve, wall as solidRect, fadeTeleport, fadeStep } from './g09_kit.js';

const N = 32;
const PITCH = 160;
const H = 3.4;
const zcOf = (c) => PITCH * c + 24;                       // the centre cell row of hallway c
const spacing = (c) => Math.min(30, 6 + 0.8 * c);
const xeOf = (c) => 6 + spacing(c) * 32 + 2;              // plane of the end wall
const LAMPS = [[1.0, 0.9, 0.62], [0.92, 1.0, 0.66], [0.8, 0.94, 1.0]];

// ---- textures
defineTexture('lv32_wall', (p) => {
  p.fill([216, 204, 164]);
  p.noise(5, 0.06, 3);
  for (let x = 0; x < 64; x += 16) p.rect(x, 0, 1, 40, [200, 188, 148]);      // paper seams
  p.rect(0, 40, 64, 24, [40, 80, 56]);                                          // green wainscot
  p.rect(0, 39, 64, 2, [180, 150, 80]);                                         // gold rail
  p.rect(0, 41, 64, 1, [24, 50, 34]);
  for (let x = 0; x < 64; x += 16) { p.frame(x + 2, 46, 12, 14, [28, 58, 40]); }
  p.speckle(30, [180, 168, 130], 0.3, 0.6);
  p.stain(34, 12, 14, [190, 176, 134], 0.4);
}, 12);
defineTexture('lv32_floor', (p) => {
  p.fill([30, 58, 42]);
  p.rect(0, 0, 32, 32, [38, 70, 50]); p.rect(32, 32, 32, 32, [38, 70, 50]);
  p.rect(0, 0, 64, 1, [18, 36, 26]); p.rect(0, 32, 64, 1, [18, 36, 26]); p.rect(0, 0, 1, 64, [18, 36, 26]); p.rect(32, 0, 1, 64, [18, 36, 26]);
  p.noise(7, 0.1, 2);
  p.speckle(40, [70, 106, 78], 0.2, 0.5);
}, 8);
defineTexture('lv32_ceil', (p) => {
  p.fill([206, 196, 158]);
  p.noise(5, 0.07, 2);
  p.rect(0, 0, 64, 3, [176, 164, 124]); p.rect(0, 0, 3, 64, [176, 164, 124]);
  p.stain(40, 40, 16, [190, 176, 134], 0.5);
}, 8);
defineTexture('lv32_wood', (p) => {
  p.fill([92, 56, 32]);
  p.noise(4, 0.1, 3);
  for (let y = 0; y < 64; y += 4) p.rect(0, y, 64, 1, [78, 46, 26], 0.6);
  p.bevel(0, 0, 64, 64, 0.12, 0.25);
  p.bevel(9, 8, 46, 22, 0.2, -0.22);
  p.bevel(9, 36, 46, 21, 0.2, -0.22);
}, 10);
defineTexture('lv32_frame', (p) => { p.fill([58, 34, 20]); p.noise(4, 0.1, 2); }, 6);
defineTexture('lv32_brass', (p) => { p.fill([196, 154, 72]); p.bevel(0, 0, 64, 64, 0.3, 0.4); }, 6);
defineTexture('lv32_globe', (p) => { p.fill([255, 240, 196]); p.disc(32, 32, 24, [255, 252, 226], 1, 8); }, 6);
for (let n = 1; n <= 32; n++) {
  defineTexture('lv32_n' + n, (p) => {
    p.fill([30, 22, 12]);
    p.rect(2, 2, 60, 60, [180, 142, 66]);
    p.bevel(2, 2, 60, 60, 0.3, 0.35);
    p.rect(6, 6, 52, 52, [34, 26, 14]);
    const s = String(n), w = s.length * 18 - 3;
    p.text(s, Math.floor((64 - w) / 2), 21, [238, 206, 122], 3);
  }, 6);
}

defineMaterial('lv32_wall', 'lv32_wall', { su: 3.2, sv: H, surf: 'drywall', stain: 0.08 });
defineMaterial('lv32_floor', 'lv32_floor', { s: 2, surf: 'lino', stain: 0.06 });
defineMaterial('lv32_ceil', 'lv32_ceil', { s: 2, surf: 'drywall', stain: 0.08 });
defineMaterial('lv32_globe', 'lv32_globe', { s: 1, flags: VF.FULLBRIGHT, glow: 1.1 });
defineMaterial('lv32_chain', 'lv32_frame', { s: 1, surf: 'metal' });

// ---- the numbered door: a wooden door in a frame with the brass number above it
const ANG = { N: Math.PI, S: 0, E: -Math.PI / 2 };
defineProp('lv32_door', {
  build(mb, p) {
    const wood = T('lv32_wood'), fr = T('lv32_frame'), br = T('lv32_brass');
    const plate = T('lv32_n' + (p.opts.n || 1));
    // the wall is at local z = 0; everything stands out toward -z
    mb.box(-0.58, 0, -0.1, -0.46, 2.2, 0, fr);
    mb.box(0.46, 0, -0.1, 0.58, 2.2, 0, fr);
    mb.box(-0.58, 2.1, -0.1, 0.58, 2.22, 0, fr);
    mb.box(-0.46, 0.02, -0.06, 0.46, 2.1, -0.02, [wood, wood, wood, wood, wood, wood], { uv: ['world', 'world', 'world', 'world', [1, 0, 0, 1], FIT] });
    mb.box(0.3, 0.95, -0.1, 0.4, 1.03, -0.06, br);
    mb.box(0.3, 0.97, -0.14, 0.34, 1.01, -0.1, br);
    mb.box(-0.3, 2.28, -0.05, 0.3, 2.88, 0, [fr, fr, fr, fr, fr, plate], { uv: ['world', 'world', 'world', 'world', 'world', FIT] });
    // a blade sign standing out from the wall above the door, so the number reads from down the hall
    if (!p.opts.end) mb.box(-0.025, 2.45, -0.8, 0.025, 3.15, 0, [plate, plate, fr, fr, fr, fr], { uv: [FIT, FIT, 'world', 'world', 'world', 'world'] });
  },
  boxes: [[-0.6, 0, -0.14, 0.6, 2.9, 0.02]],
  use: 'level',
});

// ---- layout
// the hallways whose band reaches into the rectangle
function hallsIn(x0, z0, x1, z1) {
  const out = [];
  for (let c = Math.max(0, Math.floor((z0 - 30) / PITCH)); c <= Math.floor((z1 + 10) / PITCH); c++) {
    const zc = zcOf(c);
    if (zc + 2 <= z0 || zc - 1 >= z1) continue;
    if (xeOf(c) + 4 <= x0 || x1 <= -4) continue;
    out.push(c);
  }
  return out;
}

function hall(zb, c) {
  const zc = zcOf(c), s = spacing(c), xe = xeOf(c), lc = LAMPS[c % 3];
  carve(zb, 0, zc - 1, xe, zc + 2, 0, H, M.lv32_floor, M.lv32_ceil, M.lv32_wall);
  // the wall behind the arrival door (a locked copy of it stands at the start of every hallway)
  cbox(zb, 2, 0, zc - 1, 2.45, H, zc + 2, M.lv32_wall, { sub: 1 });
  if (owns(zb, 2.75, zc + 0.5)) levelDoor(zb, 2.75, zc + 0.5, Math.PI / 2, { arrival: true });
  // pendant lamps down the middle, a few of them tired
  for (let x = 4, k = 0; x < xe - 2; x += 8, k++) {
    if (!owns(zb, x, zc + 0.5)) continue;
    const ch = hr(c * 41 + k, 7, 3202) < 0.08 ? 3 : 0;
    zb.box(x - 0.02, H - 0.5, zc + 0.48, x + 0.02, H, zc + 0.52, M.lv32_chain, { collide: false });
    zb.box(x - 0.2, H - 0.78, zc + 0.3, x + 0.2, H - 0.5, zc + 0.7, M.lv32_globe, { collide: false });
    zb.light(x, H - 0.9, zc + 0.5, { color: lc, rad: 8.5, int: 0.85, ch });
  }
  // doors 1..31 on alternating walls; 32 on the end wall
  for (let n = 1; n <= 31; n++) {
    const x = 6 + s * n, north = n % 2 === 1;
    if (!owns(zb, x, north ? zc - 0.5 : zc + 1.5)) continue;
    zb.prop('lv32_door', x, 0, north ? zc - 1 : zc + 2, north ? ANG.N : ANG.S, { n, label: 'OPEN', use: 'level', useR: 0.9, useY: 1.1 });
  }
  if (owns(zb, xe - 0.5, zc + 0.5)) zb.prop('lv32_door', xe, 0, zc + 0.5, ANG.E, { n: 32, end: true, label: 'OPEN', use: 'level', useR: 0.9, useY: 1.1 });
  // the real one: grey, unnumbered, between two numbered doors
  const nr = 4 + Math.floor(hr(c, 5, 3203) * 24), xr = 6 + s * (nr + 0.5), northR = hr(c, 6, 3204) < 0.5;
  if (owns(zb, xr, northR ? zc - 0.5 : zc + 1.5)) levelDoor(zb, xr, northR ? zc - 1 + 0.12 : zc + 2 - 0.12, northR ? Math.PI : 0);
  // a light over it so it is not missed
  if (owns(zb, xr, zc + 0.5)) zb.light(xr, 2.6, zc + 0.5, { color: [1.0, 0.9, 0.7], rad: 5, int: 0.35 });
}

function gen(zb) {
  solidAll(zb, M.lv32_wall);
  for (const c of hallsIn(zb.x0, zb.z0, zb.x1, zb.z1)) hall(zb, c);
}

defineZone('lv32_hall', {
  ...LEVEL_ZONE,
  params: (zone) => {
    const c = Math.max(0, Math.round((zone.z0 + zone.z1) / 2 / PITCH - 0.15));
    const lc = LAMPS[c % 3];
    return {
      ambient: [0.2 * lc[0], 0.19 * lc[1], 0.14 * lc[2]],
      env: env({ fog: [0.07 * lc[0], 0.1 * lc[1], 0.06 * lc[2]], fogNear: 4, fogFar: 54, hum: 0.2, hvac: 0.25, reverb: 'corridor', tone: 'lv32' }),
    };
  },
  gen,
});

const NO = ['It is locked.', 'It is locked.', 'Nobody has the key.', 'It will not open.', 'Locked.', 'It is locked from the other side.'];

defineLevel(N, {
  name: 'HALLWAY 32',
  zoneType: (ctx) => (hallsIn(ctx.x0, ctx.z0, ctx.x1, ctx.z1).length ? 'lv32_hall' : 'lv_void'),
  zoneSize: 64,
  entry: { x: 3.5, y: 0, z: zcOf(0) + 0.5, yaw: Math.PI / 2 },
  doorDensity: 0,
  viewRadius: 4,
  light: { phoneRadius: 4, phoneIntensity: 0.22, phoneColor: [0.85, 1.0, 0.8] },
  script(ctx) {
    fadeStep(ctx.game);
  },
  onUse(ctx, item) {
    const g = ctx.game, o = item.prop.opts, n = o.n;
    const c = Math.max(0, Math.round((item.z - 24) / PITCH));
    if (g.pendingTeleport) return;
    if (n === 32) {
      g.audioCall('play', 'door_open', item.x, item.y, item.z, {});
      g.ui.say('The hallway begins again.', 3);
      fadeTeleport(g, 3.5, 0, zcOf(0) + 0.5, Math.PI / 2, 1.0);
    } else if (n === 1) {
      g.audioCall('play', 'door_open', item.x, item.y, item.z, {});
      g.ui.say('The hallway is longer now.', 3);
      fadeTeleport(g, 3.5, 0, zcOf(c + 1) + 0.5, Math.PI / 2, 1.0);
    } else {
      g.audioCall('play', 'locked_rattle', item.x, item.y, item.z, {});
      g.ui.say(NO[n % NO.length]);
    }
  },
});
void solidRect;
