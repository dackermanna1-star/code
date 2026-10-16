// Fine-voxel toolkit for small living things and storytelling props.
//
// People, dogs and small props would be shapeless blobs at the world's 0.25 m grain, so they are
// built from finer voxels (like the nature package's crows): a model is registered with
// `lods: [2f, f]` so the mesher scales its second LOD by VOXEL·f (downsample(f) returns the model
// itself, downsample(2f) an empty stand-in that is never drawn: lodDistances [-1e6] always pick
// LOD 1, whose material has no 0.25 m edge-darkening grid). The engine still computes the bounding
// box with 0.25 m voxels; fixFine() rescales it once the def exists (only matters for culling).
//
// All rasterizers below work in voxel units with float coordinates; a voxel (i,j,k) is filled
// when its centre (i+.5, j+.5, k+.5) lies inside the shape.

import { defineModel, getModelDef } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG, hashString } from '../../core/rng.js'

export { VoxelModel, M, RNG }

/** 6.25 cm voxels (people, dogs, sled, snowman, bicycle, tree). */
export const F4 = 0.25
/** 3.125 cm voxels (mittens, keys, ticket, the cat). */
export const F8 = 0.125
/** 1.5625 cm voxels (a glove's fingers, cigarette ends). */
export const F16 = 0.0625

const FINE = new Map()
export const FINE_MODELS = FINE

/**
 * Register a fine-voxel model. opts are defineModel options (defaults: no collision, no contact
 * shadow). The builder returns a VoxelModel in fine voxel units.
 */
export function defineFine(name, factor, builder, opts = {}) {
  FINE.set(name, factor)
  defineModel(name, () => {
    const m = builder()
    // LOD 0 (factor 2f) is an empty stand-in and is never drawn; LOD 1 is the model itself at
    // its fine scale. Drawing through the engine's second LOD material keeps the 0.25 m voxel
    // edge-darkening grid of LOD 0 off these 6 cm / 3 cm voxels (see engineRequests).
    m.downsample = function (f) { return f === factor ? this : EMPTY() }
    return m
  }, { lods: [factor * 2, factor], lodDistances: [-1e6], collide: false, contact: false, ...opts })
}
let _empty = null
const EMPTY = () => (_empty ??= new VoxelModel(1, 1, 1))

/** Rescale the engine's bounding box of a fine model (idempotent). Returns the def. */
export function fixFine(name) {
  const d = getModelDef(name)
  const f = FINE.get(name)
  if (d && f && !d._lifeFine) {
    d._lifeFine = true
    for (let i = 0; i < 3; i++) { d.min[i] *= f; d.max[i] *= f }
  }
  return d
}

/** Stable RNG for a model builder. */
export function rngFor(name, salt = 0) { return new RNG(hashString(name) ^ Math.imul(salt + 1, 0x9e3779b1)) }

// ---- rasterizers ---------------------------------------------------------------------------

/** Tapered capsule from a to b (arrays [x,y,z]) with radii ra → rb. opts.ifEmpty keeps existing voxels. */
export function capsule(m, a, b, ra, rb, mat, ifEmpty = false) {
  const r = Math.max(ra, rb)
  const x0 = Math.floor(Math.min(a[0], b[0]) - r), x1 = Math.ceil(Math.max(a[0], b[0]) + r)
  const y0 = Math.floor(Math.min(a[1], b[1]) - r), y1 = Math.ceil(Math.max(a[1], b[1]) + r)
  const z0 = Math.floor(Math.min(a[2], b[2]) - r), z1 = Math.ceil(Math.max(a[2], b[2]) + r)
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]
  const ll = dx * dx + dy * dy + dz * dz || 1e-9
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - a[0], py = y + 0.5 - a[1], pz = z + 0.5 - a[2]
        let t = (px * dx + py * dy + pz * dz) / ll
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const rr = ra + (rb - ra) * t
        const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t
        if (qx * qx + qy * qy + qz * qz <= rr * rr) {
          if (ifEmpty && m.get(x, y, z)) continue
          m.set(x, y, z, mat)
        }
      }
}

