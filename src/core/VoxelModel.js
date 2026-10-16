// Dense voxel model with a small builder API.
//
// Coordinates are integer voxel indices: x ∈ [0,sx), y ∈ [0,sy), z ∈ [0,sz). One voxel is
// VOXEL (0.25 m). +Y is up. When placed in the world with rotation 0, model +X maps to
// world +X (east) and model +Z maps to world +Z (south). The model's pivot (default:
// bottom-center of the footprint) is the point that lands on the placement position.
//
// Each voxel stores a material id (Uint8, 0 = air) and an optional "extra" byte. For
// window glass (EMIT_WINDOW) the extra byte is the window id: all voxels of one window share
// it, and the shader decides per window whether it is lit. For other materials it is a free
// variant byte (e.g. sign index).

import { RNG } from './rng.js'
import { SOLID, TRANSPARENT, materialById } from './materials.js'

export class VoxelModel {
  constructor(sx, sy, sz) {
    if (sx <= 0 || sy <= 0 || sz <= 0) throw new Error(`Bad model size ${sx}x${sy}x${sz}`)
    this.sx = sx | 0
    this.sy = sy | 0
    this.sz = sz | 0
    this.data = new Uint8Array(this.sx * this.sy * this.sz)
    this.extra = null // lazily allocated Uint8Array
    /** Pivot in voxel units (fractional allowed). */
    this.pivot = { x: this.sx / 2, y: 0, z: this.sz / 2 }
    /** Interior boxes [x0,y0,z0,x1,y1,z1) — faces facing into these are lit as indoor. */
    this.interiors = []
    this._windowCounter = 0
    this.name = ''
  }

