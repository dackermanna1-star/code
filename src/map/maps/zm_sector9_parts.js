// Sector 9 (zm_sector9): props and fittings built from convex brushes - railings, door
// frames, signs (cells of the s9_sign atlas mapped onto a plaque), lamps, pipes, lab benches,
// server racks, tables, supply cases, the specimen tank, vehicles. DOM-free, deterministic.
//
// Heights follow the fairness rule: a prop top is at most 40 above whatever it stands on
// (both sides can jump it) or 64+ (nobody can, or the horde can climb to it in 40 steps).
import { lamp, glass, playerClip } from '../kit.js';
import { signRect } from '../../assets/tex/sector9.js';
import { T } from './zm_sector9_layout.js';

const D = { detail: true };

/** A box helper with the detail flag (props never cut the world's faces). */
export function prop(m, x0, y0, z0, x1, y1, z1, tex, o = {}) {
  return m.box(x0, y0, z0, x1, y1, z1, typeof tex === 'string' ? { all: tex } : tex, { ...D, ...o });
}

/**
 * A railing from (x0, y0) to (x1, y1) (axis-aligned) on the floor z: a top rail at h, a mid
 * rail, posts every ~96. o: { h: 40, tex, posts: true, kick: false (a 6 high toe board) }.
 */
export function rail(m, x0, y0, x1, y1, z, o = {}) {
  const h = o.h ?? 40, tex = o.tex || T.metal, t = 2;
  const alongX = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  const a0 = alongX ? Math.min(x0, x1) : Math.min(y0, y1), a1 = alongX ? Math.max(x0, x1) : Math.max(y0, y1);
  const c = alongX ? y0 : x0;
  const seg = (u0, u1, za, zb, w = t) => (alongX ? prop(m, u0, c - w, za, u1, c + w, zb, tex, { surface: 'metal', name: 'rail' }) : prop(m, c - w, u0, za, c + w, u1, zb, tex, { surface: 'metal', name: 'rail' }));
  seg(a0, a1, z + h - 4, z + h);
  seg(a0, a1, z + h / 2 - 2, z + h / 2 + 1, 1.5);
  // an invisible clip on top to 76: nobody stands on (or vaults) a rail - no perch the horde can't follow
  if (alongX) m.clip(a0, c - 2.5, z + h, a1, c + 2.5, z + 76); else m.clip(c - 2.5, a0, z + h, c + 2.5, a1, z + 76);
  if (o.kick) seg(a0, a1, z, z + 6, 1);
  if (o.posts !== false) {
    const n = Math.max(1, Math.round((a1 - a0) / 96));
    for (let k = 0; k <= n; k++) { const u = a0 + (a1 - a0) * k / n; seg(Math.max(a0, u - 2), Math.min(a1, u + 2), z, z + h - 4, 2); }
  }
}

/**
 * An open steel stair (treads on two stringers, open underneath) rising toward dir from zLow
 * at one end to zHigh at the other: steps of (zHigh - zLow) / steps. The first two treads are
 * solid to the floor (so nothing slips under the low end).
 */
export function openStairs(m, x0, y0, x1, y1, zLow, zHigh, dir, steps) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const along = dir === 'n' || dir === 's';
  const run = along ? yb - ya : xb - xa;
  for (let i = 0; i < steps; i++) {
    const z = zLow + (zHigh - zLow) * (i + 1) / steps, f0 = i / steps, f1 = (i + 1) / steps;
    const zb = i < 2 ? zLow : z - 6;
    let bx0 = xa, bx1 = xb, by0 = ya, by1 = yb;
    if (dir === 'n') { by0 = ya + run * f0; by1 = ya + run * f1; }
    if (dir === 's') { by1 = yb - run * f0; by0 = yb - run * f1; }
    if (dir === 'e') { bx0 = xa + run * f0; bx1 = xa + run * f1; }
    if (dir === 'w') { bx1 = xb - run * f0; bx0 = xb - run * f1; }
    m.box(bx0, by0, zb, bx1, by1, z, { all: T.metal, top: T.grate }, { surface: 'metal', name: 'tread' });
  }
  // stringers: sloped plates on both sides (visual, the treads carry you)
  const lo = dir === 'n' ? ya : dir === 's' ? yb : dir === 'e' ? xa : xb, hi = dir === 'n' ? yb : dir === 's' ? ya : dir === 'e' ? xb : xa;
  for (const c of along ? [xa, xb - 4] : [ya, yb - 4]) {
    const pts = [[lo, zLow], [hi, zHigh - 16], [hi, zHigh], [lo, zLow + 16]];
    m.prism(along ? 'x' : 'y', pts, c, c + 4, { all: T.metal }, { ...D, surface: 'metal', name: 'stringer', contents: 0 });
  }
  // nobody walks (or gets wedged) under it: an invisible wedge under the treads
  const [c0, c1] = along ? [xa, xb] : [ya, yb];
  m.prism(along ? 'x' : 'y', [[lo, zLow], [hi, zLow], [hi, zHigh - 6]], c0, c1, { all: null }, { contents: 2, visible: false, castShadow: false, name: 'clip' });
}

