// Level 65: The Empty Beach. A tropical beach in white noon light under a sun that does not move,
// above a sea that is perfectly flat: no waves, no ripples, no sound of water. Sand banks and
// bars run on for ever, divided by waist-deep lagoons; palms, deck chairs in rows all facing the
// water, closed umbrellas, towels laid flat. Far across the water a resort skyline stands
// on every horizon, and a Ferris wheel that does not turn.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propWithXf as withXf } from '../props.js';
import { xfRotX } from '../../core/math.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, noise, fbm, owns, hr, levelDoor, water, env, M } from './kit.js';
import { TAU, clamp, lerp, sstep, matRamp, terrainGrid, shadeIdx, padded, cells, doorSite, noEvents, px, pr } from './g03_common.js';

const N = 65;
const G = 64;
const WY = 1.2;               // the still water
const EX = 32.5, EZ = 50.5;

// ------------------------------------------------------------------ textures
defineTexture('lv65_sand', (p, r) => {
  p.fill([236, 222, 184]);
  p.noise(4, 0.07, 3);
  // wind ripples
  for (let y = 0; y < 64; y += 5) for (let x = 0; x < 64; x++) {
    const yy = y + Math.round(Math.sin(x * 0.25 + y) * 1.5);
    p.set(x, yy, [214, 198, 156], 0.6); p.set(x, yy + 1, [250, 240, 208], 0.4);
  }
  p.speckle(120, [255, 250, 230], 0.3, 0.7);
  p.speckle(70, [190, 170, 130], 0.3, 0.6);
}, 14);
defineTexture('lv65_water', (p, r) => {
  p.fill([64, 204, 196]);
  p.map((x, y, c) => {
    const n = pnoise(x, y, 6, 3) * 0.6 + pnoise(x, y, 12, 9) * 0.4;
    const k = 0.9 + n * 0.2;
    return [c[0] * k, c[1] * k, c[2] * k * 1.02];
  });
  for (let i = 0; i < 14; i++) p.rect((i * 29) % 56, (i * 17 + 5) % 62, 6 + (i % 5), 1, [150, 240, 232], 0.4);
}, 8);
defineTexture('lv65_bark', (p, r) => {
  p.fill([132, 108, 82]);
  p.noise(2, 0.1, 2);
  for (let y = 0; y < 64; y += 5) { p.rect(0, y, 64, 2, [88, 70, 52], 0.8); p.rect(0, y + 2, 64, 1, [158, 132, 100], 0.6); }
  for (let x = 0; x < 64; x += 6) p.rect(x, 0, 1, 64, [104, 84, 62], 0.4);
  void r;
}, 10);
defineTexture('lv65_frond', (p, r) => {
  p.clearAlpha(0);
  // a palm leaf: a rib up the middle and leaflets hanging off it
  for (let y = 0; y < 64; y++) { px(p, 31, y, [88, 120, 48]); px(p, 32, y, [88, 120, 48]); }
  for (let y = 2; y < 62; y += 2) {
    const len = Math.round(26 * Math.sin((y / 64) * Math.PI * 0.95 + 0.12) + 2);
    for (let k = 1; k <= len; k++) {
      const yy = y + Math.floor(k * 0.55);
      const c = k > len * 0.7 ? [92, 154, 58] : [48, 122, 52];
      if (yy < 64) { px(p, 31 - k, yy, c); px(p, 32 + k, yy, c); }
    }
  }
  void r;
}, 8);
defineTexture('lv65_towel', (p, r) => {
  const cols = [[240, 90, 80], [250, 250, 240], [70, 150, 230]];
  p.fill(cols[0]);
  for (let y = 0; y < 64; y += 16) p.rect(0, y, 64, 8, cols[1]);
  p.grain(0.04);
  void r;
}, 6);
defineTexture('lv65_stripe_r', (p) => {
  p.fill([250, 248, 240]);
  for (let x = 0; x < 64; x += 16) p.rect(x, 0, 8, 64, [226, 60, 56]);
  p.grain(0.03);
}, 6);
defineTexture('lv65_stripe_b', (p) => {
  p.fill([250, 248, 240]);
  for (let x = 0; x < 64; x += 16) p.rect(x, 0, 8, 64, [60, 130, 220]);
  p.grain(0.03);
}, 6);
defineTexture('lv65_white', (p, r) => {
  p.fill([246, 244, 236]);
  p.noise(4, 0.04, 2);
  for (let y = 0; y < 64; y += 8) p.rect(0, y, 64, 1, [214, 210, 200], 0.7);
  void r;
}, 6);
defineTexture('lv65_red', (p) => { p.fill([220, 56, 48]); p.noise(4, 0.05, 2); }, 6);
defineTexture('lv65_clouds', (p) => {
  p.map((x, y) => {
    const n = pnoise(x, y * 2, 4, 3) * 0.6 + pnoise(x, y * 2, 8, 8) * 0.4;
    const d = clamp((n - 0.5) * 3, 0, 1);
    return [d * 255, (0.75 + 0.25 * pnoise(x, y, 8, 11)) * 255, 0];
  });
}, 0);
// a resort on the far shore and a Ferris wheel, repeated twice round the horizon
defineTexture('lv65_band', (p, r) => {
  p.clearAlpha(0);
  const cl = (y) => { const t = clamp((63 - y) / 40, 0, 1); return [lerp(150, 120, t), lerp(176, 154, t), lerp(188, 170, t)]; };
  const dot = (x, y) => px(p, x, y, cl(y));
  // low island with palms
  for (let x = 0; x < 64; x++) { const h = 2 + Math.round(pnoise(x, 0, 8, 5) * 3); for (let y = 0; y < h; y++) dot(x, 63 - y); }
  for (const x of [4, 9, 14, 52, 57, 61]) { for (let y = 3; y < 9; y++) dot(x, 63 - y); for (let k = -3; k <= 3; k++) dot(x + k, 63 - 9 - Math.abs(k) / 2); }
  // hotel towers
  for (const [x, w, h] of [[20, 4, 24], [25, 3, 32], [29, 5, 20], [34, 3, 38], [38, 4, 26]]) {
    for (let y = 3; y < h; y++) for (let q = 0; q < w; q++) dot(x + q, 63 - y);
    for (let y = 6; y < h - 2; y += 4) for (let q = 1; q < w - 1; q++) px(p, x + q, 63 - y, [236, 246, 250]);
  }
  // the wheel
  const cx = 46, cy = 38, R = 14;
  for (let a = 0; a < 360; a += 3) { const x = Math.round(cx + Math.cos((a * Math.PI) / 180) * R), y = Math.round(cy + Math.sin((a * Math.PI) / 180) * R); dot(x, y); dot(x + 1, y); }
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; for (let t = 0; t <= R; t++) dot(Math.round(cx + Math.cos(a) * t), Math.round(cy + Math.sin(a) * t)); }
  for (let y = cy; y < 63; y++) { dot(cx - 6 - Math.floor((y - cy) * 0.18), y); dot(cx + 6 + Math.floor((y - cy) * 0.18), y); }
  void r;
}, 5);

