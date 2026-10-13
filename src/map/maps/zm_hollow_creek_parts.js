// Hollow Creek (zm_hollow_creek): building blocks for the town - atlas painting, pines and
// shade trees, cars, the school bus, boxcars, the tanker, sodium street lights, lanterns,
// windows, doors, signs, porches, fences, benches. Each adds brushes / lights to an
// AreaMap or MapDSL `m`. DOM-free and deterministic (no randomness: positions come from
// the caller, variations from integer hashes).
//
// Atlas painting: a face texture can be an atlas marker - sw('white') (a flat paint swatch),
// rg('diner') (one picture stretched over the face), strip('picket', 32) (a full-width strip
// repeating every 32 units along the face) - instead of a texture name. paint(b) turns the
// markers of brush b into hc_atlas scale / offset specs fitted to each face's extents, so one
// texture carries every sign, vehicle and trim (one draw call). Faces seen from the front read
// left to right (mirrored axes are flipped).
import { Brush, plane } from '../brush.js';
import { textureAxes } from '../lightmap.js';
import { CONTENTS_PLAYERCLIP } from '../../engine/collision.js';
import { HC_ATLAS } from '../../assets/tex/hollowcreek.js';

const AW = HC_ATLAS.size;

// the creek: the bed and its two bank strips (stone walls down to the bed)
export const CREEK = {
  x0: -1696, x1: -1440, bed0: -1696, bed1: -1536, z: -96, y0: -1344, y1: 1472,
  // ramps: [y0, y1, the end that rises] - east: cut into the bank strip (Mill Road's verge, z 8);
  // west: against the bed's west wall up to the woods road (z 0)
  rampsE: [[-1280, -1088, 's'], [-640, -448, 'n'], [448, 640, 's'], [1088, 1280, 'n']],
  rampsW: [[320, 512, 'n'], [960, 1152, 's']],
};
export const DECK_Z = 256; // the highway
export const EAST = 1984; // Main Street's east end (the off-ramp joins there)
export const CEM = { y0: 1536, y1: 1792 }; // the cemetery hill: z = 8 + (y - y0) / 6

/** asphalt_lane with its centre line on the street's centre c (axis 'x': the street runs east-west). */
export function lane(axis, c) {
  const md = (v) => ((v % 256) + 256) % 256;
  return axis === 'x' ? { name: 'asphalt_lane', rot: 90, offset: [0, md(128 + c)] } : { name: 'asphalt_lane', offset: [md(128 - c), 0] };
}

/** Atlas markers (see the header). */
export const sw = (key, inset = 5) => ({ hc: 'sw', key, inset });
export const rg = (key, inset = 0.5) => ({ hc: 'rg', key, inset });
export const strip = (key, period = 32, inset = 0.5) => ({ hc: 'strip', key, period, inset });

