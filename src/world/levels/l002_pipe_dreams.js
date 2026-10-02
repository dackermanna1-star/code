// Level 2: Pipe Dreams. Halls the size of cathedrals and tunnels as wide as roads, every wall a
// bundle of pipes as thick as a tree trunk. Steam drifts up through the floor gratings, the air is
// the colour of rust, and somewhere far away something large is being struck with a hammer.
//
// The world is a lattice of 32 m blocks. Every block holds a hall (the node) and may open into
// its neighbours east and south through pipe-lined galleries; edges are chosen by coordinate hash
// so zones always agree on the seams.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propGlow } from '../props.js';
import { LEVEL_ZONE, defineLevel, env, M, hr, cbox, owns } from './kit.js';
import { fdiv, pmod, placeDoor, quiet, ambientEvents, TAU, pipeSkin } from './g02_kit.js';

const N = 2;
const BS = 32, A = 12, WC = 8, HC = 9;          // block size, corridor start, corridor width, corridor height
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulc = (c, m) => [c[0] * m, c[1] * m, c[2] * m];

// ------------------------------------------------------------------ textures & materials
defineTexture('lv2_plate', (p, r) => {
  p.fill([98, 60, 44]);
  p.noise(4, 0.16, 3);
  p.grain(0.05);
  for (const o of [0, 32]) {
    p.rect(o, 0, 1, 64, [36, 20, 16]); p.rect(0, o, 64, 1, [36, 20, 16]);
    p.rect(o + 1, 0, 1, 64, [150, 98, 72], 0.5); p.rect(0, o + 1, 64, 1, [150, 98, 72], 0.5);
  }
  for (const x of [4, 28, 36, 60]) for (const y of [4, 28, 36, 60]) { p.disc(x, y, 1.3, [156, 104, 76]); p.set(x + 1, y + 1, [34, 20, 16]); }
  for (let i = 0; i < 5; i++) p.stain(r.int(0, 63), r.int(0, 63), r.range(5, 10), [150, 78, 34], 0.5);
}, 12);

defineTexture('lv2_wall', (p, r) => {
  p.fill([70, 38, 30]);
  for (let y = 0; y < 64; y += 8) {
    const off = (y / 8) % 2 ? 8 : 0;
    for (let x = -16; x < 64; x += 16) p.rect(x + off, y, 15, 7, mulc([122, 60, 44], 0.82 + r.next() * 0.32));
  }
  p.noise(4, 0.14, 3);
  p.map((x, y, c) => mulc(c, 0.62 + 0.38 * Math.min(1, y / 40)));      // soot toward the top of the tile
  for (let i = 0; i < 4; i++) p.drip(r.int(0, 63), 0, r.int(14, 44), [22, 12, 10], 0.4, 2);
}, 12);

defineTexture('lv2_ceil', (p) => {
  p.fill([54, 36, 32]);
  for (let x = 0; x < 64; x += 8) { p.rect(x, 0, 2, 64, [30, 20, 18], 0.8); p.rect(x + 2, 0, 1, 64, [92, 62, 52], 0.5); }
  p.noise(4, 0.14, 2);
  p.grain(0.05);
}, 8);

const pipeTex = (base, rust) => pipeSkin(base, rust);
defineTexture('lv2_pipe_a', pipeTex([150, 72, 48]), 10);          // rust red
defineTexture('lv2_pipe_b', pipeTex([118, 124, 106], 0.25), 10);   // pale verdigris grey
defineTexture('lv2_pipe_c', pipeTex([70, 62, 62], 0.3), 10);       // iron
defineTexture('lv2_pipe_d', pipeTex([186, 118, 58], 0.2), 10);     // brass

