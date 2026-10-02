// DRAFT, NOT LOADED (not imported by g02.js): written but never run in the game; its sounds (g02_mine
// tone, g02_cart_far, g02_rockfall, g02_timber, g02_shaft_moan, g02_shaftwind) are not written yet.
// Level 8: Forgotten Mineshaft. Timbered drifts and crosscuts in dark rock, rails running down
// the middle, carts left where they stopped, lanterns that nobody lit. Some chambers are broken
// open by shafts that fall away into nothing; some have a few planks laid across. You arrive at
// the end of a long drift; far ahead a column of cold light falls from the surface into the
// Great Pit, and the rails run out across it on a trestle.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S } from '../props.js';
import { LEVEL_ZONE, defineLevel, env, M, hr, cbox, owns, noise } from './kit.js';
import { fdiv, placeDoor, quiet, ambientEvents, mulc, mixc, TAU } from './g02_kit.js';

const N = 8;
const BS = 32, C = 16;                    // lattice block, centre line of the drifts
const GREAT_R = 12, GREAT_PIT = 6.5, GREAT_H = 15;

// ------------------------------------------------------------------ textures
defineTexture('lv8_rock', (p, r) => {
  p.fill([96, 84, 70]);
  p.map((x, y, c) => mulc(c, 0.55 + 0.9 * (pnoise(x, y, 4, 3) * 0.6 + pnoise(x, y, 8, 5) * 0.4)));
  for (let i = 0; i < 5; i++) { let x = r.int(0, 63), y = r.int(0, 63); for (let k = 0; k < 18; k++) { p.set(x, y, [40, 34, 28], 0.8); x += r.int(-1, 1); y += r.chance(0.7) ? 1 : 0; } }
  for (let i = 0; i < 3; i++) p.stain(r.int(0, 63), r.int(0, 63), r.range(4, 9), [150, 112, 60], 0.35);
  p.grain(0.07);
  p.speckle(90, [150, 138, 120], 0.3, 0.6);
}, 14);
defineTexture('lv8_floor', (p, r) => {
  p.fill([86, 72, 58]);
  p.noise(4, 0.2, 3);
  p.grain(0.1);
  p.speckle(240, [124, 108, 90], 0.3, 0.8);
  p.speckle(160, [46, 38, 30], 0.3, 0.8);
  for (let i = 0; i < 9; i++) p.disc(r.int(0, 63), r.int(0, 63), r.range(1, 2.4), mulc([112, 98, 82], 0.8 + r.next() * 0.4), 0.9);
}, 12);
defineTexture('lv8_timber', (p, r) => {
  p.fill([104, 72, 42]);
  p.map((x, y, c) => mulc(c, 0.62 + 0.55 * pnoise(x * 0.35, y, 8, 3) + 0.2 * Math.sin(x * 0.8 + pnoise(x, y, 4, 9) * 6)));
  for (let i = 0; i < 4; i++) p.line(r.int(0, 63), 0, r.int(0, 63), 63, [40, 26, 16], 0.5);
  p.grain(0.06);
  p.stain(r.int(0, 63), r.int(0, 63), 8, [60, 70, 50], 0.35);
}, 12);
defineTexture('lv8_iron', (p) => {
  p.fill([88, 70, 58]);
  p.noise(4, 0.2, 3);
  p.map((x, y, c) => { const n = pnoise(x, y, 6, 3); return n > 0.5 ? mixc(c, [150, 80, 36], Math.min(1, (n - 0.5) * 4)) : c; });
  p.grain(0.07);
}, 10);
defineTexture('lv8_lamp', (p) => { p.fill([255, 176, 80]); p.disc(32, 32, 22, [255, 232, 170]); }, 4);
defineTexture('lv8_shaft', (p) => { p.fill([205, 224, 245]); p.noise(4, 0.08, 2); }, 4);
defineTexture('lv8_puddle', (p) => {
  p.fill([22, 24, 24]); p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot((x - 32) / 30, (y - 32) / 24) + (pnoise(x, y, 8, 3) - 0.5) * 0.7;
    if (d < 1) p.alpha(x, y, 255);
  }
  p.noise(4, 0.25, 2);
}, 6);