const SAND = matRamp('lv65_sand', 'lv65_sand', { s: 2, surf: 'grass' }, [1.0, 1.0, 1.0]);
const WETS = matRamp('lv65_wets', 'lv65_sand', { s: 2, surf: 'wet' }, [0.82, 0.84, 0.86]);
const BED = matRamp('lv65_bed', 'lv65_sand', { s: 2, surf: 'water' }, [0.78, 0.98, 1.0]);
defineMaterial('lv65_water', 'lv65_water', { s: 4, surf: 'water' });          // no WOBBLE, no SCROLL: it never moves
defineMaterial('lv65_bark', 'lv65_bark', { s: 1, surf: 'wood' });
defineMaterial('lv65_towel', 'lv65_towel', { s: 1, surf: 'carpet' });
defineMaterial('lv65_stripe_r', 'lv65_stripe_r', { s: 1, surf: 'plastic' });
defineMaterial('lv65_stripe_b', 'lv65_stripe_b', { s: 1, surf: 'plastic' });
defineMaterial('lv65_white', 'lv65_white', { s: 1.2, surf: 'wood' });
defineMaterial('lv65_red', 'lv65_red', { s: 1.2, surf: 'wood' });

// ------------------------------------------------------------------ terrain
// land where the noise is high, shallow sea where it is low; near the door a beach with the sea ahead
const landN = (x, z) => fbm(x, z, 120, 7, 3) * 0.62 + 0.19 + 0.32 * Math.tanh((z - (EZ - 28)) / 17) * Math.exp(-((x - EX) ** 2) / (2 * 110 * 110));
const baseH = (x, z) => {
  const n = landN(x, z), s = n - 0.5;
  const dunes = (noise(x, z, 14, 3) - 0.5) * 0.5 + (noise(x, z, 36, 9) - 0.5) * 0.8;
  return WY + (s > 0 ? Math.min(1.9, s * 7) + sstep(0.05, 0.3, s) * dunes : Math.max(-1.05, s * 5.2) + (noise(x, z, 9, 5) - 0.5) * 0.16 * sstep(0, -0.3, s));
};
const ENTRY_PAD = { x: EX, z: EZ, r0: 3.4, r1: 8 };
ENTRY_PAD.h = baseH(EX, EZ);

