// Level 24: Blast Off. A launch complex that goes on in every direction under a night sky: one
// pad to every 128 m square, each with a rocket on its mount, a steel service gantry, four
// floodlight masts and a countdown board stuck on T-00:00:01. Nothing ever lifts off. The
// consoles by the blockhouses have one button, and the engines do answer it, for a while.
import { defineTexture } from '../../gfx/textures.js';
import { rasterText } from '../../gfx/font.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propGlow } from '../props.js';
import { LEVEL_ZONE, defineLevel, env, M, hr, cbox, owns } from './kit.js';
import { fdiv, placeDoor, quiet, ambientEvents, flickerHook, mulc, mixc, TAU } from './g02_kit.js';

const N = 24;
const Z = 128, PAD = 32;                         // zone size; half-width of the pad slab
const SIDES = 10;

// ------------------------------------------------------------------ textures
defineTexture('lv24_pad', (p, r) => {
  p.fill([108, 110, 118]);
  p.noise(4, 0.1, 3);
  p.grain(0.05);
  for (let k = 0; k < 64; k += 16) { p.rect(k, 0, 1, 64, [70, 72, 80], 0.8); p.rect(0, k, 64, 1, [70, 72, 80], 0.8); }
  // scorched centre (the tile corner is the pad centre: the disc wraps around)
  for (let y = -20; y <= 20; y++) for (let x = -20; x <= 20; x++) { const d = Math.hypot(x, y); if (d < 20) p.set(x, y, [34, 30, 30], 0.55 * (1 - d / 20)); }
  p.ring(0, 0, 22, 2, [222, 192, 44]); p.ring(0, 0, 12, 1, [226, 226, 220]);
  p.rect(-1, -26, 2, 52, [226, 226, 220], 0.9); p.rect(-26, -1, 52, 2, [226, 226, 220], 0.9);
  // hazard border where the slab ends (32 px from the centre)
  for (let i = 0; i < 64; i++) for (let w = 0; w < 4; w++) { const c = ((i >> 2) % 2) ? [226, 188, 36] : [36, 34, 32]; p.set(30 + w, i, c); p.set(i, 30 + w, c); }
}, 14);
defineTexture('lv24_gravel', (p, r) => {
  p.fill([88, 86, 84]);
  p.noise(4, 0.16, 3);
  p.grain(0.12);
  p.speckle(260, [128, 124, 118], 0.3, 0.8);
  p.speckle(200, [50, 48, 48], 0.3, 0.8);
}, 12);
defineTexture('lv24_road_x', (p) => {       // road running along x: dashed centre line on row 0
  p.fill([46, 48, 54]);
  p.noise(4, 0.1, 3);
  p.grain(0.08);
  p.speckle(120, [80, 82, 88], 0.3, 0.7);
  for (let x = 0; x < 64; x++) if (x % 32 < 18) { p.rect(x, 0, 1, 2, [222, 196, 60]); p.rect(x, 62, 1, 2, [222, 196, 60]); }
}, 10);
defineTexture('lv24_road_z', (p) => {
  p.fill([46, 48, 54]);
  p.noise(4, 0.1, 3);
  p.grain(0.08);
  p.speckle(120, [80, 82, 88], 0.3, 0.7);
  for (let y = 0; y < 64; y++) if (y % 32 < 18) { p.rect(0, y, 2, 1, [222, 196, 60]); p.rect(62, y, 2, 1, [222, 196, 60]); }
}, 10);
defineTexture('lv24_apron', (p) => {
  p.fill([126, 126, 130]);
  p.noise(4, 0.09, 3);
  p.grain(0.05);
  for (let k = 0; k < 64; k += 32) { p.rect(k, 0, 1, 64, [80, 80, 86]); p.rect(0, k, 64, 1, [80, 80, 86]); }
}, 10);
defineTexture('lv24_hull_w', (p, r) => {
  p.fill([218, 222, 230]);
  p.noise(4, 0.05, 2);
  for (const y of [0, 16, 32, 48]) { p.rect(0, y, 64, 1, [150, 156, 166]); }
  for (let x = 0; x < 64; x += 16) p.rect(x, 0, 1, 64, [170, 176, 186], 0.7);
  for (let i = 0; i < 4; i++) p.stain(r.int(0, 63), r.int(0, 63), r.range(6, 12), [150, 150, 150], 0.25);
  for (let y = 4; y < 64; y += 16) for (let x = 2; x < 64; x += 8) p.set(x, y, [140, 146, 156]);
  p.rect(0, 28, 64, 8, [24, 24, 28]);     // a black roll band
}, 12);
defineTexture('lv24_hull_o', (p, r) => {
  p.fill([200, 108, 50]);
  p.map((x, y, c) => mulc(c, 0.8 + 0.4 * pnoise(x, y, 8, 3)));
  for (let i = 0; i < 6; i++) p.drip(r.int(0, 63), 0, r.int(20, 60), [120, 56, 24], 0.4, 2);
  p.grain(0.07);
}, 10);
defineTexture('lv24_hull_k', (p) => { p.fill([40, 40, 46]); p.noise(4, 0.1, 2); p.grain(0.05); for (let y = 0; y < 64; y += 21) p.rect(0, y, 64, 1, [90, 90, 100]); }, 6);
defineTexture('lv24_hull_r', (p) => {
  p.map((x, y) => ((((x >> 4) + (y >> 4)) & 1) ? [206, 48, 40] : [226, 226, 220]));
  p.noise(4, 0.06, 2);
}, 6);
defineTexture('lv24_steel', (p, r) => {
  p.fill([142, 70, 52]);
  p.map((x, y, c) => mulc(c, 0.75 + 0.35 * pnoise(x, y, 8, 5)));
  p.grain(0.08);
  for (let i = 0; i < 4; i++) p.stain(r.int(0, 63), r.int(0, 63), r.range(5, 9), [96, 56, 40], 0.4);
}, 10);
defineTexture('lv24_metal', (p) => { p.fill([92, 96, 104]); p.noise(4, 0.1, 2); p.grain(0.05); }, 8);
defineTexture('lv24_bunker', (p, r) => {
  p.fill([94, 96, 98]);
  p.noise(4, 0.12, 3);
  p.grain(0.07);
  for (let k = 0; k < 64; k += 21) p.rect(0, k, 64, 1, [60, 62, 64], 0.7);
  for (let i = 0; i < 5; i++) p.drip(r.int(0, 63), 0, r.int(16, 50), [44, 46, 46], 0.4, 2);
}, 10);
defineTexture('lv24_lamp', (p) => { p.fill([210, 228, 255]); p.disc(32, 32, 22, [255, 255, 255]); }, 4);
defineTexture('lv24_beacon', (p) => { p.fill([255, 40, 30]); p.disc(32, 32, 20, [255, 150, 120]); }, 4);
defineTexture('lv24_glow', (p) => { p.fill([255, 150, 50]); p.noise(4, 0.2, 2); p.disc(32, 32, 18, [255, 230, 160]); }, 6);
defineTexture('lv24_vapor', (p) => {
  p.fill([236, 242, 250]);
  p.map((x, y, c) => mulc(c, 0.9 + 0.1 * pnoise(x, y, 8, 4)));
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = (x - 32) / 31, dy = (y - 34) / 34;
    const d = Math.hypot(dx, dy) + (pnoise(x, y, 8, 5) - 0.5) * 0.7 + (pnoise(x, y, 16, 8) - 0.5) * 0.3;
    p.alpha(x, y, Math.max(0, Math.min(1, (1 - d) * 1.5)) * 255);
  }
}, 6);
// the countdown board: red digits on black, tall pixels so the numerals read on a wide board
defineTexture('lv24_clock', (p) => {
  p.fill([14, 8, 8]);
  p.frame(0, 0, 64, 64, [60, 30, 28]);
  p.frame(2, 2, 60, 60, [40, 20, 18]);
  const on = [255, 70, 44];
  rasterText('T-00:00:01', 2, 21, 1, (px, py) => { for (let sy = 0; sy < 3; sy++) p.set(px, 21 + (py - 21) * 3 + sy, on); });
  p.rect(2, 8, 60, 1, [90, 40, 30]); p.rect(2, 55, 60, 1, [90, 40, 30]);
}, 6);
// the horizon: rockets and gantries as dark cut-outs
defineTexture('lv24_skyline', (p, r) => {
  p.clearAlpha(0);
  const dark = [10, 12, 24];
  const col = (x, y0, y1, w = 1) => { for (let y = y0; y < y1; y++) for (let k = 0; k < w; k++) { p.set(x + k, y, dark); p.alpha(x + k, y, 255); } };
  // rocket
  col(8, 20, 64, 3); col(9, 12, 20, 1); col(7, 56, 64, 5);
  // gantry
  for (let y = 16; y < 64; y += 4) col(14, y, y + 1, 7);
  col(14, 16, 64, 1); col(20, 16, 64, 1);
  // tanks and low sheds
  for (let x = 28; x < 40; x++) { const h = Math.round(Math.sqrt(Math.max(0, 36 - (x - 34) * (x - 34)))); col(x, 56 - h, 64); }
  col(42, 54, 64, 10);
  // second rocket (taller, thinner)
  col(52, 8, 64, 2); col(52, 2, 8, 1);
  for (let y = 14; y < 64; y += 5) col(56, y, y + 1, 5); col(56, 14, 64, 1); col(60, 14, 64, 1);
  p.rect(0, 62, 64, 2, dark); for (let x = 0; x < 64; x++) p.alpha(x, 62, 255), p.alpha(x, 63, 255);
}, 4);

