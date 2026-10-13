// Fort Ember (zm_fort_ember): structure and prop helpers - battlements, towers, doors and
// windows, beams, braziers and torches, burnt trucks, the crashed plane, market stalls,
// sandbags, rubble, rock spires, a lattice mast. Every helper adds convex brushes (and
// lights) to a MapDSL / AreaMap `m`; deterministic, DOM-free.
//
// Fairness rules the helpers keep (m5-contracts): nothing a player can stand on 42-62 above
// a floor the horde can't follow. Tall prop tops are 64+ above anything near them, or they
// slope (merlon caps, parapet tops, rock spires, tarps) so nobody stands there at all.
import { Brush, planeFromPoints, resolveTex } from '../brush.js';
import { playerClip } from '../kit.js';
import { SIGNS, PAINT } from '../../assets/tex/fortember.js';

export const T = {
  adobe: 'fe_adobe', stone: 'fe_stone', rock: 'fe_rock', sand: 'fe_sand', flag: 'fe_flagstone',
  timber: 'fe_timber', mud: 'fe_mudbrick', canvas: 'fe_canvas', wreck: 'fe_wreck', bags: 'fe_sandbag',
  glow: 'fe_glow', hardpan: 'fe_hardpan', pad: 'fe_helipad', planks: 'wood_planks', crate: 'crate',
  door: 'door', iron: 'metal_rust', sign: 'fe_sign',
};

/**
 * A flat colour from fe_sign's paint cells ('white', 'black', 'yellow', 'red', 'soot', 'glass',
 * 'rubber', 'olive'): a scale so large every face samples one texel, offset onto the cell.
 */
export function paint(name) {
  const [cx, cy] = PAINT[name];
  return { name: T.sign, scale: [1e5, 1e5], offset: [cx, cy - 256] };
}

/**
 * The texture spec that maps atlas cell `key` (SIGNS in tex/fortember.js) onto a face looking
 * `face` ('n'|'s'|'e'|'w') that spans u0..u1 along it (x for n/s, y for e/w) and z0..z1.
 * World-aligned (textureAxes): n/s faces run s along x, e/w along y, t down z; seen from the
 * front, n and w faces run s right-to-left, so the cell is mirrored onto them.
 */
export function cellSpec(key, face, u0, u1, z0, z1) {
  const [, x0, y0, x1, y1] = SIGNS[key];
  const flip = face === 'n' || face === 'w';
  const su = (flip ? -1 : 1) * (u1 - u0) / (x1 - x0), sv = (z1 - z0) / (y1 - y0);
  return { name: T.sign, scale: [su, sv], offset: [x0 - (flip ? u1 : u0) / su, z0 / sv - 256 + y1] };
}

/**
 * A sign: atlas cell `key` on a plaque `depth` thick standing on a wall plane. face: the way it
 * looks; plane: the wall's y (n/s) or x (e/w); u0..u1 along the wall, z0..z1. Plaques have no
 * collision (o.solid gives them some). o: { depth (2), gap (0: off the wall), back (timber),
 * decal: a see-through painted mark on the wall itself (no plaque, no collision, no shadow) }
 */
export function sign(m, key, face, plane, u0, u1, z0, z1, o = {}) {
  const d = o.depth ?? (o.decal ? 1 : 2), g = o.gap ?? (o.decal ? 0.5 : 0);
  const front = cellSpec(key, face, u0, u1, z0, z1);
  const spec = o.decal ? { all: null, [face]: front } : { all: o.back || T.timber, [face]: front };
  const opts = o.decal ? { contents: 0, name: 'graffiti' } : { name: 'sign', contents: o.solid ? undefined : 0 };
  let b;
  if (face === 'n') b = prop(m, u0, plane + g, z0, u1, plane + g + d, z1, spec, opts);
  else if (face === 's') b = prop(m, u0, plane - g - d, z0, u1, plane - g, z1, spec, opts);
  else if (face === 'e') b = prop(m, plane + g, u0, z0, plane + g + d, u1, z1, spec, opts);
  else b = prop(m, plane - g - d, u0, z0, plane - g, u1, z1, spec, opts);
  if (o.decal) b.castShadow = false;
  return b;
}

/**
 * A free-standing signpost at (x, y) on z: a post and boards (atlas keys, top one first) facing
 * `face`, w wide, stacked down from 120 up. The boards have no collision; the post is thin.
 */
