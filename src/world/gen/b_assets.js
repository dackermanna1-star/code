// Shared textures, materials and props for the corridors / school / lobby zone types.
// Everything registered here is prefixed b_ to stay clear of other modules.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, M, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propGlow as glow, propWithXf as withXf, PROP_FIT as FIT } from '../props.js';
import { xfRotY, xfRotX, xfTranslate, xfMul } from '../../core/math.js';

const mulc = (c, m) => [c[0] * m, c[1] * m, c[2] * m];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------------ textures
// hotel stripe wallpaper: broad two-tone bands with thin gold pinstripes
defineTexture('b_wp_hotel', (p) => {
  const base = [194, 172, 130], red = [132, 60, 50], gold = [206, 168, 98], mot = [168, 142, 100];
  p.fill(base);
  p.noise(3, 0.04, 2);
  // burgundy double pinstripe with a gold line every 16 px
  for (let y = 0; y < 64; y++) for (let x0 = 0; x0 < 64; x0 += 16) {
    p.set(x0, y, red); p.set(x0 + 1, y, red, 0.85); p.set(x0 + 3, y, red, 0.7);
    p.set(x0 + 2, y, gold, 0.8); p.set(x0 + 15, y, gold, 0.5);
  }
  // small diamond motifs, staggered between the stripes
  for (let y0 = 4; y0 < 64; y0 += 16) for (let x0 = 9; x0 < 64; x0 += 16) {
    const yy = y0 + ((x0 >> 4) % 2) * 8;
    for (const [dx, dy] of [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2]]) p.set(x0 + dx, yy + dy, mot, 0.9);
    p.set(x0, yy, red, 0.6);
  }
  p.grain(0.025);
});
// hotel damask: dark teal ground with a paler medallion lattice
defineTexture('b_wp_damask', (p) => {
  const base = [64, 88, 82], motif = [96, 124, 110], hi = [120, 146, 126];
  p.fill(base);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const cx = tx * 32 + 16 + (ty % 2 ? 16 : 0), cy = ty * 32 + 16;
    for (let y = -12; y <= 12; y++) for (let x = -9; x <= 9; x++) {
      const d = Math.abs(x) / 9 + Math.abs(y) / 12;
      if (d > 0.92 && d < 1.05) p.set(cx + x, cy + y, motif);
      else if (d < 0.5 && (Math.abs(x) + Math.abs(y)) % 3 === 0) p.set(cx + x, cy + y, motif, 0.8);
    }
    p.set(cx, cy, hi); p.set(cx, cy - 2, hi, 0.7); p.set(cx, cy + 2, hi, 0.7);
  }
  p.noise(3, 0.06, 2);
  p.grain(0.03);
});
// corridor carpet: navy ground, gold and rust interlocking diamonds
defineTexture('b_carpet_hall', (p) => {
  p.fill([44, 52, 86]);
  p.grain(0.1);
  const gold = [168, 132, 66], rust = [128, 58, 40], dk = [30, 34, 58];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = Math.abs(((x + 16) % 32) - 16), dy = Math.abs(((y + 16) % 32) - 16);
    const s = dx + dy;
    if (s === 14 || s === 15) p.set(x, y, gold);
    else if (s === 9) p.set(x, y, rust);
    else if (s < 4) p.set(x, y, s < 2 ? gold : dk);
    const ex = Math.abs((x % 32) - 16), ey = Math.abs((y % 32) - 16);
    if (ex + ey < 3) p.set(x, y, rust);
  }
  p.speckle(160, [24, 28, 50], 0.2, 0.5);
});
// terrazzo: cream cement with coloured chips
defineTexture('b_terrazzo', (p, r) => {
  p.fill([196, 190, 176]);
  p.noise(4, 0.04, 2);
  const chips = [[150, 144, 134], [120, 112, 104], [170, 120, 90], [96, 104, 110], [222, 218, 206], [140, 150, 130]];
  for (let i = 0; i < 520; i++) {
    const x = r.int(0, 63), y = r.int(0, 63), c = r.pick(chips);
    p.set(x, y, c);
    if (r.chance(0.35)) p.set(x + 1, y, c, 0.8);
    if (r.chance(0.2)) p.set(x, y + 1, c, 0.7);
  }
  for (let i = 0; i < 64; i++) { p.set(i, 0, [150, 146, 136], 0.8); p.set(0, i, [150, 146, 136], 0.8); }
  p.grain(0.03);
});
// hotel room door: dark stained wood, raised panels, peephole
defineTexture('b_door_hotel', (p) => {
  p.fill([96, 60, 36]);
  p.map((x, y, c) => mulc(c, 0.88 + 0.18 * (Math.sin(x * 0.45 + pnoise(x, y, 4, p.seed) * 7) * 0.5 + 0.5)));
  p.bevel(0, 0, 64, 64, 0.1, 0.25);
  p.bevel(8, 5, 48, 24, 0.14, 0.18);
  p.bevel(10, 7, 44, 20, -0.12, -0.08);
  p.bevel(8, 34, 48, 26, 0.14, 0.18);
  p.bevel(10, 36, 44, 22, -0.12, -0.08);
  p.disc(32, 19, 1.6, [24, 20, 18]);
  p.disc(32, 19, 0.8, [150, 150, 150]);
}, 16);
// painted steel door with a narrow wired vision panel and kick plate (tinted per use)
defineTexture('b_door_inst', (p) => {
  p.fill([176, 178, 172]);
  p.noise(4, 0.03, 2);
  p.bevel(0, 0, 64, 64, 0.1, 0.25);
  p.rect(40, 6, 12, 22, [44, 54, 60]);
  for (let y = 8; y < 28; y += 3) p.rect(40, y, 12, 1, [70, 80, 84]);
  for (let x = 42; x < 52; x += 3) p.rect(x, 6, 1, 22, [70, 80, 84]);
  p.frame(39, 5, 14, 24, [120, 122, 118]);
  p.rect(2, 55, 60, 8, [150, 152, 156]);
  for (let x = 2; x < 62; x += 2) p.rect(x, 55, 1, 8, [170, 172, 176], 0.5);
  p.frame(2, 55, 60, 8, [110, 112, 116]);
}, 16);
// "do not disturb" hanger (alpha decal)
defineTexture('b_dnd', (p) => {
  p.fill([170, 26, 30]);
  p.clearAlpha(0);
  p.rectA(16, 2, 32, 60, 255);
  p.disc(32, 9, 5, [0, 0, 0]);
  for (let y = 4; y < 15; y++) for (let x = 27; x < 38; x++) if (Math.hypot(x + 0.5 - 32, y + 0.5 - 9) < 4.5) p.alpha(x, y, 0);
  p.text('DO', 26, 18, [240, 230, 220]);
  p.text('NOT', 23, 28, [240, 230, 220]);
  p.text('DIS-', 20, 40, [240, 230, 220]);
  p.text('TURB', 20, 50, [240, 230, 220]);
  p.frame(16, 2, 32, 60, [120, 18, 22]);
}, 8);
// ice machine front
defineTexture('b_ice', (p) => {
  p.fill([168, 172, 176]);
  p.map((x, y, c) => mulc(c, 1 + (pnoise(x * 0.1, y, 32, p.seed) - 0.5) * 0.14));
  p.rect(6, 4, 52, 14, [40, 70, 130]);
  p.text('ICE', 23, 8, [230, 236, 244]);
  p.rect(10, 30, 44, 22, [30, 32, 36]);
  p.frame(9, 29, 46, 24, [120, 124, 128]);
  p.rect(14, 46, 36, 4, [120, 140, 150]);
  p.rect(4, 58, 56, 4, [60, 62, 66]);
  for (let x = 8; x < 56; x += 3) p.rect(x, 59, 2, 2, [30, 30, 32]);
}, 16);
// framed hotel painting: pale seascape in a gilt frame
defineTexture('b_paint_sea', (p) => {
  p.fill([150, 112, 50]);
  for (let y = 6; y < 58; y++) {
    const t = (y - 6) / 52;
    const c = y < 34 ? mix([200, 196, 176], [150, 168, 180], t * 1.6) : mix([90, 120, 130], [60, 86, 100], (y - 34) / 24);
    p.rect(6, y, 52, 1, c);
  }
  p.disc(40, 24, 4, [226, 210, 160]);
  for (let k = 0; k < 6; k++) p.rect(10 + k * 7, 38 + (k % 3) * 5, 5, 1, [170, 190, 196], 0.7);
  p.rect(6, 33, 52, 1, [120, 140, 150]);
  p.bevel(0, 0, 64, 64, 0.25, 0.3);
  p.bevel(3, 3, 58, 58, -0.15, -0.1);
  p.bevel(6, 6, 52, 52, -0.25, -0.1);
}, 16);
// elevator call buttons + floor indicator (alpha decal: plate with two buttons)
defineTexture('b_elev_btn', (p) => {
  p.fill([168, 170, 176]);
  p.clearAlpha(0);
  p.rectA(18, 4, 28, 56, 255);
  p.map((x, y, c) => mulc(c, 1 + (pnoise(x * 0.1, y, 32, p.seed) - 0.5) * 0.12));
  p.frame(18, 4, 28, 56, [110, 112, 118]);
  p.disc(32, 22, 6, [80, 80, 84]); p.disc(32, 22, 4.5, [240, 210, 120]);
  p.disc(32, 42, 6, [80, 80, 84]); p.disc(32, 42, 4.5, [200, 200, 196]);
  p.line(29, 24, 32, 19, [90, 60, 20]); p.line(32, 19, 35, 24, [90, 60, 20]);
  p.line(29, 40, 32, 45, [80, 80, 80]); p.line(32, 45, 35, 40, [80, 80, 80]);
}, 8);
// "take a number / now serving" sign
defineTexture('b_take_num', (p) => {
  p.fill([200, 40, 40]);
  p.rect(0, 0, 64, 30, [200, 40, 40]);
  p.text('TAKE A', 14, 4, [250, 240, 230]);
  p.text('NUMBER', 14, 14, [250, 240, 230]);
  p.rect(0, 30, 64, 34, [24, 24, 26]);
  p.text('NOW', 4, 34, [210, 210, 200]);
  p.text('SERVING', 4, 43, [210, 210, 200]);
  p.rect(46, 34, 15, 26, [40, 8, 8]);
  p.text('0', 48, 36, [255, 70, 50], 2);
  p.frame(0, 0, 64, 64, [120, 20, 20]);
}, 16);
// projection screen with no input
defineTexture('b_nosignal', (p) => {
  p.fill([28, 54, 168]);
  p.map((x, y, c) => mulc(c, y % 2 ? 0.92 : 1));
  p.rect(10, 26, 44, 12, [20, 40, 130]);
  p.text('NO', 26, 28, [220, 226, 240]);
  p.text('SIGNAL', 14, 37, [220, 226, 240]);
}, 8);
// generic hallway signs
defineTexture('b_sign_rooms', (p) => {
  p.fill([40, 34, 30]);
  p.text('ROOMS', 18, 14, [214, 184, 112]);
  p.text('→', 29, 34, [214, 184, 112], 1);
  p.text('ICE', 23, 46, [214, 184, 112]);
  p.frame(0, 0, 64, 64, [150, 120, 64]); p.frame(2, 2, 60, 60, [90, 72, 40]);
}, 8);

