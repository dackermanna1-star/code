// Shared by group 05 (parking, rail and hall levels): cars, exit signs, a made-up script, text
// rows, and a hook that lets a level script drive flicker channels (headlights that come on as
// you pass, light sweeping down a tunnel).
import { defineTexture } from '../../gfx/textures.js';
import { pnoise, pfbm } from '../../gfx/texgen.js';
import { defineMaterial } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propGlow } from '../props.js';
import { hr } from './kit.js';

// ------------------------------------------------------------------ textures / materials
defineTexture('g05_paint', (p) => {
  p.fill([206, 206, 204]);
  p.noise(6, 0.05, 2);
  p.rect(0, 0, 64, 2, [236, 236, 232], 0.6);
  p.rect(0, 50, 64, 14, [150, 150, 150], 0.5);
  p.rect(0, 49, 64, 1, [120, 120, 120], 0.5);
}, 8);
defineTexture('g05_lamp_on', (p) => { p.fill([255, 244, 206]); p.disc(32, 32, 24, [255, 255, 240]); p.frame(0, 0, 64, 64, [200, 190, 160]); }, 4);
defineTexture('g05_lamp_off', (p) => { p.fill([128, 138, 142]); p.disc(32, 32, 16, [70, 80, 86]); p.frame(0, 0, 64, 64, [90, 96, 100]); }, 6);
defineTexture('g05_tail', (p) => { p.fill([130, 14, 12]); p.rect(0, 40, 64, 24, [210, 90, 60]); p.frame(0, 0, 64, 64, [70, 8, 8]); }, 6);
defineTexture('g05_tail_on', (p) => { p.fill([255, 40, 30]); p.rect(0, 40, 64, 24, [255, 150, 110]); }, 4);
// a soft glow, stippled by the texture dither: drawn around lit lamps
function haloTex(c0, c1) {
  return (p) => {
    p.clearAlpha(0);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x - 31.5, y - 31.5) / 31.5;
      const a = Math.max(0, 1 - d);
      p.set(x, y, [c0[0] + (c1[0] - c0[0]) * d, c0[1] + (c1[1] - c0[1]) * d, c0[2] + (c1[2] - c0[2]) * d]);
      p.alpha(x, y, Math.pow(a, 1.15) * 255);
    }
  };
}
defineTexture('g05_halo', haloTex([255, 252, 228], [255, 214, 140]), 6);
defineTexture('g05_halo_r', haloTex([255, 120, 90], [200, 30, 20]), 6);
defineMaterial('g05_paint', 'g05_paint', { s: 1, surf: 'metal' });
// a painted arrow on the ground (white, pointing +x), used as a decal
defineTexture('g05_arrow', (p) => {
  p.clearAlpha(0);
  const c = [226, 222, 200];
  const put = (x, y, w, h) => { p.rect(x, y, w, h, c); p.rectA(x, y, w, h, 255); };
  put(6, 28, 38, 8);
  for (let x = 40; x < 60; x++) { const hh = Math.round((60 - x) * 0.7); put(x, 32 - hh, 1, hh * 2); }
}, 4);

// streaky clouds for the skies (red = density, green = shading)
defineTexture('g05_clouds', (p) => {
  p.map((x, y) => {
    const d = Math.pow(Math.max(0, pfbm(x * 0.35, y * 2.4, 5, 3, 7) - 0.32) * 2.2, 1.4);
    const sh = 0.55 + 0.45 * pnoise(x, y * 1.5, 8, 11);
    return [Math.min(255, d * 255), sh * 255, 0];
  });
}, 16);