export function signpost(m, keys, x, y, z, face, w = 104) {
  const ns = face === 'n' || face === 's';
  const p = ns ? y + (face === 'n' ? 4 : -4) : x + (face === 'e' ? 4 : -4), c = ns ? x : y;
  let top = z + 120;
  prop(m, x - 4, y - 4, z, x + 4, y + 4, top + 12, T.timber, { surface: 'wood', name: 'signpost' });
  for (const key of keys) {
    const [, x0, y0, x1, y1] = SIGNS[key], hh = Math.round(w * (y1 - y0) / (x1 - x0));
    sign(m, key, face, p, c - w / 2, c + w / 2, top - hh, top, { depth: 3 });
    top -= hh + 4;
  }
}

// warm light colours
export const FIRE = [1.0, 0.56, 0.22];
export const LANTERN = [1.0, 0.72, 0.42];
export const WORKLAMP = [1.0, 0.86, 0.62];

const D = { detail: true };
const along = (axis, u0, u1, t0, t1) => (axis === 'x' ? [u0, t0, u1, t1] : [t0, u0, t1, u1]);

/** A box from (x0, y0, z0) to (x1, y1, z1) as a detail brush (props: they don't cut the world). */
export function prop(m, x0, y0, z0, x1, y1, z1, tex, opts = {}) {
  return m.box(x0, y0, z0, x1, y1, z1, typeof tex === 'string' ? { all: tex } : tex, { ...D, ...opts });
}

/**
 * A crenellated parapet on a wall walk at height z, along `axis` from a0 to a1, t0..t1 thick;
 * `out` = +1 when the outer side is +t, -1 when it is -t. The parapet's top slopes outward
 * (38 -> 20: too steep to stand on, so nobody perches in the crenels) and the merlons have
 * pointed caps. o: { tex, pitch (96), merlon (48), skip: [[u0, u1], ...] (no merlons there) }
 */
export function battlement(m, axis, a0, a1, t0, t1, z, out, o = {}) {
  const tex = o.tex || T.adobe, pitch = o.pitch ?? 96, mw = o.merlon ?? 48;
  const tIn = out > 0 ? t0 : t1, tOut = out > 0 ? t1 : t0;
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  const k = { all: tex };
  m.prism(axis, [[tIn, z], [tOut, z], [tOut, z + 20], [tIn, z + 38]], lo, hi, k, { name: 'parapet' });
  if (o.merlons === false) return;
  const n = Math.floor((hi - lo + pitch - mw) / pitch);
  const off = lo + (hi - lo - (n - 1) * pitch) / 2;
  const tAx = axis === 'x' ? 'y' : 'x';
  for (let i = 0; i < n; i++) {
    const c = off + i * pitch, u0 = c - mw / 2, u1 = c + mw / 2;
    if (o.skip?.some(([s0, s1]) => u1 > s0 && u0 < s1)) continue;
    const [x0, y0, x1, y1] = along(axis, u0, u1, Math.min(t0, t1), Math.max(t0, t1));
    m.box(x0, y0, z, x1, y1, z + 86, k, { name: 'merlon' });
    m.prism(tAx, [[u0, z + 86], [u1, z + 86], [c, z + 116]], Math.min(t0, t1), Math.max(t0, t1), k, { name: 'merlon' });
  }
}

/** A low parapet (38, sloped top) without merlons: roof edges, inner sides of tower tops. */
export function parapet(m, axis, a0, a1, t0, t1, z, out, tex = T.adobe) {
  battlement(m, axis, a0, a1, t0, t1, z, out, { tex, merlons: false });
}

/**
 * A battered (sloping) wall foot along a wall face: a steep wedge h tall sticking out d at the
 * ground (not standable). axis: the wall's direction; face: the wall plane's coordinate; out: +1 / -1.
 */
export function batter(m, axis, a0, a1, face, out, z, h = 72, d = 20, tex = T.stone) {
  const pts = [[face, z], [face + out * d, z], [face, z + h]];
  m.prism(axis, pts, Math.min(a0, a1), Math.max(a0, a1), { all: tex }, { name: 'batter' });
}

/** A horizontal beam (timber), x0..x1 / y0..y1 / z0..z1 (detail). */
export function beam(m, x0, y0, z0, x1, y1, z1, tex = T.timber) {
  return prop(m, x0, y0, z0, x1, y1, z1, tex, { surface: 'wood', name: 'beam' });
}

