// Fine-voxel vehicles. At the world's 0.25 m grain a Lada is 16 × 6 × 6 voxels — a shapeless
// brick. Vehicles are therefore modelled at 0.125 m ("fine") and registered in two scales:
//   * def.model is the 0.25 m downsample: collision, contact shadow, culling box, mid LOD;
//   * LOD 0 (factor 0.5 → meshed at 0.125 m) is the fine model itself.
// The trick: the engine meshes LOD f from def.model.downsample(f); our coarse model answers
// f < 1 with the fine model (engine request: a first-class `voxelScale` option).

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M, SOLID } from '../../core/materials.js'
import { RNG, hashString, valueNoise2 } from '../../core/rng.js'

export { VoxelModel, M, RNG }

/** Fine voxel size (m). */
export const FV = 0.125
/** metres → fine voxels (rounded). */
export const v = m => Math.round(m / FV)

/** Stable RNG for a model builder. */
export function rngFor(name, salt = 0) { return new RNG(hashString(name) ^ Math.imul(salt + 1, 0x9e3779b1)) }

/**
 * Register a two-scale vehicle model. build() returns the FINE VoxelModel (0.125 m voxels,
 * pivot in fine units). opts: defineModel options; `minFill` for the coarse model (default 2).
 */
export function defineVehicle(name, build, opts = {}) {
  const { minFill = 2, ...mopts } = opts
  defineModel(name, () => {
    const fine = build()
    fine.name = name
    const coarse = fine.downsample(2, minFill)
    coarse.pivot = { x: fine.pivot.x / 2, y: fine.pivot.y / 2, z: fine.pivot.z / 2 }
    const base = coarse.downsample.bind(coarse)
    coarse.downsample = (f, mf, remap) => (f < 1 ? fine : base(f, mf, remap))
    coarse.fine = fine
    return coarse
  }, { lods: [0.5, 1, 2], lodDistances: [38, 120], ...mopts })
}

// ---- rasterizers (fine voxel units, float coordinates; a voxel is filled when its centre is inside)

/** Box with float bounds: voxel centres inside [x0,x1]×[y0,y1]×[z0,z1]. */
export function boxF(m, x0, y0, z0, x1, y1, z1, mat, ifEmpty = false) {
  for (let y = Math.ceil(y0 - 0.5); y + 0.5 <= y1; y++)
    for (let z = Math.ceil(z0 - 0.5); z + 0.5 <= z1; z++)
      for (let x = Math.ceil(x0 - 0.5); x + 0.5 <= x1; x++) {
        if (ifEmpty && m.get(x, y, z)) continue
        m.set(x, y, z, mat)
      }
}

/** Replace every voxel of material `from` inside a box (size semantics) by `to`. */
export function recolor(m, from, to, x = 0, y = 0, z = 0, w = m.sx, h = m.sy, d = m.sz) {
  m.replace(from, to, x, y, z, w, h, d)
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

/** Disc in the YZ plane (a wheel seen from the side) on columns x0..x1-1, centre (cy, cz), radius r. */
export function discX(m, x0, x1, cy, cz, r, mat) {
  for (let x = x0; x < x1; x++)
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
        const dy = y + 0.5 - cy, dz = z + 0.5 - cz
        if (dy * dy + dz * dz <= r * r) m.set(x, y, z, mat)
      }
}

/** Clear (or replace) everything inside a YZ disc across all x (wheel arches). */
export function archX(m, cy, cz, r, mat = 0, x0 = 0, x1 = m.sx) {
  for (let x = x0; x < x1; x++)
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.ceil(cy + r); y++)
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
        const dy = y + 0.5 - cy, dz = z + 0.5 - cz
        if (dy * dy + dz * dz <= r * r) m.set(x, y, z, mat)
      }
}

/** Replace voxels of material `from` by `to` with probability p, optionally only below y. */
export function speckle(m, rng, from, to, p, yMax = m.sy) {
  for (let y = 0; y < Math.min(yMax, m.sy); y++)
    for (let z = 0; z < m.sz; z++)
      for (let x = 0; x < m.sx; x++) {
        const i = m.idx(x, y, z)
        if (m.data[i] === from && rng.next() < p) m.data[i] = to
      }
}

/**
 * Road grime: paint/body voxels on the outer skin low on the body turn to slush-brown grime
 * (dense at the sills, fading upward to `yTop`), with a few salt tidemarks.
 */
