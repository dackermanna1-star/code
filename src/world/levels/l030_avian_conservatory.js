// Level 30: The Avian Conservatory. A glasshouse the size of a district, warm and white with
// mist: promenades of wet stone under iron arches, palms, ponds, and big walk-through cages with
// perches, feeders and empty nests. There are no birds. Feathers lie on the stones, fans turn
// in the roof, misters hiss, and now and then the whole house is swallowed by a cycle of fog.
import { defineTexture, signTex } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { LEVEL_ZONE, defineLevel, openGround, cbox, owns, hr, levelDoor, env, M, CF, noise } from './kit.js';
import { glowMat, mulc, TAU } from './g07_kit.js';

const N = 30;
const P = 64, PW = 4, ROOF = 15.5;      // zone, half width of a promenade, glass roof height

// ------------------------------------------------------------------ textures
defineTexture('lv30_stone', (p) => {
  p.fill([150, 162, 150]); p.noise(5, 0.1, 3);
  for (let k = 0; k < 64; k += 16) { p.rect(k, 0, 1, 64, [88, 100, 90], 0.9); p.rect(0, k, 64, 1, [88, 100, 90], 0.9); }
  for (let i = 0; i < 6; i++) p.stain(8 + i * 11, 10 + (i * 17) % 50, 6, [96, 130, 90], 0.4);
  p.rect(0, 0, 64, 2, [180, 192, 182], 0.4); p.speckle(80, [200, 212, 204], 0.2, 0.5);
}, 12);
defineTexture('lv30_moss', (p) => { p.fill([48, 84, 46]); p.noise(6, 0.2, 3); p.speckle(200, [76, 126, 66], 0.3, 0.7); p.speckle(120, [28, 52, 30], 0.3, 0.7); p.speckle(30, [150, 190, 90], 0.3, 0.6); }, 12);
defineTexture('lv30_gravel', (p) => { p.fill([156, 146, 124]); p.noise(5, 0.14, 3); p.speckle(260, [190, 180, 156], 0.3, 0.7); p.speckle(200, [100, 92, 78], 0.3, 0.7); }, 10);
defineTexture('lv30_iron', (p) => { p.fill([226, 232, 226]); p.noise(4, 0.06, 2); p.rect(0, 0, 3, 64, [250, 252, 248], 0.5); p.rect(61, 0, 3, 64, [170, 180, 172], 0.7); p.speckle(40, [150, 110, 80], 0.2, 0.5); }, 8);
defineTexture('lv30_glass', (p) => { p.fill([214, 238, 226]); p.noise(5, 0.05, 2); p.rect(0, 0, 64, 2, [250, 255, 250]); p.rect(0, 62, 64, 2, [160, 190, 176]); p.rect(0, 0, 2, 64, [250, 255, 250]); }, 8);
defineTexture('lv30_bark', (p) => { p.fill([100, 76, 56]); p.noise(4, 0.2, 3); for (let x = 0; x < 64; x += 6) p.rect(x, 0, 1, 64, [60, 42, 30], 0.6); p.speckle(60, [140, 112, 84], 0.3, 0.6); }, 10);
defineTexture('lv30_trunk', (p) => { p.fill([128, 104, 76]); p.noise(4, 0.12, 2); for (let y = 0; y < 64; y += 5) p.rect(0, y, 64, 2, [80, 62, 44], 0.7); p.speckle(60, [168, 140, 104], 0.3, 0.5); }, 10);
defineTexture('lv30_frond', (p) => {
  p.fill([62, 140, 62]); p.clearAlpha(0);
  for (let y = 0; y < 64; y++) {
    const w = Math.max(0, Math.sin((y / 63) * Math.PI) * 28);
    p.rectA(32 - w * 0.5, y, Math.max(1, w), 1, 255);
    if (y % 3 === 0) { p.set(32, y, [30, 90, 36]); }
  }
  p.rect(31, 0, 2, 64, [120, 170, 70]);
  p.map((x, y, c) => (y % 4 === 1 ? [c[0] * 0.8, c[1] * 0.85, c[2] * 0.8] : c));
}, 8);
defineTexture('lv30_fern', (p) => {
  p.fill([74, 150, 70]); p.clearAlpha(0);
  for (let k = 0; k < 7; k++) {
    const a = -1.2 + k * 0.4;
    for (let t = 0; t < 40; t++) { const x = 32 + Math.sin(a) * t * 0.8, y = 62 - Math.cos(a) * t * 1.5; p.rectA(x - 1, y, 3, 2, 255); if (t % 4 === 0) { p.rectA(x - 4, y + 1, 9, 1, 255); } }
  }
  p.map((x, y, c) => [c[0] * (0.7 + 0.5 * (y / 64)), c[1] * (0.8 + 0.4 * (y / 64)), c[2]]);
}, 8);
defineTexture('lv30_leaf', (p) => {
  p.fill([40, 118, 58]); p.clearAlpha(0);
  for (let y = 4; y < 62; y++) { const w = Math.sin(((y - 4) / 58) * Math.PI) * 26; p.rectA(32 - w, y, w * 2, 1, 255); }
  for (let k = 0; k < 4; k++) { p.rectA(10 + k * 2, 14 + k * 11, 12, 3, 0); p.rectA(42 - k * 2, 14 + k * 11, 12, 3, 0); }
  p.rect(31, 4, 2, 58, [150, 190, 90]);
  p.map((x, y, c) => (x < 32 ? [c[0] * 0.85, c[1] * 0.9, c[2] * 0.85] : c));
}, 8);
defineTexture('lv30_flower', (p) => {
  p.fill([40, 110, 50]); p.clearAlpha(0);
  p.rect(31, 20, 2, 44, [50, 120, 56]); p.rectA(31, 20, 2, 44, 255);
  for (const [x, y, c] of [[32, 14, [240, 90, 130]], [22, 26, [250, 180, 60]], [42, 24, [240, 90, 130]], [30, 34, [255, 250, 220]], [38, 40, [250, 180, 60]]]) { p.disc(x, y, 6, c); for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++) if (xx * xx + yy * yy <= 36) p.alpha(x + xx, y + yy, 255); }
}, 10);
defineTexture('lv30_mesh', (p) => {
  p.fill([70, 74, 70]); p.clearAlpha(0);
  for (let k = 0; k < 64; k += 8) { p.rectA(k, 0, 1, 64, 255); p.rectA(0, k, 64, 1, 255); }
  p.rectA(0, 0, 64, 2, 255); p.rectA(0, 62, 64, 2, 255);
}, 4);
defineTexture('lv30_mist', (p) => {
  p.fill([236, 246, 240]); p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const n = pnoise(x, y, 4, 77) * 0.6 + pnoise(x, y, 8, 91) * 0.4; if (n > 0.52) p.alpha(x, y, 255); }
}, 4);
defineTexture('lv30_lily', (p) => { p.fill([58, 140, 70]); p.clearAlpha(0); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const d = Math.hypot(x - 32, y - 32); if (d < 26 && !(x > 32 && Math.abs(y - 32) < 3)) p.alpha(x, y, 255); } p.disc(40, 28, 3, [250, 200, 220]); }, 6);
defineTexture('lv30_sun', (p) => {
  p.fill([255, 244, 200]); p.clearAlpha(0);
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { p.rectA(tx * 16 + 2, ty * 16 + 2, 12, 12, 255); }
}, 4);
const FEATHER = [[236, 240, 244], [90, 150, 220], [220, 70, 60], [90, 180, 100], [244, 200, 70]];
FEATHER.forEach((c, i) => defineTexture('lv30_feather' + i, (p) => {
  p.fill(c); p.clearAlpha(0);
  for (let t = 0; t < 54; t++) {
    const x = 10 + t * 0.9, y = 44 - t * 0.55 + Math.sin(t * 0.1) * 2;
    p.set(x, y, mulc(c, 0.6)); p.alpha(x, y, 255);
    const w = Math.sin((t / 54) * Math.PI) * 9;
    for (let b = -w; b <= w; b++) { const xx = x - b * 0.45, yy = y + b * 0.9; p.alpha(xx, yy, 255); if (Math.abs(b) < 1) continue; p.set(xx, yy, b > 0 ? c : mulc(c, 0.85)); }
  }
}, 6));
defineTexture('lv30_sign_aviary', signTex(['AVIARY', 'ENTER'], [30, 90, 70], [240, 246, 230], 1), 8);
defineTexture('lv30_sign_feed', signTex(['PLEASE', 'DO NOT', 'FEED'], [226, 220, 190], [60, 70, 50], 1), 8);
defineTexture('lv30_sign_quiet', signTex(['QUIET', 'PLEASE'], [30, 90, 70], [240, 246, 230], 1), 8);
defineTexture('lv30_sign_mist', signTex(['MIST', 'CYCLE'], [226, 220, 190], [30, 90, 110], 1), 8);
defineTexture('lv30_hut', (p) => { p.fill([226, 230, 214]); p.noise(4, 0.06, 2); for (let x = 0; x < 64; x += 8) p.rect(x, 0, 1, 64, [170, 178, 160], 0.7); p.rect(0, 56, 64, 8, [90, 110, 90]); }, 8);