// ------------------------------------------------------------------ cars
// Side profiles, nose at -z: [z, top y, half width]. A car is a lofted prism of these points.
const PROF = {
  sedan: { L: 4.5, belt: 0.9, wb: 1.4, pts: [[-2.25, 0.56, 0.86], [-1.9, 0.8, 0.88], [-0.7, 0.9, 0.88], [0.05, 1.38, 0.7], [1.0, 1.4, 0.7], [1.7, 0.94, 0.86], [2.25, 0.9, 0.88]] },
  hatch: { L: 3.9, belt: 0.84, wb: 1.25, pts: [[-1.95, 0.55, 0.8], [-1.6, 0.74, 0.82], [-0.55, 0.84, 0.82], [0.1, 1.34, 0.66], [1.2, 1.36, 0.66], [1.95, 0.9, 0.8]] },
  wagon: { L: 4.9, belt: 0.88, wb: 1.55, pts: [[-2.45, 0.6, 0.86], [-2.0, 0.82, 0.88], [-1.0, 0.88, 0.88], [-0.4, 1.4, 0.76], [2.3, 1.42, 0.76], [2.45, 0.92, 0.86]] },
  fin: { L: 5.2, belt: 0.84, wb: 1.7, pts: [[-2.6, 0.55, 0.95], [-2.2, 0.8, 0.97], [-0.8, 0.84, 0.97], [-0.1, 1.26, 0.74], [0.9, 1.28, 0.74], [1.5, 0.86, 0.95], [2.45, 0.88, 0.97], [2.6, 0.7, 0.9]] },
  suv: { L: 4.7, belt: 1.04, wb: 1.5, pts: [[-2.35, 0.7, 0.9], [-1.95, 1.04, 0.92], [-0.9, 1.06, 0.92], [-0.25, 1.74, 0.8], [2.2, 1.76, 0.8], [2.35, 1.0, 0.9]] },
  coupe: { L: 4.2, belt: 0.74, wb: 1.35, pts: [[-2.1, 0.5, 0.85], [-1.75, 0.62, 0.86], [-0.5, 0.74, 0.86], [0.4, 1.18, 0.7], [1.0, 1.2, 0.7], [1.9, 0.82, 0.84]] },
  pickup: { L: 5.2, belt: 1.04, wb: 1.7, pts: [[-2.6, 0.7, 0.9], [-2.2, 1.04, 0.92], [-1.2, 1.06, 0.92], [-0.6, 1.72, 0.8], [0.3, 1.74, 0.8], [0.4, 1.06, 0.92], [2.6, 1.06, 0.92]] },
};
export const CAR_KINDS = Object.keys(PROF);
export { outQuad, UVQ };
export const carLength = (kind) => (PROF[kind] || PROF.sedan).L;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// quad given in loop order (with matching uv corners), emitted with its normal pointing away
// from the point `from` (the body centre)
function outQuad(mb, a, b, c, d, st, uv, from = [0, 0.6, 0]) {
  let n = cross(sub(b, a), sub(d, a));
  const l = Math.hypot(n[0], n[1], n[2]);
  if (l < 1e-9) return;
  n = [n[0] / l, n[1] / l, n[2] / l];
  const ctr = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
  const o = sub(ctr, from);
  if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] >= 0) mb.quad([...a, ...b, ...c, ...d], n, st, [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[6], uv[7]]);
  else mb.quad([...d, ...c, ...b, ...a], [-n[0], -n[1], -n[2]], st, [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]]);
}
const UVQ = [0, 1, 1, 1, 1, 0, 0, 0];
// a flat card seen from both sides
function card2(mb, a, b, c, d, st) {
  const ctr = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  outQuad(mb, a, b, c, d, st, UVQ, [ctr[0], ctr[1], ctr[2] + 5]);
  outQuad(mb, a, b, c, d, st, UVQ, [ctr[0], ctr[1], ctr[2] - 5]);
}

