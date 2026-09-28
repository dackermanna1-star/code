// Dead Air 3 (The Construction Site) building blocks: site hoardings and
// safety signage, construction props (hard hats, block pallets, wheelbarrows,
// edge protection, scaffold stair tower, tower crane, material hoist), the
// shootable red gas canisters that rig the barricade (hooked into the bullet
// trace through the PropManager, so stray rounds, pipe bombs and molotov fire
// set them off too), substation gear (breakers, insulator gantries, a positional
// 60 Hz hum, arc flashes), power-station structures (stacks, cooling towers,
// pipe racks) and garage ramps.
import * as THREE from 'three';
import { P, sign } from './kit.js';
import { F_SOLID, F_SHOOT, F_SIGHT, F_DEFAULT, F_NONAV } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { materials } from '../render/materials.js';
import { makeRng } from '../core/math.js';
import { buildGroup, vmesh } from './ch3_props.js';
import { unfoggedMat } from './da_parts.js';

export const rng = makeRng(3131);
export const NC = { collide: false };
export const CLIP = F_SOLID | F_NONAV; // movement-only player clip (not a nav surface)
const BLOOD = [DF.BLOOD1, DF.BLOOD2, DF.BLOOD3, DF.BLOOD4, DF.POOL, DF.SMEAR, DF.SPLAT_BIG];
export const blood = (L, x, y, z, s = 1.2, k = 0) => L.decal(x, y + 0.012, z, 0, 1, 0, s, BLOOD[k % 7]);
export function rotXZ(x, z, ry, lx, lz) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + c * lx + s * lz, z - s * lx + c * lz];
}

// ------------------------------------------------------------------ signs --
// Construction / utility safety signs (printed metal plates).
const SIGN_STYLE = {
  danger: { bg: '#f2f0ea', fg: '#c01810', border: '#c01810' },
  warning: { bg: '#f0c020', fg: '#111111', border: '#111111' },
  mandatory: { bg: '#1a4a9a', fg: '#ffffff', border: '#ffffff' },
  notice: { bg: '#f2f0ea', fg: '#1a2a4a', border: '#1a2a4a' },
  safe: { bg: '#1a7a3a', fg: '#ffffff', border: '#ffffff' },
  dark: { bg: '#1a1a1a', fg: '#f0c020' },
};
export function safetySign(L, text, x, y, z, ry, w, h, kind = 'warning', o = {}) {
  return sign(L, text, x, y, z, ry, w, h, Object.assign({}, SIGN_STYLE[kind] || SIGN_STYLE.warning, o));
}

// Plywood site hoarding along X (axis 'x', at z = fixed) or Z. gaps: [[a,b]].
// Painted panels, timber posts on the inside (side = +1/-1 normal of the
// inside), a white stripe band and a tall movement clip so nobody hops it.
export function hoarding(L, axis, a0, a1, fixed, gaps = [], o = {}) {
  const h = o.h ?? 2.6, t = 0.12, tint = o.tint ?? 0x1d3a52, side = o.side ?? 1;
  const segs = [];
  let cur = a0;
  for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g0 > cur) segs.push([cur, g0]); cur = Math.max(cur, g1); }
  if (cur < a1) segs.push([cur, a1]);
  for (const [a, b] of segs) {
    if (axis === 'x') {
      L.box(a, 0, fixed - t / 2, b, h, fixed + t / 2, 'woodPale', { tint, surf: 'wood' });
      L.box(a, h - 0.35, fixed - t / 2 - 0.006, b, h - 0.22, fixed + t / 2 + 0.006, 'paintedWhite', { collide: false, tint: 0xd8d8d0 });
      L.box(a, h, fixed - 0.1, b, h + 0.06, fixed + 0.1, 'wood', { collide: false, tint: 0x8a7a60 });
      for (let x = a + 0.1; x < b; x += 2.44) L.box(x, 0, fixed + side * (t / 2), x + 0.09, h - 0.05, fixed + side * (t / 2 + 0.09), 'wood', { collide: false, tint: 0x9a8a6a });
      if (o.clip !== false) L.box(a, h, fixed - t / 2, b, 4.2, fixed + t / 2, 'concrete', { visible: false, flags: CLIP });
    } else {
      L.box(fixed - t / 2, 0, a, fixed + t / 2, h, b, 'woodPale', { tint, surf: 'wood' });
      L.box(fixed - t / 2 - 0.006, h - 0.35, a, fixed + t / 2 + 0.006, h - 0.22, b, 'paintedWhite', { collide: false, tint: 0xd8d8d0 });
      L.box(fixed - 0.1, h, a, fixed + 0.1, h + 0.06, b, 'wood', { collide: false, tint: 0x8a7a60 });
      for (let z = a + 0.1; z < b; z += 2.44) L.box(fixed + side * (t / 2), 0, z, fixed + side * (t / 2 + 0.09), h - 0.05, z + 0.09, 'wood', { collide: false, tint: 0x9a8a6a });
      if (o.clip !== false) L.box(fixed - t / 2, h, a, fixed + t / 2, 4.2, b, 'concrete', { visible: false, flags: CLIP });
    }
  }
}

