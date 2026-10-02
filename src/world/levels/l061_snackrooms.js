// Level 61: The Snackrooms. A warm, safe, endless run of small rooms lit like a cinema
// concession: popcorn-yellow light, striped walls, diner tiles, string lights, rows of glowing
// vending machines and shelves that are always full. The arches line up, so you can see several
// rooms deep. Nothing here is scary; the supplies simply never run out.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propTex as T, propGlow } from '../props.js';
import { LEVEL_ZONE, defineLevel, ceilingLight, levelDoor, hr, env, M, CF, W, cbox } from './kit.js';
import { txt, txtC, mulc, mix, pack, pmod, signTexture, flipX } from './g06_kit.js';

const N = 61;
const G = 64;
const RP = 8;            // room period
const CH = 2.9;

const CREAM = [236, 220, 176], YEL = [244, 200, 70], RED = [196, 52, 40], BROWN = [110, 70, 40];

// ------------------------------------------------------------------ textures
defineTexture('lv61_wall_a', (p) => {          // cream and popcorn-yellow stripes over dark wood panelling
  p.fill(CREAM);
  for (let x = 0; x < 64; x += 8) p.rect(x, 0, 4, 64, YEL);
  p.noise(4, 0.04, 2);
  p.rect(0, 38, 64, 26, [104, 62, 36]);
  for (let x = 0; x < 64; x += 16) p.rect(x, 38, 1, 26, [70, 40, 22]);
  p.rect(0, 36, 64, 3, [150, 100, 60]);
  p.rect(0, 38, 64, 1, [60, 36, 20]);
  p.grain(0.025);
}, 12);
defineTexture('lv61_wall_b', (p) => {          // red diner wallpaper with cream dots
  p.fill([176, 44, 36]);
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) { p.disc(x + (y % 32 ? 8 : 0) % 64, y + 8, 3, [236, 214, 170]); }
  p.noise(4, 0.05, 2);
  p.rect(0, 48, 64, 16, [236, 226, 196]);
  p.rect(0, 46, 64, 3, [200, 160, 60]);
  p.grain(0.02);
}, 12);
defineTexture('lv61_wall_c', (p) => {          // warm orange paint, cream chair rail, wood skirting
  p.fill([226, 150, 70]);
  p.noise(3, 0.06, 2);
  p.rect(0, 30, 64, 4, [240, 226, 180]);
  p.rect(0, 56, 64, 8, [120, 76, 44]);
  p.stain(14, 14, 10, [190, 120, 56], 0.4);
  p.grain(0.02);
}, 10);
defineMaterial('lv61_wall_a', 'lv61_wall_a', { s: 2, surf: 'drywall', stain: 0.05 });
defineMaterial('lv61_wall_b', 'lv61_wall_b', { s: 2, surf: 'drywall', stain: 0.05 });
defineMaterial('lv61_wall_c', 'lv61_wall_c', { s: 2, surf: 'drywall', stain: 0.05 });

defineTexture('lv61_floor_check', (p) => {
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) p.rect(x, y, 16, 16, ((x + y) / 16) % 2 ? [226, 214, 184] : [182, 48, 40]);
  p.noise(6, 0.06, 2);
  p.speckle(40, [120, 90, 70], 0.15, 0.4);
}, 8);
defineTexture('lv61_floor_wood', (p) => {
  p.fill([170, 112, 60]);
  for (let y = 0; y < 64; y += 8) { p.rect(0, y, 64, 1, [110, 68, 34]); const o = (y * 7) % 32; p.rect(o, y, 1, 8, [110, 68, 34]); p.rect((o + 32) % 64, y, 1, 8, [110, 68, 34]); }
  p.noise(8, 0.1, 2);
  p.grain(0.03);
}, 10);
defineTexture('lv61_carpet', (p) => {
  p.fill([128, 66, 40]);
  p.noise(6, 0.08, 2);
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) { p.disc(x + 8, y + 8, 4, [196, 120, 50]); p.disc(x + 8, y + 8, 1.6, [240, 200, 100]); }
  p.grain(0.05);
}, 10);
defineTexture('lv61_ceil', (p, r) => {         // popcorn ceiling
  p.fill([232, 214, 178]);
  p.noise(2, 0.04, 2);
  for (let i = 0; i < 220; i++) p.set(r.int(0, 63), r.int(0, 63), r.chance(0.5) ? [250, 238, 206] : [196, 178, 140]);
}, 8);
defineMaterial('lv61_floor_check', 'lv61_floor_check', { s: 2, surf: 'tile' });
defineMaterial('lv61_floor_wood', 'lv61_floor_wood', { s: 2, surf: 'wood' });
defineMaterial('lv61_carpet', 'lv61_carpet', { s: 2, surf: 'carpet' });
defineMaterial('lv61_ceil', 'lv61_ceil', { s: 2, surf: 'drywall' });
defineTexture('lv61_beam', (p) => { p.fill([112, 70, 40]); p.noise(6, 0.12, 2); p.rect(0, 0, 64, 3, [150, 100, 60]); }, 8);
defineMaterial('lv61_beam', 'lv61_beam', { s: 1, surf: 'wood' });

