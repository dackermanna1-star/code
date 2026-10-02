// Level 59: The Maintenance Tunnels. A labyrinth of narrow service tunnels: pale green paint,
// colour-coded pipes and cable trays on the ceiling, fluorescent tubes, hand-painted direction
// signs that cannot all be right. Junctions are 8 m apart; each tunnel between two of them exists
// or not by coordinate hash (a long straight corridor runs from the arrival door).
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { LEVEL_ZONE, defineLevel, env, M, CF, hr, owns, ceilingLight, facing } from './kit.js';
import { fdiv, placeDoor, quiet, ambientEvents, pipeSkin, mulc, mixc, TAU } from './g02_kit.js';

const N = 59;
const BS = 8, A = 3, WC = 2;          // block size, first corridor cell, corridor width
const CH = 2.5;                       // corridor ceiling

// ------------------------------------------------------------------ textures
defineTexture('lv59_wall', (p, r) => {
  p.fill([200, 194, 164]);
  p.rect(0, 25, 64, 39, [126, 156, 128]);
  p.noise(4, 0.09, 3);
  p.rect(0, 23, 64, 3, [48, 76, 62]);
  p.rect(0, 26, 64, 1, [214, 218, 192], 0.6);
  p.rect(31, 0, 1, 64, [96, 100, 88], 0.35);
  p.map((x, y, c) => (y > 54 ? mulc(c, 0.72 + 0.28 * (1 - (y - 54) / 10)) : c));
  p.grain(0.04);
  for (let i = 0; i < 5; i++) p.drip(r.int(0, 63), r.int(0, 20), r.int(14, 44), [70, 60, 40], 0.3, 1);
  p.stain(r.int(8, 56), r.int(36, 56), r.range(5, 9), [70, 82, 60], 0.4);
}, 14);
defineTexture('lv59_floor', (p, r) => {
  p.fill([118, 116, 108]);
  p.noise(4, 0.13, 3);
  p.grain(0.06);
  p.speckle(120, [86, 84, 78], 0.3, 0.7);
  p.speckle(60, [150, 148, 138], 0.3, 0.6);
  for (let k = 0; k < 3; k++) { let x = r.int(0, 63), y = r.int(0, 63); for (let i = 0; i < 20; i++) { p.set(x, y, [70, 68, 64], 0.7); x += r.int(-1, 1); y += 1; } }
  p.stain(r.int(10, 54), r.int(10, 54), r.range(6, 11), [74, 78, 70], 0.4);
}, 12);
defineTexture('lv59_ceil', (p, r) => {
  p.fill([156, 152, 140]);
  p.noise(4, 0.1, 3);
  for (const o of [0, 32]) { p.rect(o, 0, 1, 64, [92, 90, 82]); p.rect(0, o, 64, 1, [92, 90, 82]); }
  p.grain(0.05);
  p.stain(r.int(10, 54), r.int(10, 54), r.range(6, 12), [110, 104, 80], 0.45);
}, 10);
defineTexture('lv59_tray', (p, r) => {
  p.fill([110, 114, 118]);
  for (let y = 4; y < 64; y += 8) for (let x = 4; x < 64; x += 8) p.rect(x, y, 3, 3, [60, 62, 66]);
  for (let x = 6; x < 64; x += 12) p.rect(x, 0, 5, 64, [30, 30, 34]);
  p.grain(0.05);
}, 8);
const PIPES = { red: [190, 58, 46], blue: [62, 104, 176], yel: [214, 184, 52], grn: [70, 142, 92], wht: [196, 196, 190] };
for (const k in PIPES) defineTexture('lv59_pipe_' + k, pipeSkin(PIPES[k], 0.1, [120, 90, 50]), 8);

