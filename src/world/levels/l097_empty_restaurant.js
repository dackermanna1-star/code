// Level 97: The Empty Restaurant. An endless candle-lit dining hall: dark wood columns every
// eight metres, a chandelier in every bay, white-clothed tables laid for people who are not
// here, burgundy carpet, brass. Every table holds the same menu with one line on it. The
// price of the special changes every minute.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propGlow, propTex as T } from '../props.js';
import { LEVEL_ZONE, defineLevel, levelDoor, hr, env, M, CF, W, cbox } from './kit.js';
import { mulc, pmod, txtC, txt } from './g06_kit.js';

const N = 97;
const G = 64;
const BAY = 8;
const CH = 4.8;

// ------------------------------------------------------------------ textures
defineTexture('lv97_carpet', (p) => {
  p.fill([92, 20, 30]);
  p.noise(6, 0.1, 2);
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) {
    const cx = x + 8, cy = y + 8;
    for (let k = -6; k <= 6; k++) { const w = 6 - Math.abs(k); p.set(cx - w, cy + k, [160, 120, 56], 0.9); p.set(cx + w, cy + k, [160, 120, 56], 0.9); }
    p.disc(cx, cy, 1.4, [190, 150, 70]);
    p.rect(x, y, 16, 1, [64, 12, 20], 0.7); p.rect(x, y, 1, 16, [64, 12, 20], 0.7);
  }
  p.grain(0.05);
}, 10);
defineMaterial('lv97_carpet', 'lv97_carpet', { s: 2, surf: 'carpet', stain: 0.06 });
defineTexture('lv97_ceil', (p) => {
  p.fill([54, 34, 26]);
  p.noise(4, 0.08, 2);
  p.rect(0, 0, 64, 3, [88, 56, 38]); p.rect(0, 0, 3, 64, [88, 56, 38]);
  p.rect(8, 8, 48, 48, [64, 40, 30]);
  p.frame(8, 8, 48, 48, [90, 60, 40]);
  p.disc(32, 32, 7, [80, 52, 36]);
}, 8);
defineMaterial('lv97_ceil', 'lv97_ceil', { s: 4, surf: 'wood' });
defineTexture('lv97_wood', (p) => {
  p.fill([86, 48, 30]);
  for (let x = 0; x < 64; x += 8) { p.rect(x, 0, 1, 64, [46, 24, 14]); p.rect(x + 1, 0, 1, 64, [120, 74, 46], 0.5); }
  p.rect(0, 0, 64, 4, [120, 74, 46]); p.rect(0, 60, 64, 4, [46, 24, 14]);
  p.noise(6, 0.12, 2);
}, 10);
defineMaterial('lv97_wood', 'lv97_wood', { s: 1.4, surf: 'wood' });
defineTexture('lv97_brass', (p) => {
  p.fill([200, 152, 62]);
  for (let y = 0; y < 64; y++) p.rect(0, y, 64, 1, mulc([200, 152, 62], 0.78 + 0.3 * Math.abs(Math.sin(y * 0.18))), 0.9);
  p.noise(4, 0.05, 2);
}, 8);
defineMaterial('lv97_brass', 'lv97_brass', { s: 0.6, surf: 'metal' });
defineTexture('lv97_cloth', (p) => {
  p.fill([236, 232, 222]);
  for (let x = 0; x < 64; x += 8) p.rect(x, 0, 2, 64, [206, 200, 190], 0.7);
  p.noise(4, 0.03, 2);
  p.rect(0, 58, 64, 6, [216, 210, 198]);
}, 6);
defineMaterial('lv97_cloth', 'lv97_cloth', { s: 1, surf: 'carpet' });
function plates(p, pts) {
  p.fill([236, 232, 222]);
  p.noise(4, 0.03, 2);
  for (const [x, y] of pts) { p.disc(x, y, 8, [244, 242, 236]); p.ring(x, y, 8, 1.6, [196, 160, 80]); p.disc(x, y, 3, [226, 222, 212]); p.rect(x + 9, y - 5, 2, 10, [190, 190, 196]); }
  p.rect(30, 30, 4, 4, [200, 160, 70]);
}
defineTexture('lv97_top', (p) => plates(p, [[32, 12], [32, 52], [12, 32], [52, 32]]), 8);
defineTexture('lv97_top2', (p) => plates(p, [[12, 32], [52, 32]]), 8);
defineTexture('lv97_top_long', (p) => plates(p, [[12, 12], [32, 12], [52, 12], [12, 52], [32, 52], [52, 52]]), 8);
defineMaterial('lv97_top', 'lv97_top', { s: 1, surf: 'carpet' });
defineMaterial('lv97_top2', 'lv97_top2', { s: 1, surf: 'carpet' });
defineMaterial('lv97_top_long', 'lv97_top_long', { s: 1, surf: 'carpet' });
defineTexture('lv97_velvet', (p) => { p.fill([140, 22, 34]); p.noise(3, 0.1, 2); p.grain(0.05); }, 6);
defineMaterial('lv97_velvet', 'lv97_velvet', { s: 0.5, surf: 'carpet' });
defineTexture('lv97_menu', (p) => {
  p.fill([240, 232, 206]);
  p.frame(2, 2, 60, 60, [170, 130, 60]);
  p.frame(4, 4, 56, 56, [200, 160, 80]);
  txtC(p, "TODAY'S", 32, 12, [96, 20, 30], 1, 2);
  txtC(p, 'SPECIAL', 32, 30, [96, 20, 30], 1, 2);
  p.rect(14, 52, 36, 1, [150, 120, 70]);
}, 8);
defineMaterial('lv97_menu', 'lv97_menu', { s: 1, surf: 'plastic' });
defineTexture('lv97_flame', (p) => { p.fill([255, 214, 120]); p.disc(32, 34, 18, [255, 250, 220]); }, 4);
defineMaterial('lv97_flame', 'lv97_flame', { s: 1, surf: 'plastic', flags: VF.FULLBRIGHT, glow: 1.1 });
defineTexture('lv97_bulb', (p) => { p.fill([255, 226, 150]); p.disc(32, 32, 24, [255, 248, 214]); }, 4);
defineMaterial('lv97_bulb', 'lv97_bulb', { s: 1, surf: 'plastic', flags: VF.FULLBRIGHT, glow: 1.0 });
defineMaterial('lv97_bulb_f', 'lv97_bulb', { s: 1, surf: 'plastic', flags: VF.FULLBRIGHT, glow: 1.0, chan: 3 });
defineTexture('lv97_plate', (p) => { p.fill([240, 238, 232]); p.ring(32, 32, 24, 3, [196, 160, 80]); }, 4);
defineMaterial('lv97_plate', 'lv97_plate', { s: 0.3, surf: 'tile' });