defineMaterial('lv24_pad', 'lv24_pad', { s: 64, surf: 'concrete', stain: 0.06 });
defineMaterial('lv24_gravel', 'lv24_gravel', { s: 3, surf: 'asphalt', stain: 0.1 });
defineMaterial('lv24_road_x', 'lv24_road_x', { s: 10, surf: 'asphalt' });
defineMaterial('lv24_road_z', 'lv24_road_z', { s: 10, surf: 'asphalt' });
defineMaterial('lv24_apron', 'lv24_apron', { s: 8, surf: 'concrete' });
defineMaterial('lv24_hull_w', 'lv24_hull_w', { s: 8, surf: 'metal' });
defineMaterial('lv24_hull_o', 'lv24_hull_o', { s: 8, surf: 'metal' });
defineMaterial('lv24_hull_k', 'lv24_hull_k', { s: 8, surf: 'metal' });
defineMaterial('lv24_hull_r', 'lv24_hull_r', { s: 8, surf: 'metal' });
defineMaterial('lv24_steel', 'lv24_steel', { s: 2, surf: 'metal' });
defineMaterial('lv24_metal', 'lv24_metal', { s: 2, surf: 'metal' });
defineMaterial('lv24_bunker', 'lv24_bunker', { s: 3, surf: 'concrete', stain: 0.12 });
defineMaterial('lv24_lamp', 'lv24_lamp', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 1.25 });
defineMaterial('lv24_beacon', 'lv24_beacon', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 1.2, chan: 14 });
defineMaterial('lv24_clock', 'lv24_clock', { s: 1, flags: VF.FULLBRIGHT, glow: 1.15 });
defineMaterial('lv24_glow', 'lv24_glow', { s: 1, flags: VF.FULLBRIGHT, glow: 1.4, chan: 10 });

