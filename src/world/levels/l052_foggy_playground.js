// Level 52: THE FOGGY PLAYGROUND. A white fog stands a few steps away in every direction. Out of it
// come fences of chain link, benches, bare trees, and play equipment in faded paint: swings that
// move although there is no wind, a roundabout turning slowly on its own bearing, slides,
// climbing frames. Everything is wet and silent. The way on is always through the white.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propWithXf as withXf } from '../props.js';
import { xfMul, xfTranslate, xfRotX, xfRotZ } from '../../core/math.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, openGround, cbox, owns, hr, levelDoor, env, M, noise, poleLamp, facing } from './kit.js';
import { mix, dynamicsOf } from './g10_common.js';

const N = 52;
const B = 64;
const FOG = [0.74, 0.76, 0.77];

// ---------------------------------------------------------------- textures
defineTexture('lv52_grass', (p, r) => {
  p.fill([128, 138, 100]);
  p.noise(6, 0.1, 3);
  for (let i = 0; i < 160; i++) { const x = r.int(0, 63), y = r.int(0, 62); p.line(x, y, x + r.int(-1, 1), y + r.int(2, 4), r.pick([[100, 112, 78], [150, 156, 118], [112, 120, 84]]), 0.8); }
  p.grain(0.03);
}, 12);
defineTexture('lv52_grass2', (p, r) => {
  p.fill([118, 112, 86]);
  p.noise(5, 0.14, 3);
  p.stain(r.int(10, 54), r.int(10, 54), 14, [92, 78, 54], 0.5);
  for (let i = 0; i < 80; i++) p.line(r.int(0, 63), r.int(0, 62), r.int(0, 63), r.int(0, 63), [104, 100, 72], 0.3);
  p.grain(0.04);
}, 12);
defineTexture('lv52_rubber', (p, r) => {
  p.fill([112, 120, 112]);
  p.noise(4, 0.08, 2);
  p.speckle(120, [90, 98, 92], 0.4, 0.8);
  p.speckle(40, [140, 146, 138], 0.4, 0.8);
  p.rect(0, 31, 64, 1, [84, 92, 86]); p.rect(31, 0, 1, 64, [84, 92, 86]);
  p.stain(r.int(10, 50), r.int(10, 50), 8, [90, 100, 88], 0.4);
}, 10);
defineTexture('lv52_sand', (p) => {
  p.fill([188, 178, 146]);
  p.noise(8, 0.08, 3);
  p.speckle(100, [160, 150, 120], 0.4, 0.8);
  p.speckle(60, [214, 204, 174], 0.4, 0.8);
}, 8);
defineTexture('lv52_path', (p, r) => {
  p.fill([112, 114, 112]);
  p.noise(6, 0.1, 3);
  p.speckle(160, [88, 90, 90], 0.5, 0.9);
  p.speckle(60, [150, 152, 148], 0.4, 0.8);
  for (let i = 0; i < 3; i++) { const x = r.int(0, 63), y = r.int(0, 63); p.line(x, y, x + r.int(-18, 18), y + r.int(-18, 18), [60, 62, 62], 0.9); }
  p.stain(r.int(10, 54), r.int(10, 54), 10, [86, 92, 90], 0.5);
}, 10);
// chain link: diamonds of thin wire, everything else see-through
defineTexture('lv52_link', (p) => {
  p.clearAlpha(0);
  for (let t = 0; t < 64; t++) for (let i = -64; i < 128; i += 8) {
    for (const [x, y] of [[t, t + i], [t, 63 - t + i]]) {
      if (y < 0 || y > 63) continue;
      p.set(x, y, [150, 156, 160]); p.alpha(x, y, 255);
    }
  }
}, 4);
defineTexture('lv52_pipe', (p, r) => {
  p.fill([120, 134, 144]);
  p.noise(4, 0.1, 2);
  p.speckle(40, [150, 80, 50], 0.4, 0.8);
  p.stain(r.int(10, 50), r.int(10, 50), 8, [90, 100, 100], 0.4);
}, 8);
function paint(base) {
  return (p, r) => {
    p.fill(base);
    p.noise(4, 0.1, 2);
    for (let i = 0; i < 30; i++) p.rect(r.int(0, 62), r.int(0, 62), r.int(2, 6), r.int(1, 3), [110, 100, 88], 0.8);
    p.speckle(40, [134, 76, 44], 0.5, 0.9);
    p.speckle(40, [226, 226, 218], 0.2, 0.5);
  };
}
defineTexture('lv52_red', paint([172, 80, 70]), 10);
defineTexture('lv52_yellow', paint([204, 176, 84]), 10);
defineTexture('lv52_blue', paint([84, 118, 156]), 10);
defineTexture('lv52_wood', (p, r) => {
  p.fill([128, 112, 86]);
  for (let y = 0; y < 64; y += 8) { p.shade(0, y, 64, 8, r.range(-0.12, 0.08)); p.rect(0, y, 64, 1, [70, 60, 46]); }
  p.noise(6, 0.1, 2);
  p.stain(r.int(10, 54), r.int(10, 54), 10, [86, 92, 70], 0.4);
}, 10);
defineTexture('lv52_chute', (p, r) => {
  p.fill([176, 182, 184]);
  for (let y = 0; y < 64; y += 3) p.rect(0, y, 64, 1, [150, 156, 160], 0.7);
  p.stain(r.int(10, 54), r.int(20, 54), 10, [120, 110, 92], 0.5);
  p.speckle(30, [140, 90, 60], 0.4, 0.8);
}, 8);
defineTexture('lv52_chain', (p) => { p.fill([70, 74, 78]); p.noise(3, 0.2, 2); for (let y = 0; y < 64; y += 6) p.rect(0, y, 64, 2, [108, 112, 116], 0.8); }, 6);
defineTexture('lv52_seat', (p) => { p.fill([40, 42, 44]); p.noise(4, 0.1, 2); p.speckle(30, [80, 84, 86], 0.4, 0.8); }, 6);
defineTexture('lv52_rb_top', (p, r) => {
  const cols = [[172, 80, 70], [204, 176, 84], [84, 118, 156], [120, 150, 110]];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const a = (Math.atan2(y - 32, x - 32) + Math.PI) / (Math.PI * 2);
    p.set(x, y, cols[Math.floor(a * 4) % 4]);
  }
  p.noise(4, 0.1, 2);
  p.disc(32, 32, 5, [80, 84, 88]);
  for (let i = 0; i < 40; i++) p.rect(r.int(0, 62), r.int(0, 62), r.int(2, 5), 2, [112, 108, 98], 0.7);
}, 10);
defineTexture('lv52_bark', (p, r) => {
  p.fill([76, 70, 62]);
  for (let x = 0; x < 64; x += 4) p.rect(x, 0, 1, 64, [46, 42, 36], 0.7);
  p.noise(8, 0.14, 2);
  p.speckle(40, [110, 120, 96], 0.3, 0.7);
  void r;
}, 8);
defineTexture('lv52_sign_a', (p) => {
  p.fill([62, 100, 84]); p.frame(0, 0, 64, 64, [220, 224, 214]); p.frame(2, 2, 60, 60, [220, 224, 214]);
  p.text('PLAY', 32 - 12, 10, [236, 238, 226], 1); p.text('AREA', 32 - 12, 22, [236, 238, 226], 1); p.text('5-12', 32 - 12, 38, [236, 214, 120], 1);
  p.speckle(40, [150, 160, 150], 0.4, 0.8);
}, 6);
defineTexture('lv52_sign_b', (p) => {
  p.fill([222, 222, 212]); p.frame(0, 0, 64, 64, [190, 50, 44]); p.frame(1, 1, 62, 62, [190, 50, 44]);
  p.text('CLOSED', 32 - 17, 12, [190, 50, 44], 1); p.text('AT', 32 - 6, 28, [40, 40, 40], 1); p.text('DUSK', 32 - 12, 42, [40, 40, 40], 1);
  p.speckle(40, [150, 160, 150], 0.4, 0.8);
}, 6);