  idx(x, y, z) { return x + this.sx * (z + this.sz * y) }
  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz
  }

  get(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0
    return this.data[x + this.sx * (z + this.sz * y)]
  }
  getExtra(x, y, z) {
    if (!this.extra || !this.inBounds(x, y, z)) return 0
    return this.extra[this.idx(x, y, z)]
  }
  isSolid(x, y, z) { return SOLID[this.get(x, y, z)] === 1 }

  set(x, y, z, mat, extra) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return
    const i = x + this.sx * (z + this.sz * y)
    this.data[i] = mat
    if (extra !== undefined) {
      if (!this.extra) this.extra = new Uint8Array(this.data.length)
      this.extra[i] = extra
    } else if (this.extra) {
      this.extra[i] = 0
    }
  }

  /** Set only if the target voxel is air. */
  setIfEmpty(x, y, z, mat, extra) {
    if (this.get(x, y, z) === 0) this.set(x, y, z, mat, extra)
  }

  /** Fill a box given position and SIZE: [x, x+w) × [y, y+h) × [z, z+d). */
  fill(x, y, z, w, h, d, mat, extra) {
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0), z0 = Math.max(0, z | 0)
    const x1 = Math.min(this.sx, (x + w) | 0), y1 = Math.min(this.sy, (y + h) | 0), z1 = Math.min(this.sz, (z + d) | 0)
    if (extra !== undefined && !this.extra) this.extra = new Uint8Array(this.data.length)
    for (let yy = y0; yy < y1; yy++)
      for (let zz = z0; zz < z1; zz++) {
        let i = x0 + this.sx * (zz + this.sz * yy)
        for (let xx = x0; xx < x1; xx++, i++) {
          this.data[i] = mat
          if (this.extra) this.extra[i] = extra ?? 0
        }
      }
    return this
  }

  /** Fill a box given INCLUSIVE corners (order-independent). */
  box(xa, ya, za, xb, yb, zb, mat, extra) {
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb)
    const y0 = Math.min(ya, yb), y1 = Math.max(ya, yb)
    const z0 = Math.min(za, zb), z1 = Math.max(za, zb)
    return this.fill(x0, y0, z0, x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1, mat, extra)
  }

  /** Hollow box shell with wall thickness t (size semantics like fill). */
  hollow(x, y, z, w, h, d, mat, t = 1) {
    this.fill(x, y, z, w, h, d, mat)
    if (w > 2 * t && h > 2 * t && d > 2 * t) this.fill(x + t, y + t, z + t, w - 2 * t, h - 2 * t, d - 2 * t, 0)
    return this
  }

  /** Vertical walls only (no floor/ceiling), size semantics. */
  walls(x, y, z, w, h, d, mat, t = 1) {
    this.fill(x, y, z, w, h, t, mat)
    this.fill(x, y, z + d - t, w, h, t, mat)
    this.fill(x, y, z, t, h, d, mat)
    this.fill(x + w - t, y, z, t, h, d, mat)
    return this
  }

  /** Clear (set air) a box, size semantics. */
  clear(x, y, z, w, h, d) { return this.fill(x, y, z, w, h, d, 0) }

  /** Replace material a with b, optionally within a box (size semantics). */
  replace(a, b, x = 0, y = 0, z = 0, w = this.sx, h = this.sy, d = this.sz) {
    for (let yy = Math.max(0, y); yy < Math.min(this.sy, y + h); yy++)
      for (let zz = Math.max(0, z); zz < Math.min(this.sz, z + d); zz++)
        for (let xx = Math.max(0, x); xx < Math.min(this.sx, x + w); xx++) {
          const i = this.idx(xx, yy, zz)
          if (this.data[i] === a) this.data[i] = b
        }
    return this
  }

  /** 3D line of voxels (Bresenham-ish by sampling), optional radius for thickness. */
  line(x0, y0, z0, x1, y1, z1, mat, r = 0) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 2) + 1
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t
      if (r <= 0) this.set(Math.round(x), Math.round(y), Math.round(z), mat)
      else this.sphere(x, y, z, r, mat)
    }
    return this
  }

  /** Solid sphere (center may be fractional). */
  sphere(cx, cy, cz, r, mat) { return this.ellipsoid(cx, cy, cz, r, r, r, mat) }

  ellipsoid(cx, cy, cz, rx, ry, rz, mat) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz
          if (dx * dx + dy * dy + dz * dz <= 1) this.set(x, y, z, mat)
        }
    return this
  }

  /** Vertical cylinder centered at (cx, cz) (voxel-space, fractional ok) from y0 to y1 exclusive. */
  cylinderY(cx, cz, y0, y1, r, mat) {
    for (let y = y0; y < y1; y++)
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dx = x + 0.5 - cx, dz = z + 0.5 - cz
          if (dx * dx + dz * dz <= r * r) this.set(x, y, z, mat)
        }
    return this
  }

  /** Horizontal cylinder along X. */
  cylinderX(cy, cz, x0, x1, r, mat) {
    for (let x = x0; x < x1; x++)
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
          const dy = y + 0.5 - cy, dz = z + 0.5 - cz
          if (dy * dy + dz * dz <= r * r) this.set(x, y, z, mat)
        }
    return this
  }

  /** Horizontal cylinder along Z. */
  cylinderZ(cx, cy, z0, z1, r, mat) {
    for (let z = z0; z < z1; z++)
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dy = y + 0.5 - cy, dx = x + 0.5 - cx
          if (dy * dy + dx * dx <= r * r) this.set(x, y, z, mat)
        }
    return this
  }

  /**
   * Copy another model into this one at offset (ox, oy, oz).
   * opts.rot: quarter turns around +Y (0..3), same convention as world placement.
   * opts.mirrorX: mirror source along X before rotating.
   * opts.skipAir (default true): air voxels in the source do not overwrite.
   * opts.replace: optional {fromId: toId} material remap.
   */
  paste(src, ox, oy, oz, opts = {}) {
    const rot = ((opts.rot ?? 0) % 4 + 4) % 4
    const skipAir = opts.skipAir ?? true
    const remap = opts.replace || null
    const W = src.sx, D = src.sz
    for (let y = 0; y < src.sy; y++)
      for (let z = 0; z < src.sz; z++)
        for (let x = 0; x < src.sx; x++) {
          const i = src.idx(x, y, z)
          let m = src.data[i]
          if (m === 0 && skipAir) continue
          if (remap && remap[m] !== undefined) m = remap[m]
          let lx = opts.mirrorX ? W - 1 - x : x, lz = z
          let tx, tz
          // Rotation by q quarter turns, positive = counter-clockwise seen from above
          // (+X rotates toward -Z), matching THREE's rotation about +Y.
          switch (rot) {
            case 0: tx = lx; tz = lz; break
            case 1: tx = lz; tz = W - 1 - lx; break
            case 2: tx = W - 1 - lx; tz = D - 1 - lz; break
            case 3: tx = D - 1 - lz; tz = lx; break
          }
          const e = src.extra ? src.extra[i] : undefined
          this.set(ox + tx, oy + y, oz + tz, m, e)
        }
    return this
  }

  /** Mirror the half x < sx/2 onto the other half (for symmetric objects). */
  mirrorX() {
    const half = Math.floor(this.sx / 2)
    for (let y = 0; y < this.sy; y++)
      for (let z = 0; z < this.sz; z++)
        for (let x = 0; x < half; x++) {
          const i = this.idx(x, y, z)
          this.set(this.sx - 1 - x, y, z, this.data[i], this.extra ? this.extra[i] : undefined)
        }
    return this
  }

  /** Mirror the half z < sz/2 onto the other half. */
  mirrorZ() {
    const half = Math.floor(this.sz / 2)
    for (let y = 0; y < this.sy; y++)
      for (let z = 0; z < half; z++)
        for (let x = 0; x < this.sx; x++) {
          const i = this.idx(x, y, z)
          this.set(x, y, this.sz - 1 - z, this.data[i], this.extra ? this.extra[i] : undefined)
        }
    return this
  }

  /** Allocate a fresh window id (1..255, wraps). Use as `extra` for all voxels of one window. */
  nextWindowId() {
    this._windowCounter = (this._windowCounter % 255) + 1
    return this._windowCounter
  }

  /** Mark an interior volume (size semantics). Faces facing into it are lit as indoor surfaces. */
  addInterior(x, y, z, w, h, d) {
    this.interiors.push([x, y, z, x + w, y + h, z + d])
    return this
  }

  setPivot(x, y, z) { this.pivot = { x, y, z }; return this }

  /**
   * Accumulate snow on every upward-facing exposed surface: for each column, voxels whose
   * top neighbour is air (and outside interiors) get `depth` voxels of snow above them.
   * opts: { depth=1, mat, chance=1, seed, skip: Set<matId>, maxDepthVariation=0, onlyAbove }
   */
  addSnow(opts = {}) {
    const depth = opts.depth ?? 1
    const mat = opts.mat
    if (!mat) throw new Error('addSnow needs opts.mat (material id)')
    const rng = new RNG(opts.seed ?? 1234)
    const chance = opts.chance ?? 1
    const skip = opts.skip || null
    const vary = opts.vary ?? 0
    const onlyAbove = opts.onlyAbove ?? 0
    for (let z = 0; z < this.sz; z++)
      for (let x = 0; x < this.sx; x++) {
        // scan from top: snow lands on the first solid voxel from the sky in this column
        for (let y = this.sy - 1; y >= onlyAbove; y--) {
          const m = this.data[this.idx(x, y, z)]
          if (m === 0) continue
          if (!SOLID[m] && !TRANSPARENT[m]) break
          if (skip && skip.has(m)) break
          if (this._inInterior(x, y + 1, z)) break
          if (rng.next() > chance) break
          const d = depth + (vary ? Math.floor(rng.next() * (vary + 1)) : 0)
          for (let k = 1; k <= d; k++) {
            if (y + k >= this.sy) break
            if (this.get(x, y + k, z) !== 0) break
            this.set(x, y + k, z, mat)
          }
          break
        }
      }
    return this
  }

  _inInterior(x, y, z) {
    for (const b of this.interiors)
      if (x >= b[0] && y >= b[1] && z >= b[2] && x < b[3] && y < b[4] && z < b[5]) return true
    return false
  }

  /** Build a per-voxel interior mask (Uint8Array) or null if no interiors. */
  interiorMask() {
    if (!this.interiors.length) return null
    const mask = new Uint8Array(this.data.length)
    for (const b of this.interiors) {
      for (let y = Math.max(0, b[1]); y < Math.min(this.sy, b[4]); y++)
        for (let z = Math.max(0, b[2]); z < Math.min(this.sz, b[5]); z++)
          for (let x = Math.max(0, b[0]); x < Math.min(this.sx, b[3]); x++) mask[this.idx(x, y, z)] = 1
    }
    return mask
  }

  clone() {
    const m = new VoxelModel(this.sx, this.sy, this.sz)
    m.data.set(this.data)
    if (this.extra) m.extra = this.extra.slice()
    m.pivot = { ...this.pivot }
    m.interiors = this.interiors.map(b => b.slice())
    m._windowCounter = this._windowCounter
    m.name = this.name
    return m
  }

  /** Count solid voxels (debug/statistics). */
  count() {
    let n = 0
    for (let i = 0; i < this.data.length; i++) if (this.data[i]) n++
    return n
  }

  /**
   * Downsample by an integer factor for far LODs. Each output voxel takes the most common
   * non-air material of its block if at least `minFill` source voxels are solid. Clear glass
   * is replaced by its LOD material (dim lit far window).
   */
  downsample(f, minFill = 1, lodRemap = null) {
    const nx = Math.ceil(this.sx / f), ny = Math.ceil(this.sy / f), nz = Math.ceil(this.sz / f)
    const out = new VoxelModel(nx, ny, nz)
    out.pivot = { x: this.pivot.x / f, y: this.pivot.y / f, z: this.pivot.z / f }
    out.interiors = this.interiors.map(b => [b[0] / f, b[1] / f, b[2] / f, b[3] / f, b[4] / f, b[5] / f].map(Math.round))
    const counts = new Map()
    let hasExtra = !!this.extra
    if (hasExtra) out.extra = new Uint8Array(out.data.length)
    for (let y = 0; y < ny; y++)
      for (let z = 0; z < nz; z++)
        for (let x = 0; x < nx; x++) {
          counts.clear()
          let solid = 0, best = 0, bestN = 0, bestExtra = 0
          let emissive = 0, emissiveExtra = 0
          for (let dy = 0; dy < f; dy++)
            for (let dz = 0; dz < f; dz++)
              for (let dx = 0; dx < f; dx++) {
                const sx = x * f + dx, sy = y * f + dy, sz = z * f + dz
                if (sx >= this.sx || sy >= this.sy || sz >= this.sz) continue
                const i = this.idx(sx, sy, sz)
                let m = this.data[i]
                if (!m) continue
                if (lodRemap) m = lodRemap[m]
                solid++
                const c = (counts.get(m) || 0) + 1
                counts.set(m, c)
                const md = materialById(m)
                // emissive voxels (windows, lamps) win ties so lights survive LOD
                if (md && md.emit) { emissive = m; emissiveExtra = hasExtra ? this.extra[i] : 0 }
                if (c > bestN) { bestN = c; best = m; bestExtra = hasExtra ? this.extra[i] : 0 }
              }
          if (solid >= minFill) {
            let m = best, e = bestExtra
            if (emissive && counts.get(emissive) * 2 >= bestN) { m = emissive; e = emissiveExtra }
            const oi = out.idx(x, y, z)
            out.data[oi] = m
            if (hasExtra) out.extra[oi] = e
          }
        }
    return out
  }
}