// ------------------------------------------------------------------ props
defineProp('lv65_palm', {
  build(mb, p, r) {
    const bark = S('lv65_bark'), fr = T('lv65_frond');
    const H = (p.opts.h ?? 5.5) * r.range(0.9, 1.15), lean = r.range(-0.5, 0.5), la = r.range(0, TAU);
    const seg = 5;
    let px0 = 0, py0 = -0.2, pz0 = 0;
    for (let k = 1; k <= seg; k++) {
      const t = k / seg, off = lean * t * t * H * 0.35;
      const x = Math.cos(la) * off, z = Math.sin(la) * off, y = H * t;
      mb.rod(px0, py0, pz0, x, y, z, 0.2 - 0.07 * t, 5, bark, k === seg);
      px0 = x; py0 = y; pz0 = z;
    }
    // crown: fronds that rise and then droop
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + r.range(-0.2, 0.2), L = r.range(2.3, 3.2), up = r.range(0.4, 1.0);
      const ca = Math.cos(a), sa = Math.sin(a), px1 = -sa * 0.8, pz1 = ca * 0.8;
      const bx = px0, by = py0, bz = pz0;
      const mx = bx + ca * L * 0.55, my = by + up, mz = bz + sa * L * 0.55;
      const ex = bx + ca * L, ey = by + up - 0.9, ez = bz + sa * L;
      const w = 0.7;
      mb.card([bx - px1 * w * 0.3, by, bz - pz1 * w * 0.3, bx + px1 * w * 0.3, by, bz + pz1 * w * 0.3, mx + px1 * w, my, mz + pz1 * w, mx - px1 * w, my, mz - pz1 * w], [0, 1, 0], fr, [0, 1, 1, 1, 1, 0.45, 0, 0.45]);
      mb.card([mx - px1 * w, my, mz - pz1 * w, mx + px1 * w, my, mz + pz1 * w, ex + px1 * w * 0.2, ey, ez + pz1 * w * 0.2, ex - px1 * w * 0.2, ey, ez - pz1 * w * 0.2], [0, 1, 0], fr, [0, 0.45, 1, 0.45, 1, 0, 0, 0]);
    }
    for (let k = 0; k < 3; k++) mb.box(px0 - 0.12 + k * 0.1, py0 - 0.3, pz0 - 0.1, px0 + 0.02 + k * 0.1, py0 - 0.1, pz0 + 0.04, S('lv65_bark'));
  },
  boxes: [[-0.25, 0, -0.25, 0.25, 3, 0.25]],
});
// a deck chair, reclined, facing local -z
defineProp('lv65_chair', {
  build(mb, p, r) {
    const st = S(p.opts.blue ? 'lv65_stripe_b' : 'lv65_stripe_r'), wood = S('wood_light');
    for (const x of [-0.27, 0.27]) {
      mb.box(x - 0.025, 0, -0.45, x + 0.025, 0.05, -0.38, wood);
      mb.box(x - 0.025, 0, 0.35, x + 0.025, 0.05, 0.42, wood);
      withXf(mb, xfRotX(0.9), () => mb.box(x - 0.025, 0.0, 0.0, x + 0.025, 0.95, 0.04, wood));
    }
    withXf(mb, xfRotX(-0.45), () => mb.box(-0.27, 0.25, -0.3, 0.27, 0.28, 0.5, st));
    withXf(mb, xfRotX(0.95), () => mb.box(-0.27, 0.05, 0.12, 0.27, 0.08, 0.95, st));
    void r;
  },
  boxes: [[-0.3, 0, -0.45, 0.3, 0.5, 0.5]],
});
// an open umbrella
defineProp('lv65_umbrella', {
  build(mb, p, r) {
    const A = S('lv65_stripe_r'), B = S('lv65_stripe_b'), pole = S('chrome');
    mb.rod(0, -0.1, 0, 0, 2.3, 0, 0.025, 4, pole, false);
    const R = 1.5, H = 2.35, n = 8, c = p.opts.blue ? B : A;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
      mb.tri3([0, H + 0.38, 0], [Math.cos(a0) * R, H, Math.sin(a0) * R], [Math.cos(a1) * R, H, Math.sin(a1) * R], k % 2 ? c : S('lv65_white'), [0.5, 0, 0, 1, 1, 1]);
      mb.tri3([0, H + 0.38, 0], [Math.cos(a1) * R, H, Math.sin(a1) * R], [Math.cos(a0) * R, H, Math.sin(a0) * R], k % 2 ? c : S('lv65_white'), [0.5, 0, 1, 1, 0, 1]);
    }
    void r;
  },
  boxes: [[-0.1, 0, -0.1, 0.1, 2.3, 0.1]],
});
defineProp('lv65_towel', {
  build(mb, p, r) {
    mb.box(-0.45, 0, -0.9, 0.45, 0.025, 0.9, S('lv65_towel'));
    void r;
  },
});
// a lifeguard tower on stilts, white and red, facing the water
defineProp('lv65_tower', {
  build(mb, p, r) {
    const wh = S('lv65_white'), rd = S('lv65_red'), wood = S('wood_light');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 1.1 - 0.07, -0.2, sz * 1.1 - 0.07, sx * 1.1 + 0.07, 2.2, sz * 1.1 + 0.07, wood);
    mb.box(-1.3, 2.1, -1.3, 1.3, 2.25, 1.3, wood);
    mb.box(-1.15, 2.25, 0.9, 1.15, 3.4, 1.05, wh);
    mb.box(-1.15, 2.25, -1.15, -1.0, 3.4, 1.05, wh);
    mb.box(1.0, 2.25, -1.15, 1.15, 3.4, 1.05, wh);
    mb.box(-1.4, 3.4, -1.4, 1.4, 3.55, 1.4, rd);
    mb.box(-0.1, 3.55, -0.1, 0.1, 5.0, 0.1, wood);
    mb.box(0.1, 4.4, -0.05, 1.1, 4.95, 0.05, rd);
    for (let k = 0; k < 7; k++) mb.box(-0.4, 0.3 * k, -1.7 - k * 0.0, 0.4, 0.3 * k + 0.05, -1.3, wood);
    void r;
  },
  boxes: [[-1.3, 0, -1.3, 1.3, 2.3, 1.3]],
});
// a sign: the place is not telling the time
defineProp('lv65_sign', {
  build(mb, p) {
    const wood = S('wood_light'), face = S('lv65_white');
    mb.box(-0.05, -0.1, -0.04, 0.05, 1.5, 0.04, wood);
    mb.box(-0.55, 0.9, -0.06, 0.55, 1.5, 0.02, [wood, wood, wood, wood, wood, face], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
    mb.box(-0.4, 1.12, -0.065, 0.4, 1.16, -0.06, S('lv65_red'));
    mb.box(-0.4, 1.28, -0.065, 0.4, 1.31, -0.06, S('lv65_red'));
  },
  boxes: [[-0.6, 0, -0.1, 0.6, 1.5, 0.1]],
  use: 'level',
});
defineProp('lv65_buoy', {
  build(mb, p) {
    mb.cyl(0, -0.3, 0, 0.22, 0.5, 6, S('lv65_red'), 3);
    mb.cyl(0, 0.2, 0, 0.19, 0.12, 6, S('lv65_white'), 3);
    mb.cyl(0, 0.32, 0, 0.14, 0.18, 6, S('lv65_red'), 3);
  },
});

const SIGNS = [
  'TIDE TABLE\nHIGH 2:00\nLOW 2:00\nHIGH 2:00',
  'SWIMMING PERMITTED\nALL DAY\nALL DAY',
  'NO WAVES TODAY.\nNO WAVES TOMORROW.',
  'THE SUN SETS AT 2:00.\nIT HAS NOT YET BEEN 2:00.',
];

// ------------------------------------------------------------------ zone
function gen(zb) {
  zb.noConnectivity = true;
  const pads = [ENTRY_PAD];
  let door = doorSite(zb, 0.7, 71);
  if (door && Math.hypot(door.x - EX, door.z - EZ) < 20) door = null;
  if (door) pads.push({ x: door.x, z: door.z, r0: 2.6, r1: 7.6, h: Math.max(baseH(door.x, door.z), WY + 0.32) });
  const hf = padded(baseH, pads);
  terrainGrid(zb, hf, (x, z, h, shade) => {
    const k = shadeIdx(clamp(shade * 0.5 + 0.42 + (noise(x, z, 7, 3) - 0.5) * 0.18, 0, 0.999));
    if (h < WY - 0.04) return BED[k];
    return h < WY + 0.28 ? WETS[k] : SAND[k];
  }, [0.5, 0.8], 1.0);
  water(zb, zb.x0, zb.z0, zb.x1, zb.z1, WY, M.lv65_water, 0.55, { sub: 8 });

  const land = (x, z, m = 0.3) => hf(x, z) > WY + m;
  const clear = (x, z, m = 2.5) => Math.hypot(x - EX, z - EZ) > 6 && !(door && Math.hypot(x - door.x, z - door.z) < m + 1.5);

  // palms in groves on the dry sand
  cells(zb, 7, (i, j) => {
    const x = (i + 0.15 + hr(i, j, 12) * 0.7) * 7, z = (j + 0.15 + hr(i, j, 13) * 0.7) * 7;
    if (!owns(zb, x, z) || !land(x, z, 0.5) || !clear(x, z, 2.5)) return;
    const grove = noise(x, z, 38, 21);
    if (hr(i, j, 11) > 0.12 + grove * 0.75) return;
    zb.prop('lv65_palm', x, hf(x, z) - 0.05, z, 0, { h: 4.4 + hr(i, j, 14) * 3 });
  });
  // beach furniture along the water's edge: chairs in rows, every one facing the sea
  cells(zb, 30, (i, j) => {
    if (hr(i, j, 31) > 0.5) return;
    const x = (i + 0.2 + hr(i, j, 32) * 0.6) * 30, z = (j + 0.2 + hr(i, j, 33) * 0.6) * 30;
    // walk downhill to the shore
    let sx = x, sz = z;
    for (let k = 0; k < 40 && hf(sx, sz) > WY + 0.5; k++) {
      const gx = hf(sx + 0.8, sz) - hf(sx - 0.8, sz), gz = hf(sx, sz + 0.8) - hf(sx, sz - 0.8), l = Math.hypot(gx, gz) || 1;
      sx -= (gx / l) * 1.2; sz -= (gz / l) * 1.2;
    }
    if (hf(sx, sz) < WY + 0.5 || hf(sx, sz) > WY + 1.4) return;
    // shore normal (downhill) and tangent
    const gx = hf(sx + 1, sz) - hf(sx - 1, sz), gz = hf(sx, sz + 1) - hf(sx, sz - 1), l = Math.hypot(gx, gz);
    if (l < 0.02) return;
    const fx = -gx / l, fz = -gz / l, tx = -fz, tz = fx;
    const n = 3 + Math.floor(hr(i, j, 34) * 3), rot = Math.atan2(fx, -fz);
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * 1.9, cx = sx + tx * off, cz = sz + tz * off;
      if (!owns(zb, cx, cz) || !land(cx, cz, 0.25) || !clear(cx, cz, 2)) continue;
      zb.prop('lv65_chair', cx, hf(cx, cz), cz, rot, { blue: k % 2 === 1 });
      if (hr(i + k, j, 35) < 0.55) zb.prop('lv65_towel', cx + fx * 1.2, hf(cx, cz) - 0.02, cz + fz * 1.2, rot, {});
      if (k === Math.floor(n / 2) && hr(i, j, 36) < 0.8) zb.prop('lv65_umbrella', cx - fx * 0.2 - tx * 0.95, hf(cx, cz), cz - fz * 0.2 - tz * 0.95, 0, { blue: hr(i, j, 37) < 0.5 });
    }
    if (hr(i, j, 38) < 0.35) {
      const ux = sx - fx * 3.5 + tx * 7, uz = sz - fz * 3.5 + tz * 7;
      if (owns(zb, ux, uz) && land(ux, uz, 0.3) && clear(ux, uz, 3)) zb.prop('lv65_tower', ux, hf(ux, uz) - 0.1, uz, rot, {});
    }
    if (hr(i, j, 39) < 0.4) {
      const bx = sx - fx * 2.2 + tx * 4, bz = sz - fz * 2.2 + tz * 4;
      if (owns(zb, bx, bz) && land(bx, bz, 0.5) && clear(bx, bz, 2)) zb.prop('lv65_sign', bx, hf(bx, bz), bz, rot, { text: SIGNS[Math.floor(hr(i, j, 40) * SIGNS.length)], label: 'READ' });
    }
  });
  // a line of buoys out on the flat water, perfectly still
  cells(zb, 48, (i, j) => {
    if (hr(i, j, 51) > 0.3) return;
    const alongX = hr(i, j, 52) < 0.5, a = (alongX ? j : i) * 48 + 8 + hr(i, j, 53) * 32, s0 = (alongX ? i : j) * 48 + 4 + hr(i, j, 54) * 12;
    for (let k = 0; k < 6; k++) {
      const x = alongX ? s0 + k * 5 : a, z = alongX ? a : s0 + k * 5;
      if (owns(zb, x, z) && hf(x, z) < WY - 0.3) zb.prop('lv65_buoy', x, WY - 0.05, z, 0, {});
    }
  });
  if (door) levelDoor(zb, door.x, door.z, door.rot, { y: pads[pads.length - 1].h });
}