/**
 * A door frame around a gap in a wall: two jambs and a lintel standing proud of both faces by
 * `proud`, of tex. axis: the wall's direction; c, w: the gap; t0..t1: the wall's thickness; z..z+h: the opening.
 */
export function doorFrame(m, axis, c, w, t0, t1, z, h, tex = T.timber, proud = 4, jw = 8) {
  const a = Math.min(t0, t1) - proud, b = Math.max(t0, t1) + proud;
  const box = (u0, u1, z0, z1) => { const [x0, y0, x1, y1] = along(axis, u0, u1, a, b); prop(m, x0, y0, z0, x1, y1, z1, tex, { surface: 'wood', name: 'frame', contents: 0 }); };
  box(c - w / 2 - jw, c - w / 2, z, z + h);
  box(c + w / 2, c + w / 2 + jw, z, z + h);
  box(c - w / 2 - jw, c + w / 2 + jw, z + h, z + h + 10);
}

/**
 * A window with a frame, a sill and two shutters swung open against the outer wall face.
 * axis: the wall's direction; c, w: the window; face: outer wall plane; out: +1 / -1 (outward);
 * z0..z1: the opening. Shutters are thin detail slabs (no collision worth standing on).
 */
export function shutteredWindow(m, axis, c, w, face, out, z0, z1, t = 16) {
  const f0 = face - out * t, f1 = face;
  doorFrame(m, axis, c, w, f0, f1, z0, z1 - z0, T.timber, 3, 6);
  // sill
  { const [x0, y0, x1, y1] = along(axis, c - w / 2 - 8, c + w / 2 + 8, Math.min(f0, f1 + out * 8) - 2, Math.max(f0, f1 + out * 8) + 2); prop(m, x0, y0, z0 - 6, x1, y1, z0, T.timber, { surface: 'wood', contents: 0 }); }
  // shutters: open, flat against the wall either side
  for (const s of [-1, 1]) {
    const u0 = s < 0 ? c - w / 2 - 6 - w / 2 : c + w / 2 + 6, u1 = u0 + w / 2;
    const a = Math.min(face, face + out * 3), b = Math.max(face, face + out * 3);
    const [x0, y0, x1, y1] = along(axis, u0, u1, a, b);
    prop(m, x0, y0, z0 + 2, x1, y1, z1 - 2, { all: T.timber, n: T.door, s: T.door, e: T.door, w: T.door }, { surface: 'wood', name: 'shutter', contents: 0 });
  }
}

/**
 * A door leaf standing open: a thin slab hinged at (hx, hy), w wide, rotated by ang (degrees,
 * 0 = along +x), z..z+h. Detail (it doesn't cut the world); a doorway prop.
 */
export function doorLeaf(m, hx, hy, z, w, h, ang, t = 6, tex = T.door) {
  const a = ang * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy * t / 2, ny = ux * t / 2;
  const pts = [[hx - nx, hy - ny], [hx + ux * w - nx, hy + uy * w - ny], [hx + ux * w + nx, hy + uy * w + ny], [hx + nx, hy + ny]];
  return m.prism('z', pts, z, z + h, { all: T.timber, sides: { name: tex, fit: true } }, { ...D, surface: 'wood', name: 'door' });
}

/** A brazier: an iron bowl on a stand (40 tall: anyone can hop on), glowing coals, a fire light. */
export function brazier(m, x, y, z, o = {}) {
  const r = o.r ?? 18;
  prop(m, x - 4, y - 4, z, x + 4, y + 4, z + 24, T.iron, { surface: 'metal' });
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  m.prism('z', pts, z + 24, z + 36, { all: T.iron }, { ...D, surface: 'metal', name: 'brazier' });
  // the coals and a low flame: self-lit, no collision
  const c = pts.map(([px, py]) => [x + (px - x) * 0.8, y + (py - y) * 0.8]);
  const b = m.prism('z', c, z + 36, z + 40, { all: T.glow }, { ...D, contents: 0, name: 'coals' });
  b.fullbright = true; b.castShadow = false;
  flame(m, x, y, z + 40, o.flame ?? 22, r * 0.6);
  m.light(x, y, z + 72, o.color || FIRE, o.intensity ?? 1.0, o.radius ?? 420);
}

/**
 * A flame: a ragged crown of thin self-lit tongues - a tall one in the middle, shorter ones round
 * it leaning out at different angles (no collision, no shadow). Deterministic per position.
 */