// vending fronts: a header, a grid of snack packs, a tray
const BRANDS = [['CRUNCH', [200, 50, 40]], ['POPPY', [230, 190, 50]], ['FIZZ', [50, 120, 200]], ['SWEET', [220, 90, 150]], ['MUNCH', [60, 160, 80]], ['NUTS', [210, 120, 40]]];
const PACKS = [[226, 70, 50], [244, 200, 60], [60, 120, 210], [70, 170, 90], [236, 236, 226], [210, 100, 170], [240, 140, 50]];
BRANDS.forEach(([name, col], k) => {
  defineTexture(`lv61_vend${k}`, (p, r) => {
    p.fill([30, 26, 28]);
    p.rect(2, 2, 60, 10, col);
    txtC(p, name, 32, 4, [255, 255, 240], 1, 1);
    p.rect(2, 13, 44, 40, [20, 20, 24]);
    for (let row = 0; row < 4; row++) {
      p.rect(3, 15 + row * 10 + 8, 42, 1, [150, 150, 150]);
      for (let c = 0; c < 5; c++) { const pc = r.pick(PACKS); pack(p, 4 + c * 8, 15 + row * 10, 6, 8, pc, 0.2); p.rect(5 + c * 8, 17 + row * 10, 3, 2, [250, 250, 240]); }
    }
    p.rect(48, 14, 14, 38, [70, 66, 70]);
    p.rect(50, 18, 10, 4, [30, 30, 34]); p.rect(51, 19, 8, 2, [90, 230, 120]);
    p.rect(50, 26, 10, 3, [200, 200, 200]);
    for (let i = 0; i < 4; i++) p.rect(50 + i * 3, 33, 2, 2, [220, 220, 220]);
    p.rect(3, 54, 58, 8, [14, 14, 16]);
    p.rect(20, 56, 24, 4, [50, 50, 56]);
    p.noise(4, 0.03, 2);
  }, 16);
});
defineTexture('lv61_vend_side', (p) => { p.fill([180, 170, 160]); p.noise(4, 0.06, 2); p.rect(0, 0, 3, 64, [120, 110, 100]); }, 6);
defineMaterial('lv61_vend_side', 'lv61_vend_side', { s: 1, surf: 'metal' });

// snack shelf bays: bright bags, tubs and bars on four boards
for (let k = 0; k < 4; k++) {
  defineTexture(`lv61_snack${k}`, (p, r) => {
    p.fill([150, 100, 56]);
    p.noise(4, 0.08, 2);
    for (const [y0, h] of [[1, 14], [17, 14], [33, 14], [49, 13]]) {
      p.rect(0, y0 + h, 64, 2, [220, 190, 130]);
      let x = r.int(0, 3);
      while (x < 62) {
        const w = r.int(7, 12), hh = r.int(h - 4, h), y = y0 + h - hh, c = r.pick(PACKS);
        pack(p, x, y, w, hh, c, 0.22);
        if (k % 2) p.rect(x + 1, y + (hh >> 1) - 1, w - 3, 3, [250, 246, 226]); else p.disc(x + (w >> 1), y + (hh >> 1), 2.2, [250, 240, 200]);
        x += w + r.int(0, 1);
      }
    }
    p.grain(0.02);
  }, 16);
  defineMaterial(`lv61_snack${k}`, `lv61_snack${k}`, { su: 1, sv: 1.7, surf: 'wood' });
}
defineTexture('lv61_shelf_wood', (p) => { p.fill([140, 90, 50]); p.noise(6, 0.1, 2); p.rect(0, 0, 64, 4, [180, 130, 80]); }, 8);
defineMaterial('lv61_shelf_wood', 'lv61_shelf_wood', { s: 1, surf: 'wood' });