defineMaterial('lv8_rock', 'lv8_rock', { s: 3, surf: 'concrete', stain: 0.15 });
defineMaterial('lv8_floor', 'lv8_floor', { s: 2.4, surf: 'asphalt', stain: 0.1 });
defineMaterial('lv8_timber', 'lv8_timber', { s: 1.2, surf: 'wood' });
defineMaterial('lv8_iron', 'lv8_iron', { s: 1.2, surf: 'metal' });
defineMaterial('lv8_lamp', 'lv8_lamp', { s: 1, flags: VF.FULLBRIGHT, glow: 1.2 });
defineMaterial('lv8_shaft', 'lv8_shaft', { s: 4, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 0.9 });

// ------------------------------------------------------------------ lattice
const eastOf = (i, j) => (j === 0 && i >= -1 && i <= 2 ? true : j === 0 && (i === -2) ? false : hr(i, j, 601) < 0.6);
const southOf = (i, j) => (j === 0 && (i === -1 || i === 0 && false) ? false : (i === 0 && j === -1) ? hr(i, j, 602) < 0.7 : (i === -1 && (j === 0 || j === -1)) ? false : hr(i, j, 602) < 0.6);

const NODES = new Map();
function node(i, j) {
  const k = i * 100003 + j;
  let n = NODES.get(k);
  if (n) return n;
  const eE = eastOf(i, j), eW = eastOf(i - 1, j), eS = southOf(i, j), eN = southOf(i, j - 1);
  const deg = (eE ? 1 : 0) + (eW ? 1 : 0) + (eS ? 1 : 0) + (eN ? 1 : 0);
  const great = i === 0 && j === 0;
  const rect = deg === 1;
  let r = rect ? 3 : 3.2 + hr(i, j, 603) * 4.2;
  if (great) r = GREAT_R;
  const pit = great || (!rect && r >= 5.2 && hr(i, j, 604) < 0.45);
  const rp = great ? GREAT_PIT : Math.min(r - 2.6, 1.4 + hr(i, j, 605) * 2.4);
  const bridge = !great && pit && ((eE && eW) || (eN && eS)) && hr(i, j, 606) < 0.7;
  n = { i, j, eE, eW, eS, eN, deg, alive: deg > 0, great, rect, r, pit, rp, bridge, bridgeX: eE && eW, cx: i * BS + C, cz: j * BS + C, h: great ? GREAT_H : rect ? 3.0 : 3.3 + hr(i, j, 607) * 0.9 };
  if (NODES.size > 4000) NODES.clear();
  NODES.set(k, n);
  return n;
}
const edgeTrack = (i, j, vert) => hr(i, j, vert ? 611 : 612) < 0.6;
const rough = (x, z) => noise(x, z, 3.2, 21);