export function flame(m, x, y, z, h = 24, r = 10) {
  let s = (Math.round(x * 7 + y * 13) >>> 0) || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const n = r > 14 ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.6, d = i === 0 ? 0 : r * (0.35 + rnd() * 0.45);
    const bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d;
    const k = i === 0 ? 1 : 0.4 + rnd() * 0.45, w = r * (i === 0 ? 0.55 : 0.3 + rnd() * 0.2);
    const fa = rnd() * Math.PI, ux = Math.cos(fa), uy = Math.sin(fa), nx = -uy * 0.7, ny = ux * 0.7;
    const lean = i === 0 ? 0.15 : 0.5;
    const tx = bx + Math.cos(a) * r * lean, ty = by + Math.sin(a) * r * lean, th = z + h * k;
    const b = hull(m, [
      [bx - ux * w - nx, by - uy * w - ny, z], [bx + ux * w - nx, by + uy * w - ny, z], [tx - nx, ty - ny, th],
      [bx - ux * w + nx, by - uy * w + ny, z], [bx + ux * w + nx, by + uy * w + ny, z], [tx + nx, ty + ny, th],
    ], T.glow, { ...D, contents: 0, name: 'flame' });
    b.fullbright = true; b.castShadow = false;
  }
}

/**
 * A wall torch: an iron bracket on a wall at (x, y) facing `face` ('n','s','e','w'), its flame
 * at z, and a fire light in front of it.
 */
export function torch(m, x, y, z, face, o = {}) {
  const d = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[face];
  const px = x + d[0] * 14, py = y + d[1] * 14;
  prop(m, Math.min(x, px) - 2, Math.min(y, py) - 2, z - 14, Math.max(x, px) + 2, Math.max(y, py) + 2, z - 10, T.iron, { contents: 0 });
  prop(m, px - 4, py - 4, z - 12, px + 4, py + 4, z, T.iron, { contents: 0 });
  flame(m, px, py, z, 16, 6);
  m.light(px + d[0] * 12, py + d[1] * 12, z + 14, o.color || FIRE, o.intensity ?? 0.8, o.radius ?? 320);
}

/** A hanging lantern under a beam / ceiling at z (its top): a small self-lit box and a light. */
export function lantern(m, x, y, z, o = {}) {
  prop(m, x - 1, y - 1, z - 10, x + 1, y + 1, z, T.iron, { contents: 0 });
  const b = prop(m, x - 5, y - 5, z - 24, x + 5, y + 5, z - 10, T.glow, { contents: 0 });
  b.fullbright = true; b.castShadow = false;
  prop(m, x - 6, y - 6, z - 12, x + 6, y + 6, z - 10, T.iron, { contents: 0 });
  m.light(x, y, z - 34, o.color || LANTERN, o.intensity ?? 0.85, o.radius ?? 340);
}

/**
 * A burnt-out truck along `axis` ('x' | 'y'), its nose toward +axis when dir = 1, centred at
 * x, y on the floor z. Bed and cab tops are 64+ above the bonnet and the wheels (no perches);
 * the bonnet sits at 38 (hop on, hop off). o: { len: 224, tarp: true }
 */
