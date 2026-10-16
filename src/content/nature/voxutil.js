// Small geometry toolkit for organic voxel models: a branch skeleton (capsule segments in
// float voxel space), a rasterizer with priorities and connectivity control, branch-aware snow,
// and a twig-thinning LOD reducer.

import { VoxelModel } from '../../core/VoxelModel.js'
import { SOLID, TRANSPARENT, materialById } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import { MAT, THIN } from './materials.js'

// ---- tiny vector helpers (plain arrays) ------------------------------------------------------
export const v3 = (x = 0, y = 0, z = 0) => [x, y, z]
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const len = a => Math.hypot(a[0], a[1], a[2])
export const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const lerp = (a, b, t) => a + (b - a) * t
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** Orthonormal basis (u, v) perpendicular to unit vector d. */
export function basis(d) {
  const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const u = norm(cross(d, ref))
  const v = cross(d, u)
  return [u, v]
}

/** Direction at angle `theta` (radians) from d, rolled by `phi` around d. */
export function deviate(d, theta, phi) {
  const [u, v] = basis(d)
  const c = Math.cos(theta), s = Math.sin(theta)
  const cp = Math.cos(phi), sp = Math.sin(phi)
  return norm([
    d[0] * c + (u[0] * cp + v[0] * sp) * s,
    d[1] * c + (u[1] * cp + v[1] * sp) * s,
    d[2] * c + (u[2] * cp + v[2] * sp) * s,
  ])
}

/** Direction from the vertical axis: tilt `theta` from +Y toward azimuth `az`. */
export function fromVertical(theta, az) {
  const s = Math.sin(theta)
  return [Math.cos(az) * s, Math.cos(theta), Math.sin(az) * s]
}

export function randUnit(rng) {
  const z = rng.float(-1, 1), a = rng.float(0, Math.PI * 2), r = Math.sqrt(1 - z * z)
  return [r * Math.cos(a), z, r * Math.sin(a)]
}

// ---- skeleton ----------------------------------------------------------------------------------
/** Priority classes: higher wins when segments overlap. */
export const PRIO = { snow: 1, fruit: 2, twig: 3, needle: 4, branch: 5, limb: 6, trunk: 7, solid: 8 }

export class Skeleton {
  constructor() {
    this.segs = []
    this.blobs = [] // {c:[x,y,z], rx, ry, rz, mat, prio, density, seed}
    this.points = [] // single voxels {p, mat, prio}
  }
  /** Capsule segment a→b with radii ra→rb (voxels). conn: 6|18|26 for thin lines. */
  seg(a, b, ra, rb, mat, prio, conn = 18) {
    this.segs.push({ a, b, ra, rb, mat, prio, conn })
  }
  blob(c, rx, ry, rz, mat, prio, density = 1, seed = 1) {
    this.blobs.push({ c, rx, ry, rz, mat, prio, density, seed })
  }
  point(p, mat, prio) { this.points.push({ p, mat, prio }) }

  /**
   * Grow a polyline branch. o: { p, dir, length, step, r0, r1, gnarl, trop:[x,y,z], tropK,
   * mat | matFn(t, r), prio, conn, rng, bendFn(t, dir) } → array of {p, dir, t, r}.
   */
  grow(o) {
    const rng = o.rng
    const step = o.step ?? 2.5
    const n = Math.max(1, Math.round(o.length / step))
    const realStep = o.length / n
    let p = o.p.slice()
    let d = norm(o.dir)
    const pts = [{ p: p.slice(), dir: d.slice(), t: 0, r: o.r0 }]
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n
      if (i > 0 || o.gnarlFirst) {
        const g = o.gnarl ?? 0
        if (g) d = norm(add(d, mul(randUnit(rng), g)))
        if (o.trop) {
          const k = typeof o.tropK === 'function' ? o.tropK(t0) : (o.tropK ?? 0)
          d = norm(add(d, mul(o.trop, k)))
        }
        if (o.bendFn) d = norm(o.bendFn(t0, d))
      }
      const q = add(p, mul(d, realStep))
      const ra = lerp(o.r0, o.r1, t0), rb = lerp(o.r0, o.r1, t1)
      const mat = o.matFn ? o.matFn((t0 + t1) / 2, (ra + rb) / 2, p) : o.mat
      this.seg(p, q, ra, rb, mat, o.prioFn ? o.prioFn((t0 + t1) / 2) : o.prio, o.conn ?? 18)
      p = q
      pts.push({ p: p.slice(), dir: d.slice(), t: t1, r: rb })
    }
    return pts
  }

  bounds() {
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
    const ext = (p, r) => {
      for (let k = 0; k < 3; k++) {
        if (p[k] - r < mn[k]) mn[k] = p[k] - r
        if (p[k] + r > mx[k]) mx[k] = p[k] + r
      }
    }
    for (const s of this.segs) { ext(s.a, s.ra + 1); ext(s.b, s.rb + 1) }
    for (const b of this.blobs) ext(b.c, Math.max(b.rx, b.ry, b.rz) + 1)
    for (const q of this.points) ext(q.p, 1)
    return { mn, mx }
  }
}