// ------------------------------------------------------------ small props --
export function hardHat(L, x, y, z, ry = 0, color) {
  const c = color ?? rng.pick([0xe8c020, 0xf0f0e8, 0xe86a10, 0x2a6ac8]);
  const p = P.prop(L, x, y, z, ry);
  const tipped = rng() < 0.5;
  const rot = tipped ? [1.2, 0, 0.3] : [0, 0, 0];
  p.sph(0, tipped ? 0.12 : 0.03, 0, 0.14, 'plasticGloss', c, [1, 0.8, 1.15]);
  p.cyl(0, tipped ? 0.06 : 0.035, tipped ? -0.05 : 0.04, 0.17, 0.015, 'plasticGloss', c, rot, 14);
  return p;
}
export function blockPallet(L, x, y, z, ry = 0, rows = 4) {
  const p = P.pallet(L, x, y, z, ry, false);
  for (let r = 0; r < rows; r++) for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) {
    if (r === rows - 1 && rng() < 0.3) continue;
    const bx = -0.36 + i * 0.36, bz = -0.21 + k * 0.42, by = 0.13 + r * 0.2 + 0.1;
    p.box(bx, by, bz, 0.34, 0.19, 0.39, 'concrete', rng.pick([0x9a968e, 0x8e8a82, 0xa6a298]));
    p.box(bx, by + 0.096, bz, 0.22, 0.004, 0.14, 'blackMatte', 0x2a2a28);
  }
  p.col(0, (0.13 + rows * 0.2) / 2, 0, 1.15, 0.13 + rows * 0.2, 1.2, 'concrete');
  return p;
}
export function wheelbarrow(L, x, y, z, ry = 0, color = 0x2a5a8a) {
  const p = P.prop(L, x, y, z, ry);
  p.frustum(0, 0.52, 0, 0.42, 0.3, 0.3, 'paintedBlue', color, [0, 0, 0], 12);
  p.cylX(0, 0.24, -0.55, 0.2, 0.08, 'rubber', 0x151515, 12);
  for (const sx of [-0.25, 0.25]) { p.tube(sx, 0.4, -0.5, sx, 0.62, 0.75, 0.018, 'metalDark'); p.tube(sx, 0.4, 0.2, sx, 0.02, 0.35, 0.015, 'metalDark'); }
  p.col(0, 0.35, 0, 0.8, 0.7, 1.3, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function timberStack(L, x, y, z, ry = 0, n = 6, len = 3.6) {
  const p = P.prop(L, x, y, z, ry);
  for (const sz of [-len / 3, len / 3]) p.box(0, 0.05, sz, 1.1, 0.1, 0.1, 'wood', 0x7a6a50);
  for (let r = 0; r < n; r++) for (let i = 0; i < 5; i++) p.box(-0.44 + i * 0.22, 0.14 + r * 0.1, (rng() - 0.5) * 0.1, 0.18, 0.09, len, 'wood', rng.pick([0xc8a878, 0xb89868, 0xd0b080]));
  p.col(0, (0.1 + n * 0.1) / 2, 0, 1.1, 0.1 + n * 0.1, len, 'wood');
  return p;
}
export function cableDrum(L, x, y, z, ry = 0, r = 0.7, color = 0x1a1a1a) {
  const p = P.prop(L, x, y, z, ry);
  for (const sz of [-0.42, 0.42]) p.cylZ(0, r, sz, r, 0.06, 'wood', 0x9a7a50, 18);
  p.cylZ(0, r, 0, r * 0.72, 0.78, 'rubber', color, 18);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; p.box(Math.cos(a) * r * 0.5, r + Math.sin(a) * r * 0.5, 0.45, 0.06, 0.06, 0.02, 'metalDark'); }
  p.col(0, r, 0, r * 2, r * 2, 0.9, 'wood');
  return p;
}
export function sandPile(L, x, y, z, r = 1.6, h = 0.9, tint = 0x8a7a60) {
  const p = P.prop(L, x, y, z, rng() * 6);
  p.cone(0, h / 2, 0, r, h, 'dirt', tint, null, 14);
  p.cone(r * 0.4, h * 0.3, r * 0.2, r * 0.6, h * 0.6, 'dirt', tint, null, 10);
  p.col(0, h * 0.3, 0, r * 1.2, h * 0.6, r * 1.2, 'dirt');
  return p;
}
export function jerryCans(L, x, y, z, ry = 0) {
  const p = P.prop(L, x, y, z, ry);
  for (let i = 0; i < 3; i++) p.rbox(-0.3 + i * 0.3, 0.24, (rng() - 0.5) * 0.06, 0.18, 0.46, 0.34, 0.02, 'paintedGreen', 0x3a4a2a);
  p.col(0, 0.24, 0, 0.9, 0.48, 0.36, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function ammoCrate(L, x, y, z, ry = 0) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.16, 0, 0.8, 0.32, 0.36, 'paintedGreen', 0x3e4a2c).box(0, 0.33, 0, 0.82, 0.03, 0.38, 'paintedGreen', 0x34401f);
  p.box(0, 0.18, -0.185, 0.4, 0.08, 0.005, 'paintedYellow', 0xc8b040);
  p.col(0, 0.17, 0, 0.8, 0.34, 0.38, 'wood', F_SOLID | F_SHOOT);
  return p;
}

// Yellow edge protection (posts, top + mid rail, mesh panel) along a slab edge.
// Adds a movement-only clip unless o.clip === false.
export function edgeRail(L, axis, a0, a1, fixed, y, o = {}) {
  const h = o.h ?? 1.1;
  const p = axis === 'x' ? P.prop(L, (a0 + a1) / 2, y, fixed, 0) : P.prop(L, fixed, y, (a0 + a1) / 2, Math.PI / 2);
  const len = Math.abs(a1 - a0);
  const n = Math.max(1, Math.round(len / 2.4));
  for (let i = 0; i <= n; i++) p.box(-len / 2 + i * len / n, h / 2, 0, 0.05, h, 0.05, 'paintedYellow', 0xd8a820);
  p.cylX(0, h, 0, 0.022, len, 'paintedYellow', 0xd8a820, 6);
  p.cylX(0, h * 0.5, 0, 0.018, len, 'paintedYellow', 0xd8a820, 6);
  if (o.mesh !== false) p.box(0, h * 0.45, 0.03, len, h * 0.8, 0.004, 'chainLink', o.meshTint ?? 0xc8a020);
  p.box(0, 0.08, 0.02, len, 0.15, 0.02, 'wood', 0xc8b080); // toe board
  if (o.clip !== false) {
    if (axis === 'x') L.box(Math.min(a0, a1), y, fixed - 0.05, Math.max(a0, a1), y + 1.8, fixed + 0.05, 'concrete', { visible: false, flags: CLIP });
    else L.box(fixed - 0.05, y, Math.min(a0, a1), fixed + 0.05, y + 1.8, Math.max(a0, a1), 'concrete', { visible: false, flags: CLIP });
  }
  return p;
}

// Concrete column with protruding starter bars on top (unfinished floors).
export function column(L, x, z, y0, y1, o = {}) {
  const s = o.s ?? 0.25;
  L.box(x - s, y0, z - s, x + s, y1, z + s, 'concrete', { tint: o.tint ?? 0xa8a49a, collide: o.collide !== false });
  if (o.bars) {
    const p = P.prop(L, x, y1, z, 0);
    for (const sx of [-0.16, 0, 0.16]) for (const sz of [-0.16, 0.16]) p.tube(sx, 0, sz, sx + (rng() - 0.5) * 0.12, 0.9 + rng() * 0.4, sz + (rng() - 0.5) * 0.12, 0.012, 'rust', 0x6a4a36, 5);
  }
}
// Forest of steel post shores holding up fresh formwork (visual only).
export function shoring(L, x0, z0, x1, z1, y0, y1, step = 1.4) {
  for (let x = x0; x <= x1; x += step) for (let z = z0; z <= z1; z += step) {
    if (rng() < 0.18) continue;
    const jx = (rng() - 0.5) * 0.2, jz = (rng() - 0.5) * 0.2;
    L.box(x + jx - 0.03, y0, z + jz - 0.03, x + jx + 0.03, y1 - 0.12, z + jz + 0.03, 'metalClean', { collide: false, tint: rng() < 0.5 ? 0xd8a020 : 0x8a8e8e });
    L.box(x + jx - 0.08, y1 - 0.12, z + jz - 0.08, x + jx + 0.08, y1, z + jz + 0.08, 'wood', { collide: false, tint: 0xa88a58 });
  }
}

// ------------------------------------------------------- scaffold stair tower --
// Switchback stair between yLo and yHi against the east face of a slab (the
// tower occupies x0..x1, z0..z1; the top landing is at the north end, the
// stairs descend south then north). Visual tube frame + netting, walkable
// planks, rails with movement clips.
export function scaffoldStairTower(L, T, yLo, yHi) {
  const { x0, x1, z0, z1 } = T;
  const mid = (yLo + yHi) / 2;
  const xm = (x0 + x1) / 2;
  const zl = z0 + 1.6; // top landing north strip z0..zl
  const zb = z1 - 1.6; // mid landing south strip zb..z1
  const plank = 'wood', pt = 0xb09a78;
  // top landing (yHi) and mid landing (mid)
  L.box(x0, yHi - 0.1, z0, x1, yHi, zl, plank, { tint: pt, surf: 'wood' });
  L.box(x0, mid - 0.1, zb, x1, mid, z1, plank, { tint: pt, surf: 'wood' });
  // flight 1 (outer, east half): mid (south) -> yHi (north)
  L.stairs(xm, zl, x1, zb, mid, yHi, '-z', 'diamond', { thin: true, stepH: 0.2 });
  // flight 2 (inner, west half): yLo (north) -> mid (south)
  L.stairs(x0, zl, xm, zb, yLo, mid, '+z', 'diamond', { thin: true, stepH: 0.2 });
  // divider between flights; boarded-in space under the mid landing and the
  // flights (no dead pockets under the stairs)
  L.box(xm - 0.04, yLo, zl, xm + 0.04, yHi + 1.1, zb, 'concrete', { visible: false, flags: CLIP });
  L.box(xm + 0.04, yLo, zl, x1, mid - 0.45, zb, 'concrete', { visible: false });
  L.box(x0, yLo, zb, x1, mid - 0.1, z1, 'woodPale', { tint: 0x2a4a5e, surf: 'wood' });
  L.box(x0 - 0.06, yLo, zl + 0.6, x0, mid - 0.3, zb, 'woodPale', { tint: 0x2a4a5e, surf: 'wood' });
  // outer clips (east + south), and the open north side of the top landing
  L.box(x1, yLo, z0, x1 + 0.1, yHi + 1.8, z1, 'concrete', { visible: false, flags: CLIP });
  L.box(x0, mid, z1, x1 + 0.1, yHi + 1.8, z1 + 0.1, 'concrete', { visible: false, flags: CLIP });
  L.box(x0, yHi, z0 - 0.1, x1 + 0.1, yHi + 1.8, z0, 'concrete', { visible: false, flags: CLIP });
  // tube frame (standards, ledgers, braces), toe boards, netting
  const p = P.prop(L, 0, 0, 0, 0);
  const H = yHi + 2.2 - yLo;
  for (const x of [x0 + 0.05, xm, x1 - 0.05]) for (const z of [z0 + 0.05, zl, zb, z1 - 0.05]) p.cyl(x, yLo + H / 2, z, 0.024, H, 'metalClean', 0x9a9e9e, null, 6);
  for (const y of [yLo + 0.15, mid, mid + 1.0, yHi, yHi + 1.0, yHi + 2.0]) {
    p.cylZ(x1 - 0.05, y, (z0 + z1) / 2, 0.022, z1 - z0, 'metalClean', 0x9a9e9e, 6);
    p.cylX(xm, y, z1 - 0.05, 0.022, x1 - x0, 'metalClean', 0x9a9e9e, 6);
  }
  for (const y of [mid + 0.5, yHi + 0.5]) p.cylZ(x1 - 0.05, y, (z0 + z1) / 2, 0.02, z1 - z0, 'metalClean', 0x9a9e9e, 6);
  p.tube(x1 - 0.05, yLo, z0 + 0.1, x1 - 0.05, yHi, z1 - 0.1, 0.02, 'metalClean', 0x8a8e8e, 6);
  p.tube(xm, yLo, z1 - 0.1, xm, yHi, z0 + 0.1, 0.02, 'metalClean', 0x8a8e8e, 6);
  // stair hand rails
  p.tube(x1 - 0.1, mid + 0.95, zb, x1 - 0.1, yHi + 0.95, zl, 0.022, 'paintedYellow', 0xd8a820, 6);
  p.tube(xm - 0.08, yLo + 0.95, zl, xm - 0.08, mid + 0.95, zb, 0.022, 'paintedYellow', 0xd8a820, 6);
  p.box(x1 - 0.03, mid + 0.7, (z0 + z1) / 2, 0.004, yHi + 1.2 - mid, z1 - z0, 'chainLink', 0x3a6a3a);
  p.box((x0 + x1) / 2, mid + 0.7, z1 - 0.03, x1 - x0, yHi + 1.2 - mid, 0.004, 'chainLink', 0x3a6a3a);
  for (const [zz, yy] of [[z0 + 0.04, yHi], [z1 - 0.04, mid]]) p.box((x0 + x1) / 2, yy + 0.08, zz, x1 - x0, 0.15, 0.02, 'wood', 0xc8b090);
  return { zl, zb, mid };
}

// ------------------------------------------------------------ tower crane --
// Tower crane (visual; base collides). Jib points along +X. Returns the world
// positions for obstruction lights.
export function towerCrane(L, x, z, o = {}) {
  const H = o.h ?? 46, jib = o.jib ?? 44, cj = o.counter ?? 14, y0 = o.y ?? 0;
  const yel = 0xd8a820;
  // foundation + base collision
  L.box(x - 3, y0 - 0.2, z - 3, x + 3, y0 + 1.1, z + 3, 'concrete', { tint: 0x9a968e });
  L.box(x - 1.05, y0 + 1.1, z - 1.05, x + 1.05, y0 + 4, z + 1.05, 'concrete', { visible: false });
  const p = P.prop(L, x, y0, z, 0);
  const m = 0.95; // mast half width
  for (const sx of [-m, m]) for (const sz of [-m, m]) p.box(sx, 1.1 + (H - 1.1) / 2, sz, 0.14, H - 1.1, 0.14, 'paintedYellow', yel);
  for (let y = 1.1; y < H - 1; y += 2.2) {
    for (const s of [-m, m]) { p.box(0, y, s, m * 2, 0.08, 0.08, 'paintedYellow', yel); p.box(s, y, 0, 0.08, 0.08, m * 2, 'paintedYellow', yel); }
    const d = Math.hypot(m * 2, 2.2);
    const a = Math.atan2(2.2, m * 2);
    for (const s of [-m, m]) {
      p.box(0, y + 1.1, s, d, 0.06, 0.06, 'paintedYellow', yel, [0, 0, (y / 2.2) % 2 < 1 ? a : -a]);
      p.box(s, y + 1.1, 0, 0.06, 0.06, d, 'paintedYellow', yel, [(y / 2.2) % 2 < 1 ? a : -a, 0, 0]);
    }
  }
  // slewing unit, cab, apex, jib, counter-jib
  p.box(0, H + 0.4, 0, 2.6, 0.8, 2.6, 'paintedYellow', yel);
  p.rbox(-1.8, H + 1.4, 1.3, 1.6, 1.8, 1.6, 0.1, 'paintedWhite', 0xd8d8d0);
  p.box(-1.8, H + 1.6, 0.49, 1.4, 1.0, 0.02, 'glassDirty', 0x2a3a40);
  for (const sx of [-0.7, 0.7]) p.box(sx, H + 4.5, 0, 0.14, 7.6, 0.14, 'paintedYellow', yel, [0, 0, sx > 0 ? -0.08 : 0.08]);
  const jy = H + 1.2;
  for (const sz of [-0.8, 0.8]) p.box(jib / 2, jy, sz, jib, 0.12, 0.12, 'paintedYellow', yel);
  p.box(jib / 2, jy + 1.6, 0, jib, 0.12, 0.12, 'paintedYellow', yel);
  for (let k = 0; k < jib - 1; k += 2) {
    p.tube(k, jy, -0.8, k + 1, jy + 1.6, 0, 0.04, 'paintedYellow', yel, 4);
    p.tube(k + 1, jy + 1.6, 0, k + 2, jy, 0.8, 0.04, 'paintedYellow', yel, 4);
    p.box(k + 1, jy, 0, 0.06, 0.06, 1.6, 'paintedYellow', yel);
  }
  for (const sz of [-0.9, 0.9]) p.box(-cj / 2, jy, sz, cj, 0.2, 0.14, 'paintedYellow', yel);
  for (let i = 0; i < 4; i++) p.box(-cj + 1.2 + i * 1.3, jy - 1.0, 0, 1.2, 1.9, 1.7, 'concrete', 0x8a8680);
  p.tube(0, H + 8.3, 0, jib * 0.62, jy + 1.6, 0, 0.03, 'metalDark', null, 4);
  p.tube(0, H + 8.3, 0, -cj + 0.5, jy + 0.1, 0, 0.03, 'metalDark', null, 4);
  // trolley + hook with a hanging bundle of steel
  const tx = o.trolley ?? jib * 0.7;
  p.box(tx, jy - 0.3, 0, 1.2, 0.5, 1.4, 'paintedYellow', 0xb88a18);
  const hy = o.hookY ?? 20;
  for (const sz of [-0.2, 0.2]) p.tube(tx, jy - 0.5, sz, tx, hy + 1.2, sz, 0.015, 'metalDark', null, 4);
  p.box(tx, hy + 0.9, 0, 0.5, 0.6, 0.35, 'paintedRed', 0xb02018);
  for (const sz of [-0.5, 0.5]) p.tube(tx, hy + 0.6, 0, tx + sz * 1.5, hy - 0.4, 0, 0.012, 'metalDark', null, 4);
  for (let i = 0; i < 5; i++) p.box(tx, hy - 0.5 + i * 0.05, (i - 2) * 0.12, 5, 0.1, 0.1, 'rust', 0x6a4a36);
  sign(L, 'NCC CRANE HIRE', x + 0.2, H + 0.4, z - 1.32, 0, 2.2, 0.5, { bg: '#1a1a1a', fg: '#e8c020' });
  return { top: [x, H + 8.6, z], tip: [x + jib, jy + 1.8, z], counter: [x - cj, jy + 1.0, z], cab: [x - 1.8, H + 1.6, z + 0.2] };
}

// Material hoist: mast tied to the building, cage at the bottom (visual).
export function materialHoist(L, x, z, top, o = {}) {
  const p = P.prop(L, x, 0, z, 0);
  for (const sx of [-0.4, 0.4]) for (const sz of [-0.4, 0.4]) p.box(sx, top / 2, sz, 0.08, top, 0.08, 'metalClean', 0x9a9e9e);
  for (let y = 1.5; y < top; y += 1.5) p.box(0, y, 0, 0.9, 0.05, 0.9, 'metalClean', 0x9a9e9e);
  const cy = o.cageY ?? 0.2;
  p.box(0, cy + 1.2, -1.5, 2.2, 2.4, 1.8, 'chainLink', 0xc8a020);
  p.box(0, cy + 0.05, -1.5, 2.2, 0.1, 1.8, 'diamond');
  p.box(0, cy + 2.45, -1.5, 2.2, 0.08, 1.8, 'metalDark');
  p.box(0, 0.6, 0, 2.6, 1.2, 1.6, 'metal', 0x6a7a6a);
  p.col(0, 1.25, -0.8, 2.6, 2.5, 3.4, 'metal');
  return p;
}

// --------------------------------------------------------- gas canisters --
// A red welding-gas canister strapped to the barricade. Two hit spheres feed
// bullets (PropManager.traceProps), explosions (explosionImpulse) and fires
// into it; the first hit punctures it (a roaring flame jet) and a moment later
// it detonates (combat.explode) — which chains into its neighbours.
class HitSphere {
  constructor(owner, x, y, z, r) {
    this.owner = owner;
    this.pos = new THREE.Vector3(x, y, z);
    this.q = new THREE.Quaternion();
    this.r = r;
    this.mass = 99;
    this.sleep = true;
    this.dead = false;
    this.explosive = 'canister';
    this.upright = true;
    this.bottom = r;
    this.surf = 'metal';
    this.obj = new THREE.Object3D();
  }
  onShot(x, y, z, dir, shooter) { this.owner.hit(x, y, z, dir, shooter); }
  impulse() {}
  detonate(by) { this.owner.detonate(by); }
  update() {}
}
export class GasCanister {
  constructor(L, x, y, z, ry = 0, o = {}) {
    this.L = L; this.game = L.game;
    this.x = x; this.y = y; this.z = z;
    this.pos = new THREE.Vector3(x, y + 0.7, z);
    this.dead = false; this.fuse = -1; this.hits = 0;
    this.onDetonate = o.onDetonate || null;
    this.survivorDamage = o.survivorDamage ?? 30;
    this.group = buildGroup(L, (T) => {
      const p = P.prop(T, x, y, z, ry);
      p.cyl(0, 0.62, 0, 0.19, 1.14, 'paintedRed', 0xc01a12, null, 16);
      p.sph(0, 1.19, 0, 0.19, 'paintedRed', 0xc01a12, [1, 0.55, 1], 12);
      p.cyl(0, 1.3, 0, 0.07, 0.1, 'metalClean', 0xb0a060, null, 8).cyl(0, 1.37, 0, 0.1, 0.03, 'metalDark', null, null, 8);
      p.box(0.07, 1.36, 0, 0.12, 0.03, 0.03, 'metalClean', 0xb0a060);
      p.torus(0, 1.08, 0, 0.19, 0.022, 'paintedYellow', 0xe0b020, [Math.PI / 2, 0, 0], 4, 16);
      p.torus(0, 0.06, 0, 0.19, 0.03, 'metalDark', null, [Math.PI / 2, 0, 0], 4, 16);
      p.box(0, 0.8, -0.19, 0.2, 0.26, 0.012, 'paintedWhite', 0xeeeae0);
      p.box(0, 0.86, -0.197, 0.14, 0.05, 0.004, 'paintedRed', 0xc01a12);
      p.box(0, 0.77, -0.197, 0.16, 0.02, 0.004, 'blackMatte');
      p.box(0, 0.73, -0.197, 0.12, 0.02, 0.004, 'blackMatte');
      for (const sy of [0.35, 0.95]) p.torus(0, sy, 0, 0.205, 0.012, 'rubber', 0x1a1a1a, [Math.PI / 2, 0, 0], 4, 16); // straps
      for (const sy of [0.35, 0.95]) p.box(0, sy, 0.25, 0.05, 0.025, 0.12, 'rubber', 0x1a1a1a);
    });
    L.addObject(this.group);
    const g = this.game;
    this.spheres = [new HitSphere(this, x, y + 0.36, z, 0.25), new HitSphere(this, x, y + 0.95, z, 0.25)];
    for (const s of this.spheres) g.props.add(s);
    this.jet = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };
    this.light = L.light(x, y + 1.0, z, 0xff8a30, 0, 8, { on: false, dynamic: true, priority: 1 });
    L.dynamics.push(this);
  }
  hit(x, y, z, dir, shooter) {
    if (this.dead || this.game.net?.client) return;
    this.hits++;
    this.lastAttacker = shooter;
    this.game.fx.sparks(x, y, z, -dir.x, -dir.y, -dir.z, 10, [1, 0.8, 0.4], 4);
    if (this.fuse < 0) {
      this.fuse = 0.85;
      const l = Math.hypot(dir.x, dir.z) || 1;
      Object.assign(this.jet, { x, y, z, dx: -dir.x / l, dz: -dir.z / l });
      this.hiss = this.game.audio.loop('oxygenHiss', { pos: this.pos, vol: 1 });
      this.game.audio.play('impactMetal', { pos: this.pos, vol: 1 });
      this.game.audio.play('gasCanIgnite', { pos: this.pos, vol: 0.8 });
    } else if (this.hits >= 3) this.detonate(shooter);
  }
  cookOff(by) {
    if (this.dead || this.fuse >= 0) return;
    this.fuse = 1.6;
    this.lastAttacker = by;
    Object.assign(this.jet, { x: this.x, y: this.y + 1.3, z: this.z, dx: 0, dz: 0 });
    this.hiss = this.game.audio.loop('oxygenHiss', { pos: this.pos, vol: 1 });
  }
  detonate(by) {
    if (this.dead) return;
    const g = this.game;
    if (g.net?.client) return;
    this.dead = true;
    for (const s of this.spheres) s.dead = true;
    this.group.visible = false;
    this.hiss?.stop(0.1);
    this.light.on = false;
    const who = by || this.lastAttacker || null;
    g.combat.explode(this.x, this.y + 0.6, this.z, 6.5, 1500, who, { survivorDamage: this.survivorDamage, scale: 1.3 });
    g.audio.play('propaneExplode', { pos: this.pos, vol: 1.3 });
    this.onDetonate?.(this, who);
  }
  update(dt) {
    // visual state follows the (network-synced) hit spheres on co-op clients
    if (!this.dead && this.spheres[0].dead) { this.dead = true; this.group.visible = false; this.light.on = false; this.hiss?.stop(0.1); this.onDetonate?.(this, null); }
    if (this.dead) return;
    const g = this.game;
    // molotov / gas can fires cook it off
    if (this.fuse < 0 && !g.net?.client) {
      for (const f of g.combat.fires) if (Math.hypot(f.x - this.x, f.z - this.z) < f.r + 0.6 && Math.abs(f.y - this.y) < 2) { this.cookOff(f.owner); break; }
    }
    if (this.fuse < 0) return;
    this.fuse -= dt;
    const j = this.jet;
    for (let i = 0; i < 2; i++) g.fx.fire(j.x + j.dx * (0.2 + Math.random() * 0.6), j.y + Math.random() * 0.2, j.z + j.dz * (0.2 + Math.random() * 0.6), 0.5 + Math.random() * 0.4);
    if (Math.random() < 0.4) g.fx.sparks(j.x, j.y, j.z, j.dx, 0.4, j.dz, 4, [1, 0.7, 0.3], 5);
    this.light.on = true;
    this.light.intensity = 14 + Math.random() * 10;
    if (this.fuse <= 0 && !g.net?.client) this.detonate(this.lastAttacker);
  }
}