// ------------------------------------------------------------------ materials
defineMaterial('lv30_stone', 'lv30_stone', { s: 2.4, surf: 'wet', stain: 0.06 });
defineMaterial('lv30_moss', 'lv30_moss', { s: 2, surf: 'grass' });
defineMaterial('lv30_gravel', 'lv30_gravel', { s: 2, surf: 'concrete' });
defineMaterial('lv30_iron', 'lv30_iron', { s: 2, surf: 'metal' });
defineMaterial('lv30_glass', 'lv30_glass', { s: 4, surf: 'tile' });
defineMaterial('lv30_bark', 'lv30_bark', { s: 1.5, surf: 'wood' });
defineMaterial('lv30_trunk', 'lv30_trunk', { s: 1.2, surf: 'wood' });
defineMaterial('lv30_hut', 'lv30_hut', { s: 3, surf: 'wood' });
defineMaterial('lv30_mesh', 'lv30_mesh', { s: 1.5, surf: 'metal' });
defineMaterial('lv30_water', 'water_pool', { s: 3, surf: 'water', flags: VF.WOBBLE | VF.SCROLL, tint: [0.7, 1.1, 1.0] });
glowMat('lv30_sun', 'lv30_sun', 0.55, { s: 1 });
for (const k of ['aviary', 'feed', 'quiet', 'mist']) defineMaterial('lv30_sign_' + k, 'lv30_sign_' + k, { s: 1, surf: 'wood' });