export function truck(m, x, y, z, axis = 'x', dir = 1, o = {}) {
  const L = o.len ?? 224, W = 88;
  const box = (u0, u1, v0, v1, z0, z1, tex, opts = {}) => {
    const a0 = dir > 0 ? u0 : -u1, a1 = dir > 0 ? u1 : -u0;
    if (axis === 'x') m.box(x + a0, y + v0, z + z0, x + a1, y + v1, z + z1, typeof tex === 'string' ? { all: tex } : tex, { surface: 'metal', name: 'truck', ...opts });
    else m.box(x + v0, y + a0, z + z0, x + v1, y + a1, z + z1, typeof tex === 'string' ? { all: tex } : tex, { surface: 'metal', name: 'truck', ...opts });
  };
  const h = L / 2;
  const nc = { ...D, contents: 0 };
  // wheels (flat, the tyres burnt down to the rubber's char), iron hubs: 4 + 2 rear
  for (const u of [-h + 28, -h + 76, h - 40]) for (const s of [-1, 1]) {
    box(u - 18, u + 18, s > 0 ? W / 2 - 14 : -W / 2, s > 0 ? W / 2 : -W / 2 + 14, 0, 26, { all: paint('rubber') }, D);
    box(u - 7, u + 7, s > 0 ? W / 2 : -W / 2 - 2, s > 0 ? W / 2 + 2 : -W / 2, 6, 20, T.iron, nc);
  }
  // chassis
  box(-h + 8, h - 8, -W / 2 + 14, W / 2 - 14, 14, 30, T.wreck);
  // bonnet (38 high: a hop) and grille, a bumper and the headlamps' empty sockets
  box(h - 64, h, -W / 2 + 6, W / 2 - 6, 14, 38, T.wreck);
  box(h, h + 4, -W / 2 + 2, W / 2 - 2, 12, 20, T.iron, D);
  for (const s of [-1, 1]) box(h, h + 2, s * 26 - 6, s * 26 + 6, 26, 34, { all: paint('glass') }, nc);
  // cab: 112 high, dark glass in its sides, a steep windscreen wedge in front
  box(h - 112, h - 64, -W / 2 + 4, W / 2 - 4, 14, 112, T.wreck);
  for (const s of [-1, 1]) box(h - 104, h - 72, s > 0 ? W / 2 - 4 : -W / 2 + 3, s > 0 ? W / 2 - 3 : -W / 2 + 4, 70, 104, { all: paint('glass') }, nc);
  const fw = h - 64;
  const wedge = dir > 0
    ? [[fw, 66], [fw + 22, 66], [fw, 112]]
    : [[-fw - 22, 66], [-fw, 66], [-fw, 112]];
  const front = axis === 'x' ? (dir > 0 ? 'e' : 'w') : (dir > 0 ? 'n' : 's');
  const ws = { all: T.wreck, [front]: paint('glass') };
  if (axis === 'x') m.prism('y', wedge.map(([u, zz]) => [x + u, z + zz]), y - W / 2 + 6, y + W / 2 - 6, ws, { surface: 'metal', name: 'truck' });
  else m.prism('x', wedge.map(([u, zz]) => [y + u, z + zz]), x - W / 2 + 6, x + W / 2 - 6, ws, { surface: 'metal', name: 'truck' });
  // bed: sides 104 high (from the bonnet that's 66: no perch), a tarp ridge on top
  const b0 = -h + 4, b1 = h - 118;
  box(b0, b1, -W / 2, W / 2, 30, 104, { all: T.wreck, top: o.tarp === false ? T.wreck : T.canvas });
  if (o.tarp !== false) {
    const tp = [[-W / 2, z + 104], [W / 2, z + 104], [0, z + 136]];
    const a0 = dir > 0 ? b0 : -b1, a1 = dir > 0 ? b1 : -b0;
    if (axis === 'x') m.prism('x', tp.map(([v, zz]) => [y + v, zz]), x + a0, x + a1, { all: T.canvas }, { name: 'tarp' });
    else m.prism('y', tp.map(([v, zz]) => [x + v, zz]), y + a0, y + a1, { all: T.canvas }, { name: 'tarp' });
  }
}

/** A burnt jeep (small; 64 tall bodywork with a steep windscreen, no roof to stand on). */
export function jeep(m, x, y, z, axis = 'x', dir = 1) {
  const L = 144, W = 72, h = L / 2;
  const box = (u0, u1, v0, v1, z0, z1, tex, opts = {}) => {
    const a0 = dir > 0 ? u0 : -u1, a1 = dir > 0 ? u1 : -u0;
    if (axis === 'x') m.box(x + a0, y + v0, z + z0, x + a1, y + v1, z + z1, { all: tex }, { surface: 'metal', name: 'jeep', ...opts });
    else m.box(x + v0, y + a0, z + z0, x + v1, y + a1, z + z1, { all: tex }, { surface: 'metal', name: 'jeep', ...opts });
  };
  for (const u of [-h + 24, h - 26]) for (const s of [-1, 1]) box(u - 16, u + 16, s > 0 ? W / 2 - 12 : -W / 2, s > 0 ? W / 2 : -W / 2 + 12, 0, 24, paint('rubber'), D);
  box(-h, h, -W / 2 + 6, W / 2 - 6, 12, 38, T.wreck);
  // seats / roll bar: thin, high (not a platform); a cracked windscreen frame
  box(-h + 20, -h + 26, -W / 2 + 6, W / 2 - 6, 38, 112, T.iron, D);
  box(10, 14, -W / 2 + 6, W / 2 - 6, 38, 112, T.wreck, D);
  box(14, 15, -W / 2 + 10, W / 2 - 10, 46, 100, paint('glass'), { ...D, contents: 0 });
  box(-h + 30, -h + 60, -W / 2 + 10, W / 2 - 10, 38, 50, T.canvas, { ...D, contents: 0 });
  // nobody stands on it (the bars would snag the horde on the way over): clipped above the body
  if (axis === 'x') clipRoof(m, x - h, y - W / 2, x + h, y + W / 2, z + 38);
  else clipRoof(m, x - W / 2, y - h, x + W / 2, y + h, z + 38);
}