// ------------------------------------------------------------- substation --
// Positional 60 Hz transformer hum (procedural, on the sfx bus). The nodes
// are created lazily near the camera and a watchdog tears them down when the
// level stops updating (chapter change / menu), so nothing leaks.
export function transformerHum(L, game, points, o = {}) {
  const st = { nodes: null, last: 0, iv: null, pos: new THREE.Vector3() };
  const stop = () => {
    const n = st.nodes;
    st.nodes = null;
    if (st.iv) { clearInterval(st.iv); st.iv = null; }
    if (!n) return;
    try {
      const t = n.ctx.currentTime;
      n.g.gain.setTargetAtTime(0, t, 0.2);
      setTimeout(() => { try { for (const s of n.srcs) s.stop(); n.g.disconnect(); } catch (e) { /* ignore */ } }, 900);
    } catch (e) { /* ignore */ }
  };
  const start = () => {
    try {
      const a = game.audio, ctx = a && a.ctx, bus = a && (a.sfxBus || a.buses?.sfx);
      if (!ctx || !bus || typeof ctx.createPanner !== 'function') return;
      const g = ctx.createGain(); g.gain.value = 0;
      const pan = ctx.createPanner();
      pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = o.ref ?? 5; pan.maxDistance = 200; pan.rolloffFactor = o.rolloff ?? 1.3;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const srcs = [];
      for (const [f, v, type] of [[60, 0.5, 'sine'], [120, 0.7, 'sawtooth'], [180, 0.25, 'square'], [240, 0.18, 'sine']]) {
        const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = f + (Math.random() - 0.5) * 0.4;
        const og = ctx.createGain(); og.gain.value = v * 0.08;
        osc.connect(og); og.connect(lp); osc.start(); srcs.push(osc);
      }
      const trem = ctx.createOscillator(); trem.frequency.value = 0.35; const tg = ctx.createGain(); tg.gain.value = 0.25;
      const vca = ctx.createGain(); vca.gain.value = 0.75; trem.connect(tg); tg.connect(vca.gain); trem.start(); srcs.push(trem);
      lp.connect(vca); vca.connect(g); g.connect(pan); pan.connect(bus);
      st.nodes = { ctx, g, pan, srcs };
      st.iv = setInterval(() => { if (performance.now() - st.last > 1500) stop(); }, 700);
    } catch (e) { st.nodes = null; }
  };
  const api = {
    update() {
      const cp = game.camPos;
      if (!cp) return;
      // loudest point = nearest transformer
      let best = null, bd = 1e9;
      for (const p of points) { const d = Math.hypot(p[0] - cp.x, p[1] - cp.y, p[2] - cp.z); if (d < bd) { bd = d; best = p; } }
      st.last = performance.now();
      if (bd > 70) { if (st.nodes) stop(); return; }
      if (!st.nodes) start();
      const n = st.nodes;
      if (!n) return;
      const t = n.ctx.currentTime;
      if (n.pan.positionX) { n.pan.positionX.setTargetAtTime(best[0], t, 0.1); n.pan.positionY.setTargetAtTime(best[1], t, 0.1); n.pan.positionZ.setTargetAtTime(best[2], t, 0.1); } else n.pan.setPosition(best[0], best[1], best[2]);
      n.g.gain.setTargetAtTime((o.vol ?? 1.0) * (api.surge > 0 ? 2.2 : 1), t, 0.15);
      if (api.surge > 0) api.surge -= 1 / 60;
    },
    surge: 0,
    stop,
  };
  L.dynamics.push(api);
  return api;
}