// ---------------------------------------------------------------- materials
defineMaterial('lv52_grass', 'lv52_grass', { s: 3, surf: 'grass' });
defineMaterial('lv52_grass2', 'lv52_grass2', { s: 3, surf: 'grass' });
defineMaterial('lv52_rubber', 'lv52_rubber', { s: 2, surf: 'carpet' });
defineMaterial('lv52_sand', 'lv52_sand', { s: 2, surf: 'carpet' });
defineMaterial('lv52_path', 'lv52_path', { s: 3, surf: 'asphalt' });
defineMaterial('lv52_link', 'lv52_link', { s: 1.2, surf: 'metal' });
defineMaterial('lv52_pipe', 'lv52_pipe', { s: 1, surf: 'metal' });
defineMaterial('lv52_red', 'lv52_red', { s: 1, surf: 'metal' });
defineMaterial('lv52_yellow', 'lv52_yellow', { s: 1, surf: 'metal' });
defineMaterial('lv52_blue', 'lv52_blue', { s: 1, surf: 'metal' });
defineMaterial('lv52_wood', 'lv52_wood', { s: 1.2, surf: 'wood' });
defineMaterial('lv52_chute', 'lv52_chute', { s: 1, surf: 'metal' });
defineMaterial('lv52_chain', 'lv52_chain', { s: 0.5, surf: 'metal' });
defineMaterial('lv52_seat', 'lv52_seat', { s: 0.5, surf: 'plastic' });
defineMaterial('lv52_bark', 'lv52_bark', { s: 1, surf: 'wood' });