// popcorn machine glass: glowing yellow with white kernels
defineTexture('lv61_popcorn', (p, r) => {
  p.fill([250, 214, 92]);
  for (let i = 0; i < 90; i++) { const x = r.int(0, 63), y = r.int(0, 63); p.disc(x, y, r.int(1, 3), r.chance(0.5) ? [255, 248, 224] : [246, 196, 70]); }
  p.rect(0, 0, 64, 5, [200, 40, 36]); p.rect(0, 59, 64, 5, [200, 40, 36]);
}, 10);
defineMaterial('lv61_popcorn', 'lv61_popcorn', { s: 1, surf: 'plastic', flags: VF.FULLBRIGHT, glow: 0.85 });
defineTexture('lv61_popcorn_body', (p) => {
  p.fill([190, 40, 34]);
  p.noise(4, 0.05, 2);
  p.rect(0, 20, 64, 4, [240, 220, 120]);
  txtC(p, 'POPCORN', 32, 28, [255, 248, 224], 1, 2);
  p.rect(0, 52, 64, 12, [60, 30, 26]);
}, 8);
defineMaterial('lv61_popcorn_body', 'lv61_popcorn_body', { s: 1, surf: 'metal' });

// neon signs (self-lit)
const NEON = [['SNACKS', [255, 120, 60]], ['OPEN', [90, 255, 190]], ['POPCORN', [255, 230, 80]], ['TREATS', [255, 100, 170]]];
NEON.forEach(([word, col], k) => {
  defineTexture(`lv61_neon${k}`, (p) => {
    p.fill([22, 14, 16]);
    p.frame(2, 8, 60, 48, mulc(col, 0.7));
    p.frame(4, 10, 56, 44, col);
    txtC(p, word, 32, 24, col, word.length > 5 ? 1 : 2, 2);
    p.noise(4, 0.03, 2);
  }, 8);
  defineMaterial(`lv61_neon${k}`, `lv61_neon${k}`, { s: 1, surf: 'plastic', flags: VF.FULLBRIGHT, glow: 1.0, chan: k === 1 ? 14 : 0 });
});
// string lights: a dark wire with warm bulbs
defineTexture('lv61_fairy', (p) => {
  p.fill([30, 22, 16]);
  for (let x = 4; x < 64; x += 8) { p.disc(x, 32, 3.2, [255, 232, 140]); p.disc(x, 32, 1.4, [255, 255, 235]); }
}, 6);
defineMaterial('lv61_fairy', 'lv61_fairy', { su: 4, sv: 1, surf: 'plastic', flags: VF.FULLBRIGHT, glow: 1.0 });
defineTexture('lv61_trim', (p) => { p.fill([120, 76, 44]); p.noise(6, 0.1, 2); p.rect(0, 0, 64, 4, [170, 120, 70]); }, 8);
defineMaterial('lv61_trim', 'lv61_trim', { s: 1, surf: 'wood' });
defineTexture('lv61_awning', (p) => {          // red and cream awning
  for (let x = 0; x < 64; x += 16) { p.rect(x, 0, 8, 64, [200, 48, 40]); p.rect(x + 8, 0, 8, 64, [240, 230, 200]); }
  p.noise(4, 0.04, 2);
}, 6);
defineMaterial('lv61_awning', 'lv61_awning', { s: 1.2, surf: 'carpet' });
defineTexture('lv61_menu', (p) => {
  p.fill([34, 40, 36]);
  p.frame(1, 1, 62, 62, [200, 170, 90]);
  txtC(p, 'SNACKS', 32, 6, [255, 236, 150], 1, 2);
  for (let i = 0; i < 5; i++) { p.rect(6, 26 + i * 7, 36, 1, [190, 190, 180], 0.6); txt(p, '25', 46, 23 + i * 7, [255, 236, 150], 1, 1); }
}, 6);
defineMaterial('lv61_menu', 'lv61_menu', { s: 1, surf: 'plastic' });