// Periodic arc flash between two points: a violent blue-white light burst,
// sparks raining down, a crackling snap. Optional electric hazard volume.
export function arcFlasher(L, game, a, b, o = {}) {
  const light = L.light((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 0xb8d0ff, 0, o.range ?? 16, { on: false, dynamic: true, priority: 1 });
  let t = o.first ?? (1 + Math.random() * 3), burst = 0, k = 0;
  const pos = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  // the arc itself: a jagged glowing line (additive), rebuilt each flash
  const N = 9;
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(2.2, 2.6, 3.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.visible = false;
  L.addObject(line);
  const zap = () => {
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), j = i === 0 || i === N - 1 ? 0 : 0.35;
      arr[i * 3] = a[0] + (b[0] - a[0]) * u + (Math.random() - 0.5) * j;
      arr[i * 3 + 1] = a[1] + (b[1] - a[1]) * u + (Math.random() - 0.5) * j;
      arr[i * 3 + 2] = a[2] + (b[2] - a[2]) * u + (Math.random() - 0.5) * j;
    }
    geo.attributes.position.needsUpdate = true;
  };
  const api = {
    enabled: true,
    update(dt) {
      const cp = game.camPos;
      if (k > 0) {
        k -= dt;
        if (Math.random() < 0.6) zap();
        light.intensity = (o.intensity ?? 34) * (0.5 + Math.random() * 0.5);
        if (k <= 0) { light.on = false; line.visible = false; }
      }
      t -= dt;
      if (t > 0 || !api.enabled) return;
      if (!cp || Math.hypot(cp.x - pos.x, cp.z - pos.z) > 90) { t = 1; return; }
      if (burst > 0) { burst--; t = 0.08 + Math.random() * 0.15; } else { burst = Math.floor(Math.random() * 3); t = (o.min ?? 3) + Math.random() * (o.max ?? 6); }
      k = 0.07 + Math.random() * 0.12;
      light.on = true; line.visible = true; zap();
      game.fx.sparks(pos.x, pos.y, pos.z, 0, -0.3, 0, 12 + Math.floor(Math.random() * 14), [0.75, 0.88, 1], 6);
      if (Math.random() < 0.6) game.fx.sparks(b[0], b[1], b[2], 0, 1, 0, 8, [1, 0.85, 0.5], 4);
      game.audio.play(Math.random() < 0.5 ? 'radioStatic' : 'impactMetal', { pos, vol: o.vol ?? 0.7, rate: 1.4 + Math.random() * 0.6 });
      o.onZap?.();
    },
  };
  L.dynamics.push(api);
  if (o.hazard) L.hazard(...o.hazard, 'electric', o.dps ?? 20);
  return api;
}
// Porcelain insulator stack (brown discs) standing at local (lx, ly, lz).
function insulator(p, lx, ly, lz, n = 5, down = false) {
  for (let i = 0; i < n; i++) p.cyl(lx, ly + (down ? -i : i) * 0.1, lz, 0.1 - (i % 2) * 0.03, 0.05, 'plasticGloss', 0x7a4a2a, null, 10);
}
// Outdoor circuit breaker / current transformer on a steel stand.
export function breaker(L, x, y, z, ry = 0) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 1.1, 0, 0.3, 2.2, 0.3, 'metalClean', 0x9a9e9e);
  p.cyl(0, 2.6, 0, 0.32, 0.9, 'metal', 0x8a9088, null, 12);
  insulator(p, 0, 3.1, 0, 7);
  p.cyl(0, 3.85, 0, 0.12, 0.2, 'metalClean', 0xb0b0a0, null, 8);
  p.box(0.35, 1.3, 0, 0.3, 0.5, 0.3, 'metal', 0x8a9088);
  p.col(0, 1.5, 0, 0.8, 3.0, 0.8, 'metal');
  return p;
}
// Lattice gantry spanning along Z between two towers (x, z0..z1), height h, with
// insulator strings and conductors. Towers collide at their feet.
export function gantry(L, x, z0, z1, h = 9, o = {}) {
  const p = P.prop(L, x, 0, (z0 + z1) / 2, 0);
  const half = (z1 - z0) / 2;
  const gm = 'metalClean', gt = 0x8a9090;
  for (const sz of [-half, half]) {
    for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) p.box(dx, h / 2, sz + dz, 0.1, h, 0.1, gm, gt);
    for (let y = 1.2; y < h; y += 1.5) { p.box(0, y, sz - 0.5, 1.0, 0.06, 0.06, gm, gt); p.box(0, y, sz + 0.5, 1.0, 0.06, 0.06, gm, gt); p.box(-0.5, y, sz, 0.06, 0.06, 1.0, gm, gt); p.box(0.5, y, sz, 0.06, 0.06, 1.0, gm, gt); }
    for (let y = 0.4; y < h - 1; y += 1.5) p.tube(-0.5, y, sz - 0.5, -0.5, y + 1.5, sz + 0.5, 0.03, gm, gt, 4);
    p.box(0, 0.15, sz, 1.4, 0.3, 1.4, 'concrete');
  }
  // top beam (lattice box)
  for (const dy of [0, 0.8]) for (const dx of [-0.4, 0.4]) p.box(dx, h + dy, 0, 0.08, 0.08, z1 - z0 + 1, gm, gt);
  for (let k = -half; k < half; k += 1.2) p.tube(-0.4, h, k, 0.4, h + 0.8, k + 0.6, 0.025, gm, gt, 4);
  // insulator strings + conductors hanging along X
  const ph = o.phases ?? 3;
  for (let i = 0; i < ph; i++) {
    const zz = -half + (i + 1) * (z1 - z0) / (ph + 1);
    insulator(p, 0, h - 0.1, zz, 8, true);
    p.cyl(0, h - 1.0, zz, 0.06, 0.12, 'metalClean', 0xb0b0a0, null, 8);
    if (o.conductor !== false) p.cylX(0, h - 1.05, zz, 0.025, o.span ?? 10, 'metalDark', 0x3a3a3a, 6);
  }
  p.col(0, h / 2, -half, 1.1, h, 1.1, 'metal');
  p.col(0, h / 2, half, 1.1, h, 1.1, 'metal');
  return p;
}