export function buildCar(mb, o) {
  const P = PROF[o.kind] || PROF.sedan;
  const tint = o.tint || [1, 1, 1];
  const paint = S('g05_paint', { tint });
  // a low sun on one side of the car (o.sun = +1: the local +x side is lit, -1: the -x side)
  const sunLit = o.sun ? S('g05_paint', { tint: [tint[0] * 1.35, tint[1] * 1.05, tint[2] * 0.75] }) : paint;
  const sunShade = o.sun ? S('g05_paint', { tint: [tint[0] * 0.5, tint[1] * 0.58, tint[2] * 0.85] }) : paint;
  const sideSt = (sgn) => (!o.sun ? paint : sgn === o.sun ? sunLit : sunShade);
  const glass = T('car_glass', { tint: [0.55, 0.6, 0.62] });
  const rub = S('rubber'), chrome = S('chrome');
  const pts = P.pts, y0 = 0.3, belt = P.belt;
  const n = pts.length;
  // top surfaces
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const slope = Math.abs(b[1] - a[1]) > 0.3 && (a[1] >= belt - 0.01 || b[1] >= belt - 0.01);
    const st = slope ? glass : paint;
    outQuad(mb, [-a[2], a[1], a[0]], [a[2], a[1], a[0]], [b[2], b[1], b[0]], [-b[2], b[1], b[0]], st, UVQ);
    // sides: body below the belt line, glass above it
    for (const s of [-1, 1]) {
      const ya = Math.min(a[1], belt), yb = Math.min(b[1], belt);
      outQuad(mb, [s * a[2], y0, a[0]], [s * b[2], y0, b[0]], [s * b[2], yb, b[0]], [s * a[2], ya, a[0]], sideSt(s), UVQ);
      if (a[1] > belt + 0.01 || b[1] > belt + 0.01) {
        const ga = Math.max(a[1], belt), gb = Math.max(b[1], belt);
        outQuad(mb, [s * a[2], belt, a[0]], [s * b[2], belt, b[0]], [s * b[2], gb, b[0]], [s * a[2], ga, a[0]], glass, UVQ);
      }
    }
  }
  // nose and tail
  const f = pts[0], r = pts[n - 1];
  const hl = o.hl ? propGlow('g05_lamp_on', 1.35, o.ch || 0) : T('g05_lamp_off');
  const tl = o.tail ? propGlow('g05_tail_on', 1.2, o.tch || 0) : T('g05_tail');
  outQuad(mb, [-f[2], y0, f[0]], [f[2], y0, f[0]], [f[2], f[1], f[0]], [-f[2], f[1], f[0]], paint, UVQ);
  outQuad(mb, [-r[2], y0, r[0]], [r[2], y0, r[0]], [r[2], r[1], r[0]], [-r[2], r[1], r[0]], paint, UVQ);
  // lamps just proud of the nose / tail
  const fz = f[0] - 0.012, rz = r[0] + 0.012, ly = f[1] - 0.14, ry = r[1] - 0.12;
  for (const s of [-1, 1]) {
    outQuad(mb, [s * (f[2] - 0.1), ly - 0.1, fz], [s * (f[2] - 0.4), ly - 0.1, fz], [s * (f[2] - 0.4), ly + 0.06, fz], [s * (f[2] - 0.1), ly + 0.06, fz], hl, UVQ);
    outQuad(mb, [s * (r[2] - 0.1), ry - 0.1, rz], [s * (r[2] - 0.4), ry - 0.1, rz], [s * (r[2] - 0.4), ry + 0.06, rz], [s * (r[2] - 0.1), ry + 0.06, rz], tl, UVQ);
  }
  // a stippled glow around lit lamps (flat cards, visible from both sides)
  if (o.hl) {
    const halo = propGlow('g05_halo', 1.0, o.ch || 0);
    for (const sx of [-1, 1]) card2(mb, [sx * (f[2] - 0.25) - 0.55, ly - 0.42, fz - 0.05], [sx * (f[2] - 0.25) + 0.55, ly - 0.42, fz - 0.05], [sx * (f[2] - 0.25) + 0.55, ly + 0.38, fz - 0.05], [sx * (f[2] - 0.25) - 0.55, ly + 0.38, fz - 0.05], halo);
  }
  if (o.tail) {
    const th = propGlow('g05_halo_r', 0.9, o.tch || 0);
    for (const sx of [-1, 1]) card2(mb, [sx * (r[2] - 0.25) - 0.4, ry - 0.3, rz + 0.04], [sx * (r[2] - 0.25) + 0.4, ry - 0.3, rz + 0.04], [sx * (r[2] - 0.25) + 0.4, ry + 0.3, rz + 0.04], [sx * (r[2] - 0.25) - 0.4, ry + 0.3, rz + 0.04], th);
  }
  // bumpers and wheels
  const bump = o.kind === 'fin' || o.kind === 'wagon' ? chrome : rub;
  mb.box(-f[2] - 0.02, 0.22, f[0] - 0.06, f[2] + 0.02, 0.4, f[0] + 0.06, bump);
  mb.box(-r[2] - 0.02, 0.22, r[0] - 0.06, r[2] + 0.02, 0.4, r[0] + 0.06, bump);
  const wz = P.wb, wx = pts[2][2] - 0.04;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * wx - 0.12, 0, sz * wz - 0.31, sx * wx + 0.12, 0.62, sz * wz + 0.31, rub, { skip: 8 });
  if (o.kind === 'fin') for (const s of [-1, 1]) mb.box(s * 0.84 - 0.03, 0.86, r[0] - 0.7, s * 0.84 + 0.03, 1.1, r[0] - 0.05, paint);
}