// signs: label, colours; arrows are drawn with the font's arrow glyphs
const SIGNS = {
  exit: { lines: ['EXIT'], sc: 2, bg: [34, 124, 72], fg: [240, 244, 236] },
  stairs: { lines: ['STAIRS'], sc: 1, bg: [40, 70, 142], fg: [236, 240, 244] },
  sect: { lines: ['SECT.', '4-B'], sc: 1, bg: [222, 192, 44], fg: [30, 30, 28] },
  boiler: { lines: ['BOILER', 'ROOM'], sc: 1, bg: [196, 52, 44], fg: [244, 240, 234] },
  pump: { lines: ['PUMPS'], sc: 1, bg: [236, 232, 214], fg: [30, 60, 120] },
  maint: { lines: ['MAINT.', 'ONLY'], sc: 1, bg: [60, 62, 66], fg: [232, 224, 168] },
};
const ARROWS = { l: '←', r: '→', u: '↑', d: '↓' };
for (const k in SIGNS) for (const a in ARROWS) {
  const d = SIGNS[k];
  defineTexture(`lv59_s_${k}_${a}`, (p) => {
    p.fill(d.bg);
    p.frame(0, 0, 64, 64, mulc(d.bg, 0.55)); p.frame(2, 2, 60, 60, mulc(d.fg, 0.9), 0.0);
    p.rect(3, 3, 58, 1, d.fg, 0.7); p.rect(3, 60, 58, 1, d.fg, 0.7);
    const lh = 9 * d.sc, total = d.lines.length * lh;
    d.lines.forEach((ln, i) => { const w = ln.length * 6 * d.sc - d.sc; p.text(ln, Math.round(32 - w / 2), 8 + i * lh, d.fg, d.sc); });
    // arrow, large (scale 3 = 15 x 21 px)
    p.text(ARROWS[a], 32 - 7, 10 + total + 2, d.fg, 3);
  }, 6);
}
defineTexture('lv59_s_noexit', (p) => { p.fill([236, 232, 220]); p.frame(0, 0, 64, 64, [150, 40, 34]); p.frame(1, 1, 62, 62, [180, 44, 36]); p.text('NO', 20, 14, [190, 36, 30], 3); p.text('EXIT', 14, 38, [190, 36, 30], 2); }, 6);
defineTexture('lv59_s_danger', (p) => { p.map((x, y) => (((x + y) >> 3) % 2 ? [226, 186, 36] : [34, 32, 30])); p.rect(6, 18, 52, 28, [226, 186, 36]); p.text('DANGER', 8, 22, [30, 28, 26], 1); p.text('KEEP', 14, 33, [30, 28, 26], 1); }, 6);
defineTexture('lv59_s_dne', (p) => { p.fill([196, 52, 44]); p.rect(6, 26, 52, 12, [244, 240, 232]); p.text('NO ENTRY', 8, 29, [150, 30, 26], 1); p.frame(0, 0, 64, 64, [100, 24, 20]); }, 6);
defineTexture('lv59_arrow', (p) => {
  p.fill([0, 0, 0]); p.clearAlpha(0);
  const c = [226, 190, 40];
  for (let y = 10; y < 54; y++) for (let x = 24; x < 40; x++) if (y > 24) { p.set(x, y, c); p.alpha(x, y, 255); }
  for (let y = 6; y <= 26; y++) { const w = (y - 6) * 1.1; for (let x = 32 - w; x <= 32 + w; x++) { p.set(x, y, c); p.alpha(x, y, 255); } }
}, 4);
defineTexture('lv59_puddle', (p) => {
  p.fill([34, 44, 40]); p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot((x - 32) / 30, (y - 32) / 22) + (pnoise(x, y, 8, 3) - 0.5) * 0.6;
    if (d < 1) p.alpha(x, y, 255);
  }
  p.noise(4, 0.2, 2);
}, 6);

defineMaterial('lv59_wall', 'lv59_wall', { su: 2.4, sv: 2.4, surf: 'drywall', stain: 0.14 });
defineMaterial('lv59_floor', 'lv59_floor', { s: 2.4, surf: 'concrete', stain: 0.12 });
defineMaterial('lv59_ceil', 'lv59_ceil', { s: 2.4, surf: 'concrete', stain: 0.08 });
defineMaterial('lv59_tray', 'lv59_tray', { s: 1, surf: 'metal' });
for (const k in PIPES) defineMaterial('lv59_pipe_' + k, 'lv59_pipe_' + k, { s: 4, surf: 'metal' });
const PK = Object.keys(PIPES);