const SOLID = 0, CHAM = 1, DX = 2, DZ = 3, NICHE = 4;
// a niche: a small rectangular recess off a drift, 3 m wide, 3 m deep, with a door at its back
function nicheOf(i, j, vert) {
  if (hr(i, j, vert ? 621 : 622) > 0.38) return null;
  const t = 9 + Math.floor(hr(i, j, 623) * 14);              // distance along the edge from the node centre
  const side = hr(i, j, 624) < 0.5 ? -1 : 1;
  return { t, side };
}
function classify(x, z) {
  const i = fdiv(x, BS), j = fdiv(z, BS);
  const n = node(i, j);
  const px = x + 0.5, pz = z + 0.5;
  const dx = px - n.cx, dz = pz - n.cz;
  if (n.alive) {
    const rr = n.great ? n.r + (noise(x, z, 4, 31) - 0.5) * 2.2 : n.r + (noise(x, z, 3, 32) - 0.5) * 2.4;
    if (n.rect ? Math.max(Math.abs(dx), Math.abs(dz)) < n.r : Math.hypot(dx, dz) < rr) return [CHAM, n];
    const h = 1.9 + 1.2 * rough(x, z);
    if (n.eE && dx > 0 && Math.abs(dz) < h) return [DX, n, i, j];
    if (n.eW && dx < 0 && Math.abs(dz) < h) return [DX, n, i - 1, j];
    if (n.eS && dz > 0 && Math.abs(dx) < h) return [DZ, n, i, j];
    if (n.eN && dz < 0 && Math.abs(dx) < h) return [DZ, n, i, j - 1];
  }
  // niches belong to the block whose node owns the edge going east / south from it
  for (const [ni, nj, vert] of [[i, j, false], [i - 1, j, false], [i, j, true], [i, j - 1, true]]) {
    const e = vert ? southOf(ni, nj) : eastOf(ni, nj);
    if (!e) continue;
    const nc = nicheOf(ni, nj, vert);
    if (!nc) continue;
    const a = node(ni, nj);
    // niche centre along the edge, measured from the node centre
    const nxc = vert ? a.cx + nc.side * 0 : a.cx + nc.t, nzc = vert ? a.cz + nc.t : a.cz;
    if (!vert) {
      if (px > nxc - 1.5 && px < nxc + 1.5) { const d = (pz - nzc) * nc.side; if (d > 0.8 && d < 4) return [NICHE, a, ni, nj, nc.side]; }
    } else if (pz > nzc - 1.5 && pz < nzc + 1.5) { const d = (px - nxc) * nc.side; if (d > 0.8 && d < 4) return [NICHE, a, ni, nj, nc.side]; }
  }
  return [SOLID, n];
}
const ceilAt = (k, n, x, z) => (k === CHAM ? n.h + (n.great ? 0 : (noise(x, z, 3, 41) - 0.5) * 0.7) : k === NICHE ? 2.7 : 2.5 + noise(x, z, 4, 42) * 0.7);
const isPit = (n, px, pz) => n.pit && Math.hypot(px - n.cx, pz - n.cz) < n.rp + (n.great ? (noise(px, pz, 4, 51) - 0.5) * 1.6 : (noise(px, pz, 3, 52) - 0.5) * 1.0);
const openCell = (x, z) => { const [k] = classify(x, z); return k !== SOLID; };

// ------------------------------------------------------------------ props
defineProp('lv8_track', {
  build(mb, p) {
    const L = 4, iron = S('lv8_iron'), wood = S('lv8_timber');
    for (const s of [-0.45, 0.45]) mb.box(s - 0.025, 0.1, -L / 2, s + 0.025, 0.17, L / 2, iron, { skip: 8 });
    for (let t = -L / 2 + 0.2; t < L / 2; t += 0.8) mb.box(-0.7, 0.0, t - 0.07, 0.7, 0.1, t + 0.07, wood, { skip: 8 });
  },
});
defineProp('lv8_cart', {
  build(mb, p) {
    const iron = S('lv8_iron'), wood = S('lv8_timber');
    const tilt = p.opts.tilt || 0;
    mb.box(-0.5, 0.3, -0.7, 0.5, 0.36, 0.7, iron);
    for (const [a, b] of [[-0.5, -0.45], [0.45, 0.5]]) mb.box(a, 0.36, -0.7, b, 0.95, 0.7, iron);
    for (const [a, b] of [[-0.7, -0.65], [0.65, 0.7]]) mb.box(-0.5, 0.36, a, 0.5, 0.95, b, iron);
    mb.box(-0.45, 0.36, -0.65, 0.45, 0.62 + (p.opts.full ? 0.18 : 0), 0.65, S('lv8_rock'));
    for (const sx of [-0.45, 0.45]) for (const sz of [-0.45, 0.45]) mb.rod(sx - 0.03, 0.18, sz, sx + 0.03, 0.18, sz, 0.17, 8, S('metal_dark'), true);
    mb.box(-0.55, 0.9, -0.7, -0.45, 1.0, 0.7, wood);
    mb.box(0.45, 0.9, -0.7, 0.55, 1.0, 0.7, wood);
    void tilt;
  },
  boxes: [[-0.55, 0, -0.75, 0.55, 1.0, 0.75]],
});
defineProp('lv8_lantern', {
  build(mb) {
    const dk = S('metal_dark');
    mb.box(-0.09, -0.3, -0.09, 0.09, -0.04, 0.09, S('lv8_lamp'));
    mb.box(-0.1, -0.33, -0.1, 0.1, -0.3, 0.1, dk);
    mb.box(-0.1, -0.04, -0.1, 0.1, -0.01, 0.1, dk);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.09 - 0.008, -0.3, sz * 0.09 - 0.008, sx * 0.09 + 0.008, -0.04, sz * 0.09 + 0.008, dk);
    mb.rod(0, -0.01, 0, 0, 0.35, 0, 0.008, 3, dk);
  },
  light: { y: -0.2, color: [1.0, 0.62, 0.27], rad: 8, int: 1.05 },
});
// stacked rocks
defineProp('lv8_rubble', {
  build(mb, p, r) {
    const st = S('lv8_rock');
    const n = p.opts.n || 5;
    for (let i = 0; i < n; i++) {
      const w = 0.2 + r.next() * 0.45, h = 0.14 + r.next() * 0.3;
      const x = (r.next() - 0.5) * 1.3, z = (r.next() - 0.5) * 1.3;
      mb.box(x - w / 2, 0, z - w / 2, x + w / 2, h + (1 - Math.hypot(x, z)) * 0.2, z + w / 2, st);
    }
  },
  boxes: [[-0.5, 0, -0.5, 0.5, 0.3, 0.5]],
});
defineProp('lv8_barrier', {
  build(mb, p) {
    const w = S('lv8_timber');
    for (const x of [-1, 1]) mb.box(x - 0.05, 0, -0.05, x + 0.05, 1.0, 0.05, w);
    mb.box(-1.05, 0.55, -0.025, 0.2, 0.62, 0.025, w);
    mb.box(0.3, 0.85, -0.025, 1.05, 0.92, 0.025, w);
  },
});