defineZone('lv65_beach', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [1.12, 1.1, 1.02],
    env: env({ fog: [0.84, 0.93, 0.95], fogNear: 24, fogFar: 84, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'lv65_calm' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THE EMPTY BEACH',
  zoneType: 'lv65_beach',
  zoneSize: G,
  entry: { x: EX, y: ENTRY_PAD.h, z: EZ, yaw: 0 },
  doorDensity: 0,
  viewRadius: 5,
  grade: { sat: 1.12, tint: [1.0, 1.02, 1.03] },
  sky: {
    top: [0.26, 0.58, 0.94], horizon: [0.84, 0.93, 0.95], ground: [0.62, 0.84, 0.86], curve: 0.42,
    sun: { dir: [0.18, 0.3, -1], color: [1.0, 0.99, 0.94], size: 0.06, halo: 0.55 },
    // clouds that never drift: speed 0
    clouds: { layer: 'lv65_clouds', color: [1, 1, 1], amount: 0.5, speed: 0, scale: 0.35 },
    band: { layer: 'lv65_band', color: [1, 1, 1], repeat: 2, top: 0.17, bottom: -0.02, fog: 0.4 },
  },
  light: { phoneRadius: 4, phoneIntensity: 0.15 },
  script(ctx) { noEvents(ctx); },
  onUse(ctx, item) {
    const t = item.prop && item.prop.opts && item.prop.opts.text;
    if (t) ctx.game.ui.say(t.replace(/\n/g, '  '), 6);
  },
});
void lerp; void pr; void pnoise;
