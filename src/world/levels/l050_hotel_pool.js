// Level 50: THE HOTEL POOL. Night. A luxury hotel wraps around an enormous courtyard pool that has
// no bottom: the tiled shaft glows teal near the rim and fades into black. Lit windows climb the
// facades on every side, loungers and cabanas stand on the deck, and here and there something that
// does not belong at a pool lies at the edge in a puddle. Lobbies join one courtyard to the next.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propGlow as G, propWithXf as withXf } from '../props.js';
import { xfMul, xfTranslate, xfRotY } from '../../core/math.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, openGround, cbox, owns, hr, levelDoor, env, M, FACE, only, facing, ceilingLight, stairs } from './kit.js';
import { defineHotelProps } from './g10_hotel.js';

const N = 50;
const B = 128;          // one courtyard per zone
const BODY = 8, ARC = 4, WING = BODY + ARC;
const ARC_H = 8;        // arcade and lobby height
const SHAFT = [-0.3, -2.6, -5.2, -8.2, -11.6, -15.6, -20.4, -26, -34];
const SHAFT_GLOW = [0.75, 0.62, 0.5, 0.38, 0.26, 0.15, 0.07, 0.02];

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------------------------------------------------------------- textures
defineTexture('lv50_deck', (p, r) => {
  p.fill([172, 160, 138]);
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) p.shade(tx * 16, ty * 16, 16, 16, r.range(-0.08, 0.05));
  p.noise(6, 0.05, 2);
  for (let k = 0; k < 64; k += 16) { p.rect(0, k, 64, 1, [112, 102, 86]); p.rect(k, 0, 1, 64, [112, 102, 86]); }
  p.speckle(50, [196, 184, 160], 0.4, 0.8);
  p.speckle(30, [100, 90, 74], 0.3, 0.7);
}, 12);
defineTexture('lv50_coping', (p, r) => {
  p.fill([206, 206, 194]);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 4; tx++) p.shade(tx * 16, ty * 32, 16, 32, r.range(-0.05, 0.04));
  for (let k = 0; k < 64; k += 16) p.rect(k, 0, 1, 64, [150, 156, 150]);
  p.rect(0, 0, 64, 1, [150, 156, 150]); p.rect(0, 32, 64, 1, [150, 156, 150]);
  p.rect(0, 28, 64, 3, [64, 150, 156]);
  p.grain(0.02);
}, 12);
defineTexture('lv50_lobby', (p, r) => {
  // black and cream marble squares with a gold line
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const dark = (tx + ty) % 2 === 0;
    p.rect(tx * 32, ty * 32, 32, 32, dark ? [30, 32, 36] : [214, 204, 180]);
    for (let k = 0; k < 5; k++) p.line(tx * 32 + r.int(0, 31), ty * 32, tx * 32 + r.int(0, 31), ty * 32 + 31, dark ? [78, 80, 90] : [170, 160, 140], 0.6);
  }
  p.noise(5, 0.06, 2);
  p.rect(0, 0, 64, 1, [190, 150, 70]); p.rect(0, 0, 1, 64, [190, 150, 70]); p.rect(0, 32, 64, 1, [190, 150, 70]); p.rect(32, 0, 1, 64, [190, 150, 70]);
}, 12);
defineTexture('lv50_carpet', (p) => {
  p.fill([108, 24, 36]);
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) {
    p.line(x, y + 8, x + 8, y, [196, 150, 70]); p.line(x + 8, y, x + 16, y + 8, [196, 150, 70]);
    p.line(x + 16, y + 8, x + 8, y + 16, [196, 150, 70]); p.line(x + 8, y + 16, x, y + 8, [196, 150, 70]);
    p.rect(x + 7, y + 7, 2, 2, [196, 150, 70]);
  }
  p.grain(0.05);
}, 8);
defineTexture('lv50_panel', (p, r) => {
  p.fill([62, 34, 26]);
  p.noise(4, 0.1, 2);
  for (let x = 0; x < 64; x += 16) { p.rect(x, 0, 1, 64, [30, 16, 12]); p.frame(x + 2, 4, 12, 56, [92, 54, 38]); p.frame(x + 4, 6, 8, 52, [40, 22, 16]); }
  p.rect(0, 0, 64, 2, [176, 138, 66]); p.rect(0, 62, 64, 2, [176, 138, 66]);
  void r;
}, 12);
defineTexture('lv50_ceiling', (p) => {
  p.fill([40, 34, 36]);
  for (let y = 0; y < 64; y += 32) for (let x = 0; x < 64; x += 32) { p.frame(x + 2, y + 2, 28, 28, [70, 58, 50]); p.frame(x + 5, y + 5, 22, 22, [26, 22, 24]); }
  p.noise(4, 0.08, 2);
}, 8);
defineTexture('lv50_body', (p) => { p.fill([34, 30, 36]); p.noise(4, 0.08, 2); }, 4);
defineTexture('lv50_column', (p) => {
  p.fill([206, 198, 178]);
  for (let x = 0; x < 64; x += 8) p.rect(x, 0, 1, 64, [160, 152, 134]);
  p.rect(0, 0, 64, 6, [150, 120, 60]); p.rect(0, 58, 64, 6, [150, 120, 60]); p.rect(0, 6, 64, 1, [100, 80, 40]);
  p.noise(4, 0.06, 2);
}, 12);
// lit lobby glazing seen from the arcade: tall panes of warm light between dark gold mullions
defineTexture('lv50_glazing', (p, r) => {
  p.fill([26, 20, 18]);
  for (let bx = 0; bx < 2; bx++) {
    const x = bx * 32;
    for (let y = 4; y < 60; y++) {
      const t = (y - 4) / 56;
      const c = mix([255, 240, 190], [255, 196, 110], t * t);
      p.rect(x + 3, y, 26, 1, c);
    }
    p.rect(x + 15, 4, 2, 56, [96, 66, 30]);
    p.rect(x + 3, 38, 26, 2, [96, 66, 30]);
    p.frame(x + 2, 3, 28, 58, [140, 104, 48]);
    for (let k = 0; k < 4; k++) p.rect(x + 5 + r.int(0, 18), 41 + r.int(0, 14), 3, 6, [214, 150, 80], 0.5);
  }
}, 12);
// tower facades: windows of a big hotel at night (self-lit): lit warm, dim blue, curtained, dark
function facade(seed, lit) {
  return (p, r) => {
    p.fill([30, 32, 46]);
    p.noise(4, 0.06, 2);
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      const x = bx * 16, y = fy * 16;
      const u = r.next();
      let c;
      if (u < lit) c = mix([255, 206, 118], [255, 226, 160], r.next());
      else if (u < lit + 0.12) c = [118, 150, 210];
      else if (u < lit + 0.2) c = [196, 126, 70];
      else c = [38, 46, 64];
      // balcony slab, pane, mullion
      p.rect(x, y + 13, 16, 3, [74, 74, 92]);
      p.rect(x + 3, y + 2, 10, 10, c);
      p.rect(x + 7, y + 2, 2, 10, [34, 34, 46]);
      if (u >= lit && u < lit + 0.12) p.rect(x + 3, y + 2, 10, 3, [150, 180, 235]);
      p.rect(x, y, 1, 13, [52, 54, 70]);
    }
    void seed;
  };
}
defineTexture('lv50_fac0', facade(1, 0.62), 16);
defineTexture('lv50_fac1', facade(2, 0.45), 16);
defineTexture('lv50_fac2', facade(3, 0.75), 16);
defineTexture('lv50_fac3', facade(4, 0.3), 16);
defineTexture('lv50_water', (p, r) => {
  p.fill([8, 22, 34]);
  p.map((x, y, c) => {
    const n = pnoise(x, y * 2, 16, 3) * 0.6 + pnoise(x * 2, y, 8, 9) * 0.4;
    const k = 0.7 + n * 0.6;
    return [c[0] * k, c[1] * k, c[2] * k + n * 8];
  });
  // reflections of lit windows hang below the far edge as pale vertical smears
  for (let i = 0; i < 9; i++) { const x = r.int(0, 63), y = r.int(0, 40), l = r.int(8, 22); p.rect(x, y, 2, l, [96, 84, 56], 0.5); p.rect(x, y, 2, l, [60, 100, 120], 0.2); }
  for (let i = 0; i < 24; i++) p.rect(r.int(0, 60), r.int(0, 63), r.int(3, 8), 1, [48, 92, 112], 0.6);
}, 8);
// teal mosaic with a lit panel in every repeat
defineTexture('lv50_pool_tile', (p, r) => {
  p.fill([12, 58, 70]);
  for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) p.shade(tx * 8, ty * 8, 8, 8, r.range(-0.15, 0.12));
  for (let k = 0; k < 64; k += 8) { p.rect(0, k, 64, 1, [6, 34, 44]); p.rect(k, 0, 1, 64, [6, 34, 44]); }
  p.rect(18, 24, 28, 16, [70, 170, 176]);
  p.rect(20, 26, 24, 12, [236, 255, 252]);
  p.rect(30, 26, 2, 12, [150, 214, 214]);
}, 12);
defineTexture('lv50_stripe', (p) => {
  for (let x = 0; x < 64; x += 16) { p.rect(x, 0, 8, 64, [226, 226, 214]); p.rect(x + 8, 0, 8, 64, [32, 120, 128]); }
  p.noise(4, 0.07, 2);
}, 8);
defineTexture('lv50_stripe2', (p) => {
  for (let x = 0; x < 64; x += 16) { p.rect(x, 0, 8, 64, [226, 214, 190]); p.rect(x + 8, 0, 8, 64, [150, 40, 52]); }
  p.noise(4, 0.07, 2);
}, 8);
defineTexture('lv50_towel', (p) => {
  p.fill([236, 234, 224]);
  for (let y = 0; y < 64; y += 16) p.rect(0, y + 6, 64, 4, [60, 130, 140]);
  p.grain(0.04);
}, 8);
defineTexture('lv50_post', (p) => { p.fill([30, 36, 44]); p.noise(4, 0.1, 2); }, 4);
defineTexture('lv50_stone', (p) => { p.fill([182, 172, 150]); p.noise(5, 0.1, 3); p.speckle(40, [120, 110, 94], 0.3, 0.6); }, 8);
defineTexture('lv50_trunk', (p, r) => {
  p.fill([88, 66, 44]);
  for (let y = 0; y < 64; y += 8) p.rect(0, y, 64, 2, [56, 40, 28]);
  p.noise(8, 0.12, 2);
  void r;
}, 8);
defineTexture('lv50_frond', (p) => {
  p.fill([34, 78, 46]);
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) {
    const w = 30 - Math.abs(y * 0.0) - (64 - y) * 0.0;
    const half = Math.max(0, 1 + (y / 63) * 0 + Math.sin((y / 63) * Math.PI) * 11);
    for (let x = 32 - half; x <= 32 + half; x++) {
      const tooth = ((Math.floor(y / 3) + (x > 32 ? 1 : 0)) % 2) && Math.abs(x - 32) > half - 3;
      if (tooth) continue;
      p.set(x, y, Math.abs(x - 32) < 1 ? [20, 52, 28] : [34 + (y % 5) * 3, 82 + (x % 4) * 4, 48]);
      p.alpha(x, y, 255);
    }
    void w;
  }
}, 8);
defineTexture('lv50_lampglow', (p) => { p.fill([255, 224, 160]); p.disc(32, 32, 24, [255, 244, 210]); }, 4);
defineTexture('lv50_puddle', (p, r) => {
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const n = pnoise(x, y, 8, p.seed) * 0.6 + pnoise(x, y, 16, p.seed + 1) * 0.4;
    const d = Math.hypot((x - 32) / 1.2, y - 32) / 29 + (n - 0.5) * 0.7;
    if (d < 1) { p.set(x, y, mix([10, 18, 28], [58, 84, 104], Math.max(0, 1 - Math.abs(x - 22 - y * 0.3) / 5) * 0.8)); p.alpha(x, y, 255); }
  }
  void r;
}, 6);
defineTexture('lv50_plank', (p, r) => {
  p.fill([150, 142, 126]);
  for (let y = 0; y < 64; y += 8) { p.shade(0, y, 64, 8, r.range(-0.1, 0.06)); p.rect(0, y, 64, 1, [60, 56, 48]); }
  for (let i = 0; i < 12; i++) p.rect(r.int(0, 62), r.int(0, 63), 1, 8, [60, 56, 48]);
  p.noise(6, 0.08, 2);
}, 10);
defineTexture('lv50_sign_depth', (p) => {
  p.fill([20, 40, 96]);
  p.frame(0, 0, 64, 64, [236, 236, 226]); p.frame(2, 2, 60, 60, [236, 236, 226]);
  p.text('DEPTH', 32 - 14, 14, [250, 250, 240], 1);
  p.text('UN-', 32 - 9, 28, [250, 230, 120], 1);
  p.text('KNOWN', 32 - 15, 40, [250, 230, 120], 1);
}, 6);
defineTexture('lv50_sign_nodive', (p) => {
  p.fill([230, 230, 220]);
  p.frame(0, 0, 64, 64, [200, 30, 30]); p.frame(1, 1, 62, 62, [200, 30, 30]); p.frame(2, 2, 60, 60, [200, 30, 30]);
  p.text('NO', 32 - 6, 12, [200, 30, 30], 1);
  p.text('DIVING', 32 - 17, 26, [30, 30, 40], 1);
  p.text('ANY', 32 - 9, 42, [30, 30, 40], 1);
}, 6);
defineTexture('lv50_beacon', (p) => { p.fill([255, 40, 30]); p.disc(32, 32, 20, [255, 150, 120]); }, 4);
defineTexture('lv50_board', (p) => { p.fill([70, 118, 150]); p.noise(6, 0.1, 2); p.speckle(80, [120, 170, 196], 0.4, 0.8); }, 6);
defineTexture('lv50_bulb', (p) => { p.fill([255, 232, 170]); p.disc(32, 32, 28, [255, 250, 226]); }, 4);