// ------------------------------------------------------------------ props
// a dining chair pushed in at the table: (fx, fz) is the axis unit vector from the chair toward the table
function chairAt(mb, cx, cz, fx, fz) {
  const wd = S('lv97_wood'), vv = S('lv97_velvet');
  const alongX = Math.abs(fx) > 0.5;
  mb.box(cx - 0.21, 0, cz - 0.21, cx + 0.21, 0.48, cz + 0.21, vv, { skip: 8 });
  const bx = cx - fx * 0.19, bz = cz - fz * 0.19;
  const tx = alongX ? 0.03 : 0.21, tz = alongX ? 0.21 : 0.03;
  mb.box(bx - tx, 0.48, bz - tz, bx + tx, 1.05, bz + tz, wd, { skip: 8 });
}
defineProp('lv97_table', {
  build(mb, p) {
    const kind = p.opts.kind || 0;
    const cloth = S('lv97_cloth'), top = S(kind === 2 ? 'lv97_top_long' : kind === 1 ? 'lv97_top2' : 'lv97_top');
    const ch = [];            // [x, z, fx, fz]
    if (kind === 2) {         // long table for six
      mb.box(-1.15, 0, -0.45, 1.15, 0.74, 0.45, [cloth, cloth, top, null, cloth, cloth], { uv: ['world', 'world', [0, 0, 1, 1], 'world', 'world', 'world'] });
      for (const sx of [-0.7, 0, 0.7]) { ch.push([sx, -0.62, 0, 1]); ch.push([sx, 0.62, 0, -1]); }
    } else {
      const r = kind === 1 ? 0.5 : 0.62, d = r + 0.1;
      mb.cyl(0, 0, 0, r, 0.74, 8, cloth, 1, top);
      ch.push([-d, 0, 1, 0]); ch.push([d, 0, -1, 0]);
      if (kind !== 1) { ch.push([0, -d, 0, 1]); ch.push([0, d, 0, -1]); }
    }
    for (const [cx, cz, fx, fz] of ch) chairAt(mb, cx, cz, fx, fz);
    // candle: a brass stub with a small flame, and the menu card standing on the cloth
    mb.box(-0.03, 0.74, -0.03, 0.03, 0.84, 0.03, S('lv97_brass'), { skip: 8 });
    mb.box(-0.014, 0.84, -0.014, 0.014, 0.9, 0.014, propGlow('lv97_flame', 1.1, 0), { skip: 8 });
    const menu = S('lv97_menu');
    mb.box(0.12, 0.74, 0.1, 0.3, 0.98, 0.114, menu, { skip: 15, uv: 'fit' });
  },
  boxes: (p) => (p.opts.kind === 2 ? [[-1.35, 0, -0.9, 1.35, 1.0, 0.9]] : [[-0.95, 0, -0.95, 0.95, 1.0, 0.95]]),
  use: 'level',
});
defineProp('lv97_chandelier', {
  build(mb, p) {
    const br = S('lv97_brass');
    const y = p.opts.drop || 1.2;           // hangs this far below the origin
    mb.box(-0.02, -y + 0.3, -0.02, 0.02, 0.0, 0.02, br, { skip: 12 });
    mb.cyl(0, -y, 0, 0.5, 0.06, 8, br, 3);
    mb.cyl(0, -y + 0.06, 0, 0.12, 0.3, 6, br, 1);
    const g = propGlow('lv97_bulb', 1.0, p.opts.ch || 0);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, bx = Math.cos(a) * 0.46, bz = Math.sin(a) * 0.46;
      mb.box(bx - 0.03, -y + 0.06, bz - 0.03, bx + 0.03, -y + 0.2, bz + 0.03, S('lv97_cloth'));
      mb.box(bx - 0.035, -y + 0.2, bz - 0.035, bx + 0.035, -y + 0.27, bz + 0.035, g);
    }
  },
  boxes: [],
});