// gym court markings (alpha decal): a white ring
defineTexture('b_court', (p) => {
  p.fill([236, 236, 228]);
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
    if (d > 28.5 && d < 31) p.alpha(x, y, 255);
  }
}, 2);

// ------------------------------------------------------------------ materials (keep this list short)
defineMaterial('b_wp_hotel', 'b_wp_hotel', { s: 1.2, surf: 'drywall', stain: 0.12 });
defineMaterial('b_wp_damask', 'b_wp_damask', { s: 1.1, surf: 'drywall', stain: 0.1 });
defineMaterial('b_carpet_hall', 'b_carpet_hall', { s: 1.6, surf: 'carpet', stain: 0.08 });
defineMaterial('b_terrazzo', 'b_terrazzo', { s: 2.0, surf: 'tile', stain: 0.05 });

// ------------------------------------------------------------------ props
const BRASS = [1.25, 1.0, 0.45];

// Wall sconce: back plate, short arm, glowing fabric shade. Mounted with the wall at local z=0.
defineProp('b_sconce', {
  build(mb, p) {
    const on = p.opts.on !== false;
    const metal = S('chrome', { tint: BRASS });
    mb.box(-0.05, -0.08, -0.02, 0.05, 0.08, 0, metal, { skip: 16 });
    mb.box(-0.015, -0.02, -0.12, 0.015, 0.0, -0.02, metal, { skip: 16 | 32 });
    const shade = on ? glow('lamp_shade', p.opts.b || 0.95, p.opts.ch || 0) : T('lamp_shade', { tint: [0.7, 0.66, 0.6] });
    mb.cyl(0, 0.0, -0.14, 0.085, 0.17, 6, shade, 0);
  },
  light: { y: 0.12, z: -0.32, color: [1.0, 0.76, 0.48], rad: 5.0, int: 0.6, cond: (p) => p.opts.on !== false },
});