function regionOf(mk) {
  if (mk.hc === 'sw') {
    const k = HC_ATLAS.swatches.indexOf(mk.key);
    if (k < 0) throw new Error(`hc atlas: no swatch ${mk.key}`);
    return [k * 32 + mk.inset, HC_ATLAS.swatchY + mk.inset, k * 32 + 32 - mk.inset, 512 - mk.inset];
  }
  if (mk.hc === 'rg') {
    const r = HC_ATLAS.regions[mk.key];
    if (!r) throw new Error(`hc atlas: no region ${mk.key}`);
    return [r[0] + mk.inset, r[1] + mk.inset, r[2] - mk.inset, r[3] - mk.inset];
  }
  const s = HC_ATLAS.strips[mk.key];
  if (!s) throw new Error(`hc atlas: no strip ${mk.key}`);
  return [0, s.y0 + mk.inset, AW, s.y1 - mk.inset];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Replace the atlas markers on brush b's faces with fitted hc_atlas specs. Returns b. */
export function paint(b) {
  if (!b || !b.planes.some((p) => p.tex && p.tex.hc)) return b;
  b.computePolys();
  b.planes.forEach((p, i) => {
    const mk = p.tex;
    if (!mk || !mk.hc) return;
    const poly = b.polys[i];
    if (!poly) { p.tex = null; return; }
    const ax = textureAxes(p.n);
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const v of poly) {
      const s = dot(v, ax.s), t = dot(v, ax.t);
      if (s < s0) s0 = s; if (s > s1) s1 = s;
      if (t < t0) t0 = t; if (t > t1) t1 = t;
    }
    // mirrored? (the viewer's right, (-n) x up, against the s axis)
    let flip = false;
    if (Math.abs(p.n[2]) < 0.9) flip = (-p.n[1]) * ax.s[0] - (-p.n[0]) * ax.s[1] < 0;
    const [x0, y0, x1, y1] = regionOf(mk);
    const scV = Math.max(1e-3, t1 - t0) / (y1 - y0), offV = y0 - t0 / scV;
    let scU, offU;
    if (mk.hc === 'strip') {
      const per = HC_ATLAS.strips[mk.key].period;
      scU = (mk.period / per) * (flip ? -1 : 1);
      offU = -s0 / scU;
    } else if (!flip) { scU = Math.max(1e-3, s1 - s0) / (x1 - x0); offU = x0 - s0 / scU; }
    else { scU = -Math.max(1e-3, s1 - s0) / (x1 - x0); offU = x1 - s0 / scU; }
    p.tex = { name: 'hc_atlas', scale: [scU, scV], offset: [offU, offV] };
  });
  b.polys = null;
  return b;
}

/** m.box with atlas markers allowed in the (keyed) texture. */
export function pbox(m, x0, y0, z0, x1, y1, z1, tex, opts = {}) {
  return paint(m.box(x0, y0, z0, x1, y1, z1, tex, opts));
}

/** m.prism with atlas markers allowed. */
export function pprism(m, axis, pts, lo, hi, tex, opts = {}) {
  return paint(m.prism(axis, pts, lo, hi, tex, opts));
}

/** A box rotated by ang (degrees, about z) around its centre cx, cy: half sizes hx, hy. */
export function rbox(m, cx, cy, z0, z1, hx, hy, ang, tex, opts = {}) {
  const a = ang * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([u, v]) => [cx + u * c - v * s, cy + u * s + v * c]);
  return pprism(m, 'z', pts, z0, z1, tex, opts);
}

/**
 * A regular `sides`-gon frustum: apothem r0 at z0 tapering to r1 at z1, about (x, y);
 * rot (radians) turns it. tex: a texture or keyed spec (+ atlas markers).
 */
export function frustum(m, x, y, z0, z1, r0, r1, sides, tex, opts = {}, rot = 0) {
  const planes = [];
  const pick = (n) => (tex && typeof tex === 'object' && !tex.name && !tex.hc ? (Math.abs(n[2]) > 0.99 ? (n[2] > 0 ? tex.top ?? tex.all : tex.bottom ?? tex.all) : tex.sides ?? tex.all) : tex);
  for (let k = 0; k < sides; k++) {
    const a = rot + (k + 0.5) * 2 * Math.PI / sides, ca = Math.cos(a), sa = Math.sin(a);
    const n = [ca * (z1 - z0), sa * (z1 - z0), r0 - r1];
    const p = [x + ca * r0, y + sa * r0, z0];
    planes.push(plane(n, dot(n, p), pick([n[0], n[1], 0])));
  }
  planes.push(plane([0, 0, 1], z1, pick([0, 0, 1])));
  planes.push(plane([0, 0, -1], -z0, pick([0, 0, -1])));
  return paint(m.add(new Brush(planes, opts)));
}