/**
 * Rasterize a skeleton into a new VoxelModel. The skeleton origin (0,0,0) becomes the pivot
 * (bottom centre of the trunk base). `below` voxels of the model extend below the pivot (roots
 * hidden in the snow). Returns { model, prio, horiz, off } — prio/horiz are per-voxel arrays
 * used by the snow pass.
 */
export function rasterize(sk, opts = {}) {
  const pad = opts.pad ?? 2
  const { mn, mx } = sk.bounds()
  const below = opts.below ?? 2
  const minY = Math.min(-below, Math.floor(mn[1]))
  const offX = Math.ceil(-mn[0]) + pad, offZ = Math.ceil(-mn[2]) + pad, offY = -minY
  const sx = Math.ceil(mx[0]) + offX + pad, sz = Math.ceil(mx[2]) + offZ + pad
  const sy = Math.ceil(mx[1]) + offY + 2
  const m = new VoxelModel(Math.max(1, sx), Math.max(1, sy), Math.max(1, sz))
  m.setPivot(offX, offY, offZ)
  const N = m.data.length
  const prio = new Uint8Array(N)
  const horiz = new Uint8Array(N)
  const off = [offX, offY, offZ]
  const put = (x, y, z, mat, pr, h) => {
    if (x < 0 || y < 0 || z < 0 || x >= m.sx || y >= m.sy || z >= m.sz) return
    const i = x + m.sx * (z + m.sz * y)
    if (pr < prio[i]) return
    if (pr === prio[i] && m.data[i] && SOLID[m.data[i]] && !SOLID[mat]) return
    m.data[i] = mat
    prio[i] = pr
    horiz[i] = h
  }
  for (const s of sk.segs) {
    const a = add(s.a, off), b = add(s.b, off)
    const d = sub(b, a)
    const L = len(d)
    const h = Math.round(255 * (1 - Math.min(1, Math.abs(d[1]) / (L || 1))))
    const rmax = Math.max(s.ra, s.rb)
    if (rmax < 0.62) lineVoxels(a, b, s.conn, (x, y, z) => put(x, y, z, s.mat, s.prio, h))
    else capsuleVoxels(a, b, s.ra, s.rb, (x, y, z) => put(x, y, z, s.mat, s.prio, h))
  }
  for (const bl of sk.blobs) {
    const c = add(bl.c, off)
    const rng = new RNG(bl.seed)
    for (let y = Math.floor(c[1] - bl.ry); y <= Math.ceil(c[1] + bl.ry); y++)
      for (let z = Math.floor(c[2] - bl.rz); z <= Math.ceil(c[2] + bl.rz); z++)
        for (let x = Math.floor(c[0] - bl.rx); x <= Math.ceil(c[0] + bl.rx); x++) {
          const dx = (x + 0.5 - c[0]) / bl.rx, dy = (y + 0.5 - c[1]) / bl.ry, dz = (z + 0.5 - c[2]) / bl.rz
          const q = dx * dx + dy * dy + dz * dz
          if (q > 1) continue
          if (bl.density < 1 && rng.next() > bl.density * (1.15 - 0.3 * q)) continue
          put(x, y, z, bl.mat, bl.prio, 255)
        }
  }
  for (const q of sk.points) {
    const p = add(q.p, off)
    put(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), q.mat, q.prio, 255)
  }
  return { model: m, prio, horiz, off }
}

/** Voxels of a thin line with the given connectivity (6, 18 or 26). */
export function lineVoxels(a, b, conn, fn) {
  const d = sub(b, a)
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])) * 3))
  let px = Math.floor(a[0]), py = Math.floor(a[1]), pz = Math.floor(a[2])
  fn(px, py, pz)
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const x = Math.floor(a[0] + d[0] * t), y = Math.floor(a[1] + d[1] * t), z = Math.floor(a[2] + d[2] * t)
    if (x === px && y === py && z === pz) continue
    const cx = x !== px, cy = y !== py, cz = z !== pz
    const changes = (cx ? 1 : 0) + (cy ? 1 : 0) + (cz ? 1 : 0)
    if (conn === 6 && changes > 1) {
      // step one axis at a time: x, then z, then y (reads as a branch "elbow")
      let ix = px
      if (cx) { ix = x; fn(ix, py, pz) }
      if (cz && cy) fn(ix, py, z)
    } else if (conn === 18 && changes === 3) {
      fn(x, py, pz)
    }
    px = x; py = y; pz = z
    fn(px, py, pz)
  }
}

