// Blackwater Docks (zm_blackwater): the props and shapes the map is dressed with - bollards,
// piles, crate steps up container stacks, pallets, a forklift, racking, sodium yard lights,
// cylinders (tanks, the lighthouse), rotated boxes, railings with their clips. Each adds
// convex brushes to the AreaMap / MapDSL `m`; deterministic, DOM-free.
import { lamp, fence } from '../kit.js';
import { CONTENTS_PLAYERCLIP } from '../../engine/collision.js';
import { textureAxes } from '../lightmap.js';
import { BW_ATLAS } from '../../assets/tex/blackwater.js';

// ---------------------------------------------------------------- the atlas (bw_atlas)
// A face texture may be an atlas marker, rg('harbour'): that region of bw_atlas stretched over
// the face (signs, crates, doors, shutters). paint(b) turns the markers of brush b into
// scale / offset specs fitted to each face, read left to right from the front.

/** An atlas region marker (inset in texels keeps the neighbours' edges out). */
export const rg = (key, inset = 0.5) => ({ bw: key, inset });
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Replace the atlas markers on brush b's faces with fitted bw_atlas specs. Returns b. */
export function paint(b) {
  if (!b || !b.planes.some((p) => p.tex && p.tex.bw)) return b;
  b.computePolys();
  b.planes.forEach((p, i) => {
    const mk = p.tex;
    if (!mk || !mk.bw) return;
    const poly = b.polys[i];
    if (!poly) { p.tex = null; return; }
    const r = BW_ATLAS.regions[mk.bw];
    if (!r) throw new Error(`bw atlas: no region ${mk.bw}`);
    const ax = textureAxes(p.n);
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const v of poly) {
      const s = dot(v, ax.s), t = dot(v, ax.t);
      if (s < s0) s0 = s; if (s > s1) s1 = s;
      if (t < t0) t0 = t; if (t > t1) t1 = t;
    }
    const x0 = r[0] + mk.inset, y0 = r[1] + mk.inset, x1 = r[2] - mk.inset, y1 = r[3] - mk.inset;
    // mirrored? (the viewer's right, (-n) x up, against the s axis)
    const flip = Math.abs(p.n[2]) < 0.9 && (-p.n[1]) * ax.s[0] - (-p.n[0]) * ax.s[1] < 0;
    const scV = Math.max(1e-3, t1 - t0) / (y1 - y0), offV = y0 - t0 / scV;
    const scU = (flip ? -1 : 1) * Math.max(1e-3, s1 - s0) / (x1 - x0), offU = (flip ? x1 : x0) - s0 / scU;
    p.tex = { name: 'bw_atlas', scale: [scU, scV], offset: [offU, offV] };
  });
  b.polys = null;
  return b;
}

/** m.box with atlas markers allowed in its (keyed) texture. */
export function pbox(m, x0, y0, z0, x1, y1, z1, tex, opts = {}) { return paint(m.box(x0, y0, z0, x1, y1, z1, tex, opts)); }

/**
 * A flat sign on a wall: region key, centred at (x, y) on the wall plane facing `face`
 * ('n', 's', 'e', 'w'), w wide, h tall, its bottom at z; 2 thick, a detail brush.
 */
export function sign(m, key, x, y, z, face, w, h, T, back = null) {
  const d = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[face], t = 2;
  const xa = d[0] ? x : x - w / 2, xb = d[0] ? x + d[0] * t : x + w / 2;
  const ya = d[1] ? y : y - w / 2, yb = d[1] ? y + d[1] * t : y + w / 2;
  return pbox(m, Math.min(xa, xb), Math.min(ya, yb), z, Math.max(xa, xb), Math.max(ya, yb), z + h, { all: back || T.iron, [face]: rg(key) }, { contents: 0, detail: true, castShadow: false, name: 'sign' }); // (paint only: nobody stands on a sign)
}

/** Sodium yard light colour, and the cold fluorescent of interiors. */
export const SODIUM = [1.0, 0.64, 0.32];
export const COLD = [0.78, 0.86, 1.0];
export const WARM = [1.0, 0.86, 0.66];

/** A deterministic hash in [0, 1) for small variations. */
export function h01(a, b = 0) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2d); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** A vertical n-sided prism (apothem r) about x, y from z0 to z1: tanks, piles, the lighthouse. */
export function cyl(m, x, y, z0, z1, r, n, tex, opts = {}, rot = 0) {
  const R = r / Math.cos(Math.PI / n), pts = [];
  for (let i = 0; i < n; i++) { const a = rot + (i + 0.5) * 2 * Math.PI / n; pts.push([x + Math.cos(a) * R, y + Math.sin(a) * R]); }
  return m.prism('z', pts, z0, z1, tex, opts);
}