/** Ellipsoid with a float centre; `filter(x,y,z)` may veto voxels. */
export function ellip(m, cx, cy, cz, rx, ry, rz, mat, filter = null, ifEmpty = false) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz
        if (dx * dx + dy * dy + dz * dz > 1) continue
        if (filter && !filter(x, y, z)) continue
        if (ifEmpty && m.get(x, y, z)) continue
        m.set(x, y, z, mat)
      }
}

/** Filled horizontal ellipse on voxel row y. */
export function rowEllipse(m, y, cx, cz, rx, rz, mat, ifEmpty = false) {
  if (rx <= 0 || rz <= 0) return
  for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dz = (z + 0.5 - cz) / rz
      if (dx * dx + dz * dz > 1) continue
      if (ifEmpty && m.get(x, y, z)) continue
      m.set(x, y, z, mat)
    }
}

/** Box with float bounds (voxel centres inside [x0,x1]×[y0,y1]×[z0,z1]). */
export function boxF(m, x0, y0, z0, x1, y1, z1, mat, ifEmpty = false) {
  for (let y = Math.ceil(y0 - 0.5); y + 0.5 <= y1; y++)
    for (let z = Math.ceil(z0 - 0.5); z + 0.5 <= z1; z++)
      for (let x = Math.ceil(x0 - 0.5); x + 0.5 <= x1; x++) {
        if (ifEmpty && m.get(x, y, z)) continue
        m.set(x, y, z, mat)
      }
}

/**
 * Oriented box: centre c, unit axes u, v, w (arrays) and half extents hu, hv, hw.
 * Good for tilted bags, briefcases, sled slats.
 */
export function obox(m, c, u, v, w, hu, hv, hw, mat, ifEmpty = false) {
  const r = Math.hypot(hu, hv, hw)
  for (let y = Math.floor(c[1] - r); y <= Math.ceil(c[1] + r); y++)
    for (let z = Math.floor(c[2] - r); z <= Math.ceil(c[2] + r); z++)
      for (let x = Math.floor(c[0] - r); x <= Math.ceil(c[0] + r); x++) {
        const px = x + 0.5 - c[0], py = y + 0.5 - c[1], pz = z + 0.5 - c[2]
        if (Math.abs(px * u[0] + py * u[1] + pz * u[2]) > hu) continue
        if (Math.abs(px * v[0] + py * v[1] + pz * v[2]) > hv) continue
        if (Math.abs(px * w[0] + py * w[1] + pz * w[2]) > hw) continue
        if (ifEmpty && m.get(x, y, z)) continue
        m.set(x, y, z, mat)
      }
}

/** Thin line of single voxels between two float points. */
export function line(m, a, b, mat, ifEmpty = false) {
  const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])) * 1.5) + 1
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = Math.floor(a[0] + (b[0] - a[0]) * t), y = Math.floor(a[1] + (b[1] - a[1]) * t), z = Math.floor(a[2] + (b[2] - a[2]) * t)
    if (ifEmpty && m.get(x, y, z)) continue
    m.set(x, y, z, mat)
  }
}

/** Sagging rope/leash between a and b (catenary-ish parabola), `sag` voxels at the middle. */
export function rope(m, a, b, sag, mat) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 1.6) + 2
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const s = 4 * t * (1 - t) * sag
    const x = Math.floor(a[0] + (b[0] - a[0]) * t), y = Math.floor(a[1] + (b[1] - a[1]) * t - s), z = Math.floor(a[2] + (b[2] - a[2]) * t)
    m.set(x, y, z, mat)
  }
}

/** Replace voxels of material `from` by `to` with probability p (seeded). */
export function speckle(m, rng, from, to, p) {
  for (let i = 0; i < m.data.length; i++) if (m.data[i] === from && rng.next() < p) m.data[i] = to
}

/**
 * Snow on every exposed top of a fine model: `depth` fine voxels (default 1), with gaps.
 * Uses the core addSnow (needs the palette tables, i.e. call inside a lazy builder).
 */
export function snowTop(m, opts = {}) {
  m.addSnow({ mat: opts.mat ?? M('snow'), depth: opts.depth ?? 1, chance: opts.chance ?? 0.92, seed: opts.seed ?? 7, vary: opts.vary ?? 0, skip: opts.skip, onlyAbove: opts.onlyAbove ?? 0 })
  return m
}