/**
 * A market stall: a counter 32 high (front), four posts and a steep canvas awning whose low
 * edge is 104+ up (no perch from the counter), facing `face` ('n','s','e','w').
 */
export function stall(m, x0, y0, x1, y1, z, face, o = {}) {
  const post = T.timber, canvas = o.canvas || T.canvas;
  const P = 6;
  for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) prop(m, px - P, py - P, z, px + P, py + P, z + 128, post, { surface: 'wood', contents: 0 });
  // counter along the open face, crates at the back
  const cd = 24;
  if (face === 's') prop(m, x0 + P, y0, z, x1 - P, y0 + cd, z + 32, T.planks, { surface: 'wood' });
  if (face === 'n') prop(m, x0 + P, y1 - cd, z, x1 - P, y1, z + 32, T.planks, { surface: 'wood' });
  if (face === 'w') prop(m, x0, y0 + P, z, x0 + cd, y1 - P, z + 32, T.planks, { surface: 'wood' });
  if (face === 'e') prop(m, x1 - cd, y0 + P, z, x1, y1 - P, z + 32, T.planks, { surface: 'wood' });
  // awning: a slab sloping down toward the open face, low edge at 108, high edge at 152
  const lo = z + 108, hi = z + 152, t = 4;
  if (face === 's' || face === 'n') {
    const yf = face === 's' ? y0 - 20 : y1 + 20, yb = face === 's' ? y1 : y0;
    m.prism('x', [[yf, lo], [yb, hi], [yb, hi + t], [yf, lo + t]], x0 - 10, x1 + 10, { all: canvas }, { ...D, contents: 0, name: 'awning' });
  } else {
    const xf = face === 'w' ? x0 - 20 : x1 + 20, xb = face === 'w' ? x1 : x0;
    m.prism('y', [[xf, lo], [xb, hi], [xb, hi + t], [xf, lo + t]], y0 - 10, y1 + 10, { all: canvas }, { ...D, contents: 0, name: 'awning' });
  }
}

/** A sandbag wall (36 high: shoot over it, hop over it) from (x0, y0) to (x1, y1), axis-aligned, 24 deep. */
export function sandbags(m, x0, y0, x1, y1, z, h = 36) {
  return m.box(Math.min(x0, x1), Math.min(y0, y1), z, Math.max(x0, x1), Math.max(y0, y1), z + h, { all: T.bags }, { surface: 'dirt', name: 'sandbags', detail: true });
}

/**
 * Rubble: a low heap of tumbled blocks around (x, y), deterministic by seed, at most maxH up
 * (16 or less: a step, so nobody snags on them in a doorway or a breach).
 */
export function rubble(m, x, y, z, r, seed = 1, tex = T.adobe, maxH = 22) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const n = Math.max(3, Math.round(r / 18));
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.8;
    const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d;
    const sx = 10 + rnd() * 16, sy = 8 + rnd() * 14, h = 6 + rnd() * (maxH - 6);
    const rot = rnd() * Math.PI;
    const c = Math.cos(rot), si = Math.sin(rot);
    const pts = [[-sx, -sy], [sx, -sy], [sx, sy], [-sx, sy]].map(([u, v]) => [cx + u * c - v * si, cy + u * si + v * c]);
    m.prism('z', pts, z, z + h, { all: tex }, { ...D, name: 'rubble' });
  }
}

/**
 * A radio mast: a square lattice tower s wide from z to z + h (4 legs, cross braces every 64),
 * a red beacon on top. No collision above 128 (nobody climbs it), solid legs below.
 */