// ------------------------------------------------------------------ geometry helpers
// truncated cone round (cx, cz), from radius r0 at y0 to r1 at y0 + h, in short vertical pieces
// so that the baked light follows the surface
function frustum(mb, cx, cz, y0, h, r0, r1, st, opts = {}) {
  const sides = opts.sides || SIDES, seg = opts.seg || 4, rot = opts.rot || 0, sv = opts.sv || 8, reps = opts.reps || Math.max(1, Math.round((TAU * Math.max(r0, r1)) / 8));
  const n = Math.max(1, Math.ceil(h / seg));
  const slope = (r0 - r1) / h, nl = Math.hypot(1, slope);
  for (let s = 0; s < n; s++) {
    const t0 = s / n, t1 = (s + 1) / n;
    const ya = y0 + h * t0, yb = y0 + h * t1, ra = r0 + (r1 - r0) * t0, rb = r0 + (r1 - r0) * t1;
    for (let i = 0; i < sides; i++) {
      const a0 = rot + (i / sides) * TAU, a1 = rot + ((i + 1) / sides) * TAU, am = (a0 + a1) / 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const nrm = [Math.cos(am) / nl, slope / nl, Math.sin(am) / nl];
      const u0 = (i / sides) * reps, u1 = ((i + 1) / sides) * reps, va = -ya / sv, vb = -yb / sv;
      mb.quad([cx + c1 * ra, ya, cz + s1 * ra, cx + c0 * ra, ya, cz + s0 * ra, cx + c0 * rb, yb, cz + s0 * rb, cx + c1 * rb, yb, cz + s1 * rb], nrm, st, [u1, va, u0, va, u0, vb, u1, vb]);
    }
  }
}
const pm = (name) => S(name);