// ------------------------------------------------------------------ the hall
function bay(zb, bx, bz) {
  const x0 = bx * BAY, z0 = bz * BAY;
  // column at the bay's north-west corner: wood shaft, brass foot and capital
  zb.box(x0 - 0.36, 0, z0 - 0.36, x0 + 0.36, CH, z0 + 0.36, M.lv97_wood);
  zb.box(x0 - 0.44, 0, z0 - 0.44, x0 + 0.44, 0.22, z0 + 0.44, M.lv97_brass);
  zb.box(x0 - 0.44, 3.5, z0 - 0.44, x0 + 0.44, 3.72, z0 + 0.44, M.lv97_brass);
  // beams along the bay's west and north edges
  zb.box(x0 - 0.25, CH - 0.42, z0 + 0.36, x0 + 0.25, CH, z0 + BAY, M.lv97_wood, { sub: 99, collide: false });
  zb.box(x0 + 0.36, CH - 0.42, z0 - 0.25, x0 + BAY, CH, z0 + 0.25, M.lv97_wood, { sub: 99, collide: false });
  // chandelier: a ring of flames over the middle, with the light that goes with it
  const cx = x0 + 4, cz = z0 + 4;
  const dead = hr(bx, bz, 971) < 0.08;
  if (zb.in(cx, cz)) {
    zb.prop('lv97_chandelier', cx + 0.5, CH - 0.05, cz + 0.5, 0, { drop: 1.2, ch: dead ? 0 : 0 });
    if (!dead) zb.light(cx + 0.5, CH - 1.6, cz + 0.5, { color: [1.0, 0.72, 0.4], rad: 9, int: 0.55, ch: hr(bx, bz, 972) < 0.07 ? 3 : 0 });
  }
  // tables: four per bay, a few missing, a few of other kinds
  const spots = [[2, 2], [6, 2], [2, 6], [6, 6]];
  spots.forEach(([dx, dz], k) => {
    const u = hr(bx, bz, 980 + k);
    if (u < 0.1) return;
    const kind = u < 0.3 ? 1 : u < 0.5 ? 2 : 0;
    const x = x0 + dx + 0.5, z = z0 + dz + 0.5;
    if (!zb.in(Math.floor(x), Math.floor(z))) return;
    zb.prop('lv97_table', x, 0, z, kind === 2 && hr(bx, bz, 990 + k) < 0.5 ? Math.PI / 2 : 0, { kind, use: 'level', label: 'READ MENU', useY: 0.9, useR: 0.9 });
    if (hr(bx, bz, 1000 + k) < 0.3) zb.light(x, 1.3, z, { color: [1.0, 0.7, 0.34], rad: 3, int: 0.45 });
  });
  // a wooden screen with a door in it, here and there
  if (hr(bx, bz, 973) < 0.1) {
    cbox(zb, x0 + 1.5, 0, z0 + 0.5, x0 + 6.5, 2.7, z0 + 0.8, M.lv97_wood);
    cbox(zb, x0 + 1.4, 2.7, z0 + 0.45, x0 + 6.6, 2.8, z0 + 0.85, M.lv97_brass);
    levelDoor(zb, x0 + 4.5, z0 + 0.94, Math.PI, { y: 0 });
    zb.light(x0 + 4.5, 1.8, z0 + 2.0, { color: [1.0, 0.8, 0.5], rad: 4, int: 0.4 });
  }
  // a clock ticking somewhere in a few bays
  if (hr(bx, bz, 974) < 0.08) zb.emitter(x0 + 0.5, 1.6, z0 + 0.5, 'lv97_clock', { vol: 0.7, rad: 9 });
  // soft piano from a speaker in the ceiling of some bays
  if (hr(bx, bz, 975) < 0.18) zb.emitter(x0 + 4, CH - 0.4, z0 + 4, 'lv97_piano', { vol: 0.5, rad: 14 });
}