defineTexture('lv2_bulb', (p) => { p.fill([255, 150, 70]); p.disc(32, 32, 22, [255, 225, 170]); p.noise(4, 0.05, 2); }, 4);
defineTexture('lv2_ember', (p, r) => {
  p.fill([90, 24, 10]);
  p.map((x, y, c) => { const n = pnoise(x, y, 8, 3) * 0.6 + pnoise(x, y, 16, 9) * 0.4; return mix(c, [255, 150, 40], Math.max(0, n - 0.35) * 2.2); });
  p.grain(0.06);
}, 10);
defineTexture('lv2_steam', (p) => {
  p.fill([252, 236, 222]);
  p.map((x, y, c) => mulc(c, 0.86 + 0.14 * pnoise(x, y, 8, 4)));
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = (x - 32) / 31, dy = (y - 34) / 34;
    const d = Math.hypot(dx, dy) + (pnoise(x, y, 8, 5) - 0.5) * 0.7 + (pnoise(x, y, 16, 8) - 0.5) * 0.3;
    p.alpha(x, y, Math.max(0, Math.min(1, (1 - d) * 1.5)) * 255);
  }
}, 6);
defineTexture('lv2_tank', (p, r) => {
  p.fill([108, 66, 50]);
  p.noise(4, 0.14, 3);
  p.map((x, y, c) => mulc(c, 0.7 + 0.5 * Math.exp(-Math.pow((x / 64 - 0.3) * 6, 2))));
  for (const y of [0, 21, 42]) { p.rect(0, y, 64, 2, [40, 26, 22]); p.rect(0, y + 2, 64, 1, [160, 110, 84], 0.5); }
  for (let y = 4; y < 64; y += 21) for (let x = 3; x < 64; x += 8) p.disc(x, y, 1, [168, 118, 88]);
  for (let i = 0; i < 6; i++) p.drip(r.int(0, 63), r.int(0, 30), r.int(14, 34), [28, 18, 14], 0.45, 2);
  p.stain(r.int(0, 63), r.int(0, 63), 10, [150, 80, 36], 0.4);
}, 12);
defineTexture('lv2_furnace', (p) => {
  p.fill([52, 30, 26]);
  p.noise(4, 0.12, 2);
  p.bevel(0, 0, 64, 64, 0.2, 0.3);
  for (const [x, y] of [[8, 10], [36, 10]]) {
    p.rect(x, y, 20, 28, [20, 10, 8]);
    for (let yy = 0; yy < 28; yy += 4) p.rect(x + 1, y + yy + 1, 18, 2, [255, 140 + (yy % 8) * 6, 40]);
    p.frame(x - 1, y - 1, 22, 30, [110, 90, 80]);
  }
  p.rect(0, 46, 64, 2, [26, 16, 14]);
  p.text('B-7', 24, 52, [200, 170, 120]);
}, 14);

defineMaterial('lv2_plate', 'lv2_plate', { s: 4, surf: 'metal', stain: 0.1 });
defineMaterial('lv2_wall', 'lv2_wall', { s: 4, surf: 'concrete', stain: 0.12 });
defineMaterial('lv2_ceil', 'lv2_ceil', { s: 4, surf: 'metal' });
for (const k of ['a', 'b', 'c', 'd']) defineMaterial('lv2_pipe_' + k, 'lv2_pipe_' + k, { s: 4, surf: 'metal' });
defineMaterial('lv2_bulb', 'lv2_bulb', { s: 1, flags: VF.FULLBRIGHT, glow: 1.2 });
defineMaterial('lv2_ember', 'lv2_ember', { s: 3, flags: VF.FULLBRIGHT | VF.SCROLL, glow: 0.8, chan: 10 });
defineMaterial('lv2_tank', 'lv2_tank', { s: 4, surf: 'metal' });
defineMaterial('lv2_furnace', 'lv2_furnace', { s: 3, surf: 'metal' });
const PIPE = ['lv2_pipe_a', 'lv2_pipe_b', 'lv2_pipe_c', 'lv2_pipe_d'];

// ------------------------------------------------------------------ lattice
// the arrival hall is node (0, 0), its gallery runs south along the spine x = 16
const eastOf = (i, j) => hr(i, j, 201) < 0.6;                                     // node (i,j) <-> (i+1,j)
const southOf = (i, j) => (i === 0 && j >= 0 && j <= 3 ? true : i === 0 && j === -1 ? false : hr(i, j, 202) < 0.6);   // (i,j) <-> (i,j+1)