// the rocket: a stack of frusta; type 0 tall three-stage, 1 tank with two boosters, 2 needle with fins
defineProp('lv24_rocket', {
  build(mb, p) {
    const type = p.opts.type || 0;
    const W = pm('lv24_hull_w'), O = pm('lv24_hull_o'), K = pm('lv24_hull_k'), R = pm('lv24_hull_r'), D = pm('lv24_metal');
    const eng = propGlow('lv24_glow', 1.0, 10);
    // engines under the mount line
    const bells = (r, n, y0) => { for (let i = 0; i < n; i++) { const a = (i / n) * TAU + 0.4, ex = n > 1 ? Math.cos(a) * r : 0, ez = n > 1 ? Math.sin(a) * r : 0; frustum(mb, ex, ez, y0, 3.2, 0.9, 1.8, D, { sides: 8, seg: 3.2, sv: 4, reps: 2 }); mb.cyl(ex, y0 + 0.02, ez, 1.6, 0.06, 8, eng, 1); } };
    if (type === 0) {
      bells(2.6, 5, 5.2);
      frustum(mb, 0, 0, 8, 36, 5, 5, W, { sides: 12 });          // first stage
      frustum(mb, 0, 0, 44, 3, 5, 4.2, K, { sides: 12 });         // interstage
      frustum(mb, 0, 0, 47, 22, 4.2, 4.2, W, { sides: 12 });      // second stage
      frustum(mb, 0, 0, 69, 3, 4.2, 3.2, K, { sides: 12 });
      frustum(mb, 0, 0, 72, 12, 3.2, 3.2, W, { sides: 12 });      // third stage
      frustum(mb, 0, 0, 84, 12, 3.2, 0.35, W, { sides: 12, seg: 3 });     // nose
      mb.rod(0, 96, 0, 0, 108, 0, 0.12, 4, D);                    // escape tower mast
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.78; mb.box(Math.cos(a) * 5 - 0.12, 8, Math.sin(a) * 5 - 0.12, Math.cos(a) * 7.2 + 0.12, 20, Math.sin(a) * 7.2 + 0.12, K); }
    } else if (type === 1) {
      bells(2.2, 3, 5.2);
      frustum(mb, 0, 0, 8, 48, 4.4, 4.4, O, { sides: 12, sv: 12 });         // the big tank
      frustum(mb, 0, 0, 56, 10, 4.4, 0.4, W, { sides: 12, seg: 3 });
      for (const sx of [-1, 1]) {
        frustum(mb, sx * 7.4, 0, 8, 38, 2.1, 2.1, W, { sides: 8, reps: 2 });
        frustum(mb, sx * 7.4, 0, 46, 9, 2.1, 0.3, K, { sides: 8, seg: 3, reps: 2 });
        mb.cyl(sx * 7.4, 5.2, 0, 1.7, 0.06, 8, eng, 1);
        frustum(mb, sx * 7.4, 0, 5.2, 2.8, 0.9, 1.6, D, { sides: 8, seg: 3, sv: 4, reps: 2 });
        mb.box(sx * 4.6 - 0.3, 14, -0.3, sx * 5.4 + 0.3, 16, 0.3, D); mb.box(sx * 4.6 - 0.3, 38, -0.3, sx * 5.4 + 0.3, 40, 0.3, D);
      }
    } else {
      bells(1.4, 4, 5.2);
      frustum(mb, 0, 0, 8, 54, 2.7, 2.7, R, { sides: 10, sv: 12 });
      frustum(mb, 0, 0, 62, 14, 2.7, 0.3, K, { sides: 10, seg: 3 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.78, c = Math.cos(a), s = Math.sin(a);
        // a fin: a thin slab, wide at the base
        mb.poly4([c * 2.6, 8, s * 2.6], [c * 7, 7, s * 7], [c * 4.2, 26, s * 4.2], [c * 2.6, 26, s * 2.6], K, [0, 1, 1, 1, 1, 0, 0, 0]);
        mb.poly4([c * 2.6, 26, s * 2.6], [c * 4.2, 26, s * 4.2], [c * 7, 7, s * 7], [c * 2.6, 8, s * 2.6], K, [0, 1, 1, 1, 1, 0, 0, 0]);
      }
    }
    // the mount under it: a steel table on four legs over the flame trench
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 6 - 0.8, 0, sz * 6 - 0.8, sx * 6 + 0.8, 5.2, sz * 6 + 0.8, pm('lv24_steel'), { skip: 8 });
    mb.box(-8, 4.4, -8, 8, 5.2, 8, pm('lv24_bunker'));
    mb.box(-8.4, 3.8, -8.4, 8.4, 4.4, 8.4, D);
  },
  boxes: [[-8, 0, -8, 8, 5.2, 8], [-4, 5.2, -4, 4, 60, 4]],
});