/** A small integer hash in [0, 1) for deterministic variation. */
export function h01(a, b = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ trees

/**
 * A pine: a dark trunk and three tapering tiers of boughs (h tall, r the lowest tier's
 * apothem). The lowest boughs start at 0.2 h (players don't walk under a pine; the
 * steep tiers can't be stood on). tiers: 2 for distant ones.
 */
export function pine(m, x, y, z, h = 320, r = 88, tiers = 3, rot = 0, sides = 6) {
  m.box(x - 7, y - 7, z, x + 7, y + 7, z + h * 0.45, { all: 'wood_dark' }, { surface: 'wood', name: 'tree', detail: true });
  const T = tiers === 3
    ? [[0.2, 0.56, 1, 0.22], [0.44, 0.8, 0.74, 0.14], [0.68, 1, 0.46, 0.03]]
    : [[0.25, 0.7, 1, 0.2], [0.55, 1, 0.6, 0.03]];
  for (const [a, b, ra, rb] of T) frustum(m, x, y, z + h * a, z + h * b, r * ra, Math.max(2, r * rb), sides, { all: 'hc_leaves' }, { surface: 'dirt', name: 'tree', detail: true }, rot);
}

/** A shade tree: a trunk with a rounded crown (three stacked octagonal pieces) from zc up. */
export function shadeTree(m, x, y, z, h = 300, r = 110, rot = 0) {
  m.box(x - 9, y - 9, z, x + 9, y + 9, z + h * 0.55, { all: 'wood_dark' }, { surface: 'wood', name: 'tree', detail: true });
  const zc = z + h * 0.42; // the crown's underside: well over a player's head
  const L = { all: 'hc_leaves' }, o = { surface: 'dirt', name: 'tree', detail: true };
  frustum(m, x, y, zc, zc + h * 0.16, r * 0.62, r, 8, L, o, rot);
  frustum(m, x, y, zc + h * 0.16, zc + h * 0.36, r, r * 0.92, 8, L, o, rot);
  frustum(m, x, y, zc + h * 0.36, z + h, r * 0.92, r * 0.36, 8, L, o, rot);
}

// ------------------------------------------------------------------ vehicles

/**
 * A car (or a pickup: o.pickup) parked at (x, y) facing ang degrees, paint swatch col.
 * The hood is 30 up (a jump), the roof 64 (from the hood): the horde climbs them too.
 */
export function car(m, x, y, z, ang, col = 'blue', o = {}) {
  const P = { surface: 'metal', name: 'car', detail: true };
  const len = o.pickup ? 116 : 104, hw = 36;
  const part = (u0, u1, v0, v1, z0, z1, T) => obox(m, x, y, ang, u0, u1, v0, v1, z + z0, z + z1, T, P);
  const body = sw(col);
  part(-len / 2, len / 2, -hw, hw, 8, 30, { all: body });
  part(len / 2, len / 2 + 3, -hw + 2, hw - 2, 10, 20, { all: sw('chrome'), front: o.lights ? sw('head') : sw('chrome') });
  part(-len / 2 - 3, -len / 2, -hw + 2, hw - 2, 10, 20, { all: sw('chrome'), back: sw('tail') });
  for (const u of [-len / 2 + 22, len / 2 - 22]) part(u - 12, u + 12, -hw - 1, hw + 1, 0, 12, { all: sw('tire') }); // the axles' wheels
  if (o.pickup) {
    part(-6, 30, -hw + 3, hw - 3, 30, 70, { all: 'glass_dark', top: body });
    part(-len / 2, -6, -hw, hw, 30, 38, { all: body, top: sw('black') });
  } else {
    // the cabin: glass, a painted roof at 70 (a jump up from the hood, for the horde too)
    part(-28, 24, -hw + 4, hw - 4, 30, 60, { all: 'glass_dark' });
    part(-30, 26, -hw + 3, hw - 3, 60, 70, { all: body });
  }
  if (o.police) part(-6, 6, -16, 16, 70, 76, { all: sw('chrome'), top: sw('tail') });
  // nobody stands on a car (zombies on a hood get stuck; players would perch): an invisible clip over it
  obox(m, x, y, ang, -len / 2 - 3, len / 2 + 3, -hw - 1, hw + 1, z, z + 128, { all: null }, { contents: CONTENTS_PLAYERCLIP, visible: false, castShadow: false, name: 'clip' });
  if (o.lights) m.light(x + Math.cos(ang * Math.PI / 180) * (len / 2 + 40), y + Math.sin(ang * Math.PI / 180) * (len / 2 + 40), z + 24, [1.0, 0.92, 0.75], 0.5, 260);
}

/**
 * A box in a local frame (u along, v across) turned by ang degrees about (x, y): faces get
 * their own textures - long (the two v sides), front (+u), back (-u), top, bottom.
 */
export function obox(m, x, y, ang, u0, u1, v0, v1, z0, z1, T, opts = {}) {
  const a = ang * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const at = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  const b = m.prism('z', [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], z0, z1, 'skip', opts);
  // (prismBrush: one side plane per edge in order - v0, +u end, v1, -u end - then top, bottom)
  const side = [T.long ?? T.all, T.front ?? T.all, T.long ?? T.all, T.back ?? T.all];
  for (let i = 0; i < 4; i++) b.planes[i].tex = side[i];
  b.planes[4].tex = T.top ?? T.all;
  b.planes[5].tex = T.bottom ?? T.all;
  return paint(b);
}

/** The school bus, ang degrees, 376 long, 104 wide, 124 tall (a body, a hood, wheels). */
export function bus(m, x, y, z, ang) {
  const P = { surface: 'metal', name: 'bus', detail: true };
  const part = (u0, u1, v0, v1, z0, z1, T) => obox(m, x, y, ang, u0, u1, v0, v1, z + z0, z + z1, T, P);
  const Y = sw('yellow');
  part(-180, 150, -52, 52, 18, 124, { all: Y, long: rg('bus'), top: sw('cream') });
  part(150, 196, -48, 48, 18, 40, { all: Y, top: sw('black') }); // the hood (40: a hop, as for the horde)
  part(148, 152, -44, 44, 70, 116, { all: 'glass_dark' }); // the windscreen
  part(196, 200, -46, 46, 22, 34, { all: sw('chrome') });
  for (const u of [-130, 110]) for (const v of [-54, 38]) part(u - 18, u + 18, v, v + 16, 0, 28, { all: sw('tire') });
  obox(m, x, y, ang, -184, 202, -56, 56, z, z + 160, { all: null }, { contents: CONTENTS_PLAYERCLIP, visible: false, castShadow: false, name: 'clip' });
}

/** A boxcar on its bogies along x (480 long): deck at z + 44, roof at z + 172. */
export function boxcar(m, x, y, z, len = 448) {
  const P = { surface: 'metal', name: 'boxcar', detail: true };
  pbox(m, x - len / 2, y - 52, z + 40, x + len / 2, y + 52, z + 168, { all: sw('barn'), n: rg('boxcar'), s: rg('boxcar'), top: sw('rust') }, P);
  pbox(m, x - len / 2 + 6, y - 46, z + 168, x + len / 2 - 6, y + 46, z + 174, { all: sw('rust') }, P); // the roof walk
  for (const u of [-len / 2 + 64, len / 2 - 64]) pbox(m, x + u - 48, y - 40, z + 4, x + u + 48, y + 40, z + 40, { all: sw('black') }, P); // bogies
  for (const u of [-len / 2 - 8, len / 2]) pbox(m, x + u, y - 10, z + 22, x + u + 8, y + 10, z + 34, { all: sw('black') }, P); // couplers
}

/** A tanker truck along x (cab at +x): the extraction ride at the gas station. */
export function tanker(m, x, y, z, flip = false) {
  const P = { surface: 'metal', name: 'tanker', detail: true };
  const d = flip ? -1 : 1, X = (u) => x + u * d;
  const bx = (u0, u1, y0, y1, z0, z1, tex) => pbox(m, Math.min(X(u0), X(u1)), y + y0, z + z0, Math.max(X(u0), X(u1)), y + y1, z + z1, tex, P);
  bx(-260, 150, -40, 40, 18, 34, { all: sw('black') }); // chassis
  // the tank: an octagon in section along x
  const R = 52, zc = z + 104, pts = []; // (the tank's top 156: out of reach from the cab roof at 88)
  for (let k = 0; k < 8; k++) { const t = (k + 0.5) * Math.PI / 4; pts.push([y + Math.cos(t) * R, zc + Math.sin(t) * R]); }
  pprism(m, 'x', pts, Math.min(X(-250), X(110)), Math.max(X(-250), X(110)), { all: sw('chrome'), e: sw('white'), w: sw('white') }, P);
  bx(150, 232, -46, 46, 18, 64, { all: sw('maroon'), top: sw('maroon') }); // cab and hood (64 up: from the step)
  bx(150, 200, -42, 42, 64, 88, { all: 'glass_dark', top: sw('maroon') });
  bx(196, 232, -46, 46, 22, 30, { all: sw('chrome') });
  for (const u of [-220, -170, 190]) for (const v of [-48, 32]) bx(u - 18, u + 18, v, v + 16, 0, 34, { all: sw('tire') });
  pbox(m, Math.min(X(-262), X(234)), y - 54, z, Math.max(X(-262), X(234)), y + 54, z + 200, { all: null }, { contents: CONTENTS_PLAYERCLIP, visible: false, castShadow: false, name: 'clip' });
}

// ------------------------------------------------------------------ lights

/** Sodium colour and a street light's light. */
export const SODIUM = [1.0, 0.62, 0.3];

/**
 * A cobra-head street light: a dark pole at (x, y) from z, h tall, an arm `arm` long toward
 * dir ('n', 's', 'e', 'w') and a fullbright sodium lens under its head, with its light.
 */
export function sodium(m, x, y, z, dir = 'n', h = 232, arm = 64, o = {}) {
  const P = { surface: 'metal', name: 'pole', detail: true };
  const pole = { all: sw('black') };
  pbox(m, x - 4, y - 4, z, x + 4, y + 4, z + h, pole, P);
  pbox(m, x - 7, y - 7, z, x + 7, y + 7, z + 10, pole, P);
  const d = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[dir];
  const ex = x + d[0] * arm, ey = y + d[1] * arm;
  pbox(m, Math.min(x, ex) - 2, Math.min(y, ey) - 2, z + h - 6, Math.max(x, ex) + 2, Math.max(y, ey) + 2, z + h, pole, P);
  // the head: a dark housing with the lens underneath
  const hx = d[0] ? 14 : 9, hy = d[1] ? 14 : 9;
  pbox(m, ex - hx, ey - hy, z + h - 8, ex + hx, ey + hy, z + h + 2, { all: sw('black') }, P);
  const lens = pbox(m, ex - hx + 3, ey - hy + 3, z + h - 11, ex + hx - 3, ey + hy - 3, z + h - 8, { all: sw('sodium') }, { ...P, detail: true, name: 'lamp' });
  if (lens) { lens.fullbright = true; lens.castShadow = false; }
  m.light(ex, ey, z + h - 22, o.color || SODIUM, o.intensity ?? 0.95, o.radius ?? 500);
  return [ex, ey, z + h - 22];
}

/** A cast-iron lantern post (the square, the church path): a warm lantern on a black post. */
export function lantern(m, x, y, z, h = 112, o = {}) {
  const P = { surface: 'metal', name: 'pole', detail: true };
  pbox(m, x - 6, y - 6, z, x + 6, y + 6, z + 14, { all: sw('black') }, P);
  pbox(m, x - 3, y - 3, z + 14, x + 3, y + 3, z + h, { all: sw('black') }, P);
  // (the glass is not solid: the light sits inside it)
  const g = pbox(m, x - 7, y - 7, z + h, x + 7, y + 7, z + h + 18, { all: sw('sodium'), top: sw('black'), bottom: sw('black') }, { ...P, detail: true, name: 'lamp', contents: 0 });
  if (g) { g.fullbright = true; g.castShadow = false; }
  frustum(m, x, y, z + h + 18, z + h + 26, 10, 2, 4, { all: sw('black') }, P, Math.PI / 4);
  m.light(x, y, z + h + 9, o.color || [1.0, 0.72, 0.42], o.intensity ?? 0.8, o.radius ?? 340);
}

/**
 * A fullbright panel (sodium, head, tail ...) with a point light in front of it: on a wall
 * facing `face` ('n', 's', 'e', 'w'; its back at x, y) or hanging ('down'; under z).
 */
export function glowLamp(m, x, y, z, face, w, h, swatch, color, intensity, radius, depth = 4) {
  let b, lp;
  if (face === 'down') {
    b = pbox(m, x - w / 2, y - h / 2, z, x + w / 2, y + h / 2, z + depth, { all: sw(swatch) }, { detail: true, name: 'lamp' });
    lp = [x, y, z - 12];
  } else {
    const d = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[face];
    const xa = d[0] ? Math.min(x, x + d[0] * depth) : x - w / 2, xb = d[0] ? Math.max(x, x + d[0] * depth) : x + w / 2;
    const ya = d[1] ? Math.min(y, y + d[1] * depth) : y - w / 2, yb = d[1] ? Math.max(y, y + d[1] * depth) : y + w / 2;
    b = pbox(m, xa, ya, z - h / 2, xb, yb, z + h / 2, { all: sw(swatch) }, { detail: true, name: 'lamp' });
    lp = [x + d[0] * (depth + 12), y + d[1] * (depth + 12), z];
  }
  if (b) { b.fullbright = true; b.castShadow = false; }
  if (radius > 0) m.light(lp[0], lp[1], lp[2], color, intensity, radius);
  return lp;
}

// ------------------------------------------------------------------ facade details

const FACE = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };

/**
 * A box on a facade: the wall plane at `c` (y for 'n' / 's' faces, x for 'e' / 'w'), facing
 * `face`, spanning u0..u1 along the wall and z0..z1, standing out d0..d1 from the plane.
 */
export function onWall(m, face, c, u0, u1, z0, z1, d0, d1, tex, opts = {}) {
  const [fx, fy] = FACE[face];
  if (fy) { const a = c + fy * d0, b = c + fy * d1; return pbox(m, u0, Math.min(a, b), z0, u1, Math.max(a, b), z1, tex, opts); }
  const a = c + fx * d0, b = c + fx * d1;
  return pbox(m, Math.min(a, b), u0, z0, Math.max(a, b), u1, z1, tex, opts);
}

/**
 * A window on a facade: a white frame and sill, and a pane - dark glass, or lit (fullbright
 * warm / cool picture, o.lit = 'warm' | 'cool') with a little light spilling out (o.spill).
 */
export function windowOn(m, face, c, u, z, w = 40, h = 56, o = {}) {
  const D = { detail: true, name: 'window' };
  const fr = o.frame || sw('white');
  onWall(m, face, c, u - w / 2 - 4, u + w / 2 + 4, z - 4, z + h + 4, 0, 2, { all: fr }, D);
  onWall(m, face, c, u - w / 2 - 6, u + w / 2 + 6, z - 8, z - 3, 0, 5, { all: fr }, D); // sill
  if (o.lit) {
    const p = onWall(m, face, c, u - w / 2, u + w / 2, z, z + h, 2, 3, { all: rg(o.lit === 'cool' ? 'wincool' : 'winwarm') }, D);
    if (p) { p.fullbright = true; p.castShadow = false; }
    if (o.spill !== false) {
      const [fx, fy] = FACE[face];
      m.light(fy ? u : c + fx * 20, fy ? c + fy * 20 : u, z + h * 0.5, o.lit === 'cool' ? [0.5, 0.65, 1.0] : [1.0, 0.72, 0.42], o.spill ?? 0.45, o.spillR ?? 220);
    }
  } else onWall(m, face, c, u - w / 2, u + w / 2, z, z + h, 2, 3, { all: 'glass_dark' }, D);
}