// ---------------------------------------------------------------- props
// frame of a swing set: two A-frames and a top bar along x; the seats are separate animated props
const SW_H = 2.5;
defineProp('lv52_swingset', {
  build(mb, p) {
    const L = p.opts.len || 5.2, pipe = S('lv52_pipe'), col = S(p.opts.paint || 'lv52_red');
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) mb.rod(sx * L / 2, 0, sz * 0.95, sx * L / 2, SW_H, 0, 0.045, 5, col);
      mb.rod(sx * L / 2, 0.8, -0.95 + 0.95 * 0.32 * 2, sx * L / 2, 0.8, 0.95 - 0.95 * 0.32 * 2, 0.025, 4, pipe);
    }
    mb.rod(-L / 2 - 0.1, SW_H, 0, L / 2 + 0.1, SW_H, 0, 0.05, 6, pipe);
  },
  boxes: (p) => { const L = p.opts.len || 5.2; return [[-L / 2 - 0.12, 0, -1.0, -L / 2 + 0.12, SW_H, 1.0], [L / 2 - 0.12, 0, -1.0, L / 2 + 0.12, SW_H, 1.0]]; },
});
// a seat on two chains, hanging from the pivot at the origin and swung by `ang` about the bar
defineProp('lv52_seat', {
  build(mb, p) {
    const a = p.opts.ang || 0, ch = S('lv52_chain'), st = S('lv52_seat');
    withXf(mb, xfRotX(a), () => {
      for (const sx of [-1, 1]) mb.rod(sx * 0.22, 0, 0, sx * 0.22, -1.88, 0, 0.012, 4, ch);
      mb.box(-0.3, -1.97, -0.13, 0.3, -1.9, 0.13, st);
    });
  },
});
defineProp('lv52_slide', {
  build(mb, p) {
    const col = S(p.opts.paint || 'lv52_yellow'), pipe = S('lv52_pipe'), ch = S('lv52_chute'), wd = S('lv52_wood');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.rod(sx * 0.5, 0, sz * 0.5, sx * 0.5, 1.9, sz * 0.5, 0.04, 5, pipe);
    mb.box(-0.55, 1.74, -0.55, 0.55, 1.8, 0.55, wd);
    for (const sx of [-1, 1]) mb.box(sx * 0.55 - 0.03, 1.8, -0.55, sx * 0.55 + 0.03, 2.25, 0.55, col, { skip: 8 });
    mb.box(-0.55, 1.8, 0.52, 0.55, 2.25, 0.58, col, { skip: 8 });
    // chute: slopes from the platform down to the ground, with side walls
    const y0 = 1.76, z0 = -0.55, y1 = 0.14, z1 = -3.1;
    mb.poly4([-0.36, y1, z1], [0.36, y1, z1], [0.36, y0, z0], [-0.36, y0, z0], ch, [0, 1, 1, 1, 1, 0, 0, 0]);
    mb.poly4([0.36, y1 - 0.02, z1], [-0.36, y1 - 0.02, z1], [-0.36, y0 - 0.02, z0], [0.36, y0 - 0.02, z0], col, [0, 1, 1, 1, 1, 0, 0, 0]);
    for (const sx of [-1, 1]) {
      const xa = sx * 0.36, xb = sx * 0.4;
      mb.poly4([xa, y1, z1], [xa, y0, z0], [xa, y0 + 0.2, z0], [xa, y1 + 0.2, z1], col, [0, 1, 1, 1, 1, 0, 0, 0]);
      mb.poly4([xb, y1 + 0.2, z1], [xb, y0 + 0.2, z0], [xb, y0, z0], [xb, y1, z1], col, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
    // ladder at the back
    for (const sx of [-1, 1]) mb.rod(sx * 0.22, 0, 0.55 + 0.45, sx * 0.22, 1.82, 0.58, 0.025, 4, pipe);
    for (let y = 0.3; y < 1.75; y += 0.3) { const z = 0.58 + 0.45 * (1 - y / 1.82); mb.rod(-0.22, y, z, 0.22, y, z, 0.02, 4, pipe); }
  },
  boxes: [[-0.6, 0, -0.6, 0.6, 1.85, 0.6], [-0.4, 0, -3.1, 0.4, 0.4, -2.4]],
});
defineProp('lv52_gym', {
  build(mb, p) {
    const col = S(p.opts.paint || 'lv52_blue'), pipe = S('lv52_pipe'), W = 2.4, H = 2.7;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.rod(sx * W / 2, 0, sz * W / 2, sx * W / 2, H, sz * W / 2, 0.045, 5, col);
    for (const y of [0.9, 1.8, 2.7]) {
      for (const s of [-1, 1]) { mb.rod(-W / 2, y, s * W / 2, W / 2, y, s * W / 2, 0.03, 4, pipe); mb.rod(s * W / 2, y, -W / 2, s * W / 2, y, W / 2, 0.03, 4, pipe); }
    }
    for (let k = 1; k < 4; k++) { const t = -W / 2 + (k * W) / 4; mb.rod(t, 2.7, -W / 2, t, 2.7, W / 2, 0.025, 4, pipe); mb.rod(-W / 2, 1.8, t, W / 2, 1.8, t, 0.025, 4, pipe); }
    mb.rod(-W / 2, 0, -W / 2, W / 2, H, -W / 2, 0.02, 4, pipe);
    mb.rod(W / 2, 0, W / 2, -W / 2, H, W / 2, 0.02, 4, pipe);
    mb.box(-W / 2, 1.76, -W / 2, W / 2, 1.8, W / 2, S('lv52_wood'));
  },
  boxes: [[-1.25, 0, -1.25, 1.25, 2.75, 1.25]],
});
defineProp('lv52_seesaw', {
  build(mb, p) {
    const col = S(p.opts.paint || 'lv52_red'), pipe = S('lv52_pipe');
    mb.box(-0.12, 0, -0.35, 0.12, 0.5, 0.35, pipe);
    withXf(mb, xfMul(xfTranslate(0, 0.55, 0), xfRotZ(p.opts.tilt ?? 0.2)), () => {
      mb.box(-1.4, -0.05, -0.14, 1.4, 0.05, 0.14, col);
      for (const sx of [-1, 1]) { mb.rod(sx * 1.0, 0.05, 0, sx * 1.0, 0.45, 0, 0.02, 4, pipe); mb.rod(sx * 1.0 - 0.14, 0.45, 0, sx * 1.0 + 0.14, 0.45, 0, 0.02, 4, pipe); }
    });
  },
  boxes: [[-1.4, 0, -0.2, 1.4, 1.0, 0.2]],
});
// the roundabout turns by itself (spin in the zone generator)
defineProp('lv52_roundabout', {
  build(mb) {
    const top = T('lv52_rb_top', { lit: true }), pipe = S('lv52_pipe');
    mb.cyl(0, 0.0, 0, 0.14, 0.3, 6, pipe, 3);
    mb.cyl(0, 0.3, 0, 1.4, 0.07, 10, S('lv52_pipe'), 0, top);
    mb.cyl(0, 0.3, 0, 1.4, 0.07, 10, S('lv52_pipe'), 3, top);
    mb.cyl(0, 0.37, 0, 0.05, 0.55, 5, pipe, 3);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4, x = Math.sin(a) * 1.15, z = -Math.cos(a) * 1.15;
      mb.rod(0, 0.9, 0, x, 0.9, z, 0.025, 4, pipe);
      mb.rod(x, 0.37, z, x, 0.92, z, 0.03, 4, pipe);
    }
  },
  boxes: [[-1.1, 0, -1.1, 1.1, 0.4, 1.1]],
});
defineProp('lv52_rider', {
  build(mb, p) {
    const col = S(p.opts.paint || 'lv52_yellow'), pipe = S('lv52_pipe');
    mb.rod(0, 0, 0, 0, 0.45, 0, 0.05, 6, pipe);
    mb.cyl(0, 0, 0, 0.3, 0.05, 6, pipe, 3);
    withXf(mb, xfRotX(-0.25), () => {
      mb.box(-0.16, 0.42, -0.5, 0.16, 0.78, 0.5, col);
      mb.box(-0.12, 0.78, 0.2, 0.12, 0.84, 0.46, S('lv52_seat'));
      mb.rod(-0.26, 0.9, -0.42, 0.26, 0.9, -0.42, 0.02, 4, pipe);
    });
  },
  boxes: [[-0.3, 0, -0.45, 0.3, 0.9, 0.45]],
});
defineProp('lv52_tree', {
  build(mb, p, r) {
    const bk = S('lv52_bark'), H = p.opts.h || r.range(3.4, 5.2);
    mb.rod(0, 0, 0, r.range(-0.1, 0.1), H, r.range(-0.1, 0.1), 0.1, 6, bk);
    mb.cyl(0, 0, 0, 0.16, 0.5, 6, bk, 0);
    const n = r.int(5, 7);
    for (let k = 0; k < n; k++) {
      const y = H * (0.45 + 0.5 * (k / n)), a = r.range(0, 6.28), L = r.range(0.9, 1.9) * (1.1 - (k / n) * 0.5);
      const x = Math.sin(a) * L, z = -Math.cos(a) * L, ty = y + r.range(0.3, 0.9);
      mb.rod(0, y, 0, x, ty, z, 0.045, 4, bk);
      mb.rod(x, ty, z, x + Math.sin(a + 0.8) * 0.6, ty + 0.4, z - Math.cos(a + 0.8) * 0.6, 0.025, 3, bk);
      mb.rod(x, ty, z, x + Math.sin(a - 0.8) * 0.5, ty + 0.5, z - Math.cos(a - 0.8) * 0.5, 0.025, 3, bk);
    }
  },
  boxes: [[-0.14, 0, -0.14, 0.14, 3, 0.14]],
});
defineProp('lv52_sign', {
  build(mb, p) {
    const tex = T(p.opts.tex || 'lv52_sign_a', { lit: true }), post = S('lv52_pipe');
    for (const sx of [-1, 1]) mb.box(sx * 0.4 - 0.03, 0, -0.03, sx * 0.4 + 0.03, 1.5, 0.03, post, { skip: 8 });
    mb.box(-0.5, 0.7, -0.04, 0.5, 1.55, 0.04, [post, post, post, post, tex, tex], { uv: ['world', 'world', 'world', 'world', [0, 0, 1, 1], [1, 0, 0, 1]] });
  },
  boxes: [[-0.5, 0, -0.06, 0.5, 1.55, 0.06]],
});

// ---------------------------------------------------------------- layout
export const ENTRY = { x: 32.5, y: 0, z: 56.5, yaw: 0, pitch: 0.02 };

// the fenced playground of a zone (null: open meadow)
function parkOf(i, j) {
  if (i === 0 && j === 0) return { x0: 12, z0: 8, x1: 52, z1: 50, gate: 32 };
  if (hr(i, j, 801) < 0.22) return null;
  const w = 28 + Math.floor(hr(i, j, 802) * 4) * 4, d = 28 + Math.floor(hr(i, j, 803) * 4) * 4;
  const x0 = 6 + Math.floor(hr(i, j, 804) * (B - 12 - w)), z0 = 6 + Math.floor(hr(i, j, 805) * (B - 16 - d));
  return { x0, z0, x1: x0 + w, z1: z0 + d, gate: x0 + 4 + Math.floor(hr(i, j, 806) * (w - 10)) };
}

function seats(zb, x, z, rot, count, tag, id) {
  // seats of one swing set: three poses each, shown in turn by the script
  const L = 5.2 - 0.3;
  for (let q = 0; q < count; q++) {
    const off = -L / 2 + ((q + 0.5) * L) / count;
    const sx = x + Math.cos(rot) * off, sz = z + Math.sin(rot) * off;
    const ph = hr(id + q, 7, 810) * 3.2;
    for (const pose of [-1, 0, 1]) {
      zb.dynamic('lv52_seat', sx, SW_H, sz, rot, { ang: pose * 0.3, collide: false }, pose === 0 ? { tag, pose, id: id * 4 + q, ph, x: sx, z: sz } : { tag, pose, id: id * 4 + q, ph, x: sx, z: sz, showFar: 1e9 });
    }
  }
}

function gen(zb) {
  const bi = Math.floor(zb.x0 / B), bj = Math.floor(zb.z0 / B);
  const ox = bi * B, oz = bj * B;
  zb.noConnectivity = true;
  openGround(zb, M.lv52_grass, 0);
  const P = parkOf(bi, bj);
  const pad = [];   // rubber surfaces under equipment: [cx, cz, r]
  const inPark = (u, v, m = 0) => P && u >= P.x0 - m && u < P.x1 + m && v >= P.z0 - m && v < P.z1 + m;

  // stations on a 12 m grid inside the fence
  const stations = [];
  if (P) {
    if (bi === 0 && bj === 0) {
      stations.push({ t: 'swing', u: 32, v: 42, rot: 0 }, { t: 'round', u: 20, v: 34 }, { t: 'slide', u: 44, v: 34, rot: Math.PI }, { t: 'gym', u: 20, v: 18 },
        { t: 'seesaw', u: 42, v: 18, rot: 0 }, { t: 'sand', u: 32, v: 24 }, { t: 'rider', u: 28, v: 46, rot: 0 }, { t: 'rider', u: 36, v: 46, rot: 0 });
    } else {
      for (let v = P.z0 + 6; v < P.z1 - 4; v += 12) for (let u = P.x0 + 6; u < P.x1 - 4; u += 12) {
        const h = hr(bi * 31 + u, bj * 17 + v, 820);
        const t = h < 0.22 ? 'swing' : h < 0.36 ? 'round' : h < 0.5 ? 'slide' : h < 0.62 ? 'gym' : h < 0.72 ? 'seesaw' : h < 0.82 ? 'sand' : h < 0.9 ? 'rider' : null;
        if (t) stations.push({ t, u: u + Math.floor(hr(u, v, 821) * 3), v: v + Math.floor(hr(u, v, 822) * 3), rot: Math.floor(hr(u, v, 823) * 4) * Math.PI / 2 });
      }
    }
  }
  for (const s of stations) pad.push([s.u, s.v, s.t === 'swing' ? 4.2 : s.t === 'sand' ? 0 : 3]);

  // ground: grass in two tones, a road of asphalt, rubber under the equipment, sand
  const roadV0 = 58, roadV1 = 61;
  zb.fill(zb.x0, zb.z0, zb.x1, zb.z1, (x, z, k) => {
    const u = x - ox, v = z - oz;
    if (v >= roadV0 && v < roadV1) { zb.fmat[k] = M.lv52_path; return; }
    if (P && u >= P.gate - 1 && u < P.gate + 1 && v >= P.z1 && v < roadV0) { zb.fmat[k] = M.lv52_path; return; }
    for (const [pu, pv, r] of pad) {
      if (r > 0 && Math.abs(u - pu) <= r && Math.abs(v - pv) <= (r > 4 ? 2.6 : r)) { zb.fmat[k] = M.lv52_rubber; return; }
    }
    zb.fmat[k] = noise(x, z, 14, 31) > 0.62 ? M.lv52_grass2 : M.lv52_grass;
  });
  for (const s of stations) if (s.t === 'sand') zb.fill(ox + s.u - 3, oz + s.v - 3, ox + s.u + 3, oz + s.v + 3, (x, z, k) => { zb.fmat[k] = M.lv52_sand; });

  // chain-link fence with a gate, posts every 3 m
  if (P) {
    const X0 = ox + P.x0, X1 = ox + P.x1, Z0 = oz + P.z0, Z1 = oz + P.z1, gx = ox + P.gate;
    const H = 2.2;
    const panel = (x0, z0, x1, z1) => cbox(zb, x0, 0, z0, x1, H, z1, M.lv52_link, { sub: 4 });
    panel(X0, Z0, X1, Z0 + 0.04); panel(X0, Z0, X0 + 0.04, Z1); panel(X1 - 0.04, Z0, X1, Z1);
    panel(X0, Z1 - 0.04, gx - 2, Z1); panel(gx + 2, Z1 - 0.04, X1, Z1);
    const post = (x, z) => { if (owns(zb, x, z)) zb.box(x - 0.05, 0, z - 0.05, x + 0.05, H + 0.15, z + 0.05, M.lv52_pipe, { skip: 8 }); };
    for (let x = X0; x <= X1 + 0.01; x += 3) { post(x, Z0); if (Math.abs(x - gx) > 2.5) post(x, Z1); }
    for (let z = Z0; z <= Z1 + 0.01; z += 3) { post(X0, z); post(X1, z); }
    post(gx - 2, Z1); post(gx + 2, Z1);
    cbox(zb, X0, H, Z0 - 0.02, X1, H + 0.05, Z0 + 0.06, M.lv52_pipe, { collide: false });
    cbox(zb, X0, H, Z1 - 0.06, gx - 2, H + 0.05, Z1 + 0.02, M.lv52_pipe, { collide: false });
    cbox(zb, gx + 2, H, Z1 - 0.06, X1, H + 0.05, Z1 + 0.02, M.lv52_pipe, { collide: false });
    // the two gate leaves stand open, folded back against the fence
    if (owns(zb, gx - 2, Z1)) { zb.box(gx - 2.05, 0, Z1 - 1.8, gx - 2, 2.0, Z1 - 0.1, M.lv52_link, { collide: false }); }
    if (owns(zb, gx + 2, Z1)) { zb.box(gx + 2, 0, Z1 - 1.8, gx + 2.05, 2.0, Z1 - 0.1, M.lv52_link, { collide: false }); }
    if (owns(zb, gx - 2.9, Z1 + 0.5)) zb.prop('lv52_sign', gx - 3.0, 0, Z1 + 0.6, 0, { tex: 'lv52_sign_a' });
    if (owns(zb, gx + 3.4, Z1 + 0.5)) zb.prop('lv52_sign', gx + 3.4, 0, Z1 + 0.6, 0, { tex: 'lv52_sign_b' });
  }

  // equipment
  let sid = bi * 1000 + bj * 37 + 11;
  for (const s of stations) {
    const x = ox + s.u + 0.5, z = oz + s.v + 0.5;
    if (!owns(zb, x, z)) continue;
    const paintA = ['lv52_red', 'lv52_yellow', 'lv52_blue'][Math.floor(hr(s.u, s.v, 830) * 3)];
    switch (s.t) {
      case 'swing': {
        const rot = (s.rot || 0);
        zb.prop('lv52_swingset', x, 0, z, rot, { paint: paintA });
        seats(zb, x, z, rot, 2 + (hr(s.u, s.v, 831) < 0.4 ? 1 : 0), 'lv52_seat', sid++);
        zb.emitter(x, 1.4, z, 'lv52_creak', { vol: 0.9, rad: 14 });
        break;
      }
      case 'round':
        zb.dynamic('lv52_roundabout', x, 0, z, 0, {}, { spin: (hr(s.u, s.v, 832) < 0.5 ? 1 : -1) * (0.16 + hr(s.u, s.v, 833) * 0.12) });
        zb.emitter(x, 0.5, z, 'lv52_bearing', { vol: 0.8, rad: 13 });
        break;
      case 'slide': zb.prop('lv52_slide', x, 0, z, s.rot || 0, { paint: paintA }); break;
      case 'gym': zb.prop('lv52_gym', x, 0, z, 0, { paint: paintA }); break;
      case 'seesaw': zb.prop('lv52_seesaw', x, 0, z, s.rot || 0, { paint: paintA, tilt: (hr(s.u, s.v, 834) < 0.5 ? 1 : -1) * 0.2 }); break;
      case 'sand': {
        for (const [bx0, bz0, bx1, bz1] of [[-3.1, -3.1, 3.1, -2.9], [-3.1, 2.9, 3.1, 3.1], [-3.1, -3.1, -2.9, 3.1], [2.9, -3.1, 3.1, 3.1]]) zb.box(x + bx0, 0, z + bz0, x + bx1, 0.3, z + bz1, M.lv52_wood, { sub: 3 });
        zb.prop('bucket', x + 1.0, 0, z - 0.5, 0.7, {});
        break;
      }
      case 'rider': zb.prop('lv52_rider', x, 0, z, s.rot || 0, { paint: paintA }); break;
      default: break;
    }
  }

  // benches, bins, lamps and bare trees in the meadow and along the road
  const nearEntry = (x, z, r) => bi === 0 && bj === 0 && Math.hypot(x - ENTRY.x, z - ENTRY.z) < r;
  for (let q = 0; q < 14; q++) {
    const u = 3 + hr(bi * 9 + q, bj, 840) * (B - 6), v = 3 + hr(bi, bj * 9 + q, 841) * (B - 6);
    if (inPark(u, v, 2) || (v > roadV0 - 2 && v < roadV1 + 2)) continue;
    const x = ox + u, z = oz + v;
    if (!owns(zb, x, z) || nearEntry(x, z, 4)) continue;
    const h = hr(q, bi + bj, 842);
    if (h < 0.45) zb.prop('lv52_tree', x, 0, z, hr(q, bi, 843) * 6.28, {});
    else if (h < 0.62) zb.prop('bench', x, 0, z, Math.floor(hr(q, bj, 844) * 4) * Math.PI / 2, {});
    else if (h < 0.7) zb.prop('trash_can', x, 0, z, 0, {});
    else if (h < 0.8) poleLamp(zb, x, z, 4.6, { on: false, armX: 0.7 });
  }
  for (let t = 4; t < B; t += 13) {
    const x = ox + t, z = oz + roadV1 + 0.8;
    if (owns(zb, x, z) && hr(bi + t, bj, 845) < 0.6 && !nearEntry(x, z, 3)) poleLamp(zb, x, z, 4.6, { on: false, armX: 0.7 });
  }
  // wet patches on the ground
  for (let q = 0; q < 10; q++) {
    const x = ox + 3 + hr(bi * 5 + q, bj, 850) * (B - 6), z = oz + 3 + hr(bi, bj * 5 + q, 851) * (B - 6);
    if (owns(zb, x, z)) zb.decal(x, 0, z, 'up', 1.5 + hr(q, bi, 852) * 2, 1.2 + hr(q, bj, 853) * 1.5, 'dec_puddle', { rot: hr(q, bi + bj, 854) * 6.28 });
  }

  // doors: one in the open meadow, one beside the first bench of the fence
  for (let q = 0; q < 2; q++) {
    for (let tries = 0; tries < 12; tries++) {
      const u = 4 + Math.floor(hr(bi * 7 + q, bj + tries, 860) * (B - 8)), v = 4 + Math.floor(hr(bi + tries, bj * 7 + q, 861) * (B - 8));
      if (inPark(u, v, 3) && q === 0) continue;
      if (!inPark(u, v, 0) && q === 1) continue;
      if (v > roadV0 - 3 && v < roadV1 + 3) continue;
      const x = ox + u + 0.5, z = oz + v + 0.5;
      if (nearEntry(x, z, 6)) continue;
      // keep clear of equipment
      if (stations.some((s) => Math.abs(s.u - u) < 4.5 && Math.abs(s.v - v) < 4.5)) continue;
      levelDoor(zb, x, z, Math.floor(hr(u, v, 862) * 4) * Math.PI / 2, {});
      break;
    }
  }
  void withXf; void xfMul; void xfTranslate; void mix; void facing; void pnoise;
}

defineZone('lv52_park', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.66, 0.68, 0.7],
    env: env({ fog: FOG, fogNear: 1.5, fogFar: 21, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'lv52' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THE FOGGY PLAYGROUND',
  zoneType: 'lv52_park',
  zoneSize: B,
  entry: ENTRY,
  doorDensity: 1,
  viewRadius: 3,
  sky: { top: [0.78, 0.8, 0.82], horizon: FOG, ground: FOG, curve: 0.5 },
  light: { phoneRadius: 3.6, phoneIntensity: 0.18 },
  // the swings move with no wind: each seat has three poses, and the script shows them in turn
  script(ctx, dt) {
    const s = ctx.state;
    s.clock = (s.clock || 0) + dt;
    s.list = s.list || [];
    s.scan = (s.scan ?? 0) - dt;
    if (s.scan <= 0) { s.scan = 1.0; s.list = dynamicsOf(ctx, 'lv52_seat'); }
    const p = ctx.player;
    const POSE = [-1, 0, 1, 0];
    for (const d of s.list) {
      const a = d.anim;
      if (Math.abs(a.x - p.x) > 30 || Math.abs(a.z - p.z) > 30) continue;
      const phase = Math.floor(((s.clock + a.ph) / 0.8) % 4);
      const want = POSE[phase];
      a.showFar = a.pose === want ? 0 : 1e9;
    }
    // the fog breathes a little
    ctx.game.look = { fogFar: 21 + 2.5 * Math.sin(s.clock * 0.07), fogNear: 1.5 + 0.4 * Math.sin(s.clock * 0.05 + 1) };
    // once in a while something metal knocks, a long way off
    s.knock = (s.knock ?? 25) - dt;
    if (s.knock <= 0) {
      s.knock = 30 + Math.random() * 50;
      const ang = Math.random() * 6.28, d = 14 + Math.random() * 10;
      ctx.game.audioCall('play', 'lv52_clank', p.x + Math.sin(ang) * d, p.y + 1, p.z - Math.cos(ang) * d, { distant: true, vol: 0.9 });
    }
  },
});