// the service gantry: a lattice tower with swing arms reaching toward the rocket (local +x)
defineProp('lv24_tower', {
  build(mb, p) {
    const H = p.opts.h || 74, hw = 3.5, step = 6;
    const st = pm('lv24_steel'), dk = pm('lv24_metal');
    const t = 0.22;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let y = 0; y < H; y += 3) mb.box(sx * hw - t, y, sz * hw - t, sx * hw + t, y + 3, sz * hw + t, st, { skip: 12 });
    }
    for (let y = step; y <= H; y += step) {
      mb.box(-hw, y - 0.12, -hw - 0.12, hw, y + 0.12, -hw + 0.12, st); mb.box(-hw, y - 0.12, hw - 0.12, hw, y + 0.12, hw + 0.12, st);
      mb.box(-hw - 0.12, y - 0.12, -hw, -hw + 0.12, y + 0.12, hw, st); mb.box(hw - 0.12, y - 0.12, -hw, hw + 0.12, y + 0.12, hw, st);
      const y0 = y - step, flip = ((y / step) & 1) ? 1 : -1;
      mb.rod(-hw * flip, y0, -hw, hw * flip, y, -hw, 0.09, 4, dk);
      mb.rod(-hw * flip, y0, hw, hw * flip, y, hw, 0.09, 4, dk);
      mb.rod(-hw, y0, -hw * flip, -hw, y, hw * flip, 0.09, 4, dk);
      mb.rod(hw, y0, -hw * flip, hw, y, hw * flip, 0.09, 4, dk);
    }
    // swing arms with a rail and an umbilical hose
    const gap = p.opts.gap || 5.2;
    for (const y of p.opts.arms || [22, 40, 58]) {
      mb.box(hw, y, -1, hw + gap, y + 0.3, 1, dk);
      mb.box(hw, y + 0.3, -1, hw + gap, y + 1.1, -0.94, dk, { skip: 8 }); mb.box(hw, y + 0.3, 0.94, hw + gap, y + 1.1, 1, dk, { skip: 8 });
      mb.rod(hw, y - 0.2, 0.5, hw + gap, y - 0.5, 0.5, 0.12, 5, pm('lv24_hull_k'));
    }
    // a red beacon on top
    mb.box(-0.3, H, -0.3, 0.3, H + 0.6, 0.3, S('lv24_beacon'));
    mb.rod(0, H + 0.6, 0, 0, H + 6, 0, 0.1, 4, dk);
  },
  boxes: [[-3.8, 0, -3.8, -3.2, 70, -3.2], [3.2, 0, -3.8, 3.8, 70, -3.2], [-3.8, 0, 3.2, -3.2, 70, 3.8], [3.2, 0, 3.2, 3.8, 70, 3.8]],
});