/** A tapering n-sided frustum about x, y: apothem r0 at z0 to r1 at z1. */
export function frustum(m, x, y, z0, z1, r0, r1, n, tex, opts = {}, rot = 0) {
  const b = cyl(m, x, y, z0, z1, Math.max(r0, r1), n, tex, opts, rot);
  // re-tilt the side planes toward the top radius
  const R0 = r0 / Math.cos(Math.PI / n), R1 = r1 / Math.cos(Math.PI / n);
  b.planes = b.planes.filter((p) => Math.abs(p.n[2]) > 0.99);
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i + 0.5) * 2 * Math.PI / n, a1 = rot + (i + 1.5) * 2 * Math.PI / n;
    const p0 = [x + Math.cos(a0) * R0, y + Math.sin(a0) * R0, z0], p1 = [x + Math.cos(a1) * R0, y + Math.sin(a1) * R0, z0];
    const q0 = [x + Math.cos(a0) * R1, y + Math.sin(a0) * R1, z1];
    const u = [p1[0] - p0[0], p1[1] - p0[1], 0], v = [q0[0] - p0[0], q0[1] - p0[1], z1 - z0];
    const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...nn), n3 = [nn[0] / l, nn[1] / l, nn[2] / l];
    const out = (n3[0] * Math.cos((a0 + a1) / 2) + n3[1] * Math.sin((a0 + a1) / 2)) > 0 ? 1 : -1;
    const N = [n3[0] * out, n3[1] * out, n3[2] * out];
    const tex2 = typeof tex === 'object' && !tex.name ? (tex.sides ?? tex.all) : tex;
    b.planes.push({ n: N, d: N[0] * p0[0] + N[1] * p0[1] + N[2] * p0[2], tex: tex2 });
  }
  return b;
}

/** A box in a local frame turned by ang degrees about (x, y): u along, v across. */
export function rbox(m, x, y, ang, u0, u1, v0, v1, z0, z1, tex, opts = {}) {
  const a = ang * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const P = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  return m.prism('z', [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], z0, z1, tex, opts);
}

/** A mooring bollard: a squat cast-iron post (28 tall: anyone hops onto it) with a cap. */
export function bollard(m, x, y, z, T) {
  cyl(m, x, y, z, z + 22, 9, 8, { all: T.iron }, { surface: 'metal', name: 'bollard', detail: true });
  cyl(m, x, y, z + 22, z + 28, 12, 8, { all: T.iron }, { surface: 'metal', name: 'bollard', detail: true });
}

/** A timber pile (square, 16) from the bed up to z1. */
export function pile(m, x, y, z0, z1, T, s = 8) {
  const b = m.box(x - s, y - s, z0, x + s, y + s, z1, { all: T.pile }, { surface: 'wood', name: 'pile' });
  if (b) b.luxel = 32;
  return b;
}

/**
 * A railing from (x0, y0) to (x1, y1) at floor z: posts every ~96, a top rail at 40 and a mid
 * rail, plus an invisible wall up to z + 144 so nobody stands on it (a 40-unit top rail is a
 * ledge the horde can't follow).
 */
export function railing(m, x0, y0, x1, y1, z, T, o = {}) {
  const tex = o.tex || T.steel, h = o.h ?? 40;
  const l = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(l / 96));
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    m.box(x - 2, y - 2, z, x + 2, y + 2, z + h, { all: tex }, { surface: 'metal', name: 'rail', detail: true, castShadow: false });
  }
  fence(m, x0, y0, x1, y1, z + h - 3, 3, tex, 3, { detail: true });
  fence(m, x0, y0, x1, y1, z + h / 2 - 1, 2, tex, 2, { detail: true, castShadow: false });
  if (o.clip !== false) {
    const dx = x1 - x0, dy = y1 - y0, nx = -dy / l * 4, ny = dx / l * 4;
    m.prism('z', [[x0 - nx, y0 - ny], [x1 - nx, y1 - ny], [x1 + nx, y1 + ny], [x0 + nx, y0 + ny]], z, z + 144, { all: null }, { contents: CONTENTS_PLAYERCLIP, visible: false, castShadow: false, name: 'clip' });
  }
}

/** A wooden pallet (6 tall) with an optional load of sacks / boxes on it. */
export function pallet(m, x, y, z, ang, T, load = 0) {
  rbox(m, x, y, ang, -24, 24, -20, 20, z, z + 6, { all: T.planks }, { surface: 'wood', name: 'pallet', detail: true });
  if (load) paint(rbox(m, x, y, ang, -22, 22, -18, 18, z + 6, z + 6 + load, { all: rg(load > 30 ? 'crate' : 'crateB') }, { surface: 'wood', name: 'pallet', detail: true }));
}

/**
 * Crate steps up the side of a container stack: two crates (34 and 68 tall) set against a
 * face, so a player - and the horde, which jumps 40 - climbs 0 -> 34 -> 68 -> 102.
 * (x, y) is the foot of the steps against the stack, dir the way you climb ('n', 's', 'e', 'w').
 */