// Locked door set flush against a wall (wall at local z=0, corridor toward -z): leaf, frame,
// lever with a key-card lock, optional number plate and do-not-disturb hanger.
// opts: tex, tint, frame (material name), num (string), plate ('door' | 'wall' | false), dnd, lock
defineProp('b_doorset', {
  build(mb, p) {
    const o = p.opts;
    const fr = S(o.frame || 'wood_dark', o.frameTint ? { tint: o.frameTint } : undefined);
    const leafTex = T(o.tex || 'b_door_hotel', o.tint ? { tint: o.tint } : undefined);
    const edge = S('wood_dark');
    // leaf (front face only + thin edges)
    mb.box(-0.42, 0, -0.035, 0.42, 2.05, -0.005, [edge, edge, null, null, null, leafTex], { uv: ['world', 'world', 'world', 'world', 'world', FIT] });
    // frame: jambs and head
    mb.box(-0.5, 0, -0.05, -0.42, 2.13, 0, fr, { skip: 4 | 8 | 16 });
    mb.box(0.42, 0, -0.05, 0.5, 2.13, 0, fr, { skip: 4 | 8 | 16 });
    mb.box(-0.42, 2.05, -0.05, 0.42, 2.13, 0, fr, { skip: 1 | 2 | 4 | 16 });
    // lever handle
    const hw = S(o.hw || 'chrome', o.hw ? undefined : { tint: o.brass === false ? [1, 1, 1] : BRASS });
    mb.box(0.24, 0.99, -0.09, 0.36, 1.03, -0.035, hw, { skip: 16 });
    if (o.lock) {
      mb.box(0.27, 1.08, -0.05, 0.35, 1.24, -0.035, S('plastic_black'), { skip: 16 });
      const led = glow('taillight', 1.2, 0);
      mb.quad([0.32, 1.2, -0.051, 0.3, 1.2, -0.051, 0.3, 1.22, -0.051, 0.32, 1.22, -0.051], [0, 0, -1], led, [0, 0.2, 1, 0.2, 1, 0, 0, 0]);
    }
    // number plate with digits
    if (o.num && o.plate !== false) {
      const s = String(o.num);
      const onWall = o.plate === 'wall';
      const cx = onWall ? 0.72 : 0, cy = onWall ? 1.5 : 1.62, z = onWall ? -0.012 : -0.04;
      const pw = 0.07 + s.length * 0.062, ph = 0.13;
      const plate = onWall && o.plateMat ? S(o.plateMat) : S('chrome', { tint: o.plateTint || BRASS });
      mb.box(cx - pw / 2, cy - ph / 2, z - 0.008, cx + pw / 2, cy + ph / 2, z, plate, { skip: 16 });
      const dt = o.digitTint || [0.18, 0.14, 0.1];
      for (let k = 0; k < s.length; k++) {
        const dx = cx + ((s.length - 1) / 2 - k) * 0.062;
        const st = T('digit_' + s[k], { tint: dt });
        mb.quad([dx + 0.04, cy - 0.052, z - 0.01, dx - 0.04, cy - 0.052, z - 0.01, dx - 0.04, cy + 0.052, z - 0.01, dx + 0.04, cy + 0.052, z - 0.01], [0, 0, -1], st, [0, 1, 1, 1, 1, 0, 0, 0]);
      }
    }
    if (o.dnd) {
      const st = T('b_dnd');
      mb.quad([0.33, 0.72, -0.1, 0.21, 0.72, -0.1, 0.21, 1.0, -0.1, 0.33, 1.0, -0.1], [0, 0, -1], st, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
  boxes: [[-0.5, 0, -0.06, 0.5, 2.13, 0]],
  use: 'locked',
});

// Ice machine
defineProp('b_ice_machine', {
  build(mb) {
    const body = S('metal');
    mb.box(-0.38, 0, -0.34, 0.38, 1.72, 0.34, [body, body, body, body, body, T('b_ice')], { uv: ['world', 'world', 'world', 'world', 'world', FIT] });
    mb.box(-0.4, 1.72, -0.36, 0.4, 1.76, 0.36, S('plastic_gray'));
  },
  boxes: [[-0.4, 0, -0.36, 0.4, 1.76, 0.36]],
  emitter: { snd: 'fridge', vol: 0.55, rad: 7, y: 1 },
  use: 'vending',
});

// Wall-mounted drinking fountain (wall at local z=0)
defineProp('b_fountain', {
  build(mb, p) {
    const st = S(p.opts.mat || 'chrome');
    mb.box(-0.26, 0.82, -0.36, 0.26, 0.96, 0, st, { skip: 16 });
    mb.box(-0.24, 0.96, -0.36, 0.24, 0.975, -0.06, S('metal_dark'), { skip: 16 | 8 });
    mb.box(-0.26, 0.96, -0.06, 0.26, 1.1, 0, st, { skip: 16 | 8 });
    mb.box(-0.03, 0.97, -0.2, 0.03, 1.02, -0.14, S('chrome'));
    mb.box(0.27, 0.86, -0.3, 0.3, 0.92, -0.2, S('metal_dark'));
    mb.rod(0, 0.82, -0.08, 0, 0.0, -0.06, 0.03, 4, S('chrome'));
  },
  boxes: [[-0.26, 0.6, -0.36, 0.26, 1.1, 0]],
  use: 'cooler',
});

// Basketball backboard and rim without a net, wall mounted (wall at local z=0)
defineProp('b_hoop', {
  build(mb) {
    const w = S('plastic_white'), o = S('plastic_orange'), fr = S('metal_dark');
    // braces from the wall
    for (const s of [-1, 1]) mb.box(s * 0.5 - 0.03, 3.2, -1.15, s * 0.5 + 0.03, 3.26, 0, fr);
    mb.box(-0.55, 3.0, -0.06, 0.55, 3.6, 0, fr, { skip: 16 });
    // board
    mb.box(-0.9, 2.9, -1.2, 0.9, 3.95, -1.15, w);
    mb.box(-0.3, 3.05, -1.205, 0.3, 3.08, -1.2, o, { skip: 16 });
    mb.box(-0.3, 3.4, -1.205, 0.3, 3.43, -1.2, o, { skip: 16 });
    mb.box(-0.3, 3.05, -1.205, -0.27, 3.43, -1.2, o, { skip: 16 });
    mb.box(0.27, 3.05, -1.205, 0.3, 3.43, -1.2, o, { skip: 16 });
    // rim
    const R = 0.23, cz = -1.2 - 0.38, y = 3.05, n = 8;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      mb.rod(Math.cos(a0) * R, y, cz + Math.sin(a0) * R, Math.cos(a1) * R, y, cz + Math.sin(a1) * R, 0.012, 3, o);
    }
    mb.box(-0.06, 3.0, -1.2 - 0.17, 0.06, 3.06, -1.2, o);
  },
});

// "take a number" ticket dispenser on a post
defineProp('b_ticket', {
  build(mb) {
    const red = S('plastic_orange', { tint: [1.0, 0.35, 0.3] });
    mb.cyl(0, 0, 0, 0.16, 0.03, 6, S('metal_dark'), 1);
    mb.rod(0, 0.03, 0, 0, 1.0, 0, 0.022, 4, S('chrome'));
    mb.box(-0.09, 1.0, -0.07, 0.09, 1.2, 0.07, red);
    mb.box(-0.04, 1.06, -0.075, 0.04, 1.08, -0.07, S('plastic_black'), { skip: 16 });
    mb.quad([0.03, 1.02, -0.09, -0.03, 1.02, -0.09, -0.03, 1.07, -0.075, 0.03, 1.07, -0.075], [0, 0.3, -1], T('paper'), [0, 1, 1, 1, 1, 0, 0, 0]);
  },
  boxes: [[-0.16, 0, -0.16, 0.16, 1.2, 0.16]],
});

// Room-service tray left on the floor: tray, plate, steel cloche
defineProp('b_tray', {
  build(mb, p, r) {
    mb.box(-0.24, 0, -0.18, 0.24, 0.025, 0.18, S('plastic_black'));
    mb.cyl(-0.08, 0.025, 0, 0.11, 0.015, 7, S('porcelain'), 1);
    if (p.opts.cloche !== false) {
      mb.cyl(-0.08, 0.04, 0, 0.1, 0.06, 7, S('chrome'), 0);
      mb.cyl(-0.08, 0.1, 0, 0.06, 0.03, 7, S('chrome'), 1);
    }
    mb.cyl(0.13, 0.025, -0.07, 0.035, 0.09, 5, S('glass'), 1);
    if (r.chance(0.6)) mb.box(0.08, 0.025, 0.05, 0.2, 0.03, 0.08, S('chrome'));
  },
});

// Brass luggage cart
defineProp('b_luggage', {
  build(mb, p, r) {
    const brass = S('chrome', { tint: BRASS });
    mb.box(-0.55, 0.12, -0.32, 0.55, 0.18, 0.32, S('carpet_red'));
    for (const s of [-1, 1]) {
      mb.rod(s * 0.5, 0.18, 0, s * 0.5, 1.75, 0, 0.02, 4, brass);
      for (const z of [-0.26, 0.26]) mb.cyl(s * 0.45, 0, z, 0.05, 0.12, 5, S('rubber'), 1);
    }
    mb.rod(-0.5, 1.75, 0, 0.5, 1.75, 0, 0.02, 4, brass);
    mb.rod(-0.5, 1.3, 0, 0.5, 1.3, 0, 0.012, 4, brass);
    if (p.opts.bags) {
      const n = r.int(1, 2);
      for (let k = 0; k < n; k++) {
        const x = -0.25 + k * 0.48;
        withXf(mb, xfMul(xfTranslate(x, 0.18, r.range(-0.08, 0.08)), xfRotY(r.range(-0.2, 0.2))), () => {
          mb.box(-0.2, 0, -0.12, 0.2, 0.55, 0.12, S(r.pick(['fabric_brown', 'fabric_blue', 'plastic_black'])));
          mb.box(-0.06, 0.55, -0.02, 0.06, 0.6, 0.02, S('plastic_black'));
        });
      }
    }
  },
  boxes: [[-0.56, 0, -0.33, 0.56, 1.78, 0.33]],
});

// Wall clock (wall at local z=0): a short black drum facing -z with the dial on its front
defineProp('b_clock', {
  build(mb, p) {
    const R = p.opts.r || 0.17;
    withXf(mb, xfRotX(Math.PI / 2), () => mb.cyl(0, -0.05, 0, R, 0.05, 8, S('plastic_black'), 2));
    const face = T(p.opts.face || 'clock_a');
    const z = -0.052, r = R * 0.94;
    mb.quad([r, -r, z, -r, -r, z, -r, r, z, r, r, z], [0, 0, -1], face, [0, 1, 1, 1, 1, 0, 0, 0]);
  },
  emitter: { snd: 'tick', vol: 0.4, rad: 5, y: 0 },
});

// Bank of school lockers (n doors wide), tintable. Wall at local z=+0.25 when placed with depth 0.25.
defineProp('b_locker', {
  build(mb, p) {
    const n = p.opts.n || 4, h = p.opts.h || 1.85;
    const t = p.opts.tint || [1, 1, 1];
    const body = S('metal_green', { tint: [0.9 * t[0], 1.0 * t[1], 1.15 * t[2]] });
    const front = T('locker', { tint: t });
    const w2 = (0.4 * n) / 2;
    mb.box(-w2, 0, -0.25, w2, h, 0.25, [body, body, body, null, null, front], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, n / 2, h > 1.2 ? 1 : 0.5]] });
    mb.box(-w2, 0, -0.26, w2, 0.08, -0.25, S('plastic_black'), { skip: 4 | 8 | 16 });
  },
  boxes: (p) => [[-0.2 * (p.opts.n || 4), 0, -0.25, 0.2 * (p.opts.n || 4), p.opts.h || 1.85, 0.25]],
  use: 'locked',
});