/** Voxels whose centres lie inside a tapered capsule. */
export function capsuleVoxels(a, b, ra, rb, fn) {
  const d = sub(b, a)
  const L2 = dot(d, d) || 1e-6
  const r = Math.max(ra, rb)
  const x0 = Math.floor(Math.min(a[0], b[0]) - r), x1 = Math.ceil(Math.max(a[0], b[0]) + r)
  const y0 = Math.floor(Math.min(a[1], b[1]) - r), y1 = Math.ceil(Math.max(a[1], b[1]) + r)
  const z0 = Math.floor(Math.min(a[2], b[2]) - r), z1 = Math.ceil(Math.max(a[2], b[2]) + r)
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5 - a[0], cy = y + 0.5 - a[1], cz = z + 0.5 - a[2]
        let t = (cx * d[0] + cy * d[1] + cz * d[2]) / L2
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const ex = cx - d[0] * t, ey = cy - d[1] * t, ez = cz - d[2] * t
        const rr = ra + (rb - ra) * t
        if (ex * ex + ey * ey + ez * ez <= rr * rr) fn(x, y, z)
      }
}

/**
 * Snow on branches: thin lines of snow on top of near-horizontal wood. Each column is scanned
 * from the sky down; deeper surfaces are sheltered by what lies above them.
 * opts: { mats:Set<id> (receivers), minHoriz 0..1, chance, shelter (0..1 per covering voxel),
 *         snowMat, seed, minY, depthFn(mat) → snow depth }
 */
export function branchSnow(r, opts) {
  const m = r.model
  const rng = new RNG(opts.seed ?? 5)
  const recv = opts.mats
  const minHFor = typeof opts.minHoriz === 'function' ? opts.minHoriz : null
  const minH0 = Math.round((typeof opts.minHoriz === 'number' ? opts.minHoriz : 0.55) * 255)
  const chance = opts.chance ?? 0.6
  const shelter = opts.shelter ?? 0.55
  const snowMat = opts.snowMat ?? MAT.snowBranch
  const minY = opts.minY ?? 0
  const spots = []
  for (let z = 0; z < m.sz; z++)
    for (let x = 0; x < m.sx; x++) {
      let cover = 0
      let lastWasSolid = false
      for (let y = m.sy - 2; y >= minY; y--) {
        const i = x + m.sx * (z + m.sz * y)
        const mat = m.data[i]
        if (!mat) { lastWasSolid = false; continue }
        if (mat === snowMat) continue
        const above = m.data[i + m.sx * m.sz]
        const minH = minHFor ? Math.round(minHFor(mat) * 255) : minH0
        if (!lastWasSolid && above === 0 && recv.has(mat) && r.horiz[i] >= minH) {
          const p = chance * Math.pow(shelter, cover) * (0.5 + 0.5 * (r.horiz[i] / 255))
          if (rng.next() < p) {
            const depth = opts.depthFn ? opts.depthFn(mat, rng) : 1
            for (let k = 1; k <= depth && y + k < m.sy; k++) {
              const j = i + k * m.sx * m.sz
              if (m.data[j]) break
              m.data[j] = snowMat
            }
            spots.push([x, y + 1, z])
          }
        }
        cover++
        lastWasSolid = true
      }
    }
  return spots
}

/**
 * Twig-aware downsampling for far LODs: thin materials (twigs, weeds) only survive where they
 * are dense, so distant crowns become a light haze of dots instead of a solid hedge of 0.5 m
 * cubes. Snow on branches survives only where it forms a real cap.
 */