const NODES = new Map();
function node(i, j) {
  const k = i * 100003 + j;
  let n = NODES.get(k);
  if (n) return n;
  const eE = eastOf(i, j), eW = eastOf(i - 1, j), eS = southOf(i, j), eN = southOf(i, j - 1);
  const alive = eE || eW || eS || eN;
  const deg = (eE ? 1 : 0) + (eW ? 1 : 0) + (eS ? 1 : 0) + (eN ? 1 : 0);
  let e = hr(i, j, 203) < 0.34 ? 0 : hr(i, j, 204) < 0.5 ? 4 : 8;
  let h = [11, 13, 15][Math.floor(hr(i, j, 205) * 3)];
  if (i === 0 && j === 0) { e = 8; h = 13; }
  n = { i, j, eE, eW, eS, eN, alive, deg, e, h, type: Math.floor(hr(i, j, 206) * 4) };
  if (NODES.size > 4000) NODES.clear();
  NODES.set(k, n);
  return n;
}
// ceiling height of the gallery on an edge
const edgeH = (ei, ej, vert) => [8, 9, 10][Math.floor(hr(ei, ej, vert ? 211 : 212) * 3)];

const SOLID = 0, ROOM = 1, GX = 2, GZ = 3;
function classify(x, z) {
  const i = fdiv(x, BS), j = fdiv(z, BS), lx = x - i * BS, lz = z - j * BS;
  const n = node(i, j);
  if (!n.alive) return [SOLID, n];
  const lo = A - n.e, hi = A + WC + n.e;
  if (lx >= lo && lx < hi && lz >= lo && lz < hi) return [ROOM, n];
  const cX = lx >= A && lx < A + WC, cZ = lz >= A && lz < A + WC;
  if (cZ && lx >= hi && n.eE) return [GX, n, i, j];
  if (cZ && lx < lo && n.eW) return [GX, n, i - 1, j];
  if (cX && lz >= hi && n.eS) return [GZ, n, i, j];
  if (cX && lz < lo && n.eN) return [GZ, n, i, j - 1];
  return [SOLID, n];
}

// ------------------------------------------------------------------ props
// One 4 m slice of a gallery: pipe bundles along both walls, pipes overhead, crossovers.
// Local z runs along the gallery, x across it; anchored on the centre line.
const BUNDLES = [
  [[1.0, 1.0, 0.95], [0.9, 3.0, 0.8], [0.8, 4.7, 0.7], [0.7, 6.2, 0.55]],                         // organ pipes
  [[1.45, 1.5, 1.4], [0.45, 3.2, 0.42], [0.45, 4.2, 0.4], [1.2, 5.4, 1.0]],                       // trunk
  [[0.6, 0.9, 0.5], [1.7, 0.9, 0.5], [0.6, 2.2, 0.5], [1.6, 2.4, 0.4], [0.6, 3.5, 0.4], [1.4, 4.0, 0.55], [0.8, 5.4, 0.7]],  // rack
  [[1.3, 1.3, 1.25], [0.55, 3.3, 0.5], [1.5, 3.6, 0.7], [0.7, 5.4, 0.65], [1.6, 5.4, 0.5]],       // mixed
];
function slicePipes(o) {
  const hw = WC / 2;
  const out = [];
  const side = (sgn, set) => BUNDLES[set].forEach((q, k) => out.push({ x: sgn * (hw - q[0]), y: q[1], r: q[2], m: PIPE[(o.mseed + k * 3 + (sgn > 0 ? 1 : 0)) % 4], wall: sgn, off: q[0] }));
  side(-1, o.left); side(1, o.right);
  return out;
}