// ------------------------------------------------------------------ dressing
const lantern = (zb, x, y, z, salt) => {
  if (!owns(zb, x, z)) return;
  const u = hr(Math.floor(x * 2), Math.floor(z * 2), salt);
  if (u < 0.2) { zb.prop('lv8_lantern', x, y, z, 0, { ch: 0, off: true }); return; }
  zb.prop('lv8_lantern', x, y, z, 0, { ch: u < 0.5 ? 2 + Math.floor(u * 10) % 3 : 0 });
};

// timber set (two legs and a cap) across the drift at absolute x (or z when vert)
function timberSet(zb, a, c, vert) {
  // scan outwards from the centre line to find the walls
  const scan = (dir) => {
    for (let d = 0; d < 6; d++) {
      const x = vert ? Math.floor(c + dir * (d + 0.5)) : Math.floor(a), z = vert ? Math.floor(a) : Math.floor(c + dir * (d + 0.5));
      if (!openCell(x, z)) return d;
    }
    return 6;
  };
  const d0 = scan(-1), d1 = scan(1);
  if (d0 < 1 || d1 < 1 || d0 + d1 > 5) return null;
  const lo = c - d0 + 0.18, hi = c + d1 - 0.18;
  const x = vert ? c : a, z = vert ? a : c;
  const [k, n] = classify(Math.floor(vert ? c : a), Math.floor(vert ? a : c));
  if (k === CHAM) return null;
  const top = Math.min(2.3, ceilAt(k, n, Math.floor(x), Math.floor(z)) - 0.15);
  if (!owns(zb, x, z)) return null;
  const T = M.lv8_timber, t = 0.11;
  if (!vert) {
    zb.box(a - t, 0, lo - t, a + t, top, lo + t, T); zb.box(a - t, 0, hi - t, a + t, top, hi + t, T);
    zb.box(a - t, top, lo - 0.3, a + t, top + 0.2, hi + 0.3, T, { collide: false });
  } else {
    zb.box(lo - t, 0, a - t, lo + t, top, a + t, T); zb.box(hi - t, 0, a - t, hi + t, top, a + t, T);
    zb.box(lo - 0.3, top, a - t, hi + 0.3, top + 0.2, a + t, T, { collide: false });
  }
  return { x: vert ? (lo + hi) / 2 : a, z: vert ? a : (lo + hi) / 2, top };
}