defineProp('g05_car', {
  build(mb, p) { buildCar(mb, p.opts); },
  boxes: (p) => { const P = PROF[p.opts.kind] || PROF.sedan; return [[-0.9, 0, -P.L / 2, 0.9, P.pts[3][1] + 0.05, P.L / 2]]; },
  light: { y: 0.75, z: -3.0, color: [1.0, 0.93, 0.78], rad: 8, int: 0.9, cond: (p) => !!p.opts.hl },
  emitter: { snd: 'g05_tick', y: 0.7, vol: 0.55, rad: 9, cond: (p) => !!p.opts.warm },
});

// cars of an era: kinds and paint
const ERAS = [
  { kinds: ['fin', 'fin', 'sedan'], paint: [[0.55, 1.1, 1.0], [1.15, 0.95, 0.7], [1.2, 0.7, 0.75], [0.95, 1.05, 0.8], [0.9, 0.9, 0.85]] },
  { kinds: ['wagon', 'sedan', 'pickup'], paint: [[1.1, 0.6, 0.35], [0.8, 0.85, 0.45], [1.15, 0.95, 0.4], [0.7, 0.45, 0.35], [0.95, 0.9, 0.8]] },
  { kinds: ['hatch', 'coupe', 'sedan'], paint: [[1.2, 0.3, 0.28], [0.35, 0.4, 0.75], [0.95, 0.95, 0.95], [0.7, 0.72, 0.76], [0.25, 0.3, 0.25]] },
  { kinds: ['sedan', 'coupe', 'wagon'], paint: [[0.3, 0.75, 0.72], [0.65, 0.35, 0.7], [0.3, 0.55, 0.35], [0.75, 0.78, 0.82], [0.9, 0.2, 0.25]] },
  { kinds: ['suv', 'sedan', 'suv'], paint: [[0.75, 0.78, 0.82], [0.22, 0.22, 0.25], [0.3, 0.35, 0.65], [0.95, 0.95, 0.95], [0.55, 0.12, 0.15]] },
];
export function vehicleOf(era, h1, h2) {
  const E = ERAS[Math.max(0, Math.min(ERAS.length - 1, era))];
  return { kind: E.kinds[Math.floor(h1 * E.kinds.length) % E.kinds.length], tint: E.paint[Math.floor(h2 * E.paint.length) % E.paint.length] };
}

