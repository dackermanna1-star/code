// Level 69: The Abandoned Carnival. A fairground at dusk with no staff: strings of coloured bulbs
// chase along the avenues, a carousel and a swing ride turn for nobody, teacups spin, a giant
// wheel stands lit over the midway, and a band organ plays faintly somewhere. The loudspeakers
// carry only crackle and chimes. Endless: 64 m blocks, one attraction each, between avenues.
import { defineTexture, signTex } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { LEVEL_ZONE, defineLevel, openGround, cbox, owns, hr, levelDoor, env, M, FACE, noise } from './kit.js';
import { glowMat, animMaterial, animKeep, mulc, TAU, pickH } from './g07_kit.js';

const N = 69;
const B = 64, AV = 5;            // block size, half width of the avenues
const COLS = [[0.95, 0.32, 0.36], [0.2, 0.75, 0.78], [1.0, 0.82, 0.3], [0.62, 0.4, 0.85], [0.95, 0.9, 0.78], [0.3, 0.78, 0.4], [0.95, 0.55, 0.25], [0.35, 0.5, 0.95]];

// ------------------------------------------------------------------ textures
defineTexture('lv69_boards', (p) => {
  p.fill([140, 98, 66]); p.noise(6, 0.1, 3);
  for (let y = 0; y < 64; y += 8) { p.rect(0, y, 64, 1, [52, 34, 22]); p.rect(((y * 5) % 64), y, 1, 8, [52, 34, 22]); }
  p.speckle(90, [150, 112, 80], 0.2, 0.5); p.grain(0.05);
}, 10);
defineTexture('lv69_dirt', (p) => {
  p.fill([108, 80, 60]); p.noise(5, 0.16, 3); p.grain(0.08);
  p.speckle(120, [150, 120, 70], 0.3, 0.7); p.speckle(80, [44, 32, 26], 0.4, 0.8);
}, 10);
defineTexture('lv69_grass', (p) => {
  p.fill([30, 62, 40]); p.noise(7, 0.16, 3); p.speckle(200, [48, 90, 52], 0.3, 0.7); p.speckle(100, [18, 40, 28], 0.3, 0.7);
}, 8);
defineTexture('lv69_flat', (p) => { p.fill([236, 232, 224]); p.noise(4, 0.05, 2); p.grain(0.03); p.rect(0, 0, 64, 2, [252, 250, 246], 0.5); }, 6);
defineTexture('lv69_gold', (p) => { p.fill([210, 168, 70]); p.noise(4, 0.15, 2); p.rect(0, 0, 64, 4, [250, 222, 130]); p.rect(0, 60, 64, 4, [120, 84, 30]); }, 8);
defineTexture('lv69_steel', (p) => { p.fill([150, 154, 164]); p.noise(5, 0.12, 2); p.rect(0, 0, 64, 3, [214, 218, 226]); }, 8);
defineTexture('lv69_mirror', (p) => {
  p.fill([170, 188, 196]);
  for (let x = 0; x < 64; x += 16) { p.rect(x, 0, 14, 64, [196, 214, 222]); p.rect(x + 2, 6, 3, 52, [240, 250, 255]); p.rect(x + 14, 0, 2, 64, [210, 168, 70]); }
}, 8);
defineTexture('lv69_pole', (p) => {
  p.fill([236, 232, 224]);
  for (let y = 0; y < 64; y += 16) p.rect(0, y, 64, 8, [196, 56, 60]);
  p.noise(4, 0.06, 2);
}, 6);
defineTexture('lv69_harlequin', (p) => {
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) p.rect(tx * 16, ty * 16, 16, 16, (tx + ty) % 2 ? [186, 52, 62] : [232, 222, 200]);
  p.map((x, y, c) => { const dx = Math.abs((x % 16) - 8), dy = Math.abs((y % 16) - 8); return dx + dy < 8 ? c : [c[0] * 0.55, c[1] * 0.55, c[2] * 0.6]; });
  p.noise(4, 0.06, 2);
}, 10);
defineTexture('lv69_awning', (p) => {
  for (let x = 0; x < 64; x += 16) { p.rect(x, 0, 8, 64, [190, 54, 60]); p.rect(x + 8, 0, 8, 64, [232, 224, 204]); }
  p.rect(0, 56, 64, 8, [110, 30, 36], 0.4); p.noise(4, 0.07, 2);
}, 8);
defineTexture('lv69_awning2', (p) => {
  for (let x = 0; x < 64; x += 16) { p.rect(x, 0, 8, 64, [40, 120, 130]); p.rect(x + 8, 0, 8, 64, [232, 214, 140]); }
  p.rect(0, 56, 64, 8, [20, 60, 70], 0.4); p.noise(4, 0.07, 2);
}, 8);
defineTexture('lv69_target', (p) => {
  p.fill([226, 218, 196]);
  for (let k = 0; k < 4; k++) { p.disc(32, 32, 28 - k * 7, k % 2 ? [226, 218, 196] : [190, 50, 56]); }
  p.disc(32, 32, 3, [30, 24, 24]);
}, 6);
defineTexture('lv69_organ', (p) => {
  p.fill([92, 30, 38]); p.noise(4, 0.1, 2);
  for (let x = 4; x < 64; x += 8) { const h = 22 + ((x * 7) % 22); p.rect(x, 4, 5, h, [226, 184, 84]); p.rect(x, 4, 1, h, [250, 226, 140]); p.rect(x + 4, 4, 1, h, [140, 100, 34]); p.disc(x + 2, 6 + h, 2, [60, 20, 20]); }
  p.rect(0, 52, 64, 12, [60, 18, 24]); p.rect(0, 52, 64, 2, [210, 168, 70]);
  p.disc(16, 58, 4, [226, 184, 84]); p.disc(48, 58, 4, [226, 184, 84]);
}, 12);
defineTexture('lv69_horn', (p) => { p.fill([40, 40, 46]); p.disc(32, 32, 28, [150, 150, 158]); p.disc(32, 32, 20, [60, 60, 68]); p.disc(32, 32, 9, [20, 20, 24]); }, 6);
defineTexture('lv69_lamp', (p) => { p.fill([255, 214, 150]); p.disc(32, 32, 24, [255, 244, 210]); }, 4);
defineTexture('lv69_cans', (p) => {
  p.fill([40, 30, 30]);
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { p.rect(tx * 16 + 2, ty * 16 + 1, 12, 14, [(tx * 53 + ty * 31) % 2 ? 220 : 70, 90 + (tx * 40) % 120, 80 + ty * 40]); p.rect(tx * 16 + 2, ty * 16 + 1, 12, 3, [240, 240, 230]); }
}, 12);
defineTexture('lv69_balloons', (p) => {
  p.fill([34, 24, 40]);
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) p.disc(tx * 16 + 8 + (ty % 2) * 4, ty * 16 + 8, 6, [[230, 70, 80], [240, 200, 70], [70, 190, 200], [150, 100, 220]][(tx + ty) % 4]);
}, 10);
defineTexture('lv69_pool', (p) => {
  p.fill([255, 190, 120]); p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const d = Math.hypot(x - 31.5, y - 31.5) / 32; p.a[y * 64 + x] = d >= 1 ? 0 : Math.round(255 * Math.pow(1 - d, 1.5) * 0.7); }
}, 4);
// strings of bulbs: a ribbon with four bulbs per tile; the animated set lights one in four in turn
const BULB = [[255, 120, 140], [255, 214, 100], [120, 230, 220], [200, 150, 255]];
function bulbRibbon(f, anim) {
  return (p) => {
    p.fill([20, 14, 24]); p.clearAlpha(0);
    p.rectA(0, 30, 64, 4, 255); p.rect(0, 30, 64, 4, [50, 40, 46]);
    for (let k = 0; k < 4; k++) {
      const lit = anim ? k === f : true, col = lit ? BULB[(k + (anim ? 0 : f)) % 4] : [88, 62, 70];
      const cx = k * 16 + 8;
      for (let y = 8; y < 56; y++) for (let x = cx - 6; x <= cx + 6; x++) {
        const d = Math.hypot((x - cx) / 6, (y - 32) / 21);
        if (d <= 1) { p.set(x, y, d < 0.45 && lit ? [255, 255, 240] : col); p.alpha(x, y, 255); }
      }
    }
  };
}
animMaterial('lv69_chase', 'lv69_chase', (p, f) => bulbRibbon(f, true)(p), { s: 1, su: 1.6, sv: 0.4, glow: 1.5 });
defineTexture('lv69_bulbs', bulbRibbon(0, false), 12);
// the rim of the wheel and the edges of things: a rod pattern, bulbs along its length
animMaterial('lv69_chaser', 'lv69_chaser', (p, f) => {
  p.fill([30, 22, 34]);
  for (let k = 0; k < 4; k++) {
    const lit = k === f, col = lit ? [255, 244, 200] : BULB[k];
    p.rect(0, k * 16 + 2, 64, 12, lit ? col : [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7]);
  }
}, { s: 1, su: 1, sv: 0.5, glow: 1.7 });
defineTexture('lv69_sign_tickets', signTex(['TICKETS'], [150, 40, 50], [250, 232, 190], 1), 8);
defineTexture('lv69_sign_games', signTex(['GAMES', 'OF', 'SKILL'], [30, 100, 110], [250, 232, 190], 1), 8);
defineTexture('lv69_sign_fun', signTex(['FUN', 'HOUSE'], [110, 50, 140], [255, 224, 120], 2), 8);
defineTexture('lv69_sign_welcome', signTex(['WELCOME'], [186, 52, 62], [255, 236, 170], 1), 8);
defineTexture('lv69_sign_rides', signTex(['RIDES'], [40, 70, 150], [255, 236, 170], 2), 8);
defineTexture('lv69_sign_closed', signTex(['CLOSED'], [60, 30, 40], [220, 190, 150], 1), 8);
defineTexture('lv69_sign_ride', signTex(['ALL', 'ABOARD'], [200, 150, 50], [60, 20, 30], 1), 8);
defineTexture('lv69_sign_open', signTex(['OPEN'], [40, 110, 70], [255, 240, 200], 2), 8);