function drifts(zb, n) {
  for (const vert of [false, true]) {
    for (const dirSign of [1, -1]) {
      // the half edge from this node's centre toward +/- along the axis
      const has = vert ? (dirSign > 0 ? n.eS : n.eN) : (dirSign > 0 ? n.eE : n.eW);
      if (!has) continue;
      const ei = vert ? n.i : dirSign > 0 ? n.i : n.i - 1, ej = vert ? (dirSign > 0 ? n.j : n.j - 1) : n.j;
      const tracked = edgeTrack(ei, ej, vert);
      const c0 = vert ? n.cx : n.cz;
      for (let t = 4; t < BS / 2; t += 1) {
        const a = (vert ? n.cz : n.cx) + dirSign * t;
        // timber sets every 3 m of absolute coordinate
        if ((Math.floor(a) % 3 + 3) % 3 === 0 && t > n.r + 0.5) {
          const set = timberSet(zb, Math.floor(a) + 0.5, c0, vert);
          if (set && hr(Math.floor(a), Math.floor(c0), 631) < 0.4) lantern(zb, set.x, set.top - 0.1, set.z, 632);
        }
      }
      if (tracked) {
        // track in 4 m slices, aligned to absolute multiples of 4, avoiding pits and chambers
        for (let s = Math.floor(((vert ? n.cz : n.cx) - BS / 2) / 4) * 4; s < (vert ? n.cz : n.cx) + BS / 2; s += 4) {
          const mid = s + 2;
          const inHalf = dirSign > 0 ? mid > (vert ? n.cz : n.cx) : mid < (vert ? n.cz : n.cx);
          if (!inHalf) continue;
          const x = vert ? c0 : mid, z = vert ? mid : c0;
          if (!owns(zb, x, z) || !openCell(Math.floor(x), Math.floor(z))) continue;
          // not over a pit
          let bad = false;
          for (let q = -2; q <= 2 && !bad; q += 2) { const [k2, n2] = classify(Math.floor(vert ? x : x + q), Math.floor(vert ? z + q : z)); if (k2 === SOLID || (k2 === CHAM && isPit(n2, vert ? x : x + q, vert ? z + q : z))) bad = true; }
          if (bad) continue;
          zb.prop('lv8_track', x, 0, z, vert ? 0 : Math.PI / 2, {});
          // a cart now and then
          if (hr(Math.floor(x), Math.floor(z), 641) < 0.07) zb.prop('lv8_cart', x, 0, z, vert ? 0 : Math.PI / 2, { full: hr(Math.floor(z), Math.floor(x), 642) < 0.5 });
        }
      }
    }
  }
}

function chamber(zb, n) {
  const { cx, cz } = n;
  if (n.great) { great(zb, n); return; }
  // pits get a rim of lanterns and a half-fallen barrier; bridges get planks
  if (n.pit) {
    if (n.bridge) {
      const alongX = n.bridgeX;
      for (let q = -n.rp - 1.4; q < n.rp + 1.4; q += 0.42) {
        const gap = hr(Math.floor(q * 10), n.i * 9 + n.j, 651) < 0.1;
        if (gap) continue;
        const px = alongX ? cx + q : cx, pz = alongX ? cz : cz + q;
        if (!owns(zb, px, pz)) continue;
        const w = 0.18, lw = 0.7 + hr(Math.floor(q * 10), n.i, 652) * 0.1;
        if (alongX) zb.box(px - w, -0.1, cz - lw, px + w, 0.0, cz + lw, M.lv8_timber);
        else zb.box(cx - lw, -0.1, pz - w, cx + lw, 0.0, pz + w, M.lv8_timber);
      }
    }
    for (let k = 0; k < 3; k++) {
      const a = hr(n.i, n.j * 5 + k, 653) * TAU, px = cx + Math.cos(a) * (n.rp + 1.3), pz = cz + Math.sin(a) * (n.rp + 1.3);
      if (owns(zb, px, pz) && openCell(Math.floor(px), Math.floor(pz)) && !isPit(n, px, pz)) zb.prop('lv8_barrier', px, 0, pz, a + Math.PI / 2, {});
    }
  }
  const lx = cx + (hr(n.i, n.j, 661) - 0.5) * n.r * 0.6, lz = cz + (hr(n.j, n.i, 662) - 0.5) * n.r * 0.6;
  if (!isPit(n, lx, lz)) lantern(zb, lx, 2.5, lz, 663);
  // rubble heaps against the walls
  for (let k = 0; k < 3; k++) {
    const a = hr(n.i * 3 + k, n.j, 664) * TAU, rr = n.r * 0.7;
    const px = cx + Math.cos(a) * rr, pz = cz + Math.sin(a) * rr;
    if (owns(zb, px, pz) && openCell(Math.floor(px), Math.floor(pz)) && !(n.pit && isPit(n, px, pz))) zb.prop('lv8_rubble', px, 0, pz, a, { n: 4 + (k & 1) });
  }
  // drips
  if (hr(n.i, n.j, 665) < 0.5 && owns(zb, cx, cz)) { zb.emitter(cx + 1, 1.5, cz + 1, 'drip', { vol: 0.8, rad: 14 }); zb.decal(cx + 1, 0, cz + 1, 'up', 1.6, 1.4, 'lv8_puddle', { rot: hr(n.i, n.j, 666) * TAU }); }
  // a dead end: the door stands against the far wall
  if (n.rect && !(n.i === -1 && n.j === 0) && hr(n.i, n.j, 667) < 0.8) {
    const r = n.r;
    if (n.eE) placeDoor(zb, cx - r + 0.2, cz, Math.PI / 2, {});
    else if (n.eW) placeDoor(zb, cx + r - 0.2, cz, -Math.PI / 2, {});
    else if (n.eS) placeDoor(zb, cx, cz - r + 0.2, Math.PI, {});
    else placeDoor(zb, cx, cz + r - 0.2, 0, {});
  }
  if (n.rect) lantern(zb, cx, 2.5, cz, 668);
}

