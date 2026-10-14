// Building blocks for the original built-in maps (src/map/maps/*): walls with door and
// window gaps, rooms, pitched roofs, glass, lamps, street lights, shipping containers,
// fences, barrels, pillars, spawn grids. Each adds convex brushes (or lights / entities)
// to a MapDSL or AreaMap `m`. Coordinates: GoldSrc units, x east, y north, z up.
// Textures: a name, or a keyed spec ({ all, top, bottom, sides, n, s, e, w }, brush.js).
// DOM-free (tools/bake.mjs builds maps in node).
//
// Not supported on built-in maps: ladders (zombies can't climb them, so a ladder makes a
// spot the horde can't reach) - use stairs or a ramp (max 45 deg) instead.

import { boxBrush, prismBrush } from './brush.js';
import { CONTENTS_PLAYERCLIP } from '../engine/collision.js';

export const DOOR_H = 112; // a doorway's height (a standing player is 72)
const FEET = 37; // an entity origin (hull centre) above the floor, as the nav seeds expect

/**
 * A straight wall with gaps (doors, windows). axis 'x': the wall runs along x from a0 to a1
 * and is t0..t1 thick in y; axis 'y': along y, t0..t1 in x. z0..z1 tall.
 * gaps: [{ c, w, z0 = wall z0 (a door), z1 = z0 + DOOR_H }]: centre along the wall, width;
 * a gap with z0 above the wall's foot leaves a sill below it (a window).
 */
export function wall(m, axis, a0, a1, t0, t1, z0, z1, tex, gaps = [], opts = {}) {
  const box = (u0, u1, za, zb) => {
    if (u1 - u0 < 0.5 || zb - za < 0.5) return;
    if (axis === 'x') m.box(u0, t0, za, u1, t1, zb, tex, opts);
    else m.box(t0, u0, za, t1, u1, zb, tex, opts);
  };
  let u = Math.min(a0, a1);
  const end = Math.max(a0, a1);
  for (const g of gaps.slice().sort((p, q) => p.c - q.c)) {
    const ga = Math.max(u, g.c - g.w / 2), gb = Math.min(end, g.c + g.w / 2);
    if (gb <= ga) continue;
    const gz0 = g.z0 ?? z0, gz1 = Math.min(z1, g.z1 ?? gz0 + DOOR_H);
    box(u, ga, z0, z1);
    box(ga, gb, z0, gz0); // sill
    box(ga, gb, gz1, z1); // lintel
    u = gb;
  }
  box(u, end, z0, z1);
}

/**
 * A room: the walkable floor rect x0..x1, y0..y1 at height z, h tall inside, with walls of
 * thickness o.t (16) outside that rect and a ceiling slab (o.ceilT, 16) on top.
 * o: { wallIn, wallOut (textures), floor (null: none - an area already gives the floor),
 *      ceil (underside), roof (top; null: no ceiling at all - an open yard),
 *      gaps: { n: [...], s: [...], e: [...], w: [...] } (wall() gaps; c in world coords) }
 * Returns the outer bounds [x0 - t, y0 - t, x1 + t, y1 + t].
 */
export function room(m, x0, y0, x1, y1, z, h, o = {}) {
  const t = o.t ?? 16, ceilT = o.ceilT ?? 16;
  const win = o.wallIn || o.wall || 'concrete_paint', wout = o.wallOut || o.wall || win;
  const g = o.gaps || {};
  const X0 = x0 - t, X1 = x1 + t, Y0 = y0 - t, Y1 = y1 + t, top = z + h;
  wall(m, 'x', X0, X1, y1, Y1, z, top, { all: wout, s: win }, g.n || [], o.opts);
  wall(m, 'x', X0, X1, Y0, y0, z, top, { all: wout, n: win }, g.s || [], o.opts);
  wall(m, 'y', y0, y1, x1, X1, z, top, { all: wout, w: win }, g.e || [], o.opts);
  wall(m, 'y', y0, y1, X0, x0, z, top, { all: wout, e: win }, g.w || [], o.opts);
  if (o.floor) m.box(X0, Y0, z - 16, X1, Y1, z, { all: wout, top: o.floor });
  if (o.roof !== null) m.box(X0, Y0, top, X1, Y1, top + ceilT, { all: wout, bottom: o.ceil || 'ceiling_tile', top: o.roof || wout });
  return [X0, Y0, X1, Y1];
}

/**
 * A pitched (gable) roof over x0..x1, y0..y1 resting on height z, its ridge `rise` higher,
 * running along `axis` ('x': the ridge runs east-west). Two solid wedges; o.eave (0) adds
 * eaves overhanging the walls by that much, o.eaveT (6) thick.
 */