// ------------------------------------------------------- power station --
// Cooling tower silhouette (hyperboloid, unfogged, gradient lit from below).
export function coolingTower(L, x, z, r = 26, h = 78, y0 = -1) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const w = r * (0.62 + 0.38 * Math.pow(Math.abs(u - 0.72) / 0.72, 1.6) * (u < 0.72 ? 1 : 0.55));
    pts.push(new THREE.Vector2(w, y0 + u * h));
  }
  const geo = new THREE.LatheGeometry(pts, 40);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const lo = new THREE.Color(0x3a2620), hi = new THREE.Color(0x15151a), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getY(i) - y0) / h;
    c.copy(lo).lerp(hi, Math.min(1, u * 1.3));
    const stripe = Math.sin(Math.atan2(pos.getZ(i), pos.getX(i)) * 20) * 0.015;
    col[i * 3] = c.r + stripe; col[i * 3 + 1] = c.g + stripe; col[i * 3 + 2] = c.b + stripe;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, materials.get(unfoggedMat()));
  m.material.side = THREE.DoubleSide;
  m.position.set(x, 0, z);
  m.userData.noCull = true;
  m.frustumCulled = false;
  m.renderOrder = 1;
  L.addObject(m);
  // lit rim at the top (fire glow on the steam)
  return m;
}
// Tall brick/concrete smoke stack with red/white bands (lit, fogged) + returns the top.
export function smokeStack(L, x, z, r = 3.2, h = 88, o = {}) {
  const geo = new THREE.CylinderGeometry(r * 0.72, r, h, 20, 1, true);
  const m = vmesh(geo, 'concreteDark', o.tint ?? 0x8a8680);
  m.position.set(x, h / 2 - 0.5, z);
  m.castShadow = false;
  m.userData.noCull = true;
  L.addObject(m);
  for (const [k, c] of [[0.9, 0xb02018], [0.94, 0xe8e4d8], [0.97, 0xb02018]]) {
    const band = vmesh(new THREE.CylinderGeometry(r * (0.72 + 0.28 * (1 - k)) + 0.05, r * (0.72 + 0.28 * (1 - k + 0.03)) + 0.05, h * 0.03, 20, 1, true), 'paintedRed', c);
    band.position.set(x, h * k, z);
    band.castShadow = false;
    band.userData.noCull = true;
    L.addObject(band);
  }
  return [x, h, z];
}
// Pipe rack frame across Z at x (columns at z0/z1, beam at height y) carrying pipes along Z.
export function pipeRack(L, x, z0, z1, y = 6, o = {}) {
  const p = P.prop(L, x, 0, (z0 + z1) / 2, 0);
  const half = (z1 - z0) / 2;
  for (const sz of [-half, half]) { p.box(0, y / 2, sz, 0.35, y, 0.35, 'metalDark', 0x4a4a4e); p.box(0, 0.1, sz, 0.8, 0.2, 0.8, 'concrete'); }
  p.box(0, y, 0, 0.4, 0.4, z1 - z0 + 0.4, 'metalDark', 0x4a4a4e);
  p.box(0, y - 1.6, 0, 0.3, 0.3, z1 - z0 + 0.3, 'metalDark', 0x4a4a4e);
  p.col(0, y / 2, -half, 0.4, y, 0.4, 'metal');
  p.col(0, y / 2, half, 0.4, y, 0.4, 'metal');
  return p;
}
// Big pipe run between two points (visual) with flanges every few metres.
export function bigPipe(L, a, b, r = 0.5, mat = 'metal', tint = 0x8a8e88, o = {}) {
  P.pipe(L, a[0], a[1], a[2], b[0], b[1], b[2], r, mat, tint);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.floor(len / (o.flange ?? 4));
  const p = P.prop(L, 0, 0, 0, 0);
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const cx = a[0] + (b[0] - a[0]) * u, cy = a[1] + (b[1] - a[1]) * u, cz = a[2] + (b[2] - a[2]) * u;
    const dx = b[0] - a[0], dz = b[2] - a[2];
    if (Math.abs(dx) > Math.abs(dz)) p.cylX(cx, cy, cz, r + 0.06, 0.12, 'metalDark', 0x5a5a58, 16);
    else if (Math.abs(dz) > 0.01) p.cylZ(cx, cy, cz, r + 0.06, 0.12, 'metalDark', 0x5a5a58, 16);
    else p.cyl(cx, cy, cz, r + 0.06, 0.12, 'metalDark', 0x5a5a58, null, 16);
  }
}