/** A (fake) door on a facade: a frame and a door picture (rg('door') / rg('shopdoor')). */
export function doorOn(m, face, c, u, z, w = 52, h = 100, pic = rg('door'), frame = sw('white')) {
  const D = { detail: true, name: 'door' };
  onWall(m, face, c, u - w / 2 - 5, u + w / 2 + 5, z, z + h + 6, 0, 2, { all: frame }, D);
  onWall(m, face, c, u - w / 2, u + w / 2, z, z + h, 2, 3, { all: pic }, D);
}

/** A sign board on a facade showing atlas region `key` (o.lit: fullbright). */
export function signOn(m, face, c, u0, u1, z0, z1, key, o = {}) {
  const b = onWall(m, face, c, u0, u1, z0, z1, 0, o.depth ?? 4, { all: o.edge || sw('black'), [face]: rg(key) }, { detail: true, name: 'sign' });
  if (b && o.lit) { b.fullbright = true; b.castShadow = false; }
  return b;
}

/** A doorway trim around a real opening (jambs and a head) on a facade. */
export function doorFrame(m, face, c, u, z, w, h, tex = sw('white'), d = 3) {
  const D = { detail: true, name: 'trim' };
  onWall(m, face, c, u - w / 2 - 6, u - w / 2, z, z + h, 0, d, { all: tex }, D);
  onWall(m, face, c, u + w / 2, u + w / 2 + 6, z, z + h, 0, d, { all: tex }, D);
  onWall(m, face, c, u - w / 2 - 6, u + w / 2 + 6, z + h, z + h + 8, 0, d, { all: tex }, D);
}