// ------------------------------------------------------------------ lattice
// tunnel density changes with the region: some stretches run mostly east-west, others north-south
const bias = (i, j, salt) => 0.3 + 0.62 * hr(fdiv(i, 4), fdiv(j, 4), salt);
const eastOf = (i, j) => (j === 0 && i >= 0 && i < 9 ? true : i === -1 && j === 0 ? false : hr(i, j, 301) < bias(i, j, 311));
const southOf = (i, j) => (i === 0 && (j === 0 || j === -1) ? false : hr(i, j, 302) < bias(i, j, 312));

const NODES = new Map();
function node(i, j) {
  const k = i * 100003 + j;
  let n = NODES.get(k);
  if (n) return n;
  const eE = eastOf(i, j), eW = eastOf(i - 1, j), eS = southOf(i, j), eN = southOf(i, j - 1);
  const deg = (eE ? 1 : 0) + (eW ? 1 : 0) + (eS ? 1 : 0) + (eN ? 1 : 0);
  const u = hr(i, j, 303);
  const e = i === 0 && j === 0 ? 0 : u < 0.55 ? 0 : u < 0.88 ? 1 : 2;
  n = { i, j, eE, eW, eS, eN, deg, alive: deg > 0, e, h: [2.7, 3.0, 3.4][e] };
  if (NODES.size > 6000) NODES.clear();
  NODES.set(k, n);
  return n;
}
const SOLID = 0, ROOM = 1, GX = 2, GZ = 3;
function classify(x, z) {
  const i = fdiv(x, BS), j = fdiv(z, BS), lx = x - i * BS, lz = z - j * BS;
  const n = node(i, j);
  if (!n.alive) return [SOLID, n];
  const lo = A - n.e, hi = A + WC + n.e;
  if (lx >= lo && lx < hi && lz >= lo && lz < hi) return [ROOM, n];
  const cX = lx >= A && lx < A + WC, cZ = lz >= A && lz < A + WC;
  if (cZ && lx >= hi && n.eE) return [GX, n];
  if (cZ && lx < lo && n.eW) return [GX, n];
  if (cX && lz >= hi && n.eS) return [GZ, n];
  if (cX && lz < lo && n.eN) return [GZ, n];
  return [SOLID, n];
}
const isOpen = (x, z) => classify(x, z)[0] !== SOLID;

// ------------------------------------------------------------------ props
// a 4 m piece of the ceiling rack: pipes on both sides, a cable tray in the middle (local z = length)
defineProp('lv59_run', {
  build(mb, p) {
    const o = p.opts, L = 4;
    const pa = S('lv59_pipe_' + PK[o.a]), pb = S('lv59_pipe_' + PK[o.b]), pc = S('lv59_pipe_' + PK[o.c]);
    mb.rod(-0.8, 2.22, -L / 2, -0.8, 2.22, L / 2, 0.1, 6, pa);
    mb.rod(-0.8, 2.22, -L / 2, -0.8, 2.22, -L / 2 + 0.1, 0.13, 6, pa);
    mb.rod(-0.58, 2.34, -L / 2, -0.58, 2.34, L / 2, 0.065, 5, pb);
    mb.rod(0.8, 2.2, -L / 2, 0.8, 2.2, L / 2, 0.075, 5, pc);
    if (o.cableSide) mb.rod(0.64, 2.35, -L / 2, 0.64, 2.35, L / 2, 0.05, 4, S('plastic_black'));
    if (o.tray) {
      const t = S('lv59_tray');
      mb.box(-0.2, 2.3, -L / 2, 0.2, 2.34, L / 2, t, { skip: 4 });
      mb.box(-0.2, 2.34, -L / 2, -0.17, 2.4, L / 2, t, { skip: 4 });
      mb.box(0.17, 2.34, -L / 2, 0.2, 2.4, L / 2, t, { skip: 4 });
      mb.box(-0.15, 2.34, -L / 2, 0.15, 2.4, L / 2, S('plastic_black'), { skip: 4 });
    }
    // brackets
    for (const x of [-0.8, 0.8]) mb.box(x - 0.015, 2.22, -0.02, x + 0.015, CH, 0.02, S('metal_dark'), { skip: 0 });
  },
});