// ----------------------------------------------------------------- ramps --
// Sloped slab: smooth visual + invisible 0.1 m steps for collision / nav.
// Rises along +x or +z from (a0, y0) to (a1, y1).
export function ramp(L, axis, a0, a1, b0, b1, y0, y1, o = {}) {
  const len = a1 - a0, rise = y1 - y0, th = o.thick ?? 0.3;
  const ang = Math.atan2(rise, len), sl = Math.hypot(len, rise);
  const geo = new THREE.BoxGeometry(axis === 'x' ? sl : b1 - b0, th, axis === 'x' ? b1 - b0 : sl);
  const mid = [(a0 + a1) / 2, (y0 + y1) / 2 - th / 2 / Math.cos(ang), (b0 + b1) / 2];
  const m = new THREE.Matrix4().compose(
    axis === 'x' ? new THREE.Vector3(mid[0], mid[1], mid[2]) : new THREE.Vector3(mid[2], mid[1], mid[0]),
    new THREE.Quaternion().setFromEuler(axis === 'x' ? new THREE.Euler(0, 0, ang) : new THREE.Euler(-ang, 0, 0)),
    new THREE.Vector3(1, 1, 1));
  L.mesh(geo, o.mat ?? 'concreteFloor', m, { tint: o.tint, worldUV: materials.scaleOf(o.mat ?? 'concreteFloor') });
  if (axis === 'x') L.stairs(a0, b0, a1, b1, y0, y1, '+x', 'concrete', { visible: false, stepH: 0.1, thin: true });
  else L.stairs(b0, a0, b1, a1, y0, y1, '+z', 'concrete', { visible: false, stepH: 0.1, thin: true });
}