// ------------------------------------------------------------------ props
const leafStyle = (name) => T(name, { lit: true });
function cardFan(mb, st, n, r, h, w, r0 = 0.3, lean = 0.5) {
  // n leaf cards radiating from the origin, drooping outwards
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + r0, c = Math.cos(a), s = Math.sin(a);
    const x1 = c * r, z1 = s * r, px = -s * w, pz = c * w;
    mb.card([-px * 0.15, 0, -pz * 0.15, px * 0.15, 0, pz * 0.15, x1 + px, h * (1 - lean), z1 + pz, x1 - px, h * (1 - lean), z1 - pz], [0, 1, 0], st, [0, 1, 1, 1, 1, 0, 0, 0]);
  }
}
defineProp('lv30_palm', {
  build(mb, p, r) {
    const h = p.opts.h || r.range(5, 9), st = S('lv30_trunk'), fr = leafStyle('lv30_frond');
    mb.cyl(0, 0, 0, 0.28, h, 6, st, 1);
    mb.cyl(0, 0, 0, 0.42, 0.5, 6, st, 0);
    // two tiers of fronds at the top
    for (let t = 0; t < 2; t++) {
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU + t * 0.4, c = Math.cos(a), s = Math.sin(a), L = 3.4 - t * 0.6, W = 0.7;
        const y0 = h - 0.1, y1 = h + 0.6 - t * 0.7 - 1.2 * (1 - t);
        mb.card([0, y0, 0, 0, y0, 0, c * L - s * W, y1, s * L + c * W, c * L + s * W, y1 - 0.0, s * L - c * W], [0, 1, 0], fr, [0, 1, 1, 1, 1, 0, 0, 0]);
      }
    }
  },
  boxes: [[-0.35, 0, -0.35, 0.35, 3, 0.35]],
});
defineProp('lv30_bush', {
  build(mb, p, r) {
    const kind = p.opts.kind || 0;
    if (kind === 0) cardFan(mb, leafStyle('lv30_fern'), 6, 0.1, 1.6, 0.9, r.range(0, 1), 0);
    else if (kind === 1) { const lf = leafStyle('lv30_leaf'); for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + r.range(0, 0.6), c = Math.cos(a), s = Math.sin(a), h = r.range(1.2, 2.4); mb.card([c * 0.15 - s * 0.7, h * 0.2, s * 0.15 + c * 0.7, c * 0.15 + s * 0.7, h * 0.2, s * 0.15 - c * 0.7, c * 0.9 + s * 0.7, h, s * 0.9 - c * 0.7, c * 0.9 - s * 0.7, h, s * 0.9 + c * 0.7], [0, 1, 0], lf, [0, 1, 1, 1, 1, 0, 0, 0]); } }
    else { const fl = leafStyle('lv30_flower'); for (let k = 0; k < 3; k++) { const a = k * 2.1 + r.range(0, 1); const c = Math.cos(a) * 0.5, s = Math.sin(a) * 0.5; mb.card([-c, 0, -s, c, 0, s, c, 1.3, s, -c, 1.3, -s], [s, 0, -c], fl, [0, 1, 1, 1, 1, 0, 0, 0]); } }
  },
});
defineProp('lv30_vine', {
  build(mb, p, r) {
    const st = leafStyle('lv30_leaf'), h = p.opts.h || 6;
    for (let k = 0; k < 2; k++) { const a = k * 1.57 + r.range(0, 1), c = Math.cos(a) * 0.7, s = Math.sin(a) * 0.7; mb.card([-c, 0, -s, c, 0, s, c, h, s, -c, h, -s], [s, 0, -c], st, [0, 1, 1, 1, 1, 0, 0, 0]); }
  },
});
// an iron arch over a promenade (axis local x, spanning 2 * PW + 1)
defineProp('lv30_arch', {
  build(mb, p) {
    const st = S('lv30_iron'), n = 14, hw = PW + 1.4, H = 9.5;
    const pt = (k) => { const a = (k / n) * Math.PI; return [Math.cos(a) * hw, Math.sin(a) * H * 0.9 + (k > 0 && k < n ? 0 : 0)]; };
    for (let k = 0; k < n; k++) { const a = pt(k), b = pt(k + 1); mb.rod(a[0], a[1], 0, b[0], b[1], 0, 0.22, 4, st); }
    for (const s of [-1, 1]) { mb.cyl(s * hw, 0, 0, 0.3, 0.6, 6, st, 1); }
    mb.rod(-hw, 4.5, 0, hw, 4.5, 0, 0.1, 4, st);
    for (let k = 2; k < n - 1; k += 2) { const a = pt(k); mb.rod(a[0], a[1], 0, a[0], 4.5, 0, 0.07, 4, st); }
  },
  boxes: [[-(PW + 1.7), 0, -0.3, -(PW + 1.1), 3, 0.3], [PW + 1.1, 0, -0.3, PW + 1.7, 3, 0.3]],
});
// a big ceiling fan (a dynamic: it turns)
defineProp('lv30_fan', {
  build(mb) {
    const st = S('lv30_iron'), bl = S('lv30_hut');
    mb.cyl(0, 0, 0, 0.25, 1.4, 6, st, 3);
    mb.rod(0, 1.4, 0, 0, 3.2, 0, 0.06, 4, st);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU, c = Math.cos(a), s = Math.sin(a); mb.box(Math.min(c * 0.3, c * 4.6) - 0.3 * Math.abs(s), 0.5, Math.min(s * 0.3, s * 4.6) - 0.3 * Math.abs(c), Math.max(c * 0.3, c * 4.6) + 0.3 * Math.abs(s), 0.62, Math.max(s * 0.3, s * 4.6) + 0.3 * Math.abs(c), bl); }
  },
});
// a tree trunk with perches, for the cages
defineProp('lv30_perch', {
  build(mb, p, r) {
    const st = S('lv30_bark'), h = p.opts.h || 5;
    mb.box(-0.25, 0, -0.25, 0.25, h, 0.25, st);
    for (let k = 0; k < 4; k++) {
      const y = 1.6 + k * (h - 2) / 3, dir = k % 2 ? 1 : -1, L = r.range(1.8, 3.2), ax = (k % 3 === 0);
      if (ax) mb.box(-0.09, y, 0.1 * dir, 0.09, y + 0.18, L * dir, st); else mb.box(0.1 * dir, y, -0.09, L * dir, y + 0.18, 0.09, st);
      mb.box(ax ? -0.5 : (L * dir * 0.7) - 0.06, y + 0.18, ax ? (L * dir * 0.7) - 0.06 : -0.5, ax ? 0.5 : (L * dir * 0.7) + 0.06, y + 0.6, ax ? (L * dir * 0.7) + 0.06 : 0.5, S('lv30_moss'), { skip: 8 });
    }
  },
  boxes: [[-0.3, 0, -0.3, 0.3, 4, 0.3]],
});
defineProp('lv30_feeder', {
  build(mb) {
    const st = S('lv30_iron'), wd = S('lv30_bark');
    mb.box(-0.06, 0, -0.06, 0.06, 2.4, 0.06, st);
    mb.box(-0.5, 2.4, -0.35, 0.5, 2.5, 0.35, wd);
    mb.box(-0.5, 2.5, -0.35, 0.5, 2.62, -0.28, wd); mb.box(-0.5, 2.5, 0.28, 0.5, 2.62, 0.35, wd);
    mb.box(-0.5, 2.5, -0.35, -0.43, 2.62, 0.35, wd); mb.box(0.43, 2.5, -0.35, 0.5, 2.62, 0.35, wd);
    mb.box(-0.4, 0.9, -0.3, 0.4, 1.0, 0.3, S('lv30_gravel'));
  },
  boxes: [[-0.15, 0, -0.15, 0.15, 2.2, 0.15]],
});
defineProp('lv30_nest', {
  build(mb) { const st = S('lv30_bark'); mb.cyl(0, 0, 0, 0.55, 0.28, 8, st, 1); mb.cyl(0, 0.2, 0, 0.35, 0.12, 8, S('lv30_moss'), 1); },
});
defineProp('lv30_bench', {
  build(mb) { const st = S('lv30_iron'), wd = S('lv30_bark'); mb.box(-0.9, 0.42, -0.25, 0.9, 0.48, 0.25, wd); mb.box(-0.9, 0.5, 0.22, 0.9, 0.95, 0.27, wd); for (const s of [-1, 1]) mb.box(s * 0.8 - 0.04, 0, -0.22, s * 0.8 + 0.04, 0.95, 0.27, st); },
  boxes: [[-0.95, 0, -0.3, 0.95, 0.5, 0.3]],
});
defineProp('lv30_mister', {
  build(mb) { const st = S('lv30_iron'); mb.box(-0.05, 0, -0.05, 0.05, 3.2, 0.05, st); mb.rod(0, 3.2, 0, 1.2, 3.2, 0, 0.04, 4, st); mb.rod(0, 3.2, 0, -1.2, 3.2, 0, 0.04, 4, st); for (const x of [-1.2, -0.4, 0.4, 1.2]) mb.box(x - 0.04, 3.1, -0.04, x + 0.04, 3.2, 0.04, S('lv30_hut')); },
  boxes: [[-0.1, 0, -0.1, 0.1, 2, 0.1]],
  emitter: { snd: 'lv30_mister', y: 3, vol: 0.5, rad: 16 },
});