defineProp('lv2_run', {
  build(mb, p) {
    const o = p.opts, hw = WC / 2, L = 4;
    const pipes = slicePipes(o);
    const dk = S('metal_dark');
    for (const q of pipes) {
      const st = S(q.m);
      const sides = q.r > 0.8 ? 10 : q.r > 0.45 ? 8 : 6;
      mb.rod(q.x, q.y, -L / 2, q.x, q.y, L / 2, q.r, sides, st);
      mb.rod(q.x, q.y, -L / 2, q.x, q.y, -L / 2 + 0.14, q.r * 1.2, sides, st);          // flange
      if (q.r > 0.5) mb.box(q.wall * hw, q.y - 0.12, -0.2, q.wall * (hw - q.off) + 0, q.y + 0.12, 0.2, dk, { skip: 0 });   // bracket to the wall
    }
    // overhead runs
    for (const q of o.over) {
      const st = S(q[3]);
      mb.rod(q[0], q[1], -L / 2, q[0], q[1], L / 2, q[2], 8, st);
      mb.rod(q[0], q[1], -L / 2, q[0], q[1], -L / 2 + 0.14, q[2] * 1.2, 8, st);
      mb.box(q[0] - 0.06, q[1] + q[2], -0.06, q[0] + 0.06, HC, 0.06, dk, { skip: 0 });  // hanger
    }
    // a crossover pipe with elbows down into the two bundles
    if (o.cross) {
      const y = o.cross, st = S(PIPE[o.mseed % 4]);
      mb.rod(-hw + 1.6, y, 0, hw - 1.6, y, 0, 0.36, 8, st);
      mb.rod(-hw + 1.6, y - 0.9, 0, -hw + 1.6, y + 0.36, 0, 0.36, 8, st);
      mb.rod(hw - 1.6, y - 0.9, 0, hw - 1.6, y + 0.36, 0, 0.36, 8, st);
    }
  },
  boxes: (p) => {
    const o = p.opts, hw = WC / 2;
    const reach = (set) => Math.max(...BUNDLES[set].map((q) => q[0] + q[2]));
    const top = (set) => Math.max(...BUNDLES[set].map((q) => q[1] + q[2]));
    return [[-hw, 0, -2, -hw + reach(o.left), top(o.left), 2], [hw - reach(o.right), 0, -2, hw, top(o.right), 2]];
  },
});

// caged lamp bolted to a wall or pipe: back at local z = 0, light 0.5 m in front
defineProp('lv2_lamp', {
  build(mb) {
    const dk = S('metal_dark'), glow = S('lv2_bulb');
    mb.box(-0.13, -0.2, 0, 0.13, 0.2, 0.08, dk);
    mb.box(-0.1, -0.13, -0.22, 0.1, 0.13, -0.08, glow);
    for (const sx of [-1, 1]) mb.box(sx * 0.12 - 0.012, -0.16, -0.26, sx * 0.12 + 0.012, 0.16, -0.06, dk);
    mb.box(-0.13, 0.14, -0.26, 0.13, 0.17, -0.04, dk);
  },
  light: { y: 0, z: -0.6, color: [1.0, 0.52, 0.24], rad: 8, int: 1.35 },
});