// ------------------------------------------------------ flying wreckage --
// Visual debris chunks that fly out of a blast, bounce once or twice and stay.
export function flyingDebris(L, game, x, y, z, list) {
  const pieces = [];
  for (const d of list) {
    const grp = buildGroup(L, (T) => d.build(T));
    grp.position.set(x + (d.ox ?? 0), y + (d.oy ?? 0), z + (d.oz ?? 0));
    grp.visible = false;
    L.addObject(grp);
    pieces.push({ grp, v: new THREE.Vector3(...d.v), spin: new THREE.Vector3(...(d.spin || [3, 2, 1])), on: false, rest: false, bounces: 0 });
  }
  const api = {
    launch() { for (const p of pieces) { p.on = true; p.grp.visible = true; } },
    update(dt) {
      for (const p of pieces) {
        if (!p.on || p.rest) continue;
        p.v.y -= 16 * dt;
        p.grp.position.addScaledVector(p.v, dt);
        p.grp.rotation.x += p.spin.x * dt; p.grp.rotation.y += p.spin.y * dt; p.grp.rotation.z += p.spin.z * dt;
        const gp = p.grp.position;
        const gy = L.col.groundHeight(gp.x, gp.y + 0.5, gp.z, 30, 0.2);
        if (gy > -1e8 && gp.y <= gy + 0.15 && p.v.y < 0) {
          gp.y = gy + 0.15;
          p.bounces++;
          p.v.multiplyScalar(0.35); p.v.y = Math.abs(p.v.y) * 0.8; p.spin.multiplyScalar(0.4);
          game.audio.play('metalImpact', { pos: gp, vol: 0.7 });
          game.fx.dust(gp.x, gp.y, gp.z, 0, 1, 0, [0.35, 0.32, 0.3], 4, 0.5);
          if (p.bounces >= 2 || p.v.length() < 1.2) {
            p.rest = true;
            p.grp.rotation.x = Math.round(p.grp.rotation.x / (Math.PI / 2)) * (Math.PI / 2) + (Math.random() - 0.5) * 0.3;
            p.grp.rotation.z = Math.round(p.grp.rotation.z / (Math.PI / 2)) * (Math.PI / 2) + (Math.random() - 0.5) * 0.3;
          }
        }
      }
    },
  };
  L.dynamics.push(api);
  return api;
}