function gen(zb) {
  zb.floor.fill(0);
  zb.ceil.fill(CH);
  zb.fmat.fill(M.lv97_carpet);
  zb.cmat.fill(M.lv97_ceil);
  zb.wmat.fill(M.lv97_wood);
  zb.flags.fill(0);
  for (let bz = Math.floor(zb.z0 / BAY); bz < zb.z1 / BAY; bz++) for (let bx = Math.floor(zb.x0 / BAY); bx < zb.x1 / BAY; bx++) bay(zb, bx, bz);
}

defineZone('lv97_hall', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.2, 0.11, 0.08],
    env: env({ fog: [0.07, 0.04, 0.03], fogNear: 4, fogFar: 40, hum: 0, hvac: 0.25, reverb: 'hall', tone: 'lv97_hall' }),
  }),
  gen,
});

// the special: a price that follows the clock
function special() {
  const m = Math.floor(Date.now() / 60000);
  const h = Math.imul(m ^ 0x5bd1e995, 2654435761) >>> 0;
  const cents = 495 + (h % 3200);
  return '$' + Math.floor(cents / 100) + '.' + String(cents % 100).padStart(2, '0');
}
defineLevel(N, {
  name: 'THE EMPTY RESTAURANT',
  zoneType: 'lv97_hall',
  zoneSize: G,
  entry: { x: 36.0, y: 0, z: 36.5, yaw: Math.PI / 2 },
  doorDensity: 0,
  viewRadius: 3,
  light: { phoneRadius: 3.8, phoneIntensity: 0.22 },
  onUse(ctx, item) {
    ctx.game.audioCall('play', 'paper', item.x, item.y, item.z, {});
    ctx.game.ui.showNote("TODAY'S SPECIAL\n\n" + special() + '\n\n');
  },
});
void pmod; void txt; void CF; void W; void T; void pnoise;