// floodlight mast: a tall pole with a bank of lamps looking toward the pad (local -z)
defineProp('lv24_mast', {
  build(mb, p) {
    const H = p.opts.h || 24, dk = pm('lv24_metal');
    for (let y = 0; y < H; y += 4) mb.box(-0.22 + (y / H) * 0.08, y, -0.22 + (y / H) * 0.08, 0.22 - (y / H) * 0.08, y + 4, 0.22 - (y / H) * 0.08, dk, { skip: 12 });
    mb.box(-0.9, 0, -0.9, 0.9, 0.5, 0.9, pm('lv24_bunker'));
    const lamp = S('lv24_lamp');
    mb.box(-2.4, H, -0.2, 2.4, H + 2.2, 0.0, [dk, dk, dk, dk, dk, lamp], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
    mb.box(-2.5, H - 0.1, -0.05, 2.5, H, 0.45, dk);
  },
  boxes: [[-0.9, 0, -0.9, 0.9, 1, 0.9], [-0.25, 0, -0.25, 0.25, 24, 0.25]],
  light: { y: 5, z: -2.5, color: [0.86, 0.92, 1.0], rad: 10, int: 1.25 },
  emitter: { snd: 'g02_flood', vol: 0.7, rad: 18, y: 4 },
});

// a board with the countdown, on two legs, facing local -z
defineProp('lv24_clock', {
  build(mb, p) {
    const dk = pm('lv24_metal'), face = S('lv24_clock');
    for (const x of [-2.4, 2.4]) mb.box(x - 0.12, 0, -0.12, x + 0.12, 3.6, 0.12, dk, { skip: 8 });
    mb.box(-3.3, 2.7, -0.2, 3.3, 4.7, 0.2, [dk, dk, dk, dk, dk, face], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
    // glowing digits: the face is lit
  },
  boxes: [[-3.3, 0, -0.3, 3.3, 4.7, 0.3]],
  light: { y: 3.7, z: -1.5, color: [1.0, 0.25, 0.14], rad: 7, int: 0.9 },
  emitter: { snd: 'g02_beep', vol: 0.8, rad: 26, y: 3.7 },
});

// the blockhouse: a sloped concrete bunker
defineProp('lv24_bunker', {
  build(mb, p) {
    const c = pm('lv24_bunker'), dk = pm('lv24_metal');
    mb.box(-6, 0, -4, 6, 3.6, 4, c);
    mb.poly4([-6, 3.6, -4], [6, 3.6, -4], [6, 4.4, 0], [-6, 4.4, 0], c, [0, 1, 1, 1, 1, 0, 0, 0]);
    mb.poly4([-6, 4.4, 0], [6, 4.4, 0], [6, 3.6, 4], [-6, 3.6, 4], c, [0, 1, 1, 1, 1, 0, 0, 0]);
    mb.rod(4, 4.4, 0, 4, 18, 0, 0.12, 4, dk);
    mb.box(-6.1, 3.6, -4.1, 6.1, 3.8, 4.1, dk, { skip: 8 });
    // a slit window with a lit panel
    mb.box(-4.6, 1.8, -4.04, -2.2, 2.6, -3.98, S('lv24_lamp'));
  },
  boxes: [[-6, 0, -4, 6, 3.8, 4]],
});

// a slab with a mast and a red beacon marks each door
defineProp('lv24_marker', {
  build(mb) {
    const dk = pm('lv24_metal');
    mb.box(-0.06, 0, -0.06, 0.06, 3.2, 0.06, dk, { skip: 8 });
    mb.box(-0.12, 3.2, -0.12, 0.12, 3.5, 0.12, S('lv24_beacon'));
  },
});

// the launch console: a desk with one red button; use it
defineProp('lv24_console', {
  build(mb) {
    const dk = pm('lv24_metal'), c = pm('lv24_bunker');
    mb.box(-0.9, 0, -0.5, 0.9, 0.9, 0.5, c);
    mb.poly4([-0.95, 0.9, -0.5], [0.95, 0.9, -0.5], [0.95, 1.15, 0.25], [-0.95, 1.15, 0.25], dk, [0, 1, 1, 1, 1, 0, 0, 0]);
    mb.box(-0.14, 1.02, -0.2, 0.14, 1.12, 0.06, S('lv24_beacon'));
    for (let i = 0; i < 5; i++) mb.box(-0.8 + i * 0.35, 1.0, -0.42, -0.65 + i * 0.35, 1.04, -0.34, S('lv24_lamp'));
  },
  boxes: [[-0.95, 0, -0.5, 0.95, 1.15, 0.5]],
  use: 'level',
});

// a tall slow plume of vented vapour (rotating sheets)
defineProp('lv24_vent', {
  build(mb, p) {
    const st = propGlow('lv24_vapor', 0.85);
    const wb = 0.3, wt = p.opts.w || 3.2, h = p.opts.h || 9;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI, c = Math.cos(a), s = Math.sin(a);
      mb.card([-c * wb, 0, -s * wb, c * wb, 0, s * wb, c * wt, h, s * wt, -c * wt, h, -s * wt], [-s, 0, c], st, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
});

// a lit sphere on legs (propellant)
defineProp('lv24_sphere', {
  build(mb) {
    const w = pm('lv24_hull_w'), dk = pm('lv24_metal');
    const R = 4.4, cy = 8, bands = 6, sides = 10;
    for (let b = 0; b < bands; b++) {
      const a0 = -Math.PI / 2 + (b / bands) * Math.PI, a1 = -Math.PI / 2 + ((b + 1) / bands) * Math.PI;
      const r0 = Math.cos(a0) * R, r1 = Math.cos(a1) * R, y0 = cy + Math.sin(a0) * R, y1 = cy + Math.sin(a1) * R;
      for (let i = 0; i < sides; i++) {
        const t0 = (i / sides) * TAU, t1 = ((i + 1) / sides) * TAU, tm = (t0 + t1) / 2, am = (a0 + a1) / 2;
        const nrm = [Math.cos(am) * Math.cos(tm), Math.sin(am), Math.cos(am) * Math.sin(tm)];
        mb.quad([Math.cos(t1) * r0, y0, Math.sin(t1) * r0, Math.cos(t0) * r0, y0, Math.sin(t0) * r0, Math.cos(t0) * r1, y1, Math.sin(t0) * r1, Math.cos(t1) * r1, y1, Math.sin(t1) * r1], nrm, w, [i / sides * 2 + 0.1, b / bands, (i + 1) / sides * 2, b / bands, (i + 1) / sides * 2, (b + 1) / bands, i / sides * 2, (b + 1) / bands].map((v, k) => (k % 2 ? v : v)));
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 3 - 0.3, 0, sz * 3 - 0.3, sx * 3 + 0.3, 5, sz * 3 + 0.3, dk, { skip: 8 });
  },
  boxes: [[-4, 0, -4, 4, 12, 4]],
});

// ------------------------------------------------------------------ the complex
const kindOf = (zi, zj) => Math.floor(hr(zi, zj, 701) * 3);
function groundMat(lx, lz) {
  // roads run along the zone borders
  const rx = lx < 5 || lx >= Z - 5, rz = lz < 5 || lz >= Z - 5;
  if (rx && rz) return M.lv24_apron;
  if (rx) return M.lv24_road_z;
  if (rz) return M.lv24_road_x;
  if (Math.abs(lx - Z / 2) < PAD && Math.abs(lz - Z / 2) < PAD) return M.lv24_pad;
  return M.lv24_gravel;
}

function gen(zb) {
  const { x0, z0, x1, z1 } = zb;
  zb.noConnectivity = true;
  const zi = fdiv(x0, Z), zj = fdiv(z0, Z);
  const ox = zi * Z, oz = zj * Z;
  zb.floor.fill(0); zb.ceil.fill(NaN); zb.flags.fill(0);
  const w = x1 - x0;
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const i = (z - z0) * w + (x - x0);
    const lx = x - ox, lz = z - oz;
    zb.fmat[i] = groundMat(lx, lz);
    // the flame trench: a bottomless cut under the mount, east-west
    const dx = lx - 64, dz = lz - 64;
    if (Math.abs(dz) < 5 && Math.abs(dx) > 8.5 && Math.abs(dx) < 34) zb.floor[i] = NaN;
  }
  const cx = ox + 64, cz = oz + 64;
  const kind = kindOf(zi, zj);
  const side = hr(zi, zj, 702) < 0.5 ? 1 : -1;               // which side the gantry stands
  // the rocket on its mount, and the up-lighting along it
  if (zb.in(cx, cz)) {
    zb.prop('lv24_rocket', cx, 0, cz, 0, { type: kind });
    const H = [96, 66, 76][kind];
    for (let y = 8; y < H; y += 8) {
      const a = y * 0.9;
      zb.light(cx + Math.cos(a) * 9, y, cz + Math.sin(a) * 9, { color: [1.0, 0.95, 0.86], rad: 11, int: 1.15 });
    }
    // engines flare when the launch button is pressed (channel 10)
    zb.light(cx, 4, cz, { color: [1.0, 0.55, 0.2], rad: 14, int: 1.7, ch: 10 });
    zb.light(cx + 8, 3, cz + 8, { color: [1.0, 0.55, 0.2], rad: 12, int: 1.3, ch: 10 });
    zb.light(cx - 8, 3, cz - 8, { color: [1.0, 0.55, 0.2], rad: 12, int: 1.3, ch: 10 });
    // beacons on the nose
    const top = [108, 76, 80][kind];
    zb.box(cx - 0.25, top, cz - 0.25, cx + 0.25, top + 0.5, cz + 0.25, M.lv24_beacon, { collide: false });
    // vapour venting from the side of the first stage
    zb.dynamic('lv24_vent', cx + 5.3, 36, cz, 0, { w: 3.4, h: 10 }, { spin: 0.25 });
    zb.light(cx + 5.3, 38, cz, { color: [0.8, 0.88, 1.0], rad: 9, int: 0.5 });
    zb.emitter(cx + 5, 30, cz, 'g02_vent', { vol: 1, rad: 40 });
  }
  // floodlit concrete: pools of cold white over the pad
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.3, rr = 22;
    if (zb.in(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr)) zb.light(cx + Math.cos(a) * rr, 3, cz + Math.sin(a) * rr, { color: [0.8, 0.9, 1.0], rad: 11, int: 0.85 });
  }
  for (const [dx, dz] of [[-12, 0], [12, 0], [0, -12], [0, 12]]) zb.light(cx + dx, 3, cz + dz, { color: [0.85, 0.92, 1.0], rad: 10, int: 0.8 });
  // the gantry
  const gx = cx + side * (kind === 1 ? 14 : 12);
  if (zb.in(gx, cz)) {
    zb.prop('lv24_tower', gx, 0, cz, side > 0 ? Math.PI : 0, { h: [74, 52, 60][kind], gap: kind === 1 ? 5.6 : 3.6, arms: [22, 40, 58].filter((y) => y < [74, 52, 60][kind]) });
    for (let y = 6; y < 70; y += 9) zb.light(gx, y, cz + 4.6, { color: [1.0, 0.7, 0.4], rad: 9, int: 0.8 });
    zb.light(gx, [74, 52, 60][kind] + 1, cz, { color: [1, 0.2, 0.15], rad: 6, int: 0.6, ch: 14 });
  }
  // four floodlight masts at the corners of the pad, all looking in at the rocket
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const mx = cx + sx * 31, mz = cz + sz * 31;
    if (zb.in(mx, mz)) zb.prop('lv24_mast', mx, 0, mz, Math.atan2(-sx, sz), { h: 24 });
  }
  // the countdown, on three sides of the mount
  for (const [dx, dz, rot] of [[0, 23, Math.PI], [24, 0, -Math.PI / 2], [-24, 0, Math.PI / 2]]) if (zb.in(cx + dx, cz + dz)) zb.prop('lv24_clock', cx + dx, 0, cz + dz, rot, {});
  // tanks
  for (const [dx, dz] of [[-50, -44], [-40, -44]]) if (zb.in(cx + dx, cz + dz)) zb.prop('lv24_sphere', cx + dx, 0, cz + dz, 0, {});
  // the blockhouse with its console and a door
  const bx = ox + 100, bz = oz + 98;
  if (zb.in(bx, bz)) {
    zb.prop('lv24_bunker', bx, 0, bz, 0, {});
    zb.light(bx, 3.6, bz + 4.8, { color: [1.0, 0.82, 0.55], rad: 8, int: 1.0 });
    zb.prop('lv24_console', bx - 3, 0, bz + 6.5, Math.PI, { use: 'level', label: 'LAUNCH' });
    zb.prop('lv24_marker', bx + 3.6, 0, bz + 5, 0, {});
  }
  placeDoor(zb, bx + 3, bz + 4.2, Math.PI, {});
  // a second, lonely door on a slab out in the field
  if (hr(zi, zj, 711) < 0.6) {
    const fx = ox + 24 + hr(zi, zj, 712) * 24, fz = oz + 84 + hr(zi, zj, 713) * 24;
    if (zb.in(fx, fz)) {
      zb.box(fx - 2.4, 0, fz - 1.4, fx + 2.4, 0.12, fz + 1.4, M.lv24_apron);
      zb.prop('lv24_marker', fx - 1.8, 0.12, fz + 0.8, 0, {});
      zb.light(fx, 3, fz + 1.5, { color: [1.0, 0.8, 0.5], rad: 7, int: 0.8 });
      placeDoor(zb, fx, fz, Math.PI * (hr(zi, zj, 714) < 0.5 ? 1 : 0), { y: 0.12 });
    }
  }
  // road lamps every 32 m along the borders
  for (let t = 16; t < Z; t += 32) {
    for (const [lx, lz] of [[ox + 6, oz + t], [ox + t, oz + 6]]) {
      if (!zb.in(lx, lz)) continue;
      zb.box(lx - 0.1, 0, lz - 0.1, lx + 0.1, 8, lz + 0.1, M.lv24_metal);
      zb.box(lx - 0.5, 8, lz - 0.2, lx + 0.5, 8.3, lz + 0.2, M.lv24_lamp);
      zb.light(lx, 6.5, lz, { color: [1.0, 0.72, 0.4], rad: 9, int: 1.0, ch: hr(lx | 0, lz | 0, 721) < 0.08 ? 3 : 0 });
    }
  }
}

defineZone('lv24_complex', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.19, 0.225, 0.34],
    env: env({ fog: [0.05, 0.062, 0.115], fogNear: 40, fogFar: 104, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'g02_night' }),
  }),
  gen,
});