// ---------------------------------------------------------------- materials
defineMaterial('lv50_deck', 'lv50_deck', { s: 4, surf: 'tile', stain: 0.05 });
defineMaterial('lv50_coping', 'lv50_coping', { su: 4, sv: 1, surf: 'tile' });
defineMaterial('lv50_lobby', 'lv50_lobby', { s: 4, surf: 'tile' });
defineMaterial('lv50_carpet', 'lv50_carpet', { s: 2, surf: 'carpet' });
defineMaterial('lv50_panel', 'lv50_panel', { su: 4, sv: 4, surf: 'wood' });
defineMaterial('lv50_ceiling', 'lv50_ceiling', { s: 4, surf: 'drywall' });
defineMaterial('lv50_body', 'lv50_body', { s: 4, surf: 'concrete' });
defineMaterial('lv50_column', 'lv50_column', { su: 1.6, sv: 8, surf: 'tile' });
defineMaterial('lv50_glazing', 'lv50_glazing', { su: 6, sv: 8, flags: VF.FULLBRIGHT, glow: 0.92 });
for (let k = 0; k < 4; k++) defineMaterial('lv50_fac' + k, 'lv50_fac' + k, { s: 16, flags: VF.FULLBRIGHT, glow: 1.12 });
defineMaterial('lv50_water', 'lv50_water', { s: 8, surf: 'water', flags: VF.WOBBLE | VF.SCROLL | VF.FULLBRIGHT, glow: 0.5 });
for (let k = 0; k < SHAFT_GLOW.length; k++) defineMaterial('lv50_shaft' + k, 'lv50_pool_tile', { s: 4, surf: 'tile', flags: VF.FULLBRIGHT, glow: SHAFT_GLOW[k], chan: k & 1 ? 9 : 10 });
defineMaterial('lv50_stripe', 'lv50_stripe', { s: 1.2, surf: 'carpet' });
defineMaterial('lv50_stripe2', 'lv50_stripe2', { s: 1.2, surf: 'carpet' });
defineMaterial('lv50_towel', 'lv50_towel', { s: 0.8, surf: 'carpet' });
defineMaterial('lv50_board', 'lv50_board', { s: 1.5, surf: 'plastic' });
defineMaterial('lv50_plank', 'lv50_plank', { s: 2, surf: 'wood' });
defineMaterial('lv50_post', 'lv50_post', { s: 1.5, surf: 'metal' });
defineMaterial('lv50_stone', 'lv50_stone', { s: 1.5, surf: 'concrete' });
defineMaterial('lv50_trunk', 'lv50_trunk', { s: 1, surf: 'wood' });
defineMaterial('lv50_beacon', 'lv50_beacon', { s: 1, flags: VF.FULLBRIGHT, glow: 1.3, chan: 14 });
defineMaterial('lv50_bulb', 'lv50_bulb', { s: 1, flags: VF.FULLBRIGHT, glow: 1.1 });