// ------------------------------------------------------------------ materials
defineMaterial('lv69_boards', 'lv69_boards', { s: 1.6, surf: 'wood' });
defineMaterial('lv69_dirt', 'lv69_dirt', { s: 2.4, surf: 'grass' });
defineMaterial('lv69_grass', 'lv69_grass', { s: 2.4, surf: 'grass' });
defineMaterial('lv69_flat', 'lv69_flat', { s: 2, surf: 'wood' });
defineMaterial('lv69_gold', 'lv69_gold', { s: 1.5, surf: 'metal' });
defineMaterial('lv69_steel', 'lv69_steel', { s: 1.5, surf: 'metal' });
defineMaterial('lv69_mirror', 'lv69_mirror', { s: 4, surf: 'metal' });
defineMaterial('lv69_pole', 'lv69_pole', { s: 2, surf: 'metal' });
defineMaterial('lv69_harlequin', 'lv69_harlequin', { s: 4, surf: 'wood' });
defineMaterial('lv69_awning', 'lv69_awning', { s: 4, surf: 'carpet' });
defineMaterial('lv69_awning2', 'lv69_awning2', { s: 4, surf: 'carpet' });
defineMaterial('lv69_target', 'lv69_target', { s: 1, surf: 'wood' });
defineMaterial('lv69_organ', 'lv69_organ', { s: 4, surf: 'wood' });
defineMaterial('lv69_horn', 'lv69_horn', { s: 1, surf: 'metal' });
defineMaterial('lv69_cans', 'lv69_cans', { s: 2, surf: 'metal' });
defineMaterial('lv69_balloons', 'lv69_balloons', { s: 2, surf: 'wood' });
glowMat('lv69_lamp', 'lv69_lamp', 1.1, { s: 1, surf: 'metal' });
glowMat('lv69_bulbs', 'lv69_bulbs', 1.1, { su: 1.6, sv: 0.4 });
for (const k of ['tickets', 'games', 'fun', 'welcome', 'rides', 'closed', 'ride', 'open']) glowMat('lv69_sign_' + k, 'lv69_sign_' + k, 0.9, { s: 1, surf: 'wood' });

// ------------------------------------------------------------------ geometry helpers (props)
const cosA = Math.cos, sinA = Math.sin;
// side surface of a cone/frustum: radius r0 at y0, r1 at y1; style per segment
function frustum(mb, cx, y0, cz, r0, y1, r1, n, stFn, rep = 1) {
  const h = y1 - y0, slope = r0 - r1, nl = Math.hypot(h, slope) || 1;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, am = (a0 + a1) / 2;
    const st = stFn(i);
    mb.quad([cx + cosA(a1) * r0, y0, cz + sinA(a1) * r0, cx + cosA(a0) * r0, y0, cz + sinA(a0) * r0, cx + cosA(a0) * r1, y1, cz + sinA(a0) * r1, cx + cosA(a1) * r1, y1, cz + sinA(a1) * r1],
      [cosA(am) * h / nl, slope / nl, sinA(am) * h / nl], st, [rep, 1, 0, 1, 0, 0, rep, 0]);
  }
}
const tint = (c, m = 1) => ({ tint: mulc(c, m) });
const flat = (c, m = 1) => S('lv69_flat', tint(c, m));