export function gableRoof(m, x0, y0, x1, y1, z, rise, axis = 'x', tex = 'roof_shingle', o = {}) {
  const gable = o.gable || tex; // the triangular ends
  const t = axis === 'x' ? { all: tex, e: gable, w: gable } : { all: tex, n: gable, s: gable };
  const [a0, a1, l0, l1] = axis === 'x' ? [y0, y1, x0, x1] : [x0, x1, y0, y1]; // a: across the ridge, l: along it
  const am = (a0 + a1) / 2, s = rise / (am - a0);
  const ext = axis === 'x' ? 'x' : 'y';
  m.prism(ext, [[a0, z], [am, z], [am, z + rise]], l0, l1, t);
  m.prism(ext, [[am, z], [a1, z], [am, z + rise]], l0, l1, t);
  const e = o.eave || 0;
  if (e > 0) {
    const th = o.eaveT ?? 6;
    const eave = { all: o.eaveTex || tex };
    m.prism(ext, [[a0 - e, z - s * e - th], [a0, z - th], [a0, z], [a0 - e, z - s * e]], l0 - e, l1 + e, eave);
    m.prism(ext, [[a1, z - th], [a1 + e, z - s * e - th], [a1 + e, z - s * e], [a1, z]], l0 - e, l1 + e, eave);
  }
}

/**
 * A pane of glass: blocks players and zombies (CONTENTS_PLAYERCLIP) but not bullets or
 * light, so lit rooms stay lit through their windows. Use a translucent texture (meta
 * `blend: true`, e.g. 'glass_dark'); an opaque one works too (GoldSrc-style dark windows).
 */
export function glass(m, x0, y0, z0, x1, y1, z1, tex = 'glass_dark') {
  return m.box(x0, y0, z0, x1, y1, z1, { all: tex }, { contents: CONTENTS_PLAYERCLIP, surface: 'glass', detail: true, name: 'glass' });
}

/**
 * A light fitting: a small self-lit (fullbright) panel and a point light just in front of it.
 * Default: hanging under a ceiling at height z (the panel spans z..z+depth, the light 10 below).
 * o: { size: [32, 16], depth: 4, tex: 'light_panel', face: 'down' | 'n' | 's' | 'e' | 'w'
 *      (which way it shines; a wall lamp's back sits at x, y), color, intensity (0.8),
 *      radius (380), light: false (panel only) }
 */
export function lamp(m, x, y, z, o = {}) {
  const [sw, sl] = o.size || [32, 16];
  const d = o.depth ?? 4, face = o.face || 'down';
  const tex = { all: o.tex || 'light_panel' };
  let b, lp;
  if (face === 'down') { b = m.box(x - sw / 2, y - sl / 2, z, x + sw / 2, y + sl / 2, z + d, tex, { detail: true, name: 'lamp' }); lp = [x, y, z - 10]; }
  else {
    // on a wall: the panel's back at (x, y), d deep toward `face`, sw wide, sl tall
    const dir = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[face];
    const xa = dir[0] ? Math.min(x, x + dir[0] * d) : x - sw / 2, xb = dir[0] ? Math.max(x, x + dir[0] * d) : x + sw / 2;
    const ya = dir[1] ? Math.min(y, y + dir[1] * d) : y - sw / 2, yb = dir[1] ? Math.max(y, y + dir[1] * d) : y + sw / 2;
    b = m.box(xa, ya, z - sl / 2, xb, yb, z + sl / 2, tex, { detail: true, name: 'lamp' });
    lp = [x + dir[0] * (d + 10), y + dir[1] * (d + 10), z];
  }
  if (b) { b.fullbright = true; b.castShadow = false; }
  if (o.light !== false) m.light(lp[0], lp[1], lp[2], o.color || [1, 0.92, 0.78], o.intensity ?? 0.8, o.radius ?? 380);
  return lp;
}

/**
 * A street light: an 8x8 pole from the ground z to z + h, an arm `arm` long toward `dir`
 * ('n', 's', 'e', 'w') and a lamp head under its end. o: lamp() options + { pole: tex }.
 */
export function streetLight(m, x, y, z, h = 224, dir = 'n', arm = 48, o = {}) {
  const pole = { all: o.pole || 'metal_rust' };
  m.box(x - 4, y - 4, z, x + 4, y + 4, z + h, pole, { surface: 'metal', name: 'pole' });
  const d = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[dir];
  const ex = x + d[0] * arm, ey = y + d[1] * arm;
  m.box(Math.min(x, ex) - 3, Math.min(y, ey) - 3, z + h - 6, Math.max(x, ex) + 3, Math.max(y, ey) + 3, z + h, pole, { surface: 'metal', name: 'pole' });
  return lamp(m, ex, ey, z + h - 12, { size: [20, 12], depth: 6, radius: 460, intensity: 0.9, ...o });
}

