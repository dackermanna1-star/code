// Helpers shared by the levels of group 07 (children's museum, aviary, aquarium, theatre,
// cinema, libraries, stadium, carnival, childhood). Nothing here defines a level.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial, VF } from '../materials.js';
import { hr, M } from './kit.js';

export { hr, M, VF };

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const mulc = (c, m) => [c[0] * m, c[1] * m, c[2] * m];

// pick an element of arr by a coordinate hash
export const pickH = (arr, a, b, s) => arr[Math.floor(hr(a, b, s) * arr.length) % arr.length];

// Lattice points (ox + i*sx, oz + j*sz) inside [x0,x1) x [z0,z1); fn(x, z, i, j) for each.
export function lattice(x0, z0, x1, z1, sx, sz, fn, ox = 0, oz = 0) {
  const i0 = Math.ceil((x0 - ox) / sx), i1 = Math.ceil((x1 - ox) / sx) - 1;
  const j0 = Math.ceil((z0 - oz) / sz), j1 = Math.ceil((z1 - oz) / sz) - 1;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(ox + i * sx, oz + j * sz, i, j);
}

// self-lit material (glow ~0.42 shows the texture as painted)
export function glowMat(name, tex, glow = 0.5, o = {}) {
  return defineMaterial(name, tex, { s: o.s ?? 1, su: o.su, sv: o.sv, surf: o.surf ?? 'concrete', flags: VF.FULLBRIGHT | (o.flags || 0), glow, chan: o.chan || 0, tint: o.tint });
}

// angle so a model's front (local -z) faces the direction (dx, dz)
export const faceDir = (dx, dz) => Math.atan2(dx, -dz);

// split [lo, hi) around a gap [g0, g1): [[a, b], ...]
export function around(lo, hi, g0, g1) {
  const out = [];
  if (g0 > lo) out.push([lo, Math.min(g0, hi)]);
  if (g1 < hi) out.push([Math.max(g1, lo), hi]);
  return out;
}

// short helpers for painting
export function tex(name, fn, colors = 12) { defineTexture(name, fn, colors); return name; }

// Rectangle minus rectangles: [x0, z0, x1, z1] pieces of base not covered by any hole.
export function carve(base, holes) {
  let rects = [base];
  for (const h of holes) {
    const next = [];
    for (const r of rects) {
      if (h[0] >= r[2] || h[2] <= r[0] || h[1] >= r[3] || h[3] <= r[1]) { next.push(r); continue; }
      if (h[1] > r[1]) next.push([r[0], r[1], r[2], h[1]]);
      if (h[3] < r[3]) next.push([r[0], h[3], r[2], r[3]]);
      const z0 = Math.max(h[1], r[1]), z1 = Math.min(h[3], r[3]);
      if (h[0] > r[0]) next.push([r[0], z0, h[0], z1]);
      if (h[2] < r[2]) next.push([h[2], z0, r[2], z1]);
    }
    rects = next;
  }
  return rects;
}
