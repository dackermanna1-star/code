// Shared assets for the special set-pieces: a handful of textures / materials and low-poly props.
// Everything registered here is prefixed `c_`.
//
// Budget notes: the stock `chair_mesh` measures 140 tris / 280 verts and `stack_chairs` ~38 tris
// per chair, far too heavy for a floor holding thousands of chairs or columns of fifty, so the
// set-pieces use the look-alike low-poly versions below (c_chair_mesh: 40 tris, c_stack: ~6 tris
// per chair).
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propGlow as glow, propWithXf as withXf, PROPS } from '../props.js';
import { xfMul, xfTranslate, xfRotY, xfRotX } from '../../core/math.js';

const mulc = (c, m) => [c[0] * m, c[1] * m, c[2] * m];

// ------------------------------------------------------------------ textures (7 layers)
// wall clock dial without hands (the hands are geometry, so every clock can show its own time)
defineTexture('c_clock_face', (p) => {
  p.fill([20, 20, 20]);
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
    if (d < 31) { p.alpha(x, y, 255); p.set(x, y, d > 28 ? [36, 36, 40] : [234, 232, 222]); }
  }
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, big = i % 5 === 0;
    const r0 = big ? 21 : 24.5;
    for (let r = r0; r < 26.5; r += 0.5) p.set(32 + Math.sin(a) * r - 0.5, 32 - Math.cos(a) * r - 0.5, big ? [24, 24, 24] : [120, 118, 112]);
  }
  p.text('12', 27, 9, [40, 40, 40]);
}, 8);

// flight information display: blue CRT with a timetable nobody updates any more
defineTexture('c_dep_board', (p, r) => {
  p.fill([16, 30, 120]);
  p.rect(0, 0, 64, 11, [10, 16, 60]);
  p.text('DEPARTURE', 5, 2, [250, 220, 90]);
  const rows = ['A1 DELAYED', 'A4 --:--', 'B2 CLOSED', 'B7 --:--', 'C3 DELAYED', 'C9 00:00'];
  rows.forEach((s, i) => p.text(s, 2, 14 + i * 8, i % 2 ? [200, 210, 240] : [236, 240, 250]));
  p.map((x, y, c) => mulc(c, y % 2 ? 0.8 : 1));
  void r;
}, 8);

// classroom posters
defineTexture('c_poster_abc', (p) => {
  p.fill([236, 228, 200]);
  const cols = [[200, 50, 40], [40, 90, 170], [40, 140, 60], [220, 150, 30]];
  'ABCDEFGHIJKL'.split('').forEach((ch, i) => {
    const x = 3 + (i % 4) * 15, y = 4 + Math.floor(i / 4) * 20;
    p.rect(x, y, 13, 17, cols[i % 4]);
    p.text(ch, x + 4, y + 5, [250, 248, 236]);
  });
  p.frame(0, 0, 64, 64, [150, 120, 70]);
}, 16);
defineTexture('c_poster_read', (p) => {
  p.fill([120, 180, 220]);
  p.disc(46, 16, 9, [250, 210, 60]);
  p.rect(10, 34, 44, 18, [236, 232, 220]);
  p.rect(31, 34, 2, 18, [150, 140, 120]);
  for (let y = 38; y < 50; y += 3) { p.rect(13, y, 15, 1, [130, 130, 130]); p.rect(36, y, 15, 1, [130, 130, 130]); }
  p.text('READ!', 6, 6, [190, 40, 40]);
  p.rect(0, 56, 64, 8, [90, 150, 70]);
  p.frame(0, 0, 64, 64, [60, 80, 120]);
}, 16);

// edges of nested folding-chair seats seen from the side: a light lip every 7 cm (8 px)
defineTexture('c_stack_edge', (p) => {
  p.map((x, y) => {
    const k = y % 8;
    const n = 0.92 + pnoise(x, y, 8, 5) * 0.16;
    if (k === 0) return mulc([196, 198, 202], n);
    if (k < 3) return mulc([150, 152, 158], n);
    if (k === 3) return mulc([70, 72, 76], n);
    return mulc([34 + k * 2, 35 + k * 2, 38 + k * 2], n);
  });
}, 8);

// a round hole punched into the wall at skirting height (alpha decal)
defineTexture('c_wallhole', (p) => {
  p.fill([8, 7, 6]);
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x + 0.5 - 32, (y + 0.5 - 34) * 1.1) / 26 + (pnoise(x, y, 8, 77) - 0.5) * 0.18;
    if (d < 1) { p.alpha(x, y, 255); p.set(x, y, d > 0.86 ? [70, 62, 50] : d > 0.7 ? [26, 22, 18] : [6, 5, 4]); }
  }
}, 4);

