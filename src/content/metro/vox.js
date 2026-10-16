// World-aligned voxel building helpers for the metro package.
//
// Most metro structures are unique, placed once at rot 0 with the pivot at the model's corner,
// so it is far less error-prone to author them directly in WORLD METERS: a WB ("world builder")
// wraps a VoxelModel whose voxel (0,0,0) sits at world (ox, oy, oz). All WB methods take meters
// and half-open boxes [x0,x1) × [y0,y1) × [z0,z1) (corner order does not matter).
// The model is placed with world.place(name, { x: ox, y: oy, z: oz, rot: 0 }).

import { VoxelModel } from '../../core/VoxelModel.js'
import { VOXEL } from '../../core/constants.js'
import { SOLID } from '../../core/materials.js'
import { RNG, hash2 } from '../../core/rng.js'

export const V = VOXEL
const r4 = v => Math.round(v / V)

export class WB {
  constructor(x0, y0, z0, x1, y1, z1) {
    this.ox = x0; this.oy = y0; this.oz = z0
    this.m = new VoxelModel(r4(x1 - x0), r4(y1 - y0), r4(z1 - z0))
    this.m.setPivot(0, 0, 0)
  }
  ix(x) { return r4(x - this.ox) }
  iy(y) { return r4(y - this.oy) }
  iz(z) { return r4(z - this.oz) }
  /** World meters of voxel index centres. */
  wx(i) { return this.ox + (i + 0.5) * V }
  wy(j) { return this.oy + (j + 0.5) * V }
  wz(k) { return this.oz + (k + 0.5) * V }

  fill(x0, y0, z0, x1, y1, z1, mat, extra) {
    const a = this.ix(Math.min(x0, x1)), b = this.ix(Math.max(x0, x1))
    const c = this.iy(Math.min(y0, y1)), d = this.iy(Math.max(y0, y1))
    const e = this.iz(Math.min(z0, z1)), f = this.iz(Math.max(z0, z1))
    if (b <= a || d <= c || f <= e) return this
    this.m.fill(a, c, e, b - a, d - c, f - e, mat, extra)
    return this
  }
  clear(x0, y0, z0, x1, y1, z1) { return this.fill(x0, y0, z0, x1, y1, z1, 0) }
  /** Set the voxel containing world point (x, y, z). */
  set(x, y, z, mat, extra) { this.m.set(Math.floor((x - this.ox) / V + 1e-6), Math.floor((y - this.oy) / V + 1e-6), Math.floor((z - this.oz) / V + 1e-6), mat, extra); return this }
  get(x, y, z) { return this.m.get(Math.floor((x - this.ox) / V + 1e-6), Math.floor((y - this.oy) / V + 1e-6), Math.floor((z - this.oz) / V + 1e-6)) }

  /** Iterate voxel indices of a world box: fn(i, j, k). */
  each(x0, y0, z0, x1, y1, z1, fn) {
    const a = Math.max(0, this.ix(Math.min(x0, x1))), b = Math.min(this.m.sx, this.ix(Math.max(x0, x1)))
    const c = Math.max(0, this.iy(Math.min(y0, y1))), d = Math.min(this.m.sy, this.iy(Math.max(y0, y1)))
    const e = Math.max(0, this.iz(Math.min(z0, z1))), f = Math.min(this.m.sz, this.iz(Math.max(z0, z1)))
    for (let j = c; j < d; j++) for (let k = e; k < f; k++) for (let i = a; i < b; i++) fn(i, j, k)
  }

  /**
   * Re-skin the solid voxels bordering air inside a world box: floors (air above), ceilings (air
   * below) and walls (air beside). Each callback gets (i, j, k, info) and returns a material id
   * or 0/undefined to keep the voxel. info = { nx, nz } (wall: direction toward the air).
   */
  skin(x0, y0, z0, x1, y1, z1, o) {
    const m = this.m
    const air = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < m.sx && j < m.sy && k < m.sz && !SOLID[m.data[m.idx(i, j, k)]] && m.data[m.idx(i, j, k)] === 0
    const out = []
    this.each(x0, y0, z0, x1, y1, z1, (i, j, k) => {
      const id = m.data[m.idx(i, j, k)]
      if (!id || !SOLID[id]) return
      let mat = 0
      if (o.floor && air(i, j + 1, k)) mat = o.floor(i, j, k)
      else if (o.ceil && air(i, j - 1, k)) mat = o.ceil(i, j, k)
      else if (o.wall) {
        let nx = 0, nz = 0
        if (air(i + 1, j, k)) nx = 1
        else if (air(i - 1, j, k)) nx = -1
        if (air(i, j, k + 1)) nz = 1
        else if (air(i, j, k - 1)) nz = -1
        if (nx || nz) mat = o.wall(i, j, k, { nx, nz })
      }
      if (mat) out.push(i, j, k, mat)
    })
    for (let n = 0; n < out.length; n += 4) m.set(out[n], out[n + 1], out[n + 2], out[n + 3])
    return this
  }
}

/** Deterministic 0..1 noise per integer cell (for tile patches, wear, dirt). */
export function h3(i, j, k, s = 0) {
  return hash2(hash2(i * 73 + s, j * 191), k * 37 + s * 11) / 4294967296
}

/** A stable RNG for a model builder. */
export function rngFor(seed) { return new RNG(seed) }

/** Fine-voxel models (people, buckets): mesh at VOXEL·f, the model is its own only LOD. */
export function fineModel(m) {
  m.downsample = function () { return this }
  return m
}