glowMat('lv30_mistm', 'lv30_mist', 0.95, { s: 8, flags: VF.SCROLL });
const sign = (k) => T('lv30_sign_' + k, { lit: false, flags: VF.FULLBRIGHT, color: [0.1, 0.1, 0.1], flk: [0.55, 0.55, 0.55] });
defineProp('lv30_sign', {
  build(mb, p) {
    const st = S('lv30_iron');
    mb.box(-0.05, 0, -0.05, 0.05, 2.2, 0.05, st);
    mb.box(-0.5, 1.3, -0.04, 0.5, 2.2, 0.04, [st, st, st, st, sign(p.opts.k || 'aviary'), sign(p.opts.k || 'aviary')], { uv: 'fit' });
  },
  boxes: [[-0.1, 0, -0.1, 0.1, 2.2, 0.1]],
});

// ------------------------------------------------------------------ zone
function feathers(zb, x0, z0, x1, z1, n, salt) {
  for (let i = 0; i < n; i++) {
    const x = x0 + hr(i, salt, 201) * (x1 - x0), z = z0 + hr(i, salt, 202) * (z1 - z0);
    if (!owns(zb, x, z)) continue;
    zb.decal(x, 0, z, 'up', 0.8, 0.8, 'lv30_feather' + Math.floor(hr(i, salt, 203) * 5), { rot: hr(i, salt, 204) * TAU });
  }
}
function cage(zb, ccx, ccz, W, D, H, openSides, bi, bj, salt) {
  const hw = W / 2, hd = D / 2, t = 0.06;
  zb.fill(Math.floor(ccx - hw), Math.floor(ccz - hd), Math.ceil(ccx + hw), Math.ceil(ccz + hd), (x, z, i) => { zb.fmat[i] = M.lv30_gravel; });
  const dg = 1.7;      // half width of a doorway
  const wall = (ax0, az0, ax1, az1, along) => {
    // along 'x' or 'z': a wall with a doorway in the middle (if that side is open)
    const mid = along === 'x' ? (ax0 + ax1) / 2 : (az0 + az1) / 2, open = openSides;
    const parts = open ? (along === 'x' ? [[ax0, az0, mid - dg, az1], [mid + dg, az0, ax1, az1]] : [[ax0, az0, ax1, mid - dg], [ax0, mid + dg, ax1, az1]]) : [[ax0, az0, ax1, az1]];
    for (const [a0, b0, a1, b1] of parts) cbox(zb, a0, 0, b0, a1, H, b1, M.lv30_mesh, { sub: 4 });
    if (open) {
      if (along === 'x') cbox(zb, mid - dg, 3.2, az0, mid + dg, H, az1, M.lv30_mesh, { sub: 4 });
      else cbox(zb, ax0, 3.2, mid - dg, ax1, H, mid + dg, M.lv30_mesh, { sub: 4 });
    }
  };
  wall(ccx - hw, ccz - hd - t, ccx + hw, ccz - hd + t, 'x'); wall(ccx - hw, ccz + hd - t, ccx + hw, ccz + hd + t, 'x');
  wall(ccx - hw - t, ccz - hd, ccx - hw + t, ccz + hd, 'z'); wall(ccx + hw - t, ccz - hd, ccx + hw + t, ccz + hd, 'z');
  cbox(zb, ccx - hw, H, ccz - hd, ccx + hw, H + 0.08, ccz + hd, [null, null, M.lv30_mesh, M.lv30_mesh, null, null], { sub: 4, collide: false });
  // iron posts and frame
  for (let x = ccx - hw; x <= ccx + hw + 0.01; x += W / 3) for (const z of [ccz - hd, ccz + hd]) cbox(zb, x - 0.12, 0, z - 0.12, x + 0.12, H + 0.15, z + 0.12, M.lv30_iron, { sub: 0 });
  for (let z = ccz - hd + D / 3; z < ccz + hd - 0.1; z += D / 3) for (const x of [ccx - hw, ccx + hw]) cbox(zb, x - 0.12, 0, z - 0.12, x + 0.12, H + 0.15, z + 0.12, M.lv30_iron, { sub: 0 });
  cbox(zb, ccx - hw - 0.15, H, ccz - hd - 0.15, ccx + hw + 0.15, H + 0.3, ccz - hd + 0.15, M.lv30_iron, { sub: 0 });
  cbox(zb, ccx - hw - 0.15, H, ccz + hd - 0.15, ccx + hw + 0.15, H + 0.3, ccz + hd + 0.15, M.lv30_iron, { sub: 0 });
  // inside: perch trees, a feeder, empty nests, feathers
  const np = Math.max(1, Math.round(W * D / 70));
  for (let k = 0; k < np; k++) {
    const x = ccx + (hr(bi, bj, salt + k) - 0.5) * (W - 5), z = ccz + (hr(bi, bj, salt + 9 + k) - 0.5) * (D - 5);
    if (Math.hypot(x - ccx, z - ccz) < 2.6 && W > 8) continue;
    zb.prop('lv30_perch', x, 0, z, hr(k, salt, 210) * 6.28, { h: Math.min(H - 1, 5.5) });
  }
  if (W > 8) { zb.prop('lv30_feeder', ccx + hw * 0.5, 0, ccz - hd * 0.5, 0, {}); zb.prop('lv30_nest', ccx - hw * 0.5, 0, ccz + hd * 0.4, 0, {}); zb.prop('lv30_nest', ccx + hw * 0.3, 0, ccz + hd * 0.6, 0, {}); }
  else zb.prop('lv30_nest', ccx, 0, ccz + hd * 0.5, 0, {});
  feathers(zb, ccx - hw, ccz - hd, ccx + hw, ccz + hd, Math.round(W * D / 8), salt);
  if (owns(zb, ccx - hw - 0.6, ccz - 2.4)) zb.prop('lv30_sign', ccx - hw - 0.6, 0, ccz - 2.4, Math.PI / 2, { k: 'aviary' });
}