// the Great Pit: a column of cold light, a trestle across, rails running over the edge
function great(zb, n) {
  const { cx, cz } = n;
  // the trestle: a deck across the pit with rails and ties
  const x0 = cx - GREAT_PIT - 3, x1 = cx + GREAT_PIT + 3;
  cbox(zb, x0, -0.18, cz - 0.7, x1, 0, cz + 0.7, M.lv8_timber, { skip: 0 });
  for (let s = x0; s < x1; s += 4) {
    const mid = s + 2;
    if (owns(zb, mid, cz)) zb.prop('lv8_track', mid, 0, cz, Math.PI / 2, {});
  }
  for (const sz of [-0.82, 0.82]) for (let s = x0 + 2; s < x1; s += 6) cbox(zb, s - 0.06, 0, cz + sz - 0.06, s + 0.06, 1.0, cz + sz + 0.06, M.lv8_timber);
  cbox(zb, x0, 0.9, cz - 0.88, x1, 1.0, cz - 0.76, M.lv8_timber, { collide: false });
  cbox(zb, x0, 0.9, cz + 0.76, x1, 1.0, cz + 0.88, M.lv8_timber, { collide: false });
  // the column of light: stacked, widening, nearly transparent
  const h = GREAT_H;
  const layers = [[0.6, 0.20], [0.9, 0.14], [1.3, 0.11], [1.8, 0.08], [2.4, 0.06]];
  layers.forEach(([w, a], k) => {
    const y0 = h * (1 - (k + 1) / layers.length) - 4, y1 = h * (1 - k / layers.length);
    const half = 1.4 + w * 1.5;
    cbox(zb, cx - half, y0, cz - half, cx + half, y1, cz + half, M.lv8_shaft, { alpha: a, collide: false });
  });
  // the hole in the ceiling: a disc of daylight
  cbox(zb, cx - 2.6, h - 0.04, cz - 2.6, cx + 2.6, h, cz + 2.6, M.lv8_shaft, { collide: false });
  zb.light(cx, h - 3, cz, { color: [0.72, 0.84, 1.0], rad: 10, int: 1.1 });
  zb.light(cx + 4, 6, cz, { color: [0.72, 0.84, 1.0], rad: 9, int: 0.6 });
  zb.light(cx - 4, 6, cz, { color: [0.72, 0.84, 1.0], rad: 9, int: 0.6 });
  zb.light(cx, 1.5, cz + 7, { color: [0.7, 0.82, 1.0], rad: 9, int: 0.5 });
  zb.light(cx, 1.5, cz - 7, { color: [0.7, 0.82, 1.0], rad: 9, int: 0.5 });
  // the shaft wind
  if (owns(zb, cx, cz)) zb.emitter(cx, 6, cz, 'g02_shaftwind', { vol: 1, rad: 30 });
  // lanterns at both ends of the trestle
  lantern(zb, x0 + 0.3, 2.4, cz - 0.9, 671); lantern(zb, x1 - 0.3, 2.4, cz + 0.9, 672);
  // rubble round the rim
  for (let k = 0; k < 8; k++) {
    const a = hr(k, 1, 673) * TAU, rr = GREAT_PIT + 1.6 + hr(k, 2, 674) * 2;
    const px = cx + Math.cos(a) * rr, pz = cz + Math.sin(a) * rr;
    if (owns(zb, px, pz) && !isPit(n, px, pz) && Math.abs(pz - cz) > 1.4) zb.prop('lv8_rubble', px, 0, pz, a, { n: 5 });
  }
}