// hanging direction sign: two boards back to back (they need not agree), hung on two chains
defineProp('lv59_sign', {
  build(mb, p) {
    const w = 0.28, y0 = 1.86, y1 = 2.42, dk = S('metal_dark');
    const front = T(p.opts.f), back = T(p.opts.b);
    mb.quad([w, y0, -0.012, -w, y0, -0.012, -w, y1, -0.012, w, y1, -0.012], [0, 0, -1], front, [0, 1, 1, 1, 1, 0, 0, 0]);
    mb.quad([-w, y0, 0.012, w, y0, 0.012, w, y1, 0.012, -w, y1, 0.012], [0, 0, 1], back, [0, 1, 1, 1, 1, 0, 0, 0]);
    mb.box(-w - 0.015, y0, -0.014, -w, y1, 0.014, dk);
    mb.box(w, y0, -0.014, w + 0.015, y1, 0.014, dk);
    mb.box(-w, y1, -0.014, w, y1 + 0.015, 0.014, dk);
    mb.box(-w, y0 - 0.015, -0.014, w, y0, 0.014, dk);
    for (const x of [-0.2, 0.2]) mb.rod(x, y1, 0, x, CH, 0, 0.008, 3, dk);
  },
});

// vertical riser pipe up through the ceiling, with collars
defineProp('lv59_riser', {
  build(mb, p) {
    const st = S('lv59_pipe_' + PK[p.opts.c || 0]);
    mb.rod(0, 0, 0, 0, CH + 0.3, 0, 0.1, 6, st);
    for (const y of [0.3, 1.2, 2.1]) mb.rod(0, y, 0, 0, y + 0.08, 0, 0.14, 6, S('metal_dark'));
  },
  boxes: [[-0.11, 0, -0.11, 0.11, 2.5, 0.11]],
});

// ------------------------------------------------------------------ dressing
const wallProp = (zb, type, x, z, nx, nz, y, opts) => { if (owns(zb, x, z)) zb.prop(type, x, y, z, facing(nx, nz), opts); };

function signFor(n, k, salt) {
  const kinds = Object.keys(SIGNS), arrows = Object.keys(ARROWS);
  const who = hr(n.i * 7 + k, n.j, salt);
  if (who < 0.07) return 'lv59_s_noexit';
  if (who < 0.11) return 'lv59_s_danger';
  const kind = kinds[Math.floor(hr(n.i, n.j * 5 + k, salt + 1) * kinds.length)];
  const a = arrows[Math.floor(hr(n.i * 3 + k, n.j * 11, salt + 2) * 4)];
  return `lv59_s_${kind}_${a}`;
}