function quadrant(zb, qx, qz, bi, bj, kind) {
  const px = qx, pz = qz;
  const door = (x, z, rot, y) => levelDoor(zb, x, z, rot, y !== undefined ? { y } : {});
  switch (kind) {
    case 0: {           // a palm court
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.5; zb.prop('lv30_palm', px + Math.cos(a) * 5, 0, pz + Math.sin(a) * 5, 0, { h: 6 + hr(k, bi, 220 + bj) * 4 }); }
      for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; zb.prop('lv30_bush', px + Math.cos(a) * 8, 0, pz + Math.sin(a) * 8, 0, { kind: k % 3 }); }
      zb.prop('lv30_bench', px + 8.5, 0, pz, Math.PI / 2, {}); zb.prop('lv30_bench', px - 8.5, 0, pz, -Math.PI / 2, {});
      if (hr(bi, bj, 230 + px) < 0.5) door(px, pz + 1, 0);
      feathers(zb, px - 6, pz - 6, px + 6, pz + 6, 8, 11);
      break;
    }
    case 1: cage(zb, px, pz, 15, 15, 8, true, bi, bj, 240 + Math.floor(px)); door(px, pz + 0.5, 0); break;
    case 2: {           // a pond with a boardwalk
      zb.fill(Math.floor(px - 10), Math.floor(pz - 10), Math.ceil(px + 10), Math.ceil(pz + 10), (x, z, i) => {
        const d = Math.hypot(x + 0.5 - px, z + 0.5 - pz);
        if (d < 6.8) { zb.floor[i] = -0.65; zb.fmat[i] = M.lv30_moss; } else if (d < 9.2) { zb.floor[i] = -0.3; zb.fmat[i] = M.lv30_moss; }
      });
      cbox(zb, px - 10, -0.17, pz - 10, px + 10, -0.15, pz + 10, M.lv30_water, { alpha: 0.55, collide: false, skip: 0, sub: 3 });
      for (let k = 0; k < 12; k++) { const a = hr(k, bi, 250 + bj) * TAU, d = 1 + hr(k, bj, 251) * 5; zb.decal(px + Math.cos(a) * d, -0.14, pz + Math.sin(a) * d, 'up', 1.6, 1.6, 'lv30_lily', { rot: a }); }
      for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; zb.prop('lv30_bush', px + Math.cos(a) * 9.8, -0.3, pz + Math.sin(a) * 9.8, 0, { kind: 0 }); }
      cbox(zb, px - 10, -0.2, pz - 0.8, px + 10, 0.1, pz + 0.8, M.lv30_bark, { sub: 2 });
      door(px, pz, Math.PI / 2, 0.1);
      break;
    }
    case 3: {           // a misting plaza
      cbox(zb, px - 3, 0, pz - 3, px + 3, 0.7, pz + 3, M.lv30_stone, { sub: 2 });
      cbox(zb, px - 2.4, 0.7, pz - 2.4, px + 2.4, 0.8, pz + 2.4, M.lv30_moss, { sub: 2, collide: false });
      zb.prop('lv30_palm', px, 0.8, pz, 0, { h: 7 });
      for (const [dx, dz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) zb.prop('lv30_mister', px + dx, 0, pz + dz, 0, {});
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; zb.prop('lv30_bench', px + Math.cos(a) * 9, 0, pz + Math.sin(a) * 9, a + Math.PI / 2, {}); }
      zb.prop('lv30_sign', px + 4, 0, pz + 4, 0.5, { k: 'mist' });
      if (hr(bi, bj, 260 + px) < 0.5) door(px - 6, pz + 5, 0.7);
      break;
    }
    case 4: {           // a row of small cages
      for (let k = 0; k < 3; k++) cage(zb, px - 8 + k * 8, pz, 6.4, 8, 6, false, bi, bj, 270 + k);
      for (let k = 0; k < 3; k++) { cbox(zb, px - 8 + k * 8 - 1.2, 0, pz - 4.06, px - 8 + k * 8 + 1.2, 3.2, pz - 3.94, M.lv30_mesh, { sub: 4 }); }
      zb.prop('lv30_sign', px - 11.5, 0, pz - 5.2, 0, { k: 'feed' });
      door(px, pz + 8, Math.PI);
      break;
    }
    default: {          // the keepers' hut
      const W = 8, D = 6;
      cbox(zb, px - W / 2, 0, pz - D / 2, px + W / 2, 3.2, pz - D / 2 + 0.3, M.lv30_hut, { sub: 3 });
      cbox(zb, px - W / 2, 0, pz - D / 2, px - W / 2 + 0.3, 3.2, pz + D / 2, M.lv30_hut, { sub: 3 });
      cbox(zb, px + W / 2 - 0.3, 0, pz - D / 2, px + W / 2, 3.2, pz + D / 2, M.lv30_hut, { sub: 3 });
      cbox(zb, px - W / 2, 0, pz + D / 2 - 0.3, px - 1.2, 3.2, pz + D / 2, M.lv30_hut, { sub: 3 });
      cbox(zb, px + 1.2, 0, pz + D / 2 - 0.3, px + W / 2, 3.2, pz + D / 2, M.lv30_hut, { sub: 3 });
      cbox(zb, px - W / 2 - 0.4, 3.2, pz - D / 2 - 0.4, px + W / 2 + 0.4, 3.5, pz + D / 2 + 0.4, M.lv30_iron, { sub: 3 });
      door(px, pz + D / 2 - 1.2, Math.PI);
      zb.light(px, 2.6, pz, { color: [1.0, 0.95, 0.8], rad: 6, int: 0.6 });
      zb.prop('lv30_bench', px + 5.5, 0, pz + D / 2 + 0.5, Math.PI, {});
      zb.prop('lv30_sign', px - 5, 0, pz + D / 2 + 0.5, 0, { k: 'quiet' });
      for (let k = 0; k < 4; k++) zb.prop('lv30_bush', px + (k - 1.5) * 2.4, 0, pz - D / 2 - 0.9, 0, { kind: 1 });
    }
  }
}