// dark, faded brown wallpaper with a thin pinstripe (reading room)
defineTexture('c_wp_brown', (p, r) => {
  p.fill([104, 76, 50]);
  p.noise(3, 0.08, 3);
  for (let x = 0; x < 64; x += 8) for (let y = 0; y < 64; y++) { p.set(x, y, [82, 58, 36], 0.6); p.set(x + 4, y, [124, 94, 62], 0.25); }
  for (let i = 0; i < 4; i++) p.drip(r.int(0, 63), 0, r.int(16, 50), [60, 42, 26], 0.25, 2);
  p.grain(0.05);
});

// ------------------------------------------------------------------ materials (3)
defineMaterial('c_wp_brown', 'c_wp_brown', { su: 1.8, sv: 1.8, surf: 'drywall', stain: 0.18 });
defineMaterial('c_stack_edge', 'c_stack_edge', { s: 0.56, surf: 'metal' });
// glazed beige tiles for the pit hall (re-tinted white tile, no extra texture layer)
defineMaterial('c_pit_tile', 'tile_white', { s: 1.0, surf: 'tile', stain: 0.1, tint: [1.0, 0.93, 0.78] });

// ------------------------------------------------------------------ props
// Mesh task chair, 40 tris (stock chair_mesh is 140): same materials and silhouette.
defineProp('c_chair_mesh', {
  build(mb) {
    const mesh = S('chair_mesh'), blk = S('plastic_black');
    mb.box(-0.24, 0.42, -0.25, 0.24, 0.49, 0.21, mesh, { skip: 8 });
    mb.box(-0.21, 0.56, 0.21, 0.21, 1.0, 0.25, mesh, { skip: 8 });
    mb.box(-0.025, 0.46, 0.22, 0.025, 0.6, 0.25, blk, { skip: 1 | 2 | 4 | 8 });
    mb.cyl(0, 0.08, -0.02, 0.03, 0.34, 3, blk, 0);
    // five-star base: sloping spokes, top faces only
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3;
      const dx = Math.sin(a), dz = -Math.cos(a), px = Math.cos(a) * 0.024, pz = Math.sin(a) * 0.024;
      const hx = dx * 0.03, hz = -0.02 + dz * 0.03, tx = dx * 0.29, tz = -0.02 + dz * 0.29;
      mb.poly4([tx + px, 0.025, tz + pz], [tx - px, 0.025, tz - pz], [hx - px, 0.1, hz - pz], [hx + px, 0.1, hz + pz], blk, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
  boxes: [[-0.24, 0, -0.25, 0.24, 0.6, 0.25]],
});

// Column of interlocked folding chairs, ~70-100 tris whatever its height (stock stack_chairs is
// ~38 tris per chair). The nested seats are a few slightly skewed blocks wearing the seat-edge
// stripe texture; the back legs line up into rails and the backs into one plate. Vibrates.
defineProp('c_stack', {
  build(mb, p, r) {
    const n = Math.max(3, p.opts.n || 30);
    const vib = { flags: VF.VIBRATE };
    const fr = S('metal_dark', vib), seat = S('metal', vib), edge = S('c_stack_edge', vib);
    const top = (n - 1) * 0.07;
    // the lowest chair stands on its own four legs
    for (const s of [-1, 1]) mb.box(s * 0.2 - 0.015, 0, -0.2, s * 0.2 + 0.015, 0.43, -0.17, fr, { skip: 4 | 8 | 16 });
    mb.box(-0.21, 0.42, -0.2, 0.21, 0.455, 0.17, seat, { skip: 4 });
    // back legs line up into two rails, the backs into one plate
    for (const s of [-1, 1]) mb.box(s * 0.2 - 0.016, 0, 0.155, s * 0.2 + 0.016, top + 0.87, 0.19, fr, { skip: 4 | 8 });
    mb.box(-0.2, 0.62, 0.165, 0.2, top + 0.85, 0.195, [seat, seat, seat, null, edge, edge], { skip: 8 });
    // the nested seats: a few slightly skewed blocks that drift as the column rises
    let k = 1, ox = 0, oz = 0;
    while (k < n - 1) {
      const m = Math.min(n - 1 - k, r.int(5, 10));
      const y0 = 0.42 + k * 0.07, y1 = 0.42 + (k + m) * 0.07;
      ox = Math.max(-0.035, Math.min(0.035, ox + r.range(-0.014, 0.014)));
      oz = Math.max(-0.035, Math.min(0.035, oz + r.range(-0.014, 0.014)));
      withXf(mb, xfMul(xfTranslate(ox, 0, oz), xfRotY(r.range(-0.045, 0.045))), () => {
        mb.box(-0.21, y0, -0.2, 0.21, y1, 0.16, [edge, edge, null, null, null, edge]);
      });
      k += m;
    }
    // the top chair: seat and a back that stands clear above the column
    withXf(mb, xfMul(xfTranslate(ox, 0, oz), xfRotY(r.range(-0.05, 0.05))), () => {
      mb.box(-0.21, 0.42 + top, -0.2, 0.21, 0.455 + top, 0.17, seat, { skip: 8 | 16 });
      mb.box(-0.2, 0.6 + top, 0.16, 0.2, 0.86 + top, 0.2, seat, { skip: 8 });
    });
  },
  boxes: (p) => [[-0.24, 0, -0.24, 0.24, (Math.max(3, p.opts.n || 30) - 1) * 0.07 + 0.87, 0.24]],
});

// Wall clock whose hands are geometry: opts.h / opts.m set the (stopped) time.
function hand(mb, th, len, wd, z, st) {
  const du = Math.sin(th), dv = Math.cos(th), pu = Math.cos(th), pv = -Math.sin(th);
  const t = -0.16 * len;
  const pts = [
    [t * du - pu * wd / 2, t * dv - pv * wd / 2], [t * du + pu * wd / 2, t * dv + pv * wd / 2],
    [len * du + pu * wd / 2, len * dv + pv * wd / 2], [len * du - pu * wd / 2, len * dv - pv * wd / 2],
  ];
  // viewer-space u (right) maps to local -x on a model facing -z
  mb.quad(pts.flatMap(([u, v]) => [-u, v, z]), [0, 0, -1], st, [0, 1, 1, 1, 1, 0, 0, 0]);
}
defineProp('c_clock', {
  build(mb, p) {
    const R = p.opts.r || 0.17;
    const rim = S(p.opts.rim || 'plastic_black');
    withXf(mb, xfRotX(-Math.PI / 2), () => mb.cyl(0, 0, 0, R + 0.014, 0.045, 8, rim, 0));
    const zf = -0.046;
    mb.quad([R, -R, zf, -R, -R, zf, -R, R, zf, R, R, zf], [0, 0, -1], T('c_clock_face'), [0, 1, 1, 1, 1, 0, 0, 0]);
    const h = p.opts.h ?? 3, m = p.opts.m ?? 0;
    const blk = S('plastic_black');
    hand(mb, (((h % 12) + m / 60) / 12) * Math.PI * 2, R * 0.52, 0.026, zf - 0.004, blk);
    hand(mb, (m / 60) * Math.PI * 2, R * 0.82, 0.016, zf - 0.007, blk);
    if (p.opts.sec !== undefined) hand(mb, (p.opts.sec / 60) * Math.PI * 2, R * 0.86, 0.008, zf - 0.01, S('pipe_red'));
  },
  emitter: { snd: 'tick', vol: 0.3, rad: 4.5, y: 0 },
});

// Flight information monitor on a pole (opts.screen: 'board' | 'static' | 'blue' | 'off', opts.double)
function screenStyle(kind, ch = 0) {
  if (kind === 'static') return T('static0', { flags: VF.FULLBRIGHT | VF.ANIM, lit: false, color: [0.04, 0.04, 0.05], flk: [0.8, 0.82, 0.88], chan: ch });
  if (kind === 'off') return T('crt_off');
  return glow(kind === 'blue' ? 'crt_blue' : 'c_dep_board', 1.0, ch);
}
defineProp('c_departure', {
  build(mb, p) {
    const m = S('metal_dark'), body = S(p.opts.body || 'plastic_black');
    const H = p.opts.h || 2.05;
    mb.cyl(0, 0, 0, 0.17, 0.03, 6, m, 1);
    mb.box(-0.03, 0.03, -0.03, 0.03, H, 0.03, m, { skip: 8 });
    const faces = p.opts.double ? [0, Math.PI] : [0];
    faces.forEach((a, k) => {
      const scr = screenStyle(k === 0 ? p.opts.screen || 'board' : p.opts.screen2 || 'off', p.opts.ch || 0);
      withXf(mb, xfRotY(a), () => {
        mb.box(-0.3, H - 0.02, -0.24, 0.3, H + 0.44, -0.04, [body, body, body, body, body, scr], { uv: ['world', 'world', 'world', 'world', 'world', [0.04, 0.04, 0.96, 0.96]] });
        if (!p.opts.double) mb.box(-0.22, H + 0.02, -0.04, 0.22, H + 0.4, 0.18, body, { skip: 8 });
      });
    });
  },
  boxes: (p) => [[-0.12, 0, -0.12, 0.12, (p.opts.h || 2.05) + 0.44, 0.12]],
  emitter: { snd: 'static', vol: 0.3, rad: 6, y: 2.2, cond: (p) => p.opts.screen === 'static' },
  light: { y: 2.25, z: -0.7, color: [0.55, 0.65, 1.0], rad: 3.4, int: 0.32, cond: (p) => (p.opts.screen || 'board') !== 'off' },
});

// CRT television on a rolling AV cart (opts.screen 'static' | 'off' | texture name)
defineProp('c_tv_cart', {
  build(mb, p, r) {
    const blk = S('plastic_black'), m = S('metal');
    for (const y of [0.12, 0.62]) mb.box(-0.42, y, -0.3, 0.42, y + 0.04, 0.3, blk);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.39 - 0.02, 0.05, sz * 0.27 - 0.02, sx * 0.39 + 0.02, 0.66, sz * 0.27 + 0.02, m, { skip: 4 | 8 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.39 - 0.03, 0, sz * 0.27 - 0.03, sx * 0.39 + 0.03, 0.05, sz * 0.27 + 0.03, S('rubber'), { skip: 8 });
    // the stock television, minus its own stand, sits on the top shelf
    withXf(mb, xfTranslate(0, 0.21, 0), () => PROPS.tv.build(mb, { ...p, opts: { ...p.opts, stand: false } }, r));
  },
  boxes: [[-0.43, 0, -0.31, 0.43, 1.2, 0.4]],
  emitter: { snd: 'static', vol: 0.35, rad: 6, y: 0.95, cond: (p) => !p.opts.quiet && (p.opts.screen || 'static') === 'static' },
  light: { y: 0.96, z: -0.6, color: [0.7, 0.76, 0.9], rad: 3.4, int: 0.45, cond: (p) => (p.opts.screen || 'static') !== 'off' },
});

// Vending machine that lost its light; it still hums.
defineProp('c_vending_off', {
  build(mb) {
    const body = S('plastic_black');
    const front = T('vending', { tint: [0.34, 0.33, 0.36] });
    mb.box(-0.45, 0, -0.42, 0.45, 1.85, 0.42, [body, body, body, body, body, front], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
  },
  boxes: [[-0.46, 0, -0.43, 0.46, 1.86, 0.43]],
  emitter: { snd: 'vending', vol: 0.45, rad: 7, y: 1 },
});

// Phone cord lying on the floor from the prop origin along local -z for opts.len metres,
// rising to opts.endY at its far end (into a hole in the wall).
defineProp('c_cord', {
  build(mb, p, r) {
    const len = p.opts.len || 2, endY = p.opts.endY ?? 0.006;
    const st = S('plastic_black');
    const segs = Math.max(2, Math.min(6, Math.round(len / 0.9)));
    let px = 0, pz = 0, py = 0.012;
    const w = 0.011;
    for (let k = 1; k <= segs; k++) {
      const t = k / segs;
      const nx = k === segs ? 0 : r.range(-0.12, 0.12) * Math.sin(t * Math.PI), nz = -len * t;
      const ny = k === segs ? endY : 0.008;
      const dx = nx - px, dz = nz - pz, l = Math.hypot(dx, dz) || 1;
      const ox = (-dz / l) * w, oz = (dx / l) * w;
      mb.quad([px - ox, py, pz - oz, px + ox, py, pz + oz, nx + ox, ny, nz + oz, nx - ox, ny, nz - oz], [0, 1, 0], st, [0, 1, 1, 1, 1, 0, 0, 0]);
      px = nx; pz = nz; py = ny;
    }
  },
});

// Framed picture hung on a wall (back at local z = 0, picture facing -z). Can be hung flipped.
defineProp('c_picture', {
  build(mb, p) {
    const fr = S('wood_dark');
    const Wd = p.opts.w || 0.6, Hh = p.opts.h || 0.45;
    mb.box(-Wd / 2, 0, -0.035, Wd / 2, Hh, 0, [fr, fr, fr, fr, null, T(p.opts.tex || 'painting_land')], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
  },
});

// Free-standing door frame (jambs + head) for a 0.9 m door leaf (stock `door` prop).
defineProp('c_doorframe', {
  build(mb, p) {
    const st = S(p.opts.mat || 'wood_dark');
    for (const s of [-1, 1]) mb.box(s * 0.47 - 0.05, 0, -0.07, s * 0.47 + 0.05, 2.12, 0.07, st, { skip: 8 });
    mb.box(-0.52, 2.12, -0.07, 0.52, 2.24, 0.07, st);
  },
  boxes: [[-0.53, 0, -0.08, -0.41, 2.24, 0.08], [0.41, 0, -0.08, 0.53, 2.24, 0.08]],
});