function niches(zb, n) {
  for (const vert of [false, true]) {
    if (vert ? !n.eS : !n.eE) continue;
    const nc = nicheOf(n.i, n.j, vert);
    if (!nc) continue;
    const x = vert ? n.cx + nc.side * 3.8 : n.cx + nc.t, z = vert ? n.cz + nc.t : n.cz + nc.side * 3.8;
    // the door stands against the back wall of the niche, facing the drift
    if (vert) placeDoor(zb, x - nc.side * 0.1, z, nc.side > 0 ? Math.PI / 2 + Math.PI : Math.PI / 2, {});
    else placeDoor(zb, x, z - nc.side * 0.1, nc.side > 0 ? 0 : Math.PI, {});
    if (owns(zb, x, z)) lantern(zb, vert ? x - nc.side * 1.5 : x + 1, 2.5, vert ? z + 1 : z - nc.side * 1.5, 681);
  }
}

function gen(zb) {
  const { x0, z0, x1, z1 } = zb;
  zb.noConnectivity = true;
  zb.flags.fill(0);
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      const i = zb.i(x, z);
      const [k, n] = classify(x, z);
      zb.fmat[i] = M.lv8_floor; zb.cmat[i] = M.lv8_rock; zb.wmat[i] = M.lv8_rock;
      zb.floor[i] = 0;
      if (k === SOLID) { zb.solid[i] = M.lv8_rock; zb.ceil[i] = 3; continue; }
      zb.ceil[i] = ceilAt(k, n, x, z);
      if (k === CHAM && isPit(n, x + 0.5, z + 0.5)) zb.floor[i] = NaN;
    }
  }
  const bi0 = fdiv(x0 - 12, BS), bi1 = fdiv(x1 + 12, BS), bj0 = fdiv(z0 - 12, BS), bj1 = fdiv(z1 + 12, BS);
  for (let j = bj0; j <= bj1; j++) for (let i = bi0; i <= bi1; i++) {
    const n = node(i, j);
    if (!n.alive) continue;
    if (zb.in(Math.floor(n.cx), Math.floor(n.cz))) chamber(zb, n);
    drifts(zb, n);
    niches(zb, n);
  }
}

defineZone('lv8_mine', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.1, 0.075, 0.055],
    env: env({ fog: [0.035, 0.028, 0.022], fogNear: 2, fogFar: 40, hum: 0, hvac: 0, reverb: 'tunnel', tone: 'g02_mine' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'FORGOTTEN MINESHAFT',
  zoneType: 'lv8_mine',
  zoneSize: 64,
  entry: { x: -17.8, y: 0, z: 16.0, yaw: Math.PI / 2 },
  doorDensity: 0,
  viewRadius: 3,
  weather: { kind: 'dust', amount: 0.5, color: [0.9, 0.86, 0.78, 0.4], fall: 0.03, wind: [0.05, 0.02], size: 0.011, indoor: true },
  grade: { sat: 0.92, tint: [1.04, 0.98, 0.92] },
  light: { phoneRadius: 4.2, phoneIntensity: 0.3 },
  script(ctx, dt) {
    quiet(ctx);
    ambientEvents(ctx, dt, [
      { snd: 'g02_cart_far', every: [35, 90], dist: [25, 50], vol: [0.5, 1], y: 1, first: 18 },
      { snd: 'g02_rockfall', every: [30, 80], dist: [14, 40], vol: [0.5, 1], y: 1 },
      { snd: 'g02_timber', every: [25, 70], dist: [8, 25], vol: [0.5, 1], y: 1.8, near: 12 },
      { snd: 'g02_shaft_moan', every: [60, 140], dist: [20, 45], vol: [0.4, 0.9], y: 3 },
      { snd: 'drip', every: [6, 16], dist: [4, 14], vol: [0.4, 0.9], y: 0.5, near: 20 },
    ]);
  },
});