function gen(zb) {
  const { x0, z0, x1, z1 } = zb;
  const bi = Math.round(x0 / P), bj = Math.round(z0 / P);
  const cx = x0 + 32, cz = z0 + 32;
  openGround(zb, M.lv30_moss, 0);
  zb.noConnectivity = true;
  zb.fill(x0, z0, x1, z1, (x, z, i) => { if (Math.abs(x + 0.5 - cx) < PW || Math.abs(z + 0.5 - cz) < PW) zb.fmat[i] = M.lv30_stone; });
  // the roof: pale glass on a grid of white iron
  zb.box(x0, ROOF, z0, x1, ROOF + 0.12, z1, [null, null, null, M.lv30_glass, null, null], { alpha: 0.16, sub: 8, collide: false });
  for (let t = 4; t < P; t += 8) {
    cbox(zb, x0, ROOF - 0.5, z0 + t - 0.18, x1, ROOF, z0 + t + 0.18, M.lv30_iron, { sub: 16, collide: false });
    cbox(zb, x0 + t - 0.18, ROOF - 0.5, z0, x0 + t + 0.18, ROOF, z1, M.lv30_iron, { sub: 16, collide: false });
  }
  // arches along both promenades, palms and ferns along their edges
  for (let t = 4; t < P; t += 8) {
    if (Math.abs(x0 + t - cx) > PW + 1.5) zb.prop('lv30_arch', x0 + t, 0, cz, Math.PI / 2, {});
    if (Math.abs(z0 + t - cz) > PW + 1.5) zb.prop('lv30_arch', cx, 0, z0 + t, 0, {});
  }
  for (let t = 1; t < P; t += 6) {
    for (const s of [-1, 1]) {
      const a = [x0 + t + hr(t, bi, 301) * 2, cz + s * (PW + 1.1)], b = [cx + s * (PW + 1.1), z0 + t + hr(t, bj, 302) * 2];
      for (const [px, pz, k] of [[a[0], a[1], 1], [b[0], b[1], 2]]) {
        if (Math.abs(px - cx) < PW + 2 && Math.abs(pz - cz) < PW + 2) continue;
        const u = hr(Math.floor(px), Math.floor(pz), 310);
        if (u < 0.45) zb.prop('lv30_palm', px, 0, pz, 0, { h: 5 + hr(Math.floor(px), Math.floor(pz), 311) * 5 });
        else zb.prop('lv30_bush', px, 0, pz, 0, { kind: Math.floor(u * 7) % 3 });
        void k;
      }
    }
  }
  // the quadrants
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const kind = Math.floor(hr(bi * 2 + (sx > 0 ? 1 : 0), bj * 2 + (sz > 0 ? 1 : 0), 1) * 6);
    quadrant(zb, cx + sx * 18, cz + sz * 18, bi, bj, (bi === 0 && bj === 0 && sx > 0 && sz < 0) ? 2 : kind);
  }
  // the crossing: a fan turns high up, sun falls through the roof grid
  zb.dynamic('lv30_fan', cx, 11.0, cz, 0, {}, { spin: 2.4 });
  zb.emitter(cx, 11, cz, 'lv30_fan', { vol: 0.8, rad: 36 });
  for (let t = 0; t < P; t += 16) {
    zb.decal(x0 + t + 8, 0, cz, 'up', 16, 16, 'lv30_sun', { lit: false, glow: 0.3 });
    zb.decal(cx, 0, z0 + t + 8, 'up', 16, 16, 'lv30_sun', { lit: false, glow: 0.3 });
  }
  for (let k = 0; k < 14; k++) {
    const x = x0 + 2 + hr(k, bi, 320 + bj) * 60, z = z0 + 2 + hr(k, bj, 321 + bi) * 60;
    if (Math.abs(x - cx) < PW + 0.5 || Math.abs(z - cz) < PW + 0.5) feathers(zb, x - 0.1, z - 0.1, x + 0.1, z + 0.1, 1, 400 + k);
  }
  // misters on the promenade, hanging vines, drifting mist
  for (const [mx, mz] of [[x0 + 12, cz + PW + 0.6], [x1 - 12, cz - PW - 0.6], [cx + PW + 0.6, z0 + 12], [cx - PW - 0.6, z1 - 12]]) if (hr(Math.floor(mx), Math.floor(mz), 330) < 0.7) zb.prop('lv30_mister', mx, 0, mz, 0, {});
  for (let k = 0; k < 6; k++) { const x = x0 + 4 + hr(k, bi, 340) * 56, z = z0 + 4 + hr(k, bj, 341) * 56; zb.prop('lv30_vine', x, ROOF - 7, z, 0, { h: 7 }); }
  for (let k = 0; k < 3; k++) {
    const x = x0 + 4 + hr(k, bi, 350) * 40, z = z0 + 4 + hr(k, bj, 351) * 40;
    cbox(zb, x, 0.9 + k * 0.6, z, x + 18, 1.0 + k * 0.6, z + 18, [null, null, M.lv30_mistm, null, null, null], { alpha: 0.3, sub: 6, collide: false });
  }
}