/**
 * A shipping container (8 x 8.5 ft; 20 ft = 240 units, 40 ft = 480): its long side along
 * `axis` ('x' or 'y'), its floor at z, centred at x, y. o: { len: 240, tex: 'container_red',
 * open: null | 'end' (hollow, walkable inside; the door end at the +axis side), roof: tex }
 */
export function container(m, x, y, z, axis = 'x', o = {}) {
  const len = o.len ?? 240, wid = 96, h = 102;
  const tex = o.tex || 'container_red';
  const [hx, hy] = axis === 'x' ? [len / 2, wid / 2] : [wid / 2, len / 2];
  const opts = { surface: 'metal', name: 'container' };
  if (!o.open) return m.box(x - hx, y - hy, z, x + hx, y + hy, z + h, { all: tex, top: o.roof || tex }, opts);
  const t = 4;
  m.box(x - hx, y - hy, z, x + hx, y + hy, z + 4, { all: tex, top: 'metal_diamond' }, opts); // floor plate
  m.box(x - hx, y - hy, z + h - t, x + hx, y + hy, z + h, { all: tex, top: o.roof || tex }, opts); // roof
  if (axis === 'x') {
    m.box(x - hx, y - hy, z + 4, x + hx, y - hy + t, z + h - t, { all: tex }, opts);
    m.box(x - hx, y + hy - t, z + 4, x + hx, y + hy, z + h - t, { all: tex }, opts);
    m.box(x - hx, y - hy + t, z + 4, x - hx + t, y + hy - t, z + h - t, { all: tex }, opts); // closed end (west)
  } else {
    m.box(x - hx, y - hy, z + 4, x - hx + t, y + hy, z + h - t, { all: tex }, opts);
    m.box(x + hx - t, y - hy, z + 4, x + hx, y + hy, z + h - t, { all: tex }, opts);
    m.box(x - hx + t, y - hy, z + 4, x + hx - t, y - hy + t, z + h - t, { all: tex }, opts); // closed end (south)
  }
}

/** A thin fence / railing from (x0, y0) to (x1, y1) (any angle), t thick, z..z+h. */
export function fence(m, x0, y0, x1, y1, z, h, tex = 'metal_rust', t = 4, opts = {}) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l * t / 2, ny = dx / l * t / 2;
  return m.prism('z', [[x0 - nx, y0 - ny], [x1 - nx, y1 - ny], [x1 + nx, y1 + ny], [x0 + nx, y0 + ny]], z, z + h, { all: tex }, { surface: 'metal', name: 'fence', ...opts });
}

/** An upright barrel (octagonal), r radius, h tall (40: the horde can jump onto it too), bottom at z. */
export function barrel(m, x, y, z, r = 14, h = 40, tex = 'metal_rust') {
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  return m.prism('z', pts, z, z + h, { all: tex }, { surface: 'metal', name: 'barrel' });
}

/** A square pillar s wide from z0 to z1. */
export function pillar(m, x, y, z0, z1, s = 32, tex = 'concrete_paint') {
  return m.box(x - s / 2, y - s / 2, z0, x + s / 2, y + s / 2, z1, { all: tex }, { name: 'pillar' });
}

/**
 * Spawn points on a grid: cols x rows spots `gap` apart centred at x, y on the floor z,
 * facing yaw (degrees). classname: 'info_player_start' (the squad: CT) or
 * 'info_player_deathmatch' (T; on zombie maps these only seed the nav graph).
 */
export function spawnGrid(m, classname, x, y, z, yaw, cols = 4, rows = 2, gap = 64) {
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    m.entity(classname, { origin: [x + (i - (cols - 1) / 2) * gap, y + (j - (rows - 1) / 2) * gap, z + FEET], angle: yaw });
  }
}

/** One nav seed (an info_player_deathmatch) on the floor at x, y, z: for places the spawns' flood fill can't reach. */
export function navSeed(m, x, y, z) {
  m.entity('info_player_deathmatch', { origin: [x, y, z + FEET], angle: 0 });
}

/** A callout zone row for MAP.zones: [name, tag, x0, y0, x1, y1, zMin, zMax] (first match wins). */
export function zone(name, tag, x0, y0, x1, y1, zMin = -1000, zMax = 4000) {
  return [name, tag, Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), zMin, zMax];
}

/** An invisible wall players and zombies can't pass (keeps them off a roof, out of the water). */
export function playerClip(m, x0, y0, z0, x1, y1, z1) {
  return m.box(x0, y0, z0, x1, y1, z1, { all: null }, { contents: CONTENTS_PLAYERCLIP, visible: false, castShadow: false, name: 'clip' });
}

/** Raw brush helpers re-exported for map modules. */
export { boxBrush, prismBrush };