defineHotelProps('lv50', { cushion: 'lv50_towel', frame: 'lv50_post', canopy: 'lv50_stripe', canopyB: 'plastic_white', trunk: 'lv50_trunk', frond: 'lv50_frond', post: 'lv50_post', stone: 'lv50_stone', lampGlow: 'lv50_lampglow' });

// a chandelier: a ring of bulbs hung on three chains
defineProp('lv50_chandelier', {
  build(mb, p) {
    const R = p.opts.r || 0.9, drop = p.opts.drop || 1.0;
    const g = S('lv50_post');
    mb.rod(0, drop, 0, 0, drop + 1.2, 0, 0.02, 4, g);
    mb.cyl(0, 0, 0, R, 0.05, 10, S('lv50_column'), 3);
    mb.cyl(0, 0.05, 0, R * 0.55, 0.04, 8, S('lv50_column'), 3);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2, x = Math.sin(a) * R, z = -Math.cos(a) * R;
      mb.box(x - 0.05, 0.05, z - 0.05, x + 0.05, 0.22, z + 0.05, G('lv50_bulb', 1.1));
    }
    mb.box(-0.07, -0.25, -0.07, 0.07, 0, 0.07, G('lv50_bulb', 1.0));
  },
  light: { y: 0.0, color: [1.0, 0.82, 0.55], rad: 10, int: 0.85 },
});
// a wall light in the lobby
defineProp('lv50_sconce', {
  build(mb) {
    mb.box(-0.08, 1.9, -0.04, 0.08, 2.4, 0.04, S('lv50_post'));
    mb.box(-0.06, 2.0, 0.04, 0.06, 2.3, 0.12, G('lv50_bulb', 1.0));
  },
  light: { y: 2.1, z: 0.3, color: [1.0, 0.8, 0.52], rad: 5.5, int: 0.55 },
});