// ------------------------------------------------------------------ props
// the carousel: turns as one piece (a dynamic)
defineProp('lv69_carousel', {
  build(mb) {
    const wood = S('lv69_boards'), gold = S('lv69_gold'), chase = S('lv69_chase'), mirror = S('lv69_mirror'), brass = S('lv69_gold');
    const R = 8.4;
    mb.cyl(0, 0.3, 0, R, 0.32, 14, wood, 3);
    mb.cyl(0, 0.25, 0, R + 0.25, 0.14, 14, gold, 3);
    mb.cyl(0, 0.6, 0, 1.8, 5.6, 12, mirror, 1);
    for (let k = 0; k < 12; k++) mb.cyl(cosA((k / 12) * TAU) * 1.85, 0.6, sinA((k / 12) * TAU) * 1.85, 0.12, 5.6, 4, brass, 0);
    for (const rr of [4.0, 6.9]) {
      const n = rr > 5 ? 12 : 8;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + (rr > 5 ? 0.13 : 0), x = cosA(a) * rr, z = sinA(a) * rr;
        mb.cyl(x, 0.6, z, 0.07, 5.2, 4, brass, 1);
        const col = COLS[(k + (rr > 5 ? 3 : 0)) % COLS.length];
        // a seat on every pole: a chariot, facing along the ring
        const fx = -sinA(a), fz = cosA(a);
        const px = (u, v) => [x + fx * u + cosA(a) * v, z + fz * u + sinA(a) * v];
        const [x0, z0] = px(-0.8, -0.4), [x1, z1] = px(0.8, 0.4);
        mb.box(Math.min(x0, x1), 1.1 + (k % 2) * 0.5, Math.min(z0, z1), Math.max(x0, x1), 1.45 + (k % 2) * 0.5, Math.max(z0, z1), flat(col));
        mb.box(Math.min(x0, x1) - 0.05, 1.45 + (k % 2) * 0.5, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, 2.0 + (k % 2) * 0.5, Math.max(z0, z1) + 0.05, flat(col, 0.7));
      }
    }
    mb.cyl(0, 5.8, 0, R + 0.3, 0.8, 14, S('lv69_flat', tint([0.9, 0.3, 0.34])), 3);
    mb.cyl(0, 5.55, 0, R + 0.35, 0.4, 14, chase, 0);
    frustum(mb, 0, 6.6, 0, R + 0.5, 10.2, 0.1, 14, (i) => flat(COLS[(i % 2) ? 4 : 0], 0.95));
    mb.cyl(0, 10.1, 0, 0.12, 1.4, 4, gold, 1);
    mb.box(-0.3, 11.2, -0.3, 0.3, 11.5, 0.3, S('lv69_lamp'));
  },
  boxes: [[-7.4, 0, -7.4, 7.4, 4.0, 7.4]],
});