// the launch button: the engines flare, the ground shakes with sound, and nothing leaves
function ignite(ctx) {
  const st = ctx.state;
  if (st.igniteAt && ctx.time - st.igniteAt < 14) { ctx.game.ui.say('THE CLOCK DOES NOT MOVE.', 3); return; }
  st.igniteAt = ctx.time;
  ctx.game.audioCall('play', 'g02_ignite', undefined, undefined, undefined, { vol: 1 });
  ctx.game.ui.say('IGNITION', 2.5);
  st.said = false;
}

defineLevel(N, {
  name: 'BLAST OFF',
  zoneType: 'lv24_complex',
  zoneSize: Z,
  entry: { x: 64, y: 0, z: 99.5, yaw: 0, pitch: 0.36 },
  doorDensity: 0,
  viewRadius: 5,
  sky: {
    top: [0.012, 0.016, 0.07], horizon: [0.05, 0.062, 0.115], ground: [0.02, 0.026, 0.05], curve: 0.5, stars: 0.95,
    sun: { dir: [-0.55, 0.38, -0.75], color: [0.82, 0.86, 1.0], size: 0.03, halo: 0.18 },
    band: { layer: 'lv24_skyline', color: [0.04, 0.05, 0.1], repeat: 7, top: 0.15, bottom: -0.03, fog: 0.55 },
  },
  light: { phoneRadius: 4.5, phoneIntensity: 0.28 },
  script(ctx, dt) {
    quiet(ctx);
    const st = ctx.state;
    // the flare: engines glow and the floodlights shudder for a few seconds after the button
    flickerHook(ctx, N, (f, t) => {
      const age = st.igniteAt === undefined ? 99 : ctx.time - st.igniteAt;
      let g = 0;
      if (age < 12) g = (age < 2.5 ? age / 2.5 : age < 8 ? 1 : 1 - (age - 8) / 4) * (0.85 + 0.3 * Math.sin(t * 31) * Math.sin(t * 17));
      f.v[10] = Math.max(0, g) * 1.5;
      if (age < 8) f.v[3] = 0.55 + 0.4 * Math.sin(t * 40);
    });
    if (st.igniteAt !== undefined && !st.said && ctx.time - st.igniteAt > 9) { st.said = true; ctx.game.ui.say('T-00:00:01. HOLDING.', 3); }
    ambientEvents(ctx, dt, [
      { snd: 'g02_gust', every: [20, 50], dist: [20, 40], vol: [0.5, 1], y: 3, first: 12 },
      { snd: 'g02_steel', every: [30, 80], dist: [18, 45], vol: [0.4, 0.9], y: 10 },
      { snd: 'relay', every: [25, 70], dist: [16, 40], vol: [0.4, 0.8], y: 2 },
    ]);
  },
  onUse(ctx, item) {
    ignite(ctx);
    void item;
  },
});