// ------------------------------------------------------------------ props
defineProp('lv61_vend', {
  build(mb, p) {
    const k = (p.opts.v || 0) % 6;
    const front = propGlow(`lv61_vend${k}`, 0.95, p.opts.ch || 0);
    const body = S('lv61_vend_side');
    mb.box(-0.45, 0, -0.38, 0.45, 1.85, 0.38, [body, body, body, body, body, front], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
  },
  boxes: [[-0.46, 0, -0.39, 0.46, 1.86, 0.39]],
  emitter: { snd: 'vending', vol: 0.7, rad: 8, y: 1 },
  light: { y: 1.0, z: -0.9, color: [1.0, 0.82, 0.55], rad: 3.4, int: 0.42 },
  use: 'level',
});
defineProp('lv61_popcorn', {
  build(mb) {
    mb.box(-0.4, 0, -0.35, 0.4, 0.9, 0.35, S('lv61_popcorn_body'), { uv: 'fit' });
    const glass = propGlow('lv61_popcorn', 0.85);
    mb.box(-0.38, 0.9, -0.33, 0.38, 1.6, 0.33, [glass, glass, S('lv61_popcorn_body'), null, glass, glass], { uv: 'fit' });
    mb.box(-0.42, 1.6, -0.37, 0.42, 1.72, 0.37, S('lv61_popcorn_body'));
    mb.cyl(0, 1.72, 0, 0.05, 0.1, 5, S('chrome'), 1);
  },
  boxes: [[-0.42, 0, -0.37, 0.42, 1.72, 0.37]],
  emitter: { snd: 'lv61_popper', vol: 0.8, rad: 9, y: 1.2 },
  light: { y: 1.3, z: -0.7, color: [1.0, 0.85, 0.4], rad: 4, int: 0.5 },
  use: 'level',
});
defineProp('lv61_shelf', {            // a snack gondola: two sides, wooden frame
  build(mb, p) {
    const k = (p.opts.v || 0) % 4;
    const m = S(`lv61_snack${k}`), m2 = S(`lv61_snack${(k + 1) % 4}`), wd = S('lv61_shelf_wood');
    const L = p.opts.len || 1.0, h = 1.7;
    mb.box(-L / 2, 0, -0.3, L / 2, h, 0.3, [wd, wd, wd, wd, m2, m], { uv: ['world', 'world', 'world', 'world', [0, 0, 1, 1], [0, 0, 1, 1]] });
    mb.box(-L / 2 - 0.02, h, -0.32, L / 2 + 0.02, h + 0.06, 0.32, wd);
  },
  boxes: (p) => [[-(p.opts.len || 1) / 2, 0, -0.32, (p.opts.len || 1) / 2, 1.76, 0.32]],
  use: 'level',
});
defineProp('lv61_neon', {
  build(mb, p) {
    const k = (p.opts.v || 0) % 4;
    const g = propGlow(`lv61_neon${k}`, 1.0, p.opts.ch || 0);
    const w = p.opts.w || 1.4, h = w * 0.6;
    mb.box(-w / 2, 0, -0.03, w / 2, h, 0.03, [S('metal_dark'), S('metal_dark'), S('metal_dark'), S('metal_dark'), S('metal_dark'), g], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
  },
  boxes: [],
  light: { y: 0.4, z: -0.5, color: [1.0, 0.7, 0.5], rad: 3.2, int: 0.3 },
});
defineProp('lv61_menu', {
  build(mb) {
    const g = S('lv61_menu');
    mb.box(-0.35, 0, -0.02, 0.35, 0.5, 0.02, [g, g, g, g, g, g], { uv: ['world', 'world', 'world', 'world', [0, 0, 1, 1], [0, 0, 1, 1]] });
  },
  boxes: [],
});

// ------------------------------------------------------------------ rooms
// the arrival row is dressed by hand so the first view is a long run of arches
const ARR = { 4: 2, 5: 0, 6: 5, 7: 0, 8: 1, 9: 0, 3: 0, 2: 5 };
function roomType(rx, rz) {
  if (rz === 4 && ARR[rx] !== undefined) return ARR[rx];
  const h = hr(rx, rz, 61);
  return h < 0.22 ? 0 : h < 0.4 ? 1 : h < 0.58 ? 2 : h < 0.74 ? 3 : h < 0.88 ? 4 : 5;
}
const WALLS = ['lv61_wall_a', 'lv61_wall_b', 'lv61_wall_c'];
function roomMats(rx, rz, t) {
  const w = M[WALLS[(t === 4 ? 1 : t === 1 || t === 5 ? 0 : Math.floor(hr(rx, rz, 62) * 3))]];
  const f = t === 0 || t === 4 || t === 5 ? M.lv61_floor_check : t === 2 ? M.lv61_carpet : M.lv61_floor_wood;
  return { w, f };
}

// vertical edges (x = RP*rx): 0 open 3 wide, 1 wall with a one-metre arch; horizontal edges: also windows
const vEdge = (rx, rz) => (rz === 4 && rx >= 1 && rx <= 12) || hr(rx, rz, 63) < 0.78 ? 0 : 1;
const hEdge = (rx, rz) => { const h = hr(rx, rz, 64); return h < 0.4 ? 0 : h < 0.72 ? 1 : 2; };

function gen(zb) {
  const R0x = Math.floor(zb.x0 / RP), R1x = Math.ceil(zb.x1 / RP), R0z = Math.floor(zb.z0 / RP), R1z = Math.ceil(zb.z1 / RP);
  zb.ceil.fill(CH);
  zb.floor.fill(0);
  zb.cmat.fill(M.lv61_ceil);
  zb.flags.fill(0);
  for (let rz = R0z; rz < R1z; rz++) {
    for (let rx = R0x; rx < R1x; rx++) {
      const t = roomType(rx, rz), { w: wm, f: fm } = roomMats(rx, rz, t);
      const x0 = rx * RP, z0 = rz * RP;
      for (let z = z0; z < z0 + RP; z++) for (let x = x0; x < x0 + RP; x++) if (zb.in(x, z)) { const i = zb.i(x, z); zb.fmat[i] = fm; zb.wmat[i] = wm; }
      room(zb, rx, rz, t, wm);
    }
  }
}

function room(zb, rx, rz, t, wm) {
  const x0 = rx * RP, z0 = rz * RP;
  const trim = M.lv61_trim;
  // west wall (vertical edge at x0) and north wall (horizontal edge at z0), with their openings
  const wm0 = roomMats(rx - 1, rz, roomType(rx - 1, rz)).w, nm0 = roomMats(rx, rz - 1, roomType(rx, rz - 1)).w;
  const ve = vEdge(rx, rz), he = hEdge(rx, rz);
  for (let k = 0; k < RP; k++) {
    const z = z0 + k;
    let type = W.WALL;
    if (ve === 0 && k >= 3 && k <= 5) type = W.NONE;
    else if (ve === 1 && k === 4) type = W.ARCH;
    if (type !== W.NONE && zb.in(x0, z)) zb.setWall(x0, z, 'W', type, wm0, wm);
    const x = x0 + k;
    let t2 = W.WALL;
    if (he === 0 && k >= 3 && k <= 5) t2 = W.NONE;
    else if (he === 1 && k === 4) t2 = W.ARCH;
    else if (he === 2 && k >= 2 && k <= 5) t2 = W.WINDOW;
    if (t2 !== W.NONE && zb.in(x, z0)) zb.setWall(x, z0, 'N', t2, nm0, wm);
  }
  // lintels over the wide openings
  if (ve === 0) cbox(zb, x0 - 0.12, 2.35, z0 + 3, x0 + 0.12, CH, z0 + 6, trim, { sub: 99 });
  if (he === 0) cbox(zb, x0 + 3, 2.35, z0 - 0.12, x0 + 6, CH, z0 + 0.12, trim, { sub: 99 });
  // beams across the ceiling and string lights along the middle
  cbox(zb, x0 + 0.4, CH - 0.18, z0, x0 + 0.6, CH, z0 + RP, trim, { sub: 99 });
  if (hr(rx, rz, 65) < 0.8) cbox(zb, x0 + 1, CH - 0.08, z0 + 4 - 0.05, x0 + RP - 1, CH - 0.02, z0 + 4 + 0.05, M.lv61_fairy, { collide: false, sub: 99, skip: 55 });
  // warm light: a pendant over the middle, and two soft corners
  zb.fixture(x0 + 3.5, z0 + 3.5, 'bulb', true, { hang: 0.5 });
  zb.light(x0 + 3.5, CH - 0.9, z0 + 3.5, { color: [1.0, 0.8, 0.46], rad: 8, int: 0.62, ch: hr(rx, rz, 66) < 0.06 ? 2 : 0 });
  zb.light(x0 + 1.5, CH - 0.5, z0 + 1.5, { color: [1.0, 0.76, 0.42], rad: 6, int: 0.3 });
  zb.light(x0 + RP - 1.5, CH - 0.5, z0 + RP - 1.5, { color: [1.0, 0.76, 0.42], rad: 6, int: 0.3 });
  const h = (q) => hr(rx, rz, 700 + q);
  const vend = (lx, lz, rot, q) => zb.prop('lv61_vend', x0 + lx, 0, z0 + lz, rot, { v: Math.floor(h(q) * 6), use: 'level', label: 'USE' });
  if (t === 0) {           // vending hall
    vend(1.0, 0.45, Math.PI, 1); vend(2.1, 0.45, Math.PI, 2);
    vend(5.9, RP - 0.45, 0, 3); vend(7.0, RP - 0.45, 0, 4);
    vend(RP - 0.45, 1.2, -Math.PI / 2, 5);
  } else if (t === 1) {    // snack shop
    zb.prop('lv61_shelf', x0 + 1.3, 0, z0 + 0.5, Math.PI, { v: Math.floor(h(30) * 4), len: 1.1, use: 'level', label: 'LOOK' });
    zb.prop('lv61_shelf', x0 + 2.5, 0, z0 + 0.5, Math.PI, { v: Math.floor(h(31) * 4), len: 1.1, use: 'level', label: 'LOOK' });
    zb.prop('lv61_shelf', x0 + 5.5, 0, z0 + RP - 0.5, 0, { v: Math.floor(h(32) * 4), len: 1.1, use: 'level', label: 'LOOK' });
    zb.prop('lv61_shelf', x0 + 6.7, 0, z0 + RP - 0.5, 0, { v: Math.floor(h(33) * 4), len: 1.1, use: 'level', label: 'LOOK' });
    zb.prop('counter', x0 + RP - 1.4, 0, z0 + 1.2, 0, { len: 2.2 });
    zb.prop('lv61_popcorn', x0 + RP - 1.9, 0.92, z0 + 1.2, 0, { use: 'level', label: 'LOOK' });
    zb.prop('lv61_menu', x0 + 1.5, 1.3, z0 + RP - 0.12, Math.PI, {});
  } else if (t === 2) {    // lounge
    zb.prop('sofa', x0 + 1.7, 0, z0 + 0.6, Math.PI, {});
    zb.prop('coffee_table', x0 + 2.0, 0, z0 + 1.9, 0, {});
    zb.prop('armchair', x0 + 6.6, 0, z0 + 1.2, -3 * Math.PI / 4, {});
    zb.prop('lamp_floor', x0 + 7.2, 0, z0 + 7.2, 0, {});
    zb.prop('tv', x0 + 1.6, 0, z0 + RP - 0.5, 0, { screen: 'off' });
    zb.prop('plant', x0 + 6.9, 0, z0 + 6.4, 0, { h: 1.3 });
    zb.emitter(x0 + 3.5, CH - 0.3, z0 + 3.5, 'lv61_muzak', { vol: 0.55, rad: 14 });
  } else if (t === 3) {    // pantry
    for (let k = 0; k < 2; k++) {
      zb.prop('shelf_metal', x0 + 1.3 + k * 1.3, 0, z0 + 0.4, Math.PI, { w: 1.2, h: 2.2 });
      zb.prop('shelf_metal', x0 + 6.7 - k * 1.3, 0, z0 + RP - 0.4, 0, { w: 1.2, h: 2.2 });
    }
    zb.prop('box_stack', x0 + 6.4, 0, z0 + 1.6, 0.3, { n: 3 });
    zb.prop('box_stack', x0 + 1.6, 0, z0 + 6.4, 1.2, { n: 4 });
  } else if (t === 4) {    // diner
    for (const [dx, dz] of [[1.9, 1.9], [6.1, 1.9], [1.9, 6.1], [6.1, 6.1]]) {
      zb.prop('table_round', x0 + dx, 0, z0 + dz, 0, {});
      for (let c = 0; c < 2; c++) zb.prop('chair_plastic', x0 + dx + (c ? 0.7 : -0.7), 0, z0 + dz, c ? Math.PI / 2 : -Math.PI / 2, {});
    }
    zb.emitter(x0 + 3.5, CH - 0.3, z0 + 3.5, 'lv61_muzak', { vol: 0.5, rad: 13 });
  } else {                 // popcorn parlour
    zb.prop('lv61_popcorn', x0 + 1.2, 0, z0 + 0.7, Math.PI, { use: 'level', label: 'LOOK' });
    zb.prop('lv61_popcorn', x0 + 2.4, 0, z0 + 0.7, Math.PI, { use: 'level', label: 'LOOK' });
    zb.prop('lv61_popcorn', x0 + 6.8, 0, z0 + RP - 0.7, 0, { use: 'level', label: 'LOOK' });
    zb.prop('counter', x0 + 5.6, 0, z0 + RP - 0.9, 0, { len: 1.6 });
  }
  // neon on the west wall near the south end; a door at the other end of it in some rooms
  if (t !== 3 && hr(rx, rz, 68) < 0.55 && ve === 0) zb.prop('lv61_neon', x0 + 0.12, 1.75, z0 + 6.9, Math.PI / 2, { v: Math.floor(h(50) * 4), w: 1.1, ch: 0 });
  if (hr(rx, rz, 67) < 0.06 && (t === 3 || t === 0 || t === 1 || t === 5)) levelDoor(zb, x0 + 0.28, z0 + 1.5, Math.PI / 2, { y: 0 });
  void mix; void pmod; void pnoise; void T; void ceilingLight; void CF; void txt; void signTexture; void flipX; void txtC; void mulc; void pack;
}

defineZone('lv61_rooms', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.58, 0.42, 0.26],
    env: env({ fog: [0.5, 0.33, 0.16], fogNear: 8, fogFar: 50, hum: 0.12, hvac: 0.2, reverb: 'room', tone: 'lv61_cosy' }),
  }),
  gen,
});