// the swing ride: a tower, and a crown with seats on chains (the crown is a dynamic)
defineProp('lv69_swing_tower', {
  build(mb) {
    const steel = S('lv69_steel'), chase = S('lv69_chase'), wood = S('lv69_boards');
    mb.cyl(0, 0, 0, 3.4, 0.35, 12, wood, 3);
    mb.cyl(0, 0.35, 0, 0.9, 15.5, 8, steel, 1);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.78; mb.rod(cosA(a) * 2.2, 0.35, sinA(a) * 2.2, cosA(a) * 0.5, 7, sinA(a) * 0.5, 0.12, 4, steel); }
    mb.rod(0, 0.4, 0, 0, 15.8, 0, 0.0, 4, steel);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; mb.box(cosA(a) * 0.95 - 0.08, 0.6, sinA(a) * 0.95 - 0.08, cosA(a) * 0.95 + 0.08, 15.4, sinA(a) * 0.95 + 0.08, chase, { sub: 0 }); }
  },
  boxes: [[-1, 0, -1, 1, 16, 1]],
});
defineProp('lv69_swing_crown', {
  build(mb) {
    const steel = S('lv69_steel'), chase = S('lv69_chase');
    mb.cyl(0, 14.6, 0, 4.4, 0.5, 12, S('lv69_flat', tint([0.95, 0.4, 0.45])), 3);
    mb.cyl(0, 14.9, 0, 4.5, 0.3, 12, chase, 0);
    frustum(mb, 0, 15.1, 0, 4.4, 17.8, 0.1, 12, (i) => flat(COLS[i % 2 ? 4 : 1], 0.95));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU, r0 = 4.2, r1 = 7.6;
      const sx = cosA(a) * r1, sz = sinA(a) * r1;
      mb.rod(cosA(a) * r0, 14.6, sinA(a) * r0, sx, 6.9, sz, 0.04, 4, steel);
      mb.rod(cosA(a) * (r0 - 0.15), 14.6, sinA(a) * (r0 - 0.15), sx, 6.9, sz, 0.04, 4, steel);
      const col = COLS[(k * 3) % COLS.length];
      mb.box(sx - 0.38, 6.3, sz - 0.38, sx + 0.38, 6.55, sz + 0.38, flat(col));
      const bx = sx + cosA(a) * 0.38, bz = sz + sinA(a) * 0.38;
      mb.box(bx - 0.06, 6.55, bz - 0.4, bx + 0.06, 7.3, bz + 0.4, flat(col, 0.7));
    }
  },
});
// a teacup: spins on the spot
defineProp('lv69_cup', {
  build(mb, p) {
    const col = COLS[(p.opts.c || 0) % COLS.length];
    mb.cyl(0, 0.1, 0, 1.7, 0.18, 10, S('lv69_gold'), 3);
    mb.cyl(0, 0.28, 0, 1.2, 1.0, 8, flat(col), 2);
    mb.cyl(0, 0.9, 0, 1.15, 0.38, 8, flat(col, 0.4), 1);
    mb.cyl(0, 1.26, 0, 1.3, 0.1, 8, S('lv69_gold'), 3);
    mb.box(1.15, 0.7, -0.12, 1.75, 1.15, 0.12, flat(col, 0.8));
    mb.cyl(0, 0.3, 0, 0.12, 1.0, 4, S('lv69_gold'), 1);
  },
  boxes: [[-1.4, 0, -1.4, 1.4, 1.3, 1.4]],
});
// the big wheel: axle along local z, the rim a ring of chasing bulbs, gondolas hung from it
defineProp('lv69_wheel', {
  build(mb) {
    const R = 16.5, H = 22, ZF = 1.5;
    const steel = S('lv69_steel'), rim = S('lv69_chaser'), dark = S('lv69_steel', { tint: [0.55, 0.55, 0.62] });
    const SEG = 28;
    const pt = (k, z, rr = R) => [cosA((k / SEG) * TAU) * rr, H + sinA((k / SEG) * TAU) * rr, z];
    for (const z of [-ZF, ZF]) {
      for (let k = 0; k < SEG; k++) {
        const a = pt(k, z), b = pt(k + 1, z);
        mb.rod(a[0], a[1], a[2], b[0], b[1], b[2], 0.32, 4, rim);
      }
      for (let k = 0; k < SEG; k += 2) { const a = pt(k, z); mb.rod(0, H, z, a[0], a[1], a[2], 0.07, 4, steel); }
      for (let k = 0; k < SEG; k += 4) { const a = pt(k, z, R * 0.5), b = pt(k + 4, z, R * 0.5); mb.rod(a[0], a[1], a[2], b[0], b[1], b[2], 0.06, 4, steel); }
    }
    for (let k = 0; k < SEG; k += 2) { const a = pt(k, -ZF), b = pt(k, ZF); mb.rod(a[0], a[1], a[2], b[0], b[1], b[2], 0.1, 4, steel); }
    mb.cyl(0, H - 1.3, 0, 1.3, 2.6, 8, dark, 3);
    mb.rod(0, H, -4.2, 0, H, 4.2, 0.35, 6, steel);
    // gondolas
    const NG = 14;
    for (let k = 0; k < NG; k++) {
      const a = (k / NG) * TAU + 0.11, gx = cosA(a) * R, gy = H + sinA(a) * R;
      const col = COLS[(k * 3 + 1) % COLS.length];
      mb.rod(gx, gy, -ZF, gx, gy - 0.9, -ZF, 0.05, 4, steel); mb.rod(gx, gy, ZF, gx, gy - 0.9, ZF, 0.05, 4, steel);
      mb.box(gx - 1.0, gy - 2.5, -ZF - 0.2, gx + 1.0, gy - 0.9, ZF + 0.2, [flat(col), flat(col), flat(col, 0.5), flat(col, 0.4), flat(col, 0.8), flat(col, 0.8)]);
      mb.box(gx - 0.85, gy - 2.1, -ZF - 0.22, gx + 0.85, gy - 1.2, -ZF - 0.2, S('lv69_lamp'));
      mb.box(gx - 0.85, gy - 2.1, ZF + 0.2, gx + 0.85, gy - 1.2, ZF + 0.22, S('lv69_lamp'));
    }
    // two A-frames
    for (const z of [-4.1, 4.1]) {
      for (const sx of [-1, 1]) {
        mb.rod(sx * 0.3, H - 0.3, z * 0.97, sx * 9.2, 0, z * 1.03, 0.4, 6, steel);
        mb.rod(sx * 8.6, 0.3, z * 1.03, sx * 8.6, 0.3, z * 1.03 - Math.sign(z) * 0.01, 0.0, 4, steel);
      }
      mb.rod(-5.5, 7.8, z, 5.5, 7.8, z, 0.18, 4, steel);
      mb.rod(-3.2, 14.5, z, 3.2, 14.5, z, 0.14, 4, steel);
    }
    mb.rod(-9.2, 0.3, 4.1, -9.2, 0.3, -4.1, 0.2, 4, steel); mb.rod(9.2, 0.3, 4.1, 9.2, 0.3, -4.1, 0.2, 4, steel);
  },
  boxes: [[-9.8, 0, -4.8, -8.6, 2.5, 4.8], [8.6, 0, -4.8, 9.8, 2.5, 4.8]],
});
// a game booth on the midway (front faces local -z)
defineProp('lv69_booth', {
  build(mb, p) {
    const col = COLS[(p.opts.c || 0) % COLS.length], kind = p.opts.kind || 0;
    const wood = S('lv69_boards'), aw = S(kind % 2 ? 'lv69_awning2' : 'lv69_awning');
    const W = 3.6, D = 2.2;
    mb.box(-W / 2, 0, D / 2 - 0.15, W / 2, 2.8, D / 2, flat(col, 0.55));
    for (const s of [-1, 1]) mb.box(s * W / 2 - 0.08, 0, -D / 2, s * W / 2 + 0.08, 3.1, D / 2, flat(col, 0.7));
    mb.box(-W / 2, 0, -D / 2 + 0.2, W / 2, 1.0, -D / 2 + 0.55, flat(col));
    mb.box(-W / 2 - 0.05, 1.0, -D / 2 + 0.1, W / 2 + 0.05, 1.08, -D / 2 + 0.7, wood);
    // the prizes: a wall of targets, tins or balloons
    const wall = kind % 3 === 0 ? S('lv69_target') : kind % 3 === 1 ? S('lv69_cans') : S('lv69_balloons');
    mb.box(-W / 2 + 0.1, 1.1, D / 2 - 0.2, W / 2 - 0.1, 2.7, D / 2 - 0.15, [null, null, null, null, wall, null], { uv: ['world', 'world', 'world', 'world', [0, 0, 2, 1], 'world'] });
    // slanted awning
    mb.poly4([-W / 2 - 0.2, 2.9, D / 2], [W / 2 + 0.2, 2.9, D / 2], [W / 2 + 0.2, 2.35, -D / 2 - 0.6], [-W / 2 - 0.2, 2.35, -D / 2 - 0.6], aw, [0, 0, 3, 0, 3, 1, 0, 1]);
    mb.poly4([-W / 2 - 0.2, 2.35, -D / 2 - 0.6], [W / 2 + 0.2, 2.35, -D / 2 - 0.6], [W / 2 + 0.2, 2.9, D / 2], [-W / 2 - 0.2, 2.9, D / 2], aw, [0, 1, 3, 1, 3, 0, 0, 0]);
    mb.box(-W / 2 - 0.2, 2.2, -D / 2 - 0.62, W / 2 + 0.2, 2.35, -D / 2 - 0.55, S('lv69_chase'), { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 2.25, 1]] });
    mb.box(-0.9, 3.15, D / 2 - 0.3, 0.9, 4.05, D / 2 - 0.2, [null, null, null, null, null, T(['lv69_sign_games', 'lv69_sign_tickets', 'lv69_sign_open'][kind % 3], { lit: false, flags: VF.FULLBRIGHT, color: [0.08, 0.08, 0.08], flk: [0.9, 0.9, 0.9] })], { uv: 'fit' });
  },
  boxes: [[-1.9, 0, -1.2, 1.9, 1.2, 1.1], [-1.9, 0, 0.9, 1.9, 3, 1.1]],
});
// the band organ: a fairground organ of gilt pipes against a red cabinet
defineProp('lv69_band_organ', {
  build(mb) {
    const org = S('lv69_organ'), gold = S('lv69_gold'), red = S('lv69_flat', tint([0.55, 0.15, 0.2]));
    mb.box(-2.4, 0, -0.7, 2.4, 3.6, 0.5, [red, red, red, null, org, red], { uv: ['world', 'world', 'world', 'world', [0, 0, 1, 1], 'world'] });
    mb.box(-2.5, 3.6, -0.8, 2.5, 3.9, 0.6, gold);
    for (const s of [-1, 1]) mb.cyl(s * 2.65, 0, -0.1, 0.35, 4.2, 8, gold, 1);
    frustum(mb, 0, 3.9, -0.1, 1.5, 4.8, 0.1, 6, () => gold);
    mb.box(-0.6, 0.2, -1.0, 0.6, 1.0, -0.7, S('lv69_flat', tint([0.3, 0.2, 0.15])));
  },
  boxes: [[-2.6, 0, -1.0, 2.6, 4.2, 0.6]],
  emitter: { snd: 'lv69_organ', y: 2.2, vol: 0.9, rad: 40 },
});
// a big top (not to be entered): striped canvas, a roof of cone, pennants
defineProp('lv69_tent', {
  build(mb) {
    const R = 11, n = 12;
    frustum(mb, 0, 0, 0, R, 6.5, R, n, (i) => (i % 2 ? S('lv69_awning') : S('lv69_awning2')), 1);
    frustum(mb, 0, 6.5, 0, R + 0.8, 7.0, R + 0.8, n, () => S('lv69_flat', tint([0.95, 0.9, 0.78])), 1);
    frustum(mb, 0, 7.0, 0, R + 0.8, 14.5, 0.1, n, (i) => (i % 2 ? S('lv69_awning') : S('lv69_awning2')), 1);
    mb.cyl(0, 14.4, 0, 0.12, 3, 4, S('lv69_steel'), 1);
    mb.box(0.1, 16.2, -0.04, 1.9, 17.2, 0.04, S('lv69_flat', tint([0.95, 0.32, 0.36])));
    // lit entrance
    mb.box(-1.6, 0, -R - 0.1, 1.6, 3.6, -R + 0.1, [null, null, null, null, null, S('lv69_sign_open', { })]);
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU + 0.26; mb.cyl(cosA(a) * (R + 0.9), 0, sinA(a) * (R + 0.9), 0.14, 6.5, 4, S('lv69_pole'), 1); }
  },
  boxes: [[-9.5, 0, -9.5, 9.5, 6, 9.5]],
});
// a loudspeaker horn on a pole
defineProp('lv69_speaker', {
  build(mb) {
    const st = S('lv69_steel');
    mb.box(-0.06, 0, -0.06, 0.06, 5.2, 0.06, st);
    for (const s of [-1, 1]) { mb.box(-0.4, 5.0, s * 0.45 - 0.2, 0.4, 5.6, s * 0.45 + 0.2, S('lv69_horn')); mb.box(-0.4, 5.0, s * 0.45 - 0.22, 0.4, 5.6, s * 0.45 - 0.2 + 0.4, [null, null, null, null, T('lv69_horn'), null], { uv: 'fit' }); }
  },
  boxes: [[-0.15, 0, -0.15, 0.15, 2, 0.15]],
  emitter: { snd: 'lv69_pa_hiss', y: 5.2, vol: 0.5, rad: 22 },
});
// a fortune machine: put a coin in (nothing happens), read the card that is already in the slot
defineProp('lv69_fortune', {
  build(mb) {
    const gold = S('lv69_gold'), red = S('lv69_flat', tint([0.55, 0.15, 0.3]));
    mb.box(-0.5, 0, -0.4, 0.5, 1.2, 0.4, red);
    mb.box(-0.55, 1.2, -0.45, 0.55, 1.3, 0.45, gold);
    mb.box(-0.45, 1.3, -0.35, 0.45, 2.1, 0.35, [S('lv69_mirror'), S('lv69_mirror'), null, null, S('lv69_mirror'), S('lv69_mirror')]);
    mb.box(-0.5, 2.1, -0.4, 0.5, 2.4, 0.4, gold);
    mb.box(-0.2, 0.7, -0.45, 0.2, 0.8, -0.4, S('lv69_lamp'));
  },
  boxes: [[-0.55, 0, -0.45, 0.55, 2.4, 0.45]],
  use: 'note',
});

