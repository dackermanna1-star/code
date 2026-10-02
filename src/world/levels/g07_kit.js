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

// A four-frame animated self-lit material (the engine flips ANIM layers at 14 fps). The
// engine only uploads the first frame's texture for a material, so animKeep() must be called
// once per zone to put the other three frames on the GPU. drawFrame(p, f) paints frame f.
export function animMaterial(name, texPrefix, drawFrame, o = {}) {
  for (let f = 0; f < 4; f++) defineTexture(texPrefix + f, (p) => drawFrame(p, f), o.colors ?? 10);
  const base = { s: o.s ?? 1, su: o.su, sv: o.sv, surf: o.surf ?? 'concrete', glow: o.glow ?? 1, chan: o.chan || 0 };
  defineMaterial(name, texPrefix + '0', { ...base, flags: VF.FULLBRIGHT | VF.ANIM });
  for (let f = 1; f < 4; f++) defineMaterial(`${name}_f${f}`, texPrefix + f, { ...base, flags: VF.FULLBRIGHT });
  return name;
}
// hidden slivers, one per chunk of the zone, that keep frames 1..3 of an animated material loaded
export function animKeep(zb, ...names) {
  for (let cz = Math.floor(zb.z0 / 16) * 16; cz < zb.z1; cz += 16) {
    for (let cx = Math.floor(zb.x0 / 16) * 16; cx < zb.x1; cx += 16) {
      const x = Math.max(cx, zb.x0) + 0.2, z = Math.max(cz, zb.z0) + 0.2;
      for (const n of names) {
        zb.box(x, -0.3, z, x + 0.03, -0.27, z + 0.03, [M[n + '_f1'], M[n + '_f2'], M[n + '_f3'], null, null, null], { collide: false, sub: 0 });
      }
    }
  }
}
