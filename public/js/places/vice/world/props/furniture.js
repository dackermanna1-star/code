// The small repeated things, each built once (local space: base at y = 0,
// front towards +z) and drawn instanced near the camera by the NearSet.
// Vertices marked PAINT take the instance's colour (the cushion of a
// lounger, the canopy panels of an umbrella, a newspaper box's body...).
//
//   const t = ftype(P, 'bench');  P.near.add(t, x, y, z, heading, scale, colour)
//   place(P, 'hydrant', x, z, heading, colour) -> item  (also its collision box)
import { Geo } from '../surface.js';
import { L, tint, shade, cyl, cylAB, ball, PAINT, TAU } from './kit.js';

const WHITE = [0.92, 0.92, 0.9], DARK = [0.08, 0.085, 0.09], STEEL = [0.55, 0.57, 0.6], WOOD = [0.62, 0.5, 0.38];
const P_ = { info: PAINT };

// name: [build(g), draw distance, casts shadow, collision [hx, hy, hz] | null, phys extra]
const DEFS = {
  bench: [(g) => {
    for (const x of [-2.6, 2.6]) { g.box(x, 0.8, 0, 0.18, 0.8, 1.0, 0, { lay: L.concrete, tint: DARK, rough: 0.5 }); g.box(x, 2.3, -0.85, 0.15, 1.0, 0.12, 0, { lay: L.concrete, tint: DARK, rough: 0.5 }); }
    for (let i = 0; i < 3; i++) g.box(0, 1.62, -0.6 + i * 0.55, 3.0, 0.1, 0.22, 0, { lay: L.deck, tint: [1, 1, 1], scale: 6, ...P_ });
    for (let i = 0; i < 2; i++) g.box(0, 2.25 + i * 0.6, -0.95, 3.0, 0.22, 0.08, 0, { lay: L.deck, tint: [1, 1, 1], scale: 6, ...P_ });
  }, 260, true, [3.1, 0.9, 1.1], { prop: true, cover: true, noStand: false }],
  bin: [(g) => {
    cyl(g, 0, 0, 0, 1.05, 3.0, 10, { lay: L.shutter, tint: [1, 1, 1], scale: 4, ...P_, capTint: DARK });
    cyl(g, 0, 3.0, 0, 1.15, 0.3, 10, { lay: L.concrete, tint: DARK, rough: 0.4 });
  }, 240, true, [1.0, 1.6, 1.0], { prop: true, breakable: true }],
  hydrant: [(g) => {
    cyl(g, 0, 0, 0, 0.62, 0.25, 8, { lay: L.concrete, tint: [1, 1, 1], ...P_ });
    cyl(g, 0, 0.25, 0, 0.45, 1.75, 8, { lay: L.concrete, tint: [1, 1, 1], rough: 0.45, ...P_ });
    ball(g, 0, 2.0, 0, 0.5, { lay: L.concrete, tint: [1, 1, 1], rough: 0.45, ...P_ }, 0.7);
    for (const a of [0, Math.PI / 2, Math.PI]) { const cx = Math.cos(a), cz = Math.sin(a); cylAB(g, [cx * 0.3, 1.35, cz * 0.3], [cx * 0.78, 1.35, cz * 0.78], 0.22, 0.22, 6, { lay: L.concrete, tint: [1, 1, 1], ...P_ }); }
  }, 200, false, [0.6, 1.2, 0.6], { prop: true, breakable: true, hydrant: true }],
  meter: [(g) => {
    cyl(g, 0, 0, 0, 0.14, 3.4, 6, { lay: L.concrete, tint: STEEL, rough: 0.4 });
    g.box(0, 3.85, 0, 0.42, 0.5, 0.3, 0, { lay: L.concrete, tint: [0.25, 0.27, 0.3], rough: 0.35 });
    g.box(0, 3.95, 0.31, 0.3, 0.25, 0.02, 0, { lay: L.whiteTiles, tint: [0.6, 0.75, 0.7], rough: 0.1 });
  }, 170, false, [0.35, 2.1, 0.35], { prop: true, breakable: true }],
  newsbox: [(g) => {
    g.box(0, 1.9, 0, 0.75, 1.1, 0.7, 0, { lay: L.shutter, tint: [1, 1, 1], scale: 3, rough: 0.5, ...P_ });
    g.box(0, 2.15, 0.71, 0.55, 0.5, 0.02, 0, { lay: L.whiteTiles, tint: [0.25, 0.3, 0.33], rough: 0.1 });
    for (const x of [-0.6, 0.6]) g.box(x, 0.4, 0, 0.08, 0.4, 0.6, 0, { lay: L.concrete, tint: DARK });
  }, 170, false, [0.8, 1.5, 0.75], { prop: true, breakable: true }],
  mailbox: [(g) => {
    g.box(0, 2.1, 0, 0.9, 1.1, 0.95, 0, { lay: L.shutter, tint: [1, 1, 1], scale: 3, rough: 0.5, ...P_ });
    cylAB(g, [-0.9, 3.2, 0], [0.9, 3.2, 0], 0.95, 0.95, 8, { lay: L.shutter, tint: [1, 1, 1], scale: 3, ...P_ });
    for (const x of [-0.75, 0.75]) for (const z of [-0.8, 0.8]) g.box(x, 0.5, z, 0.1, 0.5, 0.1, 0, { lay: L.concrete, tint: DARK });
  }, 190, false, [1, 2, 1], { prop: true, breakable: true }],
  phone: [(g) => {
    g.box(0, 3.6, -1.1, 1.2, 3.6, 0.1, 0, { lay: L.shutter, tint: [1, 1, 1], scale: 3, ...P_ });
    for (const x of [-1.15, 1.15]) g.box(x, 3.6, 0, 0.08, 3.6, 1.15, 0, { lay: L.whiteTiles, tint: [0.35, 0.42, 0.45], rough: 0.08 });
    g.box(0, 7.4, 0, 1.3, 0.25, 1.3, 0, { lay: L.shutter, tint: [1, 1, 1], ...P_ });
    g.box(0, 7.0, 1.2, 1.2, 0.3, 0.05, 0, { lay: L.whiteTiles, tint: [1, 0.95, 0.85], glow: 0.7 });
    g.box(0, 4.6, -0.95, 0.4, 0.6, 0.12, 0, { lay: L.concrete, tint: STEEL, rough: 0.35 });
  }, 240, true, [1.3, 3.7, 1.3], { prop: true }],
  planter: [(g) => {
    g.box(0, 1.1, 0, 2.6, 1.1, 2.6, 0, { lay: L.concrete, tint: [0.88, 0.85, 0.8], scale: 6 });
    g.box(0, 2.15, 0, 2.3, 0.1, 2.3, 0, { lay: L.gravel, tint: [0.45, 0.33, 0.24], scale: 4 });
  }, 260, true, [2.6, 1.1, 2.6], { cover: true }],
  bollard: [(g) => {
    cyl(g, 0, 0, 0, 0.75, 1.5, 8, { lay: L.concrete, tint: [0.12, 0.12, 0.13], rough: 0.45 });
    cyl(g, 0, 1.5, 0, 1.0, 0.35, 8, { lay: L.concrete, tint: [0.12, 0.12, 0.13], rough: 0.45 });
  }, 260, false, [0.9, 1.0, 0.9], {}],
  post: [(g) => { // a short white bollard (parks, pedestrian streets)
    cyl(g, 0, 0, 0, 0.45, 2.6, 8, { lay: L.concrete, tint: [0.9, 0.89, 0.86], scale: 4 });
    cyl(g, 0, 2.6, 0, 0.5, 0.2, 8, { lay: L.concrete, tint: [0.2, 0.2, 0.2] });
  }, 200, false, [0.45, 1.4, 0.45], { prop: true }],
  busstop: [(g) => { // a shelter: open towards +z (the road), glass at the back, an ad panel at one end
    const steel = [0.32, 0.34, 0.37];
    for (const x of [-6.2, 6.2]) for (const z of [-2.2, 1.8]) g.box(x, 4.2, z, 0.14, 4.2, 0.14, 0, { lay: L.concrete, tint: steel, rough: 0.4 });
    g.box(0, 8.55, -0.2, 6.8, 0.22, 2.9, 0, { lay: L.shutter, tint: [1, 1, 1], scale: 4, ...P_ });
    g.quad([6.1, 0.8, -2.25], [-6.1, 0.8, -2.25], [-6.1, 7.9, -2.25], [6.1, 7.9, -2.25], { lay: L.concrete, tint: [0.1, 0.13, 0.15], rough: 0.04, scale: 40 });
    g.quad([-6.1, 0.8, -2.25], [6.1, 0.8, -2.25], [6.1, 7.9, -2.25], [-6.1, 7.9, -2.25], { lay: L.concrete, tint: [0.1, 0.13, 0.15], rough: 0.04, scale: 40 });
    g.box(6.3, 4.4, -0.2, 0.25, 3.3, 2.0, 0, { lay: L.whiteTiles, tint: [1.0, 0.8, 0.62], glow: 1, rough: 0.2 });
    g.box(0, 1.7, -1.6, 4.5, 0.12, 0.55, 0, { lay: L.shutter, tint: steel, scale: 2 });
    for (const x of [-4, 4]) g.box(x, 0.85, -1.6, 0.1, 0.85, 0.4, 0, { lay: L.concrete, tint: steel });
    // the stop's sign on its own pole
    g.box(-8.2, 5.2, 2.2, 0.1, 5.2, 0.1, 0, { lay: L.concrete, tint: steel });
    g.box(-8.2, 9.4, 2.2, 0.08, 1.0, 1.3, 0, { lay: L.stucco, tint: tint(0x1d5fbf, 1.2) });
  }, 380, true, null, null],
  // the beach
  umbrella: [(g) => {
    cyl(g, 0, 0, 0, 0.18, 9.6, 6, { lay: L.concrete, tint: [0.9, 0.88, 0.84], cap: false });
    const n = 8, R = 6.2, top = 10.4, rim = 8.6;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, am = (a0 + a1) / 2;
      const A = [0, top, 0], B = [Math.cos(a0) * R, rim, Math.sin(a0) * R], C = [Math.cos(a1) * R, rim, Math.sin(a1) * R];
      const o = i % 2 ? { lay: L.stucco, tint: [0.97, 0.96, 0.92] } : { lay: L.stucco, tint: [1, 1, 1], ...P_ };
      g.quad(A, C, [Math.cos(am) * R * 1.02, rim - 0.1, Math.sin(am) * R * 1.02], B, { ...o, normal: [Math.cos(am) * 0.35, 0.94, Math.sin(am) * 0.35] });
      // underside (seen from the loungers)
      g.quad(A, B, [Math.cos(am) * R * 1.02, rim - 0.1, Math.sin(am) * R * 1.02], C, { ...o, tint: shade(o.tint, 0.75), normal: [0, -1, 0] });
      // the valance
      const D = [B[0], rim - 0.8, B[2]], E = [C[0], rim - 0.8, C[2]];
      g.quad(B, D, E, C, { ...o, normal: [Math.cos(am), 0, Math.sin(am)] });
    }
  }, 900, true, null, null],
  lounger: [(g) => {
    for (const x of [-1.0, 1.0]) for (const z of [-2.6, 2.4]) g.box(x, 0.5, z, 0.1, 0.5, 0.1, 0, { lay: L.concrete, tint: WHITE });
    g.box(0, 1.1, 0.6, 1.15, 0.12, 2.1, 0, { lay: L.concrete, tint: WHITE, rough: 0.5 });
    g.box(0, 1.32, 0.6, 1.05, 0.12, 2.0, 0, { lay: L.stucco, tint: [1, 1, 1], ...P_ });
    // the backrest, tilted up towards -z
    const c = Math.cos(0.75), s = Math.sin(0.75), w = 1.05;
    const p = [[-w, 1.2, -1.5], [w, 1.2, -1.5], [w, 1.2 + 2.6 * s, -1.5 - 2.6 * c], [-w, 1.2 + 2.6 * s, -1.5 - 2.6 * c]];
    g.quad(p[0], p[1], p[2], p[3], { lay: L.stucco, tint: [1, 1, 1], ...P_ });
    g.quad(p[1], p[0], p[3], p[2], { lay: L.concrete, tint: WHITE });
  }, 520, true, null, null],
  towel: [(g) => {
    g.quad([-1.3, 0.12, -2.6], [-1.3, 0.12, 2.6], [1.3, 0.12, 2.6], [1.3, 0.12, -2.6], { lay: L.stucco, tint: [1, 1, 1], normal: [0, 1, 0], ...P_ });
    g.quad([-1.31, 0.13, 1.6], [-1.31, 0.13, 2.1], [1.31, 0.13, 2.1], [1.31, 0.13, 1.6], { lay: L.stucco, tint: [0.95, 0.95, 0.92], normal: [0, 1, 0] });
  }, 420, false, null, null],
  shower: [(g) => {
    g.box(0, 0.15, 0, 1.6, 0.15, 1.6, 0, { lay: L.deck, tint: [0.85, 0.85, 0.85], scale: 4 });
    cyl(g, 0, 0.3, 0, 0.22, 8.5, 6, { lay: L.concrete, tint: STEEL, rough: 0.3 });
    cylAB(g, [0, 8.6, 0], [0, 8.6, 1.4], 0.15, 0.15, 6, { lay: L.concrete, tint: STEEL, rough: 0.3 });
    cyl(g, 0, 8.1, 1.4, 0.45, 0.4, 8, { lay: L.concrete, tint: STEEL, rough: 0.3 });
  }, 300, true, [0.4, 4.3, 0.4], { prop: true }],
  lifering: [(g) => { // a lifebuoy post
    cyl(g, 0, 0, 0, 0.18, 5, 6, { lay: L.deck, tint: [0.8, 0.8, 0.8] });
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      cylAB(g, [Math.cos(a0) * 1.1, 3.6 + Math.sin(a0) * 1.1, 0.3], [Math.cos(a1) * 1.1, 3.6 + Math.sin(a1) * 1.1, 0.3], 0.3, 0.3, 5, { lay: L.stucco, tint: i % 3 === 0 ? WHITE : tint(0xe8462c) });
    }
  }, 220, false, null, null],
  // parks
  lampDeco: [(g) => { // a white park lamp with a glowing globe
    cyl(g, 0, 0, 0, 0.55, 1.2, 8, { lay: L.concrete, tint: [0.92, 0.9, 0.85] });
    cyl(g, 0, 1.2, 0, 0.22, 9.5, 6, { lay: L.concrete, tint: [0.92, 0.9, 0.85] });
    ball(g, 0, 11.4, 0, 1.1, { lay: L.whiteTiles, tint: [1, 0.95, 0.82], glow: 1, rough: 0.2 });
  }, 420, false, [0.5, 5.5, 0.5], { prop: true }],
  picnic: [(g) => {
    g.box(0, 2.5, 0, 3.2, 0.12, 1.4, 0, { lay: L.deck, tint: WOOD, scale: 5 });
    for (const z of [-2.2, 2.2]) g.box(0, 1.5, z, 3.2, 0.1, 0.5, 0, { lay: L.deck, tint: WOOD, scale: 5 });
    for (const x of [-2.6, 2.6]) g.box(x, 1.25, 0, 0.12, 1.25, 2.4, 0, { lay: L.deck, tint: shade(WOOD, 0.8), scale: 5 });
  }, 240, true, [3.2, 1.3, 2.6], { cover: true }],
};
// a few more that are plain variations
DEFS.bin2 = DEFS.bin;

/** The NearSet type for a named piece of furniture (built on first use). */
export function ftype(P, name) {
  P._ftypes = P._ftypes || {};
  if (P._ftypes[name] != null) return P._ftypes[name];
  const D = DEFS[name];
  const g = new Geo();
  D[0](g);
  const t = P.near.type(g.geometry(), P.M.inst, { R: D[1], shadow: D[2], name });
  P._ftypes[name] = t;
  return t;
}

/** Put one down at (x, z) on the ground (or at y), with its collision box. */
export function place(P, name, x, z, heading = 0, colour = null, y = null, s = 1) {
  const t = ftype(P, name), D = DEFS[name];
  const yy = y ?? P.gy(x, z);
  const it = P.near.add(t, x, yy, z, heading, s, colour);
  if (D[3]) {
    const [hx, hy, hz] = D[3];
    const b = P.box(x, yy + hy * s, z, hx * s, hy * s, hz * s, heading, D[4]?.hydrant || name === 'meter' || name === 'lampDeco' || name === 'shower' ? 'metal' : name === 'bench' || name === 'picnic' ? 'wood' : 'concrete', { ...(D[4] || {}), item: it, kind: name });
    it.box = b;
  }
  return it;
}