// an arch over an avenue with a sign and a ribbon of chasing bulbs (local x across the avenue)
defineProp('lv69_arch', {
  build(mb, p) {
    const steel = S('lv69_pole'), chase = S('lv69_chase');
    const hw = AV + 0.4, sign = ['lv69_sign_welcome', 'lv69_sign_rides', 'lv69_sign_games', 'lv69_sign_fun', 'lv69_sign_ride'][(p.opts.k || 0) % 5];
    for (const s of [-1, 1]) mb.box(s * hw - 0.3, 0, -0.3, s * hw + 0.3, 8.6, 0.3, steel);
    mb.box(-hw, 8.6, -0.35, hw, 9.1, 0.35, S('lv69_flat', tint([0.95, 0.32, 0.36])));
    const lit = T(sign, { lit: false, flags: VF.FULLBRIGHT, color: [0.08, 0.08, 0.08], flk: [0.9, 0.9, 0.9] });
    mb.box(-hw + 0.5, 9.1, -0.25, hw - 0.5, 12.0, 0.25, [S('lv69_steel'), S('lv69_steel'), S('lv69_steel'), S('lv69_steel'), lit, lit], { uv: 'fit' });
    mb.box(-hw - 0.2, 12.0, -0.3, hw + 0.2, 12.5, 0.3, chase, { uv: ['world', 'world', 'world', 'world', [0, 0, 7, 1], [0, 0, 7, 1]] });
    mb.box(-hw - 0.2, 8.3, -0.3, hw + 0.2, 8.6, 0.3, chase, { uv: ['world', 'world', 'world', 'world', [0, 0, 7, 1], [0, 0, 7, 1]] });
  },
  boxes: [[-AV - 0.7, 0, -0.3, -AV - 0.1, 3, 0.3], [AV + 0.1, 0, -0.3, AV + 0.7, 3, 0.3]],
});

// ------------------------------------------------------------------ the zone
const colAt = (x, z, s = 5) => COLS[Math.floor(hr(Math.floor(x), Math.floor(z), s) * COLS.length)];