export function mast(m, x, y, z, h, s = 32, o = {}) {
  const leg = 4;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const lx = x + dx * s / 2, ly = y + dy * s / 2;
    prop(m, lx - leg / 2, ly - leg / 2, z, lx + leg / 2, ly + leg / 2, z + h, T.iron, { surface: 'metal', name: 'mast' });
  }
  for (let zz = z + 64; zz < z + h - 8; zz += 64) {
    const opts = zz > z + 128 ? { contents: 0 } : {};
    prop(m, x - s / 2, y - s / 2 - 1, zz, x + s / 2, y - s / 2 + 1, zz + 3, T.iron, opts);
    prop(m, x - s / 2, y + s / 2 - 1, zz, x + s / 2, y + s / 2 + 1, zz + 3, T.iron, opts);
    prop(m, x - s / 2 - 1, y - s / 2, zz, x - s / 2 + 1, y + s / 2, zz + 3, T.iron, opts);
    prop(m, x + s / 2 - 1, y - s / 2, zz, x + s / 2 + 1, y + s / 2, zz + 3, T.iron, opts);
  }
  // diagonal braces (thin prisms, no collision)
  for (let zz = z; zz < z + h - 64; zz += 64) {
    for (const side of [0, 1, 2, 3]) {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const p = c[side], q = c[(side + 1) % 4];
      const ax = p[0] === q[0] ? 'x' : 'y';
      const f = ax === 'x' ? x + p[0] * s / 2 : y + p[1] * s / 2;
      const u0 = ax === 'x' ? y + p[1] * s / 2 : x + p[0] * s / 2, u1 = ax === 'x' ? y + q[1] * s / 2 : x + q[0] * s / 2;
      const pts = [[u0, zz], [u0, zz + 4], [u1, zz + 64], [u1, zz + 60]];
      m.prism(ax, pts, f - 1, f + 1, { all: T.iron }, { ...D, contents: 0, name: 'brace' });
    }
  }
  const b = prop(m, x - 5, y - 5, z + h, x + 5, y + 5, z + h + 10, o.beacon || T.glow, { contents: 0 });
  b.fullbright = true; b.castShadow = false;
}

/**
 * A rock spire / boulder: a vertical prism over the convex outline pts ([[x, y], ...]) from z0
 * to z1, topped by a steep pyramid cap `peak` high (nobody stands on it).
 */
export function rockSpire(m, pts, z0, z1, peak = 64, tex = T.rock) {
  m.prism('z', pts, z0, z1, { all: tex }, { name: 'rock' });
  pyramid(m, pts, z1, peak, tex);
}

/** A pyramid over the convex outline pts at height z, its apex `peak` above the outline's centre. */
export function pyramid(m, pts, z, peak, tex = T.rock, opts = {}) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  const apex = [cx, cy, z + peak], ctr = [cx, cy, z + peak * 0.25];
  const planes = [planeOut([pts[0][0], pts[0][1], z], [pts[1][0], pts[1][1], z], [pts[2][0], pts[2][1], z], ctr, tex)];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    planes.push(planeOut([a[0], a[1], z], [b[0], b[1], z], apex, ctr, tex));
  }
  return m.add(new Brush(planes, { name: 'rock', ...opts }));
}

/** A plane through a, b, c facing away from `inside` (brush.js plane format). */
export function planeOut(a, b, c, inside, tex) {
  const p = planeFromPoints(a, b, c, tex);
  if (p.n[0] * inside[0] + p.n[1] * inside[1] + p.n[2] * inside[2] > p.d) { p.n = p.n.map((k) => -k); p.d = -p.d; }
  return p;
}

/**
 * A square post 2r wide from (ax, ay, az) up to (bx, by, bz): a box sheared so that its top
 * square sits over (bx, by).
 */
export function shearedBox(m, ax, ay, az, bx, by, bz, r, tex, opts = {}) {
  const c = [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2];
  const base = [[ax - r, ay - r, az], [ax + r, ay - r, az], [ax + r, ay + r, az], [ax - r, ay + r, az]];
  const top = base.map(([px, py]) => [px + bx - ax, py + by - ay, bz]);
  const planes = [planeOut(base[0], base[1], base[2], c, tex), planeOut(top[0], top[1], top[2], c, tex)];
  for (let i = 0; i < 4; i++) planes.push(planeOut(base[i], base[(i + 1) % 4], top[i], c, tex));
  return m.add(new Brush(planes, opts));
}