// ------------------------------------------------------------------ the supplies never run out
const NOTES = [
  'A bag drops into the tray. The slot is already full again.',
  'Something warm lands in the tray. A soft clunk, and the row refills.',
  'The coil turns. Nothing is ever missing from the row.',
  'Every row is full to the front, however many you take.',
  'The machine hums. It has plenty.',
];
defineLevel(N, {
  name: 'THE SNACKROOMS',
  zoneType: 'lv61_rooms',
  zoneSize: G,
  entry: { x: 36.0, y: 0, z: 36.5, yaw: Math.PI / 2 },
  doorDensity: 0,
  viewRadius: 3,
  light: { phoneRadius: 3.6, phoneIntensity: 0.22 },
  grade: { sat: 1.1, tint: [1.04, 1.0, 0.94] },
  onUse(ctx, item) {
    const o = (item.prop && item.prop.opts) || {};
    const g = ctx.game, st = ctx.state;
    st.n = (st.n || 0) + 1;
    if (item.prop && item.prop.type === 'lv61_popcorn') { g.ui.say('The kernels turn and turn. The case is full to the lid.', 3); return; }
    if (item.prop && item.prop.type === 'lv61_shelf') { g.ui.say(NOTES[(st.n + 2) % NOTES.length], 3); return; }
    g.audioCall('play', 'vending_clunk', item.x, item.y, item.z, {});
    g.ui.say(NOTES[st.n % NOTES.length], 3);
    void o;
  },
});