// a pole with a lamp and a pool of coloured light
function lampPole(zb, x, z, c, ch = 0) {
  if (!owns(zb, x, z)) return;
  zb.box(x - 0.12, 0, z - 0.12, x + 0.12, 6.2, z + 0.12, M.lv69_pole, { sub: 0 });
  zb.box(x - 0.28, 6.0, z - 0.28, x + 0.28, 6.5, z + 0.28, M.lv69_lamp, { sub: 0, collide: false });
  zb.light(x, 3.6, z, { color: c, rad: 10, int: 1.15, ch });
  zb.decal(x, 0, z, 'up', 10, 10, 'lv69_pool', { lit: false, glow: 0.3 });
}
// a flat ribbon of bulbs between two points at height y (axis 'x' or 'z'), clipped to the zone
function ribbon(zb, axis, fixed, a, b, y, mat) {
  const lo = axis === 'x' ? Math.max(a, zb.x0) : Math.max(a, zb.z0), hi = axis === 'x' ? Math.min(b, zb.x1) : Math.min(b, zb.z1);
  if (hi - lo < 0.2) return;
  const L = hi - lo, rect = [0, 0, L / 1.6, 1];
  if (axis === 'x') zb.box(lo, y, fixed - 0.03, hi, y + 0.4, fixed + 0.03, [null, null, null, null, mat, mat], { sub: 40, uv: ['world', 'world', 'world', 'world', rect, rect], collide: false });
  else zb.box(fixed - 0.03, y, lo, fixed + 0.03, y + 0.4, hi, [mat, mat, null, null, null, null], { sub: 40, uv: [rect, rect, 'world', 'world', 'world', 'world'], collide: false });
}
function avenues(zb) {
  const { x0, z0, x1, z1 } = zb;
  // poles along the inner edges of the four half avenues, ribbons between them and across
  for (let t = 4; t < B; t += 8) {
    for (const [px, pz] of [[x0 + AV, z0 + t], [x1 - AV, z0 + t], [x0 + t, z0 + AV], [x0 + t, z1 - AV]]) {
      lampPole(zb, px, pz, colAt(px, pz), hr(px, pz, 10) < 0.12 ? 2 : 0);
    }
  }
  for (const [axis, fixed, a, b] of [['z', x0 + AV, z0, z1], ['z', x1 - AV, z0, z1], ['x', z0 + AV, x0, x1], ['x', z1 - AV, x0, x1]]) ribbon(zb, axis, fixed, a, b, 6.1, M.lv69_bulbs);
  // chasing ribbons across the avenues, every 16 m
  for (let t = 4; t < B; t += 16) {
    ribbon(zb, 'x', z0 + t, x0, x0 + AV, 6.55, M.lv69_chase); ribbon(zb, 'x', z0 + t, x1 - AV, x1, 6.55, M.lv69_chase);
    ribbon(zb, 'z', x0 + t, z0, z0 + AV, 6.55, M.lv69_chase); ribbon(zb, 'z', x0 + t, z1 - AV, z1, 6.55, M.lv69_chase);
  }
}

function bench(zb, x, z, rot) { if (owns(zb, x, z)) zb.prop('bench', x, 0, z, rot, { len: 1.8 }); }
function lampAt(zb, x, z) { lampPole(zb, x, z, colAt(x, z, 6)); }
function fortune(zb, x, z, rot, k) {
  if (!owns(zb, x, z)) return;
  zb.prop('lv69_fortune', x, 0, z, rot, { text: FORTUNES[k % FORTUNES.length], useY: 1.3, useR: 0.9 });
}
const FORTUNES = [
  'YOUR FORTUNE: THE RIDE YOU ARE LOOKING FOR IS THE ONE THAT IS STILL TURNING.',
  'YOUR FORTUNE: A DOOR WILL OPEN WHERE THE LIGHTS ARE BRIGHTEST. DO NOT TRUST IT. USE IT.',
  'YOUR FORTUNE: LUCKY NUMBERS 0, 0. THE SCOREBOARD WAS RIGHT.',
  'YOUR FORTUNE: THE BIG PRIZE IS STILL ON THE TOP SHELF OF THE LAST BOOTH.',
  'YOUR FORTUNE: THE ORGAN KNOWS ONLY ONE SONG AND IS PROUD OF IT.',
  'YOUR FORTUNE: THE LAST TICKET IS ALREADY IN YOUR POCKET.',
  'YOUR FORTUNE: STAY FOR ONE MORE RIDE. THERE ARE ALWAYS MORE.',
];