// a rotating fan of steam sheets, narrow at the vent and spreading as it rises
defineProp('lv2_puff', {
  build(mb, p) {
    const st = propGlow('lv2_steam', 0.9);
    const wb = (p.opts.w || 1.2) * 0.25, wt = p.opts.w || 1.2, h = p.opts.h || 3.4;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI, c = Math.cos(a), s = Math.sin(a);
      mb.card([-c * wb, 0, -s * wb, c * wb, 0, s * wb, c * wt, h, s * wt, -c * wt, h, -s * wt], [-s, 0, c], st, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
});

// vertical tank with weld rings, a catwalk ring and pipes into the ceiling
defineProp('lv2_tank', {
  build(mb, p) {
    const R = p.opts.r || 3, H = p.opts.h || 9;
    const st = S('lv2_tank'), dk = S('metal_dark'), a = S('lv2_pipe_a');
    mb.cyl(0, 0, 0, R, H, 12, st, 3);
    mb.cyl(0, 0, 0, R + 0.15, 0.4, 12, dk, 0);
    mb.cyl(0, H * 0.5, 0, R + 0.1, 0.18, 12, dk, 0);
    mb.rod(R * 0.4, H, 0, R * 0.4, H + 4, 0, 0.5, 8, a);
    mb.rod(-R * 0.4, H, R * 0.3, -R * 0.4, H + 4, R * 0.3, 0.35, 6, S('lv2_pipe_c'));
    // a ladder up the side
    for (let y = 0.4; y < H; y += 0.4) mb.box(-0.3, y, -R - 0.12, 0.3, y + 0.05, -R + 0.05, dk);
    mb.box(-0.3, 0, -R - 0.12, -0.24, H, -R + 0.05, dk);
    mb.box(0.24, 0, -R - 0.12, 0.3, H, -R + 0.05, dk);
    // side pipes at the bottom
    mb.rod(R, 1.2, 0, R + 1.4, 1.2, 0, 0.3, 8, S('lv2_pipe_d'));
    mb.rod(-R, 2.2, 0, -R - 1.4, 2.2, 0, 0.22, 6, S('lv2_pipe_b'));
  },
  boxes: (p) => { const R = (p.opts.r || 3) * 0.88; return [[-R, 0, -R, R, p.opts.h || 9, R]]; },
  emitter: { snd: 'g02_boiler', vol: 0.8, rad: 16, y: 1.5 },
});

// a furnace front: a glowing grille behind bars
defineProp('lv2_furnace', {
  build(mb, p) {
    const w = p.opts.w || 3, h = 3.6, d = 2;
    const f = S('lv2_furnace'), dk = S('metal_dark'), em = S('lv2_ember');
    mb.box(-w / 2, 0, -d / 2, w / 2, h, d / 2, [dk, dk, dk, dk, dk, f], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
    mb.box(-w * 0.32, 0.5, -d / 2 - 0.05, w * 0.32, 1.7, -d / 2 + 0.02, em);
    mb.rod(w * 0.35, h, 0, w * 0.35, h + 6, 0, 0.5, 8, S('lv2_pipe_c'));
  },
  boxes: (p) => { const w = p.opts.w || 3; return [[-w / 2, 0, -1, w / 2, 3.6, 1]]; },
  light: { y: 1.1, z: -1.5, color: [1.0, 0.42, 0.12], rad: 9, int: 1.05 },
  emitter: { snd: 'g02_boiler', vol: 0.9, rad: 14, y: 1.2 },
});

// ------------------------------------------------------------------ dressing
const pipeMat = (a, b, c) => PIPE[Math.floor(hr(a, b, c) * 4)];

function gallery(zb, ei, ej, vert, i, j) {
  // the stub of edge (ei, ej) lying in block (i, j): along z when vert, else along x
  const n = node(i, j);
  const bx = i * BS, bz = j * BS;
  const atStart = vert ? (ej === j - 1) : (ei === i - 1);        // the stub toward the previous node
  const lo = A - n.e, hi = A + WC + n.e;
  const a0 = atStart ? 0 : hi, a1 = atStart ? lo : BS;
  const left = Math.floor(hr(ei, ej, vert ? 221 : 222) * BUNDLES.length), right = Math.floor(hr(ei, ej, vert ? 223 : 224) * BUNDLES.length);
  const H = edgeH(ei, ej, vert);
  const mseed = Math.floor(hr(ei, ej, 225) * 8);
  const lineC = A + WC / 2;                                       // gallery centre line (block local)
  for (let s = Math.floor((a0 + (vert ? bz : bx)) / 4) * 4; s < a1 + (vert ? bz : bx); s += 4) {
    const t0 = s - (vert ? bz : bx);
    if (t0 < a0 || t0 + 4 > a1) continue;
    const sl = (vert ? s : s) / 4;                                // global slice index
    const cx = vert ? bx + lineC : s + 2, cz = vert ? s + 2 : bz + lineC;
    const rot = vert ? 0 : Math.PI / 2;
    const hs = (salt) => hr(ei * 977 + sl, ej * 311 + (vert ? 1 : 0), salt);
    const over = [];
    if (hs(231) < 0.8) over.push([-1.6 + hs(232) * 0.6, H - 1.1, 0.55 + hs(233) * 0.25, pipeMat(sl, ei, 234)]);
    if (hs(235) < 0.7) over.push([1.3 + hs(236) * 0.6, H - 1.3, 0.7 + hs(237) * 0.3, pipeMat(sl, ej, 238)]);
    const cross = hs(239) < 0.4 ? 5.2 + hs(240) * 2.2 : 0;
    if (!owns(zb, cx, cz)) continue;
    zb.prop('lv2_run', cx, 0, cz, rot, { left, right, over, cross, mseed: mseed + (sl & 3), collideBoxes: true });
    // a lamp every 8 m on the wall bundle, alternating sides; a few are dying
    if ((sl & 1) === 0) {
      const side = (sl & 2) ? 1 : -1;
      const lx = vert ? cx + side * (WC / 2 - 0.06) : cx, lz = vert ? cz : cz + side * (WC / 2 - 0.06);
      const lrot = vert ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0);
      const ch = hs(241) < 0.12 ? 5 + Math.floor(hs(242) * 4) : hs(243) < 0.1 ? 3 : 0;
      zb.prop('lv2_lamp', lx, 4.4, lz, lrot, { ch });
    }
    // steam vents in the floor beside the aisle
    if (hs(244) < 0.2) {
      const side = hs(245) < 0.5 ? -1 : 1;
      const vx = vert ? cx + side * 1.3 : cx, vz = vert ? cz : cz + side * 1.3;
      steamVent(zb, vx, vz, 0.8 + hs(246) * 0.5);
    }
    // a hand wheel valve on a pipe, facing the aisle
    if (hs(247) < 0.16) {
      const side = hs(248) < 0.5 ? -1 : 1;
      const q = BUNDLES[side < 0 ? left : right][0];
      const vx = vert ? cx + side * (WC / 2 - q[0] - q[2]) : cx, vz = vert ? cz : cz + side * (WC / 2 - q[0] - q[2]);
      zb.prop('a_valve', vx, q[1] + 0.3, vz, vert ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : (side < 0 ? Math.PI : 0), { r: 0.45, stem: 0.3 });
    }
    // somewhere in the gallery water rushes through a pipe
    if (hs(249) < 0.1) zb.emitter(cx, 2.5, cz, 'g02_pipeflow', { vol: 0.9, rad: 14 });
  }
}

function steamVent(zb, x, z, scale = 1) {
  if (!owns(zb, x, z)) return;
  zb.decal(x, 0, z, 'up', 1.5, 1.5, 'dec_vent_floor');
  zb.dynamic('lv2_puff', x, 0, z, hr(x | 0, z | 0, 251) * TAU, { w: 1.3 * scale, h: 3.4 * scale }, { spin: 0.4 });
  zb.light(x, 1.4, z, { color: [1.0, 0.78, 0.55], rad: 5.5, int: 0.55, ch: 9 });
  zb.emitter(x, 1.0, z, 'g02_steam', { vol: 0.85, rad: 15 });
}

function hall(zb, n) {
  const bx = n.i * BS, bz = n.j * BS;
  const lo = A - n.e, hi = A + WC + n.e;
  const cx0 = bx + 16, cz0 = bz + 16;
  const H = n.h;
  // lamps along the four walls of the hall, between the gallery mouths
  const lamps = [];
  for (const t of [lo + 2, hi - 2]) {
    if (n.e >= 4) {
      lamps.push([bx + t, bz + lo + 0.06, 0, Math.PI]);       // north wall, facing +z... (rot so front faces +z)
      lamps.push([bx + t, bz + hi - 0.06, 0, 0]);             // south wall facing -z
      lamps.push([bx + lo + 0.06, bz + t, 0, -Math.PI / 2 + Math.PI]);   // west wall facing +x
      lamps.push([bx + hi - 0.06, bz + t, 0, -Math.PI / 2]);  // east wall facing -x
    }
  }
  lamps.forEach((l, k) => { if (owns(zb, l[0], l[1])) zb.prop('lv2_lamp', l[0], 4.2, l[1], l[3], { ch: hr(n.i * 9 + k, n.j, 261) < 0.1 ? 6 : 0 }); });
  // overhead: two big pipes crossing the hall (above head height, away from the lanes' lamps)
  const ceilPipe = (alongX, off, y, r, m) => {
    const len = hi - lo;
    for (let s = lo; s < hi; s += 4) {
      const px = alongX ? bx + s + 2 : bx + 16 + off, pz = alongX ? bz + 16 + off : bz + s + 2;
      if (!owns(zb, px, pz)) continue;
      zb.prop('g02_rods', px, y, pz, 0, { segs: alongX ? [[-2, 0, 0, 2, 0, 0, r, 8, m], [-2, 0, 0, -1.86, 0, 0, r * 1.2, 8, m]] : [[0, 0, -2, 0, 0, 2, r, 8, m], [0, 0, -2, 0, 0, -1.86, r * 1.2, 8, m]] });
    }
    void len;
  };
  ceilPipe(true, -2.2 + hr(n.i, n.j, 262) * 1.4, H - 1.6, 0.8, 'lv2_pipe_a');
  ceilPipe(false, 2.2 - hr(n.i, n.j, 263) * 1.4, H - 2.4, 0.6, 'lv2_pipe_c');
  // corner pockets
  const pockets = n.e >= 4 ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : [];
  pockets.forEach(([sx, sz], k) => {
    const px = bx + (sx < 0 ? A - n.e / 2 : A + WC + n.e / 2), pz = bz + (sz < 0 ? A - n.e / 2 : A + WC + n.e / 2);
    if (!owns(zb, px, pz)) return;
    const kind = n.i === 0 && n.j === 0 ? (k === 0 || k === 1 ? 2 : 0) : Math.floor(hr(n.i * 4 + k, n.j, 271) * 4);
    if (kind === 0 && n.e >= 8) {
      zb.prop('lv2_tank', px, 0, pz, 0, { r: 3, h: H - 2 });
      for (const [dx, dz] of [[-3.4, 0], [3.4, 0]]) void dx, void dz;
    } else if (kind === 1 || (kind === 0 && n.e < 8)) {
      // a cluster of tall pipes up through the ceiling
      for (let q = 0; q < 4; q++) {
        const ox = (q & 1 ? 1 : -1) * (n.e / 5 + hr(k, q, 272) * 0.6), oz = (q & 2 ? 1 : -1) * (n.e / 5 + hr(q, k, 273) * 0.6);
        const r = 0.5 + hr(q, k * 7 + n.i, 274) * 0.45;
        const R = r + 0.15;
        zb.prop('g02_rods', px + ox, 0, pz + oz, 0, {
          segs: [[0, 0, 0, 0, H, 0, r, 8, PIPE[(q + k) % 4]], [0, 1.5, 0, 0, 1.64, 0, R, 8, 'lv2_pipe_c'], [0, 4.5, 0, 0, 4.64, 0, R, 8, 'lv2_pipe_c']],
          boxes: [[-r, 0, -r, r, H, r]],
        });
      }
    } else if (kind === 2) {
      zb.prop('lv2_furnace', px, 0, pz, sz < 0 ? Math.PI : 0, { w: Math.min(n.e - 1, 4) });
    } else {
      steamVent(zb, px, pz, 1.3);
    }
  });
  // steam in the middle lane of the bigger halls
  if (n.e >= 4 && hr(n.i, n.j, 281) < 0.7) steamVent(zb, bx + 16 + (hr(n.i, n.j, 282) - 0.5) * 6, bz + 16 + (hr(n.j, n.i, 283) - 0.5) * 6, 1.6);
  void cx0; void cz0;
}

function placeDoors(zb, n) {
  // a door against the wall of a pocket (or the back of a dead end)
  const bx = n.i * BS, bz = n.j * BS;
  const lo = A - n.e, hi = A + WC + n.e;
  const isArrival = n.i === 0 && n.j === 0;
  if (isArrival) return;
  if (n.deg > 1 && hr(n.i, n.j, 291) > 0.6) return;
  if (n.e >= 4) {
    // against the outer wall of a corner pocket
    const k = Math.floor(hr(n.i, n.j, 292) * 4);
    const sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1;
    const px = bx + (sx < 0 ? A - n.e / 2 : A + WC + n.e / 2), pz = bz + (sz < 0 ? lo + 0.2 : hi - 0.2);
    placeDoor(zb, px, pz, sz < 0 ? Math.PI : 0, {});
  } else if (n.deg === 1) {
    // the wall opposite the gallery
    const gx = n.eE ? -1 : n.eW ? 1 : 0, gz = n.eS ? -1 : n.eN ? 1 : 0;
    if (gx) placeDoor(zb, bx + (gx < 0 ? A + 0.2 : A + WC - 0.2), bz + 16, gx < 0 ? Math.PI / 2 : -Math.PI / 2, {});
    else placeDoor(zb, bx + 16, bz + (gz < 0 ? A + 0.2 : A + WC - 0.2), gz < 0 ? Math.PI : 0, {});
  }
}

// ------------------------------------------------------------------ zone
function gen(zb) {
  const { x0, z0, x1, z1 } = zb;
  zb.noConnectivity = true;
  zb.flags.fill(0);
  const wall = M.lv2_wall;
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      const i = zb.i(x, z);
      const [k, n, ei, ej] = classify(x, z);
      zb.fmat[i] = M.lv2_plate; zb.cmat[i] = M.lv2_ceil; zb.wmat[i] = wall;
      zb.floor[i] = 0;
      if (k === SOLID) { zb.solid[i] = wall; zb.ceil[i] = 9; continue; }
      zb.ceil[i] = k === ROOM ? n.h : edgeH(ei, ej, k === GZ);
    }
  }
  const bi0 = fdiv(x0, BS), bi1 = fdiv(x1 - 1, BS), bj0 = fdiv(z0, BS), bj1 = fdiv(z1 - 1, BS);
  for (let j = bj0; j <= bj1; j++) {
    for (let i = bi0; i <= bi1; i++) {
      const n = node(i, j);
      if (!n.alive) continue;
      hall(zb, n);
      if (n.eE) gallery(zb, i, j, false, i, j);
      if (n.eW) gallery(zb, i - 1, j, false, i, j);
      if (n.eS) gallery(zb, i, j, true, i, j);
      if (n.eN) gallery(zb, i, j - 1, true, i, j);
      placeDoors(zb, n);
    }
  }
}