// ------------------------------------------------------------------ exit signs
// A hanging sign with an arrow: dir 'l' | 'r' | 'u' | 'd'. Its two faces may point differently.
for (const [d, ch] of [['l', '←'], ['r', '→'], ['u', '↑'], ['d', '↓']]) {
  defineTexture('g05_exit_' + d, (p) => {
    p.fill([12, 74, 38]);
    p.text('EXIT', 9, 6, [220, 255, 226], 2);
    p.rect(2, 27, 60, 1, [140, 220, 160]);
    p.text(ch, 27, 36, [220, 255, 226], 2);
    p.frame(0, 0, 64, 64, [190, 200, 190]);
  }, 6);
}
defineProp('g05_exit', {
  build(mb, p) {
    const o = p.opts, a = propGlow('g05_exit_' + (o.dir || 'l'), 1.15, o.ch || 0), b = propGlow('g05_exit_' + (o.dir2 || o.dir || 'l'), 1.15, o.ch || 0);
    const body = S('plastic_white');
    const w = o.w || 0.5, h = o.h || 0.36;
    mb.box(-w / 2, -h, -0.05, w / 2, 0, 0.05, [body, body, body, body, b, a], { uv: ['world', 'world', 'world', 'world', [0, 0, 1, 1], [0, 0, 1, 1]] });
    if (o.hang) { mb.box(-0.02, 0, -0.02, 0.02, o.hang, 0.02, S('metal_dark'), { skip: 4 }); }
  },
  light: { y: -0.2, color: [0.4, 1.0, 0.55], rad: 3.0, int: 0.3 },
});

// ------------------------------------------------------------------ a made-up script
// Glyphs are strokes between nodes of a 3x4 grid, drawn from a fixed seed so the same sign
// reads the same everywhere. glyphWord(p, seed, n, x, y, cell, colour) draws n glyphs.
const NODES = [];
for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) NODES.push([c, r]);
function glyphStrokes(g) {
  const out = [];
  let s = (g * 2654435761 + 12345) >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const k = 2 + Math.floor(rnd() * 3);
  let cur = Math.floor(rnd() * 12);
  for (let i = 0; i < k; i++) {
    let nx = Math.floor(rnd() * 12);
    if (nx === cur) nx = (nx + 5) % 12;
    out.push([cur, nx]);
    cur = rnd() < 0.55 ? nx : Math.floor(rnd() * 12);
  }
  return { strokes: out, dot: rnd() < 0.35 ? [Math.floor(rnd() * 3), rnd() < 0.5 ? -1 : 4] : null };
}
export function glyph(p, g, x, y, cell, c, thick = 1) {
  const G = glyphStrokes(g);
  for (const [a, b] of G.strokes) {
    const A = NODES[a], B = NODES[b];
    for (let t = 0; t < thick; t++) p.line(x + A[0] * cell + t, y + A[1] * cell, x + B[0] * cell + t, y + B[1] * cell, c);
  }
  if (G.dot) p.rect(x + G.dot[0] * cell, y + G.dot[1] * cell, Math.max(1, thick), Math.max(1, thick), c);
}
// a run of n glyphs from word index w (the same w always spells the same word)
export function glyphWord(p, w, n, x, y, cell, c, thick = 1) {
  const adv = cell * 2 + 3 + thick;
  for (let i = 0; i < n; i++) glyph(p, (w * 31 + i * 7 + 3) % 61, x + i * adv, y, cell, c, thick);
  return n * adv;
}

// ------------------------------------------------------------------ text rows on walls
// digit decals in a row, centred on (cx, cz) along the wall facing `face`; y is the centre height
export function textRow(zb, face, cx, y, cz, str, h = 0.3, opts = {}) {
  const adv = h * 0.7;
  const total = adv * str.length;
  const rx = face === 'pz' ? 1 : face === 'nz' ? -1 : 0, rz = face === 'nx' ? 1 : face === 'px' ? -1 : 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === ' ') continue;
    const o = -total / 2 + adv * (i + 0.5);
    zb.decal(cx + rx * o, y, cz + rz * o, face, adv * 0.95, h, 'digit_' + ch, opts);
  }
}

// ------------------------------------------------------------------ flicker channels
// The engine overwrites the flicker channels every frame in render(); a level script hooks the
// update to set the channels it owns after the normal animation. fn(v, t) edits v (16 values).
export function hookFlicker(game, level, fn) {
  const f = game.flicker;
  f.__g05fn = fn;
  f.__g05level = level;
  if (!f.__g05wrapped) {
    f.__g05wrapped = true;
    const orig = f.update.bind(f);
    f.update = (t) => {
      orig(t);
      if (f.__g05fn && game.levelN === f.__g05level) f.__g05fn(f.v, t);
    };
  }
}

export { hr };
// ------------------------------------------------------------------ misc helpers
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export { pnoise };