function runs(zb, n) {
  const bx = n.i * BS, bz = n.j * BS;
  // X axis: windows of 4 m along the centre line z = bz + 4
  for (const axis of ['x', 'z']) {
    for (let w = 0; w < 2; w++) {
      const s0 = w * 4;
      const cells = [0, 1, 2, 3].map((q) => (axis === 'x' ? isOpen(bx + s0 + q, bz + A) : isOpen(bx + A, bz + s0 + q)));
      if (!cells.every(Boolean)) continue;
      const cx = axis === 'x' ? bx + s0 + 2 : bx + A + WC / 2, cz = axis === 'x' ? bz + A + WC / 2 : bz + s0 + 2;
      if (!owns(zb, cx, cz)) continue;
      const hs = (salt) => hr(Math.floor(cx), Math.floor(cz) + (axis === 'x' ? 0 : 7919), salt);
      zb.prop('lv59_run', cx, 0, cz, axis === 'x' ? Math.PI / 2 : 0, { a: Math.floor(hs(331) * 5), b: Math.floor(hs(332) * 5), c: Math.floor(hs(333) * 5), tray: hs(334) < 0.7, cableSide: hs(335) < 0.4 });
      // wall furniture on the two walls of this window
      const sides = axis === 'x' ? [[0, -1, bz + A], [0, 1, bz + A + WC]] : [[-1, 0, bx + A], [1, 0, bx + A + WC]];
      sides.forEach(([sx, sz, wall], si) => {
        const u = hs(341 + si);
        // aisle normal: the wall at the low side faces +, the high side faces -
        const nx = axis === 'z' ? (si === 0 ? 1 : -1) : 0, nz = axis === 'x' ? (si === 0 ? 1 : -1) : 0;
        const px = axis === 'x' ? cx : wall, pz = axis === 'x' ? wall : cz;
        if (u < 0.08) wallProp(zb, 'extinguisher', px, pz, nx, nz, 0.15, {});
        else if (u < 0.16) wallProp(zb, 'panel_elec', px, pz, nx, nz, -0.1, {});
        else if (u < 0.26) {
          const tex = signFor(n, w + si * 2 + (axis === 'x' ? 0 : 4), 351);
          zb.decal(px + nx * 0.01, 1.55, pz + nz * 0.01, nx > 0 ? 'px' : nx < 0 ? 'nx' : nz > 0 ? 'pz' : 'nz', 0.5, 0.5, tex);
        } else if (u < 0.31) wallProp(zb, 'a_valve', px, pz, nx, nz, 1.25, { r: 0.2, stem: 0.12 });
        else if (u < 0.36) wallProp(zb, 'g02_hatch', px, pz, nx, nz, 0, {});
      });
      // puddles and floor arrows
      if (hs(361) < 0.14) zb.decal(cx + (hs(362) - 0.5) * 0.8, 0, cz + (hs(363) - 0.5) * 0.8, 'up', 1 + hs(364), 0.8 + hs(365) * 0.6, 'lv59_puddle', { rot: hs(366) * TAU });
      if (hs(367) < 0.12) zb.decal(cx, 0, cz, 'up', 0.8, 1.2, 'lv59_arrow', { rot: [0, Math.PI / 2, Math.PI, Math.PI * 1.5][Math.floor(hs(368) * 4)] });
    }
  }
}

// a small steel hatch on the wall
defineProp('g02_hatch', {
  build(mb) {
    const dk = S('metal_dark'), m = S('metal');
    mb.box(-0.4, 0.1, -0.05, 0.4, 1.3, 0, dk);
    mb.box(-0.34, 0.16, -0.08, 0.34, 1.24, -0.05, m);
    mb.box(0.2, 0.62, -0.12, 0.3, 0.68, -0.08, dk);
  },
  boxes: [[-0.4, 0.1, -0.1, 0.4, 1.3, 0]],
});

function lightsAndSigns(zb, n) {
  const bx = n.i * BS, bz = n.j * BS;
  const cx = bx + 4, cz = bz + 4;
  const tube = (x, z, rot, salt) => {
    if (!zb.in(Math.floor(x), Math.floor(z))) return;
    const u = hr(Math.floor(x * 3), Math.floor(z * 3), salt);
    const state = u < 0.07 ? 'off' : u < 0.16 ? 'flicker' : u < 0.2 ? 'dying' : 'on';
    ceilingLight(zb, x, z, 'tube', state, { rot, color: [0.86, 1.0, 0.9], rad: 7.2, mul: 1.15 });
  };
  const axisX = n.eE || n.eW;
  tube(cx, cz, axisX ? 1 : 0, 371);
  if (n.e >= 1) { tube(cx - 1.4, cz - 1.4, 1, 372); tube(cx + 1.4, cz + 1.4, 1, 373); }
  // tubes in the middle of each tunnel to the east and south (owned by this block)
  if (n.eE) tube(bx + BS, cz, 1, 374);
  if (n.eS) tube(cx, bz + BS, 0, 375);
  // hanging signs at junctions
  if (n.deg >= 2 && hr(n.i, n.j, 381) < (n.deg >= 3 ? 0.75 : 0.4) && owns(zb, cx, cz)) {
    const hasX = n.eE || n.eW, hasZ = n.eN || n.eS;
    const alongX = hasX && (!hasZ || hr(n.i, n.j, 382) < 0.5);
    zb.prop('lv59_sign', cx, 0, cz, alongX ? Math.PI / 2 : 0, { f: signFor(n, 0, 383), b: signFor(n, 1, 386) });
  }
  // the floor of the junction: a painted arrow
  if (n.deg >= 3 && hr(n.i, n.j, 391) < 0.5 && owns(zb, cx, cz)) zb.decal(cx, 0, cz, 'up', 1, 1.4, 'lv59_arrow', { rot: Math.floor(hr(n.i, n.j, 392) * 4) * Math.PI / 2 });
  // risers in the corners of the bigger junctions
  if (n.e >= 1 && owns(zb, cx, cz)) {
    const lo = A - n.e, hi = A + WC + n.e;
    for (const [lx, lz] of [[lo + 0.4, lo + 0.4], [hi - 0.4, hi - 0.4]]) if (hr(n.i * 3 + lx, n.j * 5 + lz, 393) < 0.7) zb.prop('lv59_riser', bx + lx, 0, bz + lz, 0, { c: Math.floor(hr(n.i, n.j, 394) * 5) });
  }
}