// Trophy case against a wall (wall at local z=+0.3): wooden cabinet with shelves of trophies
defineProp('b_trophy_case', {
  build(mb, p, r) {
    const L = p.opts.len || 1.8;
    const wd = S('wood_dark'), gold = S('chrome', { tint: [1.35, 1.05, 0.45] }), back = S('fabric_blue');
    mb.box(-L / 2, 0, -0.3, L / 2, 0.8, 0.3, wd, { skip: 16 });
    mb.box(-L / 2, 0.8, 0.26, L / 2, 2.0, 0.3, back, { skip: 16 });
    for (const s of [-1, 1]) mb.box(s * L / 2 - (s > 0 ? 0.05 : 0), 0.8, -0.3, s * L / 2 + (s < 0 ? 0.05 : 0), 2.0, 0.3, wd, { skip: 16 });
    mb.box(-L / 2, 2.0, -0.3, L / 2, 2.08, 0.3, wd, { skip: 16 | 8 });
    for (const y of [0.8, 1.2, 1.6]) {
      mb.box(-L / 2, y, -0.28, L / 2, y + 0.02, 0.26, S('glass'), { skip: 16 | 8 });
      for (let x = -L / 2 + 0.2; x < L / 2 - 0.15; x += r.range(0.3, 0.5)) {
        if (r.chance(0.25)) continue;
        const h = r.range(0.14, 0.3);
        mb.cyl(x, y + 0.02, 0, 0.04, h, 4, gold, 1, null, Math.PI / 4);
      }
    }
  },
  boxes: (p) => [[-(p.opts.len || 1.8) / 2, 0, -0.3, (p.opts.len || 1.8) / 2, 2.08, 0.3]],
});

// Ceiling projector hanging on a rod (hang from height y with opts.flip=false; rod goes up)
defineProp('b_projector', {
  build(mb, p) {
    const len = p.opts.rod || 0.6;
    mb.rod(0, 0.12, 0, 0, 0.12 + len, 0, 0.02, 4, S('metal_dark'));
    mb.box(-0.18, 0, -0.16, 0.18, 0.12, 0.16, S('plastic_gray'));
    mb.box(0.03, 0.02, -0.2, 0.13, 0.1, -0.16, S('plastic_black'), { skip: 16 });
    void xfRotX; void VF;
  },
});

export const BRASS_TINT = BRASS;
export { M };