/** A sloped stair rail: from (xa, ya, za) to (xb, yb, zb) along one axis, h above the steps. Visual only (a sloped solid rail top would be a perch). */
export function stairRail(m, xa, ya, za, xb, yb, zb, h = 40) {
  const alongX = Math.abs(xb - xa) >= Math.abs(ya - yb);
  const tex = { all: T.metal };
  if (alongX) {
    const y = ya;
    m.prism('y', [[xa, za + h - 4], [xb, zb + h - 4], [xb, zb + h], [xa, za + h]], y - 2, y + 2, tex, { ...D, surface: 'metal', name: 'rail', contents: 0 });
    for (const [x, z] of [[xa, za], [(xa + xb) / 2, (za + zb) / 2], [xb, zb]]) prop(m, x - 2, y - 2, z - 8, x + 2, y + 2, z + h - 2, T.metal, { name: 'rail', contents: 0 });
  } else {
    const x = xa;
    m.prism('x', [[ya, za + h - 4], [yb, zb + h - 4], [yb, zb + h], [ya, za + h]], x - 2, x + 2, tex, { ...D, surface: 'metal', name: 'rail', contents: 0 });
    for (const [y, z] of [[ya, za], [(ya + yb) / 2, (za + zb) / 2], [yb, zb]]) prop(m, x - 2, y - 2, z - 8, x + 2, y + 2, z + h - 2, T.metal, { name: 'rail', contents: 0 });
  }
}

/**
 * A door frame in a wall opening: axis 'x' (the wall runs along x, the opening spans
 * u0..u1 in x, the wall's faces at t0 and t1 in y) or 'y'. Jambs and a header 8 wide that
 * stand 2 proud of both faces, floor z, opening height h. o.tex (s9_metal), o.haz: striped.
 */
export function doorFrame(m, axis, u0, u1, t0, t1, z, h = 112, o = {}) {
  const tex = o.haz ? T.haz : o.tex || T.metal, w = o.w ?? 6, p = 2;
  const NC = { name: 'frame', contents: 0 }; // (visual: a 2-unit lip would be a ledge)
  const b = (ua, ub, za, zb) => (axis === 'x' ? prop(m, ua, t0 - p, za, ub, t1 + p, zb, tex, NC) : prop(m, t0 - p, ua, za, t1 + p, ub, zb, tex, NC));
  b(u0, u0 + w, z, z + h);
  b(u1 - w, u1, z, z + h);
  b(u0, u1, z + h - w, z + h);
}

/**
 * A sign plaque (atlas cell k) on a wall: face 'n'|'s'|'e'|'w' is where it looks; the wall
 * surface is at `plane` (y for n/s, x for e/w); it spans u0..u1 along the wall, z0..z1.
 * o.lit: self-lit (backlit sign). The cell is mapped with a world-aligned scale + offset.
 */