function doors(zb, n) {
  const bx = n.i * BS, bz = n.j * BS;
  const lo = A - n.e, hi = A + WC + n.e;
  if (n.i === 0 && n.j === 0) return;
  const dead = n.deg === 1;
  if (hr(n.i, n.j, 401) > (dead ? 0.09 : 0.012)) return;
  // pick a wall of the room without a tunnel in it
  const free = [];
  if (!n.eE) free.push('E'); if (!n.eW) free.push('W'); if (!n.eS) free.push('S'); if (!n.eN) free.push('N');
  if (!free.length) return;
  const side = free[Math.floor(hr(n.i, n.j, 402) * free.length)];
  const mid = bx + A + WC / 2, midz = bz + A + WC / 2;
  if (side === 'E') placeDoor(zb, bx + hi - 0.2, midz, -Math.PI / 2, {});
  else if (side === 'W') placeDoor(zb, bx + lo + 0.2, midz, Math.PI / 2, {});
  else if (side === 'S') placeDoor(zb, mid, bz + hi - 0.2, 0, {});
  else placeDoor(zb, mid, bz + lo + 0.2, Math.PI, {});
}

function gen(zb) {
  const { x0, z0, x1, z1 } = zb;
  zb.noConnectivity = true;
  zb.flags.fill(0);
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      const i = zb.i(x, z);
      const [k, n] = classify(x, z);
      zb.fmat[i] = M.lv59_floor; zb.cmat[i] = M.lv59_ceil; zb.wmat[i] = M.lv59_wall;
      zb.floor[i] = 0;
      if (k === SOLID) { zb.solid[i] = M.lv59_wall; zb.ceil[i] = CH; continue; }
      zb.ceil[i] = k === ROOM ? n.h : CH;
    }
  }
  const bi0 = fdiv(x0, BS), bi1 = fdiv(x1 - 1, BS), bj0 = fdiv(z0, BS), bj1 = fdiv(z1 - 1, BS);
  for (let j = bj0; j <= bj1; j++) {
    for (let i = bi0; i <= bi1; i++) {
      const n = node(i, j);
      if (!n.alive) continue;
      lightsAndSigns(zb, n);
      runs(zb, n);
      doors(zb, n);
    }
  }
}

defineZone('lv59_tunnels', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.2, 0.22, 0.2],
    env: env({ fog: [0.2, 0.23, 0.2], fogNear: 4, fogFar: 30, hum: 0.55, hvac: 0.35, reverb: 'tunnel', tone: 'g02_maint' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THE MAINTENANCE TUNNELS',
  zoneType: 'lv59_tunnels',
  zoneSize: 64,
  entry: { x: 3.95, y: 0, z: 4.0, yaw: Math.PI / 2 },
  doorDensity: 0,
  viewRadius: 3,
  grade: { sat: 0.9, tint: [0.97, 1.03, 0.98] },
  light: { phoneRadius: 3.6, phoneIntensity: 0.25 },
  script(ctx, dt) {
    quiet(ctx);
    ambientEvents(ctx, dt, [
      { snd: 'g02_clank', every: [18, 55], dist: [14, 40], vol: [0.5, 1], y: 1.5, first: 10 },
      { snd: 'g02_valve', every: [40, 110], dist: [10, 28], vol: [0.5, 0.9], y: 1.6 },
      { snd: 'g02_ticks', every: [25, 70], dist: [6, 22], vol: [0.4, 0.8], y: 2.2, near: 10 },
    ]);
  },
});