// ---------------------------------------------------------------- more props
// pool ladder: two rails that dive into the water and go on down into the dark
defineProp('lv50_ladder', {
  build(mb) {
    const c = S('chrome');
    for (const sx of [-1, 1]) {
      mb.box(sx * 0.27 - 0.025, 0.0, -0.03, sx * 0.27 + 0.025, 0.95, 0.03, c, { skip: 8 });
      mb.box(sx * 0.27 - 0.025, 0.92, -0.03, sx * 0.27 + 0.025, 0.98, 0.52, c);
      mb.box(sx * 0.27 - 0.025, -9, 0.46, sx * 0.27 + 0.025, 0.98, 0.52, c, { skip: 4 });
    }
    for (let y = 0.7; y > -3.6; y -= 0.3) mb.box(-0.27, y - 0.015, 0.47, 0.27, y + 0.015, 0.51, c);
  },
});
defineProp('lv50_sign', {
  build(mb, p) {
    const tex = T(p.opts.nodive ? 'lv50_sign_nodive' : 'lv50_sign_depth', { lit: true });
    const post = S('lv50_post');
    for (const sx of [-1, 1]) mb.box(sx * 0.42 - 0.03, 0, -0.03, sx * 0.42 + 0.03, 1.35, 0.03, post, { skip: 8 });
    mb.box(-0.5, 0.65, -0.04, 0.5, 1.4, 0.04, [post, post, post, post, tex, tex], { uv: ['world', 'world', 'world', 'world', [0, 0, 1, 1], [1, 0, 0, 1]] });
  },
  boxes: [[-0.5, 0, -0.06, 0.5, 1.4, 0.06]],
});
// the pavilion on the island at the heart of the pool
defineProp('lv50_pavilion', {
  build(mb) {
    const post = S('lv50_post'), col = S('lv50_column'), roof = S('lv50_stripe'), roofB = S('plastic_white');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 2.7 - 0.15, 0, sz * 2.7 - 0.15, sx * 2.7 + 0.15, 3.3, sz * 2.7 + 0.15, col, { skip: 8, sub: 3 });
    // roof slab with trim and a pitched cap
    mb.box(-3.3, 3.3, -3.3, 3.3, 3.5, 3.3, post);
    for (let k = 0; k < 8; k++) {
      const x0 = -3.3 + k * 0.825, x1 = x0 + 0.825, st = k % 2 ? roof : roofB;
      mb.poly4([x0, 3.5, 3.3], [x1, 3.5, 3.3], [x1, 4.4, 0], [x0, 4.4, 0], st, [0, 1, 1, 1, 1, 0, 0, 0]);
      mb.poly4([x0, 4.4, 0], [x1, 4.4, 0], [x1, 3.5, -3.3], [x0, 3.5, -3.3], st, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
    // back wall of lit panels behind the door
    mb.box(-2.9, 0, 2.62, 2.9, 3.3, 2.78, S('lv50_panel'), { skip: 8 });
    mb.box(-0.6, 3.1, -0.1, 0.6, 3.25, 0.1, G('lv50_bulb', 1.0), { skip: 4 });
  },
  boxes: [[-2.9, 0, 2.6, 2.9, 3.3, 2.8], [-2.85, 0, -2.85, -2.55, 3.3, -2.55], [2.55, 0, -2.85, 2.85, 3.3, -2.55], [-2.85, 0, 2.55, -2.55, 3.3, 2.85], [2.55, 0, 2.55, 2.85, 3.3, 2.85]],
  light: { y: 2.8, color: [1.0, 0.8, 0.5], rad: 9, int: 0.8 },
});

// ---------------------------------------------------------------- layout
const edgeX = (i, j) => (j & 1) === 0 || hr(i, j, 501) < 0.7;   // lobby on the line x = B*i between blocks i-1 and i
const edgeZ = (i, j) => (i & 1) === 0 || hr(i, j, 502) < 0.7;   // lobby on the line z = B*j between blocks j-1 and j
const wingH = (i, j, side) => 44 + Math.floor(hr(i, j, 520 + side) * 4) * 4;   // 44..56

// the high-dive tower of the first courtyard: the arrival is on its platform, 4.8 m above the deck
const TOWER0 = { x: 52, z: 65 };
export const ENTRY = { x: TOWER0.x + 0.5, y: 4.8, z: TOWER0.z + 3.2, yaw: 0, pitch: -0.14 };

function poolRect(i, j) {
  if (i === 0 && j === 0) return { x0: 28, z0: 26, x1: 100, z1: 62 };
  const w = 56 + Math.floor(hr(i, j, 11) * 5) * 4, d = 36 + Math.floor(hr(i, j, 12) * 4) * 4;
  const x0 = Math.round((B - w) / 2 + (hr(i, j, 13) - 0.5) * 20), z0 = Math.round((B - d) / 2 + (hr(i, j, 14) - 0.5) * 48);
  return { x0, z0, x1: x0 + w, z1: z0 + d };
}

const ODD = ['piano', 'chair_office', 'lamp_floor', 'crt', 'filing_cabinet', 'shopping_cart', 'water_cooler', 'bathtub', 'tv_wood', 'payphone', 'trash_can', 'coat_rack'];

function shaft(zb, x0, z0, x1, z1) {
  for (let b = 0; b < SHAFT.length - 1; b++) {
    const ya = SHAFT[b + 1], yb = SHAFT[b], m = M['lv50_shaft' + b];
    cbox(zb, x0 - 1, ya, z0 - 1, x1 + 1, yb, z0, m, { skip: only(FACE.PZ), sub: 8 });
    cbox(zb, x0 - 1, ya, z1, x1 + 1, yb, z1 + 1, m, { skip: only(FACE.NZ), sub: 8 });
    cbox(zb, x0 - 1, ya, z0, x0, yb, z1, m, { skip: only(FACE.PX), sub: 8 });
    cbox(zb, x1, ya, z0, x1 + 1, yb, z1, m, { skip: only(FACE.NX), sub: 8 });
  }
}

// a pier of planks with rails and small lamps from the deck out to the island
function pier(zb, ax, az, bx, bz, w) {
  // (ax, az) -> (bx, bz) along one axis, w wide
  const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
  const x0 = Math.min(ax, bx) - (alongX ? 0 : w / 2), x1 = Math.max(ax, bx) + (alongX ? 0 : w / 2);
  const z0 = Math.min(az, bz) - (alongX ? w / 2 : 0), z1 = Math.max(az, bz) + (alongX ? w / 2 : 0);
  cbox(zb, x0, -0.35, z0, x1, 0, z1, M.lv50_plank, { sub: 3 });
  const L = alongX ? x1 - x0 : z1 - z0;
  for (let t = 0; t <= L + 0.01; t += 3) {
    for (const sd of [-1, 1]) {
      const px = alongX ? x0 + Math.min(t, L - 0.1) : (sd < 0 ? x0 + 0.06 : x1 - 0.06);
      const pz = alongX ? (sd < 0 ? z0 + 0.06 : z1 - 0.06) : z0 + Math.min(t, L - 0.1);
      cbox(zb, px - 0.05, 0, pz - 0.05, px + 0.05, 1.05, pz + 0.05, M.lv50_post, { sub: 0 });
    }
  }
  if (alongX) { cbox(zb, x0, 0.95, z0, x1, 1.0, z0 + 0.1, M.lv50_post, {}); cbox(zb, x0, 0.95, z1 - 0.1, x1, 1.0, z1, M.lv50_post, {}); }
  else { cbox(zb, x0, 0.95, z0, x0 + 0.1, 1.0, z1, M.lv50_post, {}); cbox(zb, x1 - 0.1, 0.95, z0, x1, 1.0, z1, M.lv50_post, {}); }
  for (let t = 4; t < L - 2; t += 9) {
    const lx = alongX ? x0 + t : x0 + 0.06, lz = alongX ? z0 + 0.06 : z0 + t;
    if (owns(zb, lx, lz)) zb.prop('lv50_lamp', lx, 0, lz, 0, { h: 2.2 });
  }
}

// a diving tower: a platform 4.8 m up on columns, a flight of steps, rails, and a board over the water
function diveTower(zb, X, Z, door) {
  cbox(zb, X - 4, 4.45, Z, X + 6, 4.8, Z + 6, M.lv50_coping, { sub: 3 });
  for (const px of [X - 3.7, X + 0.5, X + 5.7]) for (const pz of [Z + 0.3, Z + 5.7]) cbox(zb, px - 0.3, 0, pz - 0.3, px + 0.3, 4.45, pz + 0.3, M.lv50_column, { sub: 3 });
  stairs(zb, X + 4, Z + 6, X + 6, Z + 13, '-z', 0, 4.8, M.lv50_coping);
  // open rails: posts and two bars, with an invisible solid behind them so nobody slips through
  const rail = (x0, z0, x1, z1) => {
    const alongX = x1 - x0 > z1 - z0;
    zb.box(x0, 4.8, z0, x1, 5.9, z1, M.lv50_post, { render: false });
    const L = alongX ? x1 - x0 : z1 - z0;
    const n = Math.max(1, Math.round(L / 1.5));
    for (let k = 0; k <= n; k++) {
      const q = (L * k) / n;
      const px = alongX ? x0 + q : (x0 + x1) / 2, pz = alongX ? (z0 + z1) / 2 : z0 + q;
      zb.box(px - 0.04, 4.8, pz - 0.04, px + 0.04, 5.85, pz + 0.04, M.lv50_post, { collide: false, skip: 8 });
    }
    for (const y of [5.8, 5.35]) zb.box(x0, y, z0, x1, y + 0.05, z1, M.lv50_post, { collide: false });
  };
  const t = 0.07;
  rail(X - 4, Z, X - 4 + t, Z + 6);
  rail(X - 4, Z, X - 0.5, Z + t); rail(X + 1.8, Z, X + 6, Z + t);
  rail(X + 6 - t, Z, X + 6, Z + 6);
  rail(X - 4, Z + 6 - t, X + 4, Z + 6);
  // the board: non-slip stripe, a fulcrum underneath
  cbox(zb, X - 0.1, 4.68, Z - 4.5, X + 1.1, 4.8, Z + 0.6, M.lv50_board, { sub: 0 });
  cbox(zb, X + 0.2, 4.45, Z + 0.1, X + 0.8, 4.68, Z + 0.5, M.lv50_post, {});
  if (owns(zb, X - 3.6, Z + 0.7)) zb.prop('lv50_lamp', X - 3.5, 4.8, Z + 0.7, 0, { h: 2.6 });
  if (owns(zb, X + 5.4, Z + 0.7)) zb.prop('lv50_lamp', X + 5.4, 4.8, Z + 0.7, 0, { h: 2.6 });
  if (door) levelDoor(zb, X - 2.3, Z + 4.6, 0, { y: 4.8 });
}

function gen(zb) {
  const bi = Math.floor(zb.x0 / B), bj = Math.floor(zb.z0 / B);
  const ox = bi * B, oz = bj * B;
  zb.noConnectivity = true;
  openGround(zb, M.lv50_deck, 0);
  const P = poolRect(bi, bj);
  const pass = { W: edgeX(bi, bj), E: edgeX(bi + 1, bj), N: edgeZ(bi, bj), S: edgeZ(bi, bj + 1) };
  const inPass = (a) => a >= 58 && a < 70;
  const COP = 2;

  zb.fill(zb.x0, zb.z0, zb.x1, zb.z1, (x, z, k) => {
    const u = x - ox, v = z - oz;
    // the pool: no floor at all
    if (u >= P.x0 && u < P.x1 && v >= P.z0 && v < P.z1) { zb.floor[k] = NaN; return; }
    if (u >= P.x0 - COP && u < P.x1 + COP && v >= P.z0 - COP && v < P.z1 + COP) { zb.fmat[k] = M.lv50_coping; return; }
    const w = u < BODY, e = u >= B - BODY, n = v < BODY, s = v >= B - BODY;
    if (w || e || n || s) {
      // the hotel body is solid, except where a lobby crosses it
      const q = w || e ? v : u;
      const open = (w && pass.W && inPass(v)) || (e && pass.E && inPass(v)) || (n && pass.N && inPass(u)) || (s && pass.S && inPass(u));
      if (open) { zb.ceil[k] = ARC_H; zb.cmat[k] = M.lv50_ceiling; zb.fmat[k] = q >= 62 && q < 66 ? M.lv50_carpet : M.lv50_lobby; zb.wmat[k] = M.lv50_panel; return; }
      const edge = (w && u === BODY - 1) || (e && u === B - BODY) || (n && v === BODY - 1) || (s && v === B - BODY);
      zb.solid[k] = edge && !(u < BODY && v < BODY) ? M.lv50_glazing : M.lv50_body;
      return;
    }
    if (u < WING || u >= B - WING || v < WING || v >= B - WING) {
      // the arcade: a colonnade under the first floors
      zb.ceil[k] = ARC_H; zb.cmat[k] = M.lv50_ceiling; zb.fmat[k] = M.lv50_lobby; zb.wmat[k] = M.lv50_body;
    }
  });

  // upper facades facing the courtyard (self-lit windows), in 16 m panels with a variant each
  // side: 0 faces +x, 1 faces -x, 2 faces +z, 3 faces -z
  const fac = (side, a0, a1, fixed, yLo, yHi, salt) => {
    for (let a = a0; a < a1;) {
      const seg = Math.floor(a / 16) * 16 + 16, e = Math.min(a1, seg);
      for (let y = yLo, band = 0; y < yHi; ) {
        const yn = Math.min(yHi, (Math.floor(y / 16) + 1) * 16);
        const m = M['lv50_fac' + Math.floor(hr(Math.floor(a / 16) + side * 31, Math.floor(y / 16) + bi * 7 + bj * 13 + salt, 530) * 4)];
        if (side === 0) cbox(zb, fixed - 0.3, y, a, fixed, yn, e, m, { skip: only(FACE.PX), sub: 8, collide: false });
        else if (side === 1) cbox(zb, fixed, y, a, fixed + 0.3, yn, e, m, { skip: only(FACE.NX), sub: 8, collide: false });
        else if (side === 2) cbox(zb, a, y, fixed - 0.3, e, yn, fixed, m, { skip: only(FACE.PZ), sub: 8, collide: false });
        else cbox(zb, a, y, fixed, e, yn, fixed + 0.3, m, { skip: only(FACE.NZ), sub: 8, collide: false });
        y = yn; band++;
      }
      a = e;
    }
  };
  const hW = wingH(bi, bj, 0), hE = wingH(bi, bj, 1), hN = wingH(bi, bj, 2), hS = wingH(bi, bj, 3);
  fac(0, oz + WING, oz + B - WING, ox + WING, ARC_H, hW, 0);          // west wing, facing +x
  fac(1, oz + WING, oz + B - WING, ox + B - WING, ARC_H, hE, 0);      // east wing, facing -x
  fac(2, ox + WING, ox + B - WING, oz + WING, ARC_H, hN, 0);          // north wing, facing +z
  fac(3, ox + WING, ox + B - WING, oz + B - WING, ARC_H, hS, 0);      // south wing, facing -z
  // corner towers rise above the wings: two faces each, from the lower neighbour's roof up
  const tower = (cxs, czs, hA, hB, k) => {
    const top = Math.max(hA, hB) + 16 + Math.floor(hr(bi * 3 + cxs, bj * 5 + czs, 640) * 3) * 8;
    const lo = Math.min(hA, hB);
    if (cxs === 0) { fac(0, oz + (czs ? B - WING : 0), oz + (czs ? B : WING), ox + WING, lo, top, 40 + k); }
    else fac(1, oz + (czs ? B - WING : 0), oz + (czs ? B : WING), ox + B - WING, lo, top, 40 + k);
    if (czs === 0) fac(2, ox + (cxs ? B - WING : 0), ox + (cxs ? B : WING), oz + WING, lo, top, 50 + k);
    else fac(3, ox + (cxs ? B - WING : 0), ox + (cxs ? B : WING), oz + B - WING, lo, top, 50 + k);
    // a red light on the crown
    const bx = ox + (cxs ? B - 6 : 6), bz = oz + (czs ? B - 6 : 6);
    if (owns(zb, bx, bz)) {
      zb.box(bx - 0.3, top, bz - 0.3, bx + 0.3, top + 0.6, bz + 0.3, M.lv50_beacon, { collide: false });
    }
  };
  tower(0, 0, hW, hN, 0); tower(1, 0, hE, hN, 1); tower(0, 1, hW, hS, 2); tower(1, 1, hE, hS, 3);

  // columns of the arcade and lights under it
  for (let t = WING + 2; t < B - WING; t += 6) {
    for (const [cx, cz] of [[ox + WING - 0.5, oz + t], [ox + B - WING + 0.5, oz + t], [ox + t, oz + WING - 0.5], [ox + t, oz + B - WING + 0.5]]) {
      if (!zb.in(Math.floor(cx), Math.floor(cz))) continue;
      zb.box(cx - 0.35, 0, cz - 0.35, cx + 0.35, ARC_H, cz + 0.35, M.lv50_column, { sub: 4 });
    }
    for (const [cx, cz] of [[ox + WING - 2, oz + t + 3], [ox + B - WING + 2, oz + t + 3], [ox + t + 3, oz + WING - 2], [ox + t + 3, oz + B - WING + 2]]) {
      const kx = Math.floor(cx), kz = Math.floor(cz);
      if (!zb.in(kx, kz)) continue;
      if (zb.getCeil(kx, kz) === ARC_H) ceilingLight(zb, cx, cz, 'bulb', 'on', { color: [1.0, 0.78, 0.5], rad: 9, int: 0.7, hang: 0.5 });
    }
  }

  // lobbies: chandeliers and wall lights
  const lobby = (axis, edge) => {
    for (let t = 0; t < 2; t++) {
      if (axis === 'x') {
        const along = edge === 0 ? ox + 2 + t * 4 : ox + B - 6 + t * 4;
        zb.prop('lv50_chandelier', along, ARC_H - 2.4, oz + 64, 0, { drop: 1.0 });
        for (const wz of [oz + 58.4, oz + 69.6]) zb.prop('lv50_sconce', along, 0, wz, wz < oz + 64 ? Math.PI : 0);
      } else {
        const alongZ = edge === 0 ? oz + 2 + t * 4 : oz + B - 6 + t * 4;
        zb.prop('lv50_chandelier', ox + 64, ARC_H - 2.4, alongZ, 0, { drop: 1.0 });
        for (const wx of [ox + 58.4, ox + 69.6]) zb.prop('lv50_sconce', wx, 0, alongZ, wx < ox + 64 ? -Math.PI / 2 : Math.PI / 2);
      }
    }
  };
  if (pass.W) lobby('x', 0);
  if (pass.E) lobby('x', 1);
  if (pass.N) lobby('z', 0);
  if (pass.S) lobby('z', 1);

  // the pool: a shaft of teal tile fading to black, a glassy surface, light from below along the rim
  shaft(zb, ox + P.x0, oz + P.z0, ox + P.x1, oz + P.z1);
  cbox(zb, ox + P.x0, -0.19, oz + P.z0, ox + P.x1, -0.17, oz + P.z1, M.lv50_water, { alpha: 0.5, collide: false, skip: only(FACE.PY), sub: 6 });
  for (let t = P.x0; t < P.x1; t += 6) for (const zz of [P.z0 - 0.5, P.z1 + 0.5]) if (zb.in(ox + t, Math.floor(oz + zz))) zb.light(ox + t, -0.1, oz + zz, { color: [0.2, 0.75, 0.8], rad: 6, int: 0.55 });
  for (let t = P.z0; t < P.z1; t += 6) for (const xx of [P.x0 - 0.5, P.x1 + 0.5]) if (zb.in(Math.floor(ox + xx), oz + t)) zb.light(ox + xx, -0.1, oz + t, { color: [0.2, 0.75, 0.8], rad: 6, int: 0.55 });

  // the island in the middle, joined to the deck by a pier (or two)
  const cx = Math.round((P.x0 + P.x1) / 2), cz = Math.round((P.z0 + P.z1) / 2);
  cbox(zb, ox + cx - 4, -0.45, oz + cz - 4, ox + cx + 4, 0, oz + cz + 4, M.lv50_coping, { sub: 2 });
  const piers = (bi === 0 && bj === 0) ? [2] : [Math.floor(hr(bi, bj, 600) * 4), ...(hr(bi, bj, 601) < 0.5 ? [(Math.floor(hr(bi, bj, 600) * 4) + 2) % 4] : [])];
  for (const sd of piers) {
    if (sd === 0) pier(zb, ox + cx, oz + P.z0 - 1, ox + cx, oz + cz - 4, 2.4);
    else if (sd === 2) pier(zb, ox + cx, oz + cz + 4, ox + cx, oz + P.z1 + 1, 2.4);
    else if (sd === 1) pier(zb, ox + cx + 4, oz + cz, ox + P.x1 + 1, oz + cz, 2.4);
    else pier(zb, ox + P.x0 - 1, oz + cz, ox + cx - 4, oz + cz, 2.4);
  }
  // the pavilion, facing the first pier, with a door against its back wall
  const face = piers[0];            // pier side: 0 north, 1 east, 2 south, 3 west
  const prot = [0, Math.PI / 2, Math.PI, -Math.PI / 2][face];
  if (owns(zb, ox + cx, oz + cz)) {
    zb.prop('lv50_pavilion', ox + cx, 0, oz + cz, prot, {});
    // door stands inside against the back wall; the pavilion's back (local +z) faces away from the pier
    const bx = ox + cx - Math.sin(prot) * 2.2, bz = oz + cz + Math.cos(prot) * 2.2;
    levelDoor(zb, bx, bz, prot, { y: 0 });
  }

  // diving towers on the south deck: always in the first courtyard, in some of the others
  const T = (bi === 0 && bj === 0) ? { x: TOWER0.x, z: TOWER0.z } : (hr(bi, bj, 650) < 0.5 ? { x: Math.round(P.x0 + 6 + hr(bi, bj, 651) * 18), z: P.z1 + 3 } : null);
  if (T && ox + T.x + 8 < zb.x1 && oz + T.z + 14 < zb.z1) diveTower(zb, ox + T.x, oz + T.z, !(bi === 0 && bj === 0));

  // ladders and signs on the coping
  for (const [lx, lz, sd] of [[P.x0 + 14, P.z0, 'N'], [P.x1 - 14, P.z1, 'S'], [P.x0, P.z0 + 12, 'W'], [P.x1, P.z1 - 12, 'E']]) {
    const rot = { N: 0, S: Math.PI, W: -Math.PI / 2, E: Math.PI / 2 }[sd];
    const wx = ox + lx + (sd === 'W' ? -0.25 : sd === 'E' ? 0.25 : 0.5), wz = oz + lz + (sd === 'N' ? -0.25 : sd === 'S' ? 0.25 : 0.5);
    if (owns(zb, wx, wz)) zb.prop('lv50_ladder', wx, 0, wz, rot, {});
  }
  for (let q = 0; q < 3; q++) {
    const t = 0.2 + 0.6 * hr(bi * 3 + q, bj, 610);
    const sx = ox + P.x0 + t * (P.x1 - P.x0), sz = (q & 1) ? oz + P.z0 - 2.6 : oz + P.z1 + 2.6;
    if (owns(zb, sx, sz) && !(bi === 0 && bj === 0 && Math.abs(sx - ENTRY.x) < 3)) zb.prop('lv50_sign', sx, 0, sz, (q & 1) ? Math.PI : 0, { nodive: q === 2 });
  }

  // post lamps around the pool
  const lampAt = (x, z) => { if (owns(zb, x, z)) zb.prop('lv50_lamp', x, 0, z, 0); };
  for (let t = P.x0 + 4; t < P.x1; t += 14) { lampAt(ox + t, oz + P.z0 - 4); lampAt(ox + t, oz + P.z1 + 4); }
  for (let t = P.z0 + 4; t < P.z1; t += 14) { lampAt(ox + P.x0 - 4, oz + t); lampAt(ox + P.x1 + 4, oz + t); }

  // loungers in groups facing the water, with tables, parasols and palms between
  const sides = [
    { n: 0, dx: 0, dz: 1, along: 'x', a0: P.x0, a1: P.x1, at: (t) => [ox + t, oz + P.z0 - 7.5] },
    { n: 1, dx: 0, dz: -1, along: 'x', a0: P.x0, a1: P.x1, at: (t) => [ox + t, oz + P.z1 + 7.5] },
    { n: 2, dx: 1, dz: 0, along: 'z', a0: P.z0, a1: P.z1, at: (t) => [ox + P.x0 - 7.5, oz + t] },
    { n: 3, dx: -1, dz: 0, along: 'z', a0: P.z0, a1: P.z1, at: (t) => [ox + P.x1 + 7.5, oz + t] },
  ];
  const nearEntry = (x, z, r) => bi === 0 && bj === 0 && Math.hypot(x - ENTRY.x, z - ENTRY.z) < r;
  for (const sd of sides) {
    const rot = facing(sd.dx, sd.dz);
    for (let t = sd.a0 + 3, k = 0; t < sd.a1 - 3; t += 5.2, k++) {
      const h = hr(bi * 13 + k, bj * 7 + sd.n, 540);
      const [cx2, cz2] = sd.at(t);
      if (!owns(zb, cx2, cz2) || nearEntry(cx2, cz2, 9)) continue;
      if (h < 0.5) {
        const cnt = h < 0.22 ? 3 : 2;
        const px = sd.along === 'x' ? 1 : 0, pz = sd.along === 'x' ? 0 : 1;
        for (let q = 0; q < cnt; q++) {
          const off = (q - (cnt - 1) / 2) * 0.95;
          zb.prop('lv50_lounger', cx2 + px * off, 0, cz2 + pz * off, rot + (hr(k, q + sd.n, 541) - 0.5) * 0.1, { up: 0.35 + hr(k, q, 542) * 0.5 });
        }
        if (h < 0.3) zb.prop('lv50_table', cx2 + px * 1.9, 0, cz2 + pz * 1.9, 0, { lamp: h < 0.14 });
        if (h < 0.18) zb.prop('lv50_parasol', cx2 - px * 1.9, 0, cz2 - pz * 1.9, rot, {});
      } else if (h < 0.62) zb.prop('lv50_palm', cx2, 0, cz2, rot, {});
    }
  }

  // cabanas along the arcades; some hide a door
  for (let sd = 0; sd < 4; sd++) {
    for (let k = 0; k < 4; k++) {
      const t = WING + 10 + k * 24 + Math.floor(hr(bi * 5 + k, bj + sd, 550) * 6);
      const along = sd < 2 ? 'z' : 'x';
      const fix = sd === 0 ? ox + WING + 6 : sd === 1 ? ox + B - WING - 6 : sd === 2 ? oz + WING + 6 : oz + B - WING - 6;
      const x = along === 'z' ? fix : ox + t, z = along === 'z' ? oz + t : fix;
      const rot = [Math.PI / 2, -Math.PI / 2, Math.PI, 0][sd];
      if (hr(bi * 3 + k, bj * 5 + sd, 551) > 0.5 && k !== 1) continue;
      if (!owns(zb, x, z) || nearEntry(x, z, 14)) continue;
      // keep clear of the pool and its coping
      const lu = x - ox, lv = z - oz;
      if (lu > P.x0 - 7 && lu < P.x1 + 7 && lv > P.z0 - 7 && lv < P.z1 + 7) continue;
      const door = k === 1 && sd < 2 || (k === 2 && sd === 3);
      zb.prop('lv50_cabana', x, 0, z, rot, { w: 4.2, d: 3.2, door });
      if (door) levelDoor(zb, x - Math.sin(rot) * -1.15, z + Math.cos(rot) * -1.15, rot, {});
    }
  }
  // palms in planters under the arcades
  for (let t = WING + 5; t < B - WING; t += 18) {
    if (hr(bi + t, bj, 570) > 0.55) continue;
    for (const [px, pz] of [[ox + WING + 1.2, oz + t], [ox + B - WING - 1.2, oz + t], [ox + t, oz + WING + 1.2], [ox + t, oz + B - WING - 1.2]]) {
      if (owns(zb, px, pz)) zb.prop('lv50_planter', px, 0, pz, 0, { s: 0.9 });
    }
  }

  // things that came back changed lie at the edge, wet
  for (let q = 0; q < 6; q++) {
    const h = hr(bi * 17 + q, bj * 19, 580);
    if (h > 0.62 && q > 0) continue;
    const side = q & 3, t = 0.15 + 0.7 * hr(bi + q * 3, bj, 581);
    const x = side < 2 ? ox + P.x0 + t * (P.x1 - P.x0) : side === 2 ? ox + P.x0 - 3.0 : ox + P.x1 + 3.0;
    const z = side >= 2 ? oz + P.z0 + t * (P.z1 - P.z0) : side === 0 ? oz + P.z0 - 3.0 : oz + P.z1 + 3.0;
    if (!owns(zb, x, z) || nearEntry(x, z, 7)) continue;
    const kind = ODD[Math.floor(hr(bi + q * 5, bj * 3 + q, 582) * ODD.length)];
    const rot = facing(side === 2 ? 1 : side === 3 ? -1 : 0, side === 0 ? 1 : side === 1 ? -1 : 0) + (hr(q, bi, 583) - 0.5) * 0.8;
    zb.prop(kind, x, 0, z, rot, kind === 'tv_wood' ? { screen: 'static' } : {});
    for (let d = 0; d < 3; d++) zb.decal(x + (hr(q, d, 584) - 0.5) * 1.6, 0, z + (hr(q, d, 585) - 0.5) * 1.6, 'up', 1.2 + hr(q, d, 586) * 1.6, 1.2 + hr(q, d, 587) * 1.4, 'lv50_puddle', { rot: hr(q, d, 588) * 6.28 });
  }
  for (let q = 0; q < 10; q++) {
    const x = ox + P.x0 + hr(bi * 3 + q, bj, 590) * (P.x1 - P.x0), z = oz + (q & 1 ? P.z1 + 3.2 : P.z0 - 3.2);
    if (owns(zb, x, z)) zb.decal(x, 0, z, 'up', 1.8, 1.2, 'lv50_puddle', { rot: hr(q, bj, 591) * 6.28 });
  }

  // water in the gutter
  zb.emitter(ox + P.x0 - 1, 0, oz + Math.round((P.z0 + P.z1) / 2), 'lv50_gutter', { vol: 0.8, rad: 24 });
  zb.emitter(ox + P.x1 + 1, 0, oz + Math.round((P.z0 + P.z1) / 2), 'lv50_gutter', { vol: 0.8, rad: 24 });
  for (const [px, pz] of [[ox + 4, oz + 64], [ox + B - 4, oz + 64], [ox + 64, oz + 4], [ox + 64, oz + B - 4]]) {
    if (owns(zb, px, pz) && ((px < ox + 8 && pass.W) || (px > ox + B - 8 && pass.E) || (pz < oz + 8 && pass.N) || (pz > oz + B - 8 && pass.S))) zb.emitter(px, 3, pz, 'lv50_muzak', { vol: 0.5, rad: 20 });
  }
  void withXf; void xfMul; void xfTranslate; void xfRotY;
}

defineZone('lv50_courtyard', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.1, 0.11, 0.17],
    env: env({ fog: [0.04, 0.055, 0.105], fogNear: 38, fogFar: 90, hum: 0, hvac: 0.2, reverb: 'outdoor', tone: 'lv50' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THE HOTEL POOL',
  zoneType: 'lv50_courtyard',
  zoneSize: B,
  entry: ENTRY,
  doorDensity: 1,
  viewRadius: 5,
  sky: {
    top: [0.012, 0.02, 0.05], horizon: [0.06, 0.075, 0.13], ground: [0.01, 0.014, 0.03], curve: 0.5,
    stars: 0.7,
    sun: { dir: [-0.35, 0.5, -0.8], color: [0.82, 0.86, 1.0], size: 0.03, halo: 0.2 },
  },
  light: { phoneRadius: 4.2, phoneIntensity: 0.26 },
  // now and then a wave knocks against the gutter somewhere around the pool
  script(ctx, dt) {
    const s = ctx.state;
    s.t = (s.t ?? 18) - dt;
    if (s.t > 0) return;
    s.t = 25 + Math.random() * 45;
    const p = ctx.player, a = Math.random() * Math.PI * 2, d = 12 + Math.random() * 22;
    ctx.game.audioCall('play', 'lv50_slosh', p.x + Math.sin(a) * d, p.y, p.z - Math.cos(a) * d, { distant: d > 22, vol: 0.9 });
  },
});