// Construction festoon: a sagging cable of caged work bulbs on scaffold poles
// through pts [[x,z],...] (poles at every point). Every `every`-th bulb carries a
// real light; `dead` bulb indices stay dark. Returns the real lights.
export function festoon(L, pts, y, o = {}) {
  const sag = o.sag ?? 0.45, step = o.step ?? 1.8, every = o.every ?? 6, lights = [];
  let k = 0;
  for (const [x, z] of pts) {
    const p = P.prop(L, x, 0, z, 0);
    p.cyl(0, (y + 0.15) / 2, 0, 0.024, y + 0.15, 'metalClean', 0x8a8e8a, null, 8).box(0, 0.02, 0, 0.3, 0.04, 0.3, 'metalDark', 0x3a3a3a);
    p.box(0, y - 0.05, 0, 0.1, 0.1, 0.1, 'paintedYellow', 0xc8a020); // coupler
    p.col(0, y / 2, 0, 0.12, y, 0.12, 'metal', F_SOLID | F_SHOOT);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / step));
    const at = (t) => [ax + (bx - ax) * t, y - Math.sin(t * Math.PI) * sag, az + (bz - az) * t];
    for (let j = 0; j < n; j++) {
      const [x0, y0, z0] = at(j / n), [x1, y1, z1] = at((j + 1) / n);
      P.pipe(L, x0, y0, z0, x1, y1, z1, 0.008, 'blackMatte');
      if (j === 0) continue;
      const dead = (o.dead || []).includes(k);
      const b = P.prop(L, x0, y0, z0, 0);
      b.box(0, -0.06, 0, 0.05, 0.08, 0.05, 'blackMatte').glowSph(0, -0.16, 0, 0.055, dead ? 0x2a2620 : 0xffc070);
      b.torus(0, -0.16, 0, 0.07, 0.006, 'metalDark', 0x2a2a2a, [Math.PI / 2, 0, 0], 4, 8);
      if (!dead && k % every === Math.floor(every / 2)) lights.push(L.light(x0, y0 - 0.3, z0, 0xffb868, o.intensity ?? 8, o.range ?? 9, { flicker: o.flicker ?? 0.04 }));
      k++;
    }
  }
  return lights;
}

export { F_SOLID, F_SHOOT, F_SIGHT, F_DEFAULT, F_NONAV, P, sign };