export function sign(m, k, face, plane, u0, u1, z0, z1, o = {}) {
  const r = signRect(k), d = o.depth ?? 2;
  const mirrored = face === 'n' || face === 'w';
  const su = (mirrored ? -1 : 1) * (u1 - u0) / (r.x1 - r.x0), sv = (z1 - z0) / (r.y1 - r.y0);
  const ou = r.x0 - (mirrored ? u1 : u0) / su, ov = z0 / sv - 256 + r.y1;
  const spec = { all: T.metal, [face]: { name: T.sign, scale: [su, sv], offset: [ou, ov] } };
  let b;
  if (face === 'n') b = prop(m, u0, plane, z0, u1, plane + d, z1, spec, { name: 'sign' });
  else if (face === 's') b = prop(m, u0, plane - d, z0, u1, plane, z1, spec, { name: 'sign' });
  else if (face === 'e') b = prop(m, plane, u0, z0, plane + d, u1, z1, spec, { name: 'sign' });
  else b = prop(m, plane - d, u0, z0, plane, u1, z1, spec, { name: 'sign' });
  if (b && o.lit) { b.fullbright = true; b.castShadow = false; }
  return b;
}

/**
 * An open door leaf: swung back 90 degrees against the room side of a doorway. The wall runs
 * along `axis` with its room-side face at t; the hinge jamb at u = hinge; the leaf sticks out
 * toward `side` (+1 / -1 along the wall's normal), w wide, 108 tall; it opens away from the
 * opening (dir: +1 / -1 along the wall).
 */
export function doorLeaf(m, axis, hinge, t, side, z, dir = -1, w = 56) {
  const u0 = dir > 0 ? hinge : hinge - 4, u1 = dir > 0 ? hinge + 4 : hinge;
  const a = Math.min(t, t + side * w), b = Math.max(t, t + side * w);
  if (axis === 'x') prop(m, u0, a, z, u1, b, z + 108, T.metal, { name: 'door' });
  else prop(m, a, u0, z, b, u1, z + 108, T.metal, { name: 'door' });
}

/** A lab trolley: a 32-high top on four legs with a low shelf (nobody fits under it). */
export function cart(m, x, y, z, axis = 'x') {
  const [hx, hy] = axis === 'x' ? [30, 18] : [18, 30];
  prop(m, x - hx, y - hy, z + 28, x + hx, y + hy, z + 32, T.metal, { name: 'cart' });
  prop(m, x - hx + 2, y - hy + 2, z + 8, x + hx - 2, y + hy - 2, z + 11, T.metal, { name: 'cart' });
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prop(m, x + sx * (hx - 3) - 2, y + sy * (hy - 3) - 2, z, x + sx * (hx - 3) + 2, y + sy * (hy - 3) + 2, z + 28, T.metal, { name: 'cart' });
  m.clip(x - hx + 4, y - hy + 4, z, x + hx - 4, y + hy - 4, z + 28);
}

/** A ceiling fluorescent: a light_panel fitting at the ceiling z (hangs below it), cool white. */
export function tube(m, x, y, zc, o = {}) {
  const along = o.along || 'x';
  return lamp(m, x, y, zc - 4, { size: along === 'x' ? [56, 14] : [14, 56], depth: 4, ...o, color: o.color || [0.86, 0.94, 1.0], intensity: (o.intensity ?? 0.85) * 1.2, radius: (o.radius ?? 360) * 1.15 });
}

/** A red emergency lamp on a wall (face: the way it shines), with a stronger, wider red light. */
export function redLamp(m, x, y, z, face, o = {}) {
  return lamp(m, x, y, z, { face, size: [20, 12], depth: 6, tex: T.red, color: [1.0, 0.16, 0.1], intensity: o.intensity ?? 0.9, radius: o.radius ?? 380 });
}

/** A caged bulk-head lamp on a wall (tunnels): small, warm-white. */
export function bulkhead(m, x, y, z, face, o = {}) {
  return lamp(m, x, y, z, { face, size: [16, 12], depth: 6, color: o.color || [1.0, 0.86, 0.66], intensity: o.intensity ?? 0.8, radius: o.radius ?? 340 });
}

/** A round-ish pipe (an octagonal prism) along an axis from a0 to a1 at (c1, c2) = (y, z) for 'x', (x, z) for 'y', (x, y) for 'z'. */
export function pipe(m, axis, a0, a1, c1, c2, r = 6, tex = T.metal) {
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; pts.push([c1 + Math.cos(a) * r, c2 + Math.sin(a) * r]); }
  return m.prism(axis, pts, Math.min(a0, a1), Math.max(a0, a1), { all: tex }, { ...D, surface: 'metal', name: 'pipe', contents: 0 });
}