// ------------------------------------------------------------------ fences, furniture

/**
 * A straight run of fence (axis-aligned: x0 == x1 or y0 == y1) h tall, t thick, painted with
 * strip `kind` ('picket', 'iron', 'baluster') repeating every `period` units, posts every
 * `postGap` (0: none). gaps: [[a0, a1], ...] along the run left open (gates).
 */
export function stripFence(m, x0, y0, x1, y1, z, h, kind = 'picket', period = 24, t = 3, postGap = 0, gaps = []) {
  const alongX = y0 === y1;
  const a0 = alongX ? Math.min(x0, x1) : Math.min(y0, y1), a1 = alongX ? Math.max(x0, x1) : Math.max(y0, y1);
  const c = alongX ? y0 : x0;
  const runs = [];
  let a = a0;
  for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g0 > a) runs.push([a, g0]); a = Math.max(a, g1); }
  if (a < a1) runs.push([a, a1]);
  const F = { surface: kind === 'iron' ? 'metal' : 'wood', name: 'fence', detail: true };
  const tex = { all: kind === 'iron' ? sw('black') : sw('white'), sides: strip(kind, period) };
  for (const [r0, r1] of runs) {
    if (alongX) pbox(m, r0, c - t / 2, z, r1, c + t / 2, z + h, tex, F);
    else pbox(m, c - t / 2, r0, z, c + t / 2, r1, z + h, tex, F);
    if (postGap > 0) {
      for (let p = r0; p <= r1 + 0.5; p += postGap) {
        const q = Math.min(p, r1);
        const ph = h + (kind === 'iron' ? 6 : 0); // (posts no taller than a picket fence: no perch)
        const pt = { all: kind === 'iron' ? sw('black') : sw('white') };
        if (alongX) pbox(m, q - 3, c - 3, z, q + 3, c + 3, z + ph, pt, F);
        else pbox(m, c - 3, q - 3, z, c + 3, q + 3, z + ph, pt, F);
      }
    }
  }
}

/** A park bench (16 high seat, a back to 32) facing ang (0 = the seat's front toward +x). */
export function bench(m, x, y, z, ang) {
  const W = { surface: 'wood', name: 'bench', detail: true };
  rbox(m, x, y, z + 12, z + 16, 9, 30, ang, { all: 'wood_dark' }, W);
  const a = ang * Math.PI / 180;
  rbox(m, x - Math.cos(a) * 9, y - Math.sin(a) * 9, z + 18, z + 32, 2, 30, ang, { all: 'wood_dark' }, W);
  for (const v of [-26, 26]) rbox(m, x - Math.sin(a) * v, y + Math.cos(a) * v, z, z + 14, 7, 2, ang, { all: sw('black') }, W);
}

/** A glass-less invisible blocker (keeps players off a decorative top). */
export function clipBox(m, x0, y0, z0, x1, y1, z1) {
  return m.box(x0, y0, z0, x1, y1, z1, { all: null }, { contents: CONTENTS_PLAYERCLIP, visible: false, castShadow: false, name: 'clip' });
}