export function crateSteps(m, x, y, z, dir, T, w = 64) {
  const d = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[dir];
  const across = d[0] ? [0, 1] : [1, 0];
  const put = (back, depth, h) => {
    // a crate spanning `depth` toward the stack, its far face `back` units from the stack face
    const a0 = -back - depth, a1 = -back; // along d (negative: away from the stack)
    const xa = x + d[0] * a0 + across[0] * -w / 2, xb = x + d[0] * a1 + across[0] * w / 2;
    const ya = y + d[1] * a0 + across[1] * -w / 2, yb = y + d[1] * a1 + across[1] * w / 2;
    pbox(m, Math.min(xa, xb), Math.min(ya, yb), z, Math.max(xa, xb), Math.max(ya, yb), z + h, { all: rg(h > 40 ? 'crate' : 'crateB') }, { surface: 'wood', name: 'crate' });
  };
  put(0, 48, 68);
  put(48, 48, 34);
}

/**
 * Crate steps along a stack's side (a second way up that leaves the lane open): two crates
 * against the face at x (the face's plane) - 34 then 68 tall going toward `along` ('n' / 's')
 * from y - the 68 one is under the stack's edge, so its top is a 34 jump from the stack's 102.
 * out: which way the face looks ('e' / 'w').
 */
export function crateStepsAlong(m, x, y, z, out, along) {
  const dx = out === 'e' ? 1 : -1, dy = along === 'n' ? 1 : -1;
  const xa = Math.min(x, x + dx * 48), xb = Math.max(x, x + dx * 48);
  const put = (a, b, h) => pbox(m, xa, Math.min(y + dy * a, y + dy * b), z, xb, Math.max(y + dy * a, y + dy * b), z + h, { all: rg(h > 40 ? 'crate' : 'crateB') }, { surface: 'wood', name: 'crate' });
  put(0, 48, 34);
  put(48, 96, 68);
}

/** A sodium yard light: a tall steel pole with one or two heads (dirs) on short arms. */
export function yardLight(m, x, y, z, h, dirs, T, o = {}) {
  m.box(x - 6, y - 6, z, x + 6, y + 6, z + h, { all: T.iron }, { surface: 'metal', name: 'pole' });
  m.box(x - 10, y - 10, z, x + 10, y + 10, z + 24, { all: T.concrete }, { name: 'pole' }); // footing
  for (const dir of dirs) {
    const dv = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[dir];
    const arm = o.arm ?? 56, ex = x + dv[0] * arm, ey = y + dv[1] * arm;
    m.box(Math.min(x, ex) - 3, Math.min(y, ey) - 3, z + h - 8, Math.max(x, ex) + 3, Math.max(y, ey) + 3, z + h - 2, { all: T.iron }, { surface: 'metal', name: 'pole', detail: true });
    m.box(ex - 14, ey - 14, z + h - 14, ex + 14, ey + 14, z + h - 4, { all: T.iron }, { surface: 'metal', name: 'pole', detail: true });
    lamp(m, ex, ey, z + h - 18, { size: [22, 22], depth: 4, color: o.color || SODIUM, intensity: o.intensity ?? 0.95, radius: o.radius ?? 620 });
  }
}

/** A forklift (ang degrees: the forks point along +u). Body 40 + overhead guard; forks lowered. */
export function forklift(m, x, y, z, ang, T) {
  const o = { surface: 'metal', name: 'forklift', detail: true };
  rbox(m, x, y, ang, -48, 32, -30, 30, z + 8, z + 40, { all: T.steel }, o); // body (40: a hop, never a crouch-jump perch)
  rbox(m, x, y, ang, -60, -40, -28, 28, z + 8, z + 40, { all: T.iron }, o); // counterweight
  rbox(m, x, y, ang, -40, 24, -30, 30, z, z + 10, { all: T.tyre }, o); // wheels / chassis
  for (const v of [-28, 26]) {
    rbox(m, x, y, ang, -30, -26, v, v + 2, z + 40, z + 112, { all: T.iron }, o); // guard posts
    rbox(m, x, y, ang, 18, 22, v, v + 2, z + 40, z + 112, { all: T.iron }, o);
  }
  rbox(m, x, y, ang, -30, 22, -30, 30, z + 112, z + 116, { all: T.iron }, o); // guard roof
  rbox(m, x, y, ang, 32, 38, -24, 24, z + 4, z + 140, { all: T.iron }, o); // mast
  for (const v of [-18, 10]) rbox(m, x, y, ang, 38, 90, v, v + 8, z + 2, z + 6, { all: T.iron }, o); // forks
}

/** A straight strut from p to q (2D points in the prism's plane: (y, z) for axis 'x', (x, z) for 'y', (x, y) for 'z'), w thick, extruded lo..hi. */
export function strut(m, axis, p, q, w, lo, hi, tex, opts = {}) {
  const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
  return m.prism(axis, [[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny]], lo, hi, tex, opts);
}