function carousel(zb, cx, cz, k) {
  zb.dynamic('lv69_carousel', cx, 0, cz, 0, {}, { spin: 0.38 });
  // the ride's own light and sound
  zb.light(cx, 4.4, cz, { color: [1.0, 0.8, 0.6], rad: 10, int: 0.8, ch: 9 });
  zb.emitter(cx, 3, cz, 'lv69_carousel', { vol: 0.8, rad: 26 });
  for (let a = 0; a < 8; a++) { const t = (a / 8) * TAU + 0.4; bench(zb, cx + cosA(t) * 14, cz + sinA(t) * 14, t + Math.PI / 2 * 0 - Math.PI / 2 + Math.PI); }
  for (let a = 0; a < 4; a++) lampAt(zb, cx + cosA(a * 1.571 + 0.78) * 16.5, cz + sinA(a * 1.571 + 0.78) * 16.5);
  zb.prop('lv69_booth', cx + 12, 0, cz + 12, 0, { kind: 2, c: 1 });
  levelDoor(zb, cx - 14, cz + 13, Math.PI / 2 * 0);
  fortune(zb, cx + 17, cz - 2, -Math.PI / 2, k);
}
function swingRide(zb, cx, cz, k) {
  zb.prop('lv69_swing_tower', cx, 0, cz, 0, {});
  zb.dynamic('lv69_swing_crown', cx, 0, cz, 0, {}, { spin: 0.75 });
  zb.light(cx, 12, cz, { color: [0.7, 0.8, 1.0], rad: 10, int: 0.7, ch: 10 });
  zb.emitter(cx, 8, cz, 'lv69_chains', { vol: 0.8, rad: 28 });
  // a queue of low rails leading to the gate
  for (let i = 0; i < 6; i++) cbox(zb, cx - 18 + i * 3, 0, cz + 14 + (i % 2) * 1.5, cx - 15 + i * 3, 1.0, cz + 14.2 + (i % 2) * 1.5, M.lv69_pole, { sub: 0 });
  for (let a = 0; a < 6; a++) lampAt(zb, cx + cosA(a * 1.047) * 15, cz + sinA(a * 1.047) * 15);
  levelDoor(zb, cx + 16, cz - 12, -Math.PI / 2);
  zb.prop('lv69_booth', cx - 12, 0, cz - 14, Math.PI, { kind: 0, c: 3 });
  fortune(zb, cx - 18, cz + 6, Math.PI / 2, k + 2);
}
function teacups(zb, cx, cz, k) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    zb.dynamic('lv69_cup', cx + cosA(a) * 6.8, 0.3, cz + sinA(a) * 6.8, 0, { c: i }, { spin: i % 2 ? 0.9 : -0.9 });
  }
  zb.prop('lv69_swing_tower', cx, 0, cz, 0, {});      // a tall pole in the middle, strung with bulbs
  zb.light(cx, 5, cz, { color: [1.0, 0.7, 0.8], rad: 10, int: 0.7, ch: 9 });
  zb.emitter(cx, 2, cz, 'lv69_carousel', { vol: 0.5, rad: 20 });
  for (let a = 0; a < 6; a++) lampAt(zb, cx + cosA(a * 1.047 + 0.5) * 13, cz + sinA(a * 1.047 + 0.5) * 13);
  levelDoor(zb, cx + 15, cz + 13, Math.PI * 0.75);
  fortune(zb, cx - 15, cz - 10, 0.4, k + 4);
}
function gameAlley(zb, cx, cz, k) {
  const alongX = hr(Math.floor(cx / B), Math.floor(cz / B), 21) < 0.5;
  for (let i = 0; i < 6; i++) {
    const o = -11 + i * 4.4;
    for (const s of [-1, 1]) {
      const x = alongX ? cx + o : cx + s * 4, z = alongX ? cz + s * 4 : cz + o;
      const rot = alongX ? (s < 0 ? Math.PI : 0) : (s < 0 ? -Math.PI / 2 : Math.PI / 2);
      if (owns(zb, x, z)) zb.prop('lv69_booth', x, 0, z, rot, { kind: i + (s > 0 ? 1 : 0), c: i * 2 + (s > 0 ? 1 : 0) });
    }
    const lx = alongX ? cx + o + 2.2 : cx, lz = alongX ? cz : cz + o + 2.2;
    lampPole(zb, lx, lz, colAt(lx, lz, 7));
  }
  // the end of the alley: a door under a lit sign
  const ex = alongX ? cx + 15.5 : cx, ez = alongX ? cz : cz + 15.5;
  levelDoor(zb, ex, ez, alongX ? -Math.PI / 2 : Math.PI);
  fortune(zb, alongX ? cx - 15 : cx + 2, alongX ? cz + 2 : cz - 15, alongX ? Math.PI / 2 : 0, k + 1);
  zb.prop('lv69_speaker', cx + (alongX ? -14 : 3), 0, cz + (alongX ? 3 : -14), 0, {});
}
function funhouse(zb, cx, cz, k) {
  // a harlequin facade facing south, a dark passage inside with a door at the back
  const hw = 13, d = 11, H = 12, x0 = cx - hw, x1 = cx + hw, z0 = cz - d, z1 = cz + d;
  const hq = M.lv69_harlequin, ar = 3;       // arch half width
  const wall = (ax0, ay0, az0, ax1, ay1, az1, m) => cbox(zb, ax0, ay0, az0, ax1, ay1, az1, m, { sub: 4 });
  wall(x0, 0, z0, x1, H, z0 + 1, hq);                              // back
  wall(x0, 0, z0, x0 + 1, H, z1, hq); wall(x1 - 1, 0, z0, x1, H, z1, hq);
  wall(x0, 0, z1 - 1, cx - ar, H, z1, hq); wall(cx + ar, 0, z1 - 1, x1, H, z1, hq);
  wall(cx - ar, 5.2, z1 - 1, cx + ar, H, z1, hq);                  // over the entrance
  wall(x0, H, z0, x1, H + 0.5, z1, M.lv69_flat);                   // roof
  // the passage: two walls and a ceiling, a short bend of darkness
  wall(cx - ar, 0, z1 - 1 - 7, cx - ar + 0.4, 5.2, z1 - 1, M.lv69_flat); wall(cx + ar - 0.4, 0, z1 - 1 - 7, cx + ar, 5.2, z1 - 1, M.lv69_flat);
  wall(cx - ar, 4.0, z1 - 8, cx + ar, 4.4, z1 - 1, M.lv69_flat);
  wall(cx - ar, 0, z1 - 8.4, cx + ar, 5.2, z1 - 8, M.lv69_boards);
  // chase border round the entrance
  for (const [ax0, ay0, az0, ax1, ay1, az1] of [[cx - ar - 0.3, 5.2, z1, cx + ar + 0.3, 5.5, z1 + 0.25], [cx - ar - 0.3, 0, z1, cx - ar, 5.5, z1 + 0.25], [cx + ar, 0, z1, cx + ar + 0.3, 5.5, z1 + 0.25]]) {
    cbox(zb, ax0, ay0, az0, ax1, ay1, az1, M.lv69_chase, { sub: 4, collide: false });
  }
  zb.light(cx, 3.4, z1 - 5, { color: [1.0, 0.5, 0.7], rad: 9, int: 0.7, ch: 9 });
  levelDoor(zb, cx, z1 - 7.3, 0);
  // steps and a ramp of boards in front
  cbox(zb, cx - ar - 1, 0, z1 + 0.25, cx + ar + 1, 0.3, z1 + 2.5, M.lv69_boards, { sub: 2 });
  // the sign
  if (owns(zb, cx, z1 + 0.6)) zb.prop('lv69_arch', cx, 0, z1 + 5, 0, { k: 3 });
  for (let a = 0; a < 4; a++) lampAt(zb, cx + (a % 2 ? 1 : -1) * 16, cz + z1 - cz + 3 + (a > 1 ? 9 : 0));
  zb.emitter(cx, 2, z1 + 1, 'lv69_pa_hiss', { vol: 0.5, rad: 18 });
  fortune(zb, cx + 8, z1 + 3, 0, k + 3);
}
function organPavilion(zb, cx, cz, k) {
  const W = 14, D = 9;
  cbox(zb, cx - W / 2, 0, cz - D / 2, cx + W / 2, 0.5, cz + D / 2, M.lv69_boards, { sub: 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cbox(zb, cx + sx * (W / 2 - 0.4) - 0.2, 0.5, cz + sz * (D / 2 - 0.4) - 0.2, cx + sx * (W / 2 - 0.4) + 0.2, 5.2, cz + sz * (D / 2 - 0.4) + 0.2, M.lv69_gold, { sub: 0 });
  cbox(zb, cx - W / 2 - 0.5, 5.2, cz - D / 2 - 0.5, cx + W / 2 + 0.5, 5.8, cz + D / 2 + 0.5, M.lv69_flat, { sub: 4, tint: [0.95, 0.32, 0.36] });
  cbox(zb, cx - W / 2 - 0.55, 4.9, cz + D / 2 + 0.4, cx + W / 2 + 0.55, 5.2, cz + D / 2 + 0.55, M.lv69_chase, { sub: 8, collide: false, uv: ['world', 'world', 'world', 'world', [0, 0, 9, 1], 'world'] });
  zb.prop('lv69_band_organ', cx, 0.5, cz - D / 2 + 1.4, 0, {});
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) bench(zb, cx + s * 4, 0.5 + 0, cz + 0.5 + i * 1.6 - 0.5, Math.PI);
  zb.light(cx, 4.6, cz, { color: [1.0, 0.78, 0.55], rad: 10, int: 0.8, ch: 10 });
  zb.light(cx, 2.4, cz - 2, { color: [1.0, 0.3, 0.4], rad: 8, int: 0.5, ch: 9 });
  for (let a = 0; a < 6; a++) lampAt(zb, cx + cosA(a * 1.047) * 17, cz + sinA(a * 1.047) * 17);
  levelDoor(zb, cx + 16, cz + 14, -Math.PI * 0.75);
  fortune(zb, cx - 11, cz + 8, Math.PI * 0.7, k);
  zb.prop('lv69_speaker', cx - 8, 0, cz + 7, 0, {});
}
function bigTop(zb, cx, cz, k) {
  zb.prop('lv69_tent', cx, 0, cz, 0, {});
  zb.light(cx, 2.5, cz - 12, { color: [1.0, 0.9, 0.7], rad: 9, int: 0.9, ch: 10 });
  zb.emitter(cx, 3, cz - 12, 'lv69_pa_hiss', { vol: 0.5, rad: 18 });
  for (const sx of [-1, 1]) { zb.prop('lv69_booth', cx + sx * 8, 0, cz - 17, Math.PI, { kind: 1, c: sx > 0 ? 5 : 2 }); }
  for (let a = 0; a < 6; a++) lampAt(zb, cx + cosA(a * 1.047 + 0.3) * 17, cz + sinA(a * 1.047 + 0.3) * 17);
  levelDoor(zb, cx + 2, cz - 14.2, 0);
  fortune(zb, cx - 15, cz - 15, 0.6, k + 5);
}
function ticketPlaza(zb, cx, cz, k) {
  cbox(zb, cx - 3, 0, cz - 3, cx + 3, 3.2, cz + 3, M.lv69_harlequin, { sub: 3 });
  cbox(zb, cx - 3.5, 3.2, cz - 3.5, cx + 3.5, 3.7, cz + 3.5, M.lv69_flat, { sub: 3, tint: [0.2, 0.75, 0.78] });
  cbox(zb, cx - 3.55, 3.7, cz + 3.45, cx + 3.55, 4.1, cz + 3.55, M.lv69_chase, { sub: 8, collide: false, uv: ['world', 'world', 'world', 'world', [0, 0, 4.5, 1], 'world'] });
  cbox(zb, cx - 1.5, 1.0, cz + 3.0, cx + 1.5, 2.4, cz + 3.1, M.lv69_sign_tickets, { collide: false, uv: ['world', 'world', 'world', 'world', 'fit', 'world'], sub: 0 });
  for (let a = 0; a < 4; a++) { const t = a * 1.571 + 0.78; zb.prop('lv69_speaker', cx + cosA(t) * 9, 0, cz + sinA(t) * 9, 0, {}); }
  for (let a = 0; a < 8; a++) { const t = (a / 8) * TAU; bench(zb, cx + cosA(t) * 13, cz + sinA(t) * 13, t - Math.PI / 2 + Math.PI); }
  for (let a = 0; a < 6; a++) lampAt(zb, cx + cosA(a * 1.047) * 19, cz + sinA(a * 1.047) * 19);
  zb.light(cx, 3.0, cz + 5, { color: [1.0, 0.8, 0.5], rad: 8, int: 0.8, ch: 0 });
  levelDoor(zb, cx - 16, cz - 12, Math.PI / 2);
  fortune(zb, cx + 14, cz + 10, -Math.PI / 2, k);
  fortune(zb, cx - 6, cz + 14, Math.PI, k + 2);
}
const FEATURES = [carousel, swingRide, teacups, gameAlley, funhouse, organPavilion, bigTop, ticketPlaza];

function gen(zb) {
  const { x0, z0, x1, z1 } = zb;
  const bi = Math.round(x0 / B), bj = Math.round(z0 / B);
  openGround(zb, M.lv69_dirt, 0);
  zb.noConnectivity = true;
  zb.fill(x0, z0, x1, z1, (x, z, i) => {
    if (x - x0 < AV || x1 - x <= AV || z - z0 < AV || z1 - z <= AV) zb.fmat[i] = M.lv69_boards;
    else if (noise(x, z, 9, 71) > 0.62) zb.fmat[i] = M.lv69_grass;
  });
  avenues(zb);
  const cx = x0 + 32, cz = z0 + 32;
  const kind = (bi === 0 && bj === 2) ? 5 : Math.floor(hr(bi, bj, 1) * FEATURES.length);
  // the boards under a ride
  FEATURES[kind](zb, cx, cz, Math.abs(bi * 3 + bj * 7));
  // the wheel stands on some corners of the avenues (always at the one in front of the arrival)
  if ((bi === 0 && bj === 2) || hr(bi, bj, 77) < 0.2) {
    if (owns(zb, x0, z0)) zb.prop('lv69_wheel', x0, 0, z0, hr(bi, bj, 78) < 0.5 || (bi === 0 && bj === 2) ? 0 : Math.PI / 2, {});
    zb.emitter(x0, 6, z0, 'lv69_wheel', { vol: 0.7, rad: 36 });
    zb.light(x0, 3, z0 + 2, { color: [1, 0.85, 0.7], rad: 9, int: 0.7 });
  }
  // gate arches over the avenues
  for (const [ax, az, rot] of [[x0, z0 + 30, Math.PI / 2], [x0 + 30, z0, 0]]) {
    if (hr(bi * 2 + (rot ? 1 : 0), bj, 31) < 0.55 && owns(zb, ax, az)) zb.prop('lv69_arch', ax, 0, az, rot, { k: Math.floor(hr(bi, bj, 32) * 5) });
  }
  // a few loudspeakers on the avenues
  for (const [px, pz] of [[x0 + AV + 0.8, z0 + 20], [x0 + 20, z0 + AV + 0.8]]) if (hr(px, pz, 40) < 0.5) zb.prop('lv69_speaker', px, 0, pz, 0, {});
  animKeep(zb, 'lv69_chase', 'lv69_chaser');
}

defineZone('lv69_fair', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.22, 0.17, 0.3],
    env: env({ fog: [0.16, 0.07, 0.2], fogNear: 22, fogFar: 115, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'lv69_dusk' }),
  }),
  gen,
});