/** A lab bench: a cabinet base and a dark worktop 36 high, w along `axis`, 48 deep; o.kit adds kit on top. */
export function bench(m, x, y, z, axis, w, o = {}) {
  const [hx, hy] = axis === 'x' ? [w / 2, 24] : [24, w / 2];
  prop(m, x - hx + 3, y - hy + 3, z, x + hx - 3, y + hy - 3, z + 32, { all: T.wall, top: T.metal }, { name: 'bench' });
  prop(m, x - hx, y - hy, z + 32, x + hx, y + hy, z + 36, T.metal, { name: 'bench', surface: 'metal' });
  // kit on the top: instruments (32 tall from the top: 68 above the floor, climbable from the top)
  for (const [u, s, h] of o.kit || []) {
    const cx = axis === 'x' ? x + u : x, cy = axis === 'x' ? y : y + u;
    m.crate(cx, cy, z + 36, s, s, h, T.crate, { detail: true, surface: 'metal' });
  }
}

/** A server rack (64 x 48, 112 tall: nobody stands on it): its front (fit, self-lit LEDs) faces `face`. */
export function rack(m, x, y, z, face, w = 48, h = 112) {
  const dx = face === 'e' || face === 'w' ? 32 : w / 2, dy = face === 'n' || face === 's' ? 32 : w / 2;
  prop(m, x - dx, y - dy, z, x + dx, y + dy, z + h, T.metal, { name: 'rack', surface: 'metal' });
  const f = { name: T.server, fit: true };
  let b;
  if (face === 'n') b = prop(m, x - dx + 2, y + dy, z + 2, x + dx - 2, y + dy + 1, z + h - 2, { all: T.metal, n: f }, { name: 'rackfront' });
  if (face === 's') b = prop(m, x - dx + 2, y - dy - 1, z + 2, x + dx - 2, y - dy, z + h - 2, { all: T.metal, s: f }, { name: 'rackfront' });
  if (face === 'e') b = prop(m, x + dx, y - dy + 2, z + 2, x + dx + 1, y + dy - 2, z + h - 2, { all: T.metal, e: f }, { name: 'rackfront' });
  if (face === 'w') b = prop(m, x - dx - 1, y - dy + 2, z + 2, x - dx, y + dy - 2, z + h - 2, { all: T.metal, w: f }, { name: 'rackfront' });
  if (b) { b.fullbright = true; b.castShadow = false; }
}

/** A cafeteria table (30 high top on a pedestal) with stools (18) along its long sides. */
export function table(m, x, y, z, axis = 'x', len = 96) {
  const [hx, hy] = axis === 'x' ? [len / 2, 20] : [20, len / 2];
  prop(m, x - hx, y - hy, z + 28, x + hx, y + hy, z + 30, { all: T.metal, top: T.wall }, { name: 'table' });
  prop(m, x - 4, y - 4, z, x + 4, y + 4, z + 28, T.metal, { name: 'table' });
  for (const s of [-1, 1]) for (const k of [-1, 1]) {
    const sx = axis === 'x' ? x + k * len / 4 : x + s * 34, sy = axis === 'x' ? y + s * 34 : y + k * len / 4;
    prop(m, sx - 7, sy - 7, z, sx + 7, sy + 7, z + 18, T.metal, { name: 'stool' });
  }
}

/** Supply cases: [dx, dy, size, height] stacked on z at (x, y) (heights 32/40 per layer). */
export function cases(m, x, y, z, list) {
  for (const [dx, dy, s, h, zz = 0] of list) m.crate(x + dx, y + dy, z + zz, s, s, h, T.crate, { detail: true, surface: 'metal' });
}

/** A 40-high barrel (horde-jumpable), octagonal, painted steel or hazard-banded. */
export function drum(m, x, y, z, tex = T.metal) {
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; pts.push([x + Math.cos(a) * 13, y + Math.sin(a) * 13]); }
  m.prism('z', pts, z, z + 40, { all: tex }, { ...D, surface: 'metal', name: 'drum' });
}