/** A dead tree: a leaning trunk and a few bare branches (thin; only the trunk's foot collides). */
export function deadTree(m, x, y, z, h = 160, seed = 1) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const lean = (rnd() - 0.5) * 0.35, la = rnd() * Math.PI * 2;
  const tx = x + Math.cos(la) * lean * h, ty = y + Math.sin(la) * lean * h;
  // the solid foot of the trunk is 120 tall (out of reach, even from a crate); the rest is see-through to the hull
  const f = 120 / h, mx = x + (tx - x) * f, my = y + (ty - y) * f;
  shearedBox(m, x, y, z, mx, my, z + 120, 7, T.timber, { surface: 'wood', name: 'tree' });
  shearedBox(m, mx, my, z + 120, tx, ty, z + h, 5, T.timber, { ...D, contents: 0, surface: 'wood', name: 'tree' });
  const nb = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < nb; i++) {
    const f = 0.45 + rnd() * 0.5;
    const bx = x + (tx - x) * f, by = y + (ty - y) * f, bz = z + h * f;
    const a = rnd() * Math.PI * 2, l = 36 + rnd() * 48;
    shearedBox(m, bx, by, bz, bx + Math.cos(a) * l, by + Math.sin(a) * l, bz + 20 + rnd() * 36, 2.5, T.timber, { ...D, contents: 0, surface: 'wood', name: 'branch' });
  }
}

/** A flat roof nobody should stand on: a player clip from its top to 1600 (bullets pass). */
export function clipRoof(m, x0, y0, x1, y1, z) {
  return playerClip(m, x0, y0, z, x1, y1, 1600);
}

/**
 * A convex brush around a cloud of points ([[x, y, z], ...], up to ~20): every face plane of their
 * convex hull (brute force over point triples). tex: a name or a keyed spec ({ all, top, sides... }).
 */
export function hull(m, pts, tex, opts = {}) {
  const n = pts.length, planes = [];
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const a = pts[i], b = pts[j], d = pts[k];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-6) continue;
    nx /= l; ny /= l; nz /= l;
    let dd = nx * a[0] + ny * a[1] + nz * a[2];
    if (nx * c[0] + ny * c[1] + nz * c[2] > dd) { nx = -nx; ny = -ny; nz = -nz; dd = -dd; }
    let ok = true;
    for (const p of pts) if (nx * p[0] + ny * p[1] + nz * p[2] - dd > 0.01) { ok = false; break; }
    if (!ok || planes.some((q) => q.n[0] * nx + q.n[1] * ny + q.n[2] * nz > 0.9999 && Math.abs(q.d - dd) < 0.05)) continue;
    const nn = [nx, ny, nz];
    planes.push({ n: nn, d: dd, tex: resolveTex(typeof tex === 'string' ? { all: tex } : tex, nn) });
  }
  return m.add(new Brush(planes, opts));
}

/**
 * A rough boulder on z, deterministic by seed. Low ones (rz <= 40: hop on) are a hull of jittered
 * points on a half-ellipsoid; tall ones (rz >= 80) have steep sides up to 70+ and only then a
 * rounded cap, so there is no shoulder to crouch-jump onto.
 */
export function boulder(m, x, y, z, rx, ry, rz, seed = 1, tex = T.rock, k = 12) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pts = [];
  if (rz <= 40) {
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + rnd() * 0.5, e = (rnd() * 0.9 - 0.1) * Math.PI / 2;
      const f = 0.8 + rnd() * 0.3;
      pts.push([x + Math.cos(a) * Math.cos(e) * rx * f, y + Math.sin(a) * Math.cos(e) * ry * f, z - 8 + Math.max(0, Math.sin(e)) * rz * f]);
    }
  } else {
    const zm = z + Math.max(104, rz * 0.72);
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + rnd() * 0.4, f = 0.85 + rnd() * 0.25;
      pts.push([x + Math.cos(a) * rx * f, y + Math.sin(a) * ry * f, z - 8]);
      const g = f * (0.8 + rnd() * 0.12);
      pts.push([x + Math.cos(a + 0.2) * rx * g, y + Math.sin(a + 0.2) * ry * g, zm + rnd() * 10]);
    }
    for (let i = 0; i < 4; i++) { const a = rnd() * Math.PI * 2; pts.push([x + Math.cos(a) * rx * 0.4, y + Math.sin(a) * ry * 0.4, z + rz * (0.85 + rnd() * 0.1)]); }
  }
  pts.push([x + (rnd() - 0.5) * rx * 0.3, y + (rnd() - 0.5) * ry * 0.3, z - 8 + rz]);
  // a tall one is clipped above its shoulder: nobody lands on it from a cliff above
  if (rz > 40) clipRoof(m, x - rx * 1.2, y - ry * 1.2, x + rx * 1.2, y + ry * 1.2, z + 100);
  return hull(m, pts, tex, { name: 'boulder' });
}