defineZone('lv30_glasshouse', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.6, 0.66, 0.58],
    env: env({ fog: [0.72, 0.84, 0.78], fogNear: 8, fogFar: 62, hum: 0, hvac: 0.2, reverb: 'hall', tone: 'lv30_humid' }),
  }),
  gen,
});

// the misting cycle: the hiss swells and the house fills with white
function script(ctx, dt) {
  const s = ctx.state, g = ctx.game;
  if (s.phase === undefined) { s.phase = 'clear'; s.t = 40 + Math.random() * 30; s.k = 0; }
  s.t -= dt;
  const target = s.phase === 'mist' ? 1 : 0;
  s.k += (target - s.k) * Math.min(1, dt * 0.35);
  g.look = { fogNear: 8 - 6 * s.k, fogFar: 62 - 36 * s.k };
  if (s.t > 0) return;
  if (s.phase === 'clear') {
    s.phase = 'mist'; s.t = 18 + Math.random() * 14;
    g.audioCall('play', 'lv30_mist_on', undefined, undefined, undefined, { vol: 0.8 });
  } else { s.phase = 'clear'; s.t = 60 + Math.random() * 80; }
}

defineLevel(N, {
  name: 'THE AVIAN CONSERVATORY',
  zoneType: 'lv30_glasshouse',
  zoneSize: P,
  entry: { x: 6.5, y: 0, z: 32.5, yaw: Math.PI / 2 },
  doorDensity: 0.3,
  viewRadius: 4,
  sky: { top: [0.66, 0.8, 0.82], horizon: [0.84, 0.92, 0.88], ground: [0.5, 0.62, 0.55], curve: 0.5, sun: { dir: [0.35, 0.8, -0.3], color: [1.0, 0.97, 0.82], size: 0.05, halo: 0.45 } },
  light: { phoneRadius: 3, phoneIntensity: 0.15 },
  script,
});
void pnoise; void noise; void CF; void signTex;