/**
 * The specimen tank in the pit: an octagonal column of glowing fluid (fullbright) in a glass
 * sleeve, steel bands, a machinery plinth and a crown of pipes into the roof; green lights
 * ring it at three heights. (cx, cy) its axis, z0 the pit floor, z1 the roof.
 */
export function specimenTank(m, cx, cy, z0, z1) {
  const oct = (r, rot = 0.5) => { const p = []; for (let i = 0; i < 8; i++) { const a = (i + rot) * Math.PI / 4; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; };
  // plinth: two machinery tiers (32 and 32: each a horde-jumpable step)
  m.prism('z', oct(150), z0, z0 + 32, { all: T.metal, top: T.grate }, { surface: 'metal', name: 'tank_base' });
  m.prism('z', oct(124), z0 + 32, z0 + 64, { all: T.haz, top: T.metal }, { surface: 'metal', name: 'tank_base' });
  // the fluid column (fullbright) and its glass sleeve
  const core = m.prism('z', oct(88), z0 + 64, z1 - 96, { all: { name: T.tank, fit: true }, top: T.metal, bottom: T.metal }, { surface: 'glass', name: 'tank_core' });
  core.fullbright = true; core.castShadow = false;
  m.prism('z', oct(96), z0 + 64, z1 - 96, { all: T.glass }, { contents: 2, surface: 'glass', name: 'tank_glass', detail: true, castShadow: false });
  // steel bands and ribs up the sleeve
  for (let z = z0 + 64; z < z1 - 100; z += 128) m.prism('z', oct(104), z, z + 10, { all: T.metal }, { ...D, surface: 'metal', name: 'tank_band', contents: 0 });
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, x = cx + Math.cos(a) * 98, y = cy + Math.sin(a) * 98;
    prop(m, x - 4, y - 4, z0 + 64, x + 4, y + 4, z1 - 96, T.metal, { name: 'tank_rib' });
  }
  // the crown: a cap and pipes up into the roof
  m.prism('z', oct(128), z1 - 96, z1 - 64, { all: T.metal, bottom: T.metal }, { surface: 'metal', name: 'tank_cap' });
  m.prism('z', oct(72), z1 - 64, z1, { all: T.metal }, { surface: 'metal', name: 'tank_cap' });
  for (let i = 0; i < 4; i++) { const a = (i + 0.5) * Math.PI / 2; pipe(m, 'z', z1 - 64, z1, cx + Math.cos(a) * 104, cy + Math.sin(a) * 104, 10); }
  // the glow: green lights round it at three heights (they light the pit and the galleries)
  for (const [z, r, k] of [[z0 + 80, 220, 0.9], [z0 + 300, 230, 0.75], [z0 + 520, 230, 0.6]]) {
    for (let i = 0; i < 4; i++) { const a = (i + (z > z0 + 200 ? 0.5 : 0)) * Math.PI / 2; m.light(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, z, [0.32, 1.0, 0.62], k, 520); }
  }
}

/** A box truck: cargo box and cab (facing `dir` 'e'/'w') solid from the floor to 72+ (nobody climbs it); wheels are visual only. */
export function boxTruck(m, x, y, z, dir = 'e') {
  const s = dir === 'e' ? 1 : -1;
  prop(m, x - 160, y - 48, z + 14, x + 160, y + 48, z + 136, { all: T.wall, top: T.metal }, { name: 'truck', detail: false });
  m.clip(x - 150, y - 40, z, x + 150, y + 40, z + 14);
  const cx0 = s > 0 ? x + 164 : x - 264, cx1 = s > 0 ? x + 264 : x - 164;
  prop(m, cx0, y - 46, z + 14, cx1, y + 46, z + 72, T.metal, { name: 'truck', detail: false }); // cab lower
  m.clip(cx0 + 10, y - 36, z, cx1 - 10, y + 36, z + 14);
  const w0 = s > 0 ? cx0 : cx0 + 34, w1 = s > 0 ? cx1 - 34 : cx1;
  prop(m, w0, y - 44, z + 72, w1, y + 44, z + 112, { all: T.metal, [s > 0 ? 'e' : 'w']: T.glass }, { name: 'truck' }); // cab
  prop(m, s > 0 ? x + 160 : cx1, y - 30, z + 20, s > 0 ? cx0 : x - 160, y + 30, z + 60, T.metal, { name: 'truck' }); // coupling
  for (const wx of [x - 110, x + 90, s > 0 ? x + 230 : x - 230]) for (const wy of [-1, 1]) prop(m, wx - 18, y + wy * 44 - 6, z, wx + 18, y + wy * 44 + 6, z + 32, { all: T.metal }, { name: 'wheel', contents: 0, castShadow: false });
}