// loudspeakers: crackle and chimes, never a voice
function script(ctx, dt) {
  const s = ctx.state, p = ctx.player;
  s.t = (s.t ?? 18) - dt;
  if (s.t > 0) return;
  s.t = 24 + Math.random() * 40;
  const a = Math.random() * TAU, d = 18 + Math.random() * 24;
  const x = p.x + Math.sin(a) * d, z = p.z - Math.cos(a) * d;
  ctx.game.audioCall('play', Math.random() < 0.65 ? 'lv69_chime' : 'lv69_crackle', x, p.y + 5, z, { distant: d > 30, vol: 0.9 });
}

defineLevel(N, {
  name: 'THE ABANDONED CARNIVAL',
  zoneType: 'lv69_fair',
  zoneSize: B,
  entry: { x: 0.5, y: 0, z: 198.5, yaw: 0 },
  doorDensity: 0.4,
  viewRadius: 5,
  sky: { top: [0.03, 0.02, 0.1], horizon: [0.34, 0.14, 0.3], ground: [0.1, 0.05, 0.12], curve: 0.45, stars: 0.5, sun: { dir: [0.5, 0.18, -0.8], color: [1.0, 0.7, 0.8], size: 0.03, halo: 0.25 } },
  light: { phoneRadius: 4, phoneIntensity: 0.25 },
  script,
});
void pnoise; void FACE; void pickH;