defineZone('lv2_pipes', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.36, 0.2, 0.15],
    env: env({ fog: [0.52, 0.23, 0.105], fogNear: 7, fogFar: 62, hum: 0, hvac: 0.2, reverb: 'hall', tone: 'g02_pipes' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'PIPE DREAMS',
  zoneType: 'lv2_pipes',
  zoneSize: 64,
  entry: { x: 16, y: 0, z: 5.1, yaw: Math.PI },
  doorDensity: 0,
  viewRadius: 4,
  weather: { kind: 'dust', amount: 0.6, color: [1.0, 0.8, 0.62, 0.45], fall: -0.35, wind: [0.25, 0.1], size: 0.013, indoor: true },
  grade: { sat: 1.05, tint: [1.08, 0.98, 0.93] },
  light: { phoneRadius: 4.5, phoneIntensity: 0.3 },
  script(ctx, dt) {
    quiet(ctx);
    ambientEvents(ctx, dt, [
      { snd: 'g02_bang', every: [14, 40], dist: [18, 45], vol: [0.6, 1], y: 3, first: 9 },
      { snd: 'g02_steam_blast', every: [30, 80], dist: [14, 30], vol: [0.5, 0.9], y: 1.5 },
      { snd: 'g02_groan', every: [60, 140], dist: [20, 40], vol: [0.5, 0.9], y: 4 },
    ]);
  },
});