/** A forklift: a 38-high body (jumpable); mast, forks and the overhead guard are visual only. */
export function forklift(m, x, y, z, dir = 'n') {
  const along = dir === 'n' || dir === 's';
  const L = 60, Wd = 22, NC = { contents: 0, name: 'forklift' };
  const [hx, hy] = along ? [Wd, L / 2] : [L / 2, Wd];
  prop(m, x - hx, y - hy, z + 6, x + hx, y + hy, z + 38, { all: T.haz, top: T.metal }, { name: 'forklift' });
  m.clip(x - hx + 4, y - hy + 4, z, x + hx - 4, y + hy - 4, z + 6);
  const sgn = dir === 'n' || dir === 'e' ? 1 : -1;
  if (along) {
    prop(m, x - hx, y + sgn * hy, z, x + hx, y + sgn * (hy + 6), z + 96, T.metal, NC);
    prop(m, x - hx + 4, y + sgn * (hy + 6), z + 2, x - hx + 10, y + sgn * (hy + 40), z + 5, T.metal, NC);
    prop(m, x + hx - 10, y + sgn * (hy + 6), z + 2, x + hx - 4, y + sgn * (hy + 40), z + 5, T.metal, NC);
  } else {
    prop(m, x + sgn * hx, y - hy, z, x + sgn * (hx + 6), y + hy, z + 96, T.metal, NC);
    prop(m, x + sgn * (hx + 6), y - hy + 4, z + 2, x + sgn * (hx + 40), y - hy + 10, z + 5, T.metal, NC);
    prop(m, x + sgn * (hx + 6), y + hy - 10, z + 2, x + sgn * (hx + 40), y + hy - 4, z + 5, T.metal, NC);
  }
  for (const [px, py] of [[-hx, -hy], [hx, -hy], [-hx, hy], [hx, hy]]) prop(m, x + px * 0.8 - 2, y + py * 0.8 - 2, z + 38, x + px * 0.8 + 2, y + py * 0.8 + 2, z + 86, T.metal, NC);
  prop(m, x - hx, y - hy, z + 86, x + hx, y + hy, z + 90, T.metal, NC);
}

/** A glass partition along an axis with a solid lower panel (40) and glazing to h, mullions every ~96. */
export function partition(m, axis, a0, a1, t, z, h = 112, gaps = []) {
  const segs = [];
  let u = a0;
  for (const g of gaps.slice().sort((p, q) => p.c - q.c)) { segs.push([u, g.c - g.w / 2]); u = g.c + g.w / 2; }
  segs.push([u, a1]);
  for (const [s0, s1] of segs) {
    if (s1 - s0 < 1) continue;
    const box = (u0, u1, za, zb, tex, th = 3) => (axis === 'x' ? prop(m, u0, t - th, za, u1, t + th, zb, tex, { name: 'partition' }) : prop(m, t - th, u0, za, t + th, u1, zb, tex, { name: 'partition' }));
    box(s0, s1, z, z + 40, { all: T.metal, top: T.metal });
    box(s0, s1, z + h - 4, z + h, T.metal);
    if (axis === 'x') glass(m, s0, t - 1, z + 40, s1, t + 1, z + h - 4, T.glass); else glass(m, t - 1, s0, z + 40, t + 1, s1, z + h - 4, T.glass);
    const n = Math.max(1, Math.round((s1 - s0) / 96));
    for (let k = 0; k <= n; k++) { const c = s0 + (s1 - s0) * k / n; box(Math.max(s0, c - 2), Math.min(s1, c + 2), z + 40, z + h - 4, T.metal, 4); }
  }
}

export { lamp, glass, playerClip };