export function grime(m, rng, mats, yTop, amount = 0.6) {
  const set = new Set(mats)
  const g = M('veh_grime'), s = M('veh_salt')
  for (let y = 0; y < Math.min(yTop, m.sy); y++) {
    const k = amount * Math.pow(1 - y / yTop, 2.2)
    for (let z = 0; z < m.sz; z++)
      for (let x = 0; x < m.sx; x++) {
        const i = m.idx(x, y, z)
        if (!set.has(m.data[i])) continue
        // only skin voxels (an air neighbour sideways or front/back)
        if (m.get(x - 1, y, z) && m.get(x + 1, y, z) && m.get(x, y, z - 1) && m.get(x, y, z + 1)) continue
        const r = rng.next()
        if (r < k) m.data[i] = rng.next() < 0.12 ? s : g
      }
  }
}

/** Highest solid voxel y in a column (or -1). */
export function topAt(m, x, z) {
  for (let y = m.sy - 1; y >= 0; y--) if (SOLID[m.data[m.idx(x, y, z)]]) return y
  return -1
}

const GLASSY = new Set()
/** Lazily resolved set of glass material ids (materials are defined at import time). */
function glassIds() {
  if (!GLASSY.size) for (const n of ['glass_car', 'glass_frosted', 'veh_glass_clear']) { try { GLASSY.add(M(n)) } catch { /* not defined */ } }
  return GLASSY
}

/**
 * Snow cap: every exposed top gets snow; depth grows with the distance from the cap's edge so
 * roofs carry rounded pillows (edge 1 voxel, centre `maxD`). `skip(x, y, z)` vetoes a column
 * (e.g. a warm hood), `chance` thins it (dusting). Snow never pokes out of the model box.
 */
export function snowCap(m, o = {}) {
  const mat = o.mat ?? M('snow')
  const maxD = o.maxD ?? 3
  const chance = o.chance ?? 1
  const rng = o.rng ?? new RNG(o.seed ?? 99)
  const sx = m.sx, sz = m.sz
  const top = new Int16Array(sx * sz)
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) top[x + z * sx] = topAt(m, x, z)
  // distance (in columns) to a "drop" of ≥ 2 voxels: chamfer transform, 2 passes
  const INF = 99
  const dist = new Int16Array(sx * sz).fill(INF)
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      const t = top[x + z * sx]
      if (t < 0) { dist[x + z * sx] = 0; continue }
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      for (const [dx, dz] of nb) {
        const xx = x + dx, zz = z + dz
        const tn = xx < 0 || zz < 0 || xx >= sx || zz >= sz ? -1 : top[xx + zz * sx]
        if (tn < t - 1) { dist[x + z * sx] = 0; break }
      }
    }
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
      const i = x + z * sx
      if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1)
      if (z > 0) dist[i] = Math.min(dist[i], dist[i - sx] + 1)
    }
    for (let z = sz - 1; z >= 0; z--) for (let x = sx - 1; x >= 0; x--) {
      const i = x + z * sx
      if (x < sx - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1)
      if (z < sz - 1) dist[i] = Math.min(dist[i], dist[i + sx] + 1)
    }
  }
  const prof = o.profile ?? [1, 2, 3, 3, 4, 4, 4]
  if (o.ledges) glassIds()
  // desired snow surface per column
  const T = new Int16Array(sx * sz).fill(-1)
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      const t = top[x + z * sx]
      if (t < 0 || t < (o.minY ?? 1)) continue
      if (o.skip && o.skip(x, t, z)) continue
      // snow does not stay on narrow glass ledges at the side of a greenhouse
      if (o.ledges && GLASSY.has(m.data[m.idx(x, t, z)])) {
        const tl = x > 0 ? top[x - 1 + z * sx] : -1, tr = x < sx - 1 ? top[x + 1 + z * sx] : -1
        if (tl > t || tr > t) continue
      }
      if (o.patchy) { if (valueNoise2(x * o.patchy, z * o.patchy, o.seed ?? 5) > chance) continue }
      else if (rng.next() > chance) continue
      let d = Math.min(maxD, prof[Math.min(prof.length - 1, dist[x + z * sx])])
      if (o.vary && rng.next() < o.vary) d = Math.max(1, d - 1)
      T[x + z * sx] = t + d
    }
  // smooth: snow bridges the voxel steps of sloped glass (a blanket, not a staircase)
  const S = T
  if (o.smooth) {
    const S2 = new Int16Array(sx * sz)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        const i = x + z * sx
        let b = T[i]
        if (b < 0) { S2[i] = -1; continue }
        for (let dz = -3; dz <= 3; dz++) {
          const zz = z + dz
          if (zz < 0 || zz >= sz || !dz) continue
          const tn = T[x + zz * sx]
          if (tn >= 0 && top[x + zz * sx] > top[i]) b = Math.max(b, tn - Math.abs(dz))
        }
        S2[i] = b
      }
    S.set(S2)
  }
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      const i = x + z * sx
      const t = top[i]
      if (S[i] < 0) continue
      for (let y = t + 1; y <= S[i] && y < m.sy; y++) if (!m.get(x, y, z)) m.set(x, y, z, mat)
    }
  return m
}