export function thinDownsample(src, f, lodRemap, thinMin, snowMin) {
  const nx = Math.ceil(src.sx / f), ny = Math.ceil(src.sy / f), nz = Math.ceil(src.sz / f)
  const out = new VoxelModel(nx, ny, nz)
  out.pivot = { x: src.pivot.x / f, y: src.pivot.y / f, z: src.pivot.z / f }
  const tMin = thinMin ?? (f <= 2 ? 3 : 9)
  const sMin = snowMin ?? (f <= 2 ? 3 : 10)
  const counts = new Map()
  for (let y = 0; y < ny; y++)
    for (let z = 0; z < nz; z++)
      for (let x = 0; x < nx; x++) {
        counts.clear()
        let thick = 0, thin = 0, snow = 0, bestThick = 0, bestThickN = 0, bestThin = 0, bestThinN = 0, solid = 0
        for (let dy = 0; dy < f; dy++)
          for (let dz = 0; dz < f; dz++)
            for (let dx = 0; dx < f; dx++) {
              const sx = x * f + dx, sy = y * f + dy, sz = z * f + dz
              if (sx >= src.sx || sy >= src.sy || sz >= src.sz) continue
              let mm = src.data[sx + src.sx * (sz + src.sz * sy)]
              if (!mm) continue
              if (lodRemap) mm = lodRemap[mm]
              const c = (counts.get(mm) || 0) + 1
              counts.set(mm, c)
              if (mm === MAT.snowBranch) snow++
              else if (THIN.has(mm)) { thin++; if (c > bestThinN) { bestThinN = c; bestThin = mm } }
              else { thick++; if (SOLID[mm]) solid++; if (c > bestThickN) { bestThickN = c; bestThick = mm } }
            }
        let mOut = 0
        // solid trunk always wins so the far tree keeps its stem
        if (solid > 0 && bestThick && SOLID[bestThick]) mOut = bestThick
        else if (snow >= sMin && snow >= thick) mOut = MAT.snowBranch
        else if (thick >= Math.max(1, f >> 1)) mOut = bestThick
        else if (thin + thick >= tMin) mOut = bestThick || bestThin
        else if (snow >= sMin) mOut = MAT.snowBranch
        if (mOut) out.data[out.idx(x, y, z)] = mOut
      }
  return out
}

/** Make a model use thinDownsample for its LODs. */
export function useThinLods(m, thinMin, snowMin) {
  m.downsample = function (f, minFill, lodRemap) {
    if (f === 1) return this
    return thinDownsample(this, f, lodRemap, typeof thinMin === 'function' ? thinMin(f) : thinMin, typeof snowMin === 'function' ? snowMin(f) : snowMin)
  }
  return m
}

/**
 * Fine-scale model: rendered with voxels of VOXEL * scale (e.g. 0.5 → 12.5 cm) by declaring
 * `lods: [scale, ...]` in defineModel. The engine asks the model for a "downsample" by each factor
 * and meshes it at VOXEL * factor: the first level hands back the model unchanged, coarser levels
 * (factor 2·scale, 4·scale) are twig-thinned reductions of it.
 * Placement bounds are fixed with fineDef() before the first placement (see place.js).
 * (Engine request: a first-class `voxelScale` option.)
 */
export function fineScale(m, scale = 0.5, thinMin, snowMin) {
  m.voxelScale = scale
  m.downsample = function (f, minFill, lodRemap) {
    const k = Math.round(f / scale)
    if (k <= 1) return this
    const tm = typeof thinMin === 'function' ? thinMin(k) : thinMin ?? (k <= 2 ? 4 : 10)
    const sm = typeof snowMin === 'function' ? snowMin(k) : snowMin ?? (k <= 2 ? 3 : 12)
    return thinDownsample(this, k, lodRemap, tm, sm)
  }
  return m
}

/** Copy of a skeleton scaled by k (positions and blob sizes; segment radii × k × slim). */
export function scaleSkeleton(sk, k, slim = 1) {
  const out = new Skeleton()
  for (const s of sk.segs) out.segs.push({ ...s, a: mul(s.a, k), b: mul(s.b, k), ra: s.ra * k * slim, rb: s.rb * k * slim })
  for (const b of sk.blobs) out.blobs.push({ ...b, c: mul(b.c, k), rx: b.rx * k, ry: b.ry * k, rz: b.rz * k })
  for (const q of sk.points) out.points.push({ ...q, p: mul(q.p, k) })
  return out
}

/**
 * Split a tree skeleton in two: the stout parts that rasterize as capsules (trunk, thick limbs,
 * pollard knuckles) stay in 25 cm voxels and collide; everything thin (branches, twigs, fruit)
 * is scaled by k into a fine-voxel crown model, so twigs are 12.5 cm instead of 25 cm thick.
 * Fine radii are slimmed by `slim` (a branch should not keep its 25 cm girth).
 */
export function splitSkeleton(sk, k = 2, slim = 0.8) {
  const base = new Skeleton(), fine = new Skeleton()
  for (const s of sk.segs) {
    if (Math.max(s.ra, s.rb) >= 0.62) base.segs.push(s)
    else fine.segs.push({ ...s, a: mul(s.a, k), b: mul(s.b, k), ra: s.ra * k * slim, rb: s.rb * k * slim })
  }
  for (const b of sk.blobs) {
    if (b.prio >= PRIO.limb) base.blobs.push(b)
    else fine.blobs.push({ ...b, c: mul(b.c, k), rx: b.rx * k, ry: b.ry * k, rz: b.rz * k })
  }
  for (const q of sk.points) fine.points.push({ ...q, p: mul(q.p, k) })
  return { base, fine }
}

/** Does a material id count as non-air wood/plant (for perch search)? */
export function isPlant(id) {
  return id !== 0 && !TRANSPARENT[id] && !!materialById(id)
}
